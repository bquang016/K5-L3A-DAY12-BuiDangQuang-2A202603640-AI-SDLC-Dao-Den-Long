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

function runCli(args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: ROOT,
    encoding: 'utf8'
  });
}

function parseJsonl(text) {
  const lines = text.trim().split('\n').filter(Boolean);
  return lines.map((line) => JSON.parse(line));
}

function assertValidContractStream(records) {
  assert.ok(records.length >= 2, 'Stream must contain at least tick 0 snapshot and end record');
  assert.equal(records[0].type, 'snapshot');
  assert.equal(records[0].tick, 0);
  const end = records[records.length - 1];
  assert.equal(end.type, 'end');

  for (let i = 0; i < records.length - 1; i += 1) {
    const rec = records[i];
    assert.ok(rec.type === 'snapshot' || rec.type === 'event');
    if (rec.type === 'snapshot') {
      assert.equal(rec.sim_tick, rec.tick);
      assert.ok(['playing', 'won', 'lost'].includes(rec.state));
      for (const coord of rec.player.pos) {
        assert.equal(Math.round(coord * 1000) / 1000, coord);
      }
    }
  }
}

test('game.contract.json tuning matches DEFAULT_TUNING in src/sim/config.js', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8'));
  assert.equal(contract.contract_version, '1.0');
  assert.ok(contract.team && contract.team !== 'mssv-ho-ten');
  assert.deepEqual(contract.tuning, DEFAULT_TUNING);
});

test('Scenario 01: mote pickup & carry_capacity cap via headless CLI', () => {
  const out = path.join(os.tmpdir(), `ddl-s01-${process.pid}.jsonl`);
  const res = runCli([
    '--seed', '1',
    '--night', '1',
    '--scenario', path.join(SCENARIO_DIR, '01-mote-pickup.json'),
    '--inputs', path.join(SCENARIO_DIR, '01-mote-pickup.inputs.json'),
    '--ticks', '200',
    '--out', out
  ]);
  assert.equal(res.status, 0, res.stderr);
  const records = parseJsonl(fs.readFileSync(out, 'utf8'));
  assertValidContractStream(records);

  const pickedEvents = records.filter((r) => r.type === 'event' && r.name === 'mote_picked');
  assert.equal(pickedEvents.length, 6);
  const lastSnap = records.filter((r) => r.type === 'snapshot').at(-1);
  assert.equal(lastSnap.player.carried, 6);
  assert.equal(lastSnap.motes_active, 1);
  assert.equal(records.at(-1).score, 60);
  fs.rmSync(out, { force: true });
});

test('Scenario 02: light 5th lantern to win with time and flame bonus', () => {
  const out = path.join(os.tmpdir(), `ddl-s02-${process.pid}.jsonl`);
  const res = runCli([
    '--seed', '1',
    '--night', '1',
    '--scenario', path.join(SCENARIO_DIR, '02-light-lantern-win.json'),
    '--inputs', path.join(SCENARIO_DIR, '02-light-lantern-win.inputs.json'),
    '--ticks', '120',
    '--out', out
  ]);
  assert.equal(res.status, 0, res.stderr);
  const records = parseJsonl(fs.readFileSync(out, 'utf8'));
  assertValidContractStream(records);

  assert.equal(records[0].score, 0);
  assert.ok(records.some((r) => r.type === 'event' && r.name === 'deposit' && r.tick === 31));
  assert.ok(records.some((r) => r.type === 'event' && r.name === 'lantern_lit' && r.tick === 31));
  assert.ok(
    records.some(
      (r) => r.type === 'event' && r.name === 'game_over' && r.data.result === 'won' && r.data.reason === 'all_lit'
    )
  );
  const end = records.at(-1);
  assert.equal(end.ticks, 31);
  assert.equal(end.state, 'won');
  assert.equal(end.score, 1048);
  fs.rmSync(out, { force: true });
});

test('Scenario 03: pulse stuns & pushes shade, cooldown blocks immediate reuse, shade recovers', () => {
  const out = path.join(os.tmpdir(), `ddl-s03-${process.pid}.jsonl`);
  const res = runCli([
    '--seed', '1',
    '--night', '1',
    '--scenario', path.join(SCENARIO_DIR, '03-pulse-stun-push.json'),
    '--inputs', path.join(SCENARIO_DIR, '03-pulse-stun-push.inputs.json'),
    '--ticks', '220',
    '--out', out
  ]);
  assert.equal(res.status, 0, res.stderr);
  const records = parseJsonl(fs.readFileSync(out, 'utf8'));
  assertValidContractStream(records);

  const pulses = records.filter((r) => r.type === 'event' && r.name === 'pulse');
  assert.equal(pulses.length, 1);
  assert.equal(pulses[0].tick, 1);
  assert.deepEqual(pulses[0].data.stunned_ids, ['S1']);

  const snap10 = records.find((r) => r.type === 'snapshot' && r.tick === 10);
  assert.equal(snap10.shades[0].state, 'stunned');
  assert.equal(snap10.shades[0].pos[0], 11);

  const snap190 = records.find((r) => r.type === 'snapshot' && r.tick === 190);
  assert.equal(snap190.shades[0].state, 'chase');
  assert.ok(snap190.shades[0].pos[0] < 11);
  fs.rmSync(out, { force: true });
});

test('Scenario 04: shade chase triggers hit drop, invuln window, and no_flames loss', () => {
  const out = path.join(os.tmpdir(), `ddl-s04-${process.pid}.jsonl`);
  const res = runCli([
    '--seed', '1',
    '--night', '1',
    '--scenario', path.join(SCENARIO_DIR, '04-shade-hit-loss.json'),
    '--ticks', '200',
    '--out', out
  ]);
  assert.equal(res.status, 0, res.stderr);
  const records = parseJsonl(fs.readFileSync(out, 'utf8'));
  assertValidContractStream(records);

  const hits = records.filter((r) => r.type === 'event' && r.name === 'player_hit');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].data.dropped, 2);
  assert.equal(hits[0].data.flames, 1);
  assert.ok(hits[1].tick - hits[0].tick >= 90);
  assert.equal(hits[1].data.flames, 0);
  assert.equal(records.at(-1).state, 'lost');
  fs.rmSync(out, { force: true });
});

test('Scenario 05: lit lantern safe_radius keeps shade out for 300 ticks', () => {
  const out = path.join(os.tmpdir(), `ddl-s05-${process.pid}.jsonl`);
  const res = runCli([
    '--seed', '1',
    '--night', '1',
    '--scenario', path.join(SCENARIO_DIR, '05-safe-zone.json'),
    '--ticks', '300',
    '--out', out
  ]);
  assert.equal(res.status, 0, res.stderr);
  const records = parseJsonl(fs.readFileSync(out, 'utf8'));
  assertValidContractStream(records);

  assert.equal(records.some((r) => r.type === 'event' && r.name === 'player_hit'), false);
  for (const snap of records.filter((r) => r.type === 'snapshot')) {
    assert.ok(distXZ(snap.shades[0].pos, [0, 0, 0]) >= DEFAULT_TUNING.safe_radius - 0.002);
  }
  assert.equal(records.at(-1).state, 'playing');
  fs.rmSync(out, { force: true });
});

test('Scenario 06: dawn loss terminates cleanly when time_left_s hits 0', () => {
  const out = path.join(os.tmpdir(), `ddl-s06-${process.pid}.jsonl`);
  const res = runCli([
    '--seed', '1',
    '--night', '1',
    '--scenario', path.join(SCENARIO_DIR, '06-dawn-loss.json'),
    '--ticks', '180',
    '--out', out
  ]);
  assert.equal(res.status, 0, res.stderr);
  const records = parseJsonl(fs.readFileSync(out, 'utf8'));
  assertValidContractStream(records);

  const over = records.find((r) => r.type === 'event' && r.name === 'game_over');
  assert.ok(over);
  assert.equal(over.tick, 120);
  assert.equal(over.data.result, 'lost');
  assert.equal(over.data.reason, 'dawn');
  assert.equal(records.at(-1).ticks, 120);
  assert.equal(records.at(-1).state, 'lost');
  fs.rmSync(out, { force: true });
});

test('Full Night 1 seeded run is byte-for-byte deterministic and spawns shades cleanly', () => {
  const out1 = path.join(os.tmpdir(), `ddl-det1-${process.pid}.jsonl`);
  const out2 = path.join(os.tmpdir(), `ddl-det2-${process.pid}.jsonl`);
  const argsBase = ['--seed', '42', '--night', '1', '--ticks', '600'];

  const r1 = runCli([...argsBase, '--out', out1]);
  const r2 = runCli([...argsBase, '--out', out2]);
  assert.equal(r1.status, 0, r1.stderr);
  assert.equal(r2.status, 0, r2.stderr);

  const bytes1 = fs.readFileSync(out1, 'utf8');
  const bytes2 = fs.readFileSync(out2, 'utf8');
  assert.equal(bytes1, bytes2);

  // Also verify periodic shade_spawned at tick 900 with a survival scenario
  const spawnScen = path.join(os.tmpdir(), `ddl-spawn-${process.pid}.json`);
  const outSpawn = path.join(os.tmpdir(), `ddl-spawn-${process.pid}.jsonl`);
  fs.writeFileSync(
    spawnScen,
    JSON.stringify({ player: { pos: [0, 0, 0], flames: 10 }, random_motes: true, random_shades: true })
  );
  const rSpawn = runCli(['--seed', '42', '--night', '1', '--scenario', spawnScen, '--ticks', '950', '--out', outSpawn]);
  assert.equal(rSpawn.status, 0, rSpawn.stderr);
  const spawnRecords = parseJsonl(fs.readFileSync(outSpawn, 'utf8'));
  assertValidContractStream(spawnRecords);
  assert.ok(spawnRecords.some((r) => r.type === 'event' && r.name === 'shade_spawned' && r.tick === 900));

  fs.rmSync(out1, { force: true });
  fs.rmSync(out2, { force: true });
  fs.rmSync(spawnScen, { force: true });
  fs.rmSync(outSpawn, { force: true });
});

test('Headless CLI returns exit code 2 on malformed scenario/inputs and non-zero on missing flags', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-err-'));
  const badJson = path.join(tmpDir, 'bad.json');
  const badOrder = path.join(tmpDir, 'bad-order.json');
  const badMove = path.join(tmpDir, 'bad-move.json');
  const badLantern = path.join(tmpDir, 'bad-lantern.json');
  const out = path.join(tmpDir, 'out.jsonl');

  fs.writeFileSync(badJson, '{ broken json');
  fs.writeFileSync(badOrder, JSON.stringify({ frames: [{ tick: 5 }, { tick: 5 }] }));
  fs.writeFileSync(badMove, JSON.stringify({ frames: [{ tick: 0, move: [2, 0] }] }));
  fs.writeFileSync(badLantern, JSON.stringify({ lanterns: [{ id: 'L99', lit: true }] }));

  const rBadJson = runCli(['--seed', '1', '--night', '1', '--scenario', badJson, '--ticks', '10', '--out', out]);
  assert.equal(rBadJson.status, 2);
  assert.ok(rBadJson.stderr.length > 0);

  const rBadOrder = runCli(['--seed', '1', '--night', '1', '--inputs', badOrder, '--ticks', '10', '--out', out]);
  assert.equal(rBadOrder.status, 2);
  assert.ok(rBadOrder.stderr.length > 0);

  const rBadMove = runCli(['--seed', '1', '--night', '1', '--inputs', badMove, '--ticks', '10', '--out', out]);
  assert.equal(rBadMove.status, 2);
  assert.ok(rBadMove.stderr.length > 0);

  const rBadLantern = runCli(['--seed', '1', '--night', '1', '--scenario', badLantern, '--ticks', '10', '--out', out]);
  assert.equal(rBadLantern.status, 2);
  assert.ok(rBadLantern.stderr.length > 0);

  const rMissing = runCli(['--night', '1', '--ticks', '10']);
  assert.notEqual(rMissing.status, 0);
  assert.ok(rMissing.stderr.length > 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
