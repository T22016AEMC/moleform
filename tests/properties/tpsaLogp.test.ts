// TPSA 與 Crippen LogP 的測試（任務 028）：RDKit 的結果與論文表的貢獻值手算比對（差 ≤ 0.01）；聚合物單元把連接點換成甲基後計算並標示。
// 貢獻值是論文 Table 1 圖像（Ertl, Rohde & Selzer 2000 書頁 3715；Wildman & Crippen 1999 書頁 869）的獨立抄錄，不呼叫 RDKit 取值。
import { beforeAll, describe, expect, it } from 'vitest';
import { CAPPED_NOTE, LOGP_MODEL, TPSA_LOGP_DISCLAIMER, TPSA_MODEL, computeTpsaLogp, type TpsaLogpResult } from '../../src/core/properties/tpsaLogp';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

/** Ertl 2000 Table 1（Å²） */
const ERTL = {
  N_tert: 3.24, // [N](-*)(-*)-*
  NH_sec: 12.03, // [NH](-*)-*
  NH2: 26.02, // [NH2]-*
  O_ether: 9.23, // [O](-*)-*
  O_carbonyl: 17.07, // [O]=*
  OH: 20.23, // [OH]-*
} as const;

/** Wildman & Crippen 1999 Table 1 的 logP 貢獻（原子類型：說明） */
const CRIPPEN = {
  C1: 0.1441, // 1°、2° 脂肪碳：'[CH3]C'
  C3: -0.2035, // 1°、2° 接雜原子的碳：'[CH2X4](N,O,...)'
  C5: -0.2783, // C=雜原子
  C18: 0.1581, // 芳香 CH
  C23: 0.5437, // 4° 芳香碳接 O
  H1: 0.123, // 接碳的氫
  H2: -0.2677, // 醇／酚的氫
  H3: 0.2142, // 接氮的氫
  N1: -1.019, // 1° 胺（含醯胺的 NH2）
  N2: -0.7096, // 2° 胺
  O2: -0.2893, // 醇、酚的 O
  O3: -0.0684, // 脂肪醚、酯的單鍵 O
  O4: -0.4195, // 芳香醚 O
  O9: -0.1526, // 脂肪羰基 O（接碳與雜原子）
} as const;

const sum = <K extends string>(table: Record<K, number>, parts: [K, number][]): number => parts.reduce((s, [k, n]) => s + n * table[k], 0);
const ok = (r: TpsaLogpResult) => {
  if (r.status !== 'ok') throw new Error(`預期可計算，實際 ${r.status}：${JSON.stringify(r)}`);
  return r;
};

describe('D-3：TPSA 與 Crippen LogP，RDKit 與論文表貢獻值手算相差 ≤ 0.01', () => {
  const cases: {
    name: string;
    kind: string;
    smiles: string;
    tpsa: [keyof typeof ERTL, number][];
    logp: [keyof typeof CRIPPEN, number][];
  }[] = [
    {
      name: '乙醇',
      kind: '羥基',
      smiles: 'CCO',
      tpsa: [['OH', 1]],
      logp: [['C1', 1], ['C3', 1], ['O2', 1], ['H1', 5], ['H2', 1]],
    },
    {
      name: '乙酸乙酯',
      kind: '酯（單鍵 O 與羰基 O）',
      smiles: 'CCOC(=O)C',
      tpsa: [['O_ether', 1], ['O_carbonyl', 1]],
      logp: [['C1', 2], ['C3', 1], ['O3', 1], ['C5', 1], ['O9', 1], ['H1', 8]],
    },
    {
      name: '乙醯胺',
      kind: '醯胺',
      smiles: 'CC(N)=O',
      tpsa: [['NH2', 1], ['O_carbonyl', 1]],
      logp: [['C1', 1], ['C5', 1], ['N1', 1], ['O9', 1], ['H1', 3], ['H3', 2]],
    },
    {
      name: '二乙胺',
      kind: '胺',
      smiles: 'CCNCC',
      tpsa: [['NH_sec', 1]],
      logp: [['C1', 2], ['C3', 2], ['N2', 1], ['H1', 10], ['H3', 1]],
    },
    {
      name: '2-甲氧基酚（愈創木酚，Wildman–Crippen 論文 Table 2 的例子）',
      kind: '羥基＋芳香醚',
      smiles: 'COc1ccccc1O',
      tpsa: [['O_ether', 1], ['OH', 1]],
      logp: [['C3', 1], ['C18', 4], ['C23', 2], ['H1', 7], ['H2', 1], ['O2', 1], ['O4', 1]],
    },
  ];

  for (const c of cases) {
    it(`${c.name}（${c.kind}）：${c.smiles}`, () => {
      const r = ok(computeTpsaLogp(RDKit, c.smiles));
      const tpsaHand = sum(ERTL, c.tpsa);
      const logpHand = sum(CRIPPEN, c.logp);
      expect(Math.abs(r.tpsa - tpsaHand), `TPSA 程式 ${r.tpsa}、手算 ${tpsaHand}`).toBeLessThanOrEqual(0.01);
      expect(Math.abs(r.logP - logpHand), `LogP 程式 ${r.logP}、手算 ${logpHand}`).toBeLessThanOrEqual(0.01);
    });
  }

  it('手算數值本身（報告對照表用）', () => {
    expect(Number(sum(ERTL, [['OH', 1]]).toFixed(2))).toBe(20.23);
    expect(Number(sum(ERTL, [['O_ether', 1], ['O_carbonyl', 1]]).toFixed(2))).toBe(26.3);
    expect(Number(sum(ERTL, [['NH2', 1], ['O_carbonyl', 1]]).toFixed(2))).toBe(43.09);
    expect(Number(sum(ERTL, [['NH_sec', 1]]).toFixed(2))).toBe(12.03);
    expect(Number(sum(CRIPPEN, [['C1', 1], ['C3', 1], ['O2', 1], ['H1', 5], ['H2', 1]]).toFixed(4))).toBe(-0.0014);
    expect(Number(sum(CRIPPEN, [['C1', 2], ['C3', 1], ['O3', 1], ['C5', 1], ['O9', 1], ['H1', 8]]).toFixed(4))).toBe(0.5694);
    expect(Number(sum(CRIPPEN, [['C1', 1], ['C5', 1], ['N1', 1], ['O9', 1], ['H1', 3], ['H3', 2]]).toFixed(4))).toBe(-0.5084);
    expect(Number(sum(CRIPPEN, [['C1', 2], ['C3', 2], ['N2', 1], ['H1', 10], ['H3', 1]]).toFixed(4))).toBe(0.6158);
    expect(Number(sum(CRIPPEN, [['C3', 1], ['C18', 4], ['C23', 2], ['H1', 7], ['H2', 1], ['O2', 1], ['O4', 1]]).toFixed(4))).toBe(1.4008);
  });

  it('Wildman–Crippen 論文 Table 2 印的愈創木酚計算值 1.40（捨入到兩位）', () => {
    expect(Math.abs(ok(computeTpsaLogp(RDKit, 'COc1ccccc1O')).logP - 1.4)).toBeLessThanOrEqual(0.005);
  });

  it('Ertl 論文 Table 3 印的 TPSA（捨入到一位）：美托洛爾 50.7、阿替洛爾 84.6、普拉洛爾 70.6、甘露醇 121.4', () => {
    const drugs: [string, string, number, [keyof typeof ERTL, number][]][] = [
      ['美托洛爾', 'COCCc1ccc(OCC(O)CNC(C)C)cc1', 50.7, [['O_ether', 2], ['OH', 1], ['NH_sec', 1]]],
      ['阿替洛爾', 'CC(C)NCC(O)COc1ccc(CC(N)=O)cc1', 84.6, [['NH_sec', 1], ['O_ether', 1], ['OH', 1], ['O_carbonyl', 1], ['NH2', 1]]],
      ['甘露醇', 'OCC(O)C(O)C(O)C(O)CO', 121.4, [['OH', 6]]],
    ];
    for (const [name, smiles, paper, parts] of drugs) {
      const r = ok(computeTpsaLogp(RDKit, smiles));
      expect(Math.abs(r.tpsa - sum(ERTL, parts)), `${name} 手算`).toBeLessThanOrEqual(0.01);
      expect(Math.abs(r.tpsa - paper), `${name} 論文 Table 3`).toBeLessThanOrEqual(0.05);
    }
  });
});

describe('輸出單位與模型名稱', () => {
  it('TPSA 為 Å²、LogP 無單位；附模型名稱', () => {
    const r = ok(computeTpsaLogp(RDKit, 'CCO'));
    expect(r.models.tpsa).toBe(TPSA_MODEL);
    expect(r.models.logP).toBe(LOGP_MODEL);
    expect(TPSA_MODEL).toMatch(/Ertl/);
    expect(LOGP_MODEL).toMatch(/Wildman/);
    expect(TPSA_LOGP_DISCLAIMER).toMatch(/小分子/);
  });

  it('RDKit 的 tpsa 預設只計 N、O，不含 S、P（硫醇、膦的 TPSA 為 0）', () => {
    expect(ok(computeTpsaLogp(RDKit, 'CCS')).tpsa).toBe(0);
    expect(ok(computeTpsaLogp(RDKit, 'CP(C)C')).tpsa).toBe(0);
  });

  it('專案的 RDKit 有提供 tpsa 與 CrippenClogP 描述子', () => {
    const mol = RDKit.get_mol('CCO');
    if (!mol) throw new Error('RDKit 無法解析');
    const d = JSON.parse(mol.get_descriptors()) as Record<string, unknown>;
    mol.delete();
    expect(typeof d.tpsa).toBe('number');
    expect(typeof d.CrippenClogP).toBe('number');
  });
});

describe('聚合物重複單元（含 *）：連接點換成甲基後計算（D05，使用者 2026-10-31 決定）', () => {
  it('結果等於把 * 直接換成 C 的小分子，並標示「以甲基封端的單元估算；LogP 僅供相對比較」', () => {
    const pairs: [string, string][] = [
      ['[*:1]CC[*:2]', 'CCCC'],
      ['*CC*', 'CCCC'],
      ['[*:1]CC([*:2])(C)C(=O)OCC1CO1', 'CCC(C)(C)C(=O)OCC1CO1'.replace('CCC(C)(C)', 'CCC(C)(C)')],
      ['[*:1]Cc1cc([*:2])ccc1O', 'CCc1cc(C)ccc1O'],
    ];
    for (const [unit, capped] of pairs) {
      const r = ok(computeTpsaLogp(RDKit, unit));
      expect(r.capped, unit).toBe(true);
      expect(r.note).toBe(CAPPED_NOTE);
      expect(CAPPED_NOTE).toBe('以甲基封端的單元估算；LogP 僅供相對比較');
      const small = ok(computeTpsaLogp(RDKit, capped));
      expect(small.capped).toBe(false);
      expect(small.note).toBeNull();
      expect(r.tpsa, unit).toBeCloseTo(small.tpsa, 9);
      expect(r.logP, unit).toBeCloseTo(small.logP, 9);
    }
  });
  it('單元 B（萘基次甲基）封端後 = 2-異丙基萘；TPSA 0（沒有 N、O）', () => {
    const r = ok(computeTpsaLogp(RDKit, '[*:1]C([*:2])c1ccc2ccccc2c1'));
    expect(r.tpsa).toBe(0);
    expect(r.computedSmiles).toBe('CC(C)c1ccc2ccccc2c1');
  });
  it('連接點只剩 * 的字串無法計算', () => {
    expect(computeTpsaLogp(RDKit, '[*]').status).toBe('invalid');
  });
});

describe('無效輸入', () => {
  it('SMILES 無法解析、空字串、多個分子', () => {
    expect(computeTpsaLogp(RDKit, 'C(C').status).toBe('invalid');
    expect(computeTpsaLogp(RDKit, '').status).toBe('invalid');
    expect(computeTpsaLogp(RDKit, 'CCO.CC').status).toBe('invalid');
  });
});
