// Deliberately synthetic normalized hand for deterministic browser interaction QA.
export function handFixture(gesture = "FIST", gap = 0.2, shift = 0, count = 0) {
  const p = Array.from({ length: 21 }, () => ({
    x: 0.5 + shift,
    y: 0.7,
    z: 0,
  }));
  p[0] = { x: 0.5 + shift, y: 0.9, z: 0 };
  const fingers = [
    [5, 6, 7, 8, 0.39],
    [9, 10, 11, 12, 0.48],
    [13, 14, 15, 16, 0.57],
    [17, 18, 19, 20, 0.66],
  ];
  fingers.forEach(([m, pip, dip, tip, x], i) => {
    p[m] = { x: x + shift, y: 0.68, z: 0 };
    p[pip] = { x: x + shift, y: 0.48, z: 0 };
    p[dip] = { x: x + shift, y: 0.35, z: 0 };
    const extended =
      gesture === "OPEN" ||
      (gesture === "COUNT" && i < count) ||
      (gesture === "ZOOM" && i === 0);
    p[tip] = { x: x + shift, y: extended ? 0.22 : 0.77, z: 0 };
  });
  p[4] = { x: 0.15 + shift, y: 0.65, z: 0 };
  if (gesture === "PINCH" || gesture === "ZOOM") {
    if (gesture === "PINCH") p[8] = { ...p[8], y: 0.3 };
    p[4] = {
      x: p[8].x + (gap * Math.hypot((0.02 * 4) / 3, 0.22)) / (4 / 3),
      y: p[8].y,
      z: 0,
    };
  }
  return p;
}
