// Joback 基團表 joback_groups.csv 的測試（任務 027，D22）：格式檢查、每個基團的正例／反例、切分互斥。只檢查程式與資料照規則運作（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import {
  JOBACK_GROUPS_COLUMNS,
  JOBACK_GROUP_COUNT,
  bundledJobackGroupsText,
  checkJobackGroupSmarts,
  readJobackGroups,
  validateJobackGroups,
} from '../../src/core/data/jobackGroups';
import { formatIssue } from '../../src/core/data/types';
import { computeJoback, jobackMatches } from '../../src/core/properties/jobackTbTf';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { JSMol, RDKitModule } from '../../src/core/rdkit/types';
import { JOBACK_GROUP_CASES, TABLE3_NAMES } from './jobackCases';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const table = readJobackGroups(bundledJobackGroupsText);
const HEADER = JOBACK_GROUPS_COLUMNS.join(',');
const SOURCE = 'SMARTS：thermo 0.6.1 joback.py（MIT）；數值：Joback & Reid 1987，表 III，書頁 236';
const line = (cells: Partial<Record<(typeof JOBACK_GROUPS_COLUMNS)[number], string>>): string =>
  JOBACK_GROUPS_COLUMNS.map((c) => {
    const v = cells[c] ?? '';
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');
const GOOD = { id: 'J01', 基團名稱: '–CH3', SMARTS: '[CX4H3]', 原子數: '1', Tbi: '23.58', Tfi: '-5.10', 出處: SOURCE, 稽核狀態: '待使用者審' };
/** 其餘 40 列用資料表本身補齊，只改第一列，讓「列數」檢查不干擾單項測試 */
const withFirstRow = (first: string): string => {
  const lines = bundledJobackGroupsText.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l !== '');
  return [HEADER, first, ...lines.slice(2)].join('\n');
};
const issuesOf = (text: string): string[] => {
  const t = readJobackGroups(text);
  return [...t.issues, ...validateJobackGroups(t), ...checkJobackGroupSmarts(RDKit, t)].map(formatIssue);
};

describe('joback_groups.csv（內建資料）', () => {
  it('讀取、格式檢查與 RDKit 檢查沒有任何問題', () => {
    const all = [...table.issues, ...validateJobackGroups(table), ...checkJobackGroupSmarts(RDKit, table)];
    expect(all.map(formatIssue)).toEqual([]);
  });

  it('41 列，id 依表 III 順序為 J01–J41，每列有出處（含表 III 與頁碼）與稽核狀態「待使用者審」', () => {
    expect(table.rows).toHaveLength(JOBACK_GROUP_COUNT);
    table.rows.forEach((r, i) => {
      expect(r.id).toBe(`J${String(i + 1).padStart(2, '0')}`);
      expect(r.source).toMatch(/表 III/);
      expect(r.source).toMatch(/頁/);
      expect(r.source).toMatch(/Joback & Reid 1987/);
      expect(r.audit).toBe('待使用者審');
    });
  });

  it('每列的備註都說明表 III 其他欄位本任務未使用；沒有收錄 Tc、Pc、Vc 等數值欄', () => {
    expect([...JOBACK_GROUPS_COLUMNS]).toEqual(['id', '基團名稱', 'SMARTS', '原子數', 'Tbi', 'Tfi', '出處', '稽核狀態', '備註']);
    for (const r of table.rows) expect(r.notes).toMatch(/本任務未使用/);
  });

  it('只有 –N=（非環）的 Tfi 留空（表 III 該格為「—」）', () => {
    expect(table.rows.filter((r) => r.tfi === null).map((r) => r.id)).toEqual(['J34']);
  });

  it('基團數與案例表一致，名稱順序可與表 III 逐列核對', () => {
    expect(JOBACK_GROUP_CASES.map((c) => c.id)).toEqual(table.rows.map((r) => r.id));
    expect(TABLE3_NAMES).toHaveLength(41);
  });
});

describe('格式檢查會報錯的情況', () => {
  it('缺出處', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 出處: '' }))).join('\n')).toMatch(/缺出處/);
  });
  it('出處沒有表號或頁碼', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 出處: 'Joback & Reid 1987' }))).join('\n')).toMatch(/表 III/);
  });
  it('SMARTS 不合法', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, SMARTS: '[CX4H3' }))).join('\n')).toMatch(/無法解析/);
  });
  it('數值不是數字', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, Tbi: 'abc' }))).join('\n')).toMatch(/Tbi.*不是數字/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, Tfi: '1,5' }))).join('\n')).toMatch(/Tfi/);
  });
  it('原子數不是 1–3', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 原子數: '4' }))).join('\n')).toMatch(/原子數/);
  });
  it('Tfi 留空但備註沒有說明表 III 為「—」', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, Tfi: '' }))).join('\n')).toMatch(/Tfi 留空/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, Tfi: '', 備註: '表 III 該格為「—」' }))).join('\n')).not.toMatch(/Tfi 留空/);
  });
  it('id 順序不對', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, id: 'J02' }))).join('\n')).toMatch(/應依表 III 的順序為 J01/);
  });
  it('id 重複', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, id: 'J02' }))).join('\n')).toMatch(/重複/);
  });
  it('必填欄位是空的', () => {
    expect(issuesOf(withFirstRow(line({ ...GOOD, 基團名稱: '' }))).join('\n')).toMatch(/基團名稱.*必填/);
    expect(issuesOf(withFirstRow(line({ ...GOOD, 稽核狀態: '' }))).join('\n')).toMatch(/稽核狀態.*必填/);
  });
  it('列數不是 41', () => {
    expect(issuesOf([HEADER, line(GOOD)].join('\n')).join('\n')).toMatch(/應有 41 列/);
  });
  it('標題列與定義不一致', () => {
    expect(issuesOf('id,名稱\nJ01,x').join('\n')).toMatch(/標題列/);
  });
  it('欄位數不對', () => {
    expect(issuesOf([HEADER, 'J01,a'].join('\n')).join('\n')).toMatch(/欄位數/);
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
    return withMol(smiles, (mol) => jobackMatches(mol, q));
  } finally {
    q.delete();
  }
}

describe('每個基團的正例與反例', () => {
  for (const c of JOBACK_GROUP_CASES) {
    const row = table.rows.find((r) => r.id === c.id);
    describe(`${c.id} ${c.table3}`, () => {
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
        it(`正例 ${smiles}：切分結果含 ${c.id}`, () => {
          const r = computeJoback(RDKit, smiles);
          if (r.status === 'ok' || r.status === 'missing') expect(r.groups.map((g) => g.id)).toContain(c.id);
          else throw new Error(`預期可切分，實際 ${r.status}`);
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
  const molecules = [...new Set(JOBACK_GROUP_CASES.flatMap((c) => [...c.positives, ...c.negatives]))];
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

describe('與 thermo 0.6.1 不同的兩條 SMARTS（以表 III 為準）', () => {
  it('J26 醛：thermo 的 [CH;D2;$(C-!@C)](=O) 配不到苯甲醛（醛基接芳香碳），本表的配得到', () => {
    expect(matchesOf('[CH;D2;$(C-!@C)](=O)', 'O=Cc1ccccc1')).toEqual([]);
    expect(matchesOf('[CH;D2;$(C-!@C)](=O)', 'CC=O').length).toBe(1);
    expect(matchesOf((table.rows[25] as { smarts: string }).smarts, 'O=Cc1ccccc1').length).toBe(1);
  });
  it('J33 >N–（非環）：thermo 的 [#7X3H0;!$([#7](~O)~O)] 把環內三級氮也算進來，表 III 沒有環內 >N–，本表排除', () => {
    expect(matchesOf('[#7X3H0;!$([#7](~O)~O)]', 'CN1CCCC1').length).toBe(1);
    expect(matchesOf((table.rows[32] as { smarts: string }).smarts, 'CN1CCCC1')).toEqual([]);
  });
});
