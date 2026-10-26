import test from "node:test";
import assert from "node:assert/strict";
import { ReferenceInteraction } from "../src/core/interaction.js";
import { referenceDemoHands } from "../src/core/demo.js";
const h = (id, gesture, pinch = 0.2) => ({
  id,
  gesture,
  pinch,
  palmSize: 0.18,
  roll: 0.1,
  palm: { x: id === 1 ? 0.3 : 0.8, y: 0.6 },
  anchor: { x: id === 1 ? 0.3 : 0.8, y: 0.4 },
  gripAnchor: { x: id === 1 ? 0.3 : 0.8, y: 0.35 },
});

test("reference fist summons a visible nested globe above the controlling knuckles", () => {
  const s = new ReferenceInteraction(),
    hand = h(1, "FIST"),
    o = s.update([hand, h(2, "FIST")], 0);
  assert.equal(o.state, "FIST");
  assert.equal(o.opacity, 1);
  assert.equal(o.ringVisibility, 1);
  assert.deepEqual(o.center, hand.gripAnchor);
  assert.equal(o.primaryId, 1);
  assert.ok(o.handRadius > 0);
});
test("one controlling thumb-index gap continuously expands and shrinks the globe without a second hand", () => {
  const s = new ReferenceInteraction();
  const small = s.update([h(1, "PINCH", 0.2)], 0),
    medium = s.update([h(1, "ZOOM", 1.1)], 0.1),
    large = s.update([h(1, "ZOOM", 2.2)], 0.2);
  assert.ok(small.scale < medium.scale && medium.scale < large.scale);
  assert.ok(large.scale / small.scale > 3.5);
  assert.deepEqual(large.center, h(1, "ZOOM").anchor);
  assert.equal(large.state, "ZOOM");
  assert.ok(s.update([h(1, "PINCH", 0.2)], 0.3).scale < 1);
});
test("second-hand gestures and result order never move a reference globe to the face or trigger two-hand scaling", () => {
  const s = new ReferenceInteraction();
  s.update([h(1, "PINCH"), h(2, "FIST")], 0);
  for (const gesture of ["OPEN", "PINCH", "ZOOM", "FIST"]) {
    const other = { ...h(2, gesture), fingerCount: 2 };
    const o = s.update([other, h(1, "PINCH")], 0.1);
    assert.equal(o.primaryId, 1);
    assert.deepEqual(o.center, h(1, "PINCH").anchor);
    assert.equal(o.color, "cyan");
    assert.equal(o.state, "PINCH");
  }
});
test("one to four secondary fingers change palette and zero fingers retains the chosen colour", () => {
  const s = new ReferenceInteraction();
  s.update([h(1, "PINCH")], 0);
  for (const [i, color] of ["ivory", "cyan", "violet", "gold"].entries()) {
    const o = s.update(
      [h(1, "PINCH"), { ...h(2, "OPEN"), fingerCount: i + 1 }],
      0.1 + i * 0.1,
    );
    assert.equal(o.color, color);
  }
  assert.equal(
    s.update([h(1, "PINCH"), { ...h(2, "FIST"), fingerCount: 0 }], 0.6).color,
    "gold",
  );
});
test("explicit screen-side acquisition respects mirroring, ignores the other side and keeps the chosen ID after crossing", () => {
  for (const mirror of [true, false]) {
    const s = new ReferenceInteraction(),
      left = { ...h(1, "FIST"), palm: { x: mirror ? 0.8 : 0.2, y: 0.5 } },
      right = { ...h(2, "FIST"), palm: { x: mirror ? 0.2 : 0.8, y: 0.5 } };
    assert.equal(s.update([right], 0, { side: "left", mirror }).state, "IDLE");
    assert.equal(
      s.update([right, left], 0.1, { side: "left", mirror }).primaryId,
      1,
    );
    assert.equal(
      s.update([{ ...left, palm: right.palm }, right], 0.2, {
        side: "left",
        mirror,
      }).primaryId,
      1,
    );
  }
});
test("fist or pinch arms exactly one open-palm release, which does not repeat while open", () => {
  for (const gesture of ["FIST", "PINCH", "ZOOM"]) {
    const s = new ReferenceInteraction();
    assert.equal(s.update([h(1, "OPEN")], 0).events.length, 0);
    s.update([h(1, gesture)], 0.1);
    const open = s.update([h(1, "OPEN")], 0.2);
    assert.equal(open.events.length, 1);
    assert.equal(open.opacity, 0);
    assert.ok(open.palmGlow > 0);
    for (let i = 0; i < 90; i++)
      assert.equal(s.update([h(1, "OPEN")], 0.3 + i / 30).events.length, 0);
  }
});
test("brief primary dropout holds ownership; a passive other hand cannot steal it or emit stale releases", () => {
  const s = new ReferenceInteraction();
  const before = s.update([h(1, "PINCH"), h(2, "OPEN")], 0);
  const hold = s.update([h(2, "OPEN")], 0.15);
  assert.equal(hold.state, "HOLD");
  assert.deepEqual(hold.center, before.center);
  assert.equal(s.update([h(1, "OPEN"), h(2, "OPEN")], 1).events.length, 0);
  assert.equal(s.update([], 1.3).opacity, 0);
});
test("reference demo follows compact globe, single release, reformation, single-hand zoom and fade", () => {
  const s = new ReferenceInteraction(),
    states = new Set();
  let releases = 0,
    maxScale = 0;
  for (let f = 0; f < 360; f++) {
    const o = s.update(referenceDemoHands(f / 30), f / 30);
    states.add(o.state);
    releases += o.events.length;
    maxScale = Math.max(maxScale, o.scale);
  }
  for (const state of ["FIST", "OPEN", "PINCH", "ZOOM", "HOLD", "IDLE"])
    assert.ok(states.has(state), state);
  assert.equal(releases, 1);
  assert.ok(maxScale > 3);
});
