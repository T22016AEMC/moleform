// TPSA（拓撲極性表面積）與 Crippen LogP（任務 028）：直接呼叫專案已有的 RDKit.js 描述子，不自行實作。
//  - TPSA：RDKit 的 `tpsa`，方法為 Ertl, Rohde & Selzer, J. Med. Chem. 43, 3714–3717 (2000)，單位 Å²。
//    RDKit 的預設只計入 N、O 的極性片段（不含 S、P，tests/properties/tpsaLogp.test.ts 有驗證）。
//  - Crippen LogP：RDKit 的 `CrippenClogP`，方法為 Wildman & Crippen, J. Chem. Inf. Comput. Sci. 39, 868–873 (1999)，無單位。
// 只對小分子計算。含連接點（`*`）的聚合物重複單元回傳「不適用」，不自行補封端原子（是否補、補什麼待使用者決定）。
// 兩者的貢獻值與手算對照見 tests/properties/tpsaLogp.test.ts 與 docs/reports/028-結果.md。
import type { JSMol, RDKitModule } from '../rdkit/types';
import { readGraph } from './molGraph';

export const TPSA_MODEL = 'Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717';
export const LOGP_MODEL = 'Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873';
export const TPSA_LOGP_DISCLAIMER = 'TPSA 與 Crippen LogP 為依小分子結構估算的經驗值，非實測；僅用於小分子。';
export const POLYMER_NOT_APPLICABLE = '不適用（聚合物單元）：TPSA 與 Crippen LogP 只用於小分子，含連接點（*）的結構不計算，也不自行補封端原子';

export type TpsaLogpResult =
  | {
      status: 'ok';
      smiles: string;
      /** Å² */
      tpsa: number;
      /** 無單位 */
      logP: number;
      models: { tpsa: string; logP: string };
    }
  | { status: 'not-applicable'; smiles: string; reason: string }
  | { status: 'invalid'; smiles: string; message: string };

export function computeTpsaLogp(RDKit: RDKitModule, smiles: string): TpsaLogpResult {
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
    if (readGraph(mol).z.some((z) => z === 0)) return { status: 'not-applicable', smiles, reason: POLYMER_NOT_APPLICABLE };
    if (smiles.includes('.')) return { status: 'invalid', smiles, message: '含多個分子（以 . 分隔）；TPSA 與 LogP 一次只算一個分子' };
    const d = JSON.parse(mol.get_descriptors()) as Record<string, number | undefined>;
    const tpsa = d.tpsa;
    const logP = d.CrippenClogP;
    if (typeof tpsa !== 'number' || typeof logP !== 'number') {
      return { status: 'invalid', smiles, message: '目前的 RDKit 沒有提供 tpsa 或 CrippenClogP 描述子' };
    }
    return { status: 'ok', smiles, tpsa, logP, models: { tpsa: TPSA_MODEL, logP: LOGP_MODEL } };
  } finally {
    mol.delete();
  }
}
