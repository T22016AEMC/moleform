// 平均分子量（g/mol）：由 RDKit 的 amw 描述子取得，整個結構一起算（多片段視為一個成分）。
// 只用於換算 mol%，不顯示在畫面上（D09）；驗證文件（docs/verification/）可以列出。
import type { RDKitModule } from '../rdkit/types';

/** 無法解析、或沒有有限的正數結果時回傳 null（含 `*` 的結構也會得到數值，但換算核心會另外排除它們） */
export function averageMolecularWeight(RDKit: RDKitModule, smiles: string): number | null {
  let mol;
  try {
    mol = RDKit.get_mol(smiles);
  } catch {
    return null;
  }
  if (!mol) return null;
  try {
    const amw = (JSON.parse(mol.get_descriptors()) as { amw?: number }).amw;
    return typeof amw === 'number' && Number.isFinite(amw) && amw > 0 ? amw : null;
  } catch {
    return null;
  } finally {
    mol.delete();
  }
}
