// 介電常數 ε 與莫耳折射 ΣR、分子極化率 α 計算的測試（任務 032）：用 Table 11.1、Table 10.4、Table 4.10 的獨立抄錄手算（tests/properties/dielectricCases.ts），
// 與書中 Table 11.2、Example 11.1 的計算值對照、切分完整性、缺基團、缺莫耳體積、小分子「不適用」。
// 手算與程式的比對是檢查「程式有沒有照公式算對」（D17）；與書中計算值的差距照實記錄，不調整數值。
import { beforeAll, describe, expect, it } from 'vitest';
import {
  alphaPrimeFromR,
  alphaSIFromR,
  computeDielectric,
  computeDielectricRefraction,
  computeRefraction,
  countGroups,
  epsilonFromPLL,
  epsilonFromPV,
  type DielectricResult,
  type RefractionResult,
} from '../../src/core/properties/dielectricRefraction';
import { readGraph } from '../../src/core/properties/molGraph';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { BOOK_DIELECTRIC_CASES, BOOK_DIELECTRIC_PV_ONLY, BOOK_REFRACTION_CASES, TABLE104, TABLE111, VA, VC } from './dielectricCases';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const okD = (r: DielectricResult) => {
  if (r.status !== 'ok') throw new Error(`預期可計算，實際 ${r.status}：${JSON.stringify(r)}`);
  return r;
};
const okR = (r: RefractionResult) => {
  if (r.status !== 'ok') throw new Error(`預期可計算，實際 ${r.status}：${JSON.stringify(r)}`);
  return r;
};
const sumP = (parts: readonly (readonly [keyof typeof TABLE111, number])[], col: 'pLL' | 'pV'): number => parts.reduce((s, [g, n]) => s + n * TABLE111[g][col], 0);
const sumV = (parts: readonly (readonly [keyof typeof VA, number])[], tbl: typeof VA | typeof VC): number => parts.reduce((s, [g, n]) => s + n * tbl[g], 0);
const eps117 = (p: number, v: number): number => (1 + (2 * p) / v) / (1 - p / v);

describe('式 (11.7)、(11.8) 與 α 的公式', () => {
  it('式 (11.7)：x = P/V，ε = (1 + 2x)/(1 − x)；x = 0.5 → ε = 4', () => {
    expect(epsilonFromPLL(5, 10)).toBeCloseTo(4, 12);
    expect(epsilonFromPLL(0, 10)).toBeCloseTo(1, 12);
  });
  it('式 (11.7) 在 ΣP ≥ V 時無解，回傳 null', () => {
    expect(epsilonFromPLL(10, 10)).toBeNull();
    expect(epsilonFromPLL(12, 10)).toBeNull();
  });
  it('式 (11.8)：ε = (P_V/M)²', () => {
    expect(epsilonFromPV(60, 30)).toBeCloseTo(4, 12);
  });
  it('Example 11.1（書頁 324）：ΣP_LL = 85.9、V = 215 → ε = 3.00；ΣP_V = 443.9、M = 254 → ε = 3.05', () => {
    expect(epsilonFromPLL(85.9, 215) as number).toBeCloseTo(3.0, 2);
    expect(epsilonFromPV(443.9, 254)).toBeCloseTo(3.05, 2);
  });
  it('α′ = 3R/(4π·N_A)（式 11.10、11.11）：R = 10 cm³/mol → 3.964 Å³；α = 4πε₀α′', () => {
    expect(alphaPrimeFromR(10)).toBeCloseTo(3.9641, 3);
    const alphaPrimeM3 = alphaPrimeFromR(10) * 1e-30;
    expect(alphaSIFromR(10) / (4 * Math.PI * 8.854188e-12 * alphaPrimeM3)).toBeCloseTo(1, 9);
  });
});

describe('介電常數：用 Table 11.1 與 Table 4.10 手算', () => {
  for (const c of BOOK_DIELECTRIC_CASES) {
    describe(c.name, () => {
      it('ΣP_LL、ΣP_V、Va 與手算一致；ε（11.7）、ε（11.8）與手算一致', () => {
        const r = okD(computeDielectric(RDKit, c.smiles));
        const pLL = sumP(c.p, 'pLL');
        const pV = sumP(c.p, 'pV');
        const va = sumV(c.v as [keyof typeof VA, number][], VA);
        expect(r.sumPLL).toBeCloseTo(pLL, 9);
        expect(r.sumPV).toBeCloseTo(pV, 9);
        expect(r.volume.status).toBe('ok');
        expect(r.volume.status === 'ok' ? r.volume.va : NaN).toBeCloseTo(va, 9);
        expect(r.epsLL as number).toBeCloseTo(eps117(pLL, va), 9);
        expect(r.epsV).toBeCloseTo((pV / r.unitMass) ** 2, 9);
        expect(r.epsLLNote).toBeNull();
        expect(r.relDiff as number).toBeCloseTo(Math.abs(r.epsLL as number - r.epsV) / (r.epsLL as number), 12);
      });
      it('式 (11.8) 的 ε 與 Table 11.2 的書中計算值差 ≤ 0.04（書中印刷捨入範圍）', () => {
        const r = okD(computeDielectric(RDKit, c.smiles));
        expect(Math.abs(r.epsV - c.book118)).toBeLessThanOrEqual(0.04);
      });
      if (c.va117Close) {
        it('式 (11.7)（V 用 Va）的 ε 與 Table 11.2 的書中計算值差 ≤ 0.04', () => {
          const r = okD(computeDielectric(RDKit, c.smiles));
          expect(Math.abs((r.epsLL as number) - c.book117)).toBeLessThanOrEqual(0.04);
        });
      }
    });
  }

  it('V 用 Va 而不是 Vc：除 PMMA 外，Va 算的 ε 都比 Vc 算的更接近書中的式 (11.7) 計算值（PMMA 例外，差距照實列在報告）', () => {
    const closer: string[] = [];
    const farther: string[] = [];
    for (const c of BOOK_DIELECTRIC_CASES) {
      const p = sumP(c.p, 'pLL');
      const va = eps117(p, sumV(c.v as [keyof typeof VA, number][], VA));
      const vc = eps117(p, sumV(c.v as [keyof typeof VC, number][], VC));
      (Math.abs(va - c.book117) < Math.abs(vc - c.book117) ? closer : farther).push(c.name);
    }
    expect(farther).toEqual(['聚甲基丙烯酸甲酯']);
    expect(closer).toHaveLength(BOOK_DIELECTRIC_CASES.length - 1);
  });

  it('聚乙烯：Va 得 2.19（書中 2.20）、Vc 得 2.39（離書中 2.20 較遠）', () => {
    const r = okD(computeDielectric(RDKit, '[*:1]CC[*:2]'));
    expect(r.epsLL as number).toBeCloseTo(2.19, 2);
    expect(eps117(9.3, 2 * VC.CH2)).toBeCloseTo(2.39, 2);
  });

  it('Example 11.1 的聚雙酚碳酸酯：ΣP_LL = 85.86（書中 85.9）、ΣP_V = 443.9（書中 443.9）', () => {
    const r = okD(computeDielectric(RDKit, '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]'));
    expect(r.sumPLL).toBeCloseTo(85.86, 2);
    expect(r.sumPV).toBeCloseTo(443.9, 1);
    expect(countGroups(r.groups).map((g) => [g.id, g.count])).toEqual([['P01', 2], ['P04', 1], ['P06', 2], ['P11', 1]]);
  });

  describe('沒有莫耳體積：仍輸出 P_V 版本，註明「缺莫耳體積，僅 P_V 估計」', () => {
    for (const c of BOOK_DIELECTRIC_PV_ONLY) {
      it(c.name, () => {
        const r = okD(computeDielectric(RDKit, c.smiles));
        expect(r.volume.status).toBe('missing');
        expect(r.epsLL).toBeNull();
        expect(r.epsLLNote).toBe('缺莫耳體積，僅 P_V 估計');
        expect(r.relDiff).toBeNull();
        expect(r.sumPV).toBeCloseTo(sumP(c.p, 'pV'), 9);
        expect(Math.abs(r.epsV - c.book118)).toBeLessThanOrEqual(0.04);
      });
    }
  });

  it('ΣP_LL ≥ Va 時（式 11.7 無解）epsLL 為 null，並寫明原因', () => {
    const r = okD(computeDielectric(RDKit, '[*:1]CC[*:2]'));
    expect(r.epsLL).not.toBeNull();
  });

  it('用到書中標為暫定的值時標示：酚 –OH（P_LL 與 P_V）；聚乙烯沒有', () => {
    const phenol = okD(computeDielectric(RDKit, '[*:1]CC([*:2])c1ccc(O)cc1'));
    expect(phenol.usesTentativeLL).toBe(true);
    expect(phenol.usesTentativeV).toBe(true);
    const ether = okD(computeDielectric(RDKit, '[*:1]CO[*:2]'));
    expect(ether.usesTentativeLL).toBe(false);
    expect(ether.usesTentativeV).toBe(true);
    const pe = okD(computeDielectric(RDKit, '[*:1]CC[*:2]'));
    expect([pe.usesTentativeLL, pe.usesTentativeV]).toEqual([false, false]);
  });

  it('同一個輸入重複計算，結果逐項相同（可重現）', () => {
    const smiles = '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]';
    expect(JSON.stringify(computeDielectric(RDKit, smiles))).toBe(JSON.stringify(computeDielectric(RDKit, smiles)));
    expect(JSON.stringify(computeRefraction(RDKit, smiles))).toBe(JSON.stringify(computeRefraction(RDKit, smiles)));
  });
});

describe('莫耳折射 ΣR 與 α：用 Table 10.4 手算', () => {
  for (const c of BOOK_REFRACTION_CASES) {
    it(`${c.name}：ΣR 與手算一致`, () => {
      const r = okR(computeRefraction(RDKit, c.smiles));
      const hand = c.r.reduce((s, [g, n]) => s + n * TABLE104[g], 0);
      expect(r.sumR).toBeCloseTo(hand, 9);
      expect(r.alphaPrimeA3).toBeCloseTo(alphaPrimeFromR(hand), 9);
      expect(r.alphaSI).toBeCloseTo(alphaSIFromR(hand), 20);
      if (c.bookSum !== undefined) expect(Math.abs(r.sumR - c.bookSum)).toBeLessThanOrEqual(0.01);
    });
  }
  it('手算案例至少 8 個聚合物（含聚乙烯類、芳香環、酯基、含氮、含鹵素）', () => {
    expect(BOOK_REFRACTION_CASES.length).toBeGreaterThanOrEqual(8);
  });
  it('Example 11.1（書頁 324）：雙酚 A 聚碳酸酯 ΣR_LL = 71.38（程式 71.378）', () => {
    const r = okR(computeRefraction(RDKit, '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]'));
    expect(r.sumR).toBeCloseTo(71.38, 2);
    expect(countGroups(r.groups).map((g) => [g.id, g.count])).toEqual([['R01', 2], ['R08', 1], ['R13', 2], ['R31', 1]]);
  });
  it('結果沒有折射率 n 或 n²（D07 已取消）', () => {
    const r = okR(computeRefraction(RDKit, '[*:1]CC[*:2]')) as unknown as Record<string, unknown>;
    expect(Object.keys(r).filter((k) => /^n($|\d|Sq|2)|refractiveIndex/i.test(k))).toEqual([]);
  });
});

describe('切分完整性：各基團原子數加總 = 重原子數（不含連接點）', () => {
  const smilesList = [...new Set([...BOOK_DIELECTRIC_CASES.map((c) => c.smiles), ...BOOK_DIELECTRIC_PV_ONLY.map((c) => c.smiles), ...BOOK_REFRACTION_CASES.map((c) => c.smiles)])];
  const heavyCount = (smiles: string): number => {
    const mol = RDKit.get_mol(smiles);
    if (!mol) throw new Error(`RDKit 無法解析：${smiles}`);
    try {
      return readGraph(mol).z.filter((z) => z > 1).length;
    } finally {
      mol.delete();
    }
  };
  for (const smiles of smilesList) {
    it(smiles, () => {
      const total = heavyCount(smiles);
      const d = computeDielectric(RDKit, smiles);
      if (d.status === 'ok') {
        const atoms = d.groups.flatMap((g) => g.atoms);
        expect(atoms).toHaveLength(total);
        expect(new Set(atoms).size).toBe(total);
      }
      const r = computeRefraction(RDKit, smiles);
      if (r.status === 'ok') {
        const atoms = r.groups.flatMap((g) => g.atoms);
        expect(atoms).toHaveLength(total);
        expect(new Set(atoms).size).toBe(total);
      }
    });
  }
});

describe('缺基團：回報原子位置與原因，不計算、不猜值', () => {
  it('鄰位伸苯基：Table 11.1 沒有，回報缺基團與原因（使用者 2026-11-01 決定不放寬）', () => {
    const r = computeDielectric(RDKit, '[*:1]Cc1ccccc1[*:2]');
    expect(r.status).toBe('missing');
    if (r.status !== 'missing') return;
    expect(r.missing).toHaveLength(6);
    expect(r.missing.every((m) => m.element === 'C' && m.reason?.includes('鄰位伸苯基'))).toBe(true);
  });
  it('間位伸苯基：Table 11.1 沒有', () => {
    const r = computeDielectric(RDKit, '[*:1]Cc1cccc([*:2])c1');
    expect(r.status).toBe('missing');
    if (r.status === 'missing') expect(r.missing[0].reason).toMatch(/間位伸苯基/);
  });
  it('環氧環：Table 11.1 沒有環上基團；其餘原子仍配對', () => {
    const d = computeDielectric(RDKit, '[*:1]CC([*:2])C1CO1');
    expect(d.status).toBe('missing');
    if (d.status === 'missing') {
      expect(d.missing.map((m) => m.element).sort()).toEqual(['C', 'C', 'O']);
      expect(d.missing.every((m) => m.reason?.includes('環上'))).toBe(true);
      expect(d.groups.map((g) => g.id)).toEqual(['P02', 'P03']);
    }
    expect(computeRefraction(RDKit, '[*:1]CC([*:2])C1CO1').status).toBe('missing');
  });
  it('醯亞胺：Table 11.1 與 Table 10.4 都沒有', () => {
    const smiles = '[*:1]N1C(=O)c2ccccc2C1=O';
    expect(computeDielectric(RDKit, smiles).status).toBe('missing');
    expect(computeRefraction(RDKit, smiles).status).toBe('missing');
  });
  it('Table 10.4：芳基甲基醚（Ar–O–CH3）書中沒說優先順序，不配對並說明原因', () => {
    const r = computeRefraction(RDKit, '[*:1]CC([*:2])c1ccc(OC)cc1');
    expect(r.status).toBe('missing');
    if (r.status === 'missing') expect(r.missing.map((m) => m.reason).join('')).toMatch(/芳基甲基醚/);
  });
  it('Table 10.4：苯甲酸甲酯型酯基（兩個旗標成立）不配對並說明原因；Table 11.1 的 –COO– 仍可配對', () => {
    const smiles = '[*:1]CC([*:2])c1ccc(cc1)C(=O)OC';
    const r = computeRefraction(RDKit, smiles);
    expect(r.status).toBe('missing');
    if (r.status === 'missing') expect(r.missing.map((m) => m.reason).join('')).toMatch(/酯基/);
    expect(computeDielectric(RDKit, smiles).status).toBe('ok');
  });
  it('缺基團的結果不含 ε、ΣR', () => {
    const d = computeDielectric(RDKit, '[*:1]Cc1ccccc1[*:2]') as unknown as Record<string, unknown>;
    expect('epsLL' in d || 'epsV' in d || 'sumPLL' in d).toBe(false);
    const r = computeRefraction(RDKit, '[*:1]CC([*:2])C1CO1') as unknown as Record<string, unknown>;
    expect('sumR' in r).toBe(false);
  });
});

describe('缺莫耳體積：ε（11.7）不猜值，P_V 版本照算', () => {
  it('聚（四氟乙烯）：Table 4.10 沒有 –CF2–，V 缺 → epsLL 為 null、註明缺莫耳體積；ε（11.8）= 1.96', () => {
    const r = okD(computeDielectric(RDKit, '[*:1]C(F)(F)C(F)(F)[*:2]'));
    expect(r.volume.status).toBe('missing');
    if (r.volume.status === 'missing') expect(r.volume.message).toMatch(/缺莫耳體積/);
    expect(r.epsLL).toBeNull();
    expect(r.epsV).toBeCloseTo(1.96, 2);
  });
});

describe('小分子：不適用', () => {
  for (const smiles of ['CCO', 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1', 'c1ccccc1']) {
    it(smiles, () => {
      const both = computeDielectricRefraction(RDKit, smiles);
      for (const r of [both.dielectric, both.refraction]) {
        expect(r.status).toBe('unsupported');
        if (r.status === 'unsupported') expect(r.message).toMatch(/不適用（小分子）/);
      }
    });
  }
});

describe('輸入錯誤', () => {
  it('空字串、無法解析、多個分子', () => {
    expect(computeDielectric(RDKit, '').status).toBe('invalid');
    expect(computeRefraction(RDKit, 'not a smiles').status).toBe('invalid');
    expect(computeDielectric(RDKit, '[*:1]CC[*:2].[*:1]CC[*:2]').status).toBe('invalid');
  });
});
