// Phase 6.7 成分 Tg 與混合配方未固化 Tg 的輸出產生腳本（任務 034，任務 035 增補甲酚酚醛、BPA 環氧鏈、ECN、PGMA）。
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
const ORTHO_CRESOL = '[*:1]Cc1cc([*:2])cc(C)c1O';
const PARA_CRESOL = '[*:1]Cc1cc(C)cc([*:2])c1O';
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
  const { fitFlory, predictFlory } = await server.ssrLoadModule('/src/core/properties/tgFit.ts');
  const { identifyCresolNovolac, CRESOL_NOVOLAC_SMARTS } = await server.ssrLoadModule('/src/core/properties/novolacUnits.ts');
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
  out(`- 成分 Tg 的模型：聚合物與寡聚物 ${tgm.FOX_FLORY_MODEL}；${tgm.SMALL_MOLECULE_TG_MODEL}。`);
  out(`- **混合模型**：${tgm.FOX_MIX_MODEL}。這是唯一的混合式；Gordon–Taylor 的 k 只能靠膨脹係數（實驗量）決定，書中的 Simha–Boyer 規則（書頁 90、100）不得代入推新式，所以不做（使用者 2026-11-06 決定）。`);
  out('- 只混 Solid 區的聚合物與寡聚物成分，用質量分率；**小分子（含 SBI 二酚）不參與混合**，輸出列為「未計入：成分名稱」並註明「' + tgm.SMALL_MOLECULE_WARNING + '」（D56）；Catalyst/Initiator（D26）、標記「揮發或分解」的成分、Liquid 區成分不混。任一參與混合的聚合物成分算不出 Tg → 回報「缺成分 Tg：名稱」，並另列去除該成分後的**部分混合值（非完整配方）**。');
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
  out('小分子不計算 Tg，只給 Tm（Joback，D52；有文獻熔點時另標文獻值）（D56）。Tg 欄回傳「' + tgm.SMALL_MOLECULE_TG_NA + '」。文獻熔點（SBI 二酚：TCI 213–217 °C、Stueben 215.5–217 °C）只當比對，不當輸入。');
  out();
  out('| 成分 | SMILES | Joback Tm（K） | Tg | 備註 |');
  out('|---|---|---|---|---|');
  const smalls: [string, string, string][] = [
    ['S SBI 二酚', SBI, '文獻熔點 215.5–217 °C（Stueben）= 488.7–490.3 K，只當比對；Joback 值高 245 K 以上（見 KNOWN_ISSUES）'],
    ['BADGE', BADGE, ''],
    ['雙酚 A', BPA, ''],
    ['三苯基膦', TPP, '實際是 Catalyst/Initiator（D26），在配方中不混'],
    ['PGMEA', PGMEA, '溶劑，實際在 Liquid 區，不混'],
    ['MEK', MEK, '溶劑，同上'],
    ['PACM', PACM, ''],
    ['3DCM', DCM3, ''],
    ['MNDA', MNDA, ''],
    ['YX-4000H', YX4000H, ''],
  ];
  const sbiTm = computeJoback(RDKit, SBI);
  for (const [name, smiles, note] of smalls) {
    const r = tgm.smallMoleculeComponentTg(RDKit, comp('x', name, smiles, 100), 1);
    out(`| ${name} | \`${smiles}\` | ${fx(r.tmK)} | ${r.missingReason} | ${cell(note)} |`);
  }
  out();
  out(`SBI 二酚的 Joback Tm = ${fx(sbiTm.tfK)} K，與文獻熔點（約 489 K）相差很大：Joback 法對大型剛性分子的熔點估算可能偏差很大（只當比對，不調整；記錄於 KNOWN_ISSUES）。`);
  out();

  // ---------- 2. K 與資料點 ----------
  out('## 2. Fox–Flory 的 K（按樹脂類別）');
  out();
  out('| 類別 | 狀態 | 搭配的 Tg∞（K） | K（K·g/mol） | K 不確定度 | 適用 Mn | 可信度 | 擬合點 | 檢驗點 | 檢驗最大誤差（K） | Tg∞ 來源 | 檢驗方式 | 稽核狀態 |');
  out('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const k of kTable.rows) {
    out(`| ${k.resinClass}（${k.className}） | ${k.state === '收錄' ? '收錄' : '**缺 K，未做分子量修正**'} | ${fx(k.tgInfFixedK, 2)} | ${fx(k.k, 0)} | ${fx(k.kUncertainty, 0)} | ${k.mnMin === null ? '—' : `${k.mnMin}–${k.mnMax}`} | ${k.confidence || '—'} | ${k.fitPoints.join('、') || '—'} | ${k.checkPoints.join('、') || '—'} | ${fx(k.checkMaxErrorK, 1)} | ${k.tgInfSource || '—'}${k.tgInfUncertaintyK === null ? '' : `（±${fx(k.tgInfUncertaintyK, 2)} K）`} | ${k.checkMode || '—'} | ${k.audit} |`);
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
  out('| id | 材料 | Mn | Mn 類型 | Mn 方法 | 端基 | Tg（K） | 不確定度（K） | 角色 | 量測方法 | 來源等級 | 換算標記 | 預測（K） | 誤差（K） | 出處 |');
  out('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const cresolRow = (cls: string) => kTable.rows.find((r: any) => r.resinClass === cls);
  for (const p of points.rows) {
    // 任務 034 的苯酚酚醛與 PAPS 點用苯酚酚醛 K；甲酚酚醛點用自己類別的 K；其他類別沒有 K
    const kRow = p.resinClass.startsWith('novolac_cresol') ? cresolRow(p.resinClass) : p.resinClass.startsWith('novolac') ? novolacK : null;
    const pred = kRow ? tgm.foxFlory(kRow.tgInfFixedK, kRow.k, p.mn) : null;
    out(`| ${p.id} | ${cell(p.material)} | ${p.mn} | ${cell(p.mnType)} | ${p.mnMethod} | ${cell(p.endGroup)} | ${fx(p.tgK, 2)} | ${fx(p.uncertaintyK, 1)} | ${p.role} | ${cell(p.method)} | ${p.grade} | ${p.conversion || '—'} | ${fx(pred, 1)} | ${pred === null ? (p.resinClass === 'ecn' || p.resinClass === 'pgma_gma_polymer' ? '不擬合（只登錄）' : '缺 K') : fx(pred - p.tgK, 1)} | ${cell(p.source)} |`);
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
  out('**結論：這個順序檢查做不了。** DGEBA 類沒有 K，Tg 只有 Tg∞ 一個值，無法比較 1001F、1004F、1007F 的高低，也沒有可比的 Tg 順序。（任務 035 另以「參考擬合」做了一次順序檢查，結果標「參考，未收錄」，見第 8 節；它不改變上面的結論。）');
  out();

  // ---------- 4. 文獻驗證 ----------
  out('## 4. 文獻驗證');
  out();
  out('規則：成分 Tg 必須由本卡方法得出，不得用論文中成分的實測 Tg 代入；無法由本卡方法算出者列「無法驗證」。');
  out();
  out('### 4.1 Pascault & Williams 1990，Table I 的未固化混合物 Tg0（期刊頁 92，PDF 第 8 頁）');
  out();
  out('Table I 的 Tg0 為文獻值（237、241、246、235 K）。這 4 個系統的成分是 DGEBA（n = 0.03、0.15）與脂環族二胺（PACM、3DCM、MNDA），**全部是小分子**。小分子不計算 Tg，只給 Tm（D56），不參與 Fox 混合，所以這 4 列**無法驗證（小分子不計 Tg）**。');
  out();
  out('| 系統 | 文獻 Tg0（K） | 計算混合 Tg | 誤差 | 備註 |');
  out('|---|---|---|---|---|');
  for (const [name, lit] of [['DGEBA（n = 0.03）–PACM', 237], ['DGEBA（n = 0.03）–3DCM', 241], ['DGEBA（n = 0.15）–3DCM', 246], ['DGEBA（n = 0.15）–MNDA', 235]] as [string, number][]) {
    out(`| ${name} | ${lit} | — | — | 無法驗證（小分子不計 Tg） |`);
  }
  out();
  out('**原因與歷史說明**：任務 034 原先以「小分子 Tg ≈ Tm 的 2/3」把 BADGE（以 BADGE 代表 n = 0.03、0.15 的 DGEBA）與二胺算成 Tg，與文獻的差約 +92 至 +103 K。該算法已於 2026-11-06 作廢（D56）：Joback 的 Tm 對這些常溫為液態的環氧與胺不代表它們的性質，2/3 規則對小分子液體本來就不適用。本節不再列出誤差，也不把它視為方法的驗證結果。若要驗證，需要寡聚物成分（n 較大且有 K 的樹脂類別）的資料，目前 DGEBA 類缺 K。');
  out();
  out('### 4.2 Han 等 1997（Bull. Korean Chem. Soc. 18(11) 1199–1203）圖 4 的 Tg0');
  out();
  out('圖 4（期刊頁 1201）的 Tg 對轉化率，淬冷至 −40 °C 後 5 °C/min 量測；低轉化端的虛線（模型曲線）外推到 α = 0 約 22 °C（圖上讀值，TPP 與 1B2MI 兩條線都收在約 22 °C，只能讀到約數）。直接量測點從 α ≈ 0.3 起，沒有 α = 0 的實測點。');
  out();
  out('| 成分 | 本卡方法的 Tg | 備註 |');
  out('|---|---|---|');
  out('| YX-4000H（聯苯環氧，小分子） | 未計入 | 小分子不計 Tg（D56），不參與混合 |');
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
  demo('SBI 70 g＋MEK 30 g（兩個小分子）', [comp('a', 'SBI', SBI, 70), comp('b', 'MEK', MEK, 30)]);
  demo('酚醛（Mn 1000）60 g＋SBI 40 g（SBI 未計入）', [comp('n', '酚醛', NOVOLAC, 60, { category: 'Resin', polymer: { mnInput: 1000 } }), comp('a', 'SBI', SBI, 40)]);
  demo('DGEBA 類（缺 K）60 g＋SBI 40 g（SBI 未計入）', [comp('d', 'DGEBA 類', DGEBA_UNIT, 60, { category: 'Resin', polymer: { mnInput: 3000 } }), comp('a', 'SBI', SBI, 40)]);
  demo('酚醛（Mn 1000）80 g＋TPP 10 g（Catalyst/Initiator）＋BADGE 10 g（揮發）', [comp('n', '酚醛', NOVOLAC, 80, { category: 'Resin', polymer: { mnInput: 1000 } }), comp('c', 'TPP', TPP, 10, { category: 'Catalyst/Initiator' }), comp('v', 'BADGE', BADGE, 10, { volatileFlag: true })]);
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
    for (const c of r.components) detail.push(`  - ${c.name}：${c.status === 'ok' ? `Tg ${fx(c.tgK)} K` : c.status === 'not-applicable' ? `Tg ${c.missingReason}；Joback Tm ${fx(c.tmK)} K（未計入）` : `缺成分 Tg（${c.missingReason}）`}${c.tgInfGroupK === null ? '' : `；Tg∞（a）${fx(c.tgInfGroupK, 1)} K`}`);
  }
  out();
  for (const d of detail) out(d);
  out();
  out('**可能原因（為何算不出完整值，推測，未驗證）**：');
  out('1. P 是兩種單元的共聚物：單元 B（萘基次甲基）書中沒有基團（缺基團），且本卡不處理共聚比例影響，也沒有共聚物的 K；酚醛的 K 只對「一般苯酚酚醛」（BT01 單元）收錄，不得套到 P（跨類別）。');
  out('2. E 是 PGMA 型：縮水甘油酯側鏈缺基團（任務 033 已記錄），且沒有 PGMA 類的 K。');
  out('3. 4B 的 SBI 是小分子，不計 Tg、不參與混合，輸出「未計入：S」，並註明「' + tgm.SMALL_MOLECULE_WARNING + '」（D56）；因此 4B 沒有任何部分混合值（先前的 489.7 K 已取消）。');
  out('4. 要讓 4A、4B 算出完整值，至少需要：單元 B 的基團（或校準）、PGMA 的基團、P 與 E 兩個類別的 Tg–Mn 資料與 K。不為了得到數字而放寬任何規則（使用者 2026-11-06 決定）。');
  out();


  // ---------- 7. 甲酚酚醛（任務 035） ----------
  const pts = (cls: string) => points.rows.filter((p: any) => p.resinClass === cls);
  const toFit = (rows: any[]) => rows.map((p) => ({ mn: p.mn, tgK: p.tgK }));
  const sg = (v: number, d = 2) => (v >= 0 ? '+' : '') + fx(v, d);
  const oRows = pts('novolac_cresol_ortho');
  const pRows = pts('novolac_cresol_para');
  const fo = fitFlory(toFit(oRows));
  const fp = fitFlory(toFit(pRows));
  const fpool = fitFlory(toFit([...oRows, ...pRows]));
  const oK = cresolRow('novolac_cresol_ortho');
  const pK = cresolRow('novolac_cresol_para');
  out('## 7. 甲酚酚醛（任務 035，Lin-Gibson 2001，鄰位、對位各自擬合）');
  out();
  out('資料：Lin-Gibson 2001（Virginia Tech 博士論文）Chapter 3 Table 3.6，論文內頁碼 103；**二手整理，使用者 2026-11-06 核對原文後提供**（docs/references 內沒有此論文 PDF，未能看圖核對，數字照任務卡入庫）。未固化樹脂（非環氧化），以 2,6-二甲基酚封端，Mn 由 ¹³C NMR 計算，Tg 為 DSC 中點（20 → 180 °C；Chapter 3 的升溫速率未確認）。Tg 原表為 °C，加 273.15 轉 K。**四點的 Mn 方法都是 NMR，沒有與其他 Mn 方法的資料混合。**');
  out();
  out('### 7.1 各自的線性回歸（Tg 對 1/Mn，Tg∞ 與 K 同時求，4 點 2 參數）');
  out();
  out('| 類別 | n | Tg∞（K） | Tg∞（°C） | Tg∞ 標準誤差（K） | K（K·g/mol） | K 標準誤差 | R² | 殘差標準差（K） | 殘差（K，資料 − 擬合，依 Mn 由小到大） |');
  out('|---|---|---|---|---|---|---|---|---|---|');
  for (const [name, f, rows] of [['鄰甲酚酚醛 novolac_cresol_ortho', fo, oRows], ['對甲酚酚醛 novolac_cresol_para', fp, pRows]] as [string, any, any[]][]) {
    out(`| ${name} | ${f.n} | ${fx(f.tgInfK, 2)} | ${fx(f.tgInfK - C, 2)} | ${fx(f.seTgInf, 2)} | ${fx(f.k, 0)} | ${fx(f.seK, 0)} | ${fx(f.r2, 4)} | ${fx(f.residualSd, 2)} | ${rows.map((p, i) => `Mn ${p.mn}：${sg(f.residuals[i])}`).join('；')} |`);
  }
  out();
  out('**線性檢查**：');
  const linSlope = (f: any, a: number, b: number) => f.k * (1 / a - 1 / b);
  out(`- 鄰位 Mn 1380 → 2250：資料升 ${fx(oRows[3].tgK - oRows[2].tgK, 1)} K，回歸線預測升 ${fx(linSlope(fo, 1380, 2250), 1)} K，差 ${sg(oRows[3].tgK - oRows[2].tgK - linSlope(fo, 1380, 2250), 1)} K（這兩點的殘差只有 ${sg(fo.residuals[2])}、${sg(fo.residuals[3])} K）：沒有看到曲率。`);
  out(`- 對位 Mn 1460 → 2150：資料升 ${fx(pRows[3].tgK - pRows[2].tgK, 1)} K，回歸線預測升 ${fx(linSlope(fp, 1460, 2150), 1)} K。對位最大殘差 ${sg(fp.residuals[1])} K（Mn 1010），其餘 ≤ ${fx(Math.max(...[0, 2, 3].map((i) => Math.abs(fp.residuals[i]))), 2)} K；殘差符號依 Mn 排列為「+、−、+、+」，不是單調的曲率型態。`);
  out('- 限制：每類只有 4 點，無法可靠檢定曲率（二次項會用掉一半自由度）；上述只是殘差檢視，**不是統計檢定**。任務卡規定「回歸明顯非線性」才需停下來問；本資料殘差都在 8 K 內，未見明顯非線性。');
  out();
  out('### 7.2 獨立檢驗（異構物互檢：用一個異構物的擬合預測另一個異構物的 4 點，以另一個自己的 Mn）');
  out();
  out('| 預測所用的擬合 | 被預測的點 | Mn | 預測（K） | 資料（K） | 誤差 = 預測 − 資料（K） |');
  out('|---|---|---|---|---|---|');
  const crossErr: Record<string, number> = {};
  for (const [label, f, target, key] of [['鄰位擬合 → 對位', fo, pRows, 'ortho→para'], ['對位擬合 → 鄰位', fp, oRows, 'para→ortho']] as [string, any, any[], string][]) {
    let mx = 0;
    for (const p of target) {
      const pr = predictFlory(f, p.mn);
      mx = Math.max(mx, Math.abs(pr - p.tgK));
      out(`| ${label} | ${p.id} | ${p.mn} | ${fx(pr, 2)} | ${fx(p.tgK, 2)} | ${sg(pr - p.tgK)} |`);
    }
    crossErr[key] = mx;
  }
  out();
  out(`最大誤差：鄰位擬合預測對位 ${fx(crossErr['ortho→para'], 2)} K；對位擬合預測鄰位 ${fx(crossErr['para→ortho'], 2)} K；**都 ≤ 20 K（D54）**，兩類別都收錄（稽核狀態「待使用者審」，可信度「低可信度」）。資料表記錄的檢驗最大誤差：鄰位 ${fx(oK.checkMaxErrorK, 1)}、對位 ${fx(pK.checkMaxErrorK, 1)}。`);
  out();
  out('注意：這是異構物之間的互檢，不是同一類別內的獨立資料；兩者同來源、同方法（NMR）、同封端，共同的系統誤差（例如升溫速率）檢驗不到。互檢只用於判斷擬合是否合理，**K 不跨類別使用**：鄰位的 K 只用在鄰位單元，對位的 K 只用在對位單元（程式用 SMARTS 辨識，辨識不出的單元缺 K）。');
  out();
  out('### 7.3 合併擬合是否可行（只報告，是否合併由使用者決定，表中仍分開）');
  out();
  const dInf = fo.tgInfK - fp.tgInfK;
  const seInf = Math.hypot(fo.seTgInf, fp.seTgInf);
  const dK = fo.k - fp.k;
  const seK = Math.hypot(fo.seK, fp.seK);
  out('| 項目 | 鄰位 | 對位 | 差（鄰 − 對） | 差的標準誤差 | 差 ÷ 標準誤差 | 合併擬合（8 點） | 合併標準誤差 |');
  out('|---|---|---|---|---|---|---|---|');
  out(`| Tg∞（K） | ${fx(fo.tgInfK, 2)} | ${fx(fp.tgInfK, 2)} | ${sg(dInf)} | ${fx(seInf, 2)} | ${sg(dInf / seInf)} | ${fx(fpool.tgInfK, 2)} | ${fx(fpool.seTgInf, 2)} |`);
  out(`| K（K·g/mol） | ${fx(fo.k, 0)} | ${fx(fp.k, 0)} | ${sg(dK, 0)} | ${fx(seK, 0)} | ${sg(dK / seK)} | ${fx(fpool.k, 0)} | ${fx(fpool.seK, 0)} |`);
  out();
  out(`合併擬合：R² = ${fx(fpool.r2, 4)}，殘差標準差 ${fx(fpool.residualSd, 2)} K，殘差（依鄰位 490…2250、對位 510…2150 順序）：${fpool.residuals.map((r: number) => sg(r, 1)).join('、')} K。Tg∞ 與 K 的差約 ${fx(Math.abs(dInf / seInf), 1)}σ、${fx(Math.abs(dK / seK), 1)}σ（不顯著），所以**統計上合併可行**；但每類只有 4 點，標準誤差本來就大（對位 Tg∞ ±${fx(fp.seTgInf, 1)} K），這不足以證明兩個異構物相同；合併後的最大殘差 ${fx(Math.max(...fpool.residuals.map(Math.abs)), 1)} K，也比鄰位自己的擬合（最大 ${fx(Math.max(...fo.residuals.map(Math.abs)), 1)} K）大。**不替使用者決定合併**，表中維持分開。`);
  out();
  out('### 7.4 與 034 苯酚酚醛並列（只寫差異，不調整任何現有值）');
  out();
  out('| 項目 | 苯酚酚醛一般型（034） | 鄰甲酚酚醛（035） | 對甲酚酚醛（035） |');
  out('|---|---|---|---|');
  out(`| Tg∞（K） | ${fx(novolacK.tgInfFixedK, 2)}（基團貢獻固定，外推值） | ${fx(fo.tgInfK, 2)}（擬合） | ${fx(fp.tgInfK, 2)}（擬合） |`);
  out(`| K（K·g/mol） | ${fx(novolacK.k, 0)} | ${fx(fo.k, 0)} | ${fx(fp.k, 0)} |`);
  out(`| Mn 範圍 | ${novolacK.mnMin}–${novolacK.mnMax} | ${oK.mnMin}–${oK.mnMax} | ${pK.mnMin}–${pK.mnMax} |`);
  out('| Mn 方法 | 未標明（Bian）；檢驗點為 PS 換算相對值 | NMR | NMR |');
  out('| 端基 | 未查 | 2,6-二甲基酚封端 | 2,6-二甲基酚封端 |');
  out('| 資料等級 | 一手（擬合）＋二手換算（檢驗）；低可信度 | 二手（使用者核對原文）；低可信度 | 同左 |');
  for (const m of [780, 1000, 1535]) {
    out(`| Tg 預測 Mn ${m}（K） | ${fx(tgm.foxFlory(novolacK.tgInfFixedK, novolacK.k, m), 1)} | ${fx(predictFlory(fo, m), 1)} | ${fx(predictFlory(fp, m), 1)} |`);
  }
  out();
  out(`差異：甲酚酚醛的 K 約為苯酚酚醛的 ${fx(fo.k / novolacK.k, 2)}–${fx(fp.k / novolacK.k, 2)} 倍；Tg∞ 比苯酚酚醛的基團貢獻值低約 ${fx(novolacK.tgInfFixedK - fp.tgInfK, 0)}–${fx(novolacK.tgInfFixedK - fo.tgInfK, 0)} K；在 Mn 780–1535 內，甲酚酚醛的預測 Tg 比苯酚酚醛高（表中三個 Mn）。三者的 Tg∞ 取得方式不同（034 固定為基團貢獻值，035 為擬合值），Mn 方法與端基也不同，**不能互相套用，也不能拿這個差異推論甲基的效應**（資料只有這幾點）。`);
  out();
  out('### 7.5 成分 Tg 計算：用 Lin-Gibson 的 Mn 當輸入（**這是擬合殘差，不是獨立驗證**）');
  out();
  out('這 8 個資料點就是擬合用的點；程式算出的成分 Tg 與文獻 Tg 的差等於回歸殘差（表中 K、Tg∞ 為四捨五入值，差異在 0.1 K 內），只說明程式照表中的 Tg∞、K 算對了，**不是對模型的獨立驗證**（獨立檢驗見 7.2）。');
  out();
  out('| 單元 | Mn | 程式成分 Tg（K） | 文獻 Tg（K） | 差 = 程式 − 文獻（K） | 標記 |');
  out('|---|---|---|---|---|---|');
  for (const [unit, rows] of [[ORTHO_CRESOL, oRows], [PARA_CRESOL, pRows]] as [string, any[]][]) {
    for (const p of rows) {
      const c = comp('x', 'LG', unit, 100, { category: 'Resin', polymer: { mnInput: p.mn } });
      const r = tgm.polymerComponentTg(RDKit, c, p.mn, 1);
      out(`| ${p.resinClass} | ${p.mn} | ${fx(r.tgK, 2)} | ${fx(p.tgK, 2)} | ${r.tgK === null ? '—' : sg(r.tgK - p.tgK)} | ${r.flags.join('、') || '—'} |`);
    }
  }
  out();
  out('Mn 範圍外的輸出（示範標記）：');
  out();
  out('| 單元 | Mn | 成分 Tg（K） | 標記 |');
  out('|---|---|---|---|');
  for (const [name, unit] of [['鄰', ORTHO_CRESOL], ['對', PARA_CRESOL]] as [string, string][]) {
    for (const m of [400, 3000]) {
      const r = tgm.polymerComponentTg(RDKit, comp('x', name, unit, 100, { category: 'Resin', polymer: { mnInput: m } }), m, 1);
      out(`| ${name}甲酚酚醛 | ${m} | ${fx(r.tgK, 1)} | ${r.flags.join('、') || '—'} |`);
    }
  }
  out();
  out('### 7.6 類別辨識（SMARTS，自行撰寫，D22；請使用者審化學正確性）');
  out();
  out('| 標籤 | SMARTS |');
  out('|---|---|');
  for (const r of CRESOL_NOVOLAC_SMARTS) out(`| ${r.label}（${r.resinClass}） | \`${r.smarts}\` |`);
  out();
  out('整個單元必須被 SMARTS 完整涵蓋（匹配原子數等於單元原子數）；命中結果列表：');
  out();
  out('| 單元 SMILES | 說明 | 辨識結果 | 預期 |');
  out('|---|---|---|---|');
  const cases7: [string, string, string | null][] = [
    [ORTHO_CRESOL, '鄰甲酚酚醛單元', 'novolac_cresol_ortho'],
    ['[*:1]c1cc(C[*:2])cc(C)c1O', '鄰甲酚酚醛（另一種切法）', 'novolac_cresol_ortho'],
    [PARA_CRESOL, '對甲酚酚醛單元', 'novolac_cresol_para'],
    [NOVOLAC, '反例：苯酚酚醛', null],
    ['[*:1]Cc1cc([*:2])c(C)cc1O', '反例：間甲酚型', null],
    ['[*:1]Cc1cc(C)c(O)c(C)c1', '反例：2,6-二甲酚', null],
    [UNIT_A, '反例：雙酚茀單元', null],
    ['[*:1]Cc1cc2ccccc2c([*:2])c1O', '反例：萘酚酚醛', null],
    [DGEBA_UNIT, '反例：DGEBA 單元', null],
    [PGMA, '反例：PGMA 單元', null],
  ];
  for (const [smi, desc, expected] of cases7) {
    const got = identifyCresolNovolac(RDKit, smi);
    out(`| \`${smi}\` | ${desc} | ${got ?? '未辨識'} | ${expected ?? '未辨識'}${got === expected ? '' : '（**不符**）'} |`);
    if (got !== expected) throw new Error(`SMARTS 辨識與預期不符：${smi}`);
  }
  out();

  // ---------- 8. BPA 環氧鏈 ----------
  const bpaRows = ['EP.BPA720', 'DG.PX15K', 'DG.PX23K'].map((id) => points.rows.find((p: any) => p.id === id));
  const fb = fitFlory(toFit(bpaRows));
  out('## 8. BPA 環氧鏈（dgeba）：參考擬合與 EPON 順序檢查（**參考，未收錄**）');
  out();
  out('資料點：EP3874001A1（Allnex 2021，二手整理，使用者核對原文後提供；頁碼任務卡未提供）雙酚 A 環氧 Mn 720、Tg 38 °C；苯氧樹脂兩點（Corres 2011：Mn 1.5×10⁴、96 °C；Kuo 2003 圖 5：Mn 2.3×10⁴、約 98.5 °C）。docs/references 內沒有 EP3874001A1 的 PDF，未核對。');
  out();
  out('| 點 | Mn | Mn 方法 | Tg（K） | 擬合殘差（K） |');
  out('|---|---|---|---|---|');
  bpaRows.forEach((p: any, i: number) => out(`| ${p.id} | ${p.mn} | ${p.mnMethod} | ${fx(p.tgK, 2)} | ${sg(fb.residuals[i])} |`));
  out();
  out(`參考擬合（3 點 2 參數，只剩 1 個自由度）：Tg∞ = ${fx(fb.tgInfK, 2)} K（${fx(fb.tgInfK - C, 1)} °C）、K = ${fx(fb.k, 0)} K·g/mol、R² = ${fx(fb.r2, 4)}；標準誤差 Tg∞ ±${fx(fb.seTgInf, 1)} K、K ±${fx(fb.seK, 0)}（只有 1 個自由度，標準誤差幾乎沒有統計意義）。**沒有獨立檢驗點，依任務卡規則不收錄 K，tg_flory_k.csv 的 dgeba 維持「缺 K」。**`);
  out();
  out('**Mn 方法差異（「Mn 方法不同不得混擬合」的規則在此被刻意違反，僅限這張參考表）**：EP3874001A1 是 GPC-PS（聚苯乙烯標準）；Corres 苯氧樹脂是 GPC，THF 溶劑（標註 GPC-THF，校正標準未載）；Kuo 苯氧樹脂的 Mn 方法未標明。任務卡 C 節要求以這三點擬合並列出差異，所以做了；**因方法不同，這個擬合只能當參考，不能當作 K。**另外 720 是唯一的低 Mn 點，Tg∞ 與 K 幾乎全由它與高 Mn 點的差決定。');
  out();
  out('EPON 順序檢查（Mn 由 McAninch 2014 Table 4.1 的平均 n 計算，方法同第 3 節；Tg 由上面的參考擬合算出）：');
  out();
  out('| 樹脂 | 平均 n | Mn（g/mol） | 參考擬合 Tg（K） | 參考擬合 Tg（°C） | AI 整理截圖的軟化點（只比順序，不是 Tg） |');
  out('|---|---|---|---|---|---|');
  const eponCheck: [string, number, string][] = [['EPON 1001F', 2.52, '75–80 °C（ASTM D3461）'], ['EPON 1004F', 4.81, '約 96 °C（TDS 未註明方法）'], ['EPON 1007F', 11.55, '120–130 °C（ASTM D3461）']];
  const eponTg: number[] = [];
  for (const [name, n, soft] of eponCheck) {
    const spec = { dpInput: n, endGroups: endSpec };
    const an = analyzePolymerUnits(RDKit, DGEBA_UNIT, spec);
    const res = an.ok ? resolvePolymer(spec, an.mUnit, { mEnds: an.mEnds ?? 0, filled: an.endsFilled ?? [false, false] }) : null;
    const tg = res?.ok ? predictFlory(fb, res.mn) : null;
    if (tg !== null) eponTg.push(tg);
    out(`| ${name} | ${n} | ${res?.ok ? fx(res.mn, 1) : '—'} | ${fx(tg, 1)} | ${fx(tg === null ? null : tg - C, 1)} | ${soft} |`);
  }
  out();
  const ordered = eponTg.length === 3 && eponTg[0] < eponTg[1] && eponTg[1] < eponTg[2];
  out(`**順序檢查結果：1001F < 1004F < 1007F ${ordered ? '成立' : '不成立'}**（${eponTg.map((t) => fx(t - C, 1) + ' °C').join(' < ')}），與 AI 整理截圖的軟化點順序（75–80 < 約 96 < 120–130 °C）${ordered ? '一致' : '不一致'}。標「參考，未收錄」。`);
  out('提醒：只要 K > 0，Fox–Flory 對 Mn 單調遞增，順序成立是公式形式的必然結果，**不構成對 K 的檢驗**；這個檢查只能排除 K 為負或程式算錯 Mn。這三個 Mn 都在 720 與 15,000 之間，沒有任何實測 Tg 可比（軟化點不是 Tg，不換算）。');
  out();
  const bt05 = tgOf(DGEBA_UNIT);
  out(`**與 BT05 基團貢獻值比較（不調整任何現有值）**：BT05 單元的 Tg∞（a）= ${fx(bt05?.tgK ?? null, 2)} K（${fx((bt05?.tgK ?? 0) - C, 1)} °C）；參考擬合 Tg∞ = ${fx(fb.tgInfK, 2)} K（${fx(fb.tgInfK - C, 1)} °C）；差（BT05 − 參考擬合）= ${fx((bt05?.tgK ?? 0) - fb.tgInfK, 1)} K。與 033、034 記錄的「基團貢獻偏高約 27 K（相對 Mn 23,000 的實測點）」同方向、同量級；本卡未更動任何 Yg 值。`);
  out();

  // ---------- 9. ECN 與 PGMA ----------
  const ecn = points.rows.find((p: any) => p.id === 'EP.ECN853');
  const lgO930 = points.rows.find((p: any) => p.id === 'LG.O930');
  const g1 = points.rows.find((p: any) => p.id === 'GM.E1');
  const g2 = points.rows.find((p: any) => p.id === 'GM.E2');
  out('## 9. ECN 與 PGMA：只登錄與觀察，不擬合');
  out();
  out('### 9.1 ECN（甲酚酚醛環氧）');
  out();
  out(`EP3874001A1：ECN Tg ${fx(ecn.tgK, 2)} K（45.5 °C）、Mn 853（GPC-PS）、EEW 205、平均官能度 4.2；一個點，**不擬合**。與同 Mn 範圍的鄰甲酚酚醛（Lin-Gibson，Mn 930，NMR，Tg ${fx(lgO930.tgK, 2)} K = 76 °C）比較：ECN 低 ${fx(lgO930.tgK - ecn.tgK, 1)} K，且 ECN 的 Mn 還略小（853 對 930）。觀察：**環氧化（酚羥基變為縮水甘油醚）的樹脂 Tg 較低**；Mn 差只有約 8 %，用本卡鄰位 K 估計約 ${fx(predictFlory(fo, 930) - predictFlory(fo, 853), 1)} K，遠小於 ${fx(lgO930.tgK - ecn.tgK, 1)} K，所以 Mn 差不是主因（此為本表數字的比較，非機理證明）。限制：兩者 Mn 方法不同（GPC-PS 對 NMR）、Tg 條件不同（10 °C/min 對 Chapter 3 未確認）、不同來源、ECN 的甲酚異構物組成未載；差值只能當定性觀察，**不推導 K，也不得把甲酚酚醛的 K 套到 ECN**。專利另列 ECN／EPN 適用範圍（Tg 38–53 °C、Mn 700–2000、EEW 190–230、官能度 3–6）是範圍，沒有擬合。`);
  out();
  out('### 9.2 PGMA（GMA 聚合物，EP1196508A1）');
  out();
  out('| 點 | Mn（GPC-PS） | Mw | Tg（K） | Tg（°C） | 環氧值（eq/kg） |');
  out('|---|---|---|---|---|---|');
  out(`| Example 1（${g1.id}） | ${g1.mn} | 7147 | ${fx(g1.tgK, 2)} | 31 | 6.44 |`);
  out(`| Example 2（${g2.id}） | ${g2.mn} | 6099 | ${fx(g2.tgK, 2)} | 42 | 6.39 |`);
  out();
  out('**為何不符合 Fox–Flory，所以不擬合**：(1) Mn 較高的 Example 1（2986）Tg 反而較低（31 對 42 °C），與 Fox–Flory（Mn 增加 Tg 上升）方向相反，兩點硬擬合會得到負的 K；(2) 合成配方含烯丙基縮水甘油醚當鏈終止劑，端基與鏈結構不是純 PGMA，且 Mw/Mn 約 2.4 與 4.7，分子量分布差很多，Tg 受端基與分布的影響不能用單一 Mn 解釋（此為依任務卡資料的說明，未見原文）；(3) 只有兩點，沒有獨立檢驗點；(4) PGMA 單元缺基團貢獻（任務 033），沒有 PGMA 的 Tg∞。**只登錄，沒有擬合 PGMA 的 K，tg_flory_k.csv 沒有 PGMA 的列**；程式遇到 PGMA 單元回報「缺基團」。');
  out();
  out('### 9.3 只登錄的驗證候選（待成分 Tg 可算；**目前無法驗證**，本卡不使用）');
  out();
  out('| 文獻 | 系統 | Tg0 | 完全固化 Tg | 無法驗證的原因 |');
  out('|---|---|---|---|---|');
  out('| Szeluga 等 2008（DOI 10.1007/s00289-008-0889-7，Table 1） | DGEBA（Epikote 827，EEW 181.8）＋酚醛硬化劑（Mn 570）＋2-乙基-4-甲基咪唑 0.3 wt% | 0.6 °C | 131.9 °C | DGEBA 類缺 K；酚醛 Mn 570 在已驗證範圍（苯酚酚醛 780–1535）外，且不是已收錄的類別 |');
  out('| Sadeghinia 等 2012（DOI 10.1016/j.ijadhadh.2011.10.007） | EPN 1180（EEW 175–182）＋雙酚 A 硬化劑（當量 114）＋TPP，無填料 | 21.4 °C | 117.7 °C（λ 0.567） | 硬化劑是小分子（D56 不計 Tg）；EPN 沒有 Mn |');
  out();

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, lines.join('\n') + '\n', 'utf8');
  console.log(`已寫入 ${OUTPUT}（${lines.length} 行）`);
} finally {
  await server.close();
}
