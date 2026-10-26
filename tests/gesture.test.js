import test from "node:test";
import assert from "node:assert/strict";
import { measureHand, HandTracker } from "../src/vision/gesture.js";

function hand(gesture, shift = 0) {
  const p = Array.from({ length: 21 }, () => ({
    x: 0.5 + shift,
    y: 0.7,
    z: 0,
  }));
  p[0] = { x: 0.5 + shift, y: 0.9, z: 0 };
  for (const [m, pip, dip, tip, x] of [
    [5, 6, 7, 8, 0.39],
    [9, 10, 11, 12, 0.48],
    [13, 14, 15, 16, 0.57],
    [17, 18, 19, 20, 0.66],
  ]) {
    p[m] = { x: x + shift, y: 0.68, z: 0 };
    p[pip] = { x: x + shift, y: 0.48, z: 0 };
    p[dip] = { x: x + shift, y: 0.35, z: 0 };
    p[tip] = { x: x + shift, y: gesture === "FIST" ? 0.77 : 0.22, z: 0 };
  }
  p[4] = {
    x: gesture === "PINCH" ? p[8].x + 0.03 : 0.15 + shift,
    y: gesture === "PINCH" ? 0.23 : 0.65,
    z: 0,
  };
  return p;
}
const result = (...entries) => ({
  landmarks: entries.map((e) => hand(e.gesture, e.x)),
  handedness: entries.map((e) => [
    { categoryName: e.label ?? "Left", score: 0.9 },
  ]),
});
test("geometry distinguishes open palm, fist, and normalized pinch", () => {
  for (const gesture of ["OPEN", "FIST", "PINCH"])
    assert.equal(measureHand(hand(gesture)).gesture, gesture);
});
test("pinch ratio is invariant under translation and hand scale", () => {
  const p = hand("PINCH");
  const q = p.map((v) => ({ x: v.x * 0.2 + 0.1, y: v.y * 0.2 + 0.3, z: 0 }));
  assert.ok(Math.abs(measureHand(p).pinch - measureHand(q).pinch) < 1e-10);
});
test("pinch hysteresis keeps a held pinch between enter and exit thresholds", () => {
  const p = hand("PINCH"),
    palm = Math.hypot(p[0].x - p[9].x, p[0].y - p[9].y);
  p[4] = { x: p[8].x + palm * 0.46, y: p[8].y, z: 0 };
  assert.equal(measureHand(p, true).gesture, "PINCH");
  assert.notEqual(measureHand(p, false).gesture, "PINCH");
});
test("a gesture requires three distinct inference updates", () => {
  const t = new HandTracker();
  const input = result({ gesture: "PINCH", x: 0 });
  assert.equal(t.update(input, 0)[0].gesture, "TRACK");
  assert.equal(t.update(input, 0.03)[0].gesture, "TRACK");
  assert.equal(t.update(input, 0.06)[0].gesture, "PINCH");
});
test("hand identities survive result-array swaps, weak handedness flips, and short dropout", () => {
  const t = new HandTracker();
  const initial = t.update(
    result(
      { gesture: "OPEN", x: -0.2, label: "Left" },
      { gesture: "FIST", x: 0.2, label: "Right" },
    ),
    0,
  );
  const swapped = t.update(
    result(
      { gesture: "FIST", x: 0.19, label: "Left" },
      { gesture: "OPEN", x: -0.19, label: "Right" },
    ),
    0.04,
  );
  assert.equal(swapped[0].id, initial[1].id);
  assert.equal(swapped[1].id, initial[0].id);
  t.update({ landmarks: [] }, 0.1);
  const returned = t.update(result({ gesture: "OPEN", x: -0.18 }), 0.25);
  assert.equal(returned[0].id, initial[0].id);
});
test("expired tracking identities are not reused", () => {
  const t = new HandTracker(),
    input = result({ gesture: "PINCH", x: 0 });
  const id = t.update(input, 0)[0].id;
  assert.notEqual(t.update(input, 1)[0].id, id);
});

test("thumb-index L pose is zoom instead of a fist, with metric distances independent of image aspect", () => {
  const p = hand("FIST");
  p[8] = { ...p[8], y: 0.22 };
  const a = measureHand(p);
  assert.equal(a.gesture, "ZOOM");
  assert.equal(a.extendedCount, 1);
  const wide = p.map((v) => ({ ...v, x: v.x / 2, z: (v.z ?? 0) / 2 }));
  const b = measureHand(wide, false, undefined, 2);
  assert.equal(b.gesture, "ZOOM");
  assert.ok(Math.abs(a.pinch - b.pinch) < 1e-9);
});
test("secondary finger count requires distinct inference updates before changing colour controls", () => {
  const t = new HandTracker(),
    input = result({ gesture: "OPEN", x: 0 });
  assert.equal(t.update(input, 0)[0].fingerCount, 0);
  assert.equal(t.update(input, 0.03)[0].fingerCount, 0);
  assert.equal(t.update(input, 0.06)[0].fingerCount, 4);
  const changed = result({ gesture: "FIST", x: 0 });
  assert.equal(t.update(changed, 0.09)[0].fingerCount, 4);
  t.update(changed, 0.12);
  assert.equal(t.update(changed, 0.15)[0].fingerCount, 0);
});
test("malformed landmark arrays do not crash hand classification", () => {
  const t = new HandTracker();
  assert.deepEqual(t.update({ landmarks: [[], [{ x: NaN, y: 0 }]] }, 0), []);
});
