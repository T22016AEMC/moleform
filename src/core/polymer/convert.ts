// Mw／Mn／DP 與 PDI 的換算（任務 015、019，D47）：Mn = Mw ÷ PDI；DP_n = Mn ÷ M_unit；DP_w = Mw ÷ M_unit。
// 端基忽略（Phase 5 才處理），所以換算結果都要附註「未計入端基」（END_GROUP_NOTE）。
import { DEFAULT_PDI, END_GROUP_NOTE, type PolymerSpec } from './types';

const isPositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isPdi = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 1;

export const dpFromMn = (mn: number, mUnit: number): number => mn / mUnit;
export const mnFromDp = (dp: number, mUnit: number): number => dp * mUnit;

export const MESSAGE_PDI_RANGE = 'PDI 必須是大於或等於 1 的數字。';
export const MESSAGE_PDI_DEFAULT = '使用預設 PDI = 2';
export const MESSAGE_PDI_LEGACY = '舊資料：PDI 使用預設值 2';

export type PolymerBasis = 'mw' | 'mn' | 'dp';

export type ResolvedPolymer =
  | {
      ok: true;
      /** 使用者填的是哪一個 */
      basis: PolymerBasis;
      /** 重量平均分子量（g/mol）。只供計算，不顯示在結果區（D09） */
      mw: number;
      /** 每條鏈的 Mn（g/mol）。只供計算，不顯示在結果區（D09） */
      mn: number;
      /** 數量平均聚合度 DP_n */
      dp: number;
      /** 重量平均聚合度 DP_w */
      dpW: number;
      /** 實際用於計算的 PDI */
      pdi: number;
      /** 使用者沒填 PDI，用了預設值 2 */
      pdiIsDefault: boolean;
      /** 舊資料（只有 Mn 或 DP、沒有 PDI）；畫面標示「舊資料：PDI 使用預設值 2」 */
      legacy: boolean;
      /** 換算附註：未計入端基 */
      note: string;
    }
  | { ok: false; error: string };

/** 由使用者輸入的 Mw、Mn 或 DP（擇一）、選填的 PDI 與 M_unit 求出其他值 */
export function resolvePolymer(spec: PolymerSpec, mUnit: number): ResolvedPolymer {
  const given = (v: number | undefined) => v !== undefined && !Number.isNaN(v);
  const hasMw = given(spec.mwInput);
  const hasMn = given(spec.mnInput);
  const hasDp = given(spec.dpInput);
  const count = [hasMw, hasMn, hasDp].filter(Boolean).length;
  if (count > 1) return { ok: false, error: 'Mw、Mn、DP 請擇一填寫。' };
  if (count === 0) return { ok: false, error: '請輸入 Mw（或改填 Mn、DP）。' };
  if (!isPositive(mUnit)) return { ok: false, error: '重複單元的分子量無法計算。' };
  const hasPdi = given(spec.pdiInput);
  if (hasPdi && !isPdi(spec.pdiInput)) return { ok: false, error: MESSAGE_PDI_RANGE };
  const pdi = hasPdi ? (spec.pdiInput as number) : DEFAULT_PDI;

  let basis: PolymerBasis;
  let mw: number;
  let mn: number;
  if (hasMw) {
    if (!isPositive(spec.mwInput)) return { ok: false, error: 'Mw 必須是大於 0 的數字。' };
    basis = 'mw';
    mw = spec.mwInput;
    mn = mw / pdi;
  } else if (hasMn) {
    if (!isPositive(spec.mnInput)) return { ok: false, error: 'Mn 必須是大於 0 的數字。' };
    basis = 'mn';
    mn = spec.mnInput;
    mw = mn * pdi;
  } else {
    if (!isPositive(spec.dpInput)) return { ok: false, error: 'DP 必須是大於 0 的數字。' };
    basis = 'dp';
    mn = mnFromDp(spec.dpInput, mUnit);
    mw = mn * pdi;
  }
  return {
    ok: true,
    basis,
    mw,
    mn,
    dp: dpFromMn(mn, mUnit),
    dpW: dpFromMn(mw, mUnit),
    pdi,
    pdiIsDefault: !hasPdi,
    legacy: !hasPdi && basis !== 'mw',
    note: END_GROUP_NOTE,
  };
}

/** 驗證從檔案讀回的聚合物設定；格式不對回傳錯誤，沒有問題回傳整理後的設定。舊檔（只有 mnInput 或 dpInput）可直接讀入 */
export function parsePolymerSpec(value: unknown): { ok: true; spec: PolymerSpec } | { ok: false; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: '聚合物設定格式錯誤' };
  const { mwInput, mnInput, dpInput, pdiInput } = value as Record<string, unknown>;
  const norm = (v: unknown) => (v === undefined || v === null ? undefined : v);
  const mw = norm(mwInput);
  const mn = norm(mnInput);
  const dp = norm(dpInput);
  const pdi = norm(pdiInput);
  if ((mw !== undefined && !isPositive(mw)) || (mn !== undefined && !isPositive(mn)) || (dp !== undefined && !isPositive(dp))) {
    return { ok: false, reason: 'Mw、Mn 或 DP 必須是大於 0 的數字' };
  }
  if (pdi !== undefined && !isPdi(pdi)) return { ok: false, reason: 'PDI 必須是大於或等於 1 的數字' };
  const count = [mw, mn, dp].filter((v) => v !== undefined).length;
  if (count > 1) return { ok: false, reason: 'Mw、Mn、DP 只能填一個' };
  if (count === 0) return { ok: false, reason: '聚合物缺少 Mw、Mn 或 DP' };
  const spec: PolymerSpec = mw !== undefined ? { mwInput: mw as number } : mn !== undefined ? { mnInput: mn as number } : { dpInput: dp as number };
  if (pdi !== undefined) spec.pdiInput = pdi as number;
  return { ok: true, spec };
}
