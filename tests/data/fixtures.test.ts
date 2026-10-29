import { describe, expect, it } from 'vitest';
import { getRDKit } from '../../src/core/rdkit/loader';
import { checkAllTables } from '../../src/core/data/load';
import { describeIssues, findIssues, fixtureTexts } from './helpers';

// 以示範資料證明檢查有效（任務 009 E-13）。示範資料只在 tests/fixtures/，不屬於網站資料。
describe('示範資料：格式正確的資料應通過所有檢查', () => {
  it('valid 組無任何問題', async () => {
    const RDKit = await getRDKit();
    const issues = checkAllTables(RDKit, fixtureTexts('valid'));
    expect(describeIssues(issues)).toEqual([]);
  });
});

describe('示範資料：刻意寫錯的資料，每一種錯誤都要被抓到', () => {
  const FG = 'functional_groups.csv';
  const RR = 'reaction_rules.csv';
  const GC = 'group_contributions.csv';
  const SV = 'solvents.csv';

  // 每個案例：檔案、列、欄位、訊息應包含的字
  const cases: [string, string, number, string | null, string][] = [
    // 官能基
    ['缺出處（source）', FG, 3, 'source', '必填'],
    ['缺出處（source_detail）', FG, 3, 'source_detail', '必填'],
    ['package 缺 source_original', FG, 4, 'source_original', 'package'],
    ['SMARTS 無法解析', FG, 5, 'smarts', '無法解析 SMARTS'],
    ['should_match 沒命中', FG, 6, 'should_match', '應命中但沒有命中'],
    ['重複 id', FG, 7, 'id', '重複'],
    ['should_not_match 卻命中', FG, 8, 'should_not_match', '不應命中卻命中'],
    ['self 缺 notes', FG, 9, 'notes', 'self'],
    ['source_type 不合法', FG, 10, 'source_type', '只能是'],
    ['review_status 不合法', FG, 10, 'review_status', '只能是'],
    ['should_match 為空', FG, 11, 'should_match', '至少需要 1 個'],
    ['reactive_atom_maps 非整數', FG, 12, 'reactive_atom_maps', '整數'],
    ['測試分子 SMILES 無法解析', FG, 13, 'should_match', 'SMILES 無法解析'],
    // 反應規則
    ['group_a 不存在', RR, 3, 'group_a', '不存在'],
    ['temp_min_c > temp_max_c', RR, 4, 'temp_min_c', '不可大於'],
    ['反應 SMARTS 無法解析', RR, 5, 'reaction_smarts', '無法解析'],
    ['should_react 沒反應', RR, 6, 'should_react', '應反應但沒有產物'],
    ['should_not_react 卻反應', RR, 7, 'should_not_react', '不應反應卻有產物'],
    ['反應規則重複 id', RR, 8, 'id', '重複'],
    ['溫度只填一邊', RR, 9, 'temp_min_c', '同時填寫或同時留空'],
    ['group_b 空但 functionality_b 有值', RR, 9, 'functionality_b', '留空'],
    ['bond_volume_change 缺單位', RR, 9, 'bond_volume_change_unit', '單位必填'],
    ['組合格式錯誤', RR, 10, 'should_react', 'SMILES_A+SMILES_B'],
    // 基團貢獻
    ['(method, group_id, property) 重複', GC, 3, 'method, group_id, property', '重複'],
    ['value 不是數字', GC, 4, 'value', '無法轉成數字'],
    ['同一 group_id 名稱不一致', GC, 5, 'group_name', '不一致'],
    ['基團貢獻缺出處', GC, 6, 'source', '必填'],
    // 溶劑
    ['(solvent_id, property, temperature_c) 重複', SV, 3, 'solvent_id, property, temperature_c', '重複'],
    ['同一 solvent_id 的 CAS 不一致', SV, 4, 'cas', '不一致'],
    ['溶劑 value 空白', SV, 5, 'value', '必填'],
    ['溶劑缺 SMILES', SV, 6, 'smiles', '必填'],
  ];

  it.each(cases)('%s', async (_name, file, row, column, text) => {
    const RDKit = await getRDKit();
    const issues = checkAllTables(RDKit, fixtureTexts('invalid'));
    const found = findIssues(issues, file, row, column);
    expect(found.length, `${file} 第 ${row} 列 / ${column} 沒有被抓到`).toBeGreaterThan(0);
    expect(found.some((i) => i.message.includes(text)), describeIssues(found).join('\n')).toBe(true);
  });

  it('沒有誤報：基準列（第 2 列）不產生任何問題', async () => {
    const RDKit = await getRDKit();
    const issues = checkAllTables(RDKit, fixtureTexts('invalid'));
    expect(describeIssues(issues.filter((i) => i.row === 2))).toEqual([]);
  });

  it('標題列與定義不一致會被抓到', async () => {
    const RDKit = await getRDKit();
    const texts = fixtureTexts('valid');
    const bad = { ...texts, solvents: texts.solvents.replace('name_en', 'name_english') };
    const issues = checkAllTables(RDKit, bad);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ file: SV, row: 1 });
    expect(issues[0].message).toContain('標題列與定義不一致');
  });

  it('欄位順序不同也會被抓到', async () => {
    const RDKit = await getRDKit();
    const texts = fixtureTexts('valid');
    const bad = { ...texts, groupContributions: texts.groupContributions.replace('value,unit', 'unit,value') };
    const issues = checkAllTables(RDKit, bad);
    expect(issues.some((i) => i.file === GC && i.row === 1)).toBe(true);
  });

  it('欄位數不符的資料列會被抓到', async () => {
    const RDKit = await getRDKit();
    const texts = fixtureTexts('valid');
    const bad = { ...texts, solvents: texts.solvents + 'a,b,c\r\n' };
    const issues = checkAllTables(RDKit, bad);
    expect(issues.some((i) => i.file === SV && i.row === 4 && i.message.includes('欄位數'))).toBe(true);
  });
});
