/// <reference types="vite/client" />
import type { DataTexts } from '../../src/core/data/load';
import { formatIssue, type DataIssue } from '../../src/core/data/types';

const fixtures = import.meta.glob<string>('../fixtures/data/**/*.csv', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** 讀取 tests/fixtures/data/<set>/ 的四個示範 CSV（set：valid 或 invalid） */
export function fixtureTexts(set: 'valid' | 'invalid'): DataTexts {
  const get = (name: string) => {
    const text = fixtures[`../fixtures/data/${set}/${name}.csv`];
    if (text === undefined) throw new Error(`找不到示範資料 ${set}/${name}.csv`);
    return text;
  };
  return {
    functionalGroups: get('functional_groups'),
    reactionRules: get('reaction_rules'),
    groupContributions: get('group_contributions'),
    solvents: get('solvents'),
  };
}

/** 把問題轉成可讀字串，方便斷言與在測試失敗時顯示 */
export function describeIssues(issues: DataIssue[]): string[] {
  return issues.map(formatIssue);
}

/** 找出符合檔案／列／欄位的問題 */
export function findIssues(issues: DataIssue[], file: string, row: number | null, column: string | null) {
  return issues.filter((i) => i.file === file && i.row === row && i.column === column);
}
