---
name: verify-phase
description: Run full verification (contract v1.2 sync, unit & headless contract tests, determinism check across Nights 1-3, full-night performance gate, Vite build) and capture real proof into docs/proof/phase-N.md before tagging.
---

# Verify Phase Skill

Use this skill at the end of every phase (or after major simulation/contract edits) to guarantee real, reproducible verification before committing or tagging.

## Steps

1. **Run automated verification suite**:
   ```bash
   npm run verify
   ```
   Confirm that:
   - `game.contract.json` (`contract_version: "1.2"`) tuning matches `src/sim/config.js` (`DEFAULT_TUNING`).
   - All `node --test` unit tests (`tests/unit.test.js`) and headless contract tests (`tests/contract.test.js`) pass.
   - Determinism check passes across `--night 1`, `--night 2`, and `--night 3` (byte-identical JSONL output).
   - Full-night headless simulation (`--night 3 --ticks 18000`) completes well within the `<= 30s` budget.
   - `npm run build` succeeds cleanly.

2. **Capture real headless spot checks**:
   ```bash
   node src/headless/cli.js --seed 42 --night 3 --ticks 18000 --out tmp/night3-perf.jsonl
   ```
   Verify exit code `0` and runtime `<= 30s`, then remove `tmp/`.

3. **Record real evidence in `docs/proof/phase-N.md`**:
   - Include only exact observed commands, counts, exit codes, timings, and JSONL snippets from the current commit.
   - If any requirement (such as live browser WebGL visual inspection or FPS measurement) is pending manual verification, mark it honestly rather than claiming it was run.

4. **Check git cleanliness**:
   - Stage files explicitly (`git add <paths>`); never use `git add -A` or `git add .`.
   - Ensure no `.env`, API keys, tokens, or temporary outputs are staged.
