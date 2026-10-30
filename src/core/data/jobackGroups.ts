// Joback 基團表 src/data/joback_groups.csv（任務 027，D08、D22、D52）。
// 欄位：id、基團名稱、SMARTS、原子數、Tbi、Tfi、出處、稽核狀態、備註。
// 數值（Tbi、Tfi）取自 Joback & Reid 1987 表 III；SMARTS 取自 thermo 0.6.1（MIT），不一致處以表 III 為準。
// 格式檢查（不需 RDKit）：標題列、41 列、id 依表 III 順序為 J01–J41、必填（含出處，缺出處報錯）、數值可讀、Tfi 留空時備註必須說明表 III 該格為「—」。
// RDKit 檢查：SMARTS 可解析。正例與反例在 tests/properties/jobackCases.ts。
// 只確認格式與程式照規則運作，不判斷化學（D17）。
import jobackCsv from '../../data/joback_groups.csv?raw';
import type { RDKitModule } from '../rdkit/types';
import { CsvError, parseCsv } from './csv';
import type { DataIssue, TableResult } from './types';

export const JOBACK_GROUPS_FILE = 'joback_groups.csv';
export const JOBACK_GROUPS_COLUMNS = ['id', '基團名稱', 'SMARTS', '原子數', 'Tbi', 'Tfi', '出處', '稽核狀態', '備註'] as const;
/** 表 III 的基團數（論文 p.233：41 個基團） */
export const JOBACK_GROUP_COUNT = 41;

export interface JobackGroupRow {
  id: string;
  name: string;
  smarts: string;
  /** 基團含幾個重原子（切分時大的基團先配對） */
  atomCount: number;
  /** Tbi（K） */
  tbi: number;
  /** Tfi（K）；表 III 該格為「—」時為 null */
  tfi: number | null;
  source: string;
  audit: string;
  notes: string;
}

const NUMBER = /^-?\d+(?:\.\d+)?$/;

/** 讀取 Joback 基團表；格式錯誤回報在 issues（無法解析的數值該列不收） */
export function readJobackGroups(text: string): TableResult<JobackGroupRow> {
  const issues: DataIssue[] = [];
  const fail = (row: number | null, column: string | null, message: string) => issues.push({ file: JOBACK_GROUPS_FILE, row, column, message });
  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (e) {
    fail(null, null, `CSV 格式錯誤：${e instanceof CsvError ? e.message : String(e)}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const header = records[0];
  const columns = JOBACK_GROUPS_COLUMNS;
  if (!header) {
    fail(1, null, `檔案是空的，缺少標題列（應為：${columns.join(',')}）`);
    return { rows: [], rowNumbers: [], issues };
  }
  if (header.length !== columns.length || header.some((h, i) => h !== columns[i])) {
    fail(1, null, `標題列與定義不一致。應為：${columns.join(',')}；實際為：${header.join(',')}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const rows: JobackGroupRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const no = r + 1;
    if (rec.length !== columns.length) {
      fail(no, null, `欄位數應為 ${columns.length}，實際為 ${rec.length}`);
      continue;
    }
    const [id, name, smarts, atomText, tbText, tfText, source, audit, notes] = rec.map((s) => s.trim());
    let ok = true;
    if (!/^[123]$/.test(atomText)) {
      fail(no, '原子數', `只能是 1、2 或 3：「${atomText}」`);
      ok = false;
    }
    if (!NUMBER.test(tbText)) {
      fail(no, 'Tbi', `不是數字：「${tbText}」`);
      ok = false;
    }
    if (tfText !== '' && !NUMBER.test(tfText)) {
      fail(no, 'Tfi', `不是數字：「${tfText}」`);
      ok = false;
    }
    if (!ok) continue;
    rows.push({
      id,
      name,
      smarts,
      atomCount: Number(atomText),
      tbi: Number(tbText),
      tfi: tfText === '' ? null : Number(tfText),
      source,
      audit,
      notes,
    });
    rowNumbers.push(no);
  }
  return { rows, rowNumbers, issues };
}

/** 不需 RDKit 的格式檢查 */
export function validateJobackGroups(table: TableResult<JobackGroupRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number | null, column: string | null, message: string) => issues.push({ file: JOBACK_GROUPS_FILE, row, column, message });
  if (table.rows.length !== JOBACK_GROUP_COUNT) add(null, null, `應有 ${JOBACK_GROUP_COUNT} 列（表 III 的 41 個基團），實際為 ${table.rows.length} 列`);
  const ids = new Map<string, number>();
  table.rows.forEach((r, i) => {
    const no = table.rowNumbers[i];
    const required: [string, string][] = [
      ['id', r.id],
      ['基團名稱', r.name],
      ['SMARTS', r.smarts],
      ['稽核狀態', r.audit],
    ];
    for (const [col, v] of required) if (v === '') add(no, col, '必填欄位是空的');
    if (r.source === '') add(no, '出處', '必填欄位是空的（缺出處，D22）');
    else if (!/表 III/.test(r.source) || !/頁/.test(r.source)) add(no, '出處', '出處需寫明論文表號（表 III）與頁碼');
    const expected = `J${String(i + 1).padStart(2, '0')}`;
    if (r.id !== expected) add(no, 'id', `id 應依表 III 的順序為 ${expected}，實際為「${r.id}」`);
    if (r.id !== '') {
      if (ids.has(r.id)) add(no, 'id', `重複：「${r.id}」已出現在第 ${ids.get(r.id)} 列`);
      else ids.set(r.id, no);
    }
    if (r.tfi === null && !r.notes.includes('「—」')) add(no, 'Tfi', 'Tfi 留空時，備註需說明表 III 該格為「—」');
  });
  return issues;
}

/** RDKit 檢查：SMARTS 可解析 */
export function checkJobackGroupSmarts(RDKit: RDKitModule, table: TableResult<JobackGroupRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  table.rows.forEach((r, i) => {
    if (r.smarts === '') return;
    let q = null;
    try {
      q = RDKit.get_qmol(r.smarts);
    } catch {
      q = null;
    }
    if (!q || !q.is_valid()) issues.push({ file: JOBACK_GROUPS_FILE, row: table.rowNumbers[i], column: 'SMARTS', message: 'RDKit 無法解析這個 SMARTS' });
    q?.delete();
  });
  return issues;
}

/** 隨網站打包的 Joback 基團表（依表 III 順序） */
export const bundledJobackGroupsText: string = jobackCsv;
export const JOBACK_GROUPS: readonly JobackGroupRow[] = readJobackGroups(jobackCsv).rows;
