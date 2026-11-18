// 介面 → 引擎的受限橋接（任務 I01）。由主程式代為對引擎發 HTTP；網頁內容拿不到權杖、埠或任何 URL。
// - 只允許白名單內的引擎路徑（精確比對；絕對網址、//host、查詢字串、../ 一律拒絕）。
// - 只連 127.0.0.1（engine.host 必須是 127.0.0.1）。
// - 請求本文必須是可轉成 JSON 的一般物件，且不超過引擎的 64 KB 上限。
// 純函式模組（不引用 electron），可直接用 vitest 測試。
'use strict';

/** 目前介面用到的引擎端點（POST）。新增端點時在這裡加一行並補測試。 */
const ALLOWED_PATHS = Object.freeze([
  '/vw',
  '/tg',
  '/tm',
  '/td',
  '/moisture',
  '/modulus',
  '/vm',
  '/cte',
  '/free-volume',
  '/dielectric',
  '/joback',
  '/tpsa-logp',
  '/tg/mixing',
  '/mixture-density',
  '/mixture-dielectric',
  // I05：交聯第 0、1 層（交聯頁與第 1 層卡片）
  '/crosslink/analyze',
  '/crosslink/prepare',
  '/crosslink/layer1',
  '/crosslink/layer1/scan',
  // P7-3：固化預測（Tg∞、固化後 Tg、Td 警示）
  '/crosslink/cure',
]);

const LOOPBACK_HOST = '127.0.0.1';
const MAX_BODY_BYTES = 60 * 1024; // 引擎上限 64 KB，留一點餘裕

function isAllowedPath(p) {
  return typeof p === 'string' && ALLOWED_PATHS.includes(p);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
}

/** 檢查一次呼叫；通過回傳 { ok: true, body }（body 為經 JSON 往返後的副本），否則 { ok: false, error } */
function validateCall(p, body) {
  if (!isAllowedPath(p)) return { ok: false, error: '路徑不在白名單內' };
  if (!isPlainObject(body)) return { ok: false, error: '請求本文必須是 JSON 物件' };
  let text;
  try {
    text = JSON.stringify(body);
  } catch {
    return { ok: false, error: '請求本文無法轉成 JSON' };
  }
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return { ok: false, error: '請求本文太大' };
  return { ok: true, body: JSON.parse(text) };
}

/**
 * 代為呼叫引擎。send(engine, 'POST', path, body) 由呼叫端注入（正式使用 engine-host.cjs 的 request）。
 * 回傳 { ok: true, status, body } 或 { ok: false, error }；永遠不含權杖、埠或例外堆疊。
 */
async function callEngine(engine, p, body, send) {
  const checked = validateCall(p, body);
  if (!checked.ok) return checked;
  if (!engine || !(engine.port > 0)) return { ok: false, error: '引擎尚未啟動' };
  if (engine.host !== LOOPBACK_HOST) return { ok: false, error: '引擎位址不是 127.0.0.1，已拒絕' };
  try {
    const res = await send(engine, 'POST', p, checked.body);
    return { ok: true, status: res.status, body: res.body };
  } catch (e) {
    return { ok: false, error: `引擎呼叫失敗：${e && e.message ? String(e.message).slice(0, 200) : '未知錯誤'}` };
  }
}

module.exports = { ALLOWED_PATHS, LOOPBACK_HOST, MAX_BODY_BYTES, isAllowedPath, validateCall, callEngine };
