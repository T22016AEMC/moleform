// Phase 6 Tb、Tf（Joback 基團加成）輸出的產生腳本（任務 027）。
// 對 Phase 2–4 的測試資料與任務單列出的小分子（單體、固化劑、溶劑、SBI、環氧氯丙烷等）切基團、算 Tb 與 Tf；聚合物重複單元列為「不適用」。只列程式輸出，不判斷化學（D17）。
// 執行：npm run verify:phase6-tbtf（Node 直接執行 .ts，只用可抹除的型別語法）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', 'phase6-TbTf-輸出.md');

// ---------- 結構清單（出處：phase2.mjs 的 8 個分子、phase3.ts 的成分、docs/verification/phase4-測試體系.md；環氧氯丙烷依任務 027 指定） ----------
const BADGE = 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1';
const BPA = 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1';
const TPP = 'c1ccc(P(c2ccccc2)c2ccccc2)cc1';
const MEK = 'CCC(C)=O';
const PGMEA = 'COCC(C)OC(C)=O';
const SBI = 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2';
const SMALL: { name: string; smiles: string; role: string; from: string }[] = [
  { name: 'BADGE', smiles: BADGE, role: '環氧樹脂', from: 'Phase 2、3' },
  { name: '雙酚 A', smiles: BPA, role: '固化劑（酚）', from: 'Phase 2、3' },
  { name: '三苯基膦', smiles: TPP, role: '催化劑', from: 'Phase 3' },
  { name: '甲基乙基酮（MEK）', smiles: MEK, role: '溶劑', from: 'Phase 3' },
  { name: '丙二醇甲醚醋酸酯（PGMEA）', smiles: PGMEA, role: '溶劑', from: 'Phase 3、4（成分 L）' },
  { name: 'SBI 雙酚（螺雙茚滿二醇）', smiles: SBI, role: '單體', from: 'Phase 4（成分 S）' },
  { name: '環氧氯丙烷', smiles: 'ClCC1CO1', role: '單體（任務 027 指定）', from: '任務 027（現有測試資料沒有）' },
  { name: '乙醇', smiles: 'CCO', role: '一般小分子', from: 'Phase 2' },
  { name: '環氧丙烷', smiles: 'CC1CO1', role: '單體', from: 'Phase 2' },
  { name: '苯酚', smiles: 'Oc1ccccc1', role: '單體', from: 'Phase 2' },
  { name: 'L-丙胺酸', smiles: 'C[C@@H](C(=O)O)N', role: '一般小分子', from: 'Phase 2' },
  { name: '反式 2-丁烯', smiles: 'C/C=C/C', role: '一般小分子（Joback 分不出順反異構）', from: 'Phase 2' },
  { name: '三氟化硼（BF₃）', smiles: 'FB(F)F', role: '催化劑', from: 'Phase 2' },
];
const UNITS: { name: string; smiles: string; from: string }[] = [
  { name: 'P 單元 A（雙酚茀）', smiles: '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O', from: 'Phase 4（成分 P）' },
  { name: 'P 單元 B（萘基次甲基）', smiles: '[*:1]C([*:2])c1ccc2ccccc2c1', from: 'Phase 4（成分 P）' },
  { name: 'E PGMA 型環氧單元', smiles: '[*:1]CC([*:2])(C)C(=O)OCC1CO1', from: 'Phase 4（成分 E）' },
];

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
  const mod = await server.ssrLoadModule('/src/core/properties/jobackTbTf.ts');
  const { computeJoback, countJobackGroups, JOBACK_PAPER_LIMITS, JOBACK_DISCLAIMER, JOBACK_MODEL } = mod;
  const { JOBACK_GROUPS } = await server.ssrLoadModule('/src/core/data/jobackGroups.ts');
  const RDKit = await getRDKit();

  const lines: string[] = [];
  const out = (text = '') => lines.push(text);
  const fx = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
  const cell = (text: string) => text.replace(/\|/g, '\\|');
  const describe = (groups: any[]): string =>
    countJobackGroups(groups)
      .map((e: any) => `${e.name} ×${e.count}（Tb ${e.tbi}／Tf ${e.tfi === null ? '—' : e.tfi}）`)
      .join('；');

  out('# Phase 6 Tb、Tf 輸出（Joback 基團加成）');
  out();
  out(`**${JOBACK_DISCLAIMER}**`);
  out();
  out('以下為程式輸出，未經化學判斷（D17）。');
  out();
  out(`- 結構處理：RDKit ${RDKit.version()}；基團表 \`src/data/joback_groups.csv\`（${JOBACK_GROUPS.length} 列，稽核狀態皆為「待使用者審」）`);
  out(`- 模型：${JOBACK_MODEL}。可信度：理論估算（基團貢獻法）。`);
  out('- 本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。');
  out('- 切分規則：基團依「基團原子數由大到小」配對，同大小依表 III 順序；每個重原子恰好屬於一個基團；配不到的原子回報「缺基團」，不用相近基團代用。表 III 的 –N=（非環）沒有 Tf 貢獻值，含此基團的分子只算 Tb。');
  out('- 含連接點（`*`）的聚合物重複單元不適用（見第 2 節）。');
  out('- 重新產生：`npm run verify:phase6-tbtf`。');
  out();
  out('## 論文的適用限制與誤差（Joback & Reid 1987，照原文整理）');
  out();
  for (const l of JOBACK_PAPER_LIMITS) {
    out(`- **${l.page}**：${l.summary}`);
    out(`  - 原文：${l.quote.replace(/\n/g, ' ')}`);
  }
  out();

  out('## 1. 小分子');
  out();
  out('| 名稱 | 用途 | 出處 | SMILES | 切出的基團（Tbi／Tfi，K） | Tb（K） | Tb（°C） | Tf（K） | Tf（°C） | 缺基團 |');
  out('|---|---|---|---|---|---|---|---|---|---|');
  const missingNames: string[] = [];
  const noTf: string[] = [];
  for (const s of SMALL) {
    const r = computeJoback(RDKit, s.smiles);
    const head = `| ${cell(s.name)} | ${cell(s.role)} | ${cell(s.from)} | \`${cell(s.smiles)}\``;
    if (r.status === 'ok') {
      if (r.tfK === null) noTf.push(s.name);
      const tf = r.tfK === null ? `—（${r.tfUnavailable.join('、')} 在表 III 沒有 Tf 值）` : fx(r.tfK, 2);
      out(`${head} | ${cell(describe(r.groups))} | ${fx(r.tbK, 2)} | ${fx(r.tbC, 2)} | ${tf} | ${fx(r.tfC, 2)} | — |`);
    } else if (r.status === 'missing') {
      const miss = r.missing.map((m: any) => `原子 ${m.index}：${m.description}`).join('；');
      out(`${head} | ${cell(describe(r.groups) || '（無）')} | — | — | — | — | **缺基團**：${cell(miss)} |`);
      missingNames.push(s.name);
    } else {
      out(`${head} | — | — | — | — | — | ${r.status === 'invalid' ? `無法計算：${r.message}` : r.reason} |`);
    }
  }
  out();
  out(`缺基團的分子（${missingNames.length} 個）不計算：${missingNames.join('、') || '（無）'}。`);
  if (noTf.length > 0) out(`只算出 Tb、Tf 沒有貢獻值的分子：${noTf.join('、')}。`);
  out();

  out('## 2. 聚合物重複單元（不適用）');
  out();
  out('Joback 法只用於小分子；含連接點（`*`）的結構直接回傳「不適用（聚合物單元）」，不計算。');
  out();
  out('| 名稱 | 出處 | SMILES | 結果 |');
  out('|---|---|---|---|');
  for (const u of UNITS) {
    const r = computeJoback(RDKit, u.smiles);
    out(`| ${cell(u.name)} | ${cell(u.from)} | \`${cell(u.smiles)}\` | ${r.status === 'not-applicable' ? r.reason : `（非預期：${r.status}）`} |`);
  }
  out();

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
} finally {
  await server.close();
}
