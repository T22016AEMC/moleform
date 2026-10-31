// Phase 6 聚合物莫耳體積與密度輸出的產生腳本（任務 029）。
// 對 Phase 2–4 的測試資料與任務單列出的小分子、聚合物重複單元、環氧單元、骨架範本 BT01–BT06 單元，各輸出一列：名稱、SMILES、莫耳體積、密度。
// 聚合物：玻璃態／橡膠態／結晶（298 K 狀態依 Tg 判斷，Tg 算不出來標「狀態未定」）；小分子：液體法（Fedors 1974）尚未實作。
// 只列程式輸出，不判斷化學（D17）；單元質量只列在驗證文件中，網站不顯示（D09）。
// 執行：npm run verify:phase6-vm（Node 直接執行 .ts，只用可抹除的型別語法）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', 'phase6-Vm-密度-輸出.md');

// ---------- 結構清單（與 phase6-VW-TPSA-LogP 腳本相同） ----------
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
// 驗證用聚合物（書中 Table 4.6–4.8 的聚合物；單元寫法由書中名稱整理）
const VALIDATION: { name: string; smiles: string }[] = [
  { name: '聚乙烯', smiles: '[*:1]CC[*:2]' },
  { name: '聚丙烯', smiles: '[*:1]CC([*:2])C' },
  { name: '聚苯乙烯', smiles: '[*:1]CC([*:2])c1ccccc1' },
  { name: '聚氯乙烯', smiles: '[*:1]CC(Cl)[*:2]' },
  { name: '聚（乙烯基環己烷）', smiles: '[*:1]CC([*:2])C1CCCCC1' },
  { name: '聚甲基丙烯酸甲酯（PMMA）', smiles: '[*:1]CC([*:2])(C)C(=O)OC' },
  { name: '聚對苯二甲酸乙二酯（PET，Example 4.1）', smiles: '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]' },
  { name: '聚間苯二甲酸乙二酯', smiles: '[*:1]CCOC(=O)c1cccc(c1)C(=O)O[*:2]' },
  { name: '尼龍 6', smiles: '[*:1]C(=O)NCCCCC[*:2]' },
  { name: '尼龍 6,6', smiles: '[*:1]NC(=O)CCCCC(=O)NCCCCCC[*:2]' },
  { name: '雙酚 A 聚碳酸酯', smiles: '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]' },
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
  const mod = await server.ssrLoadModule('/src/core/properties/molarVolumeDensity.ts');
  const { computeMolarVolumeDensity, countMolarVolumeGroups, MOLAR_VOLUME_MODEL, MOLAR_VOLUME_DISCLAIMER } = mod;
  const { MOLAR_VOLUME_GROUPS } = await server.ssrLoadModule('/src/core/data/molarVolumeGroups.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const RDKit = await getRDKit();

  const lines: string[] = [];
  const out = (text = '') => lines.push(text);
  const fx = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
  const cell = (text: string) => text.replace(/\|/g, '\\|');
  const describe = (groups: any[]): string =>
    countMolarVolumeGroups(groups)
      .map((e: any) => `${e.name} ×${e.count}（Va ${e.va}／Vc ${e.vc}${e.tentative ? '，括號值' : ''}）`)
      .join('；');
  const missingText = (r: any): string =>
    r.missing
      .map((m: any) => `原子 ${m.index}：${m.description}${m.reason ? `（${m.reason}）` : ''}`)
      .join('；');
  const STATE_LABEL: Record<string, string> = { glassy: '玻璃態', rubbery: '橡膠態', undetermined: '狀態未定' };
  const vd = (v: any) => (v ? `${fx(v.vm, 2)} cm³/mol；${fx(v.density, 3)} g/cm³` : '—');

  out('# Phase 6 聚合物莫耳體積與密度輸出');
  out();
  out(`**${MOLAR_VOLUME_DISCLAIMER}**`);
  out();
  out('以下為程式輸出，未經化學判斷（D17）；單元質量只列在本文件供核對，網站上不顯示（D09）。');
  out();
  out(`- 結構處理：RDKit ${RDKit.version()}`);
  out(`- **方法**：${MOLAR_VOLUME_MODEL}。基團表 \`src/data/molar_volume_polymer_groups.csv\`（${MOLAR_VOLUME_GROUPS.length} 列，稽核狀態皆為「待使用者審」）。可信度：理論估算（基團貢獻法）。`);
  out('- **Va、Vc**：Table 4.10 的 Va,i(298) 是非晶態增量，Vc,i(298) 是結晶態增量。依書中式 (4.8a)、(4.8b)，玻璃態與橡膠態的莫耳體積相同（都用 Va），所以兩種狀態的數值相同，只差標籤；Example 4.1 中標「Vg(298)」的欄就是 Va。');
  out('- **298 K 的狀態**：Tg（任務 026）低於 25 °C 為橡膠態，高於 25 °C 為玻璃態（書頁 79、80）；Tg 算不出來（缺基團）就不判斷，標「狀態未定」，玻璃態與橡膠態兩種結果都輸出。');
  out('- **括號值**：Table 4.10 中印於括號內的數值（–O– al./ar.、–CONH–）照數值收錄，書中標為暫定；用到時標「括號值」。');
  out('- **缺基團**：切分規則與 VW 相同（原子數由大到小配對；每個重原子恰好屬於一個基團）；配不到的原子回報「缺基團」，不用相近基團或記憶中的數值代用。');
  out('- **小分子**：液體莫耳體積（Table 4.5 沒有推薦欄）改用 Fedors 1974，由使用者決定另開任務（與 8.3 溶解度參數合併），本任務未實作，標「液體法未實作」。');
  out('- 本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。');
  out('- 重新產生：`npm run verify:phase6-vm`。');
  out();

  const rows: { name: string; smiles: string; kind: string; extra: string }[] = [
    ...SMALL.map((s) => ({ name: s.name, smiles: s.smiles, kind: '小分子', extra: `${s.role}；${s.from}` })),
    ...UNITS.map((u) => ({ name: u.name, smiles: u.smiles, kind: '聚合物重複單元', extra: u.from })),
    ...BACKBONE_TEMPLATES.map((t: any) => ({ name: `${t.id} ${t.名稱 ?? t.name}`, smiles: t.unitSmiles, kind: '骨架範本單元', extra: '骨架範本（任務 023）' })),
  ];

  out('## 1. 全部結構');
  out();
  out('| 名稱 | 類型 | 出處 | SMILES | 298 K 狀態 | 玻璃態 | 橡膠態 | 結晶 |');
  out('|---|---|---|---|---|---|---|---|');
  const missingNames: string[] = [];
  for (const s of rows) {
    const r = computeMolarVolumeDensity(RDKit, s.smiles);
    const head = `| ${cell(s.name)} | ${s.kind} | ${cell(s.extra)} | \`${cell(s.smiles)}\``;
    if (r.status === 'ok') {
      const mark = r.usesTentative ? '（含括號值）' : '';
      out(`${head} | ${STATE_LABEL[r.state.state]} | ${vd(r.glassy)}${mark} | ${vd(r.rubbery)}${mark} | ${vd(r.crystalline)}${mark} |`);
    } else if (r.status === 'missing') {
      missingNames.push(s.name);
      out(`${head} | — | 缺基團（見第 2 節） | 缺基團 | 缺基團 |`);
    } else if (r.status === 'unsupported') {
      out(`${head} | — | 液體法未實作 | 液體法未實作 | — |`);
    } else out(`${head} | — | 無法計算：${r.message} | — | — |`);
  }
  out();
  out(`聚合物缺基團的結構（${missingNames.length} 個）不計算：${missingNames.join('、') || '（無）'}。每格為「莫耳體積；密度」。`);
  out();

  out('## 2. 聚合物的基團切分與缺基團');
  out();
  out('| 名稱 | 切出的基團（Va／Vc，cm³/mol） | 單元質量（g/mol） | 缺基團（原子位置、原因） |');
  out('|---|---|---|---|');
  for (const s of rows.filter((x) => x.kind !== '小分子')) {
    const r = computeMolarVolumeDensity(RDKit, s.smiles);
    if (r.status === 'ok') out(`| ${cell(s.name)} | ${cell(describe(r.groups))} | ${fx(r.unitMass, 3)} | — |`);
    else if (r.status === 'missing') out(`| ${cell(s.name)} | ${cell(describe(r.groups) || '（無）')} | — | **缺基團**：${cell(missingText(r))} |`);
    else out(`| ${cell(s.name)} | — | — | 無法計算：${r.status === 'invalid' ? r.message : r.status} |`);
  }
  out();

  out('## 3. 驗證用聚合物（書中 Table 4.6–4.8 的聚合物；程式與 Table 4.10 手算一致，見測試）');
  out();
  out('| 名稱 | SMILES | 298 K 狀態（依據） | Va 加總 | 密度（Va） | Vc 加總 | 密度（Vc） | 單元質量 |');
  out('|---|---|---|---|---|---|---|---|');
  for (const v of VALIDATION) {
    const r = computeMolarVolumeDensity(RDKit, v.smiles);
    if (r.status === 'ok') {
      const mark = r.usesTentative ? ' †' : '';
      out(`| ${cell(v.name)} | \`${cell(v.smiles)}\` | ${STATE_LABEL[r.state.state]}（${cell(r.state.basis)}） | ${fx(r.amorphous?.vm)}${mark} | ${fx(r.amorphous?.density, 3)}${mark} | ${fx(r.crystalline?.vm)}${mark} | ${fx(r.crystalline?.density, 3)}${mark} | ${fx(r.unitMass, 2)} |`);
    } else out(`| ${cell(v.name)} | \`${cell(v.smiles)}\` | — | 無法計算 | — | — | — | — |`);
  }
  out();
  out('† ＝ 用到書中印於括號內（標為暫定）的數值。');
  out();

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
} finally {
  await server.close();
}
