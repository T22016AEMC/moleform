// 資料表格式檢查（不需要 RDKit 的部分）：共用欄位規則、必填、唯一性、數字關係、跨表參照。
// 只確認「格式符合規則」，不判斷化學正確性（DECISIONS D17）。
import {
  REVIEW_STATUSES,
  SOURCE_TYPES,
  type CommonFields,
  type DataIssue,
  type FunctionalGroupRow,
  type GroupContributionRow,
  type ReactionRuleRow,
  type SolventRow,
  type TableResult,
} from './types';

class Collector {
  issues: DataIssue[] = [];
  constructor(private file: string) {}
  add(row: number | null, column: string | null, message: string) {
    this.issues.push({ file: this.file, row, column, message });
  }
  required(row: number, column: string, value: string) {
    if (value === '') this.add(row, column, '必填欄位是空的');
  }
  minItems(row: number, column: string, value: string[], min: number) {
    if (value.length < min) this.add(row, column, `至少需要 ${min} 個值`);
    value.forEach((v) => {
      if (v === '') this.add(row, column, '清單中有空白項目（多餘的 | ）');
    });
  }
  unique(keys: string[], rowNumbers: number[], column: string) {
    const seen = new Map<string, number>();
    keys.forEach((k, i) => {
      const first = seen.get(k);
      if (first === undefined) seen.set(k, rowNumbers[i]);
      else this.add(rowNumbers[i], column, `重複：「${k}」已出現在第 ${first} 列`);
    });
  }
}

const USER_SOURCE = '使用者提供';

/** YYYY-MM-DD，且是存在的日期 */
function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** 共用欄位規則（出處與審核狀態，AGENTS.md 鐵則 3、D17、D22） */
function checkCommon(c: Collector, row: number, f: CommonFields) {
  if (!(SOURCE_TYPES as readonly string[]).includes(f.source_type)) {
    c.add(row, 'source_type', `只能是 ${SOURCE_TYPES.join('、')}，實際為「${f.source_type}」`);
  }
  if (f.source_type === 'user') {
    // D43：使用者提供的資訊，source 固定為「使用者提供」，source_detail 為提供日期
    if (f.source !== USER_SOURCE) c.add(row, 'source', `source_type 為 user 時 source 須為「${USER_SOURCE}」`);
    if (!isIsoDate(f.source_detail)) {
      c.add(row, 'source_detail', 'source_type 為 user 時 source_detail 須為提供日期（YYYY-MM-DD）');
    }
  } else {
    c.required(row, 'source', f.source);
    c.required(row, 'source_detail', f.source_detail);
  }
  if (f.source_type === 'package' && f.source_original === '') {
    c.add(row, 'source_original', 'source_type 為 package 時必填（套件引用的原始文獻）');
  }
  if (!(REVIEW_STATUSES as readonly string[]).includes(f.review_status)) {
    c.add(row, 'review_status', `只能是 ${REVIEW_STATUSES.join('、')}，實際為「${f.review_status}」`);
  }
  if (f.source_type === 'self' && f.notes === '') {
    c.add(row, 'notes', 'source_type 為 self 時必填（說明為何自行撰寫，D22）');
  }
}

export function validateFunctionalGroups(t: TableResult<FunctionalGroupRow>, file = 'functional_groups.csv') {
  const c = new Collector(file);
  t.rows.forEach((r, i) => {
    const n = t.rowNumbers[i];
    c.required(n, 'id', r.id);
    c.required(n, 'name_zh', r.name_zh);
    c.required(n, 'smarts', r.smarts);
    c.minItems(n, 'should_match', r.should_match, 1);
    c.minItems(n, 'should_not_match', r.should_not_match, 1);
    checkCommon(c, n, r);
  });
  c.unique(t.rows.map((r) => r.id), t.rowNumbers, 'id');
  return c.issues;
}

/** 以 `+` 分隔兩個 SMILES；方括號內的 `+`（電荷）不算分隔符。回傳 null 表示格式不對。 */
export function splitPair(pair: string): [string, string] | null {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of pair) {
    if (ch === '[') depth++;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    if (ch === '+' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') return null;
  return [parts[0], parts[1]];
}

export function validateReactionRules(
  t: TableResult<ReactionRuleRow>,
  groupIds: ReadonlySet<string>,
  file = 'reaction_rules.csv',
) {
  const c = new Collector(file);
  t.rows.forEach((r, i) => {
    const n = t.rowNumbers[i];
    c.required(n, 'id', r.id);
    c.required(n, 'reaction_type', r.reaction_type);
    c.required(n, 'group_a', r.group_a);
    c.required(n, 'reaction_smarts', r.reaction_smarts);
    c.required(n, 'catalyst_required', r.catalyst_required);

    if (r.group_a !== '' && !groupIds.has(r.group_a)) {
      c.add(n, 'group_a', `官能基「${r.group_a}」不存在於 functional_groups.csv`);
    }
    if (r.group_b !== '' && !groupIds.has(r.group_b)) {
      c.add(n, 'group_b', `官能基「${r.group_b}」不存在於 functional_groups.csv`);
    }

    if ((r.temp_min_c === null) !== (r.temp_max_c === null)) {
      c.add(n, 'temp_min_c', 'temp_min_c 與 temp_max_c 必須同時填寫或同時留空');
    } else if (r.temp_min_c !== null && r.temp_max_c !== null && r.temp_min_c > r.temp_max_c) {
      c.add(n, 'temp_min_c', `temp_min_c（${r.temp_min_c}）不可大於 temp_max_c（${r.temp_max_c}）`);
    }

    if (r.group_b === '' && r.functionality_b !== null) {
      c.add(n, 'functionality_b', 'group_b 為空（自反應）時 functionality_b 必須留空');
    }
    for (const [col, v] of [
      ['functionality_a', r.functionality_a],
      ['functionality_b', r.functionality_b],
    ] as const) {
      if (v !== null && !(Number.isInteger(v) && v > 0)) c.add(n, col, `官能度應為正整數，實際為 ${v}`);
    }

    if (r.bond_volume_change !== null && r.bond_volume_change_unit === '') {
      c.add(n, 'bond_volume_change_unit', 'bond_volume_change 有值時單位必填');
    }

    c.minItems(n, 'should_react', r.should_react, 1);
    c.minItems(n, 'should_not_react', r.should_not_react, 1);
    for (const col of ['should_react', 'should_not_react'] as const) {
      r[col].forEach((p) => {
        if (p !== '' && splitPair(p) === null) {
          c.add(n, col, `格式應為 SMILES_A+SMILES_B，實際為「${p}」`);
        }
      });
    }
    checkCommon(c, n, r);
  });
  c.unique(t.rows.map((r) => r.id), t.rowNumbers, 'id');
  return c.issues;
}

export function validateGroupContributions(t: TableResult<GroupContributionRow>, file = 'group_contributions.csv') {
  const c = new Collector(file);
  t.rows.forEach((r, i) => {
    const n = t.rowNumbers[i];
    c.required(n, 'method', r.method);
    c.required(n, 'group_id', r.group_id);
    c.required(n, 'group_name', r.group_name);
    c.required(n, 'property', r.property);
    if (r.value === null) c.add(n, 'value', '必填欄位是空的');
    c.required(n, 'unit', r.unit);
    checkCommon(c, n, r);
  });
  c.unique(
    t.rows.map((r) => `${r.method} / ${r.group_id} / ${r.property}`),
    t.rowNumbers,
    'method, group_id, property',
  );
  // 同一 method 內，同一個 group_id 只能對應一個 group_name
  const names = new Map<string, { name: string; row: number }>();
  t.rows.forEach((r, i) => {
    const key = `${r.method} / ${r.group_id}`;
    const prev = names.get(key);
    if (!prev) names.set(key, { name: r.group_name, row: t.rowNumbers[i] });
    else if (prev.name !== r.group_name) {
      c.add(t.rowNumbers[i], 'group_name', `${key} 的 group_name 與第 ${prev.row} 列不一致（「${prev.name}」）`);
    }
  });
  return c.issues;
}

export function validateSolvents(t: TableResult<SolventRow>, file = 'solvents.csv') {
  const c = new Collector(file);
  t.rows.forEach((r, i) => {
    const n = t.rowNumbers[i];
    c.required(n, 'solvent_id', r.solvent_id);
    c.required(n, 'name_en', r.name_en);
    c.required(n, 'smiles', r.smiles);
    c.required(n, 'property', r.property);
    if (r.value === null) c.add(n, 'value', '必填欄位是空的');
    c.required(n, 'unit', r.unit);
    checkCommon(c, n, r);
  });
  c.unique(
    t.rows.map((r) => `${r.solvent_id} / ${r.property} / ${r.temperature_c ?? '(空)'}`),
    t.rowNumbers,
    'solvent_id, property, temperature_c',
  );
  // 同一 solvent_id 的名稱、CAS、SMILES 每列都要一致
  const first = new Map<string, { row: SolventRow; no: number }>();
  t.rows.forEach((r, i) => {
    const prev = first.get(r.solvent_id);
    if (!prev) {
      first.set(r.solvent_id, { row: r, no: t.rowNumbers[i] });
      return;
    }
    for (const col of ['name_en', 'name_zh', 'cas', 'smiles'] as const) {
      if (prev.row[col] !== r[col]) {
        c.add(
          t.rowNumbers[i],
          col,
          `同一 solvent_id（${r.solvent_id}）的 ${col} 與第 ${prev.no} 列不一致（「${prev.row[col]}」≠「${r[col]}」）`,
        );
      }
    }
  });
  return c.issues;
}
