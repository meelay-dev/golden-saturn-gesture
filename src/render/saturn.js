// WebGL adapter: render projected interaction targets without classifying hand landmarks.
import * as THREE from "three";
import { clamp, damp, angleDelta } from "../core/math.js";
import {
  pointVertex,
  pointFragment,
  burstVertex,
  burstFragment,
  flareVertex,
  flareFragment,
} from "./shaders.js";
import { PARTICLE_LIGHT_MODES, ENERGY_COLORS } from "./lighting.js";

export const QUALITY = Object.freeze({
  low: { shell: 2000, rings: 3000, sparks: 900, pixelRatio: 1 },
  medium: { shell: 3200, rings: 4800, sparks: 2200, pixelRatio: 1.5 },
  high: { shell: 4500, rings: 7000, sparks: 4200, pixelRatio: 2 },
});
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
function geometry(positions, seeds, velocity) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  if (velocity)
    g.setAttribute("aVelocity", new THREE.Float32BufferAttribute(velocity, 3));
  return g;
}
function pointMaterial(color, size) {
  return new THREE.ShaderMaterial({
    vertexShader: pointVertex,
    fragmentShader: pointFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uPointSize: { value: size },
      uOpacity: { value: 0 },
      uBrightness: { value: 1 },
      uColor: { value: new THREE.Color(color) },
    },
  });
}
export class SaturnRenderer {
  constructor(canvas) {
    const context = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    if (!context)
      throw new Error(
        "WebGL 2 is unavailable. Enable hardware acceleration in Chrome settings, then restart Chrome.",
      );
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      alpha: true,
      antialias: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
    this.camera.position.z = 1200;
    this.planet = new THREE.Group();
    this.scene.add(this.planet);
    this.shellMaterial = pointMaterial("#fff2d6", 2.7);
    this.ringMaterial = pointMaterial("#f1d4a1", 2.2);
    this.rings = new THREE.Group();
    this.planet.add(this.rings);
    this.rings.rotation.x = 0.43;
    this.flareMaterial = new THREE.ShaderMaterial({
      vertexShader: flareVertex,
      fragmentShader: flareFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uStrength: { value: 0 },
        uBrightness: { value: 1 },
        uColor: { value: new THREE.Color("#b4f3ff") },
      },
    });
    this.flare = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      this.flareMaterial,
    );
    this.scene.add(this.flare);
    this.coreMaterial = this.flareMaterial.clone();
    this.core = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      this.coreMaterial,
    );
    this.planet.add(this.core);
    this.palmMaterial = this.flareMaterial.clone();
    this.palmCore = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      this.palmMaterial,
    );
    this.scene.add(this.palmCore);
    this.burstMaterial = new THREE.ShaderMaterial({
      vertexShader: burstVertex,
      fragmentShader: burstFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uAge: { value: 10 },
        uPixelRatio: { value: 1 },
        uPointScale: { value: 1 },
        uRadius: { value: 200 },
        uBrightness: { value: 1 },
        uColor: { value: new THREE.Color("#fff4dc") },
      },
    });
    this.opacity = 0;
    this.scale = 0.8;
    this.ringVisibility = 1;
    this.tilt = 0;
    this.spin = 0;
    this.angularVelocity = 0;
    this.burstTime = -100;
    this.brightness = 0.9;
    this.motionScale = 1;
    this.particleMode = "bright";
    this.positioned = false;
    this.burstNormalized = { x: 0.5, y: 0.5 };
    this.pitch = 0.2;
    this.energyColor = new THREE.Color(ENERGY_COLORS.ivory);
    this.nextColor = new THREE.Color();
    this.burstRadius = 100;
    this.setQuality("medium");
    this.resize(innerWidth, innerHeight);
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.onContextLost?.();
    });
  }
  setQuality(level) {
    this.quality = level;
    const settings = QUALITY[level];
    Object.assign(this.renderer.domElement.dataset, {
      shellPoints: settings.shell,
      ringPoints: settings.rings,
      sparkPoints: settings.sparks,
    });
    this.innerShell?.removeFromParent();
    for (const item of [this.shell, this.ringPoints, this.burst])
      if (item) {
        item.removeFromParent();
        item.geometry.dispose();
      }
    // A fixed maximal sphere sampled evenly gives the same distribution at every quality.
    let positions = [],
      seeds = [];
    for (let i = 0; i < settings.shell; i++) {
      const j = Math.floor((i * 4500) / settings.shell);
      const row = Math.floor(j / 75),
        column = j % 75;
      const y = 1 - (2 * (row + 0.5)) / 60,
        radius = Math.sqrt(1 - y * y),
        angle = (column * Math.PI * 2) / 75 + row * 0.025;
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      seeds.push(hash(j));
    }
    this.shell = new THREE.Points(
      geometry(positions, seeds),
      this.shellMaterial,
    );
    this.planet.add(this.shell);
    this.innerShell = new THREE.Points(this.shell.geometry, this.shellMaterial);
    this.innerShell.scale.setScalar(0.56);
    this.planet.add(this.innerShell);
    positions = [];
    seeds = [];
    for (let i = 0; i < settings.rings; i++) {
      const j = Math.floor((i * 7000) / settings.rings),
        band = j % 4;
      const radius =
        1.46 + band * 0.19 + hash(j + 300) * (band === 1 ? 0.095 : 0.045);
      const theta = j * 2.3999632297;
      positions.push(
        Math.cos(theta) * radius,
        (hash(j + 70) - 0.5) * 0.018,
        Math.sin(theta) * radius,
      );
      seeds.push(hash(j + 21));
    }
    this.ringPoints = new THREE.Points(
      geometry(positions, seeds),
      this.ringMaterial,
    );
    this.rings.add(this.ringPoints);
    positions = [];
    seeds = [];
    const velocities = [];
    for (let i = 0; i < settings.sparks; i++) {
      const theta = hash(i + 52) * Math.PI * 2,
        z = hash(i + 111) * 2 - 1;
      const speed = 0.9 + hash(i + 66) * 3.3,
        r = Math.sqrt(1 - z * z);
      const startRadius = i % 3 === 0 ? 1.6 : 1;
      positions.push(
        Math.cos(theta) * r * startRadius,
        Math.sin(theta) * r * (i % 3 === 0 ? 0.15 : 1),
        z * 0.35,
      );
      seeds.push(hash(i + 48));
      velocities.push(
        Math.cos(theta) * r * speed,
        Math.sin(theta) * r * speed,
        z * speed * 0.3,
      );
    }
    this.burst = new THREE.Points(
      geometry(positions, seeds, velocities),
      this.burstMaterial,
    );
    this.burst.frustumCulled = false;
    this.scene.add(this.burst);
    this.renderer.setPixelRatio(
      Math.min(globalThis.devicePixelRatio || 1, settings.pixelRatio),
    );
    if (this.width) this.resize(this.width, this.height);
  }
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    Object.assign(this.camera, {
      left: -width / 2,
      right: width / 2,
      top: height / 2,
      bottom: -height / 2,
    });
    this.camera.updateProjectionMatrix();
    this.radius = clamp(Math.min(width, height) * 0.19, 75, 145);
  }
  world(point) {
    return { x: point.x - this.width / 2, y: this.height / 2 - point.y };
  }
  triggerBurst(center, time) {
    this.burstNormalized = {
      x: center.x / this.width,
      y: center.y / this.height,
    };
    this.burstTime = time;
    this.burstRadius = this.activeRadius ?? this.radius;
    this.burstMaterial.uniforms.uColor.value.copy(this.energyColor);
    this.flareMaterial.uniforms.uColor.value
      .copy(this.energyColor)
      .lerp(this.coreMaterial.uniforms.uColor.value, 0.35);
  }
  render(target, dt, time) {
    const point = this.world(target.center);
    if (!this.positioned || target.snap) {
      this.planet.position.set(point.x, point.y, 0);
      this.positioned = true;
    }
    this.planet.position.x = damp(this.planet.position.x, point.x, 35, dt);
    this.planet.position.y = damp(this.planet.position.y, point.y, 35, dt);
    this.opacity = damp(
      this.opacity,
      target.opacity,
      target.state === "OPEN" ? 18 : 10,
      dt,
    );
    this.scale = damp(
      this.scale,
      target.scale,
      target.reference ? 14 : 7.5,
      dt,
    );
    this.ringVisibility = damp(
      this.ringVisibility,
      target.ringVisibility ?? 0,
      7,
      dt,
    );
    const delta = angleDelta(this.tilt, target.tilt ?? 0);
    this.angularVelocity = damp(
      this.angularVelocity,
      clamp(delta * 4, -1.1, 1.1),
      3,
      dt,
    );
    this.tilt += delta * (1 - Math.exp(-5 * dt));
    const motionTime = time * this.motionScale;
    this.spin += dt * (0.1 + this.angularVelocity * 0.25) * this.motionScale;
    const base = target.handRadius ?? this.radius;
    this.handRadius =
      target.snap || !this.handRadius
        ? base
        : damp(this.handRadius, base, 14, dt);
    const desiredRadius = this.handRadius * Math.max(0.001, this.scale);
    const radius = target.reference
      ? Math.min(desiredRadius, Math.min(this.width, this.height) * 0.48)
      : desiredRadius;
    this.activeRadius = radius;
    this.planet.scale.setScalar(radius);
    this.shell.rotation.set(
      0.12 + Math.sin(motionTime * 0.17) * 0.06,
      this.spin,
      0.16,
    );
    this.innerShell.rotation.copy(this.shell.rotation);
    this.innerShell.rotation.y = -this.spin * 0.65;
    this.pitch = damp(this.pitch, target.pitch ?? 0.43, 10, dt);
    this.rings.rotation.set(
      this.pitch + Math.sin(motionTime * 0.21) * 0.025,
      0.12,
      -this.tilt * 0.65,
    );
    this.ringPoints.rotation.y = -this.spin * 0.35;
    const pixelRatio = this.renderer.getPixelRatio();
    const lighting =
      PARTICLE_LIGHT_MODES[this.particleMode] ?? PARTICLE_LIGHT_MODES.normal;
    const particleBrightness = this.brightness * lighting.gain;
    const flareBrightness = Math.min(this.brightness, 1.2);
    this.nextColor.set(ENERGY_COLORS[target.color] ?? ENERGY_COLORS.ivory);
    this.energyColor.lerp(this.nextColor, 1 - Math.exp(-8 * dt));
    Object.assign(this.renderer.domElement.dataset, {
      particleMode: this.particleMode,
      particleBrightness: particleBrightness.toFixed(3),
      energyColor: target.color ?? "ivory",
      shellRadius: radius.toFixed(2),
    });
    for (const [material, opacity] of [
      [this.shellMaterial, this.opacity],
      [this.ringMaterial, this.opacity * this.ringVisibility],
    ]) {
      material.uniforms.uTime.value = time;
      material.uniforms.uPixelRatio.value = pixelRatio;
      material.uniforms.uOpacity.value = opacity;
      material.uniforms.uBrightness.value = particleBrightness;
      material.uniforms.uColor.value.copy(this.energyColor);
      material.uniforms.uPointSize.value =
        (material === this.shellMaterial ? 2.7 : 2.2) * lighting.pointScale;
    }
    this.core.scale.set(1.45, 1.45, 1);
    this.coreMaterial.uniforms.uStrength.value = this.opacity * 0.4;
    this.coreMaterial.uniforms.uBrightness.value = flareBrightness;
    const age = time - this.burstTime;
    this.burstMaterial.uniforms.uAge.value = age;
    this.burstMaterial.uniforms.uRadius.value = this.burstRadius * 2.1;
    this.burstMaterial.uniforms.uPixelRatio.value = pixelRatio;
    this.burstMaterial.uniforms.uBrightness.value =
      this.brightness * Math.min(lighting.gain, 2);
    this.burstMaterial.uniforms.uPointScale.value = lighting.pointScale;
    const burstPoint = this.world({
      x: this.burstNormalized.x * this.width,
      y: this.burstNormalized.y * this.height,
    });
    this.burst.position.set(burstPoint.x, burstPoint.y, 40);
    this.flare.position.copy(this.burst.position);
    this.flare.scale.setScalar(this.burstRadius * (3.2 + clamp(age, 0, 1) * 2));
    this.flareMaterial.uniforms.uStrength.value =
      age >= 0 ? Math.exp(-age * 4.5) * 2.8 : 0;
    this.flareMaterial.uniforms.uBrightness.value = flareBrightness;
    this.palmCore.position.set(point.x, point.y, 20);
    this.palmCore.scale.setScalar((target.handRadius ?? this.radius) * 1.3);
    this.palmMaterial.uniforms.uStrength.value = target.palmGlow ?? 0;
    this.palmMaterial.uniforms.uBrightness.value = flareBrightness;
    this.renderer.render(this.scene, this.camera);
  }
  clearBurst() {
    this.burstTime = -100;
  }
  dispose() {
    this.scene.traverse((object) => {
      object.geometry?.dispose();
    });
    for (const material of [
      this.shellMaterial,
      this.ringMaterial,
      this.burstMaterial,
      this.flareMaterial,
      this.coreMaterial,
      this.palmMaterial,
    ])
      material.dispose();
    this.renderer.dispose();
  }
}
