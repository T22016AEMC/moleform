// Phase 2 使用者驗證清單的產生腳本（任務 012，2.9）。
// 對固定的 8 個分子執行結構驗證與 3D 計算（種子 42），把「程式輸出」寫成 docs/verification/phase2-輸出.md。
// 輸出只有程式算出的數字，不含文獻參考值，也不判斷正常或異常（D17）。
// 執行：npm run verify:phase2
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Molecule, Resources } from 'openchemlib';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', 'phase2-輸出.md');

const MOLECULES = [
  ['乙醇', 'CCO'],
  ['環氧丙烷', 'CC1CO1'],
  ['苯酚', 'Oc1ccccc1'],
  ['雙酚 A', 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1'],
  ['BADGE', 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1'],
  ['L-丙胺酸', 'C[C@@H](C(=O)O)N'],
  ['反式 2-丁烯', 'C/C=C/C'],
  ['BF₃', 'FB(F)F'],
];

const SEED = 42;
const CONFORMERS = 5;

const server = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});

try {
  Resources.registerFromNodejs();
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { validateStructure } = await server.ssrLoadModule('/src/core/structure/validate.ts');
  const { ConformerSession } = await server.ssrLoadModule('/src/core/conformer/session.ts');
  const { UNOPTIMIZED_MEASURE_NOTE } = await server.ssrLoadModule('/src/core/conformer/types.ts');
  const { distance, angleDegrees } = await server.ssrLoadModule('/src/core/geometry.ts');
  const RDKit = await getRDKit();

  const version = (name) => JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')).version;

  /** 鍵型標籤：元素 C 排最前、H 排最後，其餘依字母；單鍵 –、雙鍵 =、三鍵 ≡，芳香鍵加「芳香」 */
  const elementRank = (symbol) => (symbol === 'C' ? '0' : symbol === 'H' ? 'z' : `1${symbol}`);
  function bondLabel(mol, bond) {
    const symbols = [mol.getBondAtom(0, bond), mol.getBondAtom(1, bond)]
      .map((a) => mol.getAtomLabel(a))
      .sort((a, b) => elementRank(a).localeCompare(elementRank(b)));
    if (mol.isAromaticBond(bond)) return `芳香 ${symbols.join('–')}`;
    const order = mol.getBondOrder(bond);
    return symbols.join(order === 3 ? '≡' : order === 2 ? '=' : '–');
  }

  const lines = [];
  const out = (text = '') => lines.push(text);
  out('# Phase 2 輸出（結構驗證與 3D）');
  out();
  out('以下為程式輸出，未經化學判斷。請使用者依文獻或經驗檢查是否合理（D17）。');
  out();
  out(`- 3D 設定：OpenChemLib ${version('openchemlib')}（ConformerGenerator，種子 ${SEED}，要求 ${CONFORMERS} 個構象）；MMFF94 最佳化；結構驗證：RDKit ${RDKit.version()}`);
  out('- 鍵長、鍵角取自構象 1（有 MMFF94 能量時即最低能量構象；未最佳化時為產生的第一個構象），由 x、y、z 座標計算（`src/core/geometry.ts`），含氫原子。');
  out('- 鍵長範圍為該鍵型所有鍵的最小值–最大值（Å），並列出該鍵型的鍵數。');
  out('- 重新產生：`npm run verify:phase2`（說明見 `docs/verification/README.md`）。');

  for (const [name, input] of MOLECULES) {
    out();
    out(`## ${name}`);
    out();
    out(`- 輸入 SMILES：\`${input}\``);
    const v = validateStructure(RDKit, input);
    out(`- canonical SMILES：\`${v.canonicalSmiles}\``);
    out(`- 驗證結果：${v.valid ? '通過' : '未通過'}`);
    for (const p of v.problems) out(`- 提示（${p.level}／${p.code}）：${p.message}`);
    if (!v.valid) continue;

    let batch;
    try {
      batch = new ConformerSession(v.molblock, SEED).generate(CONFORMERS);
    } catch (e) {
      out(`- 3D 計算：失敗（${e instanceof Error ? e.message : String(e)}）`);
      continue;
    }
    out(`- 構象數：${batch.conformers.length}（合併重複 ${batch.merged} 個）`);
    out(`- 是否經 MMFF94 力場最佳化：${batch.optimized ? '是' : '否'}${batch.optimizationNote ? `（${batch.optimizationNote}）` : ''}`);
    const best = batch.conformers[0];
    out(
      best.energy === null
        ? `- 取用的構象：構象 ${best.rank}（未最佳化，沒有能量可比較）`
        : `- 最低能量構象：構象 ${best.rank}，MMFF94 能量 ${best.energy.toFixed(3)} kcal/mol`,
    );

    const mol = Molecule.fromMolfile(best.molfile);
    mol.ensureHelperArrays(Molecule.cHelperRings);
    const xyz = (a) => [mol.getAtomX(a), mol.getAtomY(a), mol.getAtomZ(a)];

    const ranges = new Map();
    for (let b = 0; b < mol.getAllBonds(); b++) {
      const label = bondLabel(mol, b);
      const d = distance(xyz(mol.getBondAtom(0, b)), xyz(mol.getBondAtom(1, b)));
      const r = ranges.get(label) ?? { min: d, max: d, count: 0 };
      r.min = Math.min(r.min, d);
      r.max = Math.max(r.max, d);
      r.count++;
      ranges.set(label, r);
    }
    out();
    if (!batch.optimized) {
      out(`> ${UNOPTIMIZED_MEASURE_NOTE}`);
      out();
    }
    out('| 鍵型 | 鍵長範圍（Å） | 鍵數 |');
    out('|---|---|---|');
    for (const [label, r] of [...ranges].sort((a, b) => a[0].localeCompare(b[0]))) {
      out(`| ${label} | ${r.min.toFixed(3)}–${r.max.toFixed(3)} | ${r.count} |`);
    }

    // 環氧環：氧原子連到兩個彼此相鄰的碳（三元環）
    const rings = [];
    for (let o = 0; o < mol.getAllAtoms(); o++) {
      if (mol.getAtomLabel(o) !== 'O' || mol.getAllConnAtoms(o) !== 2) continue;
      const [c1, c2] = [mol.getConnAtom(o, 0), mol.getConnAtom(o, 1)];
      if (mol.getAtomLabel(c1) !== 'C' || mol.getAtomLabel(c2) !== 'C' || mol.getBond(c1, c2) < 0) continue;
      rings.push([o, c1, c2]);
    }
    if (rings.length) {
      out();
      out('| 環氧環 | 鍵角 | 角度（°） |');
      out('|---|---|---|');
      rings.forEach(([o, c1, c2], i) => {
        const angle = (a, b, c) => angleDegrees(xyz(a), xyz(b), xyz(c)).toFixed(2);
        const tag = (a) => `${mol.getAtomLabel(a)}${a + 1}`;
        out(`| 環 ${i + 1} | ${tag(c1)}–${tag(o)}–${tag(c2)} | ${angle(c1, o, c2)} |`);
        out(`| 環 ${i + 1} | ${tag(o)}–${tag(c1)}–${tag(c2)} | ${angle(o, c1, c2)} |`);
        out(`| 環 ${i + 1} | ${tag(o)}–${tag(c2)}–${tag(c1)} | ${angle(o, c2, c1)} |`);
      });
      out();
      out('（原子編號為 3D 結構中從 1 起算的編號，與 3D 畫面的原子編號相同。）');
    }
  }

  out();
  out('---');
  out();
  out('使用者的檢查結果不在本檔（本檔每次重新產生會被覆蓋），見 `docs/verification/phase2-使用者檢查.md`。');

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
} finally {
  await server.close();
}
