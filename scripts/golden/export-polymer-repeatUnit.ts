// 黃金資料：src/core/polymer/repeatUnit.ts 的 analyzeRepeatUnit（任務 M04；風險 R2 原子索引與隱式氫數、R7 描述子 amw）。
// 只呼叫現有的 TypeScript 函式。案例種類（input.kind）：
//   analyze  analyzeRepeatUnit(RDKit, smiles) 的完整輸出：成功（mUnit、分子式、連接點順序）與各種錯誤（連接點數量、沒連到原子、直接相連、編號、無法解析）；
//            TS 拋出例外（帶電連接點，RDKit.js 寫 Molfile 失敗）時輸出 { threw: true }
// 輸入：既有測試與驗證檔的單元、骨架範本 BT01–BT06、邊界探針（scripts/golden/polymer-inputs.ts）。
// 執行：node scripts/golden/export-polymer-repeatUnit.ts
import { withVite, writeGolden, type GoldenCase } from './common.ts';
import { BOUNDARY_UNITS, attempt, collectSourceSmiles } from './polymer-inputs.ts';

await withVite(async (server) => {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { analyzeRepeatUnit } = await server.ssrLoadModule('/src/core/polymer/repeatUnit.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const RDKit = await getRDKit();

  const units: { id: string; smiles: string }[] = [];
  const seen = new Set<string>();
  const add = (id: string, smiles: string) => {
    if (seen.has(smiles)) return;
    seen.add(smiles);
    units.push({ id, smiles });
  };
  for (const [id, smiles] of BOUNDARY_UNITS) add(id, smiles);
  for (const t of BACKBONE_TEMPLATES) add(`BT/${t.id}`, t.unitSmiles);
  // tests/polymer/repeatUnit.test.ts 的連接點規則表（沒有 * 的與空白也是既有測試的輸入）
  for (const [id, smiles] of [['test/none', 'CCO'], ['test/blank', '   '], ['test/ring-not-closed', 'C1CC[*:1]']] as [string, string][]) add(id, smiles);
  for (const s of collectSourceSmiles()) add(s.id, s.smiles);

  const cases: GoldenCase[] = [];
  const stats: Record<string, number> = {};
  for (const { id, smiles } of units) {
    const result = attempt(() => analyzeRepeatUnit(RDKit, smiles)) as any;
    cases.push({ id: `analyze/${id}`, input: { kind: 'analyze', smiles }, output: result });
    const key = result.threw ? 'threw' : result.ok ? 'ok' : result.problem.code;
    stats[key] = (stats[key] ?? 0) + 1;
  }
  console.log(`重複單元 ${units.length} 個：${Object.entries(stats).map(([k, v]) => `${k} ${v}`).join('、')}`);
  writeGolden('polymer-repeatUnit', String(RDKit.version()), cases);
});
