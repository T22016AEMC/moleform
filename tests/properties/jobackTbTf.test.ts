// Joback 沸點與熔點計算的測試（任務 027）：丙酮、論文的對二氯苯例題、用表 III 手算的化合物、切分完整性、缺基團、聚合物單元。
// 手算值用 tests/properties/jobackCases.ts 的 TABLE3（表 III 書頁 235–236 的獨立抄錄）逐項相加，式 (2)：Tb = 198.2 + Σ、式 (3)：Tf = 122.5 + Σ。
import { beforeAll, describe, expect, it } from 'vitest';
import {
  JOBACK_DISCLAIMER,
  JOBACK_PAPER_LIMITS,
  computeJoback,
  countJobackGroups,
  orderJobackGroups,
  type JobackResult,
} from '../../src/core/properties/jobackTbTf';
import { JOBACK_GROUPS } from '../../src/core/data/jobackGroups';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { JOBACK_GROUP_CASES, TABLE3 } from './jobackCases';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const ok = (r: JobackResult) => {
  if (r.status !== 'ok') throw new Error(`預期可計算，實際 ${r.status}：${JSON.stringify(r)}`);
  return r;
};

/** 依表 III 抄錄的貢獻值逐項相加：[基團, 個數] */
function handCalc(parts: [keyof typeof TABLE3, number][]): { tb: number; tf: number | null } {
  let tb = 198.2;
  let tf: number | null = 122.5;
  for (const [g, n] of parts) {
    tb += n * TABLE3[g].tb;
    const f = TABLE3[g].tf;
    tf = tf === null || f === null ? null : tf + n * f;
  }
  return { tb, tf };
}

describe('丙酮與論文的對二氯苯例題', () => {
  it('丙酮：Tb 322.11 K、Tf 173.5 K（2×CH3 + >C=O 非環）', () => {
    const r = ok(computeJoback(RDKit, 'CC(C)=O'));
    expect(r.tbK).toBeCloseTo(322.11, 6);
    expect(r.tfK).toBeCloseTo(173.5, 6);
    expect(r.groups.map((g) => g.id).sort()).toEqual(['J01', 'J01', 'J24']);
    expect(r.sumTb).toBeCloseTo(23.58 * 2 + 76.75, 6);
  });

  it('對二氯苯（論文表 IV、V，書頁 239）：ΣTb = 245.20、ΣTf = 133.66；Tb = 443.4 K；Tf 與論文印的 256 K 相差 0.16（論文只印整數）', () => {
    const r = ok(computeJoback(RDKit, 'Clc1ccc(Cl)cc1'));
    // 表 IV 的加總（論文給的中間值），差 ≤ 0.1 K
    expect(Math.abs(r.sumTb - 245.2)).toBeLessThanOrEqual(0.1);
    expect(Math.abs((r.sumTf as number) - 133.66)).toBeLessThanOrEqual(0.1);
    // 表 V 的估算值：Tb 443.4 K（印到小數一位）、Tf 256 K（只印整數，捨入範圍 ±0.5）
    expect(Math.abs(r.tbK - 443.4)).toBeLessThanOrEqual(0.1);
    expect(Math.abs((r.tfK as number) - 256)).toBeLessThanOrEqual(0.5);
    expect(r.groups.map((g) => g.id).sort()).toEqual(['J14', 'J14', 'J14', 'J14', 'J15', 'J15', 'J17', 'J17']);
  });
});

describe('用表 III 手算的化合物（程式結果與手算相差 ≤ 0.1 K）', () => {
  const cases: { name: string; smiles: string; parts: [keyof typeof TABLE3, number][] }[] = [
    { name: '正己烷（脂肪烴）', smiles: 'CCCCCC', parts: [['CH3', 2], ['CH2', 4]] },
    { name: '異丁烷（脂肪烴，>CH–）', smiles: 'CC(C)C', parts: [['CH3', 3], ['CH', 1]] },
    { name: '乙醇（醇羥基）', smiles: 'CCO', parts: [['CH3', 1], ['CH2', 1], ['OHalc', 1]] },
    { name: '苯酚（酚羥基、芳香環）', smiles: 'Oc1ccccc1', parts: [['OHphenol', 1], ['ringCH', 5], ['ringC', 1]] },
    { name: '甲苯（芳香環）', smiles: 'Cc1ccccc1', parts: [['CH3', 1], ['ringCH', 5], ['ringC', 1]] },
    { name: '環己烷（環狀）', smiles: 'C1CCCCC1', parts: [['ringCH2', 6]] },
    { name: '吡啶（環內 –N=）', smiles: 'c1ccncc1', parts: [['ringCH', 5], ['ringN', 1]] },
    { name: '乙酸（–COOH）', smiles: 'CC(=O)O', parts: [['CH3', 1], ['COOH', 1]] },
    { name: '乙酸乙酯（–COO–）', smiles: 'CCOC(=O)C', parts: [['CH3', 2], ['CH2', 1], ['COO', 1]] },
    { name: '乙腈（–CN）', smiles: 'CC#N', parts: [['CH3', 1], ['CN', 1]] },
    { name: '硝基甲烷（–NO2）', smiles: 'C[N+](=O)[O-]', parts: [['CH3', 1], ['NO2', 1]] },
  ];
  for (const c of cases) {
    it(`${c.name}：${c.smiles}`, () => {
      const r = ok(computeJoback(RDKit, c.smiles));
      const h = handCalc(c.parts);
      expect(Math.abs(r.tbK - h.tb), `Tb 程式 ${r.tbK}、手算 ${h.tb}`).toBeLessThanOrEqual(0.1);
      expect(Math.abs((r.tfK as number) - (h.tf as number)), `Tf 程式 ${r.tfK}、手算 ${h.tf}`).toBeLessThanOrEqual(0.1);
    });
  }

  it('手算數值本身（報告對照表用）', () => {
    const v = (parts: [keyof typeof TABLE3, number][]) => {
      const h = handCalc(parts);
      return [Number(h.tb.toFixed(2)), Number((h.tf as number).toFixed(2))];
    };
    expect(v([['CH3', 2], ['CH2', 4]])).toEqual([336.88, 157.38]);
    expect(v([['CH3', 1], ['CH2', 1], ['OHalc', 1]])).toEqual([337.54, 173.12]);
    expect(v([['OHphenol', 1], ['ringCH', 5], ['ringC', 1]])).toEqual([439.2, 283.0]);
    expect(v([['CH3', 1], ['ringCH', 5], ['ringC', 1]])).toEqual([386.44, 195.07]);
    expect(v([['ringCH2', 6]])).toEqual([361.1, 169.0]);
  });

  it('單位：°C = K − 273.15', () => {
    const r = ok(computeJoback(RDKit, 'CCO'));
    expect(r.tbC).toBeCloseTo(r.tbK - 273.15, 9);
    expect(r.tfC).toBeCloseTo((r.tfK as number) - 273.15, 9);
  });

  it('回傳模型名稱、出處與每個基團的貢獻', () => {
    const r = ok(computeJoback(RDKit, 'CCO'));
    expect(r.model).toMatch(/Joback & Reid/);
    expect(r.sources.length).toBeGreaterThan(0);
    for (const s of r.sources) expect(s).toMatch(/表 III/);
    expect(countJobackGroups(r.groups).map((g) => `${g.id}×${g.count}`)).toEqual(['J01×1', 'J02×1', 'J20×1']);
  });
});

describe('Tf 沒有貢獻值的基團（表 III 的 –N=（非環）Tf 欄印「—」）', () => {
  it('偶氮甲烷 CN=NC：Tb = 198.2 + 2×23.58 + 2×74.60；Tf 回傳 null 並列出該基團', () => {
    const r = ok(computeJoback(RDKit, 'CN=NC'));
    expect(r.tbK).toBeCloseTo(198.2 + 2 * 23.58 + 2 * 74.6, 6);
    expect(r.tfK).toBeNull();
    expect(r.tfC).toBeNull();
    expect(r.sumTf).toBeNull();
    expect(r.tfUnavailable).toEqual(['–N=（非環）']);
  });
});

describe('切分完整性', () => {
  const molecules = [
    ...new Set([
      ...JOBACK_GROUP_CASES.flatMap((c) => c.positives),
      'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1',
      'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1',
      'COCC(C)OC(C)=O',
      'CCC(C)=O',
      'ClCC1CO1',
      'C[C@@H](C(=O)O)N',
      'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2',
    ]),
  ];
  for (const smiles of molecules) {
    it(`${smiles}：各基團原子數加總 = 分子重原子數，沒有重複歸屬`, () => {
      const r = computeJoback(RDKit, smiles);
      if (r.status !== 'ok' && r.status !== 'missing') throw new Error(`預期可切分，實際 ${r.status}`);
      const mol = RDKit.get_mol(smiles);
      if (!mol) throw new Error(`RDKit 無法解析：${smiles}`);
      const heavy = (JSON.parse(mol.get_json()) as { molecules: { atoms: { z?: number }[] }[] }).molecules[0].atoms.filter((a) => (a.z ?? 6) > 1).length;
      mol.delete();
      const owned = r.groups.flatMap((g) => g.atoms);
      expect(new Set(owned).size).toBe(owned.length);
      const missing = r.status === 'missing' ? r.missing.length : 0;
      expect(owned.length + missing).toBe(heavy);
      if (r.status === 'ok') expect(owned.length).toBe(heavy);
    });
  }

  it('切分順序固定：原子數由大到小，同大小依表 III 順序', () => {
    const order = orderJobackGroups(JOBACK_GROUPS);
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1];
      const b = order[i];
      expect(a.atomCount > b.atomCount || (a.atomCount === b.atomCount && a.order < b.order)).toBe(true);
    }
  });

  it('結果可重現：同一結構的不同寫法得到相同的 Tb、Tf，重複執行結果相同', () => {
    const a = ok(computeJoback(RDKit, 'OCC(=O)c1ccccc1'));
    const b = ok(computeJoback(RDKit, 'c1ccccc1C(=O)CO'));
    const c = ok(computeJoback(RDKit, 'OCC(=O)c1ccccc1'));
    expect(a.tbK).toBeCloseTo(b.tbK, 9);
    expect(a.tfK).toBeCloseTo(b.tfK as number, 9);
    expect(a).toEqual(c);
  });

  it('–COOH、–COO–、>C=O 不會被拆成較小的基團：乙酸乙酯沒有 >C=O、=O、–O–', () => {
    const r = ok(computeJoback(RDKit, 'CCOC(=O)C'));
    expect(r.groups.map((g) => g.id).sort()).toEqual(['J01', 'J01', 'J02', 'J28']);
  });

  it('BADGE、雙酚 A 等小分子：可計算', () => {
    expect(ok(computeJoback(RDKit, 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1')).groups.map((g) => g.id).sort()).toEqual(
      ['J01', 'J01', 'J04', 'J14', 'J14', 'J14', 'J14', 'J14', 'J14', 'J14', 'J14', 'J15', 'J15', 'J15', 'J15', 'J21', 'J21'].sort(),
    );
  });
});

describe('缺基團', () => {
  it('二甲基亞碸 CS(C)=O：S 沒有基團，回報原子位置，不計算、不拋例外', () => {
    const r = computeJoback(RDKit, 'CS(C)=O');
    if (r.status !== 'missing') throw new Error(`預期 missing，實際 ${r.status}`);
    expect(r.missing.map((m) => [m.index, m.element])).toEqual([[1, 'S']]);
    expect(r.missing[0].description).toMatch(/鄰居/);
    expect(r.groups.map((g) => g.id)).toContain('J01');
    expect(r).not.toHaveProperty('tbK');
  });

  it('三苯基膦：P 沒有基團', () => {
    const r = computeJoback(RDKit, 'c1ccc(P(c2ccccc2)c2ccccc2)cc1');
    if (r.status !== 'missing') throw new Error(`預期 missing，實際 ${r.status}`);
    expect(r.missing.map((m) => m.element)).toEqual(['P']);
  });

  it('環內三級氮（N-甲基吡咯烷）：表 III 沒有環內 >N–，回報缺基團', () => {
    const r = computeJoback(RDKit, 'CN1CCCC1');
    if (r.status !== 'missing') throw new Error(`預期 missing，實際 ${r.status}`);
    expect(r.missing.map((m) => m.element)).toEqual(['N']);
  });

  it('碳酸酯、甲酸酯：表 III 沒有對應基團，回報缺基團', () => {
    expect(computeJoback(RDKit, 'COC(=O)OC').status).toBe('missing');
    expect(computeJoback(RDKit, 'O=COC').status).toBe('missing');
  });

  it('甲醛 C=O：C 與 O 各自配不到完整基團，回報缺基團', () => {
    expect(computeJoback(RDKit, 'C=O').status).toBe('missing');
  });

  it('未列在原子量表的元素也只回報缺基團', () => {
    const r = computeJoback(RDKit, 'C[Si](C)(C)C');
    if (r.status !== 'missing') throw new Error(`預期 missing，實際 ${r.status}`);
    expect(r.missing.map((m) => m.element)).toEqual(['Si']);
  });
});

describe('不適用與無效輸入', () => {
  it('含連接點（*）的聚合物單元：直接回傳「不適用（聚合物單元）」', () => {
    for (const smiles of ['[*:1]CC[*:2]', '*CC*', '[*:1]CC([*:2])(C)C(=O)OCC1CO1', '[*]', 'CC*']) {
      const r = computeJoback(RDKit, smiles);
      expect(r.status, smiles).toBe('not-applicable');
      if (r.status === 'not-applicable') expect(r.reason).toMatch(/不適用（聚合物單元）/);
      expect(r).not.toHaveProperty('tbK');
    }
  });

  it('SMILES 無法解析', () => {
    expect(computeJoback(RDKit, 'C(C').status).toBe('invalid');
    expect(computeJoback(RDKit, '').status).toBe('invalid');
  });

  it('含多個分子（以 . 分隔）：不計算', () => {
    const r = computeJoback(RDKit, 'CCO.CC');
    expect(r.status).toBe('invalid');
  });
});

describe('論文的適用限制與誤差（照原文整理）', () => {
  it('列出頁碼與原文，包含 Tb、Tf 的整體誤差與 Tf 不準確的說明', () => {
    expect(JOBACK_PAPER_LIMITS.length).toBeGreaterThanOrEqual(4);
    for (const l of JOBACK_PAPER_LIMITS) {
      expect(l.page).toMatch(/^p\.\d+/);
      expect(l.quote.length).toBeGreaterThan(0);
    }
    const all = JOBACK_PAPER_LIMITS.map((l) => l.summary).join('\n');
    expect(all).toMatch(/12\.9 K/);
    expect(all).toMatch(/22\.6 K/);
    expect(all).toMatch(/非常粗略/);
    expect(JOBACK_DISCLAIMER).toBe('Joback 法為基團加成估算，僅用於小分子；數值為估算，非實測。');
  });
});
