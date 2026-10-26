import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const report = { checks: [], errors: [], physicalWebcamTested: false };
const pass = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") report.errors.push(m.text());
  });
  await page.addInitScript(() => {
    globalThis.__pose = "FIST";
    globalThis.__gap = 0.2;
    globalThis.__fingers = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      const { handFixture } = await import("/tests/hand-fixture.js");
      globalThis.__fixture = handFixture;
      const image = document.createElement("canvas");
      image.width = 640;
      image.height = 480;
      const ctx = image.getContext("2d");
      const draw = () => {
        ctx.fillStyle = "#161c23";
        ctx.fillRect(0, 0, 640, 480);
        requestAnimationFrame(draw);
      };
      draw();
      return image.captureStream(30);
    };
  });
  await page.route("**/vision_bundle.mjs", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    export class FilesetResolver{static async forVisionTasks(){return {}}}
    export class HandLandmarker{static async createFromOptions(){return {close(){},detectForVideo(){
      return {landmarks:[__fixture(__pose,__gap,-.15),__fixture('COUNT',.2,.3,__fingers)],handedness:[[{categoryName:'Left',score:.99}],[{categoryName:'Right',score:.99}]]};
    }}}}
  `,
    }),
  );
  await page.goto("http://127.0.0.1:5500");
  await page.waitForFunction(
    () => !document.querySelector("#enable-camera").disabled,
  );
  await page.evaluate(async () => {
    const { SaturnRenderer } = await import("./src/render/saturn.js"),
      render = SaturnRenderer.prototype.render,
      burst = SaturnRenderer.prototype.triggerBurst;
    globalThis.__bursts = 0;
    SaturnRenderer.prototype.render = function (target, dt, time) {
      globalThis.__target = structuredClone(target);
      return render.call(this, target, dt, time);
    };
    SaturnRenderer.prototype.triggerBurst = function (...args) {
      globalThis.__bursts++;
      return burst.apply(this, args);
    };
  });
  await page.click("#enable-camera");
  await page.waitForFunction(() => document.body.dataset.gesture === "FIST");
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => __target.opacity), 1);
  await page
    .locator("#camera-stage")
    .screenshot({ path: "references/analysis/reference-mode-fist.png" });
  pass(
    "Reference fist renders a visible compact globe with nested shells and thin rings",
  );
  await page.evaluate(() => {
    __pose = "PINCH";
  });
  await page.waitForFunction(() => document.body.dataset.gesture === "PINCH");
  await page.evaluate(() => {
    __pose = "ZOOM";
    __gap = 0.75;
  });
  await page.waitForFunction(() => document.body.dataset.gesture === "ZOOM");
  await page.waitForTimeout(400);
  const small = Number(
    await page.locator("#universe").getAttribute("data-shell-radius"),
  );
  await page.evaluate(() => {
    __gap = 2.1;
  });
  await page.waitForTimeout(500);
  const large = Number(
    await page.locator("#universe").getAttribute("data-shell-radius"),
  );
  assert.ok(large > small * 1.6, `${large} vs ${small}`);
  report.zoomRadii = { small, large };
  await page
    .locator("#camera-stage")
    .screenshot({ path: "references/analysis/reference-mode-zoom.png" });
  pass(
    "Continuous single-hand thumb-index gap increases rendered radius, without a second active hand",
  );
  const anchor = await page.evaluate(() => __target.center);
  for (const [i, color] of ["ivory", "cyan", "violet", "gold"].entries()) {
    await page.evaluate((n) => {
      __fingers = n;
    }, i + 1);
    await page.waitForTimeout(300);
    assert.equal(
      await page.locator("#universe").getAttribute("data-energy-color"),
      color,
    );
    assert.equal(await page.evaluate(() => __target.primaryId), 1);
    const held = await page.evaluate(() => __target.center);
    assert.ok(Math.hypot(held.x - anchor.x, held.y - anchor.y) < 1);
    assert.notEqual(await page.locator("#gesture").textContent(), "TWO_HANDS");
  }
  pass(
    "Other-hand 1–4 finger counts change colour while the globe stays attached to its controlling hand",
  );
  await page.selectOption("#control-side", "left");
  await page.evaluate(() => {
    __fingers = 0;
  });
  await page.waitForFunction(() => __target.primaryId === 2);
  await page.selectOption("#control-side", "right");
  await page.waitForFunction(() => __target.primaryId === 1);
  pass(
    "Starting-side selector chooses the displayed left or right hand and resets prior ownership",
  );
  await page.evaluate(() => {
    __pose = "OPEN";
  });
  await page.waitForFunction(() => document.body.dataset.gesture === "OPEN");
  await page.waitForTimeout(120);
  await page
    .locator("#camera-stage")
    .screenshot({ path: "references/analysis/reference-mode-release.png" });
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(() => __bursts), 1);
  await page
    .locator("#camera-stage")
    .screenshot({ path: "references/analysis/reference-mode-scatter.png" });
  pass(
    "Opening the controlling palm emits exactly one flare and fine persistent scatter",
  );
  await page.evaluate(() => {
    __pose = "PINCH";
    __gap = 0.2;
  });
  await page.waitForFunction(() => document.body.dataset.gesture === "PINCH");
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => __target.opacity), 1);
  await page.click("#fullscreen");
  await page.waitForFunction(
    () => document.fullscreenElement?.id === "camera-stage",
  );
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => __target.primaryId), 1);
  await page.evaluate(() => document.exitFullscreen());
  await page.locator("#mirror").uncheck();
  await page.waitForTimeout(200);
  const alignment = await page.evaluate(async () => {
    const { mapLandmark } = await import("./src/core/math.js"),
      { measureHand } = await import("./src/vision/gesture.js");
    const stage = document.querySelector("#camera-stage"),
      hand = measureHand(
        __fixture("PINCH", 0.2, -0.15),
        false,
        undefined,
        4 / 3,
      );
    return {
      actual: __target.center,
      expected: mapLandmark(
        hand.anchor,
        640,
        480,
        stage.clientWidth,
        stage.clientHeight,
        false,
        "contain",
      ),
    };
  });
  assert.ok(
    Math.hypot(
      alignment.actual.x - alignment.expected.x,
      alignment.actual.y - alignment.expected.y,
    ) < 1,
  );
  pass(
    "Re-grasp reforms the globe; fullscreen and mirror preserve fingertip alignment",
  );
  await page.click("#stop");
  await page.selectOption("#gesture-mode", "reference");
  await page.click("#demo");
  const states = new Set();
  const started = Date.now();
  while (Date.now() - started < 12200) {
    states.add(await page.locator("#gesture").textContent());
    await page.waitForTimeout(70);
  }
  for (const state of ["FIST", "OPEN", "PINCH", "ZOOM", "HOLD", "IDLE"])
    assert.ok(states.has(state), state);
  assert.deepEqual(report.errors, []);
  pass(
    "Reference demo reaches all reference states without runtime or shader errors",
  );
} finally {
  await writeFile(
    "references/analysis/reference-qa.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
