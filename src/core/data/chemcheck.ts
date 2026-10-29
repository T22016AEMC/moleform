// 需要 RDKit 的資料檢查（D22 第 2 步）：確認 SMARTS 能解析、測試分子的命中／不命中、反應測試組合。
// 只確認「程式照規則運作」，不判斷化學正確性（D17）。
import type { JSMol, RDKitModule } from '../rdkit/types';
import { splitPair } from './validate';
import type { DataIssue, FunctionalGroupRow, ReactionRuleRow, TableResult } from './types';

function parseSmiles(RDKit: RDKitModule, smiles: string): JSMol | null {
  const mol = RDKit.get_mol(smiles);
  if (mol && !mol.is_valid()) {
    mol.delete();
    return null;
  }
  return mol;
}

function parseQuery(RDKit: RDKitModule, smarts: string): JSMol | null {
  let q: JSMol | null = null;
  try {
    q = RDKit.get_qmol(smarts);
  } catch {
    q = null;
  }
  if (q && !q.is_valid()) {
    q.delete();
    return null;
  }
  return q;
}

function hasMatch(mol: JSMol, query: JSMol): boolean {
  const m = JSON.parse(mol.get_substruct_match(query)) as { atoms?: number[] };
  return (m.atoms?.length ?? 0) > 0;
}

export function checkFunctionalGroupSmarts(
  RDKit: RDKitModule,
  t: TableResult<FunctionalGroupRow>,
  file = 'functional_groups.csv',
): DataIssue[] {
  const issues: DataIssue[] = [];
  t.rows.forEach((r, i) => {
    const row = t.rowNumbers[i];
    const add = (column: string, message: string) => issues.push({ file, row, column, message });
    if (r.smarts === '') return; // 必填錯誤由 validate 回報
    const query = parseQuery(RDKit, r.smarts);
    if (!query) {
      add('smarts', `RDKit 無法解析 SMARTS：「${r.smarts}」`);
      return;
    }
    try {
      for (const [col, expectMatch] of [
        ['should_match', true],
        ['should_not_match', false],
      ] as const) {
        for (const smi of r[col]) {
          const mol = parseSmiles(RDKit, smi);
          if (!mol) {
            add(col, `測試分子 SMILES 無法解析：「${smi}」`);
            continue;
          }
          try {
            if (hasMatch(mol, query) !== expectMatch) {
              add(col, expectMatch ? `應命中但沒有命中：「${smi}」` : `不應命中卻命中了：「${smi}」`);
            }
          } finally {
            mol.delete();
          }
        }
      }
    } finally {
      query.delete();
    }
  });
  return issues;
}

type Rxn = NonNullable<ReturnType<RDKitModule['get_rxn']>>;

/** 以 RDKit run_reactants 嘗試兩種順序（A,B）與（B,A），任一種有產物就算會反應。 */
function reacts(RDKit: RDKitModule, rxn: Rxn, a: JSMol, b: JSMol): boolean {
  for (const order of [
    [a, b],
    [b, a],
  ]) {
    const list = new RDKit.MolList();
    try {
      order.forEach((m) => list.append(m));
      const products = rxn.run_reactants(list, 1);
      try {
        if (products.size() > 0) return true;
      } finally {
        products.delete();
      }
    } catch {
      // 反應物數量與模板不符等情況視為「沒有反應」
    } finally {
      list.delete();
    }
  }
  return false;
}

export function checkReactionSmarts(
  RDKit: RDKitModule,
  t: TableResult<ReactionRuleRow>,
  file = 'reaction_rules.csv',
): DataIssue[] {
  const issues: DataIssue[] = [];
  t.rows.forEach((r, i) => {
    const row = t.rowNumbers[i];
    const add = (column: string, message: string) => issues.push({ file, row, column, message });
    if (r.reaction_smarts === '') return;
    let rxn: Rxn | null = null;
    try {
      rxn = RDKit.get_rxn(r.reaction_smarts);
    } catch {
      rxn = null;
    }
    if (!rxn) {
      add('reaction_smarts', `RDKit 無法解析為反應 SMARTS：「${r.reaction_smarts}」`);
      return;
    }
    try {
      for (const [col, expectReact] of [
        ['should_react', true],
        ['should_not_react', false],
      ] as const) {
        for (const pair of r[col]) {
          const parts = splitPair(pair);
          if (!parts) continue; // 格式錯誤由 validate 回報
          const mols = parts.map((s) => parseSmiles(RDKit, s));
          try {
            const bad = parts.filter((_, k) => mols[k] === null);
            if (bad.length > 0) {
              add(col, `測試分子 SMILES 無法解析：「${bad.join('」、「')}」`);
              continue;
            }
            const did = reacts(RDKit, rxn, mols[0]!, mols[1]!);
            if (did !== expectReact) {
              add(col, expectReact ? `應反應但沒有產物：「${pair}」` : `不應反應卻有產物：「${pair}」`);
            }
          } finally {
            mols.forEach((m) => m?.delete());
          }
        }
      }
    } finally {
      rxn.delete();
    }
  });
  return issues;
}
