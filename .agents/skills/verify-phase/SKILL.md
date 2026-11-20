---
name: verify-phase
description: Run full verification (contract sync, unit & headless contract tests, determinism check, Vite build) and capture real proof into docs/proof/phase-N.md before tagging.
---

# Verify Phase Skill

Use this skill at the end of every phase (or after major simulation/contract edits) to guarantee real, reproducible verification before committing or tagging.

## Steps

1. **Run automated verification suite**:
   ```bash
   npm run verify
   ```
   Confirm that:
   - `game.contract.json` tuning matches `src/sim/config.js` (`DEFAULT_TUNING`).
   - All `node --test` unit tests (`tests/unit.test.js`) pass.
   - All headless contract scenario tests and error exit-code checks (`tests/contract.test.js`) pass.
   - Seeded determinism check produces byte-identical JSONL output on repeated runs.
   - `npm run build` succeeds cleanly.

2. **Capture real headless evidence** (spot check):
   ```bash
   node src/headless/cli.js --seed 42 --night 1 --ticks 600 --out tmp/run1.jsonl
   node src/headless/cli.js --seed 42 --night 1 --ticks 600 --out tmp/run2.jsonl
   ```
   Verify `run1.jsonl` and `run2.jsonl` are byte-identical (and clean up `tmp/` afterwards).

3. **Record real evidence in `docs/proof/phase-N.md`**:
   - Include only exact observed commands, counts, exit codes, and JSONL snippets from the current commit.
   - If any requirement is incomplete or failing, mark it `"chưa đạt"` honestly with the exact reason.

4. **Check git cleanliness**:
   - Stage files explicitly (`git add <paths>`); never use `git add -A` or `git add .`.
   - Ensure no `.env`, API keys, tokens, or temporary outputs are staged.
