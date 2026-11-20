import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_TUNING } from '../src/sim/config.js';

const ROOT = process.cwd();
const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  const tag = passed ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}: ${detail}`);
}

function runCommand(cmd, args) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32' && cmd === 'npm'
  });
}

// 1. Contract tuning sync check
try {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8'));
  const same = JSON.stringify(contract.tuning) === JSON.stringify(DEFAULT_TUNING);
  record('Contract Tuning Sync', same, same ? 'game.contract.json == DEFAULT_TUNING' : 'Mismatch detected');
} catch (err) {
  record('Contract Tuning Sync', false, err.message);
}

// 2. Unit & Contract tests
const testRun = runCommand(process.execPath, ['--test', 'tests/unit.test.js', 'tests/contract.test.js']);
if (testRun.status === 0) {
  const passCount = (testRun.stdout.match(/# pass \d+/) || ['pass'])[0];
  record('Unit & Contract Suite', true, passCount);
} else {
  console.error(testRun.stdout);
  console.error(testRun.stderr);
  record('Unit & Contract Suite', false, `exit=${testRun.status}`);
}

// 3. Headless Determinism Check
const tmpDir = path.join(ROOT, 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });
const outA = path.join(tmpDir, 'verify-det-1.jsonl');
const outB = path.join(tmpDir, 'verify-det-2.jsonl');

const runA = runCommand(process.execPath, ['src/headless/cli.js', '--seed', '42', '--night', '1', '--ticks', '600', '--out', outA]);
const runB = runCommand(process.execPath, ['src/headless/cli.js', '--seed', '42', '--night', '1', '--ticks', '600', '--out', outB]);

if (runA.status === 0 && runB.status === 0) {
  const bufA = fs.readFileSync(outA);
  const bufB = fs.readFileSync(outB);
  const hashA = crypto.createHash('sha256').update(bufA).digest('hex').slice(0, 12);
  const hashB = crypto.createHash('sha256').update(bufB).digest('hex').slice(0, 12);
  const equal = Buffer.compare(bufA, bufB) === 0;
  record('Headless Determinism (seed=42, 600 ticks)', equal, `sha256=${hashA} (${bufA.length} bytes)`);
} else {
  record('Headless Determinism (seed=42, 600 ticks)', false, `exit=${runA.status}/${runB.status}`);
}
fs.rmSync(tmpDir, { recursive: true, force: true });

// 4. Production Vite Build
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
