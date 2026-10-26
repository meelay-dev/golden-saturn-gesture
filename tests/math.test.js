import test from "node:test";
import assert from "node:assert/strict";
import {
  mapLandmark,
  coverTransform,
  containTransform,
  damp,
  angleDelta,
  AnchorFilter,
} from "../src/core/math.js";

test("contain shows a complete 4:3 camera in a 16:9 preview with centered side bars", () => {
  assert.deepEqual(containTransform(640, 480, 1280, 720), {
    scale: 1.5,
    offsetX: 160,
    offsetY: 0,
  });
  assert.deepEqual(
    mapLandmark({ x: 0, y: 0 }, 640, 480, 1280, 720, false, "contain"),
    { x: 160, y: 0, z: 0 },
  );
  assert.deepEqual(
    mapLandmark({ x: 1, y: 1 }, 640, 480, 1280, 720, true, "contain"),
    { x: 160, y: 720, z: 0 },
  );
});
test("contain preserves 720p dimensions at native size and tracks portrait fullscreen without cropping", () => {
  assert.deepEqual(containTransform(1280, 720, 1280, 720), {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  assert.deepEqual(containTransform(1280, 720, 360, 800), {
    scale: 0.28125,
    offsetX: 0,
    offsetY: 298.75,
  });
  assert.deepEqual(
    mapLandmark({ x: 0.25, y: 1 }, 1280, 720, 360, 800, true, "contain"),
    { x: 270, y: 501.25, z: 0 },
  );
});

test("cover mapping crops 4:3 source correctly in a wide viewport", () => {
  assert.deepEqual(coverTransform(640, 480, 1280, 720), {
    scale: 2,
    offsetX: 0,
    offsetY: -120,
  });
  assert.deepEqual(mapLandmark({ x: 0.25, y: 0.5 }, 640, 480, 1280, 720), {
    x: 960,
    y: 360,
    z: 0,
  });
});
test("portrait cover crops a 16:9 source horizontally and mirrors AFTER crop", () => {
  const p = mapLandmark(
    { x: 0.6, y: 0.4, z: -0.1 },
    1920,
    1080,
    400,
    800,
    false,
  );
  assert.ok(Math.abs(p.x - 342.222222) < 0.001);
  assert.equal(p.y, 320);
  const mirrored = mapLandmark({ x: 0.6, y: 0.4 }, 1920, 1080, 400, 800, true);
  assert.ok(Math.abs(mirrored.x - (400 - p.x)) < 1e-8);
});
test("mapping centers remain exact through resize and both aspect ratios", () => {
  for (const [vw, vh] of [
    [1280, 720],
    [640, 480],
  ])
    for (const [w, h] of [
      [1500, 800],
      [390, 844],
    ]) {
      const p = mapLandmark({ x: 0.5, y: 0.5 }, vw, vh, w, h);
      assert.ok(Math.abs(p.x - w / 2) < 1e-8);
      assert.ok(Math.abs(p.y - h / 2) < 1e-8);
    }
});
test("time based damping gives the same result at 30 and 120 FPS", () => {
  const run = (fps) => {
    let x = 0;
    for (let i = 0; i < fps; i++) x = damp(x, 1, 7, 1 / fps);
    return x;
  };
  assert.ok(Math.abs(run(30) - run(120)) < 1e-12);
});
test("anchor filter resets and responds quickly without overshoot", () => {
  const f = new AnchorFilter();
  assert.deepEqual(f.update({ x: 30, y: 50 }, 1 / 60), { x: 30, y: 50 });
  const p = f.update({ x: 300, y: 50 }, 1 / 30);
  assert.ok(p.x > 250 && p.x < 300);
  f.reset();
  assert.deepEqual(f.update({ x: 0, y: 0 }, 1 / 60), { x: 0, y: 0 });
});
test("rotation takes the short path across the PI boundary", () => {
  assert.ok(Math.abs(angleDelta(Math.PI - 0.1, -Math.PI + 0.1) - 0.2) < 1e-9);
});
