// 物性面板的輸入轉換（任務 I01）：介面狀態（配方、成分、formulation/compute 的換算結果）→ 引擎請求本文。
// 只搬運資料，不計算任何物性。質量分率、Mn、每分子質量由介面端以現有 TypeScript 的 computeFormulation 換算後傳入（D04、039a）。
import { isValidDensity, type Component, type Formulation, type FormulationOutcome } from '../../core/formulation/types';

export interface EngineRequest {
  /** 引擎端點（桌面橋接的白名單內） */
  path: string;
  body: Record<string, unknown>;
}

const CATALYST = 'Catalyst/Initiator';

/** 使用者輸入的密度（P7-4a）：引擎只在預測密度取不到時使用，並標「使用者輸入」；無效值不送 */
export function userDensityFields(c: Pick<Component, 'density' | 'densitySource'>): Record<string, unknown> {
  if (!isValidDensity(c.density)) return {};
  return { userDensity: c.density, ...(c.densitySource && c.densitySource.trim() !== '' ? { userDensitySource: c.densitySource } : {}) };
}

export const isPolymerSmiles =(smiles: string) => smiles.includes('*');

/** 共聚物（兩種以上單元）：單元性質不能用第一種單元代表 */
export function isCopolymer(c: Pick<Component, 'polymer'>): boolean {
  return (c.polymer?.units?.length ?? 0) > 1;
}

/** 共聚物組成（引擎的 units／fractionBasis／endGroups）；沒有就回傳空物件 */
function compositionSpec(c: Pick<Component, 'polymer'>): Record<string, unknown> {
  const p = c.polymer;
  if (!p) return {};
  return {
    ...(p.units ? { units: p.units } : {}),
    ...(p.fractionBasis ? { fractionBasis: p.fractionBasis } : {}),
    ...(p.endGroups ? { endGroups: p.endGroups } : {}),
  };
}

/**
 * 單一對象（聚合物單元或小分子）的引擎請求。
 * 小分子不呼叫 /tg（D56：小分子不計算 Tg，只給 Tm），面板會直接顯示 missing 與原因。
 */
export function unitRequests(c: Pick<Component, 'canonicalSmiles' | 'polymer'>): EngineRequest[] {
  const smiles = c.canonicalSmiles;
  const polymer = isPolymerSmiles(smiles);
  const list: EngineRequest[] = [{ path: '/vw', body: { smiles } }];
  if (polymer) list.push({ path: '/tg', body: { smiles } });
  list.push(
    { path: '/vm', body: { smiles } },
    { path: '/cte', body: { smiles } },
    { path: '/free-volume', body: { smiles, ...compositionSpec(c) } },
    { path: '/dielectric', body: { smiles } },
    { path: '/joback', body: { smiles } },
    { path: '/tpsa-logp', body: { smiles } },
  );
  return list;
}

/** Table 18.14 的相對濕度（吸濕性只允許這五個值） */
export const MOISTURE_RH = [0.3, 0.5, 0.7, 0.9, 1.0] as const;
export const DEFAULT_RH = 0.7;

/**
 * Tm、Td、吸濕性、體積／彈性模數（任務 P6B）的引擎請求。四項都針對聚合物重複單元；小分子不送出（面板顯示不適用與原因）。
 * 吸濕性帶面板選的相對濕度。
 */
export function thermalRequests(c: Pick<Component, 'canonicalSmiles'>, rh: number = DEFAULT_RH): EngineRequest[] {
  const smiles = c.canonicalSmiles;
  if (!isPolymerSmiles(smiles)) return [];
  return [
    { path: '/tm', body: { smiles } },
    { path: '/td', body: { smiles } },
    { path: '/moisture', body: { smiles, rh } },
    { path: '/modulus', body: { smiles } },
  ];
}

/** 配方混合（Fox 混合 Tg、混合密度、混合介電）的輸入；Catalyst/Initiator 與標記揮發／分解的成分不混入（與 Tg 混合一致） */
export interface MixtureSolid {
  component: Component;
  /** 該成分在 Solid 區的 wt%（formulation/compute 的結果）；換算失敗為 null */
  wtPct: number | null;
}

export function isMixed(c: Component): boolean {
  return c.category !== CATALYST && c.volatileFlag !== true;
}

export function solidWtPct(outcome: FormulationOutcome | null, formulation: Formulation): MixtureSolid[] {
  const byId = new Map(outcome?.results.solid?.components.map((r) => [r.id, r.wtPct.value]) ?? []);
  return formulation.solid.components.map((component) => ({ component, wtPct: byId.get(component.id) ?? null }));
}

export interface FormulationRequests {
  /** 成分 Tg 與混合 Tg；Solid 區沒有成分時為 null */
  tgMixing: EngineRequest | null;
  /** 混合密度／混合介電；沒有可混合成分或質量分率不完整時為 null，reason 說明原因 */
  density: EngineRequest | null;
  dielectric: EngineRequest | null;
  mixReason: string | null;
}

export function formulationRequests(
  formulation: Formulation,
  outcome: FormulationOutcome | null,
  mnById: Readonly<Record<string, number | undefined>>,
): FormulationRequests {
  const solid = solidWtPct(outcome, formulation);
  if (solid.length === 0) return { tgMixing: null, density: null, dielectric: null, mixReason: 'Solid 區沒有成分' };

  const wtPct: Record<string, number | null> | null = outcome?.results.solid ? Object.fromEntries(solid.map((s) => [s.component.id, s.wtPct])) : null;
  const mn = Object.fromEntries(solid.map((s) => [s.component.id, mnById[s.component.id] ?? null]));
  const errors = (outcome?.errors ?? []).filter((e) => e.area !== 'liquid').map((e) => e.message);
  const tgMixing: EngineRequest = {
    path: '/tg/mixing',
    body: {
      components: solid.map(({ component: c }) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        canonicalSmiles: c.canonicalSmiles,
        ...(c.polymer ? { polymer: c.polymer } : {}),
        ...(c.volatileFlag ? { volatileFlag: true } : {}),
      })),
      wtPct,
      mn,
      ...(errors.length ? { errors } : {}),
    },
  };

  const mixed = solid.filter((s) => isMixed(s.component));
  if (mixed.length === 0) return { tgMixing, density: null, dielectric: null, mixReason: '沒有可混合的 Solid 成分（Catalyst/Initiator 與揮發／分解成分不混入）' };
  if (mixed.some((s) => s.wtPct === null || !(s.wtPct > 0))) {
    return { tgMixing, density: null, dielectric: null, mixReason: '配方換算沒有完整的質量分率（請先補齊用量或修正錯誤）' };
  }
  let total = 0;
  for (const s of mixed) total += s.wtPct as number;
  const components = mixed.map(({ component: c, wtPct: pct }) => ({
    name: c.name,
    w: (pct as number) / total,
    // 共聚物以第一種單元代表會失真：不給 smiles，讓引擎回報缺密度／缺介電
    ...(isCopolymer(c) ? {} : { smiles: c.canonicalSmiles }),
    ...userDensityFields(c),
  }));
  return {
    tgMixing,
    density: { path: '/mixture-density', body: { components } },
    dielectric: { path: '/mixture-dielectric', body: { basis: 'mass', components } },
    mixReason: null,
  };
}
