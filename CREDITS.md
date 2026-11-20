# Credits & Attributions

## Original Assets & Audio
- **3D Models & Environment Geometry**: Procedurally constructed in Three.js (`src/game/renderer.js`) specifically for *Đảo Đèn Lồng* (Mây with conical *nón lá* and hanging hat-lantern, 5 Great Lanterns, *Đảo Bến* pier, pine trees, cloud sea, *Đom đóm*, and *Bóng Mực*).
- **Sound Effects**: Procedurally synthesized in real time via Web Audio API using a Vietnamese pentatonic scale (`src/game/audio.js`). Zero external audio samples used.
- **Story & UI**: Original text and HUD layout (`src/game/hud.js`, `index.html`).

## Open-Source Libraries
- **Three.js** (`^0.170.0`) — MIT License — 3D WebGL rendering engine.
- **Vite** (`^6.0.0`) — MIT License — development server and static production bundler.
- **Node.js built-in `node:test`** — Unit and headless contract test runner.

## AI Tools Used
- Code generation, test suite authoring, and SDLC documentation assisted by Antigravity AI coding assistant, verified through automated unit/contract tests (`npm run verify`).
