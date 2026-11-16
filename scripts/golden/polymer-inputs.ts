// 黃金資料的輸入集合：export-polymer-*.ts（聚合物基礎五個模組，任務 M04）共用。
// 這個檔名不是 export-*.ts，所以 CI 的 `for f in scripts/golden/export-*.ts` 不會把它當匯出程式執行；它只提供輸入，不計算任何物性。
// 輸入來源（使用者 2026-11-16 追加指示：不另外擴充案例數）：
//   1. 既有測試：tests/polymer/{repeatUnit,endGroups,copolymer,mwPdi}.test.ts、tests/crosslink/layer1/{layer1,lowMw}.test.ts 的字串與數字
//   2. scripts/verification/phase4.ts、phase5.ts、phase6-*.ts 與 docs/verification/*.md 中含連接點（*）、形似 SMILES 的字串；骨架範本 BT01–BT06；端基資料表
//   3. 邊界探針（BOUNDARY_UNITS 與各匯出程式內的邊界數字）與 .5 捨入案例（`roundhalf/`）
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ROOT } from './common.ts';

/** 邊界探針：原子映射編號（TS 從 Molfile 文字讀，≥ 100 時欄位黏在一起）、帶電連接點（TS 拋出例外）、連接點在同一原子／環上／支鏈上 */
export const BOUNDARY_UNITS: [string, string][] = [
  ['map/1-2', '[*:1]CC[*:2]'],
  ['map/2-1', '[*:2]CC[*:1]'],
  ['map/0-0', '[*:0]CC[*:0]'],
  ['map/99-99', '[*:99]CC[*:99]'],
  ['map/100-2', '[*:100]CC[*:2]'],
  ['map/100-100', '[*:100]CC[*:100]'],
  ['map/1000-1000', '[*:1000]CC[*:1000]'],
  ['map/middle-first', 'C([*:2])C[*:1]'],
  ['charge/dummy-plus-throws', '[*+]CC*'],
  ['R2/same-atom', '*C(*)CC'],
  ['R2/ring', '*C1CCC(*)CC1'],
  ['R2/branch', '*CC(*)C'],
  ['R2/fused-heterocycle', '*c1ccc2cc(*)ccc2c1'],
  ['R2/heteroaromatic', '*c1ccc(*)s1'],
];

const SMILES_LIKE = /^[A-Za-z0-9@+\-[\]()=#$:/\\%.*~]+$/;
const HAS_ATOM = /[BCNOPSFIbcnops*[]/;
const NOT_SMILES = /\.(csv|ts|md|json|mjs|png)$|^(src|docs|tests|scripts)\//;

function candidates(file: string, pattern: RegExp, unescape: boolean): string[] {
  const text = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of text.matchAll(pattern)) {
    let s = m[1];
    if (unescape) s = s.replace(/\\(.)/g, '$1');
    if (s.length > 0 && s.length <= 400 && SMILES_LIKE.test(s) && HAS_ATOM.test(s) && !NOT_SMILES.test(s)) out.push(s);
  }
  return out;
}

const listDir = (dir: string, pattern: RegExp): string[] =>
  readdirSync(resolve(ROOT, dir))
    .filter((n) => pattern.test(n))
    .sort()
    .map((n) => join(dir, n));

export interface SourceSmiles {
  id: string;
  smiles: string;
}

/** 既有測試與驗證檔中含連接點（*）、形似 SMILES 的字串（去重，保留第一次出現） */
export function collectSourceSmiles(): SourceSmiles[] {
  const files: [string, RegExp, boolean][] = [
    ...['repeatUnit', 'endGroups', 'copolymer', 'mwPdi'].map((n) => [join('tests/polymer', `${n}.test.ts`), /'((?:[^'\\\n]|\\.)*)'/g, true] as [string, RegExp, boolean]),
    ...['layer1', 'lowMw'].map((n) => [join('tests/crosslink/layer1', `${n}.test.ts`), /'((?:[^'\\\n]|\\.)*)'/g, true] as [string, RegExp, boolean]),
    ...['phase4.ts', 'phase5.ts'].map((n) => [join('scripts/verification', n), /'((?:[^'\\\n]|\\.)*)'/g, true] as [string, RegExp, boolean]),
    ...listDir('scripts/verification', /^phase6-.*\.ts$/).map((f) => [f, /'((?:[^'\\\n]|\\.)*)'/g, true] as [string, RegExp, boolean]),
    ...listDir('docs/verification', /^phase[2-6].*\.md$/).map((f) => [f, /`([^`\n]+)`/g, false] as [string, RegExp, boolean]),
  ];
  const seen = new Set<string>();
  const out: SourceSmiles[] = [];
  for (const [file, pattern, unescape] of files) {
    const rel = relative(ROOT, resolve(ROOT, file)).replace(/\\/g, '/');
    let n = 0;
    for (const s of candidates(resolve(ROOT, file), pattern, unescape)) {
      if (!s.includes('*')) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      out.push({ id: `${rel}#${++n}`, smiles: s });
    }
  }
  return out;
}

/** 往較大／較小的相鄰雙精度數（Node 沒有內建 nextafter） */
export function nextUp(x: number): number {
  const f = new Float64Array([x]);
  const b = new BigUint64Array(f.buffer);
  if (x === 0) return Number.MIN_VALUE;
  if (x > 0) b[0] += 1n;
  else b[0] -= 1n;
  return f[0];
}
export function nextDown(x: number): number {
  return -nextUp(-x);
}

/** TS 拋出例外時記錄（RDKit.js 的 WebAssembly 例外記為 { threw: true }；一般 Error 另記訊息）；其他種類的例外照樣拋出 */
export function attempt<T>(fn: () => T): T | { threw: true } | { threw: true; message: string } {
  try {
    return fn();
  } catch (e) {
    if (String(e) === '[object WebAssembly.Exception]') return { threw: true };
    if (e instanceof Error && e.constructor === Error) return { threw: true, message: e.message };
    throw e;
  }
}
