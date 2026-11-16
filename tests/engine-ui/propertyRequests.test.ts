// 物性面板輸入轉換（任務 I01）：介面狀態（配方、formulation/compute 的換算結果）→ 引擎請求。
import { describe, expect, it } from 'vitest';
import { computeFormulation } from '../../src/core/formulation/compute';
import type { Formulation } from '../../src/core/formulation/types';
import { formulationRequests, unitRequests } from '../../src/ui/engine/propertyRequests';

const UNIT = '[*:1]CC([*:2])(C)C(=O)OC'; // 含 * 的重複單元
const SMALL = 'CCO';

function formulation(): Formulation {
  return {
    schemaVersion: 1,
    name: 't',
    solid: {
      unit: 'wt',
      components: [
        { id: 'p', name: '聚合物', canonicalSmiles: UNIT, category: 'Resin', amount: 80, polymer: { mnInput: 10000 } },
        { id: 's', name: '小分子', canonicalSmiles: SMALL, category: 'Small Molecule', amount: 15 },
        { id: 'c', name: '催化劑', canonicalSmiles: 'CN', category: 'Catalyst/Initiator', amount: 5 },
      ],
    },
    liquid: { unit: 'g', components: [] },
  };
}

describe('單一對象請求', () => {
  it('聚合物單元：呼叫 Tg、Vm、CTE、介電等，SMILES 原樣傳入', () => {
    const paths = unitRequests({ canonicalSmiles: UNIT }).map((r) => r.path);
    expect(paths).toEqual(['/vw', '/tg', '/vm', '/cte', '/free-volume', '/dielectric', '/joback', '/tpsa-logp']);
    expect(unitRequests({ canonicalSmiles: UNIT }).every((r) => r.body.smiles === UNIT)).toBe(true);
  });

  it('小分子：不呼叫 /tg（D56）', () => {
    expect(unitRequests({ canonicalSmiles: SMALL }).map((r) => r.path)).not.toContain('/tg');
  });

  it('共聚物組成（units、fractionBasis）只隨自由體積請求傳入', () => {
    const polymer = { mnInput: 5000, units: [{ smiles: UNIT, fraction: 70 }, { smiles: '[*:1]CC([*:2])c1ccccc1', fraction: 30 }], fractionBasis: 'wt' as const };
    const reqs = unitRequests({ canonicalSmiles: UNIT, polymer });
    expect(reqs.find((r) => r.path === '/free-volume')?.body).toEqual({ smiles: UNIT, units: polymer.units, fractionBasis: 'wt' });
    expect(reqs.find((r) => r.path === '/vw')?.body).toEqual({ smiles: UNIT });
  });
});

describe('配方請求', () => {
  const f = formulation();
  // 由介面端以現有 TypeScript 的 computeFormulation 換算：聚合物用 Mn、小分子用每分子質量
  const mnById = { p: 10000, s: 46.07, c: 31.06 };
  const outcome = computeFormulation(f, mnById, { unitWeights: { p: 100.12 } });
  const req = formulationRequests(f, outcome, mnById);

  it('Tg 混合：成分、質量百分比（換算結果）與 Mn 一起傳入', () => {
    expect(req.tgMixing?.path).toBe('/tg/mixing');
    const body = req.tgMixing?.body as { components: { id: string }[]; wtPct: Record<string, number>; mn: Record<string, number> };
    expect(body.components.map((c) => c.id)).toEqual(['p', 's', 'c']);
    expect(body.wtPct.p).toBeCloseTo(80, 6);
    expect(body.wtPct.s).toBeCloseTo(15, 6);
    expect(body.mn).toEqual(mnById);
  });

  it('混合密度／介電：Catalyst 不混入，質量分率重新正規化為合計 1', () => {
    const body = req.density?.body as { components: { name: string; w: number; smiles?: string }[] };
    expect(req.density?.path).toBe('/mixture-density');
    expect(body.components.map((c) => c.name)).toEqual(['聚合物', '小分子']);
    expect(body.components[0].w + body.components[1].w).toBeCloseTo(1, 12);
    expect(body.components[0].w).toBeCloseTo(80 / 95, 9);
    expect(body.components[0].smiles).toBe(UNIT);
    expect(req.dielectric?.path).toBe('/mixture-dielectric');
    expect((req.dielectric?.body as { basis: string }).basis).toBe('mass');
  });

  it('換算失敗（沒有結果）：不送混合密度／介電，並說明原因；Tg 請求帶 wtPct: null', () => {
    const none = formulationRequests(f, null, mnById);
    expect(none.density).toBeNull();
    expect(none.mixReason).toContain('質量分率');
    expect((none.tgMixing?.body as { wtPct: unknown }).wtPct).toBeNull();
  });

  it('共聚物成分不帶 smiles（不用第一種單元代表）', () => {
    const g = formulation();
    g.solid.components[0].polymer = { mnInput: 10000, units: [{ smiles: UNIT, fraction: 50 }, { smiles: '[*:1]CC([*:2])c1ccccc1', fraction: 50 }] };
    const out = computeFormulation(g, mnById, { unitWeights: { p: 100.12 } });
    const r = formulationRequests(g, out, mnById);
    const comps = (r.density?.body as { components: { smiles?: string }[] }).components;
    expect(comps[0].smiles).toBeUndefined();
    expect(comps[1].smiles).toBe(SMALL);
  });

  it('Solid 區沒有成分：不送請求', () => {
    const g = formulation();
    g.solid.components = [];
    const r = formulationRequests(g, null, {});
    expect(r.tgMixing).toBeNull();
    expect(r.mixReason).toBe('Solid 區沒有成分');
  });
});
