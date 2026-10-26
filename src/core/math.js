// Shared geometry uses CSS/display pixels or normalized camera coordinates, never device pixels.
export const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, rate, dt) =>
  lerp(a, b, 1 - Math.exp(-rate * Math.max(0, dt)));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const angleDelta = (a, b) =>
  Math.atan2(Math.sin(b - a), Math.cos(b - a));

// MediaPipe uses source-image coordinates. Cover crops the scaled source at its center.
export function coverTransform(videoWidth, videoHeight, width, height) {
  const scale = Math.max(
    width / Math.max(1, videoWidth),
    height / Math.max(1, videoHeight),
  );
  return {
    scale,
    offsetX: (width - videoWidth * scale) / 2,
    offsetY: (height - videoHeight * scale) / 2,
  };
}
// Contain preserves the entire camera frame, including in non-16:9 fullscreen views.
export function containTransform(videoWidth, videoHeight, width, height) {
  const scale = Math.min(
    width / Math.max(1, videoWidth),
    height / Math.max(1, videoHeight),
  );
  return {
    scale,
    offsetX: (width - videoWidth * scale) / 2,
    offsetY: (height - videoHeight * scale) / 2,
  };
}
export function mapLandmark(
  point,
  videoWidth,
  videoHeight,
  width,
  height,
  mirror = true,
  fit = "cover",
) {
  const transform = fit === "contain" ? containTransform : coverTransform;
  const { scale, offsetX, offsetY } = transform(
    videoWidth,
    videoHeight,
    width,
    height,
  );
  const x = point.x * videoWidth * scale + offsetX;
  return {
    x: mirror ? width - x : x,
    y: point.y * videoHeight * scale + offsetY,
    z: point.z ?? 0,
  };
}
export function angleAt(a, b, c) {
  const ax = a.x - b.x,
    ay = a.y - b.y,
    az = (a.z ?? 0) - (b.z ?? 0);
  const cx = c.x - b.x,
    cy = c.y - b.y,
    cz = (c.z ?? 0) - (b.z ?? 0);
  return Math.acos(
    clamp(
      (ax * cx + ay * cy + az * cz) /
        Math.max(1e-8, Math.hypot(ax, ay, az) * Math.hypot(cx, cy, cz)),
      -1,
      1,
    ),
  );
}

// Low-lag adaptive position filter: larger intentional motion increases responsiveness.
export class AnchorFilter {
  constructor() {
    this.point = null;
  }
  reset() {
    this.point = null;
  }
  update(point, dt) {
    if (!this.point) return (this.point = { ...point });
    const speed = distance(point, this.point) / Math.max(dt, 1 / 120);
    const rate = clamp(16 + speed * 0.025, 16, 65);
    this.point.x = damp(this.point.x, point.x, rate, dt);
    this.point.y = damp(this.point.y, point.y, rate, dt);
    return { ...this.point };
  }
}
