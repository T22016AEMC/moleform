// 聚合物設定的編輯狀態（任務 015、019、020）：輸入框保留使用者打的原始文字。
// 分子量：Mw、Mn、DP 擇一，PDI 選填（D47）。共聚物（任務 020）：第一種單元就是成分本身的結構，
// 其他單元放在 extraUnits；沒有 extraUnits 時與均聚物完全相同（畫面與資料都沒有多餘欄位）。
import { MESSAGE_PDI_DEFAULT, MESSAGE_PDI_LEGACY, type PolymerBasis } from '../../core/polymer/convert';
import type { FractionBasis, PolymerSpec, PolymerUnit } from '../../core/polymer/types';

/** 共聚物中第二種以後的單元：SMILES（使用者貼上或由 Ketcher 帶入）與比例的原始文字 */
export interface UnitEdit {
  smiles: string;
  fractionText: string;
}

export interface PolymerEdit {
  basis: PolymerBasis;
  text: string;
  /** PDI 的原始文字；空白＝使用預設 PDI = 2 */
  pdiText: string;
  /** 共聚物的比例基準；省略視為 mol */
  fractionBasis?: FractionBasis;
  /** 第一種單元（成分本身的結構）的比例文字；只有共聚物才會用到 */
  firstFractionText?: string;
  /** 第二種以後的單元；省略或空陣列＝均聚物 */
  extraUnits?: UnitEdit[];
}

export const emptyPolymerEdit = (): PolymerEdit => ({ basis: 'mw', text: '', pdiText: '' });

const positive = (text: string): number | null => {
  const t = text.trim();
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? v : null;
};

/**
 * 文字是大於 0 的有限數字才轉成設定；空白或無效回傳 null。
 * PDI 空白視為沒填；PDI 不是數字回傳 null；PDI < 1 照樣帶入，由計算端指出錯誤。
 * 共聚物（有 extraUnits）需要 firstSmiles（成分本身的結構）；單元的 SMILES 或比例未填好時回傳 null。
 */
export function specFromEdit(edit: PolymerEdit, firstSmiles?: string): PolymerSpec | null {
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
  const extras = edit.extraUnits ?? [];
  if (extras.length > 0) {
    if (!firstSmiles) return null;
    const first = positive(edit.firstFractionText ?? '');
    if (first === null) return null;
    const units: PolymerUnit[] = [{ smiles: firstSmiles, fraction: first }];
    for (const u of extras) {
      const fraction = positive(u.fractionText);
      const smiles = u.smiles.trim();
      if (fraction === null || smiles === '' || !smiles.includes('*')) return null;
      units.push({ smiles, fraction });
    }
    spec.units = units;
    spec.fractionBasis = edit.fractionBasis ?? 'mol';
  }
  return spec;
}

/** 分析結果的快取鍵：共聚物的單元或比例改變時要重新分析（均聚物只看 SMILES） */
export function analysisKey(smiles: string, spec: Pick<PolymerSpec, 'units' | 'fractionBasis'> | null | undefined): string {
  return spec?.units ? JSON.stringify([smiles, spec.units, spec.fractionBasis ?? 'mol']) : smiles;
}

const unitCount = (spec: PolymerSpec) => (spec.units && spec.units.length > 1 ? spec.units.length : 1);

/** 已儲存的聚合物設定的簡短說明（使用者自己輸入的值）；沒填 PDI 的 Mn 或 DP 標示 PDI 使用預設值 */
export function polymerLabel(spec: PolymerSpec): string {
  const main =
    spec.mwInput !== undefined
      ? `Mw ${spec.mwInput.toLocaleString('en-US')} g/mol`
      : spec.mnInput !== undefined
        ? `Mn ${spec.mnInput.toLocaleString('en-US')} g/mol`
        : `DP ${spec.dpInput}`;
  const kind = unitCount(spec) > 1 ? `共聚物 ${unitCount(spec)} 種單元，` : '';
  if (spec.pdiInput !== undefined) return `${kind}${main}，PDI ${spec.pdiInput}`;
  return spec.mwInput !== undefined ? `${kind}${main}，${MESSAGE_PDI_DEFAULT}` : `${kind}${main}（${MESSAGE_PDI_LEGACY}）`;
}

export function editFromSpec(spec: PolymerSpec | undefined): PolymerEdit {
  const pdiText = spec?.pdiInput !== undefined ? String(spec.pdiInput) : '';
  let edit: PolymerEdit;
  if (spec?.mwInput !== undefined) edit = { basis: 'mw', text: String(spec.mwInput), pdiText };
  else if (spec?.mnInput !== undefined) edit = { basis: 'mn', text: String(spec.mnInput), pdiText };
  else if (spec?.dpInput !== undefined) edit = { basis: 'dp', text: String(spec.dpInput), pdiText };
  else return emptyPolymerEdit();
  if (spec.units && spec.units.length > 1) {
    const [first, ...rest] = spec.units;
    edit.fractionBasis = spec.fractionBasis ?? 'mol';
    edit.firstFractionText = String(first.fraction);
    edit.extraUnits = rest.map((u) => ({ smiles: u.smiles, fractionText: String(u.fraction) }));
  }
  return edit;
}
