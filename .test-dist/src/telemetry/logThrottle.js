"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogThrottle = void 0;
class LogThrottle {
    constructor() {
        this.stateByBucket = new Map();
    }
    shouldLog(bucket, now) {
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
exports.LogThrottle = LogThrottle;
LogThrottle.BURST_THRESHOLD = 3;
LogThrottle.WINDOW_MS = 6_000;
LogThrottle.MUTE_MS = 4_000;
