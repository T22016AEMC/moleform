// 熱膨脹係數 CTE 的測試（任務 036）：書中 Table 4.12 的 E_g、E_l 計算值（書頁 92–95，看圖讀取）、Example 4.2（書頁 101）、
// 書頁 99 的 α_l、α_g、式 4.27 的手算、小分子「不適用」、缺 VW、缺 Tg。
// 手算與程式的比對是檢查「程式有沒有照公式算對」（D17）；與書中計算值的差距照實記錄，不調整數值。
import { beforeAll, describe, expect, it } from 'vitest';
import { CTE_COEFFICIENTS, CTE_SMALL_MOLECULE, computeCte, cteFromVw, glassAlphaFromTg, type CteResult } from '../../src/core/properties/cte';
import { computeVdwVolume } from '../../src/core/properties/vanDerWaalsVolume';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const ok = (r: CteResult) => {
  if (r.status !== 'ok') throw new Error(`預期可計算，實際 ${r.status}：${JSON.stringify(r)}`);
  return r;
};

// Table 4.12（書頁 92–95）：VW（cm³/mol）、E_g calc.、E_l calc.（單位 10⁻⁴ cm³/mol/K，書中印刷為整數）
// vwSource：本程式（Table 4.2 基團）算出的 VW 與 Table 4.12 的 VW 是否一致（差 ≤ 0.05）；不一致者另行記錄原因，不調整數值。
interface BookCase {
  name: string;
  smiles: string;
  kind: string;
  vw: number;
  egCalc: number;
  elCalc: number;
  vwConsistent: boolean;
}
const BOOK_CASES: BookCase[] = [
  { name: '聚乙烯', smiles: '[*:1]CC[*:2]', kind: '烯烴', vw: 20.46, egCalc: 92, elCalc: 205, vwConsistent: true },
  { name: '聚丙烯', smiles: '[*:1]CC([*:2])C', kind: '烯烴', vw: 30.68, egCalc: 138, elCalc: 307, vwConsistent: true },
  { name: '聚異丁烯', smiles: '[*:1]CC(C)(C)[*:2]', kind: '烯烴', vw: 40.9, egCalc: 184, elCalc: 409, vwConsistent: true },
  { name: '聚苯乙烯', smiles: '[*:1]CC([*:2])c1ccccc1', kind: '芳香環', vw: 62.85, egCalc: 283, elCalc: 629, vwConsistent: true },
  { name: '聚氯乙烯', smiles: '[*:1]CC(Cl)[*:2]', kind: '含氯', vw: 29.23, egCalc: 132, elCalc: 292, vwConsistent: true },
  { name: '聚對苯二甲酸乙二酯', smiles: '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]', kind: '芳香環＋酯基', vw: 94.18, egCalc: 424, elCalc: 942, vwConsistent: true },
  // 以下三個的 VW 與 Table 4.12 不同：PVAc、PMMA 因 Table 4.2 組合基團大於原子基團相加（KNOWN_ISSUES M18，使用者 2026-10-30 決定照印值）；
  // 尼龍 6 因 Table 4.2 的 –CONH– 為括號值 13（書中標暫定），Table 4.12 的 VW 70.71 與 Table 4.7 的 64.2 不一致（KNOWN_ISSUES M32）。
  { name: '聚乙酸乙烯酯', smiles: '[*:1]CC([*:2])OC(C)=O', kind: '酯基', vw: 45.88, egCalc: 206, elCalc: 459, vwConsistent: false },
  { name: '聚甲基丙烯酸甲酯', smiles: '[*:1]CC([*:2])(C)C(=O)OC', kind: '酯基', vw: 56.1, egCalc: 252, elCalc: 561, vwConsistent: false },
  { name: '尼龍 6', smiles: '[*:1]NC(=O)CCCCC[*:2]', kind: '含氮', vw: 70.71, egCalc: 318, elCalc: 707, vwConsistent: false },
];

describe('書中公式（手算）', () => {
  it('係數照書：E_l = 1.00e-3·VW、E_g = 0.45e-3·VW、V_r = 1.60·VW、V_g = [1.43 + 0.55e-3·Tg]·VW', () => {
    expect(CTE_COEFFICIENTS).toEqual({ el: 1e-3, eg: 0.45e-3, vr298: 1.6, vg298Simple: 1.6, vg298Base: 1.43, vg298PerTg: 0.55e-3 });
  });

  it('VW = 100 的手算：E_l = 0.1、E_g = 0.045、α_l = 0.1/160、α_g = 0.045/160、β = α/3', () => {
    const { rubbery, glassy } = cteFromVw({ vw: 100, mass: 200 });
    expect(rubbery.molar).toBeCloseTo(0.1, 12);
    expect(glassy.molar).toBeCloseTo(0.045, 12);
    expect(rubbery.alpha).toBeCloseTo(0.1 / 160, 12);
    expect(glassy.alpha).toBeCloseTo(0.045 / 160, 12);
    expect(rubbery.beta).toBeCloseTo(0.1 / 160 / 3, 12);
    expect(rubbery.specific).toBeCloseTo(0.1 / 200, 12);
    expect(glassy.specific).toBeCloseTo(0.045 / 200, 12);
  });

  it('書頁 99：α_l(298) = 6.25e-4、α_g(298) = 2.81e-4 K⁻¹（與 VW 大小無關）', () => {
    for (const vw of [20.46, 94.18, 136.21]) {
      const { rubbery, glassy } = cteFromVw({ vw, mass: null });
      expect(rubbery.alpha).toBeCloseTo(6.25e-4, 10);
      expect(glassy.alpha).toBeCloseTo(2.8125e-4, 10);
      expect(Number(glassy.alpha.toExponential(2))).toBe(2.81e-4);
    }
  });

  it('式 4.27（書頁 96 的 C(Tg)）：Tg = 300、400、500 K 時 V_g(298)/VW = 1.595、1.650、1.705', () => {
    expect(glassAlphaFromTg(1, 300).vg298).toBeCloseTo(1.595, 10);
    expect(glassAlphaFromTg(1, 400).vg298).toBeCloseTo(1.65, 10);
    expect(glassAlphaFromTg(1, 500).vg298).toBeCloseTo(1.705, 10);
  });

  it('式 4.27（書頁 95）：PMMA（Tg = 387 K）與 PS（Tg = 373 K）的 V_g(298)/VW = 1.643、1.635', () => {
    expect(Number(glassAlphaFromTg(1, 387).vg298.toFixed(3))).toBe(1.643);
    expect(Number(glassAlphaFromTg(1, 373).vg298.toFixed(3))).toBe(1.635);
  });

  it('Example 4.2（書頁 101）：PET，VW = 94.18、M = 192.2：E_g = 4.2e-2、E_l = 9.4e-2、e_l = 4.9e-4、e_g = 2.2e-4', () => {
    const { rubbery, glassy } = cteFromVw({ vw: 94.18, mass: 192.2 });
    expect(Number(glassy.molar.toFixed(3))).toBeCloseTo(0.042, 10);
    expect(Number(rubbery.molar.toFixed(3))).toBeCloseTo(0.094, 10);
    expect(Number((rubbery.specific! * 1e4).toFixed(1))).toBe(4.9);
    expect(Number((glassy.specific! * 1e4).toFixed(1))).toBe(2.2);
  });
});

describe('書中 Table 4.12 的 E_g、E_l 計算值', () => {
  it('涵蓋聚乙烯類、含芳香環、含酯基、含氮各至少一個；VW 一致者至少 6 個', () => {
    const kinds = BOOK_CASES.map((c) => c.kind).join(' ');
    for (const k of ['烯烴', '芳香環', '酯基', '含氮']) expect(kinds).toContain(k);
    expect(BOOK_CASES.filter((c) => c.vwConsistent).length).toBeGreaterThanOrEqual(6);
  });

  for (const c of BOOK_CASES) {
    it(`${c.name}：用書中 VW 手算，E_g、E_l 與書中計算值（${c.egCalc}、${c.elCalc} × 10⁻⁴）一致到捨入（0.5）`, () => {
      expect(Math.abs(0.45e-3 * c.vw * 1e4 - c.egCalc)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(1.0e-3 * c.vw * 1e4 - c.elCalc)).toBeLessThanOrEqual(0.5);
      const { rubbery, glassy } = cteFromVw({ vw: c.vw, mass: null });
      expect(Math.abs(glassy.molar * 1e4 - c.egCalc)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(rubbery.molar * 1e4 - c.elCalc)).toBeLessThanOrEqual(0.5);
    });
    if (c.vwConsistent) {
      it(`${c.name}：由 SMILES 算，VW 差 ≤ 0.05，E_g、E_l 與書中計算值差 ≤ 1 個印刷單位（10⁻⁴）`, () => {
        const v = computeVdwVolume(RDKit, c.smiles);
        expect(v.status).toBe('ok');
        if (v.status === 'ok') expect(Math.abs(v.vw - c.vw)).toBeLessThanOrEqual(0.05);
        const r = ok(computeCte(RDKit, c.smiles));
        expect(Math.abs(r.glassy.molar * 1e4 - c.egCalc)).toBeLessThanOrEqual(1);
        expect(Math.abs(r.rubbery.molar * 1e4 - c.elCalc)).toBeLessThanOrEqual(1);
      });
    } else {
      it(`${c.name}：VW 與書中 Table 4.12 不同（已知問題），E 的差完全來自 VW：E 程式值 = 係數 × 程式 VW`, () => {
        const v = computeVdwVolume(RDKit, c.smiles);
        expect(v.status).toBe('ok');
        if (v.status !== 'ok') return;
        expect(Math.abs(v.vw - c.vw)).toBeGreaterThan(0.05);
        const r = ok(computeCte(RDKit, c.smiles));
        expect(r.glassy.molar).toBeCloseTo(0.45e-3 * v.vw, 12);
        expect(r.rubbery.molar).toBeCloseTo(1.0e-3 * v.vw, 12);
      });
    }
  }
});

describe('computeCte 的回傳', () => {
  it('聚苯乙烯：玻璃態與橡膠態、兩種 α_g、β = α/3、書中式號與出處', () => {
    const r = ok(computeCte(RDKit, '[*:1]CC([*:2])c1ccccc1'));
    expect(r.rubbery.alpha).toBeCloseTo(6.25e-4, 10);
    expect(r.glassy.alpha).toBeCloseTo(2.8125e-4, 10);
    expect(r.rubbery.beta).toBeCloseTo(r.rubbery.alpha / 3, 12);
    expect(r.glassyFromTg.status).toBe('ok');
    if (r.glassyFromTg.status === 'ok') {
      expect(r.glassyFromTg.alpha).toBeCloseTo((0.45e-3 * r.vw) / ((1.43 + 0.55e-3 * r.glassyFromTg.tgK) * r.vw), 12);
      expect(r.glassyFromTg.alpha).toBeLessThan(r.glassy.alpha);
    }
    expect(r.model).toContain('式 4.17');
    expect(r.model).toContain('式 4.27');
    expect(r.sources.length).toBeGreaterThan(0);
  });

  it('玻璃態 E_g 小於橡膠態 E_l（比值 0.45）', () => {
    const r = ok(computeCte(RDKit, '[*:1]CC([*:2])c1ccccc1'));
    expect(r.glassy.molar / r.rubbery.molar).toBeCloseTo(0.45, 12);
  });
});

describe('小分子、缺 VW、缺 Tg、無效輸入', () => {
  it('不含連接點的小分子回傳「不適用（小分子，D56）」', () => {
    for (const s of ['CCO', 'c1ccccc1', 'CC(C)(c1ccccc1)c1ccccc1']) {
      const r = computeCte(RDKit, s);
      expect(r.status).toBe('notApplicable');
      if (r.status === 'notApplicable') expect(r.message).toBe(CTE_SMALL_MOLECULE);
    }
    expect(CTE_SMALL_MOLECULE).toBe('不適用（小分子，D56）');
  });

  it('VW 配不到基團：回報缺 VW 與缺基團原子，不計算', () => {
    const r = computeCte(RDKit, '[*:1]C[Se]C[*:2]');
    expect(r.status).toBe('missing');
    if (r.status === 'missing') {
      expect(r.missingInput).toBe('VW');
      expect(r.missing.length).toBeGreaterThan(0);
      expect(r.message).toContain('缺 VW');
    }
  });

  it('空字串與無法解析的 SMILES 回傳 invalid', () => {
    expect(computeCte(RDKit, '').status).toBe('invalid');
    expect(computeCte(RDKit, 'C(').status).toBe('invalid');
  });

  it('VW 可算但 Tg 缺基團（聚丙烯腈）：E 與 α（式 4.8b）照算，式 4.27 回報缺 Tg', () => {
    const r = ok(computeCte(RDKit, MISSING_TG_SMILES));
    expect(r.glassy.molar).toBeGreaterThan(0);
    expect(r.glassyFromTg.status).toBe('missing');
    if (r.glassyFromTg.status === 'missing') expect(r.glassyFromTg.message).toContain('缺 Tg');
  });
});

const MISSING_TG_SMILES = '[*:1]CC([*:2])C#N';
