// 啟動與關閉本機 Python 引擎（任務 039 B-6）。
// 權杖：每次啟動以 crypto 產生，從 stdin 第一行交給引擎（不放命令列或環境變數）；stdin 保持開啟，關閉即通知引擎結束。
// 引擎只監聽 127.0.0.1 的隨機埠；主程式只連 127.0.0.1。渲染程序（網頁）不直接連引擎。
'use strict';

const { spawn, execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const START_TIMEOUT_MS = 20000;
const STOP_GRACE_MS = 3000;

/** Python 執行檔：MOLEFORM_PYTHON ＞ engine/.venv（開發時）＞ PATH 上的 python */
function findPython(engineDir) {
  if (process.env.MOLEFORM_PYTHON) return process.env.MOLEFORM_PYTHON;
  const venv = path.join(engineDir, '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venv)) return venv;
  return 'python';
}

function request(engine, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request(
      {
        host: '127.0.0.1',
        port: engine.port,
        method,
        path: pathname,
        timeout: 10000,
        headers: {
          Authorization: `Bearer ${engine.token}`,
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('engine request timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/** 啟動引擎並等它回報埠號；失敗時 reject（桌面程式其他功能照常） */
function startEngine(engineDir) {
  const python = findPython(engineDir);
  const script = path.join(engineDir, 'moleform_engine.py');
  const token = crypto.randomBytes(32).toString('hex');
  const t0 = Date.now();
  const child = spawn(python, ['-I', '-u', script], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const engine = { child, token, port: 0, python, pid: child.pid, startMs: 0, stderr: '' };
  child.stderr.on('data', (d) => {
    engine.stderr = (engine.stderr + d.toString('utf8')).slice(-4000);
  });
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => fail(new Error('engine start timeout')), START_TIMEOUT_MS);
    function fail(err) {
      clearTimeout(timer);
      stopEngine(engine).finally(() => reject(Object.assign(err, { stderr: engine.stderr, python })));
    }
    child.on('error', fail);
    child.on('exit', (code) => {
      if (!engine.port) fail(new Error(`engine exited before listening (code ${code})`));
    });
    child.stdout.on('data', function onData(d) {
      buffer += d.toString('utf8');
      const nl = buffer.indexOf('\n');
      if (nl < 0) return;
      child.stdout.off('data', onData);
      child.stdout.resume(); // 之後的輸出丟掉，避免管線塞滿
      try {
        const msg = JSON.parse(buffer.slice(0, nl));
        if (msg.event !== 'listening' || msg.host !== '127.0.0.1' || !(msg.port > 0)) throw new Error(`unexpected engine message: ${buffer.slice(0, nl)}`);
        engine.port = msg.port;
        engine.startMs = Date.now() - t0;
        clearTimeout(timer);
        resolve(engine);
      } catch (e) {
        fail(e);
      }
    });
    child.stdin.write(`${token}\n`);
  });
}

function waitExit(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/** 先關 stdin 讓引擎自行結束；逾時再強制結束整個程序樹（venv 的 python.exe 會再開一個子程序） */
async function stopEngine(engine) {
  if (!engine || !engine.child) return;
  const { child } = engine;
  try {
    child.stdin.end();
  } catch {
    /* 已關閉 */
  }
  if (await waitExit(child, STOP_GRACE_MS)) return;
  if (process.platform === 'win32' && child.pid) {
    await new Promise((resolve) => execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => resolve()));
  } else {
    child.kill('SIGKILL');
  }
  await waitExit(child, STOP_GRACE_MS);
}

/** 握手＋「值、單位、來源、狀態」格式示範（不含任何公式） */
async function handshake(engine) {
  const t0 = Date.now();
  const hello = await request(engine, 'GET', '/handshake');
  const handshakeMs = Date.now() - t0;
  const sample = { value: 1.05, unit: 'g/cm3', source: '格式示範（非真實數值）', status: 'assumed' };
  const demo = await request(engine, 'POST', '/demo/quantity', { quantity: sample });
  const rejected = await request(engine, 'POST', '/demo/quantity', { quantity: { ...sample, status: 'guessed' } });
  return { hello, demo: { request: { quantity: sample }, response: demo }, rejected, handshakeMs };
}

module.exports = { findPython, startEngine, stopEngine, handshake };
