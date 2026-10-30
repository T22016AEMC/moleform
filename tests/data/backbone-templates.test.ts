// 骨架範本資料表 backbone_templates.csv 的測試（任務 023，D51）：格式檢查與 B-4 的結構核對。只檢查程式與資料照任務單運作（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BACKBONE_TEMPLATES_COLUMNS,
  bundledBackboneTemplatesText,
  checkBackboneTemplateSmiles,
  readBackboneTemplates,
  validateBackboneTemplates,
  type BackboneTemplateRow,
} from '../../src/core/data/backboneTemplates';
import { END_GROUP_PRESETS } from '../../src/core/data/endGroups';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const table = readBackboneTemplates(bundledBackboneTemplatesText);
const row = (id: string) => table.rows.find((r) => r.id === id) as BackboneTemplateRow;
const SOURCE = 'Claude 依一般化學知識整理，使用者 2026-10-30 同意';

/** 第一個原子（`*` 去掉後的起頭）的長度：括號原子或有機子集原子 */
const firstAtom = /^(\[[^\]]+\]|Cl|Br|[BCNOPSFIcnops])/;

/** 把 SMILES 中的連接點 mark 換成環閉合標號 label（n = 0、1 的結構核對用） */
function closeAt(smiles: string, mark: string, label: string): string {
  const i = smiles.indexOf(mark);
  if (i < 0) throw new Error(`找不到 ${mark}`);
  const before = smiles.slice(0, i);
  const after = smiles.slice(i + mark.length);
  if (i === 0) {
    const m = firstAtom.exec(after);
    if (!m) throw new Error('連接點後面不是原子');
    return m[0] + label + after.slice(m[0].length);
  }
  if (before.endsWith('(') && after.startsWith(')')) return before.slice(0, -1) + label + after.slice(1);
  return before + label + after;
}

/** 組出「端基 1 + n 個單元 + 端基 2」的分子（端基 1 接單元的 [*:1]，單元的 [*:2] 接下一個單元或端基 2） */
function buildChain(r: BackboneTemplateRow, n: number): string {
  let label = 10;
  const frags: string[] = [];
  let leftLabel = `%${label++}`;
  frags.push(closeAt(r.end1Smiles, '[*]', leftLabel));
  for (let k = 0; k < n; k++) {
    const right = `%${label++}`;
    frags.push(closeAt(closeAt(r.unitSmiles, '[*:1]', leftLabel), '[*:2]', right));
    leftLabel = right;
  }
  frags.push(closeAt(r.end2Smiles, '[*]', leftLabel));
  return frags.join('.');
}

function analyze(smiles: string): { formula: string; mw: number; h: number } {
  const mol = RDKit.get_mol(smiles)!;
  try {
    expect(mol.is_valid()).toBe(true);
    const counts = new Map<string, number>();
    const molecule = (JSON.parse(mol.get_json()) as { molecules: { atoms: { z?: number; impHs?: number }[] }[] }).molecules[0];
    const SYMBOL: Record<number, string> = { 1: 'H', 6: 'C', 7: 'N', 8: 'O', 14: 'Si' };
    for (const a of molecule.atoms) {
      const z = a.z ?? 6; // JSON 省略 z 的原子是碳
      const s = SYMBOL[z] ?? `Z${z}`;
      counts.set(s, (counts.get(s) ?? 0) + 1);
      if (a.impHs) counts.set('H', (counts.get('H') ?? 0) + a.impHs);
    }
    const order = ['C', 'H', ...[...counts.keys()].filter((k) => k !== 'C' && k !== 'H').sort()];
    const formula = order.filter((k) => counts.has(k)).map((k) => `${k}${counts.get(k) === 1 ? '' : counts.get(k)}`).join('');
    const mw = (JSON.parse(mol.get_descriptors()) as { amw: number }).amw;
    return { formula, mw, h: counts.get('H') ?? 0 };
  } finally {
    mol.delete();
  }
}

describe('骨架範本資料表 backbone_templates.csv', () => {
  it('6 列、順序與 id 照任務單；標題列、必填、出處、唯一、對應端基 id、連接點數量、RDKit 解析都通過', () => {
    expect(table.issues).toEqual([]);
    expect(table.rows.map((r) => r.id)).toEqual(['BT01', 'BT02', 'BT03', 'BT04', 'BT05', 'BT06']);
    expect(validateBackboneTemplates(table)).toEqual([]);
    expect(checkBackboneTemplateSmiles(RDKit, table)).toEqual([]);
    expect(table.rows.every((r) => r.source === SOURCE)).toBe(true);
    expect(bundledBackboneTemplatesText.charCodeAt(0)).toBe(0xfeff);
    expect(row('BT01')).toMatchObject({ name: '苯酚 Novolac（PN）', end1PresetId: 'EG12', end2PresetId: 'EG01' });
    expect(row('BT05')).toMatchObject({ end1PresetId: 'EG09', end2PresetId: '', end1Smiles: '[*]CC1CO1' });
    // 對應端基 id 的 SMILES 與 end_groups.csv 相同
    for (const r of table.rows) {
      for (const [id, smiles] of [[r.end1PresetId, r.end1Smiles], [r.end2PresetId, r.end2Smiles]]) {
        if (id) expect(END_GROUP_PRESETS.find((p) => p.id === id)?.smiles).toBe(smiles);
      }
    }
  });

  const header = BACKBONE_TEMPLATES_COLUMNS.join(',');
  const good = 'BT99,測試,[*:1]C[*:2],[*]C,EG02,[*][H],EG01,說明,出處';
  it('格式錯誤會報錯並指出列與欄位', () => {
    const run = (line: string) => validateBackboneTemplates(readBackboneTemplates(`${header}\n${line}`));
    expect(run(good)).toEqual([]);
    expect(run('BT99,測試,[*:1]C[*:2],[*]C,EG02,[*][H],EG01,說明,').map((i) => i.column)).toEqual(['出處']);
    expect(run('BT99,測試,[*:1]C,[*]C,EG02,[*][H],EG01,說明,x').map((i) => i.column)).toEqual(['單元 SMILES']);
    expect(run('BT99,測試,[*:1]C[*:1],[*]C,EG02,[*][H],EG01,說明,x').map((i) => i.column)).toEqual(['單元 SMILES']);
    expect(run('BT99,測試,[*:1]C[*:2],C,EG02,[*][H],EG01,說明,x').map((i) => i.column)).toContain('端基 1 SMILES');
    expect(run('BT99,測試,[*:1]C[*:2],[*]C,EG99,[*][H],EG01,說明,x').map((i) => i.column)).toEqual(['端基 1 對應端基 id']);
    expect(run('BT99,測試,[*:1]C[*:2],[*]CC,EG02,[*][H],EG01,說明,x').map((i) => i.column)).toEqual(['端基 1 對應端基 id']);
    const dup = validateBackboneTemplates(readBackboneTemplates(`${header}\n${good}\n${good}`));
    expect(dup.map((i) => [i.row, i.column])).toEqual([[3, 'id']]);
    const badHeader = readBackboneTemplates('id,名稱\nBT01,x');
    expect(badHeader.issues[0].message).toContain('標題列與定義不一致');
    const smilesBad = checkBackboneTemplateSmiles(RDKit, readBackboneTemplates(`${header}\nBT99,測試,[*:1]C(C[*:2],[*]C,EG02,[*][H],EG01,說明,x`));
    expect(smilesBad.map((i) => i.column)).toEqual(['單元 SMILES']);
  });

  it('B-4：每個單元恰好 [*:1]、[*:2]，每個端基恰好一個 *', () => {
    for (const r of table.rows) {
      expect(r.unitSmiles.split('[*:1]').length - 1).toBe(1);
      expect(r.unitSmiles.split('[*:2]').length - 1).toBe(1);
      expect(r.unitSmiles.split('*').length - 1).toBe(2);
      expect(r.end1Smiles.split('*').length - 1).toBe(1);
      expect(r.end2Smiles.split('*').length - 1).toBe(1);
    }
  });

  it('B-4：BT01–BT04 的 OH（或縮水甘油醚氧）：CH₂ 在鄰位、[*:2] 在對位；BT02、BT04 的甲基在 OH 的另一個鄰位', () => {
    const matches = (unit: string, smarts: string) => {
      const mol = RDKit.get_mol(unit)!;
      const q = RDKit.get_qmol(smarts)!;
      try {
        return Object.keys(JSON.parse(mol.get_substruct_match(q)) as Record<string, unknown>).length > 0;
      } finally {
        q.delete();
        mol.delete();
      }
    };
    // 環上原子順序：連 CH₂ 的碳、帶 O 的碳、（甲基位）、H、帶 [*:2] 的碳、H
    const ortho = (o: string, me: boolean) => `[#0]-[CH2]-c1:c(-${o}):${me ? 'c(-[CH3])' : '[cH]'}:[cH]:c(-[#0]):[cH]:1`;
    for (const [id, o, me] of [['BT01', '[OH]', false], ['BT02', '[OH]', true], ['BT03', '[OX2]-[CH2]-C2CO2', false], ['BT04', '[OX2]-[CH2]-C2CO2', true]] as const) {
      expect(matches(row(id).unitSmiles, ortho(o, me)), id).toBe(true);
    }
    // 對照：甲基位置錯誤（BT01 沒有甲基）不應比對到
    expect(matches(row('BT01').unitSmiles, ortho('[OH]', true))).toBe(false);
  });

  it('B-4：n = 0、n = 1 的分子式與分子量', () => {
    const lines: string[] = [];
    const get = (id: string, n: number) => {
      const smiles = buildChain(row(id), n);
      const a = analyze(smiles);
      lines.push(`${id} n=${n} ${a.formula} ${a.mw.toFixed(2)} ${smiles}`);
      return a;
    };
    for (const id of ['BT01', 'BT02', 'BT03', 'BT04', 'BT05', 'BT06']) {
      get(id, 0);
      get(id, 1);
    }
    console.log(lines.join('\n'));
    expect(get('BT05', 0).formula).toBe('C21H24O4');
    expect(get('BT05', 0).mw).toBeCloseTo(340.4, 1);
    expect(get('BT06', 0).formula).toBe('C31H26O4');
    expect(get('BT06', 0).mw).toBeCloseTo(462.5, 1);
    expect(get('BT01', 0).formula).toBe('C6H6O');
    expect(get('BT01', 1).formula).toBe('C13H12O2');
    expect(get('BT05', 1).formula).toBe('C39H44O7');
    expect(get('BT05', 1).mw).toBeCloseTo(624.8, 1);
  });
});
