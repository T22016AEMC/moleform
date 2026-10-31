// 任務 031 後續診斷 D：Table 6.4 兩個差很多的聚合物（聚間苯二甲酸間伸苯酯 392 K、聚（對伸苯基二伸乙基癸二醯胺）373 K）。
// 書中計算值 × 單元質量 ＝ 隱含 ΣYg，與程式的 ΣYg 逐基團比對；再窮舉 Table 6.1 的 n／c／cc 與 CH2 斜率組合，看有沒有自然的取法能得到隱含值。
// 單元結構由使用者 2026-10-31 確認。只診斷，不改規則。執行：node scripts/diagnosis/031-d-table64-two.ts
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', '031-診斷-D-Table64兩個聚合物-輸出.md');
const server = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true } });
try {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { computeTg } = await server.ssrLoadModule('/src/core/properties/tgGroupContribution.ts');
  const { readYgGroups } = await server.ssrLoadModule('/src/core/data/ygGroups.ts');
  const RDKit = await getRDKit();
  const OLD = readYgGroups(execFileSync('git', ['show', '56eb49d:src/data/yg_groups.csv'], { cwd: root, encoding: 'utf8' })).rows;
  const lines: string[] = [];
  const out = (t = '') => lines.push(t);
  const f1 = (v: number) => v.toFixed(1);
  const groupsOf = (r: any) => r.groups.map((g: any) => `${g.rowId}:${g.ygi}`).join(' ');
  out('# 任務 031 後續診斷 D：Table 6.4 的兩個聚合物');
  out();
  out('隱含 ΣYg ＝ 書中 Tg 計算值（Table 6.4，書頁 143）× 單元質量 ÷ 1000；書中 Tg 只印整數，所以隱含 ΣYg 有 ±0.5 K 的範圍。分類：**書本身不一致**＝書中值無法由 Table 6.1／6.3 與書中規則自洽地算出；**我們的規則或讀值有誤**＝找到一個自然的取法能重現（先回報，不自行修）。');
  out();
  const near = (x: number, t: number, tol: number) => Math.abs(x - t) <= tol;

  // ---- 1. 聚間苯二甲酸間伸苯酯 ----
  {
    const smiles = '[*:1]c1cccc(c1)OC(=O)c1cccc(c1)C(=O)O[*:2]';
    const now: any = computeTg(RDKit, smiles);
    const before: any = computeTg(RDKit, smiles, { rows: OLD });
    const M = now.sumM;
    const t = (392 * M) / 1000;
    const tol = (0.5 * M) / 1000;
    out('## 1. 聚間苯二甲酸間伸苯酯（單元 –O–C6H4(m)–O–CO–C6H4(m)–CO–，書 392 K）');
    out();
    out(`- 單元質量 ${f1(M)}；**隱含 ΣYg = ${t.toFixed(2)}（±${tol.toFixed(2)}）**。`);
    out(`- 補收前（Table 6.1 單一基團）：${f1(before.sumYg)}／Tg ${f1(before.tgK)} K（${groupsOf(before)}）`);
    out(`- 補收後：${f1(now.sumYg)}／Tg ${f1(now.tgK)} K（${groupsOf(now)}）`);
    out('- 這個單元的原子 = –OOC–C6H4(m)–COO–（Table 6.3，56.5，M 164.1）+ 一個間伸苯基（M 76.1），質量 240.2 恰好相等。間伸苯基只鄰接醚／酯的 O，沒有鄰接雙鍵基團，Table 6.1 B 狀態為 n（25）。');
    out();
    out('| 取法 | ΣYg | Tg（K） | 與書差（K） |');
    out('|---|---|---|---|');
    const rows: [string, number][] = [
      ['程式（Table 6.3 的 56.5 + 間伸苯基 n 25）', 56.5 + 25],
      ['56.5 + 間伸苯基 c 29', 56.5 + 29],
      ['56.5 + 間伸苯基 cc 34', 56.5 + 34],
      ['56.5 + –O–C6H4–O– 37.4（Table 6.3 只有對位；且會重複計算兩個 O，質量對不上）', 56.5 + 37.4],
      ['補收前的 Table 6.1 取法（2×–COO– cc 15 + 2×間伸苯基 cc 34）', 98],
      ['–COO– 12.5 + 13.5、2×間伸苯基 cc 34', 12.5 + 13.5 + 68],
    ];
    for (const [n, s] of rows) out(`| ${n} | ${s.toFixed(1)} | ${f1((1000 * s) / M)} | ${f1((1000 * s) / M - 392)} |`);
    out();
    out('窮舉 2×–COO–（12.5／13.5／15）+ 2×間伸苯基（25／29／34）能落在隱含範圍（±0.5 K 再放寬 0.3）的組合：');
    const COO = [12.5, 13.5, 15];
    const R = [25, 29, 34];
    let any = false;
    for (const a of COO) for (const b of COO) if (a <= b) for (const r1 of R) for (const r2 of R) if (r1 <= r2) {
      const s = a + b + r1 + r2;
      if (near(s, t, tol + 0.3)) {
        any = true;
        out(`- COO ${a} + ${b}，環 ${r1} + ${r2} → ${s.toFixed(1)}（${f1((1000 * s) / M)} K）：不對稱，兩個酯基、兩個環在結構上完全對等，沒有合理的規則會把它們取成不同狀態。`);
      }
    }
    if (!any) out('- 無。');
    out();
    out('**判定：書本身不一致。** 沒有任何對稱、與質量自洽的取法能得到 94.2；最接近的 56.5 + 37.4 = 93.9（390.9 K）把兩個 O 算了兩次（質量會是 272.2，不是 240.2）。程式的取法（56.5 + n 25 = 81.5）與 Table 6.1／6.3 的規則一致；沒有找到我們的規則或讀值有誤的證據。');
    out();
  }

  // ---- 2. 聚（對伸苯基二伸乙基癸二醯胺） ----
  {
    const smiles = '[*:1]CCc1ccc(cc1)CCNC(=O)CCCCCCCCC(=O)N[*:2]';
    const now: any = computeTg(RDKit, smiles);
    const before: any = computeTg(RDKit, smiles, { rows: OLD });
    const M = now.sumM;
    const t = (373 * M) / 1000;
    const tol = (0.5 * M) / 1000;
    out('## 2. 聚（對伸苯基二伸乙基癸二醯胺）（單元 –NH–CH2CH2–C6H4(p)–CH2CH2–NH–CO–(CH2)8–CO–，書 373 K）');
    out();
    out(`- 單元質量 ${f1(M)}；**隱含 ΣYg = ${t.toFixed(2)}（±${tol.toFixed(2)}）**。`);
    out(`- 補收前：${f1(before.sumYg)}／${f1(before.tgK)} K（${groupsOf(before)}）`);
    out(`- 補收後：${f1(now.sumYg)}／${f1(now.tgK)} K（${groupsOf(now)}）`);
    out('- **氫鍵鏈斜率 4.3 已套用**：Fig. 6.3B（書頁 139）把「Poly(xylylene diamides) 與 Poly(phenylene diethylene diamides)」列入含氫鍵基團的族群（斜率 4.3）；程式因單元內有 –CONH– 而對 CH2 取 4.3（補收前 10 個 CH2 hb；補收後 –CH2–C6H4–CH2– 組合 35 取走 2 個 CH2，其餘 10 個 hb）。');
    out('- 兩個 –CONH– 兩側都是 CH2，狀態 n（15）；伸苯基兩側是 CH2，狀態 n（29.5）。');
    out();
    out('| 取法 | ΣYg | Tg（K） | 與書差（K） |');
    out('|---|---|---|---|');
    const rows: [string, number][] = [
      ['補收後（–CH2–C6H4–CH2– 35 + 10×4.3 + 2×15）', 35 + 43 + 30],
      ['補收前（12×4.3 + 伸苯基 n 29.5 + 2×15）', 12 * 4.3 + 29.5 + 30],
      ['若 CH2 全取 2.7（無氫鍵）', 12 * 2.7 + 29.5 + 30],
    ];
    for (const [n, s] of rows) out(`| ${n} | ${s.toFixed(1)} | ${f1((1000 * s) / M)} | ${f1((1000 * s) / M - 373)} |`);
    out();
    out(`隱含 ΣYg ${t.toFixed(1)} 比程式（補收前取法 ${f1(12 * 4.3 + 29.5 + 30)}）高 ${f1(t - (12 * 4.3 + 29.5 + 30))}，比補收後（108.0）高 ${f1(t - 108)}。窮舉 Table 6.1 的取值（CH2 斜率 2.7／4.3 × 伸苯基 n／c／cc × 兩個 –CONH– n／c／cc，及組合 35 版本）：`);
    const A = [15, 21.5, 30];
    const Rg = [29.5, 35, 41];
    let any = false;
    for (const s of [2.7, 4.3]) for (const a of A) for (const b of A) if (a <= b) for (const r of Rg) {
      const x = 12 * s + a + b + r;
      if (near(x, t, tol + 1.5)) {
        any = true;
        out(`- CH2 ${s}、–CONH– ${a} + ${b}、伸苯基 ${r} → ${x.toFixed(1)}（${f1((1000 * x) / M)} K）`);
      }
    }
    for (const s of [2.7, 4.3]) for (const a of A) for (const b of A) if (a <= b) {
      const x = 10 * s + 35 + a + b;
      if (near(x, t, tol + 1.5)) {
        any = true;
        out(`- 組合 35、CH2 ${s}×10、–CONH– ${a} + ${b} → ${x.toFixed(1)}（${f1((1000 * x) / M)} K）`);
      }
    }
    if (!any) out('- 無。');
    out();
    out('列出的組合都違反書中規則：不是兩個對等的 –CONH–（兩側環境完全相同）取不同的狀態值，就是伸苯基或 –CONH– 取 c／cc（它們兩側都是 CH2，沒有鄰接芳香環或雙鍵基團，書中定義為 n），或 CH2 不取 Fig. 6.3B 的氫鍵斜率 4.3（與書的圖說矛盾），沒有自然的規則。Fig. 6.3B 的最上面一條線（xylylene／phenylene diethylene diamides）截距遠高於其他醯胺族：隱含 ΣYg − 12×4.3 = ' + (t - 51.6).toFixed(1) + '，程式只有 ' + (29.5 + 30).toFixed(1) + '（伸苯基 + 兩個 –CONH–），差 ' + (t - 51.6 - 59.5).toFixed(1) + '——像是書的圖／第二版的交互作用參數 Iₖ（書頁 139 腳註：第二版另有參數 Iₖ，第四版改為兩個 CH2 增量）留下的額外增量，Table 6.1／6.3 沒有對應的值。');
    out();
    out('**判定：書本身不一致（Table 6.4 的 373 K 無法由 Table 6.1／6.3 重現），沒有找到我們的規則或讀值有誤的證據。** 另有一個小問題需要使用者留意：這類氫鍵單元中 –CH2–C6H4–CH2– 組合（35，Table 6.3「in flexible chains」）取代了「2 × 4.3 + 29.5 = 38.1」，使 Tg 再低 9 K；Table 6.3 沒有說含氫鍵族時組合基團怎麼取，程式照書中值 35。');
    out();
  }
  writeFileSync(OUTPUT, lines.join('\n') + '\n', 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
} finally {
  await server.close();
}
