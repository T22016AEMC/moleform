// 內建溶劑資料表（solvents.csv，D72）的選項：只讀取打包進網頁的檔案並整理成下拉選單（任務 P8-1）。
import { bundledTexts, loadTables } from '../../core/data/load';
import { solventOptions, type SolventOption } from '../../core/data/solventOptions';

let cached: SolventOption[] | null = null;

export function bundledSolventOptions(): SolventOption[] {
  if (cached === null) cached = solventOptions(loadTables(bundledTexts).tables.solvents.rows);
  return cached;
}
