// 聚合物在化合物庫、配方與編輯狀態中的存取測試（任務 015）：來回不變、舊版檔案仍可讀。只檢查程式行為（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import { computeFormulation } from '../../src/core/formulation/compute';
import {
  exportFormulationsJson,
  importFormulationsJson,
  saveFormulation,
} from '../../src/core/formulation/library';
import { parseFormulation, serializeFormulation } from '../../src/core/formulation/serialize';
import type { Formulation } from '../../src/core/formulation/types';
import {
  exportLibraryJson,
  exportLibrarySdf,
  importLibraryJson,
  importLibrarySdf,
  type Canonicalize,
  type ValidateMolfile,
} from '../../src/core/library/exchange';
import { addCompound, editPolymer } from '../../src/core/library/library';
import type { Library } from '../../src/core/library/types';
import type { PolymerSpec } from '../../src/core/polymer/types';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { validateStructure } from '../../src/core/structure/validate';
import { emptyState, fromFormulation, newRow, toFormulation } from '../../src/ui/formulation/model';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const E_UNIT = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';
const P_UNIT = '[*:1]c1ccc(C2(c3ccc(C([*:2])c4ccc5ccccc5c4)c(O)c3)c3ccccc3-c3ccccc32)cc1O';
const T1 = new Date('2026-10-01T00:00:00.000Z');
const T2 = new Date('2026-10-02T00:00:00.000Z');

const canonicalize: Canonicalize = async (smiles) => {
  const r = validateStructure(RDKit, smiles);
  return r.valid ? r.canonicalSmiles : null;
};
const validateMolfile: ValidateMolfile = async (molfile) => {
  const r = validateStructure(RDKit, molfile);
  if (r.valid) return { ok: true, canonicalSmiles: r.canonicalSmiles, molfile: r.molblock };
  return { ok: false, reason: r.problems.find((p) => p.level === 'error')?.message ?? '無效' };
};

function make(library: Library, name: string, smiles: string, id: string, polymer?: PolymerSpec): Library {
  const v = validateStructure(RDKit, smiles);
  expect(v.valid).toBe(true);
  const added = addCompound(library, { name, canonicalSmiles: v.canonicalSmiles, molfile: v.molblock, ...(polymer ? { polymer } : {}) }, T1, id);
  if (!added.ok) throw new Error(added.error);
  return added.value.library;
}

describe('化合物庫：儲存聚合物', () => {
  it('聚合物存重複單元、連接點（在 SMILES 與 Molfile 中）、Mn 或 DP', () => {
    const lib = make(make([], 'PGMA', E_UNIT, 'e', { dpInput: 21 }), '酚醛', P_UNIT, 'p', { mnInput: 6000 });
    expect(lib[0].polymer).toEqual({ dpInput: 21 });
    expect(lib[1].polymer).toEqual({ mnInput: 6000 });
    expect(lib[0].canonicalSmiles).toContain('[*:1]');
    expect(lib[0].canonicalSmiles).toContain('[*:2]');
    expect(lib[0].molfile).toContain('M  END');
  });

  it('聚合物設定不合規則會被拒絕：兩個都填、沒有連接點、非正數', () => {
    const v = validateStructure(RDKit, E_UNIT);
    const base = { name: 'x', canonicalSmiles: v.canonicalSmiles };
    expect(addCompound([], { ...base, polymer: { mnInput: 1, dpInput: 2 } }).ok).toBe(false);
    expect(addCompound([], { ...base, polymer: {} }).ok).toBe(false);
    expect(addCompound([], { ...base, polymer: { mnInput: -5 } }).ok).toBe(false);
    expect(addCompound([], { name: 'x', canonicalSmiles: 'CCO', polymer: { mnInput: 100 } }).ok).toBe(false);
    expect(addCompound([], { ...base, polymer: { mnInput: 100 } }).ok).toBe(true);
  });

  it('editPolymer 只改 Mn／DP；對非聚合物（沒有連接點）失敗', () => {
    const lib = make(make([], 'PGMA', E_UNIT, 'e', { dpInput: 21 }), '乙醇', 'CCO', 'c');
    const edited = editPolymer(lib, 'e', { mnInput: 3000 }, T2);
    expect(edited.ok && edited.value[0].polymer).toEqual({ mnInput: 3000 });
    expect(edited.ok && edited.value[0].updatedAt).toBe(T2.toISOString());
    expect(editPolymer(lib, 'c', { mnInput: 3000 }).ok).toBe(false);
    expect(editPolymer(lib, 'e', { mnInput: 0 }).ok).toBe(false);
    expect(editPolymer(lib, 'zzz', { mnInput: 5 }).ok).toBe(false);
  });
});

describe('化合物庫 JSON：來回不變與舊版檔案', () => {
  it('含聚合物的庫匯出再匯入，內容完全相同', async () => {
    let lib = make([], '乙醇', 'CCO', 'c');
    lib = make(lib, 'PGMA', E_UNIT, 'e', { dpInput: 21 });
    lib = make(lib, '酚醛', P_UNIT, 'p', { mnInput: 6000 });
    const text = exportLibraryJson(lib, T2);
    expect(JSON.parse(text).compounds[1].polymer).toEqual({ dpInput: 21 });
    expect(JSON.parse(text).compounds[0].polymer).toBeUndefined();
    const outcome = await importLibraryJson([], text, canonicalize);
    expect(outcome.ok).toBe(true);
    expect(outcome.library).toEqual(lib);
    expect(outcome.summary).toMatchObject({ added: 3, skipped: 0 });
  });

  it('舊版檔案（沒有 polymer 欄位）仍可讀，視為一般化合物', async () => {
    const old = JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-10-01T00:00:00.000Z',
      compounds: [
        { id: 'old-1', name: '乙醇', canonicalSmiles: 'CCO', molfile: '', notes: '舊資料', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' },
      ],
    });
    const outcome = await importLibraryJson([], old, canonicalize);
    expect(outcome.ok).toBe(true);
    expect(outcome.library).toHaveLength(1);
    expect(outcome.library[0].name).toBe('乙醇');
    expect(outcome.library[0].polymer).toBeUndefined();
  });

  it('壞的聚合物設定那一列被略過並說明原因，其他列照常匯入', async () => {
    const good = { id: 'g', name: '乙醇', canonicalSmiles: 'CCO', molfile: '', notes: '', createdAt: T1.toISOString(), updatedAt: T1.toISOString() };
    const text = JSON.stringify({
      schemaVersion: 1,
      compounds: [
        good,
        { ...good, id: 'b1', name: '兩個都填', canonicalSmiles: '*CC*', polymer: { mnInput: 1, dpInput: 2 } },
        { ...good, id: 'b2', name: '沒連接點', polymer: { mnInput: 100 } },
        { ...good, id: 'b3', name: '負數', canonicalSmiles: '*CC*', polymer: { dpInput: -1 } },
      ],
    });
    const outcome = await importLibraryJson([], text, canonicalize);
    expect(outcome.ok).toBe(true);
    expect(outcome.library.map((c) => c.id)).toEqual(['g']);
    expect(outcome.summary.skipped).toBe(3);
  });

  it('內容比較包含聚合物設定：Mn 不同的同 id 視為不同內容', async () => {
    const a = make([], 'PGMA', E_UNIT, 'e', { dpInput: 21 });
    const text = exportLibraryJson(a, T2);
    const changed = editPolymer(a, 'e', { dpInput: 30 }, T2);
    if (!changed.ok) throw new Error(changed.error);
    const outcome = await importLibraryJson(changed.value, text, canonicalize);
    // 匯入的 updatedAt（T1）較舊 → 保留現有；不是「內容相同」
    expect(outcome.summary.reasons).toEqual(['內容不同但現有的較新或一樣新']);
    expect(outcome.library[0].polymer).toEqual({ dpInput: 30 });
  });
});

describe('化合物庫 SDF：聚合物', () => {
  it('匯出以重複單元的 Molfile 輸出，並附 MoleForm_Type=polymer 與 MoleForm_Mn／MoleForm_DP', () => {
    const lib = make(make([], 'PGMA', E_UNIT, 'e', { dpInput: 21 }), '酚醛', P_UNIT, 'p', { mnInput: 6000 });
    const sdf = exportLibrarySdf(lib.map((compound) => ({ compound, molfile: compound.molfile })));
    expect(sdf).toContain('> <MoleForm_Type>\npolymer\n');
    expect(sdf).toContain('> <MoleForm_DP>\n21\n');
    expect(sdf).toContain('> <MoleForm_Mn>\n6000\n');
    expect(sdf.match(/MoleForm_Type/g)).toHaveLength(2);
  });

  it('一般化合物不帶聚合物欄位', () => {
    const lib = make([], '乙醇', 'CCO', 'c');
    const sdf = exportLibrarySdf(lib.map((compound) => ({ compound, molfile: compound.molfile })));
    expect(sdf).not.toContain('MoleForm_Type');
  });

  it('匯出再匯入：聚合物設定與重複單元不變', async () => {
    const lib = make(make([], 'PGMA', E_UNIT, 'e', { dpInput: 21 }), '酚醛', P_UNIT, 'p', { mnInput: 6000 });
    const sdf = exportLibrarySdf(lib.map((compound) => ({ compound, molfile: compound.molfile })));
    const outcome = await importLibrarySdf([], sdf, validateMolfile, T2);
    expect(outcome.ok).toBe(true);
    expect(outcome.library).toHaveLength(2);
    expect(outcome.library[0]).toMatchObject({ name: 'PGMA', canonicalSmiles: lib[0].canonicalSmiles, polymer: { dpInput: 21 } });
    expect(outcome.library[1]).toMatchObject({ name: '酚醛', canonicalSmiles: lib[1].canonicalSmiles, polymer: { mnInput: 6000 } });
  });

  it('MoleForm_Type=polymer 但缺 Mn／DP 的紀錄被略過', async () => {
    const lib = make([], 'PGMA', E_UNIT, 'e', { dpInput: 21 });
    const sdf = exportLibrarySdf(lib.map((compound) => ({ compound, molfile: compound.molfile }))).replace('> <MoleForm_DP>\n21\n', '');
    const outcome = await importLibrarySdf([], sdf, validateMolfile, T2);
    expect(outcome.library).toHaveLength(0);
    expect(outcome.summary.skipped).toBe(1);
  });
});

function polymerFormulation(): Formulation {
  return {
    schemaVersion: 1,
    name: '配方 4A',
    solid: {
      unit: 'wt',
      components: [
        { id: 'p', name: 'P', canonicalSmiles: validateStructure(RDKit, P_UNIT).canonicalSmiles, category: 'Resin', amount: 80, polymer: { mnInput: 6000 } },
        { id: 'e', name: 'E', canonicalSmiles: validateStructure(RDKit, E_UNIT).canonicalSmiles, category: 'Resin', amount: 20, polymer: { dpInput: 21 } },
      ],
    },
    liquid: { unit: 'g', components: [{ id: 'l', name: 'PGMEA', canonicalSmiles: 'COCC(C)OC(C)=O', category: 'Solvent', amount: 96 }] },
    solidTotalG: 4,
    targetSolidContentPct: 4,
  };
}

describe('配方：聚合物成分', () => {
  it('序列化再讀回，聚合物設定不變', () => {
    const f = polymerFormulation();
    const back = parseFormulation(serializeFormulation(f));
    expect(back.ok && back.formulation).toEqual(f);
  });

  it('配方庫匯出再匯入，聚合物設定不變', () => {
    const saved = saveFormulation([], polymerFormulation(), undefined, T1);
    if (!saved.ok) throw new Error(saved.error);
    const text = exportFormulationsJson(saved.value.library, undefined, T2);
    const outcome = importFormulationsJson([], text);
    expect(outcome.ok).toBe(true);
    expect(outcome.library).toEqual(saved.value.library);
    expect(outcome.library[0].formulation.solid.components[1].polymer).toEqual({ dpInput: 21 });
  });

  it('舊版配方（成分沒有 polymer）仍可讀', () => {
    const f = polymerFormulation();
    for (const c of [...f.solid.components, ...f.liquid.components]) delete c.polymer;
    const back = parseFormulation(JSON.stringify(f));
    expect(back.ok && back.formulation.solid.components[0].polymer).toBeUndefined();
    expect(back.ok).toBe(true);
  });

  it('壞的聚合物設定被拒絕而不拋錯', () => {
    const f = JSON.parse(serializeFormulation(polymerFormulation()));
    f.solid.components[0].polymer = { mnInput: 1, dpInput: 2 };
    expect(parseFormulation(JSON.stringify(f)).ok).toBe(false);
    f.solid.components[0].polymer = { mnInput: -3 };
    expect(parseFormulation(JSON.stringify(f)).ok).toBe(false);
  });

  it('質量相關換算照常（wt%、g、Solid Content）；缺分子量時 mol% 整區不輸出，有 Mn 時以鏈計輸出（D46）', () => {
    const f = polymerFormulation();
    const without = computeFormulation(f, {});
    expect(without.errors).toEqual([]);
    expect(without.results.solid!.components[0].molPct.value).toBeNull();
    expect(without.warnings.some((w) => w.code === 'MOL_UNAVAILABLE')).toBe(true);
    const withMn = computeFormulation(f, { p: 6000, e: 3000 });
    expect(withMn.errors).toEqual([]);
    const solid = withMn.results.solid!;
    expect(solid.components[0].wtPct.value).toBeCloseTo(80, 8);
    expect(solid.components[1].wtPct.value).toBeCloseTo(20, 8);
    // 以鏈計：P 80/6000、E 20/3000 → 莫耳比 0.013333 : 0.006667 = 2 : 1
    expect(solid.components[0].molPct.value).toBeCloseTo((2 / 3) * 100, 8);
    expect(solid.components[1].molPct.value).toBeCloseTo((1 / 3) * 100, 8);
    // 質量：Solid 總重 4 g 依 wt% 分配（不受 mol% 基準影響）
    expect(solid.components[0].massG?.value).toBeCloseTo(3.2, 8);
    expect(solid.components[1].massG?.value).toBeCloseTo(0.8, 8);
  });

  it('mol% 單位含聚合物且缺分子量 → 整區報錯（MISSING_MW）', () => {
    const f = polymerFormulation();
    f.solid.unit = 'mol';
    const outcome = computeFormulation(f, {});
    expect(outcome.errors.some((e) => e.code === 'MISSING_MW')).toBe(true);
    expect(outcome.results.solid).toBeNull();
  });

  it('配方檔的聚合物 mol% 基準：unit 會存下並讀回；沒有這個欄位的舊檔視為整條鏈', () => {
    const f = { ...polymerFormulation(), polymerMolBasis: 'unit' as const };
    const back = parseFormulation(serializeFormulation(f));
    expect(back.ok && back.formulation.polymerMolBasis).toBe('unit');
    const old = parseFormulation(serializeFormulation(polymerFormulation()));
    expect(old.ok && old.formulation.polymerMolBasis).toBeUndefined();
  });

  it('指定 Solid 總重後，Solid Content 與目標反推可算', () => {
    const f = polymerFormulation();
    const outcome = computeFormulation(f, { p: 6000, e: 3000 });
    expect(outcome.results.overall.solidContent.value).toBeCloseTo(4, 8);
    expect(outcome.results.overall.target?.liquidTotal.value).toBeCloseTo(96, 8);
  });
});

describe('配方編輯狀態：聚合物欄位', () => {
  it('含連接點的成分帶 Mn／DP 輸入；轉成配方再轉回，內容不變', () => {
    const state = emptyState();
    state.name = '4A';
    const row = newRow('solid', { name: 'E', canonicalSmiles: validateStructure(RDKit, E_UNIT).canonicalSmiles, polymer: { dpInput: 21 } });
    row.amountText = '20';
    state.solidRows = [row, { ...newRow('solid', { name: '乙醇', canonicalSmiles: 'CCO' }), amountText: '80' }];
    const f = toFormulation(state);
    expect(f.solid.components[0].polymer).toEqual({ dpInput: 21 });
    expect(f.solid.components[1].polymer).toBeUndefined();
    expect(f.solid.components[0]).not.toHaveProperty('polymerEdit');
    const back = fromFormulation(f);
    expect(back.solidRows[0].polymerEdit).toEqual({ basis: 'dp', text: '21', pdiText: '' });
    expect(toFormulation(back)).toEqual(f);
  });

  it('Mn／DP 還沒填或無效時，配方中不帶 polymer（不產生壞資料）', () => {
    const state = emptyState();
    const row = newRow('solid', { name: 'E', canonicalSmiles: validateStructure(RDKit, E_UNIT).canonicalSmiles });
    row.amountText = '1';
    expect(row.polymerEdit).toEqual({ basis: 'mw', text: '', pdiText: '' });
    state.solidRows = [row];
    expect(toFormulation(state).solid.components[0].polymer).toBeUndefined();
    row.polymerEdit = { basis: 'mn', text: 'abc', pdiText: '' };
    expect(toFormulation(state).solid.components[0].polymer).toBeUndefined();
    row.polymerEdit = { basis: 'mn', text: '-5', pdiText: '' };
    expect(toFormulation(state).solid.components[0].polymer).toBeUndefined();
    row.polymerEdit = { basis: 'mw', text: '6000', pdiText: 'abc' };
    expect(toFormulation(state).solid.components[0].polymer).toBeUndefined();
  });
});
