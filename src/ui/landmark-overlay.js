import { CONNECTIONS } from "../core/hand.js";

/** Optional diagnostic overlay. Coordinates arrive already projected into CSS pixels. */
export class LandmarkOverlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.width = 1;
    this.height = 1;
  }

  resize({ width, height, pixelRatio }) {
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  clear() {
    this.context.clearRect(0, 0, this.width, this.height);
  }

  draw(hands, project, enabled) {
    this.clear();
    if (!enabled) return;
    const ctx = this.context;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#d9bb8690";
    ctx.fillStyle = "#fff1c6";
    for (const hand of hands) {
      const points = hand.landmarks.map(project);
      ctx.beginPath();
      for (const [a, b] of CONNECTIONS) {
        ctx.moveTo(points[a].x, points[a].y);
        ctx.lineTo(points[b].x, points[b].y);
      }
      ctx.stroke();
      for (const point of points) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = "10px monospace";
      ctx.fillText(
        `#${hand.id} ${hand.gesture} · pinch ${hand.pinch.toFixed(2)}`,
        points[0].x + 10,
        points[0].y,
      );
    }
  }
}
