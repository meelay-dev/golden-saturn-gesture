// Pure hand geometry and identity tracking; independent of camera/model implementations.
import { distance, midpoint, angleAt } from "./math.js";

export const GESTURE_CONFIG = Object.freeze({
  pinchEnter: 0.38,
  pinchExit: 0.53,
  stableFrames: 3,
  maxMatchDistance: 0.42,
  identityHold: 0.55,
});
const FINGERS = [
  [5, 6, 8],
  [9, 10, 12],
  [13, 14, 16],
  [17, 18, 20],
];
export const CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

export function measureHand(
  landmarks,
  wasPinching = false,
  config = GESTURE_CONFIG,
  aspectRatio = 1,
) {
  // Distances must be isotropic: normalized image X and Y have different pixel scales.
  const metric = landmarks.map((p) => ({
    x: p.x * aspectRatio,
    y: p.y,
    z: (p.z ?? 0) * aspectRatio,
  }));
  const palmSize = Math.max(distance(metric[0], metric[9]), 1e-5);
  const pinch = distance(metric[4], metric[8]) / palmSize;
  const extended = FINGERS.map(([mcp, pip, tip]) => {
    const straight = angleAt(metric[mcp], metric[pip], metric[tip]) > 2.4;
    const reach =
      distance(metric[tip], metric[0]) > distance(metric[pip], metric[0]) * 1.1;
    return straight && reach;
  });
  const extendedCount = extended.filter(Boolean).length;
  let gesture = "TRACK";
  if (pinch < (wasPinching ? config.pinchExit : config.pinchEnter))
    gesture = "PINCH";
  else if (extendedCount === 4) gesture = "OPEN";
  else if (extended[0] && extendedCount <= 2 && pinch > 0.53) gesture = "ZOOM";
  else if (extendedCount <= 1) {
    // Require folded geometry, not just a failed extension test in foreshortened views.
    const curled = FINGERS.filter(
      ([mcp, pip, tip]) =>
        distance(metric[tip], metric[0]) <
          distance(metric[pip], metric[0]) * 1.04 ||
        angleAt(metric[mcp], metric[pip], metric[tip]) < 1.9,
    ).length;
    if (curled >= 3) gesture = "FIST";
  }
  const knuckles = [5, 9, 13, 17].reduce(
    (p, i) => ({ x: p.x + landmarks[i].x / 4, y: p.y + landmarks[i].y / 4 }),
    { x: 0, y: 0 },
  );
  const gripAnchor = {
    x: knuckles.x + (knuckles.x - landmarks[0].x) * 0.5,
    y: knuckles.y + (knuckles.y - landmarks[0].y) * 0.5,
  };
  const roll = Math.atan2(metric[9].x - metric[0].x, metric[0].y - metric[9].y);
  return {
    gesture,
    pinch,
    extendedCount,
    fingers: extended,
    palm: midpoint(landmarks[0], landmarks[9]),
    anchor: midpoint(landmarks[4], landmarks[8]),
    gripAnchor,
    palmSize,
    roll,
  };
}

export class HandTracker {
  constructor(config = {}) {
    this.config = { ...GESTURE_CONFIG, ...config };
    this.reset();
  }
  reset() {
    this.tracks = [];
    this.nextId = 1;
  }
  update(result, time, aspectRatio = 1) {
    this.tracks = this.tracks.filter(
      (track) => time - track.lastSeen < this.config.identityHold,
    );
    const inputs = (result.landmarks ?? [])
      .filter(
        (points) =>
          points?.length === 21 &&
          points.every(
            (p) =>
              Number.isFinite(p.x) &&
              Number.isFinite(p.y) &&
              Number.isFinite(p.z ?? 0),
          ),
      )
      .slice(0, 2)
      .map((landmarks, i) => ({
        landmarks,
        handedness: result.handedness?.[i]?.[0]?.categoryName ?? "Unknown",
        confidence: result.handedness?.[i]?.[0]?.score ?? 0,
        palm: midpoint(landmarks[0], landmarks[9]),
      }));
    // Global greedy nearest pairs avoid array-order identity swaps. Handedness is a weak hint.
    const pairs = inputs.flatMap((input, i) =>
      this.tracks.map((track, j) => ({
        i,
        j,
        cost:
          distance(input.palm, track.palm) +
          (input.handedness === track.handedness ? 0 : 0.035),
      })),
    );
    pairs.sort((a, b) => a.cost - b.cost);
    const assigned = new Map(),
      used = new Set();
    for (const pair of pairs)
      if (
        pair.cost < this.config.maxMatchDistance &&
        !assigned.has(pair.i) &&
        !used.has(pair.j)
      ) {
        assigned.set(pair.i, this.tracks[pair.j]);
        used.add(pair.j);
      }
    return inputs.map((input, i) => {
      let track = assigned.get(i);
      if (!track) {
        track = {
          id: this.nextId++,
          gesture: "TRACK",
          candidate: "TRACK",
          count: 0,
        };
        this.tracks.push(track);
      }
      const measured = measureHand(
        input.landmarks,
        track.gesture === "PINCH",
        this.config,
        aspectRatio,
      );
      if (measured.gesture === track.candidate) track.count++;
      else {
        track.candidate = measured.gesture;
        track.count = 1;
      }
      if (track.count >= this.config.stableFrames)
        track.gesture = track.candidate;
      if (track.fingerCandidate === measured.extendedCount)
        track.fingerFrames++;
      else {
        track.fingerCandidate = measured.extendedCount;
        track.fingerFrames = 1;
      }
      if (track.fingerFrames >= this.config.stableFrames)
        track.fingerCount = track.fingerCandidate;
      Object.assign(track, input, { lastSeen: time });
      return {
        ...measured,
        ...input,
        id: track.id,
        gesture: track.gesture,
        fingerCount: track.fingerCount ?? 0,
      };
    });
  }
}
