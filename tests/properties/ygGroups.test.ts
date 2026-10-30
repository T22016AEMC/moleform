// Yg 基團表 yg_groups.csv 的測試（任務 026，D22）：格式檢查、每個基團的正例／反例、Mi 與基團質量。只檢查程式與資料照規則運作（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import {
  YG_GROUPS_COLUMNS,
  bundledYgGroupsText,
  checkYgGroupSmarts,
  readYgGroups,
  validateYgGroups,
  ygFamilyId,
  type YgGroupRow,
} from '../../src/core/data/ygGroups';
import { formatIssue } from '../../src/core/data/types';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const table = readYgGroups(bundledYgGroupsText);
const HEADER = YG_GROUPS_COLUMNS.join(',');
const line = (cells: Partial<Record<(typeof YG_GROUPS_COLUMNS)[number], string>>): string =>
  YG_GROUPS_COLUMNS.map((c) => {
    const v = cells[c] ?? '';
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');
const GOOD = {
  id: 'X.CH2',
  基團名稱: '–CH2–',
  SMARTS: '[CH2;D2;!R]',
  Ygi: '2.7',
  Mi: '14.0',
  表格區段: 'A 非共軛',
  類型: '單一基團',
  出處: 'van Krevelen & te Nijenhuis (2009), Table 6.1 A，書頁 133',
  稽核狀態: '待使用者審',
  '正例 SMILES': 'CCC',
  '反例 SMILES': 'CC',
};
const issuesOf = (text: string): string[] => {
  const t = readYgGroups(text);
  return [...t.issues, ...validateYgGroups(t), ...checkYgGroupSmarts(RDKit, t)].map(formatIssue);
};

describe('yg_groups.csv（內建資料）', () => {
  it('讀取、格式檢查與 RDKit 檢查沒有任何問題', () => {
    const all = [...table.issues, ...validateYgGroups(table), ...checkYgGroupSmarts(RDKit, table)];
    expect(all.map(formatIssue)).toEqual([]);
    expect(table.rows.length).toBeGreaterThan(0);
  });

  it('每一列都有書中表號與頁碼出處、稽核狀態與正反例', () => {
    for (const r of table.rows) {
      expect(r.source, r.id).toMatch(/Properties of Polymers 4th ed\. \(2009\), Table 6\.\d/);
      expect(r.source, r.id).toMatch(/書頁 \d+/);
      expect(r.audit, r.id).not.toBe('');
      expect(r.positives.length, r.id).toBeGreaterThan(0);
      expect(r.negatives.length, r.id).toBeGreaterThan(0);
    }
  });

  it('每個基團的每個正例都命中、每個反例都不命中（逐列列出）', () => {
    for (const r of table.rows) {
      const q = RDKit.get_qmol(r.smarts)!;
      try {
        for (const s of r.positives) {
          const m = RDKit.get_mol(s)!;
          expect(JSON.parse(m.get_substruct_match(q)).atoms?.length ?? 0, `${r.id} 正例 ${s}`).toBeGreaterThan(0);
          m.delete();
        }
        for (const s of r.negatives) {
          const m = RDKit.get_mol(s)!;
          expect(JSON.parse(m.get_substruct_match(q)).atoms?.length ?? 0, `${r.id} 反例 ${s}`).toBe(0);
          m.delete();
        }
      } finally {
        q.delete();
      }
    }
  });

  it('Table 6.1 A 讀回的幾個值與書中一致（逐一看圖確認的數字）', () => {
    const v = (id: string): YgGroupRow => table.rows.find((r) => r.id === id) as YgGroupRow;
    expect([v('A.CH2.gen').ygi, v('A.CH2.hb').ygi]).toEqual([2.7, 4.3]);
    expect([v('A.CH(C6H5)').ygi, v('A.CH(C6H5)').mi]).toEqual([36.1, 90.1]);
    expect([v('A.C(CH3)(COOCH3)').ygi, v('A.C(CH3)(COOCH3)').mi]).toEqual([35.1, 86.1]);
    expect([v('B.pC6H4.n').ygi, v('B.pC6H4.c').ygi, v('B.pC6H4.cc').ygi]).toEqual([29.5, 35, 41]);
    expect([v('B.mC6H4.n').ygi, v('B.mC6H4.c').ygi, v('B.mC6H4.cc').ygi]).toEqual([25, 29, 34]);
    expect([v('A.C(CH3)2.free').ygi, v('A.C(CH3)2.hindered').ygi]).toEqual([8.5, 15]);
    expect([v('T.BPA').ygi, v('T.BPA').mi]).toEqual([87, 194.3]);
  });

  it('家族 id：有共軛狀態或條件的列去掉後綴', () => {
    expect(ygFamilyId({ id: 'B.pC6H4.cc', state: 'cc', condition: '' })).toBe('B.pC6H4');
    expect(ygFamilyId({ id: 'A.CH2.hb', state: '', condition: 'hb' })).toBe('A.CH2');
    expect(ygFamilyId({ id: 'A.CH(OH)', state: '', condition: '' })).toBe('A.CH(OH)');
  });
});

describe('Yg 基團表的格式檢查會抓到錯誤', () => {
  it('合法的最小表沒有問題', () => {
    expect(issuesOf(`${HEADER}\n${line(GOOD)}\n`)).toEqual([]);
  });

  it('缺出處報錯（D22）', () => {
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, 出處: '' })}\n`).join('\n')).toContain('缺出處');
  });

  it('出處沒有表號或頁碼報錯', () => {
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, 出處: 'van Krevelen 全書' })}\n`).join('\n')).toContain('書中表號');
  });

  it('SMARTS 不合法報錯', () => {
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, SMARTS: '[CH2' })}\n`).join('\n')).toContain('無法解析');
  });

  it('Mi 與基團質量不符報錯', () => {
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, Mi: '28.0' })}\n`).join('\n')).toContain('基團質量');
  });

  it('正例沒命中、反例命中都報錯', () => {
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, '正例 SMILES': 'CC' })}\n`).join('\n')).toContain('沒有命中');
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, '反例 SMILES': 'CCC' })}\n`).join('\n')).toContain('不應命中');
  });

  it('缺正例或反例、id 重複、數值不是數字、狀態與 id 後綴不符都報錯', () => {
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, '正例 SMILES': '' })}\n`).join('\n')).toContain('至少要有一個正例');
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, '反例 SMILES': '' })}\n`).join('\n')).toContain('至少要有一個反例');
    expect(issuesOf(`${HEADER}\n${line(GOOD)}\n${line(GOOD)}\n`).join('\n')).toContain('重複');
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, Ygi: 'abc' })}\n`).join('\n')).toContain('不是數字');
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, 共軛狀態: 'c' })}\n`).join('\n')).toContain('必須以「.c」結尾');
  });

  it('括號的暫定值：稽核狀態沒註明「書中標為暫定」報錯，註明就通過', () => {
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, Ygi: '(2.7)' })}\n`).join('\n')).toContain('書中標為暫定');
    const ok = readYgGroups(`${HEADER}\n${line({ ...GOOD, Ygi: '(2.7)', 稽核狀態: '待使用者審；書中標為暫定' })}\n`);
    expect(ok.rows[0].ygi).toBe(2.7);
    expect(ok.rows[0].tentative).toBe(true);
    expect(validateYgGroups(ok)).toEqual([]);
  });

  it('標題列不符報錯', () => {
    expect(issuesOf(`id,名稱\nX,Y\n`).join('\n')).toContain('標題列');
  });
});
