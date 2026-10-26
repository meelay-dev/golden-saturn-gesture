// MediaPipe/webcam adapter. Session tokens discard late downloads after Stop or replacement.
export const VISION_VERSION = "0.10.22-rc.20250304";
export const VISION_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}`;
export const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
async function deadline(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export class CameraVision {
  constructor(video, onStatus = () => {}) {
    this.video = video;
    this.onStatus = onStatus;
    this.landmarker = null;
    this.stream = null;
    this.delegate = "—";
    this.lastVideoTime = -1;
    this.session = 0;
  }
  // Expose application state without leaking HTMLVideoElement or MediaStream.
  get dimensions() {
    return { width: this.video.videoWidth, height: this.video.videoHeight };
  }
  get isActive() {
    return (
      this.stream
        ?.getVideoTracks()
        .some((track) => track.readyState === "live") ?? false
    );
  }
  async start() {
    this.stop();
    const session = this.session;
    if (!globalThis.isSecureContext)
      throw new Error(
        "Camera access needs localhost or HTTPS. Open http://127.0.0.1:5500.",
      );
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "This browser cannot access a webcam. Use a recent Chrome on localhost or HTTPS.",
      );
    try {
      this.onStatus("Requesting camera permission…");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      });
      if (session !== this.session) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      this.onStatus("Loading hand model · first use needs internet…");
      const { FilesetResolver, HandLandmarker } = await deadline(
        import(`${VISION_BASE}/vision_bundle.mjs`),
        20000,
        "The vision library download timed out. Check your connection to jsDelivr.",
      );
      const files = await deadline(
        FilesetResolver.forVisionTasks(`${VISION_BASE}/wasm`),
        20000,
        "The vision runtime download timed out. Check your connection to jsDelivr.",
      );
      const options = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
      });
      const initialize = async () => {
        let model;
        try {
          model = await HandLandmarker.createFromOptions(files, options("GPU"));
          if (session === this.session) this.delegate = "GPU";
        } catch (error) {
          if (session !== this.session) return null;
          this.onStatus("GPU unavailable · trying CPU tracking…");
          console.info(
            "Hand model GPU initialization failed; using CPU.",
            error,
          );
          model = await HandLandmarker.createFromOptions(files, options("CPU"));
          if (session === this.session) this.delegate = "CPU";
        }
        if (session !== this.session) {
          model.close();
          return null;
        }
        return model;
      };
      const model = await deadline(
        initialize(),
        30000,
        "The hand model took too long to load. Check access to Google model storage, then retry.",
      );
      if (!model) return false;
      if (session !== this.session) {
        model.close();
        return false;
      }
      this.landmarker = model;
      this.lastVideoTime = -1;
      this.onStatus("Camera live · hands stay on this device");
      return true;
    } catch (error) {
      if (session !== this.session) return false;
      this.stop();
      const messages = {
        NotAllowedError:
          "Camera permission was denied. Allow camera access in the address bar, then try again.",
        NotFoundError:
          "No webcam was found. Connect a camera, or explore the scripted demo.",
        NotReadableError:
          "The webcam is busy. Close other camera apps, then try again.",
        OverconstrainedError:
          "The camera could not use these settings. Try another webcam.",
      };
      throw new Error(
        messages[error.name] ??
          `Hand tracking could not start. Check your internet connection and allow jsDelivr and Google model downloads. ${error.message}`,
      );
    }
  }
  detect(timestamp) {
    if (
      !this.landmarker ||
      this.video.readyState < 2 ||
      this.lastVideoTime === this.video.currentTime
    )
      return null;
    this.lastVideoTime = this.video.currentTime;
    return this.landmarker.detectForVideo(this.video, timestamp);
  }
  stop() {
    this.session++;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.delegate = "—";
  }
}
