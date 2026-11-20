# Credits & Attributions

## Original Assets, Audio & Tooling
- **3D Models & Procedural Geometry**: Constructed directly in Three.js (`src/game/renderer.js`) for *Đảo Đèn Lồng* (Mây with conical *nón lá*, scarf and hat lantern; Betel palms on *Đảo Cau*; Two-tier terrace, curved ramps & Bell Tower on *Đảo Chuông*; instanced Motes & Shades; sky cloud sea and stars).
- **Procedural PBR Textures**: Canvas-generated diffuse and bump maps (`src/game/textures.js`) for grass, wood dock/bridge planks, stone ruins, sandy island rims, and radial glow halos. Zero external bitmap textures used.
- **Sound Effects & Ambient Music**: Real-time procedural synthesis via Web Audio API using a Vietnamese pentatonic scale (`src/game/audio.js`). Zero external audio files used.
- **Story, UI & Persistence**: Original Vietnamese UI copy, accessibility caption/keybind layer (`src/game/hud.js`, `src/game/keybinds.js`), local leaderboard storage (`src/game/leaderboard.js`, `scripts/leaderboard-store.js`), and benchmark/soak runners (`scripts/bench.js`, `scripts/soak.js`, `scripts/run.js`).

## Open-Source Libraries & Runtime
- **Three.js** (`^0.170.0`) — MIT License — 3D WebGL2 rendering engine (`InstancedMesh`, `PCFSoftShadowMap`, `ACESFilmicToneMapping`).
- **Vite** (`^6.0.0`) — MIT License — development server and production static bundler.
- **Node.js** (`v22.x`) — MIT License — headless deterministic simulation CLI, built-in `node:test` test runner, static release server, and soak runner.

## AI Tools Used
- Code architecture, Test Contract scenario authoring, WebGL instancing optimization, test suites (`npm run verify`), and SDLC documentation assisted by Google Antigravity coding assistant, verified step-by-step against automated tests and real benchmark/soak captures.
