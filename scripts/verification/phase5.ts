// Phase 5 計算值輸出的產生腳本（任務 025）：測試成分與骨架範本的官能基當量等計算值，供使用者核對。
// 官能基當量與分子量只列在這個驗證文件中，網站上不顯示（D09）。輸出不含化學判斷（D17）。
// 第 1 層結果不重新列出（見 phase4-輸出.md）。
// 執行：npm run verify:phase5（Node 直接執行 .ts，只用可抹除的型別語法）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', 'phase5-輸出.md');

// ---------- 測試成分（docs/verification/phase4-測試體系.md，與 phase4.ts 相同） ----------
type Comp = Record<string, any>;
const UNIT_A = '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O';
const UNIT_B = '[*:1]C([*:2])c1ccc2ccccc2c1';
const COMPONENTS: Comp[] = [
  {
    id: 'P',
    name: 'P 雙酚茀–萘甲醛型酚醛樹脂（Random 共聚物）',
    canonicalSmiles: UNIT_A,
    category: 'Resin',
    polymer: { mwInput: 6000, pdiInput: 1.8, units: [{ smiles: UNIT_A, fraction: 66.67 }, { smiles: UNIT_B, fraction: 33.33 }], fractionBasis: 'mol' },
    note: '2:1 共聚物，Mw 6000、PDI 1.8',
  },
  { id: 'E', name: 'E PGMA 型環氧寡聚物（GMA 均聚物）', canonicalSmiles: '[*:1]CC([*:2])(C)C(=O)OCC1CO1', category: 'Resin', polymer: { mwInput: 4500 }, note: 'Mw 4500、PDI 使用預設 2' },
  { id: 'S', name: 'S SBI 雙酚（螺雙茚滿二醇）', canonicalSmiles: 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2', category: 'Small Molecule', note: '小分子' },
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
  const { analyzeComponent } = await server.ssrLoadModule('/src/core/crosslink/analyze.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const { resolvePolymer } = await server.ssrLoadModule('/src/core/polymer/convert.ts');
  const DIST = await server.ssrLoadModule('/src/core/polymer/distribution.ts');
  const RDKit = await getRDKit();
  const { tables } = loadTables(bundledTexts);
  const groups = tables.functionalGroups.rows;
  const groupName = (id: string) => groups.find((g: any) => g.id === id)?.name_zh ?? id;

  const lines: string[] = [];
  const out = (text = '') => lines.push(text);
  const fx = (v: number | null | undefined, d = 4) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : String(Number(v.toFixed(d))));
  const eq = (mass: number, f: number) => (f > 0 ? fx(mass / f, 2) : '—（無官能基）');
  const cell = (text: string) => text.replace(/\|/g, '\\|');

  const checks: { item: string; program: number; hand: number; handText: string }[] = [];

  out('# Phase 5 輸出（官能基當量等計算值）');
  out();
  out('以下為程式輸出，未經化學判斷；官能基當量只列在本文件供核對，網站上不顯示（D09）。');
  out();
  out(`- 結構處理：RDKit ${RDKit.version()}`);
  out('- 重新產生：`npm run verify:phase5`（說明見 `docs/verification/README.md`）。');
  out('- 第 1 層結果（化學計量、Miller–Macosko、理論配比、掃描）不重新列出，見 `phase4-輸出.md`。');
  out('- 官能基當量（g/eq）：**每重複單元基準** = M_unit（共聚物為平均單元 M̄_unit）÷ 每單元官能基數；**每鏈基準** = Mn ÷ 每鏈官能基數（= DP_n × 每單元官能基數 + 端基官能基數）；小分子 = 分子量 ÷ 官能基數。');
  out();

  // ---------- 1. 測試成分 ----------
  out('## 1. 測試成分 P、E、S');
  out();
  const handP = 279.0 / (4 / 3);
  let valueP = 0;
  let valueE = 0;
  let valueS = 0;
  for (const c of COMPONENTS) {
    const a = analyzeComponent(RDKit, c, groups);
    out(`### ${c.name}`);
    out();
    if (a.problem) {
      out(`- 無法分析：${a.problem}`);
      out();
      continue;
    }
    if (!a.isPolymer) {
      out(`- 類型：${c.note}；分子量 ${fx(a.molarMass, 3)} g/mol`);
      out();
      out('| 官能基 | 每分子數量 | 官能基當量（g/eq） |');
      out('|---|---|---|');
      for (const g of a.groups) {
        out(`| ${groupName(g.groupId)}（\`${g.groupId}\`） | ${g.sites.length} | ${eq(a.molarMass, g.sites.length)} |`);
        if (g.groupId === 'hydroxyl.phenolic') valueS = a.molarMass / g.sites.length;
      }
      out();
      continue;
    }
    const d = a.distribution;
    const r = resolvePolymer(c.polymer, d.mUnit, { mEnds: d.mEnds, filled: [false, false] });
    out(`- 類型：聚合物（${c.note}）`);
    out(`- 每重複單元質量${a.units && a.units.length > 1 ? '（平均單元 M̄_unit）' : ' M_unit'}：${fx(d.mUnit, 4)} g/mol`);
    out(`- Mn ${fx(r.mn, 2)}、Mw ${fx(r.mw, 2)} g/mol；DP_n ${fx(r.dp, 4)}、DP_w ${fx(r.dpW, 4)}（PDI ${fx(r.pdi, 3)}）`);
    out();
    out('| 官能基 | 每重複單元（平均）數量 | 每鏈數量 | 當量：每重複單元基準（g/eq） | 當量：每鏈基準（g/eq） |');
    out('|---|---|---|---|---|');
    for (const [id, perUnit] of Object.entries(a.unitGroupCounts as Record<string, number>)) {
      const perChain = perUnit * a.dp + (a.endGroupCounts[id] ?? 0);
      out(`| ${groupName(id)}（\`${id}\`） | ${fx(perUnit, 4)} | ${fx(perChain, 4)} | ${eq(d.mUnit, perUnit)} | ${eq(r.mn, perChain)} |`);
      if (c.id === 'P' && id === 'hydroxyl.phenolic') valueP = d.mUnit / perUnit;
      if (c.id === 'E' && id === 'ether.epoxide') valueE = d.mUnit / perUnit;
    }
    if (a.units && a.units.length > 1) {
      out();
      out('各單元：');
      for (const u of a.units) {
        const parts = u.groups.map((g: any) => `${groupName(g.groupId)} ${g.sites.length}`).join('、') || '（無反應官能基）';
        out(`- \`${u.smiles}\`（${fx(u.molFraction * 100, 2)} mol%）：${parts}`);
      }
    }
    out();
  }
  checks.push({ item: 'P 酚羥基當量（每平均單元，精確 2:1，66.67／33.33 輸入）', program: valueP, hand: handP, handText: 'M̄_unit ÷ (4/3) = 279.00 ÷ 1.3333' });
  checks.push({ item: 'E 環氧當量（每單元，GMA 單元 C₇H₁₀O₃）', program: valueE, hand: 142.15, handText: '142.15（GMA 單元質量 ÷ 1）' });
  checks.push({ item: 'S 酚羥基當量（C₂₁H₂₄O₂）', program: valueS, hand: 308.42 / 2, handText: '308.42 ÷ 2' });

  // ---------- 2. 骨架範本 ----------
  out('## 2. 骨架範本 BT01～BT06');
  out();
  out('每個範本以範本的單元與兩個端基計算。「n = 0 分子」是只有兩個端基、沒有重複單元的分子（M = 端基質量合計）。低分子量近似見 `docs/MODELS.md` 與任務 023（D51）：M₁ 小於端基質量合計時，改用「n = 0 分子＋較重成分」兩成分。');
  out();
  let valueBt05n0 = 0;
  for (const t of BACKBONE_TEMPLATES) {
    const endGroups: Record<string, unknown> = {
      end1: { smiles: t.end1Smiles, ...(t.end1PresetId ? { presetId: t.end1PresetId } : {}) },
      end2: { smiles: t.end2Smiles, ...(t.end2PresetId ? { presetId: t.end2PresetId } : {}) },
    };
    const spec = (mw: number) => ({ mwInput: mw, pdiInput: 2, endGroups });
    const comp = { id: t.id, name: t.name, canonicalSmiles: t.unitSmiles, category: 'Resin', polymer: spec(6000) };
    const a = analyzeComponent(RDKit, comp, groups);
    out(`### ${t.id} ${t.name}`);
    out();
    if (a.problem) {
      out(`- 無法分析：${a.problem}`);
      out();
      continue;
    }
    const d = a.distribution;
    const mEnds = d.mEnds;
    const ids = [...new Set([...Object.keys(a.unitGroupCounts), ...Object.keys(a.endGroupCounts)])];
    out(`- 單元：\`${t.unitSmiles}\`；單元質量 M_unit = ${fx(d.mUnit, 4)} g/mol`);
    out(`- 端基 1：\`${t.end1Smiles}\`${t.end1PresetId ? `（${t.end1PresetId}）` : ''}，端基 2：\`${t.end2Smiles}\`${t.end2PresetId ? `（${t.end2PresetId}）` : ''}；端基質量合計 M_ends = ${fx(mEnds, 4)} g/mol`);
    out(`- 範本說明：${t.groupsNote}`);
    out();
    out('| 官能基 | 每單元數量 | 端基 1 數量 | 端基 2 數量 | 兩端合計 |');
    out('|---|---|---|---|---|');
    const endCount = (k: number, id: string) => a.ends?.[k]?.groups.find((g: any) => g.groupId === id)?.sites.length ?? 0;
    for (const id of ids) {
      out(`| ${groupName(id)}（\`${id}\`） | ${fx(a.unitGroupCounts[id] ?? 0, 4)} | ${endCount(0, id)} | ${endCount(1, id)} | ${a.endGroupCounts[id] ?? 0} |`);
    }
    for (const id of ids) {
      const perUnit = a.unitGroupCounts[id] ?? 0;
      const endsTotal = a.endGroupCounts[id] ?? 0;
      out();
      out(`#### ${groupName(id)}（\`${id}\`）各分子量下的每鏈官能基數與當量`);
      out();
      out('| 情況 | Mn | Mw | 低分子量近似 | 成分（M／重量分率／每鏈官能基數） | 平均每鏈官能基數 | 當量（每鏈基準，Mn ÷ 官能基數，g/eq） |');
      out('|---|---|---|---|---|---|---|');
      out(`| n = 0 分子（只有端基） | ${fx(mEnds, 2)} | — | — | ${fx(mEnds, 2)}／1／${endsTotal} | ${endsTotal} | ${eq(mEnds, endsTotal)} |`);
      if (t.id === 'BT05' && id === 'ether.epoxide') valueBt05n0 = mEnds / endsTotal;
      for (const [label, mn, mw] of [['Mn 500、Mw 1000（PDI 2）', 500, 1000], ['Mn 3000、Mw 6000（PDI 2）', 3000, 6000]] as const) {
        const r = resolvePolymer(spec(mw), d.mUnit, { mEnds, filled: [true, true] });
        if (!r.ok) {
          out(`| ${label} | ${mn} | ${mw} | — | 無法計算：${cell(r.error)} | — | — |`);
          continue;
        }
        const sp = DIST.twoComponentSpecies(r.mw, r.mn, mEnds);
        const fOf = (m: number) => ((m - mEnds) / d.mUnit) * perUnit + endsTotal;
        const text = sp.species.map((s: any) => `${fx(s.m, 2)}／${fx(s.weightFraction, 4)}／${fx(fOf(s.m), 4)}`).join('；');
        const fAvg = r.dp * perUnit + endsTotal;
        out(`| ${label} | ${fx(r.mn, 2)} | ${fx(r.mw, 2)} | ${sp.lowMw ? '啟用' : '未啟用'} | ${text} | ${fx(fAvg, 4)} | ${eq(r.mn, fAvg)} |`);
      }
    }
    out();
  }
  checks.push({ item: 'BT05 n = 0（DGEBA）環氧當量', program: valueBt05n0, hand: 340.41 / 2, handText: '340.41 ÷ 2' });

  // ---------- 3. 手算核對 ----------
  out('## 3. 手算核對');
  out();
  out('手算值取自任務單（分子式質量手算）；差超過 0.1% 時須回報，不調整程式。');
  out();
  out('| 項目 | 程式值（g/eq） | 手算值（g/eq） | 手算式 | 差（g/eq） | 差（%） | 是否在 0.1% 內 |');
  out('|---|---|---|---|---|---|---|');
  let allOk = true;
  for (const c of checks) {
    const diff = c.program - c.hand;
    const pct = (Math.abs(diff) / c.hand) * 100;
    const ok = pct <= 0.1;
    allOk &&= ok;
    out(`| ${c.item} | ${fx(c.program, 3)} | ${fx(c.hand, 3)} | ${c.handText} | ${fx(diff, 3)} | ${fx(pct, 4)} | ${ok ? '是' : '**否，須回報**'} |`);
  }

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
  if (!allOk) console.log('警告：有手算核對差超過 0.1%');
} finally {
  await server.close();
}
