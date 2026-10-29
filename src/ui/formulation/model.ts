// 配方畫面的編輯狀態與 Formulation 之間的轉換（任務 014）。數值輸入框保留使用者打的原始文字。
import { newId } from '../../core/library/library';
import type { PolymerSpec } from '../../core/polymer/types';
import { editFromSpec, specFromEdit, type PolymerEdit } from '../polymer/model';
import type { Component, Formulation, LiquidCategory, LiquidUnit, PolymerMolBasis, SolidCategory, SolidUnit } from '../../core/formulation/types';

/** amountTouched：使用者輸入過或離開過用量欄位（只在畫面使用，不存進配方）；在那之前空白用量不顯示錯誤 */
export type Row = Omit<Component, 'amount' | 'polymer'> & {
  amountText: string;
  amountTouched?: boolean;
  /** 聚合物的 Mw／Mn／DP 與 PDI 輸入（含 `*` 的成分才會用到）；存檔時轉成 Component.polymer */
  polymerEdit?: PolymerEdit;
};

/** 尚未填用量（空白且還沒輸入過、沒離開過欄位）的成分編號 */
export function pendingAmountIds(rows: readonly Row[]): Set<string> {
  return new Set(rows.filter((r) => r.amountText.trim() === '' && !r.amountTouched).map((r) => r.id));
}

/** 濾掉「尚未填用量」成分的數值錯誤（其他錯誤照常顯示） */
export function visibleIssues<T extends { code: string; componentId?: string }>(issues: readonly T[], pending: ReadonlySet<string>): T[] {
  return issues.filter((i) => !(i.code === 'INVALID_AMOUNT' && i.componentId !== undefined && pending.has(i.componentId)));
}

export interface EditorState {
  name: string;
  solidUnit: SolidUnit;
  liquidUnit: LiquidUnit;
  solidRows: Row[];
  liquidRows: Row[];
  solidTotalText: string;
  liquidTotalText: string;
  targetText: string;
  /** 聚合物 mol% 的基準（D46）：整條鏈（預設）或重複單元 */
  polymerMolBasis: PolymerMolBasis;
}

export const emptyState = (): EditorState => ({
  name: '',
  solidUnit: 'g',
  liquidUnit: 'g',
  solidRows: [],
  liquidRows: [],
  solidTotalText: '',
  liquidTotalText: '',
  targetText: '',
  polymerMolBasis: 'chain',
});

/** 空白或無法解析的文字變成 NaN，由換算核心指出「數值無效」 */
export function parseNumberText(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return Number.NaN;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** 選填欄位：空白＝沒有填；填了但不是數字＝NaN（核心會報錯） */
const optional = (text: string): number | undefined => (text.trim() === '' ? undefined : parseNumberText(text));

/** 使用目標固含量時，Liquid 用量改由程式計算；欄位只填溶劑間的相對比例，空白視為 1 */
export const targetActive = (state: Pick<EditorState, 'targetText'>) => state.targetText.trim() !== '';

function toComponent(row: Row, blankAmount?: number): Component {
  const { amountText, amountTouched: _touched, polymerEdit, ...rest } = row;
  const polymer = polymerEdit && rest.canonicalSmiles.includes('*') ? specFromEdit(polymerEdit, rest.canonicalSmiles) : null;
  const amount = blankAmount !== undefined && amountText.trim() === '' ? blankAmount : parseNumberText(amountText);
  return { ...rest, amount, ...(polymer ? { polymer } : {}) };
}

export function toFormulation(state: EditorState): Formulation {
  const f: Formulation = {
    schemaVersion: 1,
    name: state.name,
    solid: { unit: state.solidUnit, components: state.solidRows.map((r) => toComponent(r)) as Formulation['solid']['components'] },
    liquid: { unit: state.liquidUnit, components: state.liquidRows.map((r) => toComponent(r, targetActive(state) ? 1 : undefined)) as Formulation['liquid']['components'] },
  };
  const solidTotal = optional(state.solidTotalText);
  const liquidTotal = optional(state.liquidTotalText);
  const target = optional(state.targetText);
  if (solidTotal !== undefined) f.solidTotalG = solidTotal;
  if (liquidTotal !== undefined) f.liquidTotalG = liquidTotal;
  if (target !== undefined) f.targetSolidContentPct = target;
  if (targetActive(state)) f.liquidFromTarget = true; // 記錄使用目標固含量；清空目標就回到手動輸入
  if (state.polymerMolBasis === 'unit') f.polymerMolBasis = 'unit'; // 預設（整條鏈）不寫入，舊檔與新檔一致
  return f;
}

const textOf = (value: number | undefined) => (value === undefined || Number.isNaN(value) ? '' : String(value));

function toRow(component: Component): Row {
  const { amount, polymer, ...rest } = component;
  return { ...rest, amountText: textOf(amount), ...(polymer ? { polymerEdit: editFromSpec(polymer) } : {}) };
}

export function fromFormulation(f: Formulation): EditorState {
  return {
    name: f.name,
    solidUnit: f.solid.unit,
    liquidUnit: f.liquid.unit,
    solidRows: f.solid.components.map(toRow),
    liquidRows: f.liquid.components.map(toRow),
    solidTotalText: textOf(f.solidTotalG),
    liquidTotalText: textOf(f.liquidTotalG),
    targetText: textOf(f.targetSolidContentPct),
    polymerMolBasis: f.polymerMolBasis ?? 'chain',
  };
}

export function newRow(
  area: 'solid' | 'liquid',
  input: { name: string; canonicalSmiles: string; molfile?: string; compoundId?: string; polymer?: PolymerSpec },
): Row {
  const category: SolidCategory | LiquidCategory = area === 'solid' ? 'Small Molecule' : 'Solvent';
  return {
    id: newId(),
    name: input.name,
    canonicalSmiles: input.canonicalSmiles,
    category,
    amountText: '',
    ...(area === 'solid' ? { isResin: false, volatileFlag: false } : {}),
    ...(input.molfile ? { molfile: input.molfile } : {}),
    ...(input.compoundId ? { compoundId: input.compoundId } : {}),
    // 含連接點的成分都附 Mw／Mn／DP 與 PDI 輸入欄（來自化合物庫或「分子工具」分頁時帶入已填的值）
    ...(input.canonicalSmiles.includes('*') ? { polymerEdit: editFromSpec(input.polymer) } : {}),
  };
}

export const SOLID_UNIT_OPTIONS: { value: SolidUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'parts', label: '重量份' },
  { value: 'wt', label: 'wt%' },
  { value: 'mol', label: 'mol%' },
  { value: 'phr', label: 'phr' },
];
export const LIQUID_UNIT_OPTIONS: { value: LiquidUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'parts', label: '重量份' },
  { value: 'wt', label: 'wt%' },
  { value: 'mol', label: 'mol%' },
  { value: 'vol', label: 'vol%' },
];

/** 輸入框內的單位標示 */
export const UNIT_SUFFIX: Record<string, string> = { g: 'g', parts: '份', wt: 'wt%', mol: 'mol%', phr: 'phr', vol: 'vol%' };
