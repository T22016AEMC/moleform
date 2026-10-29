// 載入 src/data 的四個 CSV（以 Vite ?raw 匯入，隨網站建置打包；D21 不需保密）並整合所有不需 RDKit 的檢查。
import functionalGroupsCsv from '../../data/functional_groups.csv?raw';
import reactionRulesCsv from '../../data/reaction_rules.csv?raw';
import groupContributionsCsv from '../../data/group_contributions.csv?raw';
import solventsCsv from '../../data/solvents.csv?raw';
import { checkFunctionalGroupSmarts, checkReactionSmarts } from './chemcheck';
import type { RDKitModule } from '../rdkit/types';
import {
  readFunctionalGroups,
  readGroupContributions,
  readReactionRules,
  readSolvents,
} from './readers';
import {
  validateFunctionalGroups,
  validateGroupContributions,
  validateReactionRules,
  validateSolvents,
} from './validate';
import type {
  DataIssue,
  FunctionalGroupRow,
  GroupContributionRow,
  ReactionRuleRow,
  SolventRow,
  TableResult,
} from './types';

export interface DataTables {
  functionalGroups: TableResult<FunctionalGroupRow>;
  reactionRules: TableResult<ReactionRuleRow>;
  groupContributions: TableResult<GroupContributionRow>;
  solvents: TableResult<SolventRow>;
}

export interface DataTexts {
  functionalGroups: string;
  reactionRules: string;
  groupContributions: string;
  solvents: string;
}

/** 讀取四個表的 CSV 文字，回傳資料列與所有（讀取＋格式）問題。 */
export function loadTables(texts: DataTexts): { tables: DataTables; issues: DataIssue[] } {
  const tables: DataTables = {
    functionalGroups: readFunctionalGroups(texts.functionalGroups),
    reactionRules: readReactionRules(texts.reactionRules),
    groupContributions: readGroupContributions(texts.groupContributions),
    solvents: readSolvents(texts.solvents),
  };
  const groupIds = new Set(tables.functionalGroups.rows.map((r) => r.id));
  const issues = [
    ...tables.functionalGroups.issues,
    ...tables.reactionRules.issues,
    ...tables.groupContributions.issues,
    ...tables.solvents.issues,
    ...validateFunctionalGroups(tables.functionalGroups),
    ...validateReactionRules(tables.reactionRules, groupIds),
    ...validateGroupContributions(tables.groupContributions),
    ...validateSolvents(tables.solvents),
  ];
  return { tables, issues };
}

/** 隨網站打包的實際資料表文字 */
export const bundledTexts: DataTexts = {
  functionalGroups: functionalGroupsCsv,
  reactionRules: reactionRulesCsv,
  groupContributions: groupContributionsCsv,
  solvents: solventsCsv,
};

/** 完整檢查：讀取、格式、跨表參照，再加上 RDKit 的 SMARTS 與測試分子檢查。 */
export function checkAllTables(RDKit: RDKitModule, texts: DataTexts): DataIssue[] {
  const { tables, issues } = loadTables(texts);
  return [
    ...issues,
    ...checkFunctionalGroupSmarts(RDKit, tables.functionalGroups),
    ...checkReactionSmarts(RDKit, tables.reactionRules),
  ];
}
