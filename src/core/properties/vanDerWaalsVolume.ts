// van der Waals 體積（任務 028；D08）：VW = ΣVW,i（van Krevelen & te Nijenhuis 2009，4.2.3 節；基團增量 Table 4.2，書頁 74–75；基團增量法源自 Bondi 1964）。
// 單位 cm³/mol。小分子與聚合物重複單元（含 `*`）都能算：van Krevelen 以結構單元計算，`*` 只是連到相鄰單元的鍵，不是原子。
//
// 切分規則（固定順序、可重現；與任務 026、027 相同）：
//  1. 基團依「基團原子數由大到小」，同大小依資料表（Table 4.2）順序；先配對大的（整環基團、組合基團），再配對小的。
//  2. 每個重原子恰好屬於一個基團；氫原子隨所屬重原子。已被配走的原子不再配對。
//  3. 配不到的重原子 → 回傳「缺基團」與原子位置，不計算、不拋例外、不以相近基團或記憶中的數值代用。
//  4. 配到的基團若資料表 VW 留空（書中數值有疑義，例如 –O–），該基團的原子同樣列為缺基團，並註明原因。
//  5. ΣMi 與分子（重複單元）的質量差只標示，不阻擋計算（作法同任務 026）。
import type { VwGroupRow } from '../data/vwGroups';
import { VW_GROUPS } from '../data/vwGroups';
import type { DataIssue, TableResult } from '../data/types';
import type { JSMol, RDKitModule } from '../rdkit/types';
import { atomicWeight } from './atomicWeights';
import { readGraph, type MolGraph } from './molGraph';

/**
 * ΣMi 與分子（重複單元）質量允許的差（g/mol）：Table 4.2 的 Mi 只印到兩位（有些只印一位，例如萘基 127.2），每個基團各有捨入誤差，
 * 所以容許值是各基團捨入容許的加總（兩位小數 0.01、一位小數 0.05，V07 的明確例外 0.05），比 Tg（任務 026）的固定 0.01 寬。
 */
export const massTolerance = (groups: readonly { id: string; mi: number }[]): number =>
  groups.reduce((s, g) => s + (VW_MI_EXCEPTIONS[g.id] ?? (Number.isInteger(Math.round(g.mi * 100) / 10) ? 0.05 : 0.01)), 0);
/** 單一基團 Mi 與實際基團質量允許的差（g/mol）：書中印兩位小數的 Mi 容許 0.02，只印一位小數的（127.2、77.10 這類末位為 0 者視同一位）容許 0.05 */
export const miTolerance = (mi: number): number => (Number.isInteger(Math.round(mi * 100) / 10) ? 0.05 : 0.02);
/** 明確的例外（使用者 2026-10-30 決定）：V07 –C(CH3)(COOCH3)– 的 Mi 書印 86.05，基團質量 86.09，疑為印刷誤差，容許 0.05（KNOWN_ISSUES M18） */
/** 任務 031：V28 萘二基（書印 126.18，原子量表算 126.158）、V30 吡啶基（書印 78.07，算 78.094；書中 Nar 的 Mi 用 14.00，與一般 N 14.007 差 0.007）差 0.02–0.03，是書中捨入，容許 0.03 */
export const VW_MI_EXCEPTIONS: Readonly<Record<string, number>> = { V07: 0.05, V28: 0.03, V30: 0.03 };
export const VW_MODEL = 'van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 4.2.3 節：VW = ΣVW,i（基團增量見 Table 4.2，書頁 74–75；基團增量法源自 Bondi 1964）';
export const VW_DISCLAIMER = 'van der Waals 體積為基團加成估算，非實測；以 cm³/mol（結構單元）表示。';

const SYMBOLS: Record<number, string> = { 1: 'H', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl', 35: 'Br' };
const symbolOf = (z: number): string => SYMBOLS[z] ?? `#${z}`;

export interface VwFamily extends VwGroupRow {
  /** 切分順序（資料表的列序） */
  order: number;
}

export interface VwGroupHit {
  id: string;
  name: string;
  vw: number;
  mi: number;
  atoms: number[];
  source: string;
}

export interface VwMissingAtom {
  index: number;
  element: string;
  description: string;
  /** 已配到基團但資料表 VW 留空時，寫明基團名稱 */
  reason: string | null;
}

export type VwResult =
  | {
      status: 'ok';
      smiles: string;
      polymer: boolean;
      /** VW（cm³/mol） */
      vw: number;
      sumMi: number;
      formulaMass: number | null;
      massDelta: number | null;
      massWithinTolerance: boolean | null;
      groups: VwGroupHit[];
      sources: string[];
      model: string;
    }
  | { status: 'missing'; smiles: string; polymer: boolean; groups: VwGroupHit[]; missing: VwMissingAtom[] }
  | { status: 'invalid'; smiles: string; message: string };

export interface VwOptions {
  rows?: readonly VwGroupRow[];
}

const orderedCache = new WeakMap<readonly VwGroupRow[], VwFamily[]>();

/** 依切分順序排列的基團：原子數由大到小，同大小依資料表順序 */
export function orderVwGroups(rows: readonly VwGroupRow[] = VW_GROUPS): VwFamily[] {
  const cached = orderedCache.get(rows);
  if (cached) return cached;
  const list = rows.map((r, order) => ({ ...r, order })).sort((a, b) => b.atomCount - a.atomCount || a.order - b.order);
  orderedCache.set(rows, list);
  return list;
}

/** 資料表的 SMARTS 已在格式檢查確認可解析；仍無法解析時拋出，由呼叫端的資料檢查先抓到 */
function mustQuery(RDKit: RDKitModule, smarts: string): JSMol {
  const q = RDKit.get_qmol(smarts);
  if (!q || !q.is_valid()) {
    q?.delete();
    throw new Error(`VW 基團表的 SMARTS 無法解析：${smarts}`);
  }
  return q;
}

/** 所有命中（原子序號由小到大排序，命中之間依第一個原子排序），結果可重現 */
export function vwMatches(mol: JSMol, query: JSMol): number[][] {
  const parsed = JSON.parse(mol.get_substruct_matches(query)) as { atoms: number[] }[] | Record<string, never>;
  if (!Array.isArray(parsed)) return [];
  const list = parsed.map((m) => [...m.atoms].sort((a, b) => a - b));
  list.sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  });
  return list;
}

/** 一組原子（含各自的氫）的質量；元素不在原子量表時回傳 null */
export function atomsMass(g: MolGraph, atoms: readonly number[]): number | null {
  const hw = atomicWeight(1) as number;
  let sum = 0;
  for (const a of atoms) {
    const w = atomicWeight(g.z[a]);
    if (w === null) return null;
    sum += w + g.hCount[a] * hw;
  }
  return sum;
}

function describeAtom(g: MolGraph, i: number): string {
  const h = g.hCount[i];
  const label = `${symbolOf(g.z[i])}${h > 0 ? `H${h > 1 ? h : ''}` : ''}${g.aromatic[i] ? '（芳香）' : ''}`;
  const near = g.neighbors[i].map((n) => (g.z[n] === 0 ? '*' : `${symbolOf(g.z[n])}${n}`)).join('、');
  return `${label}，鄰居：${near === '' ? '無' : near}`;
}

function componentCount(g: MolGraph): number {
  const seen = new Array<boolean>(g.z.length).fill(false);
  let count = 0;
  for (let s = 0; s < g.z.length; s++) {
    if (seen[s]) continue;
    count++;
    const stack = [s];
    seen[s] = true;
    while (stack.length > 0) {
      const cur = stack.pop() as number;
      for (const nb of g.neighbors[cur]) if (!seen[nb]) (seen[nb] = true), stack.push(nb);
    }
  }
  return count;
}

export function computeVdwVolume(RDKit: RDKitModule, smiles: string, options: VwOptions = {}): VwResult {
  if (smiles.trim() === '') return { status: 'invalid', smiles, message: '沒有結構（SMILES 是空的）' };
  let mol: JSMol | null = null;
  try {
    mol = RDKit.get_mol(smiles);
  } catch {
    mol = null;
  }
  if (!mol || !mol.is_valid()) {
    mol?.delete();
    return { status: 'invalid', smiles, message: 'RDKit 無法解析這個 SMILES' };
  }
  try {
    const g = readGraph(mol);
    const n = g.z.length;
    const polymer = g.z.some((z) => z === 0);
    if (!g.z.some((z) => z > 1)) return { status: 'invalid', smiles, message: '沒有重原子' };
    if (componentCount(g) > 1) return { status: 'invalid', smiles, message: '含多個分子（以 . 分隔）；VW 一次只算一個分子或一個重複單元' };

    // ---- 切分 ----
    const owner = new Array<number>(n).fill(-1);
    const hits: { row: VwFamily; atoms: number[] }[] = [];
    for (const row of orderVwGroups(options.rows ?? VW_GROUPS)) {
      const q = mustQuery(RDKit, row.smarts);
      try {
        for (const atoms of vwMatches(mol, q)) {
          if (atoms.some((a) => owner[a] !== -1 || g.z[a] === 0)) continue;
          for (const a of atoms) owner[a] = hits.length;
          hits.push({ row, atoms });
        }
      } finally {
        q.delete();
      }
    }
    hits.sort((a, b) => a.atoms[0] - b.atoms[0] || a.row.order - b.row.order);

    const groups: VwGroupHit[] = [];
    const missing: VwMissingAtom[] = [];
    for (const h of hits) {
      if (h.row.vw === null) {
        for (const a of h.atoms) missing.push({ index: a, element: symbolOf(g.z[a]), description: describeAtom(g, a), reason: `基團「${h.row.name}」在資料表的 VW 留空（書中數值有疑義，見備註）` });
      } else groups.push({ id: h.row.id, name: h.row.name, vw: h.row.vw, mi: h.row.mi, atoms: h.atoms, source: h.row.source });
    }
    for (let i = 0; i < n; i++) if (g.z[i] > 1 && owner[i] === -1) missing.push({ index: i, element: symbolOf(g.z[i]), description: describeAtom(g, i), reason: null });
    missing.sort((a, b) => a.index - b.index);
    if (missing.length > 0) return { status: 'missing', smiles, polymer, groups, missing };

    // ---- 計算 ----
    const vw = groups.reduce((s, h) => s + h.vw, 0);
    const sumMi = groups.reduce((s, h) => s + h.mi, 0);
    const real: number[] = [];
    for (let i = 0; i < n; i++) if (g.z[i] !== 0) real.push(i);
    const formulaMass = atomsMass(g, real);
    const massDelta = formulaMass === null ? null : sumMi - formulaMass;
    return {
      status: 'ok',
      smiles,
      polymer,
      vw,
      sumMi,
      formulaMass,
      massDelta,
      massWithinTolerance: massDelta === null ? null : Math.abs(massDelta) <= massTolerance(groups),
      groups,
      sources: [...new Set(groups.map((h) => h.source))],
      model: VW_MODEL,
    };
  } finally {
    mol.delete();
  }
}

/** 把切分結果依基團 id 合併成「基團 × 個數」，依資料表順序 */
export function countVwGroups(groups: readonly VwGroupHit[]): { id: string; name: string; vw: number; count: number }[] {
  const map = new Map<string, { id: string; name: string; vw: number; count: number }>();
  for (const h of groups) {
    const e = map.get(h.id);
    if (e) e.count++;
    else map.set(h.id, { id: h.id, name: h.name, vw: h.vw, count: 1 });
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 核對資料表的 Mi 與實際基團質量：每個基團用正例分子配對，命中原子（含各自的氫）的質量要等於 Mi（容許 miTolerance）。
 * 不符就回報（先對照書中印刷錯誤清單 KNOWN_ISSUES，不同的再回報給使用者）。
 */
export function checkVwGroupMasses(RDKit: RDKitModule, table: TableResult<VwGroupRow>, positives: Readonly<Record<string, readonly string[]>>): DataIssue[] {
  const issues: DataIssue[] = [];
  table.rows.forEach((r, i) => {
    const no = table.rowNumbers[i];
    const samples = positives[r.id] ?? [];
    if (samples.length === 0) {
      issues.push({ file: 'vw_groups.csv', row: no, column: 'Mi', message: '沒有正例分子，無法核對 Mi' });
      return;
    }
    for (const smiles of samples) {
      const mol = RDKit.get_mol(smiles);
      const q = RDKit.get_qmol(r.smarts);
      try {
        if (!mol || !mol.is_valid() || !q || !q.is_valid()) {
          issues.push({ file: 'vw_groups.csv', row: no, column: 'Mi', message: `無法核對 Mi：正例 ${smiles} 或 SMARTS 無法解析` });
          continue;
        }
        const g = readGraph(mol);
        const ms = vwMatches(mol, q);
        if (ms.length === 0) {
          issues.push({ file: 'vw_groups.csv', row: no, column: 'Mi', message: `正例 ${smiles} 沒有命中，無法核對 Mi` });
          continue;
        }
        for (const m of ms) {
          const mass = atomsMass(g, m);
          if (mass === null || Math.abs(mass - r.mi) > (VW_MI_EXCEPTIONS[r.id] ?? miTolerance(r.mi))) {
            issues.push({ file: 'vw_groups.csv', row: no, column: 'Mi', message: `Mi 與基團質量不符：資料表 ${r.mi}、命中原子質量 ${mass === null ? '無法計算' : mass.toFixed(3)}（正例 ${smiles}）` });
          }
        }
      } finally {
        mol?.delete();
        q?.delete();
      }
    }
  });
  return issues;
}
