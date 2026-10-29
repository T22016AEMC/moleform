// Random 共聚物的測試（任務 020）：比例換算、平均單元、單一單元＝均聚物、4A 官能基比。只檢查程式照規則運作（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeComponent, analyzeCrosslink } from '../../src/core/crosslink/analyze';
import { computeLayer1 } from '../../src/core/crosslink/layer1/layer1';
import { prepareLayer1 } from '../../src/core/crosslink/layer1/prepare';
import type { CrosslinkComponent } from '../../src/core/crosslink/types';
import { bundledTexts, loadTables } from '../../src/core/data/load';
import { computeFormulation } from '../../src/core/formulation/compute';
import type { Formulation } from '../../src/core/formulation/types';
import { analyzePolymerUnits } from '../../src/core/polymer/copolymer';
import { parsePolymerSpec, resolvePolymer } from '../../src/core/polymer/convert';
import { analyzeRepeatUnit } from '../../src/core/polymer/repeatUnit';
import type { PolymerSpec } from '../../src/core/polymer/types';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';

const UNIT_A = '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O'; // 雙酚茀
const UNIT_B = '[*:1]C([*:2])c1ccc2ccccc2c1'; // 萘基次甲基
const P_OLD = '[*:1]c1ccc(C2(c3ccc(C([*:2])c4ccc5ccccc5c4)c(O)c3)c3ccccc3-c3ccccc32)cc1O'; // 任務 019 以前的 1:1 單元
const E = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';

let RDKit: RDKitModule;
const { tables } = loadTables(bundledTexts);
const T = { functionalGroups: tables.functionalGroups.rows, reactionRules: tables.reactionRules.rows };
beforeAll(async () => {
  RDKit = await getRDKit();
});

const mUnitOf = (smiles: string) => {
  const a = analyzeRepeatUnit(RDKit, smiles);
  if (!a.ok) throw new Error(a.problem.message);
  return a.mUnit;
};
const COPOLY: PolymerSpec = {
  mwInput: 6000,
  pdiInput: 1.8,
  units: [
    { smiles: UNIT_A, fraction: 66.67 },
    { smiles: UNIT_B, fraction: 33.33 },
  ],
  fractionBasis: 'mol',
};
// 精確 2:1 的莫耳分率（用於手算核對；使用者輸入 66.67／33.33 時合計 100，莫耳分率有 1e-4 的差）
const EXACT: PolymerSpec = { ...COPOLY, units: [{ smiles: UNIT_A, fraction: 200 / 3 }, { smiles: UNIT_B, fraction: 100 / 3 }] };

describe('比例與合計', () => {
  it('mol%：合計 100（±0.01）才可用；莫耳分率 = 比例 ÷ 100', () => {
    const ok = analyzePolymerUnits(RDKit, UNIT_A, { units: [{ smiles: UNIT_A, fraction: 66.67 }, { smiles: UNIT_B, fraction: 33.33 }], fractionBasis: 'mol' });
    expect(ok.ok && ok.units!.map((u) => Number(u.molFraction.toFixed(6)))).toEqual([0.6667, 0.3333]);
    const edge = analyzePolymerUnits(RDKit, UNIT_A, { units: [{ smiles: UNIT_A, fraction: 66.67 }, { smiles: UNIT_B, fraction: 33.34 }], fractionBasis: 'mol' });
    expect(edge.ok).toBe(true); // 合計 100.01，在容差內
    const bad = analyzePolymerUnits(RDKit, UNIT_A, { units: [{ smiles: UNIT_A, fraction: 60 }, { smiles: UNIT_B, fraction: 30 }], fractionBasis: 'mol' });
    expect(bad).toMatchObject({ ok: false, problem: { code: 'BAD_FRACTION' } });
    expect(!bad.ok && bad.problem.message).toBe('各單元的 mol% 合計為 90，應為 100（容差 ±0.01）。');
    const wtBad = analyzePolymerUnits(RDKit, UNIT_A, { units: [{ smiles: UNIT_A, fraction: 60 }, { smiles: UNIT_B, fraction: 50 }], fractionBasis: 'wt' });
    expect(!wtBad.ok && wtBad.problem.message).toContain('wt%');
    const neg = analyzePolymerUnits(RDKit, UNIT_A, { units: [{ smiles: UNIT_A, fraction: 110 }, { smiles: UNIT_B, fraction: -10 }] });
    expect(neg.ok).toBe(false);
  });

  it('單元結構不合連接點規則：指出是第幾個單元', () => {
    const r = analyzePolymerUnits(RDKit, UNIT_A, { units: [{ smiles: UNIT_A, fraction: 50 }, { smiles: 'CCO', fraction: 50 }] });
    expect(!r.ok && r.problem.message).toMatch(/^單元 2：/);
  });

  it('wt% 以各單元 M_unit 換成莫耳分率：x_i ∝ w_i ÷ M_i', () => {
    const mA = mUnitOf(UNIT_A);
    const mB = mUnitOf(UNIT_B);
    const r = analyzePolymerUnits(RDKit, UNIT_A, { units: [{ smiles: UNIT_A, fraction: 70 }, { smiles: UNIT_B, fraction: 30 }], fractionBasis: 'wt' });
    if (!r.ok) throw new Error(r.problem.message);
    const nA = 70 / mA;
    const nB = 30 / mB;
    expect(r.units![0].molFraction).toBeCloseTo(nA / (nA + nB), 12);
    expect(r.units![1].molFraction).toBeCloseTo(nB / (nA + nB), 12);
    // 平均單元質量 = 100 g 的總質量 ÷ 總莫耳數
    expect(r.mUnit).toBeCloseTo(100 / (nA + nB), 9);
  });
});

describe('平均重複單元（P：雙酚茀 : 萘基次甲基 = 2 : 1）', () => {
  // 手算：單元 A 去除 * 後 C25H16O2 ≈ 348.40、單元 B C11H8 ≈ 140.18；
  //   M̄_unit = (2×348.40 + 140.18)/3 = 278.99；每平均單元酚羥基數 = (2×2 + 0×1)/3 = 4/3
  it('M_unit 與分子式', () => {
    const a = analyzeRepeatUnit(RDKit, UNIT_A);
    const b = analyzeRepeatUnit(RDKit, UNIT_B);
    expect(a.ok && a.formula).toBe('C25H16O2');
    expect(b.ok && b.formula).toBe('C11H8');
    expect(mUnitOf(UNIT_A)).toBeCloseTo(348.4, 1);
    expect(mUnitOf(UNIT_B)).toBeCloseTo(140.18, 1);
  });

  it('M̄_unit = (2×M_A + M_B)/3；每平均單元 OH = 4/3；每分子 f = DP × 4/3', () => {
    const mA = mUnitOf(UNIT_A);
    const mB = mUnitOf(UNIT_B);
    const hand = (2 * mA + mB) / 3;
    expect(hand).toBeCloseTo((2 * 348.4 + 140.18) / 3, 1);
    const a = analyzeComponent(RDKit, { id: 'P', name: 'P', canonicalSmiles: UNIT_A, category: 'Resin', polymer: EXACT }, T.functionalGroups);
    expect(a.problem).toBeNull();
    expect(a.distribution!.mUnit).toBeCloseTo(hand, 9);
    expect(a.dp).toBeCloseTo(6000 / 1.8 / hand, 9);
    const phenol = Object.keys(a.unitGroupCounts).find((id) => a.units![0].groups.some((g) => g.groupId === id))!;
    expect(a.unitGroupCounts[phenol]).toBeCloseTo(4 / 3, 9);
  });

  it('單元 B 沒有酚羥基；官能基只在單元 A', () => {
    const a = analyzeComponent(RDKit, { id: 'P', name: 'P', canonicalSmiles: UNIT_A, category: 'Resin', polymer: EXACT }, T.functionalGroups);
    expect(a.units![0].groups).toHaveLength(1);
    expect(a.units![0].groups[0].sites).toHaveLength(2);
    expect(a.units![1].groups).toEqual([]);
    expect(a.groups.map((g) => g.groupId)).toEqual(a.units![0].groups.map((g) => g.groupId));
  });
});

function layer1Of(p: CrosslinkComponent, e: CrosslinkComponent) {
  const f: Formulation = {
    schemaVersion: 1,
    name: '4A',
    solid: {
      unit: 'wt',
      components: [
        { id: 'P', name: 'P', canonicalSmiles: p.canonicalSmiles, category: 'Resin', amount: 80, ...(p.polymer ? { polymer: p.polymer } : {}) },
        { id: 'E', name: 'E', canonicalSmiles: e.canonicalSmiles, category: 'Resin', amount: 20, ...(e.polymer ? { polymer: e.polymer } : {}) },
      ],
    },
    liquid: { unit: 'wt', components: [] },
  };
  const result = analyzeCrosslink(RDKit, [p, e], T);
  const mw: Record<string, number | undefined> = {};
  for (const c of result.components) mw[c.id] = c.molarMass ?? undefined;
  const prep = prepareLayer1(result, f, computeFormulation(f, mw));
  if (!prep.ok) throw new Error(prep.reason);
  return { result, prep, r: computeLayer1(prep.setup, 1)! };
}
const comp = (id: string, smiles: string, polymer: PolymerSpec): CrosslinkComponent => ({ id, name: id, canonicalSmiles: smiles, category: 'Resin', polymer });
const E_SPEC: PolymerSpec = { mwInput: 4500 };

describe('單一單元共聚物 = 原均聚物（結果完全相同）', () => {
  it('第 0 層與第 1 層結果逐項相同（Mw＋PDI、Mn、DP 三種輸入）', () => {
    for (const spec of [{ mwInput: 6000, pdiInput: 1.8 }, { mnInput: 6000 }, { dpInput: 12 }] as PolymerSpec[]) {
      const homo = layer1Of(comp('P', P_OLD, spec), comp('E', E, E_SPEC));
      const single = layer1Of(
        comp('P', P_OLD, { ...spec, units: [{ smiles: P_OLD, fraction: 100 }], fractionBasis: 'mol' }),
        comp('E', E, { ...E_SPEC, units: [{ smiles: E, fraction: 100 }] }),
      );
      expect(single.r).toEqual(homo.r);
      expect(single.result.pairs.map((p) => [p.a.f, p.b!.f, p.kind])).toEqual(homo.result.pairs.map((p) => [p.a.f, p.b!.f, p.kind]));
      expect(single.result.verdict).toBe(homo.result.verdict);
      expect(single.prep.setup).toEqual(homo.prep.setup);
      expect(single.result.components.map((c) => [c.dp, c.molarMass, c.distribution])).toEqual(homo.result.components.map((c) => [c.dp, c.molarMass, c.distribution]));
    }
  });

  it('wt% 基準的單一單元也相同', () => {
    const homo = layer1Of(comp('P', P_OLD, { mwInput: 6000, pdiInput: 1.8 }), comp('E', E, E_SPEC));
    const single = layer1Of(comp('P', P_OLD, { mwInput: 6000, pdiInput: 1.8, units: [{ smiles: P_OLD, fraction: 100 }], fractionBasis: 'wt' }), comp('E', E, E_SPEC));
    expect(single.r).toEqual(homo.r);
  });

  it('M̄_unit 與單一單元的 M_unit 完全相同', () => {
    const m = mUnitOf(P_OLD);
    const a = analyzePolymerUnits(RDKit, P_OLD, { units: [{ smiles: P_OLD, fraction: 100 }] });
    expect(a.ok && a.mUnit).toBe(m);
    expect(resolvePolymer({ mwInput: 6000, pdiInput: 1.8 }, m)).toEqual(resolvePolymer({ mwInput: 6000, pdiInput: 1.8 }, a.ok ? a.mUnit : 0));
  });
});

describe('P 改為 2 : 1 共聚物後的 4A', () => {
  it('官能基比：酚羥基當量 = M̄_unit ÷ (4/3)；約 1 : 2.72（手算）', () => {
    const mAvg = (2 * mUnitOf(UNIT_A) + mUnitOf(UNIT_B)) / 3;
    const mE = mUnitOf(E);
    const ohEquivalent = mAvg / (4 / 3); // 每莫耳酚羥基的質量
    const hand = 80 / ohEquivalent / (20 / mE);
    const { r } = layer1Of(comp('P', UNIT_A, EXACT), comp('E', E, E_SPEC));
    expect(r.ratioBToA).toBeCloseTo(hand, 9);
    expect(r.ratioBToA).toBeGreaterThan(2.7);
    expect(r.ratioBToA).toBeLessThan(2.75);
    expect(r.ratioText).toBe(`環氧基 : 酚羥基 = 1 : ${Number(hand.toFixed(2))}`);
    expect(r.limiting).toBe('A');
    // 使用者輸入 66.67／33.33 時，結果相差在 1e-3 內
    expect(layer1Of(comp('P', UNIT_A, COPOLY), comp('E', E, E_SPEC)).r.ratioBToA).toBeCloseTo(hand, 3);
  });

  it('第 0 層：反應原子分別標在每種單元上；單元 B 沒有反應原子；判定為網路', () => {
    const { result } = layer1Of(comp('P', UNIT_A, COPOLY), comp('E', E, E_SPEC));
    expect(result.verdict).toBe('network');
    expect(result.markedUnitAtoms.P).toHaveLength(2);
    expect(result.markedUnitAtoms.P[0].length).toBeGreaterThan(0);
    expect(result.markedUnitAtoms.P[1]).toEqual([]);
    expect(result.markedUnitAtoms.E).toBeUndefined(); // 均聚物沒有分單元標記
  });

  it('配方 mol%（D46）：以重複單元計用 M̄_unit；以鏈計用 Mn', () => {
    const f: Formulation = {
      schemaVersion: 1,
      name: 'x',
      solid: {
        unit: 'g',
        components: [
          { id: 'P', name: 'P', canonicalSmiles: UNIT_A, category: 'Resin', amount: 80, polymer: EXACT },
          { id: 'Q', name: 'Q', canonicalSmiles: 'CCO', category: 'Small Molecule', amount: 20 },
        ],
      },
      liquid: { unit: 'g', components: [] },
    };
    const mAvg = (2 * mUnitOf(UNIT_A) + mUnitOf(UNIT_B)) / 3;
    const mn = 6000 / 1.8;
    const chain = computeFormulation(f, { P: mn, Q: 46.07 }, { unitWeights: { P: mAvg } });
    const unit = computeFormulation({ ...f, polymerMolBasis: 'unit' }, { P: mn, Q: 46.07 }, { unitWeights: { P: mAvg } });
    const share = (m: number) => 80 / m / (80 / m + 20 / 46.07);
    expect(chain.results.solid!.components[0].molPct.value).toBeCloseTo(share(mn) * 100, 8);
    expect(unit.results.solid!.components[0].molPct.value).toBeCloseTo(share(mAvg) * 100, 8);
    expect(unit.results.solid!.polymerMolNote).toBe('聚合物 mol% 以重複單元計');
  });
});

describe('共聚物設定的存取', () => {
  it('parsePolymerSpec 保留 units、fractionBasis；舊檔（沒有 units）視為均聚物', () => {
    expect(parsePolymerSpec(COPOLY)).toEqual({ ok: true, spec: COPOLY });
    expect(parsePolymerSpec({ mnInput: 6000 })).toEqual({ ok: true, spec: { mnInput: 6000 } });
    expect(parsePolymerSpec({ mwInput: 1, units: [] }).ok).toBe(false);
    expect(parsePolymerSpec({ mwInput: 1, units: [{ smiles: 'CCO', fraction: 100 }] }).ok).toBe(false);
    expect(parsePolymerSpec({ mwInput: 1, units: [{ smiles: UNIT_A, fraction: 0 }] }).ok).toBe(false);
    expect(parsePolymerSpec({ mwInput: 1, units: [{ smiles: UNIT_A, fraction: 100 }], fractionBasis: 'x' }).ok).toBe(false);
  });
});

describe('單一單元共聚物 = 原均聚物：配方 4B（含小分子 S）', () => {
  const S = 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2';
  const run = (pSpec: PolymerSpec, eSpec: PolymerSpec) => {
    const comps: CrosslinkComponent[] = [
      comp('P', P_OLD, pSpec),
      comp('E', E, eSpec),
      { id: 'S', name: 'S', canonicalSmiles: S, category: 'Small Molecule' },
    ];
    const f: Formulation = {
      schemaVersion: 1,
      name: '4B',
      solid: {
        unit: 'wt',
        components: [
          { id: 'P', name: 'P', canonicalSmiles: P_OLD, category: 'Resin', amount: 79.2, polymer: pSpec },
          { id: 'E', name: 'E', canonicalSmiles: E, category: 'Resin', amount: 19.8, polymer: eSpec },
          { id: 'S', name: 'S', canonicalSmiles: S, category: 'Small Molecule', amount: 1 },
        ],
      },
      liquid: { unit: 'wt', components: [] },
    };
    const result = analyzeCrosslink(RDKit, comps, T);
    const mw: Record<string, number | undefined> = {};
    for (const c of result.components) mw[c.id] = c.molarMass ?? undefined;
    const prep = prepareLayer1(result, f, computeFormulation(f, mw));
    if (!prep.ok) throw new Error(prep.reason);
    return computeLayer1(prep.setup, 1)!;
  };
  it('4B 的第 1 層結果完全相同', () => {
    const homo = run({ mwInput: 6000, pdiInput: 1.8 }, { mwInput: 4500 });
    const single = run({ mwInput: 6000, pdiInput: 1.8, units: [{ smiles: P_OLD, fraction: 100 }] }, { mwInput: 4500, units: [{ smiles: E, fraction: 100 }] });
    expect(single).toEqual(homo);
  });
});
