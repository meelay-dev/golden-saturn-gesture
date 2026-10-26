import { clamp, damp, distance, midpoint } from "./math.js";

// Ordered contours from the MediaPipe Face Landmarker topology, in unmirrored input coordinates.
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109,
];
export const RIGHT_EYE = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
];
export const LEFT_EYE = [
  362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384,
  398,
];
export const MOUTH = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37,
  39, 40, 185,
];
export const BROWS = [
  [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  [336, 296, 334, 293, 300, 276, 283, 282, 295, 285],
];
export const EYE_CONFIG = [
  {
    center: 468,
    rim: [469, 470, 471, 472],
    contour: RIGHT_EYE,
    corners: [33, 133],
    lids: [159, 145],
    blink: "eyeBlinkRight",
  },
  {
    center: 473,
    rim: [474, 475, 476, 477],
    contour: LEFT_EYE,
    corners: [362, 263],
    lids: [386, 374],
    blink: "eyeBlinkLeft",
  },
];
const smoothstep = (low, high, x) => {
  const t = clamp((x - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
};

export function irisGeometry(points, config, blink = 0) {
  const center = points[config.center],
    [a, b, c, d] = config.rim.map((i) => points[i]);
  const axisX = { x: (a.x - c.x) / 2, y: (a.y - c.y) / 2 };
  const axisY = { x: (b.x - d.x) / 2, y: (b.y - d.y) / 2 };
  const determinant = axisX.x * axisY.y - axisY.x * axisX.y;
  const width = distance(points[config.corners[0]], points[config.corners[1]]);
  const openness =
    distance(points[config.lids[0]], points[config.lids[1]]) /
    Math.max(width, 1e-5);
  const visible =
    smoothstep(0.09, 0.18, openness) * (1 - smoothstep(0.35, 0.8, blink));
  return {
    center,
    axisX,
    axisY,
    visible: Math.abs(determinant) < 0.75 || width < 10 ? 0 : visible,
    contour: config.contour.map((i) => points[i]),
  };
}

export class FaceTracker {
  constructor() {
    this.reset();
  }
  reset() {
    this.landmarks = null;
    this.blendshapes = {};
    this.lastSeen = -Infinity;
    this.lastUpdate = 0;
  }
  update(result, time) {
    const points = result.faceLandmarks?.[0];
    if (
      !points ||
      points.length < 478 ||
      points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
    ) {
      this.reset();
      return false;
    }
    const dt = clamp(time - this.lastUpdate, 1 / 120, 0.15);
    const jump = this.landmarks
      ? distance(
          midpoint(points[234], points[454]),
          midpoint(this.landmarks[234], this.landmarks[454]),
        )
      : Infinity;
    const width = distance(points[234], points[454]);
    if (!this.landmarks || jump > Math.max(0.04, width * 0.22))
      this.landmarks = points.map((p) => ({ ...p }));
    else
      this.landmarks = points.map((p, i) => {
        const prior = this.landmarks[i],
          speed = distance(p, prior) / dt;
        const rate = clamp(38 + speed * 120, 38, 95);
        return {
          x: damp(prior.x, p.x, rate, dt),
          y: damp(prior.y, p.y, rate, dt),
          z: p.z ?? 0,
        };
      });
    this.blendshapes = Object.fromEntries(
      (result.faceBlendshapes?.[0]?.categories ?? []).map((c) => [
        c.categoryName,
        c.score,
      ]),
    );
    this.lastSeen = time;
    this.lastUpdate = time;
    return true;
  }
  project(map, time) {
    // No frozen eyes during dropouts. A positive no-face result resets immediately.
    if (!this.landmarks || time - this.lastSeen > 0.16) return null;
    const points = this.landmarks.map(map);
    const width = distance(points[234], points[454]);
    if (width < 55) return null;
    const cheeks = midpoint(points[234], points[454]);
    const yaw = Math.abs(points[1].x - cheeks.x) / Math.max(width, 1);
    const poseVisibility = 1 - smoothstep(0.22, 0.4, yaw);
    return {
      points,
      width,
      poseVisibility,
      eyes: EYE_CONFIG.map((config) => {
        const eye = irisGeometry(
          points,
          config,
          this.blendshapes[config.blink] ?? 0,
        );
        eye.visible *= poseVisibility;
        return eye;
      }),
    };
  }
}
