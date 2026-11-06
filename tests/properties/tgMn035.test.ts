// 任務 035 的測試：回歸公式對手算、甲酚酚醛類別 SMARTS 正反例（D22）、Mn 範圍外標示、資料表格式檢查、
// 資料表的 K 與檢驗誤差由資料點重新算出、PGMA／ECN 不擬合、不跨類別。
// 資料出處見 docs/reports/035-結果.md；測試不使用任何使用者實測值（D02）。
import { beforeAll, describe, expect, it } from 'vitest';
import { bundledTgKText, bundledTgPointsText, readTgK, readTgPoints, validateTgTables, TG_CHECK_LIMIT_K } from '../../src/core/data/tgMnData';
import { parseCsv } from '../../src/core/data/csv';
import { formatIssue } from '../../src/core/data/types';
import type { Component, Formulation, SolidCategory } from '../../src/core/formulation/types';
import { identifyCresolNovolac, NOVOLAC_ORTHO_CRESOL, NOVOLAC_PARA_CRESOL } from '../../src/core/properties/novolacUnits';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { fitFlory, predictFlory } from '../../src/core/properties/tgFit';
import { FLAG_EXTRAPOLATED, FLAG_LOW, computeFormulationTg, findKClass, foxFlory, polymerComponentTg } from '../../src/core/properties/tgMixing';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const ORTHO = '[*:1]Cc1cc([*:2])cc(C)c1O';
const ORTHO_ALT = '[*:1]c1cc(C[*:2])cc(C)c1O'; // 另一種切法
const PARA = '[*:1]Cc1cc(C)cc([*:2])c1O';
const PHENOL = '[*:1]Cc1cc([*:2])ccc1O';
const DGEBA = '[*:1]Oc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC(O)C[*:2]';
const PGMA = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';

const points = readTgPoints(bundledTgPointsText);
const kTable = readTgK(bundledTgKText);
const kOf = (c: string) => kTable.rows.find((r) => r.resinClass === c)!;
const pt = (id: string) => points.rows.find((p) => p.id === id)!;
const fitOf = (c: string) => fitFlory(kOf(c).fitPoints.map((id) => ({ mn: pt(id).mn, tgK: pt(id).tgK })));

const polymerC = (id: string, unit: string, mn: number): Component<SolidCategory> => ({ id, name: `成分${id}`, canonicalSmiles: unit, category: 'Resin', amount: 100, polymer: { mnInput: mn } });
const formulation = (components: Component<SolidCategory>[]): Formulation => ({ schemaVersion: 1, name: '測試', solid: { unit: 'wt', components }, liquid: { unit: 'g', components: [] } });

describe('回歸公式（對手算）', () => {
  it('三點手算：x = 1/Mn = 1、2、3，y = 2、3、5 → Tg∞ = 1/3、K = −1.5、R² = 0.96429、K 標準誤差 = 0.28868', () => {
    const f = fitFlory([{ mn: 1, tgK: 2 }, { mn: 1 / 2, tgK: 3 }, { mn: 1 / 3, tgK: 5 }]);
    expect(f.tgInfK).toBeCloseTo(1 / 3, 10);
    expect(f.k).toBeCloseTo(-1.5, 10);
    expect(f.residuals[0]).toBeCloseTo(1 / 6, 10);
    expect(f.residuals[1]).toBeCloseTo(-1 / 3, 10);
    expect(f.residuals[2]).toBeCloseTo(1 / 6, 10);
    expect(f.r2).toBeCloseTo(1 - 1 / 6 / (14 / 3), 10);
    expect(f.seK).toBeCloseTo(Math.sqrt(1 / 12), 10);
  });
  it('資料恰好落在直線上：回傳原本的 Tg∞ 與 K，殘差為 0', () => {
    const f = fitFlory([100, 200, 400, 800].map((mn) => ({ mn, tgK: 400 - 10000 / mn })));
    expect(f.tgInfK).toBeCloseTo(400, 8);
    expect(f.k).toBeCloseTo(10000, 6);
    expect(f.r2).toBeCloseTo(1, 10);
    expect(Math.max(...f.residuals.map(Math.abs))).toBeLessThan(1e-8);
    expect(predictFlory(f, 1000)).toBeCloseTo(foxFlory(400, 10000, 1000), 8);
  });
  it('邊界：少於 2 點、Mn 或 Tg 非正數、Mn 全相同都報錯', () => {
    expect(() => fitFlory([{ mn: 100, tgK: 300 }])).toThrow();
    expect(() => fitFlory([{ mn: 0, tgK: 300 }, { mn: 100, tgK: 300 }])).toThrow();
    expect(() => fitFlory([{ mn: 100, tgK: -1 }, { mn: 200, tgK: 300 }])).toThrow();
    expect(() => fitFlory([{ mn: 100, tgK: 300 }, { mn: 100, tgK: 310 }])).toThrow();
  });
});

describe('甲酚酚醛類別辨識（SMARTS，D22）', () => {
  it('應命中：鄰甲酚酚醛單元（兩種切法與端點順序）、對甲酚酚醛單元', () => {
    expect(identifyCresolNovolac(RDKit, ORTHO)).toBe(NOVOLAC_ORTHO_CRESOL);
    expect(identifyCresolNovolac(RDKit, '[*:2]Cc1cc([*:1])cc(C)c1O')).toBe(NOVOLAC_ORTHO_CRESOL);
    expect(identifyCresolNovolac(RDKit, ORTHO_ALT)).toBe(NOVOLAC_ORTHO_CRESOL);
    expect(identifyCresolNovolac(RDKit, PARA)).toBe(NOVOLAC_PARA_CRESOL);
    expect(identifyCresolNovolac(RDKit, '[*:2]Cc1cc(C)cc([*:1])c1O')).toBe(NOVOLAC_PARA_CRESOL);
  });
  it('不應命中（反例）：苯酚酚醛、間甲酚、二甲酚、茀酚醛、萘酚酚醛、DGEBA、PGMA、小分子、無效 SMILES', () => {
    const negatives: Record<string, string> = {
      苯酚酚醛: PHENOL,
      間甲酚型: '[*:1]Cc1cc([*:2])c(C)cc1O',
      '2,6-二甲酚（甲基在兩個鄰位）': '[*:1]Cc1cc(C)c(O)c(C)c1',
      '雙酚茀（單元 A）': '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O',
      萘酚酚醛: '[*:1]Cc1cc2ccccc2c([*:2])c1O',
      DGEBA: DGEBA,
      PGMA: PGMA,
      鄰甲酚小分子: 'Cc1ccccc1O',
      '鄰甲酚（兩端都是 CH2，多一個原子）': '[*:1]Cc1cc(C[*:2])cc(C)c1O',
      '鄰甲酚（多一個取代基）': '[*:1]Cc1c(Cl)c([*:2])cc(C)c1O',
      對甲酚單元的酚羥基被甲基化: '[*:1]Cc1cc(C)cc([*:2])c1OC',
      無效: 'not a smiles',
    };
    for (const [name, smiles] of Object.entries(negatives)) {
      expect(identifyCresolNovolac(RDKit, smiles), name).toBeNull();
    }
  });
  it('findKClass：鄰、對各自對應自己的類別；苯酚酚醛仍是 034 的類別；DGEBA 不受影響；其他單元沒有類別', () => {
    expect(findKClass(RDKit, ORTHO)?.resinClass).toBe(NOVOLAC_ORTHO_CRESOL);
    expect(findKClass(RDKit, PARA)?.resinClass).toBe(NOVOLAC_PARA_CRESOL);
    expect(findKClass(RDKit, PHENOL)?.resinClass).toBe('novolac_phenol_general');
    expect(findKClass(RDKit, DGEBA)?.resinClass).toBe('dgeba');
    expect(findKClass(RDKit, PGMA)).toBeNull();
    expect(findKClass(RDKit, '[*:1]Cc1cc2ccccc2c([*:2])c1O')).toBeNull();
    expect(findKClass(RDKit, '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O')).toBeNull();
  });
});

describe('甲酚酚醛 K（資料表與重新擬合）', () => {
  it('鄰位、對位的 Tg∞、K、標準誤差由資料點重新算出，與表中一致（四捨五入內）', () => {
    for (const c of [NOVOLAC_ORTHO_CRESOL, NOVOLAC_PARA_CRESOL]) {
      const f = fitOf(c);
      const row = kOf(c);
      expect(row.fitPoints).toHaveLength(4);
      expect(row.tgInfSource).toBe('擬合');
      expect(Math.abs(f.tgInfK - (row.tgInfFixedK as number))).toBeLessThan(0.005);
      expect(Math.abs(f.seTgInf - (row.tgInfUncertaintyK as number))).toBeLessThan(0.005);
      expect(Math.abs(f.k - (row.k as number))).toBeLessThan(0.5);
      expect(Math.abs(f.seK - (row.kUncertainty as number))).toBeLessThan(0.5);
    }
    expect(fitOf(NOVOLAC_ORTHO_CRESOL).r2).toBeGreaterThan(0.99);
    expect(fitOf(NOVOLAC_PARA_CRESOL).r2).toBeGreaterThan(0.97);
  });
  it('異構物互檢：用鄰位預測對位四點、用對位預測鄰位四點，最大誤差由資料點算出且 ≤ 20 K，與表中一致', () => {
    const pairs: [string, string][] = [[NOVOLAC_ORTHO_CRESOL, NOVOLAC_PARA_CRESOL], [NOVOLAC_PARA_CRESOL, NOVOLAC_ORTHO_CRESOL]];
    for (const [mine, other] of pairs) {
      const f = fitOf(mine);
      const row = kOf(mine);
      expect(row.checkMode).toBe('異構物互檢');
      expect(row.checkPoints).toEqual(kOf(other).fitPoints);
      const errs = row.checkPoints.map((id) => Math.abs(predictFlory(f, pt(id).mn) - pt(id).tgK));
      const max = Math.max(...errs);
      expect(max).toBeLessThanOrEqual(TG_CHECK_LIMIT_K);
      expect(Math.abs(max - (row.checkMaxErrorK as number))).toBeLessThan(0.05);
    }
  });
  it('所有擬合點與互檢點的 Mn 方法都是 NMR（不混用）；資料表有 Mn 方法與端基欄位且 Lin-Gibson 端基為 2,6-二甲基酚封端', () => {
    for (const c of [NOVOLAC_ORTHO_CRESOL, NOVOLAC_PARA_CRESOL]) {
      for (const id of [...kOf(c).fitPoints, ...kOf(c).checkPoints]) {
        expect(pt(id).mnMethod).toBe('NMR');
        expect(pt(id).endGroup).toContain('2,6-二甲基酚');
        expect(pt(id).grade).toMatch(/^二手/);
      }
    }
  });
  it('資料表整體通過格式檢查', () => {
    const issues = [...points.issues, ...kTable.issues, ...validateTgTables(points, kTable)];
    expect(issues.map(formatIssue)).toEqual([]);
  });
  it('034 的苯酚酚醛 K 與範圍沒有被更動', () => {
    const r = kOf('novolac_phenol_general');
    expect([r.tgInfFixedK, r.k, r.kUncertainty, r.mnMin, r.mnMax, r.checkMaxErrorK]).toEqual([415.93, 76820, 5193, 780, 1535, 11.2]);
    expect(r.tgInfSource).toBe('基團貢獻固定');
    expect(kOf('dgeba').state).toBe('缺 K');
    expect(kOf('dgeba').k).toBeNull();
  });
});

describe('成分 Tg 與 Mn 範圍', () => {
  it('鄰位 Mn 930：Tg = 擬合 Tg∞ − K/Mn（用表中的擬合值，不用基團貢獻）；範圍內不標外推；標低可信度', () => {
    const row = kOf(NOVOLAC_ORTHO_CRESOL);
    const c = polymerComponentTg(RDKit, polymerC('o', ORTHO, 930), 930, 1);
    expect(c.status).toBe('ok');
    expect(c.resinClass).toBe(NOVOLAC_ORTHO_CRESOL);
    expect(c.tgK).toBeCloseTo((row.tgInfFixedK as number) - (row.k as number) / 930, 8);
    expect(c.tgK).toBeCloseTo(350.99, 1); // 手算 393.91 − 39915/930 = 350.99
    expect(c.flags).toContain(FLAG_LOW);
    expect(c.flags).not.toContain(FLAG_EXTRAPOLATED);
  });
  it('對位 Mn 1460 手算：400.48 − 44214/1460 = 370.20', () => {
    const c = polymerComponentTg(RDKit, polymerC('p', PARA, 1460), 1460, 1);
    expect(c.tgK).toBeCloseTo(370.2, 1);
  });
  it('Mn 範圍外標「外推，未驗證」：鄰位 < 490 或 > 2250、對位 < 510 或 > 2150', () => {
    const flagOf = (unit: string, mn: number) => polymerComponentTg(RDKit, polymerC('x', unit, mn), mn, 1).flags.includes(FLAG_EXTRAPOLATED);
    expect(flagOf(ORTHO, 489)).toBe(true);
    expect(flagOf(ORTHO, 490)).toBe(false);
    expect(flagOf(ORTHO, 2250)).toBe(false);
    expect(flagOf(ORTHO, 2251)).toBe(true);
    expect(flagOf(PARA, 509)).toBe(true);
    expect(flagOf(PARA, 510)).toBe(false);
    expect(flagOf(PARA, 2150)).toBe(false);
    expect(flagOf(PARA, 2151)).toBe(true);
  });
  it('不跨類別：鄰、對各用自己的 Tg∞ 與 K，同一個 Mn 的結果不同；苯酚酚醛仍用 034 的 K', () => {
    const o = polymerComponentTg(RDKit, polymerC('o', ORTHO, 1000), 1000, 1);
    const p = polymerComponentTg(RDKit, polymerC('p', PARA, 1000), 1000, 1);
    const n = polymerComponentTg(RDKit, polymerC('n', PHENOL, 1000), 1000, 1);
    expect(o.kUsed).toBe(kOf(NOVOLAC_ORTHO_CRESOL).k);
    expect(p.kUsed).toBe(kOf(NOVOLAC_PARA_CRESOL).k);
    expect(n.kUsed).toBe(76820);
    expect(o.tgK).not.toBeCloseTo(p.tgK as number, 1);
  });
  it('配方層：鄰甲酚酚醛（Mn 1380）完整混合；未辨識為此類的單元（萘酚酚醛）缺 K，不得借用甲酚酚醛的 K', () => {
    const ok = computeFormulationTg(RDKit, formulation([polymerC('o', ORTHO, 1380)]));
    expect(ok.status).toBe('complete');
    expect(ok.tgK).toBeCloseTo(foxFlory(kOf(NOVOLAC_ORTHO_CRESOL).tgInfFixedK as number, kOf(NOVOLAC_ORTHO_CRESOL).k as number, 1380), 8);
    const naph = computeFormulationTg(RDKit, formulation([polymerC('n', '[*:1]Cc1cc2ccccc2c([*:2])c1O', 1380)]));
    expect(naph.status).not.toBe('complete');
    expect(naph.components[0].kUsed).toBeNull();
  });
});

describe('ECN、BPA 環氧鏈、PGMA：只登錄，不擬合 K', () => {
  it('ECN、PGMA 的點角色都是參考，沒有 K 表列；PGMA 兩點 Mn 高者 Tg 低（與 Fox–Flory 方向相反）', () => {
    expect(points.rows.filter((p) => p.resinClass === 'ecn' || p.resinClass === 'pgma_gma_polymer').every((p) => p.role === '參考')).toBe(true);
    expect(kTable.rows.some((r) => r.resinClass === 'ecn' || r.resinClass === 'pgma_gma_polymer')).toBe(false);
    expect(pt('GM.E1').mn).toBeGreaterThan(pt('GM.E2').mn);
    expect(pt('GM.E1').tgK).toBeLessThan(pt('GM.E2').tgK);
    expect(findKClass(RDKit, PGMA)).toBeNull();
  });
  it('資料點的 Tg 由原表 °C 加 273.15 轉成 K', () => {
    const cases: [string, number][] = [['LG.O490', 40], ['LG.O2250', 104], ['LG.P510', 43], ['LG.P2150', 110], ['EP.ECN853', 45.5], ['EP.BPA720', 38], ['GM.E1', 31], ['GM.E2', 42]];
    for (const [id, c] of cases) expect(pt(id).tgK).toBeCloseTo(c + 273.15, 6);
  });
  it('BPA 環氧鏈（dgeba）維持缺 K，EP3874001A1 的點是參考；GPC-PS 與 GPC-THF 的 Mn 方法標註不同', () => {
    expect(kOf('dgeba').state).toBe('缺 K');
    expect(pt('EP.BPA720').role).toBe('參考');
    expect(pt('EP.BPA720').mnMethod).toBe('GPC-PS');
    expect(pt('DG.PX15K').mnMethod).toBe('GPC-THF');
  });
});

const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** 改一格：第一欄等於 key 的那一列的指定欄位換成 value（用 CSV 解析，不用字串切割） */
function editCsv(text: string, key: string, column: string, value: string): string {
  const recs = parseCsv(text);
  const col = recs[0].indexOf(column);
  const row = recs.find((r, i) => i > 0 && r[0] === key);
  if (col < 0 || !row) throw new Error(`找不到 ${key} 或 ${column}`);
  row[col] = value;
  return recs.map((r) => r.map(quote).join(',')).join('\n') + '\n';
}

describe('資料表格式檢查（035 新增欄位）', () => {
  const check = (pointsText: string, kText: string) => {
    const p = readTgPoints(pointsText);
    const k = readTgK(kText);
    return [...p.issues, ...k.issues, ...validateTgTables(p, k)].map(formatIssue);
  };
  it('資料點缺 Mn 方法或端基 → 報錯', () => {
    const noMethod = editCsv(bundledTgPointsText, 'LG.O490', 'Mn方法', '');
    expect(check(noMethod, bundledTgKText).join(' | ')).toContain('Mn方法');
    const noEnd = editCsv(bundledTgPointsText, 'LG.O490', '端基', '');
    expect(check(noEnd, bundledTgKText).join(' | ')).toContain('端基');
  });
  it('同一類別擬合點的 Mn 方法不一致 → 報錯（不同方法不得混擬合）', () => {
    const mutated = bundledTgPointsText.replace(/^(LG\.O490,.*),NMR,/m, '$1,GPC-PS,');
    expect(mutated).not.toBe(bundledTgPointsText);
    expect(check(mutated, bundledTgKText).join('\n')).toContain('Mn 方法不一致');
  });
  it('互檢點的 Mn 方法與擬合點不同 → 報錯', () => {
    const mutated = bundledTgPointsText.replace(/^(LG\.P510,.*),NMR,/m, '$1,GPC-PS,');
    const issues = check(mutated, bundledTgKText).join('\n');
    expect(issues).toContain('Mn 方法');
  });
  it('收錄的 K 缺 Tg∞ 來源、檢驗方式，或擬合 Tg∞ 缺不確定度 → 報錯', () => {
    const o = 'novolac_cresol_ortho';
    expect(check(bundledTgPointsText, editCsv(bundledTgKText, o, '檢驗方式', '')).join(' | ')).toContain('檢驗方式');
    expect(check(bundledTgPointsText, editCsv(bundledTgKText, o, 'Tg∞來源', '')).join(' | ')).toContain('Tg∞來源');
    expect(check(bundledTgPointsText, editCsv(bundledTgKText, o, 'Tg∞不確定度_K', '')).join(' | ')).toContain('Tg∞不確定度_K');
  });
  it('互檢誤差超過 20 K 不得收錄；互檢點不得是同一類別', () => {
    const o = 'novolac_cresol_ortho';
    expect(check(bundledTgPointsText, editCsv(bundledTgKText, o, '檢驗最大誤差_K', '25')).join(' | ')).toContain('超過 20 K');
    expect(check(bundledTgPointsText, editCsv(bundledTgKText, o, '檢驗點', 'LG.O490|LG.O930|LG.O1380|LG.O2250')).join(' | ')).toContain('與本類別相同');
  });
});
