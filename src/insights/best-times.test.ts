import { test } from "node:test";
import assert from "node:assert/strict";
import { baseline, estimateSlot, recommend } from "./best-times";
import { slotOf } from "./time";

test("no posts → benchmark", () => {
  const e = estimateSlot(1.2, []);
  assert.equal(e.multiplier, 1.2);
  assert.equal(e.source, "benchmark");
  assert.equal(e.confidence, "Low");
});

test("one viral post doesn't take over", () => {
  const e = estimateSlot(1.0, [10]);
  assert.ok(e.multiplier < 1.5, `expected shrinkage, got ${e.multiplier}`);
});

test("lots of consistent posts → your data wins", () => {
  const e = estimateSlot(1.0, Array(30).fill(2));
  assert.ok(e.multiplier > 1.8);
  assert.equal(e.confidence, "High");
  assert.equal(e.source, "mine");
});

test("baseline is the median", () => {
  assert.equal(baseline([100, 200, 10_000]), 200);
  assert.equal(baseline([]), null);
});

test("recommend picks the best when not exploring", () => {
  const r = recommend(
    [
      { slot: "a", multiplier: 1.1, n: 10, confidence: "High", source: "mine" },
      { slot: "b", multiplier: 1.4, n: 10, confidence: "High", source: "mine" },
    ],
    () => 0.99,
  );
  assert.equal(r.slot, "b");
  assert.equal(r.testing, false);
});

test("slots", () => {
  assert.equal(slotOf(2, 19), "tue-18-21");
  assert.equal(slotOf(0, 3), "sun-00-06");
});
