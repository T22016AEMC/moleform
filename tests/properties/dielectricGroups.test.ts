// 莫耳介電極化基團表 polarization_groups.csv 與莫耳折射基團表 molar_refraction_groups.csv 的測試（任務 032，D22）：
// 格式檢查（缺出處、SMARTS 不合法都要報錯）、每個基團的正例／反例、切分互斥。只檢查程式與資料照規則運作（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import {
  MOLAR_REFRACTION_GROUPS_COLUMNS,
  MOLAR_REFRACTION_GROUP_COUNT,
  bundledMolarRefractionGroupsText,
  checkMolarRefractionGroupSmarts,
  readMolarRefractionGroups,
  validateMolarRefractionGroups,
} from '../../src/core/data/molarRefractionGroups';
import {
  POLARIZATION_GROUPS_COLUMNS,
  POLARIZATION_GROUP_COUNT,
  bundledPolarizationGroupsText,
  checkPolarizationGroupSmarts,
  readPolarizationGroups,
  validatePolarizationGroups,
} from '../../src/core/data/polarizationGroups';
import { formatIssue } from '../../src/core/data/types';
import { computeDielectric, computeRefraction } from '../../src/core/properties/dielectricRefraction';
import { vwMatches } from '../../src/core/properties/vanDerWaalsVolume';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { JSMol, RDKitModule } from '../../src/core/rdkit/types';
import { MOLAR_REFRACTION_GROUP_CASES, POLARIZATION_GROUP_CASES, TABLE104, TABLE111, type GroupCase } from './dielectricCases';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const pTable = readPolarizationGroups(bundledPolarizationGroupsText);
const rTable = readMolarRefractionGroups(bundledMolarRefractionGroupsText);

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

const csvLine = (columns: readonly string[], cells: Record<string, string>): string =>
  columns
    .map((c) => {
      const v = cells[c] ?? '';
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    })
    .join(',');

describe('polarization_groups.csv（內建資料）', () => {
  const issues = (): string[] => [...pTable.issues, ...validatePolarizationGroups(pTable), ...checkPolarizationGroupSmarts(RDKit, pTable)].map(formatIssue);

  it('讀取、格式檢查與 RDKit 檢查沒有任何問題', () => {
    expect(issues()).toEqual([]);
  });

  it('20 列（Table 11.1 全部基團），id 為 P01–P20，每列有出處（Table 11.1、書頁 321）與稽核狀態「待使用者審」', () => {
    expect(pTable.rows).toHaveLength(POLARIZATION_GROUP_COUNT);
    pTable.rows.forEach((r, i) => {
      expect(r.id).toBe(`P${String(i + 1).padStart(2, '0')}`);
      expect(r.source).toMatch(/van Krevelen & te Nijenhuis/);
      expect(r.source).toMatch(/Table 11\.1/);
      expect(r.source).toMatch(/書頁 321/);
      expect(r.audit).toBe('待使用者審');
    });
  });

  it('P_LL、P_V 與獨立抄錄的 Table 11.1 一致（書頁圖像放大逐列讀取，測試另行抄錄）', () => {
    const order = Object.keys(TABLE111) as (keyof typeof TABLE111)[];
    expect(order).toHaveLength(POLARIZATION_GROUP_COUNT);
    pTable.rows.forEach((r, i) => expect({ pLL: r.pLL, pV: r.pV }, r.id).toEqual(TABLE111[order[i]]));
  });

  it('括號內與「~」的值：照數值收錄，備註寫「書中標為暫定」並標明欄位', () => {
    const marks = Object.fromEntries(pTable.rows.filter((r) => r.tentativeLL || r.tentativeV).map((r) => [r.id, `${r.tentativeLL ? 'LL' : ''}${r.tentativeLL && r.tentativeV ? ',' : ''}${r.tentativeV ? 'V' : ''}`]));
    expect(marks).toEqual({ P07: 'V', P08: 'LL,V', P12: 'LL,V', P13: 'LL,V', P14: 'V', P18: 'V', P19: 'LL,V', P20: 'LL,V' });
    for (const r of pTable.rows.filter((x) => x.tentativeLL || x.tentativeV)) expect(r.notes, r.id).toMatch(/書中標為暫定/);
  });

  it('基團數與案例表一致', () => {
    expect(POLARIZATION_GROUP_CASES.map((c) => c.id)).toEqual(pTable.rows.map((r) => r.id));
  });
});

describe('molar_refraction_groups.csv（內建資料）', () => {
  it('讀取、格式檢查與 RDKit 檢查沒有任何問題', () => {
    const all = [...rTable.issues, ...validateMolarRefractionGroups(rTable), ...checkMolarRefractionGroupSmarts(RDKit, rTable)];
    expect(all.map(formatIssue)).toEqual([]);
  });

  it('47 列，id 為 R01–R47，每列有出處（Table 10.4、書頁 293 或 294）與稽核狀態「待使用者審」', () => {
    expect(rTable.rows).toHaveLength(MOLAR_REFRACTION_GROUP_COUNT);
    rTable.rows.forEach((r, i) => {
      expect(r.id).toBe(`R${String(i + 1).padStart(2, '0')}`);
      expect(r.source).toMatch(/van Krevelen & te Nijenhuis/);
      expect(r.source).toMatch(/Table 10\.4/);
      expect(r.source).toMatch(/書頁 29[34]/);
      expect(r.audit).toBe('待使用者審');
    });
  });

  it('R 值與獨立抄錄的 Table 10.4（R_LL 欄）一致', () => {
    const byId: Record<string, number> = {
      R01: TABLE104.CH3, R02: TABLE104.CH3ring, R03: TABLE104.CH2, R04: TABLE104.CH2ring, R05: TABLE104.CH, R06: TABLE104.CHring, R07: TABLE104.C, R08: TABLE104.Cring,
      R09: 26.686, R10: TABLE104.phenyl, R11: 24.72, R12: 25.0, R13: TABLE104.pPhenylene,
      R14: 1.587, R15: TABLE104.etherHigher, R16: 1.77, R17: 2.551, R18: 2.458, R19: 2.453, R20: TABLE104.phenol,
      R21: 4.787, R22: 4.533, R23: 5.09, R24: 7.212,
      R25: TABLE104.esterMethyl, R26: TABLE104.esterEthyl, R27: 6.206, R28: TABLE104.esterRing, R29: TABLE104.esterAcetate,
      R30: 7.75, R31: TABLE104.carbonateHigher,
      R32: 4.355, R33: 4.89, R34: 3.585, R35: 4.53, R36: 2.803, R37: 4.05, R38: TABLE104.CONH, R39: 8.5, R40: TABLE104.CN,
      R41: 7.92, R42: 8.07, R43: TABLE104.F, R44: 6.045, R45: TABLE104.ClSecondary, R46: 5.929, R47: 5.6,
    };
    for (const r of rTable.rows) expect(r.r, r.id).toBe(byId[r.id]);
  });

  it('基團數與案例表一致', () => {
    expect(MOLAR_REFRACTION_GROUP_CASES.map((c) => c.id)).toEqual(rTable.rows.map((r) => r.id));
  });
});

describe('格式檢查會報錯的情況（polarization_groups.csv）', () => {
  const HEADER = POLARIZATION_GROUPS_COLUMNS.join(',');
  const SOURCE = 'van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), Table 11.1，書頁 321；SMARTS 自行撰寫（D22）';
  const GOOD = { id: 'P01', 基團名稱: '–CH3', SMARTS: '[CX4H3;D1]', 原子數: '1', P_LL: '5.64', P_V: '17.66', 出處: SOURCE, 稽核狀態: '待使用者審', 備註: '備註' };
  const withFirstRow = (first: string): string => {
    const lines = bundledPolarizationGroupsText.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l !== '');
    return [HEADER, first, ...lines.slice(2)].join('\n');
  };
  const issuesOf = (text: string): string[] => {
    const t = readPolarizationGroups(text);
    return [...t.issues, ...validatePolarizationGroups(t), ...checkPolarizationGroupSmarts(RDKit, t)].map(formatIssue);
  };
  const row = (patch: Record<string, string>): string => issuesOf(withFirstRow(csvLine(POLARIZATION_GROUPS_COLUMNS, { ...GOOD, ...patch }))).join('\n');

  it('正常的列沒有問題', () => {
    expect(row({})).toBe('');
  });
  it('缺出處', () => expect(row({ 出處: '' })).toMatch(/缺出處/));
  it('出處沒有表號或頁碼', () => expect(row({ 出處: 'van Krevelen 2009' })).toMatch(/Table 11\.1/));
  it('SMARTS 不合法', () => expect(row({ SMARTS: '[CX4H3' })).toMatch(/無法解析/));
  it('P_LL、P_V 不是數字（留空也不行）', () => {
    expect(row({ P_LL: 'abc' })).toMatch(/P_LL.*不是數字/);
    expect(row({ P_V: '' })).toMatch(/P_V.*不是數字/);
  });
  it('原子數不合理', () => expect(row({ 原子數: '0' })).toMatch(/原子數/));
  it('id 順序不對、重複', () => {
    expect(row({ id: 'P02' })).toMatch(/應依資料表順序為 P01/);
    expect(row({ id: 'P02' })).toMatch(/重複/);
  });
  it('必填欄位是空的', () => {
    expect(row({ 基團名稱: '' })).toMatch(/基團名稱.*必填/);
    expect(row({ 稽核狀態: '' })).toMatch(/稽核狀態.*必填/);
    expect(row({ 備註: '' })).toMatch(/備註/);
  });
  it('暫定標記格式錯誤、或有標記卻沒寫「書中標為暫定」', () => {
    expect(row({ 備註: '[暫定:X]' })).toMatch(/暫定標記格式/);
    expect(row({ 備註: '[暫定:LL]' })).toMatch(/書中標為暫定/);
  });
  it('列數不對、標題列不一致、欄位數不對', () => {
    expect(issuesOf([HEADER, csvLine(POLARIZATION_GROUPS_COLUMNS, GOOD)].join('\n')).join('\n')).toMatch(/應有 20 列/);
    expect(issuesOf('id,名稱\nP01,x').join('\n')).toMatch(/標題列/);
    expect(issuesOf([HEADER, 'P01,a'].join('\n')).join('\n')).toMatch(/欄位數/);
  });
});

describe('格式檢查會報錯的情況（molar_refraction_groups.csv）', () => {
  const HEADER = MOLAR_REFRACTION_GROUPS_COLUMNS.join(',');
  const SOURCE = 'van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), Table 10.4，書頁 293；SMARTS 自行撰寫（D22）';
  const GOOD = { id: 'R01', 基團名稱: '–CH3（一般）', SMARTS: '[CX4H3;D1;!$(C-a)]', 原子數: '1', R: '5.644', 出處: SOURCE, 稽核狀態: '待使用者審', 備註: '備註' };
  const withFirstRow = (first: string): string => {
    const lines = bundledMolarRefractionGroupsText.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l !== '');
    return [HEADER, first, ...lines.slice(2)].join('\n');
  };
  const issuesOf = (text: string): string[] => {
    const t = readMolarRefractionGroups(text);
    return [...t.issues, ...validateMolarRefractionGroups(t), ...checkMolarRefractionGroupSmarts(RDKit, t)].map(formatIssue);
  };
  const row = (patch: Record<string, string>): string => issuesOf(withFirstRow(csvLine(MOLAR_REFRACTION_GROUPS_COLUMNS, { ...GOOD, ...patch }))).join('\n');

  it('正常的列沒有問題', () => expect(row({})).toBe(''));
  it('缺出處', () => expect(row({ 出處: '' })).toMatch(/缺出處/));
  it('出處沒有表號或頁碼', () => expect(row({ 出處: 'van Krevelen 2009' })).toMatch(/Table 10\.4/));
  it('SMARTS 不合法', () => expect(row({ SMARTS: '[CX4H3' })).toMatch(/無法解析/));
  it('R 不是數字（留空也不行）', () => {
    expect(row({ R: 'abc' })).toMatch(/R.*不是數字/);
    expect(row({ R: '' })).toMatch(/R.*不是數字/);
  });
  it('id 順序不對、必填欄位是空的', () => {
    expect(row({ id: 'R02' })).toMatch(/應依資料表順序為 R01/);
    expect(row({ 稽核狀態: '' })).toMatch(/稽核狀態.*必填/);
  });
  it('列數不對', () => expect(issuesOf([HEADER, csvLine(MOLAR_REFRACTION_GROUPS_COLUMNS, GOOD)].join('\n')).join('\n')).toMatch(/應有 47 列/));
});

function groupCaseTests(label: string, cases: readonly GroupCase[], table: { rows: { id: string; smarts: string; atomCount: number }[] }): void {
  describe(`${label}：每個基團的正例與反例`, () => {
    for (const c of cases) {
      const row = table.rows.find((r) => r.id === c.id);
      describe(`${c.id} ${c.table}`, () => {
        it('每個基團至少一個正例與一個反例', () => {
          expect(c.positives.length).toBeGreaterThanOrEqual(1);
          expect(c.negatives.length).toBeGreaterThanOrEqual(1);
          expect(row).toBeDefined();
        });
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

  describe(`${label}：SMARTS 互斥（同大小的兩個基團不會同時命中同一個原子）`, () => {
    const molecules = [...new Set(cases.flatMap((c) => [...c.positives, ...c.negatives]))];
    for (const smiles of molecules) {
      it(smiles, () => {
        const owners = new Map<string, string[]>();
        for (const r of table.rows) {
          for (const m of matchesOf(r.smarts, smiles)) {
            for (const a of m) {
              const key = `${r.atomCount}:${a}`;
              owners.set(key, [...(owners.get(key) ?? []), r.id]);
            }
          }
        }
        expect([...owners].filter(([, ids]) => new Set(ids).size > 1)).toEqual([]);
      });
    }
  });
}

groupCaseTests('Table 11.1', POLARIZATION_GROUP_CASES, pTable);
groupCaseTests('Table 10.4', MOLAR_REFRACTION_GROUP_CASES, rTable);

describe('含 * 的正例，整個單元切分後切出該基團', () => {
  it('Table 11.1', () => {
    for (const c of POLARIZATION_GROUP_CASES) {
      for (const smiles of c.positives.filter((s) => s.includes('*'))) {
        const r = computeDielectric(RDKit, smiles);
        if (r.status === 'unsupported' || r.status === 'invalid') throw new Error(`${smiles}：${r.status}`);
        expect(r.groups.map((g) => g.id), `${smiles} 沒有切出 ${c.id}`).toContain(c.id);
      }
    }
  });
  it('Table 10.4', () => {
    for (const c of MOLAR_REFRACTION_GROUP_CASES) {
      for (const smiles of c.positives.filter((s) => s.includes('*'))) {
        const r = computeRefraction(RDKit, smiles);
        if (r.status === 'unsupported' || r.status === 'invalid') throw new Error(`${smiles}：${r.status}`);
        expect(r.groups.map((g) => g.id), `${smiles} 沒有切出 ${c.id}`).toContain(c.id);
      }
    }
  });
});
