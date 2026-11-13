// 使用者提供的堆積係數 k 與純聚物 Tg 表 src/data/packing_coefficient_k.csv（任務 038 的 E 段，D61；D22、D43）。
// 命名（任務 038）：小寫 k＝堆積係數（Vω／V，無單位，0 到 1），程式一律稱 packingK；大寫 K＝1／Δα 是另一個量（Δα 覆寫值），不在本檔。
//  - 內容由任務卡 docs/tasks/038-relative-tg-ffv.md 的表格逐字轉錄（50 列）；結構類別、材料名稱、k、Tg 原文一字不改。表中沒有 SMILES，不得自行補。
//  - `Tg原文` 逐字存使用者的寫法（「175–180」「約 370」「—」）；`Tg下限`、`Tg上限` 為數值（°C）：單一數值兩者相同，範圍取兩端，「—」留空；
//    `Tg近似` 為 true／false（有「約」為 true）。`備註` 只放材料名稱本身帶的條件（未固化、250°C…），沒有其他說明或數值。
//  - 出處「使用者提供的 k／Tg 表（來源論文待補），2026-11-07」、稽核狀態「待使用者審」；k 的溫度基準與定義（Vω／實際體積）使用者未註明。
//  - 表中的 Tg 是各材料的初始 Tg（使用者 2026-11-07）：不拿來互相運算或互相驗證。
// 格式檢查（不需 RDKit）：標題列、列數、id（PK01–）、必填（缺欄位報錯，D22）、k 在 0 與 1 之間、材料名稱不重複、Tg 欄與 Tg 原文一致。
// 只確認格式與程式照規則運作，不判斷化學（D17）。
import packingCsv from '../../data/packing_coefficient_k.csv?raw';
import { CsvError, parseCsv } from './csv';
import type { DataIssue, TableResult } from './types';

export const PACKING_K_FILE = 'packing_coefficient_k.csv';
export const PACKING_K_COLUMNS = ['id', '結構類別', '材料名稱', 'k', 'Tg原文', 'Tg下限', 'Tg上限', 'Tg近似', '出處', '稽核狀態', '備註'] as const;
/** 使用者 2026-11-07 提供的列數 */
export const PACKING_K_ROW_COUNT = 50;
/** 出處必須寫明的字樣 */
export const PACKING_K_SOURCE_MARK = '使用者提供的 k／Tg 表';
export const PACKING_K_AUDIT = '待使用者審';
/** 查表查不到時的回報文字（不得以相近材料代替） */
export const PACKING_K_NOT_FOUND = 'k 表無此材料';
/** Tg 原文中代表「沒有 Tg」的寫法 */
export const TG_BLANK_MARK = '—';
export const TG_TABLE_BLANK = '表中無 Tg，請輸入';
export const TG_LABEL_MIDPOINT = '範圍中點';
export const TG_LABEL_APPROX = '近似值';

export interface PackingKRow {
  id: string;
  /** 結構類別（判斷結構家族用） */
  category: string;
  /** 材料名稱（逐字，查表用精確比對） */
  name: string;
  /** 堆積係數 k（Vω／V） */
  packingK: number;
  /** k 的原字串（保留末位的 0，核對用） */
  packingKText: string;
  /** Tg 原文（逐字） */
  tgText: string;
  /** Tg 下限、上限（°C）；Tg 原文為「—」時為 null */
  tgLowerC: number | null;
  tgUpperC: number | null;
  /** Tg 原文有「約」 */
  tgApprox: boolean;
  source: string;
  audit: string;
  notes: string;
}

const NUMBER = /^-?\d+(?:\.\d+)?$/;

export type ParsedTgText = { status: 'blank' } | { status: 'ok'; lowerC: number; upperC: number; approx: boolean } | { status: 'invalid'; message: string };

/** 解析 Tg 原文：單值（「114.7」）、範圍（「175–180」，en dash）、近似（「約 370」「約 220–230」）、沒有（「—」） */
export function parseTgText(text: string): ParsedTgText {
  const t = text.trim();
  if (t === TG_BLANK_MARK) return { status: 'blank' };
  const approx = t.startsWith('約');
  const body = approx ? t.slice(1).trim() : t;
  const m = /^(-?\d+(?:\.\d+)?)(?:–(-?\d+(?:\.\d+)?))?$/.exec(body);
  if (!m) return { status: 'invalid', message: `無法解析的 Tg 寫法：「${text}」（可接受：數值、「下限–上限」、前面加「約」、或「${TG_BLANK_MARK}」）` };
  const lowerC = Number(m[1]);
  const upperC = m[2] === undefined ? lowerC : Number(m[2]);
  if (upperC < lowerC) return { status: 'invalid', message: `Tg 範圍的上限小於下限：「${text}」` };
  return { status: 'ok', lowerC, upperC, approx };
}

/** 讀取 k／Tg 表；格式錯誤回報在 issues（無法解析的數值該列不收） */
export function readPackingK(text: string): TableResult<PackingKRow> {
  const issues: DataIssue[] = [];
  const fail = (row: number | null, column: string | null, message: string) => issues.push({ file: PACKING_K_FILE, row, column, message });
  const columns = PACKING_K_COLUMNS;
  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (e) {
    fail(null, null, `CSV 格式錯誤：${e instanceof CsvError ? e.message : String(e)}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const header = records[0];
  if (!header) {
    fail(1, null, `檔案是空的，缺少標題列（應為：${columns.join(',')}）`);
    return { rows: [], rowNumbers: [], issues };
  }
  if (header.length !== columns.length || header.some((h, i) => h !== columns[i])) {
    fail(1, null, `標題列與定義不一致。應為：${columns.join(',')}；實際為：${header.join(',')}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const rows: PackingKRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const no = r + 1;
    if (rec.length !== columns.length) {
      fail(no, null, `欄位數應為 ${columns.length}，實際為 ${rec.length}`);
      continue;
    }
    const [id, category, name, kText, tgText, lowerText, upperText, approxText, source, audit, notes] = rec.map((s) => s.trim());
    let ok = true;
    if (!NUMBER.test(kText)) {
      fail(no, 'k', kText === '' ? '必填欄位是空的' : `不是數字：「${kText}」`);
      ok = false;
    }
    for (const [col, v] of [['Tg下限', lowerText], ['Tg上限', upperText]] as const) {
      if (v !== '' && !NUMBER.test(v)) {
        fail(no, col, `不是數字：「${v}」`);
        ok = false;
      }
    }
    if (approxText !== 'true' && approxText !== 'false') {
      fail(no, 'Tg近似', approxText === '' ? '必填欄位是空的' : `只能是 true 或 false：「${approxText}」`);
      ok = false;
    }
    if (!ok) continue;
    rows.push({
      id,
      category,
      name,
      packingK: Number(kText),
      packingKText: kText,
      tgText,
      tgLowerC: lowerText === '' ? null : Number(lowerText),
      tgUpperC: upperText === '' ? null : Number(upperText),
      tgApprox: approxText === 'true',
      source,
      audit,
      notes,
    });
    rowNumbers.push(no);
  }
  return { rows, rowNumbers, issues };
}

/** 不需 RDKit 的格式檢查（每列缺欄位報錯，D22） */
export function validatePackingK(table: TableResult<PackingKRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number | null, column: string | null, message: string) => issues.push({ file: PACKING_K_FILE, row, column, message });
  if (table.rows.length !== PACKING_K_ROW_COUNT) add(null, null, `應有 ${PACKING_K_ROW_COUNT} 列，實際為 ${table.rows.length} 列`);
  const ids = new Map<string, number>();
  const names = new Map<string, number>();
  table.rows.forEach((r, i) => {
    const no = table.rowNumbers[i];
    const required: [string, string][] = [
      ['id', r.id],
      ['結構類別', r.category],
      ['材料名稱', r.name],
      ['Tg原文', r.tgText],
      ['稽核狀態', r.audit],
    ];
    for (const [col, v] of required) if (v === '') add(no, col, '必填欄位是空的');
    if (r.source === '') add(no, '出處', '必填欄位是空的（缺出處，D22）');
    else if (!r.source.includes(PACKING_K_SOURCE_MARK)) add(no, '出處', `出處需寫明「${PACKING_K_SOURCE_MARK}」與提供日期`);
    if (r.audit !== '' && r.audit !== PACKING_K_AUDIT) add(no, '稽核狀態', `目前只能是「${PACKING_K_AUDIT}」：「${r.audit}」`);
    const expected = `PK${String(i + 1).padStart(2, '0')}`;
    if (r.id !== expected) add(no, 'id', `id 應依資料表順序為 ${expected}，實際為「${r.id}」`);
    if (r.id !== '') {
      if (ids.has(r.id)) add(no, 'id', `重複：「${r.id}」已出現在第 ${ids.get(r.id)} 列`);
      else ids.set(r.id, no);
    }
    if (r.name !== '') {
      if (names.has(r.name)) add(no, '材料名稱', `重複：「${r.name}」已出現在第 ${names.get(r.name)} 列`);
      else names.set(r.name, no);
    }
    if (!(r.packingK > 0 && r.packingK < 1)) add(no, 'k', `堆積係數 k 應在 0 與 1 之間：${r.packingKText}`);
    // Tg 的三個欄位必須與 Tg 原文一致
    if (r.tgText !== '') {
      const parsed = parseTgText(r.tgText);
      if (parsed.status === 'invalid') add(no, 'Tg原文', parsed.message);
      else if (parsed.status === 'blank') {
        if (r.tgLowerC !== null || r.tgUpperC !== null) add(no, 'Tg下限', `Tg 原文為「${TG_BLANK_MARK}」時，Tg下限與 Tg上限必須留空`);
        if (r.tgApprox) add(no, 'Tg近似', `Tg 原文為「${TG_BLANK_MARK}」時應為 false`);
      } else {
        if (r.tgLowerC !== parsed.lowerC) add(no, 'Tg下限', `與 Tg 原文「${r.tgText}」不一致：應為 ${parsed.lowerC}，實際為 ${r.tgLowerC === null ? '空白' : r.tgLowerC}`);
        if (r.tgUpperC !== parsed.upperC) add(no, 'Tg上限', `與 Tg 原文「${r.tgText}」不一致：應為 ${parsed.upperC}，實際為 ${r.tgUpperC === null ? '空白' : r.tgUpperC}`);
        if (r.tgApprox !== parsed.approx) add(no, 'Tg近似', `與 Tg 原文「${r.tgText}」不一致：應為 ${parsed.approx}`);
      }
    }
  });
  return issues;
}

/** 依材料名稱取列：精確比對（逐字相同，含大小寫與全形／半形符號；不修剪、不做任何近似）；查不到回傳 null */
export function findPackingKRow(name: string, rows: readonly PackingKRow[] = PACKING_K_ROWS): PackingKRow | null {
  return rows.find((r) => r.name === name) ?? null;
}

export type PackingKLookup =
  | { status: 'ok'; packingK: number; source: 'user' | 'table'; row: PackingKRow | null }
  | { status: 'notFound'; message: string }
  | { status: 'invalid'; message: string };

/**
 * 查表介面（任務 038 E-3）：使用者直接輸入的堆積係數 k 優先；否則依材料名稱精確比對查表。
 * 查不到 → 回報「k 表無此材料」，不以相近材料代替。使用者輸入的 k 必須在 0 與 1 之間。
 */
export function resolvePackingK(query: { name?: string; packingK?: number }, rows: readonly PackingKRow[] = PACKING_K_ROWS): PackingKLookup {
  const row = query.name === undefined ? null : findPackingKRow(query.name, rows);
  if (query.packingK !== undefined) {
    if (!(Number.isFinite(query.packingK) && query.packingK > 0 && query.packingK < 1)) return { status: 'invalid', message: `堆積係數 k 必須在 0 與 1 之間：${query.packingK}` };
    return { status: 'ok', packingK: query.packingK, source: 'user', row };
  }
  if (query.name === undefined) return { status: 'invalid', message: '沒有材料名稱，也沒有輸入堆積係數 k' };
  if (row === null) return { status: 'notFound', message: `${PACKING_K_NOT_FOUND}：${query.name}` };
  return { status: 'ok', packingK: row.packingK, source: 'table', row };
}

export type TableTg =
  | { status: 'ok'; tgC: number; lowerC: number; upperC: number; raw: string; labels: string[] }
  | { status: 'blank'; raw: string; message: string };

/** 表內 Tg（°C）：範圍取中點並標「範圍中點」；有「約」標「近似值」；空白回報「表中無 Tg，請輸入」，不猜 */
export function tableTgOf(row: PackingKRow): TableTg {
  if (row.tgLowerC === null || row.tgUpperC === null) return { status: 'blank', raw: row.tgText, message: TG_TABLE_BLANK };
  const labels: string[] = [];
  const range = row.tgLowerC !== row.tgUpperC;
  if (range) labels.push(TG_LABEL_MIDPOINT);
  if (row.tgApprox) labels.push(TG_LABEL_APPROX);
  return { status: 'ok', tgC: range ? (row.tgLowerC + row.tgUpperC) / 2 : row.tgLowerC, lowerC: row.tgLowerC, upperC: row.tgUpperC, raw: row.tgText, labels };
}

/** 隨網站打包的 k／Tg 表 */
export const bundledPackingKText: string = packingCsv;
export const PACKING_K_ROWS: readonly PackingKRow[] = readPackingK(packingCsv).rows;
