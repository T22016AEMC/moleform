// 配方換算核心的行為測試（任務 013）：用手算可驗證的範例檢查程式有沒有照規則算對（D17）。
// 分子量直接給定（不使用真實化合物）：A = 100、B = 50、C = 200 g/mol；溶劑 S1、S2 不需要分子量。
import { describe, expect, it } from 'vitest';
import { computeFormulation, MESSAGE_POLYMER_MOL, MESSAGE_SOLID_CONTENT_NEEDS_TOTAL, MESSAGE_VOL_NOT_SUPPORTED } from '../../src/core/formulation/compute';
import { parseFormulation, serializeFormulation } from '../../src/core/formulation/serialize';
import type {
  Component,
  Formulation,
  LiquidCategory,
  LiquidUnit,
  SolidCategory,
  SolidUnit,
} from '../../src/core/formulation/types';

const MW = { A: 100, B: 50, C: 200 };

const solidC = (id: string, amount: number, extra: Partial<Component<SolidCategory>> = {}): Component<SolidCategory> => ({
  id,
  name: `成分${id}`,
  canonicalSmiles: 'CCO',
  category: 'Small Molecule',
  amount,
  ...extra,
});
const liquidC = (id: string, amount: number): Component<LiquidCategory> => ({
  id,
  name: `溶劑${id}`,
  canonicalSmiles: 'CCO',
  category: 'Solvent',
  amount,
});

function formulation(
  solid: { unit: SolidUnit; components: Component<SolidCategory>[] },
  liquid: { unit: LiquidUnit; components: Component<LiquidCategory>[] } = { unit: 'g', components: [] },
  extra: Partial<Formulation> = {},
): Formulation {
  return { schemaVersion: 1, name: '測試', solid, liquid, ...extra };
}

const value = (r: { value: number | null } | null | undefined) => r?.value ?? null;
const near = (actual: number | null, expected: number, digits = 2) => {
  expect(actual).not.toBeNull();
  expect(actual as number).toBeCloseTo(expected, digits);
};
const codes = (o: { errors: { code: string }[] }) => o.errors.map((e) => e.code);

describe('Solid parts', () => {
  // A 100、B 50 重量份：總 150 → wt% A = 100/150 = 66.67、B = 50/150 = 33.33
  // 莫耳數 A = 100/100 = 1、B = 50/50 = 1 → mol% 各 50
  const out = computeFormulation(formulation({ unit: 'parts', components: [solidC('A', 100), solidC('B', 50)] }), MW);

  it('wt% 與 mol% 正確', () => {
    expect(out.errors).toEqual([]);
    const [a, b] = out.results.solid!.components;
    near(value(a.wtPct), 66.67);
    near(value(b.wtPct), 33.33);
    near(value(a.molPct), 50);
    near(value(b.molPct), 50);
  });

  it('沒有該區總重時沒有 g；有總重（Solid 300 g）時 A = 100/150 × 300 = 200 g', () => {
    expect(out.results.solid!.components[0].massG).toBeNull();
    const withTotal = computeFormulation(
      formulation({ unit: 'parts', components: [solidC('A', 100), solidC('B', 50)] }, undefined, { solidTotalG: 300 }),
      MW,
    );
    near(value(withTotal.results.solid!.components[0].massG), 200);
    near(value(withTotal.results.solid!.components[1].massG), 100);
  });

  it('結果標示模型「配方換算」與可信度「直接計算」，且不含分子量', () => {
    const r = out.results.solid!.components[0].wtPct;
    expect(r.modelName).toBe('配方換算');
    expect(r.confidence).toBe('direct');
    expect(JSON.stringify(out.results)).not.toMatch(/molecularWeight|"mw"/i);
  });
});

describe('Solid wt', () => {
  it('合計 100 正常：A 60、B 40 → wt% 60／40；莫耳數 0.6、0.8 → mol% 42.86／57.14', () => {
    const out = computeFormulation(formulation({ unit: 'wt', components: [solidC('A', 60), solidC('B', 40)] }), MW);
    expect(out.errors).toEqual([]);
    const [a, b] = out.results.solid!.components;
    near(value(a.wtPct), 60);
    near(value(b.wtPct), 40);
    near(value(a.molPct), 42.86);
    near(value(b.molPct), 57.14);
  });

  it('合計 99.5 報錯並附合計值；另一區照常計算', () => {
    const out = computeFormulation(
      formulation({ unit: 'wt', components: [solidC('A', 60), solidC('B', 39.5)] }, { unit: 'g', components: [liquidC('S1', 10)] }),
      MW,
    );
    expect(codes(out)).toContain('SUM_NOT_100');
    const sumError = out.errors.find((e) => e.code === 'SUM_NOT_100')!;
    expect(sumError.area).toBe('solid');
    expect(sumError.message).toContain('99.5');
    expect(out.results.solid).toBeNull();
    near(value(out.results.liquid!.components[0].wtPct), 100); // Liquid 區 10 g ÷ 10 g
  });

  it('浮點誤差：合計 99.999 視為 100（容差 ±0.01 內），99.98 則報錯', () => {
    const ok = computeFormulation(formulation({ unit: 'wt', components: [solidC('A', 60), solidC('B', 39.999)] }), MW);
    expect(ok.errors).toEqual([]);
    near(value(ok.results.solid!.components[0].wtPct), 60.0006, 3); // 60 ÷ 99.999 × 100
    const bad = computeFormulation(formulation({ unit: 'wt', components: [solidC('A', 60), solidC('B', 39.98)] }), MW);
    expect(codes(bad)).toContain('SUM_NOT_100');
    const edge = computeFormulation(formulation({ unit: 'wt', components: [solidC('A', 0.1 + 0.2), solidC('B', 99.7)] }), MW);
    expect(edge.errors).toEqual([]); // 0.30000000000000004 + 99.7
  });
});

describe('Solid mol', () => {
  it('A 25、B 25、C 50 mol% → 質量比 25×100 : 25×50 : 50×200 = 2500 : 1250 : 10000（合計 13750）→ wt% 18.18／9.09／72.73', () => {
    const out = computeFormulation(
      formulation({ unit: 'mol', components: [solidC('A', 25), solidC('B', 25), solidC('C', 50)] }),
      MW,
    );
    expect(out.errors).toEqual([]);
    const [a, b, c] = out.results.solid!.components;
    near(value(a.wtPct), 18.18);
    near(value(b.wtPct), 9.09);
    near(value(c.wtPct), 72.73);
    near(value(a.molPct), 25);
    near(value(c.molPct), 50);
  });

  it('缺分子量報錯並指出成分', () => {
    const out = computeFormulation(formulation({ unit: 'mol', components: [solidC('A', 50), solidC('X', 50)] }), MW);
    const err = out.errors.find((e) => e.code === 'MISSING_MW')!;
    expect(err.componentId).toBe('X');
    expect(err.message).toContain('成分X');
    expect(out.results.solid).toBeNull();
  });

  it('含 * 的成分用 mol：回傳 U02 訊息', () => {
    const polymer = solidC('A', 50, { canonicalSmiles: '*CC*', category: 'Resin' });
    const out = computeFormulation(formulation({ unit: 'mol', components: [polymer, solidC('B', 50)] }), MW);
    const err = out.errors.find((e) => e.code === 'POLYMER_MOL_BASIS')!;
    expect(err.message).toContain(MESSAGE_POLYMER_MOL);
    expect(err.message).toContain('U02');
    expect(err.componentId).toBe('A');
  });
});

describe('含 * 的成分用 g、parts、wt', () => {
  it('質量相關結果正常；整區都不輸出 mol%（不使用部分基準）並說明原因', () => {
    // A（含 *）50 g、B 50 g：wt% 各 50；A 無法換算 mol% → B 的 mol% 也不輸出（使用者 2026-10-29 決定）
    const polymer = solidC('A', 50, { canonicalSmiles: '[*:1]CC[*:2]', category: 'Resin', name: '樹脂P' });
    const out = computeFormulation(formulation({ unit: 'g', components: [polymer, solidC('B', 50)] }), MW);
    expect(out.errors).toEqual([]);
    const [a, b] = out.results.solid!.components;
    near(value(a.wtPct), 50);
    near(value(a.massG), 50);
    for (const c of [a, b]) {
      expect(c.molPct.value).toBeNull();
      expect(c.molPct.notApplicable).toBe(
        '樹脂P 無法換算 mol%（含連接點 *，聚合物的 mol% 基準將於 Phase 5 決定（U02）），本區不提供 mol% 以免數值不完整',
      );
    }
    expect(out.warnings.map((w) => w.code)).toContain('MOL_UNAVAILABLE');
    expect(out.warnings.map((w) => w.code)).not.toContain('MOL_PARTIAL');
  });

  it('缺分子量（非 mol 單位）同樣整區不輸出 mol%，其他結果不受影響', () => {
    const out = computeFormulation(formulation({ unit: 'g', components: [solidC('A', 50), solidC('X', 50)] }), MW);
    expect(out.errors).toEqual([]);
    const [a, x] = out.results.solid!.components;
    expect(a.molPct.value).toBeNull();
    expect(x.molPct.notApplicable).toBe('成分X 無法換算 mol%（缺少分子量），本區不提供 mol% 以免數值不完整');
    near(value(a.wtPct), 50);
  });
});

describe('Solid phr', () => {
  it('A 勾選為樹脂（100）、B 30、C 5 → 合計 135：wt% 74.07／22.22／3.70；phr 100／30／5', () => {
    const out = computeFormulation(
      formulation({ unit: 'phr', components: [solidC('A', 100, { isResin: true }), solidC('B', 30), solidC('C', 5)] }),
      MW,
    );
    expect(out.errors).toEqual([]);
    const [a, b, c] = out.results.solid!.components;
    near(value(a.wtPct), 74.07);
    near(value(b.wtPct), 22.22);
    near(value(c.wtPct), 3.7);
    near(value(a.phr), 100);
    near(value(b.phr), 30);
    near(value(c.phr), 5);
  });

  it('勾選兩個樹脂（60 + 40 = 100）正常：C 5 → 合計 105，wt% 57.14／38.10／4.76', () => {
    const out = computeFormulation(
      formulation({ unit: 'phr', components: [solidC('A', 60, { isResin: true }), solidC('B', 40, { isResin: true }), solidC('C', 5)] }),
      MW,
    );
    expect(out.errors).toEqual([]);
    const [a, b, c] = out.results.solid!.components;
    near(value(a.wtPct), 57.14);
    near(value(b.wtPct), 38.1);
    near(value(c.wtPct), 4.76);
  });

  it('樹脂合計不是 100 報錯並附合計值（60 + 30 = 90）', () => {
    const out = computeFormulation(
      formulation({ unit: 'phr', components: [solidC('A', 60, { isResin: true }), solidC('B', 30, { isResin: true })] }),
      MW,
    );
    expect(out.errors.find((e) => e.code === 'SUM_NOT_100')!.message).toContain('90');
  });

  it('未勾選任何樹脂報錯', () => {
    const out = computeFormulation(formulation({ unit: 'phr', components: [solidC('A', 100), solidC('B', 30)] }), MW);
    expect(codes(out)).toContain('NO_RESIN');
    expect(out.results.solid).toBeNull();
  });

  it('其他單位勾選樹脂時另輸出 phr：g 單位 A 40 g（樹脂）、B 10 g → phr A = 100、B = 10/40 × 100 = 25', () => {
    const out = computeFormulation(formulation({ unit: 'g', components: [solidC('A', 40, { isResin: true }), solidC('B', 10)] }), MW);
    const [a, b] = out.results.solid!.components;
    near(value(a.phr), 100);
    near(value(b.phr), 25);
  });

  it('沒有勾選樹脂的非 phr 單位不輸出 phr，也不報錯', () => {
    const out = computeFormulation(formulation({ unit: 'g', components: [solidC('A', 40)] }), MW);
    expect(out.errors).toEqual([]);
    expect(out.results.solid!.components[0].phr).toBeNull();
  });
});

describe('Solid Content', () => {
  it('兩區都是 g：Solid 40 g（A 30 + B 10）、Liquid 60 g → 總重 100 g，Solid Content 40%', () => {
    const out = computeFormulation(
      formulation({ unit: 'g', components: [solidC('A', 30), solidC('B', 10)] }, { unit: 'g', components: [liquidC('S1', 60)] }),
      MW,
    );
    expect(out.errors).toEqual([]);
    const o = out.results.overall;
    near(value(o.solidMass), 40);
    near(value(o.liquidMass), 60);
    near(value(o.totalMass), 100);
    near(value(o.solidContent), 40);
    near(value(o.solidContentExcludingVolatile), 40); // 沒有標記時兩者相同
  });

  it('含揮發標記：B（10 g）標記後，Solid Content（扣除）= (40 − 10) ÷ 100 = 30%，全部仍為 40%', () => {
    const out = computeFormulation(
      formulation(
        { unit: 'g', components: [solidC('A', 30), solidC('B', 10, { volatileFlag: true })] },
        { unit: 'g', components: [liquidC('S1', 60)] },
      ),
      MW,
    );
    near(value(out.results.overall.solidContent), 40);
    near(value(out.results.overall.solidContentExcludingVolatile), 30);
  });

  it('兩區都是 parts：視為同一基準。Solid 40 份、Liquid 60 份 → Solid Content 40%，質量單位為重量份', () => {
    const out = computeFormulation(
      formulation({ unit: 'parts', components: [solidC('A', 30), solidC('B', 10)] }, { unit: 'parts', components: [liquidC('S1', 60)] }),
      MW,
    );
    expect(out.errors).toEqual([]);
    near(value(out.results.overall.solidContent), 40);
    expect(out.results.overall.solidMass.unit).toBe('重量份');
    expect(out.results.solid!.components[0].massG).toBeNull();
  });

  it('Solid wt + Liquid g：缺 Solid 總重時報錯；補上 50 g 後 Solid Content = 50 ÷ (50 + 50) = 50%，A = 60% × 50 = 30 g', () => {
    const base = formulation({ unit: 'wt', components: [solidC('A', 60), solidC('B', 40)] }, { unit: 'g', components: [liquidC('S1', 50)] });
    const missing = computeFormulation(base, MW);
    const err = missing.errors.find((e) => e.code === 'SOLID_CONTENT_NEEDS_TOTAL')!;
    expect(err.message).toBe(MESSAGE_SOLID_CONTENT_NEEDS_TOTAL);
    expect(err.message).toBe('無法計算 Solid Content，請補填 Solid 總重／Liquid 總重');
    expect(missing.results.overall.solidContent.value).toBeNull();
    expect(missing.results.solid).not.toBeNull(); // wt% 仍可算
    near(value(missing.results.solid!.components[0].wtPct), 60);

    const filled = computeFormulation({ ...base, solidTotalG: 50 }, MW);
    expect(filled.errors).toEqual([]);
    near(value(filled.results.overall.solidContent), 50);
    near(value(filled.results.solid!.components[0].massG), 30);
  });

  it('其他組合：Solid g + Liquid wt，補 Liquid 總重 60 g 後 Solid Content = 40 ÷ 100 = 40%', () => {
    const base = formulation({ unit: 'g', components: [solidC('A', 40)] }, { unit: 'wt', components: [liquidC('S1', 100)] });
    expect(codes(computeFormulation(base, MW))).toContain('SOLID_CONTENT_NEEDS_TOTAL');
    near(value(computeFormulation({ ...base, liquidTotalG: 60 }, MW).results.overall.solidContent), 40);
  });

  it('Liquid 區沒有成分：Solid 40 g、Liquid 0 → Solid Content 100%', () => {
    const out = computeFormulation(formulation({ unit: 'g', components: [solidC('A', 40)] }), MW);
    expect(out.errors).toEqual([]);
    near(value(out.results.overall.solidContent), 100);
  });
});

describe('其中一區沒有成分', () => {
  it('Solid wt（無總重）、Liquid 無成分：Solid Content = 100%，扣除標記 B（40 wt%）= 60%，質量欄位不適用但不報錯', () => {
    const out = computeFormulation(
      formulation({ unit: 'wt', components: [solidC('A', 60), solidC('B', 40, { volatileFlag: true })] }),
      MW,
    );
    expect(out.errors).toEqual([]);
    near(value(out.results.overall.solidContent), 100);
    near(value(out.results.overall.solidContentExcludingVolatile), 60);
    expect(out.results.overall.totalMass.value).toBeNull();
  });

  it('Solid 無成分、Liquid 有成分（g）：Solid Content = 0%', () => {
    const out = computeFormulation(formulation({ unit: 'g', components: [] }, { unit: 'wt', components: [liquidC('S1', 100)] }), MW);
    expect(out.errors).toEqual([]);
    near(value(out.results.overall.solidContent), 0);
  });
});

describe('目標 Solid Content', () => {
  // Solid 30 g，目標 30%：Liquid 總質量 = 30 × (100 − 30) ÷ 30 = 70 g
  // Liquid 區 S1 20 g、S2 10 g（2 : 1）→ S1 = 70 × 2/3 = 46.67 g、S2 = 23.33 g
  it('反推 Liquid 總質量並依組成分配到各溶劑', () => {
    const out = computeFormulation(
      formulation(
        { unit: 'g', components: [solidC('A', 30)] },
        { unit: 'g', components: [liquidC('S1', 20), liquidC('S2', 10)] },
        { targetSolidContentPct: 30 },
      ),
      MW,
    );
    const target = out.results.overall.target!;
    near(value(target.liquidTotal), 70);
    expect(target.liquidTotal.unit).toBe('g');
    near(value(target.liquidComponents[0].mass), 46.67);
    near(value(target.liquidComponents[1].mass), 23.33);
  });

  it('Liquid 區沒有成分時只給總量', () => {
    const out = computeFormulation(formulation({ unit: 'g', components: [solidC('A', 30)] }, undefined, { targetSolidContentPct: 30 }), MW);
    near(value(out.results.overall.target!.liquidTotal), 70);
    expect(out.results.overall.target!.liquidComponents).toEqual([]);
  });

  it('Solid 只有相對質量（wt 無總重）時報錯；超出範圍（0、100、負數、NaN）報錯', () => {
    const noMass = computeFormulation(
      formulation({ unit: 'wt', components: [solidC('A', 100)] }, undefined, { targetSolidContentPct: 30 }),
      MW,
    );
    expect(codes(noMass)).toContain('TARGET_NEEDS_SOLID_MASS');
    for (const bad of [0, 100, -5, Number.NaN, 150]) {
      const out = computeFormulation(formulation({ unit: 'g', components: [solidC('A', 30)] }, undefined, { targetSolidContentPct: bad }), MW);
      expect(codes(out)).toContain('TARGET_OUT_OF_RANGE');
    }
  });

  it('兩區都是 parts：以重量份回報（Solid 30 份、目標 30% → Liquid 70 份）', () => {
    const out = computeFormulation(
      formulation({ unit: 'parts', components: [solidC('A', 30)] }, undefined, { targetSolidContentPct: 30 }),
      MW,
    );
    near(value(out.results.overall.target!.liquidTotal), 70);
    expect(out.results.overall.target!.liquidTotal.unit).toBe('重量份');
  });
});

describe('單位與輸入錯誤', () => {
  it('Liquid vol%：回傳 Phase 8 訊息，Solid 區不受影響', () => {
    const out = computeFormulation(
      formulation({ unit: 'g', components: [solidC('A', 10)] }, { unit: 'vol', components: [liquidC('S1', 100)] }),
      MW,
    );
    const err = out.errors.find((e) => e.code === 'VOL_NOT_SUPPORTED')!;
    expect(err.message).toBe(MESSAGE_VOL_NOT_SUPPORTED);
    expect(err.message).toBe('vol% 需要溶劑密度，將於 Phase 8 提供');
    expect(out.results.liquid).toBeNull();
    near(value(out.results.solid!.components[0].wtPct), 100);
  });

  it('phr 用於 Liquid、vol 用於 Solid 都報錯', () => {
    const a = computeFormulation(formulation({ unit: 'g', components: [solidC('A', 10)] }, { unit: 'phr' as LiquidUnit, components: [liquidC('S1', 1)] }), MW);
    expect(codes(a)).toContain('PHR_IN_LIQUID');
    const b = computeFormulation(formulation({ unit: 'vol' as SolidUnit, components: [solidC('A', 10)] }), MW);
    expect(codes(b)).toContain('VOL_IN_SOLID');
  });

  it('數值為負或不是數字報錯並指出成分', () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const out = computeFormulation(formulation({ unit: 'g', components: [solidC('A', 10), solidC('B', bad)] }), MW);
      const err = out.errors.find((e) => e.code === 'INVALID_AMOUNT')!;
      expect(err.componentId).toBe('B');
      expect(err.area).toBe('solid');
      expect(out.results.solid).toBeNull();
    }
  });

  it('數值合計為 0 報錯', () => {
    const out = computeFormulation(formulation({ unit: 'g', components: [solidC('A', 0)] }), MW);
    expect(codes(out)).toContain('ZERO_TOTAL');
  });

  it('某區沒有成分卻填了總重報錯；總重為負或 0 報錯', () => {
    const empty = computeFormulation(formulation({ unit: 'g', components: [solidC('A', 10)] }, { unit: 'g', components: [] }, { liquidTotalG: 20 }), MW);
    const err = empty.errors.find((e) => e.code === 'EMPTY_AREA_WITH_SETTINGS')!;
    expect(err.area).toBe('liquid');
    for (const bad of [-5, 0]) {
      const out = computeFormulation(formulation({ unit: 'parts', components: [solidC('A', 10)] }, undefined, { solidTotalG: bad }), MW);
      expect(codes(out)).toContain('INVALID_TOTAL');
    }
  });

  it('單位 g 又填總重時以各成分相加為準並警告', () => {
    const out = computeFormulation(formulation({ unit: 'g', components: [solidC('A', 10)] }, undefined, { solidTotalG: 99 }), MW);
    expect(out.warnings.map((w) => w.code)).toContain('TOTAL_IGNORED');
    near(value(out.results.overall.solidMass), 10);
  });

  it('分類不屬於該區、成分編號重複報錯', () => {
    const wrong = computeFormulation(formulation({ unit: 'g', components: [{ ...solidC('A', 10), category: 'Solvent' as SolidCategory }] }), MW);
    expect(codes(wrong)).toContain('INVALID_CATEGORY');
    const dup = computeFormulation(formulation({ unit: 'g', components: [solidC('A', 10), solidC('A', 5)] }), MW);
    expect(codes(dup)).toContain('DUPLICATE_ID');
  });

  it('Liquid 區錯誤不影響 Solid 區的 wt%，但整體 Solid Content 無法計算', () => {
    const out = computeFormulation(
      formulation({ unit: 'g', components: [solidC('A', 30), solidC('B', 10)] }, { unit: 'wt', components: [liquidC('S1', 90)] }),
      MW,
    );
    expect(codes(out)).toEqual(['SUM_NOT_100']);
    near(value(out.results.solid!.components[0].wtPct), 75);
    expect(out.results.overall.solidContent.value).toBeNull();
  });

  it('多片段成分（鹽類）視為一個成分，以傳入的分子量整體計算', () => {
    const salt = solidC('A', 1, { canonicalSmiles: '[Na+].[Cl-]' });
    const out = computeFormulation(formulation({ unit: 'mol', components: [{ ...salt, amount: 50 }, solidC('B', 50)] }), MW);
    expect(out.errors).toEqual([]);
    expect(out.results.solid!.components).toHaveLength(2);
    near(value(out.results.solid!.components[0].wtPct), 66.67); // 50×100 : 50×50
  });
});

describe('序列化', () => {
  const sample: Formulation = formulation(
    {
      unit: 'phr',
      components: [
        solidC('A', 100, { isResin: true, category: 'Resin', compoundId: 'lib-1', canonicalSmiles: '*CC*' }),
        solidC('B', 30, { volatileFlag: true }),
      ],
    },
    { unit: 'g', components: [liquidC('S1', 60)] },
    { name: '配方一', solidTotalG: 12.5, liquidTotalG: 30, targetSolidContentPct: 25 },
  );

  it('序列化再讀回內容不變，含 schemaVersion', () => {
    const text = serializeFormulation(sample);
    expect(JSON.parse(text).schemaVersion).toBe(1);
    const back = parseFormulation(text);
    expect(back.ok && back.formulation).toEqual(sample);
  });

  it('沒有選填欄位的配方也能來回', () => {
    const plain = formulation({ unit: 'g', components: [solidC('A', 1)] });
    const back = parseFormulation(serializeFormulation(plain));
    expect(back.ok && back.formulation).toEqual(plain);
  });

  it('NaN 數值（尚未輸入）來回後仍是 NaN，計算時報「數值無效」', () => {
    const blank = formulation({ unit: 'g', components: [solidC('A', Number.NaN)] });
    const back = parseFormulation(serializeFormulation(blank));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(Number.isNaN(back.formulation.solid.components[0].amount)).toBe(true);
      expect(codes(computeFormulation(back.formulation, MW))).toContain('INVALID_AMOUNT');
    }
  });

  it('不認得的 schemaVersion、非 JSON、格式錯誤被拒絕而不拋錯', () => {
    for (const text of [
      JSON.stringify({ ...sample, schemaVersion: 2 }),
      'not json',
      '[]',
      JSON.stringify({ schemaVersion: 1, name: 'x' }),
      JSON.stringify({ ...sample, solid: { unit: 'g', components: [{ id: 'A' }] } }),
      JSON.stringify({ ...sample, solidTotalG: 'abc' }),
    ]) {
      expect(parseFormulation(text).ok).toBe(false);
    }
  });
});
