import test from "node:test";
import assert from "node:assert/strict";
import {
  commentPrefixesFor,
  detectCommentInsertion,
  detectSandyMention,
  detectRefactorishRenaming,
  summarizeChanges
} from "../src/telemetry/detectors";

test("detectors recognize sandy mentions in supported comment syntaxes", () => {
  const py = detectSandyMention({ contentChanges: [{ text: "# sandy help me", rangeLength: 0, range: { start: { line: 1 } } }] }, "python");
  assert.equal(py, "# sandy help me");

  const cpp = detectSandyMention({ contentChanges: [{ text: "// Sandy, look", rangeLength: 0, range: { start: { line: 1 } } }] }, "cpp");
  assert.equal(cpp, "// Sandy, look");

  const rust = detectSandyMention({ contentChanges: [{ text: "/// sandy", rangeLength: 0, range: { start: { line: 1 } } }] }, "rust");
  assert.equal(rust, "/// sandy");
});

test("detectors classify change summaries", () => {
  const sum = summarizeChanges([{ text: "identifier", rangeLength: 0, range: { start: { line: 2 } } }]);
  assert.equal(sum.looksLikeAutocomplete, true);
  assert.equal(sum.isSingleLineEdit, true);

  const del = summarizeChanges([{ text: "", rangeLength: 3, range: { start: { line: 2 } } }]);
  assert.equal(del.onlyDeletes, true);
  assert.equal(del.isSingleLineEdit, false);

  const enterOnly = summarizeChanges([{ text: "\n", rangeLength: 0, range: { start: { line: 3 } } }]);
  assert.equal(enterOnly.isSingleLineEdit, false);
  assert.equal(enterOnly.hasPaste, false);

  const multilinePaste = summarizeChanges([{ text: "line1\nline2\nline3", rangeLength: 0, range: { start: { line: 4 } } }]);
  assert.equal(multilinePaste.hasPaste, true);
});

test("comment prefixes and refactor detector work", () => {
  assert.deepEqual(commentPrefixesFor("python"), ["#"]);
  assert.equal(
    detectCommentInsertion({ contentChanges: [{ text: "// comment", rangeLength: 0, range: { start: { line: 1 } } }] }, "cpp"),
    true
  );

  const state = new Map<string, { line: number; text: string; at: number }>();
  const first = detectRefactorishRenaming("let oldName = 1", 1, 1000, "f", state);
  const second = detectRefactorishRenaming("let newName = 1", 1, 2000, "f", state);
  assert.equal(first, false);
  assert.equal(second, true);
});
