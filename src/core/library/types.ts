// 本機化合物庫的資料模型（任務 012）。純資料，不含分子量、官能基數量或當量（D09）。

export const SCHEMA_VERSION = 1;
export const NAME_MAX = 100;
export const NOTES_MAX = 1000;

export interface Compound {
  /** 隨機唯一碼 */
  id: string;
  /** 名稱，1–100 字 */
  name: string;
  /** RDKit canonical SMILES */
  canonicalSmiles: string;
  /** 使用者畫的 2D Molfile（保留圖面排列）；沒有時為空字串 */
  molfile: string;
  /** 備註，最多 1000 字；沒有時為空字串 */
  notes: string;
  /** ISO 時間 */
  createdAt: string;
  updatedAt: string;
}

/** 化合物庫整體格式（匯出檔的內容；schemaVersion 供日後轉換舊資料） */
export interface LibraryFile {
  schemaVersion: number;
  exportedAt: string;
  compounds: Compound[];
}

export type Library = readonly Compound[];

export interface ImportSummary {
  added: number;
  updated: number;
  skipped: number;
  /** 略過的原因（已合併相同原因並附筆數） */
  reasons: string[];
  /** 匯入 SDF 時，結構與現有化合物相同但名稱不同（仍已新增）的名稱 */
  sameStructureNames?: string[];
}

export interface ImportOutcome {
  /** false 表示整個檔案被拒絕（例如不認得的 schemaVersion），library 維持原樣 */
  ok: boolean;
  /** ok 為 false 時的說明 */
  error?: string;
  library: Library;
  summary: ImportSummary;
}

/** 把「新增 N 筆、更新 N 筆、略過 N 筆（原因…）」組成畫面文字 */
export function summaryText(summary: ImportSummary): string {
  const base = `新增 ${summary.added} 筆、更新 ${summary.updated} 筆、略過 ${summary.skipped} 筆`;
  const text = summary.reasons.length ? `${base}（${summary.reasons.join('；')}）` : base;
  const same = summary.sameStructureNames ?? [];
  return same.length ? `${text}；結構重複但名稱不同 ${same.length} 筆（${same.join('、')}）` : text;
}
