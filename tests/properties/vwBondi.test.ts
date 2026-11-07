// Bondi (1964) 補充基團的測試（任務 037，D22、D59）：資料表格式、Mi 核對、每個基團的正反例、手算驗證、
// 書已有的結構（補充前後逐字相同）、Bondi 判為「不能算」的結構仍回報缺基團、切分完整性。只檢查程式與資料照規則運作（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import { formatIssue } from '../../src/core/data/types';
import {
  VW_BONDI_COLUMNS,
  VW_BONDI_CORRECTION_COUNT,
  VW_BONDI_GROUP_COUNT,
  VW_BONDI_LABEL,
  VW_GROUPS_BONDI,
  bundledVwGroupsBondiText,
  checkVwGroupsBondiSmarts,
  readVwGroupsBondi,
  validateVwGroupsBondi,
} from '../../src/core/data/vwGroupsBondi';
import { bundledVwGroupsText, readVwGroups } from '../../src/core/data/vwGroups';
import { checkVwGroupMasses, computeVdwVolume, countVwGroups, vwMatches, type VwResult } from '../../src/core/properties/vanDerWaalsVolume';
import { computeCte } from '../../src/core/properties/cte';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { JSMol, RDKitModule } from '../../src/core/rdkit/types';
import { BOOK_VW_CASES, TABLE42, VW_GROUP_CASES } from './vwCases';
import { TABLE_BONDI as B, VW_BONDI_CASES } from './vwBondiCases';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const table = readVwGroupsBondi(bundledVwGroupsBondiText);
const HEADER = VW_BONDI_COLUMNS.join(',');
const line = (cells: Partial<Record<(typeof VW_BONDI_COLUMNS)[number], string>>): string =>
  VW_BONDI_COLUMNS.map((c) => {
    const v = cells[c] ?? '';
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');
const GOOD_SOURCE = 'Bondi, J. Phys. Chem. 68, 441 (1964), Table XVI（p.450）：NH2 10.54；SMARTS 自行撰寫（D22）';
const GOOD = {
  id: 'BG01',
  基團名稱: '–NH2',
  SMARTS: '[NX3H2;D1]',
  原子數: '1',
  VW: '10.54',
  Mi: '16.02',
  '二價／非二價': '非二價',
  出處: GOOD_SOURCE,
  稽核狀態: '待使用者審',
  備註: 'x',
  來源等級: 'Bondi 1964 原始論文（一手，D55）',
  修正量: '',
};
const withFirstRow = (first: string): string => {
  const lines = bundledVwGroupsBondiText.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l !== '');
  // 每一列在 CSV 裡可能含換行以外的內容；資料表每列單行，直接取第 3 列以後
  return [HEADER, first, ...lines.slice(2)].join('\n');
};
const issuesOf = (text: string): string[] => {
  const t = readVwGroupsBondi(text);
  return [...t.issues, ...validateVwGroupsBondi(t), ...checkVwGroupsBondiSmarts(RDKit, t)].map(formatIssue);
};

const ok = (r: VwResult) => {
  if (r.status !== 'ok') throw new Error(`預期可計算，實際 ${r.status}：${JSON.stringify(r)}`);
  return r;
};
const vwOf = (smiles: string): number => ok(computeVdwVolume(RDKit, smiles)).vw;
const hand = (parts: [keyof typeof TABLE42, number][]): number => parts.reduce((s, [g, n]) => s + n * TABLE42[g], 0);

function withMol<T>(smiles: string, fn: (mol: JSMol) => T): T {
  const mol = RDKit.get_mol(smiles);
  if (!mol || !mol.is_valid()) throw new Error(`RDKit 無法解析：${smiles}`);
  try {
    return fn(mol);
  } finally {
    mol.delete();
  }
}
function matchesOf(smarts: string, smiles: string): number[][] {
  const q = RDKit.get_qmol(smarts);
  if (!q || !q.is_valid()) throw new Error(`SMARTS 無法解析：${smarts}`);
  try {
    return withMol(smiles, (mol) => vwMatches(mol, q));
  } finally {
    q.delete();
  }
}

describe('vw_groups_bondi.csv（內建資料）', () => {
  it('讀取、格式檢查與 RDKit 檢查沒有任何問題', () => {
    const all = [...table.issues, ...validateVwGroupsBondi(table), ...checkVwGroupsBondiSmarts(RDKit, table)];
    expect(all.map(formatIssue)).toEqual([]);
  });

  it('13 個基團（BG）與 5 個修正（BC），每列有 Bondi 1964 出處（表號與頁碼）、來源等級、稽核狀態「待使用者審」', () => {
    expect(VW_BONDI_GROUP_COUNT).toBe(13);
    expect(VW_BONDI_CORRECTION_COUNT).toBe(5);
    expect(table.rows.filter((r) => r.kind === 'group')).toHaveLength(13);
    expect(table.rows.filter((r) => r.kind === 'correction')).toHaveLength(5);
    for (const r of table.rows) {
      expect(r.source).toMatch(/Bondi, J\. Phys\. Chem\. 68, 441 \(1964\)/);
      expect(r.source).toMatch(/Table (XV|XVI|XVII)/);
      expect(r.source).toMatch(/p\.\s?4(49|50)/);
      expect(r.sourceLevel).toMatch(/Bondi 1964 原始論文/);
      expect(r.audit).toMatch(/待使用者審/);
    }
  });

  it('數值與 Bondi 圖上讀到的值逐項相同（Table XV p.449、Table XVI、XVII p.450）', () => {
    const vw = (id: string) => table.rows.find((r) => r.id === id)?.vw;
    expect(vw('BG02')).toBe(B.CO);
    expect(vw('BG03')).toBe(B.CO);
    expect(vw('BG04')).toBe(B.NH2);
    expect(vw('BG05')).toBe(B.P);
    expect(vw('BG06')).toBe(B.CarAlkyl);
    expect(vw('BG07')).toBe(B.CH2);
    expect(vw('BG08')).toBe(B.CH);
    expect(vw('BG09')).toBe(B.Cq);
    expect(vw('BG10')).toBe(B.OPhenylEther);
    expect(vw('BG11')).toBe(B.OAlkylEther);
    expect(vw('BG12')).toBe(B.OPhenylEther);
    expect(vw('BG13')).toBe(B.OAlkylEther);
    expect(vw('BG01')).toBeCloseTo(B.Cq + 4 * B.CarAlkyl, 9);
    const c = (id: string) => table.rows.find((r) => r.id === id)?.correction;
    for (const id of ['BC01', 'BC02', 'BC03']) expect(c(id)).toBe(-B.ringBenzo);
    for (const id of ['BC04', 'BC05']) expect(c(id)).toBe(-B.adjacentBond);
  });

  it('不改書的表：vw_groups.csv 仍是 41 列，V25 的 VW 仍是 6.8', () => {
    const book = readVwGroups(bundledVwGroupsText);
    expect(book.rows).toHaveLength(41);
    expect(book.rows.find((r) => r.id === 'V25')?.vw).toBe(6.8);
    expect(book.rows.find((r) => r.id === 'V25')?.notes).toMatch(/Bondi 1964 相符.*p\.449.*6\.78/);
  });

  it('Mi 與基團質量相符（BG 列；BC 列不佔原子，不核對）', () => {
    const groups = { ...table, rows: table.rows.filter((r) => r.kind === 'group'), rowNumbers: table.rowNumbers.filter((_, i) => table.rows[i].kind === 'group') };
    const positives = Object.fromEntries(VW_BONDI_CASES.map((c) => [c.id, c.positives]));
    expect(checkVwGroupMasses(RDKit, groups, positives, 'vw_groups_bondi.csv').map(formatIssue)).toEqual([]);
  });
});

describe('格式檢查會報錯的情況（D22）', () => {
  it('缺出處、出處沒有 Bondi／表號／頁碼', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 出處: '' }))).join('\n')).toMatch(/缺出處/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, 出處: 'Bondi 1964' }))).join('\n')).toMatch(/表號/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, 出處: 'Bondi, J. Phys. Chem. 68, 441 (1964), Table XVI' }))).join('\n')).toMatch(/頁碼/);
  });
  it('缺來源等級、稽核狀態、SMARTS、名稱', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 來源等級: '' }))).join('\n')).toMatch(/來源等級.*必填/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, 稽核狀態: '' }))).join('\n')).toMatch(/稽核狀態.*必填/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, SMARTS: '' }))).join('\n')).toMatch(/SMARTS.*必填/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, 基團名稱: '' }))).join('\n')).toMatch(/基團名稱.*必填/);
  });
  it('SMARTS 不合法、數值不是數字', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, SMARTS: '[NX3H2' }))).join('\n')).toMatch(/無法解析/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, VW: 'abc' }))).join('\n')).toMatch(/VW.*不是數字/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, 修正量: 'x' }))).join('\n')).toMatch(/修正量.*不是數字/);
  });
  it('基團列不得有修正量、VW 必須大於 0；修正列必須有負的修正量且 VW 與 Mi 為 0', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 修正量: '-0.22' }))).join('\n')).toMatch(/基團列的修正量必須留空/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, VW: '0' }))).join('\n')).toMatch(/VW 必須大於 0/);
    const corr = { ...GOOD, id: 'BC01', VW: '0', Mi: '0', '二價／非二價': '—', 修正量: '0.22' };
    const text = [HEADER, line(corr), ...bundledVwGroupsBondiText.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l !== '').slice(2)].join('\n');
    expect(issuesOf(text).join('\n')).toMatch(/修正列必須有負的修正量/);
  });
  it('id 順序、列數、標題列、欄位數', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, id: 'BG02' }))).join('\n')).toMatch(/應依資料表順序為 BG01/);
    expect(issuesOf([HEADER, line(GOOD)].join('\n')).join('\n')).toMatch(/應有 13 列/);
    expect(issuesOf('id,名稱\nBG01,x').join('\n')).toMatch(/標題列/);
    expect(issuesOf([HEADER, 'BG01,a'].join('\n')).join('\n')).toMatch(/欄位數/);
  });
  it('稽核狀態不是「待使用者審」', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 稽核狀態: '已審' }))).join('\n')).toMatch(/待使用者審/);
  });
});

describe('每個補充基團與修正的正例與反例', () => {
  it('案例表涵蓋每一列，每列至少一個正例與一個反例', () => {
    expect(VW_BONDI_CASES.map((c) => c.id)).toEqual(table.rows.map((r) => r.id));
    for (const c of VW_BONDI_CASES) {
      expect(c.positives.length, c.id).toBeGreaterThanOrEqual(1);
      expect(c.negatives.length, c.id).toBeGreaterThanOrEqual(1);
    }
  });
  for (const c of VW_BONDI_CASES) {
    const row = table.rows.find((r) => r.id === c.id);
    describe(`${c.id} ${row?.name}`, () => {
      for (const smiles of c.positives) {
        it(`正例 ${smiles}：SMARTS 命中，命中原子數 = 原子數`, () => {
          const ms = matchesOf((row as { smarts: string }).smarts, smiles);
          expect(ms.length).toBeGreaterThan(0);
          for (const m of ms) expect(m).toHaveLength((row as { atomCount: number }).atomCount);
        });
      }
      for (const smiles of c.negatives) {
        it(`反例 ${smiles}：SMARTS 不命中`, () => {
          expect(matchesOf((row as { smarts: string }).smarts, smiles)).toEqual([]);
        });
      }
    });
  }
});

describe('手算驗證（用 Bondi 值逐項相加，寫出算式；書的基團值取 Table 4.2）', () => {
  it('三苯基膦：3×苯基 + >P = 3×45.85 + 10.44 = 147.99', () => {
    const r = ok(computeVdwVolume(RDKit, 'c1ccc(P(c2ccccc2)c2ccccc2)cc1'));
    expect(r.vw).toBeCloseTo(hand([['C6H5', 3]]) + B.P, 9);
    expect(r.bondiSupplement).toBe(true);
    expect(r.bondiNotes).toEqual([VW_BONDI_LABEL]);
    expect(r.groups.filter((g) => g.supplement).map((g) => g.id)).toEqual(['BG05']);
    expect(r.massWithinTolerance).toBe(true);
  });

  it('L-丙胺酸：CH3 13.67 + >CH– 6.8 + –OH 8.0（書）+ 羧基 C=O 11.70 + NH2 10.54 − 0.22 = 50.49（書的 –OH 先配）', () => {
    const r = ok(computeVdwVolume(RDKit, 'C[C@@H](C(=O)O)N'));
    expect(r.vw).toBeCloseTo(TABLE42['CH3'] + TABLE42['CHtri'] + TABLE42['OH'] + B.CO + B.NH2 - B.adjacentBond, 9);
    expect(r.vw).toBeCloseTo(50.49, 9);
    expect(r.corrections.map((c) => [c.id, c.count, c.delta])).toEqual([['BC04', 1, -0.22]]);
    expect(r.groups.filter((g) => !g.supplement).map((g) => g.id)).toEqual(['V15', 'V25', 'V17']);
    expect(r.bondiNotes).toEqual([VW_BONDI_LABEL, '含詮釋，待使用者審']);
  });

  it('4,4\'-二胺基二苯碸：2×C6H4 + SO2 + 2×NH2 = 86.6 + 20.3 + 21.08 = 127.98', () => {
    const r = ok(computeVdwVolume(RDKit, 'Nc1ccc(cc1)S(=O)(=O)c1ccc(N)cc1'));
    expect(r.vw).toBeCloseTo(2 * TABLE42['C6H4'] + 20.3 + 2 * B.NH2, 9);
    expect(r.bondiNotes).toEqual([VW_BONDI_LABEL]);
  });

  it('雙酚 A 聚碳酸酯單元：C=O 11.70 + 2×O（ph.e. 3.2）+ 2×C6H4 + –C(CH3)2– − 2×0.22 = 134.96；連接點那一側的 O 依另一端（頭尾相接）判斷為芳香醚', () => {
    const r = ok(computeVdwVolume(RDKit, '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]'));
    const expected = B.CO + 2 * B.OPhenylEther + 2 * TABLE42['C6H4'] + TABLE42['C_CH3_2'] - 2 * B.adjacentBond;
    expect(r.vw).toBeCloseTo(expected, 9);
    expect(r.vw).toBeCloseTo(134.96, 9);
    expect(r.corrections.map((c) => [c.id, c.count])).toEqual([['BC05', 2]]);
    expect(r.groups.filter((g) => g.supplement).map((g) => g.id).sort()).toEqual(['BG02', 'BG10', 'BG12']);
    // 對照：書 Table 4.7（書頁 83）136.2，只作驗證、不當輸入；差在 1% 內
    expect(Math.abs(r.vw - 136.2) / 136.2).toBeLessThan(0.01);
  });

  it('碳酸二甲酯：C=O 11.70 + 2×O（a.e. 3.7）+ 2×CH3 − 2×0.22', () => {
    const r = ok(computeVdwVolume(RDKit, 'COC(=O)OC'));
    expect(r.vw).toBeCloseTo(B.CO + 2 * B.OAlkylEther + 2 * TABLE42['CH3'] - 2 * B.adjacentBond, 9);
  });

  it('碳酸二苯酯：C=O 11.70 + 2×O（ph.e. 3.2）+ 2×C6H5 − 2×0.22', () => {
    const r = ok(computeVdwVolume(RDKit, 'c1ccccc1OC(=O)Oc1ccccc1'));
    expect(r.vw).toBeCloseTo(B.CO + 2 * B.OPhenylEther + 2 * TABLE42['C6H5'] - 2 * B.adjacentBond, 9);
  });

  it('脂肪族聚碳酸酯單元（連接點接烷基）：O 用 a.e. 3.7', () => {
    const r = ok(computeVdwVolume(RDKit, '[*:1]OC(=O)OCC[*:2]'));
    expect(r.vw).toBeCloseTo(B.CO + 2 * B.OAlkylEther + 2 * TABLE42['CH2'] - 2 * B.adjacentBond, 9);
    expect(r.groups.filter((g) => g.supplement).map((g) => g.id).sort()).toEqual(['BG02', 'BG11', 'BG13']);
  });

  it('雙酚茀單元（茀）：2×OH + 14×CHar + 6×Car(exo) + 茀核心（3.33 + 4×5.54）− 1.66 = 185.83；若減 2 次為 184.17', () => {
    const r = ok(computeVdwVolume(RDKit, '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O'));
    const expected = 2 * TABLE42['OH'] + 14 * TABLE42['CHar'] + 6 * TABLE42['Car_exo'] + (B.Cq + 4 * B.CarAlkyl) - B.ringBenzo;
    expect(r.vw).toBeCloseTo(expected, 9);
    expect(r.vw).toBeCloseTo(185.83, 9);
    expect(r.corrections.map((c) => [c.id, c.count])).toEqual([['BC03', 1]]);
    expect(r.bondiNotes).toEqual([VW_BONDI_LABEL, '含詮釋，待使用者審']);
    expect(r.vw - B.ringBenzo).toBeCloseTo(184.17, 9);
  });

  it('SBI 雙酚（螺雙茚滿）：4×CH3 + 2×OH + 6×CHar + 2×Car(exo) + 4×稠合碳 5.54 + 2×>C< + 2×CH2 + 螺中心 3.33 − 2×1.66 = 179.37', () => {
    const r = ok(computeVdwVolume(RDKit, 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2'));
    const expected =
      4 * TABLE42['CH3'] + 2 * TABLE42['OH'] + 6 * TABLE42['CHar'] + 2 * TABLE42['Car_exo'] + 4 * B.CarAlkyl + 2 * B.Cq + 2 * B.CH2 + B.Cq - 2 * B.ringBenzo;
    expect(r.vw).toBeCloseTo(expected, 9);
    expect(r.vw).toBeCloseTo(179.37, 9);
    expect(r.corrections.map((c) => [c.id, c.count])).toEqual([['BC01', 2]]);
    expect(r.groups.filter((g) => g.supplement).map((g) => g.id).sort()).toEqual(['BG06', 'BG06', 'BG06', 'BG06', 'BG07', 'BG07', 'BG09', 'BG09', 'BG09']);
  });

  it('茚滿、四氫萘：稠合碳 2×5.54 + CH2 + 4×CHar − 1.66（Bondi 論文沒有這兩個化合物的 VW 值，只能手算）', () => {
    expect(vwOf('c1ccc2CCCc2c1')).toBeCloseTo(2 * B.CarAlkyl + 3 * B.CH2 + 4 * TABLE42['CHar'] - B.ringBenzo, 9);
    expect(vwOf('c1ccc2CCCCc2c1')).toBeCloseTo(2 * B.CarAlkyl + 4 * B.CH2 + 4 * TABLE42['CHar'] - B.ringBenzo, 9);
  });

  it('Bondi Table XIII／XIX 的化合物（只作驗證）：苯 48.4（書的 CHar 8.05×6 = 48.30，差 0.2%）；補充沒有介入', () => {
    const r = ok(computeVdwVolume(RDKit, 'c1ccccc1'));
    expect(r.bondiSupplement).toBe(false);
    expect(Math.abs(r.vw - 48.4) / 48.4).toBeLessThan(0.005);
  });

  it('補充結果的 Mi 與重複單元質量相符', () => {
    for (const s of ['[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]', 'C[C@@H](C(=O)O)N', 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2']) {
      expect(ok(computeVdwVolume(RDKit, s)).massWithinTolerance, s).toBe(true);
    }
  });
});

describe('書已有的結構：補充前後逐字相同（補充基團不得搶走書能配的原子）', () => {
  const smilesList = [
    ...BOOK_VW_CASES.map((c) => c.smiles),
    ...VW_GROUP_CASES.flatMap((c) => c.positives),
    'c1ccccc1',
    'Oc1ccccc1',
    'COC',
    'CC(=O)OC',
    'CC(=O)O',
    'CCCl',
    'CC(=O)N',
    '[*:1]CC([*:2])c1ccccc1',
    'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1',
    'Nc1ccc(cc1)C(C)(C)c1ccc(cc1)C',
    'CC(C)c1ccc(cc1)C',
  ];
  it('書的基團能配完的結構：有補充與不補充的結果完全相同（含 groups、vw、sources、model）', () => {
    let compared = 0;
    for (const s of smilesList) {
      const book = computeVdwVolume(RDKit, s, { supplement: [] });
      if (book.status !== 'ok') continue;
      const withSup = computeVdwVolume(RDKit, s);
      expect(withSup.status).toBe('ok');
      expect(JSON.stringify(withSup), s).toBe(JSON.stringify(book));
      compared++;
    }
    expect(compared).toBeGreaterThan(40);
  });

  it('書能配的原子不被補充搶走：苯胺的苯環與 –OH 仍是書的基團，只有 NH2 是補充', () => {
    const r = ok(computeVdwVolume(RDKit, 'Nc1ccccc1'));
    expect(r.groups.filter((g) => !g.supplement).map((g) => g.id)).toEqual(['V19']);
    expect(r.groups.filter((g) => g.supplement).map((g) => g.id)).toEqual(['BG04']);
  });

  it('酯基與醚 O 仍由書配對（BG10–BG13 只收碳酸酯的 O）', () => {
    expect(countVwGroups(ok(computeVdwVolume(RDKit, 'CC(=O)OC')).groups).map((g) => g.id)).toEqual(['V11', 'V15']);
    const r = ok(computeVdwVolume(RDKit, 'COc1ccccc1'));
    expect(r.groups.every((g) => !g.supplement)).toBe(true);
  });

  it('苯酚與雙酚 A（書已有的結構）：補充未介入', () => {
    for (const s of ['Oc1ccccc1', 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1']) {
      const r = ok(computeVdwVolume(RDKit, s));
      expect(r.bondiSupplement).toBe(false);
      expect(r.bondiNotes).toEqual([]);
      expect(r.corrections).toEqual([]);
    }
  });

  it('指定自訂基團表（rows）時不補充；指定 supplement: [] 時不補充', () => {
    expect(computeVdwVolume(RDKit, 'CCN', { supplement: [] }).status).toBe('missing');
    expect(computeVdwVolume(RDKit, 'CCN').status).toBe('ok');
  });
});

describe('Bondi 判為「不能算」的結構仍回報缺基團（任務 037 A-2）', () => {
  const cases: [string, string, string][] = [
    ['環氧丙烷（三員環醚，Table XVII 沒有三員環修正）', 'CC1CO1', 'O'],
    ['環氧氯丙烷', 'ClCC1CO1', 'O'],
    ['BADGE', 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1', 'O'],
    ['PGMA 型環氧單元', '[*:1]CC([*:2])(C)C(=O)OCC1CO1', 'O'],
    ['聚醯亞胺 BPDA–PDA 單元（五員雜環）', '[*:1]N1C(=O)c2ccc(cc2C1=O)-c1ccc2C(=O)N(C(=O)c2c1)c1ccc([*:2])cc1', 'O'],
    ['聚苯并噁唑 PBO 單元（五員雜芳環）', '[*:1]c1ccc(cc1)-c1nc2cc3nc([*:2])oc3cc2o1', 'N'],
    ['甲基丙烯酸 2-甲基-2-金剛烷酯（籠狀環）', '[*:1]CC([*:2])(C)C(=O)OC1(C)C2CC3CC(C2)CC1C3', 'C'],
    ['甲基丙烯酸 γ-丁內酯酯（五員環內酯）', '[*:1]CC([*:2])(C)C(=O)OC1CCOC1=O', 'O'],
    ['三氟化硼（Table XVI 沒有 B）', 'FB(F)F', 'B'],
    ['9H-茀（C9 有氫，限 9,9-二取代）', 'c1ccc2c(c1)Cc1ccccc12', 'C'],
    ['苯并[b]茀型稠環（苯環不止稠合一個環）', 'CC1(C)c2ccccc2-c2cc3ccccc3cc12', 'C'],
    ['乙醯胺的 NH2（醯胺，Table XVI 腳註 d 要另外修正）', 'CC(N)=O', 'N'],
    ['環丙烷（Table XVII 沒有三員環）', 'CC1CC1', 'C'],
    ['雙氰胺', 'N#CNC(N)=N', 'N'],
  ];
  for (const [name, smiles, element] of cases) {
    it(`${name}：status = missing，缺基團含元素 ${element}`, () => {
      const r = computeVdwVolume(RDKit, smiles);
      expect(r.status).toBe('missing');
      if (r.status === 'missing') expect(r.missing.some((m) => m.element === element), JSON.stringify(r.missing)).toBe(true);
    });
  }

  it('補充只縮減缺基團清單：環氧丙烷的缺基團仍是 3 個原子（CH、CH2、O），輸出與補充前相同', () => {
    const a = computeVdwVolume(RDKit, 'CC1CO1', { supplement: [] });
    const b = computeVdwVolume(RDKit, 'CC1CO1');
    expect(JSON.stringify(b)).toBe(JSON.stringify({ ...a, bondiSupplement: false }));
  });
});

describe('切分完整性：補充後每個重原子恰好屬於一個基團（書或補充）', () => {
  const smilesList = [
    'c1ccc(P(c2ccccc2)c2ccccc2)cc1',
    'C[C@@H](C(=O)O)N',
    '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]',
    '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O',
    'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2',
    'Nc1ccc(cc1)S(=O)(=O)c1ccc(N)cc1',
    'c1ccc2CCCCc2c1',
    '[*:1]Oc1ccc(cc1)C1(c2ccccc2-c2ccccc21)c1ccc(cc1)C[*:2]',
  ];
  for (const s of smilesList) {
    it(s, () => {
      const r = computeVdwVolume(RDKit, s);
      const atoms = r.status === 'ok' || r.status === 'missing' ? r.groups.flatMap((g) => g.atoms) : [];
      expect(new Set(atoms).size).toBe(atoms.length);
      const heavy = withMol(s, (mol) => {
        const j = JSON.parse(mol.get_json()) as { molecules: { atoms: { z?: number }[] }[] };
        return j.molecules[0].atoms.map((a, i) => ({ i, z: a.z ?? 6 })).filter((a) => a.z > 1).length;
      });
      const missing = r.status === 'missing' ? r.missing.length : 0;
      expect(atoms.length + missing).toBe(heavy);
    });
  }
});

describe('下游：CTE 帶出「含 Bondi 補充基團（非書值）」標示', () => {
  it('雙酚 A 聚碳酸酯：缺 VW 變成可算，CTE 結果標示非書值', () => {
    const r = computeCte(RDKit, '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.vw).toBeCloseTo(134.96, 9);
      expect(r.vwBondiSupplement).toBe(true);
      expect(r.vwBondiNotes[0]).toBe(VW_BONDI_LABEL);
    }
  });
  it('書已有的聚合物（PET）：不標示', () => {
    const r = computeCte(RDKit, '[*:1]OC(=O)c1ccc(cc1)C(=O)OCC[*:2]');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.vwBondiSupplement).toBe(false);
  });
});
