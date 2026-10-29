// 配方的資料模型與換算結果型別（任務 013，Phase 3）。純 TypeScript，不可引用 React。
// 分子量由呼叫端（RDKit）算好後傳入，只用於計算，不放進任何結果型別（D09）。
import type { PolymerSpec } from '../polymer/types';
import type { CalcResult } from '../result';

export const FORMULATION_SCHEMA_VERSION = 1;

export const SOLID_CATEGORIES = [
  'Resin',
  'Crosslinker',
  'Catalyst/Initiator',
  'Small Molecule',
  'Surfactant',
  'Additive',
  'Other',
] as const; // D26
export const LIQUID_CATEGORIES = ['Solvent', 'Co-solvent', 'Other Liquid'] as const;

export type SolidCategory = (typeof SOLID_CATEGORIES)[number];
export type LiquidCategory = (typeof LIQUID_CATEGORIES)[number];

/** g、parts（重量份）、wt（wt%）、mol（mol%）、phr（僅 Solid）、vol（vol%，僅 Liquid，本階段不支援） */
export type SolidUnit = 'g' | 'parts' | 'wt' | 'mol' | 'phr';
export type LiquidUnit = 'g' | 'parts' | 'wt' | 'mol' | 'vol';
export type AreaName = 'solid' | 'liquid';

export interface Component<Category extends string = string> {
  id: string;
  name: string;
  /** RDKit canonical SMILES；含 `*` 表示聚合物重複單元 */
  canonicalSmiles: string;
  category: Category;
  /** 依該區單位的數值（NaN 或非有限值視為輸入錯誤） */
  amount: number;
  /** 僅 Solid：是否計入 phr 的樹脂（使用者勾選，D37） */
  isResin?: boolean;
  /** 僅 Solid：是否在指定條件下揮發或分解 */
  volatileFlag?: boolean;
  /** 若來自「我的化合物」 */
  compoundId?: string;
  /** 使用者畫的 2D Molfile（若有）；讓配方檔不依賴化合物庫也能完整還原 */
  molfile?: string;
  /**
   * 均聚物設定（任務 015，D42）：canonicalSmiles 是含兩個連接點的重複單元，Mn 或 DP 擇一。
   * 聚合物成分以 Mn 作為「每分子質量」傳入核心（見 MolecularWeights），但核心不用它算 mol%（U02 尚未決定），
   * 只供之後任務 017 計算官能度使用。
   */
  polymer?: PolymerSpec;
}

export interface Area<Unit extends string, Category extends string> {
  /** 每一區使用同一種輸入單位（D36） */
  unit: Unit;
  components: Component<Category>[];
}

export interface Formulation {
  schemaVersion: 1;
  name: string;
  solid: Area<SolidUnit, SolidCategory>;
  liquid: Area<LiquidUnit, LiquidCategory>;
  /** Solid 總重（g） */
  solidTotalG?: number;
  /** Liquid 總重（g） */
  liquidTotalG?: number;
  /** 目標 Solid Content（%），0 < 值 < 100 */
  targetSolidContentPct?: number;
}

/**
 * 呼叫端傳入：成分 id → 每分子質量（g/mol）。小分子為平均分子量；聚合物為 Mn（每條鏈）。
 * 聚合物的值不會用來算 mol%（含 `*` 的成分一律排除，U02），只保留給官能度計算（任務 017）。
 */
export type MolecularWeights = Readonly<Record<string, number | undefined>>;

// ---------- 錯誤與警告 ----------

export type IssueCode =
  | 'INVALID_AMOUNT'
  | 'INVALID_TOTAL'
  | 'INVALID_UNIT'
  | 'INVALID_CATEGORY'
  | 'DUPLICATE_ID'
  | 'EMPTY_AREA_WITH_SETTINGS'
  | 'ZERO_TOTAL'
  | 'SUM_NOT_100'
  | 'NO_RESIN'
  | 'PHR_IN_LIQUID'
  | 'VOL_IN_SOLID'
  | 'VOL_NOT_SUPPORTED'
  | 'MISSING_MW'
  | 'POLYMER_MOL_BASIS'
  | 'TARGET_OUT_OF_RANGE'
  | 'TARGET_NEEDS_SOLID_MASS'
  | 'SOLID_CONTENT_NEEDS_TOTAL'
  | 'TOTAL_IGNORED'
  | 'MOL_UNAVAILABLE';

export interface FormulationIssue {
  area: AreaName | 'formulation';
  componentId?: string;
  code: IssueCode;
  message: string;
}

// ---------- 結果 ----------

export interface ComponentResult {
  id: string;
  name: string;
  /** 質量（g）；該區總重未知時為 null */
  massG: CalcResult | null;
  wtPct: CalcResult;
  /** 不適用（含 `*`、缺分子量）時 value 為 null 並附原因 */
  molPct: CalcResult;
  /** 僅 Solid 區且有勾選樹脂時 */
  phr: CalcResult | null;
}

export interface AreaResult {
  unit: string;
  components: ComponentResult[];
}

export interface TargetSolidContentResult {
  /** 達到目標 Solid Content 所需的 Liquid 總質量（g；Solid 只有相對質量時為重量份） */
  liquidTotal: CalcResult;
  /** 依 Liquid 區組成分配到各成分；Liquid 區沒有成分（或有錯誤）時為空 */
  liquidComponents: { id: string; name: string; mass: CalcResult }[];
}

export interface OverallResult {
  solidMass: CalcResult;
  liquidMass: CalcResult;
  totalMass: CalcResult;
  /** Solid Content（全部） */
  solidContent: CalcResult;
  /** Solid Content（扣除標記為揮發或分解的成分） */
  solidContentExcludingVolatile: CalcResult;
  target: TargetSolidContentResult | null;
}

export interface FormulationResults {
  /** 該區有錯誤時為 null（另一區不受影響） */
  solid: AreaResult | null;
  liquid: AreaResult | null;
  overall: OverallResult;
}

export interface FormulationOutcome {
  results: FormulationResults;
  errors: FormulationIssue[];
  warnings: FormulationIssue[];
}
