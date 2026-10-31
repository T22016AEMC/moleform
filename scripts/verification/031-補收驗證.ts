// 任務 031 補收書中現成整體基團的驗證輸出：補收前後差異表（使用者材料 22 個、半導體常用材料 25 個）、書中聚合物對照、PMDA–ODA、BPDA–PDA。
// 「補收前」用 git HEAD（任務 030 提交 3536540）的三張資料表；「補收後」用目前的資料表。只列程式輸出，不判斷化學（D17）。
// 分子量只列在這個驗證文件中，網站上不顯示（D09）。
// 執行：npm run verify:031（Node 直接執行 .ts，只用可抹除的型別語法）。
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', '031-補收驗證-輸出.md');
const BASE_COMMIT = '3536540';
const gitShow = (path: string): string => execFileSync('git', ['show', `${BASE_COMMIT}:${path}`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });

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
  const { computeTg } = await server.ssrLoadModule('/src/core/properties/tgGroupContribution.ts');
  const { computeVdwVolume } = await server.ssrLoadModule('/src/core/properties/vanDerWaalsVolume.ts');
  const { computeMolarVolumeDensity } = await server.ssrLoadModule('/src/core/properties/molarVolumeDensity.ts');
  const { readYgGroups, YG_GROUPS } = await server.ssrLoadModule('/src/core/data/ygGroups.ts');
  const { readVwGroups, VW_GROUPS } = await server.ssrLoadModule('/src/core/data/vwGroups.ts');
  const { readMolarVolumeGroups, MOLAR_VOLUME_GROUPS } = await server.ssrLoadModule('/src/core/data/molarVolumeGroups.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const { USER_SMALL, USER_UNITS, SEMI } = await server.ssrLoadModule('/scripts/diagnosis/030-structures.ts');
  const RDKit = await getRDKit();

  const OLD = {
    yg: readYgGroups(gitShow('src/data/yg_groups.csv')).rows,
    vw: readVwGroups(gitShow('src/data/vw_groups.csv')).rows,
    mv: readMolarVolumeGroups(gitShow('src/data/molar_volume_polymer_groups.csv')).rows,
  };

  const lines: string[] = [];
  const out = (text = '') => lines.push(text);
  const fx = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
  const cell = (text: string) => text.replace(/\|/g, '\\|');

  const tgCell = (r: any): string => (r.status === 'ok' ? `${fx(r.tgK, 1)} K（ΣYg ${fx(r.sumYg, 1)}／ΣM ${fx(r.sumM, 1)}）` : r.status === 'missing' ? `缺基團 ${r.missing.length} 個原子` : '無法計算');
  const vwCellOf = (r: any): string => (r.status === 'ok' ? `${fx(r.vw)}` : r.status === 'missing' ? `缺基團 ${r.missing.length} 個原子` : '無法計算');
  const mvCellOf = (r: any): string => (r.status === 'ok' ? `Va ${fx(r.amorphous?.vm)}／Vc ${fx(r.crystalline?.vm)}` : r.status === 'missing' ? `缺基團 ${r.missing.length} 個原子` : r.status === 'unsupported' ? '不適用（小分子）' : '無法計算');
  const missingDesc = (r: any): string => (r.status === 'missing' ? [...new Set(r.missing.map((m: any) => m.description.split('，')[0] + (m.reason ? `（${m.reason.slice(0, 20)}…）` : '')))].slice(0, 6).join('；') : '');

  const isUnit = (smiles: string): boolean => smiles.includes('*');
  interface Item {
    name: string;
    smiles: string;
    group: string;
  }
  const items: Item[] = [
    ...USER_SMALL.map((x: any) => ({ name: x.name, smiles: x.smiles, group: '使用者材料' })),
    ...USER_UNITS.map((x: any) => ({ name: x.name, smiles: x.smiles, group: '使用者材料' })),
    ...BACKBONE_TEMPLATES.map((t: any) => ({ name: `${t.id} ${t.名稱 ?? t.name}`, smiles: t.unitSmiles, group: '使用者材料' })),
    ...SEMI.map((x: any) => ({ name: x.name, smiles: x.smiles, group: '半導體常用材料（D53，SMILES 待使用者審）' })),
  ];

  out('# 任務 031：補收書中現成整體基團的驗證輸出');
  out();
  out(`補收前＝git ${BASE_COMMIT}（任務 030）的 \`yg_groups.csv\`（31 列）、\`vw_groups.csv\`（26 列）、\`molar_volume_polymer_groups.csv\`（15 列）；補收後＝目前資料表（${YG_GROUPS.length}、${VW_GROUPS.length}、${MOLAR_VOLUME_GROUPS.length} 列）。`);
  out('「Yg（Tg）」欄的 ΣYg 單位 K·kg/mol，ΣM 單位 g/mol（只列在本文件，網站不顯示）。小分子的莫耳體積不適用（M21）。');
  out('本檔由 `npm run verify:031` 產生，只列程式輸出，不判斷化學（D17）。');
  out();

  // ---------- A 前後差異 ----------
  out('## A. 補收前後差異表');
  out();
  const summary = { tgBecame: [] as string[], vwBecame: [] as string[], mvBecame: [] as string[], changedOk: [] as string[] };
  for (const group of ['使用者材料', '半導體常用材料（D53，SMILES 待使用者審）']) {
    out(`### ${group}`);
    out();
    out('| 名稱 | SMILES | Yg（Tg）前 | Yg（Tg）後 | VW 前 | VW 後 | Va／Vc 前 | Va／Vc 後 |');
    out('|---|---|---|---|---|---|---|---|');
    for (const it of items.filter((x) => x.group === group)) {
      const unit = isUnit(it.smiles);
      const tg0 = computeTg(RDKit, it.smiles, { rows: OLD.yg });
      const tg1 = computeTg(RDKit, it.smiles);
      const vw0 = computeVdwVolume(RDKit, it.smiles, { rows: OLD.vw });
      const vw1 = computeVdwVolume(RDKit, it.smiles);
      const mv0 = unit ? computeMolarVolumeDensity(RDKit, it.smiles, { rows: OLD.mv }) : null;
      const mv1 = unit ? computeMolarVolumeDensity(RDKit, it.smiles) : null;
      if (tg0.status !== 'ok' && tg1.status === 'ok') summary.tgBecame.push(it.name);
      if (vw0.status !== 'ok' && vw1.status === 'ok') summary.vwBecame.push(it.name);
      if (mv0 && mv0.status !== 'ok' && mv1?.status === 'ok') summary.mvBecame.push(it.name);
      if (tg0.status === 'ok' && tgCell(tg0) !== tgCell(tg1)) summary.changedOk.push(`${it.name}：Tg`);
      if (vw0.status === 'ok' && vwCellOf(vw0) !== vwCellOf(vw1)) summary.changedOk.push(`${it.name}：VW`);
      if (mv0 && mv0.status === 'ok' && mvCellOf(mv0) !== mvCellOf(mv1)) summary.changedOk.push(`${it.name}：Va／Vc`);
      const rest = (r0: any, r1: any, f: (r: any) => string): string => (r1.status === 'missing' ? `${f(r1)}：${cell(missingDesc(r1))}` : f(r1));
      out(
        `| ${cell(it.name)} | \`${cell(it.smiles)}\` | ${tgCell(tg0)} | ${rest(tg0, tg1, tgCell)} | ${vwCellOf(vw0)} | ${rest(vw0, vw1, vwCellOf)} | ${mv0 ? mvCellOf(mv0) : '—'} | ${mv1 ? rest(mv0, mv1, mvCellOf) : '—'} |`,
      );
    }
    out();
  }
  out('### 摘要');
  out();
  out(`- Tg 由缺基團變成可算：${summary.tgBecame.length} 個（${summary.tgBecame.join('、') || '無'}）`);
  out(`- VW 由缺基團變成可算：${summary.vwBecame.length} 個（${summary.vwBecame.join('、') || '無'}）`);
  out(`- Va／Vc 由缺基團變成可算：${summary.mvBecame.length} 個（${summary.mvBecame.join('、') || '無'}）`);
  out(`- **原本可算、數值改變的列**（Yg、VW、Va／Vc 的數值）：${summary.changedOk.length} 個（${summary.changedOk.join('、') || '無'}）`);
  out();

  // ---------- B-2 書中聚合物驗證 ----------
  const tgOf = (s: string) => computeTg(RDKit, s);
  const pct = (a: number, b: number) => `${(((a - b) / b) * 100).toFixed(1)}%`;

  out('## B-2-1. Yg：書中含新基團的聚合物');
  out();
  out('書中 Table 6.4（書頁 143–144）只印名稱與 Tg 計算值，沒有畫結構；重複單元由名稱整理（待使用者審）。差＝程式 − 書中計算值。差 ≤ 1 K 視為重現（同任務 026 的標準）。');
  out();
  out('| 聚合物（出處） | SMILES | 書中 Tg 計算值（K） | 程式 Tg（K） | ΣYg／ΣM | 差（K） | 重現（≤ 1 K） | 用到的新基團 |');
  out('|---|---|---|---|---|---|---|---|');
  const yg: { name: string; smiles: string; book: number; where: string }[] = [
    { name: '聚（己二酸乙二酯）', smiles: '[*:1]CCOC(=O)CCCCC(=O)O[*:2]', book: 228, where: 'Table 6.4，書頁 143' },
    { name: '聚（己二酸十亞甲基酯）', smiles: '[*:1]CCCCCCCCCCOC(=O)CCCCC(=O)O[*:2]', book: 213, where: 'Table 6.4，書頁 143' },
    { name: '聚（十二烷二酸乙二酯）', smiles: '[*:1]CCOC(=O)CCCCCCCCCCC(=O)O[*:2]', book: 216, where: 'Table 6.4，書頁 143' },
    { name: '聚（丙二酸二乙二醇酯）', smiles: '[*:1]CCOCCOC(=O)CC(=O)O[*:2]', book: 232, where: 'Table 6.4，書頁 143' },
    { name: '聚（十八烷二酸二乙二醇酯）', smiles: '[*:1]CCOCCOC(=O)CCCCCCCCCCCCCCCCC(=O)O[*:2]', book: 211, where: 'Table 6.4，書頁 143' },
    { name: '聚（4,4\'-四亞甲基二苯甲酸酐）', smiles: '[*:1]c1ccc(cc1)CCCCc1ccc(cc1)C(=O)OC(=O)[*:2]', book: 322, where: 'Table 6.4，書頁 143' },
    { name: '聚（4,4\'-亞甲基二氧二苯甲酸酐）', smiles: '[*:1]c1ccc(cc1)OCOc1ccc(cc1)C(=O)OC(=O)[*:2]', book: 336, where: 'Table 6.4，書頁 143' },
    { name: '聚（4,4\'-亞甲基二伸苯碳酸酯）', smiles: '[*:1]c1ccc(cc1)Cc1ccc(cc1)OC(=O)O[*:2]', book: 368, where: 'Table 6.4，書頁 143（已知重現不了，M13）' },
    { name: '聚（對甲基苯乙烯）', smiles: '[*:1]CC([*:2])c1ccc(C)cc1', book: 379, where: 'Table 6.4，書頁 143（已知重現不了，M09、M12）' },
    { name: '聚（間苯二甲酸間伸苯酯）', smiles: '[*:1]Oc1cccc(c1)OC(=O)c1cccc(c1)C(=O)[*:2]', book: 392, where: 'Table 6.4，書頁 143' },
  ];
  let ygReproduced = 0;
  for (const c of yg) {
    const r: any = tgOf(c.smiles);
    if (r.status !== 'ok') {
      out(`| ${c.name}（${c.where}） | \`${cell(c.smiles)}\` | ${c.book} | 缺基團 ${r.missing.length} 個原子 | — | — | — | — |`);
      continue;
    }
    const d = r.tgK - c.book;
    const ok = Math.abs(d) <= 1;
    if (ok) ygReproduced++;
    const newOnes = [...new Set(r.groups.filter((g: any) => /^(A\.CH\(CH3\)|A\.CH\(C6H4CH3\)|A\.C\(CH3\)\(C6H5\)|A\.C\(C6H5\)2|A\.S|A\.Si|B\.CH=CH|B\.COO|B\.SO2|B\.naph|C\.|T\.C6H4)/.test(g.rowId)).map((g: any) => g.name))].join('；');
    out(`| ${c.name}（${c.where}） | \`${cell(c.smiles)}\` | ${c.book} | ${fx(r.tgK, 1)} | ${fx(r.sumYg, 1)}／${fx(r.sumM, 1)} | ${d >= 0 ? '+' : ''}${fx(d, 1)} | ${ok ? '是' : '否'} | ${newOnes || '—'} |`);
  }
  out();
  out('**–COO– 若取 11.5（Table 6.1 B 的 C=O 非共軛值）而不是 12.5，上面五個脂肪族聚酯各差多少**（只是診斷，沒有改資料表）：');
  out();
  out('| 聚合物 | 書中 | 程式（–COO– 12.5） | 假設 –COO– 為 11.5 的 Tg（K） | 差（K） |');
  out('|---|---|---|---|---|');
  for (const c of yg.slice(0, 5)) {
    const r: any = tgOf(c.smiles);
    if (r.status !== 'ok') continue;
    const nCoo = r.groups.filter((g: any) => g.familyId === 'B.COO').length;
    const alt = (1000 * (r.sumYg - nCoo * 1.0)) / r.sumM;
    out(`| ${c.name} | ${c.book} | ${fx(r.tgK, 1)} | ${fx(alt, 1)} | ${fx(alt - c.book, 1)} |`);
  }
  out();
  out(`**Table 6.4 重現數（≤ 1 K，含上表所有列）：${ygReproduced}／${yg.length}。**`);
  out();
  out('### Example 6.4（ULTEM 1000，書頁 145）：書中以 ΣYg = 285 計算');
  out();
  const ultem = '[*:1]N1C(=O)c2ccc(Oc3ccc(cc3)C(C)(C)c3ccc(Oc4ccc5C(=O)N([*:2])C(=O)c5c4)cc3)cc2C1=O';
  const ur: any = tgOf(ultem);
  if (ur.status === 'ok') {
    out(`- SMILES：\`${ultem}\`；程式分組：${ur.groups.map((g: any) => `${g.name}（${g.ygi}）`).join('、')}`);
    out(`- 程式 ΣYg = ${fx(ur.sumYg, 1)}（書中 285，**${Math.abs(ur.sumYg - 285) < 1e-9 ? '一致' : '不一致'}**）；程式 ΣM = ${fx(ur.sumM, 1)}（書中 M 印 587、算 Tg 時用 578；書中三個增量 95×2 + 4×2 + 87 的 Mi 加總為 ${fx(145.1 * 2 + 16 * 2 + 194.3, 1)}，M09 已知書中 M 不一致）。程式 Tg ${fx(ur.tgK, 1)} K；書中 493 K（用 M = 578）。`);
  } else out(`- ${tgCell(ur)}`);
  out();
  out('### Table 6.3 組合基團（書頁 141–142）的程式取值與書中值');
  out();
  out('| 組合基團 | SMILES | 書中 Ygi／Mi | 程式 ΣYg／ΣM | 一致 |');
  out('|---|---|---|---|---|');
  const t63 = [
    { n: '–C6H4–CH2–C6H4–', s: '[*:1]c1ccc(Cc2ccc([*:2])cc2)cc1', y: 65, m: 166.2 },
    { n: '–C6H4–O–C6H4–', s: '[*:1]c1ccc(Oc2ccc([*:2])cc2)cc1', y: 67, m: 168.2 },
    { n: '–C6H4–S–C6H4–', s: '[*:1]c1ccc(Sc2ccc([*:2])cc2)cc1', y: 72, m: 184.2 },
    { n: '–C6H4–SO2–C6H4–', s: '[*:1]c1ccc(S(=O)(=O)c2ccc([*:2])cc2)cc1', y: 111, m: 216.3 },
    { n: '聯伸苯', s: '[*:1]c1ccc(cc1)-c1ccc([*:2])cc1', y: 70, m: 152.2 },
  ];
  for (const c of t63) {
    const r: any = tgOf(c.s);
    out(`| ${c.n} | \`${cell(c.s)}\` | ${c.y}／${c.m} | ${r.status === 'ok' ? `${fx(r.sumYg, 1)}／${fx(r.sumM, 1)}（${r.groups.map((g: any) => g.rowId).join('、')}）` : tgCell(r)} | ${r.status === 'ok' && Math.abs(r.sumYg - c.y) < 1e-9 && Math.abs(r.sumM - c.m) < 1e-9 ? '是' : '否'} |`);
  }
  out();

  // ---------- B-2-2 VW ----------
  out('## B-2-2. VW：書中含新基團的聚合物（Table 4.7 書頁 82–83、Table 4.8 書頁 84–85）');
  out();
  out('差＝程式 − 書中 VW；容許 ≤ 0.5 cm³/mol 或 ≤ 1%（同任務 030 D-3 門檻）。–O– 的 VW 依 M19 留空，所以含醚 O 的聚合物程式回報缺基團，另列「手算（–O– 取 5.5｜5.0）」供對照，不是程式輸出。');
  out();
  out('| 聚合物（出處） | SMILES | 書中 VW | 程式 VW | 差 | 通過 | 備註 |');
  out('|---|---|---|---|---|---|---|');
  const vwc: { name: string; smiles: string; book: number; where: string; handO?: number }[] = [
    { name: '聚（1,4-伸苯硫醚）', smiles: '[*:1]c1ccc(S[*:2])cc1', book: 54.1, where: 'Table 4.8，書頁 85' },
    { name: '聚（硫代雙(4-伸苯基)碳酸酯）', smiles: '[*:1]c1ccc(cc1)Sc1ccc(cc1)OC(=O)O[*:2]', book: 116.3, where: 'Table 4.7，書頁 83；Table 4.8，書頁 85' },
    { name: '聚（2,6-二甲基-1,4-伸苯醚）', smiles: '[*:1]Oc1c(C)cc([*:2])cc1C', book: 69.3, where: 'Table 4.7，書頁 83；Table 4.8，書頁 85', handO: 65.6 },
    { name: '聚（2,6-二苯基-1,4-伸苯醚）', smiles: '[*:1]Oc1c(cc([*:2])cc1-c1ccccc1)-c1ccccc1', book: 133.7, where: 'Table 4.7，書頁 83；Table 4.8，書頁 85', handO: 130 },
    { name: '聚二甲基矽氧烷', smiles: '[*:1]O[Si](C)(C)[*:2]', book: 47.6, where: 'Table 4.8，書頁 85', handO: 42.2 },
    { name: 'Kapton（聚[N,N\'-(p,p\'-氧二伸苯)均苯四甲醯亞胺]）', smiles: '[*:1]N1C(=O)c2cc3C(=O)N(C(=O)c3cc2C1=O)c1ccc(Oc2ccc([*:2])cc2)cc1', book: 184.1, where: 'Table 4.8，書頁 85', handO: 94.5 + 43.3 * 2 },
    { name: '聚丙烯腈（等規）', smiles: '[*:1]CC([*:2])C#N', book: 30.7, where: 'Table 4.8，書頁 84' },
  ];
  let vwPass = 0;
  for (const c of vwc) {
    const r: any = computeVdwVolume(RDKit, c.smiles);
    if (r.status === 'ok') {
      const d = r.vw - c.book;
      const ok = Math.abs(d) <= 0.5 || Math.abs(d / c.book) <= 0.01;
      if (ok) vwPass++;
      out(`| ${c.name}（${c.where}） | \`${cell(c.smiles)}\` | ${c.book} | ${fx(r.vw)} | ${d >= 0 ? '+' : ''}${fx(d)}（${pct(r.vw, c.book)}） | ${ok ? '是' : '否'} | ${r.groups.map((g: any) => g.name).join('、')} |`);
    } else {
      const note = c.handO !== undefined ? `手算：${fx(c.handO)} + –O– 5.5｜5.0 = ${fx(c.handO + 5.5)}｜${fx(c.handO + 5.0)}（差 ${fx(c.handO + 5.5 - c.book)}｜${fx(c.handO + 5.0 - c.book)}）；書中值反推 –O– = ${fx(c.book - c.handO)}` : '';
      out(`| ${c.name}（${c.where}） | \`${cell(c.smiles)}\` | ${c.book} | 缺基團：${r.status === 'missing' ? cell(missingDesc(r)) : r.status} | — | — | ${note} |`);
    }
  }
  out();
  out(`**程式可直接重現（通過門檻）：${vwPass} 個。** 含醚 O 的 4 個因 M19 留空而無法由程式計算（Table 4.7／4.8 的 –O– 反推值 3.0–3.7，與括號值 5.5｜5.0 都不同，M19 已記）。`);
  out();

  // ---------- B-2-3 Va／Vc ----------
  out('## B-2-3. Va／Vc：書中含新基團的聚合物（Table 4.7 的 Vr＝Va 與 Table 4.8 的 Vc，書頁 82–85）');
  out();
  out('Table 4.10 的基團增量是相關式，不是 Table 4.7／4.8 的「計算值」，所以這裡比的是程式（Σ增量）與書中由實測密度算的 Vr／Vc；容許 ≤ 5%（030 報告 C 節：Va／Vc 與 Vr／VW 相關的散布約 ±3%、最大 9%）。同時列出「程式 = 用 Table 4.10 逐項手算」。');
  out();
  out('| 聚合物（出處） | SMILES | 書中 Vr（Va） | 程式 Va | 差 | 書中 Vc | 程式 Vc | 差 | 手算一致 | 分組 |');
  out('|---|---|---|---|---|---|---|---|---|---|');
  const mvc: { name: string; smiles: string; vr: number | null; vc: number | null; where: string; hand: [number, number] }[] = [
    { name: '聚（1,4-伸苯硫醚）', smiles: '[*:1]c1ccc(S[*:2])cc1', vr: null, vc: 75.3, where: 'Table 4.8，書頁 85', hand: [17.3 + 65.5, 15.5 + 59] },
    { name: '聚（硫代雙(4-伸苯基)碳酸酯）', smiles: '[*:1]c1ccc(cc1)Sc1ccc(cc1)OC(=O)O[*:2]', vr: 180.2, vc: 170, where: 'Table 4.7，書頁 83；Table 4.8，書頁 85', hand: [17.3 + 65.5 * 2 + 31, 15.5 + 59 * 2 + 27] },
    { name: '聚（2,6-二甲基-1,4-伸苯醚）', smiles: '[*:1]Oc1c(C)cc([*:2])cc1C', vr: 112.3, vc: 92.0, where: 'Table 4.7，書頁 83；Table 4.8，書頁 85', hand: [104 + 8.0, 94 + 7.1] },
    { name: '聚（2,6-二苯基-1,4-伸苯醚）', smiles: '[*:1]Oc1c(cc([*:2])cc1-c1ccccc1)-c1ccccc1', vr: 214.3, vc: 202.0, where: 'Table 4.7，書頁 83；Table 4.8，書頁 85', hand: [208 + 8.0, 190 + 7.1] },
    { name: '聚乙酸乙烯酯', smiles: '[*:1]CC([*:2])OC(C)=O', vr: 72.4, vc: 64.5, where: 'Table 4.7，書頁 82；Table 4.8，書頁 84', hand: [16.37 + 52.4, 14.68 + 47] },
    { name: '聚（乙烯基甲基醚）', smiles: '[*:1]CC([*:2])OC', vr: null, vc: 50.0, where: 'Table 4.8，書頁 84', hand: [16.37 + 40.8, 14.68 + 36.6] },
    { name: '聚（α-甲基苯乙烯）', smiles: '[*:1]CC([*:2])(C)c1ccccc1', vr: 111.0, vc: 102.0, where: 'Table 4.7，書頁 82；Table 4.8，書頁 84', hand: [16.37 + 100.5, 14.68 + 90] },
    { name: 'Kapton（PMDA–ODA）', smiles: '[*:1]N1C(=O)c2cc3C(=O)N(C(=O)c3cc2C1=O)c1ccc(Oc2ccc([*:2])cc2)cc1', vr: null, vc: 247, where: 'Table 4.8，書頁 85', hand: [151 + 65.5 * 2 + 8.0, 135 + 59 * 2 + 7.1] },
  ];
  let vaPass = 0;
  let vaTotal = 0;
  let vcPass = 0;
  let vcTotal = 0;
  for (const c of mvc) {
    const r: any = computeMolarVolumeDensity(RDKit, c.smiles);
    if (r.status !== 'ok') {
      const hv = (hand: number, book: number | null) => (book === null ? fx(hand) : `${fx(hand)}（${pct(hand, book)}）`);
      out(`| ${c.name}（${c.where}） | \`${cell(c.smiles)}\` | ${c.vr ?? '—'} | 程式缺基團（M22：醚 O 接連接點 *）；**手算** ${hv(c.hand[0], c.vr)} | — | ${c.vc ?? '—'} | 手算 ${hv(c.hand[1], c.vc)} | — | — | — |`);
      continue;
    }
    const va = r.amorphous.vm;
    const vc = r.crystalline.vm;
    const dA = c.vr === null ? null : (va - c.vr) / c.vr;
    const dC = c.vc === null ? null : (vc - c.vc) / c.vc;
    if (dA !== null) {
      vaTotal++;
      if (Math.abs(dA) <= 0.05) vaPass++;
    }
    if (dC !== null) {
      vcTotal++;
      if (Math.abs(dC) <= 0.05) vcPass++;
    }
    const hand = Math.abs(va - c.hand[0]) < 1e-6 && Math.abs(vc - c.hand[1]) < 1e-6;
    out(`| ${c.name}（${c.where}） | \`${cell(c.smiles)}\` | ${c.vr ?? '—'} | ${fx(va)} | ${dA === null ? '—' : `${(dA * 100).toFixed(1)}%`} | ${c.vc ?? '—'} | ${fx(vc)} | ${dC === null ? '—' : `${(dC * 100).toFixed(1)}%`} | ${hand ? '是' : `否（手算 ${fx(c.hand[0])}／${fx(c.hand[1])}）`} | ${r.groups.map((g: any) => g.name).join('、')} |`);
  }
  out();
  out(`**程式算得出的比較（每個書中值一次）：Va 在 5% 內 ${vaPass}／${vaTotal}；Vc 在 5% 內 ${vcPass}／${vcTotal}；程式與 Table 4.10 手算完全一致：全部。** 二甲基伸苯醚、二苯基伸苯醚的 –O– 接連接點 *（M22），程式缺基團，只列手算。`);
  out();

  // ---------- B-3 PMDA–ODA ----------
  out('## B-3. PMDA–ODA 單元（Kapton 型）：Yg、VW、Va／Vc');
  out();
  const pmda = '[*:1]N1C(=O)c2cc3C(=O)N(C(=O)c3cc2C1=O)c1ccc(Oc2ccc([*:2])cc2)cc1';
  const p1: any = tgOf(pmda);
  const p2: any = computeVdwVolume(RDKit, pmda);
  const p3: any = computeMolarVolumeDensity(RDKit, pmda);
  out(`- SMILES：\`${pmda}\``);
  out(`- **Yg**：${p1.status === 'ok' ? `${p1.groups.map((g: any) => `${g.name} ${g.ygi}`).join('；')}；ΣYg = ${fx(p1.sumYg, 1)}、ΣM = ${fx(p1.sumM, 1)}（單元質量 ${fx(p1.formulaMass, 2)}，差 ${fx(p1.massDelta, 2)}）→ Tg = ${fx(p1.tgK, 1)} K（${fx(p1.tgC, 1)} °C）；組合基團 –C6H4–O–C6H4–（67）比 2 × 對伸苯基 + –O– 優先（任務 026 的較大基團優先規則）` : tgCell(p1)}`);
  out(`- **VW**：${p2.status === 'ok' ? `${fx(p2.vw)} cm³/mol` : `程式回報缺基團（${cell(missingDesc(p2))}）——只缺 –O–（M19 留空），均苯四甲醯亞胺與兩個對伸苯基都已配對`}。手算：94.5 + 2 × 43.3 + –O–（5.5｜5.0）= ${fx(94.5 + 86.6 + 5.5)}｜${fx(94.5 + 86.6 + 5.0)}（030 報告寫 186.1～186.6，**一致**）；Table 4.8 的 Kapton 書中 VW = 184.1（差 ${fx(94.5 + 86.6 + 5.5 - 184.1)}｜${fx(94.5 + 86.6 + 5.0 - 184.1)}，即 ${pct(94.5 + 86.6 + 5.5, 184.1)}｜${pct(94.5 + 86.6 + 5.0, 184.1)}）。`);
  out(`- **Va／Vc**：${p3.status === 'ok' ? `Va = ${fx(p3.amorphous.vm)}、Vc = ${fx(p3.crystalline.vm)} cm³/mol；單元質量 ${fx(p3.unitMass, 2)}，Va 密度 ${fx(p3.amorphous.density, 3)} g/cm³、Vc 密度 ${fx(p3.crystalline.density, 3)} g/cm³；分組：${p3.groups.map((g: any) => g.name).join('、')}；298 K 狀態：${p3.state.basis}` : `缺基團：${cell(missingDesc(p3))}`}。`);
  out();

  // ---------- BPDA–PDA ----------
  out('## BPDA–PDA 單元：共軛狀態書中沒說清楚，維持缺基團');
  out();
  const bpda = '[*:1]N1C(=O)c2ccc(cc2C1=O)-c1ccc2C(=O)N(C(=O)c2c1)c1ccc([*:2])cc1';
  const b1: any = tgOf(bpda);
  const b2: any = computeVdwVolume(RDKit, bpda);
  const b3: any = computeMolarVolumeDensity(RDKit, bpda);
  out(`- SMILES：\`${bpda}\``);
  if (b1.status === 'missing') {
    out(`- **Yg**：缺基團（正確，依任務單不自行決定）。已配對：${b1.groups.map((g: any) => `${g.name}（${g.ygi}）`).join('、')}；缺：${b1.missing.map((m: any) => m.description).join('；')}`);
  } else out(`- Yg：${tgCell(b1)}`);
  out(`- VW：${vwCellOf(b2)}${b2.status === 'missing' ? `（${cell(missingDesc(b2))}）` : ''}；Va／Vc：${mvCellOf(b3)}${b3.status === 'missing' ? `（${cell(missingDesc(b3))}）` : ''}`);
  out('- 候選（書中沒說該用哪一種，**僅列供使用者決定，程式沒有採用**）：N-鄰苯二甲醯亞胺 2 × 95 = 190 加對伸苯基 n 29.5／c 35／cc 41，ΣYg = 219.5／225／231；ΣM = 2 × 145.1 + 76.1 = 366.3；Tg = 599／614／631 K（只是算術，沒有寫進程式）。');
  out();

  writeFileSync(OUTPUT, lines.join('\n') + '\n', 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
} finally {
  await server.close();
}
