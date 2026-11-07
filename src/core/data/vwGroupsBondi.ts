// Bondi (1964) 補充的 VW 基團表 src/data/vw_groups_bondi.csv（任務 037，D22、D59）。
// 欄位沿用 vw_groups.csv（id、基團名稱、SMARTS、原子數、VW、Mi、二價／非二價、出處、稽核狀態、備註），另加「來源等級」「修正量」。
// 兩種列：BG＝基團增量（書沒有、Bondi 有明確值）；BC＝修正（Table XVII 的 decrement，VW 與 Mi 填 0、修正量為負值，只計次、不佔原子）。
// 數值取自 Bondi, J. Phys. Chem. 68, 441 (1964) Table XV（p.449）、Table XVI、Table XVII（p.450），看圖讀取；SMARTS 自行撰寫。
// 格式檢查（不需 RDKit）：標題列、列數、id（BG01–、BC01–）、必填（含出處、頁碼，缺欄位報錯 D22）、數值可讀、BC 列必須有負的修正量。
// 只確認格式與程式照規則運作，不判斷化學（D17）。
import bondiCsv from '../../data/vw_groups_bondi.csv?raw';
import type { RDKitModule } from '../rdkit/types';
import { CsvError, parseCsv } from './csv';
import type { DataIssue, TableResult } from './types';
import type { VwGroupRow } from './vwGroups';

export const VW_BONDI_FILE = 'vw_groups_bondi.csv';
export const VW_BONDI_COLUMNS = ['id', '基團名稱', 'SMARTS', '原子數', 'VW', 'Mi', '二價／非二價', '出處', '稽核狀態', '備註', '來源等級', '修正量'] as const;
/** 基團（BG）與修正（BC）的列數 */
export const VW_BONDI_GROUP_COUNT = 13;
export const VW_BONDI_CORRECTION_COUNT = 5;
/** 補充基團參與的結果必須標示（任務 037，D59） */
export const VW_BONDI_LABEL = '含 Bondi 補充基團（非書值）';
export const VW_BONDI_INTERPRETATION_LABEL = '含詮釋，待使用者審';

export interface VwBondiRow extends VwGroupRow {
  /** 來源等級（D55） */
  sourceLevel: string;
  /** Table XVII 修正量（cm³/mol，負值）；基團列為 null */
  correction: number | null;
  kind: 'group' | 'correction';
}

const NUMBER = /^-?\d+(?:\.\d+)?$/;

/** 讀取 Bondi 補充表；格式錯誤回報在 issues（無法解析的數值該列不收） */
export function readVwGroupsBondi(text: string): TableResult<VwBondiRow> {
  const issues: DataIssue[] = [];
  const fail = (row: number | null, column: string | null, message: string) => issues.push({ file: VW_BONDI_FILE, row, column, message });
  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (e) {
    fail(null, null, `CSV 格式錯誤：${e instanceof CsvError ? e.message : String(e)}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const header = records[0];
  const columns = VW_BONDI_COLUMNS;
  if (!header) {
    fail(1, null, `檔案是空的，缺少標題列（應為：${columns.join(',')}）`);
    return { rows: [], rowNumbers: [], issues };
  }
  if (header.length !== columns.length || header.some((h, i) => h !== columns[i])) {
    fail(1, null, `標題列與定義不一致。應為：${columns.join(',')}；實際為：${header.join(',')}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const rows: VwBondiRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const no = r + 1;
    if (rec.length !== columns.length) {
      fail(no, null, `欄位數應為 ${columns.length}，實際為 ${rec.length}`);
      continue;
    }
    const [id, name, smarts, atomText, vwText, miText, valence, source, audit, notes, sourceLevel, corrText] = rec.map((s) => s.trim());
    let ok = true;
    if (!/^\d+$/.test(atomText) || Number(atomText) < 1 || Number(atomText) > 30) {
      fail(no, '原子數', `只能是 1–30 的整數：「${atomText}」`);
      ok = false;
    }
    if (!NUMBER.test(vwText)) {
      fail(no, 'VW', `不是數字：「${vwText}」`);
      ok = false;
    }
    if (!NUMBER.test(miText)) {
      fail(no, 'Mi', `不是數字：「${miText}」`);
      ok = false;
    }
    if (corrText !== '' && !NUMBER.test(corrText)) {
      fail(no, '修正量', `不是數字：「${corrText}」`);
      ok = false;
    }
    if (!ok) continue;
    rows.push({
      id,
      name,
      smarts,
      atomCount: Number(atomText),
      vw: Number(vwText),
      mi: Number(miText),
      valence,
      source,
      audit,
      notes,
      sourceLevel,
      correction: corrText === '' ? null : Number(corrText),
      kind: id.startsWith('BC') ? 'correction' : 'group',
    });
    rowNumbers.push(no);
  }
  return { rows, rowNumbers, issues };
}

/** 不需 RDKit 的格式檢查 */
export function validateVwGroupsBondi(table: TableResult<VwBondiRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number | null, column: string | null, message: string) => issues.push({ file: VW_BONDI_FILE, row, column, message });
  const groups = table.rows.filter((r) => r.kind === 'group');
  const corrections = table.rows.filter((r) => r.kind === 'correction');
  if (groups.length !== VW_BONDI_GROUP_COUNT) add(null, null, `基團（BG）應有 ${VW_BONDI_GROUP_COUNT} 列，實際為 ${groups.length} 列`);
  if (corrections.length !== VW_BONDI_CORRECTION_COUNT) add(null, null, `修正（BC）應有 ${VW_BONDI_CORRECTION_COUNT} 列，實際為 ${corrections.length} 列`);
  const ids = new Map<string, number>();
  const seen = { BG: 0, BC: 0 };
  table.rows.forEach((r, i) => {
    const no = table.rowNumbers[i];
    const required: [string, string][] = [
      ['id', r.id],
      ['基團名稱', r.name],
      ['SMARTS', r.smarts],
      ['稽核狀態', r.audit],
      ['來源等級', r.sourceLevel],
      ['備註', r.notes],
    ];
    for (const [col, v] of required) if (v === '') add(no, col, '必填欄位是空的');
    if (r.source === '') add(no, '出處', '必填欄位是空的（缺出處，D22）');
    else {
      if (!/Bondi/.test(r.source) || !/Table (XV|XVI|XVII)\b/.test(r.source)) add(no, '出處', '出處需寫明 Bondi 1964 與表號（Table XV、XVI 或 XVII）');
      if (!/p\.\s?\d+/.test(r.source)) add(no, '出處', '出處需寫明頁碼（例：p.450）');
    }
    const m = /^B([GC])(\d\d)$/.exec(r.id);
    if (!m) add(no, 'id', `id 應為 BG01、BG02… 或 BC01、BC02…：「${r.id}」`);
    else {
      const kind = m[1] as 'G' | 'C';
      const key = kind === 'G' ? 'BG' : 'BC';
      seen[key]++;
      const expected = `${key}${String(seen[key]).padStart(2, '0')}`;
      if (r.id !== expected) add(no, 'id', `id 應依資料表順序為 ${expected}，實際為「${r.id}」`);
    }
    if (r.id !== '') {
      if (ids.has(r.id)) add(no, 'id', `重複：「${r.id}」已出現在第 ${ids.get(r.id)} 列`);
      else ids.set(r.id, no);
    }
    if (r.kind === 'group') {
      if (!['二價', '非二價'].includes(r.valence)) add(no, '二價／非二價', `只能是「二價」或「非二價」：「${r.valence}」`);
      if (r.correction !== null) add(no, '修正量', '基團列的修正量必須留空（修正量只放在 BC 列）');
      if (!(r.vw !== null && r.vw > 0)) add(no, 'VW', '基團列的 VW 必須大於 0');
    } else {
      if (r.correction === null || !(r.correction < 0)) add(no, '修正量', '修正列必須有負的修正量（Table XVII 的 decrement）');
      if (r.vw !== 0 || r.mi !== 0) add(no, 'VW', '修正列的 VW 與 Mi 必須是 0（只計次、不佔原子）');
    }
    if (!/待使用者審/.test(r.audit)) add(no, '稽核狀態', '稽核狀態需為「待使用者審」');
    if (!/Bondi 1964/.test(r.sourceLevel)) add(no, '來源等級', '來源等級需寫明 Bondi 1964 原始論文（D55）');
  });
  return issues;
}

/** RDKit 檢查：SMARTS 可解析 */
export function checkVwGroupsBondiSmarts(RDKit: RDKitModule, table: TableResult<VwBondiRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  table.rows.forEach((r, i) => {
    if (r.smarts === '') return;
    let q = null;
    try {
      q = RDKit.get_qmol(r.smarts);
    } catch {
      q = null;
    }
    if (!q || !q.is_valid()) issues.push({ file: VW_BONDI_FILE, row: table.rowNumbers[i], column: 'SMARTS', message: 'RDKit 無法解析這個 SMARTS' });
    q?.delete();
  });
  return issues;
}

/** 隨網站打包的 Bondi 補充表 */
export const bundledVwGroupsBondiText: string = bondiCsv;
export const VW_GROUPS_BONDI: readonly VwBondiRow[] = readVwGroupsBondi(bondiCsv).rows;
