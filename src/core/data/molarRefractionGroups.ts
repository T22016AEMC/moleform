// 莫耳折射基團表 src/data/molar_refraction_groups.csv（任務 032，D08、D22；任務卡修訂：不做折射率 n，D07）。
// 欄位：id、基團名稱、SMARTS、原子數、R、出處、稽核狀態、備註。
// R ＝ Table 10.4 的 R_LL 欄（λ = 589 nm），書中單位 10⁻⁶ m³/mol ＝ cm³/mol，數值不換算。
// 只收 R_LL：R_GD、R_V 欄只用於折射率（式 10.14），本專案不做 n。
// 數值取自 van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009) Table 10.4（書頁 293–294）；SMARTS 自行撰寫。
// 格式檢查（不需 RDKit）：標題列、47 列、id 為 R01–R47、必填（含出處，缺出處報錯）、R 是數字。
// RDKit 檢查：SMARTS 可解析。正例與反例在 tests/properties/dielectricCases.ts。只確認格式與程式照規則運作，不判斷化學（D17）。
import molarRefractionCsv from '../../data/molar_refraction_groups.csv?raw';
import type { RDKitModule } from '../rdkit/types';
import { CsvError, parseCsv } from './csv';
import type { DataIssue, TableResult } from './types';

export const MOLAR_REFRACTION_GROUPS_FILE = 'molar_refraction_groups.csv';
export const MOLAR_REFRACTION_GROUPS_COLUMNS = ['id', '基團名稱', 'SMARTS', '原子數', 'R', '出處', '稽核狀態', '備註'] as const;
/** 本專案收錄的 Table 10.4 基團數 */
export const MOLAR_REFRACTION_GROUP_COUNT = 47;

export interface MolarRefractionGroupRow {
  id: string;
  name: string;
  smarts: string;
  /** 基團含幾個重原子（切分時大的基團先配對） */
  atomCount: number;
  /** R_LL，10⁻⁶ m³/mol ＝ cm³/mol */
  r: number;
  source: string;
  audit: string;
  notes: string;
}

const NUMBER = /^-?\d+(?:\.\d+)?$/;

/** 讀取基團表；格式錯誤回報在 issues（無法解析的數值該列不收） */
export function readMolarRefractionGroups(text: string): TableResult<MolarRefractionGroupRow> {
  const issues: DataIssue[] = [];
  const fail = (row: number | null, column: string | null, message: string) => issues.push({ file: MOLAR_REFRACTION_GROUPS_FILE, row, column, message });
  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (e) {
    fail(null, null, `CSV 格式錯誤：${e instanceof CsvError ? e.message : String(e)}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const header = records[0];
  const columns = MOLAR_REFRACTION_GROUPS_COLUMNS;
  if (!header) {
    fail(1, null, `檔案是空的，缺少標題列（應為：${columns.join(',')}）`);
    return { rows: [], rowNumbers: [], issues };
  }
  if (header.length !== columns.length || header.some((h, i) => h !== columns[i])) {
    fail(1, null, `標題列與定義不一致。應為：${columns.join(',')}；實際為：${header.join(',')}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const rows: MolarRefractionGroupRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const no = r + 1;
    if (rec.length !== columns.length) {
      fail(no, null, `欄位數應為 ${columns.length}，實際為 ${rec.length}`);
      continue;
    }
    const [id, name, smarts, atomText, rText, source, audit, notes] = rec.map((s) => s.trim());
    let ok = true;
    if (!/^\d+$/.test(atomText) || Number(atomText) < 1 || Number(atomText) > 30) {
      fail(no, '原子數', `只能是 1–30 的整數：「${atomText}」`);
      ok = false;
    }
    if (!NUMBER.test(rText)) {
      fail(no, 'R', `不是數字：「${rText}」`);
      ok = false;
    }
    if (!ok) continue;
    rows.push({ id, name, smarts, atomCount: Number(atomText), r: Number(rText), source, audit, notes });
    rowNumbers.push(no);
  }
  return { rows, rowNumbers, issues };
}

/** 不需 RDKit 的格式檢查 */
export function validateMolarRefractionGroups(table: TableResult<MolarRefractionGroupRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number | null, column: string | null, message: string) => issues.push({ file: MOLAR_REFRACTION_GROUPS_FILE, row, column, message });
  if (table.rows.length !== MOLAR_REFRACTION_GROUP_COUNT) add(null, null, `應有 ${MOLAR_REFRACTION_GROUP_COUNT} 列，實際為 ${table.rows.length} 列`);
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
    else if (!/Table 10\.4/.test(r.source) || !/頁/.test(r.source)) add(no, '出處', '出處需寫明書中表號（Table 10.4）與書頁碼');
    const expected = `R${String(i + 1).padStart(2, '0')}`;
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
export function checkMolarRefractionGroupSmarts(RDKit: RDKitModule, table: TableResult<MolarRefractionGroupRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  table.rows.forEach((r, i) => {
    if (r.smarts === '') return;
    let q = null;
    try {
      q = RDKit.get_qmol(r.smarts);
    } catch {
      q = null;
    }
    if (!q || !q.is_valid()) issues.push({ file: MOLAR_REFRACTION_GROUPS_FILE, row: table.rowNumbers[i], column: 'SMARTS', message: 'RDKit 無法解析這個 SMARTS' });
    q?.delete();
  });
  return issues;
}

/** 隨網站打包的莫耳折射基團表（依 Table 10.4 順序） */
export const bundledMolarRefractionGroupsText: string = molarRefractionCsv;
export const MOLAR_REFRACTION_GROUPS: readonly MolarRefractionGroupRow[] = readMolarRefractionGroups(molarRefractionCsv).rows;
