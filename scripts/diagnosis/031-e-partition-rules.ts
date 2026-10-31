// 任務 031 後續診斷：重疊組合基團的三種切分規則（greedy 最大組合優先、fewest 基團總數最少、fromEnd 由連接點起算）
// 對書中有 Tg 計算值的聚合物各重現幾筆（差 ≤ 1 K；ULTEM 比 ΣYg = 285）。單元由書中名稱整理（待使用者審）。
// 執行：node scripts/diagnosis/031-e-partition-rules.ts（輸出 docs/verification/031-診斷-E-重疊切分規則-輸出.md）
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', '031-診斷-E-重疊切分規則-輸出.md');
const server = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true } });
try {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { computeTg } = await server.ssrLoadModule('/src/core/properties/tgGroupContribution.ts');
  const { BOOK_CASES } = await server.ssrLoadModule('/tests/properties/bookCases.ts');
  const RDKit = await getRDKit();
  interface C { name: string; smiles: string; book: number; ygOnly?: boolean }
  const cases: C[] = [
    ...BOOK_CASES.map((c: any) => ({ name: c.name, smiles: c.smiles, book: c.book })),
    { name: 'PEEK（Table 6.4 的 417；Example 6.3 寫法）', smiles: '*Oc1ccc(Oc2ccc(C(=O)c3ccc(*)cc3)cc2)cc1', book: 417 },
    { name: 'PEEK（Example 6.3 的 421；由環起寫）', smiles: '*c1ccc(Oc2ccc(Oc3ccc(C(=O)*)cc3)cc2)cc1', book: 421 },
    { name: 'PEEK（Table 6.4 的 417；由環起寫）', smiles: '*c1ccc(Oc2ccc(Oc3ccc(C(=O)*)cc3)cc2)cc1', book: 417 },
    { name: 'ULTEM（Example 6.4，比 ΣYg 285）', smiles: '[*:1]N1C(=O)c2ccc(Oc3ccc(cc3)C(C)(C)c3ccc(Oc4ccc5C(=O)N([*:2])C(=O)c5c4)cc3)cc2C1=O', book: 285, ygOnly: true },
    { name: '聚己二酸乙二酯', smiles: '[*:1]CCOC(=O)CCCCC(=O)O[*:2]', book: 228 },
    { name: '聚對苯二甲酸乙二酯 PET', smiles: '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]', book: 361 },
    { name: '聚對苯二甲酸十亞甲基酯', smiles: '[*:1]CCCCCCCCCCOC(=O)c1ccc(cc1)C(=O)O[*:2]', book: 299 },
    { name: '聚間苯二甲酸間伸苯酯', smiles: '[*:1]c1cccc(c1)OC(=O)c1cccc(c1)C(=O)O[*:2]', book: 392 },
    { name: '聚對苯二甲酸七亞甲基醯胺', smiles: '[*:1]CCCCCCCNC(=O)c1ccc(cc1)C(=O)N[*:2]', book: 435 },
    { name: '聚（對伸苯基二伸乙基癸二醯胺）', smiles: '[*:1]CCc1ccc(cc1)CCNC(=O)CCCCCCCCC(=O)N[*:2]', book: 373 },
    { name: '聚（伸苯基二亞甲基六亞甲基二胺基甲酸酯）', smiles: '[*:1]Cc1ccc(cc1)COC(=O)NCCCCCCNC(=O)O[*:2]', book: 338 },
    { name: '聚（4,4\'-亞甲基二伸苯碳酸酯）', smiles: '[*:1]c1ccc(cc1)Cc1ccc(cc1)OC(=O)O[*:2]', book: 368 },
    { name: '聚（4,4\'-異亞丙基二伸苯碳酸酯）', smiles: '[*:1]c1ccc(cc1)C(C)(C)c1ccc(cc1)OC(=O)O[*:2]', book: 412 },
    { name: '聚（4,4\'-四亞甲基二苯甲酸酐）', smiles: '[*:1]c1ccc(cc1)CCCCc1ccc(cc1)C(=O)OC(=O)[*:2]', book: 322 },
    { name: '聚（4,4\'-亞甲基二氧二苯甲酸酐）', smiles: '[*:1]c1ccc(cc1)OCOc1ccc(cc1)C(=O)OC(=O)[*:2]', book: 336 },
  ];
  const rules = ['greedy', 'fewest', 'fromEnd'] as const;
  const sig = (r: any) => (r.status === 'ok' ? r.groups.map((g: any) => g.rowId).sort().join(',') : r.status);
  const lines: string[] = [];
  const out = (t = '') => lines.push(t);
  const fx = (v: number) => v.toFixed(1);
  out('# 任務 031 後續診斷 E：重疊組合基團的三種切分規則');
  out();
  out('greedy＝最大組合優先（現行）；fewest＝基團總數最少（同數取大基團先配者）；fromEnd＝由第一個連接點起依距離配最大基團。重現＝與書中計算值差 ≤ 1 K（ULTEM 比 ΣYg）。**「規則有差別」＝三種規則配出的基團集合不全相同。**');
  out();
  out('| 聚合物 | 書中 | greedy | fewest | fromEnd | 規則有差別 |');
  out('|---|---|---|---|---|---|');
  const tally: Record<string, { all: number; diff: number; diffHit: number; hit: number }> = {};
  for (const r of rules) tally[r] = { all: 0, diff: 0, diffHit: 0, hit: 0 };
  for (const c of cases) {
    const res = rules.map((r) => computeTg(RDKit, c.smiles, { partition: r }));
    const differ = new Set(res.map(sig)).size > 1;
    const cells = res.map((r: any, i) => {
      if (r.status !== 'ok') return r.status;
      const val = c.ygOnly ? r.sumYg : r.tgK;
      const hit = Math.abs(val - c.book) <= (c.ygOnly ? 0.05 : 1);
      tally[rules[i]].all++;
      if (hit) tally[rules[i]].hit++;
      if (differ) {
        tally[rules[i]].diff++;
        if (hit) tally[rules[i]].diffHit++;
      }
      return `${fx(val)}${hit ? ' ✓' : ''}`;
    });
    out(`| ${c.name} | ${c.book} | ${cells.join(' | ')} | ${differ ? '**是**' : '否'} |`);
  }
  out();
  out('| 規則 | 全部重現 | 規則有差別的列數 | 其中重現 |');
  out('|---|---|---|---|');
  for (const r of rules) out(`| ${r} | ${tally[r].hit}／${tally[r].all} | ${tally[r].diff} | ${tally[r].diffHit} |`);
  out();
  writeFileSync(OUTPUT, lines.join('\n') + '\n', 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
} finally {
  await server.close();
}
