import test from "node:test";
import assert from "node:assert/strict";
import { getScriptBankHealth, initializeScriptBank, linesFor } from "../src/content/scriptBank";

test("script bank loads from lines.md and maps aliases", () => {
  const logs: string[] = [];
  initializeScriptBank({ appendLine: (message: string) => logs.push(message) }, process.cwd());

  const health = getScriptBankHealth();
  assert.equal(health.parseFailure, undefined);
  assert.ok(health.mappedHeadingsCount > 0);

  const commitLines = linesFor("gitCommit", "female");
  assert.ok(commitLines.some((x) => x.toLowerCase().includes("commit")));

  const idleLines = linesFor("idleVeryShort", "female");
  assert.ok(idleLines.length > 0);
  assert.ok(logs.some((x) => x.includes("Script bank loaded")));
});
