// Optional model adapter; borrows the webcam video and never owns or stops its stream.
import { VISION_BASE } from "./camera.js";

export const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
function timeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              "Face model loading timed out. Check access to jsDelivr and Google model storage.",
            ),
          ),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

// Shares the existing local camera stream. Never requests or uploads a second stream.
export class FaceVision {
  constructor(video, onStatus = () => {}) {
    this.video = video;
    this.onStatus = onStatus;
    this.session = 0;
    this.model = null;
    this.delegate = "—";
    this.lastVideoTime = -1;
  }
  get isReady() {
    return this.model !== null;
  }
  async start() {
    this.stop();
    const session = this.session;
    const initialize = async () => {
      const { FilesetResolver, FaceLandmarker } = await import(
        `${VISION_BASE}/vision_bundle.mjs`
      );
      const files = await FilesetResolver.forVisionTasks(`${VISION_BASE}/wasm`);
      if (session !== this.session) return false;
      const options = (delegate) => ({
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.6,
        minFacePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
        outputFaceBlendshapes: true,
      });
      let model,
        delegate = "GPU";
      try {
        model = await FaceLandmarker.createFromOptions(files, options("GPU"));
      } catch (error) {
        if (session !== this.session) return false;
        this.onStatus("Face GPU unavailable · trying CPU…");
        console.info("Face GPU initialization failed; trying CPU.", error);
        delegate = "CPU";
        model = await FaceLandmarker.createFromOptions(files, options("CPU"));
      }
      if (session !== this.session) {
        model.close();
        return false;
      }
      this.model = model;
      this.delegate = delegate;
      return true;
    };
    try {
      return await timeout(initialize(), 35000);
    } catch (error) {
      if (session !== this.session) return false;
      this.stop();
      throw error;
    }
  }
  detect(timestamp) {
    if (
      !this.model ||
      this.video.readyState < 2 ||
      this.lastVideoTime === this.video.currentTime
    )
      return null;
    this.lastVideoTime = this.video.currentTime;
    return this.model.detectForVideo(this.video, timestamp);
  }
  stop() {
    this.session++;
    this.model?.close();
    this.model = null;
    this.delegate = "—";
    this.lastVideoTime = -1;
  }
}
