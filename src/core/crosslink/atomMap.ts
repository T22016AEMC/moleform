// 原子編號對應（P7-1B 修正 2）：Python 引擎只接 SMILES（D03、D04），回傳的反應原子編號依成分的 canonical SMILES 的原子順序；
// 「分子工具」與 3D 畫面的編號依使用者畫的 Molfile（或輸入結構）的原子順序。兩者順序不同時，直接套用會標到錯的原子。
// 這裡以「同一個分子」的圖同構（RDKit 子結構比對，整個分子對整個分子）找出 SMILES 原子 → 顯示結構原子的對應，把引擎的編號換成顯示用編號。
// 反應原子集合是「某官能基的全部位點」，對稱的等價原子互換不改變集合，所以任何一個同構對應都給出同一組標記。
// 只做顯示用的編號轉換，不改規則與計算，也不改第 0 層的輸出格式。
import type { JSMol, RDKitModule, SubstructMatch } from '../rdkit/types';
import { parseStructure } from './groups';

/** from 的原子 i 對應到 to 的哪個原子；兩個結構不是同一個分子（原子數、鍵數不同或比對不到）時回傳 null */
export function atomCorrespondence(RDKit: RDKitModule, fromSource: string, toSource: string): number[] | null {
  const from = parseStructure(RDKit, fromSource);
  const to = parseStructure(RDKit, toSource);
  let query: JSMol | null = null;
  try {
    if (!from || !to) return null;
    const fromCount = (JSON.parse(from.get_json()) as { molecules: { atoms: unknown[]; bonds: unknown[] }[] }).molecules[0];
    const toCount = (JSON.parse(to.get_json()) as { molecules: { atoms: unknown[]; bonds: unknown[] }[] }).molecules[0];
    if (fromCount.atoms.length !== toCount.atoms.length || fromCount.bonds.length !== toCount.bonds.length) return null;
    query = from;
    const match = JSON.parse(to.get_substruct_match(query)) as SubstructMatch;
    const atoms = match.atoms;
    if (!atoms || atoms.length !== fromCount.atoms.length) return null;
    return atoms;
  } catch {
    return null;
  } finally {
    from?.delete();
    to?.delete();
  }
}

/** 把 SMILES 順序的原子編號換成顯示結構的編號（0 起算、排序去重）；對應不到時回傳 null（呼叫端改用 SMILES 結構顯示） */
export function mapAtomsBetween(RDKit: RDKitModule, fromSource: string, toSource: string, atoms: readonly number[]): number[] | null {
  if (fromSource === toSource) return [...new Set(atoms)].sort((a, b) => a - b);
  const map = atomCorrespondence(RDKit, fromSource, toSource);
  if (!map) return null;
  const mapped: number[] = [];
  for (const a of atoms) {
    const target = map[a];
    if (target === undefined) return null;
    mapped.push(target);
  }
  return [...new Set(mapped)].sort((a, b) => a - b);
}
