// 由第 0 層結果與配方換算結果，整理出第 1 層的輸入（任務 017 C-10、C-11）。純 TypeScript。
// 只處理「一條反應規則、兩類官能基（A、B）」的逐步加成體系；其他情況回傳不支援的原因。
import type { Formulation } from '../../formulation/types';
import type { FormulationOutcome } from '../../formulation/types';
import type { CrosslinkResult } from '../types';
import { expressAmounts, type AmountItem } from './stoich';
import type { Layer1Component, Layer1Setup } from './layer1';

export const MESSAGE_MULTI_RULE = '目前只支援單一反應規則的第 1 層計算';

export type PrepareOutcome =
  | {
      ok: true;
      setup: Layer1Setup;
      ruleId: string;
      /** Solid 區的單位與各成分原始用量（理論配比換算回使用者單位用） */
      solidUnit: string;
      items: Omit<AmountItem, 'mass'>[];
      /** 各 Solid 成分的質量（與 setup 同一基準：每 100 g 固體） */
      masses: Record<string, number>;
    }
  | { ok: false; reason: string };

export function prepareLayer1(result: CrosslinkResult, formulation: Formulation, outcome: FormulationOutcome | null): PrepareOutcome {
  if (result.pairs.length === 0) return { ok: false, reason: '配方中沒有反應配對' };
  const ruleIds = new Set(result.pairs.map((p) => p.ruleId));
  if (ruleIds.size > 1) return { ok: false, reason: MESSAGE_MULTI_RULE };
  const ruleId = result.pairs[0].ruleId;
  const first = result.pairs[0];
  if (first.b === null || first.a.groupId === first.b.groupId) {
    return { ok: false, reason: '第 1 層只支援兩類不同官能基互相反應的規則（自反應或同類官能基暫不支援）' };
  }

  const undetermined = result.components.find((c) => c.problem !== null && result.pairs.some((p) => p.a.componentId === c.id || p.b?.componentId === c.id));
  if (undetermined) return { ok: false, reason: `「${undetermined.name}」：${undetermined.problem}` };

  const solidResult = outcome?.results.solid;
  if (!solidResult) return { ok: false, reason: '請先修正「配方工作台」 Solid 區的用量錯誤，才能計算第 1 層' };
  const solidComps = formulation.solid.components;
  const wt = new Map(solidResult.components.map((c) => [c.id, c.wtPct.value]));
  if (solidComps.length === 0 || solidComps.some((c) => wt.get(c.id) == null)) {
    return { ok: false, reason: '請先填完「配方工作台」 Solid 區的用量' };
  }

  // 每個參與成分在 A、B 兩側的每分子官能度（來自第 0 層各配對的兩端）
  const fA = new Map<string, number | null>();
  const fB = new Map<string, number | null>();
  for (const p of result.pairs) {
    fA.set(p.a.componentId, p.a.f);
    fB.set(p.b!.componentId, p.b!.f);
  }
  for (const id of fA.keys()) {
    if (fB.has(id)) return { ok: false, reason: '同一個成分同時含兩類反應官能基，第 1 層暫不支援' };
  }

  const solidIds = new Set(solidComps.map((c) => c.id));
  const analysis = new Map(result.components.map((c) => [c.id, c]));
  const components: Layer1Component[] = [];
  for (const [side, map] of [['A', fA], ['B', fB]] as const) {
    for (const [id, f] of map) {
      const a = analysis.get(id)!;
      if (!solidIds.has(id)) return { ok: false, reason: `「${a.name}」在 Liquid 區，第 1 層只計算 Solid 區成分的反應` };
      if (f === null || !(f > 0) || a.molarMass === null || !(a.molarMass > 0)) {
        return { ok: false, reason: `「${a.name}」缺少計算所需的資料（聚合物需 Mw、Mn 或 DP）` };
      }
      // 聚合物：每重複單元官能基數 = f ÷ DP_n；分子量分布以兩成分近似（D47）
      const distribution = a.isPolymer && a.distribution && a.dp !== null && a.dp > 0 ? { ...a.distribution, groupsPerUnit: f / a.dp } : undefined;
      components.push({
        id,
        name: a.name,
        side,
        isPolymer: a.isPolymer,
        ...(a.units && a.units.length > 1 ? { isCopolymer: true } : {}),
        mass: wt.get(id) as number,
        molarMass: a.molarMass,
        groupsPerMolecule: f,
        ...(distribution ? { distribution } : {}),
      });
    }
  }

  const totalMass = solidComps.reduce((t, c) => t + (wt.get(c.id) as number), 0);
  const masses: Record<string, number> = {};
  for (const c of solidComps) masses[c.id] = wt.get(c.id) as number;
  const items = solidComps.map((c) => ({
    id: c.id,
    name: c.name.trim() || c.canonicalSmiles,
    massOld: wt.get(c.id) as number,
    molarMass: analysis.get(c.id)?.molarMass ?? null,
    amountOld: c.amount,
    ...(c.isResin ? { isResin: true } : {}),
  }));
  return {
    ok: true,
    setup: { nameA: first.groupAName, nameB: first.groupBName, components, totalMass },
    ruleId,
    solidUnit: formulation.solid.unit,
    items,
    masses,
  };
}

export interface AmountRow {
  id: string;
  name: string;
  /** 重量份：以目前配方的固體總量為 100 份時，調整後的質量 */
  parts: number;
  /** 以使用者的 Solid 區單位表示的用量；無法換算為 null */
  amount: number | null;
}

/** 調整後的配方（理論配比或掃描最佳點）換回使用者單位與重量份的各成分用量 */
export function describeAmounts(prep: Extract<PrepareOutcome, { ok: true }>, adjusted: Layer1Setup): { unit: string; rows: AmountRow[] } {
  const newMass = new Map(adjusted.components.map((c) => [c.id, c.mass]));
  const items: AmountItem[] = prep.items.map((i) => ({ ...i, mass: newMass.get(i.id) ?? i.massOld }));
  const amounts = expressAmounts(prep.solidUnit, items);
  return { unit: prep.solidUnit, rows: items.map((i, k) => ({ id: i.id, name: i.name, parts: i.mass, amount: amounts ? amounts[k] : null })) };
}
