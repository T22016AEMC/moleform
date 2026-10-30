// 配方換算核心（任務 013，Phase 3.2–3.5）：g、重量份、wt%、mol%、phr，總重與 Solid Content。
// 規則見 docs/spec.md「換算規則（D36、D37）」。純計算：分子量由呼叫端傳入，核心不呼叫 RDKit；
// 分子量只用於計算，不出現在任何結果中（D09）。計算結果的模型名稱「配方換算」，可信度「直接計算」。
import type { CalcResult } from '../result';
import {
  LIQUID_CATEGORIES,
  SOLID_CATEGORIES,
  type AreaName,
  type AreaResult,
  POLYMER_MOL_NOTE,
  type Component,
  type ComponentResult,
  type ComputeOptions,
  type Formulation,
  type FormulationIssue,
  type FormulationOutcome,
  type IssueCode,
  type MolecularWeights,
  type OverallResult,
  type PolymerMolBasis,
  type TargetSolidContentResult,
} from './types';

export const FORMULATION_MODEL_NAME = '配方換算';
/** wt%、mol%、phr 合計與 100 的容差 */
export const SUM_TOLERANCE = 0.01;
const EPSILON = 1e-9;

export const MESSAGE_VOL_NOT_SUPPORTED = 'vol% 需要溶劑密度，將於 Phase 8 提供';
export const MESSAGE_POLYMER_NO_MW = '聚合物缺少分子量（需填 Mw、Mn 或 DP），無法以 mol% 換算';
export const MESSAGE_SOLID_CONTENT_NEEDS_TOTAL = '無法計算 Solid Content，請補填 Solid 總重／Liquid 總重';

function calc(value: number | null, unit: string, notApplicable?: string): CalcResult {
  return {
    value,
    unit,
    modelName: FORMULATION_MODEL_NAME,
    confidence: 'direct',
    sources: [],
    ...(notApplicable ? { notApplicable } : {}),
  };
}

const num = (value: number) => String(Number(value.toFixed(6)));
const isValidNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
// 含 `*` 的成分是聚合物：mol% 依基準換算（D46）——整條鏈用 Mn（molecularWeights），重複單元用 M_unit（options.unitWeights）。
const hasPolymerMark = (smiles: string) => smiles.includes('*');
const areaLabel = (area: AreaName) => (area === 'solid' ? 'Solid 區' : 'Liquid 區');
const labelOf = (c: Component, index: number) => c.name.trim() || `第 ${index + 1} 項`;

interface AreaState {
  /** 可以算出各成分結果 */
  ok: boolean;
  empty: boolean;
  unit: string;
  comps: Component[];
  rel: number[];
  totalRel: number;
  /** 該區質量（g）；未知為 null */
  mass: number | null;
  result: AreaResult | null;
}

interface DerivedLiquid {
  unit: string;
  basisNote: string;
  amounts: Record<string, number>;
}

interface Sink {
  errors: FormulationIssue[];
  warnings: FormulationIssue[];
}

function failedState(unit: string, comps: Component[]): AreaState {
  return { ok: false, empty: comps.length === 0, unit, comps, rel: [], totalRel: 0, mass: null, result: null };
}

/** Liquid 用量為 0（目標剛好等於最大可達值）：各成分質量 0，mol% 不適用 */
function zeroLiquidState(comps: Component[], unit: string): AreaState {
  const na = '用量為 0，無法換算';
  const result: AreaResult = {
    unit: 'g',
    polymerMolNote: null,
    components: comps.map((c) => ({
      id: c.id,
      name: c.name,
      massG: calc(0, unit),
      wtPct: calc(null, '%', na),
      molPct: calc(null, '%', na),
      phr: null,
    })),
  };
  return { ok: true, empty: false, unit: 'g', comps, rel: comps.map(() => 0), totalRel: 0, mass: 0, result };
}

function processArea(
  area: AreaName,
  unit: string,
  comps: Component[],
  rawTotalG: number | undefined,
  mw: MolecularWeights,
  basis: PolymerMolBasis,
  unitWeights: MolecularWeights,
  sink: Sink,
): AreaState {
  const label = areaLabel(area);
  const issue = (list: FormulationIssue[], code: IssueCode, message: string, componentId?: string) =>
    list.push({ area, code, message, ...(componentId ? { componentId } : {}) });
  const error = (code: IssueCode, message: string, componentId?: string) => issue(sink.errors, code, message, componentId);
  const warn = (code: IssueCode, message: string, componentId?: string) => issue(sink.warnings, code, message, componentId);
  const errorsBefore = sink.errors.length;

  // 單位是否能用在這一區
  if (area === 'liquid' && unit === 'phr') {
    error('PHR_IN_LIQUID', 'phr 只能用於 Solid 區');
    return failedState(unit, comps);
  }
  if (area === 'solid' && unit === 'vol') {
    error('VOL_IN_SOLID', 'vol% 只能用於 Liquid 區');
    return failedState(unit, comps);
  }
  if (area === 'liquid' && unit === 'vol') {
    error('VOL_NOT_SUPPORTED', MESSAGE_VOL_NOT_SUPPORTED);
    return failedState(unit, comps);
  }
  const allowed = area === 'solid' ? ['g', 'parts', 'wt', 'mol', 'phr'] : ['g', 'parts', 'wt', 'mol', 'vol'];
  if (!allowed.includes(unit)) {
    error('INVALID_UNIT', `${label}的單位「${unit}」無法辨識`);
    return failedState(unit, comps);
  }

  // 總重
  let totalG: number | undefined;
  if (rawTotalG !== undefined) {
    if (isValidNumber(rawTotalG) && rawTotalG > 0) totalG = rawTotalG;
    else error('INVALID_TOTAL', `${label}總重必須是大於 0 的數字`);
  }

  if (comps.length === 0) {
    if (rawTotalG !== undefined) error('EMPTY_AREA_WITH_SETTINGS', `${label}沒有任何成分，但填了總重；請先加入成分或清除總重`);
    if (sink.errors.length > errorsBefore) return failedState(unit, comps);
    return { ok: true, empty: true, unit, comps, rel: [], totalRel: 0, mass: 0, result: { unit, components: [], polymerMolNote: null } };
  }

  // 成分基本檢查
  const categories: readonly string[] = area === 'solid' ? SOLID_CATEGORIES : LIQUID_CATEGORIES;
  const seen = new Set<string>();
  comps.forEach((c, i) => {
    if (seen.has(c.id)) error('DUPLICATE_ID', `${label}有重複的成分編號：${c.id}`, c.id);
    seen.add(c.id);
    if (!categories.includes(c.category)) error('INVALID_CATEGORY', `${label}的「${labelOf(c, i)}」分類「${c.category}」不屬於這一區`, c.id);
    if (!isValidNumber(c.amount)) error('INVALID_AMOUNT', `${label}的「${labelOf(c, i)}」數值不是有效的數字`, c.id);
    else if (c.amount < 0) error('INVALID_AMOUNT', `${label}的「${labelOf(c, i)}」數值不可為負（${num(c.amount)}）`, c.id);
  });

  const usableMw = (c: Component): number | null => {
    const value = hasPolymerMark(c.canonicalSmiles) && basis === 'unit' ? unitWeights[c.id] : mw[c.id];
    return isValidNumber(value) && value > 0 ? value : null;
  };

  // 單位別的檢查
  if (unit === 'wt' || unit === 'mol') {
    const sum = comps.reduce((s, c) => s + (isValidNumber(c.amount) ? c.amount : 0), 0);
    if (Math.abs(sum - 100) > SUM_TOLERANCE + EPSILON && comps.every((c) => isValidNumber(c.amount) && c.amount >= 0)) {
      error('SUM_NOT_100', `${label}的 ${unit === 'wt' ? 'wt%' : 'mol%'} 合計為 ${num(sum)}，應為 100（容差 ±0.01）`);
    }
  }
  if (unit === 'phr') {
    const resins = comps.filter((c) => c.isResin);
    if (resins.length === 0) {
      error('NO_RESIN', `${label}使用 phr，但沒有勾選任何樹脂成分；請勾選作為基準的樹脂`);
    } else if (resins.every((c) => isValidNumber(c.amount) && c.amount >= 0)) {
      const sum = resins.reduce((s, c) => s + c.amount, 0);
      if (Math.abs(sum - 100) > SUM_TOLERANCE + EPSILON) {
        error('SUM_NOT_100', `${label}勾選的樹脂 phr 合計為 ${num(sum)}，應為 100（容差 ±0.01）`);
      }
    }
  }
  if (unit === 'mol') {
    comps.forEach((c, i) => {
      if (usableMw(c) === null) {
        const text = hasPolymerMark(c.canonicalSmiles) ? MESSAGE_POLYMER_NO_MW : '缺少分子量，無法以 mol% 換算';
        error('MISSING_MW', `${label}的「${labelOf(c, i)}」${text}`, c.id);
      }
    });
  }

  if (sink.errors.length > errorsBefore) return failedState(unit, comps);

  // 相對質量：mol% 以「莫耳數 × 分子量」換成質量比，其餘單位的數值本身就是質量比
  const rel = comps.map((c) => (unit === 'mol' ? c.amount * (usableMw(c) as number) : c.amount));
  const totalRel = rel.reduce((s, r) => s + r, 0);
  if (!(totalRel > 0)) {
    error('ZERO_TOTAL', `${label}的數值合計為 0，無法換算`);
    return failedState(unit, comps);
  }

  let mass: number | null = null;
  if (unit === 'g') {
    mass = totalRel;
    if (totalG !== undefined && Math.abs(totalG - totalRel) > SUM_TOLERANCE) {
      warn('TOTAL_IGNORED', `${label}單位是 g，總重以各成分相加（${num(totalRel)} g）為準，忽略填寫的 ${num(totalG)} g`);
    }
  } else if (totalG !== undefined) {
    mass = totalG;
  }

  // mol%：只要有任何成分無法換算（缺分子量；含連接點的聚合物缺 Mw、Mn、DP 也算），整區都不輸出 mol%（任務 014），不使用部分基準
  const moles = comps.map((c, i) => {
    const m = usableMw(c);
    return m === null ? null : rel[i] / m;
  });
  const blockedIndex = moles.findIndex((m) => m === null);
  let molBlockedMessage: string | null = null;
  if (blockedIndex >= 0) {
    const blocked = comps[blockedIndex];
    const reason = hasPolymerMark(blocked.canonicalSmiles) ? '聚合物缺少分子量（需填 Mw、Mn 或 DP）' : '缺少分子量';
    molBlockedMessage = `${labelOf(blocked, blockedIndex)} 無法換算 mol%（${reason}），本區不提供 mol% 以免數值不完整`;
    warn('MOL_UNAVAILABLE', `${label}：${molBlockedMessage}`, blocked.id);
  }
  const molTotal = moles.reduce<number>((s, m) => s + (m ?? 0), 0);

  const resinRel = area === 'solid' ? comps.reduce((s, c, i) => s + (c.isResin ? rel[i] : 0), 0) : 0;

  const components: ComponentResult[] = comps.map((c, i) => {
    const molPct =
      molBlockedMessage !== null
        ? calc(null, '%', molBlockedMessage)
        : calc(molTotal > 0 ? ((moles[i] as number) / molTotal) * 100 : null, '%');
    return {
      id: c.id,
      name: c.name,
      massG: mass === null ? null : calc((rel[i] / totalRel) * mass, 'g'),
      wtPct: calc((rel[i] / totalRel) * 100, '%'),
      molPct,
      phr: area === 'solid' && resinRel > 0 ? calc((rel[i] / resinRel) * 100, 'phr') : null,
    };
  });

  const polymerMolNote = molBlockedMessage === null && comps.some((c) => hasPolymerMark(c.canonicalSmiles)) ? POLYMER_MOL_NOTE[basis] : null;
  return { ok: true, empty: false, unit, comps, rel, totalRel, mass, result: { unit, components, polymerMolNote } };
}

/**
 * 換算整份配方。有錯誤時仍盡量回傳能算的部分（某一區有錯誤，另一區照常；整體數字依賴有錯誤的區域時為 null）。
 * @param molecularWeights 成分 id → 平均分子量（g/mol），由呼叫端以 RDKit 計算（聚合物為 Mn）；只用於計算
 * @param options 聚合物以重複單元計 mol% 時，需傳入 unitWeights（成分 id → 重複單元分子量）
 */
export function computeFormulation(formulation: Formulation, molecularWeights: MolecularWeights = {}, options: ComputeOptions = {}): FormulationOutcome {
  const sink: Sink = { errors: [], warnings: [] };
  const basis = formulation.polymerMolBasis ?? 'chain';
  const unitWeights = options.unitWeights ?? {};
  const solid = processArea('solid', formulation.solid.unit, formulation.solid.components, formulation.solidTotalG, molecularWeights, basis, unitWeights, sink);

  // 目標 Solid Content 啟用（liquidFromTarget）：Liquid 區用量由程式依目標計算（使用者只填溶劑間的相對比例）
  const targetValue = formulation.targetSolidContentPct;
  const targetUsable = isValidNumber(targetValue) && targetValue > 0 && targetValue < 100;
  let derived: DerivedLiquid | null = null;
  let liquid: AreaState;
  if (formulation.liquidFromTarget === true && targetUsable && formulation.liquid.components.length > 0) {
    const comps = formulation.liquid.components;
    const unit = solid.mass !== null ? 'g' : '重量份';
    if (!solid.ok) {
      liquid = failedState('g', comps); // Solid 區的錯誤已列出
    } else if (solid.empty) {
      sink.errors.push({ area: 'formulation', code: 'TARGET_NEEDS_SOLID_MASS', message: '無法由目標固含量計算 Liquid 用量：Solid 區沒有成分' });
      liquid = failedState('g', comps);
    } else {
      // 基準：Solid 質量已知（g 或有填 Solid 總重）→ 以 g 計；否則每 100 份固體
      const base = solid.mass !== null ? solid.mass : 100;
      // 目標對應的 Solid Content：全部（預設），或扣除標記為揮發／分解的成分（D49）
      const flaggedFraction = solid.comps.reduce((s, c, i) => s + (c.volatileFlag && solid.totalRel > 0 ? solid.rel[i] / solid.totalRel : 0), 0);
      const excluding = formulation.targetSolidContentBasis === 'excludingVolatile' && flaggedFraction > 0;
      const maxReachable = (1 - flaggedFraction) * 100;
      let needed = (base * (100 - targetValue)) / targetValue;
      let unreachable = false;
      if (excluding) {
        if (targetValue > maxReachable + 1e-9) {
          unreachable = true;
          sink.errors.push({
            area: 'formulation',
            code: 'TARGET_UNREACHABLE',
            message: `扣除標記成分後，Solid Content 最高只能到 ${num(maxReachable)}%（目標 ${num(targetValue)}%）`,
          });
        } else {
          needed = Math.max(((base - base * flaggedFraction) * 100) / targetValue - base, 0);
          if (needed < 1e-9 * base) needed = 0;
        }
      }
      const ratios = comps.length === 1 ? [1] : comps.map((c) => c.amount);
      const bad = ratios.findIndex((r) => !isValidNumber(r) || r < 0);
      const sum = ratios.reduce((s, r) => s + (isValidNumber(r) ? r : 0), 0);
      if (unreachable) {
        liquid = failedState('g', comps);
      } else if (bad >= 0) {
        sink.errors.push({ area: 'liquid', code: 'INVALID_AMOUNT', message: `Liquid 區的「${labelOf(comps[bad], bad)}」溶劑比例必須是大於或等於 0 的數字`, componentId: comps[bad].id });
        liquid = failedState('g', comps);
      } else if (!(sum > 0)) {
        sink.errors.push({ area: 'liquid', code: 'ZERO_TOTAL', message: 'Liquid 區的溶劑比例合計為 0，無法分配' });
        liquid = failedState('g', comps);
      } else {
        const amounts: Record<string, number> = {};
        const derivedComps = comps.map((c, i) => {
          amounts[c.id] = (needed * ratios[i]) / sum;
          return { ...c, amount: amounts[c.id] };
        });
        liquid =
          needed === 0
            ? zeroLiquidState(comps, solid.mass === null ? '重量份' : 'g') // 目標等於最大可達值：Liquid 為 0，不算錯誤
            : processArea('liquid', 'g', derivedComps, undefined, molecularWeights, basis, unitWeights, sink);
        if (solid.mass === null && needed !== 0 && liquid.result) {
          // 相對基準：質量欄位標示為重量份（每 100 份固體）
          liquid.result = { ...liquid.result, components: liquid.result.components.map((c) => ({ ...c, massG: c.massG ? { ...c.massG, unit: '重量份' } : null })) };
        }
        derived = {
          unit,
          basisNote: solid.mass !== null ? '依目標固含量計算，Solid 以 g 計' : '依目標固含量計算，以每 100 份固體為基準（重量份）',
          amounts,
        };
      }
    }
  } else {
    liquid = processArea('liquid', formulation.liquid.unit, formulation.liquid.components, formulation.liquidTotalG, molecularWeights, basis, unitWeights, sink);
  }

  // 整體：Solid Content
  const na = (reason: string) => calc(null, 'g', reason);
  const naPct = (reason: string) => calc(null, '%', reason);
  const bothOk = solid.ok && liquid.ok;
  const reason = bothOk ? '' : '有區域的輸入錯誤，無法計算';

  // 質量基準：兩區都有絕對質量 → g；否則兩區都是重量份（或空區）→ 同一基準的相對質量
  const relativeOk = (s: AreaState) => s.empty || s.unit === 'parts';
  let solidMass: number | null = null;
  let liquidMass: number | null = null;
  let absolute = false;
  if (bothOk) {
    if (solid.mass !== null && liquid.mass !== null) {
      solidMass = solid.mass;
      liquidMass = liquid.mass;
      absolute = true;
    } else if (derived && solid.mass === null) {
      // 目標固含量的相對基準：每 100 份固體
      solidMass = 100;
      liquidMass = liquid.totalRel;
    } else if (relativeOk(solid) && relativeOk(liquid)) {
      solidMass = solid.totalRel;
      liquidMass = liquid.totalRel;
    }
  }
  const massUnit = absolute ? 'g' : '重量份';

  const overall: OverallResult = {
    solidMass: na(reason),
    liquidMass: na(reason),
    totalMass: na(reason),
    solidContent: naPct(reason),
    solidContentExcludingVolatile: naPct(reason),
    target: null,
  };

  if (bothOk) {
    if ((solidMass === null || liquidMass === null) && solid.empty !== liquid.empty) {
      // 其中一區沒有成分：質量未知也能得出 Solid Content（只有 Solid → 100%，只有 Liquid → 0%）；質量欄位維持不適用
      const missing = '未填總重，無法換算成質量';
      const flaggedFraction = solid.comps.reduce((s, c, i) => s + (c.volatileFlag ? solid.rel[i] / solid.totalRel : 0), 0);
      overall.solidMass = na(missing);
      overall.liquidMass = na(missing);
      overall.totalMass = na(missing);
      overall.solidContent = calc(liquid.empty ? 100 : 0, '%');
      overall.solidContentExcludingVolatile = calc(liquid.empty ? 100 * (1 - flaggedFraction) : 0, '%');
    } else if (solidMass === null || liquidMass === null) {
      sink.errors.push({ area: 'formulation', code: 'SOLID_CONTENT_NEEDS_TOTAL', message: MESSAGE_SOLID_CONTENT_NEEDS_TOTAL });
      overall.solidMass = na(MESSAGE_SOLID_CONTENT_NEEDS_TOTAL);
      overall.liquidMass = na(MESSAGE_SOLID_CONTENT_NEEDS_TOTAL);
      overall.totalMass = na(MESSAGE_SOLID_CONTENT_NEEDS_TOTAL);
      overall.solidContent = naPct(MESSAGE_SOLID_CONTENT_NEEDS_TOTAL);
      overall.solidContentExcludingVolatile = naPct(MESSAGE_SOLID_CONTENT_NEEDS_TOTAL);
    } else {
      const total = solidMass + liquidMass;
      overall.solidMass = calc(solidMass, massUnit);
      overall.liquidMass = calc(liquidMass, massUnit);
      overall.totalMass = calc(total, massUnit);
      if (total > 0) {
        overall.solidContent = calc((solidMass / total) * 100, '%');
        // 扣除標記為揮發或分解的 Solid 成分：從分子扣除，分母不變
        const flagged = solid.comps.reduce(
          (s, c, i) => s + (c.volatileFlag && solid.totalRel > 0 ? (solid.rel[i] / solid.totalRel) * solidMass : 0),
          0,
        );
        overall.solidContentExcludingVolatile = calc(((solidMass - flagged) / total) * 100, '%');
      } else {
        sink.errors.push({ area: 'formulation', code: 'ZERO_TOTAL', message: 'Solid 與 Liquid 的質量合計為 0，無法計算 Solid Content' });
      }
    }
  }

  // 目標 Solid Content：由 Solid 質量反推 Liquid 總質量（不需要 Liquid 區無誤）
  const target = formulation.targetSolidContentPct;
  if (target !== undefined && !derived) {
    if (!isValidNumber(target) || !(target > 0 && target < 100)) {
      sink.errors.push({ area: 'formulation', code: 'TARGET_OUT_OF_RANGE', message: '目標 Solid Content 必須大於 0 且小於 100（%）' });
    } else if (solid.ok) {
      const knownSolid = solid.mass !== null && !solid.empty ? solid.mass : solid.unit === 'parts' && !solid.empty ? solid.totalRel : null;
      if (knownSolid === null) {
        sink.errors.push({
          area: 'formulation',
          code: 'TARGET_NEEDS_SOLID_MASS',
          message: '無法反推所需的 Liquid 質量：Solid 質量未知，請補填 Solid 總重',
        });
      } else {
        const unit = solid.mass !== null ? 'g' : '重量份';
        const needed = (knownSolid * (100 - target)) / target;
        const parts: TargetSolidContentResult = { liquidTotal: calc(needed, unit), liquidComponents: [] };
        if (liquid.ok && !liquid.empty) {
          parts.liquidComponents = liquid.comps.map((c, i) => ({
            id: c.id,
            name: c.name,
            mass: calc((liquid.rel[i] / liquid.totalRel) * needed, unit),
          }));
        }
        overall.target = parts;
      }
    }
  }

  return {
    results: { solid: solid.result, liquid: liquid.result, overall },
    liquidFromTarget: derived,
    errors: sink.errors,
    warnings: sink.warnings,
  };
}
