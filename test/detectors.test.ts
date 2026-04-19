import test from "node:test";
import assert from "node:assert/strict";
import {
  commentPrefixesFor,
  detectDiagnosticTransitions,
  detectCommentInsertion,
  detectRefactorSignal,
  detectSandyMentionInLine,
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

  const ts = detectSandyMentionInLine("// sandy check this", "typescript");
  assert.equal(ts, "// sandy check this");

  const pyInline = detectSandyMentionInLine("def fib(n): # sandy where is the bug", "python");
  assert.equal(pyInline, "def fib(n): # sandy where is the bug");

  const mixedCase = detectSandyMentionInLine("// hello my love SANDY, where's the bug?", "typescript");
  assert.equal(mixedCase, "// hello my love SANDY, where's the bug?");

  const genericLanguage = detectSandyMentionInLine("-- hey sandy, look here", "haskell");
  assert.equal(genericLanguage, "-- hey sandy, look here");
});

test("detectors classify change summaries", () => {
  const sum = summarizeChanges([{ text: "myCompletion.call(value)", rangeLength: 0, range: { start: { line: 2 } } }]);
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

  const shortInsert = summarizeChanges([{ text: "name", rangeLength: 0, range: { start: { line: 7 } } }]);
  assert.equal(shortInsert.looksLikeAutocomplete, false);

  const copilotLike = summarizeChanges([
    {
      text: "const value = items.map((x) => x.id);\nreturn value;",
      rangeLength: 0,
      range: { start: { line: 8 } }
    }
  ]);
  assert.equal(copilotLike.looksLikeAutocomplete, true);
  assert.equal(copilotLike.hasPaste, false);

  const copilotReplace = summarizeChanges([
    {
      text: "if (!items.length) {\n  return [];\n}\nreturn items.map((x) => x.id);",
      rangeLength: 48,
      range: { start: { line: 9 } }
    }
  ]);
  assert.equal(copilotReplace.looksLikeAutocomplete, true);
  assert.equal(copilotReplace.hasPaste, false);
});

test("comment prefixes and refactor detector work", () => {
  assert.ok(commentPrefixesFor("python").includes("#"));
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

test("diagnostic transitions only fire on state changes", () => {
  const state = new Map<string, boolean>();

  const first = detectDiagnosticTransitions(
    [
      { key: "file:///a.ts", hasError: true },
      { key: "file:///b.ts", hasError: false }
    ],
    state
  );
  assert.equal(first.appears, true);
  assert.equal(first.fixed, false);

  const second = detectDiagnosticTransitions(
    [
      { key: "file:///a.ts", hasError: true },
      { key: "file:///b.ts", hasError: false }
    ],
    state
  );
  assert.equal(second.appears, false);
  assert.equal(second.fixed, false);

  const third = detectDiagnosticTransitions([{ key: "file:///a.ts", hasError: false }], state);
  assert.equal(third.appears, false);
  assert.equal(third.fixed, true);
});

test("refactor signal distinguishes minor and large edits", () => {
  const minor = detectRefactorSignal([
    { text: "newCounterValue", rangeLength: 10, range: { start: { line: 10 } } },
    { text: "newCounterValue", rangeLength: 10, range: { start: { line: 12 } } }
  ]);
  assert.equal(minor.minor, true);
  assert.equal(minor.large, false);

  const large = detectRefactorSignal([
    { text: "function buildResult() {", rangeLength: 0, range: { start: { line: 1 } } },
    { text: "  return map(items);", rangeLength: 20, range: { start: { line: 2 } } },
    { text: "}", rangeLength: 0, range: { start: { line: 3 } } },
    { text: "const output = buildResult();", rangeLength: 25, range: { start: { line: 20 } } },
    { text: "const summary = buildResult();", rangeLength: 25, range: { start: { line: 25 } } }
  ]);
  assert.equal(large.large, true);
});
