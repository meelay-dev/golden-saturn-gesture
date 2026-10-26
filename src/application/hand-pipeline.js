import {
  AnchorFilter,
  clamp,
  containTransform,
  mapLandmark,
} from "../core/math.js";
import { Interaction, ReferenceInteraction } from "../core/interaction.js";
import { demoHands, referenceDemoHands } from "../core/demo.js";
import { HandTracker } from "../core/hand.js";

/** Coordinates hand inference and pure interaction rules through an injected camera port. */
export class HandPipeline {
  constructor(camera) {
    this.camera = camera;
    this.tracker = new HandTracker();
    this.classic = new Interaction();
    this.reference = new ReferenceInteraction();
    this.filter = new AnchorFilter();
    this.reset();
  }

  reset() {
    this.resetInteraction();
    this.tracker.reset();
    this.hands = [];
    this.lastDetection = 0;
    this.lastInference = 0;
  }

  resetInteraction() {
    this.classic.reset();
    this.reference.reset();
    this.resetProjection();
  }

  resetProjection() {
    this.filter.reset();
  }

  /** Projects normalized, unmirrored model coordinates into stage CSS pixels. */
  project(point) {
    const { mode, viewport, settings } = this.context;
    const source = this.camera.dimensions;
    if (mode === "camera" && source.width) {
      return mapLandmark(
        point,
        source.width,
        source.height,
        viewport.width,
        viewport.height,
        settings.mirror,
        "contain",
      );
    }
    return { x: point.x * viewport.width, y: point.y * viewport.height };
  }

  /** Time is seconds for domain rules; only the model receives milliseconds. */
  update(context) {
    this.context = context;
    const {
      mode,
      starting,
      stopped,
      now,
      milliseconds,
      dt,
      settings,
      viewport,
      demoStart,
    } = context;
    let processedHands = false;
    if (mode === "demo") {
      this.hands =
        settings.gestureMode === "reference"
          ? referenceDemoHands(now - demoStart)
          : demoHands(now - demoStart, viewport.width, 0.5);
    }
    const interval = this.camera.delegate === "CPU" ? 1 / 20 : 1 / 30;
    if (
      mode === "camera" &&
      !starting &&
      now - this.lastDetection >= interval
    ) {
      this.lastDetection = now;
      const result = this.camera.detect(milliseconds);
      if (result) {
        const source = this.camera.dimensions;
        this.hands = this.tracker.update(
          result,
          now,
          source.width / Math.max(1, source.height),
        );
        this.lastInference = now;
        processedHands = true;
      } else if (now - this.lastInference > 0.15) {
        // Repeated video frames must not keep a vanished hand alive indefinitely.
        this.hands = [];
      }
    }
    const output =
      settings.gestureMode === "reference"
        ? this.reference.update(this.hands, now, {
          side: mode === "demo" ? "auto" : settings.controlSide,
          mirror: settings.mirror,
        })
        : this.classic.update(this.hands, now);
    let target;
    if (mode === "idle" && !stopped) {
      target = {
        center: { x: viewport.width / 2, y: viewport.height / 2 },
        scale: viewport.width < 761 ? 0.9 : 1.12,
        opacity: 0.82,
        ringVisibility: 1,
        tilt: -0.12,
      };
    } else {
      if (output.snap) this.resetProjection();
      target = {
        ...output,
        center: this.filter.update(this.project(output.center), dt),
      };
      if (output.handRadius) {
        const source = this.camera.dimensions;
        const imageHeight =
          mode === "camera" && source.width
            ? source.height *
            containTransform(
              source.width,
              source.height,
              viewport.width,
              viewport.height,
            ).scale
            : viewport.height;
        target.handRadius = clamp(
          output.handRadius * imageHeight,
          12,
          viewport.height * 0.28,
        );
      }
      if (mode === "camera" && settings.mirror) target.tilt = -target.tilt;
    }
    const events = output.events.map((event) => ({
      ...event,
      center: this.project(event.center),
    }));
    return { hands: this.hands, output, target, events, processedHands };
  }
}
