// Phase 6 使用者定義的經驗自由體積法輸出的產生腳本（任務 036a，D57）。
// 對使用者材料的聚合物單元與骨架範本 BT01–BT06、任務 030 的半導體代表結構、xlsx 各列的結構各輸出一列：
// 名稱、SMILES、係數類別、Vω、Vf、Vf／Va（或缺基團）。xlsx 各列另列與 xlsx 數字的對照（疑點標註）。
// 這是使用者定義的經驗法、未經獨立驗證，不是書中的自由體積分率，不用於 CTE。只列程式輸出，不判斷化學（D17）；單元質量不顯示（D09）。
// 執行：npm run verify:phase6-fv（Node 直接執行 .ts，只用可抹除的型別語法）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', 'phase6-自由體積-經驗係數-輸出.md');

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
  const fv = await server.ssrLoadModule('/src/core/properties/freeVolume.ts');
  const { computeVdwVolume } = await server.ssrLoadModule('/src/core/properties/vanDerWaalsVolume.ts');
  const { readGraph } = await server.ssrLoadModule('/src/core/properties/molGraph.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const { FREE_VOLUME_GROUPS, FREE_VOLUME_COEFFICIENTS } = await server.ssrLoadModule('/src/core/data/freeVolumeTables.ts');
  const { USER_SMALL, USER_UNITS, SEMI } = await server.ssrLoadModule('/scripts/diagnosis/030-structures.ts');
  const { XLSX_STRUCTURES } = await server.ssrLoadModule('/tests/properties/freeVolumeCases.ts');
  const { XLSX_ROWS, XLSX_VALUES } = await server.ssrLoadModule('/tests/properties/freeVolumeXlsxRows.ts');
  const RDKit = await getRDKit();

  const lines: string[] = [];
  const out = (text = '') => lines.push(text);
  const fx = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
  const cell = (text: string) => text.replace(/\|/g, '\\|');
  const missingText = (m: any[]): string => m.map((x) => `${x.element}（原子 ${x.index}：${x.description}）`).join('；');
  const compMissing = (r: any): string =>
    r.components
      .filter((c: any) => c.unit.status === 'missing')
      .map((c: any) => missingText(c.unit.missing))
      .join('；');

  // ---- A-2：苯 ----
  const benzene = fv.computeFreeVolumeUnit(RDKit, 'c1ccccc1');
  const benzeneBook = computeVdwVolume(RDKit, 'c1ccccc1');
  const BONDI_BENZENE = 48.36; // Bondi 1964 的苯 VW（任務卡的初步讀取；看圖確認，見報告）
  const benzeneVw = benzene.status === 'ok' ? benzene.vomega : NaN;
  const pctBook = benzeneBook.status === 'ok' ? ((benzeneVw - benzeneBook.vw) / benzeneBook.vw) * 100 : NaN;
  const pctBondi = ((benzeneVw - BONDI_BENZENE) / BONDI_BENZENE) * 100;

  out('# Phase 6 使用者定義的經驗自由體積法輸出');
  out();
  out(`**${fv.FREE_VOLUME_DISCLAIMER}**`);
  out();
  out('以下為程式輸出，未經化學判斷（D17）；單元質量只用於內部計算，網站上不顯示（D09）。本輸出不使用實驗值當輸入（D02），不使用折射率 n（D07）。');
  out();
  out('## 檔頭說明');
  out();
  out('- **這是使用者定義的經驗法（使用者 2026-11-06 依論文整理，論文清單待補），未經獨立驗證，稽核狀態「待使用者審」。不是 van Krevelen 書中的自由體積分率**（書中沒有由結構計算的方法，見報告 036），**也不用於 CTE**（任務 036 的 CTE 只用 VW 與 Tg，本輸出不影響它）。');
  out(`- **方法**：${fv.FREE_VOLUME_MODEL}。`);
  out('  - Vf = Vω × 經驗係數；Vω = Σ（基團數 × 基團 Vω），19 個基團見 `src/data/free_volume_groups.csv`，芳香族 H 欄已由使用者刪除，芳香碳一律 8.11（含氫）。');
  out('  - 係數（`src/data/free_volume_coefficients.csv`）：螺雙茚滿（SBI）0.7、金剛烷與橋環或籠狀脂環 0.8、芳香環 0.37、脂肪族 1、環烷 1。**一個單體只選一個係數**，優先順序（待使用者審）：SBI ＞ 橋環脂環 ＞ 芳香環 ＞ 其餘。共聚物按單體莫耳分率加權。聚合物只算重複單元，小分子算整個分子。');
  out('  - 缺基團：表中沒有的原子或結構回報缺基團，不計算、不猜值、不以相近基團代替。');
  out(`  - Vf／Va：Va 取任務 029 的 Table 4.10 結果（${fv.FREE_VOLUME_VA_NOTE}）；Va 缺（缺基團、小分子液體未實作）就只標缺。`);
  out();
  out('### 與書的 VW 差異（報告 A-2）');
  out();
  out(`- 苯：使用者表 6 × 8.11 = **${fx(benzeneVw, 2)}** cm³/mol；書（任務 028，Table 4.2，6 × CHar 8.05）**${benzeneBook.status === 'ok' ? fx(benzeneBook.vw, 2) : '—'}**，差 **${fx(pctBook, 2)}%**；Bondi 1964（p.449 Table XV，看圖確認 48.36）差 **${fx(pctBondi, 2)}%**。差異遠小於 10%，不需停下來。`);
  out('- 其餘基團與 Bondi／vw_groups.csv 的對照見報告 036a 的 A-1；芳香碳的簡化（取代位置的碳也用 8.11）造成的偏差見本檔第 3 節。');
  out('- 重新產生：`npm run verify:phase6-fv`。');
  out();
  out('本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。');
  out();

  // ---- 1. 全部結構 ----
  const items: { name: string; smiles: string; group: string }[] = [
    ...USER_SMALL.map((x: any) => ({ name: x.name, smiles: x.smiles, group: '使用者材料' })),
    ...USER_UNITS.map((x: any) => ({ name: x.name, smiles: x.smiles, group: '使用者材料' })),
    ...BACKBONE_TEMPLATES.map((t: any) => ({ name: `${t.id} ${t.名稱 ?? t.name}`, smiles: t.unitSmiles, group: '使用者材料（骨架範本）' })),
    ...SEMI.map((x: any) => ({ name: x.name, smiles: x.smiles, group: '半導體常用材料（D53，SMILES 待使用者審）' })),
  ];

  const row = (name: string, smiles: string, extra = ''): { line: string; r: any } => {
    const r = fv.computeFreeVolume(RDKit, smiles);
    const head = `| ${cell(name)} | \`${cell(smiles)}\``;
    if (r.status === 'invalid') return { line: `${head} | 無法計算：${r.message} | — | — | — |${extra}`, r };
    if (r.status === 'missing') return { line: `${head} | 缺基團：${cell(compMissing(r))} | — | — | — |${extra}`, r };
    const u = r.components[0].unit;
    return { line: `${head} | ${cell(`${u.coefficient.name}（${u.coefficient.coefficient}）`)} | ${fx(r.vomega)} | ${fx(r.vf)} | ${r.vfOverVa === null ? `缺 Va` : fx(r.vfOverVa, 3)} |${extra}`, r };
  };

  out('## 1. 全部結構');
  out();
  out('Vω、Vf 單位 cm³/mol；Vf／Va 無單位（Va 用書的 Table 4.10）。係數類別括號內為係數。');
  out();
  const seen: string[] = [];
  for (const it of items) if (!seen.includes(it.group)) seen.push(it.group);
  const missingRows: { name: string; text: string }[] = [];
  const okVa: { name: string; smiles: string; vf: number; vomega: number; va: number | null; ratio: number | null; coef: string }[] = [];
  for (const group of seen) {
    out(`### ${group}`);
    out();
    out('| 名稱 | SMILES | 係數類別 | Vω | Vf | Vf／Va |');
    out('|---|---|---|---|---|---|');
    for (const it of items.filter((x) => x.group === group)) {
      const { line, r } = row(it.name, it.smiles);
      out(line);
      if (r.status === 'missing') missingRows.push({ name: it.name, text: compMissing(r) });
      if (r.status === 'ok') okVa.push({ name: it.name, smiles: it.smiles, vf: r.vf, vomega: r.vomega, va: r.va, ratio: r.vfOverVa, coef: r.components[0].unit.coefficient.id });
    }
    out();
  }

  // ---- 2. xlsx 各列 ----
  out('## 2. xlsx 各列的結構（對照使用者表的數字）');
  out();
  out('xlsx 內的結構是 ChemDoodle 物件（圖），SMILES 由 Claude 看圖或依名稱撰寫，**待使用者審**（「圖」＝xlsx 內有圖；「推定」＝無圖，依名稱與原子數推定）。「xlsx Vω（去 H）」是 xlsx 的 W 欄減去芳香族 H 欄的項（芳香族 H 已刪除）；「xlsx Vf」是 xlsx 的 X 欄。**疑點列不得當測試的期望值**，數字不一致時以使用者表為準、不改使用者的數字。');
  out();
  out('| 列 | 名稱 | 結構來源 | 係數類別 | Vω（程式） | Vω（xlsx，去 H） | Vf（程式） | Vf（xlsx） | Vf／Va | 與 xlsx 的差異 |');
  out('|---|---|---|---|---|---|---|---|---|---|');
  const KEY_OF: Record<string, string> = { FV01: 'arC', FV02: 'chC', FV03: 'chCH', FV04: 'chCH2', FV05: 'chCH3', FV06: 'rC', FV07: 'rCH', FV08: 'rCH2', FV09: 'ether', FV10: 'epoxy', FV11: 'ketone', FV12: 'aldehyde', FV13: 'ester', FV14: 'oh1', FV15: 'oh2', FV16: 'oh3', FV17: 'phenol', FV18: 'fAl', FV19: 'fAr' };
  const LABEL: Record<string, string> = { arC: '芳香 C', chC: '鏈 C', chCH: '鏈 CH', chCH2: '鏈 CH2', chCH3: '鏈 CH3', rC: '環 C', rCH: '環 CH', rCH2: '環 CH2', ether: '醚 O', epoxy: '環氧 O', ketone: '酮', aldehyde: '醛', ester: '酯基', oh1: '一級 OH', oh2: '二級 OH', oh3: '三級 OH', phenol: '酚 OH', fAl: '脂肪 F', fAr: '芳香 F' };
  const xlsxDiffRows: { row: number; name: string; text: string }[] = [];
  for (const s of XLSX_STRUCTURES) {
    const x = XLSX_ROWS.find((r: any) => r.row === s.row);
    const name = x.name ?? '（未命名）';
    const xw = x.w - x.counts.arH * XLSX_VALUES.arH;
    if (s.smiles === null) {
      out(`| ${s.row} | ${cell(name)} | ${s.basis} | 未建立結構 | — | ${fx(xw)} | — | ${fx(x.x)} | — | ${cell(s.note)} |`);
      continue;
    }
    const r = fv.computeFreeVolume(RDKit, s.smiles);
    if (r.status !== 'ok') {
      out(`| ${s.row} | ${cell(name)} | ${s.basis} | ${r.status === 'missing' ? `缺基團：${cell(compMissing(r))}` : r.message} | — | ${fx(xw)} | — | ${fx(x.x)} | — | ${cell(s.note)} |`);
      continue;
    }
    const u = r.components[0].unit;
    const got: Record<string, number> = {};
    for (const c of u.contributions) got[KEY_OF[c.id]] = c.count;
    const diffs: string[] = [];
    for (const k of Object.values(KEY_OF)) {
      const a = got[k] ?? 0;
      const b = x.counts[k];
      if (a !== b) diffs.push(`${LABEL[k]} 程式 ${a}／xlsx ${b}`);
    }
    if (diffs.length > 0) xlsxDiffRows.push({ row: s.row, name, text: diffs.join('；') });
    out(
      `| ${s.row} | ${cell(name)} | ${s.basis} | ${cell(`${u.coefficient.name}（${u.coefficient.coefficient}）`)} | ${fx(r.vomega)} | ${fx(xw)} | ${fx(r.vf)} | ${fx(x.x)} | ${r.vfOverVa === null ? '缺 Va' : fx(r.vfOverVa, 3)} | ${(diffs.length === 0 ? '基團數一致' : cell(diffs.join('；'))) + (x.counts.ester > 0 ? `；**已知差異，非程式錯誤（任務 036c）**：程式酯基用書的 –COO– 15.2，xlsx 用 23（羰基碳另計），Vω 程式 − xlsx = ${fx(r.vomega - xw)}` : '')} |`,
    );
    if (r.status === 'ok') okVa.push({ name: `xlsx 第 ${s.row} 列 ${name}`, smiles: s.smiles, vf: r.vf, vomega: r.vomega, va: r.va, ratio: r.vfOverVa, coef: u.coefficient.id });
  }
  out();
  out('### xlsx 結構備註（SMILES 的依據）');
  out();
  for (const s of XLSX_STRUCTURES) {
    const x = XLSX_ROWS.find((r: any) => r.row === s.row);
    out(`- 第 ${s.row} 列 ${x.name ?? '（未命名）'}：${s.note}${s.smiles ? `；\`${s.smiles}\`` : ''}`);
  }
  out();

  // ---- 3. 芳香碳簡化的偏差 ----
  out('## 3. 芳香碳簡化的已知偏差（只報告，不修改使用者的規則）');
  out();
  out('使用者表只有一個芳香 C 值（8.11，含氫）。以下以 Bondi 1964 的分項重算芳香碳部分比較：有氫的芳香 C 8.06（C–H）、無氫且非稠合的取代芳香 C 5.54、三個鍵都接芳香原子的稠合芳香 C 4.74；其他基團照使用者表。偏差 ＝ 使用者表的 Vω − Bondi 分項的 Vω；數值 5.54、8.06、4.74 與苯 48.36 已看 Bondi 1964 p.449 Table XV 的圖確認。');
  out();
  out('| 名稱 | 芳香 C 數（有氫／取代／稠合） | Vω（使用者表） | Vω（Bondi 芳香分項） | 偏差 | 偏差佔 Vω |');
  out('|---|---|---|---|---|---|');
  const bias: { name: string; delta: number; pct: number }[] = [];
  const biasItems = [
    ...items.filter((x) => x.group.startsWith('使用者材料（骨架範本）') || x.group === '使用者材料'),
    { name: '苯（參考）', smiles: 'c1ccccc1', group: '' },
    ...XLSX_STRUCTURES.filter((s: any) => s.smiles).map((s: any) => ({ name: `xlsx 第 ${s.row} 列 ${XLSX_ROWS.find((r: any) => r.row === s.row).name ?? '（未命名）'}`, smiles: s.smiles, group: 'xlsx' })),
  ];
  for (const it of biasItems) {
    const r = fv.computeFreeVolumeUnit(RDKit, it.smiles);
    if (r.status !== 'ok') continue;
    const mol = RDKit.get_mol(it.smiles);
    let h = 0;
    let sub = 0;
    let fused = 0;
    try {
      const g = readGraph(mol);
      for (let i = 0; i < g.z.length; i++) {
        if (!(g.z[i] === 6 && g.aromatic[i])) continue;
        if (g.hCount[i] > 0) h++;
        else if (g.neighbors[i].filter((n: number) => g.aromatic[n]).length === 3) fused++;
        else sub++;
      }
    } finally {
      mol.delete();
    }
    if (h + sub + fused === 0) continue;
    const user = (h + sub + fused) * XLSX_VALUES.arC;
    const bondi = h * 8.06 + sub * 5.54 + fused * 4.74;
    const delta = user - bondi;
    const total = r.vomega;
    bias.push({ name: it.name, delta, pct: (delta / total) * 100 });
    out(`| ${cell(it.name)} | ${h}／${sub}／${fused} | ${fx(total)} | ${fx(total - delta)} | ${delta >= 0 ? '+' : ''}${fx(delta)} | ${fx((delta / total) * 100, 1)}% |`);
  }
  out();

  // ---- 4. 比較 ----
  out('## 4. SBI、茀、金剛烷與一般芳香聚合物的 Vf／Va 比較（如實寫結果，不修正）');
  out();
  out('Vf／Va 的 Va 用書的 Table 4.10（任務 029）；Va 缺的標「缺 Va」。xlsx 的結構是 Claude 撰寫、待使用者審。');
  out();
  out('| 類型 | 名稱 | 係數 | Vω | Vf | Va | Vf／Va |');
  out('|---|---|---|---|---|---|---|');
  const pick = (type: string, names: string[]) => {
    for (const n of names) {
      const x = okVa.find((v) => v.name === n);
      if (!x) continue;
      out(`| ${type} | ${cell(x.name)} | ${x.coef} | ${fx(x.vomega)} | ${fx(x.vf)} | ${x.va === null ? '缺 Va' : fx(x.va)} | ${x.ratio === null ? '缺 Va' : fx(x.ratio, 3)} |`);
    }
  };
  pick('SBI', okVa.filter((v) => v.coef === 'FC01').map((v) => v.name));
  pick('茀', okVa.filter((v) => /茀|芴|Cardo/.test(v.name) && v.coef !== 'FC01').map((v) => v.name));
  pick('金剛烷／橋環', okVa.filter((v) => v.coef === 'FC02').map((v) => v.name));
  pick('一般芳香聚合物（含連接點的單元）', okVa.filter((v) => v.coef === 'FC03' && v.smiles.includes('*') && !/茀|芴|Cardo/.test(v.name)).map((v) => v.name));
  out();

  out('Va 缺的原因是任務 029 的 Table 4.10 基團表只收 15 個基團（不含 SBI、茀、金剛烷骨架與多數芳香結構），所以上表多數沒有 Vf／Va；這是 Va 的缺口，不是本方法的問題。下表列幾個 Va 算得出的書中聚合物單元，只供對照比值的大小（不是使用者材料）：');
  out();
  out('| 名稱 | SMILES | 係數 | Vω | Vf | Va | Vf／Va |');
  out('|---|---|---|---|---|---|---|');
  const REF: [string, string][] = [
    ['聚乙烯單元', '[*:1]CC[*:2]'],
    ['聚丙烯單元', '[*:1]CC([*:2])C'],
    ['聚苯乙烯單元', '[*:1]CC([*:2])c1ccccc1'],
    ['聚甲基丙烯酸甲酯單元', '[*:1]CC([*:2])(C)C(=O)OC'],
    ['聚對苯二甲酸乙二酯單元', '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]'],
    ['聚雙酚碳酸酯單元', '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]'],
  ];
  for (const [n, s] of REF) {
    const r = fv.computeFreeVolume(RDKit, s);
    if (r.status !== 'ok') {
      out(`| ${n} | \`${cell(s)}\` | 缺基團：${cell(compMissing(r))} | — | — | — | — |`);
      continue;
    }
    out(`| ${n} | \`${cell(s)}\` | ${r.components[0].unit.coefficient.id} | ${fx(r.vomega)} | ${fx(r.vf)} | ${r.va === null ? '缺 Va' : fx(r.va)} | ${r.vfOverVa === null ? '缺 Va' : fx(r.vfOverVa, 3)} |`);
  }
  out();

  // ---- 5. 缺基團 ----
  out('## 5. 缺基團明細');
  out();
  out('| 名稱 | 缺什麼 |');
  out('|---|---|');
  if (missingRows.length === 0) out('| （無） | — |');
  for (const m of missingRows) out(`| ${cell(m.name)} | ${cell(m.text)} |`);
  out();

  // ---- 6. 資料表 ----
  out('## 6. 使用的資料表');
  out();
  out('基團（`src/data/free_volume_groups.csv`）：');
  out();
  out('| id | 基團 | Vω | 佔用原子數 | 稽核狀態 |');
  out('|---|---|---|---|---|');
  for (const g of FREE_VOLUME_GROUPS) out(`| ${g.id} | ${cell(g.name)} | ${g.vw} | ${g.atomCount} | ${g.audit} |`);
  out();
  out('係數（`src/data/free_volume_coefficients.csv`）：');
  out();
  out('| id | 類別 | 係數 | 辨識方式 | 優先順序 | 稽核狀態 |');
  out('|---|---|---|---|---|---|');
  for (const c of FREE_VOLUME_COEFFICIENTS) out(`| ${c.id} | ${cell(c.name)} | ${c.coefficient} | ${c.mode} | ${c.priority} | ${c.audit} |`);
  out();

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`已寫入 ${OUTPUT}（${lines.length} 行）`);
} finally {
  await server.close();
}
