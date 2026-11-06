// 校準基團表 src/data/yg_calibrated_groups.csv（任務 033，D54）：書中（van Krevelen Table 6.1／6.3／6.20）沒有的 Yg 基團，
// 以文獻聚合物當錨點反推 Yg，再用獨立文獻聚合物檢驗，誤差在 20 K 內才收錄。校準值不是書中值，稽核狀態一律「校準值（非書中值），待使用者審」。
// 欄位：id、基團名稱、類型、SMARTS、Ygi、Mi、錨點、推導、檢驗、稽核狀態、正例 SMILES、反例 SMILES。
// 類型：「整體基團」（與書中基團一起切分，Ygi／Mi 是整個基團）、「H 換成 X 增量」（Table 6.20 型；SMARTS 只描述取代基原子，Ygi＝ΔYg，Mi＝ΔM，Mi 等於 SMARTS 原子質量減去被取代的一個 H）。
// 格式檢查（不需 RDKit）：標題列、必填（錨點、推導、檢驗、稽核狀態缺一就報錯）、id 唯一、數值可讀、稽核狀態須標「校準值（非書中值）」。
// RDKit 檢查：SMARTS 可解析、正例命中、反例不命中、Mi 與基團質量相符（容許 0.1 g/mol）。只確認格式與程式照規則運作，不判斷化學（D17）。
import calibratedCsv from '../../data/yg_calibrated_groups.csv?raw';
import { atomicWeight } from '../properties/atomicWeights';
import type { RDKitModule } from '../rdkit/types';
import { CsvError, parseCsv } from './csv';
import type { DataIssue, TableResult } from './types';
import { firstMatch, matchedMass, type YgGroupRow } from './ygGroups';

export const YG_CALIBRATED_FILE = 'yg_calibrated_groups.csv';
export const YG_CALIBRATED_COLUMNS = [
  'id',
  '基團名稱',
  '類型',
  'SMARTS',
  'Ygi',
  'Mi',
  '錨點',
  '推導',
  '檢驗',
  '稽核狀態',
  '正例 SMILES',
  '反例 SMILES',
] as const;
export const YG_CALIBRATED_KINDS = ['整體基團', 'H 換成 X 增量'] as const;
/** 校準基團轉成 YgGroupRow 時的「表格區段」；切分程式用它判斷基團是不是校準值 */
export const CALIBRATED_SECTION = '校準基團（非書中值）';
export const CALIBRATED_AUDIT_MARK = '校準值（非書中值）';
/** Mi 與基團質量允許的差（g/mol） */
export const YG_CALIBRATED_MASS_TOLERANCE = 0.1;

export interface YgCalibratedRow {
  id: string;
  name: string;
  kind: string;
  smarts: string;
  /** 整體基團：Ygi（K·kg/mol）；H 換成 X 增量：ΔYg */
  ygi: number;
  /** 整體基團：基團質量；H 換成 X 增量：ΔM（取代基質量減去被取代的 H） */
  mi: number;
  anchor: string;
  derivation: string;
  check: string;
  audit: string;
  positives: string[];
  negatives: string[];
}

const split = (s: string): string[] =>
  s
    .split('|')
    .map((x) => x.trim())
    .filter((x) => x !== '');
const toNumber = (text: string): number | null => (/^-?\d+(?:\.\d+)?$/.test(text.trim()) ? Number(text.trim()) : null);

export function readYgCalibrated(text: string): TableResult<YgCalibratedRow> {
  const issues: DataIssue[] = [];
  const fail = (row: number | null, column: string | null, message: string) => issues.push({ file: YG_CALIBRATED_FILE, row, column, message });
  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (e) {
    fail(null, null, `CSV 格式錯誤：${e instanceof CsvError ? e.message : String(e)}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const header = records[0];
  const columns = YG_CALIBRATED_COLUMNS;
  if (!header) {
    fail(1, null, `檔案是空的，缺少標題列（應為：${columns.join(',')}）`);
    return { rows: [], rowNumbers: [], issues };
  }
  if (header.length !== columns.length || header.some((h, i) => h !== columns[i])) {
    fail(1, null, `標題列與定義不一致。應為：${columns.join(',')}；實際為：${header.join(',')}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const rows: YgCalibratedRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const no = r + 1;
    if (rec.length !== columns.length) {
      fail(no, null, `欄位數應為 ${columns.length}，實際為 ${rec.length}`);
      continue;
    }
    const [id, name, kind, smarts, ygiText, miText, anchor, derivation, check, audit, pos, neg] = rec.map((s) => s.trim());
    const ygi = toNumber(ygiText);
    const mi = toNumber(miText);
    if (ygi === null) fail(no, 'Ygi', `不是數字：「${ygiText}」`);
    if (mi === null) fail(no, 'Mi', `不是數字：「${miText}」`);
    if (ygi === null || mi === null) continue;
    rows.push({ id, name, kind, smarts, ygi, mi, anchor, derivation, check, audit, positives: split(pos), negatives: split(neg) });
    rowNumbers.push(no);
  }
  return { rows, rowNumbers, issues };
}

/** 不需 RDKit 的格式檢查：缺錨點、推導或檢驗欄要報錯（D54：每個校準值必須附錨點與檢驗） */
export function validateYgCalibrated(table: TableResult<YgCalibratedRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number, column: string, message: string) => issues.push({ file: YG_CALIBRATED_FILE, row, column, message });
  const ids = new Map<string, number>();
  table.rows.forEach((r, i) => {
    const no = table.rowNumbers[i];
    const required: [string, string][] = [
      ['id', r.id],
      ['基團名稱', r.name],
      ['類型', r.kind],
      ['SMARTS', r.smarts],
      ['稽核狀態', r.audit],
    ];
    for (const [col, v] of required) if (v === '') add(no, col, '必填欄位是空的');
    if (r.anchor === '') add(no, '錨點', '必填欄位是空的（缺錨點：作者、期刊、年份、表號或頁碼、Tg、分子量，D54）');
    else if (!/\d{4}/.test(r.anchor) || !/頁|p\./.test(r.anchor)) add(no, '錨點', '錨點需寫明年份與頁碼');
    if (r.derivation === '') add(no, '推導', '必填欄位是空的（缺推導公式與數值）');
    if (r.check === '') add(no, '檢驗', '必填欄位是空的（缺檢驗：聚合物、文獻值、計算值、差，D54）');
    else if (!/差/.test(r.check)) add(no, '檢驗', '檢驗欄需寫出計算值與差（K）');
    if (r.audit !== '' && !r.audit.includes(CALIBRATED_AUDIT_MARK)) add(no, '稽核狀態', `校準值的稽核狀態需標「${CALIBRATED_AUDIT_MARK}」`);
    if (r.kind !== '' && !(YG_CALIBRATED_KINDS as readonly string[]).includes(r.kind)) add(no, '類型', `只能是 ${YG_CALIBRATED_KINDS.join('、')}`);
    if (r.positives.length === 0) add(no, '正例 SMILES', '每個基團至少要有一個正例（D22）');
    if (r.negatives.length === 0) add(no, '反例 SMILES', '每個基團至少要有一個反例（D22）');
    if (!(r.mi > 0)) add(no, 'Mi', 'Mi 必須大於 0');
    if (r.id !== '') {
      if (ids.has(r.id)) add(no, 'id', `重複：「${r.id}」已出現在第 ${ids.get(r.id)} 列`);
      else ids.set(r.id, no);
    }
  });
  return issues;
}

/** RDKit 檢查：SMARTS 可解析、正例命中、反例不命中、Mi 與基團質量相符 */
export function checkYgCalibratedSmarts(RDKit: RDKitModule, table: TableResult<YgCalibratedRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number, column: string, message: string) => issues.push({ file: YG_CALIBRATED_FILE, row, column, message });
  const hydrogen = atomicWeight(1) as number;
  table.rows.forEach((r, i) => {
    const no = table.rowNumbers[i];
    if (r.smarts === '') return;
    let query: ReturnType<RDKitModule['get_qmol']> | null = null;
    try {
      query = RDKit.get_qmol(r.smarts);
    } catch {
      query = null;
    }
    if (!query || !query.is_valid()) {
      query?.delete();
      add(no, 'SMARTS', 'RDKit 無法解析這個 SMARTS');
      return;
    }
    try {
      let massChecked = false;
      for (const smiles of r.positives) {
        const mol = RDKit.get_mol(smiles);
        if (!mol || !mol.is_valid()) {
          mol?.delete();
          add(no, '正例 SMILES', `RDKit 無法解析「${smiles}」`);
          continue;
        }
        try {
          const atoms = firstMatch(mol, query);
          if (!atoms) {
            add(no, '正例 SMILES', `「${smiles}」沒有命中此 SMARTS`);
            continue;
          }
          if (!massChecked) {
            massChecked = true;
            const mass = matchedMass(mol, atoms);
            const expected = mass === null ? null : r.kind === 'H 換成 X 增量' ? mass - hydrogen : mass;
            if (expected === null) add(no, 'Mi', '基團含有原子量表沒有的元素，無法核對 Mi');
            else if (Math.abs(expected - r.mi) > YG_CALIBRATED_MASS_TOLERANCE) {
              add(no, 'Mi', `Mi = ${r.mi} 與 SMARTS 描述的基團質量 ${expected.toFixed(3)} g/mol 不符（容許 ${YG_CALIBRATED_MASS_TOLERANCE}）`);
            }
          }
        } finally {
          mol.delete();
        }
      }
      for (const smiles of r.negatives) {
        const mol = RDKit.get_mol(smiles);
        if (!mol || !mol.is_valid()) {
          mol?.delete();
          add(no, '反例 SMILES', `RDKit 無法解析「${smiles}」`);
          continue;
        }
        try {
          if (firstMatch(mol, query)) add(no, '反例 SMILES', `「${smiles}」不應命中此 SMARTS，但命中了`);
        } finally {
          mol.delete();
        }
      }
    } finally {
      query.delete();
    }
  });
  return issues;
}

/** 整體基團轉成切分程式使用的 Yg 基團列（表格區段標為校準基團，出處標「校準值（非書中值）」） */
export function calibratedAsYgRow(r: YgCalibratedRow): YgGroupRow {
  return {
    id: r.id,
    name: r.name,
    smarts: r.smarts,
    ygi: r.ygi,
    mi: r.mi,
    tentative: false,
    state: '',
    section: CALIBRATED_SECTION,
    kind: '組合基團',
    condition: '',
    source: `${CALIBRATED_AUDIT_MARK}：${r.anchor}`,
    audit: r.audit,
    positives: r.positives,
    negatives: r.negatives,
    notes: r.derivation,
  };
}

export const bundledYgCalibratedText: string = calibratedCsv;
export const YG_CALIBRATED_GROUPS: readonly YgCalibratedRow[] = readYgCalibrated(calibratedCsv).rows;
