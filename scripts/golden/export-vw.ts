// 黃金資料：src/core/properties/vanDerWaalsVolume.ts 的 computeVdwVolume（任務 M01；風險 R1 芳香性、R3 SMARTS 配對順序、R4 SMARTS 解析）。
// 只呼叫現有的 TypeScript 函式（computeVdwVolume、vwMatches）；R3 的「原始配對順序」案例直接呼叫 RDKit.js 的 get_substruct_matches
// （TS 計算本來就是這個呼叫），記錄 RDKit 未經任何排序的回傳，用來證明兩邊的原始順序相同、不是靠排序蓋過。
// 案例種類（input.kind）：
//   compute    computeVdwVolume(RDKit, smiles)（預設選項，即書的基團 + Bondi 補充）的完整輸出
//   rawMatches 兩張資料表全部 SMARTS 對該分子的原始配對（RDKit.js 的順序，不排序）；只列有命中的列
//   rawQuery   任意 SMILES × 任意 SMARTS 的原始配對（R3 的參數探針：uniquify、手性、芳香對共軛、遞迴、配對順序）
//   smarts     資料表每一列 SMARTS 的可解析性，以及該列正例／反例的配對（vwMatches，已排序）
// 分子來源（以 SMILES 去重，保留第一次出現）：
//   1. R1／R3 專屬案例（雜環、稠環、含 * 的重複單元、需要優先順序判斷的基團、配對上限）與無效輸入
//   2. tests/properties/vwCases.ts、vwBondiCases.ts 的正反例與書中 Table 4.7 對照
//   3. 骨架範本 BT01–BT06 的單元（backbone_templates.csv）
//   4. docs/verification/phase6-VW-TPSA-LogP-輸出.md、030／031 診斷輸出，以及 scripts/verification 的 phase6-*.ts、031-*.ts 中形似 SMILES 的字串
// 執行：node scripts/golden/export-vw.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ROOT, withVite, writeGolden, type GoldenCase } from './common.ts';

const DEDICATED: [string, string][] = [
  // ---- R1 芳香性：雜環 ----
  ['R1/pyridine', 'c1ccncc1'],
  ['R1/pyridine-4-methyl', 'Cc1ccncc1'],
  ['R1/pyridine-2-methyl', 'Cc1ccccn1'],
  ['R1/pyridine-3-methyl', 'Cc1cccnc1'],
  ['R1/pyrrole', 'c1cc[nH]c1'],
  ['R1/N-methylpyrrole', 'Cn1cccc1'],
  ['R1/furan', 'c1ccoc1'],
  ['R1/thiophene', 'c1ccsc1'],
  ['R1/imidazole', 'c1cnc[nH]1'],
  ['R1/pyrimidine', 'c1ccncn1'],
  ['R1/pyridinium', 'C[n+]1ccccc1'],
  ['R1/kekule-benzene', 'C1=CC=CC=C1'],
  ['R1/kekule-toluene', 'CC1=CC=CC=C1'],
  ['R1/kekule-pyridine', 'C1=CC=NC=C1'],
  ['R1/unkekulizable-5ring', 'c1cccc1'],
  ['R1/cyclohexene-not-aromatic', 'C1=CCCCC1'],
  // ---- R1：稠環 ----
  ['R1/naphthalene', 'c1ccc2ccccc2c1'],
  ['R1/1-methylnaphthalene', 'Cc1cccc2ccccc12'],
  ['R1/2-methylnaphthalene', 'Cc1ccc2ccccc2c1'],
  ['R1/2,6-dimethylnaphthalene', 'Cc1ccc2cc(C)ccc2c1'],
  ['R1/anthracene', 'c1ccc2cc3ccccc3cc2c1'],
  ['R1/phenanthrene', 'c1ccc2c(c1)ccc1ccccc12'],
  ['R1/pyrene', 'c1cc2ccc3cccc4ccc(c1)c2c34'],
  ['R1/azulene', 'c1ccc2cccc2cc1'],
  ['R1/indole', 'c1ccc2[nH]ccc2c1'],
  ['R1/quinoline', 'c1ccc2ncccc2c1'],
  ['R1/carbazole-NH', 'c1ccc2c(c1)[nH]c1ccccc12'],
  ['R1/carbazole-N-methyl', 'Cn1c2ccccc2c2ccccc12'],
  ['R1/fluorene', 'c1ccc2c(c1)Cc1ccccc1-2'],
  ['R1/9,9-dimethylfluorene', 'CC1(C)c2ccccc2-c2ccccc12'],
  ['R1/indane', 'c1ccc2c(c1)CCC2'],
  ['R1/tetralin', 'c1ccc2c(c1)CCCC2'],
  ['R1/biphenyl', 'c1ccc(cc1)-c1ccccc1'],
  ['R1/phthalimide-N-methyl', 'CN1C(=O)c2ccccc2C1=O'],
  ['R1/pyromellitimide-N,N-dimethyl', 'CN1C(=O)c2cc3C(=O)N(C)C(=O)c3cc2C1=O'],
  // ---- R1：含 * 的重複單元（芳香端／烷基端；* 在芳香環內） ----
  ['R1/star-phenylene', '*c1ccc(*)cc1'],
  ['R1/star-phenylene-mapped', '[*:1]c1ccc([*:2])cc1'],
  ['R1/star-meta-phenylene', '*c1cccc(*)c1'],
  ['R1/star-furan', '[*:1]c1ccc([*:2])o1'],
  ['R1/star-thiophene', '*c1ccc(*)s1'],
  ['R1/star-pyridine', '*c1ccc(*)nc1'],
  ['R1/star-pyridine-4yl-methine', '[*:1]C([*:2])c1ccncc1'],
  ['R1/star-naphthalene-2,6', '[*:1]c1ccc2cc([*:2])ccc2c1'],
  ['R1/star-carbazole-N', '[*:1]n1c2ccccc2c2ccccc12'],
  ['R1/star-carbazole-3,6', '*c1ccc2c(c1)c1cc(*)ccc1n2C'],
  ['R1/star-PET', '*OCCOC(=O)c1ccc(C(=O)*)cc1'],
  ['R1/star-PEEK', '*Oc1ccc(Oc2ccc(C(=O)c3ccc(*)cc3)cc2)cc1'],
  ['R1/star-PMDA-ODA', '*N1C(=O)c2cc3C(=O)N(C(=O)c3cc2C1=O)c1ccc(Oc2ccc(*)cc2)cc1'],
  ['R1/star-polystyrene', '[*:1]CC([*:2])c1ccccc1'],
  ['R1/star-in-aromatic-ring', 'c1cc*cc1'],
  ['R1/star-only', '*'],
  ['R1/star-star', '**'],
  // ---- R1：連接點另一端的芳香／烷基判斷（DUMMY_END_RULES，BG12、BG13） ----
  ['R1/dummy-end-aromatic', '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]'],
  ['R1/dummy-end-alkyl', '[*:1]OC(=O)OCC[*:2]'],
  ['R1/dummy-end-alkyl-aryl', '[*:1]OC(=O)OCCc1ccc([*:2])cc1'],
  ['R1/dummy-end-aromatic-direct', '[*:1]OC(=O)Oc1ccc([*:2])cc1'],
  ['R1/dummy-end-hetero', '[*:1]OC(=O)OC(=O)O[*:2]'],
  ['R1/dummy-end-three-dummies', '[*:1]OC(=O)OCC([*:2])[*:3]'],
  ['R1/dummy-end-one-dummy', '*OC(=O)OC'],
  // ---- R3 SMARTS 配對順序：組合基團與原子基團重疊，需要優先順序（大基團先、同大小依表序） ----
  ['R3/PMMA-unit', '[*:1]CC([*:2])(C)C(=O)OC'],
  ['R3/PEMA-unit', '[*:1]CC([*:2])(C)C(=O)OCC'],
  ['R3/PVAc-unit', '[*:1]CC([*:2])OC(C)=O'],
  ['R3/PMA-unit', '[*:1]CC([*:2])C(=O)OC'],
  ['R3/PGMEA', 'COCC(C)OC(C)=O'],
  ['R3/ester-vs-ether', 'CCOC(=O)CCOCC'],
  ['R3/anhydride', 'CC(=O)OC(C)=O'],
  ['R3/oxalate', 'COC(=O)C(=O)OC'],
  ['R3/carbonate', 'COC(=O)OC'],
  ['R3/carbonate-BPA-unit', '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]'],
  ['R3/diaryl-carbonate', 'c1ccccc1OC(=O)Oc1ccccc1'],
  ['R3/amide-vs-tertiary-N', 'CC(=O)N(C)C'],
  ['R3/nylon66', '[*:1]NC(=O)CCCCC(=O)NCCCCCC[*:2]'],
  ['R3/urea-carbamate', 'CNC(=O)OC'],
  ['R3/phenylene-ortho-meta-para-ester', '[*:1]CCOC(=O)c1ccccc1C(=O)O[*:2]'],
  ['R3/phenylene-meta-ester', '[*:1]CCOC(=O)c1cccc(c1)C(=O)O[*:2]'],
  ['R3/dimethylphenylene', '[*:1]c1cc(C)c([*:2])c(C)c1'],
  ['R3/diphenylphenylene', '[*:1]c1cc(-c2ccccc2)c([*:2])c(-c2ccccc2)c1'],
  ['R3/naphthyl-2-vs-ring-CH', '[*:1]C([*:2])c1ccc2ccccc2c1'],
  ['R3/naphthyl-1', 'Cc1cccc2ccccc12'],
  ['R3/naphthalene-2,7', 'Cc1ccc2ccc(C)cc2c1'],
  ['R3/cyclohexyl-vs-CH2', '[*:1]CC([*:2])C1CCCCC1'],
  ['R3/cyclohexane', 'C1CCCCC1'],
  ['R3/isopropyl-vs-CH', '[*:1]CC([*:2])CC(C)C'],
  ['R3/neopentane', 'CC(C)(C)C'],
  ['R3/quaternary-C-vs-dimethyl', '[*:1]CC(C)(C)C[*:2]'],
  ['R3/BPA', 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1'],
  ['R3/BADGE', 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1'],
  ['R3/benzophenone', 'O=C(c1ccccc1)c1ccccc1'],
  ['R3/diphenyl-ether', 'c1ccc(Oc2ccccc2)cc1'],
  ['R3/diphenyl-sulfone', 'O=S(=O)(c1ccccc1)c1ccccc1'],
  ['R3/PDMS-unit', '[*:1]O[Si](C)(C)O[*:2]'],
  ['R3/spirobiindane-SBI', 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2'],
  ['R3/fluorene-bisphenol', 'Oc1ccc(cc1)C1(c2ccc(O)cc2)c2ccccc2-c2ccccc12'],
  ['R3/aniline-carboxylic-acid', 'Nc1ccc(cc1)C(O)=O'],
  ['R3/alanine', 'C[C@@H](C(=O)O)N'],
  ['R3/triphenylphosphine', 'c1ccc(P(c2ccccc2)c2ccccc2)cc1'],
  // 長鏈：500 個碳 → 498 個 –CH2–（RDKit.js 解析 900 個以上原子的鏈會失敗，所以 maxMatches = 1000 的上限在本任務的輸入範圍內碰不到，見報告 R3）
  ['R3/long-chain-500', 'C'.repeat(500)],
  // ---- 無效輸入 ----
  ['invalid/empty', ''],
  ['invalid/whitespace', '   '],
  ['invalid/garbage', 'xyz'],
  ['invalid/unclosed-ring', 'C1CC'],
  ['invalid/multi-component', 'CC.CC'],
  ['invalid/no-heavy-atom', '[H][H]'],
  ['invalid/proton', '[H+]'],
  ['invalid/trailing-space', 'CCC '],
  ['invalid/leading-space', ' CCC'],
];

// 無法解析的 SMARTS（R4）：兩邊都必須判為無法解析
const BAD_SMARTS: [string, string][] = [
  ['R4/invalid/open-bracket', '[C'],
  ['R4/invalid/open-paren', 'C(C'],
  ['R4/invalid/extra-close-bracket', '[CX4H2;D2;!R]]'],
  ['R4/invalid/unknown-element', '[Xx]'],
  ['R4/invalid/recursive-unclosed', '[$(C]'],
  ['R4/invalid/ring-unclosed', 'C1CC'],
  ['R4/invalid/garbage', 'not a smarts'],
];

// R3 參數探針：[id, SMILES, SMARTS]。get_substruct_matches 不帶 details 時的行為（RDKit.js 預設）必須與 Python 明確設定的參數一致。
const RAW_QUERIES: [string, string, string][] = [
  ['R3/params/uniquify-benzene', 'c1ccccc1', 'c1ccccc1'],
  ['R3/params/uniquify-biphenyl', 'c1ccc(cc1)-c1ccccc1', 'c1ccccc1'],
  ['R3/params/uniquify-naphthalene-ring', 'c1ccc2ccccc2c1', 'c1ccccc1'],
  ['R3/params/chirality-ignored', 'N[C@@](C)(F)Cl', 'N[C@](C)(F)Cl'],
  ['R3/params/chirality-same', 'N[C@](C)(F)Cl', 'N[C@](C)(F)Cl'],
  ['R3/params/aromatic-vs-conjugated', 'C=CC=C', 'C:C'],
  ['R3/params/aromatic-bond-in-ring', 'c1ccccc1', 'c:c'],
  ['R3/params/recursive', 'CC(=O)O', '[$(C=O)]'],
  ['R3/params/recursive-nested', 'COC(=O)c1ccccc1', '[c;$(c-[$(C=O)])]'],
  ['R3/params/query-atom-order', 'CC(=O)O', 'O=CO'],
  ['R3/params/query-atom-order-2', 'CC(=O)OC', 'C(=O)O'],
  ['R3/params/symmetric-ester', 'COC(=O)C(=O)OC', 'C(=O)O'],
  ['R3/params/symmetric-ester-2', 'CC(=O)OC(C)=O', '[CX3](=O)O'],
  ['R3/params/ring-flag', 'C1CCCCC1C', '[CX4;R]'],
  ['R3/params/ring-flag-neg', 'C1CCCCC1C', '[CX4;!R]'],
  ['R3/params/many-matches-500', 'C'.repeat(500), '[#6]'],
  ['R3/params/two-atom-500', 'C'.repeat(500), 'CC'],
  ['R3/params/no-match', 'CCO', 'N'],
  ['R3/params/explicit-H-query', 'CCO', '[CH2]'],
  ['R3/params/dummy-atom', '*CC*', '[#0]'],
  ['R3/params/dummy-in-chain', '[*:1]CC([*:2])c1ccccc1', 'C~C'],
];

const SMILES_LIKE = /^[A-Za-z0-9@+\-[\]()=#$:/\\%.*~]+$/;
const HAS_ATOM = /[BCNOPSFIbcnops*[]/;
const NOT_SMILES = /\.(csv|ts|md|json|mjs|png)$|^(src|docs|tests|scripts)\//;

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

const listDir = (dir: string, pattern: RegExp): string[] =>
  readdirSync(resolve(ROOT, dir))
    .filter((n) => pattern.test(n))
    .sort()
    .map((n) => join(dir, n));

await withVite(async (server) => {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { computeVdwVolume, vwMatches } = await server.ssrLoadModule('/src/core/properties/vanDerWaalsVolume.ts');
  const { VW_GROUPS } = await server.ssrLoadModule('/src/core/data/vwGroups.ts');
  const { VW_GROUPS_BONDI } = await server.ssrLoadModule('/src/core/data/vwGroupsBondi.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const { VW_GROUP_CASES, BOOK_VW_CASES, BOOK_VW_DISCREPANCIES } = await server.ssrLoadModule('/tests/properties/vwCases.ts');
  const { VW_BONDI_CASES } = await server.ssrLoadModule('/tests/properties/vwBondiCases.ts');
  const RDKit = await getRDKit();

  const rows: { id: string; smarts: string; table: string }[] = [
    ...VW_GROUPS.map((r: { id: string; smarts: string }) => ({ id: r.id, smarts: r.smarts, table: 'vw_groups' })),
    ...VW_GROUPS_BONDI.map((r: { id: string; smarts: string }) => ({ id: r.id, smarts: r.smarts, table: 'vw_groups_bondi' })),
  ];

  const parses = (smiles: string): boolean => {
    let mol = null;
    try {
      mol = RDKit.get_mol(smiles);
      return !!mol && mol.is_valid();
    } catch {
      return false;
    } finally {
      mol?.delete();
    }
  };
  const queryOf = (smarts: string) => {
    let q = null;
    try {
      q = RDKit.get_qmol(smarts);
    } catch {
      q = null;
    }
    if (!q || !q.is_valid()) {
      q?.delete();
      return null;
    }
    return q;
  };

  // ---- 分子清單（去重，保留第一次出現） ----
  const molecules: { id: string; smiles: string }[] = [];
  const seen = new Set<string>();
  const add = (id: string, smiles: string, requireParse: boolean) => {
    if (seen.has(smiles)) return;
    if (requireParse && !parses(smiles)) return;
    seen.add(smiles);
    molecules.push({ id, smiles });
  };
  for (const [id, smiles] of DEDICATED) add(id, smiles, false);
  for (const c of VW_GROUP_CASES) {
    c.positives.forEach((s: string, i: number) => add(`vwGroups/${c.id}/pos${i + 1}`, s, false));
    c.negatives.forEach((s: string, i: number) => add(`vwGroups/${c.id}/neg${i + 1}`, s, false));
  }
  for (const c of BOOK_VW_CASES) add(`book/${c.name}`, c.smiles, false);
  for (const c of BOOK_VW_DISCREPANCIES) add(`book/${c.name}`, c.smiles, false);
  for (const c of VW_BONDI_CASES) {
    c.positives.forEach((s: string, i: number) => add(`bondi/${c.id}/pos${i + 1}`, s, false));
    c.negatives.forEach((s: string, i: number) => add(`bondi/${c.id}/neg${i + 1}`, s, false));
  }
  for (const t of BACKBONE_TEMPLATES) add(`BT/${t.id}`, t.unitSmiles, false);
  const sourceFiles: [string, RegExp, boolean][] = [
    ...listDir('docs/verification', /^(phase6-VW-TPSA-LogP-輸出|030-.*|031-.*)\.md$/).map((f) => [f, /`([^`\n]+)`/g, false] as [string, RegExp, boolean]),
    ...listDir('scripts/verification', /^(phase6-.*|031-.*)\.ts$/).map((f) => [f, /'((?:[^'\\\n]|\\.)*)'/g, true] as [string, RegExp, boolean]),
  ];
  for (const [file, pattern, unescape] of sourceFiles) {
    const rel = relative(ROOT, resolve(ROOT, file)).replace(/\\/g, '/');
    let n = 0;
    for (const smiles of candidates(resolve(ROOT, file), pattern, unescape)) add(`${rel}#${++n}`, smiles, true);
  }

  const cases: GoldenCase[] = [];

  // ---- compute ----
  for (const { id, smiles } of molecules) {
    cases.push({ id, input: { kind: 'compute', smiles }, output: computeVdwVolume(RDKit, smiles) });
  }

  // ---- rawMatches（R3）：每個可解析的分子 × 兩張資料表的全部 SMARTS，RDKit.js 的原始順序 ----
  const queries = rows.map((r) => ({ ...r, q: queryOf(r.smarts) }));
  let rawCount = 0;
  try {
    for (const { id, smiles } of molecules) {
      let mol = null;
      try {
        mol = RDKit.get_mol(smiles);
        if (!mol || !mol.is_valid()) continue;
        const out: Record<string, number[][]> = {};
        for (const r of queries) {
          if (!r.q) continue;
          const parsed = JSON.parse(mol.get_substruct_matches(r.q)) as { atoms: number[] }[] | Record<string, never>;
          if (Array.isArray(parsed) && parsed.length > 0) out[r.id] = parsed.map((m) => m.atoms);
        }
        cases.push({ id: `R3/raw/${id}`, input: { kind: 'rawMatches', smiles }, output: out });
        rawCount++;
      } finally {
        mol?.delete();
      }
    }
  } finally {
    for (const r of queries) r.q?.delete();
  }

  // ---- rawQuery（R3 參數探針） ----
  for (const [id, smiles, smarts] of RAW_QUERIES) {
    const mol = RDKit.get_mol(smiles);
    const q = queryOf(smarts);
    let out: number[][] = [];
    try {
      if (!mol || !mol.is_valid() || !q) throw new Error(`探針案例無法解析：${id}`);
      const parsed = JSON.parse(mol.get_substruct_matches(q)) as { atoms: number[] }[] | Record<string, never>;
      out = Array.isArray(parsed) ? parsed.map((m) => m.atoms) : [];
    } finally {
      mol?.delete();
      q?.delete();
    }
    cases.push({ id, input: { kind: 'rawQuery', smiles, smarts }, output: out });
  }

  // ---- smarts（R4）：每一列 SMARTS 的可解析性與正反例配對 ----
  const caseById = new Map<string, { positives: string[]; negatives: string[] }>([
    ...VW_GROUP_CASES.map((c: { id: string; positives: string[]; negatives: string[] }) => [c.id, c] as [string, { positives: string[]; negatives: string[] }]),
    ...VW_BONDI_CASES.map((c: { id: string; positives: string[]; negatives: string[] }) => [c.id, c] as [string, { positives: string[]; negatives: string[] }]),
  ]);
  const matchesOn = (smiles: string, q: unknown): number[][] | { invalid: true } => {
    let mol = null;
    try {
      mol = RDKit.get_mol(smiles);
      if (!mol || !mol.is_valid()) return { invalid: true };
      return vwMatches(mol, q);
    } finally {
      mol?.delete();
    }
  };
  for (const r of rows) {
    const c = caseById.get(r.id) ?? { positives: [], negatives: [] };
    const q = queryOf(r.smarts);
    const positives: Record<string, unknown> = {};
    const negatives: Record<string, unknown> = {};
    if (q) {
      for (const s of c.positives) positives[s] = matchesOn(s, q);
      for (const s of c.negatives) negatives[s] = matchesOn(s, q);
      q.delete();
    }
    cases.push({
      id: `R4/${r.id}`,
      input: { kind: 'smarts', rowId: r.id, table: r.table, smarts: r.smarts, positives: c.positives, negatives: c.negatives },
      output: { valid: q !== null, positives, negatives },
    });
  }
  for (const [id, smarts] of BAD_SMARTS) {
    const q = queryOf(smarts);
    q?.delete();
    cases.push({ id, input: { kind: 'smarts', rowId: null, table: null, smarts, positives: [], negatives: [] }, output: { valid: q !== null, positives: {}, negatives: {} } });
  }

  console.log(`分子 ${molecules.length} 個（專屬案例 ${DEDICATED.length}）；原始配對案例 ${rawCount} 個；SMARTS 案例 ${rows.length + BAD_SMARTS.length} 個`);
  writeGolden('vw', String(RDKit.version()), cases);
});
