// app:// 自訂協定：把現有 dist 對應到 app://moleform/moleform/...（任務 039 A-5、B-1）。
// dist 以 Vite base '/moleform/' 建置（D32），所有資源網址都以 /moleform/ 開頭，因此路徑原樣對應、不需改 src/。
// 以「standard + secure」註冊，頁面的 location.origin 為 'app://moleform'（不是 file:// 的 'null'），
// 讓 Ketcher iframe 的 postMessage 來源檢查、module Worker、fetch（WASM、resources.json）、IndexedDB 照常運作。
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const SCHEME = 'app';
const HOST = 'moleform';
const BASE = '/moleform/';
const START_URL = `${SCHEME}://${HOST}${BASE}`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

const PRIVILEGES = { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true };

/** 是否為本程式自己的網址（導向、開新視窗檢查用） */
function isAppUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === `${SCHEME}:` && u.host === HOST;
  } catch {
    return false;
  }
}

/** 把 app:// 網址轉成 dist 內的檔案路徑；不在 dist 內或格式不符回傳 null */
function resolveFile(distDir, url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== `${SCHEME}:` || u.host !== HOST || !u.pathname.startsWith(BASE)) return null;
  let rel;
  try {
    rel = decodeURIComponent(u.pathname.slice(BASE.length));
  } catch {
    return null;
  }
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const root = path.resolve(distDir);
  const file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) return null; // 防止 ../ 跳出 dist
  return file;
}

function makeHandler(distDir) {
  return async (request) => {
    const file = resolveFile(distDir, request.url);
    if (!file) return new Response('Not found', { status: 404 });
    try {
      const body = await fs.readFile(file);
      const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
      return new Response(body, { status: 200, headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  };
}

module.exports = { SCHEME, HOST, BASE, START_URL, MIME, PRIVILEGES, isAppUrl, resolveFile, makeHandler };
