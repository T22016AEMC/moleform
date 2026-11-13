// 黃金資料匯出的共用程式（任務 M00，D62／D63）。
// 只呼叫現有的 TypeScript 計算函式，不修改它們；輸出 tests/golden/<module>.json：
//   { module, commit, rdkitjs, cases: [{ id, input, output }], tolerance }
// 序列化規則（Python 比對端 engine/tests/golden_compare.py 依同一規則解讀）：
//   - 物件的鍵一律排序後輸出（JSON.stringify，縮排 1）。
//   - 數字照 JS 的最短 round-trip 表示輸出（JSON.stringify 原生行為）。
//   - Map → { "$map": [[key, value], ...] }（保留插入順序）；NaN／±Infinity → { "$nonfinite": "NaN" | "Infinity" | "-Infinity" }。
//   - undefined 不允許（丟錯，避免靜默消失）；函式回傳 undefined 時請在匯出程式裡明確轉成 null。
// 執行環境：Node 直接執行 .ts（只用可抹除的型別語法），用 Vite 的 ssrLoadModule 載入 src/ 模組（與 scripts/verification 相同）。
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 比對規則（寫進每個黃金檔，Python 端讀取後照做；不得在 Python 端另行放寬） */
export const TOLERANCE = {
  exact: 'strings, integers, booleans, null, arrays and object keys must be identical',
  float: 'shortest round-trip string must be identical; otherwise relative error <= relFallback is accepted and the case is recorded in tolerance_cases',
  relFallback: 1e-12,
} as const;

export interface GoldenCase {
  id: string;
  input: unknown;
  output: unknown;
}

export async function withVite<T>(fn: (server: ViteDevServer) => Promise<T>): Promise<T> {
  const server = await createServer({
    root: ROOT,
    configFile: false,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true },
  });
  try {
    return await fn(server);
  } finally {
    await server.close();
  }
}

export async function rdkitjsVersion(server: ViteDevServer): Promise<string> {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const RDKit = await getRDKit();
  return String(RDKit.version());
}

function gitCommit(): string {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src'], { cwd: ROOT, encoding: 'utf8' }).trim();
  return dirty ? `${head}+dirty-src` : head;
}

/** 轉成可逐字比對的 JSON 值：鍵排序、Map 保留順序、非有限數字明確標示。 */
export function canonical(value: unknown, path = '$'): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    return { $nonfinite: Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity' };
  }
  if (value === undefined) throw new Error(`黃金資料不允許 undefined：${path}`);
  if (Array.isArray(value)) return value.map((v, i) => canonical(v, `${path}[${i}]`));
  if (value instanceof Map) {
    return { $map: [...value.entries()].map(([k, v], i) => [canonical(k, `${path}<key ${i}>`), canonical(v, `${path}<${String(k)}>`)]) };
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) out[k] = canonical((value as Record<string, unknown>)[k], `${path}.${k}`);
    return out;
  }
  throw new Error(`黃金資料不支援的型別 ${typeof value}：${path}`);
}

export function writeGolden(module: string, rdkitjs: string, cases: GoldenCase[]): string {
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`重複的案例 id：${c.id}`);
    ids.add(c.id);
  }
  const doc = canonical({ module, commit: gitCommit(), rdkitjs, cases, tolerance: TOLERANCE });
  const file = resolve(ROOT, 'tests', 'golden', `${module}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(doc, null, 1)}\n`, 'utf8');
  console.log(`已寫入 ${file}（${cases.length} 個案例，RDKit.js ${rdkitjs}）`);
  return file;
}
