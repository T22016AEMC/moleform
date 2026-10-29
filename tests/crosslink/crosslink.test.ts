// 交聯第 0 層的行為測試（任務 016）：只檢查程式依官能基 SMARTS 與反應規則運作（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeComponent, analyzeCrosslink } from '../../src/core/crosslink/analyze';
import { drawMarkedStructure, reactiveAtomsOf } from '../../src/core/crosslink/draw';
import { findGroupSites, queryAtomMaps } from '../../src/core/crosslink/groups';
import { judgeFormulation, judgePair } from '../../src/core/crosslink/judge';
import type { CrosslinkComponent } from '../../src/core/crosslink/types';
import { bundledTexts, loadTables } from '../../src/core/data/load';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';

const P = '[*:1]c1ccc(C2(c3ccc(C([*:2])c4ccc5ccccc5c4)c(O)c3)c3ccccc3-c3ccccc32)cc1O';
const E = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';
const S = 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2';
const PGMEA = 'COCC(C)OC(C)=O';

const comp = (id: string, name: string, canonicalSmiles: string, category: string, extra: Partial<CrosslinkComponent> = {}): CrosslinkComponent => ({
  id,
  name,
  canonicalSmiles,
  category,
  ...extra,
});

let RDKit: RDKitModule;
const { tables } = loadTables(bundledTexts);
const groups = tables.functionalGroups.rows;
const rules = tables.reactionRules.rows;
const T = { functionalGroups: groups, reactionRules: rules };

beforeAll(async () => {
  RDKit = await getRDKit();
});

/** 該成分每種官能基的位點數（每分子或每重複單元） */
function counts(c: CrosslinkComponent): Record<string, number> {
  const a = analyzeComponent(RDKit, c, groups);
  return Object.fromEntries(a.groups.map((g) => [g.groupId, g.sites.length]));
}

describe('官能基計數', () => {
  it('苯酚 1、雙酚 A 2、S 2：酚羥基不重複計數', () => {
    expect(counts(comp('1', '苯酚', 'Oc1ccccc1', 'Small Molecule'))).toEqual({ 'hydroxyl.phenolic': 1 });
    expect(counts(comp('2', '雙酚 A', 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1', 'Small Molecule'))).toEqual({ 'hydroxyl.phenolic': 2 });
    expect(counts(comp('3', 'S', S, 'Small Molecule'))).toEqual({ 'hydroxyl.phenolic': 2 });
  });

  it('BADGE 的環氧基 2；PGMEA 0', () => {
    expect(counts(comp('4', 'BADGE', 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1', 'Resin'))).toEqual({ 'ether.epoxide': 2 });
    expect(counts(comp('5', 'PGMEA', PGMEA, 'Solvent'))).toEqual({});
  });

  it('聚合物：P 重複單元酚羥基 2、E 重複單元環氧基 1（排除連接點 *）', () => {
    expect(counts(comp('p', 'P', P, 'Resin'))).toEqual({ 'hydroxyl.phenolic': 2 });
    expect(counts(comp('e', 'E', E, 'Resin'))).toEqual({ 'ether.epoxide': 1 });
  });

  it('涉及連接點 * 的匹配被排除；小分子（無排除）則保留', () => {
    // 假想的官能基，其 SMARTS 的一個原子可以比對到 *（[!#1]）：羥基接在連接點上
    const probe = { ...groups[0], id: 'probe', smarts: '[!#1][OX2H:1]', reactive_atom_maps: [1] };
    const mol = RDKit.get_mol('[*:1]O')!;
    try {
      expect(findGroupSites(RDKit, mol, [probe], false)).toHaveLength(1);
      expect(findGroupSites(RDKit, mol, [probe], true)).toEqual([]);
    } finally {
      mol.delete();
    }
  });

  it('queryAtomMaps：依原子出現順序讀出映射編號', () => {
    expect(queryAtomMaps('[OX2H:1][cX3]:[c]')).toEqual([1, 0, 0]);
    expect(queryAtomMaps('[O:1]1[C:2][C:3]1')).toEqual([1, 2, 3]);
    expect(queryAtomMaps('O1CC1')).toEqual([0, 0, 0]);
    expect(queryAtomMaps('[$([OH]C)]Cl[Br:5]')).toEqual([0, 0, 5]);
  });
});

describe('網路判定（手造的 f 值）', () => {
  it('2＋2 鏈延長', () => expect(judgePair(2, 2, false, false)).toBe('chain'));
  it('2＋3 網路', () => expect(judgePair(2, 3, false, false)).toBe('network'));
  it('3＋3 網路', () => expect(judgePair(3, 3, false, false)).toBe('network'));
  it('1＋2 封端', () => expect(judgePair(1, 2, false, false)).toBe('capping'));
  it('1＋聚合物 接枝', () => {
    expect(judgePair(1, 20, false, true)).toBe('graft');
    expect(judgePair(20, 1, true, false)).toBe('graft');
  });
  it('f 未知時無法判定', () => expect(judgePair(null, 2, false, true)).toBe('undetermined'));
  it('配方判定：任一配對為網路即可形成網路', () => {
    expect(judgeFormulation(['capping', 'network'])).toBe('network');
    expect(judgeFormulation(['chain', 'capping'])).toBe('chain');
    expect(judgeFormulation(['graft'])).toBe('capping');
    expect(judgeFormulation([])).toBe('none');
  });
});

describe('測試體系：配方 4A、4B', () => {
  const pc = comp('P', '酚醛樹脂 P', P, 'Resin', { polymer: { mnInput: 6000 } });
  const ec = comp('E', '環氧寡聚物 E', E, 'Resin', { polymer: { dpInput: 21 } });
  const sc = comp('S', 'SBI 雙酚 S', S, 'Small Molecule');
  const lc = comp('L', 'PGMEA', PGMEA, 'Solvent');

  it('4A（P＋E＋PGMEA）：只有 E–P 一個配對，網路；PGMEA 不參與', () => {
    const result = analyzeCrosslink(RDKit, [pc, ec, lc], T);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]).toMatchObject({ ruleId: 'epoxy+phenol', kind: 'network', self: false });
    expect(result.pairs[0].a.componentId).toBe('E');
    expect(result.pairs[0].b?.componentId).toBe('P');
    expect(result.verdict).toBe('network');
    expect(result.nonParticipants).toEqual([{ id: 'L', name: 'PGMEA' }]);
    expect(result.pairs[0].catalyst).toEqual({ status: 'none', message: '不需催化劑' });
    expect(result.pairs[0].temperature).toBe('尚無文獻資料');
    expect(result.warnings).toEqual([]);
  });

  it('4B（P＋E＋S＋PGMEA）：E–P、E–S 兩個配對，皆網路；PGMEA 不參與', () => {
    const result = analyzeCrosslink(RDKit, [pc, ec, sc, lc], T);
    expect(result.pairs.map((p) => `${p.a.componentId}-${p.b?.componentId}:${p.kind}`)).toEqual(['E-P:network', 'E-S:network']);
    expect(result.verdict).toBe('network');
    expect(result.nonParticipants.map((n) => n.id)).toEqual(['L']);
  });

  it('標記的反應原子：E 為環上 3 個原子、S 為 2 個酚羥基的 O（0 起算，排序）', () => {
    const result = analyzeCrosslink(RDKit, [pc, ec, sc, lc], T);
    expect(result.markedAtoms.L).toBeUndefined();
    expect(result.markedAtoms.E).toHaveLength(3);
    expect(result.markedAtoms.S).toHaveLength(2);
    expect(result.markedAtoms.P).toHaveLength(2);
    for (const atoms of Object.values(result.markedAtoms)) expect(atoms).toEqual([...atoms].sort((a, b) => a - b));
  });

  it('審核狀態：三列皆已通過（approved），不再標示「尚未審核」', () => {
    const result = analyzeCrosslink(RDKit, [pc, ec, lc], T);
    expect(result.pendingReview.rules).toEqual([]);
    expect(result.pendingReview.groups).toEqual([]);
  });

  it('聚合物缺 Mn 與 DP：無法判定並警告', () => {
    const result = analyzeCrosslink(RDKit, [comp('P', 'P', P, 'Resin'), ec, lc], T);
    expect(result.pairs[0].kind).toBe('undetermined');
    expect(result.verdict).toBe('undetermined');
    expect(result.warnings.some((w) => w.includes('Mw'))).toBe(true);
  });

  it('只有溶劑：無反應', () => {
    const result = analyzeCrosslink(RDKit, [lc], T);
    expect(result.verdict).toBe('none');
    expect(result.nonParticipants).toHaveLength(1);
  });

  it('小分子配對：BADGE（f=2）＋雙酚 A（f=2）為鏈延長；苯酚（f=1）＋ BADGE 為封端；苯酚＋ E 為接枝', () => {
    const badge = comp('B', 'BADGE', 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1', 'Resin');
    const bpa = comp('A', 'BPA', 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1', 'Crosslinker');
    const phenol = comp('H', '苯酚', 'Oc1ccccc1', 'Small Molecule');
    expect(analyzeCrosslink(RDKit, [badge, bpa], T).pairs[0].kind).toBe('chain');
    expect(analyzeCrosslink(RDKit, [badge, phenol], T).pairs[0].kind).toBe('capping');
    expect(analyzeCrosslink(RDKit, [ec, phenol], T).pairs[0].kind).toBe('graft');
  });

  it('同一個分子同時有環氧基與酚羥基：列為自反應配對', () => {
    const both = comp('X', 'X', 'Oc1ccc(OCC2CO2)cc1', 'Small Molecule');
    const result = analyzeCrosslink(RDKit, [both], T);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].self).toBe(true);
    expect(result.pairs[0].kind).toBe('capping');
  });
});

describe('催化劑檢查（D26）：以假想需要催化劑的規則測試程式邏輯', () => {
  const needCat = rules.map((r) => ({ ...r, catalyst_required: '假想催化劑' }));
  const badge = comp('B', 'BADGE', 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1', 'Resin');
  const bpa = comp('A', 'BPA', 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1', 'Crosslinker');

  it('配方沒有 Catalyst/Initiator → 警告', () => {
    const result = analyzeCrosslink(RDKit, [badge, bpa], { functionalGroups: groups, reactionRules: needCat });
    expect(result.pairs[0].catalyst.status).toBe('missing');
    expect(result.warnings.some((w) => w.includes('Catalyst/Initiator'))).toBe(true);
  });

  it('配方有 Catalyst/Initiator → 不警告', () => {
    const tpp = comp('T', 'TPP', 'c1ccc(P(c2ccccc2)c2ccccc2)cc1', 'Catalyst/Initiator');
    const result = analyzeCrosslink(RDKit, [badge, bpa, tpp], { functionalGroups: groups, reactionRules: needCat });
    expect(result.pairs[0].catalyst.status).toBe('present');
    expect(result.warnings).toEqual([]);
  });

  it('有溫度資料時顯示範圍', () => {
    const withTemp = rules.map((r) => ({ ...r, temp_min_c: 120, temp_max_c: 180 }));
    const result = analyzeCrosslink(RDKit, [badge, bpa], { functionalGroups: groups, reactionRules: withTemp });
    expect(result.pairs[0].temperature).toBe('120–180 °C');
  });
});

describe('反應原子標記', () => {
  it('3D 用的反應原子：BADGE 的環上 6 個原子；乙醇沒有', () => {
    expect(reactiveAtomsOf(RDKit, 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1', groups, rules)).toHaveLength(6);
    expect(reactiveAtomsOf(RDKit, 'CCO', groups, rules)).toEqual([]);
  });

  it('2D 圖：產生 SVG，標記的原子帶編號（1 起算）', () => {
    const svg = drawMarkedStructure(RDKit, 'Oc1ccccc1', [0], { color: '#155d70' });
    expect(svg).toContain('<svg');
    expect(svg!.replace(/<[^>]+>/g, '').replace(/\s/g, '')).toContain('O1');
  });

  it('無法解析的結構回傳 null', () => {
    expect(drawMarkedStructure(RDKit, 'not a molecule', [0])).toBeNull();
  });
});
