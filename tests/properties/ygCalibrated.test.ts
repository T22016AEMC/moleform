// 校準基團（任務 033，D54）的測試：資料表格式、正反例、切分完整性、錨點自洽、檢驗誤差 ≤ 20 K、書中基團優先。
// 錨點與檢驗的文獻值全部由論文頁面圖像讀取（頁碼見 docs/reports/033-結果.md）。
import { beforeAll, describe, expect, it } from 'vitest';
import {
  YG_CALIBRATED_COLUMNS,
  bundledYgCalibratedText,
  checkYgCalibratedSmarts,
  readYgCalibrated,
  validateYgCalibrated,
} from '../../src/core/data/ygCalibratedGroups';
import { formatIssue } from '../../src/core/data/types';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { computeTg, type TgResult } from '../../src/core/properties/tgGroupContribution';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});
const K = 273.15;
const table = readYgCalibrated(bundledYgCalibratedText);
const ok = (r: TgResult) => {
  if (r.status !== 'ok') throw new Error(`預期可計算，實際 ${r.status}：${JSON.stringify(r)}`);
  return r;
};

const HEADER = YG_CALIBRATED_COLUMNS.join(',');
const line = (cells: Partial<Record<(typeof YG_CALIBRATED_COLUMNS)[number], string>>): string =>
  YG_CALIBRATED_COLUMNS.map((c) => {
    const v = cells[c] ?? '';
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');
const GOOD = {
  id: 'X.OH',
  基團名稱: '酚羥基',
  類型: 'H 換成 X 增量',
  SMARTS: '[OX2H1;$(O-c)]',
  Ygi: '16.43',
  Mi: '16.0',
  錨點: 'Kratochvíl 2009, 式 (1)，期刊頁 1852',
  推導: 'ΔYg = 16.43',
  檢驗: '差 +6.7 K',
  稽核狀態: '校準值（非書中值），待使用者審',
  '正例 SMILES': 'Oc1ccccc1',
  '反例 SMILES': 'CCO',
};
const issuesOf = (text: string): string[] => {
  const t = readYgCalibrated(text);
  return [...t.issues, ...validateYgCalibrated(t), ...checkYgCalibratedSmarts(RDKit, t)].map(formatIssue);
};

describe('yg_calibrated_groups.csv（內建資料）', () => {
  it('格式檢查與 RDKit 檢查沒有任何問題', () => {
    const all = [...table.issues, ...validateYgCalibrated(table), ...checkYgCalibratedSmarts(RDKit, table)];
    expect(all.map(formatIssue)).toEqual([]);
    expect(table.rows.map((r) => r.id)).toEqual(['CAL.OH.ar', 'CAL.fluorene.diaryl']);
  });
  it('每列都標「校準值（非書中值）」並有錨點、推導、檢驗', () => {
    for (const r of table.rows) {
      expect(r.audit).toContain('校準值（非書中值）');
      expect(r.anchor).not.toBe('');
      expect(r.derivation).not.toBe('');
      expect(r.check).toMatch(/差/);
    }
  });
  it('格式檢查：缺錨點、缺檢驗、稽核狀態沒標校準值都要報錯', () => {
    expect(issuesOf(`${HEADER}\n${line(GOOD)}\n`)).toEqual([]);
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, 錨點: '' })}\n`).join('；')).toContain('缺錨點');
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, 檢驗: '' })}\n`).join('；')).toContain('缺檢驗');
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, 稽核狀態: '待使用者審' })}\n`).join('；')).toContain('校準值（非書中值）');
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, '正例 SMILES': 'CCO' })}\n`).join('；')).toContain('沒有命中');
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, '反例 SMILES': 'Oc1ccccc1' })}\n`).join('；')).toContain('不應命中');
    expect(issuesOf(`${HEADER}\n${line({ ...GOOD, Mi: '17.0' })}\n`).join('；')).toContain('不符');
  });
});

describe('酚羥基（H 換成 –OH）', () => {
  const PS = '[*:1]CC([*:2])c1ccccc1';
  const PVPH = '[*:1]CC([*:2])c1ccc(O)cc1';
  it('錨點自洽：PVPh 單元算回 Tg∞ = 186.7 °C（Kratochvíl 2009 式 1 截距，期刊頁 1852）', () => {
    const r = ok(computeTg(RDKit, PVPH));
    expect(r.containsCalibrated).toBe(true);
    expect(Math.abs(r.tgC - 186.7)).toBeLessThan(0.1);
    expect(r.sumYg).toBeCloseTo(38.8 + 16.43, 9);
    expect(r.sumM).toBeCloseTo(120.1, 9);
    expect(r.groups.filter((g) => g.calibrated).map((g) => g.rowId)).toEqual(['CAL.OH.ar']);
  });
  it('檢驗：Shin & Ryu 2025 PHSt（Mn 7,000，180 °C，期刊頁 4863／4865）差 ≤ 20 K（弱檢驗）', () => {
    const r = ok(computeTg(RDKit, PVPH));
    expect(Math.abs(r.tgC - 180)).toBeLessThanOrEqual(20);
  });
  it('書中基團優先：聚苯乙烯不經校準，結果與關閉校準相同', () => {
    const a = ok(computeTg(RDKit, PS));
    const b = ok(computeTg(RDKit, PS, { calibrated: false }));
    expect(a.containsCalibrated).toBe(false);
    expect(a.tgK).toBe(b.tgK);
  });
  it('關閉校準時回報缺基團；兩個酚羥基各加一次增量', () => {
    expect(computeTg(RDKit, PVPH, { calibrated: false }).status).toBe('missing');
    const r = ok(computeTg(RDKit, '[*:1]CC([*:2])c1ccc(O)c(O)c1'));
    expect(r.sumYg).toBeCloseTo(38.8 + 2 * 16.43, 9);
    expect(r.sumM).toBeCloseTo(104.1 + 32, 9);
  });
  it('酚羥基以外的缺基團仍回報缺基團（不用校準基團硬湊）', () => {
    const r = computeTg(RDKit, '[*:1]CC([*:2])(C)C(=O)OCC1CO1');
    expect(r.status).toBe('missing');
  });
});

describe('9,9-雙(4-伸苯基)茀骨架', () => {
  const FLU = 316.4;
  // 切分完整性：骨架 25 個碳全配走，每個重原子恰好一個基團
  const HAYASHI_3D = '[*:1]Oc1ccc(cc1)C2(c3ccccc3-c3ccccc32)c1ccc(cc1)OCCCCCC[*:2]';
  const LU_PC1 = '[*:1]OC(=O)OCCOc1ccc(cc1)C2(c3ccccc3-c3ccccc32)c1ccc(cc1)OCC[*:2]';
  it('錨點自洽：Hayashi 2009 F-PE 3d 算回 147 °C（Mn 60,000、Mw 160,000，期刊頁 610–611）', () => {
    const r = ok(computeTg(RDKit, HAYASHI_3D));
    expect(r.containsCalibrated).toBe(true);
    expect(Math.abs(r.tgC - 147)).toBeLessThan(0.1);
    expect(r.sumM).toBeCloseTo(FLU + 32 + 84, 6);
    const atoms = r.groups.flatMap((g) => g.atoms);
    expect(new Set(atoms).size).toBe(atoms.length);
    expect(r.groups.find((g) => g.rowId === 'CAL.fluorene.diaryl')?.atoms).toHaveLength(25);
  });
  it('檢驗 1：Lu 2024 BPEF 聚碳酸酯 PC-1（155 °C，Mn 19.1 k，期刊頁 17773）差 ≤ 20 K', () => {
    const r = ok(computeTg(RDKit, LU_PC1));
    expect(Math.abs(r.tgC - 155)).toBeLessThanOrEqual(20);
    expect(r.sumM).toBeCloseTo(464.4, 6);
  });
  it('檢驗 2：Sakurai & Fuji 2000 TF95（k = 0.93，150 °C，Mw 29,500，期刊頁 678）差 ≤ 20 K', () => {
    const bpef = ok(computeTg(RDKit, '[*:1]OC(=O)c1ccc(cc1)C(=O)OCCOc1ccc(cc1)C2(c3ccccc3-c3ccccc32)c1ccc(cc1)OCC[*:2]'));
    const eg = ok(computeTg(RDKit, '[*:1]OC(=O)c1ccc(cc1)C(=O)OCC[*:2]'));
    const k = 0.93;
    const tg = (1000 * (k * bpef.sumYg + (1 - k) * eg.sumYg)) / (k * bpef.sumM + (1 - k) * eg.sumM);
    expect(Math.abs(tg - K - 150)).toBeLessThanOrEqual(20);
    expect(Math.abs(eg.tgK - K - 78)).toBeLessThanOrEqual(20);
  });
  it('BT06（雙酚茀環氧）可算並標示含校準基團；沒有茀的雙酚 A 型不經校準', () => {
    const bt06 = ok(computeTg(RDKit, '[*:1]Oc1ccc(cc1)C1(c2ccccc2-c2ccccc21)c1ccc(cc1)OCC(O)C[*:2]'));
    expect(bt06.containsCalibrated).toBe(true);
    const bt05 = ok(computeTg(RDKit, '[*:1]Oc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC(O)C[*:2]'));
    expect(bt05.containsCalibrated).toBe(false);
    expect(bt05.tgK).toBeCloseTo(398.9, 1);
  });
  it('反例：沒有 4 位取代的 9,9-二苯基茀、BPA 不命中骨架', () => {
    for (const s of ['CC(C)(c1ccc(O)cc1)c1ccc(O)cc1', 'C1(c2ccccc2-c2ccccc21)(c1ccccc1)c1ccccc1']) {
      const r = computeTg(RDKit, s);
      expect(r.status === 'ok' ? r.groups.some((g) => g.rowId === 'CAL.fluorene.diaryl') : false).toBe(false);
    }
  });
});

describe('已有書中值的案例不受影響', () => {
  it('PET、PMMA、PEEK 的結果與關閉校準完全相同', () => {
    for (const s of ['*CC(C)(C(=O)OC)*', '*Oc1ccc(Oc2ccc(C(=O)c3ccc(*)cc3)cc2)cc1', '*CC(Cl)*']) {
      const a = ok(computeTg(RDKit, s));
      const b = ok(computeTg(RDKit, s, { calibrated: false }));
      expect(a.tgK).toBe(b.tgK);
      expect(a.containsCalibrated).toBe(false);
    }
  });
});
