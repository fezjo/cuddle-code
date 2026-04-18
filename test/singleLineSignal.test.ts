import test from "node:test";
import assert from "node:assert/strict";
import { SingleLineEditSignal } from "../src/telemetry/singleLineSignal";

test("single line edit requires jump-edit-jump pattern", () => {
  const signal = new SingleLineEditSignal();
  const doc = "file:///a.ts";
  const t0 = 10_000;

  assert.equal(signal.noteCursor(doc, 10, t0), false);
  assert.equal(signal.noteCursor(doc, 20, t0 + 1_000), false);

  signal.noteSingleLineEdit(doc, 20, t0 + 1_500);

  assert.equal(signal.noteCursor(doc, 22, t0 + 2_000), false);
  assert.equal(signal.noteCursor(doc, 30, t0 + 2_500), true);
});

test("single line edit signal expires without second jump", () => {
  const signal = new SingleLineEditSignal();
  const doc = "file:///b.ts";
  const t0 = 20_000;

  signal.noteCursor(doc, 5, t0);
  signal.noteCursor(doc, 12, t0 + 500);
  signal.noteSingleLineEdit(doc, 12, t0 + 1_000);

  assert.equal(signal.noteCursor(doc, 16, t0 + 20_000), false);
});
