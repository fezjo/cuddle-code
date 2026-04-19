import * as vscode from "vscode";
import { getConfig, toggleAudioKeepAlive, toggleEnabled, toggleMode } from "./config";
import { allScriptLines, getScriptBankHealth, initializeScriptBank, linesFor, pickLine } from "./content/scriptBank";
import { generateSandyLine } from "./llm/openaiClient";
import { LogThrottle } from "./telemetry/logThrottle";
import { TriggerScheduler } from "./telemetry/scheduler";
import { TypingTracker } from "./telemetry/typingTracker";
import { CoachConfig, Persona, TriggerPayload, TriggerType } from "./types";
import { ElevenLabsApiError, synthesizeWithElevenLabs } from "./voice/elevenlabsClient";
import { AudioCache } from "./voice/cache";
import { AudioKeepAlive } from "./voice/keepAlive";
import { playMp3Buffer } from "./voice/player";

const TEST_SUCCESS_PATTERNS = [/\b(\d+)\s+passed\b/i, /\btest result:\s*ok\b/i, /\bpass(?:ing)?\b/i, /\bok\b/i];

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Cuddle Code");
  context.subscriptions.push(output);

  initializeScriptBank(output, context.extensionPath);

  let config = getConfig();
  let responseQueue: Promise<void> = Promise.resolve();
  const cache = new AudioCache(context, output);
  const keepAlive = new AudioKeepAlive(output);
  const scheduler = new TriggerScheduler(config.pacingMode);
  const decisionLogThrottle = new LogThrottle();
  const terminalOutput = new WeakMap<vscode.TerminalShellExecution, string>();
  let lastGitCommitTriggerAt = 0;

  const tracker = new TypingTracker({
    config,
    output,
    onTrigger: (event) => {
      responseQueue = responseQueue
        .then(async () => {
          await respond(event, output);
        })
        .catch((err) => {
          output.appendLine(`[CUDDLE] Trigger queue error: ${String(err)}`);
        });
    }
  });
  keepAlive.update(config.enabled && config.mode === "audio" && config.audioKeepAlive);
  context.subscriptions.push({ dispose: () => tracker.dispose() });
  context.subscriptions.push({ dispose: () => keepAlive.dispose() });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("cuddleCode")) {
        config = getConfig();
        tracker.updateConfig(config);
        scheduler.updateMode(config.pacingMode);
        output.appendLine(
          `[CUDDLE] Config updated: mode=${config.mode} enabled=${config.enabled} pacingMode=${config.pacingMode}`
        );
        keepAlive.update(config.enabled && config.mode === "audio" && config.audioKeepAlive);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.toString() !== e.document.uri.toString()) {
        return;
      }
      tracker.recordEdit(e);
      const line = editor.document.lineAt(editor.selection.active.line).text;
      tracker.onFunctionFinished(line);
    })
  );

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => tracker.onSave(doc)));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => tracker.onActiveEditorChanged(editor)));
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((event) => tracker.onSelectionChanged(event)));
  context.subscriptions.push(vscode.languages.onDidChangeDiagnostics((e) => tracker.onDiagnosticsChanged(e.uris)));

  context.subscriptions.push(
    vscode.window.onDidStartTerminalShellExecution((event) => {
      const command = event.execution.commandLine.value.toLowerCase();
      void captureTerminalOutput(event.execution, terminalOutput, async (outText) => {
        if (!isGitCommitCommand(command)) {
          return;
        }
        const successByOutput = isGitCommitSuccessOutput(outText);
        const failureByOutput = isGitCommitFailureOutput(outText);
        if (successByOutput && !failureByOutput) {
          maybeEmitGitCommit("terminal-stream");
        }
      });
    })
  );
  context.subscriptions.push(
    vscode.window.onDidEndTerminalShellExecution((event) => {
      const command = event.execution.commandLine.value.toLowerCase();
      const outText = terminalOutput.get(event.execution) ?? "";
      if (isGitCommitCommand(command)) {
        const successByOutput = isGitCommitSuccessOutput(outText);
        const failureByOutput = isGitCommitFailureOutput(outText);
        const exitCode = event.exitCode;
        const shouldEmit = (exitCode === 0 || (exitCode === undefined && successByOutput)) && !failureByOutput;

        if (shouldEmit) {
          maybeEmitGitCommit("terminal-end");
        }
        return;
      }
      if (isTestCommand(command)) {
        if (event.exitCode !== 0) {
          return;
        }
        if (TEST_SUCCESS_PATTERNS.some((p) => p.test(outText))) {
          tracker.onTerminalCommandEnd(event);
        } else {
          output.appendLine("[CUDDLE] Strict testsPassing skipped: no recognized success summary in output.");
        }
      }
    })
  );

  function maybeEmitGitCommit(source: string): void {
    const now = Date.now();
    if (now - lastGitCommitTriggerAt < 4000) {
      return;
    }
    lastGitCommitTriggerAt = now;
    tracker.onGitCommitDetected(source);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("cuddleCode.toggleEnabled", async () => {
      const next = await toggleEnabled();
      vscode.window.showInformationMessage(`Cuddle Code ${next ? "enabled" : "disabled"}.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cuddleCode.toggleMode", async () => {
      const next = await toggleMode();
      vscode.window.showInformationMessage(`Cuddle Code mode: ${next}.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cuddleCode.toggleAudioKeepAlive", async () => {
      const next = await toggleAudioKeepAlive();
      vscode.window.showInformationMessage(`Cuddle Code audio keepalive: ${next ? "enabled" : "disabled"}.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cuddleCode.testVoiceLine", async () => {
      await respond({ trigger: "burstTyping", confidence: "high", detail: "manual-test", text: "", persona: "female" }, output, true);
      vscode.window.showInformationMessage("Cuddle Code test line triggered.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cuddleCode.testVoiceLineForceFetch", async () => {
      await respond(
        { trigger: "burstTyping", confidence: "high", detail: "manual-test-force", text: "", persona: "female" },
        output,
        true,
        { ignoreCache: true, forceAudioFetch: true }
      );
      vscode.window.showInformationMessage("Cuddle Code forced fetch test line triggered.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cuddleCode.showTriggerDebug", () => {
      output.show(true);
      output.appendLine("[CUDDLE] Debug channel opened.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cuddleCode.showTriggerHealth", () => {
      const schedulerHealth = scheduler.getHealth();
      const scriptHealth = getScriptBankHealth();
      output.appendLine(
        `[CUDDLE] Trigger health mode=${schedulerHealth.mode} tokens=${schedulerHealth.tokens} fired=${JSON.stringify(
          schedulerHealth.firedByTrigger
        )} skipped=${JSON.stringify(schedulerHealth.skippedByReason)} parseFailure=${scriptHealth.parseFailure ?? "none"}`
      );
      output.show(true);
      vscode.window.showInformationMessage("Cuddle Code trigger health logged in output.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cuddleCode.simulateTrigger", async () => {
      const triggerChoices: Array<{ label: string; trigger: TriggerType; confidence: "high" | "medium" | "strict" }> = [
        { label: "idleShort", trigger: "idleShort", confidence: "high" },
        { label: "burstTyping", trigger: "burstTyping", confidence: "high" },
        { label: "sustainedTyping", trigger: "sustainedTyping", confidence: "high" },
        { label: "errorFixed", trigger: "errorFixed", confidence: "high" },
        { label: "gitCommit", trigger: "gitCommit", confidence: "strict" },
        { label: "testsPassing", trigger: "testsPassing", confidence: "strict" },
        { label: "sandyMention", trigger: "sandyMention", confidence: "high" }
      ];

      const pick = await vscode.window.showQuickPick(triggerChoices, {
        placeHolder: "Select trigger to simulate",
        matchOnDescription: true
      });
      if (!pick) {
        return;
      }

      const bypassChoice = await vscode.window.showQuickPick(
        [
          { label: "Respect scheduler", force: false },
          { label: "Force bypass scheduler", force: true }
        ],
        { placeHolder: "Simulation mode" }
      );
      if (!bypassChoice) {
        return;
      }

      const current = getConfig();
      const persona = choosePersona(pick.trigger, current);
      output.appendLine(
        `[CUDDLE][SIMULATE] requested trigger=${pick.trigger} confidence=${pick.confidence} bypass=${bypassChoice.force} mode=${current.mode} persona=${persona}`
      );
      output.show(true);

      await respond(
        {
          trigger: pick.trigger,
          confidence: pick.confidence,
          detail: "simulate-trigger",
          forceBypassScheduler: bypassChoice.force,
          metadata:
            pick.trigger === "sandyMention"
              ? { sourceText: "// sandy, keep me focused", languageId: "typescript" }
              : undefined,
          text: "",
          persona
        },
        output
      );

      if (current.mode === "mock") {
        vscode.window.showInformationMessage(
          `Cuddle Code simulate ran in mock mode. Switch to audio mode for sound playback.`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cuddleCode.preGenerateVoiceCache", async () => {
      const current = getConfig();
      if (!current.elevenlabsApiKey) {
        vscode.window.showWarningMessage("Cuddle Code: set cuddleCode.elevenlabsApiKey first.");
        return;
      }
      const scripts = currentRouteScriptLines(current);
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Cuddle Code: pre-generating voice cache",
          cancellable: false
        },
        async (progress) => {
          const before = await cache.stats(scripts);
          output.appendLine(
            `[CUDDLE] Cache before pre-generate: total=${before.total} cached=${before.cached} blocked=${before.blocked} missing=${before.missing}`
          );
          progress.report({ message: "Generating clips with ElevenLabs..." });
          const stats = await cache.preload(
            scripts,
            async ({ persona, text }) =>
              await synthesizeWithElevenLabs({
                apiKey: current.elevenlabsApiKey,
                persona,
                text
              }),
            async ({ line, error }) => {
              await maybeBlockUnusableVoice(line, error);
            }
          );
          output.appendLine(
            `[CUDDLE] Pre-generate complete: generated=${stats.generated} reused=${stats.reused} retriedBlocked=${stats.retriedBlocked} blocked=${stats.blocked} failed=${stats.failed}`
          );
          const after = await cache.stats(scripts);
          output.appendLine(
            `[CUDDLE] Cache after pre-generate: total=${after.total} cached=${after.cached} blocked=${after.blocked} missing=${after.missing}`
          );
          vscode.window.showInformationMessage(
            `Cuddle Code cache ready. Generated ${stats.generated}, reused ${stats.reused}, retriedBlocked ${stats.retriedBlocked}, blocked ${stats.blocked}, failed ${stats.failed}.`
          );
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cuddleCode.clearVoiceCache", async () => {
      const answer = await vscode.window.showWarningMessage(
        "Clear Cuddle Code voice cache? This removes all generated MP3s and cache index entries.",
        { modal: true },
        "Clear Cache"
      );
      if (answer !== "Clear Cache") {
        return;
      }

      await cache.clear();
      output.appendLine("[CUDDLE] Voice cache cleared.");
      vscode.window.showInformationMessage("Cuddle Code voice cache cleared.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("cuddleCode.showCacheStats", async () => {
      const scripts = allScriptLines().filter((x) => x.trigger !== "sandyMention");
      const stats = await cache.stats(scripts);

      const routedScripts = currentRouteScriptLines(getConfig());
      const routedStats = await cache.stats(routedScripts);

      const message =
        `Cuddle cache (all personas): total=${stats.total}, cached=${stats.cached}, blocked=${stats.blocked}, missing=${stats.missing} | ` +
        `active route: total=${routedStats.total}, cached=${routedStats.cached}, blocked=${routedStats.blocked}, missing=${routedStats.missing}`;
      output.appendLine(`[CUDDLE] ${message}`);
      vscode.window.showInformationMessage(message);
      output.show(true);
    })
  );

  output.appendLine("[CUDDLE] Extension activated.");
  void maybePreGenerateOnStartup();

  async function respond(
    event: TriggerPayload,
    out: vscode.OutputChannel,
    force = false,
    options?: { ignoreCache?: boolean; forceAudioFetch?: boolean }
  ): Promise<void> {
    const current = getConfig();

    if (!current.enabled && !force) {
      out.appendLine("[CUDDLE] Respond skipped: extension disabled.");
      return;
    }

    const decision = scheduler.allow(event.trigger, Date.now(), force || Boolean(event.forceBypassScheduler));
    if (!decision.allowed) {
      const canLog = decisionLogThrottle.shouldLog(`skip:${event.trigger}:${decision.reason ?? "unknown"}`, Date.now());
      if (canLog) {
        out.appendLine(
          `[CUDDLE] Trigger skipped: trigger=${event.trigger} confidence=${event.confidence} reason=${decision.reason} mode=${decision.mode}`
        );
      }
      return;
    }

    const persona: Persona = choosePersona(event.trigger, current);
    let text = pickLine(event.trigger, persona);
    if (event.trigger === "sandyMention") {
      text = await buildSandyResponse(
        current,
        event.metadata?.sourceText ?? "",
        event.metadata?.languageId,
        event.metadata?.contextBefore,
        event.metadata?.contextAfter,
        out
      );
    }

    out.appendLine(
      `[CUDDLE] Trigger fired: trigger=${event.trigger} confidence=${event.confidence} detail=${event.detail} mode=${decision.mode} persona=${persona} line=${text}`
    );

    if (current.mode === "mock" && !options?.forceAudioFetch) {
      out.appendLine(`[CUDDLE][MOCK][${persona}][${event.trigger}] ${text}`);
      vscode.window.setStatusBarMessage("Cuddle Code: mock line emitted", 2500);
      return;
    }

    if (!current.elevenlabsApiKey) {
      out.appendLine("[CUDDLE] Audio mode set, but elevenlabsApiKey is missing.");
      vscode.window.showWarningMessage("Cuddle Code: audio mode needs cuddleCode.elevenlabsApiKey");
      return;
    }

    try {
      let audio;
      if (current.usePreGeneratedAudio && !options?.ignoreCache) {
        const cached = await cache.get({ trigger: event.trigger, persona, text });
        if (cached.audio) {
          audio = cached.audio;
          out.appendLine(
            `[CUDDLE] Audio cache hit trigger=${event.trigger} persona=${persona} confidence=${event.confidence} mode=${decision.mode}`
          );
        } else if (cached.blockedReason) {
          out.appendLine(
            `[CUDDLE] Audio cache blocked trigger=${event.trigger} persona=${persona} reason=${cached.blockedReason}; using fallback`
          );
          await playFallbackFromCacheOrMock(event.trigger, out, current, event.confidence, decision.mode);
          return;
        } else if (cached.indexed) {
          out.appendLine(`[CUDDLE] Audio cache index stale trigger=${event.trigger}; using fallback.`);
          await playFallbackFromCacheOrMock(event.trigger, out, current, event.confidence, decision.mode);
          return;
        } else {
          out.appendLine(`[CUDDLE] Audio cache miss trigger=${event.trigger} persona=${persona}`);
        }
      }

      if (!audio) {
        out.appendLine(`[CUDDLE] Synthesizing trigger=${event.trigger} persona=${persona}`);
        try {
          audio = await synthesizeWithElevenLabs({
            apiKey: current.elevenlabsApiKey,
            persona,
            text
          });
        } catch (err) {
          await maybeBlockUnusableVoice({ trigger: event.trigger, persona, text }, err);
          throw err;
        }
        if (current.usePreGeneratedAudio) {
          await cache.put({ trigger: event.trigger, persona, text, audio });
          out.appendLine(`[CUDDLE] Cached synthesized audio for ${event.trigger}/${persona}.`);
        }
      }

      await playMp3Buffer(audio);
      out.appendLine(`[CUDDLE] Played audio line for ${event.trigger}.`);
      vscode.window.setStatusBarMessage(`Cuddle Code played: ${event.trigger}`, 2500);
      if (force) {
        vscode.window.showInformationMessage(`Cuddle Code audio played for ${event.trigger}.`);
      }
    } catch (err) {
      out.appendLine(`[CUDDLE] Audio failed: ${String(err)}`);
      vscode.window.showErrorMessage(`Cuddle Code audio failed for ${event.trigger}. Open 'Cuddle Code' output for details.`);
    }
  }

  async function buildSandyResponse(
    current: CoachConfig,
    sourceText: string,
    languageId: string | undefined,
    contextBefore: string | undefined,
    contextAfter: string | undefined,
    out: vscode.OutputChannel
  ): Promise<string> {
    if (current.debugLogs) {
      out.appendLine(`[CUDDLE][SANDY] sourceText(read)=${sourceText}`);
    }
    if (!sourceText.trim()) {
      return "I am here, keep going - you have got this.";
    }
    if (!current.llmApiKey) {
      out.appendLine("[CUDDLE] Sandy mention fallback: missing cuddleCode.llmApiKey");
      return "I am here, keep going - you have got this.";
    }
    try {
      return await generateSandyLine({
        apiKey: current.llmApiKey,
        baseUrl: current.llmBaseUrl,
        model: current.llmModel,
        referer: current.llmReferer,
        title: current.llmTitle,
        extensionRootPath: context.extensionPath,
        languageId,
        mentionText: sourceText,
        contextBefore,
        contextAfter,
        onDebugLog: current.debugLogs ? (message) => out.appendLine(message) : undefined
      });
    } catch (err) {
      out.appendLine(`[CUDDLE] Sandy mention fallback: LLM error ${String(err)}`);
      return "I am here, keep going - you have got this.";
    }
  }

  async function maybePreGenerateOnStartup(): Promise<void> {
    const current = getConfig();
    if (!current.preGenerateOnStartup || current.mode !== "audio") {
      return;
    }
    if (!current.elevenlabsApiKey) {
      output.appendLine("[CUDDLE] Startup pre-generate skipped: missing elevenlabsApiKey.");
      return;
    }

    const scripts = currentRouteScriptLines(current);
    const complete = await cache.hasAll(scripts);
    if (complete) {
      output.appendLine("[CUDDLE] Startup pre-generate skipped: cache already complete.");
      return;
    }

    output.appendLine("[CUDDLE] Startup pre-generate starting...");
    const stats = await cache.preload(
      scripts,
      async ({ persona, text }) =>
        await synthesizeWithElevenLabs({
          apiKey: current.elevenlabsApiKey,
          persona,
          text
        }),
      async ({ line, error }) => {
        await maybeBlockUnusableVoice(line, error);
      }
    );
    output.appendLine(
      `[CUDDLE] Startup pre-generate complete: generated=${stats.generated} reused=${stats.reused} retriedBlocked=${stats.retriedBlocked} blocked=${stats.blocked} failed=${stats.failed}`
    );
  }

  async function maybeBlockUnusableVoice(
    line: { trigger: TriggerType; persona: Persona; text: string },
    error: unknown
  ): Promise<void> {
    if (!(error instanceof ElevenLabsApiError)) {
      return;
    }

    if (error.status === 402 && error.code === "paid_plan_required") {
      await cache.block({ ...line, reason: "paid_plan_required" });
      output.appendLine(`[CUDDLE] Marked line as blocked due to plan limits: ${line.trigger}/${line.persona}`);
    }
  }

  async function playFallbackFromCacheOrMock(
    trigger: TriggerType,
    out: vscode.OutputChannel,
    current: CoachConfig,
    confidence: string,
    mode: string
  ): Promise<void> {
    const personas = fallbackPersonaOrder(trigger, current);
    for (const persona of personas) {
      for (const text of linesFor(trigger, persona)) {
        const cached = await cache.get({ trigger, persona, text });
        if (cached.audio) {
          await playMp3Buffer(cached.audio);
          out.appendLine(
            `[CUDDLE] Played cached fallback audio trigger=${trigger} persona=${persona} confidence=${confidence} mode=${mode}`
          );
          vscode.window.setStatusBarMessage(`Cuddle Code fallback audio: ${trigger}`, 2500);
          return;
        }
      }
    }

    const fallbackPersona = personas[0] ?? "female";
    const fallback = pickLine(trigger, fallbackPersona);
    out.appendLine(`[CUDDLE][MOCK][fallback:${fallbackPersona}][${trigger}] ${fallback}`);
    if (current.mode === "audio") {
      vscode.window.showWarningMessage(
        `Cuddle Code audio fallback failed for ${trigger}. No playable cached clip found; using text fallback.`
      );
    }
    vscode.window.setStatusBarMessage(`Cuddle Code fallback text: ${trigger}`, 2500);
  }

  function currentRouteScriptLines(current: CoachConfig): Array<{ trigger: TriggerType; persona: Persona; text: string }> {
    const dynamicTriggers = new Set<TriggerType>(["sandyMention"]);
    const routed: Array<{ trigger: TriggerType; persona: Persona; text: string }> = [];
    const seen = new Set<string>();
    for (const line of allScriptLines()) {
      if (dynamicTriggers.has(line.trigger)) {
        continue;
      }
      const routedPersona = choosePersona(line.trigger, current);
      if (line.persona !== routedPersona) {
        continue;
      }
      const key = `${line.trigger}|${line.persona}|${line.text}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      routed.push(line);
    }
    return routed;
  }
}

export function deactivate(): void {
  return;
}

function choosePersona(trigger: TriggerType, current: CoachConfig): Persona {
  if (current.voicePersona === "female") {
    return "female";
  }
  if (current.voicePersona === "male") {
    return "male";
  }
  if (trigger === "idleLong" || trigger === "idleVeryLong") {
    return "male";
  }
  return "female";
}

function fallbackPersonaOrder(trigger: TriggerType, current: CoachConfig): Persona[] {
  const primary = choosePersona(trigger, current);
  const secondary: Persona = primary === "female" ? "male" : "female";
  if (current.voicePersona === "mixed") {
    return [primary, secondary];
  }
  return [primary];
}

async function captureTerminalOutput(
  execution: vscode.TerminalShellExecution,
  store: WeakMap<vscode.TerminalShellExecution, string>,
  onComplete?: (output: string) => void | Promise<void>
): Promise<void> {
  let chunks = "";
  try {
    const stream = execution.read();
    for await (const data of stream) {
      chunks += data;
      if (chunks.length > 5000) {
        chunks = chunks.slice(-5000);
      }
    }
  } catch {
    return;
  }
  const lowered = chunks.toLowerCase();
  store.set(execution, lowered);
  if (onComplete) {
    await onComplete(lowered);
  }
}

function isTestCommand(command: string): boolean {
  return /\b(npm\s+test|pnpm\s+test|yarn\s+test|pytest|cargo\s+test|go\s+test|ctest|jest|vitest|mocha)\b/.test(command);
}

function isGitCommitCommand(text: string): boolean {
  return /\bgit\s+commit\b/.test(text);
}

function isGitCommitSuccessOutput(text: string): boolean {
  return (
    /\[[^\]]+\s+[0-9a-f]{6,}\]/.test(text) ||
    /\d+\s+file(?:s)?\s+changed/.test(text) ||
    /\screate mode\s+\d+\s+/.test(text) ||
    /\sdelete mode\s+\d+\s+/.test(text) ||
    /\srename\s+.+=>.+\(/.test(text)
  );
}

function isGitCommitFailureOutput(text: string): boolean {
  return (
    /\bnothing to commit\b/.test(text) ||
    /\baborting commit\b/.test(text) ||
    /\bcommit failed\b/.test(text) ||
    /\bpre-commit hook exited with code\b/.test(text) ||
    /\bfatal:\s+not a git repository\b/.test(text)
  );
}
