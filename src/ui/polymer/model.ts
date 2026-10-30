// 聚合物設定的編輯狀態（任務 015、019、020）：輸入框保留使用者打的原始文字。
// 分子量：Mw、Mn、DP 擇一，PDI 選填（D47）。共聚物（任務 020）：第一種單元就是成分本身的結構，
// 其他單元放在 extraUnits；沒有 extraUnits 時與均聚物完全相同（畫面與資料都沒有多餘欄位）。
import { MESSAGE_PDI_DEFAULT, MESSAGE_PDI_LEGACY, type PolymerBasis } from '../../core/polymer/convert';
import { END_GROUP_PRESETS } from '../../core/data/endGroups';
import type { BackboneTemplateRow } from '../../core/data/backboneTemplates';
import type { EndGroup, FractionBasis, PolymerSpec, PolymerUnit } from '../../core/polymer/types';

/** 共聚物中第二種以後的單元：SMILES（使用者貼上或由 Ketcher 帶入）與比例的原始文字 */
export interface UnitEdit {
  smiles: string;
  fractionText: string;
}

/** 一端端基的編輯狀態（任務 022）：choice 為 ''（不填）、'custom'（自訂 SMILES）或端基清單的 id（EG01…） */
export interface EndEdit {
  choice: string;
  custom: string;
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
  /** 端基 1、端基 2；省略＝不填（未計入端基） */
  end1?: EndEdit;
  end2?: EndEdit;
}

/** 端基的編輯狀態轉成端基；不填、自訂但空白、清單裡找不到 id 都視為沒填 */
export function endFromEdit(edit: EndEdit | undefined): EndGroup | null {
  if (!edit || edit.choice === '') return null;
  if (edit.choice === 'custom') {
    const smiles = edit.custom.trim();
    return smiles === '' ? null : { smiles };
  }
  const row = END_GROUP_PRESETS.find((p) => p.id === edit.choice);
  return row ? { smiles: row.smiles, presetId: row.id } : null;
}

/** 端基選了 EG10（羥基）時的提示（任務 021，K11）；其他選擇或不填沒有提示。只是提示，不阻擋、不更換 */
export const EG10_HINT = '接在芳香環上的酚羥基請改選 EG11（對位酚）或 EG12（鄰位酚）；EG10 只會被當成一般羥基。';
export const endGroupHint = (edit: EndEdit | undefined): string | null => (edit?.choice === 'EG10' ? EG10_HINT : null);

function endToEdit(end: EndGroup | undefined): EndEdit | undefined {
  if (!end) return undefined;
  const row = end.presetId ? END_GROUP_PRESETS.find((p) => p.id === end.presetId && p.smiles === end.smiles) : undefined;
  return row ? { choice: row.id, custom: '' } : { choice: 'custom', custom: end.smiles };
}

/** 骨架範本選單旁的說明（任務 023，D51） */
export const BACKBONE_TEMPLATE_HINT = '範本只填入結構；分子量（Mw、PDI 等）請依產品資料填寫。';
export const BACKBONE_TEMPLATE_CONFIRM = '會取代目前的單元與端基，確定嗎？';

const endEditOf = (smiles: string, presetId: string): EndEdit => (presetId === '' ? { choice: 'custom', custom: smiles } : { choice: presetId, custom: '' });

/**
 * 選了骨架範本（任務 023，D51）：單元清單換成範本的一種單元（單元結構本身由呼叫端換成 row.unitSmiles），
 * 兩個端基換成範本的端基（有對應 id 選該項，沒有就用自訂 SMILES）。分子量欄位（基準、數值、PDI）不動。
 * 填入後的狀態和使用者自己輸入的完全一樣：共聚物欄位（extraUnits、firstFractionText、fractionBasis）一律移除。
 */
export function applyBackboneTemplate(edit: PolymerEdit, row: Pick<BackboneTemplateRow, 'end1Smiles' | 'end1PresetId' | 'end2Smiles' | 'end2PresetId'>): PolymerEdit {
  const { extraUnits: _extra, firstFractionText: _first, fractionBasis: _basis, ...rest } = edit;
  return { ...rest, end1: endEditOf(row.end1Smiles, row.end1PresetId), end2: endEditOf(row.end2Smiles, row.end2PresetId) };
}

/** 已填任何端基，或有第二種以後的單元：選範本會丟失這些內容（任務 024 後續） */
export const templateHasOtherContent = (edit: PolymerEdit): boolean => endFromEdit(edit.end1) !== null || endFromEdit(edit.end2) !== null || (edit.extraUnits ?? []).length > 0;

/**
 * 選骨架範本時要不要先確認取代（任務 024 後續）：只在會丟失內容時才問，符合任一項：
 *  - 已填任何端基　- 有第二種以後的單元　- 目前第一個單元與範本單元不同（比較正規化 SMILES）
 * 目前沒有結構（firstSmiles 空白）不算「不同」；範本單元無法正規化（templateCanonical 為 null）時保守地詢問。
 * 從空白選範本，或重選同一個範本（且沒有端基與其他單元）不問。
 */
export function templateReplaceNeedsConfirm(edit: PolymerEdit, firstSmiles: string, templateCanonical: string | null): boolean {
  if (templateHasOtherContent(edit)) return true;
  if (firstSmiles.trim() === '') return false;
  return templateCanonical === null || firstSmiles.trim() !== templateCanonical;
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
  const end1 = endFromEdit(edit.end1);
  const end2 = endFromEdit(edit.end2);
  if (end1 || end2) spec.endGroups = { ...(end1 ? { end1 } : {}), ...(end2 ? { end2 } : {}) };
  return spec;
}

/** 用 Ketcher 畫共聚物的單元（任務 021）：畫第二種單元以後的某一列（index 為 extraUnits 的索引），或新增一列 */
export type DrawTarget = { kind: 'edit'; index: number } | { kind: 'new' };

export const sameDrawTarget = (a: DrawTarget | null, b: DrawTarget | null) =>
  a !== null && b !== null && a.kind === b.kind && (a.kind === 'new' || (b.kind === 'edit' && a.index === b.index));

/**
 * 要求畫某個單元時該怎麼做（任務 021 後續）：Ketcher 裡的未套用內容不得悄悄丟失。
 *  - 沒有在畫、原本的結構畫布有尚未驗證的筆畫 → 先確認（借用後只會還原成最近一次驗證過的結構）
 *  - 已在畫、有未套用的修改、要換成別的單元 → 先確認
 *  - 其餘直接進行，不多問
 */
export type DrawRequestDecision = 'open' | 'confirm-borrow' | 'confirm-switch' | 'keep';
export function decideDrawRequest(current: { target: DrawTarget | null; dirty: boolean }, mainUnverified: boolean, next: DrawTarget): DrawRequestDecision {
  if (current.target === null) return mainUnverified ? 'confirm-borrow' : 'open';
  if (sameDrawTarget(current.target, next)) return 'keep';
  return current.dirty ? 'confirm-switch' : 'open';
}

/** 離開「分子工具」分頁時，單元繪圖有未套用的修改 → 需要確認；沒有則直接收掉單元繪圖 */
export const tabLeaveNeedsConfirm = (currentTab: string, nextTab: string, drawing: { target: DrawTarget | null; dirty: boolean }): boolean =>
  currentTab === 'tools' && nextTab !== 'tools' && drawing.target !== null && drawing.dirty;

/** 單元序號（從 1 起算；第一種單元是成分本身的結構，所以可畫的單元從 2 起） */
export const drawTargetNumber = (target: DrawTarget, edit: PolymerEdit): number => (target.kind === 'new' ? (edit.extraUnits ?? []).length + 2 : target.index + 2);

/** 該列目前的 SMILES（新增時為空） */
export const drawTargetSmiles = (target: DrawTarget, edit: PolymerEdit): string => (target.kind === 'new' ? '' : (edit.extraUnits ?? [])[target.index]?.smiles ?? '');

/** 把畫好的單元寫回編輯狀態：改指定列的 SMILES（比例不動），或新增一列（比例空白） */
export function applyDrawnUnit(edit: PolymerEdit, target: DrawTarget, smiles: string): PolymerEdit {
  const extras = edit.extraUnits ?? [];
  if (target.kind === 'new') return { ...edit, extraUnits: [...extras, { smiles, fractionText: '' }] };
  return { ...edit, extraUnits: extras.map((u, i) => (i === target.index ? { ...u, smiles } : u)) };
}

/** 分析結果的快取鍵：共聚物的單元或比例改變時要重新分析（均聚物只看 SMILES） */
export function analysisKey(smiles: string, spec: Pick<PolymerSpec, 'units' | 'fractionBasis' | 'endGroups'> | null | undefined): string {
  if (!spec?.units && !spec?.endGroups) return smiles;
  return JSON.stringify([smiles, spec.units ?? null, spec.fractionBasis ?? 'mol', spec.endGroups ?? null]);
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
  const kind = (unitCount(spec) > 1 ? `共聚物 ${unitCount(spec)} 種單元，` : '') + (spec.endGroups ? '含端基，' : '');
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
  const e1 = endToEdit(spec.endGroups?.end1);
  const e2 = endToEdit(spec.endGroups?.end2);
  if (e1) edit.end1 = e1;
  if (e2) edit.end2 = e2;
  return edit;
}
