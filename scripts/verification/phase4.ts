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
const UNIT_A = '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O'; // 單元 A（雙酚茀）
const UNIT_B = '[*:1]C([*:2])c1ccc2ccccc2c1'; // 單元 B（萘基次甲基）
const COMPONENTS: Comp[] = [
  {
    id: 'P',
    name: 'P 雙酚茀–萘甲醛型酚醛樹脂（Random 共聚物）',
    // 單元 A（雙酚茀）是成分本身的結構；單元 B（萘基次甲基）在 polymer.units
    canonicalSmiles: UNIT_A,
    category: 'Resin',
    polymer: {
      mwInput: 6000,
      pdiInput: 1.8,
      units: [
        { smiles: UNIT_A, fraction: 66.67 },
        { smiles: UNIT_B, fraction: 33.33 },
      ],
      fractionBasis: 'mol',
    },
    note: 'Mw ≈ 6000、PDI = 1.8（Mn ≈ 3333）；單元 A：B = 2：1（mol%：66.67、33.33）',
  },
  {
    id: 'E',
    name: 'E PGMA 型環氧寡聚物（GMA 均聚物）',
    canonicalSmiles: '[*:1]CC([*:2])(C)C(=O)OCC1CO1',
    category: 'Resin',
    polymer: { mwInput: 4500 },
    note: 'Mw ≈ 4500、PDI 未知，使用預設 2（Mn ≈ 2250）',
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
// 任務 019 的 P：兩種單體視為 1:1 合成一個重複單元的均聚物（Mw 6000、PDI 1.8）。只用來產生新舊對照
const OLD_OVERRIDE: Record<string, Comp> = {
  P: {
    canonicalSmiles: '[*:1]c1ccc(C2(c3ccc(C([*:2])c4ccc5ccccc5c4)c(O)c3)c3ccccc3-c3ccccc32)cc1O',
    polymer: { mwInput: 6000, pdiInput: 1.8 },
  },
};
// 共聚物各單元的 M_unit（僅供驗證文件）；RDKit 載入後才有值
let unitMass: (smiles: string) => number | null = () => null;
const byId = (ids: string[]) => ids.map((id) => COMPONENTS.find((c) => c.id === id)!);

const FORMULATIONS: { title: string; description: string; ids: string[]; amounts: Record<string, number> }[] = [
  { title: '配方 4A', description: 'Solid（wt%）P 80、E 20；Liquid：PGMEA；目標 Solid Content 4%', ids: ['P', 'E', 'L'], amounts: { P: 80, E: 20 } },
  { title: '配方 4B', description: 'Solid（wt%）P 79.2、E 19.8、S 1；Liquid：PGMEA；目標 Solid Content 4%', ids: ['P', 'E', 'S', 'L'], amounts: { P: 79.2, E: 19.8, S: 1 } },
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
  const L1 = await server.ssrLoadModule('/src/core/crosslink/layer1/layer1.ts');
  const PREP = await server.ssrLoadModule('/src/core/crosslink/layer1/prepare.ts');
  const ST = await server.ssrLoadModule('/src/core/crosslink/layer1/stoich.ts');
  const { computeFormulation } = await server.ssrLoadModule('/src/core/formulation/compute.ts');
  const { analyzeRepeatUnit } = await server.ssrLoadModule('/src/core/polymer/repeatUnit.ts');
  const DIST = await server.ssrLoadModule('/src/core/polymer/distribution.ts');
  const RDKit = await getRDKit();
  const { tables } = loadTables(bundledTexts);
  const groups = tables.functionalGroups.rows;
  const rules = tables.reactionRules.rows;
  const T = { functionalGroups: groups, reactionRules: rules };
  unitMass = (smiles: string) => {
    const r = analyzeRepeatUnit(RDKit, smiles);
    return r.ok ? r.mUnit : null;
  };
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
      const kind = a.isPolymer ? `聚合物${a.dp === null ? '' : `，${c.note}；DP_n = ${num(a.dp)}`}` : c.note;
      if (a.units && a.units.length > 1) {
        // 共聚物：每種單元分別列出（僅此文件，D09）
        a.units.forEach((u: any, k: number) => {
          const head = `${c.name} 單元 ${k + 1}（${num(u.molFraction * 100)} mol%，M_unit = ${num(unitMass(u.smiles))}）`;
          if (u.groups.length === 0) out(`| ${head} | \`${u.smiles}\` | （無） | 0 | 0 | — |`);
          for (const g of u.groups) {
            const atoms = g.sites.map((s: number[]) => `(${s.map((x: number) => x + 1).join('、')})`).join(' ');
            out(`| ${head} | \`${u.smiles}\` | ${groupName(g.groupId)}（\`${g.groupId}\`） | ${g.sites.length} | ${num(g.sites.length * u.molFraction * (a.dp ?? 0))}（此單元的貢獻） | ${atoms} |`);
          }
        });
        const perUnit = Object.entries(a.unitGroupCounts as Record<string, number>);
        out(`| ${c.name} 合計 | 平均重複單元 M̄_unit = ${num(a.distribution?.mUnit)}（${kind}） | ${perUnit.map(([id, n]) => `${groupName(id)} ${num(n)} 個／平均單元`).join('；') || '（無）'} | — | ${perUnit.map(([id, n]) => `${groupName(id)} ${num(n * (a.dp ?? 0))}`).join('；') || '—'} | — |`);
        continue;
      }
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
    out('- 兩邊都是 f ≥ 2，且至少一邊 f > 2 → 具形成網路的結構條件');
    out('- 兩邊都是 f = 2 → 具鏈延長的結構條件');
    out('- 有一邊 f < 2（例如 f = 1）→ 具封端的結構條件；若另一邊是聚合物 → 具接枝的結構條件');
    out('- 整個配方：任一配對具形成網路的結構條件，即「配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層」');
    out('- 這是依官能度的計數判定，不判斷反應會不會實際發生（D17）。f = 位點數 × 規則官能度（每個基團形成的鍵數），聚合物再乘聚合度 DP。');
  };

  // ---------- 第 1 層（任務 017） ----------
  const layer1 = () => {
    const scan0Ratio = (s: any) => {
      const t = L1.groupTotals(s);
      return t.nB / t.nA;
    };
    const fx = (v: number | null | undefined, d = 4) => (v === null || v === undefined ? '—' : String(Number(v.toFixed(d))));
    const sci = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v === 0 ? '0' : Number(v).toExponential(4));
    out('## 第 1 層：化學計量、Miller–Macosko、理論配比與比例掃描');
    out();
    out('Miller–Macosko 為理想化模型，未考慮環化、副反應與分子量分布。公式取自 Miller & Macosko, Macromolecules 1976, 9, 206（式號見 `docs/MODELS.md`）。');
    out('各成分的官能基莫耳數**只列在本文件**（D09）；理論最大成鍵數、交聯密度、Mc 等網路計算結果網站照常顯示（D44）。轉化率 = 限量官能基轉化率。質量基準：每 100 g 固體（Solid 區，含不參與反應的固體成分）。');

    // useOld：P 改用任務 019 的 1:1 均聚物，重現任務 019 的結果供對照
    const build = (ids: string[], amounts: Record<string, number>, useOld: boolean) => {
      const comps = byId(ids).map((c: Comp) => ({ ...c, ...(useOld && OLD_OVERRIDE[c.id] ? OLD_OVERRIDE[c.id] : {}), amount: amounts[c.id] ?? 100 }));
      const solidComps = comps.filter((c: Comp) => c.category !== 'Solvent');
      const liquidComps = comps.filter((c: Comp) => c.category === 'Solvent');
      const formulation = {
        schemaVersion: 1,
        name: ids.join(''),
        solid: { unit: 'wt', components: solidComps },
        liquid: { unit: 'wt', components: liquidComps },
        targetSolidContentPct: 4,
      };
      const result = analyzeCrosslink(RDKit, comps, T);
      const mw: Record<string, number | undefined> = {};
      for (const a of result.components) mw[a.id] = a.molarMass ?? undefined;
      const outcome = computeFormulation(formulation, mw);
      const prep = PREP.prepareLayer1(result, formulation, outcome);
      return { result, prep };
    };

    for (const { title, description, ids, amounts } of FORMULATIONS) {
      const { result, prep } = build(ids, amounts, false);
      out();
      out(`### ${title}：${description}`);
      out();
      if (!prep.ok) {
        out(`- 第 1 層無法計算：${prep.reason}`);
        continue;
      }
      const setup = prep.setup;
      const totals = L1.groupTotals(setup);
      out('#### 各成分的官能基莫耳數（僅此文件，D09）');
      out();
      out('| 成分 | 側 | 每分子質量 M（g/mol） | 每分子平均官能基數 f | 質量（g／100 g 固體） | 官能基莫耳數（mol／100 g 固體） |');
      out('|---|---|---|---|---|---|');
      for (const c of setup.components) {
        const mol = (c.mass / c.molarMass) * c.groupsPerMolecule * (100 / setup.totalMass);
        out(`| ${c.name} | ${c.side === 'A' ? setup.nameA + '（A）' : setup.nameB + '（B）'} | ${fx(c.molarMass, 2)}${c.isPolymer ? '（Mn）' : ''} | ${fx(c.groupsPerMolecule, 3)} | ${fx(c.mass, 4)} | ${fx(mol, 6)} |`);
      }
      out(`| 合計 ${setup.nameA}（A） | | | | | ${fx((totals.nA * 100) / setup.totalMass, 6)} |`);
      out(`| 合計 ${setup.nameB}（B） | | | | | ${fx((totals.nB * 100) / setup.totalMass, 6)} |`);

      out();
      out('#### 分子量分布的兩成分近似（僅此文件，D09；本專案推導，見 docs/MODELS.md）');
      out();
      out('每個聚合物成分以兩種虛擬成分表示，重量分率各 0.5：M₁ + M₂ = 2·Mw、M₁·M₂ = Mn·Mw，即 M₁,₂ = Mw ∓ √(Mw² − Mn·Mw)。虛擬成分的官能度 = (M ÷ M_unit) × 每重複單元官能基數；非整數時沿用相鄰整數混合（B-8）。');
      out();
      out('| 成分 | Mw | Mn | PDI | M_unit | 每重複單元官能基數 | M₁ | f₁ | M₂ | f₂ | 重量平均官能度 f_w |');
      out('|---|---|---|---|---|---|---|---|---|---|---|');
      for (const c of setup.components) {
        const d = c.distribution;
        if (!d) continue;
        const { m1, m2, single } = DIST.twoComponentMasses(d.mw, d.mn);
        const fOf = (m: number) => fx((m / d.mUnit) * d.groupsPerUnit, 3);
        out(`| ${c.name} | ${fx(d.mw, 2)} | ${fx(d.mn, 2)} | ${fx(d.mw / d.mn, 3)} | ${fx(d.mUnit, 3)} | ${fx(d.groupsPerUnit, 3)} | ${fx(m1, 2)} | ${fOf(m1)} | ${single ? '（同 M₁）' : fx(m2, 2)} | ${single ? '（同 f₁）' : fOf(m2)} | ${fOf(d.mw)} |`);
      }

      const r = L1.computeLayer1(setup, 1);
      out();
      out('#### 直接計算（可信度：直接計算）');
      out();
      out(`- 反應官能基比：**${r.ratioText}**`);
      out(`- 限量官能基：${r.limiting === 'A' ? setup.nameA : r.limiting === 'B' ? setup.nameB : '（等量）'}；過量官能基：${r.excess === null ? '（無）' : r.excess === 'A' ? setup.nameA : setup.nameB}，過量 ${fx(r.excessPct, 2)}%`);
      out(`- 理論最大成鍵數（限量官能基完全反應）：${fx(r.maxBondsMolPerKg, 5)} mol/kg 固體`);
      out();
      out('#### Miller–Macosko（可信度：理論估算；模型：' + L1.LAYER1_MODEL_NAME + '）');
      out();
      out(`- 凝膠點（限量官能基轉化率）：${r.gelConversion === null ? L1.MESSAGE_NEVER_GELS : fx(r.gelConversion * 100, 3) + '%'}`);
      out('- 轉化率 100% 時：');
      out(`  - 溶膠分率 w_s：${fx(r.solFraction * 100, 4)}%`);
      out(`  - 交聯密度 ν_c（式 51；網中撐住網路的有效網目鏈濃度，彈性有效）：${r.effectiveChainsMolPerKg === null ? L1.MESSAGE_NOT_GELLED : fx(r.effectiveChainsMolPerKg, 5) + ' mol/kg 固體'}`);
      out(`  - 網目分子量 Mc = 1／ν_c（數字越小，網越密）：${r.mcGPerMol === null ? L1.MESSAGE_NOT_GELLED : fx(r.mcGPerMol, 1) + ' g/mol'}（${L1.NOTE_MASS_BASIS}）`);
      out(`  - 已形成的鍵（指定轉化率下已反應的鍵數，直接計算）：${fx(r.bondsFormedMolPerKg, 5)} mol/kg 固體`);
      out(`  - 詳細：連入網路的分子數 [X]（式 49）：${r.junctionsMolPerKg === null ? L1.MESSAGE_NOT_GELLED : fx(r.junctionsMolPerKg, 5) + ' mol/kg 固體'}。Miller–Macosko 將每個多官能分子計為一個交聯點；聚合物對聚合物的體系中，此值不等於交聯鍵數`);
      out(`  - 殘留官能基：${setup.nameA} ${fx(r.residualAPct, 3)}%、${setup.nameB} ${fx(r.residualBPct, 3)}%（相對初始量，直接計算）`);
      out(`- 附註：${[r.usedMixtureApprox ? L1.NOTE_NON_INTEGER : null, r.hasPolymer ? L1.NOTE_DISTRIBUTION : null, r.hasCopolymer ? L1.NOTE_COPOLYMER : null, L1.NOTE_M06, L1.NOTE_MC_DEFINITION].filter(Boolean).join('；')}`);

      // 新舊對照：任務 019 的 P（1:1 均聚物）→ 本任務的 P（2:1 Random 共聚物）
      const oldBuilt = build(ids, amounts, true);
      if (oldBuilt.prep.ok) {
        const o = L1.computeLayer1(oldBuilt.prep.setup, 1);
        out();
        out('#### 新舊對照（轉化率 100%）');
        out();
        out('| 項目 | 舊（任務 019：P 為 1:1 均聚物，Mw 6000／PDI 1.8） | 新（本任務：P 為 2:1 Random 共聚物，Mw 6000／PDI 1.8；E 不變） |');
        out('|---|---|---|');
        const row = (label: string, a: string, b: string) => out(`| ${label} | ${a} | ${b} |`);
        row('反應官能基比', o.ratioText, r.ratioText + (o.ratioText === r.ratioText ? '（不變）' : '（改變）'));
        row('凝膠點（限量官能基轉化率）', o.gelConversion === null ? '—' : fx(o.gelConversion * 100, 3) + '%', r.gelConversion === null ? '—' : fx(r.gelConversion * 100, 3) + '%');
        row('交聯密度 ν_c（mol/kg 固體）', fx(o.effectiveChainsMolPerKg, 5), fx(r.effectiveChainsMolPerKg, 5));
        row('網目分子量 Mc（g/mol）', fx(o.mcGPerMol, 1), fx(r.mcGPerMol, 1));
        row('溶膠分率 w_s', fx(o.solFraction * 100, 4) + '%', fx(r.solFraction * 100, 4) + '%');
        row('理論最大成鍵數（mol/kg 固體）', fx(o.maxBondsMolPerKg, 5), fx(r.maxBondsMolPerKg, 5));
      }

      const st = ST.stoichiometricSetup(setup);
      const desc = PREP.describeAmounts(prep, st);
      out();
      out('#### 化學計量配比（group_a 側不變，group_b 側等比例調整；可信度：直接計算）');
      out();
      out(`| 成分 | 目前用量（${prep.solidUnit}） | 調整後用量（${desc.unit}） | 調整後重量份（原固體總量 = 100 份） |`);
      out('|---|---|---|---|');
      for (const row of desc.rows) {
        const old = prep.items.find((i: any) => i.id === row.id);
        out(`| ${row.name} | ${fx(old.amountOld, 4)} | ${fx(row.amount, 4)} | ${fx(row.parts, 4)} |`);
      }

      const option = ST.SCAN_OPTIONS[0];
      const scanSettings = ST.defaultScanSettings(scan0Ratio(setup));
      const scan = ST.scanRatio(setup, 1, option, scanSettings);
      out();
      out(`#### 比例掃描：${option.label}，轉化率 100%（可信度：參考趨勢；${ST.SCAN_DISCLAIMER}）`);
      out();
      out(`目前配方的當量比（${setup.nameB}／${setup.nameA}）= ${fx(scan.currentRatio, 4)}；預設範圍 ${fx(scanSettings.min, 3)}–${fx(scanSettings.max, 3)}（下限 0.5，上限 max(1.5, 目前當量比 × 1.2)），${scanSettings.points} 點。`);
      if (scan.bestIndex === 0 || scan.bestIndex === scan.points.length - 1) out('注意：最佳點落在掃描範圍的邊界，範圍外可能更佳。');
      out();
      out(`| 當量比 | ${option.label}（${option.unit}） | 最佳點 |`);
      out('|---|---|---|');
      scan.points.forEach((p: any, i: number) => out(`| ${fx(p.ratio, 3)} | ${fx(p.value, 5)} | ${i === scan.bestIndex ? '◀ 最佳' : ''} |`));
      if (scan.bestSetup) {
        const best = PREP.describeAmounts(prep, scan.bestSetup);
        out();
        out(`最佳點（當量比 ${fx(scan.points[scan.bestIndex].ratio, 3)}）各成分用量（${best.unit}／重量份）：${best.rows.map((r: any) => `${r.name} ${fx(r.amount, 3)}／${fx(r.parts, 3)}`).join('；')}`);
      }
    }
  };

  const sections: (() => void)[] = [layer0, layer1];

  out('# Phase 4 輸出（交聯）');
  out();
  out('以下為程式輸出，未經化學判斷。請使用者檢查官能基辨識、反應規則與判定是否合理（D17）。官能基數量只列在本文件供核對，網站上不顯示（D09）。Miller–Macosko 為理想化模型，未考慮環化、副反應與分子量分布。');
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
