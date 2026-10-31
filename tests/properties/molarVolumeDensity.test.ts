// 聚合物莫耳體積與密度計算的測試（任務 029）：Example 4.1（PET）、用 Table 4.10 手算的結構（D-2）、切分完整性、缺基團、狀態判斷與「狀態未定」。
// 手算值用 tests/properties/molarVolumeCases.ts 的 TABLE410（Table 4.10 書頁 88 的獨立抄錄）逐項相加，不從 CSV 取值。
import { beforeAll, describe, expect, it } from 'vitest';
import { MOLAR_VOLUME_GROUPS } from '../../src/core/data/molarVolumeGroups';
import {
  MOLAR_VOLUME_DISCLAIMER,
  STATE_BOUNDARY_C,
  computeMolarVolumeDensity,
  countMolarVolumeGroups,
  judgeState,
  orderMolarVolumeGroups,
  type MolarVolumeResult,
} from '../../src/core/properties/molarVolumeDensity';
import { computeTg } from '../../src/core/properties/tgGroupContribution';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { BOOK_MOLAR_VOLUME_CASES, TABLE410 } from './molarVolumeCases';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const ok = (r: MolarVolumeResult) => {
  if (r.status !== 'ok') throw new Error(`預期可計算，實際 ${r.status}：${JSON.stringify(r)}`);
  return r;
};
const hand = (parts: [keyof typeof TABLE410, number][], col: 'va' | 'vc'): number => parts.reduce((s, [g, n]) => s + n * TABLE410[g][col], 0);
const PET = '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]';

describe('D-1：Example 4.1（書頁 87）PET', () => {
  it('Va 加總 144.2（差 ≤ 0.1）、密度 1.33（差 ≤ 0.005）', () => {
    const r = ok(computeMolarVolumeDensity(RDKit, PET));
    expect(Math.abs((r.amorphous?.vm ?? 0) - 144.2)).toBeLessThanOrEqual(0.1);
    expect(Math.abs((r.amorphous?.density ?? 0) - 1.33)).toBeLessThanOrEqual(0.005);
  });
  it('Vc 加總 131.4（差 ≤ 0.1）、密度 1.465（差 ≤ 0.005）', () => {
    const r = ok(computeMolarVolumeDensity(RDKit, PET));
    expect(Math.abs((r.crystalline?.vm ?? 0) - 131.4)).toBeLessThanOrEqual(0.1);
    expect(Math.abs((r.crystalline?.density ?? 0) - 1.465)).toBeLessThanOrEqual(0.005);
  });
  it('切出書中的基團：1 個 –C6H4–、2 個 –COO–、2 個 –CH2–', () => {
    const r = ok(computeMolarVolumeDensity(RDKit, PET));
    expect(countMolarVolumeGroups(r.groups).map((e) => [e.id, e.count])).toEqual([
      ['M01', 2],
      ['M11', 2],
      ['M15', 1],
    ]);
    expect(r.unitMass).toBeCloseTo(192.17, 1);
  });
});

describe('D-2：用 Table 4.10 手算（Tables 4.6–4.8 沒有計算值欄），程式等於手算', () => {
  for (const c of BOOK_MOLAR_VOLUME_CASES) {
    it(`${c.name}（${c.類型}）`, () => {
      const r = ok(computeMolarVolumeDensity(RDKit, c.smiles));
      expect(r.polymer).toBe(true);
      expect(r.amorphous?.vm).toBeCloseTo(hand(c.parts, 'va'), 9);
      expect(r.crystalline?.vm).toBeCloseTo(hand(c.parts, 'vc'), 9);
      expect(r.amorphous?.density).toBeCloseTo((r.unitMass as number) / hand(c.parts, 'va'), 9);
      expect(r.crystalline?.density).toBeCloseTo((r.unitMass as number) / hand(c.parts, 'vc'), 9);
    });
  }
  it('涵蓋脂肪鏈、芳香環、酯基、醯胺、含環各至少一個', () => {
    const kinds = BOOK_MOLAR_VOLUME_CASES.map((c) => c.類型).join('、');
    for (const k of ['脂肪鏈', '芳香環', '酯基', '醯胺', '含環']) expect(kinds).toContain(k);
    expect(BOOK_MOLAR_VOLUME_CASES.length).toBeGreaterThanOrEqual(6);
  });
  it('尼龍 6 與尼龍 6,6 單元質量不同但密度相同（同為 CH2 與 –CONH– 的比例）', () => {
    const a = ok(computeMolarVolumeDensity(RDKit, '[*:1]C(=O)NCCCCC[*:2]'));
    const b = ok(computeMolarVolumeDensity(RDKit, '[*:1]NC(=O)CCCCC(=O)NCCCCCC[*:2]'));
    expect(b.unitMass as number).toBeGreaterThan(a.unitMass as number);
    expect(a.amorphous?.density).toBeCloseTo(b.amorphous?.density as number, 9);
  });
});

describe('括號內的值（書中標為暫定）', () => {
  it('用到 –CONH–、–O–（括號值）時標示 usesTentative，群組標 tentative', () => {
    const r = ok(computeMolarVolumeDensity(RDKit, '[*:1]C(=O)NCCCCC[*:2]'));
    expect(r.usesTentative).toBe(true);
    expect(r.groups.find((g) => g.id === 'M13')?.tentative).toBe(true);
    expect(r.groups.find((g) => g.id === 'M01')?.tentative).toBe(false);
  });
  it('沒有括號值時為 false；二芳基醚 –O–（ar.）用括號值 8.0／7.1', () => {
    expect(ok(computeMolarVolumeDensity(RDKit, PET)).usesTentative).toBe(false);
    const r = computeMolarVolumeDensity(RDKit, '[*:1]c1ccc(cc1)Oc1ccc(cc1)[*:2]');
    const e = ok(r);
    expect(e.groups.find((g) => g.id === 'M10')?.va).toBe(8.0);
    expect(e.amorphous?.vm).toBeCloseTo(65.5 * 2 + 8.0, 9);
    expect(e.usesTentative).toBe(true);
  });
});

describe('切分完整性、可重現', () => {
  const structures = [...BOOK_MOLAR_VOLUME_CASES.map((c) => c.smiles), '[*:1]c1ccc(cc1)Oc1ccc(cc1)[*:2]', '[*:1]CC(O)C[*:2]'];
  for (const smiles of structures) {
    it(`${smiles}：基團原子數加總 = 重原子數（不含 *），沒有重複歸屬`, () => {
      const r = ok(computeMolarVolumeDensity(RDKit, smiles));
      const used = r.groups.flatMap((g) => g.atoms);
      expect(new Set(used).size).toBe(used.length);
      const mol = RDKit.get_mol(smiles) as NonNullable<ReturnType<RDKitModule['get_mol']>>;
      try {
        const n = JSON.parse(mol.get_json()).molecules[0].atoms.filter((a: { z?: number }) => (a.z ?? 6) > 1).length;
        expect(used.length).toBe(n);
      } finally {
        mol.delete();
      }
    });
  }
  it('同一輸入兩次結果相同；切分順序為原子數由大到小', () => {
    expect(computeMolarVolumeDensity(RDKit, PET)).toEqual(computeMolarVolumeDensity(RDKit, PET));
    const order = orderMolarVolumeGroups(MOLAR_VOLUME_GROUPS).map((g) => g.atomCount);
    expect(order).toEqual([...order].sort((a, b) => b - a));
  });
});

describe('缺基團：不計算、不猜值，回報原子位置', () => {
  it('BT01（酚 Novolac 單元）：三取代酚環書中沒有，回報缺基團，不計算', () => {
    const r = computeMolarVolumeDensity(RDKit, '[*:1]Cc1cc([*:2])ccc1O');
    expect(r.status).toBe('missing');
    if (r.status === 'missing') {
      expect(r.groups.map((g) => g.id)).toEqual(['M01']);
      expect(r.missing.length).toBe(7);
      expect(r.missing.every((m) => m.description.length > 0)).toBe(true);
      expect(r).not.toHaveProperty('amorphous');
    }
  });
  it('異丙基（–CH(i-C3H7)– 未收錄）與孤立的 –CH3 缺基團', () => {
    expect(computeMolarVolumeDensity(RDKit, '[*:1]CC([*:2])C(C)C').status).toBe('missing');
    expect(computeMolarVolumeDensity(RDKit, '[*:1]C(C)C[*:2]').status).toBe('ok');
  });
  it('脂肪族酯（書中 general／acrylics 沒有定義條件）：缺基團並說明原因，不偷用 general', () => {
    const r = computeMolarVolumeDensity(RDKit, '[*:1]CCOC(=O)CCC(=O)OCC[*:2]');
    expect(r.status).toBe('missing');
    if (r.status === 'missing') expect(r.missing.some((m) => m.reason?.includes('general'))).toBe(true);
  });
  it('芳基烷基醚與接連接點的醚 O：缺基團並說明 al./ar. 沒有定義', () => {
    const aryl = computeMolarVolumeDensity(RDKit, '[*:1]Oc1ccc(cc1)C[*:2]');
    expect(aryl.status).toBe('missing');
    if (aryl.status === 'missing') expect(aryl.missing.some((m) => m.element === 'O' && m.reason?.includes('al.'))).toBe(true);
    const peo = computeMolarVolumeDensity(RDKit, '[*:1]CCO[*:2]');
    expect(peo.status).toBe('missing');
  });
  it('環氧環、萘環、茀等書中沒有的基團缺基團（BT03、單元 A、單元 B）', () => {
    for (const s of ['[*:1]Cc1cc([*:2])ccc1OCC2CO2', '[*:1]C([*:2])c1ccc2ccccc2c1', '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O', '[*:1]CC([*:2])(C)C(=O)OCC1CO1']) {
      expect(computeMolarVolumeDensity(RDKit, s).status, s).toBe('missing');
    }
  });
});

describe('含 * 才走聚合物函式；小分子與無效輸入', () => {
  it('不含 * 的小分子回傳 unsupported（液體法未實作），不套用聚合物表', () => {
    for (const s of ['CCO', 'COC(C)=O', 'c1ccccc1', 'CCCCCC']) {
      const r = computeMolarVolumeDensity(RDKit, s);
      expect(r.status, s).toBe('unsupported');
      if (r.status === 'unsupported') expect(r.message).toMatch(/Fedors 1974/);
    }
  });
  it('空字串、無法解析、多個分子', () => {
    expect(computeMolarVolumeDensity(RDKit, '').status).toBe('invalid');
    expect(computeMolarVolumeDensity(RDKit, 'C(C').status).toBe('invalid');
    expect(computeMolarVolumeDensity(RDKit, '[*:1]CC[*:2].CC').status).toBe('invalid');
  });
  it('免責聲明字串存在', () => {
    expect(MOLAR_VOLUME_DISCLAIMER).toMatch(/非實測/);
  });
});

describe('298 K 狀態判斷（書頁 79–80：Tg 高於 25 °C 玻璃態、低於 25 °C 橡膠態）', () => {
  it('Tg 高於 25 °C → 玻璃態（聚苯乙烯、PMMA）', () => {
    for (const s of ['[*:1]CC([*:2])c1ccccc1', '[*:1]CC([*:2])(C)C(=O)OC']) {
      const r = ok(computeMolarVolumeDensity(RDKit, s));
      const tg = computeTg(RDKit, s);
      expect(tg.status).toBe('ok');
      expect(r.state.state).toBe('glassy');
      expect(r.state.tgC).toBeGreaterThan(STATE_BOUNDARY_C);
      expect(r.state.basis).toMatch(/玻璃態/);
    }
  });
  it('Tg 低於 25 °C → 橡膠態（聚乙烯）', () => {
    const r = ok(computeMolarVolumeDensity(RDKit, '[*:1]CC[*:2]'));
    expect(r.state.state).toBe('rubbery');
    expect(r.state.tgC as number).toBeLessThan(STATE_BOUNDARY_C);
    expect(r.state.basis).toMatch(/橡膠態/);
  });
  it('玻璃態與橡膠態用同一組 Va：兩種狀態的莫耳體積與密度相同（式 4.8a、4.8b）', () => {
    const r = ok(computeMolarVolumeDensity(RDKit, '[*:1]CC([*:2])c1ccccc1'));
    expect(r.glassy).toEqual(r.rubbery);
    expect(r.glassy).toEqual(r.amorphous);
  });
  it('狀態未定：Tg 算不出來（缺基團）時不判斷，兩種結果都輸出並標明依據', () => {
    for (const s of ['[*:1]CC([*:2])C1CCCCC1']) {
      expect(computeTg(RDKit, s).status, s).toBe('missing');
      const r = ok(computeMolarVolumeDensity(RDKit, s));
      expect(r.state.state).toBe('undetermined');
      expect(r.state.tgC).toBeNull();
      expect(r.state.basis).toMatch(/不判斷/);
      expect(r.glassy?.vm).toBeGreaterThan(0);
      expect(r.rubbery?.vm).toBeGreaterThan(0);
      expect(r.glassy?.density).toBeGreaterThan(0);
      expect(r.rubbery?.density).toBeGreaterThan(0);
    }
  });
  it('judgeState 對 Tg 缺基團的結構回傳 undetermined；結構無效也不拋例外', () => {
    expect(judgeState(RDKit, '[*:1]CC([*:2])C1CCCCC1').state).toBe('undetermined');
    expect(judgeState(RDKit, 'C(C').state).toBe('undetermined');
  });
});

describe('任務 031：補收的整體基團（Table 4.10 書頁 88）', () => {
  it('PMDA–ODA：均苯四甲醯亞胺 151／135 + 2 × 對伸苯基 65.5／59 + –O–（ar.）8.0／7.1 = 290.0／260.1', () => {
    const r = ok(computeMolarVolumeDensity(RDKit, '[*:1]N1C(=O)c2cc3C(=O)N(C(=O)c3cc2C1=O)c1ccc(Oc2ccc([*:2])cc2)cc1'));
    expect(r.amorphous?.vm).toBeCloseTo(151 + 2 * 65.5 + 8.0, 9);
    expect(r.crystalline?.vm).toBeCloseTo(135 + 2 * 59 + 7.1, 9);
  });
  it('聚（1,4-伸苯硫醚）：–S– 17.3／15.5 + 對伸苯基 65.5／59；聚乙酸乙烯酯：–CH2– + –CH(OCOCH3)– 52.4／47', () => {
    const pps = ok(computeMolarVolumeDensity(RDKit, '[*:1]c1ccc(S[*:2])cc1'));
    expect([pps.amorphous?.vm, pps.crystalline?.vm]).toEqual([17.3 + 65.5, 15.5 + 59]);
    const pvac = ok(computeMolarVolumeDensity(RDKit, '[*:1]CC([*:2])OC(C)=O'));
    expect(pvac.amorphous?.vm).toBeCloseTo(16.37 + 52.4, 9);
    expect(pvac.crystalline?.vm).toBeCloseTo(14.68 + 47, 9);
  });
  it('醚 O 接連接點 *（M22）仍回報缺基團，不自行歸 al. 或 ar.', () => {
    expect(computeMolarVolumeDensity(RDKit, '[*:1]Oc1c(C)cc([*:2])cc1C').status).toBe('missing');
  });
});
