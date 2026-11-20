import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendLeaderboardEntry, readLeaderboard } from './leaderboard-store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function parseArgs(argv) {
  const opts = {
    exportLeaderboard: null,
    port: Number(process.env.PORT) || 4173
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--export-leaderboard') {
      const next = argv[++i];
      if (!next) {
        throw new Error('Thiếu đường dẫn file sau --export-leaderboard');
      }
      opts.exportLeaderboard = next;
    } else if (flag === '--port') {
      const next = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(next) || next < 0 || next > 65535) {
        throw new Error('Tham số --port không hợp lệ');
      }
      opts.port = next;
    } else if (flag === '--help' || flag === '-h') {
      opts.help = true;
    } else {
      throw new Error(`Tham số không hỗ trợ: ${flag}`);
    }
  }
  return opts;
}

function readRequestBody(req, limitBytes = 16384) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Dữ liệu gửi lên vượt quá giới hạn'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Lỗi CLI: ${err.message}`);
    process.exit(1);
  }

  if (opts.help) {
    console.log('Cách dùng: node scripts/run.js [--port <port>] [--export-leaderboard <out.json>]');
    process.exit(0);
  }

  if (opts.exportLeaderboard !== null) {
    try {
      const { entries } = readLeaderboard();
      const outPath = path.resolve(opts.exportLeaderboard);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, `${JSON.stringify({ entries }, null, 2)}\n`, 'utf8');
      process.exit(0);
    } catch (err) {
      console.error(`Không thể xuất bảng xếp hạng: ${err.message}`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    console.log('Chưa thấy dist/, đang chạy npm run build...');
    const build = spawnSync('npm', ['run', 'build'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    if (build.status !== 0) {
      console.error('Build thất bại.');
      process.exit(build.status || 1);
    }
  }

  const server = http.createServer(async (req, res) => {
    const urlPath = (req.url || '/').split('?')[0];

    if (urlPath === '/api/leaderboard') {
      if (req.method === 'GET') {
        const data = readLeaderboard();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
        return;
      }
      if (req.method === 'POST') {
        try {
          const raw = await readRequestBody(req);
          const payload = JSON.parse(raw);
          const result = appendLeaderboardEntry(payload);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(err.statusCode || 400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: err.message || 'Lỗi lưu bảng xếp hạng' }));
        }
        return;
      }
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.replace(/^\/+/, ''));
    let filePath = path.resolve(DIST_DIR, rel);
    if (!filePath.startsWith(DIST_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  const startServer = (port) => {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && port !== 0) {
        startServer(0);
        return;
      }
      console.error(`Lỗi server: ${err.message}`);
      process.exit(1);
    });
    server.listen(port, '0.0.0.0', () => {
      const addr = server.address();
      console.log(`Đảo Đèn Lồng đang chạy tại: http://localhost:${addr.port}`);
    });
  };

  startServer(opts.port);
}

main();
