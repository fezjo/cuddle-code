"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeScriptBank = initializeScriptBank;
exports.getScriptBankHealth = getScriptBankHealth;
exports.pickLine = pickLine;
exports.linesFor = linesFor;
exports.allScriptLines = allScriptLines;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const HEAD_ALIASES = {
    "long pause": "idleLong",
    "short idle": "idleShort",
    "medium idle": "idleLong",
    "long idle": "idleVeryLong",
    "extra long / gentle wake-up idle": "idleVeryLong",
    "short idle (1-4 seconds) - most common trigger": "idleShort",
    "medium idle (5-15 seconds)": "idleLong",
    "long idle (15-60+ seconds)": "idleVeryLong",
    "quick burst": "burstTyping",
    "sustained typing": "sustainedTyping",
    "long line": "longLine",
    refactor: "largeRefactor",
    "error appears": "errorAppears",
    "error fixed": "errorFixed",
    "file saved": "fileSaved",
    "code completed / function finished": "functionFinished",
    "git commit": "gitCommit",
    "tests passing": "testsPassing",
    "autocomplete accepted": "autocompleteAccepted",
    "adding comments": "addingComments",
    "deleting code": "deletingCode",
    "late night session": "lateNightSession",
    "switching files / tabs": "switchingFiles",
    "idle warning (very long pause)": "idleVeryLong",
    "typing burst (quick flurry of keystrokes)": "burstTyping",
    "sustained / steady typing (continuous flow)": "sustainedTyping",
    "short pause (a few seconds of silence - most common idle trigger)": "idleShort",
    "very short idle / hesitation (1-3 seconds)": "idleVeryShort",
    "single line edit / small change": "singleLineEdit",
    "backspace / delete (very frequent)": "deletingCode",
    "backspace / delete (very high frequency - needs lots of variety)": "deletingCode",
    "autocomplete / suggestion accepted (happens constantly)": "autocompleteAccepted",
    "quick save (ctrl/cmd + s - extremely frequent)": "fileSaved",
    "minor refactor / small cleanup (renaming variable, extracting tiny bit, etc.)": "largeRefactor",
    "cursor movement / navigation (arrow keys, mouse clicks, jumping around)": "cursorNavigation",
    "cursor movement / navigation": "cursorNavigation",
    "typing burst (sudden fast flurry)": "burstTyping",
    "format document / auto-format triggered": "formatDocument",
    "paste action": "pasteAction",
    "undo / redo": "undoRedo"
};
const DEFAULT_CANDIDATE_LINES_PATHS = [(0, node_path_1.resolve)(process.cwd(), "lines.md"), (0, node_path_1.resolve)(__dirname, "../lines.md")];
let scriptBank = fallbackScriptBank();
let unknownHeadings = [];
let parseFailure;
function initializeScriptBank(output, extensionRootPath) {
    const parsed = parseLinesFile(extensionRootPath);
    if (!parsed) {
        parseFailure = "lines.md missing or invalid; using fallback script bank";
        output.appendLine(`[CUDDLE] Script bank parse failed: ${parseFailure}`);
        return;
    }
    scriptBank = parsed.bank;
    unknownHeadings = parsed.unknownHeadings;
    parseFailure = undefined;
    output.appendLine(`[CUDDLE] Script bank loaded from lines.md: triggers=${Object.keys(scriptBank).length} unknownHeadings=${unknownHeadings.length}`);
    if (unknownHeadings.length > 0) {
        output.appendLine(`[CUDDLE] Unsupported headings in lines.md: ${unknownHeadings.join(", ")}`);
    }
}
function getScriptBankHealth() {
    return {
        parseFailure,
        unknownHeadings: [...unknownHeadings],
        mappedHeadingsCount: Object.keys(scriptBank).length
    };
}
function pickLine(trigger, persona) {
    const choices = linesFor(trigger, persona);
    return choices[Math.floor(Math.random() * choices.length)] ?? "Nice work.";
}
function linesFor(trigger, persona) {
    const direct = scriptBank[trigger][persona];
    if (direct.length > 0) {
        return direct;
    }
    const fallback = fallbackTriggerFor(trigger);
    const fallbackLines = scriptBank[fallback][persona];
    if (fallbackLines.length > 0) {
        return fallbackLines;
    }
    const opposite = persona === "female" ? "male" : "female";
    const oppositeLines = scriptBank[fallback][opposite];
    if (oppositeLines.length > 0) {
        return oppositeLines;
    }
    return ["Keep going, I like where this is heading."];
}
function allScriptLines() {
    const out = [];
    const personas = ["female", "male"];
    const triggers = Object.keys(scriptBank);
    for (const trigger of triggers) {
        for (const persona of personas) {
            for (const text of scriptBank[trigger][persona]) {
                out.push({ trigger, persona, text });
            }
        }
    }
    return out;
}
function parseLinesFile(extensionRootPath) {
    const candidateLinesPaths = [
        ...(extensionRootPath ? [(0, node_path_1.resolve)(extensionRootPath, "lines.md")] : []),
        ...DEFAULT_CANDIDATE_LINES_PATHS
    ];
    let raw = "";
    for (const path of candidateLinesPaths) {
        try {
            raw = (0, node_fs_1.readFileSync)(path, "utf8");
            if (raw.trim().length > 0) {
                break;
            }
        }
        catch {
            continue;
        }
    }
    if (!raw.trim()) {
        return undefined;
    }
    const normalizedRaw = raw.replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, "-");
    const lines = normalizedRaw.split(/\r?\n/);
    const bank = fallbackScriptBank();
    const unknown = new Set();
    let current;
    for (const line of lines) {
        const text = line.trim();
        if (!text) {
            continue;
        }
        if (text.startsWith("#")) {
            const heading = normalizeHeading(text.slice(1));
            const mapped = HEAD_ALIASES[heading];
            if (!mapped) {
                current = undefined;
                unknown.add(heading);
                continue;
            }
            current = mapped;
            continue;
        }
        if (!current) {
            continue;
        }
        const cleaned = sanitizeLine(text);
        if (!cleaned) {
            continue;
        }
        bank[current].female.push(cleaned);
        bank[current].male.push(cleaned);
    }
    for (const trigger of Object.keys(bank)) {
        bank[trigger].female = unique(bank[trigger].female);
        bank[trigger].male = unique(bank[trigger].male);
    }
    return { bank, unknownHeadings: [...unknown] };
}
function fallbackScriptBank() {
    return {
        idleVeryShort: { female: ["One little pause, then back to it."], male: ["One little pause, then back to it."] },
        idleShort: { female: ["Tiny pause accepted. Ready when you are."], male: ["Tiny pause accepted. Ready when you are."] },
        idleLong: { female: ["Quiet moment. Breathe in, then continue."], male: ["Quiet moment. Breathe in, then continue."] },
        idleVeryLong: {
            female: ["You have been quiet for a while. Come back when you are ready."],
            male: ["You have been quiet for a while. Come back when you are ready."]
        },
        burstTyping: { female: ["Fast fingers, clear intent."], male: ["Fast fingers, clear intent."] },
        sustainedTyping: { female: ["Steady rhythm. Beautiful focus."], male: ["Steady rhythm. Beautiful focus."] },
        longLine: { female: ["That long line had confidence."], male: ["That long line had confidence."] },
        minorRefactor: { female: ["Cleanups like that feel good."], male: ["Cleanups like that feel good."] },
        largeRefactor: { female: ["That was a serious refactor pass."], male: ["That was a serious refactor pass."] },
        errorAppears: { female: ["A red flag showed up. You can fix this."], male: ["A red flag showed up. You can fix this."] },
        errorFixed: { female: ["There it is, fixed and clean."], male: ["There it is, fixed and clean."] },
        fileSaved: { female: ["Saved. Work protected."], male: ["Saved. Work protected."] },
        functionFinished: { female: ["Function complete. Nicely done."], male: ["Function complete. Nicely done."] },
        gitCommit: { female: ["Commit complete. Nice discipline."], male: ["Commit complete. Nice discipline."] },
        testsPassing: { female: ["All tests passing. Gorgeous."], male: ["All tests passing. Gorgeous."] },
        autocompleteAccepted: { female: ["Good suggestion accepted."], male: ["Good suggestion accepted."] },
        addingComments: { female: ["Nice comment. Future you will smile."], male: ["Nice comment. Future you will smile."] },
        deletingCode: { female: ["You trimmed what did not belong."], male: ["You trimmed what did not belong."] },
        lateNightSession: { female: ["Late session focus. Proud of you."], male: ["Late session focus. Proud of you."] },
        switchingFiles: { female: ["Smooth file switch."], male: ["Smooth file switch."] },
        singleLineEdit: { female: ["Small change, sharp improvement."], male: ["Small change, sharp improvement."] },
        cursorNavigation: { female: ["Clean navigation."], male: ["Clean navigation."] },
        formatDocument: { female: ["Formatting made everything neat."], male: ["Formatting made everything neat."] },
        pasteAction: { female: ["Paste landed clean."], male: ["Paste landed clean."] },
        undoRedo: { female: ["Undo and redo, thoughtful iteration."], male: ["Undo and redo, thoughtful iteration."] },
        sandyMention: {
            female: ["I am here, keep going - you have got this."],
            male: ["I am here, keep going - you have got this."]
        }
    };
}
function fallbackTriggerFor(trigger) {
    switch (trigger) {
        case "idleVeryShort":
            return "idleShort";
        case "idleVeryLong":
            return "idleLong";
        case "singleLineEdit":
            return "minorRefactor";
        case "largeRefactor":
            return "minorRefactor";
        case "cursorNavigation":
            return "switchingFiles";
        default:
            return trigger;
    }
}
function sanitizeLine(text) {
    return text
        .replace(/^[-*]\s*/, "")
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/\s+/g, " ")
        .trim();
}
function normalizeHeading(text) {
    return text
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/["'`]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
function unique(values) {
    return [...new Set(values.map((x) => sanitizeLine(x)).filter(Boolean))];
}
