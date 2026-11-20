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

function runCommand(cmd, args) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32' && cmd === 'npm'
  });
}

// 1. Contract v1.1 tuning sync check
try {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8'));
  const same =
    contract.contract_version === '1.1' &&
    JSON.stringify(contract.tuning) === JSON.stringify(DEFAULT_TUNING);
  record(
    'Contract v1.1 Sync',
    same,
    same ? 'contract_version=1.1 & tuning == DEFAULT_TUNING' : 'Contract mismatch'
  );
} catch (err) {
  record('Contract v1.1 Sync', false, err.message);
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

// 3. Multi-Night Determinism Check (Nights 1, 2, 3)
const tmpDir = path.join(ROOT, 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });
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

// 4. Full Night 3 Performance Gate (<= 21,600 ticks in <= 30s)
const perfOut = path.join(tmpDir, 'perf-night3.jsonl');
const t0 = performance.now();
const perfRes = runCommand(process.execPath, [
  'src/headless/cli.js', '--seed', '42', '--night', '3', '--ticks', '21600', '--out', perfOut
]);
const elapsedMs = Math.round(performance.now() - t0);
if (perfRes.status === 0) {
  const lines = fs.readFileSync(perfOut, 'utf8').trim().split('\n').length;
  record(
    'Full Night 3 Performance (21600 ticks <= 30s)',
    elapsedMs <= 30000,
    `${elapsedMs} ms (${lines} JSONL lines)`
  );
} else {
  record('Full Night 3 Performance', false, `exit=${perfRes.status}`);
}
fs.rmSync(tmpDir, { recursive: true, force: true });

// 5. Vite Production Build
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
