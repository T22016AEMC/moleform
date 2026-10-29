// 交聯第 0 層的型別（任務 016，D11）。純 TypeScript，不可引用 React。
// 官能基數量（f）只在背景使用，供判定與驗證文件核對；結果畫面不顯示官能基數量與當量（D09）。
import type { PolymerSpec } from '../polymer/types';

export const CROSSLINK_MODEL_NAME = '反應規則表（交聯第 0 層）';
export const CATALYST_CATEGORY = 'Catalyst/Initiator'; // D26
export const MESSAGE_NO_TEMPERATURE = '尚無文獻資料';
export const MESSAGE_NO_CATALYST = '不需催化劑';
export const MESSAGE_PENDING_REVIEW = '使用中的反應規則尚未經使用者審核';

/** 配方中的一個成分（交聯分析只需要結構與分類，不需要用量） */
export interface CrosslinkComponent {
  id: string;
  name: string;
  /** RDKit canonical SMILES；含 `*` 表示聚合物重複單元 */
  canonicalSmiles: string;
  /** 使用者畫的 2D Molfile（若有）；小分子用它分析與繪圖，原子編號才會與 3D 畫面一致 */
  molfile?: string;
  category: string;
  polymer?: PolymerSpec;
}

/** 一種官能基在一個成分上的所有位點；每個位點是「反應原子」的 0 起算索引（依 reactive_atom_maps 的順序） */
export interface GroupSites {
  groupId: string;
  sites: number[][];
}

/** 共聚物的一種單元（任務 020）：各自辨識的官能基位點，原子索引以該單元的 SMILES 為準 */
export interface UnitAnalysis {
  smiles: string;
  /** 莫耳分率 x_i（合計 1） */
  molFraction: number;
  groups: GroupSites[];
}

export interface ComponentAnalysis {
  id: string;
  name: string;
  isPolymer: boolean;
  /** 實際分析與繪圖所用的結構文字（Molfile 或 SMILES）；原子索引以它為準 */
  source: string;
  /** 聚合度（僅聚合物，且 Mn 或 DP 有效時） */
  dp: number | null;
  /** 每分子質量（g/mol）：小分子為平均分子量，聚合物為 Mn；算不出為 null。只供第 1 層計算，不顯示（D09） */
  molarMass: number | null;
  /** 聚合物的分子量分布資料（Mw、Mn、重複單元分子量；任務 019）。只供第 1 層的兩成分近似，不顯示（D09）；非聚合物或算不出為 null */
  distribution: { mw: number; mn: number; mUnit: number } | null;
  /** 有位點的官能基（聚合物已排除涉及連接點 * 的匹配）。共聚物：含任一單元有的官能基，sites 為第一種單元的位點（可能為空） */
  groups: GroupSites[];
  /** 聚合物各單元的辨識結果（含第一種）；小分子為 null */
  units: UnitAnalysis[] | null;
  /** 聚合物每個平均重複單元的官能基數 Σ x_i·(單元 i 的位點數)，依官能基分開；小分子為空。只供計算，不顯示（D09） */
  unitGroupCounts: Record<string, number>;
  /** 分析上的問題（無法解析、聚合物缺 Mn／DP 等）；沒有問題為 null */
  problem: string | null;
}

export type PairKind = 'network' | 'chain' | 'capping' | 'graft' | 'undetermined';

export interface PairEnd {
  componentId: string;
  name: string;
  groupId: string;
  isPolymer: boolean;
  /** 此成分每分子平均的反應官能度；算不出（缺 Mn／DP）時為 null。僅供判定與驗證文件，不顯示（D09） */
  f: number | null;
}

export interface PairCatalyst {
  status: 'none' | 'present' | 'missing';
  message: string;
}

export interface PairResult {
  ruleId: string;
  /** 例如「環氧基–酚羥基 開環加成」 */
  reactionLabel: string;
  /** 規則 group_a／group_b 的中文名稱（group_b 為空時 groupBName 為空字串） */
  groupAName: string;
  groupBName: string;
  a: PairEnd;
  /** 規則的 group_b 為空（自反應）時為 null */
  b: PairEnd | null;
  /** 同一個成分與自己反應 */
  self: boolean;
  kind: PairKind;
  catalyst: PairCatalyst;
  temperature: string;
}

export type Verdict = 'network' | 'chain' | 'capping' | 'undetermined' | 'none';

export interface CrosslinkResult {
  modelName: string;
  confidence: 'direct';
  verdict: Verdict;
  pairs: PairResult[];
  /** 不參與任何反應配對的成分 */
  nonParticipants: { id: string; name: string }[];
  components: ComponentAnalysis[];
  /** 每個參與反應的成分要標記的反應原子（0 起算） */
  markedAtoms: Record<string, number[]>;
  /** 共聚物（兩種以上單元）每種單元要標記的反應原子（0 起算，依單元順序）；其他成分沒有此項 */
  markedUnitAtoms: Record<string, number[][]>;
  warnings: string[];
  /** 用到的、尚未審核（pending）的規則與官能基 id */
  pendingReview: { rules: string[]; groups: string[] };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  network: '配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層',
  chain: '具鏈延長的結構條件',
  capping: '具封端／接枝的結構條件',
  undetermined: '無法判定（聚合物缺少分子量）',
  none: '無反應',
};

export const PAIR_KIND_LABEL: Record<PairKind, string> = {
  network: '具形成網路的結構條件',
  chain: '具鏈延長的結構條件',
  capping: '具封端的結構條件',
  graft: '具接枝的結構條件',
  undetermined: '無法判定',
};
