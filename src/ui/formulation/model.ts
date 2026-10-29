// 配方畫面的編輯狀態與 Formulation 之間的轉換（任務 014）。數值輸入框保留使用者打的原始文字。
import { newId } from '../../core/library/library';
import type { Component, Formulation, LiquidCategory, LiquidUnit, SolidCategory, SolidUnit } from '../../core/formulation/types';

/** amountTouched：使用者輸入過或離開過用量欄位（只在畫面使用，不存進配方）；在那之前空白用量不顯示錯誤 */
export type Row = Omit<Component, 'amount'> & { amountText: string; amountTouched?: boolean };

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

function toComponent(row: Row): Component {
  const { amountText, amountTouched: _touched, ...rest } = row;
  return { ...rest, amount: parseNumberText(amountText) };
}

export function toFormulation(state: EditorState): Formulation {
  const f: Formulation = {
    schemaVersion: 1,
    name: state.name,
    solid: { unit: state.solidUnit, components: state.solidRows.map(toComponent) as Formulation['solid']['components'] },
    liquid: { unit: state.liquidUnit, components: state.liquidRows.map(toComponent) as Formulation['liquid']['components'] },
  };
  const solidTotal = optional(state.solidTotalText);
  const liquidTotal = optional(state.liquidTotalText);
  const target = optional(state.targetText);
  if (solidTotal !== undefined) f.solidTotalG = solidTotal;
  if (liquidTotal !== undefined) f.liquidTotalG = liquidTotal;
  if (target !== undefined) f.targetSolidContentPct = target;
  return f;
}

const textOf = (value: number | undefined) => (value === undefined || Number.isNaN(value) ? '' : String(value));

function toRow(component: Component): Row {
  const { amount, ...rest } = component;
  return { ...rest, amountText: textOf(amount) };
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
  };
}

export function newRow(
  area: 'solid' | 'liquid',
  input: { name: string; canonicalSmiles: string; molfile?: string; compoundId?: string },
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
