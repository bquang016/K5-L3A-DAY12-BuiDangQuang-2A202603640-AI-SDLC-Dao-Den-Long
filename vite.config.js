import { defineConfig } from 'vite';
import { appendLeaderboardEntry, readLeaderboard } from './scripts/leaderboard-store.js';

function leaderboardApiPlugin() {
  return {
    name: 'dao-den-long-leaderboard-api',
    configureServer(server) {
      server.middlewares.use('/api/leaderboard', (req, res, next) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(readLeaderboard()));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 16384) req.destroy();
          });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}');
              const result = appendLeaderboardEntry(payload);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(result));
            } catch (err) {
              res.statusCode = err.statusCode || 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: err.message || 'Lỗi lưu bảng xếp hạng' }));
            }
          });
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [leaderboardApiPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
