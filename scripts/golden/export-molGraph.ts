// 黃金資料：src/core/properties/molGraph.ts 的 readGraph（任務 M00；風險 R1 芳香性、R2 隱式氫與原子順序）。
// 輸入：RDKit.get_mol(smiles)（與計算模組相同，不帶選項）→ readGraph(mol)。get_mol 失敗時輸出 { invalid: true }。
// 分子來源（去重，保留第一次出現）：
//   1. R1／R2 專屬案例（雜環、稠環、含 * 的重複單元、明確氫、同位素、電荷、順反）
//   2. 現有測試 tests/**/*.test.ts 中形似 SMILES 的字串常值（RDKit.js 能解析的才收）
//   3. docs/verification/*.md 中以反引號標示、形似 SMILES 的字串（RDKit.js 能解析的才收）
// 執行：node scripts/golden/export-molGraph.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ROOT, withVite, writeGolden, type GoldenCase } from './common.ts';

const DEDICATED: [string, string][] = [
  // R1 芳香性：雜環
  ['R1/pyrrole', 'c1cc[nH]c1'],
  ['R1/furan', 'c1ccoc1'],
  ['R1/thiophene', 'c1ccsc1'],
  ['R1/pyridine', 'c1ccncc1'],
  ['R1/imidazole', 'c1cnc[nH]1'],
  ['R1/oxazole', 'c1cocn1'],
  ['R1/triazine', 'c1ncncn1'],
  ['R1/pyridinone', 'O=c1cccc[nH]1'],
  ['R1/pyridinium', 'C[n+]1ccccc1'],
  ['R1/kekule-benzene', 'C1=CC=CC=C1'],
  ['R1/kekule-pyrrole', 'C1=CNC=C1'],
  ['R1/unkekulizable-5ring', 'c1cccc1'],
  ['R1/cyclopentadienyl-anion', '[cH-]1cccc1'],
  ['R1/tropylium', '[cH+]1cccccc1'],
  // R1：稠環
  ['R1/naphthalene', 'c1ccc2ccccc2c1'],
  ['R1/anthracene', 'c1ccc2cc3ccccc3cc2c1'],
  ['R1/pyrene', 'c1cc2ccc3cccc4ccc(c1)c2c34'],
  ['R1/azulene', 'c1ccc2cccc2cc1'],
  ['R1/indole', 'c1ccc2[nH]ccc2c1'],
  ['R1/quinoline', 'c1ccc2ncccc2c1'],
  ['R1/purine', 'c1ncc2[nH]cnc2n1'],
  ['R1/carbazole', 'c1ccc2c(c1)[nH]c1ccccc12'],
  ['R1/fluorene', 'c1ccc2c(c1)Cc1ccccc1-2'],
  ['R1/benzofuran', 'c1ccc2occc2c1'],
  ['R1/dibenzothiophene', 'c1ccc2c(c1)sc1ccccc12'],
  ['R1/phthalimide', 'O=C1NC(=O)c2ccccc21'],
  ['R1/indane', 'c1ccc2c(c1)CCC2'],
  // R1：含 * 的重複單元（芳香端／烷基端）
  ['R1/star-phenylene', '*c1ccc(*)cc1'],
  ['R1/star-mapped-phenylene', '[*:1]c1ccc([*:2])cc1'],
  ['R1/star-furan', '[*:1]c1ccc([*:2])o1'],
  ['R1/star-thiophene', '*c1ccc(*)s1'],
  ['R1/star-pyridine', '*c1ccc(*)nc1'],
  ['R1/star-naphthalene', '*c1ccc2cc(*)ccc2c1'],
  ['R1/star-PET', '*OCCOC(=O)c1ccc(C(=O)*)cc1'],
  ['R1/star-PEEK', '*Oc1ccc(Oc2ccc(C(=O)c3ccc(*)cc3)cc2)cc1'],
  ['R1/star-polyimide', '*N1C(=O)c2ccc(cc2C1=O)Oc1ccc(*)cc1'],
  ['R1/star-in-aromatic-ring', 'c1cc*cc1'],
  ['R1/star-polystyrene', '*CC(*)c1ccccc1'],
  ['R1/star-carbazole', '*c1ccc2c(c1)c1cc(*)ccc1n2C'],
  ['R1/star-only', '*'],
  ['R1/star-star', '**'],
  // R2 隱式氫與原子順序
  ['R2/explicit-H-methanol', '[H]C([H])([H])O'],
  ['R2/deuterium', '[2H]C([2H])([2H])O'],
  ['R2/H2', '[H][H]'],
  ['R2/proton', '[H+]'],
  ['R2/bracket-CH2-radical', '[CH2]C'],
  ['R2/bracket-CH3', '[CH3]C'],
  ['R2/ammonium', '[NH4+]'],
  ['R2/quaternary-N', 'C[N+](C)(C)C'],
  ['R2/carboxylate', 'CC(=O)[O-]'],
  ['R2/silane', '[SiH4]'],
  ['R2/borane-BF3', 'FB(F)F'],
  ['R2/phosphine', 'CP(C)C'],
  ['R2/sulfone', 'CS(C)(=O)=O'],
  ['R2/sulfonic-acid', 'CS(=O)(=O)O'],
  ['R2/nitro', 'C[N+](=O)[O-]'],
  ['R2/chiral-H', 'C[C@H](N)O'],
  ['R2/chiral-explicit-H', '[H][C@](C)(N)O'],
  ['R2/fragments', 'CCO.O.[Na+].[Cl-]'],
  ['R2/ring-closure-order', 'C1CC2CCC1C2'],
  ['R2/ring-closure-reuse', 'C1CC1C1CC1'],
  ['R2/branch-order', 'CC(C)(CC)C(O)=O'],
  ['R2/star-H-count', '[*:1]CC([*:2])(C)C(=O)OCC1CO1'],
  ['R2/star-bracket-H', '[*:1][CH2][*:2]'],
  ['R2/isotope-C13', '[13CH4]'],
  // 順反（doubleBondStereo）
  ['R2/stereo-trans', 'F/C=C/F'],
  ['R2/stereo-cis', 'F/C=C\\F'],
  ['R2/stereo-cip-z', 'C/C=C(/F)Cl'],
  ['R2/stereo-cip-e', 'C/C=C(\\F)Cl'],
  ['R2/stereo-star', '[*:1]/C=C/[*:2]'],
  ['R2/stereo-oxime', 'O/N=C/C'],
  ['R2/stereo-unspecified', 'CC=CC'],
  ['R2/stereo-diene', 'C/C=C/C=C\\C'],
  ['R2/stereo-ring-8', 'C1CCC/C=C\\CC1'],
];

const SMILES_LIKE = /^[A-Za-z0-9@+\-[\]()=#$:/\\%.*~]+$/;
const HAS_ATOM = /[BCNOPSFIbcnops*[]/;
const NOT_SMILES = /\.(csv|ts|md|json|mjs|png)$|^(src|docs|tests|scripts)\//;

function walk(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, ext));
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}

function candidates(file: string, pattern: RegExp, unescape: boolean): string[] {
  const text = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of text.matchAll(pattern)) {
    let s = m[1];
    if (unescape) s = s.replace(/\\(.)/g, '$1');
    if (s.length > 0 && s.length <= 400 && SMILES_LIKE.test(s) && HAS_ATOM.test(s) && !NOT_SMILES.test(s)) out.push(s);
  }
  return out;
}

await withVite(async (server) => {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { readGraph } = await server.ssrLoadModule('/src/core/properties/molGraph.ts');
  const RDKit = await getRDKit();

  const graphOf = (smiles: string): { ok: boolean; output: unknown } => {
    let mol = null;
    try {
      mol = RDKit.get_mol(smiles);
      if (!mol || !mol.is_valid()) return { ok: false, output: { invalid: true } };
      return { ok: true, output: readGraph(mol) };
    } finally {
      mol?.delete();
    }
  };

  const cases: GoldenCase[] = [];
  const seen = new Set<string>();
  for (const [id, smiles] of DEDICATED) {
    seen.add(smiles);
    cases.push({ id, input: { smiles }, output: graphOf(smiles).output });
  }
  const sources: [string, string[]][] = [
    ...walk(resolve(ROOT, 'tests'), '.test.ts').map((f) => [f, candidates(f, /'((?:[^'\\\n]|\\.)*)'/g, true)] as [string, string[]]),
    ...walk(resolve(ROOT, 'docs', 'verification'), '.md').map((f) => [f, candidates(f, /`([^`\n]+)`/g, false)] as [string, string[]]),
  ];
  let skipped = 0;
  for (const [file, list] of sources) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    let n = 0;
    for (const smiles of list) {
      if (seen.has(smiles)) continue;
      seen.add(smiles);
      const g = graphOf(smiles);
      if (!g.ok) {
        skipped++;
        continue; // 非 SMILES 的字串（RDKit.js 無法解析）不收
      }
      cases.push({ id: `${rel}#${++n}`, input: { smiles }, output: g.output });
    }
  }
  console.log(`專屬案例 ${DEDICATED.length} 個；自測試與驗證文件收 ${cases.length - DEDICATED.length} 個；略過無法解析的字串 ${skipped} 個`);
  writeGolden('molGraph', String(RDKit.version()), cases);
});
