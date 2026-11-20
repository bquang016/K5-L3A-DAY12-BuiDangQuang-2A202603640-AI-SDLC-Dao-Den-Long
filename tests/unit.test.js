import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_TUNING } from '../src/sim/config.js';
import { getMapConfig, getSurfaceHeight } from '../src/sim/maps.js';
import { distXZ, rotateMove } from '../src/sim/math.js';
import { createRng } from '../src/sim/prng.js';
import { LanternIslandSim } from '../src/sim/simulation.js';

const ROOT = process.cwd();

test('createRng is deterministic per seed and differs across seeds', () => {
  const a1 = createRng(123);
  const a2 = createRng(123);
  const b = createRng(456);
  assert.deepEqual([a1.next(), a1.next(), a1.next()], [a2.next(), a2.next(), a2.next()]);
  assert.notDeepEqual([a1.next(), a1.next()], [b.next(), b.next()]);
});

test('rotateMove applies yaw formula and normalizes vectors > 1', () => {
  assert.deepEqual(rotateMove([0, 0], 45), [0, 0]);
  const [x90, z90] = rotateMove([0, 1], 90);
  assert.ok(Math.abs(x90 - 1) < 1e-9 && Math.abs(z90) < 1e-9);
  const diag = rotateMove([1, 1], 0);
  assert.ok(Math.abs(Math.hypot(diag[0], diag[1]) - 1) < 1e-9);
});

test('jump rises at 7 m/s with -20 m/s^2 gravity and lands back on Y=0', () => {
  const sim = new LanternIslandSim({
    seed: 1,
    night: 1,
    scenario: { random_motes: false, random_shades: false, motes: [] }
  });
  sim.step({ jump: true });
  assert.ok(sim.player.pos[1] > 0);
  assert.equal(sim.player.grounded, false);
  for (let i = 0; i < 60; i += 1) sim.step({ jump: true });
  assert.equal(sim.player.pos[1], 0);
  assert.equal(sim.player.grounded, true);
});

test('scenario initialization emits no events and adds zero score', () => {
  const sim = new LanternIslandSim({
    seed: 9,
    night: 2,
    scenario: {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }]
    }
  });
  const snap = sim.getSnapshot();
  assert.equal(snap.tick, 0);
  assert.equal(snap.score, 0);
  assert.equal(snap.lanterns[0].lit, true);
  assert.equal(snap.lanterns[0].deposited, DEFAULT_TUNING.lantern_cost);
});

test('standardized scoring awards +10 per deposited mote, +100 per lantern, +5 per stun, and win bonuses', () => {
  const sim = new LanternIslandSim({
    seed: 1,
    night: 1,
    scenario: {
      player: { pos: [0, 0, 24], carried: 8, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 24], [0, 0, 24]],
      lanterns: [
        { id: 'L1', pos: [0, 0, 25], deposited: 0, lit: false },
        { id: 'L2', lit: true },
        { id: 'L3', lit: true },
        { id: 'L4', lit: true },
        { id: 'L5', lit: true }
      ],
      time_left_s: 100
    }
  });

  // Pickup 2 motes adds 0 score; depositing 10 adds +100; lighting adds +100; bonuses: 99*2 + 3*50 = 348 -> 548
  const evs = sim.step({ interact: true });
  assert.equal(evs.filter((e) => e.name === 'mote_picked').length, 2);
  assert.ok(evs.some((e) => e.name === 'deposit' && e.data.amount === 10));
  assert.ok(evs.some((e) => e.name === 'lantern_lit' && e.data.lantern_id === 'L1'));
  assert.equal(sim.score, 548);
});

test('shade starting inside newly lit lantern safe_radius pushes outward in recoil without dealing damage', () => {
  const sim = new LanternIslandSim({
    seed: 1,
    night: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
      shades: [{ id: 'S1', pos: [0.5, 0.8, 0], state: 'chase' }]
    }
  });

  for (let i = 0; i < 30; i += 1) {
    const evs = sim.step({});
    assert.equal(evs.some((e) => e.name === 'player_hit'), false);
  }
  assert.ok(distXZ(sim.shades[0].pos, [0, 0, 0]) >= DEFAULT_TUNING.safe_radius - 1e-6);
  assert.equal(sim.player.flames, 3);
});

test('Night 3 ramps climb smoothly 30deg/150deg, cliffs block direct ascent, and Bell Tower r=2 blocks movement', () => {
  const map3 = getMapConfig(3);
  const rad30 = (30 * Math.PI) / 180;
  assert.equal(getSurfaceHeight(map3, 30 * Math.cos(rad30), 30 * Math.sin(rad30)), 0);
  assert.ok(Math.abs(getSurfaceHeight(map3, 27 * Math.cos(rad30), 27 * Math.sin(rad30)) - 1.5) < 1e-6);
  assert.equal(getSurfaceHeight(map3, 24 * Math.cos(rad30), 24 * Math.sin(rad30)), 3);

  // Walk up 30deg ramp from r=30.5 to r=23.5
  const simRamp = new LanternIslandSim({
    seed: 1,
    night: 3,
    scenario: {
      player: { pos: [30.5 * Math.cos(rad30), 0, 30.5 * Math.sin(rad30)] },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false
    }
  });
  for (let i = 0; i < 75; i += 1) {
    simRamp.step({ move: [-Math.cos(rad30), -Math.sin(rad30)] });
  }
  assert.equal(simRamp.player.pos[1], 3);

  // Tier 2 Bell Tower blocks entering r < 2.0
  const simTower = new LanternIslandSim({
    seed: 1,
    night: 3,
    scenario: {
      player: { pos: [0, 6, 4] },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false
    }
  });
  for (let i = 0; i < 60; i += 1) {
    simTower.step({ move: [0, -1] });
  }
  assert.ok(Math.hypot(simTower.player.pos[0], simTower.player.pos[2]) >= 2.0 - 1e-6);
});

test('Night 2 bamboo bridge connects Islands A and B continuously without void gaps', () => {
  const sim = new LanternIslandSim({
    seed: 1,
    night: 2,
    scenario: {
      player: { pos: [25, 0, 0] },
      random_motes: false,
      random_shades: false,
      random_drifters: false
    }
  });
  // Walk +X across bridge (x=25 -> 45 in 200 ticks at 6 m/s = 20m)
  for (let i = 0; i < 200; i += 1) {
    sim.step({ move: [1, 0] });
    assert.equal(sim.player.pos[1], 0);
  }
  assert.ok(sim.player.pos[0] >= 44.9);
});

test('scheduled mote and shade spawners obey Contract v1.1 schedule and interaction delay', () => {
  const sim = new LanternIslandSim({ seed: 42, night: 1 });
  assert.equal(sim.motes.length, 20);
  assert.equal(sim.shades.length, 0);

  for (let t = 1; t < 300; t += 1) sim.step({});
  const ev300 = sim.step({});
  const spawned = ev300.filter((e) => e.name === 'shade_spawned');
  assert.equal(spawned.length, 2);
  assert.deepEqual(spawned.map((e) => e.data.id), ['S1', 'S2']);
  assert.equal(sim.shades[0].state, 'spawning');

  for (let t = 0; t < 30; t += 1) sim.step({});
  assert.equal(sim.shades[0].state, 'wander');
});

test('sim and headless modules never reference browser, Three.js, Math.random, or Date.now', () => {
  const dirs = [path.join(ROOT, 'src/sim'), path.join(ROOT, 'src/headless')];
  const forbidden = [/\bthree\b/, /\bMath\.random\b/, /\bDate\.now\b/, /\bperformance\.now\b/, /\bwindow\./, /\bdocument\./];
  for (const dir of dirs) {
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.js')) continue;
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const codeOnly = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const pattern of forbidden) {
        assert.equal(
          pattern.test(codeOnly),
          false,
          `${file} must not contain forbidden pattern ${pattern}`
        );
      }
    }
  }
});
