# AGENTS.md — Đảo Đèn Lồng

## Commands
- Install & build: `npm install && npm run build`
- Play 3D game: `npm run dev`
- Headless CLI: `node src/headless/cli.js --seed <int> --night 1 --ticks <n> --out <file.jsonl>`
- Run full test & contract verification: `npm run verify` (or `npm test` for unit + contract tests)

## Architecture Rules
1. **Strict Sim/Render Split**: `src/sim/` and `src/headless/` MUST NEVER import `three`, browser DOM/WebGL globals, `Math.random()`, `Date.now()`, or `performance.now()`. All randomness uses `createRng(seed)` from `src/sim/prng.js`.
2. **Single Source of Truth**: `DEFAULT_TUNING` in `src/sim/config.js` MUST stay byte-for-byte consistent with `tuning` in `game.contract.json`. `scripts/verify.js` enforces this.
3. **Creative Additions Stay Visual/Audio**: Extra features (guiding wisp, twilight transitions, story whispers, Web Audio) live strictly in `src/game/` and MUST NOT alter headless simulation output.

## Test Contract v1.0 Rules
- Fixed 60 Hz (`DT = 1/60`). Step `k` consumes inputs at tick `k`, produces state `k+1`, emits events with `tick: k+1`.
- Determinism: identical `--seed`, `--scenario`, `--inputs`, and `--ticks` MUST yield identical JSONL output across runs (including auto-generated IDs).
- Exit codes: `0` on success, `2` on malformed `--scenario` or `--inputs` JSON/schema, non-zero (`1`) on CLI/IO errors. Errors go to `stderr`.
- Scenario initialization emits zero events and adds zero score.

## Verification & Honesty Policy
- Never fake tests or hand-edit generated proof outputs.
- Activate `.agents/skills/verify-phase/SKILL.md` before tagging any phase.
- Activate git hooks with `git config core.hooksPath .githooks` so `npm test` blocks red commits.
