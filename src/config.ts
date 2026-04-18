import * as vscode from "vscode";
import { CoachConfig } from "./types";

const SECTION = "asmrCoach";

export function getConfig(): CoachConfig {
  const config = vscode.workspace.getConfiguration(SECTION);
  return {
    enabled: config.get<boolean>("enabled", true),
    mode: config.get<"mock" | "audio">("mode", "mock"),
    apiKey: config.get<string>("apiKey", "").trim(),
    longLineThreshold: config.get<number>("longLineThreshold", 100),
    minSecondsBetweenMessages: config.get<number>("minSecondsBetweenMessages", 45),
    longLineCooldownSeconds: config.get<number>("longLineCooldownSeconds", 180),
    idleAfterSeconds: config.get<number>("idleAfterSeconds", 300),
    idleCooldownSeconds: config.get<number>("idleCooldownSeconds", 240),
    sustainedWindowSeconds: config.get<number>("sustainedWindowSeconds", 120),
    sustainedEditsThreshold: config.get<number>("sustainedEditsThreshold", 80),
    sustainedCooldownSeconds: config.get<number>("sustainedCooldownSeconds", 300),
    burstWindowSeconds: config.get<number>("burstWindowSeconds", 10),
    burstEditsThreshold: config.get<number>("burstEditsThreshold", 18),
    burstCooldownSeconds: config.get<number>("burstCooldownSeconds", 120),
    debugLogs: config.get<boolean>("debugLogs", true),
    usePreGeneratedAudio: config.get<boolean>("usePreGeneratedAudio", true),
    preGenerateOnStartup: config.get<boolean>("preGenerateOnStartup", false),
    voicePersona: config.get<"female" | "male" | "mixed">("voicePersona", "female")
  };
}

export async function toggleEnabled(): Promise<boolean> {
  const conf = vscode.workspace.getConfiguration(SECTION);
  const next = !conf.get<boolean>("enabled", true);
  await conf.update("enabled", next, vscode.ConfigurationTarget.Global);
  return next;
}

export async function toggleMode(): Promise<"mock" | "audio"> {
  const conf = vscode.workspace.getConfiguration(SECTION);
  const current = conf.get<"mock" | "audio">("mode", "mock");
  const next: "mock" | "audio" = current === "mock" ? "audio" : "mock";
  await conf.update("mode", next, vscode.ConfigurationTarget.Global);
  return next;
}
