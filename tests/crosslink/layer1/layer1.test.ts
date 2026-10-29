// 第 1 層（官能基比、理論配比、比例掃描）的測試（任務 017）：只檢查程式依公式運作（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeCrosslink } from '../../../src/core/crosslink/analyze';
import { computeLayer1, groupTotals, MESSAGE_NOT_GELLED, type Layer1Setup } from '../../../src/core/crosslink/layer1/layer1';
import { describeAmounts, prepareLayer1, MESSAGE_MULTI_RULE } from '../../../src/core/crosslink/layer1/prepare';
import { SCAN_OPTIONS, scanRatio, setupAtRatio, stoichiometricSetup, checkScanSettings } from '../../../src/core/crosslink/layer1/stoich';
import type { CrosslinkComponent } from '../../../src/core/crosslink/types';
import { bundledTexts, loadTables } from '../../../src/core/data/load';
import { computeFormulation } from '../../../src/core/formulation/compute';
import type { Component, Formulation } from '../../../src/core/formulation/types';
import { analyzeRepeatUnit } from '../../../src/core/polymer/repeatUnit';
import { getRDKit } from '../../../src/core/rdkit/loader';
import type { RDKitModule } from '../../../src/core/rdkit/types';

const P = '[*:1]c1ccc(C2(c3ccc(C([*:2])c4ccc5ccccc5c4)c(O)c3)c3ccccc3-c3ccccc32)cc1O';
const E = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';
const S = 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2';
const PGMEA = 'COCC(C)OC(C)=O';

let RDKit: RDKitModule;
const { tables } = loadTables(bundledTexts);
const T = { functionalGroups: tables.functionalGroups.rows, reactionRules: tables.reactionRules.rows };
beforeAll(async () => {
  RDKit = await getRDKit();
});

const solid = (id: string, name: string, smiles: string, amount: number, extra: Partial<Component> = {}): Component => ({
  id,
  name,
  canonicalSmiles: smiles,
  category: 'Resin',
  amount,
  ...extra,
});
const pol = solid('P', 'P', P, 80, { polymer: { mnInput: 6000 } });
const epo = solid('E', 'E', E, 20, { polymer: { dpInput: 21 } });
const sbi = solid('S', 'S', S, 1, { category: 'Small Molecule' });
const solvent: Component = { id: 'L', name: 'PGMEA', canonicalSmiles: PGMEA, category: 'Solvent', amount: 100 };

const formulation = (comps: Component[], unit: 'wt' | 'g' = 'wt'): Formulation => ({
  schemaVersion: 1,
  name: 'test',
  solid: { unit, components: comps as Formulation['solid']['components'] },
  liquid: { unit: 'wt', components: [solvent] as Formulation['liquid']['components'] },
  targetSolidContentPct: 4,
});

function prepare(f: Formulation) {
  const comps: CrosslinkComponent[] = [...f.solid.components, ...f.liquid.components].map((c) => ({
    id: c.id,
    name: c.name,
    canonicalSmiles: c.canonicalSmiles,
    category: c.category,
    ...(c.polymer ? { polymer: c.polymer } : {}),
  }));
  const result = analyzeCrosslink(RDKit, comps, T);
  const mw: Record<string, number | undefined> = {};
  for (const c of result.components) mw[c.id] = c.molarMass ?? undefined;
  const outcome = computeFormulation(f, mw);
  return { result, prep: prepareLayer1(result, f, outcome) };
}

const F4A = formulation([pol, epo]);
const F4B = formulation([solid('P', 'P', P, 79.2, { polymer: { mnInput: 6000 } }), solid('E', 'E', E, 19.8, { polymer: { dpInput: 21 } }), sbi]);

function setupOf(f: Formulation): Layer1Setup {
  const { prep } = prepare(f);
  if (!prep.ok) throw new Error(prep.reason);
  return prep.setup;
}

describe('官能基比（手算核對，D17：以程式算出的 M_unit 為準）', () => {
  // 手算 4A：P 的 M_unit ≈ 488.6（Mn 6000 ÷ DP 12.28），每單元 2 個酚羥基；E 的 M_unit = 142.15（GMA），每單元 1 個環氧基。
  //   每 100 g：酚羥基 = 80 × 2 / M_P = 0.3275 mol；環氧基 = 20 × 1 / 142.15 = 0.1407 mol
  //   酚羥基／環氧基 = 0.3275 / 0.1407 = 2.33
  it('4A：酚羥基／環氧基 ≈ 2.33，環氧基為限量', () => {
    const mP = (analyzeRepeatUnit(RDKit, P) as { mUnit: number }).mUnit;
    const mE = (analyzeRepeatUnit(RDKit, E) as { mUnit: number }).mUnit;
    const hand = (80 * 2 / mP) / (20 / mE);
    const r = computeLayer1(setupOf(F4A), 1)!;
    expect(r.ratioBToA).toBeCloseTo(hand, 9);
    expect(r.ratioBToA).toBeGreaterThan(2.3);
    expect(r.ratioBToA).toBeLessThan(2.36);
    expect(r.ratioText).toBe(`環氧基 : 酚羥基 = 1 : ${Number(hand.toFixed(2))}`);
    expect(r.limiting).toBe('A');
    expect(r.excess).toBe('B');
    expect(r.excessPct).toBeCloseTo((hand - 1) * 100, 6);
    expect(r.maxBondsMolPer100g).toBeCloseTo(20 / mE, 9); // 限量的環氧基完全反應
  });

  // 手算 4B：S 為小分子（M ≈ 308.4，2 個酚羥基）：酚羥基 = 0.3275×(79.2/80) + 1×2/M_S，環氧基 = 0.1407×(19.8/20)
  it('4B：酚羥基／環氧基 ≈ 2.37', () => {
    const mP = (analyzeRepeatUnit(RDKit, P) as { mUnit: number }).mUnit;
    const mE = (analyzeRepeatUnit(RDKit, E) as { mUnit: number }).mUnit;
    const mS = RDKit.get_mol(S)!;
    const amw = (JSON.parse(mS.get_descriptors()) as { amw: number }).amw;
    mS.delete();
    const hand = ((79.2 * 2) / mP + (1 * 2) / amw) / (19.8 / mE);
    const r = computeLayer1(setupOf(F4B), 1)!;
    expect(r.ratioBToA).toBeCloseTo(hand, 9);
    expect(r.ratioBToA).toBeGreaterThan(2.34);
    expect(r.ratioBToA).toBeLessThan(2.4);
  });

  it('官能度是非整數（P：24.56），以相鄰整數混合近似', () => {
    const r = computeLayer1(setupOf(F4A), 1)!;
    expect(r.usedMixtureApprox).toBe(true);
    expect(r.hasPolymer).toBe(true);
  });
});

describe('4A 的第 1 層數值', () => {
  const setup = () => setupOf(F4A);
  it('轉化率 100%：已過凝膠點、溶膠分率介於 0–1、Mc 與交聯密度為有限正數', () => {
    const r = computeLayer1(setup(), 1)!;
    expect(r.gelled).toBe(true);
    expect(r.gelConversion).not.toBeNull();
    expect(r.gelConversion as number).toBeLessThan(1);
    expect(r.solFraction).toBeGreaterThanOrEqual(0);
    expect(r.solFraction).toBeLessThan(1);
    expect(r.junctionsMolPerKg as number).toBeGreaterThan(0);
    expect(r.mcGPerMol as number).toBeGreaterThan(0);
  });
  it('殘留：限量官能基 100% 反應時為 0%，過量官能基為 1 − 1/比值', () => {
    const r = computeLayer1(setup(), 1)!;
    expect(r.residualAPct).toBeCloseTo(0, 9);
    expect(r.residualBPct).toBeCloseTo((1 - 1 / r.ratioBToA) * 100, 9);
  });
  it('低於凝膠點：溶膠分率 1，交聯密度與 Mc 不適用（null）', () => {
    const s = setup();
    const gel = computeLayer1(s, 1)!.gelConversion as number;
    const r = computeLayer1(s, gel * 0.9)!;
    expect(r.gelled).toBe(false);
    expect(r.solFraction).toBe(1);
    expect(r.junctionsMolPerKg).toBeNull();
    expect(r.mcGPerMol).toBeNull();
    expect(MESSAGE_NOT_GELLED).toBe('未凝膠，不適用');
  });
  it('轉化率提高時，交聯密度增加、溶膠分率下降', () => {
    const s = setup();
    const lo = computeLayer1(s, 0.6)!;
    const hi = computeLayer1(s, 1)!;
    expect(hi.junctionsMolPerKg as number).toBeGreaterThan(lo.junctionsMolPerKg as number);
    expect(hi.solFraction).toBeLessThan(lo.solFraction);
  });
});

describe('適用範圍', () => {
  it('4B 只有一條規則（E×P、E×S 同一規則），可以計算', () => {
    expect(prepare(F4B).prep.ok).toBe(true);
  });
  it('沒有反應配對：不計算並說明原因', () => {
    const { prep } = prepare(formulation([solid('X', 'PGMEA', PGMEA, 100)]));
    expect(prep.ok).toBe(false);
  });
  it('聚合物缺 Mn 與 DP：不計算', () => {
    const noMn = { ...pol };
    delete (noMn as Partial<Component>).polymer;
    const { prep } = prepare(formulation([noMn, epo]));
    expect(prep.ok).toBe(false);
  });
  it('多條規則同時作用：顯示「目前只支援單一反應規則的第 1 層計算」', () => {
    const { result } = prepare(F4A);
    const fake = { ...result, pairs: [...result.pairs, { ...result.pairs[0], ruleId: 'other' }] };
    const outcome = computeFormulation(F4A, {});
    const prep = prepareLayer1(fake, F4A, outcome);
    expect(prep).toEqual({ ok: false, reason: MESSAGE_MULTI_RULE });
  });
  it('Solid 用量有錯誤（wt% 合計不為 100）：不計算', () => {
    const bad = formulation([{ ...pol, amount: 50 }, epo]);
    expect(prepare(bad).prep.ok).toBe(false);
  });
});

describe('化學計量配比', () => {
  it('調整 group_b 側後，兩類官能基等量；group_a 側與其他成分用量不變', () => {
    const s = setupOf(F4B);
    const st = stoichiometricSetup(s)!;
    const { nA, nB } = groupTotals(st);
    expect(nB / nA).toBeCloseTo(1, 9);
    for (const c of st.components) {
      const before = s.components.find((x) => x.id === c.id)!;
      if (c.side === 'A') expect(c.mass).toBe(before.mass);
    }
    // 各成分之間的相對比例不變：P、S 的質量比不變
    const mP = (id: string, x: Layer1Setup) => x.components.find((c) => c.id === id)!.mass;
    expect(mP('P', st) / mP('S', st)).toBeCloseTo(mP('P', s) / mP('S', s), 9);
    expect(computeLayer1(st, 1)!.ratioBToA).toBeCloseTo(1, 9);
    expect(computeLayer1(st, 1)!.excess).toBeNull();
  });
  it('換回使用者單位（wt%）：總和為 100；重量份為調整後的質量', () => {
    const { prep } = prepare(F4A);
    if (!prep.ok) throw new Error(prep.reason);
    const st = stoichiometricSetup(prep.setup)!;
    const { unit, rows } = describeAmounts(prep, st);
    expect(unit).toBe('wt');
    expect(rows.reduce((t, r) => t + (r.amount as number), 0)).toBeCloseTo(100, 9);
    const e = rows.find((r) => r.id === 'E')!;
    expect(e.parts).toBe(20); // group_a 側不變
    expect(rows.find((r) => r.id === 'P')!.parts).toBeLessThan(80); // 酚羥基過量，所以要減少
  });
  it('單位是 g 時，B 側用量按比例調整', () => {
    const f = formulation([{ ...pol, amount: 8 }, { ...epo, amount: 2 }], 'g');
    const { prep } = prepare(f);
    if (!prep.ok) throw new Error(prep.reason);
    const st = stoichiometricSetup(prep.setup)!;
    const rows = describeAmounts(prep, st).rows;
    const factor = st.components.find((c) => c.id === 'P')!.mass / prep.setup.components.find((c) => c.id === 'P')!.mass;
    expect(rows.find((r) => r.id === 'P')!.amount).toBeCloseTo(8 * factor, 9);
    expect(rows.find((r) => r.id === 'E')!.amount).toBe(2);
  });
});

describe('比例掃描', () => {
  const s = () => setupOf(F4A);
  const density = SCAN_OPTIONS[0];

  it('預設 0.6–1.4、41 點；當量比為 1 的點與化學計量配比一致', () => {
    const scan = scanRatio(s(), 1, density)!;
    expect(scan.points).toHaveLength(41);
    expect(scan.points[0].ratio).toBeCloseTo(0.6, 12);
    expect(scan.points[40].ratio).toBeCloseTo(1.4, 12);
    const one = scan.points.find((p) => Math.abs(p.ratio - 1) < 1e-9)!;
    const st = computeLayer1(stoichiometricSetup(s())!, 1)!;
    expect(one.value).toBeCloseTo(st.junctionsMolPerKg as number, 9);
    const atOne = setupAtRatio(s(), 1)!;
    expect(computeLayer1(atOne, 1)!.junctionsMolPerKg).toBeCloseTo(st.junctionsMolPerKg as number, 9);
  });
  it('目前配方的當量比 = B／A 官能基比', () => {
    expect(scanRatio(s(), 1, density)!.currentRatio).toBeCloseTo(computeLayer1(s(), 1)!.ratioBToA, 9);
  });
  it('交聯密度（最大）：最佳點的值不小於所有點，且附有對應配方', () => {
    const scan = scanRatio(s(), 1, density)!;
    const best = scan.points[scan.bestIndex as number].value as number;
    for (const p of scan.points) expect(p.value as number).toBeLessThanOrEqual(best + 1e-12);
    expect(scan.bestSetup).not.toBeNull();
  });
  it('Mc（最小）與交聯密度（最大）在近 1 的位置一致；最小與最大選項方向相反', () => {
    const mcMin = scanRatio(s(), 1, SCAN_OPTIONS[1])!;
    const mcMax = scanRatio(s(), 1, SCAN_OPTIONS[2])!;
    const vals = mcMin.points.map((p) => p.value).filter((v): v is number => v !== null);
    expect(mcMin.points[mcMin.bestIndex as number].value).toBe(Math.min(...vals));
    expect(mcMax.points[mcMax.bestIndex as number].value).toBe(Math.max(...vals));
  });
  it('凝膠轉化率與殘留官能基百分比（最小）', () => {
    const gel = scanRatio(s(), 1, SCAN_OPTIONS[3])!;
    const vals = gel.points.map((p) => p.value).filter((v): v is number => v !== null);
    expect(gel.points[gel.bestIndex as number].value).toBe(Math.min(...vals));
    const res = scanRatio(s(), 1, SCAN_OPTIONS[5])!;
    // 殘留最少發生在當量比 1（兩類官能基同時耗盡）
    expect(res.points[res.bestIndex as number].ratio).toBeCloseTo(1, 9);
  });
  it('範圍與點數可調整；不合法的設定被拒絕', () => {
    const scan = scanRatio(s(), 1, density, { min: 0.8, max: 1.2, points: 5 })!;
    expect(scan.points.map((p) => Number(p.ratio.toFixed(6)))).toEqual([0.8, 0.9, 1, 1.1, 1.2]);
    expect(scanRatio(s(), 1, density, { min: 1.2, max: 0.8, points: 5 })).toBeNull();
    expect(checkScanSettings({ min: 0, max: 1, points: 5 })).not.toBeNull();
    expect(checkScanSettings({ min: 0.6, max: 1.4, points: 1 })).not.toBeNull();
    expect(checkScanSettings({ min: 0.6, max: 1.4, points: 41 })).toBeNull();
  });
});
