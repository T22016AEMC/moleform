// 重複單元分析（任務 015）：檢查連接點規則，並計算不含連接點的分子量與分子式。
//
// M_unit 的計算方式：RDKit 的平均分子量（amw）。RDKit 把虛原子 `*` 的質量視為 0，且各原子的氫數
// 照重複單元的原樣計算（連在 `*` 上的碳不會因為 `*` 被移除而多補一個氫），所以結果等於
// 「把 `*` 移除、不補氫」的重複單元平均分子量。分子式同樣是不含 `*`、不補氫的組成。
import type { CommonChemJson } from '../rdkit/types';
import type { RDKitModule } from '../rdkit/types';
import type { RepeatUnitAnalysis, RepeatUnitProblemCode } from './types';

const fail = (code: RepeatUnitProblemCode, message: string): RepeatUnitAnalysis => ({ ok: false, problem: { code, message } });

/** Hill 順序：有碳時 C、H 在前，其餘依字母；沒有碳時全部依字母 */
function hillFormula(counts: Map<string, number>): string {
  const symbols = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  const ordered = counts.has('C') ? ['C', ...(counts.has('H') ? ['H'] : []), ...symbols.filter((s) => s !== 'C' && s !== 'H')] : symbols;
  return ordered.map((s) => `${s}${counts.get(s)! > 1 ? counts.get(s) : ''}`).join('');
}

const ELEMENTS = [
  '', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr',
  'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe',
];

/** 從 V2000 Molfile 讀出每個原子的原子映射編號（沒有為 0） */
function atomMaps(molblock: string, atomCount: number): number[] {
  const lines = molblock.split(/\r?\n/);
  const maps: number[] = [];
  for (let i = 0; i < atomCount; i++) {
    const tokens = (lines[4 + i] ?? '').trim().split(/\s+/);
    // x y z 符號 dd ccc sss hhh bbb vvv HHH rrr iii mmm …
    const value = Number(tokens[13]);
    maps.push(Number.isInteger(value) ? value : 0);
  }
  return maps;
}

export function analyzeRepeatUnit(RDKit: RDKitModule, smiles: string): RepeatUnitAnalysis {
  const text = smiles.trim();
  if (text === '') return fail('UNPARSABLE', '尚未輸入重複單元。');
  let mol;
  try {
    mol = RDKit.get_mol(text);
  } catch {
    mol = null;
  }
  if (!mol) return fail('UNPARSABLE', '無法解析這個重複單元的結構。');
  try {
    const json = JSON.parse(mol.get_json()) as CommonChemJson;
    const molecule = json.molecules[0];
    const atoms = molecule.atoms;
    const dummies = atoms.map((a, i) => (a.z === 0 ? i : -1)).filter((i) => i >= 0);

    if (dummies.length === 0) {
      return fail('NO_ATTACHMENT', '重複單元需要恰好兩個連接點（*），目前沒有連接點。請用 [*:1]、[*:2] 標出鏈的兩端。');
    }
    if (dummies.length === 1) {
      return fail('TOO_FEW_ATTACHMENTS', '重複單元需要恰好兩個連接點（*），目前只有 1 個。');
    }
    if (dummies.length > 2) {
      return fail('TOO_MANY_ATTACHMENTS', `重複單元需要恰好兩個連接點（*），目前有 ${dummies.length} 個。`);
    }

    // 各連接點連到的原子
    const neighbors = new Map<number, number[]>(dummies.map((d) => [d, []]));
    for (const bond of molecule.bonds) {
      const [a, b] = bond.atoms;
      if (neighbors.has(a)) neighbors.get(a)!.push(b);
      if (neighbors.has(b)) neighbors.get(b)!.push(a);
    }
    for (const d of dummies) {
      const n = neighbors.get(d)!;
      if (n.length === 0) return fail('DANGLING_ATTACHMENT', '有連接點（*）沒有連到任何原子。');
      if (n.some((x) => atoms[x].z === 0)) return fail('ATTACHMENT_TO_ATTACHMENT', '兩個連接點（*）不可直接相連。');
    }
    const [first, second] = dummies.map((d) => neighbors.get(d)!);
    if (first.some((x) => second.includes(x))) {
      return fail('SAME_ATOM', '兩個連接點（*）連在同一個原子上，無法形成重複單元。請讓它們連在不同的原子上。');
    }

    // 編號：[*:1]、[*:2]（順序不拘），或兩個都不編號（依出現順序視為 1、2）
    const maps = atomMaps(mol.get_v2Kmolblock(), atoms.length);
    const [m1, m2] = dummies.map((d) => maps[d]);
    let order: [1 | 2, 1 | 2];
    if (m1 === 0 && m2 === 0) order = [1, 2];
    else if (m1 === 1 && m2 === 2) order = [1, 2];
    else if (m1 === 2 && m2 === 1) order = [2, 1];
    else {
      return fail('BAD_NUMBERING', '兩個連接點的編號須為 [*:1] 與 [*:2]，或兩個都不編號；目前的編號不符（例如只編一個、編號重複或不是 1、2）。');
    }

    // 分子式：補上隱含氫後逐原子計數，連接點不計
    const counts = new Map<string, number>();
    const withH = RDKit.get_mol(text);
    try {
      if (!withH) throw new Error('unreachable');
      withH.add_hs_in_place();
      const hJson = JSON.parse(withH.get_json()) as CommonChemJson;
      for (const atom of hJson.molecules[0].atoms) {
        const z = atom.z ?? 6;
        if (z === 0) continue;
        const symbol = ELEMENTS[z] ?? `#${z}`;
        counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
      }
    } finally {
      withH?.delete();
    }

    const amw = (JSON.parse(mol.get_descriptors()) as { amw?: number }).amw;
    if (typeof amw !== 'number' || !Number.isFinite(amw) || amw <= 0) {
      return fail('UNPARSABLE', '無法計算這個重複單元的分子量。');
    }
    return { ok: true, attachmentCount: 2, attachmentOrder: order, mUnit: amw, formula: hillFormula(counts) };
  } finally {
    mol.delete();
  }
}
