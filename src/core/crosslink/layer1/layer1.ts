// 交聯第 1 層計算（任務 017，D11、D41、D42、D44）：官能基比、過量、理論最大成鍵數、凝膠點、溶膠分率、
// 交聯密度、網目分子量 Mc、殘留官能基。純 TypeScript，不可引用 React。
// 「直接計算」：官能基比、過量、理論最大成鍵數、殘留百分比；「理論估算」：凝膠點、溶膠分率、交聯密度、Mc（Miller–Macosko）。
// 各成分的官能基莫耳數只在內部使用，結果型別不含各成分的官能基數量（D09、D44）。
import {
  conversions,
  finiteProbability,
  gelConversion,
  groupMoles,
  networkDensity,
  solFraction,
  splitFunctionality,
  type MMSpecies,
  type MMSystem,
} from './millerMacosko';

export const LAYER1_MODEL_NAME = 'Miller–Macosko（理想逐步反應，無分子內環化、同類官能基等活性、無副反應）';
export const LAYER1_DIRECT_MODEL_NAME = '官能基計量（交聯第 1 層）';
export const MESSAGE_NOT_GELLED = '未凝膠，不適用';
export const MESSAGE_NEVER_GELS = '理論上不會凝膠';
export const NOTE_MASS_BASIS = '以質量為基準，未換算體積';
export const NOTE_NON_INTEGER = '官能度以相鄰整數混合近似';
export const NOTE_MN_ONLY = '僅有 Mn，未考慮分子量分布；分布越寬，實際凝膠點越早';
export const NOTE_MC_DEFINITION = 'Mc 為依 Miller–Macosko 式 51 推導的質量基準定義（每克固體的有效網目鏈莫耳數的倒數），非論文原式';
/** 凝膠點與交聯相關結果的限制說明（KNOWN_ISSUES M06 的重點） */
export const NOTE_M06 = '理想模型未考慮分子內環化、官能基活性差異與副反應；實際凝膠點通常比理論晚，實際交聯密度通常比理論低。';

export interface Layer1Component {
  id: string;
  name: string;
  side: 'A' | 'B';
  isPolymer: boolean;
  /** 質量（相對值，與 totalMass 同一基準；通常為每 100 g 固體的 g 數） */
  mass: number;
  /** 每分子質量（g/mol）：小分子為平均分子量，聚合物為 Mn。只供計算，不顯示（D09） */
  molarMass: number;
  /** 每分子平均反應官能基數（聚合物含聚合度），可為非整數 */
  groupsPerMolecule: number;
}

export interface Layer1Setup {
  /** 規則 group_a／group_b 的中文名稱 */
  nameA: string;
  nameB: string;
  components: Layer1Component[];
  /** 固體總質量（含不參與反應的固體成分），作為「每克固體」的基準 */
  totalMass: number;
}

export type Limiting = 'A' | 'B' | 'equal';

export interface Layer1Result {
  /** 以 group_a 為 1 的官能基比：B／A */
  ratioBToA: number;
  ratioText: string;
  limiting: Limiting;
  /** 過量的官能基（equal 時為 null） */
  excess: 'A' | 'B' | null;
  excessPct: number;
  /** 理論最大成鍵數（限量官能基完全反應），mol／100 g 固體 */
  maxBondsMolPer100g: number;
  /** 使用者指定的限量官能基轉化率（0–1） */
  conversion: number;
  /** 兩類官能基各自殘留的百分比（相對初始量） */
  residualAPct: number;
  residualBPct: number;
  /** 兩類官能基合計的殘留百分比 */
  residualTotalPct: number;
  /** 限量官能基的凝膠轉化率（0–1）；null＝理論上不會凝膠 */
  gelConversion: number | null;
  gelled: boolean;
  /** 溶膠質量分率（0–1；以參與反應的成分為基準）；未凝膠為 1 */
  solFraction: number;
  /** 未凝膠時皆為 null */
  junctionsMolPerKg: number | null;
  effectiveChainsMolPerKg: number | null;
  /** 網目分子量 Mc（g/mol），質量基準 */
  mcGPerMol: number | null;
  /** 官能度以相鄰整數混合近似過 */
  usedMixtureApprox: boolean;
  /** 含聚合物（只有 Mn 的近似，D42） */
  hasPolymer: boolean;
}

const fmt = (v: number) => String(Number(v.toFixed(2)));

/** 官能基比的顯示格式：「環氧基 : 酚羥基 = 1 : 2.33」 */
export function ratioText(nameA: string, nameB: string, ratioBToA: number): string {
  return `${nameA} : ${nameB} = 1 : ${fmt(ratioBToA)}`;
}

/** 組出 Miller–Macosko 用的 A、B 兩側成分（非整數官能度拆成相鄰整數的虛擬成分，B-8） */
export function buildSystem(setup: Layer1Setup): { sys: MMSystem; mixture: boolean } {
  let mixture = false;
  const species = (c: Layer1Component): MMSpecies[] => {
    const n = c.mass / c.molarMass;
    const parts = splitFunctionality(c.groupsPerMolecule, n, c.mass);
    if (parts.length > 1) mixture = true;
    return parts;
  };
  const a = setup.components.filter((c) => c.side === 'A').flatMap(species);
  const b = setup.components.filter((c) => c.side === 'B').flatMap(species);
  return { sys: { a, b }, mixture };
}

/** 兩類官能基的總莫耳數（以 setup 的質量基準；內部使用） */
export function groupTotals(setup: Layer1Setup): { nA: number; nB: number } {
  const { sys } = buildSystem(setup);
  return { nA: groupMoles(sys.a), nB: groupMoles(sys.b) };
}

/** 依目前配方與限量官能基轉化率 q（0–1）計算第 1 層。nA 或 nB 為 0 時回傳 null。 */
export function computeLayer1(setup: Layer1Setup, q: number): Layer1Result | null {
  const { sys, mixture } = buildSystem(setup);
  const nA = groupMoles(sys.a);
  const nB = groupMoles(sys.b);
  if (!(nA > 0) || !(nB > 0) || !(setup.totalMass > 0)) return null;

  const ratio = nB / nA;
  const equal = Math.abs(nA - nB) <= 1e-9 * Math.max(nA, nB);
  const limiting: Limiting = equal ? 'equal' : nA < nB ? 'A' : 'B';
  const excess = equal ? null : limiting === 'A' ? 'B' : 'A';
  const nLim = Math.min(nA, nB);
  const nExcess = Math.max(nA, nB);

  const { pA, pB } = conversions(nA, nB, q);
  const gelQ = gelConversion(sys);
  const fp = finiteProbability(sys, pA, pB);
  const gelled = fp.gelled;
  const dens = gelled ? networkDensity(sys, fp) : null;
  const perKg = (v: number) => (v / setup.totalMass) * 1000;

  return {
    ratioBToA: ratio,
    ratioText: ratioText(setup.nameA, setup.nameB, ratio),
    limiting,
    excess,
    excessPct: (nExcess / nLim - 1) * 100,
    maxBondsMolPer100g: (nLim / setup.totalMass) * 100,
    conversion: q,
    residualAPct: (1 - pA) * 100,
    residualBPct: (1 - pB) * 100,
    residualTotalPct: (1 - (pA * nA + pB * nB) / (nA + nB)) * 100,
    gelConversion: gelQ,
    gelled,
    solFraction: solFraction(sys, fp),
    junctionsMolPerKg: dens ? perKg(dens.junctions) : null,
    effectiveChainsMolPerKg: dens ? perKg(dens.chains) : null,
    mcGPerMol: dens && dens.chains > 0 ? setup.totalMass / dens.chains : null,
    usedMixtureApprox: mixture,
    hasPolymer: setup.components.some((c) => c.isPolymer),
  };
}
