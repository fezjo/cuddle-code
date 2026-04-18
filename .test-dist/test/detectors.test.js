"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const detectors_1 = require("../src/telemetry/detectors");
(0, node_test_1.default)("detectors recognize sandy mentions in supported comment syntaxes", () => {
    const py = (0, detectors_1.detectSandyMention)({ contentChanges: [{ text: "# sandy help me", rangeLength: 0, range: { start: { line: 1 } } }] }, "python");
    strict_1.default.equal(py, "# sandy help me");
    const cpp = (0, detectors_1.detectSandyMention)({ contentChanges: [{ text: "// Sandy, look", rangeLength: 0, range: { start: { line: 1 } } }] }, "cpp");
    strict_1.default.equal(cpp, "// Sandy, look");
    const rust = (0, detectors_1.detectSandyMention)({ contentChanges: [{ text: "/// sandy", rangeLength: 0, range: { start: { line: 1 } } }] }, "rust");
    strict_1.default.equal(rust, "/// sandy");
});
(0, node_test_1.default)("detectors classify change summaries", () => {
    const sum = (0, detectors_1.summarizeChanges)([{ text: "myCompletion.call(value)", rangeLength: 0, range: { start: { line: 2 } } }]);
    strict_1.default.equal(sum.looksLikeAutocomplete, true);
    strict_1.default.equal(sum.isSingleLineEdit, true);
    const del = (0, detectors_1.summarizeChanges)([{ text: "", rangeLength: 3, range: { start: { line: 2 } } }]);
    strict_1.default.equal(del.onlyDeletes, true);
    strict_1.default.equal(del.isSingleLineEdit, false);
    const enterOnly = (0, detectors_1.summarizeChanges)([{ text: "\n", rangeLength: 0, range: { start: { line: 3 } } }]);
    strict_1.default.equal(enterOnly.isSingleLineEdit, false);
    strict_1.default.equal(enterOnly.hasPaste, false);
    const multilinePaste = (0, detectors_1.summarizeChanges)([{ text: "line1\nline2\nline3", rangeLength: 0, range: { start: { line: 4 } } }]);
    strict_1.default.equal(multilinePaste.hasPaste, true);
    const shortInsert = (0, detectors_1.summarizeChanges)([{ text: "name", rangeLength: 0, range: { start: { line: 7 } } }]);
    strict_1.default.equal(shortInsert.looksLikeAutocomplete, false);
    const copilotLike = (0, detectors_1.summarizeChanges)([
        {
            text: "const value = items.map((x) => x.id);\nreturn value;",
            rangeLength: 0,
            range: { start: { line: 8 } }
        }
    ]);
    strict_1.default.equal(copilotLike.looksLikeAutocomplete, true);
    strict_1.default.equal(copilotLike.hasPaste, false);
    const copilotReplace = (0, detectors_1.summarizeChanges)([
        {
            text: "if (!items.length) {\n  return [];\n}\nreturn items.map((x) => x.id);",
            rangeLength: 48,
            range: { start: { line: 9 } }
        }
    ]);
    strict_1.default.equal(copilotReplace.looksLikeAutocomplete, true);
    strict_1.default.equal(copilotReplace.hasPaste, false);
});
(0, node_test_1.default)("comment prefixes and refactor detector work", () => {
    strict_1.default.deepEqual((0, detectors_1.commentPrefixesFor)("python"), ["#"]);
    strict_1.default.equal((0, detectors_1.detectCommentInsertion)({ contentChanges: [{ text: "// comment", rangeLength: 0, range: { start: { line: 1 } } }] }, "cpp"), true);
    const state = new Map();
    const first = (0, detectors_1.detectRefactorishRenaming)("let oldName = 1", 1, 1000, "f", state);
    const second = (0, detectors_1.detectRefactorishRenaming)("let newName = 1", 1, 2000, "f", state);
    strict_1.default.equal(first, false);
    strict_1.default.equal(second, true);
});
(0, node_test_1.default)("diagnostic transitions only fire on state changes", () => {
    const state = new Map();
    const first = (0, detectors_1.detectDiagnosticTransitions)([
        { key: "file:///a.ts", hasError: true },
        { key: "file:///b.ts", hasError: false }
    ], state);
    strict_1.default.equal(first.appears, true);
    strict_1.default.equal(first.fixed, false);
    const second = (0, detectors_1.detectDiagnosticTransitions)([
        { key: "file:///a.ts", hasError: true },
        { key: "file:///b.ts", hasError: false }
    ], state);
    strict_1.default.equal(second.appears, false);
    strict_1.default.equal(second.fixed, false);
    const third = (0, detectors_1.detectDiagnosticTransitions)([{ key: "file:///a.ts", hasError: false }], state);
    strict_1.default.equal(third.appears, false);
    strict_1.default.equal(third.fixed, true);
});
(0, node_test_1.default)("refactor signal distinguishes minor and large edits", () => {
    const minor = (0, detectors_1.detectRefactorSignal)([
        { text: "newCounterValue", rangeLength: 10, range: { start: { line: 10 } } },
        { text: "newCounterValue", rangeLength: 10, range: { start: { line: 12 } } }
    ]);
    strict_1.default.equal(minor.minor, true);
    strict_1.default.equal(minor.large, false);
    const large = (0, detectors_1.detectRefactorSignal)([
        { text: "function buildResult() {", rangeLength: 0, range: { start: { line: 1 } } },
        { text: "  return map(items);", rangeLength: 20, range: { start: { line: 2 } } },
        { text: "}", rangeLength: 0, range: { start: { line: 3 } } },
        { text: "const output = buildResult();", rangeLength: 25, range: { start: { line: 20 } } },
        { text: "const summary = buildResult();", rangeLength: 25, range: { start: { line: 25 } } }
    ]);
    strict_1.default.equal(large.large, true);
});
