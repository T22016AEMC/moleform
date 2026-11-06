// 使用者定義的經驗自由體積法（任務 036a，D57）：Vf = Vω × 經驗係數。
// **這不是 van Krevelen 書中的自由體積分率**（書中沒有由結構計算的方法，見報告 036），也不用於 CTE（任務 036 的 CTE 只用 VW 與 Tg）。
// 方法來源：使用者 2026-11-06 依論文整理的 Excel 表（docs/references/自由體積算法_使用者表.xlsx；論文清單待補），未經獨立驗證，稽核狀態「待使用者審」。
//
// 規則（使用者 2026-11-06 決定；任務卡 036a）：
//  1. Vω = Σ（基團數 × 基團 Vω）。19 個基團見 src/data/free_volume_groups.csv；芳香族 H 欄已刪除，芳香碳一律計 8.11（含氫，不分有無取代）。
//  2. 一個單體（重複單元、小分子）只選一個係數，整個單元的 Vω 乘上去。優先順序（待使用者審）：
//     SBI 螺環骨架 0.7 ＞ 橋環或籠狀脂環（含金剛烷）0.8 ＞ 含任何芳香環 0.37 ＞ 其餘 1（無環為「脂肪族」，有脂環為「環烷」，係數同為 1）。
//  3. 共聚物按單體莫耳分率加權：Vf = Σ x_i·Vf_i；Vω = Σ x_i·Vω_i（莫耳分率沿用任務 020 的 analyzePolymerUnits，wt% 輸入先換成莫耳分率）。
//  4. 聚合物只算重複單元（`*` 只是連到相鄰單元的鍵，不是原子）；小分子算整個分子（D56 只限制 Tg，不限制本項）。
//  5. 表中沒有的原子（N、S、Si、Cl、Br、I、P、B…）或結構（雜芳香環、烯烴、羧酸、碳酸酯、醯胺…）→ 回報「缺基團」，不計算、不猜值、不以相近基團代替。
//     共聚物的任何一個單元缺基團，整體回報缺基團，不略過。
//  5b. 羰基類基團（任務 036b）：酮 10.8、醛 11.5 是整個 C=O（含羰基碳）、酯基 23 是整組 –C(=O)–O–（羰基碳、羰基 O、單鍵 O），羰基碳不另計為脂肪族 C，酯基單鍵 O 不另計為醚 O（依 Bondi 1964 Table XVI 與使用者 2026-11-06 說明）。
//  6. 切分：基團依原子數由大到小、同大小依資料表順序貪婪配對，每個重原子恰好屬於一個基團（與任務 028、029 同一種作法）。
//  7. Vf／Va 比值另列：Va 取任務 029 的結果（用書的 Va，非使用者定義）；Va 缺（缺基團、小分子液體未實作）就只標缺。
// D09：分子量不顯示；D02：不使用實驗值；D07：不使用折射率 n。
import {
  FREE_VOLUME_COEFFICIENTS,
  FREE_VOLUME_GROUPS,
  type FreeVolumeCoefficientRow,
  type FreeVolumeGroupRow,
} from '../data/freeVolumeTables';
import { analyzePolymerUnits } from '../polymer/copolymer';
import type { PolymerSpec } from '../polymer/types';
import type { JSMol, RDKitModule } from '../rdkit/types';
import { computeMolarVolumeDensity } from './molarVolumeDensity';
import { readGraph, type MolGraph } from './molGraph';
import { vwMatches } from './vanDerWaalsVolume';

export const FREE_VOLUME_MODEL =
  '使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證）：Vf = Vω × 經驗係數，Vω = Σ 基團 Vω（自由體積算法_使用者表.xlsx；芳香族 C 8.11 含氫，不另計芳香 H）；不是 van Krevelen 書中的自由體積分率，不用於 CTE';
export const FREE_VOLUME_DISCLAIMER = '使用者定義的經驗法，非書中的自由體積分率，未經獨立驗證；以 cm³/mol（結構單元或分子）表示。';
export const FREE_VOLUME_VA_NOTE = 'Vf／Va 的 Va 用書的 Table 4.10（任務 029）計算，非使用者定義';

const SYMBOLS: Record<number, string> = { 1: 'H', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl', 35: 'Br', 53: 'I' };
const symbolOf = (z: number): string => SYMBOLS[z] ?? `#${z}`;

export interface FreeVolumeGroupFamily extends FreeVolumeGroupRow {
  order: number;
}

/** 依切分順序排列的基團：原子數由大到小，同大小依資料表順序 */
export function orderFreeVolumeGroups(rows: readonly FreeVolumeGroupRow[] = FREE_VOLUME_GROUPS): FreeVolumeGroupFamily[] {
  return rows.map((r, order) => ({ ...r, order })).sort((a, b) => b.atomCount - a.atomCount || a.order - b.order);
}

export interface FreeVolumeGroupHit {
  id: string;
  name: string;
  vw: number;
  atoms: number[];
  source: string;
}

export interface FreeVolumeGroupContribution {
  id: string;
  name: string;
  vw: number;
  count: number;
  /** count × vw（cm³/mol） */
  contribution: number;
}

export interface FreeVolumeMissingAtom {
  index: number;
  element: string;
  description: string;
}

export interface FreeVolumeCoefficientPick {
  id: string;
  name: string;
  coefficient: number;
  /** 判斷依據（寫進輸出，方便使用者檢查） */
  reason: string;
}

export type FreeVolumeUnitResult =
  | {
      status: 'ok';
      smiles: string;
      polymer: boolean;
      /** Vω（cm³/mol） */
      vomega: number;
      coefficient: FreeVolumeCoefficientPick;
      /** Vf = Vω × 係數（cm³/mol） */
      vf: number;
      groups: FreeVolumeGroupHit[];
      contributions: FreeVolumeGroupContribution[];
      sources: string[];
    }
  | { status: 'missing'; smiles: string; polymer: boolean; groups: FreeVolumeGroupHit[]; missing: FreeVolumeMissingAtom[] }
  | { status: 'invalid'; smiles: string; message: string };

// ---- 橋環偵測 ----

/**
 * 非芳香原子組成的環系統中，是否有橋環或籠狀結構：存在兩個原子，它們之間有三條互不相交（不共用中間原子）、
 * 且各至少兩個鍵的路徑（排除兩原子間直接的鍵）。降冰片烷、金剛烷、三環癸烷屬之；萘烷、茚滿這類稠環與螺環不屬。
 * 只看非芳香原子（含芳香原子的橋環，例如苯并降冰片烯，不偵測；見報告 036a）。
 */
export function hasBridgedAliphaticRing(g: MolGraph): boolean {
  const n = g.z.length;
  const inSet = (i: number) => g.z[i] !== 0 && !g.aromatic[i];
  const adj: number[][] = Array.from({ length: n }, (_, i) => (inSet(i) ? g.neighbors[i].filter(inSet) : []));
  // 橋（割邊）：不在環上的鍵
  const disc = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const bridge = new Set<string>();
  let time = 0;
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const dfs = (u: number, parent: number) => {
    disc[u] = low[u] = time++;
    for (const v of adj[u]) {
      if (v === parent) continue;
      if (disc[v] === -1) {
        dfs(v, u);
        low[u] = Math.min(low[u], low[v]);
        if (low[v] > disc[u]) bridge.add(key(u, v));
      } else low[u] = Math.min(low[u], disc[v]);
    }
  };
  for (let i = 0; i < n; i++) if (inSet(i) && disc[i] === -1) dfs(i, -1);
  const ring: number[][] = adj.map((list, u) => list.filter((v) => !bridge.has(key(u, v))));
  const heavy = ring.map((l) => l.length);
  for (let a = 0; a < n; a++) {
    if (heavy[a] < 3) continue;
    for (let b = a + 1; b < n; b++) {
      if (heavy[b] < 3) continue;
      if (disjointPaths(ring, a, b) >= 3) return true;
    }
  }
  return false;
}

/** a 到 b 的內部頂點互不相交的路徑數（不用 a–b 直接的鍵）；頂點容量 1 的最大流，最多數到 3 */
function disjointPaths(ring: readonly number[][], a: number, b: number): number {
  const n = ring.length;
  // 節點 v_in = 2v、v_out = 2v+1；容量：v_in→v_out 為 1（a、b 為無限）；鍵 u_out→v_in 容量 1
  const cap = new Map<string, number>();
  const nbr: number[][] = Array.from({ length: 2 * n }, () => []);
  const addEdge = (x: number, y: number, c: number) => {
    const k = `${x}>${y}`;
    if (!cap.has(k)) {
      nbr[x].push(y);
      if (!cap.has(`${y}>${x}`)) {
        cap.set(`${y}>${x}`, 0);
        nbr[y].push(x);
      }
    }
    cap.set(k, (cap.get(k) ?? 0) + c);
  };
  for (let v = 0; v < n; v++) {
    if (ring[v].length === 0) continue;
    addEdge(2 * v, 2 * v + 1, v === a || v === b ? 99 : 1);
    for (const w of ring[v]) {
      if ((v === a && w === b) || (v === b && w === a)) continue;
      addEdge(2 * v + 1, 2 * w, 1);
    }
  }
  const s = 2 * a + 1;
  const t = 2 * b;
  let flow = 0;
  while (flow < 3) {
    const prev = new Map<number, number>([[s, -1]]);
    const queue = [s];
    for (let qi = 0; qi < queue.length && !prev.has(t); qi++) {
      const u = queue[qi];
      for (const v of nbr[u]) if (!prev.has(v) && (cap.get(`${u}>${v}`) ?? 0) > 0) {
        prev.set(v, u);
        queue.push(v);
      }
    }
    if (!prev.has(t)) break;
    for (let v = t; prev.get(v) !== -1; v = prev.get(v) as number) {
      const u = prev.get(v) as number;
      cap.set(`${u}>${v}`, (cap.get(`${u}>${v}`) ?? 0) - 1);
      cap.set(`${v}>${u}`, (cap.get(`${v}>${u}`) ?? 0) + 1);
    }
    flow++;
  }
  return flow;
}

/** 有沒有非芳香的環（含環氧環） */
function hasAliphaticRing(g: MolGraph): boolean {
  const n = g.z.length;
  const inSet = (i: number) => g.z[i] !== 0 && !g.aromatic[i];
  // 非芳香原子的誘導子圖有環 ⇔ 邊數 > 頂點數 − 連通分量數
  const seen = new Array<boolean>(n).fill(false);
  let verts = 0;
  let edges = 0;
  let comps = 0;
  for (let i = 0; i < n; i++) {
    if (!inSet(i)) continue;
    verts++;
    edges += g.neighbors[i].filter((j) => j > i && inSet(j)).length;
    if (seen[i]) continue;
    comps++;
    const stack = [i];
    seen[i] = true;
    while (stack.length > 0) {
      const u = stack.pop() as number;
      for (const v of g.neighbors[u]) if (inSet(v) && !seen[v]) {
        seen[v] = true;
        stack.push(v);
      }
    }
  }
  return edges > verts - comps;
}

// ---- 共用 ----

function mustQuery(RDKit: RDKitModule, smarts: string): JSMol {
  const q = RDKit.get_qmol(smarts);
  if (!q || !q.is_valid()) {
    q?.delete();
    throw new Error(`自由體積資料表的 SMARTS 無法解析：${smarts}`);
  }
  return q;
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
  for (let i = 0; i < g.z.length; i++) {
    if (seen[i]) continue;
    count++;
    const stack = [i];
    seen[i] = true;
    while (stack.length > 0) {
      const u = stack.pop() as number;
      for (const v of g.neighbors[u]) if (!seen[v]) {
        seen[v] = true;
        stack.push(v);
      }
    }
  }
  return count;
}

/** 基團的所有命中：去掉情境原子後的佔用原子（由小到大），命中之間依第一個原子排序，結果可重現 */
function groupMatches(mol: JSMol, query: JSMol, context: readonly number[]): number[][] {
  const parsed = JSON.parse(mol.get_substruct_matches(query)) as { atoms: number[] }[] | Record<string, never>;
  if (!Array.isArray(parsed)) return [];
  const list = parsed.map((m) => m.atoms.filter((_, qi) => !context.includes(qi)).sort((a, b) => a - b));
  list.sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  });
  return list;
}

export interface FreeVolumeOptions {
  groups?: readonly FreeVolumeGroupRow[];
  coefficients?: readonly FreeVolumeCoefficientRow[];
}

const coefficientById = (rows: readonly FreeVolumeCoefficientRow[], id: string): FreeVolumeCoefficientRow => {
  const r = rows.find((x) => x.id === id);
  if (!r) throw new Error(`自由體積係數表缺少 ${id}`);
  return r;
};

/** 依優先順序選一個係數（SBI ＞ 橋環脂環 ＞ 芳香環 ＞ 其餘） */
function pickCoefficient(RDKit: RDKitModule, mol: JSMol, g: MolGraph, rows: readonly FreeVolumeCoefficientRow[]): FreeVolumeCoefficientPick {
  const pick = (id: string, reason: string): FreeVolumeCoefficientPick => {
    const r = coefficientById(rows, id);
    return { id: r.id, name: r.name, coefficient: r.coefficient, reason };
  };
  const matches = (smarts: string): boolean => {
    const q = mustQuery(RDKit, smarts);
    try {
      return vwMatches(mol, q).length > 0;
    } finally {
      q.delete();
    }
  };
  const sbi = coefficientById(rows, 'FC01');
  const arom = coefficientById(rows, 'FC03');
  if (matches(sbi.smarts)) return pick('FC01', '含螺雙茚滿（SBI）螺環骨架');
  if (hasBridgedAliphaticRing(g)) return pick('FC02', '含橋環或籠狀脂環（金剛烷、降冰片烷等）');
  if (matches(arom.smarts)) return pick('FC03', '含芳香環');
  if (hasAliphaticRing(g)) return pick('FC05', '有脂環（含環氧環）、無芳香環、非橋環');
  return pick('FC04', '無環的脂肪族');
}

/** 一個單元（聚合物的重複單元或小分子）的 Vω、係數、Vf */
export function computeFreeVolumeUnit(RDKit: RDKitModule, smiles: string, options: FreeVolumeOptions = {}): FreeVolumeUnitResult {
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
    if (componentCount(g) > 1) return { status: 'invalid', smiles, message: '含多個分子（以 . 分隔）；一次只算一個分子或一個重複單元' };

    // ---- 切分 ----
    const owner = new Array<number>(n).fill(-1);
    const hits: { row: FreeVolumeGroupFamily; atoms: number[] }[] = [];
    for (const row of orderFreeVolumeGroups(options.groups ?? FREE_VOLUME_GROUPS)) {
      const q = mustQuery(RDKit, row.smarts);
      try {
        for (const atoms of groupMatches(mol, q, row.context)) {
          if (atoms.some((a) => owner[a] !== -1 || g.z[a] === 0)) continue;
          for (const a of atoms) owner[a] = hits.length;
          hits.push({ row, atoms });
        }
      } finally {
        q.delete();
      }
    }
    hits.sort((a, b) => a.atoms[0] - b.atoms[0] || a.row.order - b.row.order);
    const groups: FreeVolumeGroupHit[] = hits.map((h) => ({ id: h.row.id, name: h.row.name, vw: h.row.vw, atoms: h.atoms, source: h.row.source }));
    const missing: FreeVolumeMissingAtom[] = [];
    for (let i = 0; i < n; i++) if (g.z[i] > 1 && owner[i] === -1) missing.push({ index: i, element: symbolOf(g.z[i]), description: describeAtom(g, i) });
    if (missing.length > 0) return { status: 'missing', smiles, polymer, groups, missing };

    // ---- 計算 ----
    const vomega = groups.reduce((s, h) => s + h.vw, 0);
    const coefficient = pickCoefficient(RDKit, mol, g, options.coefficients ?? FREE_VOLUME_COEFFICIENTS);
    return {
      status: 'ok',
      smiles,
      polymer,
      vomega,
      coefficient,
      vf: vomega * coefficient.coefficient,
      groups,
      contributions: countFreeVolumeGroups(groups),
      sources: [...new Set(groups.map((h) => h.source))],
    };
  } finally {
    mol.delete();
  }
}

/** 把切分結果依基團 id 合併成「基團 × 個數 × 貢獻」，依資料表順序 */
export function countFreeVolumeGroups(groups: readonly FreeVolumeGroupHit[]): FreeVolumeGroupContribution[] {
  const map = new Map<string, FreeVolumeGroupContribution>();
  for (const h of groups) {
    const cur = map.get(h.id);
    if (cur) {
      cur.count++;
      cur.contribution += h.vw;
    } else map.set(h.id, { id: h.id, name: h.name, vw: h.vw, count: 1, contribution: h.vw });
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// ---- 單元＋共聚物 ----

export interface FreeVolumeComponent {
  smiles: string;
  /** 莫耳分率（0–1；均聚物與小分子為 1） */
  molFraction: number;
  unit: FreeVolumeUnitResult;
  /** Va（cm³/mol，任務 029 的書值）；缺時為 null 並附原因 */
  va: number | null;
  vaNote: string | null;
}

export type FreeVolumeResult =
  | {
      status: 'ok';
      smiles: string;
      polymer: boolean;
      copolymer: boolean;
      /** 莫耳分率加權的 Vω、Vf（cm³/mol） */
      vomega: number;
      vf: number;
      /** 有效係數 Vf／Vω（均聚物與單一單元就是所選的係數；共聚物是加權後的值） */
      effectiveCoefficient: number;
      components: FreeVolumeComponent[];
      /** 莫耳分率加權的 Va（任務 029）；任一單元缺 Va 時為 null */
      va: number | null;
      vaNote: string | null;
      /** Vf／Va；Va 缺時為 null */
      vfOverVa: number | null;
      sources: string[];
      model: string;
    }
  | { status: 'missing'; smiles: string; components: FreeVolumeComponent[]; message: string }
  | { status: 'invalid'; smiles: string; message: string };

function vaOf(RDKit: RDKitModule, smiles: string): { va: number | null; note: string | null } {
  const r = computeMolarVolumeDensity(RDKit, smiles);
  if (r.status === 'ok' && r.amorphous) return { va: r.amorphous.vm, note: null };
  if (r.status === 'missing') return { va: null, note: '缺 Va（Table 4.10 缺基團）' };
  if (r.status === 'unsupported') return { va: null, note: '缺 Va（小分子液體的莫耳體積未實作，任務 029 範圍只有聚合物）' };
  return { va: null, note: `缺 Va（${r.status === 'invalid' ? r.message : '無法計算'}）` };
}

/**
 * 計算 Vf。`spec` 是任務 020 的共聚物組成（units 與 fractionBasis）；沒有 spec 或只有一個單元時視為均聚物／單一分子。
 * 共聚物按單體莫耳分率加權；任何單元缺基團或結構有誤，整體回報（缺基團或無效），不略過。
 */
export function computeFreeVolume(RDKit: RDKitModule, smiles: string, spec?: Pick<PolymerSpec, 'units' | 'fractionBasis' | 'endGroups'>, options: FreeVolumeOptions = {}): FreeVolumeResult {
  const multi = !!spec?.units && spec.units.length > 1;
  let parts: { smiles: string; molFraction: number }[];
  if (multi) {
    const analysis = analyzePolymerUnits(RDKit, smiles, spec);
    if (!analysis.ok || !analysis.units) return { status: 'invalid', smiles, message: analysis.ok ? '共聚物組成無法分析' : analysis.problem.message };
    parts = analysis.units.map((u) => ({ smiles: u.smiles, molFraction: u.molFraction }));
  } else {
    const only = spec?.units && spec.units.length === 1 ? spec.units[0].smiles : smiles;
    parts = [{ smiles: only, molFraction: 1 }];
  }

  const components: FreeVolumeComponent[] = [];
  for (const p of parts) {
    const unit = computeFreeVolumeUnit(RDKit, p.smiles, options);
    if (unit.status === 'invalid') return { status: 'invalid', smiles, message: multi ? `單元「${p.smiles}」：${unit.message}` : unit.message };
    const v = unit.status === 'ok' ? vaOf(RDKit, p.smiles) : { va: null, note: null };
    components.push({ smiles: p.smiles, molFraction: p.molFraction, unit, va: v.va, vaNote: v.note });
  }
  const bad = components.filter((c) => c.unit.status === 'missing');
  if (bad.length > 0) {
    const message = multi
      ? `共聚物的單元缺基團（${bad.map((c) => `「${c.smiles}」`).join('、')}），整體不計算、不略過`
      : '缺基團：使用者表沒有對應的基團，不計算、不猜值';
    return { status: 'missing', smiles, components, message };
  }
  const oks = components.map((c) => c.unit).filter((u): u is Extract<FreeVolumeUnitResult, { status: 'ok' }> => u.status === 'ok');
  const vomega = components.reduce((s, c, i) => s + c.molFraction * (oks[i]?.vomega ?? 0), 0);
  const vf = components.reduce((s, c, i) => s + c.molFraction * (oks[i]?.vf ?? 0), 0);
  const vaMissing = components.find((c) => c.va === null);
  const va = vaMissing ? null : components.reduce((s, c) => s + c.molFraction * (c.va as number), 0);
  return {
    status: 'ok',
    smiles,
    polymer: oks.some((u) => u.polymer),
    copolymer: multi,
    vomega,
    vf,
    effectiveCoefficient: vf / vomega,
    components,
    va,
    vaNote: vaMissing?.vaNote ?? null,
    vfOverVa: va === null ? null : vf / va,
    sources: [...new Set(oks.flatMap((u) => u.sources))],
    model: FREE_VOLUME_MODEL,
  };
}
