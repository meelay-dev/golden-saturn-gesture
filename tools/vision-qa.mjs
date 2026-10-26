import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const report = { physicalWebcamTested: false, checks: [] };
try {
  for (const forceCpu of [false, true]) {
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      }),
      page = await context.newPage();
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext("2d");
        const draw = () => {
          ctx.fillStyle = "#292929";
          ctx.fillRect(0, 0, 640, 480);
          ctx.fillStyle = "#d9bb86";
          ctx.fillRect(Date.now() % 600, 200, 20, 20);
          requestAnimationFrame(draw);
        };
        draw();
        globalThis.__qaStream = canvas.captureStream(15);
        return globalThis.__qaStream;
      };
    });
    await page.goto("http://127.0.0.1:5500");
    await page.waitForFunction(
      () => !document.querySelector("#enable-camera").disabled,
    );
    if (forceCpu)
      await page.evaluate(async () => {
        const { VISION_BASE } = await import("./src/vision/camera.js");
        const { HandLandmarker } = await import(
          `${VISION_BASE}/vision_bundle.mjs`
        );
        const original = HandLandmarker.createFromOptions;
        HandLandmarker.createFromOptions = async function (files, options) {
          if (options.baseOptions.delegate === "GPU")
            throw new Error("QA forced GPU failure");
          return original.call(this, files, options);
        };
      });
    await page.click("#enable-camera");
    await page.waitForFunction(
      () =>
        document.querySelector("#mode").textContent === "LIVE" ||
        !document.querySelector("#notice").hidden,
      null,
      { timeout: 65000 },
    );
    assert.equal(
      await page.textContent("#mode"),
      "LIVE",
      await page.textContent("#notice-text"),
    );
    await page.waitForTimeout(1200);
    const result = await page.evaluate(() => ({
      delegate: document.querySelector("#delegate").textContent,
      hands: document.querySelector("#hands").textContent,
      video: [
        document.querySelector("#webcam").videoWidth,
        document.querySelector("#webcam").videoHeight,
      ],
      frameTime: document.querySelector("#webcam").currentTime,
    }));
    if (forceCpu) assert.equal(result.delegate, "CPU");
    assert.deepEqual(result.video, [640, 480]);
    assert.ok(result.frameTime > 0);
    await page.click("#stop");
    assert.equal(
      await page.evaluate(() =>
        __qaStream.getTracks().every((track) => track.readyState === "ended"),
      ),
      true,
    );
    report.checks.push({
      name: forceCpu
        ? "Forced GPU failure → real CPU model fallback"
        : "Real model initialization and synthetic video inference",
      ...result,
      tracksReleased: true,
    });
    console.log(JSON.stringify(report.checks.at(-1)));
    await context.close();
  }
} finally {
  await writeFile(
    "references/analysis/vision-qa.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
