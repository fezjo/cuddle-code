import test from "node:test";
import assert from "node:assert/strict";
import { initializeScriptBank, linesFor, pickLine } from "../src/content/scriptBank";

test("pickLine rotates through all trigger lines before repeating", () => {
  initializeScriptBank({ appendLine: () => undefined }, process.cwd());

  const trigger = "burstTyping" as const;
  const persona = "female" as const;
  const bank = linesFor(trigger, persona);

  assert.ok(bank.length > 2);

  const seen = new Set<string>();
  for (let i = 0; i < bank.length; i += 1) {
    seen.add(pickLine(trigger, persona));
  }

  assert.equal(seen.size, bank.length);
});
