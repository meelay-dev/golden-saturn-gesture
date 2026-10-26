// Synthetic inputs exercise the SAME interaction state machine as actual hand inference.
export const DEMO_DURATION = 15;
export function demoHands(
  time,
  width = 1200,
  centerX = width < 760 ? 0.5 : 0.63,
) {
  const t = time % DEMO_DURATION;
  const cx = centerX;
  const hand = (id, gesture, x, y) => ({
    id,
    gesture,
    palm: { x, y },
    anchor: { x, y: y - 0.035 },
  });
  if (t < 3.8)
    return [
      hand(
        1,
        "PINCH",
        cx + Math.sin(t * 1.5) * 0.065,
        0.43 + Math.cos(t) * 0.045,
      ),
    ];
  if (t < 6.3)
    return [hand(1, "OPEN", cx, 0.43), hand(2, "FIST", cx + 0.22, 0.57)];
  if (t < 7.8) return [hand(1, "PINCH", cx, 0.43)];
  if (t < 12.3) {
    const separation = 0.15 + Math.sin(((t - 7.8) / 4.5) * Math.PI) * 0.105;
    const tilt = Math.sin(t * 0.65) * 0.065;
    return [
      hand(1, "PINCH", cx - separation, 0.44 + tilt),
      hand(2, "PINCH", cx + separation, 0.44 - tilt),
    ];
  }
  if (t < 13.6) return [hand(1, "FIST", cx, 0.44)];
  return [];
}

export function referenceDemoHands(time) {
  const t = time % 12;
  const hand = (gesture, pinch = 0.2) => ({
    id: 1,
    gesture,
    pinch,
    palmSize: 0.18,
    roll: Math.sin(t) * 0.18,
    palm: { x: 0.42, y: 0.56 },
    anchor: { x: 0.42 + Math.sin(t * 0.9) * 0.035, y: 0.43 },
    gripAnchor: { x: 0.42, y: 0.43 },
  });
  const secondary = {
    id: 2,
    gesture: "FIST",
    fingerCount: t < 1 ? 0 : t < 2 ? 2 : 3,
    palm: { x: 0.78, y: 0.64 },
  };
  if (t < 2.5) return [hand("FIST"), secondary];
  if (t < 7.2) return [hand("OPEN"), secondary];
  if (t < 8.6) return [hand("PINCH"), secondary];
  if (t < 10.8)
    return [hand("ZOOM", 0.4 + (Math.sin((t - 8.6) * 5) * 0.5 + 0.5) * 1.85)];
  if (t < 11.3) return [hand("FIST")];
  return [];
}
