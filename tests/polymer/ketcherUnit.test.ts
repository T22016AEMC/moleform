// 共聚物單元用 Ketcher 畫、EG10 提示、目標固含量基準的畫面狀態（任務 021）。只檢查程式照規則運作（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeComponent } from '../../src/core/crosslink/analyze';
import { bundledTexts, loadTables } from '../../src/core/data/load';
import { analyzePolymerUnits, checkDrawnUnit } from '../../src/core/polymer/copolymer';
import { analyzeRepeatUnit } from '../../src/core/polymer/repeatUnit';
import type { PolymerSpec } from '../../src/core/polymer/types';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { validateStructure } from '../../src/core/structure/validate';
import { emptyState, fromFormulation, hasVolatileRow, newRow, toFormulation } from '../../src/ui/formulation/model';
import {
  EG10_HINT,
  applyDrawnUnit,
  drawTargetNumber,
  drawTargetSmiles,
  editFromSpec,
  endGroupHint,
  sameDrawTarget,
  specFromEdit,
  type PolymerEdit,
} from '../../src/ui/polymer/model';

const UNIT_A = '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O';
const UNIT_B = '[*:1]C([*:2])c1ccc2ccccc2c1';
const UNIT_C = '[*:1]CC([*:2])c1ccc(O)cc1';

let RDKit: RDKitModule;
const { tables } = loadTables(bundledTexts);
beforeAll(async () => {
  RDKit = await getRDKit();
});

/** 模擬 Ketcher：畫布匯出 Molfile，再由 RDKit 驗證得到 canonical SMILES（與第一種單元用 Ketcher 畫時相同的路徑） */
const drawnFrom = (smiles: string) => {
  const molfile = validateStructure(RDKit, smiles).molblock;
  return validateStructure(RDKit, molfile);
};
const analysisOf = (smiles: string) => analyzeRepeatUnit(RDKit, smiles);

describe('用 Ketcher 畫的單元（任務 021）', () => {
  it('套用的單元與貼同一個 SMILES 的分析結果相同（連接點、官能基數、M_unit）', () => {
    const drawn = drawnFrom(UNIT_B);
    expect(drawn.valid).toBe(true);
    const checked = checkDrawnUnit(drawn, analysisOf(drawn.canonicalSmiles), 2);
    if (!checked.ok) throw new Error(checked.message);
    const mk = (secondSmiles: string): PolymerSpec => ({
      mwInput: 6000,
      pdiInput: 1.8,
      units: [
        { smiles: UNIT_A, fraction: 66.67 },
        { smiles: secondSmiles, fraction: 33.33 },
      ],
    });
    const viaKetcher = analyzePolymerUnits(RDKit, UNIT_A, mk(checked.smiles));
    const viaPaste = analyzePolymerUnits(RDKit, UNIT_A, mk(UNIT_B));
    if (!viaKetcher.ok || !viaPaste.ok) throw new Error('應可分析');
    expect(viaKetcher.mUnit).toBeCloseTo(viaPaste.mUnit, 9);
    expect(viaKetcher.units!.map((u) => u.molFraction)).toEqual(viaPaste.units!.map((u) => u.molFraction));
    expect(viaKetcher.units!.map((u) => u.mUnit.toFixed(6))).toEqual(viaPaste.units!.map((u) => u.mUnit.toFixed(6)));
    // 官能基數與交聯分析
    const comp = (spec: PolymerSpec) => analyzeComponent(RDKit, { id: 'P', name: 'P', canonicalSmiles: UNIT_A, category: 'Resin', polymer: spec }, tables.functionalGroups.rows);
    const a = comp(mk(checked.smiles));
    const b = comp(mk(UNIT_B));
    expect(a.problem).toBeNull();
    expect(a.unitGroupCounts).toEqual(b.unitGroupCounts);
    expect(a.dp).toBeCloseTo(b.dp as number, 9);
    expect(a.units!.map((u) => u.groups.length)).toEqual(b.units!.map((u) => u.groups.length));
    // 含有酚羥基的單元也一致
    const dc = drawnFrom(UNIT_C);
    const cc = checkDrawnUnit(dc, analysisOf(dc.canonicalSmiles), 2);
    if (!cc.ok) throw new Error(cc.message);
    const withC = (s: string): PolymerSpec => ({ mwInput: 6000, units: [{ smiles: UNIT_A, fraction: 50 }, { smiles: s, fraction: 50 }] });
    expect(comp(withC(cc.smiles)).unitGroupCounts).toEqual(comp(withC(UNIT_C)).unitGroupCounts);
  });

  it('畫出不合法的單元：只有一個 *、沒有 *、空白畫布，錯誤訊息指出第幾個單元', () => {
    const one = drawnFrom('*CC');
    const r1 = checkDrawnUnit(one, analysisOf(one.canonicalSmiles), 3);
    expect(r1).toMatchObject({ ok: false });
    expect(!r1.ok && r1.message).toMatch(/^單元 3：.*恰好兩個連接點.*1 個/);
    const none = drawnFrom('CCO');
    expect(checkDrawnUnit(none, null, 2)).toEqual({ ok: false, message: '單元 2：重複單元需要恰好兩個連接點（*），目前沒有連接點。' });
    expect(checkDrawnUnit(null, null, 4)).toEqual({ ok: false, message: '單元 4：畫布上還沒有可用的結構。' });
    const three = drawnFrom('*CC(*)C*');
    const r3 = checkDrawnUnit(three, analysisOf(three.canonicalSmiles), 2);
    expect(!r3.ok && r3.message).toContain('單元 2：');
  });

  it('連接點可以連在同一個原子（D48）：次甲基單元可被套用', () => {
    const d = drawnFrom(UNIT_B);
    expect(checkDrawnUnit(d, analysisOf(d.canonicalSmiles), 2).ok).toBe(true);
  });

  it('套用後寫回該列的 SMILES（比例不動）；新增時多一列；單元序號從 2 起算', () => {
    const base: PolymerEdit = { basis: 'mw', text: '6000', pdiText: '', fractionBasis: 'mol', firstFractionText: '66.67', extraUnits: [{ smiles: '', fractionText: '33.33' }] };
    const edited = applyDrawnUnit(base, { kind: 'edit', index: 0 }, UNIT_B);
    expect(edited.extraUnits).toEqual([{ smiles: UNIT_B, fractionText: '33.33' }]);
    const added = applyDrawnUnit(edited, { kind: 'new' }, UNIT_C);
    expect(added.extraUnits).toEqual([{ smiles: UNIT_B, fractionText: '33.33' }, { smiles: UNIT_C, fractionText: '' }]);
    expect(drawTargetNumber({ kind: 'edit', index: 0 }, base)).toBe(2);
    expect(drawTargetNumber({ kind: 'new' }, edited)).toBe(3);
    expect(drawTargetSmiles({ kind: 'edit', index: 0 }, edited)).toBe(UNIT_B);
    expect(drawTargetSmiles({ kind: 'new' }, edited)).toBe('');
    expect(sameDrawTarget({ kind: 'edit', index: 1 }, { kind: 'edit', index: 1 })).toBe(true);
    expect(sameDrawTarget({ kind: 'edit', index: 1 }, { kind: 'new' })).toBe(false);
    expect(sameDrawTarget(null, { kind: 'new' })).toBe(false);
    // 套用後轉成設定，與貼 SMILES 相同
    expect(specFromEdit(edited, UNIT_A)).toEqual({ mwInput: 6000, units: [{ smiles: UNIT_A, fraction: 66.67 }, { smiles: UNIT_B, fraction: 33.33 }], fractionBasis: 'mol' });
  });
});

describe('端基 EG10 提示（K11）', () => {
  it('選 EG10 出現提示；選其他端基、自訂或不填沒有', () => {
    expect(endGroupHint({ choice: 'EG10', custom: '' })).toBe(EG10_HINT);
    expect(EG10_HINT).toBe('接在芳香環上的酚羥基請改選 EG11（對位酚）或 EG12（鄰位酚）；EG10 只會被當成一般羥基。');
    for (const choice of ['', 'custom', 'EG01', 'EG09', 'EG11', 'EG12']) expect(endGroupHint({ choice, custom: '[*]O' })).toBeNull();
    expect(endGroupHint(undefined)).toBeNull();
  });

  it('選 EG10 的計算結果與任務 022 相同：只是提示，不改端基計算', () => {
    const comp = (end: { smiles: string; presetId?: string }) =>
      analyzeComponent(
        RDKit,
        { id: 'P', name: 'P', canonicalSmiles: UNIT_C, category: 'Resin', polymer: { mnInput: 3000, endGroups: { end1: end } } },
        tables.functionalGroups.rows,
      );
    const edit = editFromSpec({ mnInput: 3000, endGroups: { end1: { smiles: '[*]O', presetId: 'EG10' } } });
    expect(edit.end1).toEqual({ choice: 'EG10', custom: '' });
    const viaPreset = comp(specFromEdit(edit)!.endGroups!.end1!);
    const viaCustom = comp({ smiles: '[*]O' });
    expect(viaPreset.dp).toBe(viaCustom.dp);
    expect(viaPreset.endGroupCounts).toEqual(viaCustom.endGroupCounts);
    expect(viaPreset.endGroupCounts).toEqual({}); // EG10 目前不被當成酚羥基（K11）
  });
});

describe('目標固含量基準的畫面狀態（D49）', () => {
  const rows = (volatile: boolean) => {
    const a = { ...newRow('solid', { name: 'A', canonicalSmiles: 'CCO' }), id: 'a', amountText: '8' };
    const b = { ...newRow('solid', { name: 'B', canonicalSmiles: 'CCN' }), id: 'b', amountText: '2', volatileFlag: volatile };
    const l = { ...newRow('liquid', { name: 'PGMEA', canonicalSmiles: 'COCC(C)OC(C)=O' }), id: 'l', amountText: '' };
    return { a, b, l };
  };

  it('有揮發標記且選「扣除標記成分」才寫入；沒有標記成分時基準固定為全部；存檔讀檔保留', () => {
    const { a, b, l } = rows(true);
    const state = { ...emptyState(), solidRows: [a, b], liquidRows: [l], targetText: '4', targetBasis: 'excludingVolatile' as const };
    expect(hasVolatileRow(state)).toBe(true);
    const f = toFormulation(state);
    expect(f.targetSolidContentBasis).toBe('excludingVolatile');
    expect(f.liquidFromTarget).toBe(true);
    expect(fromFormulation(f).targetBasis).toBe('excludingVolatile');
    expect(toFormulation(fromFormulation(f))).toEqual(f);
    // 取消所有揮發標記：基準不再寫入（自動回到全部）
    const none = rows(false);
    const cleared = toFormulation({ ...state, solidRows: [none.a, none.b] });
    expect(cleared.targetSolidContentBasis).toBeUndefined();
    // 選「全部」或舊檔：視為 all
    expect(toFormulation({ ...state, targetBasis: 'all' }).targetSolidContentBasis).toBeUndefined();
    expect(fromFormulation({ ...f, targetSolidContentBasis: undefined }).targetBasis).toBe('all');
  });
});
