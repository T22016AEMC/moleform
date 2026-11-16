// 黃金資料：src/core/polymer/distribution.ts 的 twoComponentMasses、twoComponentSpecies（任務 M04；浮點的運算順序、平方根）。
// 只呼叫現有的 TypeScript 函式。案例種類（input.kind）：
//   masses   twoComponentMasses(mw, mn)：M₁、M₂ 與是否退化為單一成分
//   species  twoComponentSpecies(mw, mn, mEnds)：原式、低分子量修正；找不到解時 TS 拋出 Error，輸出 { threw: true, message }
// 輸入：tests/crosslink/layer1/lowMw.test.ts、layer1.test.ts、mwPdi.test.ts 的數字；scripts/verification/phase4.ts／phase5.ts 的分子量；
// 邊界：PDI = 1、Mn 大於 Mw、PDI 極大、M₁ ＝ M_ends 兩側的相鄰雙精度數、Mw 小於端基質量。
// 執行：node scripts/golden/export-polymer-distribution.ts
import { withVite, writeGolden, type GoldenCase } from './common.ts';
import { attempt, nextDown, nextUp } from './polymer-inputs.ts';

await withVite(async (server) => {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { twoComponentMasses, twoComponentSpecies } = await server.ssrLoadModule('/src/core/polymer/distribution.ts');
  const RDKit = await getRDKit();

  const cases: GoldenCase[] = [];
  const stats = { single: 0, plain: 0, lowMw: 0, threw: 0 };
  const addMasses = (id: string, mw: number, mn: number) => {
    cases.push({ id: `masses/${id}`, input: { kind: 'masses', mw, mn }, output: twoComponentMasses(mw, mn) });
  };
  const addSpecies = (id: string, mw: number, mn: number, mEnds: number) => {
    const result = attempt(() => twoComponentSpecies(mw, mn, mEnds)) as any;
    if (result.threw) stats.threw++;
    else if (result.lowMw) stats.lowMw++;
    else if (result.species.length === 1) stats.single++;
    else stats.plain++;
    cases.push({ id: `species/${id}`, input: { kind: 'species', mw, mn, mEnds }, output: result });
  };

  // ---- 既有測試與驗證檔 ----
  addMasses('test/6000-6000over1.8', 6000, 6000 / 1.8);
  addMasses('test/4500-2250', 4500, 2250);
  addMasses('test/pdi1', 5000, 5000);
  addMasses('test/legacy-default-pdi', 12000, 6000);
  addMasses('test/phase5-500-1000', 1000, 500);
  addMasses('test/phase5-3000-6000', 6000, 3000);
  for (const [mw, mn, mEnds] of [[6000, 3333.3, 0], [6000, 3333.3, 200], [1000, 500, 0], [1000, 500, 292.8], [5000, 2000, 100]]) addSpecies(`test/no-correction/${mw}-${mn}-${mEnds}`, mw, mn, mEnds);
  addSpecies('test/pdi1-big-ends', 500, 500, 400);
  for (const [mw, mn, mEnds] of [[1000, 500, 340.41], [1000, 500, 450], [300, 100, 94.11], [2000, 400, 399], [1500, 1000, 700]]) addSpecies(`test/low-mw/${mw}-${mn}-${mEnds}`, mw, mn, mEnds);
  addSpecies('test/phase5-mn3000-mw6000-mends340.41', 6000, 3000, 340.41);
  addSpecies('test/layer1-6000-1.8-ends200', 6000, 6000 / 1.8, 200);

  // ---- 邊界 ----
  addMasses('boundary/pdi1+eps', 1000, 1000 / 1.0000000000000002);
  addMasses('boundary/mn-just-below-mw', 1000, nextDown(1000));
  addMasses('boundary/mn-just-above-mw', 1000, nextUp(1000));
  addMasses('boundary/mn-above-mw', 1000, 2000);
  addMasses('boundary/pdi100', 6000, 60);
  addMasses('boundary/pdi1e6', 6000, 6000 / 1e6);
  for (const [mw, mn] of [[1000, 500], [6000, 3333.3333333333335], [4500, 2250]] as [number, number][]) {
    const m1 = twoComponentMasses(mw, mn).m1;
    addSpecies(`boundary/${mw}-${mn}/ends-equal-m1`, mw, mn, m1);
    addSpecies(`boundary/${mw}-${mn}/ends-up-m1`, mw, mn, nextUp(m1));
    addSpecies(`boundary/${mw}-${mn}/ends-down-m1`, mw, mn, nextDown(m1));
  }
  addSpecies('boundary/mw-below-ends', 100, 50, 200);
  addSpecies('boundary/mn-equal-ends', 1000, 400, 400);
  addSpecies('boundary/ends-above-mn', 1000, 500, 600);
  addSpecies('boundary/mn-just-above-ends', 1000, nextUp(400), 400);
  addSpecies('boundary/pdi-huge-lowmw', 1e6, 100, 99);
  addSpecies('boundary/print-1e21', 1e21, 5e20, 9e20); // 訊息中的數字轉字串

  console.log(`species：原式 ${stats.plain}、單一成分 ${stats.single}、低分子量修正 ${stats.lowMw}、拋出 ${stats.threw}；總案例 ${cases.length}`);
  writeGolden('polymer-distribution', String(RDKit.version()), cases);
});
