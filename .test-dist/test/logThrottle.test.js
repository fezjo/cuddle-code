"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const logThrottle_1 = require("../src/telemetry/logThrottle");
(0, node_test_1.default)("log throttle mutes noisy bursts then recovers", () => {
    const throttle = new logThrottle_1.LogThrottle();
    const bucket = "skip:burstTyping:global_gap";
    const t0 = 30_000;
    strict_1.default.equal(throttle.shouldLog(bucket, t0), true);
    strict_1.default.equal(throttle.shouldLog(bucket, t0 + 200), true);
    strict_1.default.equal(throttle.shouldLog(bucket, t0 + 400), true);
    strict_1.default.equal(throttle.shouldLog(bucket, t0 + 600), false);
    strict_1.default.equal(throttle.shouldLog(bucket, t0 + 1_000), false);
    strict_1.default.equal(throttle.shouldLog(bucket, t0 + 5_000), true);
});
