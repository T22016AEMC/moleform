// 黃金資料：src/core/polymer/copolymer.ts 的 analyzePolymerUnits、unitsOf、checkDrawnUnit（任務 M04；風險 R7 描述子 amw、浮點加總順序）。
// 只呼叫現有的 TypeScript 函式。案例種類（input.kind）：
//   analyze  analyzePolymerUnits(RDKit, canonicalSmiles, spec)：既有測試（copolymer／endGroups／mwPdi）的單元與比例、mol%／wt%、錯誤路徑、端基；
//            邊界：比例 0、1、極小、比例合計在容差（0.01 + 1e-9）兩側；`roundhalf/`：訊息 `Number(sum.toFixed(6))` 的 .5 捨入
//   units    unitsOf(canonicalSmiles, spec)：沒有 units、units 為 null、空陣列與一般情形
//   drawn    checkDrawnUnit(structure, analysis, unitNumber)
// 「Math.round 的 .5 邊界」在這五個模組沒有對應的呼叫（沒有 Math.round）；JS 的捨入出現在訊息的 `Number(sum.toFixed(6))`：
// 比例合計剛好落在第 6 位小數的 .5（例如 90 + 1/128 = 90.0078125，二進位可精確表示）時，JS 的 toFixed 進位（90.007813），Python 的 format 是銀行家捨入（90.007812）。
// 執行：node scripts/golden/export-polymer-copolymer.ts
import { withVite, writeGolden, type GoldenCase } from './common.ts';
import { attempt, nextDown, nextUp } from './polymer-inputs.ts';

const UNIT_A = '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O'; // 雙酚茀
const UNIT_B = '[*:1]C([*:2])c1ccc2ccccc2c1'; // 萘基次甲基
const P_OLD = '[*:1]c1ccc(C2(c3ccc(C([*:2])c4ccc5ccccc5c4)c(O)c3)c3ccccc3-c3ccccc32)cc1O';
const E = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';

await withVite(async (server) => {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { analyzePolymerUnits, unitsOf, checkDrawnUnit, FRACTION_TOLERANCE } = await server.ssrLoadModule('/src/core/polymer/copolymer.ts');
  const { analyzeRepeatUnit } = await server.ssrLoadModule('/src/core/polymer/repeatUnit.ts');
  const { END_GROUP_PRESETS } = await server.ssrLoadModule('/src/core/data/endGroups.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const RDKit = await getRDKit();

  const cases: GoldenCase[] = [];
  const stats: Record<string, number> = {};
  const ep = (id: string) => {
    const p = END_GROUP_PRESETS.find((r: any) => r.id === id);
    return { smiles: p.smiles, presetId: id };
  };
  const U = (smiles: string, fraction: unknown) => ({ smiles, fraction });
  const addAnalyze = (id: string, canonicalSmiles: string, spec?: unknown) => {
    const input: Record<string, unknown> = { kind: 'analyze', canonicalSmiles };
    if (spec !== undefined) input.spec = spec;
    const result = attempt(() => analyzePolymerUnits(RDKit, canonicalSmiles, spec as any)) as any;
    const key = result.threw ? 'threw' : result.ok ? 'ok' : result.problem.code;
    stats[key] = (stats[key] ?? 0) + 1;
    cases.push({ id: `analyze/${id}`, input, output: result });
  };
  const pair = (a: unknown, b: unknown, basis?: string) => ({ units: [U(UNIT_A, a), U(UNIT_B, b)], ...(basis ? { fractionBasis: basis } : {}) });

  // ---- 既有測試（copolymer.test.ts、endGroups.test.ts） ----
  addAnalyze('test/mol-66.67-33.33', UNIT_A, { units: [U(UNIT_A, 66.67), U(UNIT_B, 33.33)], fractionBasis: 'mol' });
  addAnalyze('test/mol-66.67-33.34-in-tolerance', UNIT_A, { units: [U(UNIT_A, 66.67), U(UNIT_B, 33.34)], fractionBasis: 'mol' });
  addAnalyze('test/mol-60-30-bad', UNIT_A, { units: [U(UNIT_A, 60), U(UNIT_B, 30)], fractionBasis: 'mol' });
  addAnalyze('test/wt-60-50-bad', UNIT_A, { units: [U(UNIT_A, 60), U(UNIT_B, 50)], fractionBasis: 'wt' });
  addAnalyze('test/negative-fraction', UNIT_A, { units: [U(UNIT_A, 110), U(UNIT_B, -10)] });
  addAnalyze('test/unit-2-not-polymer', UNIT_A, { units: [U(UNIT_A, 50), U('CCO', 50)] });
  addAnalyze('test/wt-70-30', UNIT_A, { units: [U(UNIT_A, 70), U(UNIT_B, 30)], fractionBasis: 'wt' });
  addAnalyze('test/exact-2-to-1', UNIT_A, { units: [U(UNIT_A, 200 / 3), U(UNIT_B, 100 / 3)], fractionBasis: 'mol' });
  addAnalyze('test/single-unit', P_OLD, { units: [U(P_OLD, 100)] });
  addAnalyze('test/single-unit-wt', P_OLD, { units: [U(P_OLD, 100)], fractionBasis: 'wt' });
  addAnalyze('test/homopolymer-no-spec', P_OLD);
  addAnalyze('test/homopolymer-E', E, { mwInput: 4500 });
  addAnalyze('test/end-1-not-an-end', '[*:1]CC[*:2]', { endGroups: { end1: { smiles: 'CCO' } } });
  addAnalyze('test/end-butyl-hydrogen', '[*:1]CC([*:2])c1ccc(O)cc1', { endGroups: { end1: ep('EG04'), end2: ep('EG01') } });
  addAnalyze('test/end-butyl-only', '[*:1]CC([*:2])c1ccc(O)cc1', { endGroups: { end1: ep('EG04') } });
  addAnalyze('test/end-glycidyl-both', '[*:1]CC[*:2]', { mwInput: 6000, pdiInput: 2, endGroups: { end1: ep('EG08'), end2: ep('EG08') } });
  addAnalyze('test/copolymer-with-ends', UNIT_A, { units: [U(UNIT_A, 66.67), U(UNIT_B, 33.33)], endGroups: { end1: ep('EG04'), end2: ep('EG01') } });
  for (const t of BACKBONE_TEMPLATES as { id: string; unitSmiles: string }[]) addAnalyze(`BT/${t.id}`, t.unitSmiles, { mnInput: 3000 });

  // ---- 邊界：比例 0、1、極小；合計在容差兩側 ----
  const fractionPairs: [string, number, number][] = [
    ['zero-first', 0, 100],
    ['one-99', 1, 99],
    ['tiny-1e-12', 1e-12, 99.999999999999],
    ['tiny-1e-300', 1e-300, 100],
    ['sum-100.01', 50, 50.01],
    ['sum-99.99', 50, 49.99],
    ['sum-100.02', 50, 50.02],
    ['tol-upper', 50, 100 + (FRACTION_TOLERANCE + 1e-9) - 50],
    ['tol-upper-up', 50, nextUp(100 + (FRACTION_TOLERANCE + 1e-9) - 50)],
    ['tol-upper-down', 50, nextDown(100 + (FRACTION_TOLERANCE + 1e-9) - 50)],
    ['tol-lower', 50, 100 - (FRACTION_TOLERANCE + 1e-9) - 50],
    ['tol-lower-down', 50, nextDown(100 - (FRACTION_TOLERANCE + 1e-9) - 50)],
    ['non-finite-inf', Infinity, 100],
  ];
  for (const [id, a, b] of fractionPairs) for (const basis of ['mol', 'wt']) addAnalyze(`boundary/${id}/${basis}`, UNIT_A, pair(a, b, basis));

  // ---- .5 捨入（見檔頭） ----
  const ties: [string, number, number][] = [
    ['90+1/128', 45.00390625, 45.00390625],
    ['90+5/128', 45.01953125, 45.01953125],
    ['90+9/128', 45.03515625, 45.03515625],
    ['99+1/128', 49.50390625, 49.50390625],
    ['90+3/128-banker-agrees', 45.01171875, 45.01171875],
  ];
  for (const [id, a, b] of ties) for (const basis of ['mol', 'wt']) addAnalyze(`roundhalf/${id}/${basis}`, UNIT_A, pair(a, b, basis));

  // ---- unitsOf ----
  const unitsCases: [string, unknown][] = [
    ['spec-undefined', undefined],
    ['spec-empty', {}],
    ['units-null', { units: null }],
    ['units-empty', { units: [] }],
    ['units-two', { units: [U(UNIT_A, 60), U(UNIT_B, 40)] }],
  ];
  for (const [id, spec] of unitsCases) {
    const input: Record<string, unknown> = { kind: 'units', canonicalSmiles: E };
    if (spec !== undefined) input.spec = spec;
    cases.push({ id: `units/${id}`, input, output: unitsOf(E, spec as any) });
  }
  addAnalyze('boundary/units-empty-array', E, { units: [] });
  addAnalyze('boundary/units-null', E, { units: null });

  // ---- checkDrawnUnit（tests/polymer/ketcherUnit.test.ts 的情形） ----
  const okAnalysis = analyzeRepeatUnit(RDKit, '*CC*');
  const badAnalysis = analyzeRepeatUnit(RDKit, '*CC');
  const drawn: [string, unknown, unknown, number][] = [
    ['structure-null', null, null, 1],
    ['structure-invalid', { valid: false, canonicalSmiles: '*CC*' }, okAnalysis, 2],
    ['structure-empty', { valid: true, canonicalSmiles: '  ' }, okAnalysis, 1],
    ['no-star', { valid: true, canonicalSmiles: 'CCO' }, okAnalysis, 2],
    ['analysis-null', { valid: true, canonicalSmiles: '*CC*' }, null, 1],
    ['analysis-failed', { valid: true, canonicalSmiles: '*CC' }, badAnalysis, 2],
    ['ok', { valid: true, canonicalSmiles: '*CC*' }, okAnalysis, 1],
  ];
  for (const [id, structure, analysis, unitNumber] of drawn) {
    cases.push({ id: `drawn/${id}`, input: { kind: 'drawn', structure, analysis, unitNumber }, output: checkDrawnUnit(structure as any, analysis as any, unitNumber) });
  }
  console.log(`analyze ${cases.filter((c) => c.id.startsWith('analyze/')).length} 個：${Object.entries(stats).map(([k, v]) => `${k} ${v}`).join('、')}`);
  writeGolden('polymer-copolymer', String(RDKit.version()), cases);
});
