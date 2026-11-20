import { DEFAULT_TUNING, DT, PALETTE } from '../sim/config.js';
import { getSurfaceHeight, resolveHorizontalMove } from '../sim/maps.js';
import { distXZ } from '../sim/math.js';
import { createRng } from '../sim/prng.js';
import { LanternIslandSim } from '../sim/simulation.js';
import { computeBenchStats } from './bench-stats.js';
import { IslandRenderer } from './renderer.js';

function createBenchmarkState(seed) {
  const sim = new LanternIslandSim({
    seed,
    night: 1,
    scenario: {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      lanterns: [
        { id: 'L1', lit: true, fuel: 100 },
        { id: 'L2', lit: true, fuel: 100 },
        { id: 'L3', lit: true, fuel: 100 },
        { id: 'L4', lit: false },
        { id: 'L5', lit: false }
      ],
      motes: [],
      shades: []
    }
  });

  const rng = createRng(seed);
  const safeLanterns = sim.lanterns.slice(0, 3);
  const safeR = sim.tuning.safe_radius + 0.35;

  // 100 motes evenly spread on Night 1 island (r <= 38.5)
  for (let i = 0; i < 100; i += 1) {
    const r = Math.sqrt(rng.next()) * 38.5;
    const ang = rng.range(0, Math.PI * 2);
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    const y = getSurfaceHeight(sim.map, x, z) ?? 0;
    sim.motes.push({
      id: `BM${i + 1}`,
      pos: [x, y, z],
      kind: 'random',
      ttlTicks: null,
      createdSimTick: -1
    });
  }

  // 200 shades in wander state evenly spread outside L1-L3 safe zones
  for (let i = 0; i < 200; i += 1) {
    let sx = 0;
    let sz = 0;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const r = 7.5 + Math.sqrt(rng.next()) * 31.0;
      const ang = rng.range(0, Math.PI * 2);
      const cx = Math.cos(ang) * r;
      const cz = Math.sin(ang) * r;
      const insideSafe = safeLanterns.some((l) => distXZ([cx, 0, cz], l.pos) < safeR);
      if (!insideSafe) {
        sx = cx;
        sz = cz;
        break;
      }
      sx = cx;
      sz = cz;
    }
    const groundY = getSurfaceHeight(sim.map, sx, sz) ?? 0;
    sim.shades.push({
      id: `BS${i + 1}`,
      pos: [sx, groundY + 0.8, sz],
      yOffset: 0.8,
      state: 'wander',
      stateTicksLeft: 0,
      targetLanternId: null,
      drainTicks: 0,
      inSafePush: false,
      safePushTicks: 0,
      pulsePushTicksLeft: 0,
      pulsePushDir: [1, 0],
      pulsePushStep: 0,
      recoilDir: [1, 0],
      wanderAngle: rng.range(0, Math.PI * 2),
      wanderTimer: 90 + Math.floor(rng.next() * 90),
      createdSimTick: -1
    });
  }

  // Push any fallback sample strictly outside L1-L3 safe zones
  for (const shade of sim.shades) {
    sim._projectOutsideSafeZones(shade.pos, false);
  }

  return sim;
}

function stepBenchShades(sim) {
  const wStep = DEFAULT_TUNING.shade_speed * 0.55 * DT;
  for (let i = 0; i < sim.shades.length; i += 1) {
    const shade = sim.shades[i];
    shade.wanderTimer -= 1;
    if (shade.wanderTimer <= 0) {
      shade.wanderAngle = sim.rng.range(0, Math.PI * 2);
      shade.wanderTimer = 90 + Math.floor(sim.rng.next() * 90);
    }
    const res = resolveHorizontalMove(
      sim.map,
      shade.pos,
      Math.cos(shade.wanderAngle) * wStep,
      Math.sin(shade.wanderAngle) * wStep,
      { currentY: 0, allowVoid: false }
    );
    shade.pos[0] = res.x;
    shade.pos[2] = res.z;
    if (res.blocked) {
      shade.wanderAngle += Math.PI * 0.75;
    }
    sim._projectOutsideSafeZones(shade.pos, false);
    const groundH = getSurfaceHeight(sim.map, shade.pos[0], shade.pos[2]);
    if (groundH !== null) {
      shade.pos[1] = groundH + 0.8;
    }
  }
}

export function startBenchMode(appEl, hudEl) {
  const params = new URLSearchParams(window.location.search);
  const seedRaw = Number.parseInt(params.get('seed') || '42', 10);
  const durationRaw = Number.parseFloat(params.get('duration') || '30');
  const seed = Number.isInteger(seedRaw) ? seedRaw : 42;
  const durationS = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 30;
  const warmupMs = 3000;
  const measureMs = durationS * 1000;

  if (hudEl) hudEl.style.display = 'none';
  document.body.style.background = PALETTE.skyNight;

  const sim = createBenchmarkState(seed);
  const renderer = new IslandRenderer(appEl, { benchMode: true, reducedMotion: true });

  // Fixed orbit around (0,0,0), r=30m, Y=15m, starting at 0 deg (30,15,0), CCW from above, 15s/rev
  let accumSec = 0;
  let benchStartMs = null;
  let lastFrameMs = null;
  let loadedSent = false;
  let finished = false;
  const frameDtsMs = [];

  const getOrbitCamera = (elapsedSec) => {
    const theta = (elapsedSec / 15) * Math.PI * 2;
    return {
      overridePos: [30 * Math.cos(theta), 15, -30 * Math.sin(theta)],
      overrideLookAt: [0, 0, 0]
    };
  };

  function tickFrame(nowMs) {
    if (finished) return;

    if (benchStartMs === null) {
      benchStartMs = nowMs;
      lastFrameMs = nowMs;
      renderer.render(sim, getOrbitCamera(0), 0);
      if (!loadedSent) {
        loadedSent = true;
        fetch('/__bench_loaded', { method: 'POST' }).catch(() => {});
      }
      requestAnimationFrame(tickFrame);
      return;
    }

    const dtMs = nowMs - lastFrameMs;
    lastFrameMs = nowMs;
    const elapsedTotalMs = nowMs - benchStartMs;
    const stepDt = Math.min(0.1, Math.max(0, dtMs / 1000));

    accumSec += stepDt;
    while (accumSec >= DT) {
      stepBenchShades(sim);
      accumSec -= DT;
    }

    renderer.render(sim, getOrbitCamera(elapsedTotalMs / 1000), stepDt);

    if (elapsedTotalMs >= warmupMs) {
      if (dtMs > 0) frameDtsMs.push(dtMs);
      if (elapsedTotalMs >= warmupMs + measureMs) {
        finished = true;
        const stats = computeBenchStats(frameDtsMs);
        const payload = {
          ...stats,
          renderer: renderer.getRendererDescription()
        };
        fetch('/__bench_done', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(() => {});
        return;
      }
    }

    requestAnimationFrame(tickFrame);
  }

  requestAnimationFrame(tickFrame);
}
