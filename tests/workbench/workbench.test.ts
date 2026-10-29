// 配方工作台彈窗的資料轉換與縮圖繪製（任務 018）。只檢查程式行為（D17）；不改計算，所以不新增化學數值。
import { beforeAll, describe, expect, it } from 'vitest';
import { drawMarkedStructure, reactiveAtomsOf } from '../../src/core/crosslink/draw';
import { bundledTexts, loadTables } from '../../src/core/data/load';
import type { Compound } from '../../src/core/library/types';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import type { StructureValidation } from '../../src/core/structure/validate';
import { newRow, toFormulation, emptyState, type Row } from '../../src/ui/formulation/model';
import { createMemoryStorage } from '../../src/ui/library/storage';
import { saveCompoundToLibrary } from '../../src/ui/workbench/libraryBridge';
import {
  applyStructureToRow,
  candidateFromCompound,
  candidateFromValidation,
  defaultComponentName,
  drawSource,
  initialForm,
  libraryInputFromRow,
  rowFromCandidate,
} from '../../src/ui/workbench/model';
import { isChemRequest } from '../../src/worker/protocol';

const valid = (canonicalSmiles: string, molblock = '\n  M\n\nM  END\n'): StructureValidation => ({ valid: true, empty: false, canonicalSmiles, molblock, problems: [] });
const invalid: StructureValidation = { valid: false, empty: false, canonicalSmiles: '', molblock: '', problems: [{ level: 'error', code: 'OTHER', message: 'x' }] };
const POLYMER = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';

const compound = (over: Partial<Compound> = {}): Compound => ({
  id: 'lib-1',
  name: 'BADGE',
  canonicalSmiles: 'C1OC1',
  molfile: '\n  M\n\nM  END\n',
  notes: '',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

describe('加入成分彈窗：結構 → 候選結構', () => {
  it('驗證通過才成為候選；不合法或空白不行', () => {
    expect(candidateFromValidation(valid('CCO'))).toEqual({ canonicalSmiles: 'CCO', molfile: '\n  M\n\nM  END\n' });
    expect(candidateFromValidation(invalid)).toBeNull();
    expect(candidateFromValidation(null)).toBeNull();
    expect(candidateFromValidation({ ...valid(''), valid: true })).toBeNull();
  });

  it('化合物庫的化合物帶入名稱、編號與聚合物設定', () => {
    const c = candidateFromCompound(compound({ name: '丙烯酸樹脂', canonicalSmiles: POLYMER, polymer: { mnInput: 5000 } }));
    expect(c).toMatchObject({ name: '丙烯酸樹脂', compoundId: 'lib-1', canonicalSmiles: POLYMER, polymer: { mnInput: 5000 } });
  });
});

describe('加入成分彈窗：表單 → 配方成分', () => {
  it('預設名稱是「成分 N」（N = 現有成分數 + 1）', () => {
    expect(defaultComponentName(0)).toBe('成分 1');
    expect(initialForm(candidateFromValidation(valid('CCO')), 2, 'Solvent').name).toBe('成分 3');
  });

  it('從化合物庫加入：名稱帶入，並保留化合物編號', () => {
    const candidate = candidateFromCompound(compound());
    const form = initialForm(candidate, 4, 'Resin');
    expect(form.name).toBe('BADGE');
    const row = rowFromCandidate('solid', candidate, form, 4);
    expect(row).toMatchObject({ name: 'BADGE', category: 'Resin', canonicalSmiles: 'C1OC1', compoundId: 'lib-1', amountText: '', isResin: false, volatileFlag: false });
  });

  it('名稱改成空白時用預設名稱；Liquid 區不帶樹脂勾選', () => {
    const candidate = candidateFromValidation(valid('CCO'))!;
    const form = { ...initialForm(candidate, 1, 'Solvent'), name: '   ' };
    const row = rowFromCandidate('liquid', candidate, form, 1);
    expect(row.name).toBe('成分 2');
    expect(row.category).toBe('Solvent');
    expect('isResin' in row).toBe(false);
    expect(row.polymerEdit).toBeUndefined();
  });

  it('聚合物：Mn 填在彈窗裡，進入配方後成為成分的聚合物設定', () => {
    const candidate = candidateFromValidation(valid(POLYMER))!;
    const form = { ...initialForm(candidate, 0, 'Resin'), polymerEdit: { basis: 'mn' as const, text: '12000' } };
    const row = rowFromCandidate('solid', candidate, form, 0);
    const state = { ...emptyState(), solidRows: [row] };
    expect(toFormulation(state).solid.components[0].polymer).toEqual({ mnInput: 12000 });
  });

  it('聚合物：Mn 尚未填時成分仍加入（沒有聚合物設定），輸入框保留使用者打的文字', () => {
    const candidate = candidateFromValidation(valid(POLYMER))!;
    const form = { ...initialForm(candidate, 0, 'Resin'), polymerEdit: { basis: 'dp' as const, text: 'abc' } };
    const row = rowFromCandidate('solid', candidate, form, 0);
    expect(row.polymerEdit).toEqual({ basis: 'dp', text: 'abc' });
    expect(toFormulation({ ...emptyState(), solidRows: [row] }).solid.components[0].polymer).toBeUndefined();
  });

  it('從化合物庫選聚合物：彈窗的 Mn／DP 欄帶入化合物的設定', () => {
    const candidate = candidateFromCompound(compound({ canonicalSmiles: POLYMER, polymer: { dpInput: 80 } }));
    expect(initialForm(candidate, 0, 'Resin').polymerEdit).toEqual({ basis: 'dp', text: '80' });
  });

  it('同時存進化合物庫：化合物資料來自這一列（聚合物帶 Mn／DP）', () => {
    const candidate = candidateFromValidation(valid(POLYMER))!;
    const form = { ...initialForm(candidate, 0, 'Resin'), name: '樹脂 A', polymerEdit: { basis: 'mn' as const, text: '3000' } };
    const row = rowFromCandidate('solid', candidate, form, 0);
    expect(libraryInputFromRow(row)).toEqual({ name: '樹脂 A', canonicalSmiles: POLYMER, molfile: candidate.molfile, polymer: { mnInput: 3000 } });
    const small = rowFromCandidate('liquid', candidateFromValidation(valid('CCO'))!, initialForm(null, 0, 'Solvent'), 0);
    expect(libraryInputFromRow(small).polymer).toBeUndefined();
  });
});

describe('成分詳細彈窗：修改後配方更新', () => {
  const base = (): Row => ({ ...newRow('solid', { name: '樹脂', canonicalSmiles: POLYMER, molfile: 'm', compoundId: 'lib-1' }), id: 'r1', amountText: '10', isResin: true });

  it('改 Mn／DP 後，配方裡的聚合物設定跟著變', () => {
    let row = base();
    expect(toFormulation({ ...emptyState(), solidRows: [row] }).solid.components[0].polymer).toBeUndefined();
    row = { ...row, polymerEdit: { basis: 'mn', text: '8000' } };
    expect(toFormulation({ ...emptyState(), solidRows: [row] }).solid.components[0].polymer).toEqual({ mnInput: 8000 });
    row = { ...row, polymerEdit: { basis: 'dp', text: '40' } };
    expect(toFormulation({ ...emptyState(), solidRows: [row] }).solid.components[0].polymer).toEqual({ dpInput: 40 });
  });

  it('用 Ketcher 套用新結構：換結構，名稱、分類、用量、勾選不變；化合物庫連結取消', () => {
    const next = applyStructureToRow({ ...base(), category: 'Resin' }, { canonicalSmiles: '[*:1]CC([*:2])C', molfile: 'new' });
    expect(next).toMatchObject({ id: 'r1', name: '樹脂', category: 'Resin', amountText: '10', isResin: true, canonicalSmiles: '[*:1]CC([*:2])C', molfile: 'new' });
    expect(next.compoundId).toBeUndefined();
  });

  it('套用新結構：聚合物保留已填的 Mn；改成小分子則不再有聚合物輸入', () => {
    const withMn: Row = { ...base(), polymerEdit: { basis: 'mn', text: '5000' } };
    expect(applyStructureToRow(withMn, { canonicalSmiles: '[*:1]CC[*:2]', molfile: 'x' }).polymerEdit).toEqual({ basis: 'mn', text: '5000' });
    const small = applyStructureToRow(withMn, { canonicalSmiles: 'CCO', molfile: 'y' });
    expect(small.polymerEdit).toBeUndefined();
    expect(toFormulation({ ...emptyState(), solidRows: [small] }).solid.components[0].polymer).toBeUndefined();
  });

  it('小分子沒有 Molfile 時改用 SMILES 畫圖；聚合物一律用 SMILES', () => {
    expect(drawSource({ canonicalSmiles: 'CCO', molfile: 'MOL' })).toBe('MOL');
    expect(drawSource({ canonicalSmiles: 'CCO' })).toBe('CCO');
    expect(drawSource({ canonicalSmiles: POLYMER, molfile: 'MOL' })).toBe(POLYMER);
  });
});

describe('存進化合物庫（彈窗用）', () => {
  it('新增一筆；同結構再存會先回報重複，確認後才新增', async () => {
    const storage = createMemoryStorage();
    const input = { name: '乙醇', canonicalSmiles: 'CCO', molfile: 'm' };
    expect(await saveCompoundToLibrary(input, { storage })).toEqual({ kind: 'saved', name: '乙醇' });
    expect(await saveCompoundToLibrary(input, { storage })).toEqual({ kind: 'duplicate', names: '乙醇' });
    expect(await saveCompoundToLibrary(input, { storage, force: true })).toEqual({ kind: 'saved', name: '乙醇' });
    const all = await storage.loadAll();
    expect(all.ok && all.value).toHaveLength(2);
  });

  it('名稱空白、儲存不可用時回報錯誤，不新增', async () => {
    const storage = createMemoryStorage();
    expect((await saveCompoundToLibrary({ name: ' ', canonicalSmiles: 'CCO' }, { storage })).kind).toBe('error');
    expect((await saveCompoundToLibrary({ name: 'x', canonicalSmiles: 'CCO' }, { storage: createMemoryStorage({ failing: true }) })).kind).toBe('error');
    const all = await storage.loadAll();
    expect(all.ok && all.value).toHaveLength(0);
  });
});

describe('縮圖與詳細圖（Worker 的繪圖請求）', () => {
  let RDKit: RDKitModule;
  const { tables } = loadTables(bundledTexts);
  const groups = tables.functionalGroups.rows;
  const rules = tables.reactionRules.rows;
  beforeAll(async () => {
    RDKit = await getRDKit();
  });

  it('縮圖：不標記時畫出 SVG；聚合物畫重複單元', () => {
    expect(drawMarkedStructure(RDKit, 'CCO', [], { width: 96, height: 48 })).toContain('<svg');
    expect(drawMarkedStructure(RDKit, POLYMER, [], { width: 96, height: 48 })).toContain('<svg');
    expect(drawMarkedStructure(RDKit, 'not a molecule', [], { width: 96, height: 48 })).toBeNull();
  });

  it('反應原子：預設用法不變；聚合物排除連接點時不會比預設多', () => {
    const badge = 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1';
    expect(reactiveAtomsOf(RDKit, badge, groups, rules)).toEqual(reactiveAtomsOf(RDKit, badge, groups, rules, false));
    const all = reactiveAtomsOf(RDKit, POLYMER, groups, rules);
    const excluded = reactiveAtomsOf(RDKit, POLYMER, groups, rules, true);
    expect(excluded.every((a) => all.includes(a))).toBe(true);
    expect(excluded.length).toBeLessThanOrEqual(all.length);
  });

  it('Worker 訊息格式：繪圖請求欄位齊全才接受', () => {
    const request = { type: 'draw', id: 1, source: 'CCO', width: 96, height: 48, color: '#155d70', mark: false, polymer: false };
    expect(isChemRequest(request)).toBe(true);
    expect(isChemRequest({ ...request, mark: 'yes' })).toBe(false);
    expect(isChemRequest({ ...request, source: undefined })).toBe(false);
  });
});
