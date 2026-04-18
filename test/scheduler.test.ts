import test from "node:test";
import assert from "node:assert/strict";
import { TriggerScheduler } from "../src/telemetry/scheduler";

test("scheduler enforces slower pacing in normal mode", () => {
  const scheduler = new TriggerScheduler("normal");
  const start = 1_000_000;

  const first = scheduler.allow("burstTyping", start);
  assert.equal(first.allowed, true);

  const second = scheduler.allow("burstTyping", start + 5000);
  assert.equal(second.allowed, false);

  const third = scheduler.allow("burstTyping", start + 100_000);
  assert.equal(third.allowed, false);

  const fourth = scheduler.allow("burstTyping", start + 170_000);
  assert.equal(fourth.allowed, true);
});

test("scheduler allows rare high-value cluster", () => {
  const scheduler = new TriggerScheduler("normal");
  const start = 2_000_000;
  assert.equal(scheduler.allow("errorFixed", start).allowed, true);

  const follow = scheduler.allow("testsPassing", start + 10_000);
  assert.equal(follow.allowed, true);

  const blocked = scheduler.allow("gitCommit", start + 20_000);
  assert.equal(blocked.allowed, false);
});

test("pacing modes differ by multiplier and timing", () => {
  const start = 3_000_000;
  const normal = new TriggerScheduler("normal");
  const demo = new TriggerScheduler("demo");
  const debug = new TriggerScheduler("debug");

  assert.equal(normal.allow("sustainedTyping", start).allowed, true);
  assert.equal(demo.allow("sustainedTyping", start).allowed, true);
  assert.equal(debug.allow("sustainedTyping", start).allowed, true);

  const after70s = start + 70_000;
  assert.equal(normal.allow("minorRefactor", after70s).allowed, false);
  assert.equal(demo.allow("minorRefactor", after70s).allowed, true);
  assert.equal(debug.allow("minorRefactor", after70s).allowed, true);
});

test("forced scheduler allow bypasses gating but not cluster lockout side effects", () => {
  const scheduler = new TriggerScheduler("normal");
  const start = 4_000_000;

  const first = scheduler.allow("errorFixed", start, true);
  assert.equal(first.allowed, true);

  const second = scheduler.allow("testsPassing", start + 5_000, true);
  assert.equal(second.allowed, true);

  const third = scheduler.allow("gitCommit", start + 10_000);
  assert.equal(third.allowed, true);
});

test("mode updates preserve token continuity", () => {
  const scheduler = new TriggerScheduler("normal");
  const start = 5_000_000;

  assert.equal(scheduler.allow("burstTyping", start).allowed, true);
  assert.equal(scheduler.allow("minorRefactor", start + 5_000).allowed, false);

  scheduler.updateMode("debug");
  const healthAfterModeSwitch = scheduler.getHealth();
  assert.ok(healthAfterModeSwitch.tokens >= 1);
});
