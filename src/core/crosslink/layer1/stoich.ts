// 理論配比與比例掃描（任務 017，D40）。純 TypeScript，不可引用 React。
//   化學計量配比：group_a 側用量不變，group_b 側所有成分等比例調整，使兩類官能基等量（可信度：直接計算）。
//   比例掃描：在當量比（group_b／group_a）範圍內，依使用者選的物性畫出曲線並找模型最佳點（可信度：參考趨勢）。
import { computeLayer1, groupTotals, type Layer1Result, type Layer1Setup } from './layer1';

export const SCAN_DISCLAIMER = '未考慮副反應與反應不完全，實際最佳配比以實驗為準';
export const SCAN_MODEL_NAME = 'Miller–Macosko 比例掃描';
export const DEFAULT_SCAN = { min: 0.6, max: 1.4, points: 41 } as const;

/** 把 group_b 側所有成分的質量乘上同一個係數（各成分之間的比例不變）；其餘成分不變 */
export function scaleSideB(setup: Layer1Setup, factor: number): Layer1Setup {
  const components = setup.components.map((c) => (c.side === 'B' ? { ...c, mass: c.mass * factor } : c));
  const added = components.reduce((t, c, i) => t + (c.mass - setup.components[i].mass), 0);
  return { ...setup, components, totalMass: setup.totalMass + added };
}

/** 化學計量配比：回傳調整後的配方；官能基任一側為 0 時回傳 null */
export function stoichiometricSetup(setup: Layer1Setup): Layer1Setup | null {
  const { nA, nB } = groupTotals(setup);
  if (!(nA > 0) || !(nB > 0)) return null;
  return scaleSideB(setup, nA / nB);
}

/** 以指定當量比（N_B／N_A）調整 group_b 側 */
export function setupAtRatio(setup: Layer1Setup, ratio: number): Layer1Setup | null {
  const { nA, nB } = groupTotals(setup);
  if (!(nA > 0) || !(nB > 0)) return null;
  return scaleSideB(setup, (ratio * nA) / nB);
}

// ---------- 用量換算回使用者的單位 ----------

export interface AmountItem {
  id: string;
  name: string;
  /** 調整後質量與原質量（同一基準） */
  mass: number;
  massOld: number;
  /** 每分子質量（mol% 換算用）；未知為 null */
  molarMass: number | null;
  /** 使用者原本填的數值 */
  amountOld: number;
  isResin?: boolean;
}

/**
 * 把調整後的質量換回使用者的 Solid 區單位。g／重量份：原值乘質量比；wt%、mol%、phr：重新正規化。
 * 無法換算（mol% 缺分子量、phr 沒有樹脂）回傳 null。
 */
export function expressAmounts(unit: string, items: readonly AmountItem[]): number[] | null {
  switch (unit) {
    case 'g':
    case 'parts':
      return items.map((i) => (i.massOld > 0 ? i.amountOld * (i.mass / i.massOld) : 0));
    case 'wt': {
      const total = items.reduce((t, i) => t + i.mass, 0);
      return total > 0 ? items.map((i) => (i.mass / total) * 100) : null;
    }
    case 'mol': {
      if (items.some((i) => i.molarMass === null)) return null;
      const moles = items.map((i) => i.mass / (i.molarMass as number));
      const total = moles.reduce((t, m) => t + m, 0);
      return total > 0 ? moles.map((m) => (m / total) * 100) : null;
    }
    case 'phr': {
      const resin = items.reduce((t, i) => t + (i.isResin ? i.mass : 0), 0);
      return resin > 0 ? items.map((i) => (i.mass / resin) * 100) : null;
    }
    default:
      return null;
  }
}

// ---------- 比例掃描 ----------

export type ScanProperty = 'crosslinkDensity' | 'mc' | 'gelConversion' | 'residual';
export type ScanDirection = 'max' | 'min';

export interface ScanOption {
  property: ScanProperty;
  direction: ScanDirection;
  label: string;
  unit: string;
}

/** Phase 4 可選的目標物性與方向（任務 017 D-20） */
export const SCAN_OPTIONS: readonly ScanOption[] = [
  { property: 'crosslinkDensity', direction: 'max', label: '交聯密度（最大）', unit: 'mol/kg' },
  { property: 'mc', direction: 'min', label: 'Mc（最小）', unit: 'g/mol' },
  { property: 'mc', direction: 'max', label: 'Mc（最大）', unit: 'g/mol' },
  { property: 'gelConversion', direction: 'min', label: '凝膠轉化率（最小）', unit: '%' },
  { property: 'gelConversion', direction: 'max', label: '凝膠轉化率（最大）', unit: '%' },
  { property: 'residual', direction: 'min', label: '殘留官能基百分比（最小）', unit: '%' },
];

/** 取出掃描物性的數值；不適用（未凝膠等）時為 null。交聯密度未凝膠視為 0（沒有網路）。 */
export function scanValue(r: Layer1Result, property: ScanProperty): number | null {
  switch (property) {
    case 'crosslinkDensity':
      return r.gelled ? (r.junctionsMolPerKg as number) : 0;
    case 'mc':
      return r.mcGPerMol;
    case 'gelConversion':
      return r.gelConversion === null ? null : r.gelConversion * 100;
    case 'residual':
      return r.residualTotalPct;
  }
}

export interface ScanPoint {
  /** 當量比 N_B／N_A */
  ratio: number;
  value: number | null;
}

export interface ScanResult {
  points: ScanPoint[];
  /** 最佳點的索引；所有點都不適用時為 null */
  bestIndex: number | null;
  /** 目前配方的當量比 */
  currentRatio: number;
  /** 最佳點的配方（各成分用量由此換算） */
  bestSetup: Layer1Setup | null;
}

export interface ScanSettings {
  min: number;
  max: number;
  points: number;
}

/** 掃描設定是否有效（回傳錯誤說明，或 null） */
export function checkScanSettings(s: ScanSettings): string | null {
  if (![s.min, s.max, s.points].every(Number.isFinite)) return '掃描範圍必須是數字';
  if (!(s.min > 0)) return '當量比下限必須大於 0';
  if (!(s.max > s.min)) return '當量比上限必須大於下限';
  if (!Number.isInteger(s.points) || s.points < 2 || s.points > 501) return '點數必須是 2–501 的整數';
  return null;
}

/** 比例掃描：保持 group_a 側與其他成分不變，調整 group_b 側；轉化率沿用使用者的限量官能基轉化率 */
export function scanRatio(setup: Layer1Setup, q: number, option: ScanOption, settings: ScanSettings = DEFAULT_SCAN): ScanResult | null {
  const { nA, nB } = groupTotals(setup);
  if (!(nA > 0) || !(nB > 0) || checkScanSettings(settings) !== null) return null;
  const points: ScanPoint[] = [];
  let bestIndex: number | null = null;
  for (let i = 0; i < settings.points; i++) {
    const ratio = settings.min + ((settings.max - settings.min) * i) / (settings.points - 1);
    const s = setupAtRatio(setup, ratio) as Layer1Setup;
    const r = computeLayer1(s, q);
    const value = r ? scanValue(r, option.property) : null;
    points.push({ ratio, value });
    if (value !== null) {
      const best = bestIndex === null ? null : (points[bestIndex].value as number);
      if (best === null || (option.direction === 'max' ? value > best : value < best)) bestIndex = i;
    }
  }
  return {
    points,
    bestIndex,
    currentRatio: nB / nA,
    bestSetup: bestIndex === null ? null : setupAtRatio(setup, points[bestIndex].ratio),
  };
}
