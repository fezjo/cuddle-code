import * as vscode from "vscode";
import { CoachConfig, TriggerType } from "../types";

interface TriggerEvent {
  trigger: TriggerType;
}

type TriggerListener = (event: TriggerEvent) => void;

export class TypingTracker {
  private readonly listener: TriggerListener;
  private readonly output: vscode.OutputChannel;
  private config: CoachConfig;
  private readonly editTimestamps: number[] = [];
  private readonly cooldownUntil: Map<TriggerType, number> = new Map();
  private idleTimer: NodeJS.Timeout | undefined;
  private disposed = false;
  private lastTriggerAt = 0;

  constructor(args: { config: CoachConfig; output: vscode.OutputChannel; onTrigger: TriggerListener }) {
    this.config = args.config;
    this.output = args.output;
    this.listener = args.onTrigger;
    this.scheduleIdleTimer();
  }

  public updateConfig(config: CoachConfig): void {
    this.config = config;
    this.scheduleIdleTimer();
  }

  public recordEdit(editor: vscode.TextEditor): void {
    if (!this.config.enabled) {
      return;
    }

    const now = Date.now();
    this.editTimestamps.push(now);
    this.trimOld(now);
    this.scheduleIdleTimer();

    const lineLen = activeLineLength(editor);
    if (lineLen >= this.config.longLineThreshold) {
      this.fire("longLinePraise", now, `lineLength=${lineLen}`);
    }

    const burstCount = this.countInWindow(now, this.config.burstWindowSeconds * 1000);
    if (burstCount >= this.config.burstEditsThreshold) {
      this.fire("burstTyping", now, `burstCount=${burstCount}`);
    }

    const sustainedCount = this.countInWindow(now, this.config.sustainedWindowSeconds * 1000);
    if (sustainedCount >= this.config.sustainedEditsThreshold) {
      this.fire("sustainedTyping", now, `sustainedCount=${sustainedCount}`);
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
  }

  private scheduleIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    if (!this.config.enabled || this.disposed) {
      return;
    }

    this.idleTimer = setTimeout(() => {
      const now = Date.now();
      this.fire("idleNudge", now, "idleTimer");
      this.scheduleIdleTimer();
    }, this.config.idleAfterSeconds * 1000);
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
    const keepMs = Math.max(this.config.sustainedWindowSeconds, this.config.burstWindowSeconds) * 1000;
    while (this.editTimestamps.length > 0 && now - this.editTimestamps[0] > keepMs) {
      this.editTimestamps.shift();
    }
  }

  private fire(trigger: TriggerType, now: number, detail: string): void {
    if (!this.config.enabled) {
      return;
    }

    const globalGapMs = this.config.minSecondsBetweenMessages * 1000;
    if (now - this.lastTriggerAt < globalGapMs) {
      return;
    }

    const cooldownMs = this.cooldownFor(trigger) * 1000;
    const readyAt = this.cooldownUntil.get(trigger) ?? 0;
    if (now < readyAt) {
      return;
    }

    this.lastTriggerAt = now;
    this.cooldownUntil.set(trigger, now + cooldownMs);
    if (this.config.debugLogs) {
      this.output.appendLine(`[ASMR] Trigger fired: ${trigger} (${detail})`);
    }
    this.listener({ trigger });
  }

  private cooldownFor(trigger: TriggerType): number {
    switch (trigger) {
      case "longLinePraise":
        return this.config.longLineCooldownSeconds;
      case "idleNudge":
        return this.config.idleCooldownSeconds;
      case "sustainedTyping":
        return this.config.sustainedCooldownSeconds;
      case "burstTyping":
        return this.config.burstCooldownSeconds;
      default:
        return 5;
    }
  }
}

function activeLineLength(editor: vscode.TextEditor): number {
  const pos = editor.selection.active;
  const text = editor.document.lineAt(pos.line).text;
  return text.length;
}
