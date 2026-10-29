// 聚合物端基的測試（任務 022，D50）：端基資料表、端基質量與換算、端基官能基、凝膠點、存取。只檢查程式照規則運作（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeCrosslink } from '../../src/core/crosslink/analyze';
import { buildSystem, computeLayer1, type Layer1Setup } from '../../src/core/crosslink/layer1/layer1';
import { gelConversion } from '../../src/core/crosslink/layer1/millerMacosko';
import { prepareLayer1 } from '../../src/core/crosslink/layer1/prepare';
import type { CrosslinkComponent } from '../../src/core/crosslink/types';
import { bundledTexts, loadTables } from '../../src/core/data/load';
import { END_GROUPS_COLUMNS, END_GROUP_PRESETS, bundledEndGroupsText, checkEndGroupSmiles, readEndGroups, validateEndGroups } from '../../src/core/data/endGroups';
import { computeFormulation } from '../../src/core/formulation/compute';
import type { Formulation } from '../../src/core/formulation/types';
import { exportLibrarySdf, importLibraryJson, importLibrarySdf, exportLibraryJson, type Canonicalize, type ValidateMolfile } from '../../src/core/library/exchange';
import { addCompound } from '../../src/core/library/library';
import { analyzePolymerUnits } from '../../src/core/polymer/copolymer';
import { parsePolymerSpec, resolvePolymer } from '../../src/core/polymer/convert';
import { analyzeEndGroup, analyzeEndGroups, endGroupNote } from '../../src/core/polymer/endGroups';
import { analyzeRepeatUnit } from '../../src/core/polymer/repeatUnit';
import type { PolymerSpec } from '../../src/core/polymer/types';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { validateStructure } from '../../src/core/structure/validate';
import { editFromSpec, specFromEdit } from '../../src/ui/polymer/model';
import { parseFormulation, serializeFormulation } from '../../src/core/formulation/serialize';

let RDKit: RDKitModule;
const { tables } = loadTables(bundledTexts);
const T = { functionalGroups: tables.functionalGroups.rows, reactionRules: tables.reactionRules.rows };
beforeAll(async () => {
  RDKit = await getRDKit();
});

const preset = (id: string) => END_GROUP_PRESETS.find((p) => p.id === id)!;
const endOf = (id: string) => ({ smiles: preset(id).smiles, presetId: id });
const mUnitOf = (smiles: string) => {
  const a = analyzeRepeatUnit(RDKit, smiles);
  if (!a.ok) throw new Error(a.problem.message);
  return a.mUnit;
};

describe('端基資料表 end_groups.csv', () => {
  it('27 列、順序與 id 照任務單；標題列、必填、出處、唯一、* 恰好一個、RDKit 解析都通過', () => {
    const table = readEndGroups(bundledEndGroupsText);
    expect(table.issues).toEqual([]);
    expect(table.rows).toHaveLength(27);
    expect(table.rows.map((r) => r.id)).toEqual(Array.from({ length: 27 }, (_, i) => `EG${String(i + 1).padStart(2, '0')}`));
    expect(validateEndGroups(table)).toEqual([]);
    expect(checkEndGroupSmiles(RDKit, table)).toEqual([]);
    expect(table.rows.every((r) => r.source === 'Claude 依一般化學知識整理，使用者 2026-10-30 審核保留')).toBe(true);
    expect(bundledEndGroupsText.charCodeAt(0)).toBe(0xfeff);
    expect(table.rows[0]).toMatchObject({ id: 'EG01', name: '氫', smiles: '[*][H]' });
    expect(table.rows[7]).toMatchObject({ id: 'EG08', name: '縮水甘油醚基', smiles: '[*]OCC1CO1' });
    expect(table.rows[26]).toMatchObject({ id: 'EG27', name: '矽氫', smiles: '[*][SiH](C)C' });
  });

  const header = END_GROUPS_COLUMNS.join(',');
  it('格式錯誤會報錯並指出列與欄位：缺出處、SMILES 的 * 不是一個、id 重複、標題列不符、RDKit 解析失敗', () => {
    const bad = readEndGroups(`${header}\nEG01,氫,[*][H],各類,\nEG02,甲基,C,各類,x\nEG03,苯,[*]c1ccccc1[*],各類,x\nEG03,重複,[*]C,各類,x\nEG04,壞,[*]C(,各類,x`);
    const issues = validateEndGroups(bad);
    const where = (col: string) => issues.filter((i) => i.column === col).map((i) => i.row);
    expect(where('出處')).toEqual([2]);
    expect(where('SMILES')).toEqual([3, 4]);
    expect(where('id')).toEqual([5]);
    expect(checkEndGroupSmiles(RDKit, bad).map((i) => i.row)).toContain(6);
    expect(readEndGroups('id,name\nEG01,x').issues[0].message).toContain('標題列與定義不一致');
  });
});

describe('端基質量與連接點檢查', () => {
  it('M_end：氫約 1.008、正丁基約 57.11、縮水甘油醚基約 73.07', () => {
    const m = (id: string) => {
      const r = analyzeEndGroup(RDKit, endOf(id), 1);
      if (!r.ok) throw new Error(r.message);
      return r.info.mEnd;
    };
    expect(m('EG01')).toBeCloseTo(1.008, 3);
    expect(m('EG04')).toBeCloseTo(57.116, 3);
    expect(m('EG08')).toBeCloseTo(73.071, 3);
  });

  it('SMILES 有 0 個或 2 個 * 時報錯，並指出端基 1 或 2；沒連到原子也報錯', () => {
    expect(analyzeEndGroup(RDKit, { smiles: 'CCO' }, 1)).toEqual({ ok: false, message: '端基 1：端基需要恰好一個連接點（*），目前有 0 個。' });
    expect(analyzeEndGroup(RDKit, { smiles: '*CC*' }, 2)).toEqual({ ok: false, message: '端基 2：端基需要恰好一個連接點（*），目前有 2 個。' });
    expect(analyzeEndGroup(RDKit, { smiles: '*.CC' }, 1).ok).toBe(false);
    expect(analyzeEndGroup(RDKit, { smiles: 'C(' }, 2)).toEqual({ ok: false, message: '端基 2：無法解析這個結構。' });
    const r = analyzePolymerUnits(RDKit, '[*:1]CC[*:2]', { endGroups: { end1: { smiles: 'CCO' } } });
    expect(r).toMatchObject({ ok: false, problem: { code: 'BAD_END_GROUP' } });
    expect(!r.ok && r.problem.message).toContain('端基 1');
  });

  it('附註：兩端都填 → 無；都不填 → 未計入端基；只填一端 → 端基 N 未填，未計入', () => {
    expect(endGroupNote([true, true])).toBe('');
    expect(endGroupNote([false, false])).toBe('未計入端基');
    expect(endGroupNote([true, false])).toBe('端基 2 未填，未計入');
    expect(endGroupNote([false, true])).toBe('端基 1 未填，未計入');
    const unit = '[*:1]CC([*:2])c1ccc(O)cc1';
    const mUnit = mUnitOf(unit);
    const one = analyzePolymerUnits(RDKit, unit, { endGroups: { end1: endOf('EG04') } });
    const both = analyzePolymerUnits(RDKit, unit, { endGroups: { end1: endOf('EG04'), end2: endOf('EG01') } });
    const none = analyzePolymerUnits(RDKit, unit);
    const note = (a: typeof one) => (a.ok ? resolvePolymer({ mwInput: 6000 }, a.mUnit, { mEnds: a.mEnds ?? 0, filled: a.endsFilled ?? [false, false] }) : null);
    expect(note(one)).toMatchObject({ ok: true, note: '端基 2 未填，未計入' });
    expect(note(both)).toMatchObject({ ok: true, note: '' });
    expect(note(none)).toMatchObject({ ok: true, note: '未計入端基' });
    expect(resolvePolymer({ mwInput: 6000 }, mUnit)).toMatchObject({ note: '未計入端基' });
  });
});

describe('含端基的換算（手算範例）', () => {
  // 重複單元 [*:1]CC([*:2])c1ccc(O)cc1（C8H8O，約 120.15，每單元 1 個酚羥基）、端基 1 正丁基（C4H9，約 57.11）、端基 2 氫（約 1.008）、Mn 3000
  //   M_ends ≈ 58.12；DP_n = (3000 − 58.12) ÷ 120.15 ≈ 24.49（未計端基時約 24.97）；每分子酚羥基 ≈ 24.49
  const UNIT = '[*:1]CC([*:2])c1ccc(O)cc1';
  const E = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';
  const spec: PolymerSpec = { mnInput: 3000, endGroups: { end1: endOf('EG04'), end2: endOf('EG01') } };

  it('M_ends、DP_n、反推 Mn；程式值與用程式自己的分子量代入式子的結果差小於 1e-9', () => {
    const mUnit = mUnitOf(UNIT);
    expect(mUnit).toBeCloseTo(120.15, 2);
    const ends = analyzeEndGroups(RDKit, spec);
    if (!ends.ok) throw new Error(ends.message);
    expect(ends.mEnds).toBeCloseTo(58.12, 2);
    const withEnds = resolvePolymer(spec, mUnit, { mEnds: ends.mEnds, filled: ends.filled });
    if (!withEnds.ok) throw new Error(withEnds.error);
    expect(Math.abs(withEnds.dp - (3000 - ends.mEnds) / mUnit)).toBeLessThan(1e-9);
    expect(withEnds.dp).toBeCloseTo(24.49, 1);
    expect(3000 / mUnit).toBeCloseTo(24.97, 2); // 未計端基
    // 改輸入 DP → 反推 Mn ≈ 3000
    const back = resolvePolymer({ dpInput: withEnds.dp, endGroups: spec.endGroups }, mUnit, { mEnds: ends.mEnds, filled: ends.filled });
    if (!back.ok) throw new Error(back.error);
    expect(Math.abs(back.mn - 3000)).toBeLessThan(1e-9);
    expect(Math.abs(back.mn - (withEnds.dp * mUnit + ends.mEnds))).toBeLessThan(1e-9);
  });

  it('第 0 層：每分子酚羥基 = DP_n（端基沒有酚羥基）；對位酚端基各加 1 個', () => {
    const find = (s: PolymerSpec) => {
      const comps: CrosslinkComponent[] = [
        { id: 'P', name: 'P', canonicalSmiles: UNIT, category: 'Resin', polymer: s },
        { id: 'E', name: 'E', canonicalSmiles: E, category: 'Resin', polymer: { mwInput: 4500 } },
      ];
      const result = analyzeCrosslink(RDKit, comps, T);
      const pair = result.pairs[0];
      return { f: pair.b!.f as number, dp: result.components[0].dp as number, result };
    };
    const a = find(spec);
    const mUnit = mUnitOf(UNIT);
    const ends = analyzeEndGroups(RDKit, spec);
    if (!ends.ok) throw new Error(ends.message);
    expect(Math.abs(a.f - (3000 - ends.mEnds) / mUnit)).toBeLessThan(1e-9);
    expect(a.f).toBeCloseTo(24.49, 1);
    // 端基 1 改為對位酚（EG11，有 1 個酚羥基）：每分子 +1
    const phenol = find({ mnInput: 3000, endGroups: { end1: endOf('EG11'), end2: endOf('EG01') } });
    const mEnds = (analyzeEndGroups(RDKit, { endGroups: { end1: endOf('EG11'), end2: endOf('EG01') } }) as { mEnds: number }).mEnds;
    expect(Math.abs(phenol.f - ((3000 - mEnds) / mUnit + 1))).toBeLessThan(1e-9);
    expect(phenol.result.markedEndAtoms.P?.[0]?.length).toBeGreaterThan(0); // 端基 1 的反應原子被標出
    expect(phenol.result.markedEndAtoms.P?.[1]).toEqual([]); // 端基 2（氫）有填但沒有反應原子
  });

  it('Mn ≤ M_ends 時報錯：Mn 必須大於端基質量合計', () => {
    const mUnit = mUnitOf(UNIT);
    const r = resolvePolymer({ mnInput: 50, endGroups: spec.endGroups }, mUnit, { mEnds: 58.124, filled: [true, true] });
    expect(r).toEqual({ ok: false, error: 'Mn 必須大於端基質量合計（M_ends = 58.124）' });
    expect(resolvePolymer({ mwInput: 100, pdiInput: 2 }, mUnit, { mEnds: 58.124, filled: [true, true] }).ok).toBe(false);
    const comps: CrosslinkComponent[] = [{ id: 'P', name: 'P', canonicalSmiles: UNIT, category: 'Resin', polymer: { mnInput: 50, endGroups: spec.endGroups } }];
    expect(analyzeCrosslink(RDKit, comps, T).components[0].problem).toContain('Mn 必須大於端基質量合計');
  });
});

// ---------- 第 1 層 ----------
const S_BISPHENOL = 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2';
const layer1Of = (p: CrosslinkComponent, s: CrosslinkComponent, amounts = [80, 20]) => {
  const f: Formulation = {
    schemaVersion: 1,
    name: 'x',
    solid: {
      unit: 'wt',
      components: [
        { id: p.id, name: p.name, canonicalSmiles: p.canonicalSmiles, category: 'Resin', amount: amounts[0], ...(p.polymer ? { polymer: p.polymer } : {}) },
        { id: s.id, name: s.name, canonicalSmiles: s.canonicalSmiles, category: 'Resin', amount: amounts[1], ...(s.polymer ? { polymer: s.polymer } : {}) },
      ],
    },
    liquid: { unit: 'wt', components: [] },
  };
  const result = analyzeCrosslink(RDKit, [p, s], T);
  const mw: Record<string, number | undefined> = {};
  for (const c of result.components) mw[c.id] = c.molarMass ?? undefined;
  const prep = prepareLayer1(result, f, computeFormulation(f, mw));
  if (!prep.ok) throw new Error(prep.reason);
  return { result, setup: prep.setup, r: computeLayer1(prep.setup, 1)! };
};

describe('端基官能基參與第 1 層', () => {
  it('重複單元不含環氧、兩端都是縮水甘油醚基：每條鏈環氧基 = 2，與 DP 無關（兩個虛擬成分都是 2）', () => {
    const pe = (mw: number): CrosslinkComponent => ({
      id: 'P',
      name: 'P',
      canonicalSmiles: '[*:1]CC[*:2]',
      category: 'Resin',
      polymer: { mwInput: mw, pdiInput: 2, endGroups: { end1: endOf('EG08'), end2: endOf('EG08') } },
    });
    const s: CrosslinkComponent = { id: 'S', name: 'S', canonicalSmiles: S_BISPHENOL, category: 'Small Molecule' };
    for (const mw of [1000, 6000]) {
      const x = layer1Of(pe(mw), s);
      expect(x.result.pairs[0].a.f).toBeCloseTo(2, 9);
      const poly = x.setup.components.find((c) => c.id === 'P')!;
      expect(poly.groupsPerMolecule).toBeCloseTo(2, 9);
      const { sys } = buildSystem(x.setup);
      expect(sys.a).toHaveLength(2);
      expect(sys.a.map((k) => k.f)).toEqual([2, 2]); // 兩個虛擬成分都是 2
    }
  });

  // 手算：M_unit 200、每單元 2 個官能基、M_ends = 200、端基共 2 個官能基；Mw 6000、PDI 1.8
  //   M₁ = 2000、M₂ = 10000 → f₁ = (1800 ÷ 200)×2 + 2 = 20、f₂ = (9800 ÷ 200)×2 + 2 = 100；f(Mw) = (5800 ÷ 200)×2 + 2 = 60
  const distribution = { mw: 6000, mn: 6000 / 1.8, mUnit: 200, groupsPerUnit: 2, mEnds: 200, endGroups: 2 };
  const handSetup = (withDist: boolean): Layer1Setup => {
    const mn = distribution.mn;
    return {
      nameA: 'A 基',
      nameB: 'B 基',
      totalMass: 100,
      components: [
        { id: 'poly', name: '聚合物', side: 'A', isPolymer: true, mass: 80, molarMass: mn, groupsPerMolecule: ((mn - 200) / 200) * 2 + 2, ...(withDist ? { distribution } : {}) },
        { id: 'xl', name: '交聯劑', side: 'B', isPolymer: false, mass: 20, molarMass: 100, groupsPerMolecule: 2 },
      ],
    };
  };

  it('兩成分近似的官能度 f(M) = ((M − M_ends) ÷ M̄_unit) × 每單元官能基數 + 端基官能基數（20、100）', () => {
    const { sys } = buildSystem(handSetup(true));
    expect(sys.a.map((k) => k.f)).toEqual([20, 100]);
    expect(sys.a[0].n).toBeCloseTo(40 / 2000, 12);
    expect(sys.a[1].n).toBeCloseTo(40 / 10000, 12);
  });

  it('凝膠點：兩成分近似 = 單一成分取重量平均官能度 f(Mw) = 60（f 是 M 的一次式，只需要 Mn 與 Mw）', () => {
    const two = buildSystem(handSetup(true)).sys;
    const moles = two.a.reduce((t, k) => t + k.n * k.f, 0);
    // 官能基總量 = (質量 ÷ Mn) × f(Mn)，與單一成分相同
    const single = buildSystem(handSetup(false)).sys;
    expect(moles).toBeCloseTo(single.a.reduce((t, k) => t + k.n * k.f, 0), 9);
    const oneA = [{ f: 60, n: moles / 60, mass: 80 }];
    const gelTwo = gelConversion(two) as number;
    const gelOne = gelConversion({ a: oneA, b: two.b }) as number;
    expect(gelTwo).toBeGreaterThan(0);
    expect(gelTwo).toBeLessThan(1);
    expect(gelTwo).toBeCloseTo(gelOne, 10);
  });

  it('兩端都不填：與沒有 endGroups 欄位的結果完全相同（toEqual）；Mw、Mn、DP 三種輸入', () => {
    const P = '[*:1]c1ccc(C2(c3ccc(C([*:2])c4ccc5ccccc5c4)c(O)c3)c3ccccc3-c3ccccc32)cc1O';
    const E = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';
    for (const base of [{ mwInput: 6000, pdiInput: 1.8 }, { mnInput: 6000 }, { dpInput: 12 }] as PolymerSpec[]) {
      const mk = (extra: Partial<PolymerSpec>) =>
        layer1Of({ id: 'P', name: 'P', canonicalSmiles: P, category: 'Resin', polymer: { ...base, ...extra } }, { id: 'E', name: 'E', canonicalSmiles: E, category: 'Resin', polymer: { mwInput: 4500 } }, [80, 20]);
      const plain = mk({});
      const emptyEnds = mk({ endGroups: {} });
      expect(emptyEnds.r).toEqual(plain.r);
      expect(emptyEnds.setup).toEqual(plain.setup);
      expect(emptyEnds.result.pairs.map((p) => [p.a.f, p.b!.f])).toEqual(plain.result.pairs.map((p) => [p.a.f, p.b!.f]));
    }
  });
});

// ---------- 存取 ----------
describe('端基的存取', () => {
  const canonicalize: Canonicalize = async (smiles) => {
    const r = validateStructure(RDKit, smiles);
    return r.valid ? r.canonicalSmiles : null;
  };
  const validateMolfile: ValidateMolfile = async (molfile) => {
    const r = validateStructure(RDKit, molfile);
    return r.valid ? { ok: true, canonicalSmiles: r.canonicalSmiles, molfile: r.molblock } : { ok: false, reason: '無效' };
  };
  const spec: PolymerSpec = { mwInput: 6000, pdiInput: 1.8, endGroups: { end1: endOf('EG04'), end2: { smiles: '[*]CC(C)O' } } };
  const T1 = new Date('2026-10-30T00:00:00.000Z');

  it('parsePolymerSpec：保留端基（含 presetId）；舊檔沒有 endGroups 讀成兩端不填；壞的端基被拒絕', () => {
    expect(parsePolymerSpec(spec)).toEqual({ ok: true, spec });
    expect(parsePolymerSpec({ mnInput: 6000 })).toEqual({ ok: true, spec: { mnInput: 6000 } });
    expect(parsePolymerSpec({ mnInput: 6000, endGroups: {} })).toEqual({ ok: true, spec: { mnInput: 6000 } });
    expect(parsePolymerSpec({ mnInput: 6000, endGroups: { end1: { smiles: '' } } }).ok).toBe(false);
    expect(parsePolymerSpec({ mnInput: 6000, endGroups: { end2: 'x' } }).ok).toBe(false);
    expect(parsePolymerSpec({ mnInput: 6000, endGroups: 5 }).ok).toBe(false);
  });

  it('配方檔存檔、讀檔；舊檔讀成兩端不填', () => {
    const f: Formulation = {
      schemaVersion: 1,
      name: 'x',
      solid: { unit: 'g', components: [{ id: 'p', name: 'P', canonicalSmiles: '[*:1]CC[*:2]', category: 'Resin', amount: 1, polymer: spec }] },
      liquid: { unit: 'g', components: [] },
    };
    const back = parseFormulation(serializeFormulation(f));
    expect(back.ok && back.formulation.solid.components[0].polymer).toEqual(spec);
    const old = JSON.parse(serializeFormulation(f));
    delete old.solid.components[0].polymer.endGroups;
    const readOld = parseFormulation(JSON.stringify(old));
    expect(readOld.ok && readOld.formulation.solid.components[0].polymer?.endGroups).toBeUndefined();
  });

  it('化合物庫 JSON 與 SDF 來回保留端基；內容比較包含端基', async () => {
    const v = validateStructure(RDKit, '[*:1]CC[*:2]');
    const added = addCompound([], { name: 'PE', canonicalSmiles: v.canonicalSmiles, molfile: v.molblock, polymer: spec }, T1, 'p');
    if (!added.ok) throw new Error(added.error);
    const lib = added.value.library;
    const json = exportLibraryJson(lib, T1);
    expect(JSON.parse(json).compounds[0].polymer.endGroups).toEqual(spec.endGroups);
    const viaJson = await importLibraryJson([], json, canonicalize);
    expect(viaJson.library).toEqual(lib);
    const sdf = exportLibrarySdf(lib.map((compound) => ({ compound, molfile: compound.molfile })));
    expect(sdf).toContain('> <MoleForm_EndGroups>\n');
    const viaSdf = await importLibrarySdf([], sdf, validateMolfile, T1);
    expect(viaSdf.library[0].polymer).toEqual(spec);
    // 不同端基視為不同內容
    const changed = { ...lib[0], polymer: { ...spec, endGroups: { end1: endOf('EG02') } } };
    const merged = await importLibraryJson([{ ...changed, updatedAt: '2026-11-01T00:00:00.000Z' }], json, canonicalize);
    expect(merged.summary.reasons).not.toContain('內容相同');
  });

  it('畫面的編輯狀態：下拉選單的選擇與自訂 SMILES 轉成端基；不填＝沒有 endGroups', () => {
    const base = { basis: 'mw' as const, text: '6000', pdiText: '' };
    expect(specFromEdit(base)).toEqual({ mwInput: 6000 });
    expect(specFromEdit({ ...base, end1: { choice: 'EG04', custom: '' }, end2: { choice: 'custom', custom: ' [*]CC(C)O ' } })).toEqual({
      mwInput: 6000,
      endGroups: { end1: endOf('EG04'), end2: { smiles: '[*]CC(C)O' } },
    });
    expect(specFromEdit({ ...base, end1: { choice: 'custom', custom: '  ' } })).toEqual({ mwInput: 6000 });
    const edit = editFromSpec(spec);
    expect(edit.end1).toEqual({ choice: 'EG04', custom: '' });
    expect(edit.end2).toEqual({ choice: 'custom', custom: '[*]CC(C)O' });
    expect(specFromEdit(edit)).toEqual(spec);
  });
});
