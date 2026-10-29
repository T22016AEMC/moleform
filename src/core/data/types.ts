// 四種資料表的列型別與欄位定義（任務 009、docs/DATA.md）。

export interface DataIssue {
  /** 檔案名稱，例如 functional_groups.csv */
  file: string;
  /** 資料列編號（標題列為第 1 列，第一筆資料為第 2 列）；整個檔案層級的問題為 null */
  row: number | null;
  /** 欄位名稱；不針對單一欄位時為 null */
  column: string | null;
  message: string;
}

export function formatIssue(issue: DataIssue): string {
  const where = [issue.file, issue.row === null ? null : `第 ${issue.row} 列`, issue.column]
    .filter((x) => x !== null)
    .join(' / ');
  return `${where}：${issue.message}`;
}

export interface TableResult<T> {
  rows: T[];
  /** 與 rows 對應的資料列編號（標題列為第 1 列） */
  rowNumbers: number[];
  issues: DataIssue[];
}

/** 四個表共用的出處與審核欄位（值保持原字串，合法性由 validate 檢查） */
export interface CommonFields {
  source_type: string;
  source: string;
  source_detail: string;
  source_original: string;
  review_status: string;
  notes: string;
}

export const COMMON_COLUMNS = [
  'source_type',
  'source',
  'source_detail',
  'source_original',
  'review_status',
  'notes',
] as const;

export const SOURCE_TYPES = ['book', 'paper', 'package', 'self', 'user'] as const;
export const REVIEW_STATUSES = ['pending', 'approved'] as const;

export interface FunctionalGroupRow extends CommonFields {
  id: string;
  name_zh: string;
  smarts: string;
  reactive_atom_maps: number[];
  should_match: string[];
  should_not_match: string[];
}

export interface ReactionRuleRow extends CommonFields {
  id: string;
  reaction_type: string;
  group_a: string;
  group_b: string;
  reaction_smarts: string;
  catalyst_required: string;
  temp_min_c: number | null;
  temp_max_c: number | null;
  functionality_a: number | null;
  functionality_b: number | null;
  byproduct: string;
  bond_volume_change: number | null;
  bond_volume_change_unit: string;
  should_react: string[];
  should_not_react: string[];
}

export interface GroupContributionRow extends CommonFields {
  method: string;
  group_id: string;
  group_name: string;
  property: string;
  value: number | null;
  unit: string;
}

export interface SolventRow extends CommonFields {
  solvent_id: string;
  name_en: string;
  name_zh: string;
  cas: string;
  smiles: string;
  property: string;
  value: number | null;
  unit: string;
  temperature_c: number | null;
}

export type ColumnKind = 'string' | 'list' | 'number' | 'intList';
export interface ColumnDef {
  name: string;
  kind: ColumnKind;
}

export interface TableDef {
  file: string;
  columns: ColumnDef[];
}

const s = (name: string): ColumnDef => ({ name, kind: 'string' });
const l = (name: string): ColumnDef => ({ name, kind: 'list' });
const n = (name: string): ColumnDef => ({ name, kind: 'number' });
const common: ColumnDef[] = COMMON_COLUMNS.map(s);

export const FUNCTIONAL_GROUPS_TABLE: TableDef = {
  file: 'functional_groups.csv',
  columns: [
    s('id'),
    s('name_zh'),
    s('smarts'),
    { name: 'reactive_atom_maps', kind: 'intList' },
    l('should_match'),
    l('should_not_match'),
    ...common,
  ],
};

export const REACTION_RULES_TABLE: TableDef = {
  file: 'reaction_rules.csv',
  columns: [
    s('id'),
    s('reaction_type'),
    s('group_a'),
    s('group_b'),
    s('reaction_smarts'),
    s('catalyst_required'),
    n('temp_min_c'),
    n('temp_max_c'),
    n('functionality_a'),
    n('functionality_b'),
    s('byproduct'),
    n('bond_volume_change'),
    s('bond_volume_change_unit'),
    l('should_react'),
    l('should_not_react'),
    ...common,
  ],
};

export const GROUP_CONTRIBUTIONS_TABLE: TableDef = {
  file: 'group_contributions.csv',
  columns: [s('method'), s('group_id'), s('group_name'), s('property'), n('value'), s('unit'), ...common],
};

export const SOLVENTS_TABLE: TableDef = {
  file: 'solvents.csv',
  columns: [
    s('solvent_id'),
    s('name_en'),
    s('name_zh'),
    s('cas'),
    s('smiles'),
    s('property'),
    n('value'),
    s('unit'),
    n('temperature_c'),
    ...common,
  ],
};
