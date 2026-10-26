import { clamp } from "../core/math.js";
import { HandPipeline } from "./hand-pipeline.js";

/**
 * Application coordinator. Browser, MediaPipe and Three.js APIs enter only through
 * injected view, camera, face, renderer, clock and frame-scheduler ports.
 */
export class StudioController {
  constructor({
    view,
    camera,
    face,
    createRenderer,
    clock,
    scheduler,
    reducedMotion = false,
  }) {
    Object.assign(this, {
      view,
      camera,
      face,
      createRenderer,
      clock,
      scheduler,
      reducedMotion,
    });
    this.handPipeline = new HandPipeline(camera);
    this.viewport = { width: 1, height: 1 };
    this.mode = "idle";
    this.starting = false;
    this.stopped = false;
    this.disposed = false;
    this.generation = 0;
    this.lastTime = 0;
    this.demoStart = 0;
    this.hudTime = 0;
    this.fpsTime = 0;
    this.frames = 0;
    this.fps = 0;
    this.lowFpsSeconds = 0;
    this.tick = (milliseconds) => this.frame(milliseconds);
  }

  async start() {
    this.view.bind({
      camera: () => void this.startCamera(),
      demo: () => this.startDemo(),
      stop: () => this.stop(),
      face: () => void this.startFace(),
      projection: () => this.projectionChanged(),
      resize: () => this.resize(),
      gestureMode: () => this.changeGestureMode(),
      controlSide: () => this.changeControlSide(),
      quality: () => this.changeQuality(),
      save: () => this.renderer && this.view.saveFrame(this.mode),
      dispose: () => this.dispose(),
    });
    this.updateButtons();
    try {
      const renderer = await this.createRenderer();
      if (this.disposed) {
        renderer.dispose();
        return;
      }
      this.renderer = renderer;
      renderer.onContextLost = () => this.graphicsLost();
      this.resize();
      this.fpsTime = this.clock.now() / 1000;
      this.updateButtons();
      this.requestId = this.scheduler.request(this.tick);
    } catch (error) {
      if (this.disposed) return;
      this.view.setStatus(
        "GRAPHICS OFF",
        "The studio needs WebGL 2 and its pinned graphics dependency",
      );
      this.view.notice(
        `Graphics could not start. Check internet access to jsDelivr, and enable hardware acceleration in Chrome. ${error.message}`,
      );
      this.updateButtons();
    }
  }

  updateButtons() {
    this.view.updateButtons({
      mode: this.mode,
      starting: this.starting,
      hasRenderer: Boolean(this.renderer),
    });
  }

  reset() {
    this.generation++;
    this.starting = false;
    this.face.stop();
    this.camera.stop();
    this.handPipeline.reset();
    this.renderer?.clearBurst();
    this.view.clearLandmarks();
    this.view.setCameraActive(false);
    this.view.setDelegate("—");
    this.view.faceStatus(
      this.view.getSettings().faceEnabled
        ? "Ready · enable webcam to start face tracking."
        : "Face effects off · enable with a live webcam.",
    );
    this.updateResolution();
  }

  async startCamera() {
    if (!this.renderer || this.starting || this.disposed) return;
    this.reset();
    this.mode = "camera";
    this.starting = true;
    this.stopped = false;
    const attempt = this.generation;
    this.updateButtons();
    this.view.hideNotice();
    this.view.setStatus("LOADING", "Requesting camera permission…");
    try {
      // A late permission/model result must not reactivate a stopped or replaced session.
      if (!(await this.camera.start()) || attempt !== this.generation) return;
      this.starting = false;
      this.view.setCameraActive(true);
      this.updateResolution();
      this.view.setDelegate(this.camera.delegate);
      this.view.setStatus(
        "LIVE",
        "Close one fist to summon · thumb + index to zoom · open palm to release",
        true,
      );
      if (this.view.getSettings().faceEnabled) void this.startFace();
    } catch (error) {
      if (attempt !== this.generation) return;
      this.mode = "idle";
      this.starting = false;
      this.stopped = true;
      this.view.setStatus(
        "CAMERA OFF",
        "Try again, or explore the scripted demo",
      );
      this.view.notice(error.message);
    } finally {
      if (attempt === this.generation) this.updateButtons();
    }
  }

  startDemo() {
    this.reset();
    this.mode = "demo";
    this.stopped = false;
    this.demoStart = this.clock.now() / 1000;
    this.view.hideNotice();
    this.view.setStatus(
      "DEMO",
      "Scripted effect animation · no hand inference",
      true,
    );
    this.updateButtons();
  }

  stop() {
    this.reset();
    this.mode = "idle";
    this.stopped = true;
    this.view.setStatus(
      "STOPPED",
      "Camera tracks released · choose a mode to restart",
    );
    this.updateButtons();
  }

  startFace() {
    return this.face.start({
      enabled: this.view.getSettings().faceEnabled,
      mode: this.mode,
      starting: this.starting,
      viewport: this.viewport,
      quality: this.renderer?.quality ?? "medium",
    });
  }

  changeGestureMode() {
    this.handPipeline.resetInteraction();
    this.renderer?.clearBurst();
    this.demoStart = this.clock.now() / 1000;
  }

  changeControlSide() {
    this.handPipeline.reference.reset();
    this.handPipeline.resetProjection();
    this.renderer?.clearBurst();
  }

  changeQuality() {
    const selected = this.view.getSettings().quality;
    this.renderer?.setQuality(selected === "auto" ? "medium" : selected);
    this.lowFpsSeconds = 0;
    this.face.resize(this.viewport, this.renderer?.quality ?? "medium");
  }

  projectionChanged() {
    this.handPipeline.resetProjection();
    this.face.invalidateProjection();
    this.updateResolution();
  }

  resize() {
    this.viewport = this.view.getViewport();
    this.renderer?.resize(this.viewport.width, this.viewport.height);
    this.face.resize(this.viewport, this.renderer?.quality ?? "medium");
    this.view.resizeLandmarks(this.viewport);
    this.projectionChanged();
  }

  updateResolution() {
    const source = this.camera.dimensions;
    this.view.updateResolution({
      capture:
        this.camera.isActive && source.width && source.height ? source : null,
      preview: this.viewport,
    });
  }

  frame(milliseconds) {
    if (this.disposed || !this.renderer) return;
    const now = milliseconds / 1000;
    const dt = clamp(now - (this.lastTime || now - 1 / 60), 0, 0.05);
    this.lastTime = now;
    if (this.scheduler.isVisible()) {
      const settings = this.view.getSettings();
      const context = () => ({
        mode: this.mode,
        starting: this.starting,
        stopped: this.stopped,
        now,
        milliseconds,
        dt,
        settings,
        viewport: this.viewport,
        demoStart: this.demoStart,
      });
      let frame;
      try {
        frame = this.handPipeline.update(context());
      } catch (error) {
        this.stop();
        this.view.setStatus("TRACKING OFF", "Restart the camera to retry");
        this.view.notice(`Hand tracking stopped. ${error.message}`);
        frame = this.handPipeline.update(context());
      }
      this.face.update({
        ...context(),
        quality: this.renderer.quality,
        processedHands: frame.processedHands,
        project: (point) => this.handPipeline.project(point),
      });
      for (const event of frame.events)
        if (event.type === "burst")
          this.renderer.triggerBurst(event.center, now);
      this.renderer.brightness = settings.brightness * 1.2;
      this.renderer.particleMode = settings.particleMode;
      this.renderer.motionScale = this.reducedMotion ? 0.25 : 1;
      this.renderer.render(frame.target, dt, now);
      this.view.drawLandmarks(
        frame.hands,
        (point) => this.handPipeline.project(point),
        this.mode,
        settings.showLandmarks,
      );
      if (now - this.hudTime >= 0.18) {
        this.hudTime = now;
        this.view.renderHud({
          mode: this.mode,
          stopped: this.stopped,
          output: frame.output,
          hands: frame.hands,
          fps: this.fps,
          quality: this.renderer.quality,
          gestureMode: settings.gestureMode,
        });
      }
      this.updatePerformance(now, settings);
    }
    if (!this.disposed && this.renderer)
      this.requestId = this.scheduler.request(this.tick);
  }

  updatePerformance(now, settings) {
    this.frames++;
    if (now - this.fpsTime < 1) return;
    this.fps = this.frames / (now - this.fpsTime);
    this.fpsTime = now;
    this.frames = 0;
    if (settings.quality !== "auto") return;
    this.lowFpsSeconds =
      this.fps < 28
        ? this.lowFpsSeconds + 1
        : Math.max(0, this.lowFpsSeconds - 1);
    if (this.lowFpsSeconds >= 4 && this.renderer.quality !== "low") {
      this.renderer.setQuality("low");
      this.face.resize(this.viewport, "low");
      this.lowFpsSeconds = 0;
    }
  }

  graphicsLost() {
    this.reset();
    this.mode = "idle";
    this.stopped = true;
    this.scheduler.cancel(this.requestId);
    this.renderer?.dispose();
    this.renderer = null;
    this.view.setStatus(
      "GRAPHICS OFF",
      "Reload to restore the graphics context",
    );
    this.view.notice(
      "The graphics context was lost. Close GPU-heavy tabs and reload the studio.",
    );
    this.updateButtons();
  }

  dispose() {
    this.disposed = true;
    this.generation++;
    this.scheduler.cancel(this.requestId);
    this.face.dispose();
    this.camera.stop();
    this.renderer?.dispose();
    this.view.dispose();
  }
}
