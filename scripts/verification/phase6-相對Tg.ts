// Phase 6 簡易 Tg 相對估算（任務 038，D61）輸出的產生腳本。
// 對使用者材料的聚合物單元與骨架範本 BT01–BT06 各輸出一列：名稱、SMILES、VvdW、Vm 與來源、Bondi 型 FFV、Δα（書的 CTE 模型），或缺什麼。
// 不給 Tg 數值（沒有錨點 Tg）。另列：任務卡的示範算例、k／Tg 表材料的 FFV（= 1 − 1.3k）、兩種同類別材料的 FFV 隨比例變化、White & Lipson (2015) 的提醒。
// 只列程式輸出，不判斷化學（D17）；單元質量不顯示（D09）。執行：npm run verify:phase6-relative-tg（Node 直接執行 .ts，只用可抹除的型別語法）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', 'phase6-相對Tg-輸出.md');

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
  const rt = await server.ssrLoadModule('/src/core/properties/relativeTg.ts');
  const { computeVdwVolume } = await server.ssrLoadModule('/src/core/properties/vanDerWaalsVolume.ts');
  const { computeMolarVolumeDensity } = await server.ssrLoadModule('/src/core/properties/molarVolumeDensity.ts');
  const { PACKING_K_ROWS } = await server.ssrLoadModule('/src/core/data/packingCoefficientK.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const { USER_UNITS } = await server.ssrLoadModule('/scripts/diagnosis/030-structures.ts');
  const RDKit = await getRDKit();

  const lines: string[] = [];
  const out = (text = '') => lines.push(text);
  const fx = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
  const sci = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toExponential(d).replace('e', '×10^'));
  const cell = (text: string) => text.replace(/\|/g, '\\|');

  out('# Phase 6 簡易 Tg 相對估算輸出（任務 038，D61）');
  out();
  out(`**${rt.RELATIVE_TG_DISCLAIMER}。可信度：${rt.RELATIVE_TG_CONFIDENCE}。**`);
  out();
  out('以下為程式輸出，未經化學判斷（D17）；單元質量只用於內部計算，不顯示（D09）；不使用折射率（D07）。本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。');
  out();
  out('## 檔頭說明');
  out();
  out(`- **方法**：${rt.RELATIVE_TG_MODEL}。`);
  out(`- ${rt.RELATIVE_TG_FFV_NOTE}。Vm＝分子（重複單元）實際占據體積；V0＝1.3 × VvdW（Bondi 近似 0 K 體積）；兩者不可混用。1.3 是固定常數。`);
  out(`- ${rt.RELATIVE_TG_INCREMENT_NOTE}。`);
  out('- **命名**：堆積係數 k（小寫，Vω／V，無單位）來自使用者的 k／Tg 表或使用者輸入；Δα 覆寫值 K（大寫，K = 1／Δα，單位 K）是使用者可選的輸入。兩者是不同的量。');
  out('- **Vm 的取得順序**（任務 038c）：堆積係數 k（使用者輸入 ＞ k／Tg 表）＞ 使用者密度 ＞ D57 結構類別係數換算（k = 1／(c + 1.3)，類別預設，非材料值）＞ Va 估算（任務 029）。堆積係數 k 來源下 FFV = 1 − 1.3k，VvdW 會消掉：**同一個堆積係數 k 的材料 FFV 必相同**。');
  out('- **莫耳數基準**（任務 038c）：B 的組成一律以「A 的每 1 mol 重複單元」為基準；比例輸入先把參考成分（A）換算成 1 mol（1:1 → 1＋1 mol，2:1 → 1＋0.5 mol）；B 的莫耳數看起來是分率（總和為 1、每項小於 1）時警告「請以每 1 mol A 為基準輸入」，不自行換算。');
  out('- **溫度基準**：「Va 基準」欄的 FFV 是 298 K 的 Va 基準，不在 Tg 溫度；堆積係數 k（k／Tg 表與 D57 類別預設）的溫度基準使用者未註明，待使用者確認。');
  out('- **本檔不給 Tg 數值**（沒有錨點 Tg）。Tg_B 需要 A 的 Tg（使用者執行時輸入，或由 k／Tg 表帶出），只對改了組成或表外的材料估算。');
  out('- 缺基團照現有 VW、Va 的規則回報，不以相近基團或記憶中的數值代用。‡＝VvdW 含 Bondi 補充基團（非書值，任務 037）。');
  out('- 重新產生：`npm run verify:phase6-relative-tg`。');
  out();

  // ---- 1. 使用者材料與骨架範本 ----
  const items: { name: string; smiles: string }[] = [
    ...USER_UNITS.map((x: any) => ({ name: x.name, smiles: x.smiles })),
    ...BACKBONE_TEMPLATES.map((t: any) => ({ name: `${t.id} ${t.name}`, smiles: t.unitSmiles })),
  ];
  out('## 1. 使用者材料的聚合物單元與骨架範本 BT01–BT06');
  out();
  out('VvdW、Vm 單位 cm³/mol；Δα 單位 K⁻¹（書的 CTE 模型：Δα =（E_l − E_g）／Vm）。這些結構都不在 k／Tg 表內，所以「Vm（依取得順序）」用的是 D57 類別預設的堆積係數 k（類別預設，非材料值）。「Va 基準」兩欄是任務 029 的 Va（298 K）與由它算出的 FFV，供對照。');
  out();
  out('| 名稱 | SMILES | VvdW | 堆積係數 k 與來源 | Vm（依取得順序） | Bondi 型 FFV | Δα | Va（任務 029） | FFV（Va 基準，298 K） |');
  out('|---|---|---|---|---|---|---|---|---|');
  const missingRows: string[] = [];
  for (const it of items) {
    const r = rt.evaluateRelativeTgComposition(RDKit, { monomers: [{ smiles: it.smiles }] });
    const head = `| ${cell(it.name)} | \`${cell(it.smiles)}\``;
    if (r.status !== 'ok') {
      out(`${head} | 無法計算：${cell(r.message)} | — | — | — | — | — | — |`);
      continue;
    }
    const m = r.side.monomers[0];
    const vw = computeVdwVolume(RDKit, it.smiles);
    const va = computeMolarVolumeDensity(RDKit, it.smiles);
    const vaVm = va.status === 'ok' && va.amorphous ? va.amorphous.vm : null;
    const vaCell = vaVm !== null ? fx(vaVm) : va.status === 'missing' ? '缺 Va（Table 4.10 缺基團）' : '—';
    const ffvVa = vaVm !== null && vw.status === 'ok' ? fx(rt.bondiFfv(vw.vw, vaVm), 4) : '—';
    const kCell = m.packingK === null ? '缺' : `${fx(m.packingK, 4)}（${m.packingKSource === 'class' ? 'D57 類別預設' : m.packingKSource === 'table' ? 'k／Tg 表' : '使用者輸入'}）`;
    for (const x of r.missing) missingRows.push(`| ${cell(it.name)} | ${x.what === 'VW' ? '缺 VW' : '缺莫耳體積'} | ${cell(x.message)}${x.atoms ? `：${cell(x.atoms.map((a: any) => `原子 ${a.index} ${a.description}`).join('；'))}` : ''} |`);
    out(`${head} | ${m.vomega === null ? '缺 VW' : `${fx(m.vomega)}${m.vwBondiSupplement ? ' ‡' : ''}`} | ${kCell} | ${fx(m.vm)} | ${fx(r.side.ffv, 4)} | ${sci(r.side.deltaAlpha)} | ${vaCell} | ${ffvVa} |`);
  }
  out();
  out('### 缺什麼');
  out();
  out('| 名稱 | 缺什麼 | 明細 |');
  out('|---|---|---|');
  for (const l of missingRows) out(l);
  if (missingRows.length === 0) out('| （無） | | |');
  out();
  out('缺 VW 的結構仍顯示由堆積係數 k 得到的 FFV（= 1 − 1.3k，VvdW 消掉），但 Vm、Δα 與 Δf 都算不出來。');
  out();

  // ---- 2. 示範算例 ----
  const demo = rt.relativeTgFromVolumes({
    a: [{ vomega: 242.4, packingK: 0.628 }],
    b: [
      { vomega: 242.4, packingK: 0.628 },
      { vomega: 81.1, packingK: 0.628 },
    ],
    tgA: { value: 350, unit: 'C' },
  });
  out('## 2. 示範算例（任務卡完成標準；數字為使用者指定，不是程式由結構算出）');
  out();
  out('輸入：Cardo 單元 Vω = 242.4、萘單元 Vω = 81.1（cm³/mol）、堆積係數 k = 0.628、Tg_A = 350 °C；A = Cardo 單元 1 mol，B = Cardo 單元 1 mol ＋ 萘單元 1 mol。');
  out();
  out('| 項目 | 程式 | 任務卡預期 |');
  out('|---|---|---|');
  out(`| V_A = Vω／k | ${fx(demo.a.vm, 3)} | — |`);
  out(`| Vf_A、Vf_B（Vf = V − 1.3 × Vω） | ${fx(demo.a.vf, 3)}、${fx(demo.b.vf, 3)} | — |`);
  out(`| FFV_A、FFV_B（= 1 − 1.3k，相同） | ${fx(demo.a.ffv, 4)}、${fx(demo.b.ffv, 4)} | — |`);
  out(`| Δf =（Vf_B − Vf_A）／V_A | ${fx(demo.deltaF, 6)} | ≈ 0.0614 |`);
  out(`| Δα_A =（E_l − E_g）／V_A = 0.55×10⁻³ × k | ${sci(demo.deltaAlphaA)} | ≈ 3.45×10⁻⁴ |`);
  out(`| Tg_B = Tg_A − Δf／Δα | ${demo.tgB.status === 'ok' ? `${fx(demo.tgB.tgC, 2)} °C` : '—'} | ≈ 172 °C |`);
  out();
  out(`標示：${rt.RELATIVE_TG_CTE_LABEL}。`);
  out();

  // ---- 3. k／Tg 表材料的 FFV ----
  out('## 3. k／Tg 表內材料的 Bondi 型 FFV（= 1 − 1.3 × 堆積係數 k）');
  out();
  out('表中沒有結構（SMILES），所以只有 FFV；Vm、Δα、Δf 需要重複單元的 SMILES。出處：使用者提供的 k／Tg 表（來源論文待補），2026-11-07；稽核狀態：待使用者審。表中的 Tg 是各材料的初始 Tg，本檔不列、不拿來互相運算或比對。');
  out();
  out('| id | 結構類別 | 材料名稱 | 堆積係數 k | Bondi 型 FFV |');
  out('|---|---|---|---|---|');
  for (const r of PACKING_K_ROWS) out(`| ${r.id} | ${cell(r.category)} | ${cell(r.name)} | ${r.packingKText} | ${fx(rt.ffvFromPackingK(r.packingK), 4)} |`);
  out();

  // ---- 4. 同類別兩種材料的 FFV 隨比例 ----
  const pair = ['DABA-6FDA', 'PABA-6FDA'];
  out('## 4. 同類別兩種材料的 FFV 隨比例變化（只列 FFV，不給 Tg）');
  out();
  out(`材料：${pair.join('、')}（結構類別同為「含醯胺芳香族聚醯亞胺」）。兩者在表中沒有結構、缺 VvdW，所以 FFV 以莫耳分率加權 Σ x_i·FFV_i 計（標「${rt.RELATIVE_TG_MOLE_WEIGHTED_LABEL}」）。**依使用者 2026-11-13 指定的範例算法，Tg_B 用的是 Δf =（Vf_B − Vf_A）／V_A，需要各單體的 VvdW；這張表的 FFV 不能直接用來算 Tg。**`);
  out();
  out(`| ${pair[1]} 的莫耳分率 | FFV | 算法 |`);
  out('|---|---|---|');
  for (const x of [0, 0.25, 0.5, 0.75, 1]) {
    const monomers = [
      ...(x < 1 ? [{ name: pair[0], amount: 1 - x }] : []),
      ...(x > 0 ? [{ name: pair[1], amount: x }] : []),
    ];
    const r = rt.evaluateRelativeTgComposition(RDKit, { monomers });
    const basis = r.status === 'ok' ? (r.side.ffvBasis === 'moleWeighted' ? rt.RELATIVE_TG_MOLE_WEIGHTED_LABEL : '單一材料：1 − 1.3k') : '—';
    out(`| ${x} | ${r.status === 'ok' ? fx(r.side.ffv, 4) : '—'} | ${basis} |`);
  }
  out();

  // ---- 5. White & Lipson ----
  out('## 5. A、B 必須同家族（背景引用）');
  out();
  out('White & Lipson, ACS Macro Lett. 2015, 4, 588–592（DOI 10.1021/acsmacrolett.5b00217；`docs/references` 內的 PDF，看圖核對第 588、589 頁）：以 LCL 狀態方程式由熔體 PVT 資料得到 51 種聚合物在同一溫度與壓力（425 K、1 atm）的自由體積百分率，與實驗 Tg 呈「粗略的反向線性關係」（a rough inverse linear relationship）；**只看同一家族時趨勢明顯變清楚**（例：聚甲基丙烯酸烷酯系列，側鏈越長自由體積越大、Tg 越低）。同一篇也指出聚異戊二烯系列出現相反的趨勢。');
  out();
  out('- 該文的自由體積來自狀態方程式（需要 PVT 實驗資料），不是本功能的 Bondi 型 FFV；這裡只引用「同溫度自由體積與 Tg 的反向關係在同家族內才清楚」這個結論，沒有使用它的任何數值或公式。');
  out('- 因此本功能的 A、B 必須是同一結構家族；不同家族時程式會警示「Δα（含 Δα 覆寫值 K）可能不適用」，結果不可比。');
  out('- Jones & Craster (2025) 的公式尚未核對原文，沒有實作。');
  out();

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
} finally {
  await server.close();
}
