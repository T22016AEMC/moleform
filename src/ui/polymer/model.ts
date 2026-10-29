// 均聚物設定的編輯狀態（任務 015）：輸入框保留使用者打的原始文字，Mn 與 DP 擇一。
import type { PolymerBasis } from '../../core/polymer/convert';
import type { PolymerSpec } from '../../core/polymer/types';

export interface PolymerEdit {
  basis: PolymerBasis;
  text: string;
}

export const emptyPolymerEdit = (): PolymerEdit => ({ basis: 'mn', text: '' });

/** 文字是大於 0 的有限數字才轉成設定；空白或無效回傳 null */
export function specFromEdit(edit: PolymerEdit): PolymerSpec | null {
  const trimmed = edit.text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return edit.basis === 'mn' ? { mnInput: value } : { dpInput: value };
}

export function editFromSpec(spec: PolymerSpec | undefined): PolymerEdit {
  if (spec?.mnInput !== undefined) return { basis: 'mn', text: String(spec.mnInput) };
  if (spec?.dpInput !== undefined) return { basis: 'dp', text: String(spec.dpInput) };
  return emptyPolymerEdit();
}
