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
