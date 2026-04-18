export type AsmrMode = "mock" | "audio";

export type TriggerType = "longLinePraise" | "idleNudge" | "sustainedTyping" | "burstTyping";

export type Persona = "female" | "male";
export type VoicePersonaMode = "female" | "male" | "mixed";

export interface CoachConfig {
  enabled: boolean;
  mode: AsmrMode;
  apiKey: string;
  longLineThreshold: number;
  minSecondsBetweenMessages: number;
  longLineCooldownSeconds: number;
  idleAfterSeconds: number;
  idleCooldownSeconds: number;
  sustainedWindowSeconds: number;
  sustainedEditsThreshold: number;
  sustainedCooldownSeconds: number;
  burstWindowSeconds: number;
  burstEditsThreshold: number;
  burstCooldownSeconds: number;
  debugLogs: boolean;
  usePreGeneratedAudio: boolean;
  preGenerateOnStartup: boolean;
  voicePersona: VoicePersonaMode;
}

export interface TriggerPayload {
  trigger: TriggerType;
  text: string;
  persona: Persona;
}
