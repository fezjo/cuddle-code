import * as vscode from "vscode";
import { CoachConfig, TriggerConfidence, TriggerPayload, TriggerType } from "../types";
import {
  detectDiagnosticTransitions,
  detectCommentInsertion,
  detectRefactorSignal,
  detectSandyMention,
  summarizeChanges
} from "./detectors";
import { SingleLineEditSignal } from "./singleLineSignal";

type TriggerListener = (event: TriggerPayload) => void;

export class TypingTracker {
  private static readonly CURSOR_NAV_MIN_GAP_MS = 5000;
  private static readonly CURSOR_NAV_REQUIRED_SPAN_MS = 15000;
  private static readonly CURSOR_NAV_REQUIRED_BUCKETS = 12;
  private readonly listener: TriggerListener;
  private readonly singleLineSignal = new SingleLineEditSignal();
  private config: CoachConfig;
  private readonly editTimestamps: number[] = [];
  private idleShortTimer: NodeJS.Timeout | undefined;
  private idleLongTimer: NodeJS.Timeout | undefined;
  private idleVeryLongTimer: NodeJS.Timeout | undefined;
  private lateNightTimer: NodeJS.Timeout | undefined;
  private disposed = false;
  private trackingPaused = false;
  private readonly diagnosticsByUri = new Map<string, boolean>();
  private readonly fileSwitchTimestamps: number[] = [];
  private readonly cursorMoveBuckets = new Map<number, true>();
  private lastEditAt = 0;
  private lastCursorNavAt = 0;
  private lastCursorSignature = "";

  constructor(args: { config: CoachConfig; output: vscode.OutputChannel; onTrigger: TriggerListener }) {
    this.config = args.config;
    void args.output;
    this.listener = args.onTrigger;
    this.trackingPaused = !isTrackableEditor(vscode.window.activeTextEditor);
    this.scheduleIdleTimers();
    this.scheduleLateNightCheck();
  }

  public updateConfig(config: CoachConfig): void {
    this.config = config;
    this.scheduleIdleTimers();
  }

  public recordEdit(event: vscode.TextDocumentChangeEvent): void {
    if (!this.config.enabled) {
      return;
    }
    if (this.trackingPaused) {
      return;
    }

    const now = Date.now();
    this.lastEditAt = now;
    this.cursorMoveBuckets.clear();
    this.editTimestamps.push(now);
    this.trimOld(now);
    this.scheduleIdleTimers();

    const burstWindowMs = Math.max(1000, this.config.burstWindowSeconds * 1000);
    const burstCount = this.countInWindow(now, burstWindowMs);
    const charsPerWord = 5;
    const burstThresholdFromWpm = Math.round((this.config.burstWpmThreshold * charsPerWord * this.config.burstWindowSeconds) / 60);
    const burstThreshold = Math.max(12, this.config.burstEditsThreshold, burstThresholdFromWpm);
    if (burstCount >= burstThreshold) {
      this.fire("burstTyping", "high", `burstCount=${burstCount}`);
    }

    const sustainedCount = this.countInWindow(now, 90000);
    if (sustainedCount >= 52) {
      this.fire("sustainedTyping", "high", `sustainedCount=${sustainedCount}`);
    }

    const longLineLen = longestChangedLineLength(event.document, event.contentChanges);
    if (longLineLen >= this.config.longLineThreshold) {
      this.fire("longLine", "medium", `lineLength=${longLineLen}`);
    }

    if (event.reason === vscode.TextDocumentChangeReason.Undo || event.reason === vscode.TextDocumentChangeReason.Redo) {
      this.fire("undoRedo", "high", `reason=${event.reason === vscode.TextDocumentChangeReason.Undo ? "undo" : "redo"}`);
      return;
    }

    const summary = summarizeChanges(event.contentChanges);
    if (summary.hasPaste) {
      this.fire("pasteAction", "high", `chars=${summary.insertedChars}`);
    }
    if (summary.onlyDeletes) {
      this.fire("deletingCode", "high", `deletedChars=${summary.deletedChars}`);
    }
    if (summary.isSingleLineEdit) {
      this.singleLineSignal.noteSingleLineEdit(event.document.uri.toString(), summary.singleLine, now);
    }
    if (summary.looksLikeAutocomplete) {
      this.fire("autocompleteAccepted", "high", `insertedChars=${summary.insertedChars}`);
    }
    if (summary.looksLikeFormat) {
      this.fire("formatDocument", "high", `changes=${event.contentChanges.length}`);
    }

    const languageId = event.document.languageId;
    const sandyMention = detectSandyMention(event, languageId);
    if (sandyMention) {
      this.fire("sandyMention", "strict", "comment-mention", {
        languageId,
        sourceText: sandyMention,
        forceBypassScheduler: true
      });
    }

    const commentAdded = detectCommentInsertion(event, languageId);
    if (commentAdded) {
      this.fire("addingComments", "medium", `language=${languageId}`);
    }

    const refactor = detectRefactorSignal(event.contentChanges);
    if (refactor.large) {
      this.fire("largeRefactor", "high", `lines=${refactor.touchedLines}`);
    } else if (refactor.minor) {
      this.fire("minorRefactor", "medium", "rename-pattern");
    }
  }

  public onSave(document: vscode.TextDocument): void {
    if (!this.config.enabled) {
      return;
    }
    if (!isTrackableDocument(document)) {
      return;
    }
    this.fire("fileSaved", "high", `language=${document.languageId}`);
  }

  public onActiveEditorChanged(editor: vscode.TextEditor | undefined): void {
    if (!this.config.enabled) {
      return;
    }

    if (!isTrackableEditor(editor)) {
      this.trackingPaused = true;
      this.lastCursorSignature = "";
      this.scheduleIdleTimers();
      return;
    }

    this.trackingPaused = false;
    this.scheduleIdleTimers();

    const now = Date.now();
    this.fileSwitchTimestamps.push(now);
    this.trimTimestamps(this.fileSwitchTimestamps, now, 20_000);
    if (this.fileSwitchTimestamps.length >= 3) {
      this.fire("switchingFiles", "high", `switches=${this.fileSwitchTimestamps.length}`);
      this.fileSwitchTimestamps.length = 0;
    }
  }

  public onSelectionChanged(event: vscode.TextEditorSelectionChangeEvent): void {
    if (!this.config.enabled) {
      return;
    }
    if (this.trackingPaused) {
      return;
    }
    if (!isTrackableEditor(event.textEditor)) {
      return;
    }

    const now = Date.now();
    const pos = event.selections[0]?.active;
    if (!pos) {
      return;
    }

    const signature = `${event.textEditor.document.uri.toString()}#${pos.line}:${pos.character}`;
    if (signature === this.lastCursorSignature) {
      return;
    }

    const docKey = event.textEditor.document.uri.toString();
    const maturedSingleLine = this.singleLineSignal.noteCursor(docKey, pos.line, now);
    if (maturedSingleLine) {
      this.fire("singleLineEdit", "medium", `line=${pos.line}`);
    }

    if (now - this.lastEditAt < TypingTracker.CURSOR_NAV_REQUIRED_SPAN_MS) {
      this.lastCursorSignature = signature;
      this.cursorMoveBuckets.clear();
      return;
    }

    if (now - this.lastCursorNavAt < TypingTracker.CURSOR_NAV_MIN_GAP_MS) {
      this.lastCursorSignature = signature;
      return;
    }

    const secondBucket = Math.floor(now / 1000);
    this.cursorMoveBuckets.set(secondBucket, true);
    this.trimCursorBuckets(now);
    const movingForAWhile = this.cursorMoveBuckets.size >= TypingTracker.CURSOR_NAV_REQUIRED_BUCKETS;
    if (!movingForAWhile) {
      this.lastCursorSignature = signature;
      return;
    }

    this.lastCursorSignature = signature;
    this.lastCursorNavAt = now;
    this.fire("cursorNavigation", "high", "selection-change");
    this.cursorMoveBuckets.clear();
  }

  public onDiagnosticsChanged(changedUris: readonly vscode.Uri[]): void {
    if (!this.config.enabled || changedUris.length === 0) {
      return;
    }
    if (this.trackingPaused) {
      return;
    }

    const transitions = detectDiagnosticTransitions(
      changedUris.map((uri) => {
        const diagnostics = vscode.languages.getDiagnostics(uri);
        return {
          key: uri.toString(),
          hasError: diagnostics.some((d) => d.severity === vscode.DiagnosticSeverity.Error)
        };
      }),
      this.diagnosticsByUri
    );

    if (transitions.appears) {
      this.fire("errorAppears", "high", "diagnostic-error-present");
    }
    if (transitions.fixed) {
      this.fire("errorFixed", "high", "diagnostic-no-error");
    }
  }

  public onTerminalCommandEnd(event: vscode.TerminalShellExecutionEndEvent): void {
    if (!this.config.enabled) {
      return;
    }

    const cmd = event.execution.commandLine.value.toLowerCase();
    if (event.exitCode !== 0) {
      return;
    }

    if (isGitCommitSuccess(cmd)) {
      this.fire("gitCommit", "strict", "terminal-success", { commandLine: cmd });
      return;
    }

    if (isTestCommand(cmd)) {
      this.fire("testsPassing", "strict", "terminal-success", { commandLine: cmd });
    }
  }

  public onAutocompleteAccepted(): void {
    if (!this.config.enabled) {
      return;
    }
    this.fire("autocompleteAccepted", "high", "accept-selected-suggestion");
  }

  public onFormatDocument(): void {
    if (!this.config.enabled) {
      return;
    }
    this.fire("formatDocument", "high", "format-document-command");
  }

  public onFunctionFinished(lineText: string): void {
    void lineText;
    return;
  }

  public dispose(): void {
    this.disposed = true;
    clearTimer(this.idleShortTimer);
    clearTimer(this.idleLongTimer);
    clearTimer(this.idleVeryLongTimer);
    clearTimer(this.lateNightTimer);
  }

  private scheduleIdleTimers(): void {
    clearTimer(this.idleShortTimer);
    clearTimer(this.idleLongTimer);
    clearTimer(this.idleVeryLongTimer);

    if (!this.config.enabled || this.disposed || this.trackingPaused) {
      return;
    }

    this.idleShortTimer = setTimeout(() => this.fire("idleShort", "high", "idle-short"), 15000);
    this.idleLongTimer = setTimeout(() => this.fire("idleLong", "high", "idle-long"), this.config.idleAfterSeconds * 1000);
    this.idleVeryLongTimer = setTimeout(
      () => this.fire("idleVeryLong", "high", "idle-very-long"),
      Math.max(this.config.idleAfterSeconds + 180, 240) * 1000
    );
  }

  private scheduleLateNightCheck(): void {
    clearTimer(this.lateNightTimer);
    if (this.disposed) {
      return;
    }

    this.lateNightTimer = setTimeout(() => {
      const hour = new Date().getHours();
      if (hour >= 23 || hour <= 4) {
        this.fire("lateNightSession", "high", `hour=${hour}`);
      }
      this.scheduleLateNightCheck();
    }, 15 * 60 * 1000);
  }

  private countInWindow(now: number, windowMs: number): number {
    let count = 0;
    for (let i = this.editTimestamps.length - 1; i >= 0; i -= 1) {
      if (now - this.editTimestamps[i] <= windowMs) {
        count += 1;
      } else {
        break;
      }
    }
    return count;
  }

  private trimOld(now: number): void {
    const keepMs = 120000;
    while (this.editTimestamps.length > 0 && now - this.editTimestamps[0] > keepMs) {
      this.editTimestamps.shift();
    }
  }

  private trimTimestamps(values: number[], now: number, keepMs: number): void {
    while (values.length > 0 && now - values[0] > keepMs) {
      values.shift();
    }
  }

  private trimCursorBuckets(now: number): void {
    const earliestBucket = Math.floor((now - TypingTracker.CURSOR_NAV_REQUIRED_SPAN_MS) / 1000);
    for (const bucket of this.cursorMoveBuckets.keys()) {
      if (bucket < earliestBucket) {
        this.cursorMoveBuckets.delete(bucket);
      }
    }
  }

  private fire(
    trigger: TriggerType,
    confidence: TriggerConfidence,
    detail: string,
    options?: { languageId?: string; sourceText?: string; commandLine?: string; forceBypassScheduler?: boolean }
  ): void {
    if (!this.config.enabled) {
      return;
    }
    this.listener({
      trigger,
      confidence,
      detail,
      forceBypassScheduler: options?.forceBypassScheduler,
      metadata: {
        languageId: options?.languageId,
        sourceText: options?.sourceText,
        commandLine: options?.commandLine
      },
      text: "",
      persona: "female"
    });
  }
}

function longestChangedLineLength(
  doc: vscode.TextDocument,
  changes: readonly vscode.TextDocumentContentChangeEvent[]
): number {
  let maxLen = 0;
  for (const change of changes) {
    const line = change.range.start.line;
    if (line < doc.lineCount) {
      maxLen = Math.max(maxLen, doc.lineAt(line).text.length);
    }
  }
  return maxLen;
}

function isGitCommitSuccess(command: string): boolean {
  return /\bgit\s+commit\b/.test(command);
}

function isTestCommand(command: string): boolean {
  return /\b(npm\s+test|pnpm\s+test|yarn\s+test|pytest|cargo\s+test|go\s+test|ctest|jest|vitest|mocha)\b/.test(command);
}

function clearTimer(timer: NodeJS.Timeout | undefined): void {
  if (timer) {
    clearTimeout(timer);
  }
}

function isTrackableEditor(editor: vscode.TextEditor | undefined): boolean {
  if (!editor) {
    return false;
  }
  return isTrackableDocument(editor.document);
}

function isTrackableDocument(document: vscode.TextDocument): boolean {
  return document.uri.scheme === "file" || document.uri.scheme === "untitled" || document.uri.scheme === "vscode-remote";
}
