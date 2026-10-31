// 聚合物莫耳體積基團表 molar_volume_polymer_groups.csv 的測試（任務 029，D22）：格式檢查、每個基團的正例／反例、切分互斥。只檢查程式與資料照規則運作（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import {
  MOLAR_VOLUME_GROUPS_COLUMNS,
  MOLAR_VOLUME_GROUP_COUNT,
  bundledMolarVolumeGroupsText,
  checkMolarVolumeGroupSmarts,
  readMolarVolumeGroups,
  validateMolarVolumeGroups,
} from '../../src/core/data/molarVolumeGroups';
import { formatIssue } from '../../src/core/data/types';
import { computeMolarVolumeDensity } from '../../src/core/properties/molarVolumeDensity';
import { vwMatches } from '../../src/core/properties/vanDerWaalsVolume';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { JSMol, RDKitModule } from '../../src/core/rdkit/types';
import { MOLAR_VOLUME_GROUP_CASES, TABLE410 } from './molarVolumeCases';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const table = readMolarVolumeGroups(bundledMolarVolumeGroupsText);
const HEADER = MOLAR_VOLUME_GROUPS_COLUMNS.join(',');
const SOURCE = 'van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), Table 4.10，書頁 88；SMARTS 自行撰寫（D22）';
const line = (cells: Partial<Record<(typeof MOLAR_VOLUME_GROUPS_COLUMNS)[number], string>>): string =>
  MOLAR_VOLUME_GROUPS_COLUMNS.map((c) => {
    const v = cells[c] ?? '';
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');
const GOOD = { id: 'M01', 基團名稱: '–CH2–', SMARTS: '[CX4H2;D2;!R]', 原子數: '1', Va: '16.37', Vc: '14.68', 出處: SOURCE, 稽核狀態: '待使用者審', 備註: '限非環原子' };
/** 其餘 14 列用資料表本身補齊，只改第一列，讓「列數」檢查不干擾單項測試 */
const withFirstRow = (first: string): string => {
  const lines = bundledMolarVolumeGroupsText.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l !== '');
  return [HEADER, first, ...lines.slice(2)].join('\n');
};
const issuesOf = (text: string): string[] => {
  const t = readMolarVolumeGroups(text);
  return [...t.issues, ...validateMolarVolumeGroups(t), ...checkMolarVolumeGroupSmarts(RDKit, t)].map(formatIssue);
};

describe('molar_volume_polymer_groups.csv（內建資料）', () => {
  it('讀取、格式檢查與 RDKit 檢查沒有任何問題', () => {
    const all = [...table.issues, ...validateMolarVolumeGroups(table), ...checkMolarVolumeGroupSmarts(RDKit, table)];
    expect(all.map(formatIssue)).toEqual([]);
  });

  it('27 列（原 15 列加任務 031 補收的 12 列），id 為 M01–M27，每列有出處（含 Table 4.10 與書頁 88）、稽核狀態「待使用者審」', () => {
    expect(table.rows).toHaveLength(MOLAR_VOLUME_GROUP_COUNT);
    table.rows.forEach((r, i) => {
      expect(r.id).toBe(`M${String(i + 1).padStart(2, '0')}`);
      expect(r.source).toMatch(/Table 4\.10/);
      expect(r.source).toMatch(/書頁 88/);
      expect(r.source).toMatch(/van Krevelen & te Nijenhuis/);
      expect(r.audit).toBe('待使用者審');
    });
  });

  it('括號內的值（–O– al./ar.、–CONH–、任務 031 的萘環、二苯基取代苯環、環己基、–SO2–）備註寫明「書中印於括號內」「書中標為暫定」；其他列沒有這個字樣', () => {
    const tentative = table.rows.filter((r) => r.notes.includes('書中印於括號內')).map((r) => r.id);
    expect(tentative).toEqual(['M09', 'M10', 'M13', 'M16', 'M19', 'M20', 'M26']);
    for (const id of tentative) expect(table.rows.find((r) => r.id === id)?.notes).toMatch(/書中標為暫定/);
  });

  it('Va、Vc 與獨立抄錄的 Table 4.10 一致（由書頁圖像逐列讀取，測試另行抄錄）', () => {
    const byId: Record<string, { va: number; vc: number }> = {
      M01: TABLE410.CH2,
      M02: TABLE410.CH_CH3,
      M03: TABLE410.CH_C6H11,
      M04: TABLE410.CH_C6H5,
      M05: { va: 22.3, vc: 20 },
      M06: TABLE410.CHCl,
      M07: TABLE410.C_CH3_2,
      M08: TABLE410.C_CH3_COOCH3,
      M09: { va: 8.5, vc: 7.9 },
      M10: { va: 8.0, vc: 7.1 },
      M11: TABLE410.COO_general,
      M12: TABLE410.OCOO,
      M13: TABLE410.CONH,
      M14: TABLE410.C6H4_meta,
      M15: TABLE410.C6H4_para,
      // 任務 031 補收（Table 4.10 書頁 88 圖像逐列讀取）
      M16: { va: 112, vc: 100 },
      M17: { va: 151, vc: 135 },
      M18: { va: 104, vc: 94 },
      M19: { va: 208, vc: 190 },
      M20: { va: 86, vc: 77 },
      M21: { va: 100.5, vc: 90 },
      M22: { va: 40.8, vc: 36.6 },
      M23: { va: 52.4, vc: 47 },
      M24: { va: 56.85, vc: 51 },
      M25: { va: 17.3, vc: 15.5 },
      M26: { va: 32.5, vc: 29 },
      M27: { va: 67.5, vc: 60.6 },
    };
    for (const r of table.rows) expect({ va: r.va, vc: r.vc }, r.id).toEqual(byId[r.id]);
  });

  it('基團數與案例表一致', () => {
    expect(MOLAR_VOLUME_GROUP_CASES.map((c) => c.id)).toEqual(table.rows.map((r) => r.id));
  });
});

describe('格式檢查會報錯的情況', () => {
  it('缺出處', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 出處: '' }))).join('\n')).toMatch(/缺出處/);
  });
  it('出處沒有表號或頁碼', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 出處: 'van Krevelen 2009' }))).join('\n')).toMatch(/Table 4\.10/);
  });
  it('SMARTS 不合法', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, SMARTS: '[CX4H2' }))).join('\n')).toMatch(/無法解析/);
  });
  it('Va、Vc 不是數字（留空也不行）', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, Va: 'abc' }))).join('\n')).toMatch(/Va.*不是數字/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, Vc: '' }))).join('\n')).toMatch(/Vc.*不是數字/);
  });
  it('原子數不合理', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 原子數: '0' }))).join('\n')).toMatch(/原子數/);
  });
  it('id 順序不對、重複', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, id: 'M02' }))).join('\n')).toMatch(/應依資料表順序為 M01/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, id: 'M02' }))).join('\n')).toMatch(/重複/);
  });
  it('必填欄位是空的', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 基團名稱: '' }))).join('\n')).toMatch(/基團名稱.*必填/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, 稽核狀態: '' }))).join('\n')).toMatch(/稽核狀態.*必填/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, 備註: '' }))).join('\n')).toMatch(/備註/);
  });
  it('列數不對', () => {
    expect(issuesOf([HEADER, line(GOOD)].join('\n')).join('\n')).toMatch(/應有 27 列/);
  });
  it('標題列與定義不一致', () => {
    expect(issuesOf('id,名稱\nM01,x').join('\n')).toMatch(/標題列/);
  });
  it('欄位數不對', () => {
    expect(issuesOf([HEADER, 'M01,a'].join('\n')).join('\n')).toMatch(/欄位數/);
  });
});

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

describe('每個基團的正例與反例', () => {
  for (const c of MOLAR_VOLUME_GROUP_CASES) {
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

  it('含 * 的正例，整個單元切分後切出該基團（含 * 的正例都要能走完整流程）', () => {
    for (const c of MOLAR_VOLUME_GROUP_CASES) {
      for (const smiles of c.positives.filter((s) => s.includes('*'))) {
        const r = computeMolarVolumeDensity(RDKit, smiles);
        if (r.status === 'unsupported' || r.status === 'invalid') throw new Error(`${smiles}：${r.status}`);
        expect(r.groups.map((g) => g.id), `${smiles} 沒有切出 ${c.id}`).toContain(c.id);
      }
    }
  });
});

describe('SMARTS 互斥：同大小的兩個基團不會同時命中同一個原子', () => {
  const molecules = [...new Set(MOLAR_VOLUME_GROUP_CASES.flatMap((c) => [...c.positives, ...c.negatives]))];
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
      const clash = [...owners].filter(([, ids]) => new Set(ids).size > 1);
      expect(clash).toEqual([]);
    });
  }
});
