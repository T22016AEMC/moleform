// 均聚物的資料模型（任務 015，D42）。純資料，不含 React。
// 重複單元以 SMILES／Molfile 表示，兩個連接點用 `*` 標記（`[*:1]`、`[*:2]`，或兩個未編號的 `*`，D31）。
// 分子量以 Mw＋PDI 為主要輸入（任務 019，D47）；也可改填 Mn 或 DP（數量平均）。mwInput、mnInput、dpInput 擇一，
// pdiInput 選填（沒填時以 DEFAULT_PDI 計算）。共聚物、端基屬於 Phase 5，本階段忽略端基。

/** 沒有 PDI 時的預設值（D47） */
export const DEFAULT_PDI = 2;

/**
 * 使用者輸入的聚合物設定：mwInput、mnInput、dpInput 擇一。
 * 舊資料（任務 015–018 存下的檔案）只有 mnInput 或 dpInput，沒有 pdiInput，讀入時視為「PDI 未填（預設 2）」。
 */
export interface PolymerSpec {
  /** 重量平均分子量 Mw（g/mol），使用者輸入（主要輸入方式） */
  mwInput?: number;
  /** 數量平均分子量 Mn（g/mol），使用者輸入 */
  mnInput?: number;
  /** 數量平均聚合度 DP_n（重複單元數），使用者輸入 */
  dpInput?: number;
  /** 多分散指數 PDI = Mw／Mn（≥ 1）；省略時使用 DEFAULT_PDI */
  pdiInput?: number;
  /**
   * Random 共聚物（任務 020，D04）：所有重複單元與比例（含第一種單元，其 smiles 與成分的 canonicalSmiles 相同）。
   * 省略＝均聚物（只有成分的 canonicalSmiles 一種單元，100 mol%）；只有一種單元的共聚物與均聚物結果完全相同。
   */
  units?: PolymerUnit[];
  /** units 的比例基準（mol%／wt%）；省略視為 mol */
  fractionBasis?: FractionBasis;
}

/** 共聚物的一種重複單元：含兩個連接點的 SMILES 與比例（依 fractionBasis，合計 100） */
export interface PolymerUnit {
  smiles: string;
  fraction: number;
}

export type FractionBasis = 'mol' | 'wt';

/** 結果附註：共聚物的組成分布近似（任務 020） */
export const COPOLYMER_NOTE = '共聚物以平均組成計算，未考慮鏈間組成分布';

export interface Homopolymer extends PolymerSpec {
  name: string;
  /** 含兩個連接點的重複單元 SMILES */
  repeatUnitSmiles: string;
}

/** 結果附註：目前不處理端基（Phase 5） */
export const END_GROUP_NOTE = '未計入端基';

export type RepeatUnitProblemCode =
  | 'UNPARSABLE'
  | 'NO_ATTACHMENT'
  | 'TOO_FEW_ATTACHMENTS'
  | 'TOO_MANY_ATTACHMENTS'
  | 'DANGLING_ATTACHMENT'
  | 'ATTACHMENT_TO_ATTACHMENT'
  | 'BAD_NUMBERING'
  | 'BAD_FRACTION';

export interface RepeatUnitProblem {
  code: RepeatUnitProblemCode;
  /** 中文說明 */
  message: string;
}

export interface RepeatUnitInfo {
  /** 連接點的數量（恰好 2） */
  attachmentCount: 2;
  /** 兩個連接點的編號（1、2），依其在輸入中出現的順序給出：[第一個出現者, 第二個出現者] */
  attachmentOrder: [1 | 2, 1 | 2];
  /** 重複單元的平均分子量（g/mol），不含連接點、不補氫。只供計算，不顯示在結果區（D09） */
  mUnit: number;
  /** 移除連接點後的分子式（Hill 順序），不補氫 */
  formula: string;
}

/** 共聚物分析中的一種單元（只供計算，不顯示，D09） */
export interface UnitComposition {
  smiles: string;
  mUnit: number;
  /** 莫耳分率 x_i（合計 1） */
  molFraction: number;
}

/**
 * 重複單元分析。共聚物時 mUnit 為平均重複單元質量 M̄_unit = Σ x_i·M_unit,i，formula 為第一種單元；
 * units 列出各單元（均聚物為單一單元，莫耳分率 1）。
 */
export type RepeatUnitAnalysis = ({ ok: true; units?: UnitComposition[] } & RepeatUnitInfo) | { ok: false; problem: RepeatUnitProblem };
