// 任務 024 後續：骨架範本可從空白使用、取代確認只在會丟失內容時才問、分子工具借用 Ketcher 後還原畫布（K12）。
// 判斷規則是純函式，這裡直接測試；只檢查程式照任務單運作，不判斷化學正確性（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import { BACKBONE_TEMPLATES } from '../../src/core/data/backboneTemplates';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { validateStructure } from '../../src/core/structure/validate';
import { applyBackboneTemplate, emptyPolymerEdit, templateReplaceNeedsConfirm, type PolymerEdit } from '../../src/ui/polymer/model';
import { canvasRestoreInput } from '../../src/ui/structure/canvasRestore';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const canonical = (smiles: string) => {
  const v = validateStructure(RDKit, smiles);
  expect(v.valid).toBe(true);
  return v.canonicalSmiles;
};

describe('從空白狀態選骨架範本', () => {
  it('填入結果與從已有結構（含舊設定）選範本相同，分子量欄位不動', () => {
    for (const row of BACKBONE_TEMPLATES) {
      const fromBlank = applyBackboneTemplate(emptyPolymerEdit(), row);
      const existing: PolymerEdit = {
        ...emptyPolymerEdit(),
        end1: { choice: 'EG01', custom: '' },
        extraUnits: [{ smiles: '[*:1]CC[*:2]', fractionText: '30' }],
        firstFractionText: '70',
        fractionBasis: 'wt',
      };
      const fromExisting = applyBackboneTemplate(existing, row);
      expect(fromExisting).toEqual(fromBlank); // 單元只剩範本的一種、共聚物欄位移除、端基換成範本的
      expect(fromBlank.extraUnits).toBeUndefined();
      expect(fromBlank.end1).toBeDefined();
      expect(fromBlank.end2).toBeDefined();
    }
    const withMw: PolymerEdit = { basis: 'dp', text: '25', pdiText: '1.5' };
    const row = BACKBONE_TEMPLATES[0];
    expect(applyBackboneTemplate(withMw, row)).toMatchObject({ basis: 'dp', text: '25', pdiText: '1.5' });
  });
});

describe('範本取代確認（只在會丟失內容時才問）', () => {
  const row = BACKBONE_TEMPLATES[0];
  let unit = '';
  let other = '';
  beforeAll(() => {
    unit = canonical(row.unitSmiles);
    other = canonical(BACKBONE_TEMPLATES[1].unitSmiles);
  });

  it('空白、或重選同一個範本（沒有端基與其他單元）→ 不問', () => {
    expect(templateReplaceNeedsConfirm(emptyPolymerEdit(), '', null)).toBe(false);
    expect(templateReplaceNeedsConfirm(emptyPolymerEdit(), '', unit)).toBe(false);
    expect(templateReplaceNeedsConfirm(emptyPolymerEdit(), unit, unit)).toBe(false);
    // 自訂端基但沒填內容不算已填
    expect(templateReplaceNeedsConfirm({ ...emptyPolymerEdit(), end1: { choice: 'custom', custom: ' ' } }, unit, unit)).toBe(false);
    // 分子量欄位不會因選範本丟失，不影響判斷
    expect(templateReplaceNeedsConfirm({ basis: 'mw', text: '5000', pdiText: '2' }, unit, unit)).toBe(false);
  });

  it('已填任何端基 → 問', () => {
    expect(templateReplaceNeedsConfirm({ ...emptyPolymerEdit(), end1: { choice: 'EG01', custom: '' } }, unit, unit)).toBe(true);
    expect(templateReplaceNeedsConfirm({ ...emptyPolymerEdit(), end2: { choice: 'custom', custom: '[*]CCO' } }, '', null)).toBe(true);
    // 範本填入後的狀態有端基；再選同一個範本仍會問（端基會被取代）
    expect(templateReplaceNeedsConfirm(applyBackboneTemplate(emptyPolymerEdit(), row), unit, unit)).toBe(true);
  });

  it('有第二種以後的單元 → 問', () => {
    const edit: PolymerEdit = { ...emptyPolymerEdit(), extraUnits: [{ smiles: '', fractionText: '' }] };
    expect(templateReplaceNeedsConfirm(edit, unit, unit)).toBe(true);
  });

  it('目前第一個單元與範本單元不同（正規化 SMILES）→ 問；範本無法正規化時保守地問', () => {
    expect(templateReplaceNeedsConfirm(emptyPolymerEdit(), other, unit)).toBe(true);
    expect(templateReplaceNeedsConfirm(emptyPolymerEdit(), 'CCO', unit)).toBe(true);
    expect(templateReplaceNeedsConfirm(emptyPolymerEdit(), unit, null)).toBe(true);
  });

  it('同一個結構的不同寫法（SMILES 與 Molfile）正規化後相同 → 不問', () => {
    const viaMolfile = validateStructure(RDKit, validateStructure(RDKit, row.unitSmiles).molblock).canonicalSmiles;
    expect(templateReplaceNeedsConfirm(emptyPolymerEdit(), viaMolfile, unit)).toBe(false);
  });
});

describe('分子工具借用 Ketcher 後還原畫布（K12）', () => {
  const unfinished = '\n  Ketcher\n\n  2  0  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0\n    1.0000    0.0000    0.0000 C   0  0\nM  END\n';

  it('最近一次匯出的 Molfile 優先，即使驗證沒通過（例如畫到一半的結構）', () => {
    const invalid = { valid: false, molblock: '' };
    expect(canvasRestoreInput(unfinished, invalid)).toBe(unfinished);
    expect(canvasRestoreInput(unfinished, { valid: true, molblock: 'older' })).toBe(unfinished);
  });

  it('還沒有匯出過：退回最近一次驗證過的合法結構；都沒有就不還原', () => {
    expect(canvasRestoreInput(undefined, { valid: true, molblock: 'valid-mol' })).toBe('valid-mol');
    expect(canvasRestoreInput(undefined, { valid: false, molblock: '' })).toBeUndefined();
    expect(canvasRestoreInput(undefined, undefined)).toBeUndefined();
  });
});
