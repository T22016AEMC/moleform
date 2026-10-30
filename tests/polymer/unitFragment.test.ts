// 重複單元的 3D 片段測試（任務 024，D05）：封端（`*` 直接改成碳）、原子順序與編號、反應原子編號、能否產生 3D。
// 只檢查程式照規則運作，不判斷化學正確性（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import { Molecule, Resources } from 'openchemlib';
import { reactiveAtomsOf } from '../../src/core/crosslink/draw';
import { ConformerSession } from '../../src/core/conformer/session';
import { BACKBONE_TEMPLATES } from '../../src/core/data/backboneTemplates';
import { bundledTexts, loadTables } from '../../src/core/data/load';
import { analyzeRepeatUnit } from '../../src/core/polymer/repeatUnit';
import { capRepeatUnit, type UnitFragment } from '../../src/core/polymer/unitFragment';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { validateStructure } from '../../src/core/structure/validate';

let RDKit: RDKitModule;
const { tables } = loadTables(bundledTexts);
const groups = tables.functionalGroups.rows;
const rules = tables.reactionRules.rows;
beforeAll(async () => {
  Resources.registerFromNodejs();
  RDKit = await getRDKit();
});

const UNIT_A = '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O'; // 雙酚茀
const UNIT_B = '[*:1]C([*:2])c1ccc2ccccc2c1'; // 萘基次甲基
const UNIT_E = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';
const BT01_UNIT = BACKBONE_TEMPLATES.find((t) => t.id === 'BT01')!.unitSmiles;

const cap = (smiles: string): UnitFragment => {
  const r = capRepeatUnit(RDKit, smiles);
  if (!r.ok) throw new Error(r.message);
  return r.fragment;
};
const canonical = (smiles: string) => {
  const v = validateStructure(RDKit, smiles);
  expect(v.valid).toBe(true);
  return v.canonicalSmiles;
};
/** V2000 Molfile 的原子元素（依序） */
const symbolsOf = (molblock: string) => {
  const lines = molblock.split('\n');
  const n = parseInt(lines[3].slice(0, 3), 10);
  return Array.from({ length: n }, (_, i) => lines[4 + i].slice(31, 34).trim());
};
/** 原結構的原子元素（依序，連接點為 `*`） */
const originalSymbols = (smiles: string) => symbolsOf(validateStructure(RDKit, smiles).molblock);

describe('封端：連接點直接改成碳，再補氫', () => {
  it.each([
    ['BT01 單元', BT01_UNIT, 'CCc1cc(C)ccc1O', 'C9H12O'], // 2-乙基-4-甲基苯酚
    ['P 的單元 B', UNIT_B, 'CC(C)c1ccc2ccccc2c1', 'C13H14'], // 2-異丙基萘
    ['E 的單元', UNIT_E, 'CCC(C)(C)C(=O)OCC1CO1', 'C9H16O3'], // 2,2-二甲基丁酸縮水甘油酯
  ])('%s：正規化 SMILES 與分子式', (_name, unit, expected, formula) => {
    const f = cap(unit);
    expect(f.canonicalSmiles).toBe(canonical(expected));
    expect(f.formula).toBe(formula);
  });

  it('P 的單元 A：兩個 * 都變成甲基，分子式比單元（去除 *）多 C₂H₆', () => {
    const f = cap(UNIT_A);
    const unit = analyzeRepeatUnit(RDKit, UNIT_A);
    expect(unit.ok).toBe(true);
    const base = (unit as { formula: string }).formula; // 不含連接點
    expect(base).toBe('C25H16O2');
    expect(f.formula).toBe('C27H22O2'); // 多 C₂H₆（兩個甲基）
    expect(f.cappedAtoms).toHaveLength(2);
  });

  it('D48 的單元（兩個連接點在同一個碳）：同一個碳上兩個甲基', () => {
    const f = cap('[*:1]C([*:2])(C)c1ccccc1'); // 同一碳上的兩個連接點
    expect(f.canonicalSmiles).toBe(canonical('CC(C)(C)c1ccccc1'));
    expect(f.formula).toBe('C10H14');
    expect(f.cappedAtoms).toHaveLength(2);
  });

  it('沒編號的 * 與 [*] 也可以；沒有連接點則回報', () => {
    expect(cap('*CC*').formula).toBe('C4H10');
    expect(cap('[*]CC[*]').canonicalSmiles).toBe(canonical('CCCC'));
    const r = capRepeatUnit(RDKit, 'CCO');
    expect(r.ok).toBe(false);
  });
});

describe('原子順序與編號不變', () => {
  const UNITS: [string, string][] = [['A', UNIT_A], ['B', UNIT_B], ['E', UNIT_E], ...BACKBONE_TEMPLATES.map((t) => [t.id, t.unitSmiles] as [string, string])];

  it.each(UNITS)('%s：非 * 原子的編號與元素完全相同，原本 * 的位置標為封端甲基碳', (_id, unit) => {
    const before = originalSymbols(unit);
    const f = cap(unit);
    const after = symbolsOf(f.molblock);
    expect(after).toHaveLength(before.length); // 原子數不變（氫是隱含的）
    before.forEach((s, i) => {
      if (s === '*') {
        expect(after[i]).toBe('C');
        expect(f.cappedAtoms).toContain(i);
      } else {
        expect(after[i]).toBe(s);
      }
    });
    expect(f.cappedAtoms).toEqual(before.map((s, i) => (s === '*' ? i : -1)).filter((i) => i >= 0));
  });

  it('P 的單元 A 片段：反應原子（酚羥基）的編號與 2D 單元圖相同，且在 3D 檔案中仍是氧', () => {
    const reactive2d = reactiveAtomsOf(RDKit, UNIT_A, groups, rules, true); // 2D 單元圖標記用（排除連接點）
    expect(reactive2d.length).toBe(2); // 兩個酚羥基
    const f = cap(UNIT_A);
    const session = new ConformerSession(f.molblock);
    const batch = session.generate(1);
    const m = Molecule.fromMolfile(batch.conformers[0].molfile);
    for (const i of reactive2d) expect(m.getAtomicNo(i)).toBe(8); // 3D 的同一編號是氧
    for (const i of f.cappedAtoms) {
      expect(m.getAtomicNo(i)).toBe(6);
      // 封端甲基碳連 3 個氫
      let h = 0;
      for (let k = 0; k < m.getAllConnAtoms(i); k++) if (m.getAtomicNo(m.getConnAtom(i, k)) === 1) h++;
      expect(h).toBe(3);
    }
  });
});

describe('單元片段能產生 3D（OpenChemLib）', () => {
  it('P 單元 A、B、E 與 6 個骨架範本單元：構象、最佳化與耗時', () => {
    const rows: string[] = [];
    const UNITS: [string, string][] = [['P 單元 A', UNIT_A], ['P 單元 B', UNIT_B], ['E 單元', UNIT_E], ...BACKBONE_TEMPLATES.map((t) => [t.id, t.unitSmiles] as [string, string])];
    for (const [name, unit] of UNITS) {
      const f = cap(unit);
      const t0 = performance.now();
      const batch = new ConformerSession(f.molblock).generate(5);
      const ms = performance.now() - t0;
      expect(batch.conformers.length).toBeGreaterThan(0);
      rows.push(`${name}\t${f.formula}\t構象 ${batch.conformers.length}\t${batch.optimized ? '已最佳化' : '未經力場最佳化'}\t${ms.toFixed(0)} ms`);
      expect(batch.optimized).toBe(true);
    }
    console.log(rows.join('\n'));
  });
});
