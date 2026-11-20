/**
 * Computes Test Contract v1.3 benchmark metrics from an array of frame deltas (ms).
 */
export function computeBenchStats(dtsMs) {
  if (!Array.isArray(dtsMs) || dtsMs.length === 0) {
    return {
      frames: 0,
      avg_fps: 0,
      p1_low_fps: 0,
      frame_ms_p95: 0
    };
  }

  const valid = dtsMs.filter((dt) => Number.isFinite(dt) && dt > 0);
  const N = valid.length;
  if (N === 0) {
    return { frames: 0, avg_fps: 0, p1_low_fps: 0, frame_ms_p95: 0 };
  }

  let sumDt = 0;
  for (let i = 0; i < N; i += 1) {
    sumDt += valid[i];
  }
  const avgFps = (1000 * N) / sumDt;

  const sortedAsc = [...valid].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(0.01 * N));
  let slowSum = 0;
  for (let i = N - k; i < N; i += 1) {
    slowSum += sortedAsc[i];
  }
  const p1LowFps = 1000 / (slowSum / k);

  const p95Idx = Math.min(N - 1, Math.max(0, Math.ceil(0.95 * N) - 1));
  const frameMsP95 = sortedAsc[p95Idx];

  return {
    frames: N,
    avg_fps: Number(avgFps.toFixed(1)),
    p1_low_fps: Number(p1LowFps.toFixed(1)),
    frame_ms_p95: Number(frameMsP95.toFixed(1))
  };
}
