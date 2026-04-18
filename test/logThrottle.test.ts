import test from "node:test";
import assert from "node:assert/strict";
import { LogThrottle } from "../src/telemetry/logThrottle";

test("log throttle mutes noisy bursts then recovers", () => {
  const throttle = new LogThrottle();
  const bucket = "skip:burstTyping:global_gap";
  const t0 = 30_000;

  assert.equal(throttle.shouldLog(bucket, t0), true);
  assert.equal(throttle.shouldLog(bucket, t0 + 200), true);
  assert.equal(throttle.shouldLog(bucket, t0 + 400), true);
  assert.equal(throttle.shouldLog(bucket, t0 + 600), false);
  assert.equal(throttle.shouldLog(bucket, t0 + 1_000), false);
  assert.equal(throttle.shouldLog(bucket, t0 + 5_000), true);
});
