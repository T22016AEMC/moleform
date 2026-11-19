// Liquid 區 vol% 換算與溶解性卡片的引擎請求（任務 P8-1）：介面狀態（配方、formulation/compute 的換算結果）→ 請求本文。
// 只搬運資料，不計算任何物性；體積分率、HSP、Ra、RED、χ 都在 Python 引擎端算（D62）。
import type { Component, Formulation, FormulationOutcome } from '../../core/formulation/types';
import { isValidDensity } from '../../core/formulation/types';
import { isPolymerSmiles, userDensityFields, type EngineRequest } from './propertyRequests';

export type SolventChoice = { kind: 'liquid' } | { kind: 'solvent'; id: string };

export interface PlannedRequest {
  request: EngineRequest | null;
  /** request 為 null 時的原因（畫面顯示） */
  reason: string | null;
}

interface LiquidAmounts {
  amounts: Map<string, number>;
  /** amount 是質量（g）；否則是 wt% 比例 */
  isGram: boolean;
}

/** Liquid 各成分的質量（有總重時，g）或 wt% 比例；換算沒有完整結果時回傳原因 */
function liquidAmounts(formulation: Formulation, outcome: FormulationOutcome | null): LiquidAmounts | string {
  if (formulation.liquid.components.length === 0) return 'Liquid 區沒有成分';
  const result = outcome?.results.liquid;
  if (!result) return '配方換算沒有 Liquid 區的結果（請先補齊用量或修正錯誤）';
  const byId = new Map(result.components.map((r) => [r.id, r]));
  const rows = formulation.liquid.components.map((c) => byId.get(c.id));
  if (rows.some((r) => r === undefined)) return '配方換算沒有完整的 Liquid 結果';
  const masses = rows.map((r) => r?.massG?.value ?? null);
  if (masses.every((m): m is number => m !== null && Number.isFinite(m))) {
    return { amounts: new Map(formulation.liquid.components.map((c, i) => [c.id, masses[i] as number])), isGram: true };
  }
  const shares = rows.map((r) => r?.wtPct.value ?? null);
  if (shares.every((s): s is number => s !== null && Number.isFinite(s))) {
    return { amounts: new Map(formulation.liquid.components.map((c, i) => [c.id, shares[i] as number])), isGram: false };
  }
  return '配方換算沒有完整的 Liquid 質量比例（請先補齊用量或修正錯誤）';
}

const liquidComponentBody = (c: Component, amount: number): Record<string, unknown> => ({
  id: c.id,
  name: c.name.trim() === '' ? '（未命名）' : c.name,
  amount,
  smiles: c.canonicalSmiles,
  ...userDensityFields(c),
});

/** Liquid 區 vol% 換算（POST /liquid-volume）。密度：成分上填的（含從溶劑資料表帶入後的值）優先，否則引擎依結構對應溶劑資料表 */
export function liquidVolumeRequest(formulation: Formulation, outcome: FormulationOutcome | null): PlannedRequest {
  const amounts = liquidAmounts(formulation, outcome);
  if (typeof amounts === 'string') return { request: null, reason: amounts };
  return {
    request: {
      path: '/liquid-volume',
      body: { components: formulation.liquid.components.map((c) => ({ ...liquidComponentBody(c, amounts.amounts.get(c.id) as number), amountIsGram: amounts.isGram })) },
    },
    reason: null,
  };
}

/** 可選為「聚合物」的成分：Solid 區含連接點（*）的重複單元 */
export function solubilityPolymers(formulation: Formulation): Component[] {
  return formulation.solid.components.filter((c) => isPolymerSmiles(c.canonicalSmiles));
}

/** 溶解性（POST /solubility）：聚合物重複單元＋（混合）溶劑。混合溶劑用 Liquid 區成分的質量比例，體積分率由引擎以密度算 */
export function solubilityRequest(formulation: Formulation, outcome: FormulationOutcome | null, polymerId: string | null, choice: SolventChoice): PlannedRequest {
  const polymer = solubilityPolymers(formulation).find((c) => c.id === polymerId);
  if (!polymer) return { request: null, reason: formulation.solid.components.some((c) => isPolymerSmiles(c.canonicalSmiles)) ? '請選一個聚合物成分' : 'Solid 區沒有聚合物成分（需要含連接點 * 的重複單元）' };
  let solvents: Record<string, unknown>[];
  if (choice.kind === 'solvent') {
    solvents = [{ solventId: choice.id, amount: 1 }];
  } else {
    const amounts = liquidAmounts(formulation, outcome);
    if (typeof amounts === 'string') return { request: null, reason: amounts };
    solvents = formulation.liquid.components.map((c) => liquidComponentBody(c, amounts.amounts.get(c.id) as number));
    // 質量為 0 的成分不參與（體積分率為 0）；全部為 0 時沒有溶劑
    solvents = solvents.filter((s) => (s.amount as number) > 0);
    if (solvents.length === 0) return { request: null, reason: 'Liquid 區的用量都是 0，沒有溶劑可算' };
  }
  return {
    request: {
      path: '/solubility',
      body: {
        smiles: polymer.canonicalSmiles,
        solvents,
        basis: 'mass',
        ...(isValidDensity(polymer.density) ? { polymerDensity: polymer.density } : {}),
      },
    },
    reason: null,
  };
}
