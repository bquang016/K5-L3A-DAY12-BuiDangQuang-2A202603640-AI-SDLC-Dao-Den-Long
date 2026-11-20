import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_TUNING } from '../src/sim/config.js';
import { distXZ, rotateMove } from '../src/sim/math.js';
import { createRng } from '../src/sim/prng.js';
import { LanternIslandSim } from '../src/sim/simulation.js';

const ROOT = process.cwd();

test('createRng is deterministic per seed and differs across seeds', () => {
  const a1 = createRng(123);
  const a2 = createRng(123);
  const b = createRng(456);
  const seq1 = [a1.next(), a1.next(), a1.next()];
  const seq2 = [a2.next(), a2.next(), a2.next()];
  const seqB = [b.next(), b.next(), b.next()];
  assert.deepEqual(seq1, seq2);
  assert.notDeepEqual(seq1, seqB);
});

test('rotateMove applies Test Contract yaw formula and normalizes vectors > 1', () => {
  assert.deepEqual(rotateMove([0, 0], 45), [0, 0]);

  const [x0, z0] = rotateMove([0, 1], 0);
  assert.ok(Math.abs(x0 - 0) < 1e-9 && Math.abs(z0 - 1) < 1e-9);

  const [x90, z90] = rotateMove([0, 1], 90);
  assert.ok(Math.abs(x90 - 1) < 1e-9 && Math.abs(z90 - 0) < 1e-9);

  const [xn90, zn90] = rotateMove([1, 0], -90);
  assert.ok(Math.abs(xn90 - 0) < 1e-9 && Math.abs(zn90 - 1) < 1e-9);

  const diag = rotateMove([1, 1], 0);
  assert.ok(Math.abs(Math.hypot(diag[0], diag[1]) - 1) < 1e-9);
});

test('jump rises and lands cleanly back on Y=0', () => {
  const sim = new LanternIslandSim({
    seed: 1,
    scenario: { random_motes: false, random_shades: false, motes: [], shades: [] }
  });
  sim.step({ jump: true });
  assert.ok(sim.player.pos[1] > 0);
  assert.equal(sim.player.grounded, false);

  for (let i = 0; i < 60; i += 1) {
    sim.step({ jump: true }); // held button should not double-jump
  }
  assert.equal(sim.player.pos[1], 0);
  assert.equal(sim.player.grounded, true);
});

test('scenario initialization emits no events and grants no score even with pre-lit lanterns', () => {
  const sim = new LanternIslandSim({
    seed: 9,
    scenario: {
      random_motes: false,
      random_shades: false,
      lanterns: [
        { id: 'L2', lit: true },
        { id: 'L3', lit: true }
      ]
    }
  });
  const snap = sim.getSnapshot();
  assert.equal(snap.tick, 0);
  assert.equal(snap.score, 0);
  assert.equal(snap.lanterns.find((l) => l.id === 'L2').lit, true);
  assert.equal(snap.lanterns.find((l) => l.id === 'L2').deposited, DEFAULT_TUNING.lantern_cost);
});

test('partial deposit then completion emits deposit, lantern_lit, and win bonuses', () => {
  const sim = new LanternIslandSim({
    seed: 1,
    scenario: {
      player: { pos: [0, 0, 23], carried: 2, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 24], [0, 0, 24]],
      shades: [],
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

  // Step 1: pick up the two motes at [0,0,24] (distance 1m <= pickup_radius 2) and deposit 4 -> win
  const ev1 = sim.step({ interact: true });
  assert.equal(ev1.filter((e) => e.name === 'mote_picked').length, 2);
  assert.ok(ev1.some((e) => e.name === 'deposit' && e.data.amount === 4 && e.data.deposited === 4));
  assert.ok(ev1.some((e) => e.name === 'lantern_lit' && e.data.lantern_id === 'L1'));
  assert.ok(ev1.some((e) => e.name === 'game_over' && e.data.result === 'won' && e.data.reason === 'all_lit'));

  // Score: 2*10 + 150 + floor(100 - 1/60)*2 (99*2=198) + 3*100 = 668
  assert.equal(sim.score, 668);
});

test('pulse requires pulse_cost, stuns, pushes outside lit safe_radius, and respects cooldown', () => {
  const sim = new LanternIslandSim({
    seed: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 1, flames: 3 },
      random_motes: false,
      random_shades: false,
      shades: [{ id: 'S1', pos: [4, 0, 0] }]
    }
  });
  // Insufficient light (carried=1 < pulse_cost=2)
  assert.equal(sim.step({ pulse: true }).length, 0);
  assert.equal(sim.shades[0].state, 'chase');

  // Release pulse button so next press creates a false -> true edge
  sim.step({ pulse: false });

  // Give enough light and place lit L2 directly behind push vector to verify safe_radius clamp
  sim.player.carried = 4;
  sim.lanterns[1].pos = [10, 0, 0];
  sim.lanterns[1].lit = true;

  const events = sim.step({ pulse: true });
  const pulseEv = events.find((e) => e.name === 'pulse');
  assert.ok(pulseEv);
  assert.deepEqual(pulseEv.data.stunned_ids, ['S1']);
  assert.equal(sim.player.carried, 2);
  assert.equal(sim.shades[0].state, 'stunned');
  assert.ok(distXZ(sim.shades[0].pos, sim.lanterns[1].pos) >= DEFAULT_TUNING.safe_radius - 1e-6);

  // Cooldown blocks immediate second pulse
  sim.player.carried = 4;
  const blocked = sim.step({ pulse: false });
  assert.equal(blocked.some((e) => e.name === 'pulse'), false);
  const blocked2 = sim.step({ pulse: true });
  assert.equal(blocked2.some((e) => e.name === 'pulse'), false);
});

test('shade starting inside lit lantern safe_radius enters flee state outward', () => {
  const sim = new LanternIslandSim({
    seed: 1,
    scenario: {
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
      shades: [{ id: 'S1', pos: [2, 0, 0] }]
    }
  });
  sim.step({});
  assert.equal(sim.shades[0].state, 'flee');
  assert.ok(sim.shades[0].pos[0] > 2);
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
          `${file} must not contain forbidden non-deterministic/render pattern ${pattern}`
        );
      }
    }
  }
});
