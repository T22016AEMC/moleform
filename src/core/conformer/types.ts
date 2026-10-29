// 構象計算的結果型別（純資料，可跨 Worker 傳遞）。

export interface ConformerRecord {
  /** 依能量由低到高排序後的序號（從 1 起算）；未最佳化時為產生順序 */
  rank: number;
  /** 含 3D 座標與氫原子的 Molfile（V2000）。重原子索引與輸入 Molfile 相同，氫接在後面 */
  molfile: string;
  /** MMFF94 總能量（kcal/mol，單位依 MMFF94 驗證資料集確認，見報告 011）；未最佳化時為 null */
  energy: number | null;
  /** 相對於本次所有構象中最低者的能量（kcal/mol）；最低者為 0 */
  relativeEnergy: number | null;
  /** 這個構象是否經過 MMFF94 最佳化 */
  optimized: boolean;
  /** 最佳化是否收斂（minimise 回傳 0） */
  converged: boolean;
}

export interface ConformerTiming {
  /** 本次呼叫中，產生構象（ConformerGenerator）花的毫秒數 */
  generationMs: number;
  /** 本次呼叫中，MMFF94 最佳化花的毫秒數 */
  optimizationMs: number;
}

export interface ConformerBatch {
  seed: number;
  /** 目前累計的全部構象（已合併重複、已排序） */
  conformers: ConformerRecord[];
  /** 本次呼叫新增的構象數（合併後） */
  added: number;
  /** 本次呼叫中因與既有構象相同而合併掉的數目 */
  merged: number;
  /** 產生器已無法提供更多不同的構象 */
  exhausted: boolean;
  /** 是否有做 MMFF94 最佳化；false 表示整批都是未經力場最佳化的初始構象 */
  optimized: boolean;
  /** 未最佳化時的說明（K07） */
  optimizationNote: string | null;
  timing: ConformerTiming;
  /** 重原子數（不含氫） */
  heavyAtoms: number;
  /** 輸入結構總原子數 */
  inputAtoms: number;
}

/** 未經力場最佳化時，加在鍵長、鍵角旁的註記 */
export const UNOPTIMIZED_MEASURE_NOTE = '此結構未經力場最佳化，鍵長、鍵角僅為初始幾何，不可作為參考值。';

export const NOT_OPTIMIZED_NOTE = '未經力場最佳化（MMFF94 不支援此結構中的元素或原子型）';
