"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SingleLineEditSignal = void 0;
class SingleLineEditSignal {
    constructor() {
        this.lastCursorLineByDoc = new Map();
        this.lastMajorJumpByDoc = new Map();
        this.pendingByDoc = new Map();
    }
    noteCursor(docKey, line, now) {
        const prevLine = this.lastCursorLineByDoc.get(docKey);
        this.lastCursorLineByDoc.set(docKey, line);
        const pending = this.pendingByDoc.get(docKey);
        if (pending && now - pending.at > SingleLineEditSignal.PENDING_MAX_AGE_MS) {
            this.pendingByDoc.delete(docKey);
        }
        if (prevLine === undefined) {
            return false;
        }
        const jumpDistance = Math.abs(line - prevLine);
        if (jumpDistance < SingleLineEditSignal.MAJOR_JUMP_MIN_LINES) {
            return false;
        }
        this.lastMajorJumpByDoc.set(docKey, { at: now, line });
        const stillPending = this.pendingByDoc.get(docKey);
        if (!stillPending) {
            return false;
        }
        if (line === stillPending.line) {
            return false;
        }
        if (now - stillPending.at > SingleLineEditSignal.PENDING_MAX_AGE_MS) {
            this.pendingByDoc.delete(docKey);
            return false;
        }
        this.pendingByDoc.delete(docKey);
        return true;
    }
    noteSingleLineEdit(docKey, line, now) {
        const majorJump = this.lastMajorJumpByDoc.get(docKey);
        if (!majorJump) {
            return;
        }
        if (now - majorJump.at > SingleLineEditSignal.PRE_JUMP_MAX_AGE_MS) {
            return;
        }
        this.pendingByDoc.set(docKey, { at: now, line });
    }
}
exports.SingleLineEditSignal = SingleLineEditSignal;
SingleLineEditSignal.MAJOR_JUMP_MIN_LINES = 3;
SingleLineEditSignal.PRE_JUMP_MAX_AGE_MS = 10_000;
SingleLineEditSignal.PENDING_MAX_AGE_MS = 12_000;
