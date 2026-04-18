"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const singleLineSignal_1 = require("../src/telemetry/singleLineSignal");
(0, node_test_1.default)("single line edit requires jump-edit-jump pattern", () => {
    const signal = new singleLineSignal_1.SingleLineEditSignal();
    const doc = "file:///a.ts";
    const t0 = 10_000;
    strict_1.default.equal(signal.noteCursor(doc, 10, t0), false);
    strict_1.default.equal(signal.noteCursor(doc, 20, t0 + 1_000), false);
    signal.noteSingleLineEdit(doc, 20, t0 + 1_500);
    strict_1.default.equal(signal.noteCursor(doc, 22, t0 + 2_000), false);
    strict_1.default.equal(signal.noteCursor(doc, 30, t0 + 2_500), true);
});
(0, node_test_1.default)("single line edit signal expires without second jump", () => {
    const signal = new singleLineSignal_1.SingleLineEditSignal();
    const doc = "file:///b.ts";
    const t0 = 20_000;
    signal.noteCursor(doc, 5, t0);
    signal.noteCursor(doc, 12, t0 + 500);
    signal.noteSingleLineEdit(doc, 12, t0 + 1_000);
    strict_1.default.equal(signal.noteCursor(doc, 16, t0 + 20_000), false);
});
