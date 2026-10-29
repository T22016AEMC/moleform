// 讀取四種資料表：解析 CSV、核對標題列、把 `|` 清單與數字欄位轉型。
// 格式錯誤一律回報在 issues（哪個檔、第幾列、哪個欄位、什麼問題），不靜默略過。
import { CsvError, parseCsv } from './csv';
import {
  FUNCTIONAL_GROUPS_TABLE,
  GROUP_CONTRIBUTIONS_TABLE,
  REACTION_RULES_TABLE,
  SOLVENTS_TABLE,
  type DataIssue,
  type FunctionalGroupRow,
  type GroupContributionRow,
  type ReactionRuleRow,
  type SolventRow,
  type TableDef,
  type TableResult,
} from './types';

export const LIST_SEPARATOR = '|';

export function splitList(value: string): string[] {
  if (value.trim() === '') return [];
  return value.split(LIST_SEPARATOR).map((x) => x.trim());
}

function readTable<T>(def: TableDef, text: string): TableResult<T> {
  const issues: DataIssue[] = [];
  const fail = (row: number | null, column: string | null, message: string) =>
    issues.push({ file: def.file, row, column, message });

  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (e) {
    fail(null, null, `CSV 格式錯誤：${e instanceof CsvError ? e.message : String(e)}`);
    return { rows: [], rowNumbers: [], issues };
  }

  const expected = def.columns.map((c) => c.name);
  const header = records[0];
  if (!header) {
    fail(1, null, `檔案是空的，缺少標題列（應為：${expected.join(',')}）`);
    return { rows: [], rowNumbers: [], issues };
  }
  if (header.length !== expected.length || header.some((h, i) => h !== expected[i])) {
    fail(1, null, `標題列與定義不一致。應為：${expected.join(',')}；實際為：${header.join(',')}`);
    return { rows: [], rowNumbers: [], issues };
  }

  const rows: T[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < records.length; r++) {
    const rowNo = r + 1;
    const record = records[r];
    if (record.length !== expected.length) {
      fail(rowNo, null, `欄位數應為 ${expected.length}，實際為 ${record.length}`);
      continue;
    }
    const row: Record<string, unknown> = {};
    def.columns.forEach((col, i) => {
      const raw = record[i];
      switch (col.kind) {
        case 'string':
          row[col.name] = raw.trim();
          break;
        case 'list':
          row[col.name] = splitList(raw);
          break;
        case 'number': {
          const t = raw.trim();
          if (t === '') {
            row[col.name] = null;
          } else if (!Number.isFinite(Number(t))) {
            fail(rowNo, col.name, `無法轉成數字：「${raw}」`);
            row[col.name] = null;
          } else {
            row[col.name] = Number(t);
          }
          break;
        }
        case 'intList':
          row[col.name] = splitList(raw).flatMap((x) => {
            if (/^\d+$/.test(x)) return [Number(x)];
            fail(rowNo, col.name, `應為以 ${LIST_SEPARATOR} 分隔的整數，但有「${x}」`);
            return [];
          });
          break;
      }
    });
    rows.push(row as T);
    rowNumbers.push(rowNo);
  }
  return { rows, rowNumbers, issues };
}

export const readFunctionalGroups = (text: string) =>
  readTable<FunctionalGroupRow>(FUNCTIONAL_GROUPS_TABLE, text);
export const readReactionRules = (text: string) => readTable<ReactionRuleRow>(REACTION_RULES_TABLE, text);
export const readGroupContributions = (text: string) =>
  readTable<GroupContributionRow>(GROUP_CONTRIBUTIONS_TABLE, text);
export const readSolvents = (text: string) => readTable<SolventRow>(SOLVENTS_TABLE, text);
