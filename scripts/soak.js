import fs from 'node:fs';
import path from 'node:path';
import { createRng } from '../src/sim/prng.js';
import { LanternIslandSim } from '../src/sim/simulation.js';

function parseArgs(argv) {
  const opts = {
    seed: 7,
    nights: 10,
    out: 'soak.json'
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--seed') {
      const v = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(v)) throw new Error('--seed phải là số nguyên');
      opts.seed = v;
    } else if (flag === '--nights') {
      const v = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(v) || v < 1) throw new Error('--nights phải là số nguyên >= 1');
      opts.nights = v;
    } else if (flag === '--out') {
      const v = argv[++i];
      if (!v) throw new Error('Thiếu đường dẫn file sau --out');
      opts.out = v;
    } else {
      throw new Error(`Tham số không hỗ trợ: ${flag}`);
    }
  }
  return opts;
}

function getRssMb() {
  return Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(2));
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Lỗi CLI soak: ${err.message}`);
    process.exit(1);
  }

  const t0 = performance.now();
  const results = [];
  let crashes = 0;
  let memStartMb = null;

  for (let i = 0; i < opts.nights; i += 1) {
    const nightNum = (i % 3) + 1;
    const nightSeed = opts.seed + i;
    let sim = null;

    try {
      sim = new LanternIslandSim({ seed: nightSeed, night: nightNum });
      if (i === 0) {
        memStartMb = getRssMb();
      }

      const inputRng = createRng((((nightSeed + 1) * 2654435761) ^ 0x9e3779b9) >>> 0 || 1);
      const maxTicks = sim.map.durationS * 60 + 5;
      let moveVec = [0, 0];

      for (let t = 0; t < maxTicks && sim.state === 'playing'; t += 1) {
        if (t % 30 === 0) {
          const angle = inputRng.range(0, Math.PI * 2);
          moveVec = [Math.cos(angle), Math.sin(angle)];
        }
        sim.step({
          move: moveVec,
          cam_yaw_deg: 0,
          jump: inputRng.next() < 0.05,
          dash: inputRng.next() < 0.03,
          pulse: inputRng.next() < 0.02,
          interact: inputRng.next() < 0.1
        });
      }

      results.push(sim.state === 'won' ? 'won' : 'lost');
    } catch (err) {
      crashes += 1;
      results.push('lost');
      console.error(`Soak night ${i + 1} (night=${nightNum}, seed=${nightSeed}) crashed: ${err.message}`);
    } finally {
      // Reset state explicitly so memory can be reclaimed
      sim = null;
    }
  }

  if (typeof global.gc === 'function') {
    global.gc();
  }
  const memEndMb = getRssMb();
  const durationS = Number(((performance.now() - t0) / 1000).toFixed(2));

  const report = {
    nights: opts.nights,
    crashes,
    results,
    mem_start_mb: memStartMb ?? memEndMb,
    mem_end_mb: memEndMb,
    duration_s: durationS
  };

  const outPath = path.resolve(opts.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(
    `Soak complete: ${opts.nights} nights, crashes=${crashes}, mem=${report.mem_start_mb}->${report.mem_end_mb} MB, duration=${durationS}s`
  );
  process.exit(crashes === 0 ? 0 : 1);
}

main();
