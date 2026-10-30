// 兩成分近似的低分子量修正與骨架範本的測試（任務 023，D51）。只檢查程式照規則運作（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeCrosslink } from '../../../src/core/crosslink/analyze';
import { buildSystem, computeLayer1, type Layer1Component } from '../../../src/core/crosslink/layer1/layer1';
import { gelConversion } from '../../../src/core/crosslink/layer1/millerMacosko';
import { prepareLayer1 } from '../../../src/core/crosslink/layer1/prepare';
import type { CrosslinkComponent } from '../../../src/core/crosslink/types';
import { BACKBONE_TEMPLATES } from '../../../src/core/data/backboneTemplates';
import { bundledTexts, loadTables } from '../../../src/core/data/load';
import { computeFormulation } from '../../../src/core/formulation/compute';
import type { Formulation } from '../../../src/core/formulation/types';
import { twoComponentMasses, twoComponentSpecies } from '../../../src/core/polymer/distribution';
import { getRDKit } from '../../../src/core/rdkit/loader';
import type { RDKitModule } from '../../../src/core/rdkit/types';
import { applyBackboneTemplate, editFromSpec, emptyPolymerEdit, specFromEdit, type PolymerEdit } from '../../../src/ui/polymer/model';

let RDKit: RDKitModule;
const { tables } = loadTables(bundledTexts);
const T = { functionalGroups: tables.functionalGroups.rows, reactionRules: tables.reactionRules.rows };
beforeAll(async () => {
  RDKit = await getRDKit();
});

const tpl = (id: string) => BACKBONE_TEMPLATES.find((t) => t.id === id)!;
const S_BISPHENOL = 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2';
const DGEBA = 'C1OC1COc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC1CO1';

/** 範本做成的聚合物成分（單元＝範本單元、端基＝範本端基） */
const polymerFromTemplate = (id: string, polymerPart: Record<string, number>): CrosslinkComponent => {
  const t = tpl(id);
  return {
    id: 'P',
    name: 'P',
    canonicalSmiles: t.unitSmiles,
    category: 'Resin',
    polymer: { ...polymerPart, endGroups: { end1: { smiles: t.end1Smiles, ...(t.end1PresetId ? { presetId: t.end1PresetId } : {}) }, end2: { smiles: t.end2Smiles, ...(t.end2PresetId ? { presetId: t.end2PresetId } : {}) } } },
  };
};

const layer1Of = (p: CrosslinkComponent, s: CrosslinkComponent, amounts = [80, 20]) => {
  const f: Formulation = {
    schemaVersion: 1,
    name: 'x',
    solid: {
      unit: 'wt',
      components: [
        { id: p.id, name: p.name, canonicalSmiles: p.canonicalSmiles, category: 'Resin', amount: amounts[0], ...(p.polymer ? { polymer: p.polymer } : {}) },
        { id: s.id, name: s.name, canonicalSmiles: s.canonicalSmiles, category: 'Resin', amount: amounts[1], ...(s.polymer ? { polymer: s.polymer } : {}) },
      ],
    },
    liquid: { unit: 'wt', components: [] },
  };
  const result = analyzeCrosslink(RDKit, [p, s], T);
  const mw: Record<string, number | undefined> = {};
  for (const c of result.components) mw[c.id] = c.molarMass ?? undefined;
  const prep = prepareLayer1(result, f, computeFormulation(f, mw));
  if (!prep.ok) throw new Error(prep.reason);
  return { result, setup: prep.setup };
};

describe('twoComponentSpecies（分布近似）', () => {
  it('M₁ ≥ M_ends（含沒有端基）：與原式完全相同，M₁、M₂ 各 0.5', () => {
    for (const [mw, mn, mEnds] of [[6000, 3333.3, 0], [6000, 3333.3, 200], [1000, 500, 0], [1000, 500, 292.8], [5000, 2000, 100]]) {
      const { m1, m2 } = twoComponentMasses(mw, mn);
      const d = twoComponentSpecies(mw, mn, mEnds);
      expect(d.lowMw).toBe(false);
      expect(d.species).toEqual([
        { m: m1, weightFraction: 0.5 },
        { m: m2, weightFraction: 0.5 },
      ]);
    }
  });

  it('PDI = 1：單一成分（不啟用修正，即使 M_ends 很大）', () => {
    expect(twoComponentSpecies(500, 500, 400)).toEqual({ species: [{ m: 500, weightFraction: 1 }], lowMw: false });
  });

  it('M₁ < M_ends：n = 0 分子＋較重成分；回算 Mn、Mw 與輸入相同（差小於 1e-9）', () => {
    for (const [mw, mn, mEnds] of [[1000, 500, 340.41], [1000, 500, 450], [300, 100, 94.11], [2000, 400, 399], [1500, 1000, 700]]) {
      const d = twoComponentSpecies(mw, mn, mEnds);
      expect(d.lowMw).toBe(true);
      expect(d.species[0].m).toBe(mEnds);
      const [a, b] = d.species;
      expect(a.weightFraction + b.weightFraction).toBeCloseTo(1, 12);
      expect(a.weightFraction).toBeGreaterThan(0);
      expect(b.weightFraction).toBeGreaterThan(0);
      expect(b.m).toBeGreaterThan(mEnds);
      expect(Math.abs(a.weightFraction * a.m + b.weightFraction * b.m - mw)).toBeLessThan(1e-9);
      expect(Math.abs(1 / (a.weightFraction / a.m + b.weightFraction / b.m) - mn)).toBeLessThan(1e-9);
    }
  });

  it('手算：Mn 500、Mw 1000、M_ends 340.41 → w ≈ 0.6179、M_b ≈ 2066.5', () => {
    const d = twoComponentSpecies(1000, 500, 340.41);
    expect(d.species[0].weightFraction).toBeCloseTo(0.6179, 3);
    expect(d.species[1].m).toBeCloseTo(2066.5, 0);
  });

  it('w 的方程式在 0 < w < 1 內恰有一個根：w² 項相消成一次式，且滿足原二次式', () => {
    const [mw, mn, ma] = [1000, 500, 340.41];
    const w = twoComponentSpecies(mw, mn, ma).species[0].weightFraction;
    expect((1 - w) ** 2).toBeCloseTo((mw - w * ma) * (1 / mn - w / ma), 12);
  });
});

describe('BT05（雙酚 A 環氧）低分子量：Mn 500、Mw 1000', () => {
  const p = polymerFromTemplate('BT05', { mwInput: 1000, pdiInput: 2 });
  const s: CrosslinkComponent = { id: 'S', name: 'S', canonicalSmiles: S_BISPHENOL, category: 'Small Molecule' };
  let x: ReturnType<typeof layer1Of>;
  let poly: Layer1Component;
  beforeAll(() => {
    x = layer1Of(p, s);
    poly = x.setup.components.find((c) => c.id === 'P')!;
  });

  it('原式 M₁ ≈ 292.9 < M_ends ≈ 340.41，啟用新作法', () => {
    const d = poly.distribution!;
    expect(d.mEnds).toBeCloseTo(340.41, 1);
    expect(twoComponentMasses(d.mw, d.mn).m1).toBeCloseTo(292.9, 1);
    expect(buildSystem(x.setup).lowMw).toBe(true);
    expect(computeLayer1(x.setup, 1)!.usedLowMwCorrection).toBe(true);
  });

  it('兩個成分：w ≈ 0.6179、M_b ≈ 2066.5；以程式自己的 M_ends 回算 Mn = 500、Mw = 1000（差小於 1e-9）', () => {
    const { sys } = buildSystem(x.setup);
    expect(sys.a).toHaveLength(2);
    const totalMass = sys.a.reduce((t, k) => t + k.mass, 0);
    const mOf = sys.a.map((k) => k.mass / k.n);
    expect(mOf[0]).toBeCloseTo(poly.distribution!.mEnds!, 9);
    expect(sys.a[0].mass / totalMass).toBeCloseTo(0.6179, 3);
    expect(mOf[1]).toBeCloseTo(2066.5, 0);
    const mn = totalMass / sys.a.reduce((t, k) => t + k.n, 0);
    const mw = sys.a.reduce((t, k, i) => t + k.mass * mOf[i], 0) / totalMass;
    expect(Math.abs(mn - 500)).toBeLessThan(1e-9);
    expect(Math.abs(mw - 1000)).toBeLessThan(1e-9);
  });

  it('每條鏈環氧基 = 2（兩個成分都是 2），凝膠點與「單一成分 f = 2」相同', () => {
    const { sys } = buildSystem(x.setup);
    expect(sys.a.map((k) => k.f)).toEqual([2, 2]);
    expect(x.result.pairs[0].a.f).toBeCloseTo(2, 9);
    const totalMass = sys.a.reduce((t, k) => t + k.mass, 0);
    const one = [{ f: 2, n: totalMass / 500, mass: totalMass }];
    expect(gelConversion(sys) as number).toBeCloseTo(gelConversion({ a: one, b: sys.b }) as number, 10);
  });
});

describe('BT01（苯酚 Novolac）', () => {
  const s: CrosslinkComponent = { id: 'S', name: 'S', canonicalSmiles: DGEBA, category: 'Small Molecule' };
  /** 聚合物那一側的重量平均官能度（以質量加權）與手算 ((Mw − M_ends) ÷ M_unit) × 1 + 1 比較 */
  function check(mw: number, pdi: number) {
    const x = layer1Of(polymerFromTemplate('BT01', { mwInput: mw, pdiInput: pdi }), s, [60, 40]);
    const poly = x.setup.components.find((c) => c.id === 'P')!;
    const d = poly.distribution!;
    expect(d.groupsPerUnit).toBe(1); // 單元 1 個酚羥基
    expect(d.endGroups).toBe(1); // 端基 1（鄰位酚）1 個；氫 0 個
    return { x, d, built: buildSystem(x.setup) };
  }

  it('Mn 500、Mw 1000：M₁ ≈ 292.9 ≥ M_ends ≈ 94.11，不啟用新作法，f = (M − M_ends) ÷ M_unit + 1', () => {
    const { d, built, x } = check(1000, 2);
    expect(d.mEnds).toBeCloseTo(94.11, 1);
    expect(built.lowMw).toBe(false);
    expect(computeLayer1(x.setup, 1)!.usedLowMwCorrection).toBe(false);
    const { m1, m2 } = twoComponentMasses(d.mw, d.mn);
    const fOf = (m: number) => (m - d.mEnds!) / d.mUnit + 1;
    // 兩個虛擬成分（非整數官能度拆成相鄰整數，質量加權的平均官能度不變）
    const poly = x.setup.components.find((c) => c.id === 'P')!;
    const side = poly.side === 'A' ? built.sys.a : built.sys.b;
    const mass = side.reduce((t, k) => t + k.mass, 0);
    const avgF = side.reduce((t, k) => t + k.mass * k.f, 0) / mass;
    expect(avgF).toBeCloseTo(0.5 * fOf(m1) + 0.5 * fOf(m2), 9);
    expect(avgF).toBeCloseTo((d.mw - d.mEnds!) / d.mUnit + 1, 9); // = f(Mw)
  });

  it('Mn 100、Mw 300：M₁ ≈ 55.1 < M_ends，啟用新作法；兩個成分的酚羥基數 = (M − M_ends) ÷ M_unit + 1；以 Mw 計的重量平均官能度與手算一致', () => {
    const { d, built, x } = check(300, 3);
    expect(built.lowMw).toBe(true);
    expect(computeLayer1(x.setup, 1)!.usedLowMwCorrection).toBe(true);
    const dist = twoComponentSpecies(d.mw, d.mn, d.mEnds!);
    const poly = x.setup.components.find((c) => c.id === 'P')!;
    const side = poly.side === 'A' ? built.sys.a : built.sys.b;
    const mass = side.reduce((t, k) => t + k.mass, 0);
    // 成分 a 是 n = 0 的苯酚：1 個酚羥基；成分 b：(M_b − M_ends) ÷ M_unit + 1
    const fA = (dist.species[0].m - d.mEnds!) / d.mUnit + 1;
    const fB = (dist.species[1].m - d.mEnds!) / d.mUnit + 1;
    expect(fA).toBeCloseTo(1, 12);
    const avgF = side.reduce((t, k) => t + k.mass * k.f, 0) / mass;
    expect(avgF).toBeCloseTo(dist.species[0].weightFraction * fA + dist.species[1].weightFraction * fB, 9);
    expect(avgF).toBeCloseTo((d.mw - d.mEnds!) / d.mUnit + 1, 9); // = f(Mw)
    // 回算 Mn、Mw（官能度拆成相鄰整數時各份的分子量不變）
    const mn = mass / side.reduce((t, k) => t + k.n, 0);
    const mw = side.reduce((t, k) => t + k.mass * (k.mass / k.n), 0) / mass;
    expect(Math.abs(mn - d.mn)).toBeLessThan(1e-9);
    expect(Math.abs(mw - d.mw)).toBeLessThan(1e-9);
  });
});

describe('M₁ ≥ M_ends 的情況不變', () => {
  it('舊式（max 截斷）與新式在 M₁ ≥ M_ends 時逐項相同', () => {
    const s: CrosslinkComponent = { id: 'S', name: 'S', canonicalSmiles: S_BISPHENOL, category: 'Small Molecule' };
    for (const [mw, pdi] of [[6000, 1.8], [20000, 2], [4000, 1.2]]) {
      const x = layer1Of(polymerFromTemplate('BT05', { mwInput: mw, pdiInput: pdi }), s);
      const poly = x.setup.components.find((c) => c.id === 'P')!;
      const d = poly.distribution!;
      const { m1, m2 } = twoComponentMasses(d.mw, d.mn);
      expect(m1).toBeGreaterThanOrEqual(d.mEnds!);
      const { sys, lowMw } = buildSystem(x.setup);
      expect(lowMw).toBe(false);
      const oldF = (m: number) => (Math.max(m - d.mEnds!, 0) / d.mUnit) * d.groupsPerUnit + (d.endGroups ?? 0);
      expect(sys.a.map((k) => [k.f, k.n, k.mass])).toEqual([m1, m2].map((m) => [oldF(m), (0.5 * poly.mass) / m, 0.5 * poly.mass]));
    }
  });
});

describe('骨架範本填入（applyBackboneTemplate）', () => {
  const basis: PolymerEdit = { basis: 'mw', text: '1000', pdiText: '2' };

  it('端基：有對應 id 選該項，沒有就用自訂 SMILES；分子量欄位（基準、數值、PDI）不動', () => {
    const e1 = applyBackboneTemplate(basis, tpl('BT01'));
    expect(e1).toEqual({ ...basis, end1: { choice: 'EG12', custom: '' }, end2: { choice: 'EG01', custom: '' } });
    const e5 = applyBackboneTemplate(basis, tpl('BT05'));
    expect(e5.end1).toEqual({ choice: 'EG09', custom: '' });
    expect(e5.end2).toEqual({ choice: 'custom', custom: tpl('BT05').end2Smiles });
    const e2 = applyBackboneTemplate(basis, tpl('BT02'));
    expect(e2.end1).toEqual({ choice: 'custom', custom: tpl('BT02').end1Smiles });
    expect(e2.end2).toEqual({ choice: 'EG01', custom: '' });
  });

  it('取代目前的共聚物單元與端基：extraUnits、firstFractionText、fractionBasis 全部移除，與手動輸入的單一單元狀態相同', () => {
    const copoly: PolymerEdit = {
      basis: 'mn',
      text: '3000',
      pdiText: '',
      fractionBasis: 'wt',
      firstFractionText: '60',
      extraUnits: [{ smiles: '[*:1]CC[*:2]', fractionText: '40' }],
      end1: { choice: 'EG03', custom: '' },
    };
    const out = applyBackboneTemplate(copoly, tpl('BT03'));
    expect(out).toEqual({ basis: 'mn', text: '3000', pdiText: '', end1: { choice: 'custom', custom: tpl('BT03').end1Smiles }, end2: { choice: 'EG01', custom: '' } });
    expect('extraUnits' in out || 'firstFractionText' in out || 'fractionBasis' in out).toBe(false);
  });

  it('6 個範本：選範本後的單元與端基，與手動輸入同樣 SMILES 的分析結果相同（toEqual）', () => {
    for (const t of BACKBONE_TEMPLATES) {
      const fromTemplate = specFromEdit(applyBackboneTemplate({ ...emptyPolymerEdit(), text: '1500', pdiText: '2' }, t), t.unitSmiles)!;
      const manual = {
        mwInput: 1500,
        pdiInput: 2,
        endGroups: {
          end1: { smiles: t.end1Smiles, ...(t.end1PresetId ? { presetId: t.end1PresetId } : {}) },
          end2: { smiles: t.end2Smiles, ...(t.end2PresetId ? { presetId: t.end2PresetId } : {}) },
        },
      };
      expect(fromTemplate).toEqual(manual);
      const comp = (polymer: typeof manual): CrosslinkComponent => ({ id: 'P', name: 'P', canonicalSmiles: t.unitSmiles, category: 'Resin', polymer });
      expect(analyzeCrosslink(RDKit, [comp(fromTemplate as typeof manual)], T)).toEqual(analyzeCrosslink(RDKit, [comp(manual)], T));
      // 填入後可以再改：存成設定再讀回編輯狀態，端基選項不變
      const back = editFromSpec(fromTemplate);
      expect(back.end1?.choice).toBe(t.end1PresetId || 'custom');
      expect(back.end2?.choice).toBe(t.end2PresetId || 'custom');
    }
  });

  it('每個範本的官能基：BT01／BT02 每條鏈酚羥基 n + 1；BT03／BT04 環氧基 n + 1；BT05 環氧基 2', () => {
    const run = (id: string, mw: number) => analyzeCrosslink(RDKit, [polymerFromTemplate(id, { mwInput: mw, pdiInput: 1 })], T).components[0];
    for (const id of ['BT01', 'BT02']) {
      const c = run(id, 2000);
      const groupId = 'hydroxyl.phenolic';
      expect(c.unitGroupCounts[groupId]).toBe(1);
      expect(c.endGroupCounts[groupId]).toBe(1);
    }
    for (const id of ['BT03', 'BT04']) {
      const c = run(id, 2000);
      expect(c.unitGroupCounts['ether.epoxide']).toBe(1);
      expect(c.endGroupCounts['ether.epoxide']).toBe(1);
    }
    for (const id of ['BT05', 'BT06']) {
      const c = run(id, 2000);
      expect(c.unitGroupCounts['ether.epoxide'] ?? 0).toBe(0);
      expect(c.endGroupCounts['ether.epoxide']).toBe(2);
    }
  });
});
