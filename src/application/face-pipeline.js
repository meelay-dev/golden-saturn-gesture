import { FaceTracker } from "../core/face.js";

/** Owns optional face tracking; its failures never stop hand tracking or the webcam. */
export class FacePipeline {
  constructor({ vision, loadRenderer, onStatus = () => { } }) {
    this.vision = vision;
    this.loadRenderer = loadRenderer;
    this.onStatus = onStatus;
    this.tracker = new FaceTracker();
    this.epoch = 0;
    this.loading = false;
    this.projected = null;
    this.projectionKey = "";
    this.lastDetection = 0;
  }

  stop() {
    this.epoch++;
    this.loading = false;
    this.vision.stop();
    this.tracker.reset();
    this.projected = null;
    this.invalidateProjection();
    this.renderer?.hide();
  }

  async start({ enabled, mode, starting, viewport, quality }) {
    this.stop();
    if (!enabled)
      return this.onStatus("Face effects off · enable with a live webcam.");
    if (mode !== "camera" || starting)
      return this.onStatus(
        "Ready · enable webcam to start face tracking. Demo has no face inference.",
      );
    const epoch = this.epoch;
    this.loading = true;
    this.onStatus("Loading local face model…");
    try {
      if (!this.renderer) {
        // Load a constructor first, so cancellation can prevent GPU allocation entirely.
        const createRenderer = await this.loadRenderer();
        if (epoch !== this.epoch) return;
        this.renderer = createRenderer();
        this.renderer.onContextLost = () => {
          this.stop();
          this.onStatus(
            "Face graphics unavailable · reload to retry. Webcam and hand effects remain available.",
          );
        };
      }
      this.resize(viewport, quality);
      if (!(await this.vision.start()) || epoch !== this.epoch) return;
      this.loading = false;
      this.lastDetection = 0;
      this.onStatus(`Looking for a face · ${this.vision.delegate}`);
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.stop();
      this.onStatus(
        `Face effects unavailable: ${error.message} Toggle face effects off/on to retry.`,
      );
    }
  }

  invalidateProjection() {
    this.projectionKey = "";
  }

  resize(viewport, quality) {
    this.renderer?.resize(viewport.width, viewport.height, quality);
    this.invalidateProjection();
  }

  update({
    mode,
    starting,
    now,
    milliseconds,
    quality,
    processedHands,
    viewport,
    project,
    settings,
  }) {
    if (
      mode !== "camera" ||
      starting ||
      !settings.faceEnabled ||
      this.loading ||
      !this.vision.isReady
    )
      return;
    const interval =
      quality === "low"
        ? 1 / 12
        : this.vision.delegate === "CPU"
          ? 1 / 15
          : 1 / 24;
    // Share the main thread: prefer frames without hand inference, with a bounded wait.
    if (
      now - this.lastDetection >= interval &&
      (!processedHands || now - this.lastDetection > 0.12)
    ) {
      this.lastDetection = now;
      try {
        const result = this.vision.detect(milliseconds);
        if (result) this.tracker.update(result, now);
      } catch (error) {
        this.stop();
        this.onStatus(
          `Face tracking stopped: ${error.message} Toggle face effects off/on to retry.`,
        );
        return;
      }
    }
    const key = `${this.tracker.lastSeen}:${viewport.width}:${viewport.height}:${settings.mirror}`;
    if (key !== this.projectionKey) {
      this.projected = this.tracker.project(project, now);
      this.projectionKey = key;
      if (this.projected) this.projected.cacheKey = key;
    }
    if (now - this.tracker.lastSeen > 0.16) this.projected = null;
    this.renderer?.render(this.projected, settings.face);
    this.onStatus(
      this.projected
        ? `${settings.face.original ? "Original view" : "Face tracking"} · ${this.vision.delegate}`
        : `No face detected · face the camera · ${this.vision.delegate}`,
    );
  }

  dispose() {
    this.stop();
    this.renderer?.dispose();
  }
}
