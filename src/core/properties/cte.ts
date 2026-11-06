// 聚合物（重複單元）的熱膨脹係數 CTE（任務 036；D08、D53；D02：不使用實驗值當輸入）。
// 依 van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009)，第 4 章 4.4 節「熱膨脹」（書頁 89–101）：
//  - 定義（書頁 89，式 4.9）：莫耳膨脹率 E = ∂V/∂T（cm³/mol/K）；比膨脹率 e = E/M（cm³/g/K）；體膨脹係數 α = E/V（K⁻¹）；線膨脹係數 β，α = 3β。
//  - 書中估算法（MTE 模型，書頁 91、95）：E_l（= E_r，液態／橡膠態）= 1.00 × 10⁻³·VW（式 4.17）；E_g（= E_c，玻璃態／結晶態）= 0.45 × 10⁻³·VW（式 4.18）。
//    輸入只有 VW（任務 028／031 的基團加成）；不需要實驗值。書中說明這兩個係數是圖 4.3 上兩條直線的平均值，
//    Table 4.12 的平均偏差 E_l 8%、E_g 12%（實驗數據本身約 ±5%，書頁 94）。
//  - 體膨脹係數：α = E/V。書頁 99（式 4.11a 的推導）用 V_r(298) = 1.60·VW（式 4.24 ＝ 式 4.8a）得 α_l(298) = 6.25 × 10⁻⁴ K⁻¹，
//    用 V_g(298) ≈ 1.6·VW（式 4.8b）得 α_g(298) = 2.81 × 10⁻⁴ K⁻¹。
//    書頁 95–96 另給 V_g(298) = [1.43 + 0.55 × 10⁻³·Tg]·VW（式 4.27），書頁 96 說明式 4.8b「偏低」；兩種 α_g 都輸出，不替使用者選。
//    式 4.27 需要 Tg（任務 026／033 的基團加成，可能含校準基團）；缺 Tg 時只有 4.8b 版本。
//  - 線膨脹係數 β = α/3（式 4.9 的 α = 3β，等向性假設）。
//  - Simha–Boyer、Boyer–Spencer、Bondi、Tobolsky–Bueche 等經驗規則（Table 4.11，書頁 90）：書中明文「不得互相代入推新式」（書頁 90），本程式不使用。
//  - 自由體積分率：書中沒有由結構計算的方法（見報告 036），本程式不輸出。
// 只對聚合物單元（含連接點 *）計算；不含連接點的小分子回傳「不適用（小分子，D56）」。
// 切分規則沿用 VW（任務 028）與 Tg（任務 026）：基團原子數由大到小、每個重原子恰好屬於一個基團、重疊優先順序為現行規則（M26 未決，不得改動）；
// 配不到的原子回報「缺基團」，不用相近基團或記憶中的數值代用。
import type { RDKitModule } from '../rdkit/types';
import { computeTg } from './tgGroupContribution';
import { computeVdwVolume, type VwMissingAtom } from './vanDerWaalsVolume';

export const CTE_MODEL =
  'van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 4.4 節 MTE 模型：E_l = 1.00×10⁻³·VW（式 4.17，書頁 91）、E_g = 0.45×10⁻³·VW（式 4.18）；α = E/V（式 4.9，書頁 89）；V_r(298) = 1.60·VW（式 4.24）、V_g(298) = [1.43 + 0.55×10⁻³·Tg]·VW（式 4.27，書頁 95）；β = α/3（式 4.9）';
export const CTE_DISCLAIMER = '基團加成估算，非實測；CTE 隨溫度與固化度變化。書中平均偏差：E_l 8%、E_g 12%（Table 4.12，書頁 94）；實驗數據本身約 ±5%。';
export const CTE_SMALL_MOLECULE = '不適用（小分子，D56）';

/** 書中係數（式 4.17、4.18、4.24、4.8b、4.27）；值來自書頁 91、95、96、87 看圖讀取 */
export const CTE_COEFFICIENTS = {
  /** 式 4.17：E_l / VW（cm³/mol/K 每 cm³/mol） */
  el: 1.0e-3,
  /** 式 4.18：E_g / VW */
  eg: 0.45e-3,
  /** 式 4.24（＝式 4.8a）：V_r(298) / VW */
  vr298: 1.6,
  /** 式 4.8b：V_g(298) / VW（書頁 96 說明比式 4.27 偏低） */
  vg298Simple: 1.6,
  /** 式 4.27：V_g(298) / VW = 1.43 + 0.55e-3·Tg */
  vg298Base: 1.43,
  vg298PerTg: 0.55e-3,
} as const;

export interface CteInput {
  /** VW（cm³/mol，任務 028／031） */
  vw: number;
  /** 結構單元質量（g/mol），只用於比膨脹率 e，不顯示在網站（D09） */
  mass: number | null;
}

export interface CteValues {
  /** 莫耳膨脹率 E（cm³/mol/K） */
  molar: number;
  /** 比膨脹率 e = E/M（cm³/g/K）；缺質量時 null */
  specific: number | null;
  /** 體膨脹係數 α（K⁻¹） */
  alpha: number;
  /** 線膨脹係數 β = α/3（K⁻¹） */
  beta: number;
}

/** 玻璃態 α_g 的第二種算法（式 4.27，需 Tg） */
export type CteGlassTg =
  | { status: 'ok'; tgK: number; containsCalibrated: boolean; vg298: number; alpha: number; beta: number; note: string | null }
  | { status: 'missing'; message: string };

export type CteResult =
  | {
      status: 'ok';
      smiles: string;
      polymer: true;
      vw: number;
      /** 橡膠態（液態）：E_l，α_l = E_l / V_r(298) */
      rubbery: CteValues;
      /** 玻璃態：E_g，α_g = E_g / V_g(298)，V_g(298) ≈ 1.6·VW（式 4.8b，不需 Tg） */
      glassy: CteValues;
      /** 玻璃態 α_g 的第二種算法：V_g(298) = [1.43 + 0.55e-3·Tg]·VW（式 4.27） */
      glassyFromTg: CteGlassTg;
      sources: string[];
      model: string;
    }
  | { status: 'notApplicable'; smiles: string; message: string }
  | { status: 'missing'; smiles: string; missingInput: 'VW'; message: string; missing: VwMissingAtom[] }
  | { status: 'invalid'; smiles: string; message: string };

const valuesOf = (molar: number, volume: number, mass: number | null): CteValues => {
  const alpha = molar / volume;
  return { molar, specific: mass === null ? null : molar / mass, alpha, beta: alpha / 3 };
};

/** 純計算（輸入為已知 VW、質量；單元測試用，與書中 Table 4.12 的手算對照） */
export function cteFromVw(input: CteInput): { rubbery: CteValues; glassy: CteValues } {
  const { vw, mass } = input;
  return {
    rubbery: valuesOf(CTE_COEFFICIENTS.el * vw, CTE_COEFFICIENTS.vr298 * vw, mass),
    glassy: valuesOf(CTE_COEFFICIENTS.eg * vw, CTE_COEFFICIENTS.vg298Simple * vw, mass),
  };
}

/** 式 4.27：V_g(298) = [1.43 + 0.55e-3·Tg]·VW，α_g = E_g / V_g(298) */
export function glassAlphaFromTg(vw: number, tgK: number): { vg298: number; alpha: number; beta: number } {
  const vg298 = (CTE_COEFFICIENTS.vg298Base + CTE_COEFFICIENTS.vg298PerTg * tgK) * vw;
  const alpha = (CTE_COEFFICIENTS.eg * vw) / vg298;
  return { vg298, alpha, beta: alpha / 3 };
}

export function computeCte(RDKit: RDKitModule, smiles: string): CteResult {
  const vwr = computeVdwVolume(RDKit, smiles);
  if (vwr.status === 'invalid') return vwr;
  if (!vwr.polymer) return { status: 'notApplicable', smiles, message: CTE_SMALL_MOLECULE };
  if (vwr.status === 'missing') {
    return { status: 'missing', smiles, missingInput: 'VW', message: '缺 VW：Table 4.2 缺基團，不計算、不猜值', missing: vwr.missing };
  }
  const mass = vwr.formulaMass;
  const { rubbery, glassy } = cteFromVw({ vw: vwr.vw, mass });
  const tg = computeTg(RDKit, smiles);
  let glassyFromTg: CteGlassTg;
  if (tg.status === 'ok') {
    const g = glassAlphaFromTg(vwr.vw, tg.tgK);
    glassyFromTg = {
      status: 'ok',
      tgK: tg.tgK,
      containsCalibrated: tg.containsCalibrated,
      ...g,
      note: tg.tgK < 298 ? 'Tg 低於 298 K：298 K 時聚合物已是橡膠態，式 4.27 的 V_g(298) 是外推值；書中沒有說明此情形' : null,
    };
  } else {
    glassyFromTg = { status: 'missing', message: tg.status === 'missing' ? '缺 Tg：Table 6.1 缺基團（含校準基團仍配不完），式 4.27 不計算' : `缺 Tg：${tg.message}` };
  }
  return { status: 'ok', smiles, polymer: true, vw: vwr.vw, rubbery, glassy, glassyFromTg, sources: vwr.sources, model: CTE_MODEL };
}
