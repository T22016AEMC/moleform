// Phase 6 Tg（van Krevelen 基團加成）輸出的產生腳本（任務 026）。
// 對測試成分與骨架範本的每個結構切基團、算 Tg；再列出與書中計算值的對照。只列程式輸出，不判斷化學（D17）。
// 分子量只列在這個驗證文件中，網站上不顯示（D09）。
// 執行：npm run verify:phase6-tg（Node 直接執行 .ts，只用可抹除的型別語法）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', 'phase6-Tg-輸出.md');

// ---------- B-1 結構清單（測試成分見 docs/verification/phase4-測試體系.md、phase3 腳本） ----------
const UNIT_A = '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O';
const UNIT_B = '[*:1]C([*:2])c1ccc2ccccc2c1';
const STRUCTURES: { name: string; smiles: string; kind: string }[] = [
  { name: 'P 單元 A（雙酚茀）', smiles: UNIT_A, kind: '重複單元' },
  { name: 'P 單元 B（萘基次甲基）', smiles: UNIT_B, kind: '重複單元' },
  { name: 'E PGMA 型環氧', smiles: '[*:1]CC([*:2])(C)C(=O)OCC1CO1', kind: '重複單元' },
  { name: 'S SBI 雙酚（螺雙茚滿二醇）', smiles: 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2', kind: '小分子' },
  { name: 'L／PGMEA', smiles: 'COCC(C)OC(C)=O', kind: '小分子' },
  { name: 'MEK', smiles: 'CCC(C)=O', kind: '小分子' },
  { name: 'BADGE', smiles: 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1', kind: '小分子' },
  { name: '雙酚 A', smiles: 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1', kind: '小分子' },
  { name: '三苯基膦', smiles: 'c1ccc(P(c2ccccc2)c2ccccc2)cc1', kind: '小分子' },
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
  const { computeTg } = await server.ssrLoadModule('/src/core/properties/tgGroupContribution.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const { YG_GROUPS } = await server.ssrLoadModule('/src/core/data/ygGroups.ts');
  const { BOOK_CASES } = await server.ssrLoadModule('/tests/properties/bookCases.ts');
  const RDKit = await getRDKit();

  const lines: string[] = [];
  const out = (text = '') => lines.push(text);
  const fx = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
  const cell = (text: string) => text.replace(/\|/g, '\\|');

  const all = [
    ...STRUCTURES,
    ...BACKBONE_TEMPLATES.map((t: any) => ({ name: `${t.id} ${t.名稱 ?? t.name}`, smiles: t.unitSmiles, kind: '骨架範本單元' })),
  ];

  const describeGroups = (groups: any[]): string => {
    const count = new Map<string, { name: string; ygi: number; n: number }>();
    for (const g of groups) {
      const k = g.rowId;
      const e = count.get(k);
      if (e) e.n++;
      else count.set(k, { name: g.name, ygi: g.ygi, n: 1 });
    }
    return [...count.values()].map((e) => `${e.name} ×${e.n}（${e.ygi}）`).join('；');
  };

  out('# Phase 6 Tg 輸出（van Krevelen 基團加成）');
  out();
  out('**僅為基團加成估算，未含交聯與端基效應；使用者的固化前 Tg 為驗證目標，尚未比對。**');
  out();
  out('以下為程式輸出，未經化學判斷；分子量、ΣMi 只列在本文件供核對，網站上不顯示（D09）。');
  out();
  out(`- 結構處理：RDKit ${RDKit.version()}；基團表 \`src/data/yg_groups.csv\`（${YG_GROUPS.length} 列，稽核狀態皆為「待使用者審」）`);
  out('- 模型：van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 式 6.4–6.5：Tg = 1000·ΣYgi ÷ M（Ygi：K·kg/mol；M：g/mol）。可信度：理論估算（基團貢獻法）。');
  out('- 本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。');
  out('- 切分規則：Table 6.3 組合基團與 Table 6.1 基團依「基團原子數由大到小」配對，同大小依資料表順序；每個重原子恰好屬於一個基團；配不到的原子回報「缺基團」，不用相近基團代用。');
  out('- M = ΣMi（書中 Mi 印到小數一位）；「ΔM」= ΣMi − 分子（重複單元）的精確質量，容許 0.01，超過者標「超出」。');
  out('- 重新產生：`npm run verify:phase6-tg`。');
  out();

  out('## 1. 測試成分與骨架範本單元');
  out();
  out('| 名稱 | 類型 | SMILES | 切出的基團（Ygi） | ΣYgi（K·kg/mol） | M = ΣMi（g/mol） | ΔM | Tg（K） | Tg（°C） | 缺基團 |');
  out('|---|---|---|---|---|---|---|---|---|---|');
  const missingSummary: string[] = [];
  for (const s of all) {
    const r = computeTg(RDKit, s.smiles);
    if (r.status === 'ok') {
      const flag = r.massWithinTolerance === false ? '（超出）' : '';
      out(`| ${cell(s.name)} | ${s.kind} | \`${cell(s.smiles)}\` | ${cell(describeGroups(r.groups))} | ${fx(r.sumYg, 2)} | ${fx(r.sumM, 1)} | ${fx(r.massDelta, 3)}${flag} | ${fx(r.tgK, 1)} | ${fx(r.tgC, 1)} | — |`);
    } else if (r.status === 'missing') {
      const miss = r.missing.map((m: any) => `原子 ${m.index}：${m.description}`).join('；');
      out(`| ${cell(s.name)} | ${s.kind} | \`${cell(s.smiles)}\` | ${cell(describeGroups(r.groups) || '（無）')} | — | — | — | — | — | **缺基團**：${cell(miss)} |`);
      missingSummary.push(s.name);
    } else {
      out(`| ${cell(s.name)} | ${s.kind} | \`${cell(s.smiles)}\` | — | — | — | — | — | — | 無法解析：${r.message} |`);
    }
  }
  out();
  out(`缺基團的結構（${missingSummary.length} 個）不計算 Tg：${missingSummary.join('、')}。`);
  out();

  out('## 2. 與書中計算值對照（E-1）');
  out();
  out('書中值全部由頁面圖像讀取；重複單元 SMILES 由書中聚合物名稱整理（Table 6.4 沒有畫結構）。');
  out();
  out('| 聚合物 | 重複單元 SMILES | 出處（書頁） | 書中計算值（K） | 程式（K） | 差（K） | ≤ 1 K |');
  out('|---|---|---|---|---|---|---|');
  for (const c of BOOK_CASES) {
    const r = computeTg(RDKit, c.smiles);
    if (r.status !== 'ok') {
      out(`| ${c.name} | \`${cell(c.smiles)}\` | ${c.where} | ${c.book} | （${r.status}） | — | **否** |`);
      continue;
    }
    const d = r.tgK - c.book;
    out(`| ${c.name} | \`${cell(c.smiles)}\` | ${c.where} | ${c.book} | ${fx(r.tgK, 2)} | ${fx(d, 2)} | ${Math.abs(d) <= 1 ? '是' : '**否**'} |`);
  }
  out();

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
} finally {
  await server.close();
}
