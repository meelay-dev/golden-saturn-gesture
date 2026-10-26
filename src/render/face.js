// WebGL face adapter: feathered skin masks and clipped iris ellipses share the camera transform.
import * as THREE from "three";
import { FACE_OVAL, RIGHT_EYE, LEFT_EYE, BROWS, MOUTH } from "../core/face.js";
import { containTransform, clamp } from "../core/math.js";
import { faceVertex, faceFragment } from "./face-shaders.js";
import { SKIN_TONES } from "./skin-tones.js";

function polygon(ctx, points, indices, expansion = 1) {
  const outline = indices.map((i) => points[i]);
  const center = outline.reduce(
    (a, p) => ({
      x: a.x + p.x / outline.length,
      y: a.y + p.y / outline.length,
    }),
    { x: 0, y: 0 },
  );
  ctx.beginPath();
  outline.forEach((p, i) =>
    ctx[i ? "lineTo" : "moveTo"](
      center.x + (p.x - center.x) * expansion,
      center.y + (p.y - center.y) * expansion,
    ),
  );
  ctx.closePath();
  ctx.fill();
}

export class FaceRenderer {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.video = video;
    this.mask = document.createElement("canvas");
    this.skin = document.createElement("canvas");
    this.ctx = this.mask.getContext("2d");
    this.skinCtx = this.skin.getContext("2d");
    const context = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    if (!context)
      throw new Error("Face effects need an available WebGL 2 context.");
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      alpha: false,
      antialias: false,
    });
    this.renderer.setPixelRatio(1); // Camera processing resolution is capped independently of particles.
    this.videoTexture = new THREE.VideoTexture(video);
    this.videoTexture.colorSpace = THREE.NoColorSpace;
    this.maskTexture = new THREE.CanvasTexture(this.mask);
    this.maskTexture.minFilter = THREE.LinearFilter;
    this.maskTexture.generateMipmaps = false;
    this.material = new THREE.ShaderMaterial({
      vertexShader: faceVertex,
      fragmentShader: faceFragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uVideo: { value: this.videoTexture },
        uMask: { value: this.maskTexture },
        uSize: { value: new THREE.Vector2(1, 1) },
        uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
        uMirror: { value: 1 },
        uSmooth: { value: 0 },
        uBrighten: { value: 0 },
        uIris: { value: 0 },
        uRadius: { value: 2 },
        uWhitening: { value: 0 },
        uToneLift: { value: 0 },
        uToneTint: { value: new THREE.Vector3(1, 1, 1) },
        uToneSaturation: { value: 1 },
        uEye0: { value: new THREE.Vector2() },
        uAxisX0: { value: new THREE.Vector2() },
        uAxisY0: { value: new THREE.Vector2() },
        uEye1: { value: new THREE.Vector2() },
        uAxisX1: { value: new THREE.Vector2() },
        uAxisY1: { value: new THREE.Vector2() },
      },
    });
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(this.quad);
    this.camera = new THREE.Camera();
    this.lastGeometry = null;
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      canvas.hidden = true;
      this.onContextLost?.();
    });
  }
  resize(width, height, quality = "medium") {
    this.width = width;
    this.height = height;
    const cap = quality === "low" ? 720 : 1280,
      scale = Math.min(1, cap / width, 900 / height);
    this.renderer.setSize(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
      false,
    );
    for (const canvas of [this.mask, this.skin]) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
    }
    // Three textures cannot safely change dimensions after their first GPU upload.
    this.maskTexture.dispose();
    this.maskTexture = new THREE.CanvasTexture(this.mask);
    this.maskTexture.minFilter = THREE.LinearFilter;
    this.maskTexture.generateMipmaps = false;
    this.material.uniforms.uMask.value = this.maskTexture;
    this.maskScale = scale;
    this.material.uniforms.uSize.value.set(width, height);
    this.lastGeometry = null;
  }
  updateMask(face) {
    const ctx = this.ctx,
      skin = this.skinCtx,
      s = this.maskScale;
    skin.setTransform(s, 0, 0, s, 0, 0);
    skin.clearRect(0, 0, this.width, this.height);
    // Slightly inset jaw/forehead contour; do not paint over the background.
    skin.globalCompositeOperation = "source-over";
    skin.fillStyle = "#ff0000";
    polygon(skin, face.points, FACE_OVAL, 0.965);
    skin.globalCompositeOperation = "destination-out";
    skin.fillStyle = "#000";
    for (const contour of [RIGHT_EYE, LEFT_EYE, ...BROWS, MOUTH])
      polygon(skin, face.points, contour, 1.23);
    // Preserve nostril edges while allowing the nose bridge to be retouched.
    for (const index of [98, 327]) {
      const p = face.points[index];
      skin.beginPath();
      skin.ellipse(
        p.x,
        p.y,
        face.width * 0.026,
        face.width * 0.018,
        0,
        0,
        Math.PI * 2,
      );
      skin.fill();
    }
    skin.globalCompositeOperation = "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.mask.width, this.mask.height);
    ctx.filter = `blur(${Math.max(0.65, face.width * 0.005 * s)}px)`;
    ctx.drawImage(this.skin, 0, 0);
    ctx.filter = "none";
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 2; i++) {
      const eye = face.eyes[i];
      ctx.fillStyle =
        i === 0
          ? `rgb(0 ${Math.round(eye.visible * 255)} 0)`
          : `rgb(0 0 ${Math.round(eye.visible * 255)})`;
      polygon(ctx, face.points, i === 0 ? RIGHT_EYE : LEFT_EYE, 0.97);
    }
    ctx.globalCompositeOperation = "source-over";
    this.maskTexture.needsUpdate = true;
  }
  render(face, settings) {
    if (
      !face ||
      settings.original ||
      !this.video.videoWidth ||
      this.video.readyState < 2
    ) {
      this.canvas.hidden = true;
      return false;
    }
    const tone = SKIN_TONES[settings.skinTone] ?? SKIN_TONES.natural,
      whitening = clamp(settings.whitening ?? 0, 0, 1);
    if (
      settings.smooth === 0 &&
      settings.brighten === 0 &&
      settings.iris === 0 &&
      whitening * tone.lift === 0
    ) {
      this.canvas.hidden = true;
      return false;
    }
    const videoSize = `${this.video.videoWidth}x${this.video.videoHeight}`;
    if (this.videoSize !== videoSize) {
      this.videoTexture.dispose();
      this.videoTexture = new THREE.VideoTexture(this.video);
      this.videoTexture.colorSpace = THREE.NoColorSpace;
      this.material.uniforms.uVideo.value = this.videoTexture;
      this.videoSize = videoSize;
    }
    if (this.lastGeometry !== (face.cacheKey ?? face)) {
      this.updateMask(face);
      this.lastGeometry = face.cacheKey ?? face;
    }
    const u = this.material.uniforms,
      { scale, offsetX, offsetY } = containTransform(
        this.video.videoWidth,
        this.video.videoHeight,
        this.width,
        this.height,
      );
    u.uCrop.value.set(
      offsetX / this.width,
      offsetY / this.height,
      (this.video.videoWidth * scale) / this.width,
      (this.video.videoHeight * scale) / this.height,
    );
    u.uMirror.value = settings.mirror ? 1 : 0;
    u.uSmooth.value = clamp(settings.smooth, 0, 1) * face.poseVisibility;
    u.uBrighten.value = clamp(settings.brighten, 0, 1) * face.poseVisibility;
    u.uIris.value = clamp(settings.iris, 0, 1);
    u.uWhitening.value = whitening * face.poseVisibility;
    u.uToneLift.value = tone.lift;
    u.uToneTint.value.set(...tone.tint);
    u.uToneSaturation.value = tone.saturation;
    u.uRadius.value = clamp(face.width * 0.013, 1.25, 5.5);
    face.eyes.forEach((eye, i) => {
      u[`uEye${i}`].value.set(eye.center.x, eye.center.y);
      u[`uAxisX${i}`].value.set(eye.axisX.x, eye.axisX.y);
      u[`uAxisY${i}`].value.set(eye.axisY.x, eye.axisY.y);
    });
    this.canvas.hidden = false;
    this.renderer.render(this.scene, this.camera);
    return true;
  }
  hide() {
    this.canvas.hidden = true;
    this.lastGeometry = null;
  }
  dispose() {
    this.hide();
    this.videoTexture.dispose();
    this.maskTexture.dispose();
    this.quad.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
