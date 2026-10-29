// Mw＋PDI 輸入的測試（任務 019，D47）：Mw／Mn／DP 與 PDI 的換算、預設 PDI = 2、PDI < 1 錯誤、舊資料讀入。
// 只檢查程式是否照規則運作，不判斷化學（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import { parseFormulation } from '../../src/core/formulation/serialize';
import { exportLibrarySdf, importLibraryJson, importLibrarySdf, type Canonicalize, type ValidateMolfile } from '../../src/core/library/exchange';
import { addCompound, editPolymer } from '../../src/core/library/library';
import { MESSAGE_PDI_LEGACY, MESSAGE_PDI_RANGE, parsePolymerSpec, resolvePolymer } from '../../src/core/polymer/convert';
import { twoComponentMasses } from '../../src/core/polymer/distribution';
import { DEFAULT_PDI } from '../../src/core/polymer/types';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { validateStructure } from '../../src/core/structure/validate';
import { editFromSpec, polymerLabel, specFromEdit } from '../../src/ui/polymer/model';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const E_UNIT = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';
const T1 = new Date('2026-10-01T00:00:00.000Z');
const canonicalize: Canonicalize = async (smiles) => {
  const r = validateStructure(RDKit, smiles);
  return r.valid ? r.canonicalSmiles : null;
};
const validateMolfile: ValidateMolfile = async (molfile) => {
  const r = validateStructure(RDKit, molfile);
  if (r.valid) return { ok: true, canonicalSmiles: r.canonicalSmiles, molfile: r.molblock };
  return { ok: false, reason: '無效' };
};

describe('Mw／Mn／DP＋PDI 換算（M_unit = 200 的手算範例）', () => {
  it('填 Mw 6000、PDI 1.8：Mn = 6000 ÷ 1.8 = 3333.33、DP_n = 16.67、DP_w = 30', () => {
    const r = resolvePolymer({ mwInput: 6000, pdiInput: 1.8 }, 200);
    expect(r).toMatchObject({ ok: true, basis: 'mw', mw: 6000, pdi: 1.8, pdiIsDefault: false, legacy: false });
    if (!r.ok) return;
    expect(r.mn).toBeCloseTo(3333.3333, 3);
    expect(r.dp).toBeCloseTo(16.6667, 3);
    expect(r.dpW).toBeCloseTo(30, 9);
  });

  it('填 Mn 與 PDI：Mw = Mn × PDI', () => {
    const r = resolvePolymer({ mnInput: 3000, pdiInput: 2.5 }, 200);
    expect(r).toMatchObject({ ok: true, basis: 'mn', mn: 3000, mw: 7500, dp: 15, dpW: 37.5, pdi: 2.5 });
  });

  it('填 DP（數量平均）與 PDI：Mn = DP × M_unit，Mw = Mn × PDI', () => {
    const r = resolvePolymer({ dpInput: 20, pdiInput: 1.5 }, 200);
    expect(r).toMatchObject({ ok: true, basis: 'dp', mn: 4000, mw: 6000, dp: 20, dpW: 30, pdi: 1.5 });
  });

  it('沒有 PDI：預設 2（Mw 4500 → Mn 2250），並標示使用預設值', () => {
    expect(DEFAULT_PDI).toBe(2);
    const r = resolvePolymer({ mwInput: 4500 }, 150);
    expect(r).toMatchObject({ ok: true, mw: 4500, mn: 2250, pdi: 2, pdiIsDefault: true, legacy: false });
  });

  it('PDI = 1 時 Mn = Mw', () => {
    const r = resolvePolymer({ mwInput: 5000, pdiInput: 1 }, 100);
    expect(r).toMatchObject({ ok: true, mn: 5000, mw: 5000, pdi: 1 });
  });

  it('PDI < 1、非數字、無限大都是錯誤', () => {
    for (const bad of [0.99, 0, -1, Infinity]) {
      expect(resolvePolymer({ mwInput: 6000, pdiInput: bad }, 200)).toEqual({ ok: false, error: MESSAGE_PDI_RANGE });
    }
    expect(parsePolymerSpec({ mwInput: 6000, pdiInput: 0.5 }).ok).toBe(false);
    expect(parsePolymerSpec({ mwInput: 6000, pdiInput: 'x' }).ok).toBe(false);
  });

  it('Mw、Mn、DP 只能填一個；都沒填是錯誤', () => {
    expect(resolvePolymer({ mwInput: 6000, mnInput: 3000 }, 200).ok).toBe(false);
    expect(resolvePolymer({ mnInput: 3000, dpInput: 15 }, 200).ok).toBe(false);
    expect(resolvePolymer({ pdiInput: 2 }, 200).ok).toBe(false);
    expect(resolvePolymer({ mwInput: -5 }, 200).ok).toBe(false);
    expect(parsePolymerSpec({ mwInput: 6000, dpInput: 5 }).ok).toBe(false);
    expect(parsePolymerSpec({ pdiInput: 2 }).ok).toBe(false);
  });

  it('parsePolymerSpec：保留 mwInput、pdiInput；null 視為沒填', () => {
    expect(parsePolymerSpec({ mwInput: 6000, pdiInput: 1.8 })).toEqual({ ok: true, spec: { mwInput: 6000, pdiInput: 1.8 } });
    expect(parsePolymerSpec({ mwInput: 4500, pdiInput: null })).toEqual({ ok: true, spec: { mwInput: 4500 } });
  });
});

describe('兩成分近似的 M₁、M₂（D47）', () => {
  it('Mw 6000、PDI 1.8（Mn = 3333.33）→ M₁ = 2000、M₂ = 10000', () => {
    const r = twoComponentMasses(6000, 6000 / 1.8);
    expect(r.m1).toBeCloseTo(2000, 6);
    expect(r.m2).toBeCloseTo(10000, 6);
    expect(r.single).toBe(false);
  });

  it('M₁ + M₂ = 2·Mw、M₁·M₂ = Mn·Mw；等重量混合後 Mn、Mw 與輸入相同', () => {
    const mw = 4500;
    const mn = 2250;
    const { m1, m2 } = twoComponentMasses(mw, mn);
    expect(m1 + m2).toBeCloseTo(2 * mw, 9);
    expect(m1 * m2).toBeCloseTo(mn * mw, 6);
    expect((0.5 * m1 + 0.5 * m2)).toBeCloseTo(mw, 9); // 重量平均
    expect(1 / (0.5 / m1 + 0.5 / m2)).toBeCloseTo(mn, 6); // 數量平均 = 1／Σ(w_i／M_i)
  });

  it('PDI = 1 時兩者相等，退化為單一成分', () => {
    const r = twoComponentMasses(5000, 5000);
    expect(r).toEqual({ m1: 5000, m2: 5000, single: true });
  });
});

describe('舊資料相容（任務 015–018 存下的檔案只有 Mn 或 DP）', () => {
  it('只有 Mn 或 DP 的設定可讀入，視為 PDI 未填（預設 2），並標示舊資料', () => {
    for (const old of [{ mnInput: 6000 }, { dpInput: 21 }]) {
      const parsed = parsePolymerSpec(old);
      expect(parsed).toEqual({ ok: true, spec: old });
      const r = resolvePolymer(parsed.ok ? parsed.spec : {}, 142.15);
      expect(r).toMatchObject({ ok: true, pdi: 2, pdiIsDefault: true, legacy: true });
    }
    expect(MESSAGE_PDI_LEGACY).toBe('PDI 未填，使用預設值 2');
    expect(polymerLabel({ mnInput: 6000 })).toContain('PDI 未填，使用預設值 2');
    expect(polymerLabel({ dpInput: 21 })).toContain('PDI 未填，使用預設值 2');
    expect(polymerLabel({ mwInput: 4500 })).toContain('使用預設 PDI = 2');
    expect(polymerLabel({ mwInput: 6000, pdiInput: 1.8 })).toBe('Mw 6,000 g/mol，PDI 1.8');
  });

  it('舊版化合物庫檔（polymer 只有 mnInput／dpInput，schemaVersion 不變）可讀入', async () => {
    const stamp = T1.toISOString();
    const text = JSON.stringify({
      schemaVersion: 1,
      compounds: [
        { id: 'o1', name: '舊酚醛', canonicalSmiles: '*CC*', molfile: '', notes: '', createdAt: stamp, updatedAt: stamp, polymer: { mnInput: 6000 } },
        { id: 'o2', name: '舊 PGMA', canonicalSmiles: E_UNIT, molfile: '', notes: '', createdAt: stamp, updatedAt: stamp, polymer: { dpInput: 21 } },
      ],
    });
    const outcome = await importLibraryJson([], text, canonicalize);
    expect(outcome.ok).toBe(true);
    expect(outcome.summary.skipped).toBe(0);
    expect(outcome.library.map((c) => c.polymer)).toEqual([{ mnInput: 6000 }, { dpInput: 21 }]);
    // 載入畫面時：分子量欄位帶入原本的 Mn／DP，PDI 欄留空（使用預設值）
    expect(editFromSpec(outcome.library[0].polymer)).toEqual({ basis: 'mn', text: '6000', pdiText: '' });
    expect(editFromSpec(outcome.library[1].polymer)).toEqual({ basis: 'dp', text: '21', pdiText: '' });
  });

  it('舊版配方檔（成分的 polymer 只有 mnInput／dpInput、沒有 polymerMolBasis）可讀入', () => {
    const old = JSON.stringify({
      schemaVersion: 1,
      name: '舊配方',
      solid: {
        unit: 'wt',
        components: [
          { id: 'p', name: 'P', canonicalSmiles: '*CC*', category: 'Resin', amount: 80, polymer: { mnInput: 6000 } },
          { id: 'e', name: 'E', canonicalSmiles: E_UNIT, category: 'Resin', amount: 20, polymer: { dpInput: 21 } },
        ],
      },
      liquid: { unit: 'g', components: [] },
    });
    const back = parseFormulation(old);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.formulation.solid.components.map((c) => c.polymer)).toEqual([{ mnInput: 6000 }, { dpInput: 21 }]);
    expect(back.formulation.polymerMolBasis).toBeUndefined();
  });
});

describe('新欄位的存取', () => {
  it('化合物庫：存 Mw＋PDI；editPolymer 可改；PDI < 1 被拒絕', () => {
    const v = validateStructure(RDKit, E_UNIT);
    const added = addCompound([], { name: 'E', canonicalSmiles: v.canonicalSmiles, molfile: v.molblock, polymer: { mwInput: 4500 } }, T1, 'e');
    if (!added.ok) throw new Error(added.error);
    expect(added.value.compound.polymer).toEqual({ mwInput: 4500 });
    const edited = editPolymer(added.value.library, 'e', { mwInput: 6000, pdiInput: 1.8 });
    expect(edited.ok && edited.value[0].polymer).toEqual({ mwInput: 6000, pdiInput: 1.8 });
    expect(editPolymer(added.value.library, 'e', { mwInput: 6000, pdiInput: 0.9 }).ok).toBe(false);
  });

  it('SDF 匯出入保留 Mw 與 PDI；舊的 MoleForm_Mn／MoleForm_DP 欄位仍可讀', async () => {
    const v = validateStructure(RDKit, E_UNIT);
    const added = addCompound([], { name: 'E', canonicalSmiles: v.canonicalSmiles, molfile: v.molblock, polymer: { mwInput: 6000, pdiInput: 1.8 } }, T1, 'e');
    if (!added.ok) throw new Error(added.error);
    const sdf = exportLibrarySdf(added.value.library.map((compound) => ({ compound, molfile: compound.molfile })));
    expect(sdf).toContain('> <MoleForm_Mw>\n6000\n');
    expect(sdf).toContain('> <MoleForm_PDI>\n1.8\n');
    const back = await importLibrarySdf([], sdf, validateMolfile, T1);
    expect(back.library[0].polymer).toEqual({ mwInput: 6000, pdiInput: 1.8 });
    const legacy = sdf.replace('> <MoleForm_Mw>\n6000\n', '> <MoleForm_Mn>\n3000\n').replace('> <MoleForm_PDI>\n1.8\n', '');
    const oldBack = await importLibrarySdf([], legacy, validateMolfile, T1);
    expect(oldBack.library[0].polymer).toEqual({ mnInput: 3000 });
  });

  it('畫面輸入：Mw 為預設輸入方式；PDI 空白不寫入；PDI 非數字視為輸入無效', () => {
    expect(specFromEdit({ basis: 'mw', text: '6000', pdiText: '1.8' })).toEqual({ mwInput: 6000, pdiInput: 1.8 });
    expect(specFromEdit({ basis: 'mw', text: '4500', pdiText: '  ' })).toEqual({ mwInput: 4500 });
    expect(specFromEdit({ basis: 'dp', text: '21', pdiText: '' })).toEqual({ dpInput: 21 });
    expect(specFromEdit({ basis: 'mw', text: '4500', pdiText: 'x' })).toBeNull();
    // PDI < 1 照樣帶入，由計算端指出錯誤
    expect(specFromEdit({ basis: 'mw', text: '4500', pdiText: '0.5' })).toEqual({ mwInput: 4500, pdiInput: 0.5 });
  });
});
