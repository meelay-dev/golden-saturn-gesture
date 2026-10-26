import {
  FACE_OVAL,
  RIGHT_EYE,
  LEFT_EYE,
  MOUTH,
  BROWS,
  EYE_CONFIG,
} from "../src/core/face.js";
// Artificial geometry, never a claim of measured human landmarks.
export function faceFixture({ x = 0, y = 0, blink = 0 } = {}) {
  const points = Array.from({ length: 478 }, () => ({
    x: 320 + x,
    y: 250 + y,
    z: 0,
  }));
  FACE_OVAL.forEach((index, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / FACE_OVAL.length;
    points[index] = {
      x: 320 + x + 145 * Math.cos(a),
      y: 240 + y + 190 * Math.sin(a),
      z: 0,
    };
  });
  for (const [contour, cx] of [
    [RIGHT_EYE, 270],
    [LEFT_EYE, 370],
  ])
    contour.forEach((index, i) => {
      const angle = Math.PI - (i * Math.PI * 2) / contour.length;
      points[index] = {
        x: cx + x + 36 * Math.cos(angle),
        y: 210 + y + 14 * Math.sin(angle),
        z: 0,
      };
    });
  MOUTH.forEach((index, i) => {
    const a = Math.PI - (i * Math.PI * 2) / MOUTH.length;
    points[index] = {
      x: 320 + x + 43 * Math.cos(a),
      y: 326 + y + 13 * Math.sin(a),
      z: 0,
    };
  });
  BROWS.forEach((contour, b) =>
    contour.forEach((index, i) => {
      const a = Math.PI - (i * Math.PI * 2) / contour.length;
      points[index] = {
        x: (b ? 370 : 270) + x + 38 * Math.cos(a),
        y: 176 + y + 5 * Math.sin(a),
        z: 0,
      };
    }),
  );
  EYE_CONFIG.forEach((config, i) => {
    const cx = (i ? 370 : 270) + x,
      cy = 210 + y;
    points[config.center] = { x: cx, y: cy, z: 0 };
    config.rim.forEach((index, j) => {
      const a = (-j * Math.PI) / 2;
      points[index] = {
        x: cx + 14 * Math.cos(a),
        y: cy + 15 * Math.sin(a),
        z: 0,
      };
    });
  });
  points[1] = { x: 320 + x, y: 250 + y, z: -0.04 };
  points[98] = { x: 303 + x, y: 275 + y, z: 0 };
  points[327] = { x: 337 + x, y: 275 + y, z: 0 };
  return {
    faceLandmarks: [
      points.map((p) => ({ x: p.x / 640, y: p.y / 480, z: p.z })),
    ],
    faceBlendshapes: [
      {
        categories: [
          { categoryName: "eyeBlinkRight", score: blink },
          { categoryName: "eyeBlinkLeft", score: blink },
        ],
      },
    ],
  };
}
export function paintFaceFixture(ctx) {
  ctx.fillStyle = "#344b36";
  ctx.fillRect(0, 0, 640, 480);
  ctx.fillStyle = "#a77b64";
  ctx.beginPath();
  ctx.ellipse(320, 240, 145, 190, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#89634e";
  ctx.lineWidth = 1;
  for (let y = 112; y < 145; y += 5) {
    ctx.beginPath();
    ctx.moveTo(264, y);
    ctx.quadraticCurveTo(320, y + 4, 376, y);
    ctx.stroke();
  }
  for (const cx of [270, 370]) {
    ctx.fillStyle = "#d9d5c9";
    ctx.beginPath();
    ctx.ellipse(cx, 210, 36, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#716044";
    ctx.beginPath();
    ctx.ellipse(cx, 210, 14, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#090a0a";
    ctx.beginPath();
    ctx.arc(cx, 210, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f8f8f2";
    ctx.beginPath();
    ctx.arc(cx - 5, 205, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#372b26";
    ctx.beginPath();
    ctx.ellipse(cx, 176, 38, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#81504c";
  ctx.beginPath();
  ctx.ellipse(320, 326, 43, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#563e34";
  for (const x of [303, 337]) {
    ctx.beginPath();
    ctx.ellipse(x, 275, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
