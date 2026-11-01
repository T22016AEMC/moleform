// 聚合物（重複單元）的介電常數 ε 與莫耳折射 ΣR、分子極化率 α（任務 032；D08、D53；折射率 n 依 D07 不做）。
// 依 van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009)：
//  - 第 11 章（書頁 320–321）式 (11.7)：P_LL = (ε − 1)/(ε + 2)·V，故 ε = (1 + 2x)/(1 − x)，x = ΣP_LL/V；
//    式 (11.8)：P_V = ε^½·M，故 ε = (ΣP_V/M)²（不需要莫耳體積）。基團增量見 Table 11.1（P_LL、P_V 兩欄，書頁 321）。
//  - V 用任務 029 的非晶態莫耳體積 Va（Table 4.10）。書中式 (11.7) 與 Example 11.1 只寫「V(298)」，沒說是 Va 或 Vc；
//    依 PE 試算（Va 得 2.19，書中 2.20；Vc 得 2.86 不吻合）選擇 Va（使用者 2026-11-01 決定）。
//  - P 的適用頻率：書中未註明。Table 11.2 的觀測值屬 10²–10⁹ Hz 低頻範圍（書頁 320）。
//  - 極性基團：書中沒有對 P 做額外修正；式 (11.14) 與 Table 11.3 的偶極矩只用來估偶極矩（D15 已取消，不做）。
//  - 主要 ε 用式 (11.8)（P_V，不需莫耳體積，13 個 Table 11.2 聚合物都在書中計算值 0.04 內）；式 (11.7)（P_LL ＋ Va）為第二個估計，兩者並列（使用者 2026-11-01 決定）。
//  - Table 10.4 變體重疊的優先順序（使用者 2026-11-01 決定）：「接在苯環上」優先，其次甲基／乙基等烷基變體，最後一般值；兩個烷基變體同時成立（如乙酸甲酯）不配對。
//  - 第 10 章 Table 10.4 的 R_LL（λ = 589 nm，書頁 293–294）；ΣR = ΣR_LL。分子極化率由式 (11.10) R_LL = N_A·α/(3ε₀) 與式 (11.11) α = 4πε₀α′ 得
//    α′ = 3R/(4π·N_A)，α = 3ε₀R/N_A。不輸出折射率 n 與 n²（D07，任務卡修訂）。
// 只對聚合物單元（含連接點 *）計算；不含連接點的小分子回傳「不適用（小分子）」。
//
// 切分規則（固定順序、可重現；與任務 026–029 相同，重疊優先順序沿用最大組合優先，M26 未決，不得改動）：
//  1. 基團依「基團原子數由大到小」，同大小依資料表順序；先配對大的（組合基團），再配對小的。
//  2. 每個重原子恰好屬於一個基團；氫原子隨所屬重原子；連接點 `*` 不屬於任何基團。
//  3. 配不到的重原子 → 回報「缺基團」與原子位置，不計算、不拋例外、不以相近基團或記憶中的數值代用。
//  ε 與 ΣR 各用各自的基團表（Table 11.1、Table 10.4），各自切分、各自回報缺基團。
import {
  MOLAR_REFRACTION_GROUPS,
  type MolarRefractionGroupRow,
} from '../data/molarRefractionGroups';
import { POLARIZATION_GROUPS, type PolarizationGroupRow } from '../data/polarizationGroups';
import type { JSMol, RDKitModule } from '../rdkit/types';
import { atomicWeight } from './atomicWeights';
import { readGraph, type MolGraph } from './molGraph';
import { computeMolarVolumeDensity } from './molarVolumeDensity';
import { vwMatches } from './vanDerWaalsVolume';

export const DIELECTRIC_MODEL =
  'van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 11.2.3 節：主要 ε 用式 (11.8) P_V = ε^½·M，第二個估計用式 (11.7) P_LL = (ε − 1)/(ε + 2)·V（V ＝ Va，任務 029）；基團增量見 Table 11.1（書頁 321）';
export const REFRACTION_MODEL =
  'van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 10.2 節 Table 10.4（R_LL，λ = 589 nm，書頁 293–294）；α 由式 (11.10)、(11.11)（書頁 321–322）換算';
export const DIELECTRIC_DISCLAIMER = '基團加成估算，非實測；含極性基團的 ε 受頻率與溫度影響（Table 11.2 觀測值屬 10²–10⁹ Hz 低頻範圍）。';

/** 阿伏加德羅常數（SI 2019 定義值，mol⁻¹） */
const N_A = 6.02214076e23;
/** 真空電容率，書中式 (11.3) 的值（J⁻¹ C² m⁻¹） */
const EPSILON_0 = 8.854188e-12;

const SYMBOLS: Record<number, string> = { 1: 'H', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl', 35: 'Br', 53: 'I' };
const symbolOf = (z: number): string => SYMBOLS[z] ?? `#${z}`;

interface BaseGroupRow {
  id: string;
  name: string;
  smarts: string;
  atomCount: number;
  source: string;
}

export interface PartitionHit<T extends BaseGroupRow> {
  row: T;
  atoms: number[];
}

export interface MissingAtom {
  index: number;
  element: string;
  description: string;
  /** 為什麼配不到的補充說明（書中沒有定義的條件等）；沒有補充時為 null */
  reason: string | null;
}

interface MissingHint {
  smarts: string;
  reason: string;
}

/** Table 11.1 配不到的原子，若屬於書中沒有的情況，補充說明（優先順序由上而下） */
const P_MISSING_HINTS: readonly MissingHint[] = [
  { smarts: '[c;R1;D3]1[c;R1;D3][cH;R1][cH;R1][cH;R1][cH;R1]1', reason: '鄰位伸苯基：Table 11.1 只有單取代苯基與對伸苯基，沒有鄰位（使用者 2026-11-01 決定不放寬）' },
  { smarts: '[c;R1;D3]1[cH;R1][c;R1;D3][cH;R1][cH;R1][cH;R1]1', reason: '間位伸苯基：Table 11.1 只有單取代苯基與對伸苯基，沒有間位（使用者 2026-11-01 決定不放寬）' },
  { smarts: '[R]', reason: '環上原子：Table 11.1 沒有環狀脂肪族、雜環或稠環基團' },
];

/** Table 10.4 配不到的原子，若屬於書中變體沒有定義判斷條件或優先順序的情況，補充說明（優先順序由上而下） */
const R_MISSING_HINTS: readonly MissingHint[] = [
  { smarts: '[CX3;D3;!R;$(C-[#6,#0])](=[OX1])-[OX2H0;D2;!R]', reason: '酯基 –COO–：Table 10.4 分五列（甲酯、乙酯、高級酯、接在苯環上、乙酸酯）但沒有定義條件；兩個烷基旗標同時成立（如乙酸甲酯、乙酸乙酯）書中沒說，不配對（見 R25 備註）' },
  { smarts: '[CX3;D3;!R](=[OX1])-[NX3H1]', reason: '醯胺：Table 10.4 只有二級醯胺 –CONH–，不含醯亞胺或 N 上有第二個取代基者' },
  { smarts: '[R]', reason: '環上原子：Table 10.4 的環結構用 Δ ring structure 增量修正，書中沒說怎麼套用，不收' },
  { smarts: '[c;R1;D3]', reason: '多取代的苯環：書中用「伸苯基減 H_ar」，但沒說減在哪一個異構物，不配對' },
];

const queryCache = new Map<string, JSMol>();
function mustQuery(RDKit: RDKitModule, smarts: string): JSMol {
  const cached = queryCache.get(smarts);
  if (cached) return cached;
  const q = RDKit.get_qmol(smarts);
  if (!q || !q.is_valid()) {
    q?.delete();
    throw new Error(`基團表的 SMARTS 無法解析：${smarts}`);
  }
  queryCache.set(smarts, q);
  return q;
}

/** 依切分順序排列：原子數由大到小，同大小依資料表順序 */
function orderGroups<T extends BaseGroupRow>(rows: readonly T[]): T[] {
  return rows
    .map((r, order) => ({ r, order }))
    .sort((a, b) => b.r.atomCount - a.r.atomCount || a.order - b.order)
    .map((x) => x.r);
}
const orderedCache = new WeakMap<readonly BaseGroupRow[], BaseGroupRow[]>();
function orderedOf<T extends BaseGroupRow>(rows: readonly T[]): T[] {
  let list = orderedCache.get(rows) as T[] | undefined;
  if (!list) {
    list = orderGroups(rows);
    orderedCache.set(rows, list);
  }
  return list;
}

/** 依 P 表的切分順序（原子數由大到小）排列的基團，供測試使用 */
export const orderPolarizationGroups = (rows: readonly PolarizationGroupRow[] = POLARIZATION_GROUPS): PolarizationGroupRow[] => orderedOf(rows);
/** 依 R 表的切分順序（原子數由大到小）排列的基團，供測試使用 */
export const orderMolarRefractionGroups = (rows: readonly MolarRefractionGroupRow[] = MOLAR_REFRACTION_GROUPS): MolarRefractionGroupRow[] => orderedOf(rows);

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

/** 切分：回傳命中的基團與配不到的原子（每個重原子恰好屬於一個基團；連接點不屬於任何基團） */
function partition<T extends BaseGroupRow>(
  RDKit: RDKitModule,
  mol: JSMol,
  g: MolGraph,
  rows: readonly T[],
  hints: readonly MissingHint[],
): { hits: PartitionHit<T>[]; missing: MissingAtom[] } {
  const n = g.z.length;
  const owner = new Array<number>(n).fill(-1);
  const hits: (PartitionHit<T> & { order: number })[] = [];
  const ordered = orderedOf(rows);
  for (const row of ordered) {
    const q = mustQuery(RDKit, row.smarts);
    for (const atoms of vwMatches(mol, q)) {
      if (atoms.some((a) => owner[a] !== -1 || g.z[a] === 0)) continue;
      for (const a of atoms) owner[a] = hits.length;
      hits.push({ row, atoms, order: rows.indexOf(row) });
    }
  }
  hits.sort((a, b) => a.atoms[0] - b.atoms[0] || a.order - b.order);
  const missingIdx: number[] = [];
  for (let i = 0; i < n; i++) if (g.z[i] > 1 && owner[i] === -1) missingIdx.push(i);
  const missing: MissingAtom[] = [];
  if (missingIdx.length > 0) {
    const reasons = new Map<number, string>();
    for (const hint of hints) {
      const q = mustQuery(RDKit, hint.smarts);
      for (const atoms of vwMatches(mol, q)) for (const a of atoms) if (owner[a] === -1 && g.z[a] !== 0 && !reasons.has(a)) reasons.set(a, hint.reason);
    }
    for (const i of missingIdx) missing.push({ index: i, element: symbolOf(g.z[i]), description: describeAtom(g, i), reason: reasons.get(i) ?? null });
  }
  return { hits: hits.map(({ row, atoms }) => ({ row, atoms })), missing };
}

// ---------------------------------------------------------------- 介電常數 ----

export interface PolarizationHit {
  id: string;
  name: string;
  /** P_LL（cm³/mol） */
  pLL: number;
  /** P_V（g/mol） */
  pV: number;
  tentativeLL: boolean;
  tentativeV: boolean;
  atoms: number[];
  source: string;
}

export type VolumeForDielectric =
  | { status: 'ok'; /** 非晶態莫耳體積 Va（cm³/mol） */ va: number }
  | { status: 'missing'; message: string; missing: MissingAtom[] };

export type DielectricResult =
  | {
      status: 'ok';
      smiles: string;
      polymer: true;
      /** 結構單元質量（g/mol），只用於式 (11.8)；網站不顯示（D09） */
      unitMass: number;
      groups: PolarizationHit[];
      sumPLL: number;
      sumPV: number;
      volume: VolumeForDielectric;
      /** 主要 ε（式 11.8，P_V；不需莫耳體積）；與 epsV 相同 */
      epsPrimary: number;
      /** 第二個估計（式 11.7，P_LL ＋ Va）；與 epsLL 相同，缺莫耳體積或無解時為 null */
      epsSecondary: number | null;
      /** 式 (11.7)：ε = (1 + 2x)/(1 − x)，x = ΣP_LL/Va；沒有莫耳體積（缺莫耳體積）或 x ≥ 1 時為 null */
      epsLL: number | null;
      /** epsLL 為 null 的原因；有值時為 null */
      epsLLNote: string | null;
      /** 式 (11.8)：ε = (ΣP_V/M)² */
      epsV: number;
      /** 兩個估計的相對差 |ε_LL − ε_V| / ε_LL；任一缺少時為 null */
      relDiff: number | null;
      /** 用到書中標為暫定（括號內或 ~）的 P_LL 或 P_V */
      usesTentativeLL: boolean;
      usesTentativeV: boolean;
      sources: string[];
      model: string;
    }
  | { status: 'missing'; smiles: string; polymer: true; groups: PolarizationHit[]; missing: MissingAtom[] }
  | { status: 'unsupported'; smiles: string; message: string }
  | { status: 'invalid'; smiles: string; message: string };

/** 式 (11.7) 解 ε：ε = (1 + 2x)/(1 − x)，x = P/V；x ≥ 1 時無解（回傳 null） */
export function epsilonFromPLL(sumPLL: number, volume: number): number | null {
  const x = sumPLL / volume;
  return x >= 1 ? null : (1 + 2 * x) / (1 - x);
}

/** 式 (11.8) 解 ε：ε = (P_V/M)² */
export function epsilonFromPV(sumPV: number, mass: number): number {
  return (sumPV / mass) ** 2;
}

function parseUnit(RDKit: RDKitModule, smiles: string): { mol: JSMol; g: MolGraph } | { error: { status: 'invalid' | 'unsupported'; smiles: string; message: string } } {
  if (smiles.trim() === '') return { error: { status: 'invalid', smiles, message: '沒有結構（SMILES 是空的）' } };
  let mol: JSMol | null = null;
  try {
    mol = RDKit.get_mol(smiles);
  } catch {
    mol = null;
  }
  if (!mol || !mol.is_valid()) {
    mol?.delete();
    return { error: { status: 'invalid', smiles, message: 'RDKit 無法解析這個 SMILES' } };
  }
  const g = readGraph(mol);
  if (!g.z.some((z) => z > 1)) {
    mol.delete();
    return { error: { status: 'invalid', smiles, message: '沒有重原子' } };
  }
  if (!g.z.some((z) => z === 0)) {
    mol.delete();
    return { error: { status: 'unsupported', smiles, message: '不適用（小分子）：Table 11.1 與 Table 10.4 是聚合物重複單元的基團增量，不含連接點（*）的小分子不套用' } };
  }
  if (componentCount(g) > 1) {
    mol.delete();
    return { error: { status: 'invalid', smiles, message: '含多個分子（以 . 分隔）；一次只算一個重複單元' } };
  }
  return { mol, g };
}

export function computeDielectric(RDKit: RDKitModule, smiles: string): DielectricResult {
  const parsed = parseUnit(RDKit, smiles);
  if ('error' in parsed) return parsed.error;
  const { mol, g } = parsed;
  try {
    const { hits, missing } = partition(RDKit, mol, g, POLARIZATION_GROUPS, P_MISSING_HINTS);
    const groups: PolarizationHit[] = hits.map((h) => ({
      id: h.row.id,
      name: h.row.name,
      pLL: h.row.pLL,
      pV: h.row.pV,
      tentativeLL: h.row.tentativeLL,
      tentativeV: h.row.tentativeV,
      atoms: h.atoms,
      source: h.row.source,
    }));
    if (missing.length > 0) return { status: 'missing', smiles, polymer: true, groups, missing };
    const mass = unitMassOf(g);
    if (mass === null) return { status: 'invalid', smiles, message: '有元素不在原子量表，無法算結構單元質量' };
    const sumPLL = groups.reduce((s, h) => s + h.pLL, 0);
    const sumPV = groups.reduce((s, h) => s + h.pV, 0);
    const vd = computeMolarVolumeDensity(RDKit, smiles);
    let volume: VolumeForDielectric;
    if (vd.status === 'ok' && vd.amorphous) volume = { status: 'ok', va: vd.amorphous.vm };
    else if (vd.status === 'missing') volume = { status: 'missing', message: '缺莫耳體積（Table 4.10 缺基團，任務 029）', missing: vd.missing };
    else volume = { status: 'missing', message: `缺莫耳體積（${vd.status === 'ok' ? '無法算' : vd.message}）`, missing: [] };
    let epsLL: number | null = null;
    let epsLLNote: string | null = null;
    if (volume.status === 'ok') {
      epsLL = epsilonFromPLL(sumPLL, volume.va);
      if (epsLL === null) epsLLNote = `ΣP_LL（${sumPLL}）≥ Va（${volume.va}），式 (11.7) 無解`;
    } else epsLLNote = '缺莫耳體積，僅 P_V 估計';
    const epsV = epsilonFromPV(sumPV, mass);
    return {
      status: 'ok',
      smiles,
      polymer: true,
      unitMass: mass,
      groups,
      sumPLL,
      sumPV,
      volume,
      epsLL,
      epsLLNote,
      epsV,
      epsPrimary: epsV,
      epsSecondary: epsLL,
      relDiff: epsLL === null ? null : Math.abs(epsLL - epsV) / epsLL,
      usesTentativeLL: groups.some((h) => h.tentativeLL),
      usesTentativeV: groups.some((h) => h.tentativeV),
      sources: [...new Set(groups.map((h) => h.source))],
      model: DIELECTRIC_MODEL,
    };
  } finally {
    mol.delete();
  }
}

// ---------------------------------------------------------------- 莫耳折射與極化率 ----

export interface RefractionHit {
  id: string;
  name: string;
  /** R_LL（cm³/mol） */
  r: number;
  atoms: number[];
  source: string;
}

export type RefractionResult =
  | {
      status: 'ok';
      smiles: string;
      polymer: true;
      groups: RefractionHit[];
      /** ΣR_LL（10⁻⁶ m³/mol ＝ cm³/mol） */
      sumR: number;
      /** 分子極化率體積 α′ = 3R/(4π·N_A)（Å³／單元） */
      alphaPrimeA3: number;
      /** 分子極化率 α = 3ε₀R/N_A（J⁻¹ C² m²，每單元） */
      alphaSI: number;
      sources: string[];
      model: string;
    }
  | { status: 'missing'; smiles: string; polymer: true; groups: RefractionHit[]; missing: MissingAtom[] }
  | { status: 'unsupported'; smiles: string; message: string }
  | { status: 'invalid'; smiles: string; message: string };

/** α′（Å³）：α′ = 3R/(4π·N_A)，R 以 cm³/mol 輸入，1 cm³ = 10²⁴ Å³ */
export function alphaPrimeFromR(sumR: number): number {
  return ((3 * sumR) / (4 * Math.PI * N_A)) * 1e24;
}
/** α（SI）：α = 3ε₀R/N_A，R 以 cm³/mol 輸入（換成 m³/mol 乘 10⁻⁶） */
export function alphaSIFromR(sumR: number): number {
  return (3 * EPSILON_0 * sumR * 1e-6) / N_A;
}

export function computeRefraction(RDKit: RDKitModule, smiles: string): RefractionResult {
  const parsed = parseUnit(RDKit, smiles);
  if ('error' in parsed) return parsed.error;
  const { mol, g } = parsed;
  try {
    const { hits, missing } = partition(RDKit, mol, g, MOLAR_REFRACTION_GROUPS, R_MISSING_HINTS);
    const groups: RefractionHit[] = hits.map((h) => ({ id: h.row.id, name: h.row.name, r: h.row.r, atoms: h.atoms, source: h.row.source }));
    if (missing.length > 0) return { status: 'missing', smiles, polymer: true, groups, missing };
    const sumR = groups.reduce((s, h) => s + h.r, 0);
    return {
      status: 'ok',
      smiles,
      polymer: true,
      groups,
      sumR,
      alphaPrimeA3: alphaPrimeFromR(sumR),
      alphaSI: alphaSIFromR(sumR),
      sources: [...new Set(groups.map((h) => h.source))],
      model: REFRACTION_MODEL,
    };
  } finally {
    mol.delete();
  }
}

/** 一次回傳 ε 與 ΣR／α（兩者各自切分、各自回報缺基團） */
export function computeDielectricRefraction(RDKit: RDKitModule, smiles: string): { dielectric: DielectricResult; refraction: RefractionResult } {
  return { dielectric: computeDielectric(RDKit, smiles), refraction: computeRefraction(RDKit, smiles) };
}

/** 把切分結果依基團 id 合併成「基團 × 個數」 */
export function countGroups<T extends { id: string; name: string }>(groups: readonly T[]): (T & { count: number })[] {
  const map = new Map<string, T & { count: number }>();
  for (const h of groups) {
    const e = map.get(h.id);
    if (e) e.count++;
    else map.set(h.id, { ...h, count: 1 });
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}
