// 成分 Tg 與混合配方未固化 Tg（任務 034）的測試：公式對手算值、邊界、資料表格式與缺欄位報錯、
// 缺成分 Tg 回報、Catalyst／揮發成分排除、小分子不計 Tg（D56）、K 與檢驗誤差由資料點重新算出。
// 文獻資料點與頁碼見 docs/reports/034-結果.md。測試不使用任何使用者實測值（D02）。
import { beforeAll, describe, expect, it } from 'vitest';
import {
  TG_CHECK_LIMIT_K,
  TG_K_COLUMNS,
  TG_POINTS_COLUMNS,
  bundledTgKText,
  bundledTgPointsText,
  readTgK,
  readTgPoints,
  validateTgTables,
} from '../../src/core/data/tgMnData';
import { formatIssue } from '../../src/core/data/types';
import type { Component, Formulation, SolidCategory } from '../../src/core/formulation/types';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { computeJoback } from '../../src/core/properties/jobackTbTf';
import { computeTg } from '../../src/core/properties/tgGroupContribution';
import {
  FLAG_CALIBRATED,
  FLAG_EXTRAPOLATED,
  FLAG_LOW,
  SMALL_MOLECULE_TG_NA,
  SMALL_MOLECULE_WARNING,
  computeFormulationTg,
  findKClass,
  foxFlory,
  foxMix,
  smallMoleculeComponentTg,
} from '../../src/core/properties/tgMixing';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const NOVOLAC = '[*:1]Cc1cc([*:2])ccc1O';
const DGEBA = '[*:1]Oc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC(O)C[*:2]';
const SBI = 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2';
const BADGE = 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1';
const MEK = 'CCC(C)=O';

const points = readTgPoints(bundledTgPointsText);
const kTable = readTgK(bundledTgKText);
const novolacK = kTable.rows.find((r) => r.resinClass === 'novolac_phenol_general')!;

const solid = (id: string, amount: number, smiles: string, extra: Partial<Component<SolidCategory>> = {}): Component<SolidCategory> => ({
  id,
  name: `成分${id}`,
  canonicalSmiles: smiles,
  category: 'Small Molecule',
  amount,
  ...extra,
});
const polymerC = (id: string, amount: number, unit: string, mn: number): Component<SolidCategory> =>
  solid(id, amount, unit, { category: 'Resin', polymer: { mnInput: mn } });
const formulation = (components: Component<SolidCategory>[], unit: 'wt' | 'g' = 'wt'): Formulation => ({
  schemaVersion: 1,
  name: '測試',
  solid: { unit, components },
  liquid: { unit: 'g', components: [] },
});

describe('公式（對手算值）', () => {
  it('Fox–Flory：Tg = Tg∞ − K/Mn', () => {
    // 手算：400 − 50000/1000 = 350
    expect(foxFlory(400, 50000, 1000)).toBeCloseTo(350, 10);
    // 手算：415.93 − 76819/864 = 415.93 − 88.9109 = 327.019
    expect(foxFlory(415.93, 76819, 864)).toBeCloseTo(327.019, 3);
  });
  it('Fox–Flory 邊界：Mn → ∞ 時等於 Tg∞；Mn 不是正數就報錯', () => {
    expect(foxFlory(400, 50000, 1e15)).toBeCloseTo(400, 8);
    expect(() => foxFlory(400, 50000, 0)).toThrow();
    expect(() => foxFlory(400, 50000, -5)).toThrow();
  });
  it('Fox 混合：1/Tg = Σ wi/Tgi', () => {
    // 手算：1/(0.5/300 + 0.5/400) = 1/(0.0016667 + 0.00125) = 342.857
    expect(foxMix([{ w: 0.5, tgK: 300 }, { w: 0.5, tgK: 400 }])).toBeCloseTo(342.857, 3);
    // 手算：1/(0.2/250 + 0.8/350) = 1/(0.0008 + 0.0022857) = 324.074
    expect(foxMix([{ w: 0.2, tgK: 250 }, { w: 0.8, tgK: 350 }])).toBeCloseTo(324.074, 3);
  });
  it('Fox 混合邊界：單一成分＝成分 Tg；質量分率會正規化；成分 Tg 相同時混合值不變', () => {
    expect(foxMix([{ w: 1, tgK: 333 }])).toBeCloseTo(333, 10);
    expect(foxMix([{ w: 0.37, tgK: 333 }])).toBeCloseTo(333, 10);
    expect(foxMix([{ w: 2, tgK: 300 }, { w: 2, tgK: 400 }])).toBeCloseTo(342.857, 3);
    expect(foxMix([{ w: 0.3, tgK: 350 }, { w: 0.7, tgK: 350 }])).toBeCloseTo(350, 10);
  });
  it('Fox 混合：沒有成分或數值無效就報錯', () => {
    expect(() => foxMix([])).toThrow();
    expect(() => foxMix([{ w: 0, tgK: 300 }])).toThrow();
    expect(() => foxMix([{ w: 1, tgK: 0 }])).toThrow();
  });
});

describe('資料表（tg_mn_points.csv、tg_flory_k.csv）', () => {
  it('內建資料沒有任何格式問題', () => {
    expect([...points.issues, ...kTable.issues, ...validateTgTables(points, kTable)].map(formatIssue)).toEqual([]);
  });
  it('每個資料點都有來源等級、量測方法、頁碼；二手換算點有換算標記', () => {
    for (const p of points.rows) {
      expect(p.grade).toMatch(/^(一手|二手)/);
      expect(p.method).not.toBe('');
      expect(p.source).toMatch(/頁|PDF/);
      if (p.grade.startsWith('二手') && /換算/.test(p.method)) expect(p.conversion).toContain('換算值，低可信度');
    }
  });
  it('PAPS 型被排除；DGEBA 類標缺 K 且 K 留空；酚醛一般型收錄並標低可信度、待使用者審', () => {
    expect(points.rows.filter((p) => p.resinClass === 'novolac_phenol_PAPS').every((p) => p.role === '排除')).toBe(true);
    const dgeba = kTable.rows.find((r) => r.resinClass === 'dgeba')!;
    expect(dgeba.state).toBe('缺 K');
    expect(dgeba.k).toBeNull();
    expect(novolacK.state).toBe('收錄');
    expect(novolacK.confidence).toBe('低可信度');
    expect(novolacK.audit).toBe('待使用者審');
    expect(novolacK.checkMaxErrorK as number).toBeLessThanOrEqual(TG_CHECK_LIMIT_K);
  });
  it('酚醛 K：由兩個擬合點重新算出，與表中一致；Tg∞ 與 BT01 的基團貢獻值一致', () => {
    const tg = computeTg(RDKit, NOVOLAC);
    if (tg.status !== 'ok') throw new Error('BT01 應可計算');
    expect(Math.abs(tg.tgK - (novolacK.tgInfFixedK as number))).toBeLessThan(0.01);
    const ks = novolacK.fitPoints.map((id) => {
      const p = points.rows.find((x) => x.id === id)!;
      return ((novolacK.tgInfFixedK as number) - p.tgK) * p.mn;
    });
    const mean = ks.reduce((a, b) => a + b, 0) / ks.length;
    expect(Math.abs(mean - (novolacK.k as number))).toBeLessThan(1);
    expect(Math.abs((Math.max(...ks) - Math.min(...ks)) / 2 - (novolacK.kUncertainty as number))).toBeLessThan(1);
  });
  it('酚醛 K 的獨立檢驗誤差由檢驗點重新算出（最大誤差與表中一致，且 ≤ 20 K）', () => {
    const errs = novolacK.checkPoints.map((id) => {
      const p = points.rows.find((x) => x.id === id)!;
      return Math.abs(foxFlory(novolacK.tgInfFixedK as number, novolacK.k as number, p.mn) - p.tgK);
    });
    expect(Math.abs(Math.max(...errs) - (novolacK.checkMaxErrorK as number))).toBeLessThan(0.1);
    expect(Math.max(...errs)).toBeLessThanOrEqual(TG_CHECK_LIMIT_K);
  });
  it('Bicerano 式 6.11（只當交叉比對，不當輸入）：K 的數量級相同（只看數量級）', () => {
    const bicerano = 0.002715 * (novolacK.tgInfFixedK as number) ** 3; // 與圖 6.4 軸一致的 0.002715
    const ratio = bicerano / (novolacK.k as number);
    expect(ratio).toBeGreaterThan(0.2);
    expect(ratio).toBeLessThan(5);
  });
  it('擬合不得用檢驗點、不得跨類別', () => {
    const swapped = bundledTgKText.replace('NV.B1|NV.B2', 'NV.B1|NV.P864');
    const t = readTgK(swapped);
    const msgs = validateTgTables(points, t).map(formatIssue).join('\n');
    expect(msgs).toContain('不是擬合點');
  });
});

const HP = TG_POINTS_COLUMNS.join(',');
const HK = TG_K_COLUMNS.join(',');
const csvLine = (cells: string[]) => cells.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',');
const goodPoint = ['X1', 'cls', '材料', '1000', 'Mn', '350', '', '擬合', 'DSC', '一手', '', '某論文，頁 3', '', 'GPC-PS', '未載'];
const goodPoint2 = ['X2', 'cls', '材料', '2000', 'Mn', '370', '', '擬合', 'DSC', '一手', '', '某論文，頁 3', '', 'GPC-PS', '未載'];
const goodCheck = ['X3', 'cls', '材料', '1500', 'Mn', '362', '', '檢驗', 'DSC', '一手', '', '某論文，頁 4', '', 'GPC-PS', '未載'];
const goodK = ['cls', '類別', '[*:1]CC[*:2]', '收錄', '400', '', '50000', '1000', '1000', '2000', '低可信度', 'X1|X2', 'X3', '5', '擬合', '某論文，表 1', '待使用者審', '備註', '基團貢獻固定', '', '同類獨立點'];
const issuesOf = (pointLines: string[][], kLines: string[][]) => {
  const p = readTgPoints([HP, ...pointLines.map(csvLine)].join('\n'));
  const k = readTgK([HK, ...kLines.map(csvLine)].join('\n'));
  return [...p.issues, ...k.issues, ...validateTgTables(p, k)].map(formatIssue).join('\n');
};

describe('資料表格式檢查（缺欄位報錯，D22）', () => {
  it('完整的範例沒有問題', () => {
    expect(issuesOf([goodPoint, goodPoint2, goodCheck], [goodK])).toBe('');
  });
  it('資料點缺來源等級、量測方法、頁碼、Mn 都報錯', () => {
    const noGrade = [...goodPoint];
    noGrade[9] = '';
    expect(issuesOf([noGrade, goodPoint2, goodCheck], [goodK])).toContain('來源等級');
    const noMethod = [...goodPoint];
    noMethod[8] = '';
    expect(issuesOf([noMethod, goodPoint2, goodCheck], [goodK])).toContain('量測方法');
    const noPage = [...goodPoint];
    noPage[11] = '某論文';
    expect(issuesOf([noPage, goodPoint2, goodCheck], [goodK])).toContain('頁碼');
    const noMn = [...goodPoint];
    noMn[3] = '';
    expect(issuesOf([noMn, goodPoint2, goodCheck], [goodK])).toContain('Mn 必須');
  });
  it('二手換算點缺換算標記報錯', () => {
    const conv = [...goodPoint];
    conv[8] = '軟化點換算';
    conv[9] = '二手（書）';
    expect(issuesOf([conv, goodPoint2, goodCheck], [goodK])).toContain('換算標記');
  });
  it('收錄的 K 缺檢驗點、缺擬合點、缺 Tg∞、缺範圍、缺誤差都報錯', () => {
    const noCheck = [...goodK];
    noCheck[12] = '';
    expect(issuesOf([goodPoint, goodPoint2, goodCheck], [noCheck])).toContain('檢驗點');
    const oneFit = [...goodK];
    oneFit[11] = 'X1';
    expect(issuesOf([goodPoint, goodPoint2, goodCheck], [oneFit])).toContain('至少要有 2 個擬合點');
    const noTgInf = [...goodK];
    noTgInf[4] = '';
    expect(issuesOf([goodPoint, goodPoint2, goodCheck], [noTgInf])).toContain('Tg∞');
    const noRange = [...goodK];
    noRange[8] = '';
    expect(issuesOf([goodPoint, goodPoint2, goodCheck], [noRange])).toContain('Mn 範圍');
    const noErr = [...goodK];
    noErr[13] = '';
    expect(issuesOf([goodPoint, goodPoint2, goodCheck], [noErr])).toContain('檢驗最大誤差');
  });
  it('檢驗誤差超過 20 K 不得收錄', () => {
    const bad = [...goodK];
    bad[13] = '20.5';
    expect(issuesOf([goodPoint, goodPoint2, goodCheck], [bad])).toContain('不得收錄');
  });
  it('缺 K 的類別 K 必須留空；擬合點跨類別報錯', () => {
    const missingWithK = [...goodK];
    missingWithK[3] = '缺 K';
    expect(issuesOf([goodPoint, goodPoint2, goodCheck], [missingWithK])).toContain('必須留空');
    const other = [...goodPoint];
    other[1] = 'other';
    expect(issuesOf([other, goodPoint2, goodCheck], [goodK])).toContain('不得跨類別');
  });
  it('標題列不符與欄位數不符報錯', () => {
    expect(readTgPoints('a,b\n1,2').issues.length).toBeGreaterThan(0);
    expect(readTgK(`${HK}\n1,2`).issues.some((i) => i.message.includes('欄位數'))).toBe(true);
  });
});

describe('類別比對', () => {
  it('重複單元與類別代表單元逐字相同才算同類（連接點編號不影響）；其他結構不屬於任何類別', () => {
    expect(findKClass(RDKit, NOVOLAC)?.resinClass).toBe('novolac_phenol_general');
    expect(findKClass(RDKit, '[*:2]Cc1cc([*:1])ccc1O')?.resinClass).toBe('novolac_phenol_general');
    expect(findKClass(RDKit, DGEBA)?.resinClass).toBe('dgeba');
    expect(findKClass(RDKit, '[*:1]CC([*:2])(C)C(=O)OCC1CO1')).toBeNull();
  });
});

describe('配方未固化 Tg（Fox 式）', () => {
  it('小分子成分：Tg 回報「不適用」（D56），只給 Joback Tm，不參與混合', () => {
    const tm = computeJoback(RDKit, SBI);
    if (tm.status !== 'ok' || tm.tfK === null) throw new Error('SBI 應有 Tf');
    const c = smallMoleculeComponentTg(RDKit, solid('s', 100, SBI) as Component, 1);
    expect(c.status).toBe('not-applicable');
    expect(c.tgK).toBeNull();
    expect(c.missingReason).toBe(SMALL_MOLECULE_TG_NA);
    expect(c.tmK).toBeCloseTo(tm.tfK, 8);
  });
  it('只有小分子的配方：沒有混合值，全部列為未計入', () => {
    const r = computeFormulationTg(RDKit, formulation([solid('a', 30, SBI), solid('b', 70, MEK)]));
    expect(r.status).toBe('unavailable');
    expect(r.tgK).toBeNull();
    expect(r.notCounted).toEqual(['成分a', '成分b']);
    expect(r.notes.join('')).toContain('非實測值');
  });
  it('小分子（含 SBI）不參與 Fox 混合：結果等於只混聚合物；備註列出「未計入」與增塑效應警告', () => {
    const only = computeFormulationTg(RDKit, formulation([polymerC('n', 100, NOVOLAC, 1000)]));
    const r = computeFormulationTg(RDKit, formulation([polymerC('n', 60, NOVOLAC, 1000), solid('s', 40, SBI)]));
    expect(r.status).toBe('complete');
    expect(r.tgK).toBeCloseTo(only.tgK as number, 8);
    expect(r.notCounted).toEqual(['成分s']);
    const text = r.messages.join('\n');
    expect(text).toContain('未計入：成分s');
    expect(text).toContain(SMALL_MOLECULE_WARNING);
    expect(r.components.find((c) => c.id === 's')?.tgK).toBeNull();
  });
  it('酚醛一般型：Fox–Flory 用表中的 K；範圍內標低可信度、含校準基團；超出範圍標「外推，未驗證」', () => {
    const tg = computeTg(RDKit, NOVOLAC);
    if (tg.status !== 'ok') throw new Error('BT01 應可計算');
    const inRange = computeFormulationTg(RDKit, formulation([polymerC('n', 100, NOVOLAC, 1000)]));
    expect(inRange.status).toBe('complete');
    const c = inRange.components[0];
    expect(c.tgK).toBeCloseTo(tg.tgK - (novolacK.k as number) / 1000, 8);
    expect(c.flags).toContain(FLAG_LOW);
    expect(c.flags).toContain(FLAG_CALIBRATED);
    expect(c.flags).not.toContain(FLAG_EXTRAPOLATED);
    const out = computeFormulationTg(RDKit, formulation([polymerC('n', 100, NOVOLAC, 3000)]));
    expect(out.components[0].flags).toContain(FLAG_EXTRAPOLATED);
    const low = computeFormulationTg(RDKit, formulation([polymerC('n', 100, NOVOLAC, 500)]));
    expect(low.components[0].flags).toContain(FLAG_EXTRAPOLATED);
  });
  it('Mn → ∞ 時聚合物成分 Tg 等於 Tg∞', () => {
    const tg = computeTg(RDKit, NOVOLAC);
    if (tg.status !== 'ok') throw new Error('BT01 應可計算');
    const r = computeFormulationTg(RDKit, formulation([polymerC('n', 100, NOVOLAC, 1e12)]));
    expect(r.components[0].tgK).toBeCloseTo(tg.tgK, 6);
  });
  it('DGEBA 類標缺 K：回報缺成分 Tg，並附 Tg∞（來源 a），不猜 K', () => {
    const r = computeFormulationTg(RDKit, formulation([polymerC('d', 60, DGEBA, 3000), solid('s', 40, SBI)]));
    expect(r.status).toBe('incomplete');
    expect(r.missing).toEqual(['成分d']);
    const d = r.components.find((c) => c.id === 'd')!;
    expect(d.status).toBe('missing');
    expect(d.missingReason).toContain('缺 K');
    expect(d.tgInfGroupK).toBeCloseTo(398.874, 2);
    expect(d.tgK).toBeNull();
    expect(r.messages.join('\n')).toContain('缺成分 Tg：成分d');
    expect(r.tgK).toBeNull();
  });
  it('缺成分 Tg 時另外輸出部分混合值（只混有 Tg 的聚合物成分），並標示非完整配方；小分子列為未計入', () => {
    const tgN = computeTg(RDKit, NOVOLAC);
    if (tgN.status !== 'ok') throw new Error('BT01 應可計算');
    const r = computeFormulationTg(RDKit, formulation([polymerC('d', 50, DGEBA, 3000), polymerC('n', 40, NOVOLAC, 1000), solid('s', 10, SBI)]));
    expect(r.partial).not.toBeNull();
    expect(r.partial?.included).toEqual(['成分n']);
    expect(r.partial?.removed).toEqual(['成分d']);
    expect(r.partial?.tgK).toBeCloseTo(tgN.tgK - (novolacK.k as number) / 1000, 8);
    expect(r.notCounted).toEqual(['成分s']);
    expect(r.messages.join('\n')).toContain('非完整配方');
  });
  it('缺基團的聚合物成分（PGMA 型）與共聚物成分回報缺成分 Tg；全部缺時沒有部分混合值', () => {
    const pgma = polymerC('e', 50, '[*:1]CC([*:2])(C)C(=O)OCC1CO1', 2250);
    const cop = solid('p', 50, NOVOLAC, {
      category: 'Resin',
      polymer: { mnInput: 3000, units: [{ smiles: NOVOLAC, fraction: 50 }, { smiles: '[*:1]C([*:2])c1ccc2ccccc2c1', fraction: 50 }] },
    });
    const r = computeFormulationTg(RDKit, formulation([pgma, cop]));
    expect(r.status).toBe('incomplete');
    expect(r.missing).toEqual(['成分e', '成分p']);
    expect(r.components.find((c) => c.id === 'p')?.missingReason).toContain('共聚物');
    expect(r.partial).toBeNull();
    expect(r.messages.join('\n')).toContain('所有參與混合的成分都缺 Tg');
  });
  it('Catalyst/Initiator 與揮發成分不混，列在備註；排除後的結果等於只混其餘成分', () => {
    const base = computeFormulationTg(RDKit, formulation([polymerC('a', 50, NOVOLAC, 1000)], 'g'));
    const r = computeFormulationTg(
      RDKit,
      formulation([
        polymerC('a', 50, NOVOLAC, 1000),
        solid('c', 10, MEK, { category: 'Catalyst/Initiator' }),
        solid('v', 40, BADGE, { volatileFlag: true }),
      ], 'g'),
    );
    expect(r.status).toBe('complete');
    expect(r.excluded.map((e) => [e.id, e.kind])).toEqual([['c', 'catalyst'], ['v', 'volatile']]);
    expect(r.components.map((c) => c.id)).toEqual(['a']);
    expect(r.tgK).toBeCloseTo(base.tgK as number, 8);
    expect(r.messages.join('\n')).toContain('催化劑／起始劑成分未混入');
    expect(r.messages.join('\n')).toContain('揮發或分解成分未混入');
  });
  it('Solid 全部被排除時回報不可用；Liquid 區成分不混', () => {
    const f = formulation([solid('c', 10, MEK, { category: 'Catalyst/Initiator' })], 'g');
    f.liquid = { unit: 'g', components: [{ id: 'L', name: '溶劑', canonicalSmiles: 'COCC(C)OC(C)=O', category: 'Solvent', amount: 90 }] };
    const r = computeFormulationTg(RDKit, f);
    expect(r.status).toBe('unavailable');
    expect(r.components).toEqual([]);
  });
  it('Solid 區輸入有誤時回報 error，不給數字', () => {
    const r = computeFormulationTg(RDKit, formulation([solid('a', Number.NaN, SBI)]));
    expect(r.status).toBe('error');
    expect(r.tgK).toBeNull();
  });
  it('聚合物成分分子量依 D50 含端基：Mn 直接取自 resolvePolymer（輸入 Mn 即為 Mn）', () => {
    const r = computeFormulationTg(RDKit, formulation([polymerC('n', 100, NOVOLAC, 900)]));
    expect(r.components[0].mn).toBeCloseTo(900, 8);
  });
});
