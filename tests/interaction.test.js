import test from "node:test";
import assert from "node:assert/strict";
import { Interaction } from "../src/core/interaction.js";
import { demoHands } from "../src/core/demo.js";
const h = (id, gesture, x = 0.5, y = 0.5) => ({
  id,
  gesture,
  palm: { x, y },
  anchor: { x: x + 0.02, y: y - 0.02 },
});

test("pinch anchors at thumb-index midpoint and ignores a passive second fist", () => {
  const s = new Interaction(),
    a = h(1, "PINCH", 0.3),
    b = h(2, "FIST", 0.8);
  const o = s.update([a, b], 0);
  assert.equal(o.state, "PINCH");
  assert.deepEqual(o.center, a.anchor);
  assert.equal(o.scale, 0.36);
  assert.equal(s.update([b, a], 0.04).state, "PINCH");
});
test("only a primed OPEN entry emits one burst for a sustained open palm", () => {
  const s = new Interaction();
  assert.equal(s.update([h(1, "OPEN")], 0).events.length, 0);
  s.update([h(1, "PINCH")], 0.1);
  assert.equal(s.update([h(1, "OPEN")], 0.2).events.length, 1);
  for (let i = 0; i < 100; i++)
    assert.equal(s.update([h(1, "OPEN")], 0.3 + i / 30).events.length, 0);
  s.update([h(1, "PINCH")], 4);
  assert.equal(s.update([h(1, "OPEN")], 4.1).events.length, 1);
});
test("an armed open hand can release beside another pinching hand", () => {
  const s = new Interaction();
  s.update([h(1, "PINCH"), h(2, "PINCH", 0.8)], 0);
  const o = s.update([h(2, "PINCH", 0.8), h(1, "OPEN")], 0.1);
  assert.equal(o.state, "OPEN");
  assert.equal(o.events.length, 1);
  assert.deepEqual(o.center, h(1, "OPEN").palm);
});
test("rapid rearming cannot create uncontrolled repeated flashes", () => {
  const s = new Interaction();
  s.update([h(1, "PINCH")], 0);
  assert.equal(s.update([h(1, "OPEN")], 0.1).events.length, 1);
  s.update([h(1, "PINCH")], 0.2);
  assert.equal(s.update([h(1, "OPEN")], 0.3).events.length, 0);
  assert.equal(s.update([h(1, "OPEN")], 1).events.length, 0);
  s.update([h(1, "PINCH")], 1.1);
  assert.equal(s.update([h(1, "OPEN")], 1.2).events.length, 1);
});
test("both engaged hands scale, center, and rotate the planet", () => {
  const s = new Interaction();
  const o = s.update([h(1, "PINCH", 0.3, 0.4), h(2, "PINCH", 0.7, 0.6)], 0);
  assert.equal(o.state, "TWO_HANDS");
  assert.deepEqual(o.center, { x: 0.5, y: 0.5 });
  assert.ok(o.scale > 0.7 && o.scale < 2.15);
  assert.ok(o.tilt > 0);
  assert.equal(s.update([h(1, "OPEN", 0), h(2, "OPEN", 1)], 0.1).scale, 2.15);
});
test("mixed open and pinch do not silently activate two-hand scaling", () => {
  const s = new Interaction();
  assert.notEqual(
    s.update([h(1, "OPEN"), h(2, "PINCH")], 0).state,
    "TWO_HANDS",
  );
});
test("fist collapses and disarms a previous pinch", () => {
  const s = new Interaction();
  s.update([h(1, "PINCH")], 0);
  const o = s.update([h(1, "FIST")], 0.1);
  assert.equal(o.opacity, 0);
  assert.equal(o.scale, 0);
  assert.equal(s.update([h(1, "OPEN")], 0.2).events.length, 0);
});
test("dropout holds briefly, fades, clears stale arming, and recovers", () => {
  const s = new Interaction();
  const before = s.update([h(1, "PINCH")], 0);
  const hold = s.update([], 0.15);
  assert.equal(hold.state, "HOLD");
  assert.deepEqual(hold.center, before.center);
  assert.equal(s.update([], 0.25).opacity, 0);
  assert.equal(s.state, "IDLE");
  s.update([], 1);
  assert.equal(s.update([h(1, "OPEN")], 1.1).events.length, 0);
  assert.equal(s.update([h(1, "PINCH")], 1.2).state, "PINCH");
});
test("a whole scripted cycle traverses all effect states and releases once", () => {
  const s = new Interaction(),
    states = new Set();
  let bursts = 0;
  for (let frame = 0; frame < 450; frame++) {
    const o = s.update(demoHands(frame / 30), frame / 30);
    states.add(o.state);
    bursts += o.events.length;
  }
  for (const state of ["PINCH", "OPEN", "TWO_HANDS", "FIST", "HOLD", "IDLE"])
    assert.ok(states.has(state), state);
  assert.equal(bursts, 1);
});
