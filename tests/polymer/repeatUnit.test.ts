// 均聚物重複單元與 Mn／DP 換算的行為測試（任務 015）：只檢查程式是否照規則運作，不判斷化學（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import { dpFromMn, mnFromDp, parsePolymerSpec, resolvePolymer } from '../../src/core/polymer/convert';
import { analyzeRepeatUnit } from '../../src/core/polymer/repeatUnit';
import { END_GROUP_NOTE } from '../../src/core/polymer/types';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

// docs/verification/phase4-測試體系.md 的 P 與 E 重複單元
const P_UNIT = '[*:1]c1ccc(C2(c3ccc(C([*:2])c4ccc5ccccc5c4)c(O)c3)c3ccccc3-c3ccccc32)cc1O';
const E_UNIT = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';

const problemOf = (smiles: string) => {
  const r = analyzeRepeatUnit(RDKit, smiles);
  return r.ok ? null : r.problem.code;
};

describe('連接點規則', () => {
  it.each([
    ['0 個', 'CCO', 'NO_ATTACHMENT'],
    ['1 個（編號）', '[*:1]CC', 'TOO_FEW_ATTACHMENTS'],
    ['1 個（未編號）', '*CC', 'TOO_FEW_ATTACHMENTS'],
    ['3 個', '[*:1]CC([*:2])C[*:3]', 'TOO_MANY_ATTACHMENTS'],
    ['3 個未編號', '*CC(*)C*', 'TOO_MANY_ATTACHMENTS'],
    ['兩個連在同一個原子', '[*:1]C([*:2])CC', 'SAME_ATOM'],
    ['兩個未編號連在同一個原子', '*C(*)CC', 'SAME_ATOM'],
    ['連接點沒有連到原子', '*.CC.*', 'DANGLING_ATTACHMENT'],
    ['連接點直接相連', '*[*:1].CC', 'ATTACHMENT_TO_ATTACHMENT'],
    ['只編一個號', '[*:1]CC*', 'BAD_NUMBERING'],
    ['編號重複', '[*:1]CC[*:1]', 'BAD_NUMBERING'],
    ['編號不是 1、2', '[*:1]CC[*:3]', 'BAD_NUMBERING'],
    ['無法解析', 'C1CC[*:1]', 'UNPARSABLE'],
    ['空白', '   ', 'UNPARSABLE'],
  ])('%s → %s', (_name, smiles, code) => {
    expect(problemOf(smiles)).toBe(code);
  });

  it('錯誤訊息是中文並指出原因', () => {
    const r = analyzeRepeatUnit(RDKit, '[*:1]CC([*:2])C[*:3]');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem.message).toMatch(/恰好兩個連接點.*3 個/);
    const same = analyzeRepeatUnit(RDKit, '[*:1]C([*:2])CC');
    if (!same.ok) expect(same.problem.message).toContain('同一個原子');
  });

  it('[*:1]、[*:2] 合法，順序顛倒也合法並記下順序', () => {
    const a = analyzeRepeatUnit(RDKit, '[*:1]CC[*:2]');
    const b = analyzeRepeatUnit(RDKit, '[*:2]CC[*:1]');
    expect(a.ok && a.attachmentOrder).toEqual([1, 2]);
    expect(b.ok && b.attachmentOrder).toEqual([2, 1]);
  });

  it('兩個未編號的 * 依出現順序視為 1、2', () => {
    const r = analyzeRepeatUnit(RDKit, '*CC*');
    expect(r.ok && r.attachmentOrder).toEqual([1, 2]);
    expect(r.ok && r.attachmentCount).toBe(2);
  });
});

describe('M_unit 與分子式（去除 * 後，不補氫）', () => {
  it('*CC*（聚乙烯重複單元）：C2H4，約 28.05', () => {
    const r = analyzeRepeatUnit(RDKit, '*CC*');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.formula).toBe('C2H4');
      // 手算：2 × 12.011 + 4 × 1.008
      expect(r.mUnit).toBeCloseTo(2 * 12.011 + 4 * 1.008, 2);
    }
  });

  it('E 的重複單元：能算出，分子式 C7H10O3', () => {
    const r = analyzeRepeatUnit(RDKit, E_UNIT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.formula).toBe('C7H10O3');
      expect(r.mUnit).toBeGreaterThan(0);
      expect(r.mUnit).toBeCloseTo(7 * 12.011 + 10 * 1.008 + 3 * 15.999, 1);
    }
  });

  it('P 的重複單元：能算出，分子式 C36H24O2（去除 * 後）', () => {
    const r = analyzeRepeatUnit(RDKit, P_UNIT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.formula).toBe('C36H24O2');
      expect(r.mUnit).toBeCloseTo(36 * 12.011 + 24 * 1.008 + 2 * 15.999, 1);
    }
  });

  it('不論連接點寫成 [*:1]/[*:2]、未編號或順序顛倒，M_unit 相同', () => {
    const a = analyzeRepeatUnit(RDKit, E_UNIT);
    const b = analyzeRepeatUnit(RDKit, '*CC(*)(C)C(=O)OCC1CO1');
    const c = analyzeRepeatUnit(RDKit, '[*:2]CC([*:1])(C)C(=O)OCC1CO1');
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (a.ok && b.ok && c.ok) {
      expect(b.mUnit).toBeCloseTo(a.mUnit, 8);
      expect(c.mUnit).toBeCloseTo(a.mUnit, 8);
      expect(b.formula).toBe(a.formula);
    }
  });
});

describe('Mn ↔ DP 換算', () => {
  it('DP = Mn / M_unit、Mn = DP × M_unit', () => {
    expect(dpFromMn(3000, 150)).toBe(20);
    expect(mnFromDp(20, 150)).toBe(3000);
  });

  it('填 Mn → 求出 DP；填 DP → 求出 Mn；附註未計入端基', () => {
    const a = resolvePolymer({ mnInput: 6000 }, 300);
    expect(a).toMatchObject({ ok: true, basis: 'mn', mn: 6000, dp: 20, note: END_GROUP_NOTE });
    const b = resolvePolymer({ dpInput: 21 }, 142.15);
    expect(b.ok && b.basis).toBe('dp');
    expect(b.ok && b.mn).toBeCloseTo(21 * 142.15, 8);
    expect(END_GROUP_NOTE).toBe('未計入端基');
  });

  it('E：DP = 21 與 Mn ≈ 3000 大致一致（只是程式輸出核對，不判斷化學）', () => {
    const unit = analyzeRepeatUnit(RDKit, E_UNIT);
    if (!unit.ok) throw new Error('E 的重複單元應可計算');
    const fromMn = resolvePolymer({ mnInput: 3000 }, unit.mUnit);
    expect(fromMn.ok && fromMn.dp).toBeCloseTo(3000 / unit.mUnit, 8);
  });

  it('輸入錯誤：兩個都填、都不填、非正數、NaN', () => {
    expect(resolvePolymer({ mnInput: 100, dpInput: 2 }, 50).ok).toBe(false);
    expect(resolvePolymer({}, 50).ok).toBe(false);
    expect(resolvePolymer({ mnInput: 0 }, 50).ok).toBe(false);
    expect(resolvePolymer({ dpInput: -3 }, 50).ok).toBe(false);
    expect(resolvePolymer({ mnInput: Number.NaN }, 50).ok).toBe(false);
    expect(resolvePolymer({ mnInput: Infinity }, 50).ok).toBe(false);
    expect(resolvePolymer({ mnInput: 100 }, 0).ok).toBe(false);
  });

  it('parsePolymerSpec：擇一、正數', () => {
    expect(parsePolymerSpec({ mnInput: 6000 })).toEqual({ ok: true, spec: { mnInput: 6000 } });
    expect(parsePolymerSpec({ dpInput: 21 })).toEqual({ ok: true, spec: { dpInput: 21 } });
    expect(parsePolymerSpec({ mnInput: 1, dpInput: 2 }).ok).toBe(false);
    expect(parsePolymerSpec({}).ok).toBe(false);
    expect(parsePolymerSpec({ mnInput: -1 }).ok).toBe(false);
    expect(parsePolymerSpec('x').ok).toBe(false);
  });
});
