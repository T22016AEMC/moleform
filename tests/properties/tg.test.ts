// Yg 基團切分與 Tg 計算的測試（任務 026）：與書中計算值對照、共軛狀態、切分完整性、缺基團。
// 對照值全部來自 van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009) 的頁面圖像（Table 6.4 書頁 143–144、Example 6.3 書頁 145）。
import { beforeAll, describe, expect, it } from 'vitest';
import { BACKBONE_TEMPLATES } from '../../src/core/data/backboneTemplates';
import { BOOK_CASES } from './bookCases';
import { computeTg, type TgResult } from '../../src/core/properties/tgGroupContribution';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});


const ok = (r: TgResult) => {
  if (r.status !== 'ok') throw new Error(`預期可計算，實際 ${r.status}：${JSON.stringify(r)}`);
  return r;
};

describe('與書中計算值對照（差 ≤ 1 K）', () => {
  for (const c of BOOK_CASES) {
    it(`${c.name}：書中 ${c.book} K（${c.where}）`, () => {
      const r = ok(computeTg(RDKit, c.smiles));
      expect(Math.abs(r.tgK - c.book), `${c.name} 程式 ${r.tgK.toFixed(2)} K`).toBeLessThanOrEqual(1);
    });
  }

  it('至少 6 個，且涵蓋乙烯基聚合物、PMMA、含芳香環的縮聚物', () => {
    expect(BOOK_CASES.length).toBeGreaterThanOrEqual(6);
    expect(BOOK_CASES.some((c) => c.name.includes('PMMA'))).toBe(true);
    expect(BOOK_CASES.some((c) => c.name === 'PEEK')).toBe(true);
  });

  it('PEEK 用 Table 6.3 組合基團：37.4 ＋ 84 = 121.4，M = 288.3（書中 Example 6.3）', () => {
    const r = ok(computeTg(RDKit, BOOK_CASES[11].smiles));
    expect(r.groups.map((g) => g.rowId).sort()).toEqual(['T.C6H4COC6H4', 'T.OC6H4O']);
    expect(r.sumYg).toBeCloseTo(121.4, 6);
    expect(r.sumM).toBeCloseTo(288.3, 6);
    expect(r.tgK).toBeCloseTo((1000 * 121.4) / 288.3, 6);
  });

  it('Tg 的攝氏換算與 M 的核對欄位', () => {
    const r = ok(computeTg(RDKit, '*CC(Cl)*'));
    expect(r.tgC).toBeCloseTo(r.tgK - 273.15, 9);
    expect(r.sumYg).toBeCloseTo(22.1, 9);
    expect(r.sumM).toBeCloseTo(62.5, 9);
    expect(r.formulaMass).toBeCloseTo(62.49, 1);
    expect(r.massDelta).not.toBeNull();
  });

  it('聚苯乙烯：2.7 ＋ 36.1 = 38.8，M = 104.1（書中沒有 PS 的計算值可對照，僅確認程式照 Table 6.1 加總）', () => {
    const r = ok(computeTg(RDKit, '*CC(c1ccccc1)*'));
    expect(r.sumYg).toBeCloseTo(38.8, 9);
    expect(r.sumM).toBeCloseTo(104.1, 9);
  });
});

describe('氫鍵鏈與 C(CH3)2 的條件', () => {
  it('含 CONH、胺基甲酸酯或脲基的單元，–CH2– 取 4.3；其他取 2.7', () => {
    const nylon = ok(computeTg(RDKit, BOOK_CASES[9].smiles));
    expect(nylon.groups.filter((g) => g.familyId === 'A.CH2').every((g) => g.rowId === 'A.CH2.hb')).toBe(true);
    const peo = ok(computeTg(RDKit, '*CCO*'));
    expect(peo.groups.filter((g) => g.familyId === 'A.CH2').every((g) => g.rowId === 'A.CH2.gen')).toBe(true);
    const urethane = ok(computeTg(RDKit, '*OCCCCOC(=O)NCCCCCCNC(=O)*'));
    expect(urethane.groups.filter((g) => g.familyId === 'A.CH2').every((g) => g.rowId === 'A.CH2.hb')).toBe(true);
  });

  it('C(CH3)2 夾在兩個芳香環之間取 15（受阻），否則取 8.5（自由）', () => {
    const between = ok(computeTg(RDKit, '*c1cccc(c1)C(C)(C)c1cccc(c1)*'));
    expect(between.groups.find((g) => g.familyId === 'A.C(CH3)2')?.ygi).toBe(15);
    const free = ok(computeTg(RDKit, '*CC(C)(C)C*'));
    expect(free.groups.find((g) => g.familyId === 'A.C(CH3)2')?.ygi).toBe(8.5);
  });
});

describe('共軛狀態 n／c／cc（Table 6.1 B 表尾註與 p.140 文字）', () => {
  const stateOf = (smiles: string, family: string): string[] =>
    ok(computeTg(RDKit, smiles)).groups.filter((g) => g.familyId === family).map((g) => g.state);

  it('對伸苯基：兩側都是 CH2 → n；一側接 C=O → c；兩側接 C=O → cc', () => {
    expect(stateOf('*CCc1ccc(cc1)CC*', 'B.pC6H4')).toEqual(['n']);
    expect(stateOf('*CCc1ccc(cc1)C(=O)CC*', 'B.pC6H4')).toEqual(['c']);
    expect(stateOf('*C(=O)c1ccc(cc1)C(=O)*', 'B.pC6H4')).toEqual(['cc']);
  });

  it('間伸苯基的三種狀態取值：25／29／34', () => {
    const y = (s: string) => ok(computeTg(RDKit, s)).groups.find((g) => g.familyId === 'B.mC6H4')?.ygi;
    expect(y('*CCc1cccc(c1)CC*')).toBe(25);
    expect(y('*CCc1cccc(c1)C(=O)CC*')).toBe(29);
    expect(y('*C(=O)c1cccc(c1)C(=O)*')).toBe(34);
  });

  it('C=O：兩側脂肪 → n；一側芳香環 → c；兩側芳香環 → cc（用 m-伸苯基避開 Table 6.3 組合）', () => {
    expect(stateOf('*CCC(=O)CC*', 'B.C=O')).toEqual(['n']);
    expect(stateOf('*CCC(=O)c1cccc(c1)CC*', 'B.C=O')).toEqual(['c']);
    expect(stateOf('*c1cccc(c1)C(=O)c1cccc(c1)*', 'B.C=O')).toEqual(['cc']);
  });

  it('CONH：同樣依相鄰的芳香原子數判定', () => {
    expect(stateOf('*CCNC(=O)CC*', 'B.CONH')).toEqual(['n']);
    expect(stateOf('*CCNC(=O)c1cccc(c1)CC*', 'B.CONH')).toEqual(['c']);
    expect(stateOf('*c1cccc(c1)NC(=O)c1cccc(c1)*', 'B.CONH')).toEqual(['cc']);
  });

  it('連接點會跨單元判定：單元兩端的 C=O 與苯環互為鄰居', () => {
    // *–C(=O)–C6H4–C(=O)–CH2–*：C=O 的連接點對面是 CH2，另一個 C=O 的對面是苯環
    expect(ok(computeTg(RDKit, '*C(=O)c1ccc(cc1)C(=O)C*')).groups.map((g) => g.rowId).sort()).toContain('B.pC6H4.cc');
    // 沒有連接點的小分子：甲基不是 Table 6.1 的基團所以回報缺基團，但已配對的 C=O 仍只算一側共軛
    const small = computeTg(RDKit, 'CC(=O)c1cccc(c1)C');
    expect(small.status).toBe('missing');
    expect(small.status === 'invalid' ? [] : small.groups.filter((g) => g.familyId === 'B.C=O').map((g) => g.state)).toEqual(['c']);
  });
});

describe('切分完整性', () => {
  const smilesList = [
    ...BOOK_CASES.map((c) => c.smiles),
    '*CC(c1ccccc1)*',
    '*c1cccc(c1)C(C)(C)c1cccc(c1)*',
    '*Oc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC(O)C*',
    'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1',
    '*CC(=C)*',
    ...BACKBONE_TEMPLATES.map((t) => t.unitSmiles),
  ];

  it('各基團原子數加總 = 分子重原子數（缺基團時含缺的原子），沒有重複歸屬', () => {
    for (const smiles of smilesList) {
      const mol = RDKit.get_mol(smiles)!;
      const atoms = (JSON.parse(mol.get_json()) as { molecules: { atoms: { z?: number }[] }[] }).molecules[0].atoms;
      mol.delete();
      const heavy = atoms.filter((a) => (a.z ?? 6) > 1).length;
      const r = computeTg(RDKit, smiles);
      expect(r.status, smiles).not.toBe('invalid');
      if (r.status === 'invalid') continue;
      const grouped = r.groups.flatMap((g) => g.atoms);
      expect(new Set(grouped).size, `${smiles} 有原子重複歸屬`).toBe(grouped.length);
      const missing = r.status === 'missing' ? r.missing.length : 0;
      expect(grouped.length + missing, smiles).toBe(heavy);
    }
  });

  it('結果可重現：同一個 SMILES 連續算兩次完全相同', () => {
    for (const smiles of smilesList) {
      expect(computeTg(RDKit, smiles)).toEqual(computeTg(RDKit, smiles));
    }
  });
});

describe('缺基團：回傳缺基團與原子位置，不回傳數字', () => {
  it('2-萘基取代的乙烯基單元（Table 6.1 沒有）', () => {
    const r = computeTg(RDKit, '*CC(c1ccc2ccccc2c1)*');
    expect(r.status).toBe('missing');
    if (r.status !== 'missing') return;
    expect(r.missing.length).toBeGreaterThan(0);
    expect(r).not.toHaveProperty('tgK');
    // CH2 已配對；缺的是萘環上的碳與連到它的 CH
    expect(r.groups.map((g) => g.rowId)).toContain('A.CH2.gen');
    expect(r.missing.every((m) => m.element === 'C')).toBe(true);
  });

  it('雙酚茀環氧（Cardo，BT06）：茀環缺基團，BPA 組合不會誤配', () => {
    const bt06 = BACKBONE_TEMPLATES.find((t) => t.id === 'BT06');
    const r = computeTg(RDKit, bt06?.unitSmiles as string);
    expect(r.status).toBe('missing');
    if (r.status !== 'missing') return;
    expect(r.missing.length).toBeGreaterThanOrEqual(13); // 茀的 13 個碳（含兩個 sp3 以外的環碳），具體位置見 description
  });

  it('縮水甘油酯側鏈（PGMA）與含 OH 的苯環（酚醛）都回報缺基團', () => {
    expect(computeTg(RDKit, '*CC(C)(C(=O)OCC1CO1)*').status).toBe('missing');
    expect(computeTg(RDKit, '*Cc1cc(*)ccc1O').status).toBe('missing');
  });

  it('聚合物側鏈 –CH2– 回報缺基團（式 6.6–6.8 未實作），不以主鏈值代替', () => {
    const r = computeTg(RDKit, '*CC(CC)*');
    expect(r.status).toBe('missing');
    if (r.status !== 'missing') return;
    expect(r.missing.some((m) => m.description.includes('側鏈'))).toBe(true);
  });

  it('SMILES 無法解析回傳 invalid，不拋例外', () => {
    expect(computeTg(RDKit, 'C(C(').status).toBe('invalid');
  });
});

describe('BT05（雙酚 A 環氧單元）可計算', () => {
  it('O ×2、BPA 組合、–CH2– ×2、–CH(OH)–：ΣYgi = 113.4，M = 284.3', () => {
    const bt05 = BACKBONE_TEMPLATES.find((t) => t.id === 'BT05');
    const r = ok(computeTg(RDKit, bt05?.unitSmiles as string));
    expect(r.sumYg).toBeCloseTo(4 + 87 + 4 + 2.7 + 13 + 2.7, 9);
    expect(r.sumM).toBeCloseTo(16 + 194.3 + 16 + 14 + 30 + 14, 9);
  });
});

describe('任務 031：補收書中現成的整體基團', () => {
  const B = String.fromCharCode(92);
  const rows = (s: string) => ok(computeTg(RDKit, s)).groups.map((g) => g.rowId).sort();

  it('Table 6.3 的五個組合基團：Ygi 與 Mi 等於書中值（書頁 141–142）', () => {
    const cases: [string, number, number][] = [
      ['*c1ccc(Cc2ccc(*)cc2)cc1', 65, 166.2],
      ['*c1ccc(Oc2ccc(*)cc2)cc1', 67, 168.2],
      ['*c1ccc(Sc2ccc(*)cc2)cc1', 72, 184.2],
      ['*c1ccc(S(=O)(=O)c2ccc(*)cc2)cc1', 111, 216.3],
      ['*c1ccc(cc1)-c1ccc(*)cc1', 70, 152.2],
    ];
    for (const [s, y, m] of cases) {
      const r = ok(computeTg(RDKit, s));
      expect(r.groups, s).toHaveLength(1);
      expect([r.sumYg, r.sumM], s).toEqual([y, m]);
    }
  });

  it('ULTEM（Example 6.4，書頁 145）：2 × N-鄰苯二甲醯亞胺 95 + 2 × –O– 4 + BPA 組合 87 = 285', () => {
    const r = ok(computeTg(RDKit, '[*:1]N1C(=O)c2ccc(Oc3ccc(cc3)C(C)(C)c3ccc(Oc4ccc5C(=O)N([*:2])C(=O)c5c4)cc3)cc2C1=O'));
    expect(r.sumYg).toBeCloseTo(285, 9);
    expect(r.groups.filter((g) => g.familyId === 'C.phthalimide')).toHaveLength(2);
  });

  it('PMDA–ODA：均苯四甲醯亞胺 175 + –C6H4–O–C6H4– 67 = 242（較大的組合基團優先）', () => {
    const r = ok(computeTg(RDKit, '[*:1]N1C(=O)c2cc3C(=O)N(C(=O)c3cc2C1=O)c1ccc(Oc2ccc([*:2])cc2)cc1'));
    expect(r.groups.map((g) => g.rowId).sort()).toEqual(['C.PMDA', 'T.C6H4OC6H4']);
    expect(r.sumYg).toBe(242);
    expect(Math.abs(r.massDelta as number)).toBeLessThan(0.1); // Table 6.1 的 Mi 只印到小數一位
  });

  it('BPDA–PDA：N-鄰苯二甲醯亞胺旁的對伸苯基共軛狀態書中沒說清楚，維持缺基團，不自行決定', () => {
    const r = computeTg(RDKit, '[*:1]N1C(=O)c2ccc(cc2C1=O)-c1ccc2C(=O)N(C(=O)c2c1)c1ccc([*:2])cc1');
    expect(r.status).toBe('missing');
    if (r.status !== 'missing') return;
    expect(r.groups.filter((g) => g.familyId === 'C.phthalimide')).toHaveLength(2);
    expect(r.missing.some((m) => m.description.includes('共軛狀態，書中沒有說清楚'))).toBe(true);
  });

  it('–COO–：n／c／cc 依相鄰芳香原子數取 12.5／13.5／15（Table 6.1 B，Mi 取基團質量 44.0）', () => {
    const y = (s: string) => ok(computeTg(RDKit, s)).groups.find((g) => g.familyId === 'B.COO')?.ygi;
    expect(y('*CCC(=O)OCC*')).toBe(12.5);
    expect(y('*CCC(=O)Oc1ccc(*)cc1')).toBe(13.5);
    expect(y('*c1ccc(cc1)C(=O)Oc1ccc(*)cc1')).toBe(15);
  });

  it('–SO2–：n／c／cc 取 32.5／36／40；–S–、–CH(CH3)–、–C(C6H5)2– 等 Table 6.1 A 的值', () => {
    const y = (s: string, f: string) => ok(computeTg(RDKit, s)).groups.find((g) => g.familyId === f)?.ygi;
    expect(y('*CCS(=O)(=O)CC*', 'B.SO2')).toBe(32.5);
    expect(y('*CCS(=O)(=O)c1ccc(*)cc1', 'B.SO2')).toBe(36);
    expect(y('*c1ccc(cc1)S(=O)(=O)c1ccc(*)cc1', 'T.C6H4SO2C6H4')).toBe(111);
    expect(y('*CCSCC*', 'A.S')).toBe(8);
    expect(y('*CC([*:2])C', 'A.CH(CH3)')).toBe(8);
    expect(y('*CC(*)(c1ccccc1)c1ccccc1', 'A.C(C6H5)2')).toBe(65);
    expect(y('*CC(*)(C)c1ccccc1', 'A.C(CH3)(C6H5)')).toBe(51);
    expect(y('*CC(*)c1ccc(C)cc1', 'A.CH(C6H4CH3)')).toBe(41.2);
  });

  it('–CH=CH–：依 SMILES 的順反標示取 cis 3.8／trans 7.4；沒有標示就回報缺基團', () => {
    const y = (s: string) => ok(computeTg(RDKit, s)).groups.find((g) => g.familyId === 'B.CH=CH')?.ygi;
    expect(y('[*:1]CC/C=C/CC[*:2]')).toBe(7.4);
    expect(y(`[*:1]CC/C=C${B}CC[*:2]`)).toBe(3.8);
    const r = computeTg(RDKit, '[*:1]CCC=CCC[*:2]');
    expect(r.status).toBe('missing');
    if (r.status === 'missing') expect(r.missing.some((m) => m.description.includes('沒有順反標示'))).toBe(true);
  });

  it('–Si(CH3)2–：夾在兩個芳香環之間取受阻 16，否則取自由 7（比照 –C(CH3)2–，待使用者確認）', () => {
    const y = (s: string) => ok(computeTg(RDKit, s)).groups.find((g) => g.familyId === 'A.Si(CH3)2')?.ygi;
    expect(y('*c1ccc(cc1)[Si](C)(C)c1ccc(*)cc1')).toBe(16);
    expect(y('*CC[Si](C)(C)CC*')).toBe(7);
  });

  it('萘二基：1,4- 取 50、2,6- 取 68，其他位置（2,7-）不配對', () => {
    const y = (s: string, f: string) => ok(computeTg(RDKit, s)).groups.find((g) => g.familyId === f)?.ygi;
    expect(y('*c1ccc(*)c2ccccc12', 'B.naph14')).toBe(50);
    expect(y('*c1ccc2cc(*)ccc2c1', 'B.naph26')).toBe(68);
    expect(computeTg(RDKit, '*c1ccc2ccc(*)cc2c1').status).toBe('missing');
  });

  it('環狀酸酐（MHHPA 型）仍回報缺基團；鏈上酸酐取 22', () => {
    expect(computeTg(RDKit, 'O=C1OC(=O)C2CCCCC12').status).toBe('missing');
    expect(rows('*CCC(=O)OC(=O)CC*')).toContain('B.COOCO');
    expect(ok(computeTg(RDKit, '*CCC(=O)OC(=O)CC*')).sumYg).toBeCloseTo(2.7 * 4 + 22, 9);
  });

  it('切分完整性：新基團的結構，各基團原子數加總 = 重原子數', () => {
    for (const s of ['[*:1]N1C(=O)c2cc3C(=O)N(C(=O)c3cc2C1=O)c1ccc(Oc2ccc([*:2])cc2)cc1', '*c1ccc(S(=O)(=O)c2ccc(*)cc2)cc1', '*CCC(=O)OC(=O)CC*']) {
      const r = ok(computeTg(RDKit, s));
      const mol = RDKit.get_mol(s)!;
      const heavy = (JSON.parse(mol.get_json()) as { molecules: { atoms: { z?: number }[] }[] }).molecules[0].atoms.filter((a) => (a.z ?? 6) > 1).length;
      mol.delete();
      const grouped = r.groups.flatMap((g) => g.atoms);
      expect(new Set(grouped).size).toBe(grouped.length);
      expect(grouped.length, s).toBe(heavy);
    }
  });
});
