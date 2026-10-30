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
  /** 若來自「化合物庫」 */
  compoundId?: string;
  /** 使用者畫的 2D Molfile（若有）；讓配方檔不依賴化合物庫也能完整還原 */
  molfile?: string;
  /**
   * 均聚物設定（任務 015、019，D42、D47）：canonicalSmiles 是含兩個連接點的重複單元，Mw、Mn 或 DP 擇一，PDI 選填。
   * 聚合物的 mol% 依 Formulation.polymerMolBasis 換算（D46）：整條鏈以 Mn 計，重複單元以 M_unit 計。
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
  /** 聚合物 mol% 的基準（D46）：chain＝整條鏈（預設）、unit＝重複單元；省略視為 chain */
  polymerMolBasis?: PolymerMolBasis;
  /**
   * 使用目標固含量（targetSolidContentPct）自動計算 Liquid 用量（任務 020 後續）：Liquid 區各成分的 amount 只是溶劑間的相對比例
   * （只有一種溶劑時忽略），實際用量由 Solid 質量與目標計算。省略（舊檔）＝照原本規則，Liquid 用量由使用者填寫。
   */
  liquidFromTarget?: boolean;
  /** 目標固含量對應的 Solid Content（D49）：all＝全部（預設）、excludingVolatile＝扣除標記為揮發／分解的成分；舊檔省略視為 all */
  targetSolidContentBasis?: TargetBasis;
}

export type TargetBasis = 'all' | 'excludingVolatile';

/** 聚合物 mol% 的基準：chain＝莫耳數 = 質量 ÷ Mn；unit＝莫耳數 = 質量 ÷ 重複單元分子量（D46） */
export type PolymerMolBasis = 'chain' | 'unit';

export const POLYMER_MOL_NOTE: Record<PolymerMolBasis, string> = {
  chain: '聚合物 mol% 以整條鏈（Mn）計',
  unit: '聚合物 mol% 以重複單元計',
};

/**
 * 呼叫端傳入：成分 id → 每分子質量（g/mol）。小分子為平均分子量；聚合物為 Mn（每條鏈）。
 * 聚合物以重複單元計 mol% 時，另由 ComputeOptions.unitWeights 傳入重複單元分子量。
 */
export type MolecularWeights = Readonly<Record<string, number | undefined>>;

export interface ComputeOptions {
  /** 聚合物（含 `*`）成分 id → 重複單元分子量（g/mol）；polymerMolBasis 為 unit 時使用 */
  unitWeights?: MolecularWeights;
}

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
  | 'TARGET_OUT_OF_RANGE'
  | 'TARGET_UNREACHABLE'
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
  /** 區內有聚合物且 mol% 有輸出（或以 mol% 輸入）時的基準附註（D46）；否則 null */
  polymerMolNote: string | null;
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
  /** 使用目標固含量時，程式算出的 Liquid 各成分用量（單位：Solid 已知質量為 g，否則為每 100 份固體的重量份）；否則 null */
  liquidFromTarget: { unit: string; basisNote: string; amounts: Record<string, number> } | null;
  results: FormulationResults;
  errors: FormulationIssue[];
  warnings: FormulationIssue[];
}
