// van der Waals 體積基團表 src/data/vw_groups.csv（任務 028，D08、D22）。
// 欄位：id、基團名稱、SMARTS、原子數、VW、Mi、二價／非二價、出處、稽核狀態、備註。
// 數值（VW、Mi）取自 van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009) Table 4.2（書頁 74–75）；SMARTS 自行撰寫。
// 格式檢查（不需 RDKit）：標題列、41 列（任務 031 補收後）、id 為 V01–V41、必填（含出處，缺出處報錯）、數值可讀、VW 留空時備註必須說明、二價／非二價只能二選一。
// RDKit 檢查：SMARTS 可解析。Mi 與基團質量的核對在 src/core/properties/vanDerWaalsVolume.ts（需要分子）；正例與反例在 tests/properties/vwCases.ts。
// 只確認格式與程式照規則運作，不判斷化學（D17）。
import vwCsv from '../../data/vw_groups.csv?raw';
import type { RDKitModule } from '../rdkit/types';
import { CsvError, parseCsv } from './csv';
import type { DataIssue, TableResult } from './types';

export const VW_GROUPS_FILE = 'vw_groups.csv';
export const VW_GROUPS_COLUMNS = ['id', '基團名稱', 'SMARTS', '原子數', 'VW', 'Mi', '二價／非二價', '出處', '稽核狀態', '備註'] as const;
/** 本專案需要的 Table 4.2 基團數 */
export const VW_GROUP_COUNT = 41;
export const VW_VALENCES = ['二價', '非二價'] as const;

export interface VwGroupRow {
  id: string;
  name: string;
  smarts: string;
  /** 基團含幾個重原子（切分時大的基團先配對） */
  atomCount: number;
  /** VW（cm³/mol）；書中數值有疑義而留空時為 null */
  vw: number | null;
  /** Mi（g/mol） */
  mi: number;
  valence: string;
  source: string;
  audit: string;
  notes: string;
}

const NUMBER = /^-?\d+(?:\.\d+)?$/;

/** 讀取 VW 基團表；格式錯誤回報在 issues（無法解析的數值該列不收） */
export function readVwGroups(text: string): TableResult<VwGroupRow> {
  const issues: DataIssue[] = [];
  const fail = (row: number | null, column: string | null, message: string) => issues.push({ file: VW_GROUPS_FILE, row, column, message });
  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (e) {
    fail(null, null, `CSV 格式錯誤：${e instanceof CsvError ? e.message : String(e)}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const header = records[0];
  const columns = VW_GROUPS_COLUMNS;
  if (!header) {
    fail(1, null, `檔案是空的，缺少標題列（應為：${columns.join(',')}）`);
    return { rows: [], rowNumbers: [], issues };
  }
  if (header.length !== columns.length || header.some((h, i) => h !== columns[i])) {
    fail(1, null, `標題列與定義不一致。應為：${columns.join(',')}；實際為：${header.join(',')}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const rows: VwGroupRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const no = r + 1;
    if (rec.length !== columns.length) {
      fail(no, null, `欄位數應為 ${columns.length}，實際為 ${rec.length}`);
      continue;
    }
    const [id, name, smarts, atomText, vwText, miText, valence, source, audit, notes] = rec.map((s) => s.trim());
    let ok = true;
    if (!/^\d+$/.test(atomText) || Number(atomText) < 1 || Number(atomText) > 30) {
      fail(no, '原子數', `只能是 1–30 的整數：「${atomText}」`);
      ok = false;
    }
    if (vwText !== '' && !NUMBER.test(vwText)) {
      fail(no, 'VW', `不是數字：「${vwText}」`);
      ok = false;
    }
    if (!NUMBER.test(miText)) {
      fail(no, 'Mi', `不是數字：「${miText}」`);
      ok = false;
    }
    if (!ok) continue;
    rows.push({
      id,
      name,
      smarts,
      atomCount: Number(atomText),
      vw: vwText === '' ? null : Number(vwText),
      mi: Number(miText),
      valence,
      source,
      audit,
      notes,
    });
    rowNumbers.push(no);
  }
  return { rows, rowNumbers, issues };
}

/** 不需 RDKit 的格式檢查 */
export function validateVwGroups(table: TableResult<VwGroupRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number | null, column: string | null, message: string) => issues.push({ file: VW_GROUPS_FILE, row, column, message });
  if (table.rows.length !== VW_GROUP_COUNT) add(null, null, `應有 ${VW_GROUP_COUNT} 列，實際為 ${table.rows.length} 列`);
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
    else if (!/Table 4\.2/.test(r.source) || !/頁/.test(r.source)) add(no, '出處', '出處需寫明書中表號（Table 4.2）與書頁碼');
    const expected = `V${String(i + 1).padStart(2, '0')}`;
    if (r.id !== expected) add(no, 'id', `id 應依資料表順序為 ${expected}，實際為「${r.id}」`);
    if (r.id !== '') {
      if (ids.has(r.id)) add(no, 'id', `重複：「${r.id}」已出現在第 ${ids.get(r.id)} 列`);
      else ids.set(r.id, no);
    }
    if (!(VW_VALENCES as readonly string[]).includes(r.valence)) add(no, '二價／非二價', `只能是「二價」或「非二價」：「${r.valence}」`);
    if (r.vw === null && !r.notes.includes('留空')) add(no, 'VW', 'VW 留空時，備註需說明原因（寫明「留空」與依據）');
    if (r.notes === '') add(no, '備註', '備註不可為空（需寫明與 Bondi 1964 的對照結果）');
  });
  return issues;
}

/** RDKit 檢查：SMARTS 可解析 */
export function checkVwGroupSmarts(RDKit: RDKitModule, table: TableResult<VwGroupRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  table.rows.forEach((r, i) => {
    if (r.smarts === '') return;
    let q = null;
    try {
      q = RDKit.get_qmol(r.smarts);
    } catch {
      q = null;
    }
    if (!q || !q.is_valid()) issues.push({ file: VW_GROUPS_FILE, row: table.rowNumbers[i], column: 'SMARTS', message: 'RDKit 無法解析這個 SMARTS' });
    q?.delete();
  });
  return issues;
}

/** 隨網站打包的 VW 基團表（依 Table 4.2 順序） */
export const bundledVwGroupsText: string = vwCsv;
export const VW_GROUPS: readonly VwGroupRow[] = readVwGroups(vwCsv).rows;
