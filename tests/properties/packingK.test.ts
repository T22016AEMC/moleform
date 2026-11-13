// 堆積係數 k 與純聚物 Tg 表（任務 038 的 E 段，D61）的測試：列數、逐字核對、Tg 解析、查表介面、格式檢查（缺欄位報錯，D22）。
// 只檢查資料表格式與程式有沒有照規則運作（D17）；表中的 Tg 是各材料的初始 Tg，本檔不拿它們互相運算或比對。
import { describe, expect, it } from 'vitest';
import {
  PACKING_K_AUDIT,
  PACKING_K_COLUMNS,
  PACKING_K_NOT_FOUND,
  PACKING_K_ROWS,
  PACKING_K_ROW_COUNT,
  PACKING_K_SOURCE_MARK,
  TG_LABEL_APPROX,
  TG_LABEL_MIDPOINT,
  TG_TABLE_BLANK,
  bundledPackingKText,
  findPackingKRow,
  parseTgText,
  readPackingK,
  resolvePackingK,
  tableTgOf,
  validatePackingK,
} from '../../src/core/data/packingCoefficientK';
import { formatIssue } from '../../src/core/data/types';
import { PACKING_K_CARD_ROWS } from './packingKTableRows';

const table = readPackingK(bundledPackingKText);
const issuesOf = (text: string) => {
  const t = readPackingK(text);
  return [...t.issues, ...validatePackingK(t)];
};
const row = (name: string) => {
  const r = findPackingKRow(name);
  if (r === null) throw new Error(`表內應有「${name}」`);
  return r;
};
/** 把實際資料表的某一列換掉（列號從 1 起算，不含標題列），用來做格式檢查的反例 */
const withLine = (index: number, edit: (line: string) => string): string => {
  const lines = bundledPackingKText.split('\n');
  lines[index] = edit(lines[index]);
  return lines.join('\n');
};

describe('packing_coefficient_k.csv 實際資料表', () => {
  it('格式檢查全部通過（標題列、id、必填、k 範圍、名稱不重複、Tg 欄與原文一致）', () => {
    expect([...table.issues, ...validatePackingK(table)].map(formatIssue)).toEqual([]);
  });

  it('以 UTF-8 BOM 開頭；欄位照任務卡，沒有 SMILES 欄', () => {
    expect(bundledPackingKText.charCodeAt(0)).toBe(0xfeff);
    expect([...PACKING_K_COLUMNS]).toEqual(['id', '結構類別', '材料名稱', 'k', 'Tg原文', 'Tg下限', 'Tg上限', 'Tg近似', '出處', '稽核狀態', '備註']);
    expect(PACKING_K_COLUMNS.some((c) => /smiles/i.test(c))).toBe(false);
  });

  it('列數 50：43 列有 Tg、7 列 Tg 為「—」', () => {
    expect(PACKING_K_ROW_COUNT).toBe(50);
    expect(PACKING_K_ROWS).toHaveLength(50);
    expect(PACKING_K_ROWS.filter((r) => r.tgLowerC !== null)).toHaveLength(43);
    expect(PACKING_K_ROWS.filter((r) => r.tgText === '—')).toHaveLength(7);
    expect(PACKING_K_ROWS.filter((r) => r.tgText === '—').map((r) => r.name)).toEqual([
      'Poly(maleic anhydride)',
      'EPN（未固化）',
      'ECN（未固化）',
      'BCB（未固化樹脂）',
      'PIM-1（SBI-based）',
      '3Ph-OH TR-PBO（450°C）',
      '4Ph-OH TR-PBO（400°C）',
    ]);
  });

  it('每列的堆積係數 k 在 0 與 1 之間；材料名稱不重複；每列有出處與稽核狀態', () => {
    for (const r of PACKING_K_ROWS) {
      expect(r.packingK, r.name).toBeGreaterThan(0);
      expect(r.packingK, r.name).toBeLessThan(1);
      expect(r.source, r.name).toContain(PACKING_K_SOURCE_MARK);
      expect(r.source, r.name).toBe('使用者提供的 k／Tg 表（來源論文待補），2026-11-07');
      expect(r.audit, r.name).toBe(PACKING_K_AUDIT);
    }
    expect(new Set(PACKING_K_ROWS.map((r) => r.name)).size).toBe(50);
    expect(PACKING_K_ROWS.map((r) => r.id)).toEqual(Array.from({ length: 50 }, (_, i) => `PK${String(i + 1).padStart(2, '0')}`));
  });

  it('50 列的結構類別、材料名稱、k、Tg 原文與任務卡的表逐字相同（k 保留末位的 0）', () => {
    expect(PACKING_K_CARD_ROWS).toHaveLength(50);
    expect(PACKING_K_ROWS.map((r) => [r.category, r.name, r.packingKText, r.tgText])).toEqual(PACKING_K_CARD_ROWS.map((r) => [...r]));
  });

  it('抽查四列（數值寫死在測試裡，與任務卡逐字相同）', () => {
    expect(row('PHS')).toMatchObject({ id: 'PK01', category: '苯乙烯／酚羥基', packingKText: '0.640', packingK: 0.64, tgText: '175–180', tgLowerC: 175, tgUpperC: 180, tgApprox: false });
    expect(row('6FDA-CARDO')).toMatchObject({ id: 'PK14', category: 'Cardo／芴基聚醯亞胺', packingKText: '0.628', packingK: 0.628, tgText: '393', tgLowerC: 393, tgUpperC: 393 });
    expect(row('PIM-1（SBI-based）')).toMatchObject({ id: 'PK17', category: 'SBI／螺雙茚滿／PIM', packingKText: '0.569', tgText: '—', tgLowerC: null, tgUpperC: null, tgApprox: false });
    expect(row('PFODPA-trans-TFMB')).toMatchObject({ id: 'PK34', category: '含氟／PFCB 聚醯亞胺', packingKText: '0.706', tgText: '約 220–230', tgLowerC: 220, tgUpperC: 230, tgApprox: true });
  });

  it('備註只放材料名稱本身帶的條件（10 列），沒有其他說明或數值', () => {
    const noted = PACKING_K_ROWS.filter((r) => r.notes !== '');
    expect(noted.map((r) => [r.name, r.notes])).toEqual([
      ['Poly(norbornene)，加成型', '加成型'],
      ['DGEBA（未固化）', '未固化'],
      ['DGEBF（未固化）', '未固化'],
      ['EPN（未固化）', '未固化'],
      ['ECN（未固化）', '未固化'],
      ['BCB（未固化樹脂）', '未固化樹脂'],
      ['3Ph-OH PI（250°C）', '250°C'],
      ['3Ph-OH TR-PBO（450°C）', '450°C'],
      ['4Ph-OH PI（250°C）', '250°C'],
      ['4Ph-OH TR-PBO（400°C）', '400°C'],
    ]);
    for (const r of noted) expect(r.name).toContain(r.notes);
  });
});

describe('Tg 原文的解析', () => {
  it('單值', () => {
    expect(parseTgText('114.7')).toEqual({ status: 'ok', lowerC: 114.7, upperC: 114.7, approx: false });
    expect(parseTgText('393')).toEqual({ status: 'ok', lowerC: 393, upperC: 393, approx: false });
  });
  it('範圍取兩端', () => {
    expect(parseTgText('175–180')).toEqual({ status: 'ok', lowerC: 175, upperC: 180, approx: false });
  });
  it('「約」為近似', () => {
    expect(parseTgText('約 370')).toEqual({ status: 'ok', lowerC: 370, upperC: 370, approx: true });
  });
  it('「約 220–230」：近似的範圍', () => {
    expect(parseTgText('約 220–230')).toEqual({ status: 'ok', lowerC: 220, upperC: 230, approx: true });
  });
  it('「—」：沒有 Tg', () => {
    expect(parseTgText('—')).toEqual({ status: 'blank' });
  });
  it('其他寫法不猜：回報無法解析', () => {
    for (const bad of ['', '高', '175-180', '180–175', '約', '175–', '> 300']) expect(parseTgText(bad).status, bad).toBe('invalid');
  });
});

describe('表內 Tg 的帶出', () => {
  it('單值：直接取值，沒有標示', () => {
    expect(tableTgOf(row('6FDA-CARDO'))).toEqual({ status: 'ok', tgC: 393, lowerC: 393, upperC: 393, raw: '393', labels: [] });
  });
  it('範圍：取中點並標「範圍中點」', () => {
    expect(tableTgOf(row('PHS'))).toEqual({ status: 'ok', tgC: 177.5, lowerC: 175, upperC: 180, raw: '175–180', labels: [TG_LABEL_MIDPOINT] });
  });
  it('有「約」：標「近似值」；近似的範圍兩個標示都有', () => {
    expect(tableTgOf(row('Cellulose Acetate（CA）'))).toMatchObject({ status: 'ok', tgC: 191, labels: [TG_LABEL_APPROX] });
    expect(tableTgOf(row('PFODPA-cis-TFMB'))).toMatchObject({ status: 'ok', tgC: 225, labels: [TG_LABEL_MIDPOINT, TG_LABEL_APPROX] });
  });
  it('空白：回報「表中無 Tg，請輸入」，不猜', () => {
    expect(tableTgOf(row('PIM-1（SBI-based）'))).toEqual({ status: 'blank', raw: '—', message: TG_TABLE_BLANK });
    expect(TG_TABLE_BLANK).toBe('表中無 Tg，請輸入');
  });
});

describe('查表介面（材料名稱精確比對，或使用者直接輸入堆積係數 k）', () => {
  it('依材料名稱取堆積係數 k', () => {
    expect(resolvePackingK({ name: '6FDA-CARDO' })).toMatchObject({ status: 'ok', packingK: 0.628, source: 'table' });
    expect(resolvePackingK({ name: 'Polysulfone（PSF）' })).toMatchObject({ status: 'ok', packingK: 0.653, source: 'table' });
  });
  it('查不到回報「k 表無此材料」，不以相近材料代替', () => {
    for (const name of ['Cardo', '6FDA-Cardo', '6fda-cardo', 'PSF', 'Polysulfone', ' PMMA', 'PMMA ', 'DGEBA', '6FDA-SBI']) {
      const r = resolvePackingK({ name });
      expect(r.status, name).toBe('notFound');
      if (r.status === 'notFound') expect(r.message).toContain(PACKING_K_NOT_FOUND);
    }
    expect(PACKING_K_NOT_FOUND).toBe('k 表無此材料');
    expect(findPackingKRow('Cardo')).toBeNull();
  });
  it('使用者直接輸入的堆積係數 k 優先於表', () => {
    expect(resolvePackingK({ packingK: 0.6 })).toEqual({ status: 'ok', packingK: 0.6, source: 'user', row: null });
    const r = resolvePackingK({ name: 'PMMA', packingK: 0.7 });
    expect(r).toMatchObject({ status: 'ok', packingK: 0.7, source: 'user' });
    if (r.status === 'ok') expect(r.row?.name).toBe('PMMA');
  });
  it('使用者輸入的堆積係數 k 必須在 0 與 1 之間；什麼都沒給也拒絕', () => {
    for (const bad of [0, 1, 1.2, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) expect(resolvePackingK({ packingK: bad }).status, String(bad)).toBe('invalid');
    expect(resolvePackingK({}).status).toBe('invalid');
  });
});

describe('格式檢查的反例（缺欄位報錯，D22）', () => {
  const columnsOf = (text: string) => issuesOf(text).map((i) => i.column);

  it('缺出處、出處沒有寫明來源', () => {
    expect(columnsOf(withLine(1, (l) => l.replace('使用者提供的 k／Tg 表（來源論文待補），2026-11-07', '')))).toContain('出處');
    expect(columnsOf(withLine(1, (l) => l.replace('使用者提供的 k／Tg 表（來源論文待補），2026-11-07', '某篇論文')))).toContain('出處');
  });
  it('缺稽核狀態、稽核狀態不是「待使用者審」', () => {
    expect(columnsOf(withLine(2, (l) => l.replace(',待使用者審,', ',,')))).toContain('稽核狀態');
    expect(columnsOf(withLine(2, (l) => l.replace(',待使用者審,', ',已審,')))).toContain('稽核狀態');
  });
  it('缺 k、k 不是數字、k 不在 0 與 1 之間', () => {
    expect(columnsOf(withLine(3, (l) => l.replace(',0.635,', ',,')))).toContain('k');
    expect(columnsOf(withLine(3, (l) => l.replace(',0.635,', ',約0.6,')))).toContain('k');
    expect(columnsOf(withLine(3, (l) => l.replace(',0.635,', ',1.2,')))).toContain('k');
    expect(columnsOf(withLine(3, (l) => l.replace(',0.635,', ',0,')))).toContain('k');
  });
  it('缺結構類別、缺材料名稱、缺 Tg 原文', () => {
    expect(columnsOf(withLine(1, (l) => l.replace(',苯乙烯／酚羥基,', ',,')))).toContain('結構類別');
    expect(columnsOf(withLine(1, (l) => l.replace(',PHS,', ',,')))).toContain('材料名稱');
    expect(columnsOf(withLine(1, (l) => l.replace(',175–180,175,180,', ',,175,180,')))).toContain('Tg原文');
  });
  it('材料名稱重複', () => {
    const issues = issuesOf(withLine(2, (l) => l.replace(',PMMA,', ',PHS,')));
    expect(issues.some((i) => i.column === '材料名稱' && i.message.includes('重複'))).toBe(true);
  });
  it('Tg 的數值欄與 Tg 原文不一致', () => {
    expect(columnsOf(withLine(1, (l) => l.replace(',175–180,175,180,false,', ',175–180,170,180,false,')))).toContain('Tg下限');
    expect(columnsOf(withLine(1, (l) => l.replace(',175–180,175,180,false,', ',175–180,175,185,false,')))).toContain('Tg上限');
    expect(columnsOf(withLine(1, (l) => l.replace(',175–180,175,180,false,', ',175–180,175,180,true,')))).toContain('Tg近似');
    expect(columnsOf(withLine(7, (l) => l.replace(',—,,,false,', ',—,100,100,false,')))).toContain('Tg下限');
    expect(columnsOf(withLine(1, (l) => l.replace(',175–180,175,180,false,', ',175-180,175,180,false,')))).toContain('Tg原文');
    expect(columnsOf(withLine(1, (l) => l.replace(',175,180,false,', ',175,180,是,')))).toContain('Tg近似');
  });
  it('列數不是 50、id 不照順序、欄位數不對、標題列不對', () => {
    const lines = bundledPackingKText.split('\n');
    const short = [...lines.slice(0, 50), ''].join('\n');
    expect(issuesOf(short).some((i) => i.row === null && i.message.includes('應有 50 列'))).toBe(true);
    expect(columnsOf(withLine(5, (l) => l.replace('PK05', 'PK06')))).toContain('id');
    expect(issuesOf(withLine(5, (l) => `${l},多一欄`)).some((i) => i.message.includes('欄位數'))).toBe(true);
    expect(issuesOf(withLine(0, (l) => l.replace('材料名稱', '名稱'))).some((i) => i.message.includes('標題列'))).toBe(true);
  });
});
