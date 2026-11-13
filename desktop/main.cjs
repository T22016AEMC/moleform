// MoleForm 本機版主程式（任務 039 B-1、B-6，D62）。
// - 以 app:// 自訂協定載入現有 dist（見 protocol.cjs），不改 src/。
// - 渲染程序：nodeIntegration 關閉、contextIsolation 開啟、sandbox 開啟，沒有 preload。
// - 禁止導向或開啟本程式以外的網址；渲染程序的 http(s)/ws(s) 請求一律取消（離線運作，也不會載入遠端內容）。
// - 啟動時在背景啟動本機 Python 引擎並握手；程式結束時一併關閉。
'use strict';

const { app, BrowserWindow, protocol, session } = require('electron');
const path = require('node:path');
const { SCHEME, START_URL, PRIVILEGES, isAppUrl, makeHandler } = require('./protocol.cjs');
const { startEngine, stopEngine, handshake } = require('./engine-host.cjs');

const DIST_DIR = app.isPackaged ? path.join(process.resourcesPath, 'app-dist') : path.join(__dirname, '..', 'dist');
const ENGINE_DIR = app.isPackaged ? path.join(process.resourcesPath, 'engine') : path.join(__dirname, '..', 'engine');

// 自我檢查用：使用獨立的使用者資料夾，不動到正式資料（selftest.cjs）；未指定時用暫存資料夾
const selftestArg = process.argv.find((a) => a.startsWith('--selftest='));
if (process.env.MOLEFORM_USER_DATA) app.setPath('userData', process.env.MOLEFORM_USER_DATA);
else if (selftestArg) app.setPath('userData', path.join(app.getPath('temp'), 'moleform-selftest'));

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: PRIVILEGES }]);

const blockedRequests = [];
let engine = null;
let engineInfo = { state: 'not-started' };

/** 對一個 session 套用：app:// 對應 dist、取消所有網路請求、拒絕所有權限要求 */
function secureSession(ses, { allowOrigin } = {}) {
  ses.protocol.handle(SCHEME, makeHandler(DIST_DIR));
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
    const allowed = allowOrigin && details.url.startsWith(allowOrigin);
    if (!allowed) blockedRequests.push({ url: details.url, type: details.resourceType });
    callback({ cancel: !allowed });
  });
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
}

function isAllowedUrl(url, allowOrigin) {
  return isAppUrl(url) || (allowOrigin ? url.startsWith(allowOrigin) : false) || url === 'about:blank';
}

/** 所有 webContents（含 Ketcher iframe 所在的頁面）：禁止導向外部、禁止開新視窗、禁止 webview */
function guardContents(contents, allowOrigin) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const block = (event, url) => {
    if (!isAllowedUrl(url, allowOrigin)) {
      event.preventDefault();
      blockedRequests.push({ url, type: 'navigation' });
    }
  };
  contents.on('will-navigate', block);
  contents.on('will-redirect', block);
  contents.on('will-frame-navigate', (details) => {
    if (!isAllowedUrl(details.url, allowOrigin)) {
      details.preventDefault();
      blockedRequests.push({ url: details.url, type: 'frame-navigation' });
    }
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

const WEB_PREFERENCES = {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  spellcheck: false,
};

function createWindow({ show = true, partition, allowOrigin } = {}) {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    show,
    title: 'MoleForm',
    autoHideMenuBar: true,
    webPreferences: { ...WEB_PREFERENCES, ...(partition ? { partition } : {}) },
  });
  guardContents(win.webContents, allowOrigin);
  return win;
}

async function launchEngine() {
  engineInfo = { state: 'starting' };
  try {
    engine = await startEngine(ENGINE_DIR);
    const result = await handshake(engine);
    engineInfo = { state: 'ready', pid: engine.pid, port: engine.port, python: engine.python, startMs: engine.startMs, ...result };
    console.log(`[engine] ready on 127.0.0.1:${engine.port} (start ${engine.startMs} ms)`, JSON.stringify(result.hello.body));
  } catch (err) {
    engineInfo = { state: 'unavailable', error: String(err && err.message), python: err && err.python, stderr: err && err.stderr };
    console.warn('[engine] unavailable:', engineInfo.error);
  }
  return engineInfo;
}

let quitting = false;
app.on('before-quit', (event) => {
  if (quitting || !engine) return;
  event.preventDefault();
  quitting = true;
  stopEngine(engine).finally(() => {
    engine = null;
    app.quit();
  });
});

app.on('window-all-closed', () => app.quit());

// 只允許單一執行個體（避免兩個程式同時寫同一份 IndexedDB）；自我檢查不受限制
if (!selftestArg && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    secureSession(session.defaultSession);
    app.on('web-contents-created', (_e, contents) => contents.on('will-attach-webview', (event) => event.preventDefault()));

    if (selftestArg) {
      const { runSelftest } = require('./selftest.cjs');
      await runSelftest({
        mode: selftestArg.slice('--selftest='.length),
        distDir: DIST_DIR,
        createWindow,
        secureSession,
        launchEngine,
        stopEngine: async () => {
          await stopEngine(engine);
          engine = null;
        },
        blockedRequests,
      });
      return;
    }

    const win = createWindow();
    await win.loadURL(START_URL);
    void launchEngine();
  });
}

module.exports = { getEngineInfo: () => engineInfo };
