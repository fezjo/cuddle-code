type BucketState = {
  count: number;
  windowStart: number;
  mutedUntil: number;
};

export class LogThrottle {
  private static readonly BURST_THRESHOLD = 3;
  private static readonly WINDOW_MS = 6_000;
  private static readonly MUTE_MS = 4_000;

  private readonly stateByBucket = new Map<string, BucketState>();

  public shouldLog(bucket: string, now: number): boolean {
    const state = this.stateByBucket.get(bucket);
    if (!state) {
      this.stateByBucket.set(bucket, {
        count: 1,
        windowStart: now,
        mutedUntil: 0
      });
      return true;
    }

    if (now < state.mutedUntil) {
      return false;
    }

    if (state.mutedUntil > 0 && now >= state.mutedUntil) {
      state.count = 1;
      state.windowStart = now;
      state.mutedUntil = 0;
      return true;
    }

    if (now - state.windowStart > LogThrottle.WINDOW_MS) {
      state.count = 1;
      state.windowStart = now;
      state.mutedUntil = 0;
      return true;
    }

    state.count += 1;
    if (state.count > LogThrottle.BURST_THRESHOLD) {
      state.mutedUntil = now + LogThrottle.MUTE_MS;
      return false;
    }

    return true;
  }
}
