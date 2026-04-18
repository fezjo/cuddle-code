"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeChanges = summarizeChanges;
exports.detectCommentInsertion = detectCommentInsertion;
exports.detectSandyMention = detectSandyMention;
exports.commentPrefixesFor = commentPrefixesFor;
exports.detectRefactorishRenaming = detectRefactorishRenaming;
exports.detectDiagnosticTransitions = detectDiagnosticTransitions;
exports.detectRefactorSignal = detectRefactorSignal;
function summarizeChanges(changes) {
    let insertedChars = 0;
    let deletedChars = 0;
    let hasPaste = false;
    let hasLineBreak = false;
    let onlyDeletes = true;
    let singleLine = -1;
    const touchedLines = new Set();
    for (const change of changes) {
        insertedChars += change.text.length;
        deletedChars += change.rangeLength;
        touchedLines.add(change.range.start.line);
        const newlineCount = countNewlines(change.text);
        if (newlineCount > 0) {
            hasLineBreak = true;
        }
        const looksLikeLargeMultilineInsert = newlineCount >= 2 || (newlineCount >= 1 && change.text.length >= 20);
        if (change.text.length > 35 || looksLikeLargeMultilineInsert) {
            hasPaste = true;
        }
        if (change.text.length > 0) {
            onlyDeletes = false;
        }
        if (singleLine === -1) {
            singleLine = change.range.start.line;
        }
        else if (singleLine !== change.range.start.line) {
            singleLine = -2;
        }
    }
    const singleChange = changes.length === 1 ? changes[0] : undefined;
    const insertedText = singleChange?.text ?? "";
    const insertedLineCount = insertedText.length === 0 ? 0 : insertedText.split(/\r?\n/).length;
    const isLikelyCodeShape = /(\bconst\b|\blet\b|\bvar\b|\breturn\b|=>|\bfunction\b|\bdef\b|\bfn\b|\bclass\b|\bif\b|\bfor\b|\bwhile\b|\{|\}|\()/
        .test(insertedText) || insertedText.includes(";");
    const looksLikeAutocomplete = singleChange !== undefined &&
        singleChange.rangeLength <= 120 &&
        insertedText.length >= 24 &&
        insertedText.length <= 2200 &&
        insertedLineCount >= 1 &&
        insertedLineCount <= 20 &&
        isLikelyCodeShape;
    if (looksLikeAutocomplete) {
        hasPaste = false;
    }
    const looksLikeFormat = changes.length >= 3 && insertedChars > 40 && deletedChars > 20 && changes.some((c) => c.text.includes("\n"));
    return {
        hasPaste,
        insertedChars,
        deletedChars,
        onlyDeletes: deletedChars > 0 && onlyDeletes,
        isSingleLineEdit: changes.length > 0 &&
            singleLine >= 0 &&
            !hasLineBreak &&
            !onlyDeletes &&
            insertedChars + deletedChars > 0 &&
            insertedChars + deletedChars <= 24,
        singleLine: singleLine >= 0 ? singleLine : 0,
        looksLikeAutocomplete,
        looksLikeFormat,
        touchedLines: touchedLines.size
    };
}
function countNewlines(text) {
    const lf = text.match(/\n/g)?.length ?? 0;
    const cr = text.match(/\r/g)?.length ?? 0;
    return Math.max(lf, cr);
}
function detectCommentInsertion(event, languageId) {
    const prefixes = commentPrefixesFor(languageId);
    if (prefixes.length === 0) {
        return false;
    }
    return event.contentChanges.some((change) => {
        const text = change.text.trimStart();
        return prefixes.some((p) => text.startsWith(p));
    });
}
function detectSandyMention(event, languageId) {
    const prefixes = commentPrefixesFor(languageId);
    if (prefixes.length === 0) {
        return undefined;
    }
    for (const change of event.contentChanges) {
        const text = change.text.trim();
        if (!text) {
            continue;
        }
        const looksLikeComment = prefixes.some((p) => text.startsWith(p)) || text.includes("/*") || text.includes("*/");
        if (looksLikeComment && /\bsandy\b/i.test(text)) {
            return text;
        }
    }
    return undefined;
}
function commentPrefixesFor(languageId) {
    switch (languageId) {
        case "python":
            return ["#"];
        case "cpp":
        case "c":
        case "rust":
            return ["//", "///", "/*", "*"];
        default:
            return [];
    }
}
function detectRefactorishRenaming(lineText, lineNumber, now, key, state) {
    const prev = state.get(key);
    state.set(key, { line: lineNumber, text: lineText, at: now });
    if (!prev) {
        return false;
    }
    if (now - prev.at > 9000 || prev.line !== lineNumber) {
        return false;
    }
    const beforeTokens = tokenSet(prev.text);
    const afterTokens = tokenSet(lineText);
    let removed = 0;
    let added = 0;
    for (const t of beforeTokens) {
        if (!afterTokens.has(t)) {
            removed += 1;
        }
    }
    for (const t of afterTokens) {
        if (!beforeTokens.has(t)) {
            added += 1;
        }
    }
    return removed === 1 && added === 1;
}
function detectDiagnosticTransitions(entries, state) {
    let appears = false;
    let fixed = false;
    for (const entry of entries) {
        const hadError = state.get(entry.key) ?? false;
        state.set(entry.key, entry.hasError);
        if (!hadError && entry.hasError) {
            appears = true;
            continue;
        }
        if (hadError && !entry.hasError) {
            fixed = true;
        }
    }
    return { appears, fixed };
}
function detectRefactorSignal(changes) {
    if (changes.length === 0) {
        return { minor: false, large: false, touchedLines: 0 };
    }
    let insertedChars = 0;
    let deletedChars = 0;
    let functionLikeAdds = 0;
    const lines = new Set();
    for (const change of changes) {
        insertedChars += change.text.length;
        deletedChars += change.rangeLength;
        lines.add(change.range.start.line);
        if (/(\bfunction\b|\bdef\s+\w+|\bfn\s+\w+|=>)/.test(change.text)) {
            functionLikeAdds += 1;
        }
    }
    const touchedLines = lines.size;
    const totalDelta = insertedChars + deletedChars;
    const large = (touchedLines >= 5 && totalDelta >= 140) ||
        (touchedLines >= 3 && totalDelta >= 90 && functionLikeAdds > 0) ||
        (changes.length >= 8 && totalDelta >= 110);
    const minor = !large && touchedLines >= 2 && totalDelta >= 40 && changes.length >= 2;
    return { minor, large, touchedLines };
}
function tokenSet(line) {
    return new Set((line.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).filter((x) => x.length > 1));
}
