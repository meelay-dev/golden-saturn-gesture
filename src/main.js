// Composition root: only this module chooses concrete browser, vision and render adapters.
import { StudioController } from "./application/studio-controller.js";
import { FacePipeline } from "./application/face-pipeline.js";
import { StudioView } from "./ui/studio-view.js";
import { CameraVision } from "./vision/camera.js";
import { FaceVision } from "./vision/face.js";
import { PARTICLE_LIGHT_MODES } from "./render/lighting.js";
import { SKIN_TONES } from "./render/skin-tones.js";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const view = new StudioView({
  particleModes: PARTICLE_LIGHT_MODES,
  skinTones: SKIN_TONES,
  reducedMotion,
});
const { video, canvas, faceCanvas } = view.elements;
let studio;
const camera = new CameraVision(video, (message) => {
  if (studio?.starting) view.setLoadingStatus(message);
});
const face = new FacePipeline({
  vision: new FaceVision(video, (message) => view.faceStatus(message)),
  onStatus: (message) => view.faceStatus(message),
  loadRenderer: async () => {
    const { FaceRenderer } = await import("./render/face.js");
    return () => new FaceRenderer(faceCanvas, video);
  },
});
studio = new StudioController({
  view,
  camera,
  face,
  reducedMotion,
  createRenderer: async () => {
    const { SaturnRenderer } = await import("./render/saturn.js");
    return new SaturnRenderer(canvas);
  },
  clock: { now: () => performance.now() },
  scheduler: {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
    isVisible: () => !document.hidden,
  },
});
// A back-forward-cache restoration needs new camera/model resources after pagehide cleanup.
addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
void studio.start();
