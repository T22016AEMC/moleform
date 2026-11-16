// 黃金資料：src/core/polymer/convert.ts 的 resolvePolymer、parsePolymerSpec、dpFromMn、mnFromDp（任務 M04；浮點運算順序、JS 語意）。
// 只呼叫現有的 TypeScript 函式。案例種類（input.kind）：
//   resolve  resolvePolymer(spec, mUnit, ends)：既有測試（repeatUnit／mwPdi／endGroups／copolymer）的輸入；邊界：PDI = 1、極大、< 1、非有限，Mw 小於端基質量（Mn ≤ M_ends）；
//            `roundhalf/`：訊息 `M_ends = ${Number(mEnds.toFixed(3))}` 的 .5 捨入（58.0625 → JS 的 toFixed 是 58.063，Python 的 format 是 58.062）
//   parse    parsePolymerSpec(value)：既有測試的輸入（擇一、正數、PDI、舊檔、共聚物 units、端基）
//   dpFromMn、mnFromDp  純計算
// 輸入含 NaN／±Infinity 時以 { $nonfinite } 記錄；「沒有這個欄位」就是 undefined。
// 執行：node scripts/golden/export-polymer-convert.ts
import { withVite, writeGolden, type GoldenCase } from './common.ts';
import { attempt } from './polymer-inputs.ts';

await withVite(async (server) => {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { resolvePolymer, parsePolymerSpec, dpFromMn, mnFromDp } = await server.ssrLoadModule('/src/core/polymer/convert.ts');
  const { analyzeRepeatUnit } = await server.ssrLoadModule('/src/core/polymer/repeatUnit.ts');
  const RDKit = await getRDKit();

  const cases: GoldenCase[] = [];
  const stats = { ok: 0, error: 0 };
  const addResolve = (id: string, spec: Record<string, unknown>, mUnit: unknown, ends?: unknown) => {
    const input: Record<string, unknown> = { kind: 'resolve', spec, mUnit };
    if (ends !== undefined) input.ends = ends;
    const result = attempt(() => resolvePolymer(spec as any, mUnit as any, ends as any)) as any;
    if (result.ok) stats.ok++;
    else stats.error++;
    cases.push({ id: `resolve/${id}`, input, output: result });
  };
  const mUnitOf = (smiles: string): number => {
    const a = analyzeRepeatUnit(RDKit, smiles);
    if (!a.ok) throw new Error(a.problem.message);
    return a.mUnit;
  };
  const E_UNIT = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';
  const PHENOL = '[*:1]CC([*:2])c1ccc(O)cc1';
  const mE = mUnitOf(E_UNIT);
  const mPhenol = mUnitOf(PHENOL);
  const ENDS = { mEnds: 58.124, filled: [true, true] };

  // ---- 既有測試 ----
  addResolve('test/mn6000-m300', { mnInput: 6000 }, 300);
  addResolve('test/dp21-m142.15', { dpInput: 21 }, 142.15);
  addResolve('test/mn3000-E', { mnInput: 3000 }, mE);
  addResolve('test/mw6000-pdi1.8-m200', { mwInput: 6000, pdiInput: 1.8 }, 200);
  addResolve('test/mn3000-pdi2.5', { mnInput: 3000, pdiInput: 2.5 }, 200);
  addResolve('test/dp20-pdi1.5', { dpInput: 20, pdiInput: 1.5 }, 200);
  addResolve('test/mw4500-default-pdi', { mwInput: 4500 }, 150);
  addResolve('test/mw5000-pdi1', { mwInput: 5000, pdiInput: 1 }, 100);
  for (const bad of [0.99, 0, -1, Infinity]) addResolve(`test/pdi-${bad}`, { mwInput: 6000, pdiInput: bad }, 200);
  addResolve('test/both-mw-mn', { mwInput: 6000, mnInput: 3000 }, 200);
  addResolve('test/both-mn-dp', { mnInput: 3000, dpInput: 15 }, 200);
  addResolve('test/pdi-only', { pdiInput: 2 }, 200);
  addResolve('test/mw-negative', { mwInput: -5 }, 200);
  addResolve('test/mn-and-dp', { mnInput: 100, dpInput: 2 }, 50);
  addResolve('test/empty-spec', {}, 50);
  addResolve('test/mn-zero', { mnInput: 0 }, 50);
  addResolve('test/dp-negative', { dpInput: -3 }, 50);
  addResolve('test/mn-NaN', { mnInput: Number.NaN }, 50);
  addResolve('test/mn-Infinity', { mnInput: Infinity }, 50);
  addResolve('test/munit-zero', { mnInput: 100 }, 0);
  addResolve('test/Mn50-below-mends', { mnInput: 50 }, mPhenol, ENDS);
  addResolve('test/Mw100-pdi2-below-mends', { mwInput: 100, pdiInput: 2 }, mPhenol, ENDS);
  addResolve('test/phenol-mn3000-ends', { mnInput: 3000 }, mPhenol, ENDS);
  addResolve('test/phenol-dp-back', { dpInput: 24.49 }, mPhenol, ENDS);
  addResolve('test/mw6000-no-ends-info', { mwInput: 6000 }, mPhenol);
  addResolve('test/mw6000-end1-only', { mwInput: 6000 }, mPhenol, { mEnds: 57.116, filled: [true, false] });
  addResolve('test/mw6000-end2-only', { mwInput: 6000 }, mPhenol, { mEnds: 1.008, filled: [false, true] });
  addResolve('test/mw6000-ends-empty', { mwInput: 6000 }, mPhenol, { mEnds: 0, filled: [false, false] });

  // ---- 邊界：PDI 1、極大、剛好小於 1；Mw 小於端基質量；Mn 剛好等於端基質量 ----
  for (const [id, pdi] of [['1+eps', 1.0000000000000002], ['1-eps', 0.9999999999999999], ['1e6', 1e6], ['1e12', 1e12]] as [string, number][]) {
    addResolve(`boundary/pdi-${id}`, { mwInput: 6000, pdiInput: pdi }, 200);
  }
  addResolve('boundary/Mw-below-ends-pdi1', { mwInput: 50, pdiInput: 1 }, mPhenol, ENDS);
  addResolve('boundary/Mn-equal-ends', { mnInput: 58.124 }, mPhenol, ENDS);
  addResolve('boundary/Mn-just-above-ends', { mnInput: 58.12400000000001 }, mPhenol, ENDS);
  addResolve('boundary/Mn-just-below-ends', { mnInput: 58.123999999999995 }, mPhenol, ENDS);
  addResolve('boundary/dp-tiny', { dpInput: 1e-300 }, 200);
  addResolve('boundary/mw-huge', { mwInput: 1e300, pdiInput: 1e10 }, 1e-9);

  // ---- .5 捨入：訊息 M_ends = ${Number(mEnds.toFixed(3))} ----
  for (const m of [0.0625, 0.1875, 58.0625, 1000.0625, 12345.1875, 2.5]) {
    addResolve(`roundhalf/mends-${m}`, { mnInput: m / 2 }, 100, { mEnds: m, filled: [true, true] });
  }

  // ---- parsePolymerSpec：既有測試 ----
  const parseInputs: [string, unknown][] = [
    ['mn6000', { mnInput: 6000 }],
    ['dp21', { dpInput: 21 }],
    ['mw6000-pdi1.8', { mwInput: 6000, pdiInput: 1.8 }],
    ['mw4500-pdi-null', { mwInput: 4500, pdiInput: null }],
    ['mn+dp', { mnInput: 1, dpInput: 2 }],
    ['empty', {}],
    ['mn-negative', { mnInput: -1 }],
    ['string', 'x'],
    ['pdi-0.5', { mwInput: 6000, pdiInput: 0.5 }],
    ['pdi-x', { mwInput: 6000, pdiInput: 'x' }],
    ['pdi-only', { pdiInput: 2 }],
    ['mw+dp', { mwInput: 6000, dpInput: 5 }],
    ['copolymer', { mwInput: 6000, pdiInput: 1.8, units: [{ smiles: '[*:1]CC[*:2]', fraction: 66.67 }, { smiles: '*CC(*)C', fraction: 33.33 }], fractionBasis: 'mol' }],
    ['units-empty', { mwInput: 1, units: [] }],
    ['units-no-star', { mwInput: 1, units: [{ smiles: 'CCO', fraction: 100 }] }],
    ['units-fraction-zero', { mwInput: 1, units: [{ smiles: '*CC*', fraction: 0 }] }],
    ['units-basis-x', { mwInput: 1, units: [{ smiles: '*CC*', fraction: 100 }], fractionBasis: 'x' }],
    ['ends-both', { mnInput: 6000, endGroups: { end1: { smiles: '[*]CCCC', presetId: 'EG04' }, end2: { smiles: '[*]CC(C)O' } } }],
    ['ends-empty', { mnInput: 6000, endGroups: {} }],
    ['ends-end1-empty-smiles', { mnInput: 6000, endGroups: { end1: { smiles: '' } } }],
    ['ends-end2-string', { mnInput: 6000, endGroups: { end2: 'x' } }],
    ['ends-number', { mnInput: 6000, endGroups: 5 }],
  ];
  for (const [id, value] of parseInputs) cases.push({ id: `parse/${id}`, input: { kind: 'parse', value }, output: parsePolymerSpec(value) });

  // ---- 純計算（repeatUnit.test.ts） ----
  cases.push({ id: 'dpFromMn/3000-150', input: { kind: 'dpFromMn', mn: 3000, mUnit: 150 }, output: dpFromMn(3000, 150) });
  cases.push({ id: 'mnFromDp/20-150', input: { kind: 'mnFromDp', dp: 20, mUnit: 150 }, output: mnFromDp(20, 150) });
  cases.push({ id: 'dpFromMn/zero-unit', input: { kind: 'dpFromMn', mn: 3000, mUnit: 0 }, output: dpFromMn(3000, 0) });

  console.log(`resolve ${cases.filter((c) => c.id.startsWith('resolve/')).length} 個：成功 ${stats.ok}、錯誤 ${stats.error}；parse ${parseInputs.length} 個`);
  writeGolden('polymer-convert', String(RDKit.version()), cases);
});
