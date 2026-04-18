"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const scheduler_1 = require("../src/telemetry/scheduler");
(0, node_test_1.default)("scheduler enforces slower pacing in normal mode", () => {
    const scheduler = new scheduler_1.TriggerScheduler("normal");
    const start = 1_000_000;
    const first = scheduler.allow("burstTyping", start);
    strict_1.default.equal(first.allowed, true);
    const second = scheduler.allow("burstTyping", start + 5000);
    strict_1.default.equal(second.allowed, false);
    const third = scheduler.allow("burstTyping", start + 100_000);
    strict_1.default.equal(third.allowed, false);
    const fourth = scheduler.allow("burstTyping", start + 170_000);
    strict_1.default.equal(fourth.allowed, true);
});
(0, node_test_1.default)("scheduler allows rare high-value cluster", () => {
    const scheduler = new scheduler_1.TriggerScheduler("normal");
    const start = 2_000_000;
    strict_1.default.equal(scheduler.allow("errorFixed", start).allowed, true);
    const follow = scheduler.allow("testsPassing", start + 10_000);
    strict_1.default.equal(follow.allowed, true);
    const blocked = scheduler.allow("gitCommit", start + 20_000);
    strict_1.default.equal(blocked.allowed, false);
});
(0, node_test_1.default)("pacing modes differ by multiplier and timing", () => {
    const start = 3_000_000;
    const normal = new scheduler_1.TriggerScheduler("normal");
    const demo = new scheduler_1.TriggerScheduler("demo");
    const debug = new scheduler_1.TriggerScheduler("debug");
    strict_1.default.equal(normal.allow("sustainedTyping", start).allowed, true);
    strict_1.default.equal(demo.allow("sustainedTyping", start).allowed, true);
    strict_1.default.equal(debug.allow("sustainedTyping", start).allowed, true);
    const after70s = start + 70_000;
    strict_1.default.equal(normal.allow("minorRefactor", after70s).allowed, false);
    strict_1.default.equal(demo.allow("minorRefactor", after70s).allowed, true);
    strict_1.default.equal(debug.allow("minorRefactor", after70s).allowed, true);
});
