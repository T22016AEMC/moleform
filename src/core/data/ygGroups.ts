// van Krevelen Yg 基團表 src/data/yg_groups.csv（任務 026，D08、D22）。
// 欄位：id、基團名稱、SMARTS、Ygi、Mi、共軛狀態、表格區段、類型、條件、出處、稽核狀態、正例 SMILES、反例 SMILES、備註。
// 格式檢查（不需 RDKit）：標題列、必填（含出處，缺出處報錯）、id 唯一、數值可讀、共軛狀態與條件和 id 後綴一致、同一家族的 SMARTS 與 Mi 相同。
// RDKit 檢查：SMARTS 可解析、正例必須命中、反例不得命中、Mi 與 SMARTS 描述的基團質量相符（容許 0.1 g/mol，書中 Mi 只印到小數一位）。
// 只確認格式與程式照規則運作，不判斷化學（D17）。
import ygCsv from '../../data/yg_groups.csv?raw';
import { atomicWeight } from '../properties/atomicWeights';
import type { JSMol, RDKitModule } from '../rdkit/types';
import { CsvError, parseCsv } from './csv';
import type { DataIssue, TableResult } from './types';

export const YG_GROUPS_FILE = 'yg_groups.csv';
export const YG_GROUPS_COLUMNS = [
  'id',
  '基團名稱',
  'SMARTS',
  'Ygi',
  'Mi',
  '共軛狀態',
  '表格區段',
  '類型',
  '條件',
  '出處',
  '稽核狀態',
  '正例 SMILES',
  '反例 SMILES',
  '備註',
] as const;

export const YG_KINDS = ['單一基團', '組合基團'] as const;
export const YG_STATES = ['n', 'c', 'cc'] as const;
/** Mi 與 SMARTS 描述的基團質量允許的差（g/mol）；書中 Mi 只印到小數一位 */
export const YG_MASS_TOLERANCE = 0.1;

export interface YgGroupRow {
  id: string;
  name: string;
  smarts: string;
  /** Ygi（K·kg/mol）；書中以括號標示的暫定值去掉括號後存這裡，tentative 為 true */
  ygi: number;
  mi: number;
  tentative: boolean;
  /** n／c／cc；沒有共軛狀態的基團為空字串 */
  state: string;
  section: string;
  kind: string;
  /** 同一家族內不同取值的條件（gen、hb、free、hindered）；沒有為空字串 */
  condition: string;
  source: string;
  audit: string;
  positives: string[];
  negatives: string[];
  notes: string;
}

/** 家族 id：有共軛狀態或條件的列去掉最後一段後綴，其餘就是 id 本身 */
export function ygFamilyId(row: Pick<YgGroupRow, 'id' | 'state' | 'condition'>): string {
  if (row.state === '' && row.condition === '') return row.id;
  const i = row.id.lastIndexOf('.');
  return i < 0 ? row.id : row.id.slice(0, i);
}

function parseNumber(text: string): { value: number; tentative: boolean } | null {
  const t = text.trim();
  const m = /^\((-?\d+(?:\.\d+)?)\)$/.exec(t);
  const body = m ? m[1] : t;
  if (!/^-?\d+(?:\.\d+)?$/.test(body)) return null;
  return { value: Number(body), tentative: m !== null };
}

const split = (s: string): string[] => s.split('|').map((x) => x.trim()).filter((x) => x !== '');

/** 讀取 Yg 基團表；格式錯誤回報在 issues（無法解析的數值該列不收） */
export function readYgGroups(text: string): TableResult<YgGroupRow> {
  const issues: DataIssue[] = [];
  const fail = (row: number | null, column: string | null, message: string) => issues.push({ file: YG_GROUPS_FILE, row, column, message });
  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (e) {
    fail(null, null, `CSV 格式錯誤：${e instanceof CsvError ? e.message : String(e)}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const header = records[0];
  const columns = YG_GROUPS_COLUMNS;
  if (!header) {
    fail(1, null, `檔案是空的，缺少標題列（應為：${columns.join(',')}）`);
    return { rows: [], rowNumbers: [], issues };
  }
  if (header.length !== columns.length || header.some((h, i) => h !== columns[i])) {
    fail(1, null, `標題列與定義不一致。應為：${columns.join(',')}；實際為：${header.join(',')}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const rows: YgGroupRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    const no = r + 1;
    if (rec.length !== columns.length) {
      fail(no, null, `欄位數應為 ${columns.length}，實際為 ${rec.length}`);
      continue;
    }
    const [id, name, smarts, ygiText, miText, state, section, kind, condition, source, audit, pos, neg, notes] = rec.map((s) => s.trim());
    const ygi = parseNumber(ygiText);
    const mi = parseNumber(miText);
    if (!ygi) fail(no, 'Ygi', `不是數字：「${ygiText}」`);
    if (!mi) fail(no, 'Mi', `不是數字：「${miText}」`);
    if (!ygi || !mi) continue;
    rows.push({
      id,
      name,
      smarts,
      ygi: ygi.value,
      mi: mi.value,
      tentative: ygi.tentative,
      state,
      section,
      kind,
      condition,
      source,
      audit,
      positives: split(pos),
      negatives: split(neg),
      notes,
    });
    rowNumbers.push(no);
  }
  return { rows, rowNumbers, issues };
}

/** 不需 RDKit 的格式檢查 */
export function validateYgGroups(table: TableResult<YgGroupRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number, column: string, message: string) => issues.push({ file: YG_GROUPS_FILE, row, column, message });
  const ids = new Map<string, number>();
  const families = new Map<string, { smarts: string; mi: number; row: number; states: Set<string>; conditions: Set<string> }>();
  table.rows.forEach((r, i) => {
    const no = table.rowNumbers[i];
    const required: [string, string][] = [
      ['id', r.id],
      ['基團名稱', r.name],
      ['SMARTS', r.smarts],
      ['表格區段', r.section],
      ['類型', r.kind],
      ['稽核狀態', r.audit],
    ];
    for (const [col, v] of required) if (v === '') add(no, col, '必填欄位是空的');
    if (r.source === '') add(no, '出處', '必填欄位是空的（缺出處，D22）');
    else if (!/Table 6\.\d/.test(r.source) || !/頁/.test(r.source)) add(no, '出處', '出處需寫明書中表號（Table 6.x）與書頁碼');
    if (r.positives.length === 0) add(no, '正例 SMILES', '每個基團至少要有一個正例（D22）');
    if (r.negatives.length === 0) add(no, '反例 SMILES', '每個基團至少要有一個反例（D22）');
    if (r.id !== '') {
      if (ids.has(r.id)) add(no, 'id', `重複：「${r.id}」已出現在第 ${ids.get(r.id)} 列`);
      else ids.set(r.id, no);
    }
    if (!(YG_KINDS as readonly string[]).includes(r.kind) && r.kind !== '') add(no, '類型', `只能是 ${YG_KINDS.join('、')}`);
    if (r.state !== '' && !(YG_STATES as readonly string[]).includes(r.state)) add(no, '共軛狀態', `只能是 ${YG_STATES.join('、')} 或留空`);
    if (r.state !== '' && !r.id.endsWith(`.${r.state}`)) add(no, 'id', `有共軛狀態的列，id 必須以「.${r.state}」結尾`);
    if (r.condition !== '' && !r.id.endsWith(`.${r.condition}`)) add(no, 'id', `有條件的列，id 必須以「.${r.condition}」結尾`);
    if (r.state !== '' && r.condition !== '') add(no, '條件', '同一列不能同時有共軛狀態與條件');
    if (r.tentative && !r.audit.includes('書中標為暫定')) add(no, '稽核狀態', '書中以括號標示的暫定值，稽核狀態需註明「書中標為暫定」');
    if (!(r.mi > 0)) add(no, 'Mi', 'Mi 必須大於 0');
    const fid = ygFamilyId(r);
    const f = families.get(fid);
    if (!f) families.set(fid, { smarts: r.smarts, mi: r.mi, row: no, states: new Set([r.state]), conditions: new Set([r.condition]) });
    else {
      if (f.smarts !== r.smarts) add(no, 'SMARTS', `同一家族「${fid}」的 SMARTS 必須相同（第 ${f.row} 列不同）`);
      if (f.mi !== r.mi) add(no, 'Mi', `同一家族「${fid}」的 Mi 必須相同（第 ${f.row} 列不同）`);
      if (r.state !== '' && f.states.has(r.state)) add(no, '共軛狀態', `家族「${fid}」已有狀態 ${r.state}`);
      if (r.condition !== '' && f.conditions.has(r.condition)) add(no, '條件', `家族「${fid}」已有條件 ${r.condition}`);
      f.states.add(r.state);
      f.conditions.add(r.condition);
    }
  });
  return issues;
}

function parseSmiles(RDKit: RDKitModule, smiles: string): JSMol | null {
  let mol: JSMol | null = null;
  try {
    mol = RDKit.get_mol(smiles);
  } catch {
    mol = null;
  }
  if (mol && !mol.is_valid()) {
    mol.delete();
    return null;
  }
  return mol;
}

function parseQuery(RDKit: RDKitModule, smarts: string): JSMol | null {
  let q: JSMol | null = null;
  try {
    q = RDKit.get_qmol(smarts);
  } catch {
    q = null;
  }
  if (q && !q.is_valid()) {
    q.delete();
    return null;
  }
  return q;
}

interface JsonMol {
  atoms: { z?: number; impHs?: number }[];
}

/** 比對 mol 中第一個命中，回傳命中的原子序號；沒有命中回傳 null */
export function firstMatch(mol: JSMol, query: JSMol): number[] | null {
  const m = JSON.parse(mol.get_substruct_match(query)) as { atoms?: number[] };
  return m.atoms && m.atoms.length > 0 ? m.atoms : null;
}

/** 命中原子（含各自的隱含氫）的質量；遇到原子量表沒有的元素回傳 null */
export function matchedMass(mol: JSMol, atoms: number[]): number | null {
  const json = (JSON.parse(mol.get_json()) as { molecules: JsonMol[] }).molecules[0];
  const h = atomicWeight(1) as number;
  let total = 0;
  for (const i of atoms) {
    const a = json.atoms[i];
    const w = atomicWeight(a.z ?? 6);
    if (w === null) return null;
    total += w + (a.impHs ?? 0) * h;
  }
  return total;
}

/** RDKit 檢查：SMARTS 可解析、正例命中、反例不命中、Mi 與基團質量相符 */
export function checkYgGroupSmarts(RDKit: RDKitModule, table: TableResult<YgGroupRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number, column: string, message: string) => issues.push({ file: YG_GROUPS_FILE, row, column, message });
  table.rows.forEach((r, i) => {
    const no = table.rowNumbers[i];
    if (r.smarts === '') return;
    const query = parseQuery(RDKit, r.smarts);
    if (!query) {
      add(no, 'SMARTS', 'RDKit 無法解析這個 SMARTS');
      return;
    }
    try {
      let massChecked = false;
      for (const smiles of r.positives) {
        const mol = parseSmiles(RDKit, smiles);
        if (!mol) {
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
            if (mass === null) add(no, 'Mi', '基團含有原子量表沒有的元素，無法核對 Mi');
            else if (Math.abs(mass - r.mi) > YG_MASS_TOLERANCE) {
              add(no, 'Mi', `Mi = ${r.mi} 與 SMARTS 描述的基團質量 ${mass.toFixed(3)} g/mol 不符（容許 ${YG_MASS_TOLERANCE}）`);
            }
          }
        } finally {
          mol.delete();
        }
      }
      for (const smiles of r.negatives) {
        const mol = parseSmiles(RDKit, smiles);
        if (!mol) {
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

/** 隨網站打包的 Yg 基團表（依資料表順序） */
export const bundledYgGroupsText: string = ygCsv;
export const YG_GROUPS: readonly YgGroupRow[] = readYgGroups(ygCsv).rows;
