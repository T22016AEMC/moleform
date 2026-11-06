// Tg–Mn 資料點與 Fox–Flory K 表（任務 034，D54、D55）。
// src/data/tg_mn_points.csv：每個 Tg 與 Mn 配對的資料點（來源等級、量測方法、頁碼、換算標記必填）。
// src/data/tg_flory_k.csv：按樹脂類別分開的 Fox–Flory K；沒有通過擬合與獨立檢驗的類別標「缺 K」。
// 格式檢查不需 RDKit：缺欄位、收錄的 K 缺擬合點或檢驗點、檢驗誤差超過 20 K、擬合點與檢驗點的類別或角色不符都報錯（D22）。
// 只確認格式與程式照規則運作，不判斷化學（D17）。
import kCsv from '../../data/tg_flory_k.csv?raw';
import pointsCsv from '../../data/tg_mn_points.csv?raw';
import { CsvError, parseCsv } from './csv';
import type { DataIssue, TableResult } from './types';

export const TG_POINTS_FILE = 'tg_mn_points.csv';
export const TG_K_FILE = 'tg_flory_k.csv';
export const TG_POINTS_COLUMNS = ['id', '類別', '材料', 'Mn', 'Mn類型', 'Tg_K', '不確定度_K', '角色', '量測方法', '來源等級', '換算標記', '出處', '備註'] as const;
export const TG_K_COLUMNS = [
  '類別',
  '類別名稱',
  '代表單元 SMILES',
  '狀態',
  'Tg∞固定值_K',
  '文獻Tg_K',
  'K',
  'K不確定度',
  'Mn下限',
  'Mn上限',
  '可信度',
  '擬合點',
  '檢驗點',
  '檢驗最大誤差_K',
  '擬合方式',
  '出處',
  '稽核狀態',
  '備註',
] as const;

export const TG_POINT_ROLES = ['擬合', '檢驗', '排除', '參考'] as const;
export const TG_K_STATES = ['收錄', '缺 K'] as const;
/** D54：獨立檢驗誤差上限（K） */
export const TG_CHECK_LIMIT_K = 20;
/** D55：換算標記的允許寫法 */
export const TG_CONVERSION_MARKS = ['換算值，低可信度', '外推'] as const;

export interface TgPointRow {
  id: string;
  resinClass: string;
  material: string;
  mn: number;
  mnType: string;
  tgK: number;
  uncertaintyK: number | null;
  role: string;
  method: string;
  grade: string;
  conversion: string;
  source: string;
  notes: string;
}

export interface TgKRow {
  resinClass: string;
  className: string;
  unitSmiles: string;
  state: string;
  tgInfFixedK: number | null;
  literatureTgK: number | null;
  k: number | null;
  kUncertainty: number | null;
  mnMin: number | null;
  mnMax: number | null;
  confidence: string;
  fitPoints: string[];
  checkPoints: string[];
  checkMaxErrorK: number | null;
  fitMethod: string;
  source: string;
  audit: string;
  notes: string;
}

const NUMBER = /^-?\d+(?:\.\d+)?$/;
const split = (s: string): string[] =>
  s
    .split('|')
    .map((x) => x.trim())
    .filter((x) => x !== '');

function records(file: string, text: string, columns: readonly string[], issues: DataIssue[]): string[][] | null {
  const fail = (row: number | null, message: string) => issues.push({ file, row, column: null, message });
  let recs: string[][];
  try {
    recs = parseCsv(text);
  } catch (e) {
    fail(null, `CSV 格式錯誤：${e instanceof CsvError ? e.message : String(e)}`);
    return null;
  }
  const header = recs[0];
  if (!header) {
    fail(1, `檔案是空的，缺少標題列（應為：${columns.join(',')}）`);
    return null;
  }
  if (header.length !== columns.length || header.some((h, i) => h !== columns[i])) {
    fail(1, `標題列與定義不一致。應為：${columns.join(',')}；實際為：${header.join(',')}`);
    return null;
  }
  return recs;
}

/** 數字欄：空白＝null；有填但不是數字回報並回傳 undefined */
function num(file: string, row: number, column: string, text: string, issues: DataIssue[]): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  if (!NUMBER.test(t)) {
    issues.push({ file, row, column, message: `不是數字：「${text}」` });
    return undefined;
  }
  return Number(t);
}

export function readTgPoints(text: string): TableResult<TgPointRow> {
  const issues: DataIssue[] = [];
  const recs = records(TG_POINTS_FILE, text, TG_POINTS_COLUMNS, issues);
  if (!recs) return { rows: [], rowNumbers: [], issues };
  const rows: TgPointRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < recs.length; r++) {
    const rec = recs[r];
    const no = r + 1;
    if (rec.length !== TG_POINTS_COLUMNS.length) {
      issues.push({ file: TG_POINTS_FILE, row: no, column: null, message: `欄位數應為 ${TG_POINTS_COLUMNS.length}，實際為 ${rec.length}` });
      continue;
    }
    const [id, resinClass, material, mnText, mnType, tgText, uText, role, method, grade, conversion, source, notes] = rec.map((s) => s.trim());
    const mn = num(TG_POINTS_FILE, no, 'Mn', mnText, issues);
    const tgK = num(TG_POINTS_FILE, no, 'Tg_K', tgText, issues);
    const u = num(TG_POINTS_FILE, no, '不確定度_K', uText, issues);
    if (mn === undefined || tgK === undefined || u === undefined) continue;
    rows.push({ id, resinClass, material, mn: mn ?? Number.NaN, mnType, tgK: tgK ?? Number.NaN, uncertaintyK: u, role, method, grade, conversion, source, notes });
    rowNumbers.push(no);
  }
  return { rows, rowNumbers, issues };
}

export function readTgK(text: string): TableResult<TgKRow> {
  const issues: DataIssue[] = [];
  const recs = records(TG_K_FILE, text, TG_K_COLUMNS, issues);
  if (!recs) return { rows: [], rowNumbers: [], issues };
  const rows: TgKRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < recs.length; r++) {
    const rec = recs[r];
    const no = r + 1;
    if (rec.length !== TG_K_COLUMNS.length) {
      issues.push({ file: TG_K_FILE, row: no, column: null, message: `欄位數應為 ${TG_K_COLUMNS.length}，實際為 ${rec.length}` });
      continue;
    }
    const c = rec.map((s) => s.trim());
    const n = (i: number) => num(TG_K_FILE, no, TG_K_COLUMNS[i], c[i], issues);
    const tgInf = n(4);
    const lit = n(5);
    const k = n(6);
    const ku = n(7);
    const lo = n(8);
    const hi = n(9);
    const err = n(13);
    if ([tgInf, lit, k, ku, lo, hi, err].some((v) => v === undefined)) continue;
    rows.push({
      resinClass: c[0],
      className: c[1],
      unitSmiles: c[2],
      state: c[3],
      tgInfFixedK: tgInf as number | null,
      literatureTgK: lit as number | null,
      k: k as number | null,
      kUncertainty: ku as number | null,
      mnMin: lo as number | null,
      mnMax: hi as number | null,
      confidence: c[10],
      fitPoints: split(c[11]),
      checkPoints: split(c[12]),
      checkMaxErrorK: err as number | null,
      fitMethod: c[14],
      source: c[15],
      audit: c[16],
      notes: c[17],
    });
    rowNumbers.push(no);
  }
  return { rows, rowNumbers, issues };
}

const hasPage = (s: string) => /頁|p\.|PDF/.test(s);

/** 不需 RDKit 的格式檢查（兩張表一起檢查，才能核對擬合點與檢驗點） */
export function validateTgTables(points: TableResult<TgPointRow>, kTable: TableResult<TgKRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const addP = (row: number, column: string, message: string) => issues.push({ file: TG_POINTS_FILE, row, column, message });
  const addK = (row: number, column: string, message: string) => issues.push({ file: TG_K_FILE, row, column, message });

  const byId = new Map<string, TgPointRow>();
  points.rows.forEach((p, i) => {
    const no = points.rowNumbers[i];
    const required: [string, string][] = [
      ['id', p.id],
      ['類別', p.resinClass],
      ['材料', p.material],
      ['Mn類型', p.mnType],
      ['角色', p.role],
      ['量測方法', p.method],
      ['來源等級', p.grade],
      ['出處', p.source],
    ];
    for (const [col, v] of required) if (v === '') addP(no, col, '必填欄位是空的');
    if (!(p.mn > 0)) addP(no, 'Mn', 'Mn 必須是大於 0 的數字');
    if (!(p.tgK > 0)) addP(no, 'Tg_K', 'Tg 必須是大於 0 的數字（K）');
    if (p.role !== '' && !(TG_POINT_ROLES as readonly string[]).includes(p.role)) addP(no, '角色', `只能是 ${TG_POINT_ROLES.join('、')}`);
    if (p.grade !== '' && !/^(一手|二手)/.test(p.grade)) addP(no, '來源等級', '需以「一手」或「二手」開頭（D55）');
    if (p.source !== '' && !hasPage(p.source)) addP(no, '出處', '出處需寫明頁碼（D55、任務 034）');
    if (p.grade.startsWith('二手') && /換算/.test(p.method) && p.conversion === '') addP(no, '換算標記', '二手資料經換算的點，換算標記必填（D55）');
    if (p.conversion !== '' && !TG_CONVERSION_MARKS.some((m) => p.conversion.includes(m))) addP(no, '換算標記', `需包含 ${TG_CONVERSION_MARKS.map((m) => `「${m}」`).join(' 或 ')}`);
    if (p.id !== '') {
      if (byId.has(p.id)) addP(no, 'id', `重複：「${p.id}」`);
      else byId.set(p.id, p);
    }
  });

  const classes = new Set<string>();
  kTable.rows.forEach((k, i) => {
    const no = kTable.rowNumbers[i];
    const required: [string, string][] = [
      ['類別', k.resinClass],
      ['類別名稱', k.className],
      ['代表單元 SMILES', k.unitSmiles],
      ['狀態', k.state],
      ['稽核狀態', k.audit],
      ['出處', k.source],
      ['備註', k.notes],
    ];
    for (const [col, v] of required) if (v === '') addK(no, col, '必填欄位是空的');
    if (k.resinClass !== '') {
      if (classes.has(k.resinClass)) addK(no, '類別', `重複：「${k.resinClass}」`);
      classes.add(k.resinClass);
    }
    if (k.state !== '' && !(TG_K_STATES as readonly string[]).includes(k.state)) {
      addK(no, '狀態', `只能是 ${TG_K_STATES.join('、')}`);
      return;
    }
    if (k.state === '缺 K') {
      if (k.k !== null) addK(no, 'K', '狀態為「缺 K」時 K 必須留空（不得放未通過檢驗的值）');
      return;
    }
    if (k.state !== '收錄') return;
    // ---- 收錄的 K：欄位齊全、擬合與檢驗資料可核對 ----
    if (k.k === null || !(k.k > 0)) addK(no, 'K', '收錄的 K 必須是大於 0 的數字');
    if (k.kUncertainty === null || !(k.kUncertainty >= 0)) addK(no, 'K不確定度', '收錄的 K 必須附不確定度');
    if (k.tgInfFixedK === null || !(k.tgInfFixedK > 0)) addK(no, 'Tg∞固定值_K', '收錄的 K 必須註明搭配的 Tg∞（K 只能與此 Tg∞ 搭配）');
    if (k.mnMin === null || k.mnMax === null || !(k.mnMin > 0) || !(k.mnMax > k.mnMin)) addK(no, 'Mn下限', '收錄的 K 必須有適用的 Mn 範圍（下限 < 上限）');
    if (k.confidence === '') addK(no, '可信度', '必填欄位是空的');
    if (k.fitMethod === '') addK(no, '擬合方式', '必填欄位是空的');
    if (k.source !== '' && !hasPage(k.source) && !/Table|表/.test(k.source)) addK(no, '出處', '出處需寫明來源（論文與表號或頁碼）');
    if (k.fitPoints.length < 2) addK(no, '擬合點', '收錄的 K 至少要有 2 個擬合點');
    if (k.checkPoints.length < 1) addK(no, '檢驗點', '收錄的 K 必須有獨立檢驗點（D54）');
    if (k.checkMaxErrorK === null) addK(no, '檢驗最大誤差_K', '收錄的 K 必須附檢驗最大誤差');
    else if (k.checkMaxErrorK > TG_CHECK_LIMIT_K) addK(no, '檢驗最大誤差_K', `檢驗誤差 ${k.checkMaxErrorK} K 超過 ${TG_CHECK_LIMIT_K} K，不得收錄（D54）`);
    for (const id of k.fitPoints) {
      const p = byId.get(id);
      if (!p) addK(no, '擬合點', `找不到資料點「${id}」`);
      else {
        if (p.resinClass !== k.resinClass) addK(no, '擬合點', `「${id}」的類別是 ${p.resinClass}，與 ${k.resinClass} 不同（不得跨類別）`);
        if (p.role !== '擬合') addK(no, '擬合點', `「${id}」的角色是「${p.role}」，不是擬合點`);
      }
    }
    for (const id of k.checkPoints) {
      const p = byId.get(id);
      if (!p) addK(no, '檢驗點', `找不到資料點「${id}」`);
      else {
        if (p.resinClass !== k.resinClass) addK(no, '檢驗點', `「${id}」的類別是 ${p.resinClass}，與 ${k.resinClass} 不同`);
        if (p.role !== '檢驗') addK(no, '檢驗點', `「${id}」的角色是「${p.role}」，不是檢驗點`);
        if (k.fitPoints.includes(id)) addK(no, '檢驗點', `「${id}」同時是擬合點，不是獨立檢驗`);
      }
    }
  });
  return issues;
}

export const bundledTgPointsText: string = pointsCsv;
export const bundledTgKText: string = kCsv;
export const TG_POINTS: readonly TgPointRow[] = readTgPoints(pointsCsv).rows;
export const TG_K_ROWS: readonly TgKRow[] = readTgK(kCsv).rows;
