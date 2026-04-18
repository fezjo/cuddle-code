import * as vscode from "vscode";
import { getConfig, toggleEnabled, toggleMode } from "./config";
import { TypingTracker } from "./telemetry/typingTracker";
import { allScriptLines, linesFor, pickLine } from "./content/scriptBank";
import { CoachConfig, Persona, TriggerType } from "./types";
import { ElevenLabsApiError, synthesizeWithElevenLabs } from "./voice/elevenlabsClient";
import { playMp3Buffer } from "./voice/player";
import { AudioCache } from "./voice/cache";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("ASMR Coach");
  context.subscriptions.push(output);

  let config = getConfig();
  let busy = false;
  const cache = new AudioCache(context, output);

  const tracker = new TypingTracker({
    config,
    output,
    onTrigger: async ({ trigger }) => {
      if (busy) {
        return;
      }
      busy = true;
      try {
        await respond(trigger, output);
      } finally {
        busy = false;
      }
    }
  });
  context.subscriptions.push({ dispose: () => tracker.dispose() });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("asmrCoach")) {
        config = getConfig();
        tracker.updateConfig(config);
        output.appendLine(`[ASMR] Config updated: mode=${config.mode} enabled=${config.enabled}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.toString() !== e.document.uri.toString()) {
        return;
      }
      tracker.recordEdit(editor);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("asmrCoach.toggleEnabled", async () => {
      const next = await toggleEnabled();
      vscode.window.showInformationMessage(`ASMR Coach ${next ? "enabled" : "disabled"}.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("asmrCoach.toggleMode", async () => {
      const next = await toggleMode();
      vscode.window.showInformationMessage(`ASMR Coach mode: ${next}.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("asmrCoach.testVoiceLine", async () => {
      await respond("burstTyping", output, true);
      vscode.window.showInformationMessage("ASMR Coach test line triggered.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("asmrCoach.testVoiceLineForceFetch", async () => {
      await respond("burstTyping", output, true, { ignoreCache: true, forceAudioFetch: true });
      vscode.window.showInformationMessage("ASMR Coach forced fetch test line triggered.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("asmrCoach.showTriggerDebug", () => {
      output.show(true);
      output.appendLine("[ASMR] Debug channel opened.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("asmrCoach.preGenerateVoiceCache", async () => {
      const current = getConfig();
      if (!current.apiKey) {
        vscode.window.showWarningMessage("ASMR Coach: set asmrCoach.apiKey first.");
        return;
      }
      if (current.mode !== "audio") {
        output.appendLine("[ASMR] Pre-generate invoked while in mock mode; still generating cache with ElevenLabs.");
      }

      const scripts = currentRouteScriptLines(current);
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "ASMR Coach: pre-generating voice cache",
          cancellable: false
        },
        async (progress) => {
          const before = await cache.stats(scripts);
          output.appendLine(
            `[ASMR] Cache before pre-generate: total=${before.total} cached=${before.cached} blocked=${before.blocked} missing=${before.missing}`
          );
          progress.report({ message: "Generating clips with ElevenLabs..." });
          const stats = await cache.preload(scripts, async ({ persona, text }) => {
            return await synthesizeWithElevenLabs({
              apiKey: current.apiKey,
              persona,
              text
            });
          }, async ({ line, error }) => {
            await maybeBlockUnusableVoice(line, error);
          });
          progress.report({
            message: `Done. Generated ${stats.generated}, reused ${stats.reused}, retriedBlocked ${stats.retriedBlocked}, blocked ${stats.blocked}, failed ${stats.failed}.`
          });
          output.appendLine(
            `[ASMR] Pre-generate complete: generated=${stats.generated} reused=${stats.reused} retriedBlocked=${stats.retriedBlocked} blocked=${stats.blocked} failed=${stats.failed}`
          );
          const after = await cache.stats(scripts);
          output.appendLine(
            `[ASMR] Cache after pre-generate: total=${after.total} cached=${after.cached} blocked=${after.blocked} missing=${after.missing}`
          );
          vscode.window.showInformationMessage(
            `ASMR Coach cache ready. Generated ${stats.generated}, reused ${stats.reused}, retriedBlocked ${stats.retriedBlocked}, blocked ${stats.blocked}, failed ${stats.failed}.`
          );
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("asmrCoach.clearVoiceCache", async () => {
      const answer = await vscode.window.showWarningMessage(
        "Clear ASMR Coach voice cache? This removes all generated MP3s and cache index entries.",
        { modal: true },
        "Clear Cache"
      );
      if (answer !== "Clear Cache") {
        return;
      }

      await cache.clear();
      output.appendLine("[ASMR] Voice cache cleared.");
      vscode.window.showInformationMessage("ASMR Coach voice cache cleared.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("asmrCoach.showCacheStats", async () => {
      const scripts = allScriptLines();
      const stats = await cache.stats(scripts);

      const routedScripts = currentRouteScriptLines(getConfig());
      const routedStats = await cache.stats(routedScripts);

      const message =
        `ASMR cache (all personas): total=${stats.total}, cached=${stats.cached}, blocked=${stats.blocked}, missing=${stats.missing} | ` +
        `active route: total=${routedStats.total}, cached=${routedStats.cached}, blocked=${routedStats.blocked}, missing=${routedStats.missing}`;
      output.appendLine(`[ASMR] ${message}`);
      vscode.window.showInformationMessage(message);
      output.show(true);
    })
  );

  output.appendLine("[ASMR] Extension activated.");

  void maybePreGenerateOnStartup();

  async function respond(
    trigger: TriggerType,
    out: vscode.OutputChannel,
    force = false,
    options?: { ignoreCache?: boolean; forceAudioFetch?: boolean }
  ): Promise<void> {
    const current = getConfig();
    out.appendLine(
      `[ASMR] Respond start: trigger=${trigger} mode=${current.mode} enabled=${current.enabled} personaMode=${current.voicePersona} pregen=${current.usePreGeneratedAudio} ignoreCache=${options?.ignoreCache ? "yes" : "no"} forceAudioFetch=${options?.forceAudioFetch ? "yes" : "no"}`
    );

    if (!current.enabled && !force) {
      out.appendLine("[ASMR] Respond skipped: extension disabled and not forced.");
      return;
    }

    const persona: Persona = choosePersona(trigger, current);
    const text = pickLine(trigger, persona);
    out.appendLine(`[ASMR][TEXT][${persona}][${trigger}] ${text}`);

    if (current.mode === "mock" && !options?.forceAudioFetch) {
      out.appendLine(`[ASMR][MOCK][${persona}][${trigger}] ${text}`);
      vscode.window.setStatusBarMessage("ASMR Coach: mock line emitted", 2500);
      return;
    }

    if (current.mode === "mock" && options?.forceAudioFetch) {
      out.appendLine("[ASMR] Force fetch requested: proceeding with audio synthesis despite mock mode.");
    }

    if (!current.apiKey) {
      out.appendLine("[ASMR] Audio mode set, but apiKey is missing.");
      vscode.window.showWarningMessage("ASMR Coach: audio mode needs asmrCoach.apiKey");
      return;
    }

    try {
      let audio;
      if (current.usePreGeneratedAudio && !options?.ignoreCache) {
        const cached = await cache.get({ trigger, persona, text });
        if (cached.audio) {
          audio = cached.audio;
          out.appendLine(`[ASMR] Playing cached audio for ${trigger}.`);
        } else if (cached.blockedReason) {
          out.appendLine(
            `[ASMR] Cached block for ${trigger}/${persona} (${cached.blockedReason}); skipping on-demand generation to avoid silence.`
          );
          await playFallbackFromCacheOrMock(trigger, out, current);
          return;
        } else if (cached.indexed) {
          out.appendLine(`[ASMR] Cache index hit without file for ${trigger}; skipping synthesis to avoid duplicate credits.`);
          await playFallbackFromCacheOrMock(trigger, out, current);
          return;
        }
      }

      if (!audio) {
        out.appendLine(`[ASMR] Synthesizing ${trigger} with ${persona} voice.`);
        try {
          audio = await synthesizeWithElevenLabs({
            apiKey: current.apiKey,
            persona,
            text
          });
          out.appendLine(`[ASMR] Synthesis success for ${trigger}/${persona}.`);
        } catch (err) {
          await maybeBlockUnusableVoice({ trigger, persona, text }, err);
          throw err;
        }
        if (current.usePreGeneratedAudio) {
          await cache.put({ trigger, persona, text, audio });
          out.appendLine(`[ASMR] Cached synthesized audio for ${trigger}/${persona}.`);
        }
      }

      await playMp3Buffer(audio);
      out.appendLine(`[ASMR] Played audio line for ${trigger}.`);
      vscode.window.setStatusBarMessage(`ASMR Coach played: ${trigger}`, 2500);
    } catch (err) {
      out.appendLine(`[ASMR] Audio failed: ${String(err)}`);
      vscode.window.showErrorMessage(`ASMR Coach audio failed. Open 'ASMR Coach' output for details.`);
    }
  }

  async function maybePreGenerateOnStartup(): Promise<void> {
    const current = getConfig();
    if (!current.preGenerateOnStartup || current.mode !== "audio") {
      return;
    }
    if (!current.apiKey) {
      output.appendLine("[ASMR] Startup pre-generate skipped: missing apiKey.");
      return;
    }

    const scripts = currentRouteScriptLines(current);
    const complete = await cache.hasAll(scripts);
    if (complete) {
      output.appendLine("[ASMR] Startup pre-generate skipped: cache already complete.");
      return;
    }

    output.appendLine("[ASMR] Startup pre-generate starting...");
    const stats = await cache.preload(scripts, async ({ persona, text }) => {
      return await synthesizeWithElevenLabs({
        apiKey: current.apiKey,
        persona,
        text
      });
    }, async ({ line, error }) => {
      await maybeBlockUnusableVoice(line, error);
    });
    output.appendLine(
      `[ASMR] Startup pre-generate complete: generated=${stats.generated} reused=${stats.reused} retriedBlocked=${stats.retriedBlocked} blocked=${stats.blocked} failed=${stats.failed}`
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
      output.appendLine(`[ASMR] Marked line as blocked due to plan limits: ${line.trigger}/${line.persona}`);
    }
  }

  async function playFallbackFromCacheOrMock(
    trigger: TriggerType,
    out: vscode.OutputChannel,
    current: CoachConfig
  ): Promise<void> {
    const personas = fallbackPersonaOrder(trigger, current);
    for (const persona of personas) {
      for (const text of linesFor(trigger, persona)) {
        const cached = await cache.get({ trigger, persona, text });
        if (cached.audio) {
          await playMp3Buffer(cached.audio);
          out.appendLine(`[ASMR] Played cached fallback audio for ${trigger} using ${persona}.`);
          vscode.window.setStatusBarMessage(`ASMR Coach fallback audio: ${trigger}`, 2500);
          return;
        }
      }
    }

    const fallbackPersona = personas[0] ?? "female";
    const fallback = pickLine(trigger, fallbackPersona);
    out.appendLine(`[ASMR][TEXT][fallback:${fallbackPersona}][${trigger}] ${fallback}`);
    out.appendLine(`[ASMR][MOCK][fallback:${fallbackPersona}][${trigger}] ${fallback}`);
    vscode.window.setStatusBarMessage(`ASMR Coach fallback text: ${trigger}`, 2500);
  }

  function currentRouteScriptLines(current: CoachConfig): Array<{ trigger: TriggerType; persona: Persona; text: string }> {
    const triggers: TriggerType[] = ["longLinePraise", "idleNudge", "sustainedTyping", "burstTyping"];
    const routed: Array<{ trigger: TriggerType; persona: Persona; text: string }> = [];
    for (const trigger of triggers) {
      const persona = choosePersona(trigger, current);
      for (const text of linesFor(trigger, persona)) {
        routed.push({ trigger, persona, text });
      }
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
  if (trigger === "idleNudge") {
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
