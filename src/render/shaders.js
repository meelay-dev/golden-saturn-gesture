// GLSL programs run on the GPU; input positions are planet-local or projected stage coordinates.
export const pointVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uPointSize;
  varying float vSeed;
  varying float vDepth;
  void main() {
    vSeed = aSeed;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vDepth = clamp(0.66 + (view.z + 1200.0) * 0.0015, 0.32, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = uPixelRatio * uPointSize * (0.7 + aSeed * 0.8);
  }
`;
export const pointFragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uBrightness;
  uniform vec3 uColor;
  varying float vSeed;
  varying float vDepth;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = exp(-d * d * 10.0);
    float glow = exp(-d * d * 3.6) * 0.32;
    float twinkle = 0.88 + 0.12 * sin(uTime * 1.1 + vSeed * 40.0);
    gl_FragColor = vec4(uColor * (1.0 + core * 0.3), (core + glow) * uOpacity * uBrightness * vDepth * twinkle);
  }
`;
export const burstVertex = /* glsl */ `
  attribute vec3 aVelocity;
  attribute float aSeed;
  uniform float uAge;
  uniform float uPixelRatio;
  uniform float uPointScale;
  uniform float uRadius;
  varying float vLife;
  varying float vSeed;
  void main() {
    float age = max(0.0, uAge);
    float travel = (1.0 - exp(-age * 2.6)) / 2.6;
    vec3 p = position*uRadius*.32 + aVelocity * travel * uRadius;
    p.y -= age * age * uRadius * 0.045;
    float mainLife = pow(max(0.0, 1.0 - age / (0.9 + aSeed * 0.5)), 1.7);
    float suspended = (.12+aSeed*.18) * exp(-age * 0.35) * max(0.0, 1.0 - age / 5.8);
    vLife = max(mainLife, suspended);
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (.9 + aSeed * 1.6) * uPixelRatio * uPointScale * (0.8 + vLife);
  }
`;
export const burstFragment = /* glsl */ `
  uniform float uBrightness;
  uniform vec3 uColor;
  varying float vLife;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    vec3 color = mix(uColor,vec3(1.0),vSeed*.5);
    gl_FragColor = vec4(color, exp(-d*d*4.5) * vLife * uBrightness);
  }
`;
export const flareVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
export const flareFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uStrength;
  uniform float uBrightness;
  uniform vec3 uColor;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p);
    float halo = exp(-d*d*7.0) * 0.34;
    float core = exp(-d*d*48.0);
    float rays = exp(-abs(p.y)*100.0) * exp(-abs(p.x)*5.0) * 0.18;
    vec3 color = mix(uColor, vec3(1.0), core);
    gl_FragColor = vec4(color, (halo + core + rays) * uStrength * uBrightness);
  }
`;
