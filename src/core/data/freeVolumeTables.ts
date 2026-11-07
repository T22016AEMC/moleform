// 使用者定義的經驗自由體積法的資料表（任務 036a，D57、D22、D55）：
//  - src/data/free_volume_groups.csv：21 個基團的 Vω（cm³/mol）：使用者的 xlsx「自由體積算法_使用者表.xlsx」第 4 列（芳香族 H 欄已由使用者刪除，不收）；
//    任務 036d（D60）把芳香 C 拆成三類：C–H 8.11（使用者值）、取代 5.54、縮合 4.74（後兩者取自 Bondi 1964 Table XV p.449）。
//  - src/data/free_volume_corrections.csv：任務 036d（D60）依 Bondi 1964 Table XVII（p.450）實作的 6 個修正項（從 Vω 減去）。
//  - src/data/free_volume_coefficients.csv：5 個經驗係數類別（xlsx 儲存格 G2 與各列 X 欄公式）。
// 每列都有 `出處`（使用者定義，依論文整理，論文清單待補；xlsx 檔名與儲存格）與 `稽核狀態`（待使用者審）；缺欄位報錯（D22）。
// 格式檢查（不需 RDKit）：標題列、列數、id 序號、必填、數值、辨識方式與 SMARTS 的對應。RDKit 檢查：SMARTS 可解析。
// 只確認格式與程式照規則運作，不判斷化學（D17）。
import coefficientsCsv from '../../data/free_volume_coefficients.csv?raw';
import correctionsCsv from '../../data/free_volume_corrections.csv?raw';
import groupsCsv from '../../data/free_volume_groups.csv?raw';
import type { RDKitModule } from '../rdkit/types';
import { CsvError, parseCsv } from './csv';
import type { DataIssue, TableResult } from './types';

export const FREE_VOLUME_GROUPS_FILE = 'free_volume_groups.csv';
export const FREE_VOLUME_COEFFICIENTS_FILE = 'free_volume_coefficients.csv';
export const FREE_VOLUME_GROUPS_COLUMNS = ['id', '基團名稱', 'SMARTS', '原子數', '情境原子', 'Vω', '出處', '稽核狀態', '備註'] as const;
export const FREE_VOLUME_COEFFICIENTS_COLUMNS = ['id', '類別', '係數', '辨識方式', 'SMARTS', '優先順序', '出處', '稽核狀態', '備註'] as const;
export const FREE_VOLUME_CORRECTIONS_FILE = 'free_volume_corrections.csv';
export const FREE_VOLUME_CORRECTIONS_COLUMNS = ['id', '修正名稱', 'SMARTS', '修正量', '出處', '稽核狀態', '備註'] as const;
/** 基團數：使用者表 19 個（芳香族 H 已刪除）＋任務 036d 把芳香 C 拆成三類（多 2 個）＝ 21 */
export const FREE_VOLUME_GROUP_COUNT = 21;
/** 任務 036d 實作的 Bondi Table XVII 修正項數 */
export const FREE_VOLUME_CORRECTION_COUNT = 6;
/** 係數類別數 */
export const FREE_VOLUME_COEFFICIENT_COUNT = 5;
export const FREE_VOLUME_IDENTIFY_MODES = ['SMARTS', '橋環偵測', '其餘'] as const;
/** 出處必須寫明的字樣 */
const SOURCE_MARKS = ['使用者定義', '自由體積算法_使用者表.xlsx', '儲存格'] as const;

export interface FreeVolumeGroupRow {
  id: string;
  name: string;
  smarts: string;
  /** 基團佔用幾個重原子（切分時大的基團先配對）；不含情境原子 */
  atomCount: number;
  /** SMARTS 中只作情境、不佔用的原子（從 0 起算的原子序，例如酯基的羰基碳）；沒有時為空陣列 */
  context: number[];
  /** Vω（cm³/mol） */
  vw: number;
  source: string;
  audit: string;
  notes: string;
}

export interface FreeVolumeCorrectionRow {
  id: string;
  name: string;
  smarts: string;
  /** 每次修正量（cm³/mol，從 Vω 減去的正數） */
  decrement: number;
  source: string;
  audit: string;
  notes: string;
}

export interface FreeVolumeCoefficientRow {
  id: string;
  name: string;
  coefficient: number;
  mode: string;
  smarts: string;
  priority: number;
  source: string;
  audit: string;
  notes: string;
}

const NUMBER = /^-?\d+(?:\.\d+)?$/;

function readRecords(text: string, file: string, columns: readonly string[], issues: DataIssue[]): { rec: string[]; no: number }[] | null {
  const fail = (row: number | null, column: string | null, message: string) => issues.push({ file, row, column, message });
  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (e) {
    fail(null, null, `CSV 格式錯誤：${e instanceof CsvError ? e.message : String(e)}`);
    return null;
  }
  const header = records[0];
  if (!header) {
    fail(1, null, `檔案是空的，缺少標題列（應為：${columns.join(',')}）`);
    return null;
  }
  if (header.length !== columns.length || header.some((h, i) => h !== columns[i])) {
    fail(1, null, `標題列與定義不一致。應為：${columns.join(',')}；實際為：${header.join(',')}`);
    return null;
  }
  const out: { rec: string[]; no: number }[] = [];
  for (let r = 1; r < records.length; r++) {
    if (records[r].length !== columns.length) {
      fail(r + 1, null, `欄位數應為 ${columns.length}，實際為 ${records[r].length}`);
      continue;
    }
    out.push({ rec: records[r].map((s) => s.trim()), no: r + 1 });
  }
  return out;
}

/** 讀取基團表；格式錯誤回報在 issues（無法解析的數值該列不收） */
export function readFreeVolumeGroups(text: string): TableResult<FreeVolumeGroupRow> {
  const issues: DataIssue[] = [];
  const fail = (row: number | null, column: string | null, message: string) => issues.push({ file: FREE_VOLUME_GROUPS_FILE, row, column, message });
  const rows: FreeVolumeGroupRow[] = [];
  const rowNumbers: number[] = [];
  for (const { rec, no } of readRecords(text, FREE_VOLUME_GROUPS_FILE, FREE_VOLUME_GROUPS_COLUMNS, issues) ?? []) {
    const [id, name, smarts, atomText, contextText, vwText, source, audit, notes] = rec;
    let ok = true;
    let context: number[] = [];
    if (contextText !== '') {
      if (!/^\d+(;\d+)*$/.test(contextText)) {
        fail(no, '情境原子', `只能是以分號分隔的原子序（從 0 起算）：「${contextText}」`);
        ok = false;
      } else context = contextText.split(';').map(Number);
    }
    if (!/^\d+$/.test(atomText) || Number(atomText) < 1 || Number(atomText) > 10) {
      fail(no, '原子數', `只能是 1–10 的整數：「${atomText}」`);
      ok = false;
    }
    if (!NUMBER.test(vwText)) {
      fail(no, 'Vω', `不是數字：「${vwText}」`);
      ok = false;
    }
    if (!ok) continue;
    rows.push({ id, name, smarts, atomCount: Number(atomText), context, vw: Number(vwText), source, audit, notes });
    rowNumbers.push(no);
  }
  return { rows, rowNumbers, issues };
}

/** 讀取係數表 */
export function readFreeVolumeCoefficients(text: string): TableResult<FreeVolumeCoefficientRow> {
  const issues: DataIssue[] = [];
  const fail = (row: number | null, column: string | null, message: string) => issues.push({ file: FREE_VOLUME_COEFFICIENTS_FILE, row, column, message });
  const rows: FreeVolumeCoefficientRow[] = [];
  const rowNumbers: number[] = [];
  for (const { rec, no } of readRecords(text, FREE_VOLUME_COEFFICIENTS_FILE, FREE_VOLUME_COEFFICIENTS_COLUMNS, issues) ?? []) {
    const [id, name, coefText, mode, smarts, priorityText, source, audit, notes] = rec;
    let ok = true;
    if (!NUMBER.test(coefText)) {
      fail(no, '係數', `不是數字：「${coefText}」`);
      ok = false;
    }
    if (!/^\d+$/.test(priorityText) || Number(priorityText) < 1) {
      fail(no, '優先順序', `只能是正整數：「${priorityText}」`);
      ok = false;
    }
    if (!ok) continue;
    rows.push({ id, name, coefficient: Number(coefText), mode, smarts, priority: Number(priorityText), source, audit, notes });
    rowNumbers.push(no);
  }
  return { rows, rowNumbers, issues };
}

/** 任務 036d：取自 Bondi 論文的列，出處寫明 Bondi、Table 與頁碼即可（不是使用者表的值） */
const isBondiSource = (source: string): boolean => /Bondi/.test(source) && /Table X[IV]+/.test(source) && /p\.\d{3}/.test(source);

function checkCommon(
  add: (row: number | null, column: string | null, message: string) => void,
  no: number,
  r: { id: string; name: string; source: string; audit: string; notes: string },
  index: number,
  prefix: string,
  ids: Map<string, number>,
  nameColumn: string,
): void {
  const required: [string, string][] = [
    ['id', r.id],
    [nameColumn, r.name],
    ['稽核狀態', r.audit],
  ];
  for (const [col, v] of required) if (v === '') add(no, col, '必填欄位是空的');
  if (r.source === '') add(no, '出處', '必填欄位是空的（缺出處，D22）');
  else if (!isBondiSource(r.source) && SOURCE_MARKS.some((m) => !r.source.includes(m))) add(no, '出處', `出處需寫明「使用者定義」、xlsx 檔名（自由體積算法_使用者表.xlsx）與儲存格位置（缺：${SOURCE_MARKS.filter((m) => !r.source.includes(m)).join('、')}）`);
  const expected = `${prefix}${String(index + 1).padStart(2, '0')}`;
  if (r.id !== expected) add(no, 'id', `id 應依資料表順序為 ${expected}，實際為「${r.id}」`);
  if (r.id !== '') {
    if (ids.has(r.id)) add(no, 'id', `重複：「${r.id}」已出現在第 ${ids.get(r.id)} 列`);
    else ids.set(r.id, no);
  }
  if (r.audit !== '' && r.audit !== '待使用者審') add(no, '稽核狀態', `目前只能是「待使用者審」：「${r.audit}」`);
  if (r.notes === '') add(no, '備註', '備註不可為空');
}

/** 不需 RDKit 的格式檢查：基團表 */
export function validateFreeVolumeGroups(table: TableResult<FreeVolumeGroupRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number | null, column: string | null, message: string) => issues.push({ file: FREE_VOLUME_GROUPS_FILE, row, column, message });
  if (table.rows.length !== FREE_VOLUME_GROUP_COUNT) add(null, null, `應有 ${FREE_VOLUME_GROUP_COUNT} 列，實際為 ${table.rows.length} 列`);
  const ids = new Map<string, number>();
  table.rows.forEach((r, i) => {
    const no = table.rowNumbers[i];
    checkCommon(add, no, r, i, 'FV', ids, '基團名稱');
    if (r.smarts === '') add(no, 'SMARTS', '必填欄位是空的');
    if (r.name.includes('芳香族 H')) add(no, '基團名稱', '芳香族 H 已由使用者刪除（2026-11-06），不得收入');
  });
  return issues;
}

/** 不需 RDKit 的格式檢查：係數表 */
export function validateFreeVolumeCoefficients(table: TableResult<FreeVolumeCoefficientRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number | null, column: string | null, message: string) => issues.push({ file: FREE_VOLUME_COEFFICIENTS_FILE, row, column, message });
  if (table.rows.length !== FREE_VOLUME_COEFFICIENT_COUNT) add(null, null, `應有 ${FREE_VOLUME_COEFFICIENT_COUNT} 列，實際為 ${table.rows.length} 列`);
  const ids = new Map<string, number>();
  table.rows.forEach((r, i) => {
    const no = table.rowNumbers[i];
    checkCommon(add, no, r, i, 'FC', ids, '類別');
    if (!(FREE_VOLUME_IDENTIFY_MODES as readonly string[]).includes(r.mode)) add(no, '辨識方式', `只能是 ${FREE_VOLUME_IDENTIFY_MODES.join('、')}：「${r.mode}」`);
    if (r.mode === 'SMARTS' && r.smarts === '') add(no, 'SMARTS', '辨識方式為 SMARTS 時必填');
    if (r.mode !== 'SMARTS' && r.smarts !== '') add(no, 'SMARTS', `辨識方式為「${r.mode}」時 SMARTS 應留空`);
    if (!(r.coefficient > 0 && r.coefficient <= 1)) add(no, '係數', `應在 (0, 1] 內：${r.coefficient}`);
  });
  return issues;
}

/** 讀取修正表（任務 036d） */
export function readFreeVolumeCorrections(text: string): TableResult<FreeVolumeCorrectionRow> {
  const issues: DataIssue[] = [];
  const fail = (row: number | null, column: string | null, message: string) => issues.push({ file: FREE_VOLUME_CORRECTIONS_FILE, row, column, message });
  const rows: FreeVolumeCorrectionRow[] = [];
  const rowNumbers: number[] = [];
  for (const { rec, no } of readRecords(text, FREE_VOLUME_CORRECTIONS_FILE, FREE_VOLUME_CORRECTIONS_COLUMNS, issues) ?? []) {
    const [id, name, smarts, decText, source, audit, notes] = rec;
    if (!NUMBER.test(decText) || Number(decText) <= 0) {
      fail(no, '修正量', `只能是正數（從 Vω 減去的量）：「${decText}」`);
      continue;
    }
    rows.push({ id, name, smarts, decrement: Number(decText), source, audit, notes });
    rowNumbers.push(no);
  }
  return { rows, rowNumbers, issues };
}

/** 不需 RDKit 的格式檢查：修正表（出處必須是 Bondi 的 Table XVII 與頁碼，缺欄位報錯，D22） */
export function validateFreeVolumeCorrections(table: TableResult<FreeVolumeCorrectionRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number | null, column: string | null, message: string) => issues.push({ file: FREE_VOLUME_CORRECTIONS_FILE, row, column, message });
  if (table.rows.length !== FREE_VOLUME_CORRECTION_COUNT) add(null, null, `應有 ${FREE_VOLUME_CORRECTION_COUNT} 列，實際為 ${table.rows.length} 列`);
  const ids = new Map<string, number>();
  table.rows.forEach((r, i) => {
    const no = table.rowNumbers[i];
    const required: [string, string][] = [['id', r.id], ['修正名稱', r.name], ['SMARTS', r.smarts], ['稽核狀態', r.audit]];
    for (const [col, v] of required) if (v === '') add(no, col, '必填欄位是空的');
    if (r.source === '') add(no, '出處', '必填欄位是空的（缺出處，D22）');
    else if (!isBondiSource(r.source) || !/Table XVII/.test(r.source)) add(no, '出處', '出處需寫明 Bondi、Table XVII 與頁碼（p.450）');
    const expected = `FX${String(i + 1).padStart(2, '0')}`;
    if (r.id !== expected) add(no, 'id', `id 應依資料表順序為 ${expected}，實際為「${r.id}」`);
    if (r.id !== '') {
      if (ids.has(r.id)) add(no, 'id', `重複：「${r.id}」已出現在第 ${ids.get(r.id)} 列`);
      else ids.set(r.id, no);
    }
    if (r.audit !== '' && r.audit !== '待使用者審') add(no, '稽核狀態', `目前只能是「待使用者審」：「${r.audit}」`);
    if (r.notes === '') add(no, '備註', '備註不可為空');
  });
  return issues;
}

function checkSmartsOf(RDKit: RDKitModule, file: string, smartsList: { smarts: string; row: number }[]): DataIssue[] {
  const issues: DataIssue[] = [];
  for (const { smarts, row } of smartsList) {
    if (smarts === '') continue;
    let q = null;
    try {
      q = RDKit.get_qmol(smarts);
    } catch {
      q = null;
    }
    if (!q || !q.is_valid()) issues.push({ file, row, column: 'SMARTS', message: 'RDKit 無法解析這個 SMARTS' });
    q?.delete();
  }
  return issues;
}

/** RDKit 檢查：SMARTS 可解析 */
export function checkFreeVolumeGroupSmarts(RDKit: RDKitModule, table: TableResult<FreeVolumeGroupRow>): DataIssue[] {
  return checkSmartsOf(RDKit, FREE_VOLUME_GROUPS_FILE, table.rows.map((r, i) => ({ smarts: r.smarts, row: table.rowNumbers[i] })));
}
export function checkFreeVolumeCoefficientSmarts(RDKit: RDKitModule, table: TableResult<FreeVolumeCoefficientRow>): DataIssue[] {
  return checkSmartsOf(RDKit, FREE_VOLUME_COEFFICIENTS_FILE, table.rows.map((r, i) => ({ smarts: r.smarts, row: table.rowNumbers[i] })));
}

export function checkFreeVolumeCorrectionSmarts(RDKit: RDKitModule, table: TableResult<FreeVolumeCorrectionRow>): DataIssue[] {
  return checkSmartsOf(RDKit, FREE_VOLUME_CORRECTIONS_FILE, table.rows.map((r, i) => ({ smarts: r.smarts, row: table.rowNumbers[i] })));
}

/** 隨網站打包的資料表 */
export const bundledFreeVolumeCorrectionsText: string = correctionsCsv;
export const FREE_VOLUME_CORRECTIONS: readonly FreeVolumeCorrectionRow[] = readFreeVolumeCorrections(correctionsCsv).rows;
export const bundledFreeVolumeGroupsText: string = groupsCsv;
export const bundledFreeVolumeCoefficientsText: string = coefficientsCsv;
export const FREE_VOLUME_GROUPS: readonly FreeVolumeGroupRow[] = readFreeVolumeGroups(groupsCsv).rows;
export const FREE_VOLUME_COEFFICIENTS: readonly FreeVolumeCoefficientRow[] = readFreeVolumeCoefficients(coefficientsCsv).rows;
