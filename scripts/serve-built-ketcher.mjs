// 開發模式（npm run dev）時，讓 /moleform/ketcher/ 提供「已建置」的 Ketcher 子專案（dist/ketcher）。
// Ketcher 是獨立子專案，不隨 dev server 啟動；請先執行一次 npm run build。正式建置不使用本外掛。
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

export function serveBuiltKetcher() {
  const root = fileURLToPath(new URL('../dist/ketcher/', import.meta.url));
  return {
    name: 'serve-built-ketcher',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/moleform/ketcher', (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
        const file = normalize(join(root, relative));
        if (!existsSync(root) || !file.startsWith(root)) {
          res.statusCode = 404;
          res.setHeader('content-type', 'text/plain; charset=utf-8');
          res.end('找不到 Ketcher 子專案的建置結果，請先執行 npm run build。');
          return;
        }
        const target = existsSync(file) && statSync(file).isDirectory() ? join(file, 'index.html') : file;
        if (!existsSync(target)) return next();
        res.setHeader('content-type', MIME[extname(target)] ?? 'application/octet-stream');
        createReadStream(target).pipe(res);
      });
    },
  };
}
