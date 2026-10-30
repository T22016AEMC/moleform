// VW 基團表 vw_groups.csv 的測試（任務 028，D22）：格式檢查、Mi 與基團質量核對、每個基團的正例／反例、切分互斥。只檢查程式與資料照規則運作（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import {
  VW_GROUPS_COLUMNS,
  VW_GROUP_COUNT,
  bundledVwGroupsText,
  checkVwGroupSmarts,
  readVwGroups,
  validateVwGroups,
} from '../../src/core/data/vwGroups';
import { formatIssue } from '../../src/core/data/types';
import { checkVwGroupMasses, computeVdwVolume, miTolerance, vwMatches } from '../../src/core/properties/vanDerWaalsVolume';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { JSMol, RDKitModule } from '../../src/core/rdkit/types';
import { VW_GROUP_CASES } from './vwCases';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const table = readVwGroups(bundledVwGroupsText);
const HEADER = VW_GROUPS_COLUMNS.join(',');
const SOURCE = 'van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), Table 4.2，書頁 74；SMARTS 自行撰寫（D22）';
const line = (cells: Partial<Record<(typeof VW_GROUPS_COLUMNS)[number], string>>): string =>
  VW_GROUPS_COLUMNS.map((c) => {
    const v = cells[c] ?? '';
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');
const GOOD = { id: 'V01', 基團名稱: '–CH2–', SMARTS: '[CX4H2;D2;!R]', 原子數: '1', VW: '10.23', Mi: '14.03', '二價／非二價': '二價', 出處: SOURCE, 稽核狀態: '待使用者審', 備註: '與 Bondi 1964 相符' };
/** 其餘 25 列用資料表本身補齊，只改第一列，讓「列數」檢查不干擾單項測試 */
const withFirstRow = (first: string): string => {
  const lines = bundledVwGroupsText.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l !== '');
  return [HEADER, first, ...lines.slice(2)].join('\n');
};
const issuesOf = (text: string): string[] => {
  const t = readVwGroups(text);
  return [...t.issues, ...validateVwGroups(t), ...checkVwGroupSmarts(RDKit, t)].map(formatIssue);
};
const positivesById = Object.fromEntries(VW_GROUP_CASES.map((c) => [c.id, c.positives]));

describe('vw_groups.csv（內建資料）', () => {
  it('讀取、格式檢查與 RDKit 檢查沒有任何問題', () => {
    const all = [...table.issues, ...validateVwGroups(table), ...checkVwGroupSmarts(RDKit, table)];
    expect(all.map(formatIssue)).toEqual([]);
  });

  it('26 列，id 為 V01–V26，每列有出處（含 Table 4.2 與書頁碼）、稽核狀態「待使用者審」、備註提到 Bondi 或說明留空', () => {
    expect(table.rows).toHaveLength(VW_GROUP_COUNT);
    table.rows.forEach((r, i) => {
      expect(r.id).toBe(`V${String(i + 1).padStart(2, '0')}`);
      expect(r.source).toMatch(/Table 4\.2/);
      expect(r.source).toMatch(/書頁 7[45]/);
      expect(r.source).toMatch(/van Krevelen & te Nijenhuis/);
      expect(r.audit).toBe('待使用者審');
      expect(r.notes).toMatch(/Bondi|留空/);
    });
  });

  it('只有 –O– 的 VW 留空（書中兩個括號值沒有標示條件，使用者 2026-10-30 指示），其餘都有數值', () => {
    expect(table.rows.filter((r) => r.vw === null).map((r) => r.id)).toEqual(['V10']);
    expect(table.rows.find((r) => r.id === 'V10')?.notes).toMatch(/留空/);
  });

  it('書中印於括號內的 –CONH– 備註有寫明；二價／非二價欄只有兩種值', () => {
    expect(table.rows.find((r) => r.id === 'V12')?.notes).toMatch(/括號/);
    for (const r of table.rows) expect(['二價', '非二價']).toContain(r.valence);
  });

  it('基團數與案例表一致，名稱順序可逐列核對', () => {
    expect(VW_GROUP_CASES.map((c) => c.id)).toEqual(table.rows.map((r) => r.id));
  });
});

describe('格式檢查會報錯的情況', () => {
  it('缺出處', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 出處: '' }))).join('\n')).toMatch(/缺出處/);
  });
  it('出處沒有表號或頁碼', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 出處: 'van Krevelen 2009' }))).join('\n')).toMatch(/Table 4\.2/);
  });
  it('SMARTS 不合法', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, SMARTS: '[CX4H2' }))).join('\n')).toMatch(/無法解析/);
  });
  it('數值不是數字', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, VW: 'abc' }))).join('\n')).toMatch(/VW.*不是數字/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, Mi: '14,03' }))).join('\n')).toMatch(/Mi.*不是數字/);
  });
  it('原子數不合理', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 原子數: '0' }))).join('\n')).toMatch(/原子數/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, 原子數: '11' }))).join('\n')).toMatch(/原子數/);
  });
  it('VW 留空但備註沒有說明', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, VW: '' }))).join('\n')).toMatch(/VW 留空/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, VW: '', 備註: 'VW 留空：書中兩個值未標條件' }))).join('\n')).not.toMatch(/VW 留空時/);
  });
  it('二價／非二價不是兩種值之一', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, '二價／非二價': '一價' }))).join('\n')).toMatch(/二價／非二價/);
  });
  it('id 順序不對、重複', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, id: 'V02' }))).join('\n')).toMatch(/應依資料表順序為 V01/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, id: 'V02' }))).join('\n')).toMatch(/重複/);
  });
  it('必填欄位是空的', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 基團名稱: '' }))).join('\n')).toMatch(/基團名稱.*必填/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, 稽核狀態: '' }))).join('\n')).toMatch(/稽核狀態.*必填/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, 備註: '' }))).join('\n')).toMatch(/備註/);
  });
  it('列數不對', () => {
    expect(issuesOf([HEADER, line(GOOD)].join('\n')).join('\n')).toMatch(/應有 26 列/);
  });
  it('標題列與定義不一致', () => {
    expect(issuesOf('id,名稱\nV01,x').join('\n')).toMatch(/標題列/);
  });
  it('欄位數不對', () => {
    expect(issuesOf([HEADER, 'V01,a'].join('\n')).join('\n')).toMatch(/欄位數/);
  });
});

describe('Mi 與基團質量核對（每讀一列都核對）', () => {
  it('每個基團的 Mi 與命中原子（含氫）的質量相符（兩位小數容許 0.02；一位小數容許 0.05）', () => {
    expect(checkVwGroupMasses(RDKit, table, positivesById).map(formatIssue)).toEqual([]);
  });

  it('容許值：兩位小數的 Mi 為 0.02，只印一位小數的（127.2）為 0.05', () => {
    expect(miTolerance(14.03)).toBe(0.02);
    expect(miTolerance(86.05)).toBe(0.02);
    expect(miTolerance(127.2)).toBe(0.05);
  });

  it('Mi 被改錯時會報錯', () => {
    const bad = { ...table, rows: table.rows.map((r) => (r.id === 'V01' ? { ...r, mi: 14.5 } : r)) };
    expect(checkVwGroupMasses(RDKit, bad, positivesById).map(formatIssue).join('\n')).toMatch(/Mi 與基團質量不符/);
  });

  it('沒有正例的基團無法核對，會報錯', () => {
    expect(checkVwGroupMasses(RDKit, table, {}).length).toBe(VW_GROUP_COUNT);
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
  for (const c of VW_GROUP_CASES) {
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
        it(`正例 ${smiles}：切分結果含 ${c.id}（或 VW 留空的基團列為缺基團）`, () => {
          const r = computeVdwVolume(RDKit, smiles);
          if (r.status === 'ok') expect(r.groups.map((g) => g.id)).toContain(c.id);
          else if (r.status === 'missing') {
            // 缺基團時：基團已配到（在 groups）或因 VW 留空而列在 missing 的 reason 裡
            const inGroups = r.groups.some((g) => g.id === c.id);
            const blank = r.missing.some((m) => m.reason !== null && m.reason.includes((row as { name: string }).name));
            expect(inGroups || blank, `${smiles} 沒有切出 ${c.id}`).toBe(true);
          } else throw new Error(`預期可切分，實際 ${r.status}`);
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

describe('SMARTS 互斥：同大小的兩個基團不會同時命中同一個原子', () => {
  const molecules = [...new Set(VW_GROUP_CASES.flatMap((c) => [...c.positives, ...c.negatives]))];
  // 不同大小的基團重疊（例如 –O– 與 –COO–）由「大基團先配」處理；同大小的基團不應互相重疊
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
