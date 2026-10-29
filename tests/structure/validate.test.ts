// 結構驗證的行為測試（任務 010）：只檢查程式行為，不判斷化學正確性（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { detectFormat, validateStructure } from '../../src/core/structure/validate';
import { v2000, v3000 } from './molfiles';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const BADGE = 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1';
const VALID = [
  ['乙醇', 'CCO'],
  ['苯', 'c1ccccc1'],
  ['L-丙胺酸', 'C[C@@H](C(=O)O)N'],
  ['反式 2-丁烯', 'C/C=C/C'],
  ['順式 2-丁烯', 'C/C=C\\C'],
  ['BADGE', BADGE],
] as const;

describe('合法結構', () => {
  it.each(VALID)('%s 通過驗證並產生 canonical SMILES 與 Molfile', (_name, smiles) => {
    const v = validateStructure(RDKit, smiles);
    expect(v.valid).toBe(true);
    expect(v.empty).toBe(false);
    expect(v.canonicalSmiles).not.toBe('');
    expect(v.molblock).toContain('M  END');
    expect(v.molblock).toContain('V2000');
    expect(v.problems).toEqual([]);
  });

  it('Molfile 的原子數與 SMILES 一致（乙醇 3 個重原子）', () => {
    const v = validateStructure(RDKit, 'CCO');
    expect(v.molblock.split('\n')[3].trim().startsWith('3  2')).toBe(true);
  });
});

describe('手性與 E/Z 保留：SMILES → Molfile → 再解析', () => {
  it.each(VALID)('%s 的 canonical SMILES 不變', (_name, smiles) => {
    const first = validateStructure(RDKit, smiles);
    const second = validateStructure(RDKit, first.molblock);
    expect(second.valid).toBe(true);
    expect(second.canonicalSmiles).toBe(first.canonicalSmiles);
  });

  it('手性分子的 canonical SMILES 仍含手性標記，E/Z 仍含雙鍵方向', () => {
    const chiral = validateStructure(RDKit, validateStructure(RDKit, 'C[C@@H](C(=O)O)N').molblock);
    expect(chiral.canonicalSmiles).toMatch(/@/);
    const ez = validateStructure(RDKit, validateStructure(RDKit, 'C/C=C/C').molblock);
    expect(ez.canonicalSmiles).toMatch(/[/\\]/);
  });

  it('L 與 D 丙胺酸、反式與順式 2-丁烯來回後仍然不同', () => {
    const smiles = (s: string) => validateStructure(RDKit, validateStructure(RDKit, s).molblock).canonicalSmiles;
    expect(smiles('C[C@@H](C(=O)O)N')).not.toBe(smiles('C[C@H](C(=O)O)N'));
    expect(smiles('C/C=C/C')).not.toBe(smiles('C/C=C\\C'));
  });
});

describe('不合法結構', () => {
  it('C1CC（環未閉合）', () => {
    const v = validateStructure(RDKit, 'C1CC');
    expect(v.valid).toBe(false);
    expect(v.problems).toHaveLength(1);
    expect(v.problems[0]).toMatchObject({ level: 'error', code: 'UNPARSABLE' });
    expect(v.problems[0].message).toContain('無法解析');
  });

  it('C(C)(C)(C)(C)C（碳五價）是價數錯誤，不是語法錯誤', () => {
    const v = validateStructure(RDKit, 'C(C)(C)(C)(C)C');
    expect(v.valid).toBe(false);
    expect(v.problems[0]).toMatchObject({ level: 'error', code: 'SANITIZATION_FAILED' });
    expect(v.problems[0].message).toContain('價數');
  });

  it('xyz', () => {
    const v = validateStructure(RDKit, 'xyz');
    expect(v.valid).toBe(false);
    expect(v.problems[0]).toMatchObject({ level: 'error', code: 'UNPARSABLE' });
  });

  it('不合法時不回傳 Molfile 與 canonical SMILES', () => {
    const v = validateStructure(RDKit, 'C1CC');
    expect(v.molblock).toBe('');
    expect(v.canonicalSmiles).toBe('');
  });

  it('五元芳香環無法 kekulize 時視為價數／芳香性錯誤', () => {
    expect(validateStructure(RDKit, 'c1cccc1').problems[0].code).toBe('SANITIZATION_FAILED');
  });
});

describe('拒絕：反應式與查詢結構（D31）', () => {
  it('反應 SMILES', () => {
    const v = validateStructure(RDKit, 'CCO>>CC=O');
    expect(v.valid).toBe(false);
    expect(v.problems).toHaveLength(1);
    expect(v.problems[0]).toMatchObject({ level: 'error', code: 'REACTION' });
    expect(v.problems[0].message).toContain('MoleForm 只接受分子結構');
  });

  it('反應 SMILES 含試劑（A>B>C）', () => {
    expect(validateStructure(RDKit, 'CCO.[O]>[Pd]>CC=O').problems[0].code).toBe('REACTION');
  });

  it.each([['[C,N]'], ['[#6]~[#7]'], ['C~C'], ['[C;R]'], ['[!C]'], ['*@*']])('SMARTS 查詢特徵 %s', (smarts) => {
    const v = validateStructure(RDKit, smarts);
    expect(v.valid).toBe(false);
    expect(v.problems[0]).toMatchObject({ level: 'error', code: 'QUERY' });
    expect(v.problems[0].message).toContain('MoleForm 只接受分子結構');
  });

  it('Molfile 含任意原子 A（V2000）', () => {
    const mol = v2000({ atoms: ['C', 'A'], bonds: [[1, 2, 1]] });
    expect(validateStructure(RDKit, mol).problems[0].code).toBe('QUERY');
  });

  it('Molfile 含查詢鍵（V2000 鍵型 8 = 任意）', () => {
    const mol = v2000({ atoms: ['C', 'C'], bonds: [[1, 2, 8]] });
    expect(validateStructure(RDKit, mol).problems[0].code).toBe('QUERY');
  });

  it('Molfile 含原子清單（V2000）', () => {
    const mol = v2000({ atoms: ['C', 'L'], bonds: [[1, 2, 1]], extra: ['M  ALS   2  2 F N   O   '] });
    expect(validateStructure(RDKit, mol).problems[0].code).toBe('QUERY');
  });

  it('Molfile 含查詢原子（V3000）', () => {
    const mol = v3000({ atoms: ['C', 'Q'], bonds: [[1, 2, 1]] });
    expect(validateStructure(RDKit, mol).problems[0].code).toBe('QUERY');
  });

  it('Molfile 含查詢鍵（V3000 鍵型 5）', () => {
    const mol = v3000({ atoms: ['C', 'C'], bonds: [[1, 2, 5]] });
    expect(validateStructure(RDKit, mol).problems[0].code).toBe('QUERY');
  });

  it('反應檔（$RXN）', () => {
    expect(validateStructure(RDKit, '$RXN\n\n  test\n\n  1  1\n$MOL\n').problems[0].code).toBe('REACTION');
  });

  it('R 基團標示', () => {
    const mol = v2000({ atoms: ['C', 'R#'], bonds: [[1, 2, 1]], extra: ['M  RGP  1   2   1'] });
    expect(validateStructure(RDKit, mol).problems[0].code).toBe('RGROUP');
  });

  it('聚合物重複單元記號（SRU）', () => {
    const mol = v2000({ atoms: ['C', 'C', 'C'], bonds: [[1, 2, 1], [2, 3, 1]], extra: ['M  STY  1   1 SRU', 'M  SAL   1  1   2'] });
    expect(validateStructure(RDKit, mol).problems[0].code).toBe('POLYMER');
  });
});

describe('允許並提示：連接點 *', () => {
  it.each([['*CC*'], ['[*:1]CC[*:2]']])('%s 合法，附連接點提示', (smiles) => {
    const v = validateStructure(RDKit, smiles);
    expect(v.valid).toBe(true);
    expect(v.canonicalSmiles).toContain('*');
    expect(v.problems).toHaveLength(1);
    expect(v.problems[0]).toMatchObject({ level: 'info', code: 'CONNECTION_POINT' });
    expect(v.problems[0].message).toBe('含連接點 *；均聚物可在「均聚物設定」填入 Mw 與 PDI（或改填 Mn、DP），共聚物等功能在 Phase 5 提供');
  });

  it('匯出的 Molfile 把連接點寫成 *（不是 RDKit 預設的 R），映射編號仍在', () => {
    const v = validateStructure(RDKit, '[*:1]CC[*:2]');
    const atomLines = v.molblock.split('\n').slice(4, 8);
    expect(atomLines.filter((l) => l.slice(31, 34).trim() === '*')).toHaveLength(2);
    expect(atomLines.some((l) => l.slice(31, 34).trim() === 'R')).toBe(false);
    expect(atomLines.map((l) => l.slice(60, 63).trim())).toEqual(['1', '0', '0', '2']);
  });

  it('連接點經 Molfile 來回後仍在，原子映射編號保留', () => {
    const first = validateStructure(RDKit, '[*:1]CC[*:2]');
    const second = validateStructure(RDKit, first.molblock);
    expect(second.valid).toBe(true);
    expect(second.canonicalSmiles).toBe(first.canonicalSmiles);
    expect(second.canonicalSmiles).toContain('[*:1]');
    expect(second.canonicalSmiles).toContain('[*:2]');
  });

  it('Molfile 中以 * 表示的連接點（V2000、V3000）允許', () => {
    const a = validateStructure(RDKit, v2000({ atoms: ['*', 'C', '*'], bonds: [[1, 2, 1], [2, 3, 1]] }));
    expect(a.valid, JSON.stringify(a.problems)).toBe(true);
    expect(a.problems[0].code).toBe('CONNECTION_POINT');
    const b = validateStructure(RDKit, v3000({ atoms: ['*', 'C', '*'], bonds: [[1, 2, 1], [2, 3, 1]] }));
    expect(b.valid, JSON.stringify(b.problems)).toBe(true);
    expect(b.problems[0].code).toBe('CONNECTION_POINT');
  });
});

describe('空白結構', () => {
  it.each([[''], ['   '], ['\n\t ']])('輸入 %j 提示尚未輸入結構，不是錯誤', (input) => {
    const v = validateStructure(RDKit, input);
    expect(v.empty).toBe(true);
    expect(v.valid).toBe(false);
    expect(v.problems).toEqual([{ level: 'info', code: 'EMPTY_INPUT', message: '尚未輸入結構。' }]);
  });

  it('沒有原子的 Molfile（Ketcher 空畫布）視為空白', () => {
    const v = validateStructure(RDKit, v3000({ atoms: [], bonds: [] }));
    expect(v.empty).toBe(true);
    expect(v.problems[0].level).toBe('info');
  });
});

describe('格式判斷', () => {
  it('單行為 SMILES，含 M  END 或 V2000／V3000 計數行者為 Molfile', () => {
    expect(detectFormat('CCO')).toBe('smiles');
    expect(detectFormat(v2000({ atoms: ['C'], bonds: [] }))).toBe('molfile');
    expect(detectFormat(v3000({ atoms: ['C'], bonds: [] }))).toBe('molfile');
  });
});

describe('匯出一律是 V2000', () => {
  // Ketcher 對有立體中心的分子會寫出 abs 標記（V3000 的 MDLV30/STEABS）；RDKit 預設會因此改寫成 V3000。
  const withAbsGroup = [
    '', '     RDKit          2D', '', '  0  0  0  0  0  0  0  0  0  0999 V3000',
    'M  V30 BEGIN CTAB', 'M  V30 COUNTS 6 5 0 0 0', 'M  V30 BEGIN ATOM',
    'M  V30 1 C 7.308020 -7.853530 0.000000 0', 'M  V30 2 C 7.808020 -6.987500 0.000000 0',
    'M  V30 3 C 8.808020 -6.987500 0.000000 0', 'M  V30 4 O 9.308020 -7.853530 0.000000 0',
    'M  V30 5 O 9.308020 -6.121470 0.000000 0', 'M  V30 6 N 7.308020 -6.121470 0.000000 0',
    'M  V30 END ATOM', 'M  V30 BEGIN BOND', 'M  V30 1 1 2 1 CFG=3', 'M  V30 2 1 2 3', 'M  V30 3 2 3 4',
    'M  V30 4 1 3 5', 'M  V30 5 1 2 6', 'M  V30 END BOND',
    'M  V30 BEGIN COLLECTION', 'M  V30 MDLV30/STEABS ATOMS=(1 2)', 'M  V30 END COLLECTION',
    'M  V30 END CTAB', 'M  END', '',
  ].join('\n');

  it('V3000 + abs 標記的輸入，輸出仍是 V2000，立體資訊保留', () => {
    const v = validateStructure(RDKit, withAbsGroup);
    expect(v.valid).toBe(true);
    expect(v.molblock.split('\n')[3]).toContain('V2000');
    expect(v.canonicalSmiles).toBe('C[C@H](N)C(=O)O');
    expect(validateStructure(RDKit, v.molblock).canonicalSmiles).toBe(v.canonicalSmiles);
  });
});

describe('多片段結構', () => {
  it('CC.O 合法，提示含 2 個分離片段', () => {
    const v = validateStructure(RDKit, 'CC.O');
    expect(v.valid).toBe(true);
    expect(v.problems).toEqual([{ level: 'info', code: 'MULTIPLE_FRAGMENTS', message: '含 2 個分離片段' }]);
  });

  it('CC.O.N 提示 3 個；CCO 與 BADGE 沒有此提示', () => {
    expect(validateStructure(RDKit, 'CC.O.N').problems[0].message).toBe('含 3 個分離片段');
    expect(validateStructure(RDKit, 'CCO').problems).toEqual([]);
    expect(validateStructure(RDKit, BADGE).problems).toEqual([]);
  });

  it('連接點與多片段可同時提示', () => {
    const codes = validateStructure(RDKit, '*C.O').problems.map((p) => p.code);
    expect(codes).toEqual(['CONNECTION_POINT', 'MULTIPLE_FRAGMENTS']);
  });
});

describe('座標', () => {
  it('SMILES 輸入會產生 2D 座標；Molfile 已有的座標不被改動', () => {
    const first = validateStructure(RDKit, 'CCO');
    const second = validateStructure(RDKit, first.molblock);
    const coords = (m: string) => m.split('\n').slice(4, 7).join('\n');
    expect(coords(second.molblock)).toBe(coords(first.molblock));
    expect(coords(first.molblock)).toMatch(/\d\.\d{4}/);
  });
});
