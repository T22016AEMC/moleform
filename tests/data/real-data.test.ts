import { describe, expect, it } from 'vitest';
import { getRDKit } from '../../src/core/rdkit/loader';
import { bundledTexts, checkAllTables, loadTables } from '../../src/core/data/load';
import { describeIssues } from './helpers';

// 對 src/data 的實際檔案做格式檢查。
describe('src/data 實際資料表', () => {
  it('標題列正確，格式、出處、唯一性與 SMARTS 檢查全部通過', async () => {
    const RDKit = await getRDKit();
    expect(describeIssues(checkAllTables(RDKit, bundledTexts))).toEqual([]);
  });

  it('資料列數：官能基 37 列、反應規則 51 列（任務 016、P7-1A、P7-1B、P7-1C），其餘只有標題列', () => {
    const { tables } = loadTables(bundledTexts);
    expect(tables.functionalGroups.rows).toHaveLength(37);
    expect(tables.functionalGroups.rows.slice(0, 2).map((r) => r.id)).toEqual(['hydroxyl.phenolic', 'ether.epoxide']);
    expect(tables.reactionRules.rows).toHaveLength(51);
    expect(tables.reactionRules.rows[0].id).toBe('epoxy+phenol');
    // P7-1A、P7-1B、P7-1C 新增列一律 pending（D17、D22）
    expect(tables.functionalGroups.rows.slice(2).every((r) => r.review_status === 'pending')).toBe(true);
    expect(tables.reactionRules.rows.slice(1).every((r) => r.review_status === 'pending')).toBe(true);
    expect(tables.groupContributions.rows).toHaveLength(0);
    expect(tables.solvents.rows).toHaveLength(0);
  });

  it('四個檔案都以 UTF-8 BOM 開頭（Excel 可直接開啟中文）', () => {
    for (const text of Object.values(bundledTexts)) {
      expect(text.charCodeAt(0)).toBe(0xfeff);
    }
  });
});
