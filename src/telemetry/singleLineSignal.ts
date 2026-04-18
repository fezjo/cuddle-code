export class SingleLineEditSignal {
  private static readonly MAJOR_JUMP_MIN_LINES = 3;
  private static readonly PRE_JUMP_MAX_AGE_MS = 10_000;
  private static readonly PENDING_MAX_AGE_MS = 12_000;

  private readonly lastCursorLineByDoc = new Map<string, number>();
  private readonly lastMajorJumpByDoc = new Map<string, { at: number; line: number }>();
  private readonly pendingByDoc = new Map<string, { at: number; line: number }>();

  public noteCursor(docKey: string, line: number, now: number): boolean {
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

  public noteSingleLineEdit(docKey: string, line: number, now: number): void {
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
