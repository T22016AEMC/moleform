// 桌面版自我檢查（任務 039 B-4、B-5、B-6 的驗證；只在帶 --selftest= 時載入）。
// compare：同一份 dist 以 (1) 本機 http（＝網頁版，127.0.0.1 隨機埠，檢查完即關閉）與 (2) app://（桌面版，所有網路請求取消、
//          並模擬離線）各跑一次相同操作，比對結果區文字；另檢查 Ketcher iframe、3D（Worker＋resources.json）、Python 引擎握手與關閉。
// persist：重新啟動後讀取化合物庫（IndexedDB moleform-library），確認上一次存入的資料還在。
// 結果寫到 MOLEFORM_SELFTEST_OUT（JSON），然後結束程式。
'use strict';

const { app, session } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const { START_URL, BASE, SCHEME, HOST, MIME, resolveFile } = require('./protocol.cjs');
const path = require('node:path');

// tests/crosslink/layer1/layer1.test.ts 的 F4A：P（酚醛型聚合物，Mn 6000，80）＋ E（GMA 聚合物，DP 21，20），Solid 區預設單位
const SAMPLE = {
  note: 'tests/crosslink/layer1/layer1.test.ts 的 F4A（P 80 ＋ E 20）',
  components: [
    { smiles: '[*:1]c1ccc(C2(c3ccc(C([*:2])c4ccc5ccccc5c4)c(O)c3)c3ccccc3-c3ccccc32)cc1O', basis: 'Mn（g/mol）', value: '6000', amount: '80' },
    { smiles: '[*:1]CC([*:2])(C)C(=O)OCC1CO1', basis: 'DP（數量平均，重複單元數）', value: '21', amount: '20' },
  ],
};

const SCENARIO = (sample) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms, label) => {
    const t = Date.now();
    while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(100); }
    throw new Error('timeout: ' + label);
  };
  const setValue = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const t0 = performance.now();
  for (const [i, c] of ${JSON.stringify(sample.components)}.entries()) {
    (await waitFor(() => document.querySelector('button.add-component'), 60000, 'add button')).click();
    setValue(await waitFor(() => document.querySelector('#add-smiles'), 10000, 'smiles input'), c.smiles);
    const radio = await waitFor(() => [...document.querySelectorAll('.modal .polymer-basis label.check')].find((l) => l.textContent.trim() === c.basis)?.querySelector('input'), 60000, 'basis radio');
    if (!radio.checked) radio.click();
    setValue(await waitFor(() => document.querySelector('.modal input[aria-label="' + c.basis + '"]'), 10000, 'polymer value input'), c.value);
    const save = [...document.querySelectorAll('.modal label.check')].find((l) => l.textContent.includes('同時存進化合物庫'))?.querySelector('input');
    if (save && !save.checked) save.click();
    (await waitFor(() => [...document.querySelectorAll('.modal button')].find((b) => b.textContent.trim() === '加入' && !b.disabled), 60000, 'add enabled')).click();
    await waitFor(() => !document.querySelector('.modal'), 10000, 'modal closed');
    const amounts = await waitFor(() => { const a = document.querySelectorAll('input[aria-label$=" 用量"]'); return a.length === i + 1 ? a : null; }, 10000, 'amount input');
    setValue(amounts[i], c.amount);
  }
  const panel = document.querySelector('.workbench-right');
  let last = '', since = performance.now();
  while (performance.now() - t0 < 180000) {
    const txt = panel.innerText;
    if (txt !== last) { last = txt; since = performance.now(); }
    else if (performance.now() - since > 3000 && !/計算中/.test(txt)) break;
    await sleep(200);
  }
  const workbench = last;

  // 分子工具：Ketcher iframe（postMessage 來源檢查）＋ 3D（Worker、resources.json）
  [...document.querySelectorAll('.tab-cards button')].find((b) => b.textContent.trim() === '分子工具').click();
  let ketcher = 'not ready';
  try {
    await waitFor(() => /繪圖器已就緒/.test(document.querySelector('.structure-frame-status')?.textContent ?? ''), 90000, 'ketcher ready');
    ketcher = document.querySelector('.structure-frame-status').textContent;
  } catch (e) { ketcher = String(e) + ' / ' + (document.querySelector('[role=status]')?.textContent ?? ''); }
  let conformer = 'not run';
  try {
    setValue(document.querySelector('#smiles-input'), 'CCO');
    [...document.querySelectorAll('.smiles-row button')].find((b) => b.textContent.trim() === '載入').click();
    const gen = await waitFor(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '產生 3D' && !b.disabled), 60000, '3D button');
    gen.click();
    await waitFor(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '重新產生 3D' && !b.disabled), 120000, '3D done');
    const card = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '重新產生 3D').closest('section');
    try { await waitFor(() => card?.querySelector('canvas'), 20000, '3D canvas'); } catch { /* 下方回報 canvas: false */ }
    conformer = { canvas: !!card?.querySelector('canvas'), text: (card?.innerText ?? '').slice(0, 600) };
  } catch (e) { conformer = String(e); }
  const resources = performance.getEntriesByType('resource').map((r) => r.name.replace(location.origin, ''));
  return { workbench, ketcher, conformer, origin: location.origin, online: navigator.onLine, resources };
})()`;

const READ_LIBRARY = `(async () => {
  // 資料庫不存在時不要用 open() 建立（會建出沒有資料表的空資料庫，讓程式之後無法使用化合物庫）
  const names = (await indexedDB.databases()).map((d) => d.name);
  if (!names.includes('moleform-library')) return { origin: location.origin, databases: names, compounds: [] };
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('moleform-library');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!db.objectStoreNames.contains('compounds')) return { origin: location.origin, stores: [...db.objectStoreNames], compounds: [] };
  const rows = await new Promise((resolve, reject) => {
    const req = db.transaction('compounds', 'readonly').objectStore('compounds').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return { origin: location.origin, databases: names, compounds: rows.map((c) => ({ name: c.name, smiles: c.smiles ?? c.canonicalSmiles ?? null })) };
})()`;

/** 網頁版對照：把 dist 以 http 提供在 /moleform/（與 GitHub Pages 相同的路徑結構） */
function startStaticServer(distDir) {
  const server = http.createServer((req, res) => {
    const file = resolveFile(distDir, `${SCHEME}://${HOST}${new URL(req.url, 'http://x').pathname}`);
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
      res.end(body);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function collectConsole(win, sink) {
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 'warning') sink.push(`${event.level}: ${event.message}`.slice(0, 300));
  });
}

async function runIn(win, script) {
  return win.webContents.executeJavaScript(script, true);
}

function portClosed(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port }, () => {
      s.destroy();
      resolve(false);
    });
    s.on('error', () => resolve(true));
  });
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function compare(ctx, out) {
  // (1) 網頁版：http://127.0.0.1:隨機埠/moleform/（獨立的記憶體 session，不寫入磁碟）
  const server = await startStaticServer(ctx.distDir);
  const webOrigin = `http://127.0.0.1:${server.address().port}`;
  const webPartition = 'selftest-web';
  ctx.secureSession(session.fromPartition(webPartition), { allowOrigin: `${webOrigin}/` });
  const webWin = ctx.createWindow({ show: false, partition: webPartition, allowOrigin: `${webOrigin}/` });
  out.web = { url: `${webOrigin}${BASE}`, console: [] };
  collectConsole(webWin, out.web.console);
  await webWin.loadURL(out.web.url);
  Object.assign(out.web, await runIn(webWin, SCENARIO(SAMPLE)));
  // 注意：視窗在結束前都不 destroy（Electron 45 實測：destroy 一個視窗後立刻在新視窗載入 app:// 會 ERR_FAILED）
  await webWin.loadURL('about:blank');
  await new Promise((resolve) => server.close(resolve));
  out.web.serverClosed = await portClosed(server.address()?.port ?? Number(webOrigin.split(':').pop()));

  // (2) 桌面版：app://，所有 http(s)/ws(s) 取消，並模擬離線
  ctx.blockedRequests.length = 0;
  if (process.env.MOLEFORM_SELFTEST_EMULATE_OFFLINE === '1') session.defaultSession.enableNetworkEmulation({ offline: true });
  const win = ctx.createWindow({ show: false });
  out.desktop = { url: START_URL, console: [] };
  collectConsole(win, out.desktop.console);
  await win.loadURL(START_URL);
  Object.assign(out.desktop, await runIn(win, SCENARIO(SAMPLE)));
  out.desktop.blockedRequests = [...ctx.blockedRequests];
  out.workbenchIdentical = out.web.workbench === out.desktop.workbench;

  // (3) Python 引擎：啟動、握手、格式示範、關閉、確認埠已釋放
  const info = await ctx.launchEngine();
  out.engine = info;
  if (info.state === 'ready') {
    const { port, pid } = info;
    await ctx.stopEngine();
    out.engine.afterStop = { portClosed: await portClosed(port), launcherPidAlive: pidAlive(pid) };
  }
}

// ---- engine 模式（任務 I01）：桌面版啟動引擎 → 面板算出 Tg、Vm → 與引擎直接呼叫比對 → 關閉後行程與埠已釋放 ----
const PMMA = '[*:1]CC([*:2])(C)C(=O)OC';
const ENGINE_SCENARIO = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms, label) => {
    const t = Date.now();
    while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(100); }
    throw new Error('timeout: ' + label);
  };
  const setValue = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const setSelect = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const addComponent = async (smiles, polymerValue, amount, index) => {
    (await waitFor(() => document.querySelector('button.add-component'), 60000, 'add button')).click();
    setValue(await waitFor(() => document.querySelector('#add-smiles'), 10000, 'smiles input'), smiles);
    if (polymerValue) {
      const radio = await waitFor(() => [...document.querySelectorAll('.modal .polymer-basis label.check')].find((l) => l.textContent.trim() === 'Mn（g/mol）')?.querySelector('input'), 60000, 'basis radio');
      if (!radio.checked) radio.click();
      setValue(await waitFor(() => document.querySelector('.modal input[aria-label="Mn（g/mol）"]'), 10000, 'polymer value input'), polymerValue);
    }
    (await waitFor(() => [...document.querySelectorAll('.modal button')].find((b) => b.textContent.trim() === '加入' && !b.disabled), 60000, 'add enabled')).click();
    await waitFor(() => !document.querySelector('.modal'), 10000, 'modal closed');
    const amounts = await waitFor(() => { const a = document.querySelectorAll('input[aria-label$=" 用量"]'); return a.length === index + 1 ? a : null; }, 10000, 'amount input');
    setValue(amounts[index], amount);
  };
  const readRows = () => [...document.querySelectorAll('#block-engine-properties tbody tr')].map((tr) => [...tr.children].map((c) => c.innerText.trim()));
  const settle = async (select, value) => {
    setSelect(select, value);
    let last = '', since = performance.now();
    const t0 = performance.now();
    while (performance.now() - t0 < 120000) {
      const txt = document.querySelector('#block-engine-properties').innerText;
      if (txt !== last) { last = txt; since = performance.now(); }
      else if (performance.now() - since > 1500 && !/計算中|啟動中/.test(txt)) break;
      await sleep(200);
    }
    return readRows();
  };
  await addComponent('${PMMA}', '10000', '90', 0);
  await addComponent('CCO', '', '10', 1);
  const select = await waitFor(() => document.querySelector('#engine-target'), 60000, 'engine panel (引擎是否啟動？)');
  const optionOf = (name) => [...select.options].find((o) => o.textContent === name)?.value;
  const polymerId = await waitFor(() => optionOf('成分 1'), 10000, 'option 成分 1');
  const smallId = await waitFor(() => optionOf('成分 2'), 10000, 'option 成分 2');
  const polymerRows = await settle(select, polymerId);
  const smallRows = await settle(select, smallId);
  const formulationRows = await settle(select, '__formulation__');
  // 橋接：同一個 SMILES 直接問引擎（經 preload 的 window.moleformEngine）
  const bridge = {
    keys: Object.keys(window.moleformEngine),
    tg: await window.moleformEngine.call('/tg', { smiles: '${PMMA}' }),
    vm: await window.moleformEngine.call('/vm', { smiles: '${PMMA}' }),
    forbidden: await window.moleformEngine.call('/handshake', {}),
    url: await window.moleformEngine.call('http://example.com/tg', { smiles: 'CC' }),
  };
  return { polymerRows, smallRows, formulationRows, bridge, windowKeys: Object.keys(window).filter((k) => /token|engine|port/i.test(k)) };
})()`;

function runPython(python, engineDir, code) {
  const { execFileSync } = require('node:child_process');
  return JSON.parse(execFileSync(python, ['-I', '-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(engineDir)}); ${code}`], { encoding: 'utf8', windowsHide: true }));
}

function descendantsAlive(pid) {
  // 引擎啟動器 pid（venv 的 python.exe）與其子行程：用 wmic/powershell 查是否還有行程
  const { execFileSync } = require('node:child_process');
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq ${pid} -or $_.ParentProcessId -eq ${pid} } | ForEach-Object { $_.ProcessId }`], { encoding: 'utf8', windowsHide: true });
    return out.split(/\s+/).filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

async function engineMode(ctx, out) {
  const info = await ctx.launchEngine(); // 與正式啟動相同的流程（橋接會等它完成）
  out.engine = { state: info.state, pid: info.pid, port: info.port, python: info.python, startMs: info.startMs, error: info.error };
  if (info.state !== 'ready') throw new Error(`engine not ready: ${info.error}`);
  const win = ctx.createWindow({ show: false });
  out.console = [];
  collectConsole(win, out.console);
  await win.loadURL(START_URL);
  out.ui = await runIn(win, ENGINE_SCENARIO);

  // 與引擎直接呼叫比對（不經橋接，直接 import engine 的處理函式）
  const engineDir = ctx.engineDir;
  const direct = runPython(info.python, engineDir, `import moleform_engine as e; print(json.dumps({'tg': e.handle_tg({'smiles': ${JSON.stringify(PMMA)}})[1], 'vm': e.handle_vm({'smiles': ${JSON.stringify(PMMA)}})[1]}))`);
  const norm = (v) => JSON.stringify(v);
  out.direct = { tgQuantity: direct.tg.quantity, vmQuantity: direct.vm.quantity, densityQuantity: direct.vm.density };
  const viaBridge = out.ui.bridge;
  out.sameAsDirect = {
    tg: norm(viaBridge.tg.body) === norm(direct.tg),
    vm: norm(viaBridge.vm.body) === norm(direct.vm),
  };
  const panelRow = (label) => out.ui.polymerRows.find((r) => r[0].startsWith(label));
  const fmt = (v) => String(Number(v.toPrecision(6)));
  out.panelMatchesDirect = {
    tg: panelRow('Tg')?.[1] === fmt(direct.tg.quantity.value),
    vm: panelRow('Vm')?.[1] === fmt(direct.vm.quantity.value),
    density: panelRow('密度')?.[1] === fmt(direct.vm.density.value),
  };

  // 關閉後：行程與埠已釋放
  const { port, pid } = info;
  out.descendantsBefore = descendantsAlive(pid);
  await ctx.stopEngine();
  out.afterStop = { portClosed: await portClosed(port), launcherPidAlive: pidAlive(pid), pidsStillAlive: descendantsAlive(pid) };
}

async function persist(ctx, out) {
  const win = ctx.createWindow({ show: false });
  await win.loadURL(START_URL);
  out.library = await runIn(win, READ_LIBRARY);
}

async function runSelftest(ctx) {
  const out = { mode: ctx.mode, sample: SAMPLE, electron: process.versions.electron, chrome: process.versions.chrome, userData: app.getPath('userData'), startedAt: new Date().toISOString() };
  let code = 0;
  try {
    if (ctx.mode === 'compare') await compare(ctx, out);
    else if (ctx.mode === 'persist') await persist(ctx, out);
    else if (ctx.mode === 'engine') await engineMode(ctx, out);
    else throw new Error(`unknown selftest mode: ${ctx.mode}`);
  } catch (err) {
    out.error = String(err && err.stack ? err.stack : err);
    code = 1;
  }
  const file = process.env.MOLEFORM_SELFTEST_OUT || path.join(app.getPath('userData'), `selftest-${ctx.mode}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
  console.log(`[selftest] ${ctx.mode} → ${file}`);
  await ctx.stopEngine();
  app.exit(code);
}

module.exports = { runSelftest, SAMPLE };
