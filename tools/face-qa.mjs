import { pathToFileURL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
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
const base = "http://127.0.0.1:5500";
try {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") report.errors.push(m.text());
  });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const { faceFixture, paintFaceFixture } = await import(
        "/tests/face-fixture.js"
      );
      globalThis.__qaFaceFixture = faceFixture();
      const image = document.createElement("canvas");
      image.width = 640;
      image.height = 480;
      const draw = () => {
        const ctx = image.getContext("2d");
        ctx.fillStyle = "#344b36";
        ctx.fillRect(0, 0, 640, 480);
        ctx.save();
        ctx.translate(320, 240);
        ctx.rotate(globalThis.__qaRoll ?? 0);
        ctx.translate(-320, -240);
        paintFaceFixture(ctx);
        ctx.restore();
        requestAnimationFrame(draw);
      };
      draw();
      globalThis.__qaCamera = image;
      globalThis.__qaStream = image.captureStream(30);
      return globalThis.__qaStream;
    };
  });
  await page.route("**/vision_bundle.mjs", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    export class FilesetResolver{static async forVisionTasks(){return {}}}
    export class HandLandmarker{static async createFromOptions(){return {close(){},detectForVideo(){return {landmarks:[]}}}}}
    export class FaceLandmarker{static async createFromOptions(files,options){
      globalThis.__qaFaceOptions=options;
      if(globalThis.__qaFaceFail)throw new Error('QA face model unavailable');
      if(globalThis.__qaFaceDelay)await new Promise(resolve=>setTimeout(resolve,400));
      return {close(){globalThis.__qaFaceClosed=(globalThis.__qaFaceClosed??0)+1},detectForVideo(){
        globalThis.__qaFaceFrames=(globalThis.__qaFaceFrames??0)+1;
        if(globalThis.__qaNoFace)return {faceLandmarks:[]};
        const result=structuredClone(globalThis.__qaFaceFixture);
        const roll=globalThis.__qaRoll??0;
        result.faceLandmarks[0]=result.faceLandmarks[0].map(p=>{
          const x=p.x*640-320,y=p.y*480-240;
          return {x:(320+x*Math.cos(roll)-y*Math.sin(roll))/640,y:(240+x*Math.sin(roll)+y*Math.cos(roll))/480,z:p.z};
        });
        if(globalThis.__qaBlink)result.faceBlendshapes[0].categories.forEach(c=>c.score=1);
        return result;
      }};
    }}
  `,
    }),
  );
  await page.goto(base);
  await page.waitForFunction(
    () => !document.querySelector("#enable-camera").disabled,
  );
  assert.equal(await page.isChecked("#face-enabled"), false);
  assert.equal(await page.isDisabled("#face-smooth"), true);
  assert.equal(await page.isDisabled("#skin-tone"), true);
  assert.equal(await page.inputValue("#skin-tone"), "natural");
  await page.click("#enable-camera");
  await page.waitForFunction(
    () => document.querySelector("#mode").textContent === "LIVE",
  );
  await page.locator("#face-enabled").check();
  await page.waitForFunction(
    () => !document.querySelector("#face-effects").hidden,
  );
  assert.equal(await page.evaluate(() => __qaFaceOptions.numFaces), 1);
  pass(
    "Opt-in face controls initialize only on live camera; 478-point fixture is tracked",
  );
  await page.locator("#face-smooth").fill("0");
  await page.locator("#face-brighten").fill("0");
  await page.locator("#iris-strength").fill("0");
  await page.locator("#skin-whitening").fill("0");
  async function samples() {
    return page.evaluate(async () => {
      const { mapLandmark, containTransform } = await import(
        "./src/core/math.js"
      );
      const stage = document.querySelector("#camera-stage"),
        w = stage.clientWidth,
        h = stage.clientHeight,
        video = document.querySelector("#webcam");
      const image = document.createElement("canvas");
      image.width = w;
      image.height = h;
      const ctx = image.getContext("2d");
      const transform = containTransform(640, 480, w, h),
        mirror = document.querySelector("#mirror").checked;
      ctx.save();
      if (mirror) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(
        video,
        transform.offsetX,
        transform.offsetY,
        640 * transform.scale,
        480 * transform.scale,
      );
      ctx.restore();
      const face = document.querySelector("#face-effects");
      if (!face.hidden) ctx.drawImage(face, 0, 0, w, h);
      const pixel = (x, y) => {
        const roll = globalThis.__qaRoll ?? 0,
          dx = x - 320,
          dy = y - 240;
        const point = mapLandmark(
          {
            x: (320 + dx * Math.cos(roll) - dy * Math.sin(roll)) / 640,
            y: (240 + dx * Math.sin(roll) + dy * Math.cos(roll)) / 480,
          },
          640,
          480,
          w,
          h,
          mirror,
          "contain",
        );
        const data = ctx.getImageData(
          Math.round(point.x) - 1,
          Math.round(point.y) - 1,
          3,
          3,
        ).data;
        return [0, 1, 2].map(
          (channel) =>
            Array.from({ length: 9 }, (_, i) => data[i * 4 + channel]).reduce(
              (a, b) => a + b,
              0,
            ) / 9,
        );
      };
      let gradient = 0,
        count = 0;
      for (let y = 111; y < 144; y++) {
        const a = pixel(320, y),
          b = pixel(320, y + 1);
        gradient += Math.abs(a[0] - b[0]);
        count++;
      }
      return {
        background: pixel(80, 240),
        skin: pixel(320, 295),
        pupil: pixel(270, 210),
        highlight: pixel(265, 205),
        sclera: pixel(244, 210),
        lips: pixel(320, 326),
        iris: pixel(280, 210),
        wrinkleGradient: gradient / count,
      };
    });
  }
  await page.waitForTimeout(200);
  const original = await samples();
  const luminance = (rgb) =>
    rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  const tones = {};
  let previous = luminance(original.skin);
  for (const strength of [35, 70, 100]) {
    await page.locator("#skin-whitening").fill(String(strength));
    await page.waitForTimeout(140);
    const sample = await samples();
    assert.ok(luminance(sample.skin) > previous + 3);
    previous = luminance(sample.skin);
  }
  for (const tone of ["natural", "ivory", "pearl", "porcelain"]) {
    await page.selectOption("#skin-tone", tone);
    await page.locator("#skin-whitening").fill("80");
    await page.waitForTimeout(160);
    const sample = await samples();
    tones[tone] = sample;
    assert.ok(luminance(sample.skin) > luminance(original.skin) + 15);
    assert.ok(sample.skin.every((channel) => channel < 251));
    assert.ok(sample.wrinkleGradient > original.wrinkleGradient * 0.7);
    for (const part of ["background", "pupil", "highlight", "sclera", "lips"])
      assert.ok(
        Math.max(
          ...sample[part].map((v, i) => Math.abs(v - original[part][i])),
        ) < 5,
        `${tone}: ${part}`,
      );
  }
  assert.ok(
    tones.pearl.skin[0] / tones.pearl.skin[2] >
      tones.porcelain.skin[0] / tones.porcelain.skin[2] + 0.04,
  );
  await page.selectOption("#skin-tone", "original");
  await page.waitForTimeout(120);
  assert.equal(await page.isHidden("#face-effects"), true);
  await page.selectOption("#skin-tone", "natural");
  await page.locator("#skin-whitening").fill("0");
  await page.waitForTimeout(120);
  report.tones = tones;
  pass(
    "Skin tone presets lighten progressively, retain fine detail, avoid clipped highlights and protect eyes/lips/background",
  );
  await page.locator("#iris-strength").fill("100");
  await page.waitForTimeout(220);
  const navy = await samples();
  assert.ok(navy.iris[2] > navy.iris[0] + 10, JSON.stringify(navy.iris));
  for (const part of ["background", "pupil", "highlight", "sclera", "lips"])
    assert.ok(
      Math.max(
        ...navy[part].map((value, i) => Math.abs(value - original[part][i])),
      ) < 5,
      part,
    );
  pass(
    "Navy iris changes only the iris annulus; pupil, catchlight, sclera, lips and background preserved",
  );
  await page.evaluate(() => {
    globalThis.__qaBlink = true;
  });
  await page.waitForTimeout(180);
  const blink = await samples();
  assert.ok(
    Math.max(...blink.iris.map((v, i) => Math.abs(v - original.iris[i]))) < 5,
  );
  await page.evaluate(() => {
    globalThis.__qaBlink = false;
  });
  pass("Blink blendshapes suppress colour immediately");
  await page.locator("#iris-strength").fill("0");
  await page.locator("#face-brighten").fill("100");
  await page.waitForTimeout(180);
  const bright = await samples();
  assert.ok(bright.skin[0] > original.skin[0] + 5);
  assert.ok(
    Math.abs(
      bright.skin[0] / bright.skin[1] - original.skin[0] / original.skin[1],
    ) < 0.04,
  );
  assert.ok(
    Math.max(
      ...bright.background.map((v, i) => Math.abs(v - original.background[i])),
    ) < 5,
  );
  await page.locator("#face-brighten").fill("0");
  await page.locator("#face-smooth").fill("100");
  await page.waitForTimeout(180);
  const smooth = await samples();
  assert.ok(
    smooth.wrinkleGradient < original.wrinkleGradient * 0.94,
    `${smooth.wrinkleGradient} vs ${original.wrinkleGradient}`,
  );
  pass(
    "Skin brightening preserves channel ratios; smoothing reduces synthetic fine-line contrast",
  );
  report.pixels = { original, navy, bright, smooth };
  await page.locator("#face-original").check();
  await page.waitForTimeout(120);
  assert.equal(await page.isHidden("#face-effects"), true);
  await page.locator("#face-original").uncheck();
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    globalThis.__qaNoFace = true;
  });
  await page.waitForTimeout(180);
  assert.equal(await page.isHidden("#face-effects"), true);
  await page.evaluate(() => {
    globalThis.__qaNoFace = false;
  });
  await page.waitForTimeout(180);
  assert.equal(await page.isHidden("#face-effects"), false);
  pass(
    "Original comparison bypass, face loss, and reacquisition clear/recover the effect",
  );
  for (const width of [1400, 390])
    for (const mirror of [true, false]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator("#mirror").setChecked(mirror);
      await page.locator("#iris-strength").fill("100");
      await page.waitForTimeout(300);
      const check = await samples();
      assert.ok(
        check.iris[2] > check.iris[0] + 10,
        JSON.stringify({
          width,
          mirror,
          check,
          status: await page.textContent("#face-status"),
          hidden: await page.isHidden("#face-effects"),
        }),
      );
      const overlap = await page.evaluate(() => {
        const bottom = document
          .querySelector("#camera-stage")
          .getBoundingClientRect().bottom;
        return [...document.querySelectorAll(".face-controls input")].some(
          (el) => el.getBoundingClientRect().top < bottom,
        );
      });
      assert.equal(overlap, false);
    }
  pass(
    "Iris placement survives full-frame contain mapping, wide/narrow resizing, mirror changes; controls stay below camera",
  );
  await page.click("#fullscreen");
  await page.waitForFunction(
    () => document.fullscreenElement?.id === "camera-stage",
  );
  await page.waitForTimeout(350);
  const fullscreenFace = await samples();
  assert.ok(fullscreenFace.iris[2] > fullscreenFace.iris[0] + 10);
  const bars = await page.evaluate(() => {
    const face = document.querySelector("#face-effects"),
      copy = document.createElement("canvas");
    copy.width = face.width;
    copy.height = face.height;
    const ctx = copy.getContext("2d");
    ctx.drawImage(face, 0, 0);
    return [...ctx.getImageData(1, 1, 1, 1).data];
  });
  assert.deepEqual(bars, [11, 12, 14, 255]);
  await page.evaluate(() => document.exitFullscreen());
  await page.waitForTimeout(200);
  pass(
    "Portrait camera-only fullscreen keeps iris aligned and renders dark bars without stretched camera edges",
  );
  for (const roll of [-0.32, 0.32]) {
    await page.evaluate((angle) => {
      globalThis.__qaRoll = angle;
    }, roll);
    await page.waitForTimeout(350);
    const check = await samples();
    assert.ok(
      check.iris[2] > check.iris[0] + 10,
      JSON.stringify({ roll, iris: check.iris }),
    );
  }
  await page.evaluate(() => {
    globalThis.__qaRoll = 0;
  });
  pass(
    "Iris ellipses and eyelid clipping follow head roll in the generated face",
  );
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.locator("#mirror").check();
  await page.locator("#face-smooth").fill("35");
  await page.locator("#face-brighten").fill("15");
  await page.locator("#iris-strength").fill("65");
  await page.locator("#skin-whitening").fill("35");
  await page.waitForTimeout(200);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "references/analysis/face-studio-fixture.png",
    fullPage: true,
  });
  const pending = page.waitForEvent("download");
  await page.click("#save-frame");
  const download = await pending;
  await download.saveAs("references/analysis/face-export.png");
  const png = await readFile("references/analysis/face-export.png");
  const dims = await page.$eval("#universe", (canvas) => [
    canvas.width,
    canvas.height,
  ]);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], dims);
  const exportedIris = await page.evaluate(async (data) => {
    const { mapLandmark } = await import("./src/core/math.js");
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const copy = document.createElement("canvas");
    copy.width = image.width;
    copy.height = image.height;
    const ctx = copy.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const stage = document.querySelector("#camera-stage"),
      point = mapLandmark(
        { x: 280 / 640, y: 210 / 480 },
        640,
        480,
        stage.clientWidth,
        stage.clientHeight,
        document.querySelector("#mirror").checked,
        "contain",
      );
    return [
      ...ctx.getImageData(
        Math.round((point.x * image.width) / stage.clientWidth),
        Math.round((point.y * image.height) / stage.clientHeight),
        1,
        1,
      ).data,
    ];
  }, png.toString("base64"));
  assert.ok(exportedIris[2] > exportedIris[0] + 10);
  report.exportedIris = exportedIris;
  pass("Retouched local PNG export uses the camera panel dimensions");
  await page.locator("#face-enabled").uncheck();
  assert.equal(await page.isHidden("#face-effects"), true);
  assert.equal(
    await page.evaluate(() => __qaStream.getTracks()[0].readyState),
    "live",
  );
  await page.evaluate(() => {
    globalThis.__qaFaceDelay = true;
  });
  await page.locator("#face-enabled").check();
  await page.locator("#face-enabled").uncheck();
  await page.waitForTimeout(500);
  assert.equal(await page.isHidden("#face-effects"), true);
  await page.evaluate(() => {
    globalThis.__qaFaceDelay = false;
    globalThis.__qaFaceFail = true;
  });
  await page.locator("#face-enabled").check();
  await page.waitForFunction(() =>
    document.querySelector("#face-status").textContent.includes("unavailable"),
  );
  assert.equal(await page.textContent("#mode"), "LIVE");
  assert.equal(await page.isHidden("#face-effects"), true);
  await page.click("#stop");
  assert.equal(
    await page.evaluate(() =>
      __qaStream.getTracks().every((t) => t.readyState === "ended"),
    ),
    true,
  );
  pass(
    "Disable/load cancellation/model failure preserve raw webcam; Stop releases all tracks",
  );
  assert.deepEqual(report.errors, []);
  await context.close();

  // Separately verify the real pinned model on the user's existing LOCAL reference clip.
  // This validates initialization/inference, not physical webcam tracking quality.
  const realContext = await browser.newContext(),
    real = await realContext.newPage();
  await real.goto(base);
  const model = await real.evaluate(async () => {
    const { FaceVision } = await import("./src/vision/face.js");
    const { VISION_BASE } = await import("./src/vision/camera.js");
    const { FaceLandmarker } = await import(`${VISION_BASE}/vision_bundle.mjs`);
    const video = document.createElement("video");
    video.src = "./references/reference-video.mp4";
    video.muted = true;
    video.preload = "auto";
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error("Reference clip unavailable"));
      video.load();
    });
    const runs = [];
    for (const forceCpu of [false, true]) {
      if (forceCpu) {
        const original = FaceLandmarker.createFromOptions;
        FaceLandmarker.createFromOptions = async function (files, options) {
          if (options.baseOptions.delegate === "GPU")
            throw new Error("QA forced face GPU failure");
          return original.call(this, files, options);
        };
      }
      const vision = new FaceVision(video);
      await vision.start();
      const results = [];
      for (const t of [0.3, 1.3, 7.9, 8.7]) {
        await new Promise((resolve) => {
          video.onseeked = resolve;
          video.currentTime = t;
        });
        const result = vision.detect(performance.now());
        results.push(result?.faceLandmarks?.[0]?.length ?? 0);
      }
      const delegate = vision.delegate;
      vision.stop();
      runs.push({
        forceCpu,
        delegate,
        landmarkCounts: results,
        closed: vision.model === null,
      });
    }
    video.removeAttribute("src");
    video.load();
    return runs;
  });
  for (const run of model) {
    assert.ok(run.landmarkCounts.some((n) => n === 478));
    assert.equal(run.closed, true);
    if (run.forceCpu) assert.equal(run.delegate, "CPU");
  }
  report.realModel = model;
  pass(
    "Real Face Landmarker returns 478 points on local clip; forced GPU failure falls back to real CPU",
  );
  await realContext.close();
} finally {
  await writeFile(
    "references/analysis/face-qa.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
