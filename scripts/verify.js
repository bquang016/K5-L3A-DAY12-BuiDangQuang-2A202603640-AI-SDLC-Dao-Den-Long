import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_TUNING } from '../src/sim/config.js';

const ROOT = process.cwd();
const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
}

function runCommand(cmd, args, extraEnv = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    shell: process.platform === 'win32' && cmd === 'npm'
  });
}

// 1. Contract v1.3 sync check
try {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8'));
  const same =
    contract.contract_version === '1.3' &&
    Boolean(contract.run_cmd) &&
    Boolean(contract.bench_cmd) &&
    Boolean(contract.soak_cmd) &&
    JSON.stringify(contract.tuning) === JSON.stringify(DEFAULT_TUNING);
  record(
    'Contract v1.3 Sync',
    same,
    same
      ? 'contract_version=1.3, bench_cmd/soak_cmd/run_cmd set & tuning == DEFAULT_TUNING'
      : 'Contract mismatch'
  );
} catch (err) {
  record('Contract v1.3 Sync', false, err.message);
}

// 2. Unit & Contract test suite
const testRun = runCommand(process.execPath, ['--test', 'tests/unit.test.js', 'tests/contract.test.js']);
if (testRun.status === 0) {
  const passCount = (testRun.stdout.match(/# pass \d+/) || ['pass'])[0];
  record('Unit & Contract Suite', true, passCount);
} else {
  console.error(testRun.stdout);
  console.error(testRun.stderr);
  record('Unit & Contract Suite', false, `exit=${testRun.status}`);
}

const tmpDir = path.join(ROOT, 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });

// 3. Leaderboard export verification
try {
  const storeFile = path.join(tmpDir, 'lb-store.json');
  const exportFile = path.join(tmpDir, 'lb-export.json');
  fs.writeFileSync(
    storeFile,
    JSON.stringify({
      entries: [
        { name: 'SecondTie', score: 900, nights_won: 2, achieved_at: '2026-11-20T10:05:00+07:00', seed: 11 },
        { name: 'FirstTie', score: 900, nights_won: 2, achieved_at: '2026-11-20T10:00:00+07:00', seed: 10 },
        { name: 'TopPlayer', score: 1500, nights_won: 3, achieved_at: '2026-11-20T11:00:00+07:00', seed: 12 }
      ]
    })
  );
  const expRun = runCommand(
    process.execPath,
    ['scripts/run.js', '--export-leaderboard', exportFile],
    { DAO_DEN_LONG_LEADERBOARD_PATH: storeFile }
  );
  const exported = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
  const namesOk =
    expRun.status === 0 &&
    Array.isArray(exported.entries) &&
    exported.entries.map((e) => e.name).join(',') === 'TopPlayer,FirstTie,SecondTie';
  record('Leaderboard Export CLI', namesOk, namesOk ? 'Sorted TopPlayer -> FirstTie -> SecondTie' : `exit=${expRun.status}`);
} catch (err) {
  record('Leaderboard Export CLI', false, err.message);
}

// 4. Soak Test (3-night quick gate during verify)
try {
  const soakOut = path.join(tmpDir, 'verify-soak.json');
  const soakRun = runCommand(process.execPath, [
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
  ]);
  const soakData = JSON.parse(fs.readFileSync(soakOut, 'utf8'));
  const soakOk =
    soakRun.status === 0 &&
    soakData.crashes === 0 &&
    soakData.mem_end_mb <= 1.2 * soakData.mem_start_mb;
  record(
    'Soak Gate (3 nights, RSS <= 1.2x)',
    soakOk,
    `crashes=${soakData.crashes}, mem=${soakData.mem_start_mb}->${soakData.mem_end_mb} MB (${soakData.duration_s}s)`
  );
} catch (err) {
  record('Soak Gate', false, err.message);
}

// 5. Multi-Night Determinism Check (Nights 1, 2, 3)
for (const night of [1, 2, 3]) {
  const outA = path.join(tmpDir, `det-n${night}-a.jsonl`);
  const outB = path.join(tmpDir, `det-n${night}-b.jsonl`);
  const rA = runCommand(process.execPath, [
    'src/headless/cli.js', '--seed', '42', '--night', String(night), '--ticks', '1400', '--out', outA
  ]);
  const rB = runCommand(process.execPath, [
    'src/headless/cli.js', '--seed', '42', '--night', String(night), '--ticks', '1400', '--out', outB
  ]);
  if (rA.status === 0 && rB.status === 0) {
    const bufA = fs.readFileSync(outA);
    const bufB = fs.readFileSync(outB);
    const hash = crypto.createHash('sha256').update(bufA).digest('hex').slice(0, 12);
    const eq = Buffer.compare(bufA, bufB) === 0;
    record(`Determinism Night ${night} (1400 ticks)`, eq, `sha256=${hash} (${bufA.length} bytes)`);
  } else {
    record(`Determinism Night ${night}`, false, `exit=${rA.status}/${rB.status}`);
  }
}

// 6. Full Night 3 Performance Gate (<= 18,000 ticks in <= 30s)
const perfOut = path.join(tmpDir, 'perf-night3.jsonl');
const t0 = performance.now();
const perfRes = runCommand(process.execPath, [
  'src/headless/cli.js', '--seed', '42', '--night', '3', '--ticks', '18000', '--out', perfOut
]);
const elapsedMs = Math.round(performance.now() - t0);
if (perfRes.status === 0) {
  const lines = fs.readFileSync(perfOut, 'utf8').trim().split('\n').length;
  record(
    'Full Night 3 Performance (18000 ticks <= 30s)',
    elapsedMs <= 30000,
    `${elapsedMs} ms (${lines} JSONL lines)`
  );
} else {
  record('Full Night 3 Performance', false, `exit=${perfRes.status}`);
}
fs.rmSync(tmpDir, { recursive: true, force: true });

// 7. Vite Production Build
const buildRun = runCommand('npm', ['run', 'build']);
if (buildRun.status === 0) {
  record('Vite Production Build', true, 'dist/ built cleanly');
} else {
  console.error(buildRun.stdout);
  console.error(buildRun.stderr);
  record('Vite Production Build', false, `exit=${buildRun.status}`);
}

const allPassed = results.every((r) => r.passed);
console.log(`\nVerification Summary: ${results.filter((r) => r.passed).length}/${results.length} passed.`);
process.exit(allPassed ? 0 : 1);
