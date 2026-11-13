// 黃金資料：src/core/properties/atomicWeights.ts（任務 M00）。
// 案例：整張 ATOMIC_WEIGHTS 表，以及 atomicWeight(z) 對 z = -1…120 與非整數輸入的回傳值（表外回傳 null）。
// 執行：node scripts/golden/export-atomicWeights.ts
import { rdkitjsVersion, withVite, writeGolden, type GoldenCase } from './common.ts';

await withVite(async (server) => {
  const { ATOMIC_WEIGHTS, atomicWeight } = await server.ssrLoadModule('/src/core/properties/atomicWeights.ts');
  const cases: GoldenCase[] = [{ id: 'table', input: {}, output: ATOMIC_WEIGHTS }];
  const inputs: number[] = [];
  for (let z = -1; z <= 120; z++) inputs.push(z);
  inputs.push(1.5, 6.000000001);
  for (const z of inputs) cases.push({ id: `atomicWeight(${z})`, input: { z }, output: atomicWeight(z) });
  writeGolden('atomicWeights', await rdkitjsVersion(server), cases);
});
