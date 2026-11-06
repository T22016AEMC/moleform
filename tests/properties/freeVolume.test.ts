// 使用者定義的經驗自由體積法（任務 036a，D22、D57）的測試：資料表格式、每個基團的正反例、係數類別與優先順序、
// 手算、共聚物加權、缺基團、與 xlsx 各列的回歸（結構由 Claude 看圖撰寫，待使用者審）。
// 只檢查程式與資料照規則運作（D17）；這是使用者定義的經驗法，不是書中的自由體積分率，測試不判斷化學。
import { beforeAll, describe, expect, it } from 'vitest';
import {
  FREE_VOLUME_COEFFICIENTS,
  FREE_VOLUME_COEFFICIENTS_COLUMNS,
  FREE_VOLUME_COEFFICIENT_COUNT,
  FREE_VOLUME_GROUPS,
  FREE_VOLUME_GROUPS_COLUMNS,
  FREE_VOLUME_GROUP_COUNT,
  bundledFreeVolumeCoefficientsText,
  bundledFreeVolumeGroupsText,
  checkFreeVolumeCoefficientSmarts,
  checkFreeVolumeGroupSmarts,
  readFreeVolumeCoefficients,
  readFreeVolumeGroups,
  validateFreeVolumeCoefficients,
  validateFreeVolumeGroups,
} from '../../src/core/data/freeVolumeTables';
import { parseCsv } from '../../src/core/data/csv';
import { formatIssue } from '../../src/core/data/types';
import { VW_GROUPS } from '../../src/core/data/vwGroups';
import { computeFreeVolume, computeFreeVolumeUnit, hasBridgedAliphaticRing } from '../../src/core/properties/freeVolume';
import { computeMolarVolumeDensity } from '../../src/core/properties/molarVolumeDensity';
import { readGraph } from '../../src/core/properties/molGraph';
import { computeVdwVolume } from '../../src/core/properties/vanDerWaalsVolume';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { JSMol, RDKitModule } from '../../src/core/rdkit/types';
import { FV_BRIDGED_CASES, FV_COEFFICIENT_SMARTS_CASES, FV_GROUP_CASES, XLSX_STRUCTURES } from './freeVolumeCases';
import { XLSX_ROWS, XLSX_VALUES } from './freeVolumeXlsxRows';

// 使用者的 xlsx 匯出 CSV（docs/references；CI 或別台機器沒有這個檔時 glob 為空，對照測試略過）
const userCsv = import.meta.glob<string>('../../docs/references/自由體積算法_使用者表.csv', { query: '?raw', import: 'default', eager: true });

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const gTable = readFreeVolumeGroups(bundledFreeVolumeGroupsText);
const cTable = readFreeVolumeCoefficients(bundledFreeVolumeCoefficientsText);

const matchCount = (smarts: string, smiles: string): number => {
  const q = RDKit.get_qmol(smarts);
  const mol = RDKit.get_mol(smiles);
  if (!q || !q.is_valid() || !mol || !mol.is_valid()) throw new Error(`無法解析：${smarts} / ${smiles}`);
  try {
    const parsed = JSON.parse(mol.get_substruct_matches(q)) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } finally {
    q.delete();
    mol.delete();
  }
};
const withMol = <T,>(smiles: string, fn: (m: JSMol) => T): T => {
  const mol = RDKit.get_mol(smiles);
  if (!mol || !mol.is_valid()) throw new Error(`RDKit 無法解析：${smiles}`);
  try {
    return fn(mol);
  } finally {
    mol.delete();
  }
};
const okUnit = (smiles: string) => {
  const r = computeFreeVolumeUnit(RDKit, smiles);
  if (r.status !== 'ok') throw new Error(`${smiles}：${r.status}`);
  return r;
};
const okFv = (smiles: string, spec?: Parameters<typeof computeFreeVolume>[2]) => {
  const r = computeFreeVolume(RDKit, smiles, spec);
  if (r.status !== 'ok') throw new Error(`${smiles}：${r.status}`);
  return r;
};

/** 酯基整組採書的 –COO–（vw_groups.csv V11，Table 4.2，D58）；xlsx 的 23 不再使用 */
const BOOK_COO = 15.2;
/** 任務 036c 已知差異（非程式錯誤）：含酯基的 xlsx 列，程式（書的 15.2）減 xlsx（23 ＋ 羰基碳另計） */
const KNOWN_VALUE_DIFFS = [{ row: 15, name: 'EHP03', xlsxW: 69.52, program: 58.39, diff: -11.13 }];

const PE = '[*:1]CC[*:2]';
const PS = '[*:1]CC([*:2])c1ccccc1';
const PHS = '[*:1]CC([*:2])c1ccc(O)cc1';
const ADAMANTYL = '[*:1]C12CC3CC(CC(C3)C1)C2';
const SBI = 'CC1(C)CC2(CC(C)(C)c3cc([*:2])ccc23)c2ccc([*:1])cc12';

describe('資料表（內建）', () => {
  it('基團表：讀取、格式檢查與 RDKit 檢查沒有任何問題', () => {
    expect([...gTable.issues, ...validateFreeVolumeGroups(gTable), ...checkFreeVolumeGroupSmarts(RDKit, gTable)].map(formatIssue)).toEqual([]);
  });
  it('係數表：讀取、格式檢查與 RDKit 檢查沒有任何問題', () => {
    expect([...cTable.issues, ...validateFreeVolumeCoefficients(cTable), ...checkFreeVolumeCoefficientSmarts(RDKit, cTable)].map(formatIssue)).toEqual([]);
  });
  it('19 個基團，id 為 FV01–FV19；5 個係數類別，id 為 FC01–FC05；每列有出處與稽核狀態「待使用者審」', () => {
    expect(gTable.rows).toHaveLength(FREE_VOLUME_GROUP_COUNT);
    expect(cTable.rows).toHaveLength(FREE_VOLUME_COEFFICIENT_COUNT);
    gTable.rows.forEach((r, i) => {
      expect(r.id).toBe(`FV${String(i + 1).padStart(2, '0')}`);
      if (r.id === 'FV13') {
        // 任務 036c（D58）：酯基出處為書的 Table 4.2，並註明取代使用者表儲存格 P4
        expect(r.source).toMatch(/Table 4\.2/);
        expect(r.source).toMatch(/儲存格 P4/);
      } else {
        expect(r.source).toMatch(/使用者定義（依論文整理，論文清單待補）/);
        expect(r.source).toMatch(/自由體積算法_使用者表\.xlsx/);
        expect(r.source).toMatch(/儲存格 [C-V]4/);
      }
      expect(r.audit).toBe('待使用者審');
    });
    cTable.rows.forEach((r, i) => {
      expect(r.id).toBe(`FC${String(i + 1).padStart(2, '0')}`);
      expect(r.source).toMatch(/使用者定義（依論文整理，論文清單待補）/);
      expect(r.source).toMatch(/儲存格/);
      expect(r.audit).toBe('待使用者審');
    });
  });
  it('Vω 與獨立抄錄的 xlsx 第 4 列一致（芳香族 H 欄已刪除，表裡沒有 3.17）', () => {
    const v = XLSX_VALUES;
    const expected = [v.arC, v.chC, v.chCH, v.chCH2, v.chCH3, v.rC, v.rCH, v.rCH2, v.ether, v.epoxy, v.ketone, v.aldehyde, BOOK_COO, v.oh1, v.oh2, v.oh3, v.phenol, v.fAl, v.fAr];
    expect(gTable.rows.map((r) => r.vw)).toEqual(expected);
    expect(gTable.rows.some((r) => r.vw === v.arH || r.name.includes('芳香族 H'))).toBe(false);
  });
  it('係數與 xlsx 儲存格 G2 一致：SBI 0.7、金剛烷（橋環）0.8、芳香環 0.37、脂肪族 1、環烷 1', () => {
    expect(Object.fromEntries(cTable.rows.map((r) => [r.id, r.coefficient]))).toEqual({ FC01: 0.7, FC02: 0.8, FC03: 0.37, FC04: 1, FC05: 1 });
  });
  it('FREE_VOLUME_GROUPS／COEFFICIENTS 與讀取結果一致', () => {
    expect(FREE_VOLUME_GROUPS).toEqual(gTable.rows);
    expect(FREE_VOLUME_COEFFICIENTS).toEqual(cTable.rows);
  });
  it('若本機有 docs/references 的 xlsx 匯出 CSV，測試內的 xlsx 抄錄與它完全一致（CI 沒有該檔時略過）', () => {
    const text = Object.values(userCsv)[0];
    if (text === undefined) return;
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(1);
    const keys = ['arC', 'arH', 'chC', 'chCH', 'chCH2', 'chCH3', 'rC', 'rCH', 'rCH2', 'ether', 'epoxy', 'ketone', 'aldehyde', 'ester', 'oh1', 'oh2', 'oh3', 'phenol', 'fAl', 'fAr'] as const;
    for (const line of lines) {
      const cells = line.match(/("[^"]*"|[^,]*)(,|$)/g)?.map((s: string) => s.replace(/,$/, '').replace(/^"|"$/g, '')) ?? [];
      const row = Number(cells[1]);
      if (row === 4) {
        keys.forEach((k, i) => expect(Number(cells[2 + i]), `第 4 列 ${k}`).toBeCloseTo(XLSX_VALUES[k], 9));
        continue;
      }
      const mine = XLSX_ROWS.find((r) => r.row === row);
      expect(mine, `第 ${row} 列`).toBeDefined();
      keys.forEach((k, i) => expect(Number(cells[2 + i]), `第 ${row} 列 ${k}`).toBe(mine?.counts[k]));
    }
  });
});

describe('格式檢查會報錯的情況', () => {
  const lines = bundledFreeVolumeGroupsText.split(/\r?\n/).filter((l) => l !== '');
  const toLine = (cells: string[]): string => cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(',');
  const mutate = (fn: (cells: string[]) => string[]): string => {
    const first = parseCsv(bundledFreeVolumeGroupsText)[1];
    return [lines[0], toLine(fn([...first])), ...lines.slice(2)].join('\n');
  };
  const problems = (text: string): string[] => {
    const t = readFreeVolumeGroups(text);
    return [...t.issues, ...validateFreeVolumeGroups(t)].map((i) => `${i.row ?? ''}:${i.column ?? ''}`);
  };
  it('標題列不一致', () => {
    expect(readFreeVolumeGroups(bundledFreeVolumeGroupsText.replace('情境原子', '錯誤')).issues[0]?.message).toMatch(/標題列與定義不一致/);
    expect(FREE_VOLUME_GROUPS_COLUMNS).toHaveLength(9);
    expect(FREE_VOLUME_COEFFICIENTS_COLUMNS).toHaveLength(9);
  });
  it('缺出處（D22）、出處缺 xlsx 檔名與儲存格、稽核狀態不是「待使用者審」', () => {
    expect(problems(mutate((c) => ((c[6] = ''), c)))).toContain('2:出處');
    expect(problems(mutate((c) => ((c[6] = '使用者定義'), c)))).toContain('2:出處');
    expect(problems(mutate((c) => ((c[7] = '已審'), c)))).toContain('2:稽核狀態');
  });
  it('Vω 不是數字、缺備註、缺 SMARTS、列數不對', () => {
    expect(problems(mutate((c) => ((c[5] = '八點一'), c)))).toContain('2:Vω');
    expect(problems(mutate((c) => ((c[8] = ''), c)))).toContain('2:備註');
    expect(problems(mutate((c) => ((c[2] = ''), c)))).toContain('2:SMARTS');
    expect(problems([lines[0], ...lines.slice(1, 5)].join('\n'))).toContain(':');
  });
  it('芳香族 H 已刪除，名稱含「芳香族 H」的列報錯', () => {
    expect(problems(mutate((c) => ((c[1] = '芳香族 H'), c)))).toContain('2:基團名稱');
  });
  it('SMARTS 無法解析：RDKit 檢查報錯', () => {
    const bad = readFreeVolumeGroups(mutate((c) => ((c[2] = '[CX4'), c)));
    expect(checkFreeVolumeGroupSmarts(RDKit, bad).map((i) => i.column)).toContain('SMARTS');
  });
  it('係數表：辨識方式與 SMARTS 的對應、係數範圍', () => {
    const cl = bundledFreeVolumeCoefficientsText.split(/\r?\n/).filter((l) => l !== '');
    const c1 = parseCsv(bundledFreeVolumeCoefficientsText)[1];
    const bad = (cells: string[]) => {
      const t = readFreeVolumeCoefficients([cl[0], toLine(cells), ...cl.slice(2)].join('\n'));
      return [...t.issues, ...validateFreeVolumeCoefficients(t)].map((i) => i.column);
    };
    const set = (i: number, v: string): string[] => Object.assign([...c1], { [i]: v });
    expect(bad(set(4, ''))).toContain('SMARTS');
    expect(bad(set(3, '亂寫'))).toContain('辨識方式');
    expect(bad(set(2, '1.5'))).toContain('係數');
    expect(bad(set(6, ''))).toContain('出處');
  });
});

describe('基團的正例與反例（D22）', () => {
  it('案例表涵蓋全部 19 個基團', () => {
    expect(FV_GROUP_CASES.map((c) => c.id)).toEqual(gTable.rows.map((r) => r.id));
  });
  for (const c of FV_GROUP_CASES) {
    const row = () => gTable.rows.find((r) => r.id === c.id);
    it(`${c.id} ${c.name}：每個正例命中、每個反例不命中`, () => {
      expect(c.positives.length).toBeGreaterThanOrEqual(1);
      expect(c.negatives.length).toBeGreaterThanOrEqual(1);
      for (const s of c.positives) expect(matchCount(row()?.smarts ?? '', s), `正例 ${s}`).toBeGreaterThan(0);
      for (const s of c.negatives) expect(matchCount(row()?.smarts ?? '', s), `反例 ${s}`).toBe(0);
    });
  }
});

describe('係數類別的辨識', () => {
  for (const c of FV_COEFFICIENT_SMARTS_CASES) {
    it(`${c.id} ${c.name}：正反例`, () => {
      const row = cTable.rows.find((r) => r.id === c.id);
      for (const s of c.positives) expect(matchCount(row?.smarts ?? '', s), `正例 ${s}`).toBeGreaterThan(0);
      for (const s of c.negatives) expect(matchCount(row?.smarts ?? '', s), `反例 ${s}`).toBe(0);
    });
  }
  it('FC02 橋環或籠狀脂環：正例（降冰片烷、金剛烷、三環癸烷、立方烷）與反例（稠環、螺環、單環、芳香環）', () => {
    for (const [name, s] of FV_BRIDGED_CASES.positives) expect(withMol(s, (m) => hasBridgedAliphaticRing(readGraph(m))), name).toBe(true);
    for (const [name, s] of FV_BRIDGED_CASES.negatives) expect(withMol(s, (m) => hasBridgedAliphaticRing(readGraph(m))), name).toBe(false);
  });
});

describe('Vω、Vf 手算（每個係數類別至少一個單元）', () => {
  it('脂肪族（FC04）：聚乙烯單元 2×CH2 = 20.46，係數 1，Vf = 20.46', () => {
    const r = okUnit(PE);
    expect(r.coefficient.id).toBe('FC04');
    expect(r.vomega).toBeCloseTo(2 * 10.23, 10);
    expect(r.vf).toBeCloseTo(20.46, 10);
    expect(r.contributions).toEqual([{ id: 'FV04', name: expect.any(String), vw: 10.23, count: 2, contribution: expect.closeTo(20.46, 10) }]);
  });
  it('芳香環（FC03）：PHS 單元 = CH2 10.23 + CH 6.78 + 6×8.11 + 酚 OH 11.5 = 77.17，係數 0.37，Vf = 28.5529', () => {
    const r = okUnit(PHS);
    expect(r.coefficient.id).toBe('FC03');
    expect(r.vomega).toBeCloseTo(10.23 + 6.78 + 6 * 8.11 + 11.5, 10);
    expect(r.vf).toBeCloseTo(77.17 * 0.37, 10);
    // 與 xlsx 第 14 列一致：xlsx 的 W = 89.85 含芳香族 H 4×3.17；去掉 H 項後就是 77.17
    const x = XLSX_ROWS.find((row) => row.row === 14);
    expect((x?.w ?? 0) - 4 * 3.17).toBeCloseTo(77.17, 6);
  });
  it('金剛烷（FC02）：1-金剛烷基 = 環 C 3.8 + 3×環 CH 5.6 + 6×環 CH2 8.45 = 71.3，係數 0.8，Vf = 57.04', () => {
    const r = okUnit(ADAMANTYL);
    expect(r.coefficient.id).toBe('FC02');
    expect(r.vomega).toBeCloseTo(3.8 + 3 * 5.6 + 6 * 8.45, 10);
    expect(r.vf).toBeCloseTo(71.3 * 0.8, 10);
  });
  it('螺雙茚滿（FC01）：SBI 骨架 = 12×8.11 + 3×環 C 3.8 + 2×環 CH2 8.45 + 4×CH3 13.67 = 180.3，係數 0.7，Vf = 126.21', () => {
    const r = okUnit(SBI);
    expect(r.coefficient.id).toBe('FC01');
    expect(r.vomega).toBeCloseTo(12 * 8.11 + 3 * 3.8 + 2 * 8.45 + 4 * 13.67, 10);
    expect(r.vf).toBeCloseTo(180.3 * 0.7, 10);
  });
  it('環烷（FC05）：環己烷 6×環 CH2 = 50.7，係數 1；環氧環也算環烷', () => {
    const r = okUnit('C1CCCCC1');
    expect(r.coefficient.id).toBe('FC05');
    expect(r.vomega).toBeCloseTo(6 * 8.45, 10);
    expect(r.vf).toBeCloseTo(50.7, 10);
    expect(okUnit('CC1CO1').coefficient.id).toBe('FC05');
  });
  it('酯基與環氧（任務 036c）：聚丙烯酸縮水甘油酯單元 = CH 6.78 + 2×CH2 + 環 CH 5.6 + 環 CH2 8.45 + 環氧 O 1.9 + 酯基（書的 –COO– 15.2）= 58.39；與 xlsx 第 15 列 EHP03 的 W 69.52 為已知差異（xlsx 酯基 23 ＋ 羰基碳另計 3.33），不是回歸期望值', () => {
    const r = okUnit('[*:1]CC([*:2])C(=O)OCC1CO1');
    expect(r.vomega).toBeCloseTo(6.78 + 2 * 10.23 + 5.6 + 8.45 + 1.9 + BOOK_COO, 10);
    expect(r.vomega).toBeCloseTo(58.39, 6);
    expect(r.vomega - 69.52).toBeCloseTo(-11.13, 6);
    expect(r.coefficient.id).toBe('FC05');
  });
  it('小分子算整個分子（D56 只限制 Tg）：苯 6×8.11 = 48.66，係數 0.37；與書的 VW（任務 028，6×CHar 8.05 = 48.3）差 < 10%', () => {
    const r = okUnit('c1ccccc1');
    expect(r.polymer).toBe(false);
    expect(r.vomega).toBeCloseTo(48.66, 10);
    expect(r.vf).toBeCloseTo(48.66 * 0.37, 10);
    const book = computeVdwVolume(RDKit, 'c1ccccc1');
    expect(book.status).toBe('ok');
    if (book.status === 'ok') {
      expect(book.vw).toBeCloseTo(48.3, 6);
      const pct = ((r.vomega - book.vw) / book.vw) * 100;
      expect(pct).toBeGreaterThan(0);
      expect(pct).toBeLessThan(10);
    }
  });
  it('每種官能基各一個小例子', () => {
    const v = XLSX_VALUES;
    expect(okUnit('CC(C)=O').vomega).toBeCloseTo(v.chCH3 * 2 + v.ketone, 10); // 酮：整個羰基 10.8，羰基 C 不另計
    expect(okUnit('CC=O').vomega).toBeCloseTo(v.chCH3 + v.aldehyde, 10); // 醛：整個羰基 11.5，醛基 C 不另計
    expect(okUnit('CCO').vomega).toBeCloseTo(v.chCH3 + v.chCH2 + v.oh1, 10);
    expect(okUnit('CC(C)O').vomega).toBeCloseTo(2 * v.chCH3 + v.chCH + v.oh2, 10);
    expect(okUnit('CC(C)(C)O').vomega).toBeCloseTo(3 * v.chCH3 + v.chC + v.oh3, 10);
    expect(okUnit('Oc1ccccc1').vomega).toBeCloseTo(6 * v.arC + v.phenol, 10);
    expect(okUnit('CC(F)(F)F').vomega).toBeCloseTo(v.chCH3 + v.chC + 3 * v.fAl, 10);
    expect(okUnit('Fc1ccccc1').vomega).toBeCloseTo(6 * v.arC + v.fAr, 10);
    expect(okUnit('COC').vomega).toBeCloseTo(2 * v.chCH3 + v.ether, 10);
    expect(okUnit('CC(=O)OC').vomega).toBeCloseTo(2 * v.chCH3 + BOOK_COO, 10); // 酯：整組（書的 –COO– 15.2，D58），羰基 C 與單鍵 O 不另計
  });
  it('任務 036b：羰基碳不再另計（酮、醛、酯、環酮、內酯、芳香酮），酯基單鍵 O 不計為醚 O', () => {
    const v = XLSX_VALUES;
    const ids = (smiles: string) => okUnit(smiles).contributions.map((c) => `${c.id}×${c.count}`).sort();
    expect(ids('CC(C)=O')).toEqual(['FV05×2', 'FV11×1']); // 沒有 FV02
    expect(ids('CC=O')).toEqual(['FV05×1', 'FV12×1']); // 沒有 FV03
    expect(ids('CC(=O)OC')).toEqual(['FV05×2', 'FV13×1']); // 沒有 FV02、FV09
    expect(okUnit('O=C1CCCCC1').vomega).toBeCloseTo(5 * v.rCH2 + v.ketone, 10); // 環酮：羰基碳不計環 C
    expect(ids('O=C1CCCCC1')).toEqual(['FV08×5', 'FV11×1']);
    expect(okUnit('O=C1CCCO1').vomega).toBeCloseTo(3 * v.rCH2 + BOOK_COO, 10); // 內酯
    expect(okUnit('CC(=O)c1ccccc1').vomega).toBeCloseTo(v.chCH3 + 6 * v.arC + v.ketone, 10);
    expect(okUnit('CCOC(=O)c1ccccc1').vomega).toBeCloseTo(v.chCH3 + v.chCH2 + 6 * v.arC + BOOK_COO, 10);
    expect(okUnit('COC(=O)CC(=O)OC').vomega).toBeCloseTo(2 * v.chCH3 + v.chCH2 + 2 * BOOK_COO, 10);
    // 醚與酯同分子：醚 O 仍算 3.7，酯的單鍵 O 不算
    expect(ids('COCC(=O)OC')).toEqual(['FV04×1', 'FV05×2', 'FV09×1', 'FV13×1']);
  });
  it('任務 036b：酮、醛、酯基以外的羰基仍回報缺基團（羧酸、碳酸酯、醯胺、脲、胺基甲酸酯、醯氯、甲醛、酸酐）', () => {
    for (const s of ['CC(=O)O', 'COC(=O)OC', 'CC(=O)N', 'NC(=O)N', 'NC(=O)OC', 'CC(=O)Cl', 'C=O', 'CC(=O)OC(C)=O']) {
      expect(computeFreeVolumeUnit(RDKit, s).status, s).toBe('missing');
    }
  });
});

describe('優先順序：SBI ＞ 橋環脂環 ＞ 芳香環 ＞ 其餘', () => {
  it('含芳香環的金剛烷單元 = 0.8（橋環優先於芳香環）', () => {
    const r = okUnit('[*:1]CC([*:2])c1ccc(cc1)C12CC3CC(CC(C3)C1)C2');
    expect(r.coefficient.id).toBe('FC02');
    expect(r.coefficient.coefficient).toBe(0.8);
    expect(r.vf).toBeCloseTo(r.vomega * 0.8, 10);
  });
  it('SBI = 0.7（優先於芳香環；SBI 骨架本身就含兩個苯環）', () => {
    expect(okUnit(SBI).coefficient.coefficient).toBe(0.7);
  });
  it('SBI 與橋環同時存在 → 0.7；降冰片烷衍生物含芳香環 → 0.8；只有芳香環 → 0.37；環烷與脂肪族 → 1', () => {
    expect(okUnit(`${SBI.replace('[*:1]', '[*:1]')}`).coefficient.id).toBe('FC01');
    expect(okUnit('c1ccccc1C1CC2CCC1C2').coefficient.id).toBe('FC02');
    expect(okUnit('c1ccccc1CC').coefficient.id).toBe('FC03');
    expect(okUnit('C1CCCCC1CC').coefficient.id).toBe('FC05');
    expect(okUnit('CCCC').coefficient.id).toBe('FC04');
  });
  it('辨識結果寫在輸出裡（類別名稱與理由）', () => {
    const r = okUnit(PHS);
    expect(r.coefficient.name).toMatch(/芳香/);
    expect(r.coefficient.reason).toMatch(/芳香環/);
  });
});

describe('共聚物：按單體莫耳分率加權', () => {
  const spec = (a: number, b: number, basis: 'mol' | 'wt' = 'mol') => ({ units: [{ smiles: PHS, fraction: a }, { smiles: PE, fraction: b }], fractionBasis: basis });
  it('a:b = 7:3：Vf = Vf(a)×0.7 + Vf(b)×0.3，Vω 同樣加權', () => {
    const r = okFv(PHS, spec(70, 30));
    const vfA = 77.17 * 0.37;
    const vfB = 20.46;
    expect(r.copolymer).toBe(true);
    expect(r.vf).toBeCloseTo(0.7 * vfA + 0.3 * vfB, 10);
    expect(r.vomega).toBeCloseTo(0.7 * 77.17 + 0.3 * 20.46, 10);
    expect(r.effectiveCoefficient).toBeCloseTo(r.vf / r.vomega, 12);
    expect(r.components.map((c) => c.molFraction)).toEqual([expect.closeTo(0.7, 12), expect.closeTo(0.3, 12)]);
    expect(r.components.map((c) => c.unit.status)).toEqual(['ok', 'ok']);
  });
  it('每個單體只用自己的係數（PHS 整個單元乘 0.37，PE 單元乘 1），不是整體一個係數', () => {
    const r = okFv(PHS, spec(70, 30));
    const ids = r.components.map((c) => (c.unit.status === 'ok' ? c.unit.coefficient.id : ''));
    expect(ids).toEqual(['FC03', 'FC04']);
  });
  it('wt% 輸入先依單元質量換成莫耳分率（沿用任務 020）', () => {
    const r = okFv(PHS, spec(50, 50, 'wt'));
    const mol = r.components.map((c) => c.molFraction);
    expect(mol[0] + mol[1]).toBeCloseTo(1, 12);
    expect(mol[0]).toBeLessThan(0.5); // PHS 單元質量（120）比 PE 單元（28）大，同質量時莫耳分率較小
    expect(r.vf).toBeCloseTo(mol[0] * 77.17 * 0.37 + mol[1] * 20.46, 10);
  });
  it('比例合計不是 100 → 無效', () => {
    const r = computeFreeVolume(RDKit, PHS, spec(70, 20));
    expect(r.status).toBe('invalid');
  });
  it('只有一個單元的 units 視為均聚物', () => {
    const r = okFv(PHS, { units: [{ smiles: PHS, fraction: 100 }] });
    expect(r.copolymer).toBe(false);
    expect(r.vf).toBeCloseTo(77.17 * 0.37, 10);
  });
});

describe('缺基團：不計算、不猜值、不用相近基團代替', () => {
  const missingOf = (smiles: string): string[] => {
    const r = computeFreeVolumeUnit(RDKit, smiles);
    if (r.status !== 'missing') throw new Error(`${smiles}：應為缺基團，實際 ${r.status}`);
    return r.missing.map((m) => m.element);
  };
  it('含 N 的單元（醯胺、胺）：回報 N', () => {
    expect(missingOf('[*:1]CC([*:2])C(=O)N')).toContain('N');
    expect(missingOf('CCN')).toEqual(['N']);
  });
  it('含 Cl、Br、S、Si、P、B 的單元：回報該元素', () => {
    expect(missingOf('[*:1]CC([*:2])Cl')).toEqual(['Cl']);
    expect(missingOf('CBr')).toEqual(['Br']);
    expect(missingOf('CSC')).toEqual(['S']);
    expect(missingOf('C[Si](C)(C)C')).toEqual(['Si']);
    expect(missingOf('CP(C)C')).toEqual(['P']);
    expect(missingOf('CB(C)C')).toEqual(['B']);
  });
  it('表裡沒有的結構（烯烴、炔烴、羧酸、碳酸酯、酸酐、雜芳香環）：回報缺基團', () => {
    expect(missingOf('C=CC').length).toBeGreaterThan(0);
    expect(missingOf('CC#C').length).toBeGreaterThan(0);
    expect(missingOf('CC(=O)O').length).toBeGreaterThan(0);
    expect(missingOf('COC(=O)OC').length).toBeGreaterThan(0);
    expect(missingOf('CC(=O)OC(C)=O').length).toBeGreaterThan(0);
    expect(missingOf('c1ccncc1')).toEqual(['N']);
  });
  it('缺基團的結果不含 Vf', () => {
    const r = computeFreeVolume(RDKit, '[*:1]CC([*:2])Cl');
    expect(r.status).toBe('missing');
    expect(r).not.toHaveProperty('vf');
  });
  it('共聚物任何一個單元缺基團 → 整體缺基團，不略過', () => {
    const r = computeFreeVolume(RDKit, PHS, { units: [{ smiles: PHS, fraction: 70 }, { smiles: '[*:1]CC([*:2])Cl', fraction: 30 }], fractionBasis: 'mol' });
    expect(r.status).toBe('missing');
    if (r.status === 'missing') {
      expect(r.message).toMatch(/整體不計算/);
      expect(r.components.map((c) => c.unit.status)).toEqual(['ok', 'missing']);
    }
  });
  it('無效輸入：空字串、無法解析、多個分子、沒有重原子', () => {
    expect(computeFreeVolume(RDKit, '').status).toBe('invalid');
    expect(computeFreeVolume(RDKit, 'C(C').status).toBe('invalid');
    expect(computeFreeVolume(RDKit, 'CC.CC').status).toBe('invalid');
    expect(computeFreeVolume(RDKit, '[*:1][*:2]').status).toBe('invalid');
  });
});

describe('Vf／Va（Va 用書的任務 029，非使用者定義）', () => {
  it('聚合物單元：Va 等於任務 029 的非晶態莫耳體積，Vf／Va = Vf ÷ Va', () => {
    const r = okFv(PS);
    const va = computeMolarVolumeDensity(RDKit, PS);
    expect(va.status).toBe('ok');
    if (va.status === 'ok' && va.amorphous) {
      expect(r.va).toBeCloseTo(va.amorphous.vm, 10);
      expect(r.vfOverVa).toBeCloseTo(r.vf / va.amorphous.vm, 10);
    }
  });
  it('Va 缺（小分子液體未實作、Table 4.10 缺基團）只標缺，Vf 照算', () => {
    const noGroup = okFv(PHS);
    expect(noGroup.va).toBeNull();
    expect(noGroup.vaNote).toMatch(/Table 4.10 缺基團/);
    const small = okFv('c1ccccc1');
    expect(small.va).toBeNull();
    expect(small.vfOverVa).toBeNull();
    expect(small.vaNote).toMatch(/缺 Va/);
    expect(small.vf).toBeCloseTo(48.66 * 0.37, 10);
  });
  it('共聚物的 Va 按莫耳分率加權；任一單元缺 Va 就只標缺', () => {
    const r = okFv(PS, { units: [{ smiles: PS, fraction: 70 }, { smiles: PE, fraction: 30 }], fractionBasis: 'mol' });
    const a = computeMolarVolumeDensity(RDKit, PS);
    const b = computeMolarVolumeDensity(RDKit, PE);
    expect(a.status === 'ok' && b.status === 'ok').toBe(true);
    if (a.status === 'ok' && b.status === 'ok' && a.amorphous && b.amorphous) expect(r.va).toBeCloseTo(0.7 * a.amorphous.vm + 0.3 * b.amorphous.vm, 10);
    const mixed = okFv(PHS, { units: [{ smiles: PHS, fraction: 70 }, { smiles: PE, fraction: 30 }], fractionBasis: 'mol' });
    expect(mixed.va).toBeNull();
    expect(mixed.vfOverVa).toBeNull();
  });
});

describe('與 xlsx 各列的回歸（結構為 Claude 看圖撰寫，待使用者審；芳香族 H 欄不比對）', () => {
  const KEY_OF: Record<string, keyof (typeof XLSX_ROWS)[number]['counts']> = {
    FV01: 'arC', FV02: 'chC', FV03: 'chCH', FV04: 'chCH2', FV05: 'chCH3', FV06: 'rC', FV07: 'rCH', FV08: 'rCH2', FV09: 'ether', FV10: 'epoxy',
    FV11: 'ketone', FV12: 'aldehyde', FV13: 'ester', FV14: 'oh1', FV15: 'oh2', FV16: 'oh3', FV17: 'phenol', FV18: 'fAl', FV19: 'fAr',
  };
  const keys = Object.values(KEY_OF);
  /** 程式與 xlsx 不一致的欄位（「程式 − xlsx」），每一列都已逐一檢視並歸類，見報告 036a 的 A-4／D-1 */
  const KNOWN_DIFFS: Record<number, Record<string, number>> = {
    // 歸類差異：xlsx 把環上的碳填在「鏈」欄；程式依是否在環上（SMARTS 的 R）分「環」與「鏈」
    5: { chC: -1, rC: 1 },
    6: { chC: -1, rC: 1 },
    8: { chCH: -7, chCH2: -7, rCH: 7, rCH2: 7 },
    9: { chC: -1, chCH: -3, chCH2: -6, rC: 1, rCH: 3, rCH2: 6 },
    10: { chC: -4, chCH2: -2, rC: 3, rCH2: 2 },
    // xlsx 的數量與結構（圖）不符
    15: { chC: -1 }, // 任務 036b：xlsx 的鏈 C 1 在 036a 對應羰基碳；使用者說明酯基含羰基碳後，聚丙烯酸縮水甘油酯單元沒有其他鏈 C。任務 036c：酯基另改用書的 15.2，Vω 另有數值差（見下方 KNOWN_VALUE_DIFFS）
    19: { chCH: 1 }, // 圖有一個 CH(OH)，xlsx 的鏈 CH 是 0
    20: { arC: 4 }, // 雙酚 A 二縮水甘油醚有 12 個芳香 C，xlsx 填 8
    28: { ether: 4 }, // 聚乙二醇 n = 13 有 14 個醚 O，xlsx 填 10
    36: { arC: 12, chC: 2 }, // 雙酚 AF：12 個芳香 C 與兩個 CF3 的碳，xlsx 芳香 C 填 0、鏈 C 填 1
    37: { arC: 6 }, // 三酚有 18 個芳香 C，xlsx 填 12
  };

  it('結構表涵蓋 xlsx 第 5–37 列的每一列', () => {
    expect(XLSX_STRUCTURES.map((s) => s.row)).toEqual(XLSX_ROWS.map((r) => r.row));
  });

  it('xlsx 的 W 欄 ＝ 各欄數量 × 第 4 列的值之和（含芳香族 H 欄），確認抄錄與 xlsx 內部一致', () => {
    for (const row of XLSX_ROWS) {
      const sum = (Object.keys(XLSX_VALUES) as (keyof typeof XLSX_VALUES)[]).reduce((s, k) => s + row.counts[k] * XLSX_VALUES[k], 0);
      expect(sum, `第 ${row.row} 列`).toBeCloseTo(row.w, 4);
    }
  });

  for (const s of XLSX_STRUCTURES) {
    const x = XLSX_ROWS.find((r) => r.row === s.row);
    if (!x || s.smiles === null) continue;
    it(`第 ${s.row} 列 ${x.name ?? '（未命名）'}（${s.basis}）：程式的基團數${KNOWN_DIFFS[s.row] ? '與 xlsx 的已知差異' : '與 xlsx 一致'}`, () => {
      const r = okUnit(s.smiles as string);
      const got: Record<string, number> = {};
      for (const c of r.contributions) got[KEY_OF[c.id]] = c.count;
      const diff: Record<string, number> = {};
      for (const k of keys) {
        const d = (got[k] ?? 0) - x.counts[k];
        if (d !== 0) diff[k] = d;
      }
      expect(diff).toEqual(KNOWN_DIFFS[s.row] ?? {});
    });
  }

  it('任務 036c 已知差異（非程式錯誤，不當回歸期望值）：含酯基的列，程式用書的 –COO– 15.2，xlsx 用 23 ＋ 羰基碳另計；逐列列出 xlsx 值、程式值與差', () => {
    const esterRows = XLSX_ROWS.filter((r) => r.counts.ester > 0).map((r) => r.row);
    expect(esterRows).toEqual(KNOWN_VALUE_DIFFS.map((d) => d.row));
    for (const d of KNOWN_VALUE_DIFFS) {
      const s = XLSX_STRUCTURES.find((x) => x.row === d.row);
      const x = XLSX_ROWS.find((r) => r.row === d.row);
      if (!s || !x || s.smiles === null) throw new Error(`第 ${d.row} 列沒有結構`);
      const r = okUnit(s.smiles);
      expect(x.w, `第 ${d.row} 列 xlsx W`).toBeCloseTo(d.xlsxW, 6);
      expect(r.vomega, `第 ${d.row} 列程式 Vω`).toBeCloseTo(d.program, 6);
      expect(r.vomega - (x.w - x.counts.arH * 3.17), `第 ${d.row} 列差`).toBeCloseTo(d.diff, 6);
    }
  });

  it('酯基 Vω 取自 vw_groups.csv 的 –COO–（V11）列，數值、書頁與出處完整（任務 036c）', () => {
    const v11 = VW_GROUPS.find((r) => r.id === 'V11');
    expect(v11?.name).toBe('–COO–');
    const ester = FREE_VOLUME_GROUPS.find((g) => g.id === 'FV13');
    expect(ester?.vw).toBe(v11?.vw);
    expect(ester?.vw).toBe(15.2);
    expect(ester?.source).toMatch(/Table 4\.2/);
    expect(ester?.source).toMatch(/書頁 74/);
    expect(ester?.notes).toMatch(/使用者表原值 23/);
  });

  it('一致的列：Vω 等於 xlsx 的 W 去掉芳香族 H 項（W − arH × 3.17），Vf = Vω × xlsx 的係數', () => {
    const SAME = XLSX_STRUCTURES.filter((s) => s.smiles !== null && !KNOWN_DIFFS[s.row]);
    expect(SAME.length).toBeGreaterThan(15);
    for (const s of SAME) {
      const x = XLSX_ROWS.find((r) => r.row === s.row);
      if (!x) continue;
      const r = okUnit(s.smiles as string);
      expect(r.vomega, `第 ${s.row} 列 Vω`).toBeCloseTo(x.w - x.counts.arH * 3.17, 4);
      // xlsx 的 X 欄 / W 欄 = xlsx 的係數；程式選的係數應相同（第 17 列 EX192 等脂肪族、環氧 → 1）
      expect(r.coefficient.coefficient, `第 ${s.row} 列係數`).toBeCloseTo(x.x / x.w, 6);
    }
  });
});
