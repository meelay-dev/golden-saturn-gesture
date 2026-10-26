// Application policies use fake ports: no DOM, webcam, GPU or downloaded model is required.
import test from "node:test";
import assert from "node:assert/strict";
import { StudioController } from "../src/application/studio-controller.js";
import { FacePipeline } from "../src/application/face-pipeline.js";
import { HandPipeline } from "../src/application/hand-pipeline.js";
import { handFixture } from "./hand-fixture.js";
import { faceFixture } from "./face-fixture.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function settings() {
  return {
    gestureMode: "reference",
    controlSide: "auto",
    quality: "auto",
    mirror: true,
    showLandmarks: false,
    brightness: 0.75,
    particleMode: "bright",
    faceEnabled: false,
    face: {
      smooth: 0.35,
      brighten: 0.15,
      iris: 0.65,
      mirror: true,
      original: false,
      skinTone: "natural",
      whitening: 0.35,
    },
  };
}
function harness() {
  const configuration = settings(),
    statuses = [],
    notices = [];
  const view = {
    getSettings: () => configuration,
    bind(actions) {
      this.actions = actions;
    },
    getViewport: () => ({ width: 1280, height: 720, pixelRatio: 1 }),
    setStatus: (...args) => statuses.push(args),
    notice: (message) => notices.push(message),
    setCameraActive(active) {
      this.active = active;
    },
    updateButtons(state) {
      this.buttons = state;
    },
    renderHud(state) {
      this.hud = state;
    },
    updateResolution(state) {
      this.resolution = state;
    },
    faceStatus() { },
    hideNotice() { },
    clearLandmarks() { },
    setDelegate() { },
    resizeLandmarks() { },
    drawLandmarks() { },
    dispose() { },
  };
  const camera = {
    dimensions: { width: 640, height: 480 },
    delegate: "GPU",
    isActive: false,
    async start() {
      this.isActive = true;
      return true;
    },
    stop() {
      this.isActive = false;
    },
    detect: () => null,
  };
  const face = {
    stop() { },
    start() { },
    resize() { },
    invalidateProjection() { },
    update() { },
    dispose() { },
  };
  const renderer = {
    quality: "medium",
    disposed: false,
    resize() { },
    clearBurst() { },
    render() { },
    triggerBurst() { },
    setQuality(quality) {
      this.quality = quality;
    },
    dispose() {
      this.disposed = true;
    },
  };
  const scheduler = {
    request() {
      this.requests = (this.requests ?? 0) + 1;
      return this.requests;
    },
    cancel() { },
    isVisible: () => true,
  };
  const dependencies = {
    view,
    camera,
    face,
    scheduler,
    clock: { now: () => 0 },
    createRenderer: async () => renderer,
  };
  return {
    configuration,
    statuses,
    notices,
    view,
    camera,
    face,
    renderer,
    scheduler,
    dependencies,
  };
}

test("a late camera start cannot reactivate a stopped session", async () => {
  const h = harness(),
    pending = deferred();
  h.camera.start = () => pending.promise;
  const studio = new StudioController(h.dependencies);
  await studio.start();
  const start = studio.startCamera();
  studio.stop();
  pending.resolve(true);
  await start;
  assert.equal(studio.mode, "idle");
  assert.equal(studio.starting, false);
  assert.equal(h.view.active, false);
  assert.equal(
    h.statuses.some(([label]) => label === "LIVE"),
    false,
  );
});
test("switching to demo cancels a pending camera session without losing demo state", async () => {
  const h = harness(),
    pending = deferred();
  h.camera.start = () => pending.promise;
  const studio = new StudioController(h.dependencies);
  await studio.start();
  const start = studio.startCamera();
  studio.startDemo();
  pending.resolve(true);
  await start;
  assert.equal(studio.mode, "demo");
  assert.equal(h.view.buttons.mode, "demo");
  assert.equal(h.view.active, false);
});
test("camera startup failures produce a retryable application state", async () => {
  const h = harness();
  h.camera.start = async () => {
    throw new Error("Permission denied");
  };
  const studio = new StudioController(h.dependencies);
  await studio.start();
  await studio.startCamera();
  assert.equal(studio.mode, "idle");
  assert.equal(h.view.buttons.starting, false);
  assert.deepEqual(h.notices, ["Permission denied"]);
});
test("disposing during graphics loading closes a late renderer instead of starting a loop", async () => {
  const h = harness(),
    pending = deferred();
  h.dependencies.createRenderer = () => pending.promise;
  const studio = new StudioController(h.dependencies),
    start = studio.start();
  studio.dispose();
  pending.resolve(h.renderer);
  await start;
  assert.equal(h.renderer.disposed, true);
  assert.equal(h.scheduler.requests ?? 0, 0);
});
test("a graphics context failure disables controls and releases its renderer", async () => {
  const h = harness(),
    studio = new StudioController(h.dependencies);
  await studio.start();
  h.renderer.onContextLost();
  assert.equal(h.renderer.disposed, true);
  assert.equal(h.view.buttons.hasRenderer, false);
  assert.equal(h.view.active, false);
});
test("quality adaptation requires sustained low frame rate and resizes the face port too", async () => {
  const h = harness(),
    resized = [];
  h.face.resize = (...args) => resized.push(args);
  const studio = new StudioController(h.dependencies);
  await studio.start();
  for (let second = 1; second <= 4; second++)
    studio.updatePerformance(second, h.configuration);
  assert.equal(h.renderer.quality, "low");
  assert.equal(resized.at(-1)[1], "low");
});
test("frozen camera frames clear detected hands without fabricating new gesture samples", () => {
  const h = harness();
  const result = {
    landmarks: [handFixture("PINCH")],
    handedness: [[{ categoryName: "Left", score: 0.99 }]],
  };
  let fresh = true;
  h.camera.detect = () => (fresh ? result : null);
  const pipeline = new HandPipeline(h.camera);
  const frame = (now) =>
    pipeline.update({
      mode: "camera",
      starting: false,
      stopped: false,
      now,
      milliseconds: now * 1000,
      dt: 1 / 30,
      settings: h.configuration,
      viewport: { width: 1280, height: 720 },
      demoStart: 0,
    });
  frame(0.1);
  frame(0.14);
  assert.equal(frame(0.18).output.state, "PINCH");
  fresh = false;
  assert.equal(frame(0.34).hands.length, 0);
  assert.equal(frame(0.42).output.opacity, 0);
});
test("application projection uses the camera dimensions and the shared contain/mirror transform", () => {
  const h = harness(),
    pipeline = new HandPipeline(h.camera);
  pipeline.update({
    mode: "camera",
    starting: true,
    stopped: false,
    now: 0,
    milliseconds: 0,
    dt: 1 / 60,
    settings: h.configuration,
    viewport: { width: 1280, height: 720 },
    demoStart: 0,
  });
  assert.deepEqual(pipeline.project({ x: 0.25, y: 0.5 }), {
    x: 880,
    y: 360,
    z: 0,
  });
});
test("stopping while the optional face renderer loads prevents GPU allocation", async () => {
  const pending = deferred();
  let allocations = 0,
    modelStarts = 0;
  const pipeline = new FacePipeline({
    vision: {
      stop() { },
      async start() {
        modelStarts++;
        return true;
      },
    },
    loadRenderer: () => pending.promise,
  });
  const start = pipeline.start({
    enabled: true,
    mode: "camera",
    starting: false,
    viewport: { width: 640, height: 480 },
    quality: "medium",
  });
  pipeline.stop();
  pending.resolve(() => {
    allocations++;
    return {};
  });
  await start;
  assert.equal(allocations, 0);
  assert.equal(modelStarts, 0);
});
test("face scheduling yields to hand inference but expires stale face geometry", async () => {
  let calls = 0;
  const rendered = [];
  const vision = {
    delegate: "GPU",
    isReady: false,
    stop() {
      this.isReady = false;
    },
    async start() {
      this.isReady = true;
      return true;
    },
    detect() {
      return ++calls === 1 ? faceFixture() : null;
    },
  };
  const pipeline = new FacePipeline({
    vision,
    loadRenderer: async () => () => ({
      resize() { },
      hide() { },
      render(face) {
        rendered.push(face);
      },
    }),
  });
  const viewport = { width: 640, height: 480 };
  await pipeline.start({
    enabled: true,
    mode: "camera",
    starting: false,
    viewport,
    quality: "medium",
  });
  const configuration = settings();
  configuration.faceEnabled = true;
  const update = (now) =>
    pipeline.update({
      mode: "camera",
      starting: false,
      now,
      milliseconds: now * 1000,
      quality: "medium",
      processedHands: true,
      viewport,
      project: (p) => ({ x: p.x * 640, y: p.y * 480 }),
      settings: configuration,
    });
  update(0.05);
  assert.equal(calls, 0);
  update(0.13);
  assert.equal(calls, 1);
  assert.ok(rendered.at(-1));
  update(0.31);
  assert.equal(rendered.at(-1), null);
});
