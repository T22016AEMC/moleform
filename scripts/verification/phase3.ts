// Phase 3 使用者驗證清單的產生腳本（任務 014，3.7）。
// 對 5 個示範配方執行換算，把「程式輸出」寫成 docs/verification/phase3-輸出.md。
// 分子量只列在這個驗證文件中，供使用者手算 mol%；網站上不顯示分子量（D09）。
// 輸出不含化學判斷（D17）。執行：npm run verify:phase3（Node 直接執行 .ts，只用可抹除的型別語法）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', 'phase3-輸出.md');

const BADGE = 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1';
const BPA = 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1';
const TPP = 'c1ccc(P(c2ccccc2)c2ccccc2)cc1';
const MEK = 'CCC(C)=O';
const PGMEA = 'COCC(C)OC(C)=O';

type Comp = Record<string, unknown>;
const solid = (id: string, name: string, canonicalSmiles: string, category: string, amount: number, extra: Comp = {}): Comp => ({ id, name, canonicalSmiles, category, amount, ...extra });
const liquid = (id: string, name: string, canonicalSmiles: string, amount: number): Comp => ({ id, name, canonicalSmiles, category: 'Solvent', amount });

const TITLE = {
  badge: '環氧樹脂 BADGE',
  bpa: '雙酚 A',
  tpp: '三苯基膦',
  mek: '甲基乙基酮（MEK）',
  pgmea: '丙二醇甲醚醋酸酯（PGMEA）',
};
const solid1 = (tppExtra: Comp = {}) => [
  solid('badge', TITLE.badge, BADGE, 'Resin', 100, { isResin: true }),
  solid('bpa', TITLE.bpa, BPA, 'Crosslinker', 60),
  solid('tpp', TITLE.tpp, TPP, 'Catalyst/Initiator', 1, tppExtra),
];

const FORMULATIONS: { title: string; description: string; formulation: Comp }[] = [
  {
    title: '配方 1',
    description: '重量份，兩區',
    formulation: {
      schemaVersion: 1,
      name: '配方 1',
      solid: { unit: 'parts', components: solid1() },
      liquid: { unit: 'parts', components: [liquid('mek', TITLE.mek, MEK, 40)] },
    },
  },
  {
    title: '配方 2',
    description: 'Solid 用 wt%（100：60：1 換算，合計 100.00），Solid 總重 100 g；Liquid 用 g',
    formulation: {
      schemaVersion: 1,
      name: '配方 2',
      solid: {
        unit: 'wt',
        components: [
          solid('badge', TITLE.badge, BADGE, 'Resin', 62.11, { isResin: true }),
          solid('bpa', TITLE.bpa, BPA, 'Crosslinker', 37.27),
          solid('tpp', TITLE.tpp, TPP, 'Catalyst/Initiator', 0.62),
        ],
      },
      liquid: { unit: 'g', components: [liquid('mek', TITLE.mek, MEK, 40)] },
      solidTotalG: 100,
    },
  },
  {
    title: '配方 3',
    description: 'Solid 用 phr，無 Liquid',
    formulation: {
      schemaVersion: 1,
      name: '配方 3',
      solid: { unit: 'phr', components: solid1() },
      liquid: { unit: 'g', components: [] },
    },
  },
  {
    title: '配方 4',
    description: '目標 Solid Content 60%；Liquid 為 MEK 與 PGMEA，重量份 1：1',
    formulation: {
      schemaVersion: 1,
      name: '配方 4',
      solid: { unit: 'parts', components: solid1() },
      liquid: { unit: 'parts', components: [liquid('mek', TITLE.mek, MEK, 1), liquid('pgmea', TITLE.pgmea, PGMEA, 1)] },
      targetSolidContentPct: 60,
    },
  },
  {
    title: '配方 5',
    description: '配方 1，三苯基膦標記為會揮發／分解',
    formulation: {
      schemaVersion: 1,
      name: '配方 5',
      solid: { unit: 'parts', components: solid1({ volatileFlag: true }) },
      liquid: { unit: 'parts', components: [liquid('mek', TITLE.mek, MEK, 40)] },
    },
  },
];

const UNIT_LABEL: Record<string, string> = { g: 'g', parts: '重量份', wt: 'wt%', mol: 'mol%', phr: 'phr', vol: 'vol%' };

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
  const { averageMolecularWeight } = await server.ssrLoadModule('/src/core/formulation/molecularWeight.ts');
  const { computeFormulation } = await server.ssrLoadModule('/src/core/formulation/compute.ts');
  const RDKit = await getRDKit();

  const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(Number(v.toFixed(4))));
  const cell = (r: { value: number | null; notApplicable?: string } | null | undefined) =>
    !r ? '' : r.value === null ? `—（${r.notApplicable ?? '不適用'}）` : num(r.value);

  const lines: string[] = [];
  const out = (text = '') => lines.push(text);
  out('# Phase 3 輸出（配方換算）');
  out();
  out('以下為程式輸出，未經化學判斷。請使用者以手算或其他工具核對（D17）。示範配方僅用於驗證換算，不代表建議配比。');
  out();
  out(`- 結構驗證與分子量：RDKit ${RDKit.version()}（平均分子量 amw，整個結構一起算）。分子量只列在本文件供手算 mol%，網站上不顯示（D09）。`);
  out('- 模型：配方換算；可信度：直接計算。數值取到小數 4 位（去除尾端 0）。');
  out('- 重新產生：`npm run verify:phase3`（說明見 `docs/verification/README.md`）。');

  for (const { title, description, formulation } of FORMULATIONS) {
    const f = formulation as any;
    const all: any[] = [...f.solid.components, ...f.liquid.components];
    const weights: Record<string, number | undefined> = {};
    for (const c of all) weights[c.id] = averageMolecularWeight(RDKit, c.canonicalSmiles) ?? undefined;
    const outcome = computeFormulation(f, weights);

    out();
    out(`## ${title}：${description}`);
    out();
    out('### 輸入');
    out();
    out(`- Solid 區單位：${UNIT_LABEL[f.solid.unit]}；Liquid 區單位：${UNIT_LABEL[f.liquid.unit]}`);
    if (f.solidTotalG !== undefined) out(`- Solid 總重：${f.solidTotalG} g`);
    if (f.liquidTotalG !== undefined) out(`- Liquid 總重：${f.liquidTotalG} g`);
    if (f.targetSolidContentPct !== undefined) out(`- 目標 Solid Content：${f.targetSolidContentPct}%`);
    out();
    out('| 區域 | 成分 | SMILES | 分類 | 用量 | 樹脂 | 會揮發／分解 |');
    out('|---|---|---|---|---|---|---|');
    for (const [area, comps] of [['Solid', f.solid.components], ['Liquid', f.liquid.components]] as const) {
      for (const c of comps as any[]) {
        const unit = UNIT_LABEL[area === 'Solid' ? f.solid.unit : f.liquid.unit];
        out(`| ${area} | ${c.name} | \`${c.canonicalSmiles}\` | ${c.category} | ${c.amount} ${unit} | ${c.isResin ? '是' : ''} | ${c.volatileFlag ? '是' : ''} |`);
      }
    }
    out();
    out('### 各成分的平均分子量（僅供手算 mol%）');
    out();
    out('| 成分 | 平均分子量（g/mol） |');
    out('|---|---|');
    for (const c of all) out(`| ${c.name} | ${weights[c.id] === undefined ? '—' : weights[c.id]!.toFixed(3)} |`);

    out();
    out('### 結果');
    for (const [label, area] of [['Solid', outcome.results.solid], ['Liquid', outcome.results.liquid]] as const) {
      if (!area || !area.components.length) continue;
      out();
      out(`**${label}**`);
      out();
      out('| 成分 | 質量（g） | wt% | mol% | phr |');
      out('|---|---|---|---|---|');
      for (const c of area.components) out(`| ${c.name} | ${c.massG ? cell(c.massG) : '—'} | ${cell(c.wtPct)} | ${cell(c.molPct)} | ${c.phr ? cell(c.phr) : '—'} |`);
    }
    const o = outcome.results.overall;
    out();
    out('**整體**');
    out();
    out('| 項目 | 值 | 單位 |');
    out('|---|---|---|');
    for (const [label, r] of [
      ['Solid 質量', o.solidMass],
      ['Liquid 質量', o.liquidMass],
      ['總重', o.totalMass],
      ['Solid Content（全部）', o.solidContent],
      ['Solid Content（扣除標記成分）', o.solidContentExcludingVolatile],
    ] as const) {
      out(`| ${label} | ${cell(r)} | ${r.value === null ? '' : r.unit} |`);
    }
    if (o.target) {
      out();
      out('**目標 Solid Content 反推**');
      out();
      out('| 項目 | 值 | 單位 |');
      out('|---|---|---|');
      out(`| 所需 Liquid 總量 | ${cell(o.target.liquidTotal)} | ${o.target.liquidTotal.unit} |`);
      for (const c of o.target.liquidComponents) out(`| ${c.name} | ${cell(c.mass)} | ${c.mass.unit} |`);
    }
    out();
    out('**錯誤與警告**');
    out();
    if (!outcome.errors.length && !outcome.warnings.length) out('（無）');
    for (const e of outcome.errors) out(`- 錯誤 \`${e.code}\`（${e.area}）：${e.message}`);
    for (const w of outcome.warnings) out(`- 警告 \`${w.code}\`（${w.area}）：${w.message}`);
  }

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
} finally {
  await server.close();
}
