import { PacingMode, TriggerDecision, TriggerType } from "../types";

const MODE_MULTIPLIER: Record<PacingMode, number> = {
  normal: 1,
  demo: 0.45,
  debug: 0.2
};

const GLOBAL_MIN_GAP_SECONDS = 80;
const TOKEN_REGEN_SECONDS = 120;
const TOKEN_CAP = 2;
const CLUSTER_LOCKOUT_SECONDS = 300;
const CLUSTER_WINDOW_SECONDS = 15;
const CLUSTER_MIN_GAP_MINUTES = 25;

export class TriggerScheduler {
  private mode: PacingMode;
  private tokens = TOKEN_CAP;
  private lastTokenAt = Date.now();
  private lastSpokenAt = 0;
  private lastClusterAt = 0;
  private followupWindowUntil = 0;
  private followupUsed = false;
  private silenceLockoutUntil = 0;
  private triggerCooldownUntil = new Map<TriggerType, number>();
  private firedByTrigger = new Map<TriggerType, number>();
  private skippedByReason = new Map<string, number>();

  constructor(mode: PacingMode) {
    this.mode = mode;
  }

  public updateMode(mode: PacingMode): void {
    this.regenTokens(Date.now());
    this.mode = mode;
  }

  public allow(trigger: TriggerType, now = Date.now(), force = false): TriggerDecision {
    if (force) {
      this.onFire(trigger, now, false);
      return { allowed: true, mode: this.mode };
    }

    this.regenTokens(now);

    if (now < this.silenceLockoutUntil) {
      return this.skip(trigger, "cluster_lockout");
    }

    const triggerReadyAt = this.triggerCooldownUntil.get(trigger) ?? 0;
    if (now < triggerReadyAt) {
      return this.skip(trigger, "trigger_cooldown");
    }

    const minGapMs = Math.floor(GLOBAL_MIN_GAP_SECONDS * 1000 * MODE_MULTIPLIER[this.mode]);
    const withinGap = now - this.lastSpokenAt < minGapMs;
    const canCluster = this.canUseClusterFollowup(trigger, now);
    if (withinGap && !canCluster) {
      return this.skip(trigger, "global_gap");
    }

    if (this.tokens < 1 && !canCluster) {
      return this.skip(trigger, "token_budget");
    }

    this.onFire(trigger, now, canCluster);
    return { allowed: true, mode: this.mode };
  }

  public getHealth(): {
    mode: PacingMode;
    firedByTrigger: Record<string, number>;
    skippedByReason: Record<string, number>;
    tokens: number;
  } {
    return {
      mode: this.mode,
      firedByTrigger: Object.fromEntries(this.firedByTrigger.entries()),
      skippedByReason: Object.fromEntries(this.skippedByReason.entries()),
      tokens: Number(this.tokens.toFixed(2))
    };
  }

  private onFire(trigger: TriggerType, now: number, fromCluster: boolean): void {
    this.regenTokens(now);
    this.tokens = Math.max(0, this.tokens - 1);
    this.lastSpokenAt = now;

    const cooldown = triggerCooldownSeconds(trigger) * MODE_MULTIPLIER[this.mode] * 1000;
    this.triggerCooldownUntil.set(trigger, now + cooldown);
    this.firedByTrigger.set(trigger, (this.firedByTrigger.get(trigger) ?? 0) + 1);

    if (fromCluster) {
      this.followupUsed = true;
      this.followupWindowUntil = 0;
      this.lastClusterAt = now;
      this.silenceLockoutUntil = now + CLUSTER_LOCKOUT_SECONDS * MODE_MULTIPLIER[this.mode] * 1000;
      return;
    }

    if (isHighValue(trigger)) {
      this.followupWindowUntil = now + CLUSTER_WINDOW_SECONDS * MODE_MULTIPLIER[this.mode] * 1000;
      this.followupUsed = false;
    }
  }

  private canUseClusterFollowup(trigger: TriggerType, now: number): boolean {
    if (this.followupUsed || now > this.followupWindowUntil) {
      return false;
    }
    const minClusterMs = CLUSTER_MIN_GAP_MINUTES * 60 * 1000 * MODE_MULTIPLIER[this.mode];
    if (now - this.lastClusterAt < minClusterMs) {
      return false;
    }
    return isHighValue(trigger);
  }

  private regenTokens(now: number): void {
    const deltaMs = now - this.lastTokenAt;
    if (deltaMs < 0) {
      this.lastTokenAt = now;
      return;
    }
    if (deltaMs === 0) {
      return;
    }
    const regen = deltaMs / (TOKEN_REGEN_SECONDS * 1000 * MODE_MULTIPLIER[this.mode]);
    this.tokens = Math.min(TOKEN_CAP, this.tokens + regen);
    this.lastTokenAt = now;
  }

  private skip(trigger: TriggerType, reason: string): TriggerDecision {
    const key = `${trigger}:${reason}`;
    this.skippedByReason.set(key, (this.skippedByReason.get(key) ?? 0) + 1);
    return { allowed: false, reason, mode: this.mode };
  }
}

function triggerCooldownSeconds(trigger: TriggerType): number {
  switch (trigger) {
    case "fileSaved":
    case "autocompleteAccepted":
    case "cursorNavigation":
    case "switchingFiles":
      return 240;
    case "burstTyping":
    case "pasteAction":
    case "undoRedo":
      return 150;
    case "idleVeryShort":
    case "idleShort":
    case "singleLineEdit":
    case "addingComments":
      return 180;
    case "sustainedTyping":
    case "longLine":
    case "minorRefactor":
    case "largeRefactor":
    case "errorAppears":
    case "formatDocument":
    case "deletingCode":
      return 210;
    case "idleLong":
    case "idleVeryLong":
    case "errorFixed":
    case "functionFinished":
    case "lateNightSession":
      return 270;
    case "gitCommit":
    case "testsPassing":
    case "sandyMention":
      return 120;
    default:
      return 180;
  }
}

function isHighValue(trigger: TriggerType): boolean {
  return trigger === "errorFixed" || trigger === "testsPassing" || trigger === "gitCommit" || trigger === "functionFinished";
}
