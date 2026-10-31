// 任務 030 A-4：半導體常用材料 SMILES 的分子式與質量檢查（RDKit 計算，非記憶值）。
// 聚合物單元用 capRepeatUnit（D05）把連接點改成甲基後計算；分子式與質量是「封端後」的數字，只供使用者核對結構有沒有寫對。
// 執行：node scripts/diagnosis/030-a0-semi-check.ts（輸出到 docs/verification/030-診斷-A0-半導體SMILES檢查.md）
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { SEMI } from './030-structures.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', '030-診斷-A0-半導體SMILES檢查.md');
const server = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true } });
try {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { capRepeatUnit } = await server.ssrLoadModule('/src/core/polymer/unitFragment.ts');
  const RDKit = await getRDKit();
  const lines: string[] = [];
  const out = (t = '') => lines.push(t);
  out('# 任務 030 A-4：半導體常用材料 SMILES 檢查（待使用者審）');
  out();
  out('SMILES 由 Claude 依結構名稱撰寫（D53 清單），分子式與質量由 RDKit 計算。聚合物單元的數字是「連接點改成甲基」後的片段（D05），不是單元本身。**請使用者審結構是否為想要的代表結構**；代表結構（DCPD、萘型、酚芳烷基等）的取代位置是示意，不代表某一商品。');
  out();
  out('| 類別 | 名稱 | 類型 | SMILES | RDKit 解析 | 分子式 | 精確質量（g/mol） | 平均分子量（g/mol） |');
  out('|---|---|---|---|---|---|---|---|');
  let bad = 0;
  for (const s of SEMI) {
    let smi = s.smiles;
    let note = '';
    if (s.kind === '聚合物單元') {
      const r = capRepeatUnit(RDKit, s.smiles);
      if (!r.ok) {
        out(`| ${s.cls} | ${s.name} | ${s.kind} | \`${s.smiles}\` | 失敗：${r.message} | — | — | — |`);
        bad++;
        continue;
      }
      smi = r.fragment.smiles;
      note = '（封端後）';
    }
    const m = RDKit.get_mol(smi);
    if (!m || !m.is_valid()) {
      out(`| ${s.cls} | ${s.name} | ${s.kind} | \`${s.smiles}\` | **無法解析** | — | — | — |`);
      bad++;
      m?.delete();
      continue;
    }
    const d = JSON.parse(m.get_descriptors());
    const mh = RDKit.get_mol(smi);
    mh!.add_hs_in_place();
    const formula = (() => {
      const j = JSON.parse(mh!.get_json()).molecules[0].atoms as { z?: number }[];
      const c = new Map<number, number>();
      for (const a of j) c.set(a.z ?? 6, (c.get(a.z ?? 6) ?? 0) + 1);
      const sym: Record<number, string> = { 1: 'H', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl' };
      const order = [6, 1, ...[...c.keys()].filter((z) => z !== 6 && z !== 1).sort((a, b) => (sym[a] ?? '').localeCompare(sym[b] ?? ''))];
      return order.filter((z) => c.has(z)).map((z) => `${sym[z] ?? `Z${z}`}${c.get(z) === 1 ? '' : c.get(z)}`).join('');
    })();
    out(`| ${s.cls} | ${s.name} | ${s.kind}${note} | \`${s.smiles}\` | 通過 | ${formula} | ${(d.exactmw as number).toFixed(4)} | ${(d.amw as number).toFixed(3)} |`);
    m.delete();
    mh!.delete();
  }
  out();
  out(`共 ${SEMI.length} 個結構，解析失敗 ${bad} 個。`);
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`已寫入 ${OUTPUT}；失敗 ${bad}`);
} finally {
  await server.close();
}
