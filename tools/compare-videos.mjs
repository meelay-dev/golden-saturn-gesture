// Optional offline comparison: real model detections from the two local, cropped recordings.
// Screen-recorded effects are baked into the input; these are not clean webcam frames.
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { HandTracker } from "../src/vision/gesture.js";
import { Interaction, ReferenceInteraction } from "../src/core/interaction.js";
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.on("console", (message) => {
    if (message.text().startsWith("COMPARE ")) console.log(message.text());
  });
  await page.goto("http://127.0.0.1:5500");
  await page.waitForFunction(() => !document.querySelector("#demo").disabled);
  const clips = await page.evaluate(async () => {
    const { VISION_BASE, MODEL_URL } = await import("./src/vision/camera.js");
    const { FilesetResolver, HandLandmarker } = await import(
      `${VISION_BASE}/vision_bundle.mjs`
    );
    const files = await FilesetResolver.forVisionTasks(`${VISION_BASE}/wasm`),
      clips = [];
    for (const name of ["reference", "recording"]) {
      let model,
        delegate = "GPU";
      const options = {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
      };
      try {
        model = await HandLandmarker.createFromOptions(files, options);
      } catch {
        delegate = "CPU";
        options.baseOptions.delegate = delegate;
        model = await HandLandmarker.createFromOptions(files, options);
      }
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "auto";
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = () =>
          reject(
            new Error(`Cannot load ${name} crop: ${video.error?.message}`),
          );
        video.src = `/references/analysis/${name}-camera.mp4`;
      });
      const image = document.createElement("canvas");
      image.width = video.videoWidth;
      image.height = video.videoHeight;
      const ctx = image.getContext("2d"),
        samples = [];
      for (let i = 0; i / 10 < video.duration - 0.05; i++) {
        const t = i / 10;
        if (Math.abs(video.currentTime - t) > 0.0001)
          await new Promise((resolve) => {
            video.onseeked = resolve;
            video.currentTime = t;
          });
        // Both recordings show a selfie preview. Undo that reflection before inference.
        ctx.setTransform(-1, 0, 0, 1, image.width, 0);
        ctx.drawImage(video, 0, 0, image.width, image.height);
        const result = model.detectForVideo(image, (i + 1) * 100);
        samples.push({
          time: t,
          result: {
            landmarks: result.landmarks.map((points) =>
              points.map((p) => ({
                x: +p.x.toFixed(5),
                y: +p.y.toFixed(5),
                z: +p.z.toFixed(5),
              })),
            ),
            handedness: result.handedness,
          },
        });
        if (i % 50 === 0)
          console.log(
            `COMPARE ${name} ${t.toFixed(1)}s / ${video.duration.toFixed(2)}s`,
          );
      }
      clips.push({
        name,
        duration: video.duration,
        width: image.width,
        height: image.height,
        delegate,
        samples,
      });
      model.close();
      video.removeAttribute("src");
      video.load();
    }
    return clips;
  });
  const summary = {
    sampleRate: 10,
    physicalWebcamTested: false,
    input:
      "Cropped screen recordings with existing effects; mirrored display is undone before inference.",
    clips: [],
  };
  for (const clip of clips) {
    const tracker = new HandTracker(),
      classic = new Interaction(),
      reference = new ReferenceInteraction();
    const states = {},
      classicStates = {},
      rows = [];
    let bursts = 0,
      maxScale = 0,
      detected = 0;
    for (const sample of clip.samples) {
      const hands = tracker.update(
        sample.result,
        sample.time,
        clip.width / clip.height,
      );
      const before = classic.update(hands, sample.time),
        after = reference.update(hands, sample.time, {
          side: clip.name === "reference" ? "left" : "auto",
          mirror: true,
        });
      if (hands.length) detected++;
      states[after.state] = (states[after.state] ?? 0) + 1;
      classicStates[before.state] = (classicStates[before.state] ?? 0) + 1;
      bursts += after.events.length;
      maxScale = Math.max(maxScale, after.scale);
      rows.push({
        time: sample.time,
        hands: hands.map((h) => ({
          id: h.id,
          gesture: h.gesture,
          gap: +h.pinch.toFixed(3),
          fingers: h.fingerCount,
        })),
        classic: before.state,
        reference: after.state,
        primary: after.primaryId,
        color: after.color,
        scale: +after.scale.toFixed(3),
        center: after.center,
      });
    }
    summary.clips.push({
      name: clip.name,
      duration: clip.duration,
      delegate: clip.delegate,
      samples: clip.samples.length,
      detected,
      states,
      classicStates,
      bursts,
      maxScale,
      rows,
    });
    console.log(JSON.stringify({ ...summary.clips.at(-1), rows: undefined }));
  }
  await writeFile(
    "references/analysis/video-landmarks.json",
    JSON.stringify(clips),
  );
  await writeFile(
    "references/analysis/video-comparison.json",
    JSON.stringify(summary, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
