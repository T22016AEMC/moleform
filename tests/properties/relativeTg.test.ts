// 簡易 Tg 相對估算（任務 038，D61）的測試：驗收範例、公式手算、°C／K、沿用現有 VW 與 Va、各種警示與拒絕、共聚物與換單體。
// 手算用題目自訂的數字（非實驗值），目的是檢查程式有沒有照公式算對（D17）；不拿 k／Tg 表內的 Tg 互相預測或比對。
// 命名：packingK＝堆積係數（小寫 k）；alphaOverride＝Δα 覆寫值（大寫 K = 1／Δα）。
import { beforeAll, describe, expect, it } from 'vitest';
import { CTE_COEFFICIENTS } from '../../src/core/properties/cte';
import { computeMolarVolumeDensity } from '../../src/core/properties/molarVolumeDensity';
import {
  BONDI_OCCUPIED_FACTOR,
  RELATIVE_TG_CALIBRATION_LABEL,
  RELATIVE_TG_CONFIDENCE,
  RELATIVE_TG_CTE_LABEL,
  RELATIVE_TG_DISCLAIMER,
  RELATIVE_TG_FOX_LABEL,
  RELATIVE_TG_MN_UNCHECKED,
  RELATIVE_TG_OVERRIDE_LABEL,
  RELATIVE_TG_SMALL_MOLECULE,
  RELATIVE_TG_VA_WARNING,
  bondiFfv,
  calibrateAlphaOverride,
  compositionVolumes,
  deltaAlphaFromCte,
  evaluateRelativeTgComposition,
  ffvFromPackingK,
  packingKFromClassCoefficient,
  relativeTg,
  relativeTgFromVolumes,
  type RelativeTgInput,
  type RelativeTgResult,
} from '../../src/core/properties/relativeTg';
import { foxMix } from '../../src/core/properties/tgMixing';
import { computeVdwVolume } from '../../src/core/properties/vanDerWaalsVolume';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

// 測試用結構（重複單元）。VW 欄是現行 VW 函式的輸出（任務 028／031／037），在「沿用現有結果」的測試裡核對。
const PMMA = '[*:1]CC([*:2])(C)C(=O)OC'; // VW 56.93；k 表「PMMA」0.660
const TBMA = '[*:1]CC([*:2])(C)C(=O)OC(C)(C)C'; // VW 86.71；k 表「Poly(tBMA)」0.635
const PHS = '[*:1]CC([*:2])c1ccc(O)cc1'; // VW 68.33；k 表「PHS」0.640
const PS = '[*:1]CC([*:2])c1ccccc1'; // VW 62.83；不在 k 表 → D57 類別（芳香環 0.37）
const PE = '[*:1]CC[*:2]'; // VW 20.46；D57 類別（脂肪族 1）
const PVC = '[*:1]CC(Cl)[*:2]'; // VW 29.23；D57 缺基團（Cl）→ 密度或 Va（46.37）
const PAN = '[*:1]CC([*:2])C#N'; // VW 有；D57 缺基團、Va 缺基團 → 缺莫耳體積
const PGMA = '[*:1]CC([*:2])(C)C(=O)OCC1CO1'; // VW 缺基團（環氧環）
const VW = { PMMA: 56.93, TBMA: 86.71, PHS: 68.33, PS: 62.83, PE: 20.46, PVC: 29.23 };
const K_TABLE = { PMMA: 0.66, TBMA: 0.635, PHS: 0.64 };
const K_AROMATIC = 1 / (0.37 + 1.3);

const run = (input: RelativeTgInput) => relativeTg(RDKit, input);
const done = (r: RelativeTgResult) => {
  if (r.status === 'rejected') throw new Error(`預期可計算，實際被拒絕：${r.message}`);
  return r;
};
const estimate = (r: RelativeTgResult) => {
  const d = done(r);
  if (d.tgB.status !== 'ok') throw new Error(`預期輸出 Tg_B，實際 ${d.tgB.status}：${JSON.stringify(d.tgB)}`);
  return { ...d, tgB: d.tgB };
};
const pmma = (amount?: number) => ({ name: 'PMMA', smiles: PMMA, amount });
const tbma = (amount?: number) => ({ name: 'Poly(tBMA)', smiles: TBMA, amount });
/** 手算：Vm = Vω／k、Vf = Vω(1/k − 1.3) */
const vmOf = (vw: number, k: number) => vw / k;
const vfOf = (vw: number, k: number) => vw / k - 1.3 * vw;

describe('驗收範例（任務卡完成標準）：Cardo Vω 242.4、萘 Vω 81.1、堆積係數 k 0.628、Tg_A 350 °C', () => {
  const r = relativeTgFromVolumes({
    a: [{ vomega: 242.4, packingK: 0.628 }],
    b: [
      { vomega: 242.4, packingK: 0.628 },
      { vomega: 81.1, packingK: 0.628 },
    ],
    tgA: { value: 350, unit: 'C' },
  });

  it('Δf ≈ 0.0614（=（Vf_B − Vf_A）／V_A = (1 − 1.3 × 0.628) × 81.1／242.4）', () => {
    expect(r.deltaF).toBeCloseTo(0.0614, 4);
    expect(r.deltaF).toBeCloseTo((1 - 1.3 * 0.628) * (81.1 / 242.4), 12);
    expect(r.deltaF).toBeCloseTo((81.1 / 0.628 - 1.3 * 81.1) / (242.4 / 0.628), 12);
  });
  it('Δα ≈ 3.45×10⁻⁴（書的常數手算：(1.00 − 0.45)×10⁻³ × 0.628 = 3.454×10⁻⁴，與現有 CTE 函式的常數一致）', () => {
    expect(r.deltaAlphaA).toBeCloseTo(0.55e-3 * 0.628, 14);
    expect(r.deltaAlphaA).toBeCloseTo((CTE_COEFFICIENTS.el - CTE_COEFFICIENTS.eg) * 0.628, 14);
    expect(Number(r.deltaAlphaA.toExponential(2))).toBe(3.45e-4);
  });
  it('Tg_B ≈ 172 °C（350 − 0.061427／3.454×10⁻⁴ = 172.16 °C）', () => {
    expect(r.tgB.status).toBe('ok');
    if (r.tgB.status !== 'ok') return;
    expect(Math.round(r.tgB.tgC)).toBe(172);
    expect(r.tgB.tgC).toBeCloseTo(350 - ((1 - 1.3 * 0.628) * (81.1 / 242.4)) / (0.55e-3 * 0.628), 9);
    expect(r.tgB.tgC).toBeCloseTo(172.16, 2);
    expect(r.tgB.alphaSource).toBe('cte');
    expect(r.tgB.label).toBe(RELATIVE_TG_CTE_LABEL);
  });
  it('同一個堆積係數 k：FFV_A = FFV_B = 1 − 1.3k = 0.1836，但 Δf 不為 0（Δf 不是 FFV_B − FFV_A）', () => {
    expect(r.a.ffv).toBeCloseTo(0.1836, 12);
    expect(r.b.ffv).toBeCloseTo(0.1836, 12);
    expect(r.deltaF).toBeGreaterThan(0.06);
  });
});

describe('公式手算（題目自訂的數字）', () => {
  // A：Vω 100、Vm 160 → V0 130、Vf 30、FFV 0.1875；B：Vω 120、Vm 200 → V0 156、Vf 44、FFV 0.22
  // Δf = (44 − 30)／160 = 0.0875；Δα_A = 0.55e-3 × 100／160 = 3.4375e-4；Δα_B = 0.55e-3 × 120／200 = 3.3e-4
  // Tg_B = 400 − 0.0875／3.4375e-4 = 400 − 254.5455 = 145.4545 K
  const base = { a: [{ vomega: 100, vm: 160 }], b: [{ vomega: 120, vm: 200 }] };

  it('1.3 是固定常數；FFV、Vf、Δf、Δα 逐項與手算相同', () => {
    expect(BONDI_OCCUPIED_FACTOR).toBe(1.3);
    const r = relativeTgFromVolumes({ ...base, tgA: { value: 400, unit: 'K' } });
    expect(r.a).toMatchObject({ moles: 1, vomega: 100, vm: 160, v0: 130, vf: 30 });
    expect(r.a.ffv).toBeCloseTo(0.1875, 12);
    expect(r.b.v0).toBeCloseTo(156, 12);
    expect(r.b.vf).toBeCloseTo(44, 12);
    expect(r.b.ffv).toBeCloseTo(0.22, 12);
    expect(r.deltaF).toBeCloseTo(0.0875, 12);
    expect(r.deltaAlphaA).toBeCloseTo(3.4375e-4, 14);
    expect(r.deltaAlphaB).toBeCloseTo(3.3e-4, 14);
    expect(r.tgB).toMatchObject({ status: 'ok', alphaSource: 'cte' });
    if (r.tgB.status === 'ok') {
      expect(r.tgB.tgK).toBeCloseTo(400 - 0.0875 / 3.4375e-4, 9);
      expect(r.tgB.tgK).toBeCloseTo(145.4545, 4);
      expect(r.tgB.deltaTgK).toBeCloseTo(-254.5455, 4);
      expect(r.tgB.deltaAlphaUsed).toBeCloseTo(3.4375e-4, 14);
    }
  });

  it('°C 與 K 的輸入輸出：126.85 °C = 400 K，結果相同；輸出的 °C = K − 273.15', () => {
    const k = relativeTgFromVolumes({ ...base, tgA: { value: 400, unit: 'K' } });
    const c = relativeTgFromVolumes({ ...base, tgA: { value: 126.85, unit: 'C' } });
    expect(c.tgAK).toBeCloseTo(400, 10);
    if (k.tgB.status !== 'ok' || c.tgB.status !== 'ok') throw new Error('應輸出 Tg_B');
    expect(c.tgB.tgK).toBeCloseTo(k.tgB.tgK, 9);
    expect(k.tgB.tgC).toBeCloseTo(k.tgB.tgK - 273.15, 12);
    expect(c.tgB.deltaTgK).toBeCloseTo(k.tgB.deltaTgK, 9);
  });

  it('Δα 覆寫值 K（alphaOverride）優先：Tg_B = Tg_A − K × Δf = 400 − 1000 × 0.0875 = 312.5 K', () => {
    const r = relativeTgFromVolumes({ ...base, tgA: { value: 400, unit: 'K' }, alphaOverride: 1000 });
    expect(r.tgB).toMatchObject({ status: 'ok', alphaSource: 'override', label: RELATIVE_TG_OVERRIDE_LABEL });
    if (r.tgB.status === 'ok') {
      expect(r.tgB.tgK).toBeCloseTo(312.5, 10);
      expect(r.tgB.deltaAlphaUsed).toBeCloseTo(1e-3, 14);
    }
  });

  it('Δα 覆寫值 K ≤ 0（或不是數字）：不輸出 Tg_B', () => {
    for (const bad of [0, -500, Number.NaN]) {
      const r = relativeTgFromVolumes({ ...base, tgA: { value: 400, unit: 'K' }, alphaOverride: bad });
      expect(r.tgB.status, String(bad)).toBe('unavailable');
      if (r.tgB.status === 'unavailable') expect(r.tgB.message).toContain('Δα 覆寫值 K');
      expect(r.deltaF).toBeCloseTo(0.0875, 12);
    }
  });

  it('小工具：FFV = 1 − 1.3 × Vω／Vm；堆積係數 k 來源下 FFV = 1 − 1.3k；D57 類別係數換算 k = 1／(c + 1.3)', () => {
    expect(bondiFfv(100, 160)).toBeCloseTo(0.1875, 12);
    expect(ffvFromPackingK(0.628)).toBeCloseTo(0.1836, 12);
    expect(packingKFromClassCoefficient(0.37)).toBeCloseTo(0.5988, 4);
    expect(packingKFromClassCoefficient(0.7)).toBeCloseTo(0.5, 12);
    expect(packingKFromClassCoefficient(0.8)).toBeCloseTo(0.4762, 4);
    expect(packingKFromClassCoefficient(1)).toBeCloseTo(0.4348, 4);
    expect(deltaAlphaFromCte(100, 160)).toBeCloseTo(((CTE_COEFFICIENTS.el - CTE_COEFFICIENTS.eg) * 100) / 160, 14);
  });

  it('任意比例用同一個算式：A = a:b 7:3、B = a:b 5:5（a：Vω 50、k 0.66；b：Vω 80、k 0.635）', () => {
    const item = (moles: number, vomega: number, packingK: number) => ({ moles, vomega, packingK });
    const r = relativeTgFromVolumes({ a: [item(7, 50, 0.66), item(3, 80, 0.635)], b: [item(5, 50, 0.66), item(5, 80, 0.635)], tgA: { value: 120, unit: 'C' } });
    const vA = 7 * vmOf(50, 0.66) + 3 * vmOf(80, 0.635);
    const dVf = (5 - 7) * vfOf(50, 0.66) + (5 - 3) * vfOf(80, 0.635);
    expect(r.deltaF).toBeCloseTo(dVf / vA, 12);
    const dAlpha = (0.55e-3 * (7 * 50 + 3 * 80)) / vA;
    expect(r.deltaAlphaA).toBeCloseTo(dAlpha, 14);
    if (r.tgB.status === 'ok') expect(r.tgB.tgC).toBeCloseTo(120 - dVf / vA / dAlpha, 9);
    // 兩邊同乘一個倍數（7:3 → 70:30、5:5 → 50:50）結果不變
    const scaled = relativeTgFromVolumes({ a: [item(70, 50, 0.66), item(30, 80, 0.635)], b: [item(50, 50, 0.66), item(50, 80, 0.635)], tgA: { value: 120, unit: 'C' } });
    expect(scaled.deltaF).toBeCloseTo(r.deltaF, 12);
  });

  it('輸入不合法時拋出（純計算函式）', () => {
    expect(() => compositionVolumes([])).toThrow();
    expect(() => compositionVolumes([{ moles: 0, vomega: 100, vm: 160 }])).toThrow();
    expect(() => relativeTgFromVolumes({ a: [{ vomega: 100 }], b: [{ vomega: 100, vm: 160 }], tgA: { value: 400, unit: 'K' } })).toThrow();
    expect(() => relativeTgFromVolumes({ a: [{ vomega: 100, vm: 160, packingK: 0.6 }], b: [{ vomega: 100, vm: 160 }], tgA: { value: 400, unit: 'K' } })).toThrow();
    expect(() => relativeTgFromVolumes({ ...base, tgA: { value: -300, unit: 'C' } })).toThrow();
  });

  it('calibrateAlphaOverride：K =（Tg_A − Tg_B）／Δf，標「單一組校正，未經驗證」；Δf 為 0 時拒絕', () => {
    const k = calibrateAlphaOverride({ value: 400, unit: 'K' }, { value: 312.5, unit: 'K' }, 0.0875);
    expect(k).toMatchObject({ status: 'ok', label: RELATIVE_TG_CALIBRATION_LABEL });
    expect(k.status === 'ok' && k.alphaOverride).toBeCloseTo(1000, 9);
    const c = calibrateAlphaOverride({ value: 150, unit: 'C' }, { value: 100, unit: 'C' }, 0.05);
    expect(c.status === 'ok' && c.alphaOverride).toBeCloseTo(1000, 9);
    expect(calibrateAlphaOverride({ value: 400, unit: 'K' }, { value: 300, unit: 'K' }, 0).status).toBe('rejected');
    expect(RELATIVE_TG_CALIBRATION_LABEL).toBe('單一組校正，未經驗證');
  });
});

describe('沿用現有 VW、Va 與 CTE（不重複開發）', () => {
  it('VvdW 與現行 computeVdwVolume 的輸出完全相同；Va 與現行 computeMolarVolumeDensity 完全相同', () => {
    for (const [smiles, vw] of [[PMMA, VW.PMMA], [TBMA, VW.TBMA], [PHS, VW.PHS], [PS, VW.PS], [PE, VW.PE], [PVC, VW.PVC]] as const) {
      const existing = computeVdwVolume(RDKit, smiles);
      if (existing.status !== 'ok') throw new Error('現行 VW 應可算');
      expect(existing.vw).toBeCloseTo(vw, 9);
      const r = done(run({ a: { monomers: [{ smiles }] }, b: { monomers: [{ smiles }] } }));
      expect(r.a.monomers[0].vomega).toBe(existing.vw);
    }
    const va = computeMolarVolumeDensity(RDKit, PVC);
    if (va.status !== 'ok' || !va.amorphous) throw new Error('現行 Va 應可算');
    const r = done(run({ a: { monomers: [{ smiles: PVC }] }, b: { monomers: [{ smiles: PVC }] } }));
    expect(r.a.monomers[0]).toMatchObject({ vmSource: 'va', vm: va.amorphous.vm, vmTemperatureK: 298, vmLabel: expect.stringContaining('Va 估算') });
    expect(r.warnings).toContain(RELATIVE_TG_VA_WARNING);
  });

  it('含 Bondi 補充基團的 VvdW 會標示（雙酚茀單元）', () => {
    const r = done(run({ a: { monomers: [{ smiles: '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O' }] }, b: { monomers: [{ smiles: PS }] } }));
    expect(r.a.monomers[0].vwBondiSupplement).toBe(true);
    expect(r.a.monomers[0].notes.join('；')).toContain('含 Bondi 補充基團（非書值）');
  });
});

describe('由結構計算：均聚物、同一結構、退階', () => {
  it('同一結構作 A 與 B：Δf = 0、Tg_B = Tg_A', () => {
    const r = estimate(run({ a: { monomers: [{ smiles: PS }] }, b: { monomers: [{ smiles: PS }] }, tgA: { value: 100, unit: 'C' } }));
    expect(r.deltaF).toBe(0);
    expect(r.tgB.tgC).toBeCloseTo(100, 10);
    expect(r.tgB.deltaTgK).toBeCloseTo(0, 12);
  });

  it('固定顯示：聲明、可信度「參考趨勢」、模型名稱、統一備註、未檢查分子量', () => {
    const r = done(run({ a: { monomers: [{ smiles: PS }] }, b: { monomers: [{ smiles: PE }] }, tgA: { value: 100, unit: 'C' } }));
    expect(r.disclaimer).toBe(RELATIVE_TG_DISCLAIMER);
    expect(RELATIVE_TG_DISCLAIMER).toBe('簡易經驗估算，非經實驗驗證的通用預測模型；不是 WLF 完整模型；Δα 覆寫值 K 須由同家族實驗資料校正');
    expect(r.confidence).toBe('參考趨勢');
    expect(RELATIVE_TG_CONFIDENCE).toBe('參考趨勢');
    expect(r.model).toContain('式 4.2');
    expect(r.unifiedNote).toContain('非實測值');
    expect(r.notes).toContain(RELATIVE_TG_MN_UNCHECKED);
    expect(r.notes.some((n) => n.includes('Δf 不是 FFV_B − FFV_A'))).toBe(true);
    expect(r.mnRatio).toBeNull();
  });

  it('退階 (1b)：不在 k 表、沒輸入 k → D57 類別係數換算，標「類別預設，非材料值」', () => {
    const r = done(run({ a: { monomers: [{ smiles: PS }] }, b: { monomers: [{ smiles: PE }] }, tgA: { value: 100, unit: 'C' } }));
    expect(r.a.monomers[0]).toMatchObject({ packingKSource: 'class', vmSource: 'classK', vmTemperatureK: null });
    expect(r.a.monomers[0].packingK).toBeCloseTo(K_AROMATIC, 12);
    expect(r.a.monomers[0].notes.join('；')).toContain('類別預設，非材料值');
    expect(r.b.monomers[0].packingK).toBeCloseTo(1 / 2.3, 12);
    // 手算：Δf =（Vf_PE − Vf_PS）／V_PS
    expect(r.deltaF).toBeCloseTo((vfOf(VW.PE, 1 / 2.3) - vfOf(VW.PS, K_AROMATIC)) / vmOf(VW.PS, K_AROMATIC), 9);
  });

  it('k 表無此材料：回報後退用類別預設，不以相近材料代替', () => {
    const r = done(run({ a: { monomers: [{ name: 'Polystyrene', smiles: PS }] }, b: { monomers: [{ smiles: PE }] } }));
    expect(r.a.monomers[0].notes.join('；')).toContain('k 表無此材料：Polystyrene');
    expect(r.a.monomers[0].packingKSource).toBe('class');
  });

  it('使用者輸入的堆積係數 k 優先於 k 表；k 表優先於類別預設', () => {
    const r = done(run({ a: { monomers: [{ name: 'PMMA', smiles: PMMA, packingK: 0.7 }] }, b: { monomers: [{ name: 'PMMA', smiles: PMMA }] } }));
    expect(r.a.monomers[0]).toMatchObject({ packingK: 0.7, packingKSource: 'user', vmSource: 'userK' });
    expect(r.b.monomers[0]).toMatchObject({ packingK: 0.66, packingKSource: 'table', vmSource: 'tableK', family: '甲基丙烯酸酯' });
    expect(r.b.monomers[0].vmLabel).toContain('Vm 由使用者堆積係數估算（非實測）');
    expect(r.b.monomers[0].ffv).toBeCloseTo(1 - 1.3 * 0.66, 12);
  });

  it('退階 (2)：沒有堆積係數 k 時用使用者密度（Vm = M／ρ）；有 k 時密度不使用並註明', () => {
    const mass = (computeVdwVolume(RDKit, PVC) as { formulaMass: number }).formulaMass;
    const r = done(run({ a: { monomers: [{ smiles: PVC, density: 1.4 }] }, b: { monomers: [{ smiles: PVC, density: 1.35 }] }, tgA: { value: 80, unit: 'C' } }));
    expect(r.a.monomers[0]).toMatchObject({ vmSource: 'density', packingK: null });
    expect(r.a.monomers[0].vm).toBeCloseTo(mass / 1.4, 9);
    expect(r.a.monomers[0].vmTemperatureK).toBeCloseTo(298.15, 9);
    expect(r.deltaF).toBeCloseTo((mass / 1.35 - mass / 1.4) / (mass / 1.4), 9);
    const withK = done(run({ a: { monomers: [{ smiles: PS, density: 1.05 }] }, b: { monomers: [{ smiles: PS }] } }));
    expect(withK.a.monomers[0].vmSource).toBe('classK');
    expect(withK.a.monomers[0].notes.join('；')).toContain('密度沒有使用');
  });

  it('缺 VW（缺基團）：明確回報、不計算、不輸出 Tg_B', () => {
    const r = done(run({ a: { monomers: [{ smiles: PS }] }, b: { monomers: [{ smiles: PGMA }] }, tgA: { value: 100, unit: 'C' }, alphaOverride: 1000 }));
    expect(r.status).toBe('missing');
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0]).toMatchObject({ side: 'B', what: 'VW' });
    expect(r.missing[0].message).toContain('缺 VW');
    expect(r.missing[0].atoms?.length).toBeGreaterThan(0);
    expect(r.deltaF).toBeNull();
    expect(r.tgB.status).toBe('unavailable');
  });

  it('缺莫耳體積：回報「缺莫耳體積」，不把 VvdW 當 FFV 的替代', () => {
    const r = done(run({ a: { monomers: [{ smiles: PS }] }, b: { monomers: [{ smiles: PAN }] }, tgA: { value: 100, unit: 'C' } }));
    expect(r.status).toBe('missing');
    expect(r.missing[0]).toMatchObject({ side: 'B', what: 'Vm' });
    expect(r.missing[0].message).toContain('缺莫耳體積');
    expect(r.b.monomers[0].vomega).not.toBeNull();
    expect(r.b.monomers[0].ffv).toBeNull();
    expect(r.b.ffv).toBeNull();
    expect(r.tgB.status).toBe('unavailable');
  });

  it('Δα 算不出來（A 缺 VW）且沒有 Δα 覆寫值 K：只顯示算得出來的 FFV，不輸出 Tg_B', () => {
    const r = done(run({ a: { monomers: [{ smiles: PGMA }] }, b: { monomers: [{ smiles: PS }] }, tgA: { value: 100, unit: 'C' } }));
    expect(r.a.deltaAlpha).toBeNull();
    expect(r.b.ffv).not.toBeNull();
    expect(r.tgB.status).toBe('unavailable');
  });

  it('由結構計算時 Δα 覆寫值 K ≤ 0：不輸出 Tg_B 並警示；正值則採用', () => {
    const input = { a: { monomers: [{ smiles: PS }] }, b: { monomers: [{ smiles: PE }] }, tgA: { value: 100, unit: 'C' as const } };
    const bad = done(run({ ...input, alphaOverride: -1 }));
    expect(bad.tgB.status).toBe('unavailable');
    expect(bad.warnings.some((w) => w.includes('Δα 覆寫值 K 必須是正數'))).toBe(true);
    expect(bad.deltaF).not.toBeNull();
    const good = estimate(run({ ...input, alphaOverride: 800 }));
    expect(good.tgB.alphaSource).toBe('override');
    expect(good.tgB.tgC).toBeCloseTo(100 - 800 * (good.deltaF as number), 9);
  });
});

describe('基準不同、小分子、Mn', () => {
  it('B 為小分子：Tg_B「不適用（小分子，D56）」，只顯示 FFV', () => {
    const r = done(run({ a: { monomers: [{ smiles: PS }] }, b: { monomers: [{ smiles: 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1' }] }, tgA: { value: 100, unit: 'C' } }));
    expect(r.tgB).toEqual({ status: 'notApplicable', message: RELATIVE_TG_SMALL_MOLECULE });
    expect(RELATIVE_TG_SMALL_MOLECULE).toBe('不適用（小分子，D56）');
    expect(r.deltaF).toBeNull();
    expect(r.a.ffv).not.toBeNull();
    expect(r.b.ffv).not.toBeNull();
  });

  it('A 是小分子、B 是重複單元，或同一組成混有兩者：單位基準不同，拒絕', () => {
    const r1 = run({ a: { monomers: [{ smiles: 'CCO' }] }, b: { monomers: [{ smiles: PS }] }, tgA: { value: 100, unit: 'C' } });
    expect(r1).toMatchObject({ status: 'rejected', code: 'BASIS_MISMATCH' });
    const r2 = run({ a: { monomers: [{ smiles: PS }] }, b: { monomers: [{ smiles: PS }, { smiles: 'CCO' }] } });
    expect(r2).toMatchObject({ status: 'rejected', code: 'BASIS_MISMATCH' });
  });

  it('Vm 的溫度基準不同（密度 100 °C 與 Va 298 K）：拒絕；25 °C 的密度與 298 K 的 Va 視為同一溫度', () => {
    const r = run({ a: { monomers: [{ smiles: PVC, density: 1.3, densityTemperatureC: 100 }] }, b: { monomers: [{ smiles: PVC }] } });
    expect(r).toMatchObject({ status: 'rejected', code: 'TEMPERATURE_MISMATCH' });
    if (r.status === 'rejected') expect(r.message).toContain('溫度基準不同');
    expect(run({ a: { monomers: [{ smiles: PVC, density: 1.4 }] }, b: { monomers: [{ smiles: PVC }] } }).status).toBe('ok');
  });

  it('堆積係數 k（溫度基準未註明）與 Va 混用：警示無法確認同一溫度，不阻擋', () => {
    const r = done(run({ a: { monomers: [{ smiles: PS }] }, b: { monomers: [{ smiles: PVC }] }, tgA: { value: 100, unit: 'C' } }));
    expect(r.warnings.some((w) => w.includes('無法確認'))).toBe(true);
    expect(r.deltaF).not.toBeNull();
  });

  it('兩者都輸入 Mn：顯示 Mn 比值，不設門檻；否則寫「未檢查分子量是否相近」', () => {
    const r = done(run({ a: { monomers: [{ smiles: PS }], mn: 10000 }, b: { monomers: [{ smiles: PE }], mn: 25000 } }));
    expect(r.mnRatio).toBeCloseTo(2.5, 12);
    expect(r.notes.some((n) => n.includes('Mn 比值（B／A）= 2.5'))).toBe(true);
    expect(r.notes).not.toContain(RELATIVE_TG_MN_UNCHECKED);
    const one = done(run({ a: { monomers: [{ smiles: PS }], mn: 10000 }, b: { monomers: [{ smiles: PE }] } }));
    expect(one.mnRatio).toBeNull();
    expect(one.notes).toContain(RELATIVE_TG_MN_UNCHECKED);
  });

  it('輸入不合法：空組成、用量 ≤ 0、堆積係數 k 超出範圍、沒有名稱也沒有結構、無效 SMILES、Tg_A 低於絕對零度', () => {
    const ok = { monomers: [{ smiles: PS }] };
    expect(run({ a: { monomers: [] }, b: ok })).toMatchObject({ status: 'rejected', code: 'INVALID_INPUT' });
    expect(run({ a: { monomers: [{ smiles: PS, amount: 0 }] }, b: ok })).toMatchObject({ status: 'rejected', code: 'INVALID_INPUT' });
    expect(run({ a: { monomers: [{ smiles: PS, packingK: 1.1 }] }, b: ok })).toMatchObject({ status: 'rejected', code: 'INVALID_INPUT' });
    expect(run({ a: { monomers: [{}] }, b: ok })).toMatchObject({ status: 'rejected', code: 'INVALID_INPUT' });
    expect(run({ a: { monomers: [{ smiles: 'C(' }] }, b: ok })).toMatchObject({ status: 'rejected', code: 'INVALID_STRUCTURE' });
    expect(run({ a: ok, b: ok, tgA: { value: -300, unit: 'C' } })).toMatchObject({ status: 'rejected', code: 'INVALID_INPUT' });
  });
});

describe('共聚物與換單體（同一個算式，不分支）', () => {
  const tgA = { value: 110, unit: 'C' as const };
  const vA73 = 7 * vmOf(VW.PMMA, K_TABLE.PMMA) + 3 * vmOf(VW.TBMA, K_TABLE.TBMA);

  it('(a) 同單體 7:3 → 5:5（k 表內材料）：Δf、Δα、Tg_B 與手算相同', () => {
    const r = estimate(run({ a: { monomers: [pmma(7), tbma(3)] }, b: { monomers: [pmma(5), tbma(5)] }, tgA }));
    const dVf = -2 * vfOf(VW.PMMA, K_TABLE.PMMA) + 2 * vfOf(VW.TBMA, K_TABLE.TBMA);
    expect(r.a.volumes?.vm).toBeCloseTo(vA73, 8);
    expect(r.deltaF).toBeCloseTo(dVf / vA73, 9);
    const dAlpha = (0.55e-3 * (7 * VW.PMMA + 3 * VW.TBMA)) / vA73;
    expect(r.a.deltaAlpha).toBeCloseTo(dAlpha, 12);
    expect(r.tgB.tgC).toBeCloseTo(110 - dVf / vA73 / dAlpha, 6);
    expect(r.notes.some((n) => n.includes('總莫耳數相同'))).toBe(true);
    expect(r.warnings).toEqual([]);
    // 不預設 1:1：B 改成 2:8 結果不同
    const other = estimate(run({ a: { monomers: [pmma(7), tbma(3)] }, b: { monomers: [pmma(2), tbma(8)] }, tgA }));
    expect(other.deltaF).toBeCloseTo((-5 * vfOf(VW.PMMA, K_TABLE.PMMA) + 5 * vfOf(VW.TBMA, K_TABLE.TBMA)) / vA73, 9);
  });

  it('wt 與 mol 輸入得到相同結果（質量 = 莫耳數 × 結構單元質量）', () => {
    const mass = (s: string) => (computeVdwVolume(RDKit, s) as { formulaMass: number }).formulaMass;
    const mol = estimate(run({ a: { monomers: [pmma(7), tbma(3)] }, b: { monomers: [pmma(5), tbma(5)] }, tgA }));
    const wt = estimate(
      run({
        a: { basis: 'wt', monomers: [pmma(7 * mass(PMMA)), tbma(3 * mass(TBMA))] },
        b: { basis: 'wt', monomers: [pmma(5 * mass(PMMA)), tbma(5 * mass(TBMA))] },
        tgA,
      }),
    );
    expect(wt.deltaF).toBeCloseTo(mol.deltaF as number, 10);
    expect(wt.tgB.tgK).toBeCloseTo(mol.tgB.tgK, 8);
    expect(wt.a.monomers[0].moles).toBeCloseTo(7, 10);
  });

  it('(b) 換掉其中一個單體（PMMA:tBMA → PMMA:PHS）：手算相同；不同結構類別時警示', () => {
    const r = estimate(run({ a: { monomers: [pmma(1), tbma(1)] }, b: { monomers: [pmma(1), { name: 'PHS', smiles: PHS, amount: 1 }] }, tgA }));
    const vA = vmOf(VW.PMMA, K_TABLE.PMMA) + vmOf(VW.TBMA, K_TABLE.TBMA);
    expect(r.deltaF).toBeCloseTo((vfOf(VW.PHS, K_TABLE.PHS) - vfOf(VW.TBMA, K_TABLE.TBMA)) / vA, 9);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('不在同一結構家族');
    expect(r.warnings[0]).toContain('Δα 覆寫值 K');
  });

  it('(c) 兩個都換（PMMA:tBMA → PHS:PS）：手算相同；不在 k 表的單體退用類別預設並警示', () => {
    const r = estimate(run({ a: { monomers: [pmma(1), tbma(1)] }, b: { monomers: [{ name: 'PHS', smiles: PHS }, { smiles: PS }] }, tgA }));
    const vA = vmOf(VW.PMMA, K_TABLE.PMMA) + vmOf(VW.TBMA, K_TABLE.TBMA);
    const vfA = vfOf(VW.PMMA, K_TABLE.PMMA) + vfOf(VW.TBMA, K_TABLE.TBMA);
    expect(r.deltaF).toBeCloseTo((vfOf(VW.PHS, K_TABLE.PHS) + vfOf(VW.PS, K_AROMATIC) - vfA) / vA, 9);
    expect(r.b.monomers[1].packingKSource).toBe('class');
    expect(r.warnings.some((w) => w.includes('不在同一結構家族'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('無法判斷'))).toBe(true);
  });

  it('B = A 再加上新單元（驗收範例的型式）：同一個堆積係數 k 時 FFV 相同，Δf = (1 − 1.3k) × Vω_新／Vω_A', () => {
    const r = estimate(run({ a: { monomers: [{ smiles: PS, packingK: 0.6 }] }, b: { monomers: [{ smiles: PS, packingK: 0.6 }, { smiles: PE, packingK: 0.6 }] }, tgA }));
    expect(r.a.ffv).toBeCloseTo(r.b.ffv as number, 12);
    expect(r.deltaF).toBeCloseTo((1 - 1.3 * 0.6) * (VW.PE / VW.PS), 9);
    expect(r.a.deltaAlpha).toBeCloseTo(0.55e-3 * 0.6, 12);
    expect(r.notes.some((n) => n.includes('視為在 A 之外增減單元'))).toBe(true);
  });

  it('均聚物（單項組成）：省略用量與用量 1 的結果完全相同，並與純計算函式一致', () => {
    const input = { a: { monomers: [{ name: 'PMMA', smiles: PMMA }] }, b: { monomers: [{ smiles: PS }] }, tgA };
    const implicit = run(input);
    const explicit = run({ a: { monomers: [pmma(1)] }, b: { monomers: [{ smiles: PS, amount: 1 }] }, tgA });
    expect(implicit).toEqual(explicit);
    const r = estimate(implicit);
    const pure = relativeTgFromVolumes({ a: [{ vomega: r.a.monomers[0].vomega as number, packingK: 0.66 }], b: [{ vomega: r.b.monomers[0].vomega as number, packingK: K_AROMATIC }], tgA });
    expect(r.deltaF).toBe(pure.deltaF);
    expect(r.a.deltaAlpha).toBe(pure.deltaAlphaA);
    expect(pure.tgB.status === 'ok' && pure.tgB.tgK).toBe(r.tgB.tgK);
  });

  it('有單體缺 VvdW（k 表材料沒有結構）：FFV 以莫耳加權近似顯示，Δf 與 Tg_B 不計算', () => {
    const r = done(run({ a: { monomers: [{ name: 'DABA-6FDA', amount: 1 }, { name: 'PABA-6FDA', amount: 3 }] }, b: { monomers: [{ name: 'DABA-6FDA' }, { name: 'PABA-6FDA' }] }, tgA }));
    expect(r.status).toBe('missing');
    expect(r.a.ffvBasis).toBe('moleWeighted');
    expect(r.a.ffv).toBeCloseTo(0.25 * (1 - 1.3 * 0.579) + 0.75 * (1 - 1.3 * 0.59), 12);
    expect(r.notes.some((n) => n.includes('莫耳加權近似'))).toBe(true);
    expect(r.deltaF).toBeNull();
    expect(r.tgB.status).toBe('unavailable');
    expect(r.missing.every((m) => m.what === 'VW')).toBe(true);
  });
});

describe('k／Tg 表的 Tg：A 的錨點可帶出；B 是表內材料且組成沒改時直接顯示，不估算', () => {
  it('A 的 Tg 由表帶出（範圍取中點並標示），使用者可覆寫', () => {
    const fromTable = estimate(run({ a: { monomers: [{ name: 'PHS', smiles: PHS }] }, b: { monomers: [{ smiles: PS }] } }));
    expect(fromTable.tgA).toMatchObject({ status: 'ok', tgC: 177.5, source: 'table', raw: '175–180' });
    if (fromTable.tgA.status === 'ok') expect(fromTable.tgA.labels).toContain('範圍中點');
    const overridden = estimate(run({ a: { monomers: [{ name: 'PHS', smiles: PHS }] }, b: { monomers: [{ smiles: PS }] }, tgA: { value: 160, unit: 'C' } }));
    expect(overridden.tgA).toMatchObject({ status: 'ok', source: 'user' });
    if (overridden.tgA.status === 'ok') expect(overridden.tgA.tgC).toBeCloseTo(160, 10);
    expect(overridden.tgB.tgC - fromTable.tgB.tgC).toBeCloseTo(160 - 177.5, 8);
  });

  it('A 的表內 Tg 空白或 A 不是表內的單一材料，又沒有輸入：回報請輸入，不猜、不輸出 Tg_B', () => {
    const blank = done(run({ a: { monomers: [{ name: 'PIM-1（SBI-based）', smiles: PS }] }, b: { monomers: [{ smiles: PE }] } }));
    expect(blank.tgA).toEqual({ status: 'missing', message: '表中無 Tg，請輸入' });
    expect(blank.tgB.status).toBe('unavailable');
    expect(blank.deltaF).not.toBeNull();
    const none = done(run({ a: { monomers: [pmma(1), tbma(1)] }, b: { monomers: [pmma(1), tbma(2)] } }));
    expect(none.tgA.status).toBe('missing');
    expect(none.tgB.status).toBe('unavailable');
  });

  it('B 是表內材料且組成沒改：直接顯示表內 Tg，不估算', () => {
    const r = done(run({ a: { monomers: [{ name: 'PMMA', smiles: PMMA }] }, b: { monomers: [{ name: 'Poly(tBMA)', smiles: TBMA }] } }));
    expect(r.tgB).toMatchObject({ status: 'table', material: 'Poly(tBMA)', tgC: 114.7, raw: '114.7' });
    if (r.tgB.status === 'table') expect(r.tgB.message).toContain('不做估算');
    // 沒有結構的表內材料：一樣顯示表內 Tg；FFV = 1 − 1.3k
    const noSmiles = done(run({ a: { monomers: [{ name: '6FDA-CARDO' }] }, b: { monomers: [{ name: '6FDA-CARDO(Br)' }] } }));
    expect(noSmiles.tgB).toMatchObject({ status: 'table', tgC: 407 });
    expect(noSmiles.a).toMatchObject({ ffvBasis: 'packingK' });
    expect(noSmiles.a.ffv).toBeCloseTo(1 - 1.3 * 0.628, 12);
    expect(noSmiles.a.deltaAlpha).toBeNull();
    expect(noSmiles.deltaF).toBeNull();
  });

  it('B 是表內材料但表中無 Tg：回報表中無 Tg，不以其他材料的 Tg 估算', () => {
    const r = done(run({ a: { monomers: [{ name: 'PMMA', smiles: PMMA }] }, b: { monomers: [{ name: 'Poly(maleic anhydride)', smiles: PS }] } }));
    expect(r.tgB.status).toBe('tableBlank');
    if (r.tgB.status === 'tableBlank') expect(r.tgB.message).toContain('表中無 Tg');
  });

  it('B 改了組成（表內材料的共聚）才估算', () => {
    const r = estimate(run({ a: { monomers: [{ name: 'PMMA', smiles: PMMA }] }, b: { monomers: [pmma(1), tbma(1)] } }));
    expect(r.tgA).toMatchObject({ status: 'ok', tgC: 117.5, source: 'table' });
    expect(r.deltaF).toBeCloseTo(vfOf(VW.TBMA, K_TABLE.TBMA) / vmOf(VW.PMMA, K_TABLE.PMMA), 9);
  });
});

describe('Fox 混合式的並列比較（重用任務 034 的 foxMix；與本法獨立）', () => {
  const tgA = { value: 110, unit: 'C' as const };
  it('各均聚物 Tg 由表帶出；結果另列，不影響本法的 Tg_B', () => {
    const r = estimate(run({ a: { monomers: [pmma(7), tbma(3)] }, b: { monomers: [pmma(5), tbma(5)] }, tgA }));
    expect(r.fox).toMatchObject({ status: 'ok', label: RELATIVE_TG_FOX_LABEL });
    expect(RELATIVE_TG_FOX_LABEL).toBe('比較用，與本法獨立');
    if (r.fox?.status !== 'ok') return;
    const mass = (s: string) => (computeVdwVolume(RDKit, s) as { formulaMass: number }).formulaMass;
    expect(r.fox.tgK).toBeCloseTo(foxMix([{ w: 5 * mass(PMMA), tgK: 117.5 + 273.15 }, { w: 5 * mass(TBMA), tgK: 114.7 + 273.15 }]), 9);
    expect(r.fox.components.map((c) => c.tgSource)).toEqual(['table', 'table']);
    expect(r.fox.tgK).not.toBeCloseTo(r.tgB.tgK, 3);
  });
  it('缺均聚物 Tg：回報請輸入；使用者輸入後可算；單一項的 B 沒有 Fox 比較', () => {
    const b = { monomers: [pmma(1), { smiles: PS, amount: 1 }] };
    const missing = done(run({ a: { monomers: [pmma(1)] }, b, tgA }));
    expect(missing.fox).toMatchObject({ status: 'unavailable', label: RELATIVE_TG_FOX_LABEL });
    const given = done(run({ a: { monomers: [pmma(1)] }, b: { monomers: [pmma(1), { smiles: PS, amount: 1, homopolymerTg: { value: 100, unit: 'C' } }] }, tgA }));
    expect(given.fox?.status).toBe('ok');
    expect(given.tgB).toEqual(missing.tgB);
    expect(done(run({ a: { monomers: [pmma(1)] }, b: { monomers: [{ smiles: PS }] }, tgA })).fox).toBeNull();
  });
});

describe('批次輸出用：單一組成的 VvdW、Vm、FFV、Δα', () => {
  it('回傳各單體的來源與 FFV；缺 VW 時列出缺什麼', () => {
    const r = evaluateRelativeTgComposition(RDKit, { monomers: [{ smiles: PS }] });
    if (r.status !== 'ok') throw new Error('應可計算');
    expect(r.side.ffv).toBeCloseTo(0.37 / 1.67, 12);
    expect(r.side.deltaAlpha).toBeCloseTo(0.55e-3 * K_AROMATIC, 12);
    expect(r.missing).toEqual([]);
    const bad = evaluateRelativeTgComposition(RDKit, { monomers: [{ smiles: PGMA }] });
    expect(bad.status === 'ok' && bad.missing[0].what).toBe('VW');
    expect(evaluateRelativeTgComposition(RDKit, { monomers: [] }).status).toBe('rejected');
  });
});
