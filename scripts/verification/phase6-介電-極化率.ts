// Phase 6 介電常數與莫耳折射／極化率輸出的產生腳本（任務 032）。
// 對使用者材料的聚合物單元與骨架範本 BT01–BT06、任務 030 的半導體代表結構（A-3）、驗證用書中聚合物（Table 11.2）各輸出一列：
// ε（式 11.7，V = Va）、ε（式 11.8）、ΣP_LL、ΣP_V、Va、ΣR、α′，或缺基團／缺莫耳體積。不含連接點的小分子標「不適用（小分子）」。
// 不輸出折射率 n 與 n²（D07）。只列程式輸出，不判斷化學（D17）；單元質量與分子量不顯示（D09）。
// 執行：npm run verify:phase6-dielectric（Node 直接執行 .ts，只用可抹除的型別語法）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', 'phase6-介電-極化率-輸出.md');

// 驗證用書中聚合物：Table 11.2（書頁 322，PDF 第 349 頁）。exp 為書中「ε Exp.」（兩個數字者為範圍）；book117、book118 為書中計算值。
interface Validation {
  name: string;
  smiles: string;
  exp: [number, number];
  book117: number;
  book118: number;
}
const VALIDATION: Validation[] = [
  { name: '聚乙烯（外推至非晶）', smiles: '[*:1]CC[*:2]', exp: [2.3, 2.3], book117: 2.2, book118: 2.2 },
  { name: '聚丙烯（非晶部分）', smiles: '[*:1]CC([*:2])C', exp: [2.2, 2.2], book117: 2.15, book118: 2.15 },
  { name: '聚苯乙烯', smiles: '[*:1]CC([*:2])c1ccccc1', exp: [2.55, 2.55], book117: 2.55, book118: 2.6 },
  { name: '聚（鄰氯苯乙烯）', smiles: '[*:1]CC([*:2])c1ccccc1Cl', exp: [2.6, 2.6], book117: 2.82, book118: 2.82 },
  { name: '聚（四氟乙烯）（非晶）', smiles: '[*:1]C(F)(F)C(F)(F)[*:2]', exp: [2.1, 2.1], book117: 2.0, book118: 1.96 },
  { name: '聚氯乙烯', smiles: '[*:1]CC(Cl)[*:2]', exp: [2.8, 3.05], book117: 3.05, book118: 3.15 },
  { name: '聚乙酸乙烯酯', smiles: '[*:1]CC([*:2])OC(C)=O', exp: [3.25, 3.25], book117: 3.02, book118: 3.3 },
  { name: '聚甲基丙烯酸甲酯', smiles: '[*:1]CC([*:2])(C)C(=O)OC', exp: [2.6, 3.7], book117: 2.94, book118: 3.15 },
  { name: '聚甲基丙烯酸乙酯', smiles: '[*:1]CC([*:2])(C)C(=O)OCC', exp: [2.7, 3.4], book117: 2.8, book118: 3.0 },
  { name: '聚（α-氯丙烯酸甲酯）', smiles: '[*:1]CC([*:2])(Cl)C(=O)OC', exp: [3.4, 3.4], book117: 3.45, book118: 3.32 },
  { name: '聚（α-氯丙烯酸乙酯）', smiles: '[*:1]CC([*:2])(Cl)C(=O)OCC', exp: [3.1, 3.1], book117: 3.2, book118: 3.16 },
  { name: '聚丙烯腈', smiles: '[*:1]CC([*:2])C#N', exp: [3.1, 3.1], book117: 3.26, book118: 3.15 },
  { name: '聚（亞甲基氧）', smiles: '[*:1]CO[*:2]', exp: [3.1, 3.1], book117: 2.95, book118: 2.85 },
  { name: '聚（2,6-二甲基伸苯基醚）', smiles: '[*:1]Oc1c(C)cc([*:2])cc1C', exp: [2.6, 2.6], book117: 2.65, book118: 2.75 },
  { name: 'Penton（聚[2,2-雙(氯甲基)三亞甲基-3-氧化物]）', smiles: '[*:1]CC(CCl)(CCl)CO[*:2]', exp: [3.0, 3.0], book117: 2.95, book118: 2.8 },
  { name: '聚對苯二甲酸乙二酯（非晶）', smiles: '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]', exp: [2.9, 3.2], book117: 3.4, book118: 3.5 },
  { name: '聚雙酚碳酸酯', smiles: '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]', exp: [2.6, 3.0], book117: 3.0, book118: 3.05 },
  { name: '聚（己二醯己二胺）（尼龍 6,6）', smiles: '[*:1]NC(=O)CCCCC(=O)NCCCCCC[*:2]', exp: [4.0, 4.0], book117: 4.14, book118: 4.1 },
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
  const mod = await server.ssrLoadModule('/src/core/properties/dielectricRefraction.ts');
  const { computeDielectric, computeRefraction, countGroups, epsilonFromPLL, DIELECTRIC_MODEL, REFRACTION_MODEL, DIELECTRIC_DISCLAIMER } = mod;
  const { computeMolarVolumeDensity } = await server.ssrLoadModule('/src/core/properties/molarVolumeDensity.ts');
  const { POLARIZATION_GROUPS } = await server.ssrLoadModule('/src/core/data/polarizationGroups.ts');
  const { MOLAR_REFRACTION_GROUPS } = await server.ssrLoadModule('/src/core/data/molarRefractionGroups.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const { USER_SMALL, USER_UNITS, SEMI } = await server.ssrLoadModule('/scripts/diagnosis/030-structures.ts');
  const RDKit = await getRDKit();

  const lines: string[] = [];
  const out = (text = '') => lines.push(text);
  const fx = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
  const cell = (text: string) => text.replace(/\|/g, '\\|');
  const missingText = (m: any[]): string => m.map((x) => `原子 ${x.index}：${x.description}${x.reason ? `（${x.reason}）` : ''}`).join('；');
  const shortMissing = (m: any[]): string => [...new Set(m.map((x) => (x.reason ? x.reason.split('：')[0] : `${x.element}（${x.description.split('，')[0]}）`)))].slice(0, 4).join('、');

  out('# Phase 6 介電常數與極化率輸出');
  out();
  out(`**${DIELECTRIC_DISCLAIMER}**`);
  out();
  out('以下為程式輸出，未經化學判斷（D17）；分子量與單元質量只用於式 (11.8) 的計算，網站上不顯示（D09）。');
  out();
  out(`- 結構處理：RDKit ${RDKit.version()}`);
  out(`- **ε 的方法**：${DIELECTRIC_MODEL}。基團表 \`src/data/polarization_groups.csv\`（${POLARIZATION_GROUPS.length} 列，稽核狀態皆為「待使用者審」）。可信度：理論估算（基團貢獻法）。`);
  out('  - **式 (11.7)**：ε = (1 + 2x)/(1 − x)，x = ΣP_LL / V；V 使用任務 029 的非晶態莫耳體積 Va。書中式 (11.7) 與 Example 11.1 只寫「V(298)」，沒說 Va 或 Vc；依 PE 試算選擇 Va（使用者 2026-11-01 決定，驗證見第 4 節）。');
  out('  - **式 (11.8)**：ε = (ΣP_V / M)²，不需要莫耳體積；M 為結構單元質量。沒有莫耳體積的結構仍輸出此版本，註明「缺莫耳體積，僅 P_V 估計」。');
  out('  - **頻率**：書中未註明 P 的適用頻率；Table 11.2 的觀測值屬 10²–10⁹ Hz 低頻範圍（書頁 320）。含極性基團的 ε 受頻率與溫度影響。');
  out('  - **暫定值**：Table 11.1 中印於括號內或「~」的 P_LL、P_V 照數值收錄，書中標為暫定；用到時在結構旁標「†」（P_LL 暫定）或「‡」（P_V 暫定）。');
  out(`- **ΣR 與 α 的方法**：${REFRACTION_MODEL}。基團表 \`src/data/molar_refraction_groups.csv\`（${MOLAR_REFRACTION_GROUPS.length} 列，稽核狀態皆為「待使用者審」）。ΣR 單位 10⁻⁶ m³/mol ＝ cm³/mol；α′ ＝ 3ΣR/(4π·N_A)（Å³／單元），由式 (11.10)、(11.11) 換算。**不輸出折射率 n 與 n²（D07）。**`);
  out('- **缺基團**：切分規則與 Tg、VW、莫耳體積相同（原子數由大到小配對；每個重原子恰好屬於一個基團；重疊優先順序為現行的最大組合優先，M26 未決，未更動）；配不到的原子回報「缺基團」，不用相近基團或記憶中的數值代用。鄰位與間位伸苯基 Table 11.1 沒有，不配對（使用者 2026-11-01 決定不放寬）。');
  out('- **小分子**：Table 11.1、Table 10.4 是聚合物重複單元的基團增量，不含連接點（*）的小分子標「不適用（小分子）」。');
  out('- 本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。');
  out('- 重新產生：`npm run verify:phase6-dielectric`。');
  out();

  const items: { name: string; smiles: string; group: string }[] = [
    ...USER_SMALL.map((x: any) => ({ name: x.name, smiles: x.smiles, group: '使用者材料' })),
    ...USER_UNITS.map((x: any) => ({ name: x.name, smiles: x.smiles, group: '使用者材料' })),
    ...BACKBONE_TEMPLATES.map((t: any) => ({ name: `${t.id} ${t.名稱 ?? t.name}`, smiles: t.unitSmiles, group: '使用者材料（骨架範本）' })),
    ...SEMI.map((x: any) => ({ name: x.name, smiles: x.smiles, group: '半導體常用材料（D53，SMILES 待使用者審）' })),
    ...VALIDATION.map((v) => ({ name: v.name, smiles: v.smiles, group: '驗證用書中聚合物（Table 11.2）' })),
  ];

  const marks = (d: any): string => `${d.usesTentativeLL ? '†' : ''}${d.usesTentativeV ? '‡' : ''}`;
  const rowOf = (it: { name: string; smiles: string }) => {
    const d = computeDielectric(RDKit, it.smiles);
    const r = computeRefraction(RDKit, it.smiles);
    const head = `| ${cell(it.name)} | \`${cell(it.smiles)}\``;
    if (d.status === 'unsupported') return `${head} | 不適用（小分子） | — | — | — | — | 不適用（小分子） | — |`;
    if (d.status === 'invalid') return `${head} | 無法計算：${d.message} | — | — | — | — | — | — |`;
    const rCell = r.status === 'ok' ? `${fx(r.sumR, 3)} | ${fx(r.alphaPrimeA3, 3)}` : `缺基團：${cell(shortMissing(r.missing))} | —`;
    if (d.status === 'missing') return `${head} | 缺基團：${cell(shortMissing(d.missing))} | — | — | — | — | ${rCell} |`;
    const m = marks(d);
    const epsLL = d.epsLL === null ? (d.volume.status === 'missing' ? '缺莫耳體積' : '無解') : `${fx(d.epsLL)}${m}`;
    return `${head} | ${epsLL} | ${fx(d.epsV)}${m} | ${fx(d.sumPLL)} | ${fx(d.sumPV, 1)} | ${d.volume.status === 'ok' ? fx(d.volume.va) : '缺莫耳體積'} | ${rCell} |`;
  };

  out('## 1. 全部結構');
  out();
  out('ε（11.7）＝式 (11.7)，V = Va；ε（11.8）＝式 (11.8)。缺莫耳體積的結構，ε（11.7）欄註明「缺莫耳體積」，ε（11.8）欄為「缺莫耳體積，僅 P_V 估計」。† ＝ 用到 P_LL 暫定值；‡ ＝ 用到 P_V 暫定值。');
  out();
  const groupsSeen: string[] = [];
  for (const it of items) if (!groupsSeen.includes(it.group)) groupsSeen.push(it.group);
  const pvOnly: string[] = [];
  for (const group of groupsSeen) {
    out(`### ${group}`);
    out();
    out('| 名稱 | SMILES | ε（11.7） | ε（11.8） | ΣP_LL（cm³/mol） | ΣP_V（g/mol） | Va（cm³/mol） | ΣR（cm³/mol） | α′（Å³） |');
    out('|---|---|---|---|---|---|---|---|---|');
    for (const it of items.filter((x) => x.group === group)) {
      let row = rowOf(it);
      const d = computeDielectric(RDKit, it.smiles);
      if (d.status === 'ok' && d.volume.status === 'missing') {
        pvOnly.push(it.name);
        row = row.replace(` | ${fx(d.epsV)}${marks(d)} | `, ` | ${fx(d.epsV)}${marks(d)}（缺莫耳體積，僅 P_V 估計） | `);
      }
      out(row);
    }
    out();
  }

  // ---------- 缺基團明細 ----------
  out('## 2. 缺基團明細（聚合物單元）');
  out();
  out('| 名稱 | ε 的缺基團（Table 11.1） | ΣR 的缺基團（Table 10.4） |');
  out('|---|---|---|');
  for (const it of items) {
    const d = computeDielectric(RDKit, it.smiles);
    const r = computeRefraction(RDKit, it.smiles);
    if (d.status === 'unsupported') continue;
    const dm = d.status === 'missing' ? cell(missingText(d.missing)) : '—';
    const rm = r.status === 'missing' ? cell(missingText(r.missing)) : '—';
    if (dm === '—' && rm === '—') continue;
    out(`| ${cell(it.name)} | ${dm} | ${rm} |`);
  }
  out();

  // ---------- 基團切分 ----------
  out('## 3. 可計算結構的基團切分');
  out();
  out('| 名稱 | Table 11.1 基團（P_LL／P_V） | Table 10.4 基團（R_LL） |');
  out('|---|---|---|');
  for (const it of items) {
    const d = computeDielectric(RDKit, it.smiles);
    const r = computeRefraction(RDKit, it.smiles);
    if (d.status !== 'ok' && r.status !== 'ok') continue;
    const dg = d.status === 'ok' ? countGroups(d.groups).map((g: any) => `${g.name} ×${g.count}（${g.pLL}／${g.pV}${g.tentativeLL || g.tentativeV ? '，暫定' : ''}）`).join('；') : '—';
    const rg = r.status === 'ok' ? countGroups(r.groups).map((g: any) => `${g.name} ×${g.count}（${g.r}）`).join('；') : '—';
    out(`| ${cell(it.name)} | ${cell(dg)} | ${cell(rg)} |`);
  }
  out();

  // ---------- 與 Table 11.2 對照 ----------
  out('## 4. 與書中 Table 11.2 對照，以及 V 用 Va 的驗證');
  out();
  out('「書中 (11.7)」「書中 (11.8)」為 Table 11.2 的 ε 計算值，「觀測」為 ε Exp.（兩個數字者為範圍）。「較接近觀測」比較本程式兩個估計與觀測值（落在範圍內視為差 0）。Vc 欄是把式 (11.7) 的 V 改用 Table 4.10 的 Vc 增量（結晶態）所得。');
  out();
  out('| 聚合物 | 觀測 ε | 書中 (11.7) | 程式 (11.7)（Va） | 差 | 程式 (11.7)（Vc） | 差 | 書中 (11.8) | 程式 (11.8) | 差 | 較接近觀測 | 兩估計相對差 |');
  out('|---|---|---|---|---|---|---|---|---|---|---|---|');
  const big: string[] = [];
  const diffNotes: string[] = [];
  const dist = (e: number, [lo, hi]: [number, number]) => (e < lo ? lo - e : e > hi ? e - hi : 0);
  for (const v of VALIDATION) {
    const d = computeDielectric(RDKit, v.smiles);
    const obs = v.exp[0] === v.exp[1] ? `${v.exp[0]}` : `${v.exp[0]}–${v.exp[1]}`;
    if (d.status !== 'ok') {
      out(`| ${cell(v.name)} | ${obs} | ${v.book117} | ${d.status === 'missing' ? '缺基團' : '不適用'} | — | — | — | ${v.book118} | ${d.status === 'missing' ? '缺基團' : '不適用'} | — | — | — |`);
      continue;
    }
    const vd = computeMolarVolumeDensity(RDKit, v.smiles);
    const vc = vd.status === 'ok' && vd.crystalline ? epsilonFromPLL(d.sumPLL, vd.crystalline.vm) : null;
    const dLL = d.epsLL === null ? null : d.epsLL - v.book117;
    const dVc = vc === null ? null : vc - v.book117;
    const dV = d.epsV - v.book118;
    const s = (x: number | null) => (x === null ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}`);
    let closer = '—';
    if (d.epsLL !== null) closer = dist(d.epsV, v.exp) < dist(d.epsLL, v.exp) ? '(11.8)' : dist(d.epsV, v.exp) > dist(d.epsLL, v.exp) ? '(11.7)' : '相同';
    else closer = '僅 (11.8)';
    const rel = d.relDiff === null ? '—' : `${(d.relDiff * 100).toFixed(1)}%`;
    if (d.relDiff !== null && d.relDiff > 0.1) big.push(`${v.name}（${rel}）`);
    if (d.epsLL !== null && Math.abs(dLL as number) > 0.04) diffNotes.push(`${v.name} (11.7) ${s(dLL)}`);
    if (Math.abs(dV) > 0.04) diffNotes.push(`${v.name} (11.8) ${s(dV)}`);
    out(`| ${cell(v.name)} | ${obs} | ${v.book117} | ${d.epsLL === null ? '—' : `${fx(d.epsLL)}${marks(d)}`} | ${s(dLL)} | ${fx(vc)} | ${s(dVc)} | ${v.book118} | ${fx(d.epsV)} | ${s(dV)} | ${closer} | ${rel} |`);
  }
  out();
  out(`程式與書中計算值差超過 0.04（書中印刷捨入範圍）者：${diffNotes.join('；') || '（無）'}。`);
  out();

  // ---------- 兩個估計差大於 10% ----------
  out('## 5. 兩個 ε 估計相差超過 10% 的結構');
  out();
  const bigAll: string[] = [];
  for (const it of items) {
    const d = computeDielectric(RDKit, it.smiles);
    if (d.status === 'ok' && d.relDiff !== null && d.relDiff > 0.1) bigAll.push(`${it.name}（ε 11.7 = ${fx(d.epsLL)}，ε 11.8 = ${fx(d.epsV)}，相對差 ${(d.relDiff * 100).toFixed(1)}%）`);
  }
  out(bigAll.length > 0 ? bigAll.map((x) => `- ${x}`).join('\n') : '（無）');
  out();
  out('（相對差 ＝ |ε(11.7) − ε(11.8)| / ε(11.7)；缺莫耳體積的結構只有 (11.8) 一個估計，不列入。）');
  out();

  // ---------- 缺莫耳體積 ----------
  out('## 6. 缺莫耳體積（僅 P_V 估計）的結構');
  out();
  out(pvOnly.length > 0 ? pvOnly.map((x) => `- ${x}`).join('\n') : '（無）');
  out();

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
  void big;
} finally {
  await server.close();
}
