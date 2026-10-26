# Golden Saturn Gesture Studio

Local webcam hand gestures, particle effects and optional face retouching.

## Technology

| Part               | Language / runtime                     | Responsibility                                               |
| ------------------ | -------------------------------------- | ------------------------------------------------------------ |
| Frontend           | JavaScript ES modules, HTML5, CSS3     | Controls, camera preview and browser application             |
| Computer vision    | JavaScript with MediaPipe Tasks Vision | Local hand and face inference; GPU with CPU fallback         |
| Graphics           | JavaScript / Three.js and GLSL         | Particle rendering, skin masks and iris effects              |
| Backend            | No application backend                 | Processing and application state stay in the browser         |
| Development server | JavaScript / Node.js HTTP              | Serves static files on `127.0.0.1:5500`                      |
| Tests and tools    | JavaScript / Node.js                   | Geometry, application lifecycle, architecture and browser QA |

## Run

Use Node.js 20+ and Chrome with WebGL 2 enabled.

```sh
npm run dev
```

Open **http://127.0.0.1:5500/**. `npm start` runs the same server. No build or package installation is required. Internet access is needed for the pinned Three.js, MediaPipe runtime and model downloads. Stop the server with Control-C.

## Clean architecture

Dependencies point toward the core. Browser and library APIs stay in adapters.

| Layer          | Location                                                             | Owns                                                                                     |
| -------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Domain         | [src/core](src/core)                                                 | Geometry, hand identity, face geometry and gesture rules                                 |
| Application    | [src/application](src/application)                                   | Sessions, inference scheduling, projection and resource lifecycle through injected ports |
| Adapters       | [src/ui](src/ui), [src/vision](src/vision), [src/render](src/render) | DOM/export, webcam/MediaPipe and WebGL                                                   |
| Composition    | [src/main.js](src/main.js)                                           | Connects concrete adapters to application services                                       |
| Server/tooling | [tools](tools)                                                       | Static serving, asset versioning and verification                                        |

`npm run check` rejects outer-layer imports and browser APIs in domain/application code. Comments explain ownership, coordinate units, cancellation and tracking limits. [ARCHITECTURE.md](ARCHITECTURE.md) describes the interfaces and data flow.

## Controls

Enable the webcam, then select **Match reference video**. Raise the controlling hand first or choose its displayed starting side.

| Gesture                                      | Effect                                           |
| -------------------------------------------- | ------------------------------------------------ |
| Closed fist                                  | Hold a spinning, nested globe above the knuckles |
| Thumb–index pinch                            | Position a compact globe                         |
| Spread thumb and index; other fingers folded | Enlarge the globe; close the gap to shrink       |
| Open controlling palm                        | One flare and particle scatter                   |
| Other hand: 1 / 2 / 3 / 4 fingers            | Ivory / cyan / violet / gold                     |
| Hide hands                                   | Brief hold, then fade                            |

**Classic two-hand controls** retains midpoint-based scaling and fist collapse. The labeled demo works without a webcam. Controls stay below the camera; Fullscreen expands the preview and Esc returns. Save frame downloads a local PNG.

**Face Studio** optionally provides wrinkle reduction, skin brightening, whitening tone/strength and tracked navy-blue irises. Show original bypasses retouching. Stop releases the camera and both models.

## Verify

```sh
npm run assets  # Refresh browser revisions after source/style edits.
npm test
npm run check
```

Startup also refreshes asset revisions automatically. No webcam is needed for unit tests. Browser QA scripts require a separate Playwright Core installation and run sequentially; see [QA.md](QA.md).

Frames stay on the device. Landmark tracking can lose accuracy during occlusion, crossings, fast motion or poor lighting. Face masks do not segment hair, glasses or hands. Camera capture requests 1280 × 720; the preview reports the actual resolution. Original gesture thresholds and colour assignments are approximations inferred from the supplied video.

[Recording comparison](references/COMPARISON.md) · [Reference observations](references/OBSERVATIONS.md) · [Original specification](FULL_PROJECT_PROMPT.md)
