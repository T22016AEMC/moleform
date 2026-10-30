// TPSA（拓撲極性表面積）與 Crippen LogP（任務 028）：直接呼叫專案已有的 RDKit.js 描述子，不自行實作。
//  - TPSA：RDKit 的 `tpsa`，方法為 Ertl, Rohde & Selzer, J. Med. Chem. 43, 3714–3717 (2000)，單位 Å²。
//    RDKit 的預設只計入 N、O 的極性片段（不含 S、P，tests/properties/tpsaLogp.test.ts 有驗證）。
//  - Crippen LogP：RDKit 的 `CrippenClogP`，方法為 Wildman & Crippen, J. Chem. Inf. Comput. Sci. 39, 868–873 (1999)，無單位。
// 小分子直接計算。含連接點（`*`）的聚合物重複單元：把連接點換成甲基再計算（與 D05 的單元片段相同，使用者 2026-10-31 決定，
// 直接用 capRepeatUnit），結果標示「以甲基封端的單元估算；LogP 僅供相對比較」。
// 兩者的貢獻值與手算對照見 tests/properties/tpsaLogp.test.ts 與 docs/reports/028-結果.md。
import { capRepeatUnit } from '../polymer/unitFragment';
import type { JSMol, RDKitModule } from '../rdkit/types';

export const TPSA_MODEL = 'Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717';
export const LOGP_MODEL = 'Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873';
export const TPSA_LOGP_DISCLAIMER = 'TPSA 與 Crippen LogP 為依結構估算的經驗值，非實測；原為小分子方法。';
export const CAPPED_NOTE = '以甲基封端的單元估算；LogP 僅供相對比較';

export type TpsaLogpResult =
  | {
      status: 'ok';
      smiles: string;
      /** Å² */
      tpsa: number;
      /** 無單位 */
      logP: number;
      /** 含 `*` 的聚合物單元：連接點已換成甲基 */
      capped: boolean;
      /** 實際計算的 SMILES（封端後；小分子與 smiles 相同） */
      computedSmiles: string;
      /** 封端時的標示（CAPPED_NOTE）；小分子為 null */
      note: string | null;
      models: { tpsa: string; logP: string };
    }
  | { status: 'invalid'; smiles: string; message: string };

export function computeTpsaLogp(RDKit: RDKitModule, smiles: string): TpsaLogpResult {
  if (smiles.trim() === '') return { status: 'invalid', smiles, message: '沒有結構（SMILES 是空的）' };
  let computed = smiles;
  let capped = false;
  if (smiles.includes('*')) {
    // 只有連接點（沒有任何原子）的字串不是單元，不能封端成甲烷
    if (smiles.replace(/\[\*(?::\d+)?\]|\*/g, '').replace(/[^A-Za-z]/g, '') === '') return { status: 'invalid', smiles, message: '只有連接點（*），沒有原子' };
    const c = capRepeatUnit(RDKit, smiles);
    if (!c.ok) return { status: 'invalid', smiles, message: c.message };
    computed = c.fragment.smiles;
    capped = true;
  }
  let mol: JSMol | null = null;
  try {
    mol = RDKit.get_mol(computed);
  } catch {
    mol = null;
  }
  if (!mol || !mol.is_valid()) {
    mol?.delete();
    return { status: 'invalid', smiles, message: 'RDKit 無法解析這個 SMILES' };
  }
  try {
    if (computed.includes('.')) return { status: 'invalid', smiles, message: '含多個分子（以 . 分隔）；TPSA 與 LogP 一次只算一個分子' };
    const d = JSON.parse(mol.get_descriptors()) as Record<string, number | undefined>;
    const tpsa = d.tpsa;
    const logP = d.CrippenClogP;
    if (typeof tpsa !== 'number' || typeof logP !== 'number') {
      return { status: 'invalid', smiles, message: '目前的 RDKit 沒有提供 tpsa 或 CrippenClogP 描述子' };
    }
    return { status: 'ok', smiles, tpsa, logP, capped, computedSmiles: computed, note: capped ? CAPPED_NOTE : null, models: { tpsa: TPSA_MODEL, logP: LOGP_MODEL } };
  } finally {
    mol.delete();
  }
}
