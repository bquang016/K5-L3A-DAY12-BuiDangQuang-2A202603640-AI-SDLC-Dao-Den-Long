/**
 * Deterministic Mulberry32 PRNG keyed by a 32-bit integer seed.
 * Never delegates to Math.random() or wall-clock time.
 */
export function createRng(seed = 1) {
  const numericSeed = Number(seed);
  let state = (Number.isFinite(numericSeed) ? Math.trunc(numericSeed) : 0) >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function range(min, max) {
    return min + (max - min) * next();
  }

  return { next, range };
}
