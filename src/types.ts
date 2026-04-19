export type AsmrMode = "mock" | "audio";

export type TriggerType =
  | "idleVeryShort"
  | "idleShort"
  | "idleLong"
  | "idleVeryLong"
  | "burstTyping"
  | "sustainedTyping"
  | "longLine"
  | "minorRefactor"
  | "largeRefactor"
  | "errorAppears"
  | "errorFixed"
  | "fileSaved"
  | "functionFinished"
  | "gitCommit"
  | "testsPassing"
  | "autocompleteAccepted"
  | "addingComments"
  | "deletingCode"
  | "lateNightSession"
  | "switchingFiles"
  | "singleLineEdit"
  | "cursorNavigation"
  | "formatDocument"
  | "pasteAction"
  | "undoRedo"
  | "sandyMention";

export type Persona = "female" | "male";
export type VoicePersonaMode = "female" | "male" | "mixed";
export type PacingMode = "normal" | "demo" | "debug";
export type TriggerConfidence = "high" | "medium" | "strict";

export interface CoachConfig {
  enabled: boolean;
  mode: AsmrMode;
  elevenlabsApiKey: string;
  longLineThreshold: number;
  minSecondsBetweenMessages: number;
  longLineCooldownSeconds: number;
  idleAfterSeconds: number;
  idleCooldownSeconds: number;
  sustainedWindowSeconds: number;
  sustainedEditsThreshold: number;
  burstWpmThreshold: number;
  sustainedCooldownSeconds: number;
  burstWindowSeconds: number;
  burstEditsThreshold: number;
  burstCooldownSeconds: number;
  debugLogs: boolean;
  audioKeepAlive: boolean;
  usePreGeneratedAudio: boolean;
  preGenerateOnStartup: boolean;
  voicePersona: VoicePersonaMode;
  pacingMode: PacingMode;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  llmReferer: string;
  llmTitle: string;
}

export interface TriggerPayload {
  trigger: TriggerType;
  confidence: TriggerConfidence;
  detail: string;
  forceBypassScheduler?: boolean;
  metadata?: {
    languageId?: string;
    sourceText?: string;
    contextBefore?: string;
    contextAfter?: string;
    commandLine?: string;
  };
  text: string;
  persona: Persona;
}

export interface TriggerDecision {
  allowed: boolean;
  reason?: string;
  mode: PacingMode;
}
