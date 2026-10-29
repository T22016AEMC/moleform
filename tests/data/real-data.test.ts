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

  it('資料列數：官能基 2 列、反應規則 1 列（任務 016），其餘只有標題列', () => {
    const { tables } = loadTables(bundledTexts);
    expect(tables.functionalGroups.rows.map((r) => r.id)).toEqual(['hydroxyl.phenolic', 'ether.epoxide']);
    expect(tables.reactionRules.rows.map((r) => r.id)).toEqual(['epoxy+phenol']);
    expect(tables.groupContributions.rows).toHaveLength(0);
    expect(tables.solvents.rows).toHaveLength(0);
  });

  it('四個檔案都以 UTF-8 BOM 開頭（Excel 可直接開啟中文）', () => {
    for (const text of Object.values(bundledTexts)) {
      expect(text.charCodeAt(0)).toBe(0xfeff);
    }
  });
});
