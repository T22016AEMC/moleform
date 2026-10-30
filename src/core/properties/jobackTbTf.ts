// Joback 法的沸點與熔點（任務 027；D52）：Tb = 198.2 + ΣTbi（式 (2)）、Tf = 122.5 + ΣTfi（式 (3)），Tbi、Tfi 取自表 III（Joback & Reid 1987）。
// 基團加成估算，只用於小分子；數值為估算，非實測。含連接點（`*`）的聚合物重複單元不適用，直接回報。
//
// 切分規則（固定順序、可重現）：
//  1. 基團依「基團原子數由大到小」，同大小依表 III 順序；先配對大的（–COOH、–COO–、–NO2 為 3 個原子；>C=O、O=CH–、–CN 為 2 個原子），再配對 1 個原子的基團。
//  2. 每個重原子恰好屬於一個基團；氫原子隨所屬重原子。已被配走的原子不再配對。
//  3. 配不到的重原子 → 回傳「缺基團」與原子位置，不計算、不拋例外、不以相近基團代用。
//  4. 表 III 的 Tf 欄在 –N=（非環）一列印為「—」：含這個基團的分子只算 Tb，Tf 回傳 null 並列出該基團。
import type { JobackGroupRow } from '../data/jobackGroups';
import { JOBACK_GROUPS } from '../data/jobackGroups';
import type { JSMol, RDKitModule } from '../rdkit/types';
import { readGraph, type MolGraph } from './molGraph';

export const JOBACK_TB_CONSTANT = 198.2;
export const JOBACK_TF_CONSTANT = 122.5;
export const JOBACK_MODEL = 'Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243：式 (2) Tb = 198.2 + ΣTbi、式 (3) Tf = 122.5 + ΣTfi';
export const JOBACK_DISCLAIMER = 'Joback 法為基團加成估算，僅用於小分子；數值為估算，非實測。';

/** 論文本身提到的適用限制與誤差（照原文整理，不含論文以外的說法）；每項附頁碼與原文 */
export const JOBACK_PAPER_LIMITS: readonly { page: string; summary: string; quote: string }[] = [
  {
    page: 'p.233（摘要）',
    summary: '論文不宣稱高準確度，只說與當時常用的方法相當或更準',
    quote: 'High accuracy is not claimed, but the proposed methods are often as accurate as or more accurate than techniques in common use today.',
  },
  {
    page: 'p.233',
    summary: '假設基團之間沒有交互作用，只是一階近似；論文用 41 個基團處理多種有機化合物',
    quote: 'Note we have assumed no interaction between groups [...] Clearly this is only a first-order approximation, but it is our experience that there rarely exist sufficient data to obtain reliable contributions between so-called "next-nearest neighbors."',
  },
  {
    page: 'p.238',
    summary: 'Tb、Tf 的數據來自 Reid et al.（1987）與 Stull et al.（1969）',
    quote: 'Values for Tb, Tf, ΔHvb, and ΔHf were obtained from Reid et al. and Stull et al.',
  },
  {
    page: 'p.240（表 VI）',
    summary:
      '回歸測試的整體統計（論文沒有按化合物類別分開列誤差，只說更細的分項見 Joback 1984 論文）：Tb 用 438 個化合物，平均絕對誤差 12.9 K、標準差 17.9 K、平均百分比誤差 3.6%；Tf 用 388 個化合物，平均絕對誤差 22.6 K、標準差 24.7 K、平均百分比誤差 11.2%',
    quote: '（表格）Tb: 438 compounds, average absolute error 12.9 K, standard deviation 17.9 K, average per cent error 3.6; Tf: 388 compounds, 22.6 K, 24.7 K, 11.2',
  },
  {
    page: 'p.240',
    summary: '沸點不準確，凍結（熔）點尤其不準確，只能當作非常粗略的估計；Tf 強烈依賴分子的構型，方法分不出順反異構物（例：順式與反式 1,2-二甲基環戊烷的 Tf 相差約 64 K，回歸只得到中間值）',
    quote:
      'Estimations of the normal boiling point and, in particular, the normal freezing point are not accurate and should be considered as only very approximate. There is a strong dependence of the actual conformation of the molecule on Tf as shown, for example, in the large difference found for Tf between, say, cis- and trans-isomers. To illustrate, the difference in Tf between cis- and trans-1,2-dimethylcyclopentane is about 64 K. Since our procedure does not differentiate between cis- and trans-isomers, the regression yields some medium value.',
  },
  {
    page: 'p.239（表 V）',
    summary: '論文的對二氯苯例題：Tb 估算 443.4 K、實驗 447.3 K；Tf 估算 256 K、實驗 326 K',
    quote: '（表格）p-dichlorobenzene: Tb 443.4 K (experimental 447.3 K); Tf 256 K (experimental 326 K)',
  },
];

const SYMBOLS: Record<number, string> = {
  1: 'H', 3: 'Li', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 11: 'Na', 12: 'Mg', 13: 'Al', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl', 19: 'K', 20: 'Ca', 26: 'Fe', 29: 'Cu', 30: 'Zn', 34: 'Se', 35: 'Br', 50: 'Sn', 53: 'I',
};
const symbolOf = (z: number): string => SYMBOLS[z] ?? `#${z}`;

export interface JobackFamily extends JobackGroupRow {
  /** 切分順序（表 III 的列序） */
  order: number;
}

export interface JobackGroupHit {
  id: string;
  name: string;
  tbi: number;
  tfi: number | null;
  atoms: number[];
  source: string;
}

export interface JobackMissingAtom {
  index: number;
  element: string;
  description: string;
}

export type JobackResult =
  | {
      status: 'ok';
      smiles: string;
      /** Tb（K）；Tb = 198.2 + ΣTbi */
      tbK: number;
      tbC: number;
      /** Tf（K）；含表 III 沒有 Tfi 的基團時為 null */
      tfK: number | null;
      tfC: number | null;
      sumTb: number;
      sumTf: number | null;
      /** 表 III 沒有 Tfi 的基團名稱（Tf 無法計算的原因） */
      tfUnavailable: string[];
      groups: JobackGroupHit[];
      sources: string[];
      model: string;
    }
  | { status: 'missing'; smiles: string; groups: JobackGroupHit[]; missing: JobackMissingAtom[] }
  | { status: 'not-applicable'; smiles: string; reason: string }
  | { status: 'invalid'; smiles: string; message: string };

export interface JobackOptions {
  rows?: readonly JobackGroupRow[];
}

export const POLYMER_NOT_APPLICABLE = '不適用（聚合物單元）：Joback 法只用於小分子，含連接點（*）的結構不計算';

const orderedCache = new WeakMap<readonly JobackGroupRow[], JobackFamily[]>();

/** 依切分順序排列的基團：原子數由大到小，同大小依表 III 順序 */
export function orderJobackGroups(rows: readonly JobackGroupRow[] = JOBACK_GROUPS): JobackFamily[] {
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
    throw new Error(`Joback 基團表的 SMARTS 無法解析：${smarts}`);
  }
  return q;
}

/** 所有命中（原子序號由小到大排序，命中之間依第一個原子排序），結果可重現 */
export function jobackMatches(mol: JSMol, query: JSMol): number[][] {
  const parsed = JSON.parse(mol.get_substruct_matches(query)) as { atoms: number[] }[] | Record<string, never>;
  if (!Array.isArray(parsed)) return [];
  const list = parsed.map((m) => [...m.atoms].sort((a, b) => a - b));
  list.sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  });
  return list;
}

function describeAtom(g: MolGraph, i: number): string {
  const h = g.hCount[i];
  const label = `${symbolOf(g.z[i])}${h > 0 ? `H${h > 1 ? h : ''}` : ''}${g.aromatic[i] ? '（芳香）' : ''}`;
  const near = g.neighbors[i].map((n) => `${symbolOf(g.z[n])}${n}`).join('、');
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

export function computeJoback(RDKit: RDKitModule, smiles: string, options: JobackOptions = {}): JobackResult {
  // 連接點（*）直接判不適用，不需解析
  if (smiles.includes('*')) return { status: 'not-applicable', smiles, reason: POLYMER_NOT_APPLICABLE };
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
    if (g.z.some((z) => z === 0)) return { status: 'not-applicable', smiles, reason: POLYMER_NOT_APPLICABLE };
    if (!g.z.some((z) => z > 1)) return { status: 'invalid', smiles, message: '沒有重原子' };
    if (componentCount(g) > 1) return { status: 'invalid', smiles, message: '含多個分子（以 . 分隔）；Joback 法一次只算一個分子' };

    // ---- 切分 ----
    const owner = new Array<number>(n).fill(-1);
    const hits: { row: JobackFamily; atoms: number[] }[] = [];
    for (const row of orderJobackGroups(options.rows ?? JOBACK_GROUPS)) {
      const q = mustQuery(RDKit, row.smarts);
      try {
        for (const atoms of jobackMatches(mol, q)) {
          if (atoms.some((a) => owner[a] !== -1)) continue;
          for (const a of atoms) owner[a] = hits.length;
          hits.push({ row, atoms });
        }
      } finally {
        q.delete();
      }
    }
    hits.sort((a, b) => a.atoms[0] - b.atoms[0] || a.row.order - b.row.order);
    const groups: JobackGroupHit[] = hits.map((h) => ({ id: h.row.id, name: h.row.name, tbi: h.row.tbi, tfi: h.row.tfi, atoms: h.atoms, source: h.row.source }));

    const missing: JobackMissingAtom[] = [];
    for (let i = 0; i < n; i++) if (g.z[i] > 1 && owner[i] === -1) missing.push({ index: i, element: symbolOf(g.z[i]), description: describeAtom(g, i) });
    if (missing.length > 0) return { status: 'missing', smiles, groups, missing };

    // ---- 計算 ----
    const sumTb = groups.reduce((s, h) => s + h.tbi, 0);
    const tfUnavailable = [...new Set(groups.filter((h) => h.tfi === null).map((h) => h.name))];
    const sumTf = tfUnavailable.length > 0 ? null : groups.reduce((s, h) => s + (h.tfi as number), 0);
    const tbK = JOBACK_TB_CONSTANT + sumTb;
    const tfK = sumTf === null ? null : JOBACK_TF_CONSTANT + sumTf;
    return {
      status: 'ok',
      smiles,
      tbK,
      tbC: tbK - 273.15,
      tfK,
      tfC: tfK === null ? null : tfK - 273.15,
      sumTb,
      sumTf,
      tfUnavailable,
      groups,
      sources: [...new Set(groups.map((h) => h.source))],
      model: JOBACK_MODEL,
    };
  } finally {
    mol.delete();
  }
}

/** 把切分結果依基團 id 合併成「基團 × 個數」，依表 III 順序 */
export function countJobackGroups(groups: readonly JobackGroupHit[]): { id: string; name: string; tbi: number; tfi: number | null; count: number }[] {
  const map = new Map<string, { id: string; name: string; tbi: number; tfi: number | null; count: number }>();
  for (const h of groups) {
    const e = map.get(h.id);
    if (e) e.count++;
    else map.set(h.id, { id: h.id, name: h.name, tbi: h.tbi, tfi: h.tfi, count: 1 });
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}
