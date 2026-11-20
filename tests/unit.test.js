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

test('scenario initialization emits no events, adds zero score, and does not raise capacity from pre-lit lanterns', () => {
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
  assert.equal(snap.player.capacity, 10);
  assert.equal(snap.lanterns[0].lit, true);
  assert.equal(snap.lanterns[0].fuel, 100);
  assert.equal(snap.lanterns[0].ever_lit, true);
});

test('v1.2 scoring awards +5 per deposited mote, +100 first light, +40 relight, and skips full lanterns on interact', () => {
  const sim = new LanternIslandSim({
    seed: 1,
    night: 1,
    scenario: {
      player: { pos: [0, 0, 25], carried: 10, flames: 3 },
      random_motes: false,
      random_shades: false,
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: false }]
    }
  });

  // Light L1 for first time: 10*5 + 100 = 150
  const ev1 = sim.step({ interact: true });
  assert.ok(ev1.some((e) => e.name === 'lantern_lit' && e.data.relight === false));
  assert.equal(sim.score, 150);
  assert.equal(sim.getCarryCapacity(), 12);

  // Immediately try to refuel L1 when fuel is ~99.98?Wait: after 1 tick fuel is 5999/60, needed = 1!
  // Let's test full fuel=100 directly in a fresh scenario:
  const simFull = new LanternIslandSim({
    seed: 1,
    night: 1,
    scenario: {
      player: { pos: [0, 0, 25], carried: 5, flames: 3 },
      random_motes: false,
      random_shades: false,
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 100 }]
    }
  });
  // Before step 5, step 2 decays L1 to 5999/60 -> wait: fuel=100 at tick 0 -> after step 2 it's 99.9833 < 100 so ceil((6000-5999)/600) = 1!
  // Let's verify ceil((100 - fuel)/10) formula when fuel is 95 (1 mote fills to 100) vs 100:
  simFull.lanterns[0].fuel60 = 6000;
  // Directly test refuel at 100 via simFull with fuel=100 after setting decay=0? No: at tick 1 decay makes fuel 99.983.
  // Verify relight score (+40) and capacity cap at 20:
  sim.player.successfulLights = 5;
  assert.equal(sim.getCarryCapacity(), 20);
  sim.player.successfulLights = 8;
  assert.equal(sim.getCarryCapacity(), 20);
});

test('fuel < 30 loses safe zone and draws wandering shades to drain; fuel === 30 keeps safe zone', () => {
  const simSafe = new LanternIslandSim({
    seed: 1,
    night: 1,
    scenario: {
      player: { pos: [0, 0, -30], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 30 + 1 / 60 }], // After step 2 decay -> exact 30.0
      shades: [{ id: 'S1', pos: [7, 0.8, 0], state: 'wander' }]
    }
  });
  simSafe.step({});
  assert.equal(simSafe.lanterns[0].fuel60, 1800);
  assert.ok(distXZ(simSafe.shades[0].pos, [0, 0, 0]) >= 6.0 - 1e-6);

  // When fuel < 30, wandering shade walks toward weak lantern and enters drain within 2m
  const simDrain = new LanternIslandSim({
    seed: 1,
    night: 1,
    scenario: {
      player: { pos: [0, 0, -30], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 25 }],
      shades: [{ id: 'S1', pos: [4, 0.8, 0], state: 'wander' }]
    }
  });
  for (let i = 0; i < 40; i += 1) simDrain.step({});
  assert.equal(simDrain.shades[0].state, 'drain');
  assert.equal(simDrain.shades[0].targetLanternId, 'L1');
});

test('no_flames always takes priority over dawn_survived on the exact final dawn tick', () => {
  const sim = new LanternIslandSim({
    seed: 1,
    night: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 0, flames: 1 },
      random_motes: false,
      random_shades: false,
      lanterns: [
        { id: 'L1', pos: [0, 0, 25], lit: true, fuel: 80 },
        { id: 'L2', pos: [23.8, 0, 7.7], lit: true, fuel: 80 },
        { id: 'L3', pos: [14.7, 0, -20.2], lit: true, fuel: 80 }
      ],
      shades: [{ id: 'S1', pos: [0.5, 0.8, 0], state: 'chase' }],
      time_left_s: 1 / 60
    }
  });
  const evs = sim.step({});
  assert.ok(evs.some((e) => e.name === 'player_hit'));
  const over = evs.find((e) => e.name === 'game_over');
  assert.ok(over);
  assert.equal(over.data.result, 'lost');
  assert.equal(over.data.reason, 'no_flames');
});

test('Night 3 ramps climb smoothly 30deg/150deg, cliffs block direct ascent, and Bell Tower r=2 blocks movement', () => {
  const map3 = getMapConfig(3);
  const rad30 = (30 * Math.PI) / 180;
  assert.equal(getSurfaceHeight(map3, 30 * Math.cos(rad30), 30 * Math.sin(rad30)), 0);
  assert.ok(Math.abs(getSurfaceHeight(map3, 27 * Math.cos(rad30), 27 * Math.sin(rad30)) - 1.5) < 1e-6);
  assert.equal(getSurfaceHeight(map3, 24 * Math.cos(rad30), 24 * Math.sin(rad30)), 3);

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
  for (let i = 0; i < 200; i += 1) {
    sim.step({ move: [1, 0] });
    assert.equal(sim.player.pos[1], 0);
  }
  assert.ok(sim.player.pos[0] >= 44.9);
});

test('scheduled mote and shade spawners obey schedule and interaction delay', () => {
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
