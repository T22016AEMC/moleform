// 均聚物設定的編輯狀態（任務 015、019）：輸入框保留使用者打的原始文字，Mw、Mn、DP 擇一，PDI 選填（D47）。
import { MESSAGE_PDI_DEFAULT, MESSAGE_PDI_LEGACY, type PolymerBasis } from '../../core/polymer/convert';
import type { PolymerSpec } from '../../core/polymer/types';

export interface PolymerEdit {
  basis: PolymerBasis;
  text: string;
  /** PDI 的原始文字；空白＝使用預設 PDI = 2 */
  pdiText: string;
}

export const emptyPolymerEdit = (): PolymerEdit => ({ basis: 'mw', text: '', pdiText: '' });

/**
 * 文字是大於 0 的有限數字才轉成設定；空白或無效回傳 null。
 * PDI 空白視為沒填；PDI 不是數字回傳 null；PDI < 1 照樣帶入，由計算端指出錯誤。
 */
export function specFromEdit(edit: PolymerEdit): PolymerSpec | null {
  const trimmed = edit.text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  const spec: PolymerSpec = edit.basis === 'mw' ? { mwInput: value } : edit.basis === 'mn' ? { mnInput: value } : { dpInput: value };
  const pdiTrimmed = edit.pdiText.trim();
  if (pdiTrimmed !== '') {
    const pdi = Number(pdiTrimmed);
    if (!Number.isFinite(pdi)) return null;
    spec.pdiInput = pdi;
  }
  return spec;
}

/** 已儲存的聚合物設定的簡短說明（使用者自己輸入的值）；沒填 PDI 的 Mn 或 DP 標示 PDI 使用預設值 */
export function polymerLabel(spec: PolymerSpec): string {
  const main =
    spec.mwInput !== undefined
      ? `Mw ${spec.mwInput.toLocaleString('en-US')} g/mol`
      : spec.mnInput !== undefined
        ? `Mn ${spec.mnInput.toLocaleString('en-US')} g/mol`
        : `DP ${spec.dpInput}`;
  if (spec.pdiInput !== undefined) return `${main}，PDI ${spec.pdiInput}`;
  return spec.mwInput !== undefined ? `${main}，${MESSAGE_PDI_DEFAULT}` : `${main}（${MESSAGE_PDI_LEGACY}）`;
}

export function editFromSpec(spec: PolymerSpec | undefined): PolymerEdit {
  const pdiText = spec?.pdiInput !== undefined ? String(spec.pdiInput) : '';
  if (spec?.mwInput !== undefined) return { basis: 'mw', text: String(spec.mwInput), pdiText };
  if (spec?.mnInput !== undefined) return { basis: 'mn', text: String(spec.mnInput), pdiText };
  if (spec?.dpInput !== undefined) return { basis: 'dp', text: String(spec.dpInput), pdiText };
  return emptyPolymerEdit();
}
