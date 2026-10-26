import { LandmarkOverlay } from "./landmark-overlay.js";
import { saveFrame } from "./frame-export.js";

const CAPTIONS = {
  PINCH: "Pinch to hold a little world of light.",
  ZOOM: "Spread thumb and index to enlarge. Bring them closer to shrink.",
  OPEN: "Let go. Watch the light unfold.",
  TWO_HANDS: "More space. A bigger universe.",
  FIST: "Close your fist to hold a spinning world.",
  HOLD: "Finding your hands…",
  TRACK: "Close one fist or pinch thumb and index.",
  IDLE: "A small gesture. An entire universe.",
};
const GUIDES = {
  reference: [
    ["FIST", "Closed fist", "Hold & spin the globe"],
    ["OPEN", "Open palm", "Release the light"],
    ["ZOOM", "Thumb + index", "Spread to zoom · pinch to shrink"],
    ["COLOR", "Other hand", "1–4 fingers change colour"],
  ],
  classic: [
    ["PINCH", "Pinch", "Summon & move"],
    ["OPEN", "Open palm", "Release the light"],
    ["TWO_HANDS", "Two hands", "Expand & orbit"],
    ["FIST", "Close fist", "Bring it all back"],
  ],
};

/** DOM adapter: translates controls into settings and renders application view models. */
export class StudioView {
  constructor({
    root = document,
    particleModes,
    skinTones,
    reducedMotion = false,
  }) {
    this.root = root;
    this.particleModes = particleModes;
    this.skinTones = skinTones;
    this.$ = (id) => root.getElementById(id);
    this.elements = {
      video: this.$("webcam"),
      canvas: this.$("universe"),
      stage: this.$("camera-stage"),
      faceCanvas: this.$("face-effects"),
      skeleton: this.$("landmarks"),
    };
    this.overlay = new LandmarkOverlay(this.elements.skeleton);
    this.listeners = [];
    if (reducedMotion) {
      this.$("brightness").value = "40";
      this.$("brightness-value").textContent = "40%";
      this.$("particle-mode").value = "normal";
    }
    this.updateFaceControls();
    this.updateParticleHint();
    this.updateGestureGuide();
  }

  getSettings() {
    const checked = (id) => this.$(id).checked,
      percentage = (id) => Number(this.$(id).value) / 100;
    const mirror = checked("mirror");
    return {
      gestureMode: this.$("gesture-mode").value,
      controlSide: this.$("control-side").value,
      quality: this.$("quality").value,
      mirror,
      showLandmarks: checked("show-landmarks"),
      brightness: percentage("brightness"),
      particleMode: this.$("particle-mode").value,
      faceEnabled: checked("face-enabled"),
      face: {
        smooth: percentage("face-smooth"),
        brighten: percentage("face-brighten"),
        iris: percentage("iris-strength"),
        mirror,
        original: checked("face-original"),
        skinTone: this.$("skin-tone").value,
        whitening: percentage("skin-whitening"),
      },
    };
  }

  listen(target, event, handler) {
    target.addEventListener(event, handler);
    this.listeners.push(() => target.removeEventListener(event, handler));
  }

  bind(actions) {
    const click = (id, action) => this.listen(this.$(id), "click", action);
    click("enable-camera", actions.camera);
    click("demo", actions.demo);
    click("stop", actions.stop);
    click("save-frame", actions.save);
    click("dismiss-notice", () => this.hideNotice());
    click("fullscreen", () => void this.fullscreen());
    this.listen(this.$("face-enabled"), "change", () => {
      this.updateFaceControls();
      actions.face();
    });
    for (const id of [
      "brightness",
      "face-smooth",
      "face-brighten",
      "iris-strength",
      "skin-whitening",
    ]) {
      this.listen(this.$(id), "input", () => {
        this.$(`${id}-value`).textContent = `${this.$(id).value}%`;
      });
    }
    this.listen(this.$("skin-tone"), "change", () => {
      this.$("skin-tone-hint").textContent =
        this.skinTones[this.$("skin-tone").value].description;
    });
    this.listen(this.$("mirror"), "change", () => {
      this.elements.video.style.transform = this.$("mirror").checked
        ? "scaleX(-1)"
        : "none";
      actions.projection();
    });
    this.listen(this.$("particle-mode"), "change", () =>
      this.updateParticleHint(),
    );
    this.listen(this.$("gesture-mode"), "change", () => {
      this.updateGestureGuide();
      actions.gestureMode();
    });
    this.listen(this.$("control-side"), "change", actions.controlSide);
    this.listen(this.$("quality"), "change", actions.quality);
    this.listen(this.elements.video, "resize", actions.projection);
    this.listen(this.elements.video, "loadedmetadata", actions.projection);
    this.listen(this.root, "fullscreenchange", () => {
      this.$("fullscreen").title = this.root.fullscreenElement
        ? "Press Esc to exit fullscreen"
        : "Fullscreen camera · Esc to return";
      actions.resize();
    });
    this.listen(globalThis, "resize", actions.resize);
    this.listen(globalThis, "pagehide", actions.dispose);
    this.observer = new ResizeObserver(actions.resize);
    this.observer.observe(this.elements.stage);
  }

  getViewport() {
    return {
      width: Math.max(1, this.elements.stage.clientWidth),
      height: Math.max(1, this.elements.stage.clientHeight),
      pixelRatio: Math.min(globalThis.devicePixelRatio || 1, 2),
    };
  }

  updateFaceControls() {
    for (const id of [
      "face-smooth",
      "face-brighten",
      "iris-strength",
      "face-original",
      "skin-tone",
      "skin-whitening",
    ]) {
      this.$(id).disabled = !this.$("face-enabled").checked;
    }
  }

  updateParticleHint() {
    this.$("particle-hint").textContent =
      this.particleModes[this.$("particle-mode").value].description;
  }

  updateGestureGuide() {
    const mode = this.$("gesture-mode").value;
    this.$("gesture-hint").textContent =
      mode === "reference"
        ? "Raise the controlling hand first, or choose its starting side. Thumb + index spacing zooms; open palm releases. Other hand: 1 ivory · 2 cyan · 3 violet · 4 gold."
        : "Pinch to summon; open to release; fist to collapse. Two pinches or two open palms control scale together.";
    this.$("control-side").disabled = mode !== "reference";
    this.root.querySelectorAll(".gesture-card").forEach((card, index) => {
      const [gesture, title, description] = GUIDES[mode][index];
      card.dataset.gesture = gesture;
      card.querySelector("strong").textContent = title;
      card.querySelector("div > span").textContent = description;
    });
  }

  notice(message) {
    this.$("notice-text").textContent = message;
    this.$("notice").hidden = false;
  }
  hideNotice() {
    this.$("notice").hidden = true;
  }
  faceStatus(message) {
    if (this.$("face-status").textContent !== message)
      this.$("face-status").textContent = message;
  }
  setLoadingStatus(message) {
    this.$("status-text").textContent = message;
  }
  setCameraActive(active) {
    this.root.body.classList.toggle("camera", active);
  }
  setDelegate(delegate) {
    this.$("delegate").textContent = delegate;
  }

  setStatus(label, text, live = false) {
    this.$("mode").textContent = label;
    this.$("status-text").textContent = text;
    this.$("status-dot").classList.toggle("live", live);
  }

  updateButtons({ mode, starting, hasRenderer }) {
    this.$("stop").disabled = mode === "idle" && !starting;
    this.$("enable-camera").disabled =
      starting || mode === "camera" || !hasRenderer;
    this.$("enable-camera").querySelector("span").textContent = starting
      ? "Starting camera…"
      : mode === "camera"
        ? "Camera enabled"
        : "Enable webcam";
    this.$("demo").disabled = !hasRenderer;
    this.$("demo").innerHTML =
      mode === "demo"
        ? '<span class="play">↻</span> Restart scripted demo'
        : '<span class="play">▷</span> Demo effects without webcam';
    this.$("save-frame").disabled = !hasRenderer;
  }

  updateResolution({ capture, preview }) {
    this.$("capture-resolution").textContent = capture
      ? `${capture.width} × ${capture.height}`
      : "Off";
    this.$("preview-resolution").textContent =
      `${preview.width} × ${preview.height}`;
  }

  resizeLandmarks(viewport) {
    this.overlay.resize(viewport);
  }
  clearLandmarks() {
    this.overlay.clear();
  }
  drawLandmarks(hands, project, mode, enabled) {
    this.overlay.draw(hands, project, enabled && mode === "camera");
  }

  renderHud({ mode, stopped, output, hands, fps, quality, gestureMode }) {
    const state = output?.state ?? "IDLE";
    this.$("gesture").textContent = state;
    this.$("hands").textContent = String(hands.length).padStart(2, "0");
    this.$("fps").textContent = fps ? String(Math.round(fps)) : "—";
    this.$("hand-control").textContent = output?.primaryId
      ? `HAND #${output.primaryId} · OTHER ${output.secondaryFingers} FINGERS · ${output.color.toUpperCase()}`
      : "—";
    this.$("stage-name").textContent =
      mode === "demo"
        ? "DEMO / SCRIPTED ANIMATION"
        : mode === "camera"
          ? "LIVE / GESTURE TRACKING"
          : stopped
            ? "STUDIO / STOPPED"
            : "SATURN / PARTICLE STUDY";
    this.$("stage-caption").textContent =
      state === "FIST" && gestureMode === "classic"
        ? "Every universe begins again."
        : (CAPTIONS[state] ?? CAPTIONS.IDLE);
    for (const card of this.root.querySelectorAll(".gesture-card"))
      card.classList.toggle(
        "active",
        mode !== "idle" && card.dataset.gesture === state,
      );
    this.root.body.dataset.mode = mode;
    this.root.body.dataset.gesture = state;
    this.elements.canvas.dataset.quality = quality;
  }

  async fullscreen() {
    try {
      if (this.root.fullscreenElement) await this.root.exitFullscreen();
      else if (this.elements.stage.requestFullscreen)
        await this.elements.stage.requestFullscreen();
      else
        this.notice(
          "Fullscreen is unavailable in this browser window. Open the app in Chrome.",
        );
    } catch (error) {
      this.notice(`Fullscreen was unavailable. ${error.message}`);
    }
  }

  saveFrame(mode) {
    const settings = this.getSettings();
    saveFrame({
      ...this.elements,
      mode,
      mirror: settings.mirror,
      showLandmarks: settings.showLandmarks,
      onError: (message) => this.notice(message),
    });
  }

  dispose() {
    this.observer?.disconnect();
    for (const remove of this.listeners.splice(0)) remove();
  }
}
