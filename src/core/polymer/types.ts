// 均聚物的資料模型（任務 015，D42）。純資料，不含 React。
// 重複單元以 SMILES／Molfile 表示，兩個連接點用 `*` 標記（`[*:1]`、`[*:2]`，或兩個未編號的 `*`，D31）。
// Mn 與 DP 擇一輸入；共聚物、Mw、PDI、端基屬於 Phase 5，本階段忽略端基。

/** 使用者輸入的聚合物設定：mnInput 與 dpInput 擇一 */
export interface PolymerSpec {
  /** 數量平均分子量 Mn（g/mol），使用者輸入 */
  mnInput?: number;
  /** 聚合度 DP（重複單元數），使用者輸入 */
  dpInput?: number;
}

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
  | 'SAME_ATOM'
  | 'DANGLING_ATTACHMENT'
  | 'ATTACHMENT_TO_ATTACHMENT'
  | 'BAD_NUMBERING';

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

export type RepeatUnitAnalysis = ({ ok: true } & RepeatUnitInfo) | { ok: false; problem: RepeatUnitProblem };
