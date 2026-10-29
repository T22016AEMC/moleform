// 交聯第 0 層（任務 016，D11）：官能基辨識、配對、網路判定、催化劑與溫度、審核狀態。
// 只依結構與反應規則表做計數判定，不判斷反應會不會實際發生（D17）。可信度「直接計算」。
import type { FunctionalGroupRow, ReactionRuleRow } from '../data/types';
import { resolvePolymer } from '../polymer/convert';
import { averageMolecularWeight } from '../formulation/molecularWeight';
import { analyzeRepeatUnit } from '../polymer/repeatUnit';
import type { RDKitModule } from '../rdkit/types';
import { findGroupSites, parseStructure } from './groups';
import { judgeFormulation, judgePair } from './judge';
import {
  CATALYST_CATEGORY,
  CROSSLINK_MODEL_NAME,
  MESSAGE_NO_CATALYST,
  MESSAGE_NO_TEMPERATURE,
  type ComponentAnalysis,
  type CrosslinkComponent,
  type CrosslinkResult,
  type PairCatalyst,
  type PairEnd,
  type PairResult,
} from './types';

export interface CrosslinkTables {
  functionalGroups: readonly FunctionalGroupRow[];
  reactionRules: readonly ReactionRuleRow[];
}

/** 分析單一成分：解析結構、找官能基位點；聚合物排除連接點並換算聚合度 */
export function analyzeComponent(RDKit: RDKitModule, c: CrosslinkComponent, groups: readonly FunctionalGroupRow[]): ComponentAnalysis {
  const isPolymer = c.canonicalSmiles.includes('*');
  // 小分子優先用 Molfile：原子索引與「分子工具」分頁的 3D 畫面一致；聚合物用 SMILES（與重複單元分析一致）
  const source = !isPolymer && c.molfile && c.molfile.trim() !== '' ? c.molfile : c.canonicalSmiles;
  const base: ComponentAnalysis = { id: c.id, name: c.name, isPolymer, source, dp: null, molarMass: null, distribution: null, groups: [], problem: null };

  const mol = parseStructure(RDKit, source);
  if (!mol) return { ...base, problem: '無法解析這個成分的結構' };
  try {
    base.groups = findGroupSites(RDKit, mol, groups, isPolymer);
  } finally {
    mol.delete();
  }

  if (!isPolymer) base.molarMass = averageMolecularWeight(RDKit, c.canonicalSmiles);
  if (isPolymer) {
    const unit = analyzeRepeatUnit(RDKit, c.canonicalSmiles);
    if (!unit.ok) return { ...base, problem: unit.problem.message };
    if (!c.polymer) return { ...base, problem: '聚合物需要填入 Mw（或 Mn、DP），才能判定' };
    const resolved = resolvePolymer(c.polymer, unit.mUnit);
    if (!resolved.ok) return { ...base, problem: resolved.error };
    base.dp = resolved.dp;
    base.molarMass = resolved.mn;
    base.distribution = { mw: resolved.mw, mn: resolved.mn, mUnit: unit.mUnit };
  }
  return base;
}

/** 此成分每分子平均的反應官能度：位點數 × 規則官能度（每個基團形成的鍵數）；聚合物再乘聚合度。 */
function functionalityOf(a: ComponentAnalysis, groupId: string, perGroup: number): number | null {
  const sites = a.groups.find((g) => g.groupId === groupId)?.sites.length ?? 0;
  if (a.isPolymer) return a.dp === null ? null : sites * perGroup * a.dp;
  return sites * perGroup;
}

const hasGroup = (a: ComponentAnalysis, groupId: string) => a.groups.some((g) => g.groupId === groupId);

function temperatureText(rule: ReactionRuleRow): string {
  if (rule.temp_min_c === null || rule.temp_max_c === null) return MESSAGE_NO_TEMPERATURE;
  return rule.temp_min_c === rule.temp_max_c ? `${rule.temp_min_c} °C` : `${rule.temp_min_c}–${rule.temp_max_c} °C`;
}

export function analyzeCrosslink(RDKit: RDKitModule, components: readonly CrosslinkComponent[], tables: CrosslinkTables): CrosslinkResult {
  const analyses = components.map((c) => analyzeComponent(RDKit, c, tables.functionalGroups));
  const groupName = new Map(tables.functionalGroups.map((g) => [g.id, g]));
  const hasCatalyst = components.some((c) => c.category === CATALYST_CATEGORY);

  const warnings: string[] = [];
  const pairs: PairResult[] = [];
  const marks = new Map<string, Set<number>>();
  const usedRules = new Set<string>();
  const usedGroups = new Set<string>();
  const catalystWarned = new Set<string>();

  const end = (a: ComponentAnalysis, groupId: string, perGroup: number): PairEnd => ({
    componentId: a.id,
    name: a.name,
    groupId,
    isPolymer: a.isPolymer,
    f: functionalityOf(a, groupId, perGroup),
  });
  const mark = (a: ComponentAnalysis, groupId: string) => {
    const set = marks.get(a.id) ?? new Set<number>();
    for (const site of a.groups.find((g) => g.groupId === groupId)?.sites ?? []) site.forEach((atom) => set.add(atom));
    marks.set(a.id, set);
  };

  for (const rule of tables.reactionRules) {
    const perA = rule.functionality_a ?? 1;
    const perB = rule.functionality_b ?? 1;
    const selfRule = rule.group_b === '';
    const sameGroup = rule.group_a === rule.group_b;

    const catalyst: PairCatalyst =
      rule.catalyst_required === 'none'
        ? { status: 'none', message: MESSAGE_NO_CATALYST }
        : hasCatalyst
          ? { status: 'present', message: `需要催化劑（${rule.catalyst_required}）；配方含 ${CATALYST_CATEGORY} 類成分` }
          : { status: 'missing', message: `需要催化劑（${rule.catalyst_required}），但配方沒有 ${CATALYST_CATEGORY} 類成分` };

    for (let i = 0; i < analyses.length; i++) {
      for (let j = selfRule || sameGroup ? i : 0; j < analyses.length; j++) {
        const A = analyses[i];
        const B = analyses[j];
        if (selfRule) {
          if (j !== i || !hasGroup(A, rule.group_a)) continue;
        } else {
          if (!hasGroup(A, rule.group_a) || !hasGroup(B, rule.group_b)) continue;
          // 同一個官能基在兩邊時，同一個成分不與自己配對（避免把同一組基團重複算成自反應）
          if (sameGroup && i === j) continue;
        }
        const endA = end(A, rule.group_a, perA);
        const endB = selfRule ? null : end(B, rule.group_b, perB);
        const nameA = groupName.get(rule.group_a)?.name_zh ?? rule.group_a;
        const nameB = selfRule ? null : (groupName.get(rule.group_b)?.name_zh ?? rule.group_b);
        const kind = selfRule ? judgePair(endA.f, endA.f, A.isPolymer, A.isPolymer) : judgePair(endA.f, endB!.f, A.isPolymer, B.isPolymer);
        pairs.push({
          ruleId: rule.id,
          reactionLabel: `${nameB === null ? nameA : `${nameA}–${nameB}`} ${rule.reaction_type}`,
          groupAName: nameA,
          groupBName: nameB ?? '',
          a: endA,
          b: endB,
          self: i === j,
          kind,
          catalyst,
          temperature: temperatureText(rule),
        });
        usedRules.add(rule.id);
        usedGroups.add(rule.group_a);
        mark(A, rule.group_a);
        if (!selfRule) {
          usedGroups.add(rule.group_b);
          mark(B, rule.group_b);
        }
        if (catalyst.status === 'missing' && !catalystWarned.has(rule.id)) {
          catalystWarned.add(rule.id);
          warnings.push(`規則「${rule.id}」${catalyst.message}（D26）`);
        }
      }
    }
  }

  const participating = new Set(pairs.flatMap((p) => [p.a.componentId, ...(p.b ? [p.b.componentId] : [])]));
  for (const a of analyses) {
    if (a.problem !== null) warnings.push(`「${a.name}」：${a.problem}`);
  }

  const markedAtoms: Record<string, number[]> = {};
  for (const [id, set] of marks) markedAtoms[id] = [...set].sort((x, y) => x - y);

  return {
    modelName: CROSSLINK_MODEL_NAME,
    confidence: 'direct',
    verdict: judgeFormulation(pairs.map((p) => p.kind)),
    pairs,
    nonParticipants: analyses.filter((a) => !participating.has(a.id)).map((a) => ({ id: a.id, name: a.name })),
    components: analyses,
    markedAtoms,
    warnings,
    pendingReview: {
      rules: tables.reactionRules.filter((r) => usedRules.has(r.id) && r.review_status === 'pending').map((r) => r.id),
      groups: tables.functionalGroups.filter((g) => usedGroups.has(g.id) && g.review_status === 'pending').map((g) => g.id),
    },
  };
}
