// Mn 與 DP 的換算（任務 015）：DP = Mn / M_unit、Mn = DP × M_unit。端基忽略（Phase 5 才處理），
// 所以換算結果都要附註「未計入端基」（END_GROUP_NOTE）。
import { END_GROUP_NOTE, type PolymerSpec } from './types';

const isPositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

export const dpFromMn = (mn: number, mUnit: number): number => mn / mUnit;
export const mnFromDp = (dp: number, mUnit: number): number => dp * mUnit;

export type PolymerBasis = 'mn' | 'dp';

export type ResolvedPolymer =
  | {
      ok: true;
      /** 使用者填的是哪一個 */
      basis: PolymerBasis;
      /** 每條鏈的 Mn（g/mol）。只供計算，不顯示在結果區（D09） */
      mn: number;
      /** 聚合度 */
      dp: number;
      /** 換算附註：未計入端基 */
      note: string;
    }
  | { ok: false; error: string };

/** 由使用者輸入的 Mn 或 DP（擇一）與 M_unit 求出另一個值 */
export function resolvePolymer(spec: PolymerSpec, mUnit: number): ResolvedPolymer {
  const hasMn = spec.mnInput !== undefined && !Number.isNaN(spec.mnInput);
  const hasDp = spec.dpInput !== undefined && !Number.isNaN(spec.dpInput);
  if (hasMn && hasDp) return { ok: false, error: 'Mn 與 DP 請擇一填寫。' };
  if (!hasMn && !hasDp) return { ok: false, error: '請輸入 Mn 或 DP。' };
  if (!isPositive(mUnit)) return { ok: false, error: '重複單元的分子量無法計算。' };
  if (hasMn) {
    if (!isPositive(spec.mnInput)) return { ok: false, error: 'Mn 必須是大於 0 的數字。' };
    return { ok: true, basis: 'mn', mn: spec.mnInput, dp: dpFromMn(spec.mnInput, mUnit), note: END_GROUP_NOTE };
  }
  if (!isPositive(spec.dpInput)) return { ok: false, error: 'DP 必須是大於 0 的數字。' };
  return { ok: true, basis: 'dp', mn: mnFromDp(spec.dpInput, mUnit), dp: spec.dpInput, note: END_GROUP_NOTE };
}

/** 驗證從檔案讀回的聚合物設定；格式不對回傳錯誤，沒有問題回傳整理後的設定 */
export function parsePolymerSpec(value: unknown): { ok: true; spec: PolymerSpec } | { ok: false; reason: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: '聚合物設定格式錯誤' };
  const { mnInput, dpInput } = value as Record<string, unknown>;
  const mn = mnInput === undefined || mnInput === null ? undefined : mnInput;
  const dp = dpInput === undefined || dpInput === null ? undefined : dpInput;
  if ((mn !== undefined && !isPositive(mn)) || (dp !== undefined && !isPositive(dp))) {
    return { ok: false, reason: 'Mn 或 DP 必須是大於 0 的數字' };
  }
  if (mn !== undefined && dp !== undefined) return { ok: false, reason: 'Mn 與 DP 只能填一個' };
  if (mn === undefined && dp === undefined) return { ok: false, reason: '聚合物缺少 Mn 或 DP' };
  return { ok: true, spec: mn !== undefined ? { mnInput: mn as number } : { dpInput: dp as number } };
}
