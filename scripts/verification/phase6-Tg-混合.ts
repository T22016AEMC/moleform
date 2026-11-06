// Phase 6.7 成分 Tg 與混合配方未固化 Tg 的輸出產生腳本（任務 034）。
// 成分 Tg 表、K 與資料點、文獻驗證（Pascault 1990、Han 1997）、使用者配方 4A／4B。只列程式輸出，不判斷化學（D17）。
// 分子量只列在這個驗證文件中，網站上不顯示（D09）。
// D02：使用者的兩個實測值只出現在第 6 節的「比對欄」，只用來和程式輸出並列，不是任何計算的輸入。
// 執行：npm run verify:phase6-tg-mix（Node 直接執行 .ts，只用可抹除的型別語法）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', 'phase6-Tg-混合-輸出.md');

const UNIT_A = '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O';
const UNIT_B = '[*:1]C([*:2])c1ccc2ccccc2c1';
const PGMA = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';
const SBI = 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2';
const PGMEA = 'COCC(C)OC(C)=O';
const NOVOLAC = '[*:1]Cc1cc([*:2])ccc1O';
const DGEBA_UNIT = '[*:1]Oc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC(O)C[*:2]';
const BADGE = 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1';
const BPA = 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1';
const TPP = 'c1ccc(P(c2ccccc2)c2ccccc2)cc1';
const MEK = 'CCC(C)=O';
// Pascault & Williams 1990 Fig. 6 的單體（結構看圖）
const PACM = 'NC1CCC(CC2CCC(N)CC2)CC1';
const DCM3 = 'CC1CC(CCC1N)CC1CCC(N)C(C)C1';
const MNDA = 'CC1(N)CCC(CC1)C(C)(C)N';
const YX4000H = 'Cc1cc(-c2cc(C)c(OCC3CO3)c(C)c2)cc(C)c1OCC1CO1';

// 僅供比對（D02）：使用者的未固化 DSC 實測，不是任何計算的輸入
const COMPARISON_ONLY_4A_C = 120;
const COMPARISON_ONLY_4B_C = 105;

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
  const tgm = await server.ssrLoadModule('/src/core/properties/tgMixing.ts');
  const { computeTg } = await server.ssrLoadModule('/src/core/properties/tgGroupContribution.ts');
  const { computeJoback } = await server.ssrLoadModule('/src/core/properties/jobackTbTf.ts');
  const data = await server.ssrLoadModule('/src/core/data/tgMnData.ts');
  const { analyzePolymerUnits } = await server.ssrLoadModule('/src/core/polymer/copolymer.ts');
  const { resolvePolymer } = await server.ssrLoadModule('/src/core/polymer/convert.ts');
  const { averageMolecularWeight } = await server.ssrLoadModule('/src/core/formulation/molecularWeight.ts');
  const { formatIssue } = await server.ssrLoadModule('/src/core/data/types.ts');
  const RDKit = await getRDKit();

  const points = data.readTgPoints(data.bundledTgPointsText);
  const kTable = data.readTgK(data.bundledTgKText);
  const tableIssues = [...points.issues, ...kTable.issues, ...data.validateTgTables(points, kTable)];
  if (tableIssues.length > 0) throw new Error(`資料表有問題：\n${tableIssues.map(formatIssue).join('\n')}`);
  const novolacK = kTable.rows.find((r: any) => r.resinClass === 'novolac_phenol_general');
  const dgebaK = kTable.rows.find((r: any) => r.resinClass === 'dgeba');

  const lines: string[] = [];
  const out = (text = '') => lines.push(text);
  const fx = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
  const cell = (text: string) => text.replace(/\|/g, '\\|');
  const C = 273.15;
  const comp = (id: string, name: string, smiles: string, amount: number, extra: any = {}) => ({ id, name, canonicalSmiles: smiles, category: 'Small Molecule', amount, ...extra });
  const tgOf = (smiles: string) => {
    const r = computeTg(RDKit, smiles);
    return r.status === 'ok' ? r : null;
  };

  out('# Phase 6.7 成分 Tg 與混合配方未固化 Tg 輸出（任務 034）');
  out();
  out('以下為程式輸出，未經化學判斷；分子量、Mn、K 只列在本文件供核對，網站上不顯示（D09）。');
  out();
  out('- 本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。可信度：參考趨勢。');
  out(`- 成分 Tg 的模型：聚合物 ${tgm.FOX_FLORY_MODEL}；${tgm.SMALL_MOLECULE_TG_MODEL}。`);
  out(`- **混合模型**：${tgm.FOX_MIX_MODEL}。這是唯一的混合式；Gordon–Taylor 的 k 只能靠膨脹係數（實驗量）決定，書中的 Simha–Boyer 規則（書頁 90、100）不得代入推新式，所以不做（使用者 2026-11-06 決定）。`);
  out('- 只混 Solid 區成分，用質量分率；Catalyst/Initiator（D26）、標記「揮發或分解」的成分、Liquid 區成分不混。任一參與混合的成分算不出 Tg → 回報「缺成分 Tg：名稱」，並另列去除該成分後的**部分混合值（非完整配方）**。');
  out('- **K 的規則**：按樹脂類別由文獻資料擬合，一部分資料當獨立檢驗，檢驗誤差 ≤ 20 K 才收錄（D54 精神）；沒有收錄的類別只輸出 Tg∞，標「缺 K，未做分子量修正」。不跨類別套用。聚苯乙烯的 K（Fox–Flory 1954：Tg = 373 − 1.0×10⁵/M，頁 316）不得套用到酚醛或 DGEBA。');
  out('- 重新產生：`npm run verify:phase6-tg-mix`。');
  out();

  // ---------- 1. 成分 Tg 表 ----------
  out('## 1. 成分 Tg 表');
  out();
  out('Tg∞ 兩個來源並列：(a) 基團貢獻（任務 026、033，含校準基團者標示）；(b) 文獻 Tg（僅有高分子量文獻點的類別；是實測點，不是外推的 Tg∞）。Mn 欄為本表示範用的假設值，用來展示 Fox–Flory，不是任何材料的實測值。');
  out();
  out('| 成分 | 類型 | Tg∞（a）基團貢獻（K） | Tg∞（b）文獻 Tg（K） | 類別與 K | Mn（g/mol） | Tg（K） | Tg（°C） | 標記 | 備註 |');
  out('|---|---|---|---|---|---|---|---|---|---|');
  const polyRows: { name: string; smiles: string; mn: number | null; note: string }[] = [
    { name: 'BT01 苯酚酚醛單元', smiles: NOVOLAC, mn: 780, note: '範圍下限' },
    { name: 'BT01 苯酚酚醛單元', smiles: NOVOLAC, mn: 1000, note: '範圍內' },
    { name: 'BT01 苯酚酚醛單元', smiles: NOVOLAC, mn: 1535, note: '範圍上限（950–1535 之間沒有一般型檢驗資料）' },
    { name: 'BT01 苯酚酚醛單元', smiles: NOVOLAC, mn: 3000, note: '超出範圍' },
    { name: 'BT01 苯酚酚醛單元', smiles: NOVOLAC, mn: 500, note: '低於範圍' },
    { name: 'BT05 DGEBA 類單元', smiles: DGEBA_UNIT, mn: 15000, note: '缺 K；只輸出 Tg∞' },
    { name: 'P 單元 A（雙酚茀）', smiles: UNIT_A, mn: null, note: '單一單元；P 實際是 A、B 共聚物，不處理' },
    { name: 'P 單元 B（萘基次甲基）', smiles: UNIT_B, mn: null, note: '缺基團' },
    { name: 'E PGMA 型環氧', smiles: PGMA, mn: 2250, note: '缺基團' },
  ];
  for (const p of polyRows) {
    const c = comp('x', p.name, p.smiles, 100, { category: 'Resin', polymer: p.mn === null ? undefined : { mnInput: p.mn } });
    const r = tgm.polymerComponentTg(RDKit, c, p.mn, 1);
    const lit = p.smiles === DGEBA_UNIT ? dgebaK.literatureTgK : null;
    const cls = tgm.findKClass(RDKit, p.smiles);
    const clsText = cls ? `${cls.resinClass}（${cls.state}${cls.k === null ? '' : `，K = ${cls.k}`}）` : '無對應類別';
    const tg = tgOf(p.smiles);
    const reason = r.status === 'ok' ? '' : `**缺成分 Tg**：${r.missingReason}`;
    out(`| ${p.name} | 聚合物 | ${fx(tg?.tgK ?? null, 2)}${tg?.containsCalibrated ? '（含校準基團）' : ''} | ${fx(lit, 2)} | ${cell(clsText)} | ${p.mn ?? '—'} | ${fx(r.tgK, 1)} | ${fx(r.tgK === null ? null : r.tgK - C, 1)} | ${r.flags.join('、') || '—'} | ${cell([p.note, reason].filter((x) => x).join('；'))} |`);
  }
  out();
  out('小分子：Tg = Tm 的 2/3，範圍 Tg/Tm = 0.56–0.76；Tm 用 Joback（D52）。文獻熔點（SBI 二酚：TCI 213–217 °C、Stueben 215.5–217 °C）只當比對，不當輸入。');
  out();
  out('| 成分 | SMILES | Joback Tm（K） | Tg = 2/3 Tm（K） | Tg 範圍 0.56–0.76（K） | Tg（°C） | 備註 |');
  out('|---|---|---|---|---|---|---|');
  const smalls: [string, string, string][] = [
    ['S SBI 二酚', SBI, '文獻熔點 215.5–217 °C（Stueben）= 488.7–490.3 K，只當比對；Joback 值高 245 K 以上'],
    ['BADGE', BADGE, ''],
    ['雙酚 A', BPA, ''],
    ['三苯基膦', TPP, '實際是 Catalyst/Initiator（D26），在配方中不混'],
    ['PGMEA', PGMEA, '溶劑，實際在 Liquid 區，不混；此列只示範小分子算法'],
    ['MEK', MEK, '溶劑，同上'],
    ['PACM', PACM, ''],
    ['3DCM', DCM3, ''],
    ['MNDA', MNDA, ''],
    ['YX-4000H', YX4000H, ''],
  ];
  const sbiTm = computeJoback(RDKit, SBI);
  for (const [name, smiles, note] of smalls) {
    const r = tgm.smallMoleculeComponentTg(RDKit, comp('x', name, smiles, 100), 1);
    if (r.status === 'ok') out(`| ${name} | \`${smiles}\` | ${fx(r.tmK)} | ${fx(r.tgK)} | ${fx(r.tgLowK)}–${fx(r.tgHighK)} | ${fx(r.tgK - C)} | ${cell(note)} |`);
    else out(`| ${name} | \`${smiles}\` | — | — | — | — | **缺成分 Tg**：${cell(r.missingReason)} |`);
  }
  out();
  out(`SBI 二酚的 Joback Tm = ${fx(sbiTm.tfK)} K，與文獻熔點相差很大：Joback 法對多環、剛性結構的熔點估算誤差本來就大（只當比對，不調整）。`);
  out();

  // ---------- 2. K 與資料點 ----------
  out('## 2. Fox–Flory 的 K（按樹脂類別）');
  out();
  out('| 類別 | 狀態 | 搭配的 Tg∞（K） | K（K·g/mol） | K 不確定度 | 適用 Mn | 可信度 | 擬合點 | 檢驗點 | 檢驗最大誤差（K） | 稽核狀態 |');
  out('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const k of kTable.rows) {
    out(`| ${k.resinClass}（${k.className}） | ${k.state === '收錄' ? '收錄' : '**缺 K，未做分子量修正**'} | ${fx(k.tgInfFixedK, 2)} | ${fx(k.k, 0)} | ${fx(k.kUncertainty, 0)} | ${k.mnMin === null ? '—' : `${k.mnMin}–${k.mnMax}`} | ${k.confidence || '—'} | ${k.fitPoints.join('、') || '—'} | ${k.checkPoints.join('、') || '—'} | ${fx(k.checkMaxErrorK, 1)} | ${k.audit} |`);
  }
  out();
  for (const k of kTable.rows) {
    out(`- **${k.resinClass}**：擬合方式：${k.fitMethod || '—'}`);
    out(`  - 出處：${k.source}`);
    out(`  - 備註：${k.notes}`);
  }
  out();
  out('### 2.1 資料點（`src/data/tg_mn_points.csv`）與 Fox–Flory 預測');
  out();
  out('預測 = 搭配的 Tg∞ − K/Mn（只有有 K 的類別）。誤差 = 預測 − 資料點。「排除」與「參考」的點不進擬合與檢驗，誤差只供參考。');
  out();
  out('| id | 材料 | Mn | Mn 類型 | Tg（K） | 不確定度（K） | 角色 | 量測方法 | 來源等級 | 換算標記 | 預測（K） | 誤差（K） | 出處 |');
  out('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of points.rows) {
    const usesNovolac = p.resinClass.startsWith('novolac');
    const pred = usesNovolac ? tgm.foxFlory(novolacK.tgInfFixedK, novolacK.k, p.mn) : null;
    out(`| ${p.id} | ${cell(p.material)} | ${p.mn} | ${cell(p.mnType)} | ${fx(p.tgK, 2)} | ${fx(p.uncertaintyK, 1)} | ${p.role} | ${cell(p.method)} | ${p.grade} | ${p.conversion || '—'} | ${fx(pred, 1)} | ${pred === null ? '缺 K' : fx(pred - p.tgK, 1)} | ${cell(p.source)} |`);
  }
  out();
  const kIndiv = novolacK.fitPoints.map((id: string) => {
    const p = points.rows.find((x: any) => x.id === id);
    return { id, k: (novolacK.tgInfFixedK - p.tgK) * p.mn };
  });
  out(`酚醛 K 逐點：${kIndiv.map((x: any) => `${x.id} = ${fx(x.k, 0)}`).join('、')}；平均 ${fx(kIndiv.reduce((s: number, x: any) => s + x.k, 0) / kIndiv.length, 0)}，不確定度取兩點差的一半。`);
  out();
  out('**誠實說明（酚醛 K，請審）**：');
  out('1. 「一般型」與「PAPS 型」的分類是看過資料後才切的；PAPS 型（Pilato Table 4.7 對位為主、二聚體多）排除，其中 Mn 340 的點與模型差 79 K、Mn 688 差 27 K，若不排除則檢驗不過 20 K。');
  out('2. Bian 的 780、824 Da 論文只寫「Da」，沒標 Mn 或 Mw；兩個樣品 Mn 幾乎相同，Tg 差 7.7 K 來自結構，兩點只能求 K，不能同時求 Tg∞。');
  out('3. Tg∞ = 415.93 K 是任務 033 含校準酚羥基的基團貢獻**外推值**；K 只能與此 Tg∞ 搭配，Tg∞ 改變時 K 必須重擬合。');
  out('4. 檢驗點是 Pilato（二手書）軟化點以 Bian 差值（48.9–56.6 K，平均 52.75）換算的 Tg，Mn 是聚苯乙烯換算的相對值；範圍內只有 Mn 864、950 兩點，Mn 631 在範圍外；950–1535 之間沒有一般型檢驗資料；上限 1535 是使用者設定，與被排除的 PAPS 點同值。');
  out('5. Kopf 區間（二手截圖，未交聯酚醛 45–70 °C、分子量約 500–5,000）與模型矛盾：Mn 500 時模型 ' + `${fx(tgm.foxFlory(novolacK.tgInfFixedK, novolacK.k, 500) - C, 0)} °C（低於區間），Mn 5000 時 ${fx(tgm.foxFlory(novolacK.tgInfFixedK, novolacK.k, 5000) - C, 0)} °C（高於區間）。` + '兩端都不在區間內，只列出，不用來調整任何數值。');
  out();
  out('### 2.2 Bicerano 式 6.11 的交叉比對（只看數量級，不當輸入、不用來收錄或否決 K）');
  out();
  out('van Krevelen 式 6.11：Kg = 0.002715·Tg(∞)³（書頁 147）。**圖 6.4 的說明寫 0.0002715，與式 6.11 和圖軸（Kg/1000 在 Tg(∞) = 500 K 約 340）不一致，是書中印刷不一致；本表用與圖軸一致的 0.002715。** 圖 6.4 的散布很大（35 個聚合物）。');
  out();
  out('| 類別 | 搭配的 Tg∞（K） | 表中 K | 式 6.11 的 Kg | 比值（式 6.11 ÷ 表中 K） |');
  out('|---|---|---|---|---|');
  const bic = 0.002715 * novolacK.tgInfFixedK ** 3;
  out(`| novolac_phenol_general | ${fx(novolacK.tgInfFixedK, 2)} | ${fx(novolacK.k, 0)} | ${fx(bic, 0)} | ${fx(bic / novolacK.k, 2)} |`);
  const dgebaTg = tgOf(DGEBA_UNIT);
  const bicD = 0.002715 * (dgebaTg?.tgK ?? 0) ** 3;
  out(`| dgeba（缺 K，僅供參考，不收錄） | ${fx(dgebaTg?.tgK ?? null, 2)}（基團貢獻） | — | ${fx(bicD, 0)} | — |`);
  out();

  // ---------- 3. DGEBA ----------
  out('## 3. DGEBA 類：Tg∞ 兩個來源與 EPON 順序檢查');
  out();
  out(`- Tg∞（a）基團貢獻（BT05 單元）：${fx(dgebaTg?.tgK ?? null, 2)} K（${fx((dgebaTg?.tgK ?? 0) - C, 1)} °C）。`);
  out(`- Tg∞（b）文獻：${fx(dgebaK.literatureTgK, 2)} K（約 98.5 °C，Kuo 2003 圖 5，Mn 23,000，是實測點，不是外推）；另有 96 °C（Mn 15,000，Corres 2011）。`);
  out(`- 差（a）−（b）：約 ${fx((dgebaTg?.tgK ?? 0) - dgebaK.literatureTgK, 1)} K（任務 033 第五節記為偏高 26–30 K）。**未調整任何 Yg 現有值。**`);
  out('- K：**缺 K**。兩個文獻點都在高分子量端，不能同時決定 Tg∞ 與 K，也沒有獨立檢驗點；低分子量寡聚物（n < 20）沒有任何 Tg 資料。');
  out();
  out('EPON 高低順序檢查（1001F < 1004F < 1007F，使用者 2026-11-06 決定只用來比順序，不換算 Tg、不入擬合）：');
  out();
  out('| 樹脂 | 平均 n（McAninch 2014 Table 4.1，二手整理表轉引） | Mn = n·M_unit + M_ends（g/mol） | 程式算出的 Tg |');
  out('|---|---|---|---|');
  const epon: [string, number][] = [['EPON 825', 0.04], ['EPON 834', 0.54], ['EPON 1001F', 2.52], ['EPON 1002F', 3.47], ['EPON 1004F', 4.81], ['EPON 1007F', 11.55], ['EPON 1009F', 18.34]];
  const endSpec = { end1: { smiles: '[*]CC1CO1' }, end2: { smiles: '[*]Oc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC1CO1' } };
  for (const [name, n] of epon) {
    const spec = { dpInput: n, endGroups: endSpec };
    const an = analyzePolymerUnits(RDKit, DGEBA_UNIT, spec);
    const res = an.ok ? resolvePolymer(spec, an.mUnit, { mEnds: an.mEnds ?? 0, filled: an.endsFilled ?? [false, false] }) : null;
    out(`| ${name} | ${n} | ${res?.ok ? fx(res.mn, 1) : '—'} | **缺 K，算不出** |`);
  }
  out();
  out('**結論：這個順序檢查做不了。** DGEBA 類沒有 K，Tg 只有 Tg∞ 一個值，無法比較 1001F、1004F、1007F 的高低，也沒有可比的 Tg 順序。');
  out();

  // ---------- 4. 文獻驗證 ----------
  out('## 4. 文獻驗證');
  out();
  out('規則：成分 Tg 必須由本卡方法得出，不得用論文中成分的實測 Tg 代入；無法由本卡方法算出者列「無法驗證」。');
  out();
  out('### 4.1 Pascault & Williams 1990，Table I 的未固化混合物 Tg0（期刊頁 92，PDF 第 8 頁）');
  out();
  out('Table I 的 Tg0 為文獻值（237、241、246、235 K）。**組成論文沒有寫質量分率**，本表假設為化學計量（環氧當量 = 胺氫當量；論文頁 92 討論的是化學計量混合物），質量分率由 EEW = M/2、AHEW = M/4 算出。環氧成分 DGEBA（n = 0.03、0.15）因 n 很小，視為小分子 BADGE 走「Tm 的 2/3」路線（若依 DGEBA 類寡聚物處理則缺 K，無法驗證）；這個處理是本表的選擇，不是論文的設定。DGEBA 的 n 只影響 EEW，不影響小分子 Tg。');
  out();
  out('| 系統 | 文獻 Tg0（K） | EEW（g/eq） | AHEW（g/eq） | 環氧質量分率 | 計算混合 Tg（K） | 範圍 0.56–0.76（K） | 誤差（K） | 備註 |');
  out('|---|---|---|---|---|---|---|---|---|');
  const unitM = (computeTg(RDKit, DGEBA_UNIT) as any).sumM as number;
  const badgeM = averageMolecularWeight(RDKit, BADGE) as number;
  const pas: [string, number, number, string, string][] = [
    ['DGEBA（n = 0.03）–PACM', 237, 0.03, PACM, 'PACM'],
    ['DGEBA（n = 0.03）–3DCM', 241, 0.03, DCM3, '3DCM'],
    ['DGEBA（n = 0.15）–3DCM', 246, 0.15, DCM3, '3DCM'],
    ['DGEBA（n = 0.15）–MNDA', 235, 0.15, MNDA, 'MNDA'],
  ];
  const validationErrors: number[] = [];
  for (const [name, lit, n, amine] of pas) {
    const eew = (badgeM + n * unitM) / 2;
    const ahew = (averageMolecularWeight(RDKit, amine) as number) / 4;
    const f = {
      schemaVersion: 1,
      name,
      solid: { unit: 'g', components: [comp('e', 'DGEBA（以 BADGE 計）', BADGE, eew), comp('a', '二胺', amine, ahew)] },
      liquid: { unit: 'g', components: [] },
    };
    const r = tgm.computeFormulationTg(RDKit, f);
    if (r.status === 'complete') {
      validationErrors.push(r.tgK - lit);
      out(`| ${name} | ${lit} | ${fx(eew, 1)} | ${fx(ahew, 1)} | ${fx(eew / (eew + ahew), 3)} | ${fx(r.tgK)} | ${fx(r.rangeK.low)}–${fx(r.rangeK.high)} | ${fx(r.tgK - lit)} | 文獻頁 92 |`);
    } else out(`| ${name} | ${lit} | ${fx(eew, 1)} | ${fx(ahew, 1)} | — | — | — | — | 無法驗證：${cell(r.messages.join('；'))} |`);
  }
  out();
  if (validationErrors.length > 0) out(`誤差 = 計算 − 文獻。四個系統的誤差為 ${validationErrors.map((e) => fx(e, 0)).join('、')} K；Joback Tm 的 2/3 對這些液態環氧與胺（Tm 本身不是它們的性質）給出的小分子 Tg 差很多，這是方法的限制，不調整任何數值。`);
  out();
  out('### 4.2 Han 等 1997（Bull. Korean Chem. Soc. 18(11) 1199–1203）圖 4 的 Tg0');
  out();
  out('圖 4（期刊頁 1201）的 Tg 對轉化率，淬冷至 −40 °C 後 5 °C/min 量測；低轉化端的虛線（模型曲線）外推到 α = 0 約 22 °C（圖上讀值，TPP 與 1B2MI 兩條線都收在約 22 °C，只能讀到約數）。直接量測點從 α ≈ 0.3 起，沒有 α = 0 的實測點。');
  out();
  const yx = tgm.smallMoleculeComponentTg(RDKit, comp('y', 'YX-4000H', YX4000H, 1), 1);
  out('| 成分 | 本卡方法的 Tg | 備註 |');
  out('|---|---|---|');
  out(`| YX-4000H（聯苯環氧，小分子） | ${yx.status === 'ok' ? `${fx(yx.tgK)} K（Joback Tm ${fx(yx.tmK)} K 的 2/3）` : '缺成分 Tg'} | 可算 |`);
  out('| Xylok（酚芳烷基酚醛寡聚物） | **缺成分 Tg** | 論文只畫結構（Table 1，期刊頁 1200，n 未給），沒有 Mn；不屬於已有 K 的樹脂類別（缺 K） |');
  out('| TPP／1B2MI（催化劑，1.5 phr） | 不混 | Catalyst/Initiator（D26） |');
  out();
  out('**無法驗證**：Xylok 沒有 Mn 也沒有 K，混合 Tg 算不出來；Han 的 Tg0 約 22 °C 只列為文獻值，不比較。');
  out();

  // ---------- 5. 排除規則示範 ----------
  out('## 5. 排除規則與缺成分 Tg 回報（示範）');
  out();
  out('| 情境 | 結果 |');
  out('|---|---|');
  const demo = (label: string, comps: any[], unit = 'g') => {
    const r = tgm.computeFormulationTg(RDKit, { schemaVersion: 1, name: label, solid: { unit, components: comps }, liquid: { unit: 'g', components: [] } });
    out(`| ${label} | 狀態 ${r.status}；${r.tgK === null ? '無完整混合值' : `混合 ${fx(r.tgK)} K`}${r.partial ? `；部分混合值 ${fx(r.partial.tgK)} K（非完整配方，已去除：${r.partial.removed.join('、')}）` : ''}；${cell(r.messages.join('；'))} |`);
  };
  demo('SBI 70 g＋MEK 30 g（兩個小分子，完整）', [comp('a', 'SBI', SBI, 70), comp('b', 'MEK', MEK, 30)]);
  demo('酚醛（Mn 1000）60 g＋SBI 40 g（完整）', [comp('n', '酚醛', NOVOLAC, 60, { category: 'Resin', polymer: { mnInput: 1000 } }), comp('a', 'SBI', SBI, 40)]);
  demo('DGEBA 類（缺 K）60 g＋SBI 40 g', [comp('d', 'DGEBA 類', DGEBA_UNIT, 60, { category: 'Resin', polymer: { mnInput: 3000 } }), comp('a', 'SBI', SBI, 40)]);
  demo('SBI 80 g＋TPP 10 g（Catalyst/Initiator）＋BADGE 10 g（揮發）', [comp('a', 'SBI', SBI, 80), comp('c', 'TPP', TPP, 10, { category: 'Catalyst/Initiator' }), comp('v', 'BADGE', BADGE, 10, { volatileFlag: true })]);
  out();

  // ---------- 6. 使用者配方 ----------
  out('## 6. 使用者配方 4A、4B（配方成分見 `phase4-測試體系.md`）');
  out();
  out('成分（使用者 2026-10-29 提供，2026-10-29 更新）：P 雙酚茀–萘甲醛型酚醛（單元 A：B = 2：1 的 Random 共聚物，Mw 6000、PDI 1.8）、E PGMA 型環氧寡聚物（Mw 4500、PDI 預設 2）、S SBI 雙酚（小分子）、PGMEA（Liquid，目標 Solid Content 4 %）。4A：P 80、E 20（wt%）；4B：P 79.2、E 19.8、S 1（wt%）。');
  out();
  const P = comp('P', 'P', UNIT_A, 0, {
    category: 'Resin',
    polymer: { mwInput: 6000, pdiInput: 1.8, fractionBasis: 'mol', units: [{ smiles: UNIT_A, fraction: 66.67 }, { smiles: UNIT_B, fraction: 33.33 }] },
  });
  const E = comp('E', 'E', PGMA, 0, { category: 'Resin', polymer: { mwInput: 4500 } });
  const S = comp('S', 'S', SBI, 0);
  const solvent = { id: 'L', name: 'PGMEA', canonicalSmiles: PGMEA, category: 'Solvent', amount: 100 };
  const mk = (name: string, parts: [any, number][]) => ({
    schemaVersion: 1,
    name,
    solid: { unit: 'wt', components: parts.map(([c, a]) => ({ ...c, amount: a })) },
    liquid: { unit: 'wt', components: [solvent] },
    targetSolidContentPct: 4,
    liquidFromTarget: true,
  });
  const cases: [string, any, number][] = [
    ['4A', mk('4A', [[P, 80], [E, 20]]), COMPARISON_ONLY_4A_C],
    ['4B（4A＋SBI）', mk('4B', [[P, 79.2], [E, 19.8], [S, 1]]), COMPARISON_ONLY_4B_C],
  ];
  out('| 配方 | 完整混合 Tg | 缺成分 Tg | 部分混合值（非完整配方） | 比對欄：使用者實測（中點，僅供比對，D02） | 差值 | 可能原因 |');
  out('|---|---|---|---|---|---|---|');
  const detail: string[] = [];
  for (const [label, f, measured] of cases) {
    const r = tgm.computeFormulationTg(RDKit, f);
    const partial = r.partial ? `${fx(r.partial.tgK)} K（${fx(r.partial.tgC)} °C），只混 ${r.partial.included.join('、')}，佔 Solid ${fx(r.partial.fraction * 100, 1)} %` : '無（沒有任何成分算得出 Tg）';
    out(`| ${label} | ${r.tgK === null ? '**無（配方不完整）**' : `${fx(r.tgK)} K`} | ${r.missing.join('、') || '—'} | ${partial} | 約 ${measured} °C | 無法比較（不是完整配方，部分混合值不可與實測比較） | 見下 |`);
    detail.push(`- **${label}**：${r.messages.map((m: string) => cell(m)).join('；')}`);
    for (const c of r.components) detail.push(`  - ${c.name}：${c.status === 'ok' ? `Tg ${fx(c.tgK)} K` : `缺成分 Tg（${c.missingReason}）`}${c.tgInfGroupK === null ? '' : `；Tg∞（a）${fx(c.tgInfGroupK, 1)} K`}`);
  }
  out();
  for (const d of detail) out(d);
  out();
  out('**可能原因（為何算不出完整值，推測，未驗證）**：');
  out('1. P 是兩種單元的共聚物：單元 B（萘基次甲基）書中沒有基團（缺基團），且本卡不處理共聚比例影響，也沒有共聚物的 K；酚醛的 K 只對「一般苯酚酚醛」（BT01 單元）收錄，不得套到 P（跨類別）。');
  out('2. E 是 PGMA 型：縮水甘油酯側鏈缺基團（任務 033 已記錄），且沒有 PGMA 類的 K。');
  out('3. 要讓 4A、4B 算出完整值，至少需要：單元 B 的基團（或校準）、PGMA 的基團、P 與 E 兩個類別的 Tg–Mn 資料與 K。不為了得到數字而放寬任何規則（使用者 2026-11-06 決定）。');
  out();

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, lines.join('\n') + '\n', 'utf8');
  console.log(`已寫入 ${OUTPUT}（${lines.length} 行）`);
} finally {
  await server.close();
}
