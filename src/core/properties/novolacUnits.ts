// 甲酚酚醛重複單元的類別辨識（任務 035，D22）。
// SMARTS 為自行撰寫（找不到已發表的寫法）：依 Lin-Gibson 2001 的鄰甲酚酚醛（2-甲基酚，亞甲基連在 4、6 位）
// 與對甲酚酚醛（4-甲基酚，亞甲基連在 2、6 位）的重複單元結構。命中結果與正反例測試見 tests/properties/novolacUnits.test.ts，
// 化學正確性由使用者審核（D17、D22 第 3 步）。
// 整個單元必須被 SMARTS 完整涵蓋（匹配原子數 = 單元原子數）：多一個取代基、多一個環、多一個原子都不算。
// 單元寫法：一端是 CH2–*、另一端是環上直接連 *（兩種切法都接受）。
import type { RDKitModule } from '../rdkit/types';

export const NOVOLAC_ORTHO_CRESOL = 'novolac_cresol_ortho';
export const NOVOLAC_PARA_CRESOL = 'novolac_cresol_para';

export const CRESOL_NOVOLAC_SMARTS: readonly { resinClass: string; label: string; smarts: string }[] = [
  // 鄰甲酚：OH 在 C1，CH3 在 C2，連接位在 C4、C6（兩種單元切法）
  { resinClass: NOVOLAC_ORTHO_CRESOL, label: '鄰甲酚酚醛（CH2 在 C6）', smarts: '[#0]-[CH2]-c1:[cH]:c(-[#0]):[cH]:c(-[CH3]):c:1-[OH]' },
  { resinClass: NOVOLAC_ORTHO_CRESOL, label: '鄰甲酚酚醛（CH2 在 C4）', smarts: '[#0]-c1:[cH]:c(-[CH2]-[#0]):[cH]:c(-[CH3]):c:1-[OH]' },
  // 對甲酚：OH 在 C1，CH3 在 C4，連接位在 C2、C6（兩個鄰位；對稱，兩種切法等價）
  { resinClass: NOVOLAC_PARA_CRESOL, label: '對甲酚酚醛', smarts: '[#0]-[CH2]-c1:[cH]:c(-[CH3]):[cH]:c(-[#0]):c:1-[OH]' },
];

/** 重複單元（含 * 連接點）是否為鄰／對甲酚酚醛單元；是則回傳類別 id，否則 null */
export function identifyCresolNovolac(RDKit: RDKitModule, unitSmiles: string): string | null {
  let mol;
  try {
    mol = RDKit.get_mol(unitSmiles);
  } catch {
    return null;
  }
  if (!mol) return null;
  try {
    if (!mol.is_valid()) return null;
    const total = mol.get_num_atoms();
    for (const r of CRESOL_NOVOLAC_SMARTS) {
      let q;
      try {
        q = RDKit.get_qmol(r.smarts);
      } catch {
        continue;
      }
      if (!q) continue;
      try {
        if (!q.is_valid()) continue;
        const m = JSON.parse(mol.get_substruct_match(q)) as { atoms?: number[] };
        if (m.atoms && m.atoms.length === total) return r.resinClass;
      } finally {
        q.delete();
      }
    }
    return null;
  } finally {
    mol.delete();
  }
}
