# AGENTS.md — Đảo Đèn Lồng

## Commands
- Install & build: `npm install && npm run build`
- Play 3D game: `npm run dev`
- Headless CLI: `node src/headless/cli.js --seed <int> --night <1|2|3> --ticks <n> --out <file.jsonl>`
- Run full test & contract verification: `npm run verify` (or `npm test` for unit + contract tests)

## Architecture Rules
1. **Strict Sim/Render Split**: `src/sim/` and `src/headless/` MUST NEVER import `three`, browser DOM/WebGL globals, `Math.random()`, `Date.now()`, or `performance.now()`. All randomness uses `createRng(seed)` from `src/sim/prng.js`.
2. **Single Source of Truth**: `DEFAULT_TUNING` in `src/sim/config.js` MUST stay byte-for-byte consistent with `tuning` in `game.contract.json` (`contract_version: "1.1"`). Map coordinates and schedules live in `src/sim/maps.js`.
3. **Creative Additions Stay Visual/Audio**: Extra features (guiding wisp, sky lanterns, Ông Đăng whispers, extra atmosphere) live strictly in `src/game/` and MUST NOT alter headless simulation output.

## Test Contract v1.1 Rules
- Fixed 60 Hz (`DT = 1/60`). Enforce the 12-step tick order strictly: input/pause -> timers -> move/fall -> pickup -> deposit -> safe zones -> pulse -> shades/drifters move -> collisions (drifter steal then shade hit) -> scheduled spawns -> win/loss -> snapshot.
- `--night` supports `1`, `2`, `3`. `night_start` emits at tick `0`.
- Shade states MUST use exact names: `spawning`, `wander`, `chase`, `recoil`, `stunned`.
- Pause freezes `sim_tick`, timers, spawns, and TTL while `tick` advances and snapshot reports `state: "paused"`.
- Full-night headless run (`<= 21600` ticks) MUST finish in `<= 30s`.
- Determinism & Exit codes: identical inputs yield identical JSONL; `0` success, `2` malformed `--scenario`/`--inputs` JSON/schema, non-zero (`1`) CLI/IO errors. Errors to `stderr`.

## Verification & Honesty Policy
- Never fake tests or hand-edit generated proof outputs.
- Activate `.agents/skills/verify-phase/SKILL.md` before tagging any phase.
- Activate git hooks with `git config core.hooksPath .githooks` so `npm test` blocks red commits.
