import test from "node:test";
import assert from "node:assert/strict";
import { FaceTracker, irisGeometry, EYE_CONFIG } from "../src/core/face.js";
import { mapLandmark } from "../src/core/math.js";
import { faceFixture } from "./face-fixture.js";
const map = (p) => ({ x: p.x * 640, y: p.y * 480 });
test("478-point face projection supplies two iris ellipses with visible open eyes", () => {
  const tracker = new FaceTracker();
  assert.ok(tracker.update(faceFixture(), 0));
  const face = tracker.project(map, 0.01);
  assert.ok(face);
  assert.equal(face.eyes.length, 2);
  assert.ok(Math.abs(face.eyes[0].center.x - 270) < 1e-8);
  assert.ok(face.eyes.every((e) => e.visible > 0.99));
});
test("blinks suppress recolouring immediately rather than smoothing eye colour over closed lids", () => {
  const tracker = new FaceTracker();
  tracker.update(faceFixture(), 0);
  tracker.update(faceFixture({ blink: 1 }), 0.04);
  assert.ok(tracker.project(map, 0.04).eyes.every((e) => e.visible === 0));
});
test("closed lid geometry and degenerate iris fits are rejected", () => {
  const points = faceFixture().faceLandmarks[0].map(map),
    config = EYE_CONFIG[0];
  points[config.lids[0]] = { ...points[config.lids[1]] };
  assert.equal(irisGeometry(points, config).visible, 0);
  points[config.rim[0]] = { ...points[config.rim[2]] };
  assert.equal(irisGeometry(points, config).visible, 0);
});
test("face loss or stale camera frames remove all masks without a frozen iris", () => {
  const tracker = new FaceTracker();
  tracker.update(faceFixture(), 0);
  assert.equal(tracker.project(map, 0.17), null);
  tracker.update(faceFixture(), 0.2);
  tracker.update({ faceLandmarks: [] }, 0.21);
  assert.equal(tracker.project(map, 0.21), null);
});
test("invalid, missing, or non-finite face landmarks are ignored", () => {
  const tracker = new FaceTracker();
  assert.equal(tracker.update({ faceLandmarks: [[]] }, 0), false);
  const result = faceFixture();
  result.faceLandmarks[0][468].x = NaN;
  assert.equal(tracker.update(result, 0.1), false);
});
test("iris projection honors camera cover crop, mirror, and screen resizing", () => {
  const tracker = new FaceTracker();
  tracker.update(faceFixture(), 0);
  for (const [width, height] of [
    [1280, 580],
    [360, 420],
  ])
    for (const mirror of [true, false]) {
      const mapped = (p) => mapLandmark(p, 640, 480, width, height, mirror);
      const face = tracker.project(mapped, 0.01),
        expected = mapped(faceFixture().faceLandmarks[0][468]);
      assert.ok(Math.abs(face.eyes[0].center.x - expected.x) < 1e-8);
      assert.ok(Math.abs(face.eyes[0].center.y - expected.y) < 1e-8);
    }
});
test("large head translations reacquire without interpolating masks through empty space", () => {
  const tracker = new FaceTracker();
  tracker.update(faceFixture(), 0);
  tracker.update(faceFixture({ x: 120 }), 0.03);
  assert.ok(Math.abs(tracker.project(map, 0.03).eyes[0].center.x - 390) < 1e-8);
});
