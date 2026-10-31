// van der Waals 體積計算的測試（任務 028）：書中 Table 4.7 對照（D-1）、用 Table 4.2 手算的結構、切分完整性、缺基團、聚合物單元。
// 手算值用 tests/properties/vwCases.ts 的 TABLE42（Table 4.2 書頁 74–75 的獨立抄錄）逐項相加，不從 CSV 取值。
import { beforeAll, describe, expect, it } from 'vitest';
import { VW_GROUPS } from '../../src/core/data/vwGroups';
import {
  VW_DISCLAIMER,
  massTolerance,
  VW_MI_EXCEPTIONS,
  computeVdwVolume,
  countVwGroups,
  orderVwGroups,
  type VwResult,
} from '../../src/core/properties/vanDerWaalsVolume';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { BOOK_VW_CASES, BOOK_VW_DISCREPANCIES, TABLE42, VW_GROUP_CASES } from './vwCases';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const ok = (r: VwResult) => {
  if (r.status !== 'ok') throw new Error(`預期可計算，實際 ${r.status}：${JSON.stringify(r)}`);
  return r;
};
const hand = (parts: [keyof typeof TABLE42, number][]): number => parts.reduce((s, [g, n]) => s + n * TABLE42[g], 0);

describe('D-1：書中 Table 4.7（書頁 82–83）的 VW，程式與書中數值差 ≤ 0.1 cm³/mol', () => {
  for (const c of BOOK_VW_CASES) {
    it(`${c.name}（${c.類型}）：書 ${c.book}`, () => {
      const r = ok(computeVdwVolume(RDKit, c.smiles));
      expect(r.polymer).toBe(true);
      expect(Math.abs(r.vw - c.book), `程式 ${r.vw}、書 ${c.book}`).toBeLessThanOrEqual(0.1);
      // 程式結果也要等於 Table 4.2 的手算加總
      expect(r.vw).toBeCloseTo(hand(c.parts), 9);
      // ΣMi 與重複單元質量差在容許內
      expect(r.massWithinTolerance, `ΔM = ${r.massDelta}`).toBe(true);
    });
  }

  it('涵蓋脂肪鏈、芳香環、酯基、含環各至少一個', () => {
    const kinds = BOOK_VW_CASES.map((c) => c.類型).join('｜');
    for (const k of ['脂肪鏈', '芳香環', '酯基', '含環']) expect(kinds).toContain(k);
    expect(BOOK_VW_CASES.length).toBeGreaterThanOrEqual(6);
  });
});

describe('書中 Table 4.7 與 Table 4.2 組合基團不一致的兩個聚合物（KNOWN_ISSUES M18，使用者 2026-10-30 決定照 Table 4.2 印的值）', () => {
  for (const c of BOOK_VW_DISCREPANCIES) {
    it(`${c.name}：程式 = Table 4.2 印的值加總，與書中 ${c.book} 差超過 0.1`, () => {
      const r = ok(computeVdwVolume(RDKit, c.smiles));
      expect(r.vw).toBeCloseTo(hand(c.parts), 9);
      expect(Math.abs(r.vw - c.book)).toBeGreaterThan(0.1);
    });
  }
  it('PMMA 56.93（程式）對書 56.1；PVAc 47.23 對 45.9', () => {
    expect(ok(computeVdwVolume(RDKit, '[*:1]CC([*:2])(C)C(=O)OC')).vw).toBeCloseTo(56.93, 6);
    expect(ok(computeVdwVolume(RDKit, '[*:1]CC([*:2])OC(C)=O')).vw).toBeCloseTo(47.23, 6);
  });
});

describe('用 Table 4.2 手算的結構（程式結果與手算相等）', () => {
  const cases: { name: string; smiles: string; parts: [keyof typeof TABLE42, number][] }[] = [
    { name: '乙醇', smiles: 'CCO', parts: [['CH3', 1], ['CH2', 1], ['OH', 1]] },
    { name: '反式 2-丁烯', smiles: 'C/C=C/C', parts: [['CH3', 2], ['CHCH', 1]] },
    { name: '雙酚 A', smiles: 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1', parts: [['C_CH3_2', 1], ['C6H4', 2], ['OH', 2]] },
    { name: 'MEK', smiles: 'CCC(C)=O', parts: [['CH3', 2], ['CH2', 1], ['CO_al', 1]] },
    { name: '苯酚', smiles: 'Oc1ccccc1', parts: [['C6H5', 1], ['OH', 1]] },
    { name: 'BT01 苯酚 Novolac 單元（三取代苯環，逐原子）', smiles: '[*:1]Cc1cc([*:2])ccc1O', parts: [['CH2', 1], ['CHar', 3], ['Car_exo', 3], ['OH', 1]] },
    { name: 'BT02 鄰甲酚 Novolac 單元', smiles: '[*:1]Cc1cc([*:2])cc(C)c1O', parts: [['CH2', 1], ['CHar', 2], ['Car_exo', 4], ['CH3', 1], ['OH', 1]] },
    { name: 'P 單元 B（萘基次甲基）', smiles: '[*:1]C([*:2])c1ccc2ccccc2c1', parts: [['C10H7', 1], ['CHtri', 1]] },
    { name: '1-萘基取代（甲基萘）', smiles: 'Cc1cccc2ccccc12', parts: [['CH3', 1], ['C10H7', 1]] },
    { name: '乙酸乙酯', smiles: 'CCOC(=O)C', parts: [['CH3', 2], ['CH2', 1], ['COO', 1]] },
    { name: '三級丁基（異丁烷，三個甲基＋>CH–）', smiles: 'CC(C)C', parts: [['CH3', 3], ['CHtri', 1]] },
  ];
  for (const c of cases) {
    it(`${c.name}：${c.smiles}`, () => {
      const r = ok(computeVdwVolume(RDKit, c.smiles));
      expect(r.vw, `程式 ${r.vw}、手算 ${hand(c.parts)}`).toBeCloseTo(hand(c.parts), 9);
    });
  }

  it('手算數值本身（報告對照表用）', () => {
    expect(Number(hand([['CH3', 1], ['CH2', 1], ['OH', 1]]).toFixed(2))).toBe(31.9);
    expect(Number(hand([['CH3', 2], ['CHCH', 1]]).toFixed(2))).toBe(44.24);
    expect(Number(hand([['C_CH3_2', 1], ['C6H4', 2], ['OH', 2]]).toFixed(2))).toBe(133.3);
    expect(Number(hand([['CH3', 2], ['CH2', 1], ['CO_al', 1]]).toFixed(2))).toBe(46.07);
    expect(Number(hand([['C6H5', 1], ['OH', 1]]).toFixed(2))).toBe(53.85);
    expect(Number(hand([['CH2', 1], ['CHar', 3], ['Car_exo', 3], ['OH', 1]]).toFixed(2))).toBe(59.03);
    expect(Number(hand([['C10H7', 1], ['CHtri', 1]]).toFixed(2))).toBe(78.25);
  });

  it('同一個結構的不同 SMILES 寫法得到相同的 VW', () => {
    const a = ok(computeVdwVolume(RDKit, 'Oc1ccc(C(C)(C)c2ccc(O)cc2)cc1'));
    const b = ok(computeVdwVolume(RDKit, 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1'));
    expect(a.vw).toBeCloseTo(b.vw, 9);
  });

  it('回傳 VW、每個基團的貢獻與原子、出處、ΣMi 與模型名稱', () => {
    const r = ok(computeVdwVolume(RDKit, 'CCO'));
    expect(r.model).toMatch(/Table 4\.2/);
    expect(r.sources.length).toBeGreaterThan(0);
    for (const s of r.sources) expect(s).toMatch(/Table 4\.2/);
    expect(countVwGroups(r.groups).map((g) => `${g.id}×${g.count}`)).toEqual(['V01×1', 'V15×1', 'V17×1']);
    for (const g of r.groups) {
      expect(g.atoms.length).toBeGreaterThan(0);
      expect(g.vw).toBeGreaterThan(0);
    }
    expect(r.sumMi).toBeCloseTo(14.03 + 15.03 + 17.01, 9);
    expect(r.massWithinTolerance).toBe(true);
    expect(VW_DISCLAIMER).toMatch(/非實測/);
  });
});

describe('切分完整性：各基團原子數加總 = 重原子數，沒有重複歸屬', () => {
  const molecules = [
    ...new Set([
      ...VW_GROUP_CASES.flatMap((c) => c.positives),
      ...BOOK_VW_CASES.map((c) => c.smiles),
      'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1',
      'COCC(C)OC(C)=O',
      'ClCC1CO1',
      'C[C@@H](C(=O)O)N',
      'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2',
      'c1ccc(P(c2ccccc2)c2ccccc2)cc1',
      '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O',
      '[*:1]Oc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC(O)C[*:2]',
    ]),
  ];
  for (const smiles of molecules) {
    it(smiles, () => {
      const r = computeVdwVolume(RDKit, smiles);
      if (r.status !== 'ok' && r.status !== 'missing') throw new Error(`預期可切分，實際 ${r.status}`);
      const mol = RDKit.get_mol(smiles);
      if (!mol) throw new Error(`RDKit 無法解析：${smiles}`);
      const heavy = (JSON.parse(mol.get_json()) as { molecules: { atoms: { z?: number }[] }[] }).molecules[0].atoms.filter((a) => (a.z ?? 6) > 1).length;
      mol.delete();
      const owned = r.groups.flatMap((g) => g.atoms);
      const missing = r.status === 'missing' ? r.missing.map((m) => m.index) : [];
      expect(new Set([...owned, ...missing]).size).toBe(owned.length + missing.length);
      expect(owned.length + missing.length).toBe(heavy);
      if (r.status === 'ok') expect(owned.length).toBe(heavy);
    });
  }

  it('切分順序固定：原子數由大到小，同大小依資料表順序', () => {
    const order = orderVwGroups(VW_GROUPS);
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1];
      const b = order[i];
      expect(a.atomCount > b.atomCount || (a.atomCount === b.atomCount && a.order < b.order)).toBe(true);
    }
  });

  it('大的基團先配：PET 的 –COO– 不會被拆成 –O– 與其他；PS 的 –CH(C6H5)– 不會被拆成 >CH– 與苯基', () => {
    const pet = ok(computeVdwVolume(RDKit, '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]'));
    expect(countVwGroups(pet.groups).map((g) => `${g.id}×${g.count}`)).toEqual(['V01×2', 'V11×2', 'V14×1']);
    const ps = ok(computeVdwVolume(RDKit, '[*:1]CC([*:2])c1ccccc1'));
    expect(countVwGroups(ps.groups).map((g) => `${g.id}×${g.count}`)).toEqual(['V01×1', 'V02×1']);
  });

  it('結果可重現：重複執行結果相同', () => {
    const a = computeVdwVolume(RDKit, '[*:1]CC([*:2])c1ccccc1');
    const b = computeVdwVolume(RDKit, '[*:1]CC([*:2])c1ccccc1');
    expect(a).toEqual(b);
  });
});

describe('缺基團：回報原子位置與原因，不計算、不拋例外、不以相近基團代用', () => {
  it('BADGE：兩個醚 O（–O– 在資料表 VW 留空）與環氧環（Table 4.2 沒有環氧環基團）', () => {
    const r = computeVdwVolume(RDKit, 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1');
    if (r.status !== 'missing') throw new Error(`預期 missing，實際 ${r.status}`);
    expect(r).not.toHaveProperty('vw');
    const blank = r.missing.filter((m) => m.reason !== null);
    expect(blank).toHaveLength(2);
    for (const m of blank) {
      expect(m.element).toBe('O');
      expect(m.reason).toMatch(/–O–/);
      expect(m.reason).toMatch(/留空/);
    }
    // 環氧環的 CH、CH2、O（各 2 個）沒有任何基團
    const ring = r.missing.filter((m) => m.reason === null);
    expect(ring.map((m) => m.element).sort()).toEqual(['C', 'C', 'C', 'C', 'O', 'O']);
    for (const m of r.missing) expect(m.description).toMatch(/鄰居/);
  });

  it('PGMEA：只有甲醚的 O 缺基團（酯基的 O 屬於 –COO–）', () => {
    const r = computeVdwVolume(RDKit, 'COCC(C)OC(C)=O');
    if (r.status !== 'missing') throw new Error(`預期 missing，實際 ${r.status}`);
    expect(r.missing.map((m) => [m.index, m.element])).toEqual([[1, 'O']]);
    // 乙酸酯（–O–C(=O)–CH3 接在 >CH– 上）由 5 原子的 –CH(OCOCH3)– 整組先配走
    expect(r.groups.map((g) => g.id)).toContain('V03');
  });

  it('三苯基膦：P 沒有基團', () => {
    const r = computeVdwVolume(RDKit, 'c1ccc(P(c2ccccc2)c2ccccc2)cc1');
    if (r.status !== 'missing') throw new Error(`預期 missing，實際 ${r.status}`);
    expect(r.missing.map((m) => m.element)).toEqual(['P']);
  });

  it('L-丙胺酸（–NH2、–COOH 沒有對應基團）、環氧丙烷、環氧氯丙烷、BF3 都回報缺基團', () => {
    for (const s of ['C[C@@H](C(=O)O)N', 'CC1CO1', 'ClCC1CO1', 'FB(F)F']) expect(computeVdwVolume(RDKit, s).status, s).toBe('missing');
  });

  it('SBI、雙酚茀單元：稠環的環上原子與環外取代的稠合芳香碳都回報缺基團，不拿相近基團代用', () => {
    const sbi = computeVdwVolume(RDKit, 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2');
    expect(sbi.status).toBe('missing');
    const fl = computeVdwVolume(RDKit, '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O');
    expect(fl.status).toBe('missing');
  });

  it('環上的 –CH2–（環己烷、環氧環）不會被當成鏈上的 –CH2–', () => {
    const r = computeVdwVolume(RDKit, 'C1CCCCC1');
    if (r.status !== 'missing') throw new Error(`預期 missing，實際 ${r.status}`);
    expect(r.missing).toHaveLength(6);
  });

  it('甲酸酯、碳酸酯、羧酸、芳香酮：Table 4.2 沒有（或條件不符）的基團回報缺基團', () => {
    for (const s of ['O=COC', 'COC(=O)OC', 'CC(=O)c1ccccc1']) expect(computeVdwVolume(RDKit, s).status, s).toBe('missing');
  });

  it('含 P 的結構：沒有對應基團（Table 4.2 無 P），只回報缺基團（S、Si 已於任務 031 補收）', () => {
    const r = computeVdwVolume(RDKit, 'CP(C)C');
    if (r.status !== 'missing') throw new Error(`預期 missing，實際 ${r.status}`);
    expect(r.missing.map((m) => m.element)).toEqual(['P']);
  });
});

describe('聚合物重複單元（含 *）', () => {
  it('連接點不是原子：不計入重原子，不影響基團配對；每個重原子恰好屬於一個基團', () => {
    const r = ok(computeVdwVolume(RDKit, '[*:1]CC[*:2]'));
    expect(r.polymer).toBe(true);
    expect(r.groups.map((g) => g.id)).toEqual(['V01', 'V01']);
    expect(r.vw).toBeCloseTo(20.46, 9);
  });
  it('小分子的 polymer 標記為 false', () => {
    expect(ok(computeVdwVolume(RDKit, 'CCO')).polymer).toBe(false);
  });
  it('骨架範本單元 BT01、BT02 可計算（逐原子相加）；BT03–BT06（醚 O、環氧環、茀）回報缺基團', () => {
    expect(computeVdwVolume(RDKit, '[*:1]Cc1cc([*:2])ccc1O').status).toBe('ok');
    expect(computeVdwVolume(RDKit, '[*:1]Cc1cc([*:2])cc(C)c1O').status).toBe('ok');
    for (const s of [
      '[*:1]Cc1cc([*:2])ccc1OCC2CO2',
      '[*:1]Cc1cc([*:2])cc(C)c1OCC2CO2',
      '[*:1]Oc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC(O)C[*:2]',
      '[*:1]Oc1ccc(cc1)C1(c2ccccc2-c2ccccc21)c1ccc(cc1)OCC(O)C[*:2]',
      '[*:1]CC([*:2])(C)C(=O)OCC1CO1',
    ]) {
      expect(computeVdwVolume(RDKit, s).status, s).toBe('missing');
    }
  });
});

describe('ΣMi 與分子（重複單元）質量差', () => {
  it('標示容許 = 各基團 Mi 捨入容許的加總（兩位小數 0.01、一位小數 0.05、V07 例外 0.05）；差值照任務 026 的作法只標示，不阻擋計算', () => {
    expect(massTolerance([{ id: 'V01', mi: 14.03 }, { id: 'V01', mi: 14.03 }])).toBeCloseTo(0.02, 9);
    expect(massTolerance([{ id: 'V22', mi: 127.2 }])).toBeCloseTo(0.05, 9);
    expect(massTolerance([{ id: 'V07', mi: 86.05 }])).toBeCloseTo(0.05, 9);
    const r = ok(computeVdwVolume(RDKit, '[*:1]CC([*:2])(C)C(=O)OC'));
    // V07 的 Mi 書印 86.05、基團質量 86.09：ΣMi 比單元質量低 0.037，仍在容許內
    expect(r.massDelta as number).toBeCloseTo(-0.037, 3);
    expect(r.massWithinTolerance).toBe(true);
  });
  it('資料表被改錯 Mi 時，超過容許會標示（不阻擋）', () => {
    const rows = VW_GROUPS.map((g) => (g.id === 'V15' ? { ...g, mi: 20 } : g));
    const r = ok(computeVdwVolume(RDKit, 'CCO', { rows }));
    expect(r.massWithinTolerance).toBe(false);
  });
  it('Mi 的明確例外只有 V07（M18）與 V28、V30（任務 031，書中捨入差 0.02–0.03）', () => {
    expect(Object.keys(VW_MI_EXCEPTIONS)).toEqual(['V07', 'V28', 'V30']);
  });
});

describe('無效輸入', () => {
  it('SMILES 無法解析、空字串、只有連接點', () => {
    expect(computeVdwVolume(RDKit, 'C(C').status).toBe('invalid');
    expect(computeVdwVolume(RDKit, '').status).toBe('invalid');
    expect(computeVdwVolume(RDKit, '[*]').status).toBe('invalid');
  });
  it('含多個分子（以 . 分隔）：不計算', () => {
    expect(computeVdwVolume(RDKit, 'CCO.CC').status).toBe('invalid');
  });
});

describe('任務 031：補收書中現成的整體基團（Table 4.2 書頁 74–75）', () => {
  const vwOf = (s: string) => ok(computeVdwVolume(RDKit, s)).vw;
  it('聚（1,4-伸苯硫醚）：–C6H4– 43.3 + –S– 10.8 = 54.1（Table 4.8 書頁 85 的 54.1）', () => {
    expect(vwOf('[*:1]c1ccc(S[*:2])cc1')).toBeCloseTo(54.1, 9);
  });
  it('均苯四甲醯亞胺 94.5（整體）；PMDA–ODA 缺的只有 –O–（M19 留空），其餘基團都配到', () => {
    expect(vwOf('CN1C(=O)c2cc3C(=O)N(C)C(=O)c3cc2C1=O') - 2 * 13.67).toBeCloseTo(94.5, 9);
    const r = computeVdwVolume(RDKit, '[*:1]N1C(=O)c2cc3C(=O)N(C(=O)c3cc2C1=O)c1ccc(Oc2ccc([*:2])cc2)cc1');
    expect(r.status).toBe('missing');
    if (r.status !== 'missing') return;
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0].element).toBe('O');
    expect(r.groups.map((g) => g.id).sort()).toEqual(['V14', 'V14', 'V27']);
  });
  it('其餘新基團的值：–S– 10.8、–SO2– 20.3、–Si(CH3)2– 42.2、–Si< 16.6、–C≡N 14.7、–N< 4.3、Nar 5.2、Car(endo) 4.75、–NH– 4', () => {
    expect(vwOf('[*:1]CSC[*:2]')).toBeCloseTo(10.23 * 2 + 10.8, 9);
    expect(vwOf('[*:1]CS(=O)(=O)C[*:2]')).toBeCloseTo(10.23 * 2 + 20.3, 9);
    expect(vwOf('[*:1]CC[Si](C)(C)CC[*:2]')).toBeCloseTo(10.23 * 4 + 42.2, 9);
    expect(vwOf('C[Si](C)(C)C')).toBeCloseTo(16.6 + 4 * 13.67, 9);
    expect(vwOf('CC#N')).toBeCloseTo(13.67 + 14.7, 9);
    expect(vwOf('CN(C)C')).toBeCloseTo(3 * 13.67 + 4.3, 9);
    expect(vwOf('Cc1cccnc1')).toBeCloseTo(13.67 + 4 * 8.05 + 5.55 + 5.2, 9);
    expect(vwOf('c1ccc2ccccc2c1')).toBeCloseTo(8 * 8.05 + 2 * 4.75, 9);
    expect(vwOf('CNC')).toBeCloseTo(2 * 13.67 + 4, 9);
  });
});
