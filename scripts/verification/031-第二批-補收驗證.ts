// 任務 031 第二批（Table 6.3 其餘組合基團）的驗證輸出：每個新組合基團的程式取值對書中值、PET 與其他受影響結構的補收前後差異、書中 Table 6.4 對照。
// 「補收前」＝git 56eb49d（任務 031 第一批，已推送）的 yg_groups.csv；「補收後」＝目前資料表。只列程式輸出，不判斷化學（D17）。
// 分子量只列在這個驗證文件中，網站上不顯示（D09）。
// 執行：npm run verify:031b（Node 直接執行 .ts，只用可抹除的型別語法）。
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', '031-第二批-補收驗證-輸出.md');
const BASE_COMMIT = '56eb49d';
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
  const { readYgGroups, YG_GROUPS } = await server.ssrLoadModule('/src/core/data/ygGroups.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const { USER_SMALL, USER_UNITS, SEMI } = await server.ssrLoadModule('/scripts/diagnosis/030-structures.ts');
  const RDKit = await getRDKit();
  const OLD = readYgGroups(gitShow('src/data/yg_groups.csv')).rows;

  const lines: string[] = [];
  const out = (text = '') => lines.push(text);
  const fx = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
  const cell = (text: string) => text.replace(/\|/g, '\\|');
  const tgCell = (r: any): string => (r.status === 'ok' ? `${fx(r.tgK)} K（${fx(r.sumYg)}／${fx(r.sumM)}）` : r.status === 'missing' ? `缺基團 ${r.missing.length} 個原子` : '無法計算');
  const groupsOf = (r: any): string => (r.groups ?? []).map((g: any) => `${g.rowId}:${g.ygi}`).join(' ');

  out('# 任務 031 第二批：補收 Table 6.3 其餘組合基團的驗證輸出');
  out();
  out(`補收前＝git ${BASE_COMMIT} 的 \`yg_groups.csv\`（56 列）；補收後＝目前資料表（${YG_GROUPS.length} 列，新增 15 列，既有列逐字不變）。「ΣYg／ΣM」單位 K·kg/mol、g/mol（只列在本文件，網站不顯示）。`);
  out('本檔由 `npm run verify:031b` 產生，只列程式輸出，不判斷化學（D17）。');
  out();

  // ---------- 1. 新組合基團逐一對書 ----------
  out('## 1. 15 個新組合基團：程式取值對書中 Table 6.3（書頁 141–142）');
  out();
  out('每列用只含該組合基團的最小單元（兩端連接點）計算；書中 Ygi／Mi 全部由 PDF 第 168、169 頁圖像讀取。括號值（書中標為暫定）照值收錄。');
  out();
  out('| 組合基團 | 單元 SMILES | 書中 Ygi／Mi | 程式 ΣYg／ΣM | 程式配出的基團 | Ygi 一致 |');
  out('|---|---|---|---|---|---|');
  const combos: [string, string, number, string][] = [
    ['–C6H4–C(CH3)(C6H5)–C6H4–', '[*:1]c1ccc(cc1)C(C)(c1ccccc1)c1ccc([*:2])cc1', 121, '256.3'],
    ['–C6H4–C(C6H5)2–C6H4–', '[*:1]c1ccc(cc1)C(c1ccccc1)(c1ccccc1)c1ccc([*:2])cc1', 168, '316.4（印刷值，基團質量 318.4）'],
    ['–C6H4–C6H10–C6H4–', '[*:1]c1ccc(cc1)C1CCC(CC1)c1ccc([*:2])cc1', 102, '234.3'],
    ['–C6H4–C(CH3)2–C6H4–C(CH3)2–C6H4–', '[*:1]c1ccc(cc1)C(C)(C)c1ccc(cc1)C(C)(C)c1ccc([*:2])cc1', 137, '312.3（印刷值，基團質量 312.5）'],
    ['–CH2–C6H4–CH2–', '[*:1]Cc1ccc(cc1)C[*:2]', 35, '104.1'],
    ['–OOC–C6H4–COO–（對位）', '[*:1]OC(=O)c1ccc(cc1)C(=O)O[*:2]', 62, '164.1'],
    ['–OOC–C6H4–COO–（間位）', '[*:1]OC(=O)c1cccc(c1)C(=O)O[*:2]', 56.5, '164.1'],
    ['–NHCO–C6H4–CONH–（對位）', '[*:1]NC(=O)c1ccc(cc1)C(=O)N[*:2]', 83, '162.1'],
    ['–NHCO–C6H4–CONH–（間位）', '[*:1]NC(=O)c1cccc(c1)C(=O)N[*:2]', 70, '162.1'],
    ['–O–C6H4–C(=O)–（對位，括號值）', '[*:1]Oc1ccc(cc1)C(=O)[*:2]', 58, '120.1'],
    ['–O–C6H4–C(=O)–（間位，括號值）', '[*:1]Oc1cccc(c1)C(=O)[*:2]', 52, '120.1'],
    ['–NH–C6H4–C(=O)–（對位，括號值）', '[*:1]Nc1ccc(cc1)C(=O)[*:2]', 70, '119.1'],
    ['–NH–C6H4–NH–C(=O)–C6H4–C(=O)–（對、對）', '[*:1]Nc1ccc(cc1)NC(=O)c1ccc(cc1)C(=O)[*:2]', 148, '238.3'],
    ['–NH–C6H4–NH–C(=O)–C6H4–C(=O)–（間、間）', '[*:1]Nc1cccc(c1)NC(=O)c1cccc(c1)C(=O)[*:2]', 112, '238.3'],
    ['–C6H4–O–C6H4–O–C6H4–', '[*:1]c1ccc(cc1)Oc1ccc(cc1)Oc1ccc([*:2])cc1', 104, '260.2（印刷值，基團質量 260.3）'],
  ];
  let comboOk = 0;
  for (const [name, smiles, book, mbook] of combos) {
    const r: any = computeTg(RDKit, smiles);
    const ok = r.status === 'ok' && Math.abs(r.sumYg - book) < 1e-9;
    if (ok) comboOk++;
    out(`| ${name} | \`${smiles}\` | ${book}／${mbook} | ${r.status === 'ok' ? `${fx(r.sumYg, 1)}／${fx(r.sumM, 1)}` : r.status} | ${r.status === 'ok' ? groupsOf(r) : ''} | ${ok ? '是' : '**否**'} |`);
  }
  out();
  out(`**Ygi 一致：${comboOk}／${combos.length}。**`);
  out();

  // ---------- 2. Table 6.4 ----------
  out('## 2. Table 6.4（書頁 143–144）中用到新組合基團的聚合物');
  out();
  out('重複單元由名稱整理（Table 6.4 沒畫結構，待使用者審）；單元的兩端選在不切開組合基團的位置（組合基團不跨連接點配對，見報告）。差＝程式 − 書中計算值；「前」為補收前（git ' + BASE_COMMIT + '）。');
  out();
  out('| 聚合物 | SMILES | 書中 Tg 計算值（K） | 前（K） | 後（K） | 後的差（K） | 重現（≤ 1 K） | 後的基團 |');
  out('|---|---|---|---|---|---|---|---|');
  const t64: [string, string, number][] = [
    ['聚對苯二甲酸乙二酯（PET）', '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]', 361],
    ['聚對苯二甲酸十亞甲基酯', '[*:1]CCCCCCCCCCOC(=O)c1ccc(cc1)C(=O)O[*:2]', 299],
    ['聚間苯二甲酸間伸苯酯', '[*:1]c1cccc(c1)OC(=O)c1cccc(c1)C(=O)O[*:2]', 392],
    ['聚對苯二甲酸七亞甲基醯胺', '[*:1]CCCCCCCNC(=O)c1ccc(cc1)C(=O)N[*:2]', 435],
    ['聚（對伸苯基二伸乙基癸二醯胺）', '[*:1]CCc1ccc(cc1)CCNC(=O)CCCCCCCCC(=O)N[*:2]', 373],
    ['聚（伸苯基二亞甲基六亞甲基二胺基甲酸酯）', '[*:1]Cc1ccc(cc1)COC(=O)NCCCCCCNC(=O)O[*:2]', 338],
  ];
  let t64Pass = 0;
  for (const [name, smiles, book] of t64) {
    const r0: any = computeTg(RDKit, smiles, { rows: OLD });
    const r1: any = computeTg(RDKit, smiles);
    const d = r1.status === 'ok' ? r1.tgK - book : null;
    if (d !== null && Math.abs(d) <= 1) t64Pass++;
    out(`| ${name} | \`${smiles}\` | ${book} | ${r0.status === 'ok' ? fx(r0.tgK) : '缺基團'} | ${r1.status === 'ok' ? fx(r1.tgK) : '缺基團'} | ${d === null ? '—' : (d >= 0 ? '+' : '') + fx(d)} | ${d !== null && Math.abs(d) <= 1 ? '是' : '否'} | ${r1.status === 'ok' ? groupsOf(r1) : ''} |`);
  }
  out();
  out(`**重現數（≤ 1 K）：${t64Pass}／${t64.length}。**`);
  out();

  // ---------- 3. PET ----------
  out('## 3. PET：補收前後與書中手算');
  out();
  const pet: any = computeTg(RDKit, '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]');
  const pet0: any = computeTg(RDKit, '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]', { rows: OLD });
  out(`- 補收前（第一批資料表）：ΣYg ${fx(pet0.sumYg)}／ΣM ${fx(pet0.sumM)} → **${fx(pet0.tgK)} K**（${groupsOf(pet0)}）`);
  out(`- 補收後：ΣYg ${fx(pet.sumYg)}／ΣM ${fx(pet.sumM)} → **${fx(pet.tgK)} K**（${groupsOf(pet)}）`);
  out('- 書中手算（任務 030 報告 C 節）：–OOC–C6H4–COO– 62 + 2 × –CH2– 2.7 = 67.4，M = 192.2，Tg = 351 K；書中 Table 6.4 的計算值 361 K。');
  out();

  // ---------- 4. 前後差異 ----------
  out('## 4. 其他受影響結構的補收前後差異（使用者材料 22 個 + 半導體 25 個 + 骨架範本）');
  out();
  const items: { name: string; smiles: string }[] = [
    ...USER_SMALL.map((x: any) => ({ name: x.name, smiles: x.smiles })),
    ...USER_UNITS.map((x: any) => ({ name: x.name, smiles: x.smiles })),
    ...BACKBONE_TEMPLATES.map((t: any) => ({ name: `${t.id} ${t.名稱 ?? t.name}`, smiles: t.unitSmiles })),
    ...SEMI.map((x: any) => ({ name: x.name, smiles: x.smiles })),
  ];
  const changed: string[] = [];
  const became: string[] = [];
  const same: number[] = [0];
  const rowsOut: string[] = [];
  for (const it of items) {
    const r0: any = computeTg(RDKit, it.smiles, { rows: OLD });
    const r1: any = computeTg(RDKit, it.smiles);
    const a = tgCell(r0);
    const b = tgCell(r1);
    if (a === b && groupsOf(r0) === groupsOf(r1)) {
      same[0]++;
      continue;
    }
    if (r0.status !== 'ok' && r1.status === 'ok') became.push(it.name);
    if (r0.status === 'ok') changed.push(it.name);
    rowsOut.push(`| ${cell(it.name)} | \`${cell(it.smiles)}\` | ${a} | ${b} | ${r0.status === 'ok' ? '' : '缺基團→'}${r1.status === 'ok' ? groupsOf(r1) : ''} |`);
  }
  out('只列有變化的列（其餘沒有變化）。');
  out();
  out('| 名稱 | SMILES | 補收前 | 補收後 | 補收後的基團 |');
  out('|---|---|---|---|---|');
  for (const l of rowsOut) out(l);
  out();
  out(`- 沒有變化：${same[0]} 個。`);
  out(`- Tg 由缺基團變成可算：${became.length} 個（${became.join('、') || '無'}）。`);
  out(`- **原本可算、Tg 數值改變：${changed.length} 個（${changed.join('、') || '無'}）。**`);
  out();

  // ---------- 5. PEEK 表示法 ----------
  out('## 5. PEEK：表示法相依性（Example 6.3 與 Table 6.4）');
  out();
  const peekA = '*Oc1ccc(Oc2ccc(C(=O)c3ccc(*)cc3)cc2)cc1';
  const peekB = '*c1ccc(Oc2ccc(Oc3ccc(C(=O)*)cc3)cc2)cc1';
  for (const [label, s] of [['Example 6.3 的寫法（O 在連接點旁）', peekA], ['同一單元由環起寫（–C6H4–O–C6H4–O–C6H4– 完整出現）', peekB]] as const) {
    const r0: any = computeTg(RDKit, s, { rows: OLD });
    const r1: any = computeTg(RDKit, s);
    out(`- ${label}：\`${s}\`；補收前 ${tgCell(r0)}（${groupsOf(r0)}）；補收後 ${tgCell(r1)}（${groupsOf(r1)}）`);
  }
  out('- 書中：Example 6.3 用 37.4 + 84 = 121.4 → 421 K；Table 6.4「Poly[oxy bis(oxydiparaphenylene) ketone]」計算值 417 K。兩者書中本身就差 4 K。');
  out();

  writeFileSync(OUTPUT, lines.join('\n') + '\n', 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
} finally {
  await server.close();
}
