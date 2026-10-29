// 端基資料表 src/data/end_groups.csv（任務 022，D50）：欄位 id、名稱、SMILES、常見於、出處。
// 格式檢查：標題列、必填、id 唯一、SMILES 恰好一個 `*`（RDKit 另檢查可解析）。只確認格式，不判斷化學（D17）。
import endGroupsCsv from '../../data/end_groups.csv?raw';
import type { RDKitModule } from '../rdkit/types';
import { CsvError, parseCsv } from './csv';
import type { DataIssue, TableResult } from './types';

export const END_GROUPS_FILE = 'end_groups.csv';
export const END_GROUPS_COLUMNS = ['id', '名稱', 'SMILES', '常見於', '出處'] as const;

export interface EndGroupRow {
  id: string;
  name: string;
  smiles: string;
  usedIn: string;
  source: string;
}

/** 讀取端基表；格式錯誤回報在 issues */
export function readEndGroups(text: string): TableResult<EndGroupRow> {
  const issues: DataIssue[] = [];
  const fail = (row: number | null, column: string | null, message: string) => issues.push({ file: END_GROUPS_FILE, row, column, message });
  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (e) {
    fail(null, null, `CSV 格式錯誤：${e instanceof CsvError ? e.message : String(e)}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const header = records[0];
  if (!header) {
    fail(1, null, `檔案是空的，缺少標題列（應為：${END_GROUPS_COLUMNS.join(',')}）`);
    return { rows: [], rowNumbers: [], issues };
  }
  if (header.length !== END_GROUPS_COLUMNS.length || header.some((h, i) => h !== END_GROUPS_COLUMNS[i])) {
    fail(1, null, `標題列與定義不一致。應為：${END_GROUPS_COLUMNS.join(',')}；實際為：${header.join(',')}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const rows: EndGroupRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    if (rec.length !== END_GROUPS_COLUMNS.length) {
      fail(r + 1, null, `欄位數應為 ${END_GROUPS_COLUMNS.length}，實際為 ${rec.length}`);
      continue;
    }
    rows.push({ id: rec[0].trim(), name: rec[1].trim(), smiles: rec[2].trim(), usedIn: rec[3].trim(), source: rec[4].trim() });
    rowNumbers.push(r + 1);
  }
  return { rows, rowNumbers, issues };
}

/** 不需 RDKit 的格式檢查：必填（含出處）、id 唯一、SMILES 恰好一個 `*` */
export function validateEndGroups(table: TableResult<EndGroupRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number, column: string, message: string) => issues.push({ file: END_GROUPS_FILE, row, column, message });
  const seen = new Map<string, number>();
  table.rows.forEach((r, i) => {
    const no = table.rowNumbers[i];
    if (r.id === '') add(no, 'id', '必填欄位是空的');
    else if (seen.has(r.id)) add(no, 'id', `重複：「${r.id}」已出現在第 ${seen.get(r.id)} 列`);
    else seen.set(r.id, no);
    if (r.name === '') add(no, '名稱', '必填欄位是空的');
    if (r.source === '') add(no, '出處', '必填欄位是空的（缺出處）');
    if (r.smiles === '') add(no, 'SMILES', '必填欄位是空的');
    else {
      const stars = (r.smiles.match(/\*/g) ?? []).length;
      if (stars !== 1) add(no, 'SMILES', `端基的 SMILES 需要恰好一個 *，目前有 ${stars} 個`);
    }
  });
  return issues;
}

/** RDKit 檢查：SMILES 可解析，且連接點（原子序 0）恰好一個 */
export function checkEndGroupSmiles(RDKit: RDKitModule, table: TableResult<EndGroupRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  table.rows.forEach((r, i) => {
    const no = table.rowNumbers[i];
    if (r.smiles === '') return;
    let mol;
    try {
      mol = RDKit.get_mol(r.smiles);
    } catch {
      mol = null;
    }
    if (!mol || !mol.is_valid()) {
      mol?.delete();
      issues.push({ file: END_GROUPS_FILE, row: no, column: 'SMILES', message: 'RDKit 無法解析這個 SMILES' });
      return;
    }
    try {
      const atoms = (JSON.parse(mol.get_json()) as { molecules: { atoms: { z?: number }[] }[] }).molecules[0].atoms;
      const dummies = atoms.filter((a) => a.z === 0).length;
      if (dummies !== 1) issues.push({ file: END_GROUPS_FILE, row: no, column: 'SMILES', message: `RDKit 讀到 ${dummies} 個連接點，端基需要恰好一個` });
    } finally {
      mol.delete();
    }
  });
  return issues;
}

/** 隨網站打包的端基表（依資料表順序） */
export const bundledEndGroupsText: string = endGroupsCsv;
export const END_GROUP_PRESETS: readonly EndGroupRow[] = readEndGroups(endGroupsCsv).rows;
