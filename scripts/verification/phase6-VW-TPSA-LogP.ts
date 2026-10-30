// Phase 6 van der Waals 體積、TPSA、Crippen LogP 輸出的產生腳本（任務 028）。
// 對 Phase 2–4 的測試資料與任務單列出的小分子、聚合物重複單元、環氧單元、骨架範本 BT01–BT06 單元，各輸出一列：名稱、SMILES、VW（或缺基團）、TPSA、LogP。
// 聚合物單元的 TPSA、LogP 寫「不適用」。只列程式輸出，不判斷化學（D17）；分子量、ΣMi 只列在驗證文件中，網站不顯示（D09）。
// 執行：npm run verify:phase6-vw-tpsa-logp（Node 直接執行 .ts，只用可抹除的型別語法）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', 'phase6-VW-TPSA-LogP-輸出.md');

// ---------- 結構清單（出處：phase2.mjs 的 8 個分子、phase3.ts 的成分、docs/verification/phase4-測試體系.md；環氧氯丙烷依任務 027 指定；與 phase6-TbTf 腳本相同） ----------
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
  { name: '反式 2-丁烯', smiles: 'C/C=C/C', role: '一般小分子', from: 'Phase 2' },
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
  const vwMod = await server.ssrLoadModule('/src/core/properties/vanDerWaalsVolume.ts');
  const tlMod = await server.ssrLoadModule('/src/core/properties/tpsaLogp.ts');
  const { computeVdwVolume, countVwGroups, VW_MODEL, VW_DISCLAIMER } = vwMod;
  const { computeTpsaLogp, TPSA_MODEL, LOGP_MODEL, TPSA_LOGP_DISCLAIMER } = tlMod;
  const { VW_GROUPS } = await server.ssrLoadModule('/src/core/data/vwGroups.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const RDKit = await getRDKit();

  const lines: string[] = [];
  const out = (text = '') => lines.push(text);
  const fx = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
  const cell = (text: string) => text.replace(/\|/g, '\\|');
  const describe = (groups: any[]): string =>
    countVwGroups(groups)
      .map((e: any) => `${e.name} ×${e.count}（${e.vw}）`)
      .join('；');
  const missingText = (r: any): string =>
    r.missing
      .map((m: any) => `原子 ${m.index}：${m.description}${m.reason ? `（${m.reason}）` : ''}`)
      .join('；');

  out('# Phase 6 VW、TPSA、Crippen LogP 輸出');
  out();
  out(`**${VW_DISCLAIMER}${TPSA_LOGP_DISCLAIMER}**`);
  out();
  out('以下為程式輸出，未經化學判斷（D17）；ΣMi 與單元質量只列在本文件供核對，網站上不顯示（D09）。');
  out();
  out(`- 結構處理：RDKit ${RDKit.version()}`);
  out(`- **VW**：${VW_MODEL}。基團表 \`src/data/vw_groups.csv\`（${VW_GROUPS.length} 列，稽核狀態皆為「待使用者審」）。可信度：理論估算（基團貢獻法）。單位 cm³/mol（每分子或每結構單元）。`);
  out(`- **TPSA**：${TPSA_MODEL}。單位 Å²。可信度：理論估算。`);
  out(`- **Crippen LogP**：${LOGP_MODEL}。無單位。可信度：理論估算。`);
  out('- 本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。');
  out('- VW 切分規則：基團依「基團原子數由大到小」配對，同大小依資料表順序；每個重原子恰好屬於一個基團；配不到的原子回報「缺基團」，不用相近基團或記憶中的數值代用。Table 4.2 的 –O– 書中印兩個括號值（5.5）、（5.0）而沒有標示條件，依使用者指示 VW 留空，含醚結構列為缺基團。');
  out('- TPSA 與 Crippen LogP 只對小分子計算；含連接點（`*`）的聚合物重複單元列為「不適用（聚合物單元）」，不自行補封端原子。RDKit 的 TPSA 只計 N、O 片段（不含 S、P）。');
  out('- 「ΔM」= ΣMi − 分子（重複單元）的精確質量；容許值為各基團 Mi 捨入容許的加總，超過者標「超出」。');
  out('- 重新產生：`npm run verify:phase6-vw-tpsa-logp`。');
  out();

  const rows: { name: string; smiles: string; kind: string; extra: string }[] = [
    ...SMALL.map((s) => ({ name: s.name, smiles: s.smiles, kind: '小分子', extra: `${s.role}；${s.from}` })),
    ...UNITS.map((u) => ({ name: u.name, smiles: u.smiles, kind: '聚合物重複單元', extra: u.from })),
    ...BACKBONE_TEMPLATES.map((t: any) => ({ name: `${t.id} ${t.名稱 ?? t.name}`, smiles: t.unitSmiles, kind: '骨架範本單元', extra: '骨架範本（任務 023）' })),
  ];

  out('## 1. 全部結構');
  out();
  out('| 名稱 | 類型 | 出處 | SMILES | VW（cm³/mol） | TPSA（Å²） | Crippen LogP |');
  out('|---|---|---|---|---|---|---|');
  const missingNames: string[] = [];
  for (const s of rows) {
    const vw = computeVdwVolume(RDKit, s.smiles);
    const tl = computeTpsaLogp(RDKit, s.smiles);
    const vwText = vw.status === 'ok' ? fx(vw.vw, 2) : vw.status === 'missing' ? '缺基團（見第 2 節）' : `無法計算：${vw.message}`;
    if (vw.status === 'missing') missingNames.push(s.name);
    const tpsaText = tl.status === 'ok' ? fx(tl.tpsa, 2) : tl.status === 'not-applicable' ? '不適用（聚合物單元）' : `無法計算：${tl.message}`;
    const logpText = tl.status === 'ok' ? fx(tl.logP, 4) : tl.status === 'not-applicable' ? '不適用（聚合物單元）' : `無法計算：${tl.message}`;
    out(`| ${cell(s.name)} | ${s.kind} | ${cell(s.extra)} | \`${cell(s.smiles)}\` | ${vwText} | ${tpsaText} | ${logpText} |`);
  }
  out();
  out(`VW 缺基團的結構（${missingNames.length} 個）不計算 VW：${missingNames.join('、') || '（無）'}。`);
  out();

  out('## 2. VW 的基團切分');
  out();
  out('| 名稱 | 切出的基團（VW，cm³/mol） | ΣVW | ΣMi（g/mol） | 單元質量（g/mol） | ΔM | 缺基團（原子位置、原因） |');
  out('|---|---|---|---|---|---|---|');
  for (const s of rows) {
    const r = computeVdwVolume(RDKit, s.smiles);
    if (r.status === 'ok') {
      const flag = r.massWithinTolerance === false ? '（超出）' : '';
      out(`| ${cell(s.name)} | ${cell(describe(r.groups))} | ${fx(r.vw, 2)} | ${fx(r.sumMi, 2)} | ${fx(r.formulaMass, 3)} | ${fx(r.massDelta, 3)}${flag} | — |`);
    } else if (r.status === 'missing') {
      out(`| ${cell(s.name)} | ${cell(describe(r.groups) || '（無）')} | — | — | — | — | **缺基團**：${cell(missingText(r))} |`);
    } else {
      out(`| ${cell(s.name)} | — | — | — | — | — | 無法計算：${r.message} |`);
    }
  }
  out();

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
} finally {
  await server.close();
}
