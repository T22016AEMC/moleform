// Phase 4 使用者驗證清單的產生腳本（任務 016，交聯第 0 層）。
// 把「程式輸出」寫成 docs/verification/phase4-輸出.md，供使用者檢查官能基辨識、反應規則與判定。
// 官能基數量只列在這個驗證文件中，網站上不顯示（D09）。輸出不含化學判斷（D17）。
// 任務 017 會在同一份文件加入第 1 層：在下方 sections 陣列再加一個區段函式即可。
// 執行：npm run verify:phase4（Node 直接執行 .ts，只用可抹除的型別語法）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', 'phase4-輸出.md');

// ---------- 測試體系（docs/verification/phase4-測試體系.md，使用者 2026-10-29 提供） ----------
type Comp = Record<string, any>;
const COMPONENTS: Comp[] = [
  {
    id: 'P',
    name: 'P 雙酚茀–萘甲醛型酚醛樹脂（均聚物）',
    canonicalSmiles: '[*:1]c1ccc(C2(c3ccc(C([*:2])c4ccc5ccccc5c4)c(O)c3)c3ccccc3-c3ccccc32)cc1O',
    category: 'Resin',
    polymer: { mnInput: 6000 },
    note: 'Mn ≈ 6000',
  },
  {
    id: 'E',
    name: 'E PGMA 型環氧寡聚物（GMA 均聚物）',
    canonicalSmiles: '[*:1]CC([*:2])(C)C(=O)OCC1CO1',
    category: 'Resin',
    polymer: { dpInput: 21 },
    note: 'DP = 21',
  },
  {
    id: 'S',
    name: 'S SBI 雙酚（螺雙茚滿二醇）',
    canonicalSmiles: 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2',
    category: 'Small Molecule',
    note: '小分子',
  },
  {
    id: 'L',
    name: 'L 丙二醇甲醚醋酸酯（PGMEA）',
    canonicalSmiles: 'COCC(C)OC(C)=O',
    category: 'Solvent',
    note: '溶劑',
  },
];
const byId = (ids: string[]) => ids.map((id) => COMPONENTS.find((c) => c.id === id)!);

const FORMULATIONS = [
  { title: '配方 4A', description: 'Solid（wt%）P 80、E 20；Liquid：PGMEA；目標 Solid Content 4%', ids: ['P', 'E', 'L'] },
  { title: '配方 4B', description: 'Solid（wt%）P 79.2、E 19.8、S 1；Liquid：PGMEA；目標 Solid Content 4%', ids: ['P', 'E', 'S', 'L'] },
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
  const { bundledTexts, loadTables } = await server.ssrLoadModule('/src/core/data/load.ts');
  const { analyzeComponent, analyzeCrosslink } = await server.ssrLoadModule('/src/core/crosslink/analyze.ts');
  const { PAIR_KIND_LABEL, VERDICT_LABEL } = await server.ssrLoadModule('/src/core/crosslink/types.ts');
  const RDKit = await getRDKit();
  const { tables } = loadTables(bundledTexts);
  const groups = tables.functionalGroups.rows;
  const rules = tables.reactionRules.rows;
  const T = { functionalGroups: groups, reactionRules: rules };
  const groupName = (id: string) => groups.find((g: any) => g.id === id)?.name_zh ?? id;

  const lines: string[] = [];
  const out = (text = '') => lines.push(text);
  const cell = (text: string) => text.replace(/\|/g, '\\|');
  const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(Number(v.toFixed(4))));

  // ---------- 第 0 層 ----------
  const layer0 = () => {
    out('## 第 0 層：官能基辨識、配對與判定');

    out();
    out('### 本次使用的官能基');
    out();
    out('| id | 名稱 | SMARTS（含原子映射） | 反應原子映射 | 出處 | 備註 | 審核狀態 |');
    out('|---|---|---|---|---|---|---|');
    for (const g of groups) {
      out(`| \`${g.id}\` | ${g.name_zh} | \`${cell(g.smarts)}\` | ${g.reactive_atom_maps.join('、')} | ${cell(`${g.source}；${g.source_detail}；${g.source_original}`)} | ${cell(g.notes)} | ${g.review_status} |`);
    }

    out();
    out('### 本次使用的反應規則');
    out();
    out('| id | 反應類型 | group_a | group_b | 反應 SMARTS | 催化劑 | 溫度 | 官能度 a／b | 出處 | 備註 | 審核狀態 |');
    out('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of rules) {
      const temp = r.temp_min_c === null ? '尚無文獻資料' : `${r.temp_min_c}–${r.temp_max_c} °C`;
      out(`| \`${r.id}\` | ${r.reaction_type} | \`${r.group_a}\` | \`${r.group_b}\` | \`${cell(r.reaction_smarts)}\` | ${r.catalyst_required} | ${temp} | ${num(r.functionality_a)}／${num(r.functionality_b)} | ${cell(`${r.source_type}：${r.source}`)} | ${cell(r.notes)} | ${r.review_status} |`);
    }

    out();
    out('### 各測試成分的官能基與反應原子');
    out();
    out('官能基數量：小分子為每分子；聚合物為每重複單元（排除涉及連接點 `*` 的匹配），並以聚合度 DP 換算為每分子平均數量。反應原子編號 1 起算（RDKit 原子索引 + 1），與網站 2D／3D 標記的編號一致。');
    out();
    out('| 成分 | 結構 | 官能基 | 每分子／每重複單元 | 每分子平均 | 反應原子編號（1 起算） |');
    out('|---|---|---|---|---|---|');
    for (const c of COMPONENTS) {
      const a = analyzeComponent(RDKit, c, groups);
      const kind = a.isPolymer ? `聚合物${a.dp === null ? '' : `，DP = ${num(a.dp)}（${c.note}）`}` : c.note;
      if (a.groups.length === 0) {
        out(`| ${c.name} | \`${c.canonicalSmiles}\`（${kind}） | （無） | 0 | 0 | — |`);
        continue;
      }
      for (const g of a.groups) {
        const per = g.sites.length;
        const avg = a.isPolymer ? (a.dp === null ? '—' : num(per * a.dp)) : String(per);
        const atoms = g.sites.map((s: number[]) => `(${s.map((x) => x + 1).join('、')})`).join(' ');
        out(`| ${c.name} | \`${c.canonicalSmiles}\`（${kind}） | ${groupName(g.groupId)}（\`${g.groupId}\`） | ${per} | ${avg} | ${atoms} |`);
      }
    }

    for (const { title, description, ids } of FORMULATIONS) {
      const comps = byId(ids);
      const result = analyzeCrosslink(RDKit, comps, T);
      out();
      out(`### ${title}：${description}`);
      out();
      out(`- 成分：${comps.map((c) => c.name).join('；')}`);
      out(`- 配方判定：**${VERDICT_LABEL[result.verdict]}**（可信度：直接計算；模型：${result.modelName}）`);
      out();
      out('| 配對（A × B） | 反應類型 | A 每分子平均 f | B 每分子平均 f | 判定 | 催化劑 | 溫度 |');
      out('|---|---|---|---|---|---|---|');
      for (const p of result.pairs) {
        const who = p.b && !p.self ? `${p.a.name} × ${p.b.name}` : `${p.a.name}（自反應）`;
        out(`| ${who} | ${p.reactionLabel} | ${num(p.a.f)} | ${p.b ? num(p.b.f) : '—'} | ${PAIR_KIND_LABEL[p.kind]} | ${p.catalyst.message} | ${p.temperature} |`);
      }
      out();
      out(`- 不參與反應的成分：${result.nonParticipants.length ? result.nonParticipants.map((n: any) => n.name).join('；') : '（無）'}`);
      out(`- 標示：${result.pendingReview.rules.length || result.pendingReview.groups.length ? '使用中的反應規則尚未經使用者審核' : '（無）'}`);
      out(`- 警告：${result.warnings.length ? result.warnings.join('；') : '（無）'}`);
    }

    out();
    out('### 判定規則（依每分子平均官能度 f）');
    out();
    out('- 兩邊都是 f ≥ 2，且至少一邊 f > 2 → 網路');
    out('- 兩邊都是 f = 2 → 鏈延長（線性）');
    out('- 有一邊 f < 2（例如 f = 1）→ 封端；若另一邊是聚合物 → 接枝');
    out('- 整個配方：任一配對為網路即「可形成網路」');
    out('- 這是依官能度的計數判定，不判斷反應會不會實際發生（D17）。f = 位點數 × 規則官能度（每個基團形成的鍵數），聚合物再乘聚合度 DP。');
  };

  const sections: (() => void)[] = [layer0 /* 任務 017：在這裡加入第 1 層 */];

  out('# Phase 4 輸出（交聯）');
  out();
  out('以下為程式輸出，未經化學判斷。請使用者檢查官能基辨識、反應規則與判定是否合理（D17）。官能基數量只列在本文件供核對，網站上不顯示（D09）。');
  out();
  out(`- 結構處理：RDKit ${RDKit.version()}`);
  out('- 重新產生：`npm run verify:phase4`（說明見 `docs/verification/README.md`）。');
  out();
  for (const section of sections) section();

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
} finally {
  await server.close();
}
