// van Krevelen 的 Yg 基團切分與 Tg 計算（任務 026；D08）：Yg = ΣYgi = Tg·M（式 6.4），Tg = 1000·ΣYgi / M（Ygi 單位 K·kg/mol、M 單位 g/mol，式 6.5）。
//
// 切分規則（固定順序、可重現）：
//  1. 基團家族依「基團原子數由大到小」，同大小依資料表順序；先配對大的（含 Table 6.3 組合基團），再配對小的。
//  2. 每個重原子恰好屬於一個基團；氫原子隨所屬重原子。已被配走的原子不再配對。
//  3. 配不到的重原子 → 回傳「缺基團」與原子位置，不計算 Tg、不拋例外、不以相近基團代用。
//  4. 聚合物重複單元的 `*` 是連到相鄰單元的鍵：正好有兩個 `*` 時，兩個連接點互為鄰居（週期性），
//     共軛狀態與主鏈判定都用這個鄰接關係。小分子沒有連接點。
// 共軛狀態（Table 6.1 B 表尾註與 p.140 文字）：
//  - 雙鍵基團（C=O、CONH）：n = 脂肪鏈中孤立；c = 一側與芳香環共軛；cc = 兩側夾在兩個芳香環之間。
//    程式以「基團向外的鍵，對面原子是芳香原子」的邊數判定（0／1／≥2）。
//  - 苯環基團：n = 沒有鄰接雙鍵基團；c = 一側與雙鍵基團共軛；cc = 兩側。以「向外的鍵，對面原子屬於 B 雙鍵系統的基團」的邊數判定。
//  - Table 6.3 組合基團與 6.1 A 基團沒有共軛狀態，直接用書中值。
import type { YgGroupRow } from '../data/ygGroups';
import { YG_GROUPS, firstMatch, ygFamilyId } from '../data/ygGroups';
import type { JSMol, RDKitModule } from '../rdkit/types';
import { atomicWeight } from './atomicWeights';
import { readGraph, type MolGraph } from './molGraph';

/** 氫鍵鏈判定：單元內有這些基團時，–CH2– 取氫鍵鏈的值（書頁 139 Fig. 6.3 說明與 6.2.2.4 文字：聚醯胺、聚胺基甲酸酯、聚脲；4.3 值見 Table 6.1，書頁 133） */
export const HYDROGEN_BOND_FAMILIES: readonly string[] = [
  'A.urethane',
  'A.urea',
  'B.CONH',
  // Table 6.3 含 –CONH– 的組合基團（任務 031 第二批）：它們配走了醯胺原子，單元仍含氫鍵基團，–CH2– 照樣取氫鍵鏈值
  'T.NHCOpC6H4CONH',
  'T.NHCOmC6H4CONH',
  'T.NHpC6H4CO',
  'T.NHC6H4NHCOC6H4COp',
  'T.NHC6H4NHCOC6H4COm',
];
/** 與相鄰伸苯基的共軛狀態書中沒有定義的基團家族（Table 6.1 C 的 N-鄰苯二甲醯亞胺，任務 031）；相鄰的伸苯基回報缺基團 */
export const CONJ_UNDEFINED_FAMILIES: readonly string[] = ['C.phthalimide'];
/** ΣMi 與分子（重複單元）質量允許的差（g/mol）；超過時在結果中標示 */
export const TG_MASS_TOLERANCE = 0.01;

const SYMBOLS: Record<number, string> = { 1: 'H', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl', 35: 'Br' };
const symbolOf = (z: number): string => SYMBOLS[z] ?? `#${z}`;

export interface YgFamily {
  id: string;
  name: string;
  smarts: string;
  section: string;
  kind: string;
  /** SMARTS 描述的基團原子數（以第一個正例的命中計） */
  size: number;
  order: number;
  rows: YgGroupRow[];
}

export interface TgGroupHit {
  familyId: string;
  rowId: string;
  name: string;
  kind: string;
  ygi: number;
  mi: number;
  state: string;
  condition: string;
  tentative: boolean;
  atoms: number[];
  source: string;
}

export interface MissingAtom {
  index: number;
  element: string;
  description: string;
}

export type TgResult =
  | {
      status: 'ok';
      smiles: string;
      polymer: boolean;
      tgK: number;
      tgC: number;
      sumYg: number;
      sumM: number;
      formulaMass: number | null;
      massDelta: number | null;
      massWithinTolerance: boolean | null;
      groups: TgGroupHit[];
      sources: string[];
    }
  | {
      status: 'missing';
      smiles: string;
      polymer: boolean;
      groups: TgGroupHit[];
      missing: MissingAtom[];
    }
  | { status: 'invalid'; smiles: string; message: string };

/**
 * 重疊組合基團的切分規則（任務 031 後續，M26）：
 *  - greedy：基團原子數大者先配（預設，任務 026 起的規則）；
 *  - fewest：在所有「每個重原子恰好屬於一個基團」的切分中取基團總數最少者（同數取較大基團先配者）；
 *  - fromEnd：從第一個連接點的鄰居起，依距離由近到遠，每遇到尚未配對的原子就配含它的最大基團。
 * 找不到完整切分時 fewest 退回 greedy。
 */
export type TgPartitionStrategy = 'greedy' | 'fewest' | 'fromEnd';

export interface TgOptions {
  rows?: readonly YgGroupRow[];
  partition?: TgPartitionStrategy;
}

interface Candidate {
  family: YgFamily;
  atoms: number[];
}

/** 依規則從所有候選命中挑出互不重疊的切分；candidates 已依家族順序（大基團在前）排列 */
function choosePartition(
  strategy: TgPartitionStrategy,
  candidates: Candidate[],
  g: MolGraph,
  dummies: number[],
): Candidate[] {
  const greedy = (): Candidate[] => {
    const taken = new Set<number>();
    const picked: Candidate[] = [];
    for (const c of candidates) {
      if (c.atoms.some((a) => taken.has(a) || g.z[a] === 0)) continue;
      c.atoms.forEach((a) => taken.add(a));
      picked.push(c);
    }
    return picked;
  };
  if (strategy === 'greedy') return greedy();
  const usable = candidates.filter((c) => c.atoms.every((a) => g.z[a] !== 0));
  if (strategy === 'fewest') {
    const heavy = g.z.map((z, i) => (z > 1 ? i : -1)).filter((i) => i >= 0);
    const byAtom = new Map<number, number[]>();
    usable.forEach((c, k) => c.atoms.forEach((a) => byAtom.set(a, [...(byAtom.get(a) ?? []), k])));
    let best: number[] | null = null;
    let steps = 0;
    const covered = new Set<number>();
    const chosen: number[] = [];
    const dfs = (): void => {
      if (++steps > 200000) return;
      if (best !== null && chosen.length >= best.length) return;
      const open = heavy.filter((a) => !covered.has(a));
      if (open.length === 0) {
        best = [...chosen];
        return;
      }
      let pick = -1;
      let options: number[] = [];
      for (const a of open) {
        const opts = (byAtom.get(a) ?? []).filter((k) => usable[k].atoms.every((x) => !covered.has(x)));
        if (opts.length === 0) return;
        if (pick === -1 || opts.length < options.length) {
          pick = a;
          options = opts;
        }
      }
      for (const k of options) {
        usable[k].atoms.forEach((x) => covered.add(x));
        chosen.push(k);
        dfs();
        chosen.pop();
        usable[k].atoms.forEach((x) => covered.delete(x));
      }
    };
    dfs();
    if (best === null) return greedy();
    return (best as number[]).sort((a, b) => a - b).map((k) => usable[k]);
  }
  // fromEnd
  const start = dummies.length > 0 ? g.neighbors[dummies[0]].find((n) => g.z[n] !== 0) : undefined;
  const dist = new Map<number, number>();
  const queue: number[] = [];
  if (start !== undefined) {
    dist.set(start, 0);
    queue.push(start);
  }
  for (let head = 0; head < queue.length; head++) {
    for (const n of g.neighbors[queue[head]]) {
      if (g.z[n] === 0 || dist.has(n)) continue;
      dist.set(n, (dist.get(queue[head]) as number) + 1);
      queue.push(n);
    }
  }
  const order = g.z.map((z, i) => i).filter((i) => g.z[i] > 1).sort((a, b) => (dist.get(a) ?? 1e9) - (dist.get(b) ?? 1e9) || a - b);
  const taken = new Set<number>();
  const picked: Candidate[] = [];
  for (const a of order) {
    if (taken.has(a)) continue;
    const c = usable.find((x) => x.atoms.includes(a) && x.atoms.every((y) => !taken.has(y)));
    if (!c) continue;
    c.atoms.forEach((y) => taken.add(y));
    picked.push(c);
  }
  return picked;
}

const familyCache = new WeakMap<object, Map<readonly YgGroupRow[], YgFamily[]>>();

/** 把資料表的列整理成家族（含 SMARTS 的基團原子數）；依切分順序排序 */
export function buildYgFamilies(RDKit: RDKitModule, rows: readonly YgGroupRow[] = YG_GROUPS): YgFamily[] {
  let perRdkit = familyCache.get(RDKit);
  if (!perRdkit) {
    perRdkit = new Map();
    familyCache.set(RDKit, perRdkit);
  }
  const cached = perRdkit.get(rows);
  if (cached) return cached;
  const byId = new Map<string, YgFamily>();
  rows.forEach((r, order) => {
    const id = ygFamilyId(r);
    let f = byId.get(id);
    if (!f) {
      f = { id, name: r.name, smarts: r.smarts, section: r.section, kind: r.kind, size: 0, order, rows: [] };
      byId.set(id, f);
    }
    f.rows.push(r);
  });
  for (const f of byId.values()) {
    const sample = f.rows[0].positives[0];
    const mol = sample ? RDKit.get_mol(sample) : null;
    const q = mustQuery(RDKit, f.smarts);
    try {
      const atoms = mol && mol.is_valid() ? firstMatch(mol, q) : null;
      f.size = atoms ? atoms.length : 0;
    } finally {
      mol?.delete();
      q.delete();
    }
  }
  const families = [...byId.values()].sort((a, b) => b.size - a.size || a.order - b.order);
  perRdkit.set(rows, families);
  return families;
}

/** 資料表的 SMARTS 已在格式檢查確認可解析；仍無法解析時拋出，由呼叫端的資料檢查先抓到 */
function mustQuery(RDKit: RDKitModule, smarts: string): JSMol {
  const q = RDKit.get_qmol(smarts);
  if (!q || !q.is_valid()) {
    q?.delete();
    throw new Error(`Yg 基團表的 SMARTS 無法解析：${smarts}`);
  }
  return q;
}

function allMatches(mol: JSMol, query: JSMol): number[][] {
  const parsed = JSON.parse(mol.get_substruct_matches(query)) as { atoms: number[] }[] | Record<string, never>;
  if (!Array.isArray(parsed)) return [];
  const list = parsed.map((m) => [...m.atoms].sort((a, b) => a - b));
  list.sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  });
  return list;
}

/** 主鏈原子：兩個連接點的鄰居之間最短路徑上的原子；連接點不是正好兩個時回傳 null */
function mainChainAtoms(g: MolGraph, dummies: number[]): Set<number> | null {
  if (dummies.length !== 2) return null;
  const [a, b] = dummies.map((d) => g.neighbors[d].find((n) => g.z[n] !== 0));
  if (a === undefined || b === undefined) return null;
  const prev = new Map<number, number>([[a, -1]]);
  const queue = [a];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur === b) break;
    for (const n of g.neighbors[cur]) {
      if (g.z[n] === 0 || prev.has(n)) continue;
      prev.set(n, cur);
      queue.push(n);
    }
  }
  if (!prev.has(b)) return null;
  const path = new Set<number>();
  for (let cur = b; cur !== -1; cur = prev.get(cur) as number) path.add(cur);
  return path;
}

function describeAtom(g: MolGraph, i: number): string {
  const h = g.hCount[i];
  const label = `${symbolOf(g.z[i])}${h > 0 ? `H${h > 1 ? h : ''}` : ''}${g.aromatic[i] ? '（芳香）' : ''}`;
  const near = g.neighbors[i].map((n) => (g.z[n] === 0 ? '*' : `${symbolOf(g.z[n])}${n}`)).join('、');
  return `${label}，鄰居：${near === '' ? '無' : near}`;
}

export function computeTg(RDKit: RDKitModule, smiles: string, options: TgOptions = {}): TgResult {
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
    const dummies = g.z.map((z, i) => (z === 0 ? i : -1)).filter((i) => i >= 0);
    const polymer = dummies.length > 0;
    const families = buildYgFamilies(RDKit, options.rows ?? YG_GROUPS);

    // ---- 切分 ----
    const owner = new Array<number>(n).fill(-1);
    const candidates: Candidate[] = [];
    for (const f of families) {
      const q = mustQuery(RDKit, f.smarts);
      try {
        for (const atoms of allMatches(mol, q)) candidates.push({ family: f, atoms });
      } finally {
        q.delete();
      }
    }
    const hits = choosePartition(options.partition ?? 'greedy', candidates, g, dummies);
    hits.forEach((h, k) => h.atoms.forEach((a) => (owner[a] = k)));

    // 連接點的週期性鄰接：正好兩個連接點時，各自的鄰居互為對面
    const partner = new Map<number, number>();
    if (dummies.length === 2) {
      const [d1, d2] = dummies;
      const a1 = g.neighbors[d1].find((x) => g.z[x] !== 0);
      const a2 = g.neighbors[d2].find((x) => g.z[x] !== 0);
      if (a1 !== undefined && a2 !== undefined) {
        partner.set(d1, a2);
        partner.set(d2, a1);
      }
    }
    const exitsOf = (atoms: number[]): (number | null)[] => {
      const set = new Set(atoms);
      const out: (number | null)[] = [];
      for (const a of atoms) {
        for (const nb of g.neighbors[a]) {
          if (set.has(nb)) continue;
          out.push(g.z[nb] === 0 ? (partner.get(nb) ?? null) : nb);
        }
      }
      return out;
    };
    const stateOf = (sides: number): string => (sides <= 0 ? 'n' : sides === 1 ? 'c' : 'cc');
    const mainChain = mainChainAtoms(g, dummies);
    const hydrogenBonded = hits.some((h) => HYDROGEN_BOND_FAMILIES.includes(h.family.id));

    // ---- 取值（共軛狀態、條件）與缺基團 ----
    const missingIdx = new Set<number>();
    const missingNotes = new Map<number, string>();
    for (let i = 0; i < n; i++) if (g.z[i] > 1 && owner[i] === -1) missingIdx.add(i);
    const resolved: TgGroupHit[] = [];
    hits.forEach((h) => {
      const f = h.family;
      let row: YgGroupRow | undefined;
      let note = '';
      if (f.rows.some((r) => r.state !== '')) {
        const exits = exitsOf(h.atoms);
        let sides: number;
        if (f.section === 'B 芳香環系統') {
          sides = exits.filter((x) => x !== null && owner[x] >= 0 && hits[owner[x]].family.section === 'B 雙鍵系統').length;
        } else {
          sides = exits.filter((x) => x !== null && g.aromatic[x]).length;
        }
        const state = stateOf(sides);
        row = f.rows.find((r) => r.state === state);
        if (!row) note = `${f.name} 在資料表沒有共軛狀態 ${state} 的值`;
        else if (f.section === 'B 芳香環系統' && exits.some((x) => x !== null && owner[x] >= 0 && CONJ_UNDEFINED_FAMILIES.includes(hits[owner[x]].family.id))) {
          // 相鄰的 N-鄰苯二甲醯亞胺（書中標 c）與這個伸苯基的共軛狀態，書中沒有說清楚：不自行決定（任務 031，BPDA–PDA）
          row = undefined;
          note = `${f.name} 與相鄰的 N-鄰苯二甲醯亞胺的共軛狀態，書中沒有說清楚（待使用者決定）`;
        }
      } else if (f.rows.some((r) => r.condition !== '')) {
        let cond: string | null = null;
        if (f.id === 'A.CH2') {
          if (mainChain !== null && !mainChain.has(h.atoms[0])) note = '側鏈 –CH2–（書中要用式 6.6–6.8，程式未實作）';
          else cond = hydrogenBonded ? 'hb' : 'gen';
        } else if (f.id === 'A.C(CH3)2') {
          // 受阻＝夾在兩個芳香環之間取 15，否則取自由值 8.5（書頁 140 6.2.2.4 文字第一個例子；Table 6.1 書頁 133）
          const exits = exitsOf(h.atoms);
          cond = exits.length === 2 && exits.every((x) => x !== null && g.aromatic[x]) ? 'hindered' : 'free';
        } else if (f.id === 'A.Si(CH3)2') {
          // 書中分 free／st. hind. 兩列但沒有定義條件；比照 –C(CH3)2– 的例子（書頁 140）：夾在兩個芳香環之間算受阻（待使用者確認，任務 031）
          const exits = exitsOf(h.atoms);
          cond = exits.length === 2 && exits.every((x) => x !== null && g.aromatic[x]) ? 'hindered' : 'free';
        } else if (f.id === 'B.CH=CH') {
          // cis／trans 由 SMILES 的雙鍵立體標示判定；沒有標示就無法選值
          const key = `${Math.min(h.atoms[0], h.atoms[1])}-${Math.max(h.atoms[0], h.atoms[1])}`;
          const stereo = g.doubleBondStereo.get(key);
          if (stereo === undefined) note = '–CH=CH– 沒有順反標示（書中 cis 3.8、trans 7.4），無法選值';
          else cond = stereo;
        } else note = `${f.name} 沒有條件判定規則`;
        if (cond !== null) {
          row = f.rows.find((r) => r.condition === cond);
          if (!row) note = `${f.name} 在資料表沒有條件 ${cond} 的值`;
        }
      } else row = f.rows[0];
      if (!row) {
        for (const a of h.atoms) {
          missingIdx.add(a);
          missingNotes.set(a, note);
        }
        return;
      }
      resolved.push({
        familyId: f.id,
        rowId: row.id,
        name: row.name,
        kind: row.kind,
        ygi: row.ygi,
        mi: row.mi,
        state: row.state,
        condition: row.condition,
        tentative: row.tentative,
        atoms: h.atoms,
        source: row.source,
      });
    });

    if (missingIdx.size > 0) {
      const missing: MissingAtom[] = [...missingIdx]
        .sort((a, b) => a - b)
        .map((i) => ({
          index: i,
          element: symbolOf(g.z[i]),
          description: missingNotes.get(i) ? `${describeAtom(g, i)}；${missingNotes.get(i)}` : describeAtom(g, i),
        }));
      return { status: 'missing', smiles, polymer, groups: resolved, missing };
    }

    // ---- 計算 ----
    const sumYg = resolved.reduce((s, h) => s + h.ygi, 0);
    const sumM = resolved.reduce((s, h) => s + h.mi, 0);
    let formulaMass: number | null = 0;
    const hw = atomicWeight(1) as number;
    for (let i = 0; i < n; i++) {
      if (g.z[i] === 0) continue;
      const w = atomicWeight(g.z[i]);
      if (w === null) {
        formulaMass = null;
        break;
      }
      formulaMass += w + g.hCount[i] * hw;
    }
    const massDelta = formulaMass === null ? null : sumM - formulaMass;
    const tgK = (1000 * sumYg) / sumM;
    const sources = [...new Set(resolved.map((h) => h.source))];
    return {
      status: 'ok',
      smiles,
      polymer,
      tgK,
      tgC: tgK - 273.15,
      sumYg,
      sumM,
      formulaMass,
      massDelta,
      massWithinTolerance: massDelta === null ? null : Math.abs(massDelta) <= TG_MASS_TOLERANCE,
      groups: resolved,
      sources,
    };
  } finally {
    mol.delete();
  }
}
