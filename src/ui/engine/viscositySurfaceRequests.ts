// 「黏度」與「表面與潤濕」卡片的引擎請求（任務 P8-2）：介面狀態（配方、使用者輸入的欄位）→ 請求本文。
// 只搬運資料，不計算任何物性；黏度、Parachor、Owens–Wendt 都在 Python 引擎端算（D62）。
import type { Component, Formulation } from '../../core/formulation/types';
import { isPolymerSmiles, type EngineRequest } from './propertyRequests';
import type { PlannedRequest } from './solventRequests';

/** 一種溶劑的 Andrade 參數（式 16.15a）輸入方式：無／B 與 Eη／兩個溫度的黏度 */
export interface AndradeFields {
  mode: 'none' | 'be' | 'points';
  b: string;
  e: string;
  t1: string;
  v1: string;
  t2: string;
  v2: string;
}

export const emptyAndrade: AndradeFields = { mode: 'none', b: '', e: '', t1: '', v1: '', t2: '', v2: '' };

/** 聚合物溶液的使用者輸入（Mark–Houwink、含 B 項、濃溶液）；全部可空白 */
export interface PolymerViscosityFields {
  mhK: string;
  mhA: string;
  mhSource: string;
  mhSolvent: string;
  mhTemperature: string;
  b: string;
  concK: string;
  concC: string;
}

export const emptyPolymerFields: PolymerViscosityFields = { mhK: '', mhA: '', mhSource: '', mhSolvent: '', mhTemperature: '', b: '', concK: '', concC: '' };

/** 文字 → 數字；空白或不是有限數字回傳 null */
export function parseNumber(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** 聚合物的分子量：Mw（使用者輸入）優先，其次 Mn（換算結果）；回傳值與依據 */
export function polymerMolarMass(c: Component, mnById: Record<string, number | undefined>): { value: number; basis: 'Mw' | 'Mn' } | null {
  const mw = c.polymer?.mwInput;
  if (typeof mw === 'number' && Number.isFinite(mw) && mw > 0) return { value: mw, basis: 'Mw' };
  const mn = mnById[c.id];
  if (typeof mn === 'number' && Number.isFinite(mn) && mn > 0) return { value: mn, basis: 'Mn' };
  return null;
}

/** 可選為「聚合物」的成分：Solid 區含連接點（*）的重複單元 */
export function surfacePolymers(formulation: Formulation): Component[] {
  return formulation.solid.components.filter((c) => isPolymerSmiles(c.canonicalSmiles));
}

/** 有結構的 Liquid 成分（黏度與表面張力的溶劑） */
export function liquidComponents(formulation: Formulation): Component[] {
  return formulation.liquid.components.filter((c) => c.canonicalSmiles.trim() !== '');
}

function andradeBody(f: AndradeFields): Record<string, unknown> | null {
  if (f.mode === 'be') {
    const b = parseNumber(f.b);
    const e = parseNumber(f.e);
    return b !== null && b > 0 && e !== null ? { B: b, energyKjMol: e } : null;
  }
  if (f.mode === 'points') {
    const t1 = parseNumber(f.t1);
    const v1 = parseNumber(f.v1);
    const t2 = parseNumber(f.t2);
    const v2 = parseNumber(f.v2);
    if (t1 === null || t2 === null || v1 === null || v2 === null || v1 <= 0 || v2 <= 0 || t1 === t2) return null;
    return { points: [{ temperatureC: t1, viscosityMPas: v1 }, { temperatureC: t2, viscosityMPas: v2 }] };
  }
  return null;
}

export interface ViscosityInputs {
  temperatureText: string;
  andrade: Record<string, AndradeFields>;
  polymerId: string | null;
  mnById: Record<string, number | undefined>;
  polymer: PolymerViscosityFields;
}

/** 黏度（POST /viscosity）：Liquid 的溶劑（各自的 Andrade 參數）＋ 選定聚合物的溶液黏度 */
export function viscosityRequest(formulation: Formulation, inputs: ViscosityInputs): PlannedRequest {
  const liquids = liquidComponents(formulation);
  const polymer = surfacePolymers(formulation).find((c) => c.id === inputs.polymerId) ?? null;
  if (liquids.length === 0 && polymer === null) return { request: null, reason: 'Liquid 區沒有溶劑，Solid 區也沒有聚合物成分' };
  const body: Record<string, unknown> = {};
  const t = parseNumber(inputs.temperatureText);
  if (t !== null) body.temperatureC = t;
  if (liquids.length > 0) {
    body.solvents = liquids.map((c) => {
      const a = andradeBody(inputs.andrade[c.id] ?? emptyAndrade);
      return { smiles: c.canonicalSmiles, ...(a ? { andrade: a } : {}) };
    });
  }
  if (polymer !== null) {
    const f = inputs.polymer;
    const mass = polymerMolarMass(polymer, inputs.mnById);
    const k = parseNumber(f.mhK);
    const a = parseNumber(f.mhA);
    const bTerm = parseNumber(f.b);
    const ck = parseNumber(f.concK);
    const cc = parseNumber(f.concC);
    const mhTemp = parseNumber(f.mhTemperature);
    body.polymer = {
      smiles: polymer.canonicalSmiles,
      ...(mass ? { molarMass: mass.value } : {}),
      ...(k !== null && a !== null
        ? { markHouwink: { K: k, a, source: f.mhSource, ...(mhTemp !== null ? { temperatureC: mhTemp } : {}), ...(f.mhSolvent.trim() !== '' ? { solvent: f.mhSolvent } : {}) } }
        : {}),
      ...(bTerm !== null ? { B: bTerm } : {}),
      ...(ck !== null && cc !== null ? { concentrated: { K: ck, concentration: cc } } : {}),
    };
  }
  return { request: { path: '/viscosity', body }, reason: null };
}

/** 液體的選擇：配方的 Liquid 成分，或書 Table 8.6 的液體（surface_energy.csv 的 id） */
export type LiquidChoice = { kind: 'component'; id: string } | { kind: 'table'; materialId: string; smiles: string };

/** 表面張力（POST /surface-tension，Parachor）：一個結構一份請求 */
export function surfaceTensionRequest(smiles: string, temperatureText: string): EngineRequest | null {
  if (smiles.trim() === '') return null;
  const t = parseNumber(temperatureText);
  return { path: '/surface-tension', body: { smiles, ...(t !== null ? { temperatureC: t } : {}) } };
}

/** 潤濕（POST /wetting）：聚合物（固體）與液體；物質用 SMILES 或 surface_energy.csv 的 id，由引擎對應書的表 */
export function wettingRequest(polymer: Component | null, liquid: Component | null, table: { materialId: string } | null): PlannedRequest {
  if (polymer === null) return { request: null, reason: surfaceReason(false) };
  if (liquid === null && table === null) return { request: null, reason: '請選一種液體' };
  return {
    request: {
      path: '/wetting',
      body: { solid: { smiles: polymer.canonicalSmiles }, liquid: table !== null ? { materialId: table.materialId } : { smiles: (liquid as Component).canonicalSmiles } },
    },
    reason: null,
  };
}

export function surfaceReason(hasPolymer: boolean): string {
  return hasPolymer ? '請選一個聚合物成分' : 'Solid 區沒有聚合物成分（需要含連接點 * 的重複單元）';
}
