// 官能基辨識（任務 016）：以 functional_groups.csv 的 SMARTS 在結構上找位點。
// 位點以 reactive_atom_maps 指定的原子（0 起算索引）代表；相同原子集合只算一個位點
// （例如酚羥基的原文 SMARTS 會因兩個鄰位碳對同一個 OH 匹配兩次，必須去重）。
import type { FunctionalGroupRow } from '../data/types';
import type { JSMol, RDKitModule, SubstructMatch } from '../rdkit/types';
import type { GroupSites } from './types';

/**
 * 讀出 SMARTS 中每個原子的映射編號（依原子在字串中出現的順序，沒有映射為 0）。
 * 只處理最外層的原子：方括號原子（巢狀的遞迴 SMARTS 內部不算）與未加括號的有機子集原子。
 */
export function queryAtomMaps(smarts: string): number[] {
  const maps: number[] = [];
  let i = 0;
  while (i < smarts.length) {
    const ch = smarts[i];
    if (ch === '[') {
      let depth = 1;
      let j = i + 1;
      while (j < smarts.length && depth > 0) {
        if (smarts[j] === '[') depth++;
        else if (smarts[j] === ']') depth--;
        j++;
      }
      const content = smarts.slice(i + 1, j - 1);
      const m = /:(\d+)$/.exec(content);
      maps.push(m ? Number(m[1]) : 0);
      i = j;
    } else if (/[BCNOPSFIcnops*]/.test(ch)) {
      // Cl、Br 是兩個字元的一個原子
      if ((ch === 'C' && smarts[i + 1] === 'l') || (ch === 'B' && smarts[i + 1] === 'r')) i++;
      maps.push(0);
      i++;
    } else {
      i++;
    }
  }
  return maps;
}

function parseQuery(RDKit: RDKitModule, smarts: string): JSMol | null {
  try {
    const q = RDKit.get_qmol(smarts);
    if (q && !q.is_valid()) {
      q.delete();
      return null;
    }
    return q;
  } catch {
    return null;
  }
}

/** 結構中連接點（*，原子序 0）的原子索引 */
function dummyAtoms(mol: JSMol): Set<number> {
  const json = JSON.parse(mol.get_json()) as { molecules: { atoms: { z?: number }[] }[] };
  const result = new Set<number>();
  json.molecules[0].atoms.forEach((a, i) => {
    if (a.z === 0) result.add(i);
  });
  return result;
}

/**
 * 在 mol 上找每個官能基的位點。excludeAttachments 為 true（聚合物的重複單元）時，
 * 排除比對到連接點 * 的匹配。回傳只含有位點的官能基。
 */
export function findGroupSites(
  RDKit: RDKitModule,
  mol: JSMol,
  groups: readonly FunctionalGroupRow[],
  excludeAttachments: boolean,
): GroupSites[] {
  const dummies = excludeAttachments ? dummyAtoms(mol) : new Set<number>();
  const result: GroupSites[] = [];
  for (const group of groups) {
    const query = parseQuery(RDKit, group.smarts);
    if (!query) continue; // SMARTS 無法解析由資料表檢查回報
    try {
      const maps = queryAtomMaps(group.smarts);
      const queryIndexOfMap = group.reactive_atom_maps.map((m) => maps.indexOf(m));
      if (queryIndexOfMap.some((k) => k < 0)) continue; // reactive_atom_maps 與 SMARTS 不符，由資料表檢查回報
      // 沒有匹配時 RDKit 回傳 {}，有匹配時回傳陣列
      const parsed = JSON.parse(mol.get_substruct_matches(query)) as SubstructMatch[] | Record<string, never>;
      const matches = Array.isArray(parsed) ? parsed : [];
      const seen = new Set<string>();
      const sites: number[][] = [];
      for (const match of matches) {
        const atoms = match.atoms ?? [];
        if (atoms.some((a) => dummies.has(a))) continue;
        const site = queryIndexOfMap.map((k) => atoms[k]);
        const key = [...site].sort((x, y) => x - y).join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        sites.push(site);
      }
      if (sites.length > 0) result.push({ groupId: group.id, sites });
    } finally {
      query.delete();
    }
  }
  return result;
}

/** 解析結構文字（SMILES 或 Molfile）；失敗回傳 null */
export function parseStructure(RDKit: RDKitModule, source: string): JSMol | null {
  try {
    const mol = RDKit.get_mol(source);
    if (mol && !mol.is_valid()) {
      mol.delete();
      return null;
    }
    return mol;
  } catch {
    return null;
  }
}
