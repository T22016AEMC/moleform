// 莫耳介電極化基團表 src/data/polarization_groups.csv（任務 032，D08、D22）。
// 欄位：id、基團名稱、SMARTS、原子數、P_LL、P_V、出處、稽核狀態、備註。
// 數值取自 van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009) Table 11.1（書頁 321）；SMARTS 自行撰寫。
// P_LL（cm³/mol）用於式 (11.7)：P_LL = (ε − 1)/(ε + 2)·V；P_V（g/mol）用於式 (11.8)：P_V = ε^½·M。
// 書中印於括號內或「~」的值照數值收錄，備註以 [暫定:LL]、[暫定:V]、[暫定:LL,V] 標明是哪一欄（書中標為暫定）。
// 格式檢查（不需 RDKit）：標題列、20 列、id 為 P01–P20、必填（含出處，缺出處報錯）、P_LL 與 P_V 都是數字、暫定標記格式。
// RDKit 檢查：SMARTS 可解析。正例與反例在 tests/properties/dielectricCases.ts。只確認格式與程式照規則運作，不判斷化學（D17）。
import polarizationCsv from '../../data/polarization_groups.csv?raw';
import type { RDKitModule } from '../rdkit/types';
import { CsvError, parseCsv } from './csv';
import type { DataIssue, TableResult } from './types';

export const POLARIZATION_GROUPS_FILE = 'polarization_groups.csv';
export const POLARIZATION_GROUPS_COLUMNS = ['id', '基團名稱', 'SMARTS', '原子數', 'P_LL', 'P_V', '出處', '稽核狀態', '備註'] as const;
/** Table 11.1 的基團數 */
export const POLARIZATION_GROUP_COUNT = 20;

export interface PolarizationGroupRow {
  id: string;
  name: string;
  smarts: string;
  /** 基團含幾個重原子（切分時大的基團先配對） */
  atomCount: number;
  /** P_LL，cm³/mol（式 11.7，搭配莫耳體積 V） */
  pLL: number;
  /** P_V，g/mol（式 11.8，搭配莫耳質量 M） */
  pV: number;
  /** P_LL 欄書中印於括號內或 ~（書中標為暫定） */
  tentativeLL: boolean;
  /** P_V 欄書中印於括號內或 ~（書中標為暫定） */
  tentativeV: boolean;
  source: string;
  audit: string;
  notes: string;
}

const NUMBER = /^-?\d+(?:\.\d+)?$/;
const MARK = /\[暫定:(LL,V|LL|V)\]/;

/** 讀取基團表；格式錯誤回報在 issues（無法解析的數值該列不收） */
export function readPolarizationGroups(text: string): TableResult<PolarizationGroupRow> {
  const issues: DataIssue[] = [];
  const fail = (row: number | null, column: string | null, message: string) => issues.push({ file: POLARIZATION_GROUPS_FILE, row, column, message });
  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (e) {
    fail(null, null, `CSV 格式錯誤：${e instanceof CsvError ? e.message : String(e)}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const header = records[0];
  const columns = POLARIZATION_GROUPS_COLUMNS;
  if (!header) {
    fail(1, null, `檔案是空的，缺少標題列（應為：${columns.join(',')}）`);
    return { rows: [], rowNumbers: [], issues };
  }
  if (header.length !== columns.length || header.some((h, i) => h !== columns[i])) {
    fail(1, null, `標題列與定義不一致。應為：${columns.join(',')}；實際為：${header.join(',')}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const rows: PolarizationGroupRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const no = r + 1;
    if (rec.length !== columns.length) {
      fail(no, null, `欄位數應為 ${columns.length}，實際為 ${rec.length}`);
      continue;
    }
    const [id, name, smarts, atomText, pllText, pvText, source, audit, notes] = rec.map((s) => s.trim());
    let ok = true;
    if (!/^\d+$/.test(atomText) || Number(atomText) < 1 || Number(atomText) > 30) {
      fail(no, '原子數', `只能是 1–30 的整數：「${atomText}」`);
      ok = false;
    }
    if (!NUMBER.test(pllText)) {
      fail(no, 'P_LL', `不是數字：「${pllText}」`);
      ok = false;
    }
    if (!NUMBER.test(pvText)) {
      fail(no, 'P_V', `不是數字：「${pvText}」`);
      ok = false;
    }
    if (!ok) continue;
    const mark = MARK.exec(notes)?.[1] ?? '';
    rows.push({
      id,
      name,
      smarts,
      atomCount: Number(atomText),
      pLL: Number(pllText),
      pV: Number(pvText),
      tentativeLL: mark === 'LL' || mark === 'LL,V',
      tentativeV: mark === 'V' || mark === 'LL,V',
      source,
      audit,
      notes,
    });
    rowNumbers.push(no);
  }
  return { rows, rowNumbers, issues };
}

/** 不需 RDKit 的格式檢查 */
export function validatePolarizationGroups(table: TableResult<PolarizationGroupRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number | null, column: string | null, message: string) => issues.push({ file: POLARIZATION_GROUPS_FILE, row, column, message });
  if (table.rows.length !== POLARIZATION_GROUP_COUNT) add(null, null, `應有 ${POLARIZATION_GROUP_COUNT} 列，實際為 ${table.rows.length} 列`);
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
    else if (!/Table 11\.1/.test(r.source) || !/頁/.test(r.source)) add(no, '出處', '出處需寫明書中表號（Table 11.1）與書頁碼');
    const expected = `P${String(i + 1).padStart(2, '0')}`;
    if (r.id !== expected) add(no, 'id', `id 應依資料表順序為 ${expected}，實際為「${r.id}」`);
    if (r.id !== '') {
      if (ids.has(r.id)) add(no, 'id', `重複：「${r.id}」已出現在第 ${ids.get(r.id)} 列`);
      else ids.set(r.id, no);
    }
    if (r.notes === '') add(no, '備註', '備註不可為空');
    if (/\[暫定:/.test(r.notes) && !MARK.test(r.notes)) add(no, '備註', '暫定標記格式應為 [暫定:LL]、[暫定:V] 或 [暫定:LL,V]');
    if ((r.tentativeLL || r.tentativeV) && !r.notes.includes('書中標為暫定')) add(no, '備註', '有暫定標記的列備註要寫「書中標為暫定」');
  });
  return issues;
}

/** RDKit 檢查：SMARTS 可解析 */
export function checkPolarizationGroupSmarts(RDKit: RDKitModule, table: TableResult<PolarizationGroupRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  table.rows.forEach((r, i) => {
    if (r.smarts === '') return;
    let q = null;
    try {
      q = RDKit.get_qmol(r.smarts);
    } catch {
      q = null;
    }
    if (!q || !q.is_valid()) issues.push({ file: POLARIZATION_GROUPS_FILE, row: table.rowNumbers[i], column: 'SMARTS', message: 'RDKit 無法解析這個 SMARTS' });
    q?.delete();
  });
  return issues;
}

/** 隨網站打包的莫耳介電極化基團表（依 Table 11.1 順序） */
export const bundledPolarizationGroupsText: string = polarizationCsv;
export const POLARIZATION_GROUPS: readonly PolarizationGroupRow[] = readPolarizationGroups(polarizationCsv).rows;
