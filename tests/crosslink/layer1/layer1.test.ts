// 第 1 層（官能基比、理論配比、比例掃描）的測試（任務 017）：只檢查程式依公式運作（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeCrosslink } from '../../../src/core/crosslink/analyze';
import { buildSystem, computeLayer1, groupTotals, MESSAGE_NOT_GELLED, NOTE_DISTRIBUTION, type Layer1Setup } from '../../../src/core/crosslink/layer1/layer1';
import { gelConversion, groupMoles } from '../../../src/core/crosslink/layer1/millerMacosko';
import { twoComponentMasses } from '../../../src/core/polymer/distribution';
import { describeAmounts, prepareLayer1, MESSAGE_MULTI_RULE } from '../../../src/core/crosslink/layer1/prepare';
import { SCAN_OPTIONS, scanRatio, setupAtRatio, stoichiometricSetup, checkScanSettings, defaultScanSettings, type ScanProperty } from '../../../src/core/crosslink/layer1/stoich';
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
    expect(r.maxBondsMolPerKg).toBeCloseTo((20 / mE) * 10, 9); // 限量的環氧基完全反應
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
  it('已形成的鍵 = 轉化率 × 限量官能基量（直接計算）', () => {
    const r1 = computeLayer1(setup(), 1)!;
    const r5 = computeLayer1(setup(), 0.5)!;
    expect(r5.bondsFormedMolPerKg).toBeCloseTo(r1.bondsFormedMolPerKg / 2, 9);
    expect(r1.bondsFormedMolPerKg).toBeCloseTo(r1.maxBondsMolPerKg, 9);
  });
  it('Mc = 1／ν_c（每克固體基準）', () => {
    const r = computeLayer1(setup(), 1)!;
    expect(r.mcGPerMol).toBeCloseTo(1000 / (r.effectiveChainsMolPerKg as number), 9);
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

const opt = (property: ScanProperty, direction: 'max' | 'min') => SCAN_OPTIONS.find((o) => o.property === property && o.direction === direction)!;
const RANGE = { min: 0.6, max: 1.4, points: 41 }; // 含當量比 1 的固定範圍

describe('比例掃描', () => {
  const s = () => setupOf(F4A);
  const density = opt('crosslinkDensity', 'max');

  it('預設目標是交聯密度 ν_c（最大）；預設範圍自動包含目前當量比', () => {
    expect(SCAN_OPTIONS[0]).toBe(density);
    const cur = computeLayer1(s(), 1)!.ratioBToA; // 4A 約 2.33
    const auto = defaultScanSettings(cur);
    expect(auto).toEqual({ min: 0.5, max: cur * 1.2, points: 41 });
    expect(defaultScanSettings(1)).toEqual({ min: 0.5, max: 1.5, points: 41 });
    const scan = scanRatio(s(), 1, density)!;
    expect(scan.points[0].ratio).toBeCloseTo(0.5, 12);
    expect(scan.points[40].ratio).toBeCloseTo(cur * 1.2, 12);
    expect(scan.currentRatio).toBeGreaterThan(scan.points[0].ratio);
    expect(scan.currentRatio).toBeLessThan(scan.points[40].ratio);
  });

  it('預設 0.6–1.4、41 點；當量比為 1 的點與化學計量配比一致', () => {
    const scan = scanRatio(s(), 1, density, RANGE)!;
    expect(scan.points).toHaveLength(41);
    expect(scan.points[0].ratio).toBeCloseTo(0.6, 12);
    expect(scan.points[40].ratio).toBeCloseTo(1.4, 12);
    const one = scan.points.find((p) => Math.abs(p.ratio - 1) < 1e-9)!;
    const st = computeLayer1(stoichiometricSetup(s())!, 1)!;
    expect(one.value).toBeCloseTo(st.effectiveChainsMolPerKg as number, 9);
    const atOne = setupAtRatio(s(), 1)!;
    expect(computeLayer1(atOne, 1)!.effectiveChainsMolPerKg).toBeCloseTo(st.effectiveChainsMolPerKg as number, 9);
  });
  it('目前配方的當量比 = B／A 官能基比', () => {
    expect(scanRatio(s(), 1, density)!.currentRatio).toBeCloseTo(computeLayer1(s(), 1)!.ratioBToA, 9);
  });
  it('交聯密度（最大）：最佳點的值不小於所有點，且附有對應配方', () => {
    const scan = scanRatio(s(), 1, density, RANGE)!;
    const best = scan.points[scan.bestIndex as number].value as number;
    for (const p of scan.points) expect(p.value as number).toBeLessThanOrEqual(best + 1e-12);
    expect(scan.bestSetup).not.toBeNull();
  });
  it('Mc（最小）與交聯密度（最大）在近 1 的位置一致；最小與最大選項方向相反', () => {
    const mcMin = scanRatio(s(), 1, opt('mc', 'min'))!;
    const mcMax = scanRatio(s(), 1, opt('mc', 'max'))!;
    const vals = mcMin.points.map((p) => p.value).filter((v): v is number => v !== null);
    expect(mcMin.points[mcMin.bestIndex as number].value).toBe(Math.min(...vals));
    expect(mcMax.points[mcMax.bestIndex as number].value).toBe(Math.max(...vals));
  });
  it('凝膠轉化率與殘留官能基百分比（最小）', () => {
    const gel = scanRatio(s(), 1, opt('gelConversion', 'min'))!;
    const vals = gel.points.map((p) => p.value).filter((v): v is number => v !== null);
    expect(gel.points[gel.bestIndex as number].value).toBe(Math.min(...vals));
    const res = scanRatio(s(), 1, opt('residualTotal', 'min'), RANGE)!;
    // 兩類合計的殘留最少發生在當量比 1（兩類官能基同時耗盡）
    expect(res.points[res.bestIndex as number].ratio).toBeCloseTo(1, 9);
  });
  it('殘留官能基有 A 側、B 側、兩類合計三個選項', () => {
    const props = SCAN_OPTIONS.filter((o) => o.property.startsWith('residual')).map((o) => o.property);
    expect(props).toEqual(['residualA', 'residualB', 'residualTotal']);
    const a = scanRatio(s(), 1, opt('residualA', 'min'), RANGE)!;
    const b = scanRatio(s(), 1, opt('residualB', 'min'), RANGE)!;
    // 當量比 < 1（B 限量）時 A 過量，A 側殘留 > 0；當量比 > 1 時 A 側殘留為 0
    expect(a.points[0].value as number).toBeGreaterThan(0);
    expect(a.points[40].value as number).toBeCloseTo(0, 9);
    expect(b.points[0].value as number).toBeCloseTo(0, 9);
    expect(b.points[40].value as number).toBeGreaterThan(0);
  });
  it('「連入網路的分子數」（式 49 的 [X]）可選，且不小於 0', () => {
    const x = scanRatio(s(), 1, opt('networkMolecules', 'max'), RANGE)!;
    expect(x.bestIndex).not.toBeNull();
    for (const p of x.points) expect(p.value as number).toBeGreaterThanOrEqual(0);
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

// ---------- 分子量分布的兩成分近似（任務 019，D47）----------
// 手算範例：Mw 6000、PDI 1.8 → Mn = 3333.33，M₁ = 2000、M₂ = 10000；M_unit = 200、每重複單元 2 個官能基
//   → 虛擬成分官能度 f₁ = 2000/200×2 = 20、f₂ = 10000/200×2 = 100；重量平均官能度 = 6000/200×2 = 60
const MW_HAND = { mw: 6000, mn: 6000 / 1.8, mUnit: 200, groupsPerUnit: 2 };
const handSetup = (distribution?: typeof MW_HAND): Layer1Setup => ({
  nameA: 'A 基',
  nameB: 'B 基',
  totalMass: 100,
  components: [
    {
      id: 'poly',
      name: '聚合物',
      side: 'A',
      isPolymer: true,
      mass: 80,
      molarMass: MW_HAND.mn,
      groupsPerMolecule: (MW_HAND.mn / MW_HAND.mUnit) * MW_HAND.groupsPerUnit,
      ...(distribution ? { distribution } : {}),
    },
    { id: 'xl', name: '交聯劑', side: 'B', isPolymer: false, mass: 20, molarMass: 100, groupsPerMolecule: 2 },
  ],
});

describe('兩成分近似（D47）', () => {
  it('M₁、M₂ 與手算一致：Mw 6000、PDI 1.8 → 虛擬成分質量 2000、10000，官能度 20、100，各占一半重量', () => {
    const { sys } = buildSystem(handSetup(MW_HAND));
    expect(sys.a).toHaveLength(2);
    const [s1, s2] = sys.a;
    expect(s1.f).toBe(20);
    expect(s2.f).toBe(100);
    expect(s1.mass).toBeCloseTo(40, 9);
    expect(s2.mass).toBeCloseTo(40, 9);
    expect(s1.n).toBeCloseTo(40 / 2000, 9); // 分子數 = 質量 ÷ M₁
    expect(s2.n).toBeCloseTo(40 / 10000, 9);
    // 合計：分子數 = 質量 ÷ Mn、質量 = 80；官能基莫耳數與單一成分（Mn）相同
    expect(s1.n + s2.n).toBeCloseTo(80 / MW_HAND.mn, 9);
    const single = buildSystem(handSetup()).sys;
    expect(groupMoles(sys.a)).toBeCloseTo(groupMoles(single.a), 9);
    expect(groupMoles(sys.b)).toBeCloseTo(groupMoles(single.b), 9);
  });

  it('凝膠點：兩成分近似 = 單一成分取重量平均官能度（f_w = 60，數值一致）', () => {
    const two = buildSystem(handSetup(MW_HAND)).sys;
    // 單一成分、官能度取重量平均（60）：同樣質量，官能基莫耳數與兩成分相同
    const moles = groupMoles(two.a);
    const oneA = [{ f: 60, n: moles / 60, mass: 80 }];
    const gelTwo = gelConversion(two) as number;
    const gelOne = gelConversion({ a: oneA, b: two.b }) as number;
    expect(gelTwo).toBeGreaterThan(0);
    expect(gelTwo).toBeLessThan(1);
    expect(gelTwo).toBeCloseTo(gelOne, 10);
    // 與舊的「只用 Mn」近似（f_n = 33.33）不同：分布越寬，凝膠越早
    const gelMnOnly = gelConversion(buildSystem(handSetup()).sys) as number;
    expect(gelTwo).toBeLessThan(gelMnOnly);
    // 完整分布結果相同的原因：凝膠條件只取決於 Σ a_i(f_i − 1)＝f_w − 1（式 27 的一般形式）
    expect(computeLayer1(handSetup(MW_HAND), 1)!.gelConversion).toBeCloseTo(gelTwo, 12);
  });

  it('凝膠點只取決於 Mw：固定 Mw = 6000 改變 PDI（1.2、1.8、3），凝膠點幾乎相同', () => {
    // 官能基莫耳數與重量平均官能度不變；差異只來自非整數官能度的相鄰整數混合（B-8），小於 1e-4
    const gels = [1.2, 1.8, 3].map((pdi) => {
      const mn = 6000 / pdi;
      const s = handSetup({ ...MW_HAND, mn });
      s.components[0].molarMass = mn;
      s.components[0].groupsPerMolecule = (mn / 200) * 2;
      return gelConversion(buildSystem(s).sys) as number;
    });
    expect(gels[1]).toBeCloseTo(gels[0], 4);
    expect(gels[2]).toBeCloseTo(gels[0], 4);
  });

  it('PDI = 1：與沒有分布資料（任務 017 的單一成分）的結果完全相同', () => {
    const { prep } = prepare(formulation([solid('P', 'P', P, 80, { polymer: { mwInput: 6000, pdiInput: 1 } }), solid('E', 'E', E, 20, { polymer: { mwInput: 3000, pdiInput: 1 } })]));
    if (!prep.ok) throw new Error(prep.reason);
    expect(prep.setup.components.filter((c) => c.isPolymer).every((c) => c.distribution !== undefined)).toBe(true);
    const withDist = computeLayer1(prep.setup, 1)!;
    const stripped: Layer1Setup = { ...prep.setup, components: prep.setup.components.map(({ distribution: _d, ...rest }) => rest) };
    const noDist = computeLayer1(stripped, 1)!;
    expect(withDist).toEqual(noDist);
    // 手算範例也一樣
    const hand = { ...MW_HAND, mn: 6000 };
    const h1 = handSetup(hand);
    h1.components[0].molarMass = 6000;
    h1.components[0].groupsPerMolecule = (6000 / 200) * 2;
    const h2: Layer1Setup = { ...h1, components: h1.components.map(({ distribution: _d, ...rest }) => rest) };
    expect(computeLayer1(h1, 1)).toEqual(computeLayer1(h2, 1));
  });

  it('第 0 層與直接計算結果只取決於質量與組成，不受分子量分布影響', () => {
    const run = (pdi: number) => {
      const f = formulation([solid('P', 'P', P, 80, { polymer: { mwInput: 6000, pdiInput: pdi } }), solid('E', 'E', E, 20, { polymer: { mwInput: 4500, pdiInput: pdi } })]);
      const { result, prep } = prepare(f);
      if (!prep.ok) throw new Error(prep.reason);
      const r = computeLayer1(prep.setup, 0.8)!;
      const noDist = computeLayer1({ ...prep.setup, components: prep.setup.components.map(({ distribution: _d, ...rest }) => rest) }, 0.8)!;
      return { result, totals: groupTotals(prep.setup), r, noDist };
    };
    const base = run(1);
    for (const pdi of [1.8, 2, 3]) {
      const x = run(pdi);
      // 官能基莫耳數（內部）與官能基比、過量、理論最大成鍵數、殘留：與 PDI 無關
      expect(x.totals.nA).toBeCloseTo(base.totals.nA, 9);
      expect(x.totals.nB).toBeCloseTo(base.totals.nB, 9);
      for (const key of ['ratioBToA', 'ratioText', 'limiting', 'excess', 'excessPct', 'maxBondsMolPerKg', 'bondsFormedMolPerKg', 'residualAPct', 'residualBPct', 'residualTotalPct'] as const) {
        if (typeof base.r[key] === 'number') expect(x.r[key] as number).toBeCloseTo(base.r[key] as number, 9);
        else expect(x.r[key]).toEqual(base.r[key]);
      }
      // 加入分布近似前後，直接計算的部分不變
      expect(x.r.ratioBToA).toBeCloseTo(x.noDist.ratioBToA, 9);
      expect(x.r.maxBondsMolPerKg).toBeCloseTo(x.noDist.maxBondsMolPerKg, 9);
      expect(x.r.residualTotalPct).toBeCloseTo(x.noDist.residualTotalPct, 9);
      // 第 0 層：配對與判定相同
      expect(x.result.verdict).toBe(base.result.verdict);
      expect(x.result.pairs.map((p) => p.kind)).toEqual(base.result.pairs.map((p) => p.kind));
    }
  });

  it('只有 Mn 或 DP 的舊資料：PDI 視為 2；Mw = Mn × 2 後以兩成分近似', () => {
    const { prep } = prepare(F4A); // pol = Mn 6000（舊）、epo = DP 21（舊）
    if (!prep.ok) throw new Error(prep.reason);
    const poly = prep.setup.components.find((c) => c.id === 'P')!;
    expect(poly.distribution!.mw).toBeCloseTo(12000, 6);
    expect(poly.distribution!.mn).toBeCloseTo(6000, 6);
    const m = twoComponentMasses(poly.distribution!.mw, poly.distribution!.mn);
    expect(m.m1 + m.m2).toBeCloseTo(24000, 6);
  });

  it('結果附註：分子量分布以兩成分（等重量）近似', () => {
    expect(NOTE_DISTRIBUTION).toBe('分子量分布以兩成分（等重量）近似；凝膠點只取決於 Mw，溶膠分率與交聯密度為近似值');
  });
});
