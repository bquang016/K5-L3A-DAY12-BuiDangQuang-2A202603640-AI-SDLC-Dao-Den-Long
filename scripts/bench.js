import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROCESS_START_MS = performance.now();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function parseArgs(argv) {
  const opts = {
    seed: 42,
    duration: 30,
    out: 'bench.json'
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--seed') {
      const v = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(v)) throw new Error('--seed phải là số nguyên');
      opts.seed = v;
    } else if (flag === '--duration') {
      const v = Number.parseFloat(argv[++i]);
      if (!Number.isFinite(v) || v <= 0) throw new Error('--duration phải là số > 0');
      opts.duration = v;
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

function findBrowserExecutable() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    for (const cmd of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      const which = spawnSync('which', [cmd], { encoding: 'utf8' });
      if (which.status === 0 && which.stdout.trim()) {
        candidates.push(which.stdout.trim().split('\n')[0]);
      }
    }
  }
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function sampleBrowserTreeRssMb(userDataDir) {
  try {
    if (process.platform === 'win32') {
      const safeDir = userDataDir.replace(/'/g, "''");
      const psCmd = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${safeDir}*' } | Measure-Object -Property WorkingSetSize -Sum | Select-Object -ExpandProperty Sum`;
      const out = execFileSync('powershell', ['-NoProfile', '-Command', psCmd], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2500
      }).trim();
      const bytes = Number(out);
      return Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes / (1024 * 1024)) : null;
    }
    const out = execFileSync('ps', ['-eo', 'rss,args'], { encoding: 'utf8', timeout: 2500 });
    let totalKb = 0;
    for (const line of out.split('\n')) {
      if (!line.includes(userDataDir)) continue;
      const m = /^\s*(\d+)\s+/.exec(line);
      if (m) totalKb += Number(m[1]);
    }
    return totalKb > 0 ? Math.round(totalKb / 1024) : null;
  } catch {
    return null;
  }
}

function killBrowserTree(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // ignore cleanup error
  }
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Lỗi CLI bench: ${err.message}`);
    process.exit(1);
  }

  const browserBin = findBrowserExecutable();
  if (!browserBin) {
    console.error(
      'Không tìm thấy Chrome/Chromium/Edge để chạy benchmark cửa sổ 1280x720. Vui lòng cài Google Chrome hoặc đặt biến môi trường CHROME_PATH.'
    );
    process.exit(1);
  }

  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    const build = spawnSync('npm', ['run', 'build'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    if (build.status !== 0) {
      console.error('Không thể build dist/ cho benchmark.');
      process.exit(build.status || 1);
    }
  }

  let loadMs = null;
  let resolveDone;
  let rejectDone;
  const donePromise = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];
    if (req.method === 'POST' && urlPath === '/__bench_loaded') {
      if (loadMs === null) {
        loadMs = Math.round(performance.now() - PROCESS_START_MS);
      }
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === 'POST' && urlPath === '/__bench_done') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        res.writeHead(204);
        res.end();
        try {
          resolveDone(JSON.parse(body));
        } catch (err) {
          rejectDone(err);
        }
      });
      return;
    }

    const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.replace(/^\/+/, ''));
    let filePath = path.resolve(DIST_DIR, rel);
    if (!filePath.startsWith(DIST_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-bench-profile-'));

  const benchUrl = `http://127.0.0.1:${port}/?bench=1&seed=${opts.seed}&duration=${opts.duration}`;
  const args = [
    `--app=${benchUrl}`,
    '--window-size=1280,720',
    '--window-position=40,40',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${tmpProfile}`
  ];

  const child = spawn(browserBin, args, { stdio: 'ignore' });
  let peakMemMb = null;
  let sampling = false;
  const memTimer = setInterval(() => {
    if (sampling) return;
    sampling = true;
    const mb = sampleBrowserTreeRssMb(tmpProfile);
    if (mb !== null && (peakMemMb === null || mb > peakMemMb)) {
      peakMemMb = mb;
    }
    sampling = false;
  }, 1500);

  const timeoutMs = (opts.duration + 45) * 1000;
  const timeoutTimer = setTimeout(() => {
    rejectDone(new Error(`Benchmark quá thời gian chờ (${timeoutMs} ms)`));
  }, timeoutMs);

  let exitCode = 0;
  try {
    const result = await donePromise;
    const finalSample = sampleBrowserTreeRssMb(tmpProfile);
    if (finalSample !== null && (peakMemMb === null || finalSample > peakMemMb)) {
      peakMemMb = finalSample;
    }

    const report = {
      contract_version: '1.3',
      avg_fps: result.avg_fps,
      p1_low_fps: result.p1_low_fps,
      frame_ms_p95: result.frame_ms_p95,
      frames: result.frames,
      load_ms: loadMs ?? Math.round(performance.now() - PROCESS_START_MS),
      peak_mem_mb: peakMemMb,
      vsync_off: true,
      renderer: result.renderer || 'Three.js 0.170.0 / WebGL2',
      os: `${os.type()} ${os.release()} (${process.platform}/${os.arch()})`
    };

    const outPath = path.resolve(opts.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(
      `Bench complete: ${report.frames} frames, avg=${report.avg_fps} FPS, 1%-low=${report.p1_low_fps} FPS, p95=${report.frame_ms_p95} ms, load=${report.load_ms} ms, peak_mem=${report.peak_mem_mb} MB`
    );
  } catch (err) {
    console.error(`Benchmark thất bại: ${err.message}`);
    exitCode = 1;
  } finally {
    clearInterval(memTimer);
    clearTimeout(timeoutTimer);
    killBrowserTree(child);
    server.close();
    try {
      fs.rmSync(tmpProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
    } catch {
      // Ignore transient Windows file lock on temporary Chrome profile after exit
    }
  }

  process.exit(exitCode);
}

main();
