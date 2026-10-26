# MASTER BUILD PROMPT — GOLDEN SATURN GESTURE STUDIO V2
**Copy the entire prompt below into GPT-6 High / another coding assistant, together with `references/reference-video.mp4` and this project folder.** This document is an engineering specification, not a claim that the reference clip's hidden source code has been recovered.

---
You are a **principal computer-vision engineer, senior WebGL/GLSL graphics engineer, creative technologist, human-computer interaction engineer, and QA lead**. Your task is to **build, inspect, debug, and improve the COMPLETE RUNNABLE SOURCE CODE**, not merely describe an idea or generate a poster/demo video. Create a polished browser application called **Golden Saturn Gesture Studio** that visually and interactively recreates the observable hand-controlled special effects in the supplied **10.33-second reference video**, to the fullest practical extent achievable with browser technologies.

## A. Verified evidence versus assumptions
The source clip is a desktop screen recording showing **Google Chrome on macOS**, with a locally served HTML page visible at `127.0.0.1:5500/golden-saturn-webcam-v8_5.html`. This proves the **visible output is a locally served webpage**, not that the original program was written in any one particular language or used any specific library. Do not claim access to the creator's original code. The implementation requested here is a **new, original browser implementation** using the mandatory stack below.

Observable visual/gesture motifs include: a small pale/white translucent dotted spherical globe near pinching fingers; movement of the hand relative to the orb; a second hand sometimes remaining closed while the first controls the effect; opening/raising a hand to cause an intense white-gold energy flare and fine particle scatter; a period with suspended/gently fading particles; another pinch or grasp to reform the small globe; a dramatic enlarged planetlike spherical particle shell with several tilted Saturn rings late in the clip. Some frames are occluded and gesture causality is not provable from pixels alone, so implement an intuitive, configurable mapping rather than asserting millisecond-precise reconstruction.

**Inspect the supplied video frame by frame**, including first and last frames. Log a table of observation time, active hand(s), visible gesture, globe/ring size, apparent anchor point, light intensity, particle state, and confidence. Clearly distinguish **observed** from **inferred**. Use the table to guide effect timing and tune parameters in a live browser.

## B. Mandatory technology and execution platform

- Real application: **JavaScript (ES2022+), HTML5, CSS3** using native browser ES modules.
- Hand tracking: **MediaPipe Tasks Vision Hand Landmarker** (`@mediapipe/tasks-vision`), 21 landmarks per hand, maximum 2 hands, runningMode `'VIDEO'`; first attempt GPU delegate, fallback to CPU.
- Visuals: **Three.js/WebGL 2** with `BufferGeometry`, `Points`, transparent GLSL vertex/fragment `ShaderMaterial` for soft glowing particles, multiple 3D rings, burst shader, controlled additive blending, and optional bloom after performance validation.
- User device: Chrome on macOS, localhost `http://127.0.0.1:5500` (or secure HTTPS). Chrome must be allowed to access the webcam.
- Do NOT require Python for hand tracking or application runtime. Python may be used **only for optional static HTTP serving** (`python3 -m http.server 5500`). No cloud inference API, paid key, or backend is required.
- Use a PINNED compatible Three.js version and MediaPipe version. Do not use floating `latest` URLs in production. Explain that loading CDNs/model requires connectivity unless assets are self-hosted.
- Keep all webcam frames local. Do not upload video, run analytics, or record the camera without an explicit user action. The Save Frame button, if enabled, exports a local PNG only.
- Build actual functional source files, avoid pseudocode and placeholder-only effects. All application files should be included in an extractable ZIP.

## C. Gesture interaction contract (prioritize behavior over flashy visuals)

### C1. Correct camera-to-canvas transform

- Display webcam as **mirrored selfie view** by default. Add a toggle to turn mirroring off.
- Hand landmarks are normalized in unmirrored camera coordinates. Convert them to overlay coordinates accounting for CSS `object-fit: cover`, video aspect ratio, viewport aspect ratio, mirroring, and resizing. Do not just multiply x/y by viewport dimensions, which breaks on wide/tall screens.
- Position the effects relative to the fingers/palm on the displayed image. Smooth with time-based exponential damping / One-Euro filter as appropriate; respond quickly to intentional motion without visible lag or shaking.
- Treat MediaPipe `z` as a relative estimate, NOT calibrated physical depth. Do not pretend precise 3D occlusion from hand landmarks alone.

### C2. Pinch = summon and move

- Thumb tip = landmark **4**, index tip = **8**, wrist = **0**, middle finger MCP = **9**. Compute pinch metric `distance(4,8) / max(distance(0,9),epsilon)`.
- Enter pinch at approximately **0.38** palm units and exit at approximately **0.53** (hysteresis); thresholds exposed as configurable constants. Validate on different hand sizes, orientations, webcams and lighting conditions.
- After ~**3 consecutive frames** of candidate gesture, enter `PINCH`. Summon a **small, translucent, white-gold dotted orb** centered on the thumb-index midpoint. Move with those fingers in X/Y in real time. Scale approximately **0.3–0.4** of the default full-planet size.
- Orb should rotate slowly while pinched, with delicate wire/particle detail, soft core and faint halo. Never permanently stick to a hard-coded screen position.

### C3. Open palm = controlled release / one-shot flash

- Calculate finger extension geometrically for index/middle/ring/little fingers from tip/PIP/MCP and wrist; choose robust ratios and allow uncertainty. Recognize four extended fingers as `OPEN`, with stabilization.
- Trigger ONE energetic white-gold palm flash only **on entering OPEN after an armed gesture** (e.g., following a pinch). **Do not retrigger the burst every frame while the palm stays open.**
- The burst expands away from palm position via velocity/easing/drag; release warm highlights and hundreds of tiny spark particles with approximately **0.9–1.4 s** decay, then settle into a restrained dispersed field. No uncontrolled full-screen strobing.
- Open palm must still work if the other hand is visible as a passive fist: do not automatically force a two-hand scale whenever two hands are detected.

### C4. One-hand fist = collapse

- Detect mostly folded fingers: at least three curled of four non-thumb fingers, calibrated for foreshortening.
- Shrink and fade energy/planet over roughly **0.2–0.5 s** with exponential easing, no abrupt pop. Rearm the next pinch/open interaction as appropriate.

### C5. Two-hand interaction = expand, rotate and focus

- Track up to 2 hands. Keep approximately persistent hand IDs via palm-nearest matching plus handedness if reliable. Do not associate gestures solely by MediaPipe result array order; account for swaps and dropout.
- Only enter `TWO_HANDS` when BOTH hands deliberately engage (e.g., both OPEN or both PINCH); a second passive fist must NOT trigger zoom. One OPEN + one PINCH should retain a meaningful dominant-hand action, with OPEN allowed to trigger a primed burst.
- While actively in TWO_HANDS, center the planet between palm centers, map palm separation to a clamped scale **0.7–2.15**, and adjust orbital rotation/tilt based on relative palm angle and angular velocity. Smooth using dt, never frame-count assumptions.
- Render visibly larger, layered three-dimensional Saturn rings and a bright dotted sphere. If hands leave the camera, hold a last known position briefly (about **0.2 s**) and fade to zero. Effects must not freeze forever.

### C6. Transition priorities
State machine states: `IDLE`, `TRACK`, `PINCH`, `OPEN`, `FIST`, `TWO_HANDS`, temporary `HOLD` for short occlusions. Transition priorities: intentional hand engagement > passive second hand; confirmed pinch/open/fist > uncertain track; two-hand requires both engaged. Reset the one-shot burst latch after valid rearming, not on every landmark frame. Provide real-time debug label for each state.

## D. Visual specifications

1. **Planet shell:** 2,000–4,500 pearl-white/ivory dots on a uniform/Fibonacci sphere distribution. Preserve the distribution when changing quality. Subtle 3D perspective and time-based rotation; avoid an opaque 3D ball.
2. **Saturn rings:** three or more concentric inclined point rings, about 3,000–7,000 combined gold/cream tiny points. Rings must be genuine 3D rotated planes and not just one flat HTML circle. Show far/near elliptical geometry; no cartoon clip art.
3. **Burst:** GPU-oriented scattering particles with per-particle speed/direction, screen-space flare/halo and progressive fade. Bloom is optional if it does not destroy clarity or tank FPS.
4. **Motion:** high-frequency fingertip anchoring separated from slower object scale changes; use `deltaTime`, damping, velocity-limited tracking, subtle wobble, orbital inertia, and angular velocity controlled by hand movement.
5. **Color:** warm ivory/amber/gold with restrained cyan hints ONLY if supported by reference; strong white-hot but not screen-filling burst. Use alpha compositing over live mirrored camera.
6. **Accessibility:** avoid rapid flashing, provide manual reduced brightness/intensity and low graphics mode. Ensure controls and status are readable over camera footage.
7. **Performance:** selectable low/medium/high quality with real particle count reductions and lower pixel ratio; optional auto degradation after sustained FPS drop. Render quality may be reduced on older laptops. Target 30+ FPS on a reasonably recent computer, but do not advertise a verified FPS without measuring it.
8. **Occlusion limitation:** basic hand landmarks do not provide a per-pixel human mask. If hand/face foreground masking is not actually implemented, explicitly say the effect is a transparent overlay and can appear in front of hands. Optional MediaPipe segmentation may be proposed as a separate enhancement, NOT claimed completed.

## E. UI/UX deliverables

- Full viewport translucent webcam; cinematic vignette.
- Compact responsive premium-themed HUD with camera/model status, gesture, number of hands, render FPS, MediaPipe GPU/CPU delegate.
- Functional buttons: **Enable webcam**, **Demo effects without webcam**, **Stop (release tracks)**, **Save frame as PNG**, **Fullscreen**.
- Functional controls: **quality (Auto / Low / Medium / High)**, **brightness**, **mirror**, **show 21 landmarks + skeletal connections**.
- Demo mode must clearly say it is **scripted effect animation**, NOT real hand inference. Camera mode must process actual frames through MediaPipe.
- Helpful permission errors, missing camera errors, CDN/model load failure and CPU fallback, resize handling, graceful cleanup on page unload.
- Compatible with a static local server and Chrome without a separate build step.

## F. Software architecture and file organization
Supply readable, commented, well-separated ES modules:

```
index.html
style.css
src/main.js                    # UI, requestAnimationFrame orchestration, screenshots
src/vision/camera.js           # getUserMedia, MediaPipe model, GPU -> CPU fallback
src/vision/gesture.js          # classification, hysteresis, stable hand IDs
src/core/math.js               # normalized math, object-fit:cover mapping, damping
src/core/interaction.js        # pure state machine, one-shot events
src/core/demo.js               # clearly-labeled synthetic scripted demo
src/render/shaders.js          # GLSL point/burst/flare materials
src/render/saturn.js           # scene graph, particles, animation, quality
README.md                      # local setup, privacy, operation and limitations
ARCHITECTURE.md                # formulas and future improvements
FULL_PROJECT_PROMPT.md         # this detailed specification
references/reference-video.mp4 # user's reference clip, no runtime dependency
tests/*.test.js                # node:test gesture & math unit tests
package.json                   # test command, no runtime build requirement
```
Preserve clean dependency boundaries: renderer NEVER computes landmark classification; vision module NEVER contains particle shader logic; state machine NEVER directly accesses DOM; tests for gestures/transition logic must run in Node without requiring a webcam.

## G. QA, testing and acceptance criteria

1. Running `python3 -m http.server 5500` then opening `http://127.0.0.1:5500` loads the page in Chrome. No Python-based app logic.
2. Click Demo effects without camera: an animated small globe, release burst, large Saturn and collapse are visibly demonstrated; HUD says DEMO.
3. Click Enable webcam: ask for permission, load MediaPipe pinned model and stream from the actual webcam, detect up to two hands, show webcam background mirrored, and update gesture labels.
4. With one hand pinch: small planet follows precisely between fingertips across the screen with correct crop/mirror mapping.
5. With one hand move pinch + second hand passive fist: remains PINCH, NOT TWO_HANDS.
6. Release pinch into open hand: single flash and particle emission for the whole sustained open state (not flashes every frame).
7. With two actively open or pinched hands, separation scales the large Saturn, midpoint anchors its center; rotation follows relative movement.
8. Close hand to fist: smooth effect collapse, no indefinite leftover glow.
9. Hide hands: brief dropout hold followed by fade. Reappear: recovers without stuck state.
10. Test on 16:9 and 4:3 cameras, wide desktop window and narrow responsive window; verify overlay and fingertips still align.
11. Simulate camera denied, no camera, blocked model download and WebGL unavailable; show actionable errors, no infinite loading with invisible UI.
12. `npm test` passes pure geometry/state tests. `node --check` passes all JS modules. No unexplained network requests beyond dependency/model asset loading.
13. Report **verified locally** versus **not yet verified**. Never claim exact pixel-for-pixel fidelity or successful physical webcam test without observing those results.

## H. Professional improvements after core parity
Priority 1: compare frame-by-frame with source video and adjust orb radius, particle palette, ring tilt, flare decay, and gesture gating. Priority 2: adaptive One-Euro filter, quantitative latency tracking, confidence-dependent fade and tracking ID robustness. Priority 3: better shader-based lighting and orbital thickness/occlusion; OPTIONAL person segmentation to make hands occlude particles. Priority 4: offline asset self-hosting, worker/offscreen-canvas experiments, device compatibility and automated screenshot diff tests. Priority 5: optional extendable character/face VFX presets (e.g. superhero or fantasy-elf eye/face effects discussed for related projects) using a separate face-landmarker/segmentation pipeline; keep them DISABLED and OUT OF SCOPE for this Saturn build unless separately requested, and do not suggest they already exist.

**Crucial output requirement:** Return the full updated runnable project files and complete ZIP plus precise setup/verification notes. Do not provide only general advice, AI art, a still image or a pre-rendered video. Do not omit implementation details. Correct broken imports, run applicable tests, and label untested webcam/WebGL behavior honestly.