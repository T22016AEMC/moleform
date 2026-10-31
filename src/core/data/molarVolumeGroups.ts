// 聚合物莫耳體積基團表 src/data/molar_volume_polymer_groups.csv（任務 029，D08、D22）。
// 欄位：id、基團名稱、SMARTS、原子數、Va、Vc、出處、稽核狀態、備註。
// 數值取自 van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009) Table 4.10（書頁 88）；SMARTS 自行撰寫。
// Va ＝ Va,i(298)：非晶態（玻璃態與橡膠態共用，式 4.8a、4.8b）的莫耳體積增量；Vc ＝ Vc,i(298)：結晶態的莫耳體積增量，單位 cm³/mol。
// Table 4.10 沒有基團質量欄，所以沒有 Mi。
// 格式檢查（不需 RDKit）：標題列、15 列、id 為 M01–M15、必填（含出處，缺出處報錯）、Va 與 Vc 都是數字、書中印於括號內者備註要寫明。
// RDKit 檢查：SMARTS 可解析。正例與反例在 tests/properties/molarVolumeCases.ts。只確認格式與程式照規則運作，不判斷化學（D17）。
import molarVolumeCsv from '../../data/molar_volume_polymer_groups.csv?raw';
import type { RDKitModule } from '../rdkit/types';
import { CsvError, parseCsv } from './csv';
import type { DataIssue, TableResult } from './types';

export const MOLAR_VOLUME_GROUPS_FILE = 'molar_volume_polymer_groups.csv';
export const MOLAR_VOLUME_GROUPS_COLUMNS = ['id', '基團名稱', 'SMARTS', '原子數', 'Va', 'Vc', '出處', '稽核狀態', '備註'] as const;
/** 本專案需要的 Table 4.10 基團數 */
export const MOLAR_VOLUME_GROUP_COUNT = 15;

export interface MolarVolumeGroupRow {
  id: string;
  name: string;
  smarts: string;
  /** 基團含幾個重原子（切分時大的基團先配對） */
  atomCount: number;
  /** Va,i(298)：非晶態（玻璃態、橡膠態）莫耳體積增量，cm³/mol */
  va: number;
  /** Vc,i(298)：結晶態莫耳體積增量，cm³/mol */
  vc: number;
  source: string;
  audit: string;
  notes: string;
}

const NUMBER = /^-?\d+(?:\.\d+)?$/;

/** 讀取基團表；格式錯誤回報在 issues（無法解析的數值該列不收） */
export function readMolarVolumeGroups(text: string): TableResult<MolarVolumeGroupRow> {
  const issues: DataIssue[] = [];
  const fail = (row: number | null, column: string | null, message: string) => issues.push({ file: MOLAR_VOLUME_GROUPS_FILE, row, column, message });
  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (e) {
    fail(null, null, `CSV 格式錯誤：${e instanceof CsvError ? e.message : String(e)}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const header = records[0];
  const columns = MOLAR_VOLUME_GROUPS_COLUMNS;
  if (!header) {
    fail(1, null, `檔案是空的，缺少標題列（應為：${columns.join(',')}）`);
    return { rows: [], rowNumbers: [], issues };
  }
  if (header.length !== columns.length || header.some((h, i) => h !== columns[i])) {
    fail(1, null, `標題列與定義不一致。應為：${columns.join(',')}；實際為：${header.join(',')}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const rows: MolarVolumeGroupRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const no = r + 1;
    if (rec.length !== columns.length) {
      fail(no, null, `欄位數應為 ${columns.length}，實際為 ${rec.length}`);
      continue;
    }
    const [id, name, smarts, atomText, vaText, vcText, source, audit, notes] = rec.map((s) => s.trim());
    let ok = true;
    if (!/^\d+$/.test(atomText) || Number(atomText) < 1 || Number(atomText) > 10) {
      fail(no, '原子數', `只能是 1–10 的整數：「${atomText}」`);
      ok = false;
    }
    if (!NUMBER.test(vaText)) {
      fail(no, 'Va', `不是數字：「${vaText}」`);
      ok = false;
    }
    if (!NUMBER.test(vcText)) {
      fail(no, 'Vc', `不是數字：「${vcText}」`);
      ok = false;
    }
    if (!ok) continue;
    rows.push({ id, name, smarts, atomCount: Number(atomText), va: Number(vaText), vc: Number(vcText), source, audit, notes });
    rowNumbers.push(no);
  }
  return { rows, rowNumbers, issues };
}

/** 不需 RDKit 的格式檢查 */
export function validateMolarVolumeGroups(table: TableResult<MolarVolumeGroupRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number | null, column: string | null, message: string) => issues.push({ file: MOLAR_VOLUME_GROUPS_FILE, row, column, message });
  if (table.rows.length !== MOLAR_VOLUME_GROUP_COUNT) add(null, null, `應有 ${MOLAR_VOLUME_GROUP_COUNT} 列，實際為 ${table.rows.length} 列`);
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
    else if (!/Table 4\.10/.test(r.source) || !/頁/.test(r.source)) add(no, '出處', '出處需寫明書中表號（Table 4.10）與書頁碼');
    const expected = `M${String(i + 1).padStart(2, '0')}`;
    if (r.id !== expected) add(no, 'id', `id 應依資料表順序為 ${expected}，實際為「${r.id}」`);
    if (r.id !== '') {
      if (ids.has(r.id)) add(no, 'id', `重複：「${r.id}」已出現在第 ${ids.get(r.id)} 列`);
      else ids.set(r.id, no);
    }
    if (r.notes === '') add(no, '備註', '備註不可為空');
  });
  return issues;
}

/** RDKit 檢查：SMARTS 可解析 */
export function checkMolarVolumeGroupSmarts(RDKit: RDKitModule, table: TableResult<MolarVolumeGroupRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  table.rows.forEach((r, i) => {
    if (r.smarts === '') return;
    let q = null;
    try {
      q = RDKit.get_qmol(r.smarts);
    } catch {
      q = null;
    }
    if (!q || !q.is_valid()) issues.push({ file: MOLAR_VOLUME_GROUPS_FILE, row: table.rowNumbers[i], column: 'SMARTS', message: 'RDKit 無法解析這個 SMARTS' });
    q?.delete();
  });
  return issues;
}

/** 隨網站打包的聚合物莫耳體積基團表（依 Table 4.10 順序） */
export const bundledMolarVolumeGroupsText: string = molarVolumeCsv;
export const MOLAR_VOLUME_GROUPS: readonly MolarVolumeGroupRow[] = readMolarVolumeGroups(molarVolumeCsv).rows;
