// 配方的序列化與讀回（任務 013；任務 014 的存檔會用到）。含 schemaVersion，不認得的版本拒絕讀取。
import { parsePolymerSpec } from '../polymer/convert';
import { FORMULATION_SCHEMA_VERSION, isValidDensity, isValidPackingK, isValidTgC, type Component, type Formulation, type ReferencePolymer } from './types';

/** NaN 無法存成 JSON（會變成 null），讀回時再還原為 NaN，讓計算時指出「數值無效」 */
export function serializeFormulation(formulation: Formulation): string {
  return JSON.stringify(formulation, null, 2);
}

export type ParseResult = { ok: true; formulation: Formulation } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** 參考聚合物 A（任務 P8-3）：全部欄位都空時回傳 null；格式錯誤回傳錯誤說明 */
function parseReferencePolymer(value: unknown): ReferencePolymer | null | string {
  if (!isRecord(value)) return '格式錯誤';
  const ref: ReferencePolymer = {};
  if (typeof value.name === 'string' && value.name !== '') ref.name = value.name;
  if (typeof value.smiles === 'string' && value.smiles !== '') ref.smiles = value.smiles;
  if (value.tgC != null) {
    if (!isValidTgC(value.tgC)) return '的 Tg 必須是高於絕對零度的數字（°C）';
    ref.tgC = value.tgC;
  }
  if (value.packingK != null) {
    if (!isValidPackingK(value.packingK)) return '的堆積係數 k 必須在 0 與 1 之間';
    ref.packingK = value.packingK;
  }
  return Object.keys(ref).length > 0 ? ref : null;
}

function parseComponent(value: unknown, where: string): Component | string {
  if (!isRecord(value)) return `${where}不是成分資料`;
  const { id, name, canonicalSmiles, category, amount, isResin, volatileFlag, compoundId, molfile } = value;
  if (typeof id !== 'string' || id === '') return `${where}缺少 id`;
  if (typeof name !== 'string') return `${where}缺少名稱`;
  if (typeof canonicalSmiles !== 'string') return `${where}缺少 SMILES`;
  if (typeof category !== 'string') return `${where}缺少分類`;
  if (amount !== null && typeof amount !== 'number') return `${where}的數值格式錯誤`;
  const component: Component = { id, name, canonicalSmiles, category, amount: amount === null ? Number.NaN : amount };
  if (typeof isResin === 'boolean') component.isResin = isResin;
  if (typeof volatileFlag === 'boolean') component.volatileFlag = volatileFlag;
  if (typeof compoundId === 'string') component.compoundId = compoundId;
  if (typeof molfile === 'string') component.molfile = molfile;
  // 密度與來源（P7-4a）：選填；舊檔沒有，視為空。密度必須是正的有限數，否則拒絕讀取
  if (value.density != null) {
    if (!isValidDensity(value.density)) return `${where}的密度必須是大於 0 的有限數字`;
    component.density = value.density;
  }
  if (typeof value.densitySource === 'string' && value.densitySource !== '') component.densitySource = value.densitySource;
  // 堆積係數 k 與參考聚合物 A（任務 P8-3）：選填；舊檔沒有，視為空。數值不合法就拒絕讀取
  if (value.packingK != null) {
    if (!isValidPackingK(value.packingK)) return `${where}的堆積係數 k 必須在 0 與 1 之間`;
    component.packingK = value.packingK;
  }
  if (value.referencePolymer != null) {
    const ref = parseReferencePolymer(value.referencePolymer);
    if (typeof ref === 'string') return `${where}的參考聚合物 A ${ref}`;
    if (ref) component.referencePolymer = ref;
  }
  if (value.polymer != null) {
    const parsed = parsePolymerSpec(value.polymer);
    if (!parsed.ok) return `${where}的${parsed.reason}`;
    component.polymer = parsed.spec;
  }
  return component;
}

function parseArea<U extends string>(value: unknown, where: string): { unit: U; components: Component[] } | string {
  if (!isRecord(value)) return `${where}格式錯誤`;
  if (typeof value.unit !== 'string') return `${where}缺少單位`;
  if (!Array.isArray(value.components)) return `${where}缺少成分清單`;
  const components: Component[] = [];
  for (let i = 0; i < value.components.length; i++) {
    const parsed = parseComponent(value.components[i], `${where}第 ${i + 1} 項`);
    if (typeof parsed === 'string') return parsed;
    components.push(parsed);
  }
  return { unit: value.unit as U, components };
}

function optionalNumber(value: unknown): number | undefined | 'invalid' {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'number' ? value : 'invalid';
}

export function parseFormulation(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: '這不是有效的 JSON 檔案' };
  }
  return parseFormulationData(data);
}

/** 檢查已解析的 JSON 資料（配方庫匯入時，每個配方用這個檢查） */
export function parseFormulationData(data: unknown): ParseResult {
  if (!isRecord(data)) return { ok: false, error: '檔案格式不是 MoleForm 的配方' };
  if (data.schemaVersion !== FORMULATION_SCHEMA_VERSION) {
    return { ok: false, error: `不認得的資料版本（schemaVersion），本程式只支援版本 ${FORMULATION_SCHEMA_VERSION}` };
  }
  if (typeof data.name !== 'string') return { ok: false, error: '配方缺少名稱' };
  const solid = parseArea<Formulation['solid']['unit']>(data.solid, 'Solid 區');
  if (typeof solid === 'string') return { ok: false, error: solid };
  const liquid = parseArea<Formulation['liquid']['unit']>(data.liquid, 'Liquid 區');
  if (typeof liquid === 'string') return { ok: false, error: liquid };

  const solidTotalG = optionalNumber(data.solidTotalG);
  const liquidTotalG = optionalNumber(data.liquidTotalG);
  const target = optionalNumber(data.targetSolidContentPct);
  if (solidTotalG === 'invalid' || liquidTotalG === 'invalid' || target === 'invalid') {
    return { ok: false, error: '總重或目標 Solid Content 的格式錯誤' };
  }

  // 分類字串在計算時才檢查（可顯示明確的中文錯誤），這裡不限制
  const formulation: Formulation = {
    schemaVersion: FORMULATION_SCHEMA_VERSION,
    name: data.name,
    solid: solid as Formulation['solid'],
    liquid: liquid as Formulation['liquid'],
  };
  if (solidTotalG !== undefined) formulation.solidTotalG = solidTotalG;
  if (liquidTotalG !== undefined) formulation.liquidTotalG = liquidTotalG;
  if (target !== undefined) formulation.targetSolidContentPct = target;
  // 聚合物 mol% 基準（D46）；舊檔沒有這個欄位，視為整條鏈
  if (data.polymerMolBasis === 'chain' || data.polymerMolBasis === 'unit') formulation.polymerMolBasis = data.polymerMolBasis;
  // 是否使用目標固含量自動計算 Liquid 用量；舊檔沒有這個欄位，照原本規則讀取
  if (data.targetSolidContentBasis === 'all' || data.targetSolidContentBasis === 'excludingVolatile') formulation.targetSolidContentBasis = data.targetSolidContentBasis;
  if (typeof data.liquidFromTarget === 'boolean') formulation.liquidFromTarget = data.liquidFromTarget;
  return { ok: true, formulation };
}
