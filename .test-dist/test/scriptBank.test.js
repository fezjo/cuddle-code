"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const scriptBank_1 = require("../src/content/scriptBank");
(0, node_test_1.default)("script bank loads from lines.md and maps aliases", () => {
    const logs = [];
    (0, scriptBank_1.initializeScriptBank)({ appendLine: (message) => logs.push(message) }, process.cwd());
    const health = (0, scriptBank_1.getScriptBankHealth)();
    strict_1.default.equal(health.parseFailure, undefined);
    strict_1.default.ok(health.mappedHeadingsCount > 0);
    const commitLines = (0, scriptBank_1.linesFor)("gitCommit", "female");
    strict_1.default.ok(commitLines.some((x) => x.toLowerCase().includes("commit")));
    const idleLines = (0, scriptBank_1.linesFor)("idleVeryShort", "female");
    strict_1.default.ok(idleLines.length > 0);
    strict_1.default.ok(logs.some((x) => x.includes("Script bank loaded")));
});
