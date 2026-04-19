import test from "node:test";
import assert from "node:assert/strict";
import { __internal } from "../src/llm/openaiClient";

test("extractResponseText parses responses API output_text and nested content", () => {
  const direct = __internal.extractResponseText({ output_text: "hello love" });
  assert.equal(direct, "hello love");

  const nested = __internal.extractResponseText({
    output: [{ content: [{ type: "output_text", text: "you've got this" }] }]
  });
  assert.equal(nested, "you've got this");

  const outputTextArray = __internal.extractResponseText({
    output_text: [{ type: "output_text", text: "line one" }, { type: "output_text", text: "line two" }]
  });
  assert.equal(outputTextArray, "line one\nline two");
});

test("extractResponseText parses chat/completions style content", () => {
  const chat = __internal.extractResponseText({ choices: [{ message: { content: "stay focused, babe" } }] });
  assert.equal(chat, "stay focused, babe");
});
