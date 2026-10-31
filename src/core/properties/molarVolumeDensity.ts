// 聚合物（重複單元）298 K 的莫耳體積與密度（任務 029；D08）。
// 依 van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009)，第 4 章：
//  - 4.3.7 節 式 (4.8)：Vr(298)／VW = 1.60 ＝ Vg(298)／VW ≈ 1.6 ＝ Va(298)／VW；Vc(298)／VW = 1.435。即玻璃態與橡膠態的莫耳體積相同（都是非晶態 Va），結晶態是 Vc。
//  - Table 4.10（書頁 88）：Va,i(298) 與 Vc,i(298) 的基團增量；莫耳體積 = Σ增量（Example 4.1，書頁 87：標「Vg(298)」的欄就是 Va,i）。
//  - 密度 = 結構單元質量 ÷ 莫耳體積（Example 4.1：ρ = 192.2／144.2）。
//  - 298 K 的狀態（4.3.2、4.3.3 節）：Tg 低於 25 °C 為橡膠態，Tg 高於 25 °C 為玻璃態。Tg 用任務 026 的基團加成值；Tg 算不出來（缺基團）或剛好等於 25 °C
//    （書中沒說）就判為「狀態未定」，玻璃態與橡膠態兩種結果都輸出（兩者數值相同，只差標籤）。
// 小分子液體（Table 4.5）：書中沒有推薦欄，已由使用者決定改用 Fedors 1974 另開任務；不含 `*` 的結構回傳 unsupported，不計算。
//
// 切分規則（固定順序、可重現；與任務 026、027、028 相同）：
//  1. 基團依「基團原子數由大到小」，同大小依資料表（Table 4.10）順序；先配對大的（組合基團、環），再配對小的。
//  2. 每個重原子恰好屬於一個基團；氫原子隨所屬重原子；連接點 `*` 不屬於任何基團。
//  3. 配不到的重原子 → 回傳「缺基團」與原子位置，不計算、不拋例外、不以相近基團或記憶中的數值代用。
import { MOLAR_VOLUME_GROUPS, type MolarVolumeGroupRow } from '../data/molarVolumeGroups';
import type { JSMol, RDKitModule } from '../rdkit/types';
import { atomicWeight } from './atomicWeights';
import { readGraph, type MolGraph } from './molGraph';
import { computeTg } from './tgGroupContribution';
import { vwMatches } from './vanDerWaalsVolume';

export const MOLAR_VOLUME_MODEL =
  'van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 4.3.7 節：Vm = ΣVi(298)（基團增量見 Table 4.10，書頁 88）；密度 = 結構單元質量 ÷ Vm';
export const MOLAR_VOLUME_DISCLAIMER = '莫耳體積與密度為基團加成估算，非實測；以 cm³/mol 與 g/cm³（結構單元）表示。';
/** 298 K 判斷玻璃態／橡膠態的 Tg 界線（°C，書頁 79、80：Tg 低於／高於 25 °C） */
export const STATE_BOUNDARY_C = 25;
/** 書中印於括號內的數值，備註以此字樣標示 */
const TENTATIVE_MARK = '書中印於括號內';

const SYMBOLS: Record<number, string> = { 1: 'H', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl', 35: 'Br' };
const symbolOf = (z: number): string => SYMBOLS[z] ?? `#${z}`;

export interface MolarVolumeFamily extends MolarVolumeGroupRow {
  /** 切分順序（資料表的列序） */
  order: number;
}

export interface MolarVolumeGroupHit {
  id: string;
  name: string;
  /** Va,i(298)（非晶態，cm³/mol） */
  va: number;
  /** Vc,i(298)（結晶態，cm³/mol） */
  vc: number;
  /** 書中印於括號內（書中標為暫定） */
  tentative: boolean;
  atoms: number[];
  source: string;
}

export interface MolarVolumeMissingAtom {
  index: number;
  element: string;
  description: string;
  /** 為什麼配不到的補充說明（例如書中沒有定義的條件）；沒有補充時為 null */
  reason: string | null;
}

export type PolymerState = 'glassy' | 'rubbery' | 'undetermined';

export interface StateJudgement {
  state: PolymerState;
  /** 任務 026 的 Tg（°C）；算不出來時為 null */
  tgC: number | null;
  /** 判斷依據的文字說明 */
  basis: string;
}

export interface VolumeAndDensity {
  /** 莫耳體積（cm³/mol） */
  vm: number;
  /** 密度（g/cm³） */
  density: number;
}

export type MolarVolumeResult =
  | {
      status: 'ok';
      smiles: string;
      polymer: true;
      /** 結構單元質量（g/mol），由結構計算；只列在驗證文件，網站不顯示（D09） */
      unitMass: number | null;
      /** 非晶態（Va）：玻璃態與橡膠態共用同一組增量，數值相同（式 4.8a、4.8b） */
      amorphous: VolumeAndDensity | null;
      /** 結晶態（Vc） */
      crystalline: VolumeAndDensity | null;
      /** 玻璃態與橡膠態兩種結果都輸出（數值相同，標籤不同） */
      glassy: VolumeAndDensity | null;
      rubbery: VolumeAndDensity | null;
      state: StateJudgement;
      groups: MolarVolumeGroupHit[];
      /** 用到書中標為暫定（括號內）的數值 */
      usesTentative: boolean;
      sources: string[];
      model: string;
    }
  | { status: 'missing'; smiles: string; polymer: true; groups: MolarVolumeGroupHit[]; missing: MolarVolumeMissingAtom[] }
  | { status: 'unsupported'; smiles: string; message: string }
  | { status: 'invalid'; smiles: string; message: string };

export interface MolarVolumeOptions {
  rows?: readonly MolarVolumeGroupRow[];
}

const orderedCache = new WeakMap<readonly MolarVolumeGroupRow[], MolarVolumeFamily[]>();

/** 依切分順序排列的基團：原子數由大到小，同大小依資料表順序 */
export function orderMolarVolumeGroups(rows: readonly MolarVolumeGroupRow[] = MOLAR_VOLUME_GROUPS): MolarVolumeFamily[] {
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
    throw new Error(`莫耳體積基團表的 SMARTS 無法解析：${smarts}`);
  }
  return q;
}

/** 配不到的原子，若屬於書中 al./ar.、general／acrylics 這類沒有定義條件的情況，補充說明（優先順序由上而下） */
const MISSING_HINTS: readonly { smarts: string; reason: string }[] = [
  {
    smarts: '[CX3H0;D3](=[OX1])-[OX2H0;D2]-[#6,#0]',
    reason: '酯基 –COO–：Table 4.10 分 general 與 acrylics 兩列但書中沒有定義條件；只收羰基碳接芳香碳者（資料表 M11），其他酯不配對',
  },
  {
    smarts: '[OX2H0;D2;!R](-[#6,#0])-[#6,#0]',
    reason: '醚 –O–：Table 4.10 分 al. 與 ar. 兩列但書中沒有定義；只收兩側都是非芳香飽和碳（M09）或兩側都是芳香碳（M10）者，接連接點 * 或芳基烷基醚不配對',
  },
];

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

/** 結構單元質量（g/mol）；元素不在原子量表時回傳 null */
function unitMassOf(g: MolGraph): number | null {
  const hw = atomicWeight(1) as number;
  let sum = 0;
  for (let i = 0; i < g.z.length; i++) {
    if (g.z[i] === 0) continue;
    const w = atomicWeight(g.z[i]);
    if (w === null) return null;
    sum += w + g.hCount[i] * hw;
  }
  return sum;
}

/** 298 K 的狀態判斷（4.3.2、4.3.3 節）：需要任務 026 的 Tg；Tg 算不出來或剛好 25 °C 就是「狀態未定」 */
export function judgeState(RDKit: RDKitModule, smiles: string): StateJudgement {
  const tg = computeTg(RDKit, smiles);
  if (tg.status !== 'ok') {
    return {
      state: 'undetermined',
      tgC: null,
      basis: tg.status === 'missing' ? 'Tg 算不出來（任務 026 的基團表缺基團），不判斷 298 K 的狀態；玻璃態與橡膠態結果都輸出' : `Tg 無法計算：${tg.message}`,
    };
  }
  if (tg.tgC > STATE_BOUNDARY_C) return { state: 'glassy', tgC: tg.tgC, basis: `Tg = ${tg.tgC.toFixed(1)} °C，高於 ${STATE_BOUNDARY_C} °C → 玻璃態（書頁 80，4.3.3 節）` };
  if (tg.tgC < STATE_BOUNDARY_C) return { state: 'rubbery', tgC: tg.tgC, basis: `Tg = ${tg.tgC.toFixed(1)} °C，低於 ${STATE_BOUNDARY_C} °C → 橡膠態（書頁 79，4.3.2 節）` };
  return { state: 'undetermined', tgC: tg.tgC, basis: `Tg 剛好等於 ${STATE_BOUNDARY_C} °C，書中沒有規定；玻璃態與橡膠態結果都輸出` };
}

const volumeAndDensity = (vm: number, mass: number | null): VolumeAndDensity | null => (mass === null ? null : { vm, density: mass / vm });

export function computeMolarVolumeDensity(RDKit: RDKitModule, smiles: string, options: MolarVolumeOptions = {}): MolarVolumeResult {
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
    if (!g.z.some((z) => z > 1)) return { status: 'invalid', smiles, message: '沒有重原子' };
    if (!g.z.some((z) => z === 0)) {
      return {
        status: 'unsupported',
        smiles,
        message: '不含連接點（*）的小分子：液體莫耳體積要用 Fedors 1974（使用者 2026-10-31 決定另開任務，與 8.3 溶解度參數合併），本任務未實作；聚合物表不套用在小分子',
      };
    }
    if (componentCount(g) > 1) return { status: 'invalid', smiles, message: '含多個分子（以 . 分隔）；一次只算一個重複單元' };

    // ---- 切分 ----
    const owner = new Array<number>(n).fill(-1);
    const hits: { row: MolarVolumeFamily; atoms: number[] }[] = [];
    for (const row of orderMolarVolumeGroups(options.rows ?? MOLAR_VOLUME_GROUPS)) {
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
    const groups: MolarVolumeGroupHit[] = hits.map((h) => ({
      id: h.row.id,
      name: h.row.name,
      va: h.row.va,
      vc: h.row.vc,
      tentative: h.row.notes.includes(TENTATIVE_MARK),
      atoms: h.atoms,
      source: h.row.source,
    }));

    const missingIdx: number[] = [];
    for (let i = 0; i < n; i++) if (g.z[i] > 1 && owner[i] === -1) missingIdx.push(i);
    if (missingIdx.length > 0) {
      const reasons = new Map<number, string>();
      for (const hint of MISSING_HINTS) {
        const q = mustQuery(RDKit, hint.smarts);
        try {
          for (const atoms of vwMatches(mol, q)) for (const a of atoms) if (owner[a] === -1 && g.z[a] !== 0 && !reasons.has(a)) reasons.set(a, hint.reason);
        } finally {
          q.delete();
        }
      }
      const missing: MolarVolumeMissingAtom[] = missingIdx.map((i) => ({ index: i, element: symbolOf(g.z[i]), description: describeAtom(g, i), reason: reasons.get(i) ?? null }));
      return { status: 'missing', smiles, polymer: true, groups, missing };
    }

    // ---- 計算 ----
    const vmA = groups.reduce((s, h) => s + h.va, 0);
    const vmC = groups.reduce((s, h) => s + h.vc, 0);
    const mass = unitMassOf(g);
    const amorphous = volumeAndDensity(vmA, mass);
    const state = judgeState(RDKit, smiles);
    return {
      status: 'ok',
      smiles,
      polymer: true,
      unitMass: mass,
      amorphous,
      crystalline: volumeAndDensity(vmC, mass),
      glassy: amorphous,
      rubbery: amorphous,
      state,
      groups,
      usesTentative: groups.some((h) => h.tentative),
      sources: [...new Set(groups.map((h) => h.source))],
      model: MOLAR_VOLUME_MODEL,
    };
  } finally {
    mol.delete();
  }
}

/** 把切分結果依基團 id 合併成「基團 × 個數」，依資料表順序 */
export function countMolarVolumeGroups(groups: readonly MolarVolumeGroupHit[]): { id: string; name: string; va: number; vc: number; tentative: boolean; count: number }[] {
  const map = new Map<string, { id: string; name: string; va: number; vc: number; tentative: boolean; count: number }>();
  for (const h of groups) {
    const e = map.get(h.id);
    if (e) e.count++;
    else map.set(h.id, { id: h.id, name: h.name, va: h.va, vc: h.vc, tentative: h.tentative, count: 1 });
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}
