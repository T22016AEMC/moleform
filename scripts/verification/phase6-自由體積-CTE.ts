// Phase 6 熱膨脹係數 CTE 輸出的產生腳本（任務 036）。
// 對使用者材料的聚合物單元與骨架範本 BT01–BT06、任務 030 的半導體代表結構、驗證用書中聚合物（Table 4.12）各輸出一列：
// 玻璃態與橡膠態的 E、e、α、β，Tg、VW，或「缺 VW／缺 Tg」。不含連接點的小分子標「不適用（小分子，D56）」。
// 自由體積分率：書中沒有由結構計算的方法（任務 036 使用者決定不做，見報告），本輸出不含自由體積分率。
// 只列程式輸出，不判斷化學（D17）；單元質量只用於比膨脹率 e，不顯示（D09）。
// 執行：npm run verify:phase6-cte（Node 直接執行 .ts，只用可抹除的型別語法）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', 'phase6-自由體積-CTE-輸出.md');

// 驗證用書中聚合物：Table 4.12（書頁 92–95，看圖讀取）。egCalc、elCalc 為書中「E_g calc.」「E_l calc.」（10⁻⁴ cm³/mol/K）；
// egExp、elExp 為書中實驗值（兩個數字者為範圍；只作比較，不當輸入，D02）。vwBook 為書中 VW 欄。
interface Book {
  name: string;
  smiles: string;
  vwBook: number;
  egCalc: number;
  elCalc: number;
  egExp: string;
  elExp: string;
}
const BOOK: Book[] = [
  { name: '聚乙烯', smiles: '[*:1]CC[*:2]', vwBook: 20.46, egCalc: 92, elCalc: 205, egExp: '67/101', elExp: '210/269' },
  { name: '聚丙烯', smiles: '[*:1]CC([*:2])C', vwBook: 30.68, egCalc: 138, elCalc: 307, egExp: '93', elExp: '232/396' },
  { name: '聚異丁烯', smiles: '[*:1]CC(C)(C)[*:2]', vwBook: 40.9, egCalc: 184, elCalc: 409, egExp: '90/112', elExp: '314/388' },
  { name: '聚苯乙烯', smiles: '[*:1]CC([*:2])c1ccccc1', vwBook: 62.85, egCalc: 283, elCalc: 629, egExp: '177/281', elExp: '448/708' },
  { name: '聚氯乙烯', smiles: '[*:1]CC(Cl)[*:2]', vwBook: 29.23, egCalc: 132, elCalc: 292, egExp: '88/131', elExp: '262/325' },
  { name: '聚乙酸乙烯酯', smiles: '[*:1]CC([*:2])OC(C)=O', vwBook: 45.88, egCalc: 206, elCalc: 459, egExp: '155/198', elExp: '413/517' },
  { name: '聚甲基丙烯酸甲酯', smiles: '[*:1]CC([*:2])(C)C(=O)OC', vwBook: 56.1, egCalc: 252, elCalc: 561, egExp: '230', elExp: '520/550' },
  { name: '聚對苯二甲酸乙二酯', smiles: '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]', vwBook: 94.18, egCalc: 424, elCalc: 942, egExp: '423/461', elExp: '1153/1422' },
  { name: '尼龍 6', smiles: '[*:1]NC(=O)CCCCC[*:2]', vwBook: 70.71, egCalc: 318, elCalc: 707, egExp: '—', elExp: '634' },
  { name: '聚雙酚碳酸酯', smiles: '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]', vwBook: 136.21, egCalc: 613, elCalc: 1362, egExp: '610/737', elExp: '1220/1500' },
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
  const { computeCte, cteFromVw, CTE_MODEL, CTE_DISCLAIMER, CTE_COEFFICIENTS } = await server.ssrLoadModule('/src/core/properties/cte.ts');
  const { computeMolarVolumeDensity } = await server.ssrLoadModule('/src/core/properties/molarVolumeDensity.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const { USER_SMALL, USER_UNITS, SEMI } = await server.ssrLoadModule('/scripts/diagnosis/030-structures.ts');
  const RDKit = await getRDKit();

  const lines: string[] = [];
  const out = (text = '') => lines.push(text);
  const fx = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
  const sci = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toExponential(d).replace('e', '×10^').replace('+', ''));
  const cell = (text: string) => text.replace(/\|/g, '\\|');
  const missingText = (m: any[]): string => m.map((x) => `原子 ${x.index}：${x.description}${x.reason ? `（${x.reason}）` : ''}`).join('；');

  out('# Phase 6 熱膨脹係數 CTE 輸出');
  out();
  out(`**${CTE_DISCLAIMER}**`);
  out();
  out('以下為程式輸出，未經化學判斷（D17）；單元質量只用於比膨脹率 e，網站上不顯示（D09）。本輸出不使用實驗值當輸入（D02）；書中實驗值只在第 3 節當比較。');
  out();
  out(`- 結構處理：RDKit ${RDKit.version()}`);
  out(`- **方法**：${CTE_MODEL}。`);
  out(`  - 莫耳膨脹率：E_l（橡膠態／液態）= ${CTE_COEFFICIENTS.el} × VW（式 4.17）；E_g（玻璃態）= ${CTE_COEFFICIENTS.eg} × VW（式 4.18）；單位 cm³/mol/K。比膨脹率 e = E/M（cm³/g/K）。`);
  out(`  - 體膨脹係數 α = E/V（式 4.9）：α_l 用 V_r(298) = ${CTE_COEFFICIENTS.vr298}·VW（式 4.24），α_l = 6.25×10⁻⁴ K⁻¹，與結構無關；α_g 有兩種算法並列（書頁 96 說明式 4.8b「偏低」，不替使用者選）：(a) V_g(298) ≈ 1.6·VW（式 4.8b，書頁 99 的用法，不需 Tg，α_g = 2.81×10⁻⁴ K⁻¹，同樣與結構無關）；(b) V_g(298) = [1.43 + 0.55×10⁻³·Tg]·VW（式 4.27，需 Tg）。`);
  out('  - 線膨脹係數 β = α/3（式 4.9 的 α = 3β，等向性假設）。ppm/K ＝ α × 10⁶。');
  out('  - **只依 VW（式 4.17、4.18）的 E 隨 VW 成正比；α 因分母也是 VW 的倍數，在模型中是常數**（6.25×10⁻⁴ 與 2.81×10⁻⁴）。要區分不同聚合物的 α，只有式 4.27 的 Tg 項（變化很小，Tg 300–500 K 時 V_g/VW 為 1.595–1.705）。這是書中方法的性質，不是程式問題。');
  out('  - **適用條件**：書中的 Table 4.12 比較：平均偏差 E_l 8%、E_g 12%，實驗數據本身約 ±5%（書頁 94）。CTE 隨溫度與固化度變化；本方法是未交聯聚合物重複單元的估算，交聯網路的 CTE（例如 EMC、底填膠含填料）不在本方法範圍。');
  out('  - **不使用的規則**：Table 4.11 的經驗規則（Simha–Boyer、Boyer–Spencer、Bondi、Tobolsky–Bueche）書中明文不得互相代入推新式（書頁 90），本程式不使用。');
  out('  - **自由體積分率**：書中沒有由結構計算的方法；本輸出不含（見報告 036 第一節）。');
  out('- **缺基團**：VW 用任務 028／031 的切分（Table 4.2），Tg 用任務 026／033（Table 6.1，必要時含校準基團，標「含校準基團」）；重疊優先順序為現行規則（M26 未決，未更動）。配不到的原子回報缺基團，不用相近基團或記憶中的數值代用。缺 VW → 不算任何 CTE；缺 Tg → 只缺式 4.27 的 α_g(b)，其餘照算。');
  out('- **小分子**：不含連接點（*）的結構標「不適用（小分子，D56）」。');
  out('- Va、Vc 欄來自任務 029（Table 4.10 基團），只供參考，不參與 CTE 計算。');
  out('- ‡ ＝ 含 Bondi 補充基團（非書值）：VW 缺基團以 Bondi (1964) 補充（任務 037，D59；詳見 phase6-VW-TPSA-LogP-輸出.md），含詮釋者另需使用者審。');
  out('- 本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。');
  out('- 重新產生：`npm run verify:phase6-cte`。');
  out();

  const items: { name: string; smiles: string; group: string }[] = [
    ...USER_SMALL.map((x: any) => ({ name: x.name, smiles: x.smiles, group: '使用者材料' })),
    ...USER_UNITS.map((x: any) => ({ name: x.name, smiles: x.smiles, group: '使用者材料' })),
    ...BACKBONE_TEMPLATES.map((t: any) => ({ name: `${t.id} ${t.名稱 ?? t.name}`, smiles: t.unitSmiles, group: '使用者材料（骨架範本）' })),
    ...SEMI.map((x: any) => ({ name: x.name, smiles: x.smiles, group: '半導體常用材料（D53，SMILES 待使用者審）' })),
    ...BOOK.map((v) => ({ name: v.name, smiles: v.smiles, group: '驗證用書中聚合物（Table 4.12）' })),
  ];

  const vols = (smiles: string): { va: string; vc: string } => {
    const v = computeMolarVolumeDensity(RDKit, smiles);
    if (v.status === 'ok') return { va: fx(v.amorphous?.vm ?? null), vc: fx(v.crystalline?.vm ?? null) };
    return { va: v.status === 'missing' ? '缺莫耳體積' : '—', vc: v.status === 'missing' ? '缺莫耳體積' : '—' };
  };

  out('## 1. 全部結構');
  out();
  out('E_g、E_l 單位 cm³/mol/K；e_g、e_l 單位 cm³/g/K；α、β 單位 K⁻¹。α_g(a)＝式 4.8b，α_g(b)＝式 4.27。「含校準基團」＝Tg 用了 D54 校準基團（非書中值）。');
  out();
  const groupsSeen: string[] = [];
  for (const it of items) if (!groupsSeen.includes(it.group)) groupsSeen.push(it.group);
  const noTg: string[] = [];
  for (const group of groupsSeen) {
    out(`### ${group}`);
    out();
    out('| 名稱 | SMILES | VW | E_g | E_l | e_g | e_l | α_g(a) | α_g(b) | α_l | β_g(a) | β_l | Tg（K） | Va | Vc |');
    out('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const it of items.filter((x) => x.group === group)) {
      const r = computeCte(RDKit, it.smiles);
      const head = `| ${cell(it.name)} | \`${cell(it.smiles)}\``;
      if (r.status === 'notApplicable') {
        out(`${head} | ${r.message} | — | — | — | — | — | — | — | — | — | — | — | — |`);
        continue;
      }
      if (r.status === 'invalid') {
        out(`${head} | 無法計算：${r.message} | — | — | — | — | — | — | — | — | — | — | — | — |`);
        continue;
      }
      if (r.status === 'missing') {
        out(`${head} | 缺 VW（缺基團）：${cell(missingText(r.missing))} | — | — | — | — | — | — | — | — | — | — | — | — |`);
        continue;
      }
      const g = r.glassyFromTg;
      const vv = vols(it.smiles);
      const tgCell = g.status === 'ok' ? `${fx(g.tgK, 1)}${g.containsCalibrated ? '（含校準基團）' : ''}` : '缺 Tg';
      if (g.status === 'missing') noTg.push(it.name);
      out(
        `${head} | ${fx(r.vw)}${r.vwBondiSupplement ? ' ‡' : ''} | ${fx(r.glassy.molar, 4)} | ${fx(r.rubbery.molar, 4)} | ${sci(r.glassy.specific)} | ${sci(r.rubbery.specific)} | ${sci(r.glassy.alpha, 3)} | ${g.status === 'ok' ? sci(g.alpha, 3) : '缺 Tg'} | ${sci(r.rubbery.alpha, 3)} | ${sci(r.glassy.beta, 3)} | ${sci(r.rubbery.beta, 3)} | ${tgCell} | ${vv.va} | ${vv.vc} |`,
      );
    }
    out();
  }

  out('## 2. 缺基團與缺 Tg 明細（聚合物單元）');
  out();
  out('| 名稱 | 缺什麼 | 明細 |');
  out('|---|---|---|');
  let any = false;
  for (const it of items) {
    const r = computeCte(RDKit, it.smiles);
    if (r.status === 'missing') {
      any = true;
      out(`| ${cell(it.name)} | 缺 VW | ${cell(missingText(r.missing))} |`);
    } else if (r.status === 'ok' && r.glassyFromTg.status === 'missing') {
      any = true;
      out(`| ${cell(it.name)} | 缺 Tg（只缺式 4.27 的 α_g(b)） | ${cell(r.glassyFromTg.message)} |`);
    }
  }
  if (!any) out('| （無） | | |');
  out();

  out('## 3. 與書中 Table 4.12 對照（E_g、E_l 計算值，單位 10⁻⁴ cm³/mol/K）');
  out();
  out('「書中 calc.」為 Table 4.12 的計算值（整數）；「手算」＝係數 × 書中 VW；「程式」＝由 SMILES 算（VW 來自 Table 4.2 基團）；「實驗」為書中實驗值（只作比較，不當輸入）。「VW 差」＝程式 VW − 書中 VW。');
  out();
  out('| 聚合物 | 書中 VW | 程式 VW | VW 差 | E_g 書中 calc. | E_g 手算 | E_g 程式 | E_g 實驗 | E_l 書中 calc. | E_l 手算 | E_l 程式 | E_l 實驗 | 備註 |');
  out('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const big: string[] = [];
  for (const b of BOOK) {
    const hand = cteFromVw({ vw: b.vwBook, mass: null });
    const r = computeCte(RDKit, b.smiles);
    if (r.status !== 'ok') {
      out(`| ${b.name} | ${b.vwBook} | ${r.status === 'missing' ? '缺 VW' : '—'} | — | ${b.egCalc} | ${fx(hand.glassy.molar * 1e4, 1)} | — | ${b.egExp} | ${b.elCalc} | ${fx(hand.rubbery.molar * 1e4, 1)} | — | ${b.elExp} | 程式缺基團（見第 2 節）；手算與書中一致 |`);
      continue;
    }
    const dv = r.vw - b.vwBook;
    let note = '';
    if (r.vwBondiSupplement) {
      note = `${r.vwBondiNotes.join('；')}；VW 差 ${dv >= 0 ? '+' : ''}${dv.toFixed(2)}（${((dv / b.vwBook) * 100).toFixed(2)}%，只作驗證）`;
    } else if (Math.abs(dv) > 0.05) {
      note = `VW 差 ${dv >= 0 ? '+' : ''}${dv.toFixed(2)}（書中 Table 4.12 與 Table 4.2 基團值不一致，見報告）`;
      big.push(b.name);
    }
    out(`| ${b.name} | ${b.vwBook} | ${fx(r.vw)} | ${dv >= 0 ? '+' : ''}${dv.toFixed(2)} | ${b.egCalc} | ${fx(hand.glassy.molar * 1e4, 1)} | ${fx(r.glassy.molar * 1e4, 1)} | ${b.egExp} | ${b.elCalc} | ${fx(hand.rubbery.molar * 1e4, 1)} | ${fx(r.rubbery.molar * 1e4, 1)} | ${b.elExp} | ${note} |`);
  }
  out();
  out(`程式 VW 與書中 Table 4.12 的 VW 差超過 0.05 者：${big.join('、') || '（無）'}。用書中 VW 手算，E_g、E_l 全部與書中計算值一致到印刷捨入（0.5）。`);
  out();

  out('## 4. Example 4.2（書頁 101）：聚對苯二甲酸乙二酯');
  out();
  const pet = cteFromVw({ vw: 94.18, mass: 192.2 });
  out(`書中：E_g = 4.2×10⁻²、E_l = 9.4×10⁻² cm³/mol/K；e_l = 4.9×10⁻⁴、e_g = 2.2×10⁻⁴ cm³/g/K（M = 192.2）。手算（VW = 94.18）：E_g = ${fx(pet.glassy.molar, 4)}、E_l = ${fx(pet.rubbery.molar, 4)}；e_g = ${sci(pet.glassy.specific)}、e_l = ${sci(pet.rubbery.specific)}。`);
  out();

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
  void noTg;
} finally {
  await server.close();
}
