import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_TUNING } from '../src/sim/config.js';
import { distXZ } from '../src/sim/math.js';

const ROOT = process.cwd();
const CLI_PATH = path.join(ROOT, 'src/headless/cli.js');
const SCENARIO_DIR = path.join(ROOT, 'tests/scenarios');
const VALID_SHADE_STATES = new Set(['spawning', 'wander', 'chase', 'recoil', 'stunned', 'drain']);

function runCli(args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: ROOT,
    encoding: 'utf8'
  });
}

function parseJsonl(text) {
  return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function assertValidContractV12Stream(records, expectedNight) {
  assert.ok(records.length >= 3);
  assert.equal(records[0].type, 'snapshot');
  assert.equal(records[0].tick, 0);
  assert.equal(records[0].night, expectedNight);
  assert.equal(records[1].type, 'event');
  assert.equal(records[1].tick, 0);
  assert.equal(records[1].name, 'night_start');
  assert.equal(records[1].data.night, expectedNight);

  const end = records.at(-1);
  assert.equal(end.type, 'end');

  for (let i = 0; i < records.length - 1; i += 1) {
    const r = records[i];
    if (r.type === 'snapshot') {
      assert.ok(['playing', 'paused', 'won', 'lost'].includes(r.state));
      assert.ok('wind' in r && typeof r.wind.active === 'boolean');
      assert.ok(Array.isArray(r.player.vel) && typeof r.player.grounded === 'boolean');
      assert.ok(typeof r.player.invuln === 'boolean');
      assert.ok(typeof r.player.capacity === 'number' && r.player.capacity >= 10);
      assert.ok('dash_cd_s' in r.player && 'pulse_cd_s' in r.player && 'charm_s' in r.player);
      assert.ok(Array.isArray(r.drifters) && Array.isArray(r.charms) && Array.isArray(r.motes));
      for (const l of r.lanterns) {
        assert.ok(typeof l.fuel === 'number' && typeof l.ever_lit === 'boolean' && typeof l.relit_count === 'number');
        if (!l.lit) assert.equal(l.fuel, 0);
        assert.equal(Math.round(l.fuel * 10) / 10, l.fuel);
      }
      for (const s of r.shades) {
        assert.ok(VALID_SHADE_STATES.has(s.state), `Invalid shade state: ${s.state}`);
      }
      for (const c of r.player.pos) {
        assert.equal(Math.round(c * 1000) / 1000, c);
      }
    }
  }
}

function runScenario({ night = 1, scenarioFile, inputsFile = null, ticks, snapshotEvery = 10 }) {
  const out = path.join(os.tmpdir(), `ddl-v12-${night}-${path.basename(scenarioFile)}-${process.pid}.jsonl`);
  const args = [
    '--seed', '1',
    '--night', String(night),
    '--scenario', path.join(SCENARIO_DIR, scenarioFile),
    '--ticks', String(ticks),
    '--snapshot-every', String(snapshotEvery),
    '--out', out
  ];
  if (inputsFile) {
    args.push('--inputs', path.join(SCENARIO_DIR, inputsFile));
  }
  const res = runCli(args);
  assert.equal(res.status, 0, res.stderr);
  const records = parseJsonl(fs.readFileSync(out, 'utf8'));
  fs.rmSync(out, { force: true });
  assertValidContractV12Stream(records, night);
  return records;
}

test('game.contract.json is Contract v1.3 and matches DEFAULT_TUNING', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8'));
  assert.equal(contract.contract_version, '1.3');
  assert.ok(contract.team && contract.team !== 'mssv-ho-ten');
  assert.ok(contract.run_cmd && contract.bench_cmd && contract.soak_cmd);
  assert.deepEqual(contract.tuning, DEFAULT_TUNING);
});

test('Scenario 01 (v1.2): mote pickup & carry_capacity=10 cap', () => {
  const records = runScenario({
    scenarioFile: '01-mote-pickup.json',
    inputsFile: '01-mote-pickup.inputs.json',
    ticks: 260
  });
  const picked = records.filter((r) => r.type === 'event' && r.name === 'mote_picked');
  assert.equal(picked.length, 10);
  const lastSnap = records.filter((r) => r.type === 'snapshot').at(-1);
  assert.equal(lastSnap.player.carried, 10);
  assert.equal(lastSnap.motes_active, 1);
  assert.equal(records.at(-1).score, 0);
});

test('Scenario 02 (v1.2): lighting 5th lantern continues until dawn_survived with v1.2 score', () => {
  const records = runScenario({
    scenarioFile: '02-light-lantern-win.json',
    inputsFile: '02-light-lantern-win.inputs.json',
    ticks: 200
  });
  const litEv = records.find((r) => r.type === 'event' && r.name === 'lantern_lit' && r.tick === 41);
  assert.ok(litEv);
  assert.equal(litEv.data.relight, false);
  const overEv = records.find((r) => r.type === 'event' && r.name === 'game_over');
  assert.ok(overEv);
  assert.equal(overEv.tick, 120);
  assert.equal(overEv.data.result, 'won');
  assert.equal(overEv.data.reason, 'dawn_survived');
  assert.equal(records.at(-1).ticks, 120);
  assert.equal(records.at(-1).score, 1040);
});

test('Scenario 03 (v1.2): pulse stuns 120 ticks, pushes 4m over 15 ticks, enforces 3s cooldown', () => {
  const records = runScenario({
    scenarioFile: '03-pulse-stun-push.json',
    inputsFile: '03-pulse-stun-push.inputs.json',
    ticks: 150
  });
  const pulses = records.filter((r) => r.type === 'event' && r.name === 'pulse');
  assert.equal(pulses.length, 1);
  const snap20 = records.find((r) => r.type === 'snapshot' && r.tick === 20);
  assert.equal(snap20.shades[0].state, 'stunned');
  assert.equal(snap20.shades[0].pos[0], 7);
  const snap130 = records.find((r) => r.type === 'snapshot' && r.tick === 130);
  assert.equal(snap130.shades[0].state, 'chase');
});

test('Scenario 04 (v1.2): shade chase drops motes, recoils, and ends in no_flames loss', () => {
  const records = runScenario({
    scenarioFile: '04-shade-hit-loss.json',
    ticks: 220
  });
  const hits = records.filter((r) => r.type === 'event' && r.name === 'player_hit');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].data.dropped, 2);
  assert.ok(hits[1].tick - hits[0].tick >= 90);
  assert.equal(records.at(-1).state, 'lost');
});

test('Scenario 05 (v1.2): safe_radius=6 stays active while fuel >= 30 over 300 ticks', () => {
  const records = runScenario({
    scenarioFile: '05-safe-zone.json',
    ticks: 300
  });
  assert.equal(records.some((r) => r.type === 'event' && r.name === 'player_hit'), false);
  const lastSnap = records.filter((r) => r.type === 'snapshot').at(-1);
  assert.equal(lastSnap.lanterns[0].fuel, 95);
  for (const snap of records.filter((r) => r.type === 'snapshot')) {
    assert.ok(distXZ(snap.shades[0].pos, [0, 0, 0]) >= DEFAULT_TUNING.safe_radius - 0.002);
  }
});

test('Scenario 06 (v1.2): dawn loss terminates at tick 120 when < win_ratio lit', () => {
  const records = runScenario({
    scenarioFile: '06-dawn-loss.json',
    ticks: 180
  });
  assert.equal(records.at(-1).ticks, 120);
  assert.equal(records.at(-1).state, 'lost');
});

test('Scenario 07 (v1.2): air dash holds height, travels 2.8m in 12 ticks, and enforces 1.5s cooldown', () => {
  const records = runScenario({
    scenarioFile: '07-dash-and-cooldown.json',
    inputsFile: '07-dash-and-cooldown.inputs.json',
    ticks: 60,
    snapshotEvery: 1
  });
  assert.equal(records.filter((r) => r.type === 'event' && r.name === 'dash').length, 1);
  const snap11 = records.find((r) => r.type === 'snapshot' && r.tick === 11);
  const snap22 = records.find((r) => r.type === 'snapshot' && r.tick === 22);
  assert.equal(snap11.player.pos[1], snap22.player.pos[1]);
  assert.ok(Math.abs(snap22.player.pos[2] - 2.8) < 0.01);
});

test('Scenario 08 (v1.2): fall below Y=-10 emits player_hit fall, waits 60 ticks, respawns at origin', () => {
  const records = runScenario({
    scenarioFile: '08-fall-and-respawn.json',
    inputsFile: '08-fall-and-respawn.inputs.json',
    ticks: 180,
    snapshotEvery: 5
  });
  const fallHit = records.find((r) => r.type === 'event' && r.name === 'player_hit');
  assert.ok(fallHit && fallHit.data.by === 'fall' && fallHit.data.lost === 4);
  const snapEnd = records.filter((r) => r.type === 'snapshot').at(-1);
  assert.deepEqual(snapEnd.player.pos, [0, 0, 0]);
  assert.equal(snapEnd.player.invuln, true);
});

test('Scenario 09 (v1.2): Night 2 jump pad launches Mây onto Island B', () => {
  const records = runScenario({
    night: 2,
    scenarioFile: '09-night2-bridge-and-jumppad.json',
    inputsFile: '09-night2-bridge-and-jumppad.inputs.json',
    ticks: 140
  });
  const lastSnap = records.filter((r) => r.type === 'snapshot').at(-1);
  assert.equal(lastSnap.player.grounded, true);
  assert.ok(distXZ(lastSnap.player.pos, [70, 0, 0]) < 28);
});

test('Scenario 10 (v1.2): Drifter steals 3 motes then drops them on Pulse', () => {
  const records = runScenario({
    night: 2,
    scenarioFile: '10-drifter-steal-and-drop.json',
    inputsFile: '10-drifter-steal-and-drop.inputs.json',
    ticks: 60
  });
  const steal = records.find((r) => r.type === 'event' && r.name === 'drifter_steal');
  const drop = records.find((r) => r.type === 'event' && r.name === 'drifter_drop');
  assert.ok(steal && steal.data.amount === 3);
  assert.ok(drop && drop.data.amount === 3);
});

test('Scenario 11 (v1.2): Charm C1 boosts speed and removes dash cooldown', () => {
  const records = runScenario({
    night: 2,
    scenarioFile: '11-charm-speed-and-dash.json',
    inputsFile: '11-charm-speed-and-dash.inputs.json',
    ticks: 40
  });
  assert.ok(records.some((r) => r.type === 'event' && r.name === 'charm_picked'));
  assert.equal(records.filter((r) => r.type === 'event' && r.name === 'dash').length, 2);
});

test('Scenario 12 (v1.2): Night 3 jump pad lands on Tier 2 and Wind activates at tick 1800', () => {
  const records = runScenario({
    night: 3,
    scenarioFile: '12-night3-ramp-jumppad-tower-wind.json',
    inputsFile: '12-night3-ramp-jumppad-tower-wind.inputs.json',
    ticks: 1820
  });
  assert.equal(records.find((r) => r.type === 'snapshot' && r.tick === 80).player.pos[1], 6);
  assert.equal(records.find((r) => r.type === 'snapshot' && r.tick === 1810).wind.active, true);
});

test('Scenario 13 (v1.2): Pause freezes sim_tick, fuel decay, timers, and TTL', () => {
  const records = runScenario({
    scenarioFile: '13-pause-and-resume.json',
    inputsFile: '13-pause-and-resume.inputs.json',
    ticks: 35,
    snapshotEvery: 5
  });
  const snap10 = records.find((r) => r.type === 'snapshot' && r.tick === 10);
  const snap20 = records.find((r) => r.type === 'snapshot' && r.tick === 20);
  assert.equal(snap10.state, 'paused');
  assert.equal(snap10.sim_tick, 5);
  assert.equal(snap20.sim_tick, 5);
  assert.equal(snap10.time_left_s, snap20.time_left_s);
});

test('Scenario 14: Fuel decay burns out at tick 60 (lantern_out) and relights for 5 motes (+40 pts)', () => {
  const records = runScenario({
    scenarioFile: '14-fuel-decay-burnout-relight.json',
    inputsFile: '14-fuel-decay-burnout-relight.inputs.json',
    ticks: 90
  });
  const outEv = records.find((r) => r.type === 'event' && r.name === 'lantern_out');
  assert.ok(outEv && outEv.tick === 60 && outEv.data.lantern_id === 'L1');
  const snap70 = records.find((r) => r.type === 'snapshot' && r.tick === 70);
  assert.equal(snap70.lanterns[0].lit, false);
  assert.equal(snap70.lanterns[0].fuel, 0);
  assert.equal(snap70.lanterns[0].ever_lit, true);

  const relitEv = records.find((r) => r.type === 'event' && r.name === 'lantern_lit');
  assert.ok(relitEv && relitEv.tick === 81 && relitEv.data.relight === true);
  const snap90 = records.find((r) => r.type === 'snapshot' && r.tick === 90);
  assert.equal(snap90.lanterns[0].relit_count, 1);
  assert.equal(snap90.player.capacity, 12);
  assert.equal(snap90.score, 65);
});

test('Scenario 15: Refueling weak lantern above 30 restores safe zone and pushes shade out without damage', () => {
  const records = runScenario({
    scenarioFile: '15-refuel-and-safe-push.json',
    inputsFile: '15-refuel-and-safe-push.inputs.json',
    ticks: 40
  });
  const refuelEv = records.find((r) => r.type === 'event' && r.name === 'refuel');
  assert.ok(refuelEv && refuelEv.tick === 1 && refuelEv.data.amount === 5);
  assert.equal(records.some((r) => r.type === 'event' && r.name === 'player_hit'), false);
  const snap40 = records.find((r) => r.type === 'snapshot' && r.tick === 40);
  assert.ok(distXZ(snap40.shades[0].pos, [0, 0, 25]) >= DEFAULT_TUNING.safe_radius - 0.002);
});

test('Scenario 16: Shade drains fuel emitting fuel_drain every 60 ticks and Pulse on draining shade grants +15', () => {
  const records = runScenario({
    scenarioFile: '16-shade-drain-and-pulse-bonus.json',
    inputsFile: '16-shade-drain-and-pulse-bonus.inputs.json',
    ticks: 70
  });
  const pulseEv = records.find((r) => r.type === 'event' && r.name === 'pulse');
  assert.ok(pulseEv && pulseEv.tick === 1);
  assert.deepEqual(pulseEv.data.stunned_ids, ['S2']);
  const snap10 = records.find((r) => r.type === 'snapshot' && r.tick === 10);
  assert.equal(snap10.score, 15);

  const drainEv = records.find((r) => r.type === 'event' && r.name === 'fuel_drain');
  assert.ok(drainEv && drainEv.tick === 60 && drainEv.data.shade_id === 'S1' && drainEv.data.fuel === 19);
});

test('Scenario 17: Dawn win requires >= ceil(0.6*N) lit lanterns and grants fuel + flame bonuses', () => {
  const records = runScenario({
    scenarioFile: '17-dawn-survived-win.json',
    ticks: 150
  });
  const overEv = records.find((r) => r.type === 'event' && r.name === 'game_over');
  assert.ok(overEv && overEv.tick === 120);
  assert.equal(overEv.data.result, 'won');
  assert.equal(overEv.data.reason, 'dawn_survived');
  assert.equal(records.at(-1).score, 364);
});

test('Scenario 18: Lighting lantern grows carry capacity from 10 to 12 for subsequent mote pickup', () => {
  const records = runScenario({
    scenarioFile: '18-capacity-growth.json',
    inputsFile: '18-capacity-growth.inputs.json',
    ticks: 10
  });
  const snap10 = records.find((r) => r.type === 'snapshot' && r.tick === 10);
  assert.equal(snap10.player.capacity, 12);
  assert.equal(snap10.player.carried, 12);
  assert.equal(snap10.motes_active, 2);
});

test('Determinism across Nights 1, 2, 3 and full Night 3 18000-tick run completes well under 30s', () => {
  for (const night of [1, 2, 3]) {
    const out1 = path.join(os.tmpdir(), `ddl-n${night}-a-${process.pid}.jsonl`);
    const out2 = path.join(os.tmpdir(), `ddl-n${night}-b-${process.pid}.jsonl`);
    const r1 = runCli(['--seed', '77', '--night', String(night), '--ticks', '1300', '--out', out1]);
    const r2 = runCli(['--seed', '77', '--night', String(night), '--ticks', '1300', '--out', out2]);
    assert.equal(r1.status, 0, r1.stderr);
    assert.equal(r2.status, 0, r2.stderr);
    assert.equal(fs.readFileSync(out1, 'utf8'), fs.readFileSync(out2, 'utf8'));
    fs.rmSync(out1, { force: true });
    fs.rmSync(out2, { force: true });
  }

  const outPerf = path.join(os.tmpdir(), `ddl-perf-${process.pid}.jsonl`);
  const t0 = performance.now();
  const rPerf = runCli(['--seed', '42', '--night', '3', '--ticks', '18000', '--out', outPerf]);
  const elapsedMs = performance.now() - t0;
  assert.equal(rPerf.status, 0, rPerf.stderr);
  assert.ok(elapsedMs <= 30000, `18000 ticks took ${elapsedMs}ms (> 30000ms limit)`);
  fs.rmSync(outPerf, { force: true });
});

test('CLI exits 2 on invalid JSON/schema and non-zero on invalid flags or night', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-err-'));
  const badJson = path.join(tmpDir, 'bad.json');
  const badState = path.join(tmpDir, 'bad-state.json');
  const badFuel = path.join(tmpDir, 'bad-fuel.json');
  const out = path.join(tmpDir, 'out.jsonl');

  fs.writeFileSync(badJson, '{ broken');
  fs.writeFileSync(badState, JSON.stringify({ shades: [{ pos: [0, 0, 0], state: 'flee' }] }));
  fs.writeFileSync(badFuel, JSON.stringify({ lanterns: [{ id: 'L1', lit: true, fuel: 150 }] }));

  assert.equal(
    runCli(['--seed', '1', '--night', '1', '--scenario', badJson, '--ticks', '5', '--out', out]).status,
    2
  );
  assert.equal(
    runCli(['--seed', '1', '--night', '1', '--scenario', badState, '--ticks', '5', '--out', out]).status,
    2
  );
  assert.equal(
    runCli(['--seed', '1', '--night', '1', '--scenario', badFuel, '--ticks', '5', '--out', out]).status,
    2
  );
  assert.notEqual(runCli(['--seed', '1', '--night', '4', '--ticks', '5', '--out', out]).status, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Contract v1.3: --export-leaderboard exports sorted {"entries": [...]} and soak_cmd passes without leaks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-v13-'));
  const storePath = path.join(tmpDir, 'lb.json');
  const exportEmpty = path.join(tmpDir, 'export-empty.json');
  const exportPop = path.join(tmpDir, 'export-pop.json');
  const soakOut = path.join(tmpDir, 'soak.json');

  const rEmpty = spawnSync(process.execPath, ['scripts/run.js', '--export-leaderboard', exportEmpty], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, DAO_DEN_LONG_LEADERBOARD_PATH: storePath }
  });
  assert.equal(rEmpty.status, 0, rEmpty.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(exportEmpty, 'utf8')), { entries: [] });

  fs.writeFileSync(
    storePath,
    JSON.stringify({
      entries: [
        { name: 'Second', score: 500, nights_won: 1, achieved_at: '2026-11-20T10:10:00+07:00', seed: 2 },
        { name: 'First', score: 500, nights_won: 1, achieved_at: '2026-11-20T10:00:00+07:00', seed: 1 }
      ]
    })
  );
  const rPop = spawnSync(process.execPath, ['scripts/run.js', '--export-leaderboard', exportPop], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, DAO_DEN_LONG_LEADERBOARD_PATH: storePath }
  });
  assert.equal(rPop.status, 0, rPop.stderr);
  const exported = JSON.parse(fs.readFileSync(exportPop, 'utf8'));
  assert.deepEqual(exported.entries.map((e) => e.name), ['First', 'Second']);

  const rSoak = spawnSync(
    process.execPath,
    [
      '--max-semi-space-size=1',
      '--no-concurrent-recompilation',
      '--optimize-for-size',
      '--expose-gc',
      'scripts/soak.js',
      '--seed',
      '7',
      '--nights',
      '3',
      '--out',
      soakOut
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );
  assert.equal(rSoak.status, 0, rSoak.stderr);
  const soak = JSON.parse(fs.readFileSync(soakOut, 'utf8'));
  assert.equal(soak.nights, 3);
  assert.equal(soak.crashes, 0);
  assert.equal(soak.results.length, 3);
  assert.ok(soak.mem_end_mb <= 1.2 * soak.mem_start_mb, `RSS grew too much: ${soak.mem_start_mb} -> ${soak.mem_end_mb}`);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
