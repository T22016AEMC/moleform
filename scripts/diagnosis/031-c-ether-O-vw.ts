// 任務 031 診斷 C（只診斷、不收錄）：Table 4.7（書頁 82–83）、Table 4.8（書頁 84–85）中含醚 O 且附 VW 值的聚合物，
// 看 –O– 取 5.0、5.5 或先前反推的 3.7 哪個能重現書中 VW。不修改 vw_groups.csv（V10 仍留空，M19）。
// 重複單元由書中名稱整理（Table 4.7、4.8 沒畫結構，待使用者審）；Kapton 用 Table 4.8 的名稱「N,N'-(p,p'-oxydiphenylene) pyromellitide」。
// 執行：node scripts/diagnosis/031-c-ether-O-vw.ts（輸出 docs/verification/031-診斷-C-醚O的VW-輸出.md）
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', '031-診斷-C-醚O的VW-輸出.md');

const server = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});

try {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { computeVdwVolume } = await server.ssrLoadModule('/src/core/properties/vanDerWaalsVolume.ts');
  const { VW_GROUPS } = await server.ssrLoadModule('/src/core/data/vwGroups.ts');
  const RDKit = await getRDKit();

  const withO = (v: number) => VW_GROUPS.map((r: any) => (r.id === 'V10' ? { ...r, vw: v } : r));
  interface Case {
    name: string;
    smiles: string;
    book: number;
    where: string;
    kind: string;
  }
  const cases: Case[] = [
    { name: '聚（2,6-二甲基-1,4-伸苯醚）', smiles: '[*:1]Oc1c(C)cc([*:2])cc1C', book: 69.3, where: 'Table 4.7 書頁 83；Table 4.8 書頁 85', kind: '芳香醚' },
    { name: '聚（2,6-二苯基-1,4-伸苯醚）', smiles: '[*:1]Oc1c(-c2ccccc2)cc([*:2])cc1-c1ccccc1', book: 133.7, where: 'Table 4.7 書頁 83；Table 4.8 書頁 85', kind: '芳香醚' },
    { name: 'Kapton（N,N\'-(p,p\'-氧二伸苯) 均苯四甲醯亞胺，聚醯亞胺）', smiles: '[*:1]N1C(=O)c2cc3C(=O)N(C(=O)c3cc2C1=O)c1ccc(Oc2ccc([*:2])cc2)cc1', book: 184.1, where: 'Table 4.8 書頁 85', kind: '芳香醚（聚醯亞胺）' },
    { name: '聚甲醛', smiles: '[*:1]CO[*:2]', book: 13.9, where: 'Table 4.8 書頁 84', kind: '脂肪醚（附帶）' },
    { name: '聚環氧乙烷', smiles: '[*:1]CCO[*:2]', book: 24.2, where: 'Table 4.8 書頁 84', kind: '脂肪醚（附帶）' },
    { name: '聚四亞甲基醚（PTMO）', smiles: '[*:1]CCCCO[*:2]', book: 44.6, where: 'Table 4.8 書頁 84', kind: '脂肪醚（附帶）' },
    { name: '聚乙醛', smiles: '[*:1]C(C)O[*:2]', book: 24.2, where: 'Table 4.8 書頁 84', kind: '脂肪醚（附帶）' },
    { name: '聚環氧丙烷', smiles: '[*:1]CC(C)O[*:2]', book: 34.4, where: 'Table 4.8 書頁 84', kind: '脂肪醚（附帶）' },
    { name: '聚乙烯基甲醚', smiles: '[*:1]CC([*:2])OC', book: 35.7, where: 'Table 4.8 書頁 84', kind: '脂肪醚（附帶）' },
    { name: '聚［2,2-雙（氯甲基）三亞甲基醚］（Penton）', smiles: '[*:1]CC(CCl)(CCl)CO[*:2]', book: 71.2, where: 'Table 4.8 書頁 84', kind: '脂肪醚（附帶）' },
  ];

  const lines: string[] = [];
  const out = (t = '') => lines.push(t);
  const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? '—' : v.toFixed(d));
  out('# 任務 031 診斷 C：醚 O 的 VW 值（5.0／5.5／反推 3.7）');
  out();
  out('只診斷、不收錄；`vw_groups.csv` 的 V10 仍留空（M19）。書中 VW 由 Table 4.7、4.8 頁面圖像讀取；重複單元由名稱整理（待使用者審）。');
  out('「反推 –O–」＝書中 VW − 程式以 –O– = 0 算出的其餘基團總和（只缺 –O– 時才有意義；有其他缺基團者標「—」）。差＝程式 − 書中。');
  out();
  out('| 聚合物 | 類別 | 書中 VW（出處） | 反推 –O– | 差（–O– = 5.0） | 差（–O– = 5.5） | 差（–O– = 3.7） |');
  out('|---|---|---|---|---|---|---|');
  const hit: Record<string, number> = { '5.0': 0, '5.5': 0, '3.7': 0 };
  let n = 0;
  const implied: number[] = [];
  for (const c of cases) {
    const r0: any = computeVdwVolume(RDKit, c.smiles, { rows: withO(0) });
    if (r0.status !== 'ok') {
      out(`| ${c.name} | ${c.kind} | ${c.book}（${c.where}） | — | 程式回報缺基團：${r0.missing.length} 個原子 | | |`);
      continue;
    }
    n++;
    const imp = c.book - r0.vw;
    implied.push(imp);
    const d = (x: number) => (computeVdwVolume(RDKit, c.smiles, { rows: withO(x) }) as any).vw - c.book;
    const d50 = d(5.0);
    const d55 = d(5.5);
    const d37 = d(3.7);
    if (Math.abs(d50) <= 0.1) hit['5.0']++;
    if (Math.abs(d55) <= 0.1) hit['5.5']++;
    if (Math.abs(d37) <= 0.1) hit['3.7']++;
    out(`| ${c.name} | ${c.kind} | ${c.book}（${c.where}） | ${f(imp)} | ${f(d50)} | ${f(d55)} | ${f(d37)} |`);
  }
  out();
  out(`**差 ≤ 0.1 cm³/mol 的筆數（共 ${n} 筆）：–O– = 5.0 → ${hit['5.0']}；5.5 → ${hit['5.5']}；3.7 → ${hit['3.7']}。**`);
  out();
  writeFileSync(OUTPUT, lines.join('\n') + '\n', 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
} finally {
  await server.close();
}
