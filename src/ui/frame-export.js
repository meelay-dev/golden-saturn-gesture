import { containTransform } from "../core/math.js";

/** Local PNG adapter: camera → visible face retouch → particles → optional hand diagnostics. */
export function saveFrame({
  video,
  canvas,
  faceCanvas,
  skeleton,
  stage,
  mode,
  mirror,
  showLandmarks,
  onError,
}) {
  const image = document.createElement("canvas");
  image.width = canvas.width;
  image.height = canvas.height;
  const width = Math.max(1, stage.clientWidth),
    height = Math.max(1, stage.clientHeight);
  const paint = image.getContext("2d"),
    ratio = image.width / width;
  paint.fillStyle = "#0b0c0e";
  paint.fillRect(0, 0, image.width, image.height);
  if (mode === "camera" && video.readyState >= 2) {
    const { scale, offsetX, offsetY } = containTransform(
      video.videoWidth,
      video.videoHeight,
      width,
      height,
    );
    paint.save();
    paint.scale(ratio, ratio);
    if (mirror) {
      paint.translate(width, 0);
      paint.scale(-1, 1);
    }
    paint.drawImage(
      video,
      offsetX,
      offsetY,
      video.videoWidth * scale,
      video.videoHeight * scale,
    );
    paint.restore();
    if (!faceCanvas.hidden)
      paint.drawImage(faceCanvas, 0, 0, image.width, image.height);
  }
  paint.drawImage(canvas, 0, 0);
  if (showLandmarks) paint.drawImage(skeleton, 0, 0, image.width, image.height);
  paint.fillStyle = "#d9bb86";
  paint.font = `${11 * ratio}px Arial`;
  const label =
    mode === "demo"
      ? "SCRIPTED DEMO"
      : mode === "camera"
        ? "LOCAL CAMERA"
        : "PARTICLE STUDY";
  paint.fillText(
    `GOLDEN SATURN / ${label}`,
    24 * ratio,
    image.height - 25 * ratio,
  );
  image.toBlob((blob) => {
    if (!blob) return onError("The frame could not be exported. Try again.");
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `golden-saturn-${Date.now()}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, "image/png");
}
