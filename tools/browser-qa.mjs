// Optional developer QA. Supply a playwright-core installation path as argv[2].
// Uses installed Chrome; deliberately synthetic camera streams never access hardware.
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const base = "http://127.0.0.1:5500",
  report = {
    checks: [],
    consoleErrors: [],
    performance: {},
    physicalWebcamTested: false,
  };
function passed(name) {
  report.checks.push(name);
  console.log(`PASS ${name}`);
}
async function ready(page) {
  await page.goto(base);
  await page.locator("#demo").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("#demo").disabled);
}
async function settingsBelowCamera(page) {
  const placement = await page.evaluate(() => {
    const stage = document.querySelector("#camera-stage");
    const bottom = stage.getBoundingClientRect().bottom;
    const controls = [
      ...document.querySelectorAll(
        "button:not(#dismiss-notice), input, select, .statusbar",
      ),
    ];
    return {
      inside: stage.querySelectorAll("button,input,select").length,
      overlaps: controls
        .filter((el) => el.getBoundingClientRect().top < bottom - 1)
        .map((el) => el.id || el.className),
      stage: [stage.clientWidth, stage.clientHeight],
      canvas: [
        document.querySelector("#universe").clientWidth,
        document.querySelector("#universe").clientHeight,
      ],
    };
  });
  assert.equal(placement.inside, 0);
  assert.deepEqual(placement.overlaps, []);
  assert.deepEqual(placement.canvas, placement.stage);
  assert.ok(Math.abs(placement.stage[0] / placement.stage[1] - 16 / 9) < 0.015);
}
async function particleEnergy(page) {
  return page.evaluate(() => {
    const source = document.querySelector("#universe"),
      copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    const ctx = copy.getContext("2d");
    ctx.drawImage(source, 0, 0);
    const pixels = ctx.getImageData(0, 0, copy.width, copy.height).data;
    let energy = 0;
    for (let i = 0; i < pixels.length; i += 4)
      energy +=
        ((pixels[i] * 0.2126 +
          pixels[i + 1] * 0.7152 +
          pixels[i + 2] * 0.0722) *
          pixels[i + 3]) /
        255;
    return energy;
  });
}
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") report.consoleErrors.push(message.text());
  });
  await ready(page);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: "references/analysis/studio-desktop.png",
    fullPage: true,
  });
  assert.equal(await page.evaluate(() => innerWidth), 1440);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    1440,
  );
  passed("Desktop WebGL 2 renderer and responsive layout, 1440 × 1000");
  await settingsBelowCamera(page);
  passed(
    "All controls and status below the camera; canvas matches panel dimensions",
  );
  {
    const c = await browser.newContext(),
      p = await c.newPage();
    let staleRequests = 0;
    const errors = [],
      modulesRequested = [];
    p.on("pageerror", (error) => errors.push(error.message));
    p.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin === base && url.pathname.startsWith("/src/"))
        modulesRequested.push(url);
    });
    await p.route("**/src/**/*.js", (route) => {
      const url = new URL(route.request().url());
      if (!url.searchParams.has("v")) {
        staleRequests++;
        return route.fulfill({
          contentType: "text/javascript",
          body: "export const obsoleteModule=true;",
        });
      }
      return route.continue();
    });
    await ready(p);
    const modules = await p.evaluate(async () => {
      const math = await import("./src/core/math.js");
      const face = await import("./src/render/face.js");
      return {
        math: typeof math.containTransform,
        face: typeof face.FaceRenderer,
      };
    });
    assert.deepEqual(modules, { math: "function", face: "function" });
    assert.equal(staleRequests, 0);
    assert.deepEqual(errors, []);
    const build = await p
      .locator('meta[name="app-build"]')
      .getAttribute("content");
    assert.ok(
      modulesRequested.every((url) => url.searchParams.get("v") === build),
    );
    await p.reload();
    await p.waitForFunction(
      () => !document.querySelector("#enable-camera").disabled,
    );
    assert.equal(staleRequests, 0);
    assert.deepEqual(errors, []);
    await c.close();
    passed(
      "Versioned entry and complete module graph bypass obsolete unversioned scripts on load and reload",
    );
  }
  assert.equal(await page.textContent("#capture-resolution"), "Off");
  await page.click("#fullscreen");
  await page.waitForFunction(
    () => document.fullscreenElement?.id === "camera-stage",
  );
  await page.waitForTimeout(300);
  const fullscreen = await page.evaluate(() => {
    const stage = document.querySelector("#camera-stage"),
      canvas = document.querySelector("#universe");
    return {
      stage: [stage.clientWidth, stage.clientHeight],
      viewport: [innerWidth, innerHeight],
      canvas: [canvas.clientWidth, canvas.clientHeight],
      controls: stage.querySelectorAll("button,input,select").length,
    };
  });
  assert.deepEqual(fullscreen.stage, fullscreen.viewport);
  assert.deepEqual(fullscreen.canvas, fullscreen.stage);
  assert.equal(fullscreen.controls, 0);
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForTimeout(300);
  await settingsBelowCamera(page);
  passed(
    "Camera-only fullscreen fills viewport and restores 16:9 preview on exit",
  );
  await page.selectOption("#quality", "high");
  assert.equal(
    await page.getAttribute("#universe", "data-shell-points"),
    "4500",
  );
  await page.selectOption("#quality", "low");
  assert.equal(
    await page.getAttribute("#universe", "data-shell-points"),
    "2000",
  );
  assert.equal(
    await page.getAttribute("#universe", "data-ring-points"),
    "3000",
  );
  await page.selectOption("#quality", "medium");
  assert.equal(await page.inputValue("#particle-mode"), "bright");
  assert.equal(await page.getAttribute("#brightness", "max"), "200");
  await page.selectOption("#particle-mode", "normal");
  await page.waitForTimeout(300);
  const normalEnergy = await particleEnergy(page);
  await page.selectOption("#particle-mode", "bright");
  await page.waitForTimeout(200);
  const brightEnergy = await particleEnergy(page);
  await page.selectOption("#particle-mode", "ultra");
  await page.waitForTimeout(200);
  const ultraEnergy = await particleEnergy(page);
  assert.ok(
    brightEnergy > normalEnergy * 1.2,
    `Bright: ${brightEnergy}, Normal: ${normalEnergy}`,
  );
  assert.ok(
    ultraEnergy > brightEnergy * 1.1,
    `Ultra: ${ultraEnergy}, Bright: ${brightEnergy}`,
  );
  await page.locator("#brightness").fill("200");
  await page.waitForTimeout(150);
  assert.equal(
    await page.getAttribute("#universe", "data-particle-brightness"),
    "6.240",
  );
  report.particleModes = {
    normalEnergy,
    brightEnergy,
    ultraEnergy,
    maxIntensity: "200%",
  };
  await page.selectOption("#particle-mode", "bright");
  passed(
    "Normal < Bright < Ultra measured particle light output; intensity reaches 200%",
  );
  await page.locator("#brightness").fill("35");
  assert.equal(await page.textContent("#brightness-value"), "35%");
  await page.locator("#mirror").uncheck();
  assert.equal(await page.$eval("#webcam", (el) => el.style.transform), "none");
  await page.locator("#mirror").check();
  await page.locator("#brightness").fill("75");
  passed(
    "Quality changes real particle counts; brightness and mirror controls work",
  );
  assert.equal(await page.inputValue("#gesture-mode"), "reference");
  await page.selectOption("#gesture-mode", "classic");
  await page.click("#demo");
  const states = new Set(),
    fps = [];
  let captured = false;
  const start = Date.now();
  while (Date.now() - start < 14900) {
    const sample = await page.evaluate(() => ({
      state: document.body.dataset.gesture,
      fps: Number(document.querySelector("#fps").textContent),
      mode: document.querySelector("#mode").textContent,
      status: document.querySelector("#status-text").textContent,
    }));
    states.add(sample.state);
    fps.push(sample.fps);
    assert.equal(sample.mode, "DEMO");
    assert.match(sample.status, /Scripted/);
    if (
      sample.state === "TWO_HANDS" &&
      !captured &&
      Date.now() - start > 9500
    ) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: "references/analysis/studio-demo.png",
        fullPage: true,
      });
      captured = true;
    }
    await page.waitForTimeout(60);
  }
  for (const state of ["PINCH", "OPEN", "TWO_HANDS", "FIST", "HOLD", "IDLE"])
    assert.ok(states.has(state), `missing ${state}`);
  report.performance = {
    context:
      "Headless local Chrome, scripted demo, medium quality, 1440x1000, no camera inference",
    minDisplayedFps: Math.min(...fps.filter(Boolean)),
    maxDisplayedFps: Math.max(...fps.filter(Boolean)),
  };
  passed(
    "Complete visibly rendered demo cycle: pinch, release, Saturn, collapse, hold, idle",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.click("#save-frame");
  const download = await downloadPromise;
  await download.saveAs("references/analysis/exported-frame.png");
  assert.match(download.suggestedFilename(), /\.png$/);
  passed("Save frame exports a local PNG");
  await page.click("#stop");
  assert.equal(await page.textContent("#mode"), "STOPPED");
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(350);
  await page.screenshot({
    path: "references/analysis/studio-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await settingsBelowCamera(page);
  passed("Narrow layout has no horizontal overflow, 390 × 844");
  await context.close();

  // Generated 4:3 camera + deterministic landmark fixture exercises actual app mapping.
  // The inference fixture is intentionally synthetic; no physical camera or model accuracy claim.
  {
    const c = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        acceptDownloads: true,
      }),
      p = await c.newPage();
    await p.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        globalThis.__qaCameraConstraints = constraints;
        const image = document.createElement("canvas");
        image.width = 640;
        image.height = 480;
        const ctx = image.getContext("2d");
        const draw = () => {
          ctx.fillStyle = "#343b42";
          ctx.fillRect(0, 0, 640, 480);
          ctx.fillStyle = "#fff";
          ctx.fillRect(390, 190, 12, 12);
          requestAnimationFrame(draw);
        };
        draw();
        return image.captureStream(20);
      };
    });
    await p.route("**/vision_bundle.mjs", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `
      export class FilesetResolver { static async forVisionTasks(){return {}} }
      export class HandLandmarker { static async createFromOptions(){return {close(){},detectForVideo(){
        const points=Array.from({length:21},()=>({x:.5,y:.7,z:0}));
        points[0]={x:.5,y:.9,z:0};points[9]={x:.48,y:.68,z:0};
        points[4]={x:.60,y:.4,z:0};points[8]={x:.62,y:.4,z:0};
        return {landmarks:[points],handedness:[[{categoryName:'Left',score:.99}]]};
      }}} }
    `,
      }),
    );
    await ready(p);
    await p.evaluate(async () => {
      const { SaturnRenderer } = await import("./src/render/saturn.js");
      const original = SaturnRenderer.prototype.render;
      SaturnRenderer.prototype.render = function (target, dt, time) {
        globalThis.__qaTarget = structuredClone(target);
        return original.call(this, target, dt, time);
      };
    });
    await p.click("#enable-camera");
    await p.waitForFunction(() => document.body.dataset.gesture === "PINCH");
    assert.equal(await p.textContent("#capture-resolution"), "640 × 480");
    assert.deepEqual(
      await p.evaluate(() => globalThis.__qaCameraConstraints.video),
      { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    );
    passed(
      "1280 × 720 is requested; resolution readout reports the actual 640 × 480 synthetic stream",
    );
    await p.locator("#show-landmarks").check();
    for (const width of [1440, 390])
      for (const mirror of [true, false]) {
        await p.setViewportSize({ width, height: 1000 });
        await p.locator("#mirror").setChecked(mirror);
        await p.waitForTimeout(350);
        await settingsBelowCamera(p);
        const anchor = await p.evaluate(() => {
          const stage = document.querySelector("#camera-stage"),
            w = stage.clientWidth,
            h = stage.clientHeight,
            s = Math.min(w / 640, h / 480);
          let x = 0.61 * 640 * s + (w - 640 * s) / 2;
          const y = 0.4 * 480 * s + (h - 480 * s) / 2;
          if (document.querySelector("#mirror").checked) x = w - x;
          return { actual: globalThis.__qaTarget.center, expected: { x, y } };
        });
        assert.ok(Math.abs(anchor.actual.x - anchor.expected.x) < 1);
        assert.ok(Math.abs(anchor.actual.y - anchor.expected.y) < 1);
      }
    const downloadPromise = p.waitForEvent("download");
    await p.click("#save-frame");
    const download = await downloadPromise;
    const filename = "references/analysis/camera-panel-export.png";
    await download.saveAs(filename);
    const { readFile } = await import("node:fs/promises");
    const png = await readFile(filename);
    const dimensions = await p.$eval("#universe", (canvas) => [
      canvas.width,
      canvas.height,
    ]);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], dimensions);
    await p.click("#fullscreen");
    await p.waitForFunction(
      () => document.fullscreenElement?.id === "camera-stage",
    );
    await p.waitForTimeout(400);
    const fullAnchor = await p.evaluate(() => {
      const stage = document.querySelector("#camera-stage"),
        w = stage.clientWidth,
        h = stage.clientHeight,
        s = Math.min(w / 640, h / 480);
      return {
        actual: globalThis.__qaTarget.center,
        expected: {
          x: 0.61 * 640 * s + (w - 640 * s) / 2,
          y: 0.4 * 480 * s + (h - 480 * s) / 2,
        },
      };
    });
    assert.ok(Math.abs(fullAnchor.actual.x - fullAnchor.expected.x) < 1);
    assert.ok(Math.abs(fullAnchor.actual.y - fullAnchor.expected.y) < 1);
    await p.evaluate(() => document.exitFullscreen());
    await p.waitForTimeout(150);
    await p.click("#stop");
    assert.equal(await p.textContent("#capture-resolution"), "Off");
    await c.close();
    passed(
      "Synthetic 4:3 camera: pinch alignment after wide/narrow resize and mirror; PNG matches panel",
    );
  }

  for (const [name, text] of [
    ["NotAllowedError", "permission was denied"],
    ["NotFoundError", "No webcam"],
    ["NotReadableError", "webcam is busy"],
  ]) {
    const c = await browser.newContext();
    const p = await c.newPage();
    await p.addInitScript((errorName) => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("QA simulated failure", errorName);
      };
    }, name);
    await ready(p);
    await p.click("#enable-camera");
    await p.waitForFunction(() => !document.querySelector("#notice").hidden);
    assert.match(await p.textContent("#notice-text"), new RegExp(text, "i"));
    passed(`Actionable ${name} error`);
    await c.close();
  }
  {
    const c = await browser.newContext();
    const p = await c.newPage();
    await p.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type === "webgl2" ? null : original.call(this, type, ...args);
      };
    });
    await p.goto(base);
    await p.waitForFunction(() => !document.querySelector("#notice").hidden);
    assert.match(await p.textContent("#notice-text"), /WebGL 2 is unavailable/);
    assert.equal(await p.isDisabled("#enable-camera"), true);
    passed("WebGL unavailable gives a visible actionable error");
    await c.close();
  }
  {
    const c = await browser.newContext();
    const p = await c.newPage();
    await p.route("**/three@*/**", (route) => route.abort());
    await p.goto(base);
    await p.waitForFunction(() => !document.querySelector("#notice").hidden);
    assert.match(
      await p.textContent("#notice-text"),
      /Graphics could not start/,
    );
    passed("Blocked graphics CDN leaves readable UI and an error");
    await c.close();
  }
  {
    const c = await browser.newContext();
    const p = await c.newPage();
    await p.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const paint = canvas.getContext("2d");
        paint.fillStyle = "#777";
        paint.fillRect(0, 0, 640, 480);
        globalThis.__qaStream = canvas.captureStream(15);
        return globalThis.__qaStream;
      };
    });
    await p.route("**/hand_landmarker.task", (route) => route.abort());
    await ready(p);
    await p.click("#enable-camera");
    await p.waitForFunction(() => !document.querySelector("#notice").hidden, {
      timeout: 45000,
    });
    assert.match(
      await p.textContent("#notice-text"),
      /Hand tracking could not start|timed out/,
    );
    assert.equal(
      await p.evaluate(() =>
        __qaStream.getTracks().every((t) => t.readyState === "ended"),
      ),
      true,
    );
    passed(
      "Blocked model download reports failure and releases synthetic stream",
    );
    await c.close();
  }
  assert.deepEqual(report.consoleErrors, []);
  passed("No runtime or shader console errors in the main demo");
} finally {
  await writeFile(
    "references/analysis/browser-qa.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
