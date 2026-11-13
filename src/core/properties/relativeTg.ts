// 簡易的聚合物 Tg 相對估算（任務 038，D61）：已知 A 的 Tg，用 A、B 的自由體積差初步估計 B 的 Tg。
// 這是使用者 2026-11-07 要求的簡易經驗功能，不是 WLF 完整模型，也不是通用預測模型；可信度「參考趨勢」。只有核心函式，不含畫面。
//
// 用詞（程式、註解、報告一律遵守）：
//  - VvdW（Vω）：van der Waals 體積（cm³/mol），沿用現有書的 VW 計算（computeVdwVolume，含任務 037、037a 的補充）；
//    不使用使用者經驗自由體積法（D57）的 Vω、Vf。
//  - Vm：分子（重複單元）實際占據的莫耳體積（cm³/mol）。V0 = 1.3 × VvdW：Bondi 近似的 0 K 體積。兩者不可混用。
//  - packingK：堆積係數（小寫 k = Vω／V，無單位，0 到 1），來自使用者的 k／Tg 表或使用者輸入。
//  - alphaOverride：Δα 覆寫值（大寫 K = 1／Δα，單位 K），使用者可選的輸入。packingK 與 alphaOverride 是不同的量，不可混用。
//
// 計算流程：
//  1. 每個單體 i：VvdW_i（現有 VW 函式）；Vm_i 依序取 (1) 堆積係數 k（使用者輸入優先，其次 k 表依材料名稱精確比對）：Vm = VvdW／k；
//     (1b) 不在 k 表也沒輸入 k：D57 的結構類別係數 c 換算 k = 1／(c + 1.3)（類別由現有 computeFreeVolumeUnit 取得，不重寫辨識），標「類別預設，非材料值」；
//     (2) 使用者輸入的密度與結構單元質量：Vm = M／ρ；(3) 任務 029 的 Va（298 K），標「Va 估算」。都沒有 → 「缺莫耳體積」，不能把 VvdW 當 FFV 的替代。
//  2. Vf_i = Vm_i − 1.3 × VvdW_i。組成（均聚物是只有一項的組成）採理想體積加成（Gordon & Taylor 1952, J. Appl. Chem. 2, 493 的基礎假設）：
//     V = Σ n_i·Vm_i、Vf = Σ n_i·Vf_i，n_i 為莫耳數（A、B 必須用同一基準，例如都以 1 mol 的 A 單元為準）。
//  3. Bondi 型 FFV = 1 − 1.3 × VvdW／Vm（= Vf／V）。1.3 取自 van Krevelen & te Nijenhuis 2009 式 4.2（書頁 76）：V0(0)／VW ≈ 1.3（Bondi 的近似）；
//     書沒有把它定義為自由體積，所以只稱「Bondi 型 FFV」。1.3 是固定常數（使用者 2026-11-07：不開放覆寫）。
//  4. Δf =（Vf_B − Vf_A）／V_A（使用者 2026-11-13 指定的「範例算法」：B 視為 A 再增減或替換單元，分母只用 A 的體積）。
//     **Δf 不是 FFV_B − FFV_A**：A、B 的堆積係數 k 相同時 FFV_A = FFV_B，但 Δf 仍可不為 0。Δf 與莫耳數基準、重複單元的寫法有關（見報告 038）。
//  5. Tg_B = Tg_A − Δf／Δα（Simha–Boyer 型）。Δα = α_l − α_g 預設取自任務 036 的書的 CTE 函式（cteFromVw：式 4.17、4.18 的 E_l、E_g；V 用 A 的 Vm）：
//     Δα_A =（E_l − E_g）／V_A。本檔只呼叫 cteFromVw，不含任何熱膨脹係數。使用者輸入 alphaOverride（K = 1／Δα）時優先：Tg_B = Tg_A − K × Δf。
//  6. Tg 的輸入輸出可用 °C；內部以 K 計算。
//  7. A 的 Tg 是執行時的錨點：使用者輸入，或由 k／Tg 表依材料名稱帶出（使用者可覆寫）；不寫進資料表、不用於驗證（D61 記明這是使用者對 D02 的說明）。
//  8. 表中的 Tg 是各材料的初始 Tg：B 若是表內材料且組成沒改（單一項、名稱在表內），直接顯示表內 Tg，不估算；不得用表內 Tg 互相預測或比對。
// 不實作：Jones & Craster (2025) 的公式、Fox–Flory、Gordon–Taylor 的 Tg 式、新的熱膨脹計算。Fox 混合式只重用任務 034 的 foxMix 作並列比較，不混進本法結果。
// D09：分子量不顯示（單元質量只在內部換算莫耳數與 Vm）；D07：不使用折射率。
import { PACKING_K_NOT_FOUND, PACKING_K_ROWS, findPackingKRow, tableTgOf, type PackingKRow } from '../data/packingCoefficientK';
import type { RDKitModule } from '../rdkit/types';
import { UNIFIED_NOTE } from '../result';
import { cteFromVw } from './cte';
import { computeFreeVolumeUnit } from './freeVolume';
import { computeMolarVolumeDensity } from './molarVolumeDensity';
import { FOX_MIX_MODEL, foxMix } from './tgMixing';
import { computeVdwVolume, type VwMissingAtom } from './vanDerWaalsVolume';

/** V0 ≈ 1.30 × VW（van Krevelen & te Nijenhuis 2009 式 4.2，書頁 76；Bondi 的近似）。固定常數，不開放覆寫（使用者 2026-11-07） */
export const BONDI_OCCUPIED_FACTOR = 1.3;
/** °C 與 K 的換算 */
export const KELVIN_OFFSET = 273.15;
/** 任務 029 的 Va 是 298 K 的值 */
export const VA_TEMPERATURE_K = 298;
/** 使用者沒有註明密度的溫度時，視為 25 °C */
export const DEFAULT_DENSITY_TEMPERATURE_C = 25;
/** 兩個 Vm 的溫度基準視為相同的容許差（K）：298 K 與 25 °C（298.15 K）視為相同 */
export const VM_TEMPERATURE_TOLERANCE_K = 0.5;

export const RELATIVE_TG_MODEL =
  '簡易 Tg 相對估算（任務 038，D61）：Tg_B = Tg_A − Δf／Δα（Simha–Boyer 型）；Δf =（Vf_B − Vf_A）／V_A（使用者 2026-11-13 指定的範例算法，分母用 A 的體積）；Vf = Vm − 1.3 × VvdW；Bondi 型 FFV = 1 − 1.3 × VvdW／Vm（1.3：van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009) 式 4.2，書頁 76）；VvdW 用書的 Table 4.2 基團加成（含 Bondi 1964 補充）；Δα = α_l − α_g 取自書的 CTE 模型（式 4.17、4.18，書頁 91；V 用 A 的 Vm）';
export const RELATIVE_TG_DISCLAIMER = '簡易經驗估算，非經實驗驗證的通用預測模型；不是 WLF 完整模型；Δα 覆寫值 K 須由同家族實驗資料校正';
export const RELATIVE_TG_CONFIDENCE = '參考趨勢';
export const RELATIVE_TG_CTE_LABEL = 'Δα 取自書的基團加成 CTE 模型（非實測）；相對估算，可能高估變化量，需同家族實驗校正';
export const RELATIVE_TG_OVERRIDE_LABEL = 'Δα 取自使用者輸入的 Δα 覆寫值 K（K = 1／Δα）；相對估算，Δα 覆寫值 K 須由同家族實驗資料校正';
export const RELATIVE_TG_SMALL_MOLECULE = '不適用（小分子，D56）';
export const RELATIVE_TG_FFV_NOTE = '本功能的自由體積分率稱為「Bondi 型 FFV」（1 − 1.3 × VvdW／Vm）：書（式 4.2，書頁 76）只說 V0(0) ≈ 1.3 × VW 是 Bondi 的近似，沒有把它定義為自由體積';
export const RELATIVE_TG_INCREMENT_NOTE =
  'Δf 不是 FFV_B − FFV_A：Δf =（Vf_B − Vf_A）／V_A，分母只用 A 的體積（使用者 2026-11-13 指定的範例算法）。A、B 的堆積係數 k 相同時 FFV_A = FFV_B，但只要 B 的 Σ（莫耳數 × VvdW）與 A 不同，Δf 就不為 0；Δf 與 A、B 的莫耳數基準、重複單元的寫法有關';
export const RELATIVE_TG_MN_UNCHECKED = '未檢查分子量是否相近';
export const RELATIVE_TG_VA_WARNING = 'Vm 來自 Va 估算：Δf 與 FFV 受 Va 估算誤差影響，可能與差值同量級';
export const RELATIVE_TG_TABLE_B_NOTE = 'B 是 k／Tg 表內的材料且組成沒改：直接顯示表內 Tg（各材料的初始 Tg），不做估算；不以表內 Tg 互相預測或比對';
export const RELATIVE_TG_FOX_LABEL = '比較用，與本法獨立';
export const RELATIVE_TG_CALIBRATION_LABEL = '單一組校正，未經驗證';
export const RELATIVE_TG_MOLE_WEIGHTED_LABEL = '莫耳加權近似';

export const VM_SOURCE_LABELS = {
  userK: 'Vm 由使用者堆積係數估算（非實測）；堆積係數 k 為使用者輸入',
  tableK: 'Vm 由使用者堆積係數估算（非實測）；堆積係數 k 取自使用者的 k／Tg 表',
  classK: 'Vm 由 D57 結構類別係數換算的堆積係數估算；類別預設，非材料值',
  density: 'Vm 由使用者輸入的密度與結構單元質量計算（Vm = M／ρ）',
  va: 'Va 估算（任務 029，書的基團加成，298 K）',
} as const;
export type VmSource = keyof typeof VM_SOURCE_LABELS;

// ---------- 溫度 ----------

export type TemperatureUnit = 'C' | 'K';
export interface TemperatureInput {
  value: number;
  unit: TemperatureUnit;
}
export const toKelvin = (t: TemperatureInput): number => (t.unit === 'K' ? t.value : t.value + KELVIN_OFFSET);
export const toCelsius = (kelvin: number): number => kelvin - KELVIN_OFFSET;

// ---------- 純計算（輸入為數字；單元測試與手算對照用） ----------

/** Bondi 型 FFV = 1 − 1.3 × VvdW／Vm */
export const bondiFfv = (vomega: number, vm: number): number => 1 - (BONDI_OCCUPIED_FACTOR * vomega) / vm;
/** Vm = VvdW／堆積係數 k */
export const vmFromPackingK = (vomega: number, packingK: number): number => vomega / packingK;
/** 堆積係數 k 來源下的 FFV = 1 − 1.3k（VvdW 消掉） */
export const ffvFromPackingK = (packingK: number): number => 1 - BONDI_OCCUPIED_FACTOR * packingK;
/** D57 的結構類別係數 c（Vf = c × Vω）換算成堆積係數：k = 1／(c + 1.3) */
export const packingKFromClassCoefficient = (coefficient: number): number => 1 / (coefficient + BONDI_OCCUPIED_FACTOR);

export interface VolumeItem {
  /** 莫耳數（A、B 同一基準） */
  moles: number;
  /** VvdW（cm³/mol） */
  vomega: number;
  /** Vm（cm³/mol） */
  vm: number;
}

export interface CompositionVolumes {
  /** Σ n_i */
  moles: number;
  /** Σ n_i·VvdW_i（cm³） */
  vomega: number;
  /** V = Σ n_i·Vm_i（cm³） */
  vm: number;
  /** V0 = 1.3 × Σ n_i·VvdW_i（cm³） */
  v0: number;
  /** Vf = V − V0（cm³） */
  vf: number;
  /** Bondi 型 FFV = Vf／V */
  ffv: number;
}

const positive = (v: number): boolean => Number.isFinite(v) && v > 0;

/** 組成的體積（理想體積加成）：V = Σ n_i·Vm_i、Vf = Σ n_i·(Vm_i − 1.3·VvdW_i)。輸入不是正數時拋出 */
export function compositionVolumes(items: readonly VolumeItem[]): CompositionVolumes {
  if (items.length === 0) throw new Error('組成是空的');
  let moles = 0;
  let vomega = 0;
  let vm = 0;
  for (const it of items) {
    if (!positive(it.moles) || !positive(it.vomega) || !positive(it.vm)) throw new Error('莫耳數、VvdW、Vm 都必須是大於 0 的數字');
    moles += it.moles;
    vomega += it.moles * it.vomega;
    vm += it.moles * it.vm;
  }
  const v0 = BONDI_OCCUPIED_FACTOR * vomega;
  return { moles, vomega, vm, v0, vf: vm - v0, ffv: bondiFfv(vomega, vm) };
}

/** Δf =（Vf_B − Vf_A）／V_A（範例算法：分母只用 A 的體積） */
export const freeVolumeIncrement = (a: CompositionVolumes, b: CompositionVolumes): number => (b.vf - a.vf) / a.vm;

/**
 * Δα = α_l − α_g =（E_l − E_g）／V。E_l、E_g 由任務 036 的 cteFromVw 取得（書的式 4.17、4.18），V 用傳入的 Vm（k 路徑下 V = Vω／k）。
 * 本函式只做「α = E／V」（式 4.9）的除法，不含任何熱膨脹係數。
 */
export function deltaAlphaFromCte(vomega: number, vm: number): number {
  const { rubbery, glassy } = cteFromVw({ vw: vomega, mass: null });
  return (rubbery.molar - glassy.molar) / vm;
}

/** Tg_B 的估算結果（只有改了組成或表外材料才估算） */
export type RelativeTgEstimate =
  | {
      status: 'ok';
      tgK: number;
      tgC: number;
      /** Tg_B − Tg_A（K；與 °C 的差值相同） */
      deltaTgK: number;
      /** 計算用的 Δα（K⁻¹）：預設為 A 的（書的 CTE 模型）；有 Δα 覆寫值 K 時為 1／K */
      deltaAlphaUsed: number;
      alphaSource: 'cte' | 'override';
      /** 固定標示 */
      label: string;
    }
  | { status: 'unavailable'; message: string };

/** 由 Tg_A、Δf 與 Δα（或 Δα 覆寫值 K）算 Tg_B。缺任何一項、或 Δα 覆寫值 K ≤ 0，就不輸出 Tg_B */
export function estimateTgB(tgAK: number | null, deltaF: number | null, deltaAlphaA: number | null, alphaOverride?: number): RelativeTgEstimate {
  if (alphaOverride !== undefined && !positive(alphaOverride)) {
    return { status: 'unavailable', message: `Δα 覆寫值 K 必須是正數（自由體積大者 Tg 低）：${alphaOverride}；不輸出 Tg_B` };
  }
  if (deltaF === null) return { status: 'unavailable', message: '缺 Δf（缺 VW 或缺莫耳體積），不輸出 Tg_B' };
  if (alphaOverride === undefined && (deltaAlphaA === null || !positive(deltaAlphaA))) {
    return { status: 'unavailable', message: 'Δα 算不出來（缺 VW 或缺基團），使用者也沒有輸入 Δα 覆寫值 K：只顯示 FFV 與 Δf，不輸出 Tg_B' };
  }
  if (tgAK === null) return { status: 'unavailable', message: '缺 A 的 Tg（錨點）：請輸入，或選用 k／Tg 表內有 Tg 的材料' };
  const deltaTgK = alphaOverride !== undefined ? -alphaOverride * deltaF : -deltaF / (deltaAlphaA as number);
  const tgK = tgAK + deltaTgK;
  return {
    status: 'ok',
    tgK,
    tgC: toCelsius(tgK),
    deltaTgK,
    deltaAlphaUsed: alphaOverride !== undefined ? 1 / alphaOverride : (deltaAlphaA as number),
    alphaSource: alphaOverride !== undefined ? 'override' : 'cte',
    label: alphaOverride !== undefined ? RELATIVE_TG_OVERRIDE_LABEL : RELATIVE_TG_CTE_LABEL,
  };
}

export interface RelativeTgNumericItem {
  /** 莫耳數（省略視為 1） */
  moles?: number;
  /** VvdW（cm³/mol） */
  vomega: number;
  /** 堆積係數 k（Vm = VvdW／k）；與 vm 擇一 */
  packingK?: number;
  /** Vm（cm³/mol）；與 packingK 擇一 */
  vm?: number;
}

export interface RelativeTgNumericInput {
  a: readonly RelativeTgNumericItem[];
  b: readonly RelativeTgNumericItem[];
  tgA: TemperatureInput;
  /** Δα 覆寫值 K（= 1／Δα，單位 K） */
  alphaOverride?: number;
}

export interface RelativeTgNumericResult {
  a: CompositionVolumes;
  b: CompositionVolumes;
  /** Δf =（Vf_B − Vf_A）／V_A */
  deltaF: number;
  /** Δα_A、Δα_B（書的 CTE 模型；計算用 A 的，B 的供比較） */
  deltaAlphaA: number;
  deltaAlphaB: number;
  tgAK: number;
  tgB: RelativeTgEstimate;
}

function numericItems(items: readonly RelativeTgNumericItem[]): VolumeItem[] {
  return items.map((it) => {
    if ((it.packingK === undefined) === (it.vm === undefined)) throw new Error('每一項必須恰好給堆積係數 k 或 Vm 其中一個');
    if (it.packingK !== undefined && !(it.packingK > 0 && it.packingK < 1)) throw new Error('堆積係數 k 必須在 0 與 1 之間');
    return { moles: it.moles ?? 1, vomega: it.vomega, vm: it.vm ?? vmFromPackingK(it.vomega, it.packingK as number) };
  });
}

/** 純計算：輸入各單體的 VvdW 與堆積係數 k（或 Vm）、莫耳數、A 的 Tg；與手算逐項比對用。輸入不合法時拋出 */
export function relativeTgFromVolumes(input: RelativeTgNumericInput): RelativeTgNumericResult {
  const a = compositionVolumes(numericItems(input.a));
  const b = compositionVolumes(numericItems(input.b));
  const tgAK = toKelvin(input.tgA);
  if (!positive(tgAK)) throw new Error('A 的 Tg 必須高於絕對零度');
  const deltaF = freeVolumeIncrement(a, b);
  const deltaAlphaA = deltaAlphaFromCte(a.vomega, a.vm);
  return { a, b, deltaF, deltaAlphaA, deltaAlphaB: deltaAlphaFromCte(b.vomega, b.vm), tgAK, tgB: estimateTgB(tgAK, deltaF, deltaAlphaA, input.alphaOverride) };
}

export type AlphaOverrideCalibration = { status: 'ok'; alphaOverride: number; label: string } | { status: 'rejected'; message: string };

/**
 * 輔助：由一對 Tg 皆已知的聚合物（A、B）與其 Δf 反推 Δα 覆寫值 K =（Tg_A − Tg_B）／Δf。
 * 回傳標「單一組校正，未經驗證」；Δf 為 0 時拒絕。本函式不讀 k／Tg 表，結果不會自動套用到任何計算或其他家族。
 */
export function calibrateAlphaOverride(tgA: TemperatureInput, tgB: TemperatureInput, deltaF: number): AlphaOverrideCalibration {
  if (!Number.isFinite(deltaF) || deltaF === 0) return { status: 'rejected', message: 'Δf 為 0（或不是數字），無法反推 Δα 覆寫值 K' };
  const a = toKelvin(tgA);
  const b = toKelvin(tgB);
  if (!positive(a) || !positive(b)) return { status: 'rejected', message: 'Tg 必須高於絕對零度' };
  return { status: 'ok', alphaOverride: (a - b) / deltaF, label: RELATIVE_TG_CALIBRATION_LABEL };
}

// ---------- 由結構計算 ----------

export interface RelativeTgMonomerInput {
  /** 材料名稱：用來查 k／Tg 表（精確比對）；不在表內也可以當顯示名稱 */
  name?: string;
  /** 重複單元（含連接點 *）或分子的 SMILES：VvdW、D57 類別、Va、單元質量都由它計算。k 表材料沒有 SMILES 時可省略（只能顯示 FFV = 1 − 1.3k） */
  smiles?: string;
  /** 用量：莫耳數（組成的 basis 為 mol）或質量（basis 為 wt）；A、B 必須用同一基準。省略視為 1 */
  amount?: number;
  /** 使用者直接輸入的堆積係數 k（0 到 1）；優先於 k 表 */
  packingK?: number;
  /** 使用者輸入的密度（g/cm³）；只有在沒有堆積係數 k 時才用 */
  density?: number;
  /** 密度的溫度（°C）；省略視為 25 °C */
  densityTemperatureC?: number;
  /** 均聚物的 Tg（只給 Fox 並列比較用；省略時由 k／Tg 表帶出） */
  homopolymerTg?: TemperatureInput;
}

export interface RelativeTgCompositionInput {
  /** 組成清單；均聚物是只有一項的組成 */
  monomers: readonly RelativeTgMonomerInput[];
  /** amount 的單位：mol（預設）或 wt（質量；以結構單元質量換成莫耳數） */
  basis?: 'mol' | 'wt';
  /** Mn（選填）：只用來顯示 A、B 的 Mn 比值 */
  mn?: number;
}

export interface RelativeTgInput {
  /** A：已知 Tg 的那個（均聚物或共聚物） */
  a: RelativeTgCompositionInput;
  b: RelativeTgCompositionInput;
  /** A 的 Tg（錨點）。省略時，若 A 是 k／Tg 表內的單一材料，由表帶出 */
  tgA?: TemperatureInput;
  /** Δα 覆寫值 K（= 1／Δα，單位 K）；使用者校正過的值優先於書的 CTE 模型 */
  alphaOverride?: number;
}

export interface RelativeTgOptions {
  /** k／Tg 表（測試用；省略用內建的表） */
  rows?: readonly PackingKRow[];
}

export interface RelativeTgMissing {
  side: 'A' | 'B';
  monomer: string;
  what: 'VW' | 'Vm';
  message: string;
  /** 缺 VW 時配不到基團的原子 */
  atoms?: VwMissingAtom[];
}

export interface RelativeTgMonomerResult {
  /** 顯示用的標籤：名稱，沒有名稱時為 SMILES */
  label: string;
  name: string | null;
  smiles: string | null;
  /** 含連接點 *（重複單元）；沒有結構時為 null */
  polymer: boolean | null;
  amount: number;
  /** 莫耳數（basis 為 wt 時 = 質量 ÷ 結構單元質量）；算不出時為 null */
  moles: number | null;
  /** VvdW（cm³/mol，現有 VW 函式）；缺時為 null */
  vomega: number | null;
  /** VvdW 含 Bondi 補充基團（非書值） */
  vwBondiSupplement: boolean;
  /** 堆積係數 k 與來源（使用者輸入、k 表、D57 類別預設） */
  packingK: number | null;
  packingKSource: 'user' | 'table' | 'class' | null;
  /** Vm（cm³/mol）與來源 */
  vm: number | null;
  vmSource: VmSource | null;
  vmLabel: string | null;
  /** Vm 的溫度基準（K）：Va 為 298、密度為使用者指定；堆積係數 k 的溫度基準使用者未註明，為 null */
  vmTemperatureK: number | null;
  /** Vf = Vm − 1.3 × VvdW（cm³/mol） */
  vf: number | null;
  /** Bondi 型 FFV；只有堆積係數 k、沒有 VvdW 時為 1 − 1.3k */
  ffv: number | null;
  /** k／Tg 表的結構類別（判斷結構家族用）；不在表內為 null */
  family: string | null;
  notes: string[];
}

export interface RelativeTgSide {
  monomers: RelativeTgMonomerResult[];
  /** 全部單體都有莫耳數、VvdW 與 Vm 時才有 */
  volumes: CompositionVolumes | null;
  /** Bondi 型 FFV */
  ffv: number | null;
  /** volume：由體積加成算出；packingK：單一材料只有堆積係數 k（1 − 1.3k）；moleWeighted：有單體缺 VvdW，以 Σ x_i·FFV_i 近似（標「莫耳加權近似」） */
  ffvBasis: 'volume' | 'packingK' | 'moleWeighted' | null;
  /** Δα = α_l − α_g（書的 CTE 模型；K⁻¹） */
  deltaAlpha: number | null;
  /** 重複單元、小分子、或沒有結構 */
  kind: 'polymer' | 'small' | null;
}

export type RelativeTgAnchor =
  | { status: 'ok'; tgK: number; tgC: number; source: 'user' | 'table'; raw: string | null; labels: string[] }
  | { status: 'missing'; message: string };

export type RelativeTgB =
  | RelativeTgEstimate
  | { status: 'table'; material: string; tgC: number; tgK: number; lowerC: number; upperC: number; raw: string; labels: string[]; message: string }
  | { status: 'tableBlank'; material: string; raw: string; message: string }
  | { status: 'notApplicable'; message: string };

export type FoxComparison =
  | { status: 'ok'; tgK: number; tgC: number; label: string; model: string; components: { label: string; massFraction: number; tgK: number; tgSource: 'user' | 'table'; labels: string[] }[] }
  | { status: 'unavailable'; label: string; message: string };

export type RelativeTgRejectCode = 'INVALID_INPUT' | 'INVALID_STRUCTURE' | 'BASIS_MISMATCH' | 'TEMPERATURE_MISMATCH';

export type RelativeTgResult =
  | {
      /** ok：體積都算得出來（Δf 可算）；missing：缺 VW 或缺莫耳體積，只顯示算得出來的 FFV */
      status: 'ok' | 'missing';
      a: RelativeTgSide;
      b: RelativeTgSide;
      /** Δf =（Vf_B − Vf_A）／V_A；算不出、或 B 為小分子時為 null */
      deltaF: number | null;
      tgA: RelativeTgAnchor;
      tgB: RelativeTgB;
      /** Mn_B／Mn_A；沒有同時輸入兩者時為 null */
      mnRatio: number | null;
      /** Fox 混合式的並列比較（B 有兩個以上單體時才有）；與本法獨立 */
      fox: FoxComparison | null;
      missing: RelativeTgMissing[];
      warnings: string[];
      notes: string[];
      model: string;
      disclaimer: string;
      confidence: string;
      unifiedNote: string;
    }
  | { status: 'rejected'; code: RelativeTgRejectCode; message: string };

interface MonomerEval {
  result: RelativeTgMonomerResult;
  /** 結構單元質量（g/mol）；只供內部換算，不輸出（D09） */
  mass: number | null;
  row: PackingKRow | null;
  input: RelativeTgMonomerInput;
  missing: Omit<RelativeTgMissing, 'side' | 'monomer'>[];
}

interface SideEval {
  side: RelativeTgSide;
  monomers: MonomerEval[];
  basis: 'mol' | 'wt';
}

type Rejection = { rejected: { code: RelativeTgRejectCode; message: string } };
const reject = (code: RelativeTgRejectCode, message: string): Rejection => ({ rejected: { code, message } });

function evaluateMonomer(RDKit: RDKitModule, m: RelativeTgMonomerInput, basis: 'mol' | 'wt', rows: readonly PackingKRow[]): MonomerEval | Rejection {
  const name = m.name !== undefined && m.name !== '' ? m.name : null;
  const smiles = m.smiles !== undefined && m.smiles.trim() !== '' ? m.smiles : null;
  if (name === null && smiles === null) return reject('INVALID_INPUT', '單體沒有材料名稱，也沒有結構（SMILES）');
  const label = name ?? (smiles as string);
  const amount = m.amount ?? 1;
  if (!positive(amount)) return reject('INVALID_INPUT', `「${label}」的用量必須是大於 0 的數字：${amount}`);
  if (m.packingK !== undefined && !(Number.isFinite(m.packingK) && m.packingK > 0 && m.packingK < 1)) return reject('INVALID_INPUT', `「${label}」的堆積係數 k 必須在 0 與 1 之間：${m.packingK}`);
  if (m.density !== undefined && !positive(m.density)) return reject('INVALID_INPUT', `「${label}」的密度必須是大於 0 的數字：${m.density}`);

  const notes: string[] = [];
  const missing: MonomerEval['missing'] = [];
  let polymer: boolean | null = null;
  let vomega: number | null = null;
  let mass: number | null = null;
  let vwBondiSupplement = false;

  // ---- VvdW：現有書的 VW 計算（任務 028／031／037／037a），不重寫 ----
  if (smiles !== null) {
    const vw = computeVdwVolume(RDKit, smiles);
    if (vw.status === 'invalid') return reject('INVALID_STRUCTURE', `「${label}」：${vw.message}`);
    polymer = vw.polymer;
    if (vw.status === 'ok') {
      vomega = vw.vw;
      mass = vw.formulaMass;
      vwBondiSupplement = vw.bondiSupplement;
      if (vw.bondiSupplement) notes.push(`VvdW ${vw.bondiNotes.join('；')}`);
    } else {
      missing.push({ what: 'VW', message: '缺 VW：書的 Table 4.2（含 Bondi 補充）缺基團，不計算、不猜值', atoms: vw.missing });
    }
  } else {
    missing.push({ what: 'VW', message: '缺 VW：沒有結構（k／Tg 表不含 SMILES），請提供重複單元的 SMILES' });
  }

  // ---- 堆積係數 k：使用者輸入 ＞ k 表（名稱精確比對）＞ D57 類別預設 ----
  const row = name !== null ? findPackingKRow(name, rows) : null;
  let packingK: number | null = null;
  let packingKSource: RelativeTgMonomerResult['packingKSource'] = null;
  if (m.packingK !== undefined) {
    packingK = m.packingK;
    packingKSource = 'user';
  } else if (row !== null) {
    packingK = row.packingK;
    packingKSource = 'table';
  } else {
    if (name !== null) notes.push(`${PACKING_K_NOT_FOUND}：${name}`);
    if (smiles !== null) {
      const fv = computeFreeVolumeUnit(RDKit, smiles);
      if (fv.status === 'ok') {
        packingK = packingKFromClassCoefficient(fv.coefficient.coefficient);
        packingKSource = 'class';
        notes.push(`類別預設，非材料值（D57 類別「${fv.coefficient.name}」，係數 c = ${fv.coefficient.coefficient}，堆積係數 k = 1／(c + 1.3)）`);
      } else {
        notes.push('D57 結構類別辨識不出（使用者經驗自由體積法的基團表缺基團），沒有類別預設的堆積係數 k');
      }
    }
  }

  // ---- Vm：堆積係數 k ＞ 使用者密度 ＞ Va ----
  let vm: number | null = null;
  let vmSource: VmSource | null = null;
  let vmTemperatureK: number | null = null;
  if (packingK !== null) {
    vmSource = packingKSource === 'user' ? 'userK' : packingKSource === 'table' ? 'tableK' : 'classK';
    if (vomega !== null) vm = vmFromPackingK(vomega, packingK);
    if (m.density !== undefined) notes.push('已輸入密度，但堆積係數 k 優先（取得順序：堆積係數 k ＞ 密度 ＞ Va），密度沒有使用');
  } else if (m.density !== undefined && mass !== null) {
    vm = mass / m.density;
    vmSource = 'density';
    vmTemperatureK = (m.densityTemperatureC ?? DEFAULT_DENSITY_TEMPERATURE_C) + KELVIN_OFFSET;
  } else if (smiles !== null) {
    const va = computeMolarVolumeDensity(RDKit, smiles);
    if (va.status === 'ok' && va.amorphous) {
      vm = va.amorphous.vm;
      vmSource = 'va';
      vmTemperatureK = VA_TEMPERATURE_K;
    }
  }
  if (vmSource === null) {
    missing.push({ what: 'Vm', message: '缺莫耳體積：缺堆積係數 k（不在 k／Tg 表、沒有輸入 k、D57 類別辨識不出），也沒有使用者密度與 Va；不能把 VvdW 當 FFV 的替代' });
  }

  const vf = vomega !== null && vm !== null ? vm - BONDI_OCCUPIED_FACTOR * vomega : null;
  const ffv = vomega !== null && vm !== null ? bondiFfv(vomega, vm) : packingK !== null ? ffvFromPackingK(packingK) : null;
  const moles = basis === 'mol' ? amount : mass !== null ? amount / mass : null;

  return {
    result: {
      label,
      name,
      smiles,
      polymer,
      amount,
      moles,
      vomega,
      vwBondiSupplement,
      packingK,
      packingKSource,
      vm,
      vmSource,
      vmLabel: vmSource === null ? null : VM_SOURCE_LABELS[vmSource],
      vmTemperatureK,
      vf,
      ffv,
      family: row?.category ?? null,
      notes,
    },
    mass,
    row,
    input: m,
    missing,
  };
}

function evaluateSide(RDKit: RDKitModule, comp: RelativeTgCompositionInput, sideName: string, rows: readonly PackingKRow[]): SideEval | Rejection {
  if (comp.monomers.length === 0) return reject('INVALID_INPUT', `${sideName}：組成是空的`);
  const basis = comp.basis ?? 'mol';
  if (basis !== 'mol' && basis !== 'wt') return reject('INVALID_INPUT', `${sideName}：用量的單位只能是 mol 或 wt`);
  if (comp.mn !== undefined && !positive(comp.mn)) return reject('INVALID_INPUT', `${sideName}：Mn 必須是大於 0 的數字：${comp.mn}`);
  const monomers: MonomerEval[] = [];
  for (const m of comp.monomers) {
    const e = evaluateMonomer(RDKit, m, basis, rows);
    if ('rejected' in e) return reject(e.rejected.code, `${sideName}：${e.rejected.message}`);
    monomers.push(e);
  }
  const results = monomers.map((e) => e.result);
  const flags = results.map((r) => r.polymer).filter((p): p is boolean => p !== null);
  if (flags.includes(true) && flags.includes(false)) {
    return reject('BASIS_MISMATCH', `${sideName}：組成同時有重複單元（含連接點 *）與小分子，Vm 的基準不同（重複單元與分子），不計算`);
  }
  const kind: RelativeTgSide['kind'] = flags.length === 0 ? null : flags[0] ? 'polymer' : 'small';

  let volumes: CompositionVolumes | null = null;
  let ffv: number | null = null;
  let ffvBasis: RelativeTgSide['ffvBasis'] = null;
  let deltaAlpha: number | null = null;
  if (results.every((r) => r.moles !== null && r.vomega !== null && r.vm !== null)) {
    volumes = compositionVolumes(results.map((r) => ({ moles: r.moles as number, vomega: r.vomega as number, vm: r.vm as number })));
    ffv = volumes.ffv;
    ffvBasis = 'volume';
    deltaAlpha = deltaAlphaFromCte(volumes.vomega, volumes.vm);
  } else if (results.length === 1 && results[0].packingK !== null) {
    // 單一材料只有堆積係數 k、缺 VvdW：FFV = 1 − 1.3k（VvdW 消掉）；Δα 依任務卡視為缺（缺 VW），不輸出
    ffv = ffvFromPackingK(results[0].packingK);
    ffvBasis = 'packingK';
  } else if (results.every((r) => r.ffv !== null && r.moles !== null)) {
    // 有單體缺 VvdW：以莫耳分率加權 Σ x_i·FFV_i 近似（只供顯示，Δf 仍缺）
    const total = results.reduce((s, r) => s + (r.moles as number), 0);
    ffv = results.reduce((s, r) => s + ((r.moles as number) / total) * (r.ffv as number), 0);
    ffvBasis = 'moleWeighted';
  }
  return { side: { monomers: results, volumes, ffv, ffvBasis, deltaAlpha, kind }, monomers, basis };
}

const sameMonomer = (x: RelativeTgMonomerResult, y: RelativeTgMonomerResult): boolean =>
  (x.name !== null && x.name === y.name) || (x.smiles !== null && x.smiles === y.smiles);

/** 結構家族的警示（只警示，不阻擋）：家族判斷用 k／Tg 表的「結構類別」欄 */
function familyWarnings(a: RelativeTgSide, b: RelativeTgSide): string[] {
  const out: string[] = [];
  const aFamilies = new Set(a.monomers.map((m) => m.family).filter((f): f is string => f !== null));
  const aAllKnown = a.monomers.every((m) => m.family !== null);
  for (const mb of b.monomers) {
    if (a.monomers.some((ma) => sameMonomer(ma, mb))) continue;
    if (mb.family !== null && aFamilies.has(mb.family)) continue;
    if (mb.family !== null && aAllKnown) {
      out.push(`B 的單體「${mb.label}」（結構類別：${mb.family}）與 A（${[...aFamilies].join('、')}）不在同一結構家族：Δα（含 Δα 覆寫值 K）可能不適用`);
    } else {
      out.push(`無法判斷 B 的單體「${mb.label}」與 A 是否同一結構家族（不在 k／Tg 表，沒有結構類別）：Δα（含 Δα 覆寫值 K）可能不適用`);
    }
  }
  return out;
}

/** Fox 混合式的並列比較（重用任務 034 的 foxMix）：各均聚物 Tg 由使用者輸入或 k／Tg 表帶出；與本法獨立，不混進本法結果 */
function foxComparison(b: SideEval): FoxComparison | null {
  if (b.monomers.length < 2) return null;
  const unavailable = (message: string): FoxComparison => ({ status: 'unavailable', label: RELATIVE_TG_FOX_LABEL, message });
  const components: { label: string; mass: number; tgK: number; tgSource: 'user' | 'table'; labels: string[] }[] = [];
  for (const e of b.monomers) {
    const r = e.result;
    const massAmount = b.basis === 'wt' ? r.amount : r.moles !== null && e.mass !== null ? r.moles * e.mass : null;
    if (massAmount === null) return unavailable(`缺「${r.label}」的結構單元質量（沒有結構或缺基團），算不出質量分率`);
    if (e.input.homopolymerTg !== undefined) {
      const tgK = toKelvin(e.input.homopolymerTg);
      if (!positive(tgK)) return unavailable(`「${r.label}」的均聚物 Tg 必須高於絕對零度`);
      components.push({ label: r.label, mass: massAmount, tgK, tgSource: 'user', labels: [] });
      continue;
    }
    const t = e.row === null ? null : tableTgOf(e.row);
    if (t === null || t.status !== 'ok') return unavailable(`缺「${r.label}」的均聚物 Tg（${t === null ? PACKING_K_NOT_FOUND : t.message}），請輸入`);
    components.push({ label: r.label, mass: massAmount, tgK: t.tgC + KELVIN_OFFSET, tgSource: 'table', labels: t.labels });
  }
  const total = components.reduce((s, c) => s + c.mass, 0);
  const tgK = foxMix(components.map((c) => ({ w: c.mass, tgK: c.tgK })));
  return {
    status: 'ok',
    tgK,
    tgC: toCelsius(tgK),
    label: RELATIVE_TG_FOX_LABEL,
    model: FOX_MIX_MODEL,
    components: components.map((c) => ({ label: c.label, massFraction: c.mass / total, tgK: c.tgK, tgSource: c.tgSource, labels: c.labels })),
  };
}

const fmt = (v: number, digits = 4): string => String(Number(v.toPrecision(digits)));

/**
 * 簡易 Tg 相對估算（結構輸入）。A、B 各為組成清單（均聚物只有一項）；任意比例、換單體、增減單元都用同一個算式：
 * Δf =（Vf_B − Vf_A）／V_A、Tg_B = Tg_A − Δf／Δα。
 */
export function relativeTg(RDKit: RDKitModule, input: RelativeTgInput, options: RelativeTgOptions = {}): RelativeTgResult {
  const rows = options.rows ?? PACKING_K_ROWS;
  let tgAUser: number | null = null;
  if (input.tgA !== undefined) {
    tgAUser = toKelvin(input.tgA);
    if (!positive(tgAUser)) return { status: 'rejected', code: 'INVALID_INPUT', message: `A 的 Tg 必須是高於絕對零度的數字：${input.tgA.value} ${input.tgA.unit === 'K' ? 'K' : '°C'}` };
  }
  const ea = evaluateSide(RDKit, input.a, 'A', rows);
  if ('rejected' in ea) return { status: 'rejected', ...ea.rejected };
  const eb = evaluateSide(RDKit, input.b, 'B', rows);
  if ('rejected' in eb) return { status: 'rejected', ...eb.rejected };
  const a = ea.side;
  const b = eb.side;

  // ---- 基準檢查：重複單元／分子、Vm 的溫度 ----
  if (a.kind === 'small' && b.kind === 'polymer') {
    return { status: 'rejected', code: 'BASIS_MISMATCH', message: 'A 是小分子、B 是重複單元：A、B 的單位基準不同（分子與重複單元），不計算' };
  }
  const temps = [...a.monomers, ...b.monomers].map((m) => m.vmTemperatureK).filter((t): t is number => t !== null);
  if (temps.length > 0 && Math.max(...temps) - Math.min(...temps) > VM_TEMPERATURE_TOLERANCE_K) {
    return {
      status: 'rejected',
      code: 'TEMPERATURE_MISMATCH',
      message: `A、B 的 Vm 溫度基準不同（${fmt(Math.min(...temps), 5)} K 與 ${fmt(Math.max(...temps), 5)} K）：必須用同一溫度的 Vm，不計算`,
    };
  }

  const warnings: string[] = [];
  const notes: string[] = [RELATIVE_TG_INCREMENT_NOTE, RELATIVE_TG_FFV_NOTE];
  const missing: RelativeTgMissing[] = [
    ...ea.monomers.flatMap((e) => e.missing.map((x) => ({ side: 'A' as const, monomer: e.result.label, ...x }))),
    ...eb.monomers.flatMap((e) => e.missing.map((x) => ({ side: 'B' as const, monomer: e.result.label, ...x }))),
  ];
  const all = [...a.monomers, ...b.monomers];
  if (temps.length > 0 && all.some((m) => m.vmSource !== null && m.vmTemperatureK === null)) {
    warnings.push('Vm 的來源不一致：堆積係數 k 的溫度基準使用者未註明，無法確認與 298 K 的 Va 或使用者密度是同一溫度');
  }
  if (all.some((m) => m.vmSource === 'va')) warnings.push(RELATIVE_TG_VA_WARNING);
  for (const m of all) if (m.ffv !== null && m.ffv <= 0) warnings.push(`「${m.label}」的 Bondi 型 FFV 不是正數（Vm 不大於 1.3 × VvdW）`);
  for (const s of [a, b]) if (s.ffvBasis === 'moleWeighted') notes.push(`${s === a ? 'A' : 'B'} 的 FFV 為${RELATIVE_TG_MOLE_WEIGHTED_LABEL}（有單體缺 VvdW，以 Σ x_i·FFV_i 計）`);

  // ---- A 的 Tg（錨點）：使用者輸入優先；否則由 k／Tg 表帶出 ----
  let tgA: RelativeTgAnchor;
  const aRow = ea.monomers.length === 1 ? ea.monomers[0].row : null;
  if (tgAUser !== null) {
    tgA = { status: 'ok', tgK: tgAUser, tgC: toCelsius(tgAUser), source: 'user', raw: null, labels: ['使用者輸入的錨點'] };
  } else if (aRow !== null) {
    const t = tableTgOf(aRow);
    tgA = t.status === 'ok' ? { status: 'ok', tgK: t.tgC + KELVIN_OFFSET, tgC: t.tgC, source: 'table', raw: t.raw, labels: ['由 k／Tg 表帶出', ...t.labels] } : { status: 'missing', message: t.message };
  } else {
    tgA = { status: 'missing', message: '缺 A 的 Tg（錨點）：請輸入（A 不是 k／Tg 表內的單一材料，無法由表帶出）' };
  }

  // ---- Δf 與 Tg_B ----
  const bSmall = b.kind === 'small';
  const deltaF = !bSmall && a.volumes !== null && b.volumes !== null ? freeVolumeIncrement(a.volumes, b.volumes) : null;
  const bRow = eb.monomers.length === 1 ? eb.monomers[0].row : null;
  let tgB: RelativeTgB;
  if (bSmall) {
    tgB = { status: 'notApplicable', message: RELATIVE_TG_SMALL_MOLECULE };
    if (a.kind === 'polymer') notes.push('A 是重複單元、B 是小分子：單位基準不同，只顯示各自的 FFV，不計算 Δf');
  } else if (bRow !== null) {
    const t = tableTgOf(bRow);
    tgB =
      t.status === 'ok'
        ? { status: 'table', material: bRow.name, tgC: t.tgC, tgK: t.tgC + KELVIN_OFFSET, lowerC: t.lowerC, upperC: t.upperC, raw: t.raw, labels: t.labels, message: RELATIVE_TG_TABLE_B_NOTE }
        : { status: 'tableBlank', material: bRow.name, raw: t.raw, message: `${t.message}（B 是 k／Tg 表內的材料且組成沒改：不以其他材料的 Tg 估算）` };
  } else {
    tgB = estimateTgB(tgA.status === 'ok' ? tgA.tgK : null, deltaF, a.deltaAlpha, input.alphaOverride);
    if (tgB.status === 'unavailable' && input.alphaOverride !== undefined && !positive(input.alphaOverride)) warnings.push(tgB.message);
    if (tgB.status === 'ok') warnings.push(...familyWarnings(a, b));
  }

  // ---- 其他標示 ----
  if (a.volumes !== null && b.volumes !== null && !bSmall) {
    const ratio = b.volumes.moles / a.volumes.moles;
    notes.push(
      Math.abs(ratio - 1) < 1e-9
        ? `A、B 的總莫耳數相同（${fmt(a.volumes.moles)}）：等莫耳的組成比較`
        : `B 的總莫耳數（${fmt(b.volumes.moles)}）與 A（${fmt(a.volumes.moles)}）不同：依範例算法視為在 A 之外增減單元，分母只用 A 的體積`,
    );
  }
  const mnRatio = input.a.mn !== undefined && input.b.mn !== undefined ? input.b.mn / input.a.mn : null;
  notes.push(mnRatio === null ? RELATIVE_TG_MN_UNCHECKED : `Mn 比值（B／A）= ${fmt(mnRatio)}（沒有設定門檻，是否相近由使用者判斷）`);

  return {
    status: missing.length === 0 ? 'ok' : 'missing',
    a,
    b,
    deltaF,
    tgA,
    tgB,
    mnRatio,
    fox: foxComparison(eb),
    missing,
    warnings,
    notes,
    model: RELATIVE_TG_MODEL,
    disclaimer: RELATIVE_TG_DISCLAIMER,
    confidence: RELATIVE_TG_CONFIDENCE,
    unifiedNote: UNIFIED_NOTE,
  };
}

/** 單一組成的 VvdW、Vm、Bondi 型 FFV、Δα（批次輸出用；沒有 A、B 比較，也不給 Tg） */
export function evaluateRelativeTgComposition(RDKit: RDKitModule, composition: RelativeTgCompositionInput, options: RelativeTgOptions = {}): { status: 'ok'; side: RelativeTgSide; missing: Omit<RelativeTgMissing, 'side'>[] } | { status: 'rejected'; code: RelativeTgRejectCode; message: string } {
  const e = evaluateSide(RDKit, composition, '輸入', options.rows ?? PACKING_K_ROWS);
  if ('rejected' in e) return { status: 'rejected', ...e.rejected };
  return { status: 'ok', side: e.side, missing: e.monomers.flatMap((m) => m.missing.map((x) => ({ monomer: m.result.label, ...x }))) };
}
