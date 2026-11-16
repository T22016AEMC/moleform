// 黃金資料：src/core/polymer/endGroups.ts 的 analyzeEndGroup、analyzeEndGroups、endGroupNote（任務 M04；風險 R7 描述子 amw）。
// 只呼叫現有的 TypeScript 函式。案例種類（input.kind）：
//   endGroup   analyzeEndGroup(RDKit, { smiles }, which)：端基質量 M_end（RDKit 的 amw）與錯誤（空白、無法解析、連接點數量不是 1、沒連到原子）；which 為 1 或 2（訊息帶「端基 N」）
//   endGroups  analyzeEndGroups(RDKit, spec)：兩端合計 M_ends、已填旗標；沒填的略過；第一個錯誤即回傳
//   note       endGroupNote(filled)：四種填寫組合
// 輸入：端基資料表 27 列、骨架範本 BT01–BT06 的端基、tests/polymer/endGroups.test.ts 的字串與組合。
// 執行：node scripts/golden/export-polymer-endGroups.ts
import { withVite, writeGolden, type GoldenCase } from './common.ts';
import { attempt } from './polymer-inputs.ts';

await withVite(async (server) => {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { analyzeEndGroup, analyzeEndGroups, endGroupNote } = await server.ssrLoadModule('/src/core/polymer/endGroups.ts');
  const { END_GROUP_PRESETS } = await server.ssrLoadModule('/src/core/data/endGroups.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const RDKit = await getRDKit();

  const cases: GoldenCase[] = [];
  const stats: Record<string, number> = {};
  const addEnd = (id: string, end: { smiles: string; presetId?: string }, which: 1 | 2) => {
    const result = attempt(() => analyzeEndGroup(RDKit, end, which)) as any;
    cases.push({ id: `endGroup/${id}/which${which}`, input: { kind: 'endGroup', end, which }, output: result });
    const key = result.threw ? 'threw' : result.ok ? 'ok' : (result.message as string).replace(/^端基 \d：/, '');
    stats[key] = (stats[key] ?? 0) + 1;
  };
  for (const p of END_GROUP_PRESETS) addEnd(`preset/${p.id}`, { smiles: p.smiles, presetId: p.id }, 1);
  for (const t of BACKBONE_TEMPLATES) {
    if (t.end1Smiles) addEnd(`BT/${t.id}/end1`, t.end1PresetId ? { smiles: t.end1Smiles, presetId: t.end1PresetId } : { smiles: t.end1Smiles }, 1);
    if (t.end2Smiles) addEnd(`BT/${t.id}/end2`, t.end2PresetId ? { smiles: t.end2Smiles, presetId: t.end2PresetId } : { smiles: t.end2Smiles }, 2);
  }
  // endGroups.test.ts：連接點規則與訊息（端基 1、端基 2）
  addEnd('test/CCO', { smiles: 'CCO' }, 1);
  addEnd('test/two-stars', { smiles: '*CC*' }, 2);
  addEnd('test/dangling', { smiles: '*.CC' }, 1);
  addEnd('test/unparsable', { smiles: 'C(' }, 2);
  addEnd('test/empty', { smiles: '' }, 1);
  addEnd('test/spaces', { smiles: '   ' }, 2);
  addEnd('test/custom-isopropanol', { smiles: '[*]CC(C)O' }, 1);
  addEnd('test/custom-padded', { smiles: ' [*]CC(C)O ' }, 1);
  addEnd('test/mapped', { smiles: '[*:1]CC' }, 1);

  const ep = (id: string) => {
    const p = END_GROUP_PRESETS.find((r: any) => r.id === id);
    return { smiles: p.smiles, presetId: id };
  };
  const specs: [string, unknown][] = [
    ['test/undefined', undefined],
    ['test/null', null],
    ['test/empty', {}],
    ['test/endGroups-empty', { endGroups: {} }],
    ['test/butyl-hydrogen', { endGroups: { end1: ep('EG04'), end2: ep('EG01') } }],
    ['test/butyl-only', { endGroups: { end1: ep('EG04') } }],
    ['test/hydrogen-only', { endGroups: { end2: ep('EG01') } }],
    ['test/glycidyl-both', { endGroups: { end1: ep('EG08'), end2: ep('EG08') } }],
    ['test/phenol-hydrogen', { mnInput: 3000, endGroups: { end1: ep('EG11'), end2: ep('EG01') } }],
    ['test/end1-not-an-end', { endGroups: { end1: { smiles: 'CCO' } } }],
    ['test/end2-bad-after-end1-ok', { endGroups: { end1: ep('EG04'), end2: { smiles: 'CCO' } } }],
    ['test/custom', { mwInput: 6000, pdiInput: 1.8, endGroups: { end1: ep('EG04'), end2: { smiles: '[*]CC(C)O' } } }],
  ];
  for (const t of BACKBONE_TEMPLATES) {
    const eg: Record<string, unknown> = {};
    if (t.end1Smiles) eg.end1 = t.end1PresetId ? { smiles: t.end1Smiles, presetId: t.end1PresetId } : { smiles: t.end1Smiles };
    if (t.end2Smiles) eg.end2 = t.end2PresetId ? { smiles: t.end2Smiles, presetId: t.end2PresetId } : { smiles: t.end2Smiles };
    specs.push([`BT/${t.id}`, { endGroups: eg }]);
  }
  for (const [id, spec] of specs) {
    const result = attempt(() => analyzeEndGroups(RDKit, spec as any));
    const input: Record<string, unknown> = { kind: 'endGroups' };
    if (spec !== undefined) input.spec = spec;
    cases.push({ id: `endGroups/${id}`, input, output: result });
  }
  for (const filled of [[true, true], [false, false], [true, false], [false, true]] as const) {
    cases.push({ id: `note/${filled.join('-')}`, input: { kind: 'note', filled: [...filled] }, output: endGroupNote(filled) });
  }
  console.log(`端基 ${Object.entries(stats).map(([k, v]) => `${k} ${v}`).join('、')}；spec ${specs.length} 個`);
  writeGolden('polymer-endGroups', String(RDKit.version()), cases);
});
