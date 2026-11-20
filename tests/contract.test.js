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
const VALID_SHADE_STATES = new Set(['spawning', 'wander', 'chase', 'recoil', 'stunned']);

function runCli(args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: ROOT,
    encoding: 'utf8'
  });
}

function parseJsonl(text) {
  return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function assertValidContractV11Stream(records, expectedNight) {
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
      assert.ok('dash_cd_s' in r.player && 'pulse_cd_s' in r.player && 'charm_s' in r.player);
      assert.ok(Array.isArray(r.drifters) && Array.isArray(r.charms) && Array.isArray(r.motes));
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
  const out = path.join(os.tmpdir(), `ddl-v11-${night}-${path.basename(scenarioFile)}-${process.pid}.jsonl`);
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
  assertValidContractV11Stream(records, night);
  return records;
}

test('game.contract.json is Contract v1.1 and matches DEFAULT_TUNING', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8'));
  assert.equal(contract.contract_version, '1.1');
  assert.ok(contract.team && contract.team !== 'mssv-ho-ten');
  assert.deepEqual(contract.tuning, DEFAULT_TUNING);
});

test('Scenario 01 (v1.1): mote pickup & carry_capacity=10 cap', () => {
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

test('Scenario 02 (v1.1): light 5th lantern to win with standardized score', () => {
  const records = runScenario({
    scenarioFile: '02-light-lantern-win.json',
    inputsFile: '02-light-lantern-win.inputs.json',
    ticks: 120
  });
  assert.equal(records[0].score, 0);
  assert.ok(records.some((r) => r.type === 'event' && r.name === 'deposit' && r.tick === 41));
  assert.ok(records.some((r) => r.type === 'event' && r.name === 'lantern_lit' && r.tick === 41));
  assert.equal(records.at(-1).ticks, 41);
  assert.equal(records.at(-1).state, 'won');
  assert.equal(records.at(-1).score, 948);
});

test('Scenario 03 (v1.1): pulse stuns 120 ticks, pushes 4m over 15 ticks, enforces 3s cooldown', () => {
  const records = runScenario({
    scenarioFile: '03-pulse-stun-push.json',
    inputsFile: '03-pulse-stun-push.inputs.json',
    ticks: 150
  });
  const pulses = records.filter((r) => r.type === 'event' && r.name === 'pulse');
  assert.equal(pulses.length, 1);
  assert.equal(pulses[0].tick, 1);

  const snap10 = records.find((r) => r.type === 'snapshot' && r.tick === 10);
  assert.equal(snap10.shades[0].state, 'stunned');

  const snap20 = records.find((r) => r.type === 'snapshot' && r.tick === 20);
  assert.equal(snap20.shades[0].state, 'stunned');
  assert.equal(snap20.shades[0].pos[0], 7);

  const snap130 = records.find((r) => r.type === 'snapshot' && r.tick === 130);
  assert.equal(snap130.shades[0].state, 'chase');
  assert.ok(snap130.shades[0].pos[0] < 7);
});

test('Scenario 04 (v1.1): shade chase drops motes, recoils, and ends in no_flames loss', () => {
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

test('Scenario 05 (v1.1): safe_radius=6 keeps shade out for 300 ticks', () => {
  const records = runScenario({
    scenarioFile: '05-safe-zone.json',
    ticks: 300
  });
  assert.equal(records.some((r) => r.type === 'event' && r.name === 'player_hit'), false);
  for (const snap of records.filter((r) => r.type === 'snapshot')) {
    assert.ok(distXZ(snap.shades[0].pos, [0, 0, 0]) >= DEFAULT_TUNING.safe_radius - 0.002);
  }
});

test('Scenario 06 (v1.1): dawn loss terminates at tick 120', () => {
  const records = runScenario({
    scenarioFile: '06-dawn-loss.json',
    ticks: 180
  });
  assert.equal(records.at(-1).ticks, 120);
  assert.equal(records.at(-1).state, 'lost');
});

test('Scenario 07: air dash holds height, travels 2.8m in 12 ticks, and enforces 1.5s cooldown', () => {
  const records = runScenario({
    scenarioFile: '07-dash-and-cooldown.json',
    inputsFile: '07-dash-and-cooldown.inputs.json',
    ticks: 60,
    snapshotEvery: 1
  });
  const dashes = records.filter((r) => r.type === 'event' && r.name === 'dash');
  assert.equal(dashes.length, 1);
  assert.equal(dashes[0].tick, 11);

  const snap11 = records.find((r) => r.type === 'snapshot' && r.tick === 11);
  const snap22 = records.find((r) => r.type === 'snapshot' && r.tick === 22);
  assert.equal(snap11.player.pos[1], snap22.player.pos[1]);
  assert.ok(Math.abs(snap22.player.pos[2] - 2.8) < 0.01);
});

test('Scenario 08: fall below Y=-10 emits player_hit fall with lost, waits 60 ticks, respawns at origin', () => {
  const records = runScenario({
    scenarioFile: '08-fall-and-respawn.json',
    inputsFile: '08-fall-and-respawn.inputs.json',
    ticks: 180,
    snapshotEvery: 5
  });
  const fallHit = records.find((r) => r.type === 'event' && r.name === 'player_hit');
  assert.ok(fallHit);
  assert.equal(fallHit.data.by, 'fall');
  assert.equal(fallHit.data.flames, 1);
  assert.equal(fallHit.data.lost, 4);

  const snapEnd = records.filter((r) => r.type === 'snapshot').at(-1);
  assert.deepEqual(snapEnd.player.pos, [0, 0, 0]);
  assert.equal(snapEnd.player.carried, 0);
  assert.equal(snapEnd.player.invuln, true);
});

test('Scenario 09: Night 2 jump pad launches Mây across sea of clouds onto Island B', () => {
  const records = runScenario({
    night: 2,
    scenarioFile: '09-night2-bridge-and-jumppad.json',
    inputsFile: '09-night2-bridge-and-jumppad.inputs.json',
    ticks: 140
  });
  const lastSnap = records.filter((r) => r.type === 'snapshot').at(-1);
  assert.equal(lastSnap.player.grounded, true);
  assert.equal(lastSnap.player.pos[1], 0);
  assert.ok(distXZ(lastSnap.player.pos, [70, 0, 0]) < 28);
});

test('Scenario 10: Drifter steals 3 motes then drops them on Pulse', () => {
  const records = runScenario({
    night: 2,
    scenarioFile: '10-drifter-steal-and-drop.json',
    inputsFile: '10-drifter-steal-and-drop.inputs.json',
    ticks: 60
  });
  const steal = records.find((r) => r.type === 'event' && r.name === 'drifter_steal');
  assert.ok(steal);
  assert.equal(steal.data.amount, 3);
  assert.equal(steal.data.carried, 3);

  const drop = records.find((r) => r.type === 'event' && r.name === 'drifter_drop');
  assert.ok(drop);
  assert.equal(drop.data.amount, 3);

  const lastSnap = records.filter((r) => r.type === 'snapshot').at(-1);
  assert.equal(lastSnap.motes_active, 3);
  assert.equal(lastSnap.motes[0].kind, 'dropped');
});

test('Scenario 11: Charm C1 speeds up to 7.2 m/s and removes dash cooldown', () => {
  const records = runScenario({
    night: 2,
    scenarioFile: '11-charm-speed-and-dash.json',
    inputsFile: '11-charm-speed-and-dash.inputs.json',
    ticks: 40
  });
  const charmEv = records.find((r) => r.type === 'event' && r.name === 'charm_picked');
  assert.ok(charmEv);
  assert.equal(charmEv.data.charm_id, 'C1');
  assert.equal(charmEv.data.charm_ticks, 600);

  const dashes = records.filter((r) => r.type === 'event' && r.name === 'dash');
  assert.equal(dashes.length, 2);
});

test('Scenario 12: Night 3 jump pad lands on Tier 2 (Y=6) and Wind activates at tick 1800', () => {
  const records = runScenario({
    night: 3,
    scenarioFile: '12-night3-ramp-jumppad-tower-wind.json',
    inputsFile: '12-night3-ramp-jumppad-tower-wind.inputs.json',
    ticks: 1820
  });
  const snap80 = records.find((r) => r.type === 'snapshot' && r.tick === 80);
  assert.equal(snap80.player.pos[1], 6);
  assert.equal(snap80.player.grounded, true);

  const snap1810 = records.find((r) => r.type === 'snapshot' && r.tick === 1810);
  assert.equal(snap1810.wind.active, true);
});

test('Scenario 13: Pause freezes sim_tick, timer, cooldowns, and mote TTL while tick increments', () => {
  const records = runScenario({
    scenarioFile: '13-pause-and-resume.json',
    inputsFile: '13-pause-and-resume.inputs.json',
    ticks: 35,
    snapshotEvery: 5
  });
  assert.ok(records.some((r) => r.type === 'event' && r.name === 'paused' && r.tick === 6));
  assert.ok(records.some((r) => r.type === 'event' && r.name === 'resumed' && r.tick === 26));

  const snap10 = records.find((r) => r.type === 'snapshot' && r.tick === 10);
  const snap20 = records.find((r) => r.type === 'snapshot' && r.tick === 20);
  assert.equal(snap10.state, 'paused');
  assert.equal(snap10.sim_tick, 5);
  assert.equal(snap20.sim_tick, 5);
  assert.equal(snap10.time_left_s, snap20.time_left_s);
  assert.equal(snap10.player.dash_cd_s, snap20.player.dash_cd_s);
  assert.equal(snap10.motes[0].ttl_s, snap20.motes[0].ttl_s);

  const snap35 = records.find((r) => r.type === 'snapshot' && r.tick === 35);
  assert.equal(snap35.state, 'playing');
  assert.equal(snap35.sim_tick, 15);
});

test('Determinism across Nights 1, 2, 3 and full Night 3 21600-tick run completes well under 30s', () => {
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
  const rPerf = runCli(['--seed', '42', '--night', '3', '--ticks', '21600', '--out', outPerf]);
  const elapsedMs = performance.now() - t0;
  assert.equal(rPerf.status, 0, rPerf.stderr);
  assert.ok(elapsedMs <= 30000, `21600 ticks took ${elapsedMs}ms (> 30000ms limit)`);
  fs.rmSync(outPerf, { force: true });
});

test('CLI exits 2 on invalid JSON/schema and non-zero on invalid flags or night', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-err-'));
  const badJson = path.join(tmpDir, 'bad.json');
  const badState = path.join(tmpDir, 'bad-state.json');
  const badLantern = path.join(tmpDir, 'bad-lantern.json');
  const out = path.join(tmpDir, 'out.jsonl');

  fs.writeFileSync(badJson, '{ broken');
  fs.writeFileSync(badState, JSON.stringify({ shades: [{ pos: [0, 0, 0], state: 'flee' }] }));
  fs.writeFileSync(badLantern, JSON.stringify({ lanterns: [{ id: 'L6', lit: true }] }));

  assert.equal(
    runCli(['--seed', '1', '--night', '1', '--scenario', badJson, '--ticks', '5', '--out', out]).status,
    2
  );
  assert.equal(
    runCli(['--seed', '1', '--night', '1', '--scenario', badState, '--ticks', '5', '--out', out]).status,
    2
  );
  assert.equal(
    runCli(['--seed', '1', '--night', '1', '--scenario', badLantern, '--ticks', '5', '--out', out]).status,
    2
  );
  assert.notEqual(runCli(['--seed', '1', '--night', '4', '--ticks', '5', '--out', out]).status, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
