// 黃金資料：任務 M05 搬到 Python 的其餘計算模組（D62、D63、D64）。只呼叫現有的 TypeScript 函式，不修改它們。
// 一次匯出八個黃金檔（tests/golden/）：
//   freeVolume.json    freeVolume.ts 的 computeFreeVolume（單元與共聚物；缺基團、無效輸入）
//   relativeTg.json    relativeTg.ts：relativeTg、relativeTgFromVolumes、evaluateRelativeTgComposition、純計算小工具
//   joback.json        jobackTbTf.ts 的 computeJoback
//   tgMixing.json      tgMixing.ts（foxFlory、foxMix、findKClass、polymerComponentTg、smallMoleculeComponentTg、computeFormulationTg）、
//                      tgFit.ts（fitFlory、predictFlory）、novolacUnits.ts（identifyCresolNovolac）
//   dielectric.json    dielectricRefraction.ts 的 computeDielectricRefraction（ε、ΣR、α）
//   tpsaLogp.json      tpsaLogp.ts 的 computeTpsaLogp（含 capRepeatUnit 的封端）
//   crosslink.json     crosslink 第 0 層：analyzeCrosslink、judgePair、judgeFormulation、queryAtomMaps
//   layer1.json        crosslink 第 1 層：prepareLayer1、computeLayer1、buildSystem、stoichiometricSetup、scanRatio、Miller–Macosko 純計算
// 輸入（D64：不加額外專屬案例）只取：現有測試的輸入、docs/verification 與 scripts/verification 的分子與算例（見 remaining-inputs.ts）。
// 依 039a 不搬 formulation/compute、molecularWeight：computeFormulationTg 與 prepareLayer1 的輸入由本匯出程式用現有 TS 函式先算好
// （質量百分比、Mn、小分子的每分子質量），黃金檔的 input 就是 Python 版收到的輸入。
// TS 丟出的錯誤（throw new Error）記為 { threw: true, message }；RDKit.js 的 WebAssembly 例外記為 { threw: true }。
// 執行：node scripts/golden/export-remaining.ts
import { rdkitjsVersion, withVite, writeGolden, type GoldenCase } from './common.ts';
import { collectMolecules } from './remaining-inputs.ts';

await withVite(async (server) => {
  const load = (p: string) => server.ssrLoadModule(p);
  const { getRDKit } = await load('/src/core/rdkit/loader.ts');
  const fvMod = await load('/src/core/properties/freeVolume.ts');
  const rt = await load('/src/core/properties/relativeTg.ts');
  const jb = await load('/src/core/properties/jobackTbTf.ts');
  const tm = await load('/src/core/properties/tgMixing.ts');
  const { fitFlory, predictFlory } = await load('/src/core/properties/tgFit.ts');
  const { identifyCresolNovolac } = await load('/src/core/properties/novolacUnits.ts');
  const { computeDielectricRefraction } = await load('/src/core/properties/dielectricRefraction.ts');
  const { computeTpsaLogp } = await load('/src/core/properties/tpsaLogp.ts');
  const { PACKING_K_ROWS } = await load('/src/core/data/packingCoefficientK.ts');
  const { TG_K_ROWS, TG_POINTS } = await load('/src/core/data/tgMnData.ts');
  const { BACKBONE_TEMPLATES } = await load('/src/core/data/backboneTemplates.ts');
  const { USER_UNITS } = await load('/scripts/diagnosis/030-structures.ts');
  const { analyzeCrosslink, analyzeComponent } = await load('/src/core/crosslink/analyze.ts');
  const { judgePair, judgeFormulation } = await load('/src/core/crosslink/judge.ts');
  const { queryAtomMaps } = await load('/src/core/crosslink/groups.ts');
  const l1 = await load('/src/core/crosslink/layer1/layer1.ts');
  const mm = await load('/src/core/crosslink/layer1/millerMacosko.ts');
  const st = await load('/src/core/crosslink/layer1/stoich.ts');
  const { prepareLayer1, describeAmounts } = await load('/src/core/crosslink/layer1/prepare.ts');
  const { bundledTexts, loadTables } = await load('/src/core/data/load.ts');
  const { computeFormulation } = await load('/src/core/formulation/compute.ts');
  const { averageMolecularWeight } = await load('/src/core/formulation/molecularWeight.ts');
  const { analyzePolymerUnits } = await load('/src/core/polymer/copolymer.ts');
  const { resolvePolymer } = await load('/src/core/polymer/convert.ts');
  const RDKit = await getRDKit();
  const rdkitjs = await rdkitjsVersion(server);
  const { tables } = loadTables(bundledTexts);
  const groups = tables.functionalGroups.rows;

  const run = <T>(fn: () => T): T | { threw: true; message?: string } => {
    try {
      return fn();
    } catch (e) {
      if (String(e) === '[object WebAssembly.Exception]') return { threw: true };
      if (e instanceof Error) return { threw: true, message: e.message };
      throw e;
    }
  };
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
  const molecules = collectMolecules({ parses, USER_UNITS, BACKBONE_TEMPLATES });
  const polymers = molecules.filter((m) => m.smiles.includes('*'));
  console.log(`分子 ${molecules.length} 個（含連接點 ${polymers.length} 個）`);

  // ================= freeVolume =================
  {
    const cases: GoldenCase[] = [];
    for (const m of molecules) cases.push({ id: `mol/${m.id}`, input: { smiles: m.smiles }, output: run(() => fvMod.computeFreeVolume(RDKit, m.smiles)) });
    // freeVolume.test.ts 的共聚物與無效輸入（PHS／PE 單元、wt％、比例不足、缺基團的單元）
    const PHS = '[*:1]CC([*:2])c1ccc(O)cc1';
    const PE = '[*:1]CC[*:2]';
    const spec = (a: number, b: number, basis: 'mol' | 'wt' = 'mol') => ({ units: [{ smiles: PHS, fraction: a }, { smiles: PE, fraction: b }], fractionBasis: basis });
    const specs: [string, string, unknown][] = [
      ['copolymer/mol-70-30', PHS, spec(70, 30)],
      ['copolymer/wt-50-50', PHS, spec(50, 50, 'wt')],
      ['copolymer/fractions-not-100', PHS, spec(70, 20)],
      ['copolymer/single-unit', PHS, { units: [{ smiles: PHS, fraction: 100 }] }],
      ['copolymer/missing-unit', PHS, { units: [{ smiles: PHS, fraction: 70 }, { smiles: '[*:1]CC([*:2])Cl', fraction: 30 }], fractionBasis: 'mol' }],
    ];
    for (const [id, smiles, s] of specs) cases.push({ id, input: { smiles, spec: s }, output: run(() => fvMod.computeFreeVolume(RDKit, smiles, s)) });
    writeGolden('freeVolume', rdkitjs, cases);
  }

  // ================= joback =================
  {
    const cases: GoldenCase[] = molecules.map((m) => ({ id: `mol/${m.id}`, input: { smiles: m.smiles }, output: run(() => jb.computeJoback(RDKit, m.smiles)) }));
    writeGolden('joback', rdkitjs, cases);
  }

  // ================= dielectric（ε、ΣR、α） =================
  {
    const cases: GoldenCase[] = molecules.map((m) => ({ id: `mol/${m.id}`, input: { smiles: m.smiles }, output: run(() => computeDielectricRefraction(RDKit, m.smiles)) }));
    writeGolden('dielectric', rdkitjs, cases);
  }

  // ================= tpsaLogp =================
  {
    const cases: GoldenCase[] = molecules.map((m) => ({ id: `mol/${m.id}`, input: { smiles: m.smiles }, output: run(() => computeTpsaLogp(RDKit, m.smiles)) }));
    writeGolden('tpsaLogp', rdkitjs, cases);
  }

  // ================= relativeTg =================
  {
    const cases: GoldenCase[] = [];
    const add = (id: string, input: Record<string, unknown>, fn: () => unknown) => cases.push({ id, input, output: run(fn) });
    // 驗證文件（phase6-相對Tg）：使用者材料單元與骨架範本的單一組成、k／Tg 表材料的 FFV、同類別兩種材料的比例、示範算例
    const items = [...USER_UNITS.map((x: any) => ({ name: x.name, smiles: x.smiles })), ...BACKBONE_TEMPLATES.map((t: any) => ({ name: `${t.id} ${t.name}`, smiles: t.unitSmiles }))];
    for (const it of items) {
      const composition = { monomers: [{ smiles: it.smiles }] };
      add(`verify/composition/${it.name}`, { kind: 'composition', composition }, () => rt.evaluateRelativeTgComposition(RDKit, composition));
    }
    for (const r of PACKING_K_ROWS) {
      const composition = { monomers: [{ name: r.name }] };
      add(`verify/table/${r.id}`, { kind: 'composition', composition }, () => rt.evaluateRelativeTgComposition(RDKit, composition));
    }
    const pair = ['DABA-6FDA', 'PABA-6FDA'];
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      const composition = { monomers: [...(x < 1 ? [{ name: pair[0], amount: 1 - x }] : []), ...(x > 0 ? [{ name: pair[1], amount: x }] : [])] };
      add(`verify/pair/${x}`, { kind: 'composition', composition }, () => rt.evaluateRelativeTgComposition(RDKit, composition));
    }
    const cardo = { vomega: 242.4, packingK: 0.628 };
    const naph = { vomega: 81.1, packingK: 0.628 };
    const tgA = { value: 350, unit: 'C' };
    const volumes: [string, any][] = [
      ['demo-cardo-naphthalene', { a: [cardo], b: [cardo, naph], tgA }],
      ['hand-K', { a: [{ vomega: 100, vm: 160 }], b: [{ vomega: 120, vm: 200 }], tgA: { value: 400, unit: 'K' } }],
      ['hand-C', { a: [{ vomega: 100, vm: 160 }], b: [{ vomega: 120, vm: 200 }], tgA: { value: 126.85, unit: 'C' } }],
      ['hand-override-1000', { a: [{ vomega: 100, vm: 160 }], b: [{ vomega: 120, vm: 200 }], tgA: { value: 400, unit: 'K' }, alphaOverride: 1000 }],
      ['hand-override-0', { a: [{ vomega: 100, vm: 160 }], b: [{ vomega: 120, vm: 200 }], tgA: { value: 400, unit: 'K' }, alphaOverride: 0 }],
      ['hand-override-negative', { a: [{ vomega: 100, vm: 160 }], b: [{ vomega: 120, vm: 200 }], tgA: { value: 400, unit: 'K' }, alphaOverride: -5 }],
      ['mixture-7-3-to-5-5', { a: [{ moles: 7, vomega: 50, packingK: 0.66 }, { moles: 3, vomega: 80, packingK: 0.635 }], b: [{ moles: 5, vomega: 50, packingK: 0.66 }, { moles: 5, vomega: 80, packingK: 0.635 }], tgA: { value: 120, unit: 'C' } }],
      ['mixture-scaled', { a: [{ moles: 70, vomega: 50, packingK: 0.66 }, { moles: 30, vomega: 80, packingK: 0.635 }], b: [{ moles: 50, vomega: 50, packingK: 0.66 }, { moles: 50, vomega: 80, packingK: 0.635 }], tgA: { value: 120, unit: 'C' } }],
      ['invalid-no-vm-no-k', { a: [{ vomega: 100 }], b: [{ vomega: 100, vm: 160 }], tgA: { value: 400, unit: 'K' } }],
      ['invalid-both-k-vm', { a: [{ vomega: 100, vm: 160, packingK: 0.6 }], b: [{ vomega: 100, vm: 160 }], tgA: { value: 400, unit: 'K' } }],
      ['invalid-tgA-negative', { a: [{ vomega: 100, vm: 160 }], b: [{ vomega: 120, vm: 200 }], tgA: { value: -300, unit: 'C' } }],
      ['ratio-1-1', { a: [cardo], b: [{ ...cardo, moles: 1 }, { ...naph, moles: 1 }], bBasis: 'ratio', bReferenceIndex: 0, tgA }],
      ['ratio-2-1', { a: [cardo], b: [{ ...cardo, moles: 2 }, { ...naph, moles: 1 }], bBasis: 'ratio', bReferenceIndex: 0, tgA }],
      ['fractions-warning', { a: [cardo], b: [{ ...cardo, moles: 0.5 }, { ...naph, moles: 0.5 }], tgA }],
      ['ratio-without-reference', { a: [cardo], b: [cardo, naph], bBasis: 'ratio', tgA }],
    ];
    for (const [id, input] of volumes) add(`volumes/${id}`, { kind: 'volumes', input }, () => rt.relativeTgFromVolumes(input));
    for (const [id, a, b, d] of [
      ['calibrate-K', { value: 400, unit: 'K' }, { value: 312.5, unit: 'K' }, 0.0875],
      ['calibrate-C', { value: 150, unit: 'C' }, { value: 100, unit: 'C' }, 0.05],
      ['calibrate-zero', { value: 400, unit: 'K' }, { value: 300, unit: 'K' }, 0],
    ] as const) add(`calibrate/${id}`, { kind: 'calibrate', tgA: a, tgB: b, deltaF: d }, () => rt.calibrateAlphaOverride(a, b, d));
    for (const [ratio, ref] of [[[1, 1], 0], [[2, 1], 0], [[1, 2], 1], [[0.5, 0.5], 0], [[1, 1], 2], [[1, 0], 0], [[], 0]] as const)
      add(`molesPerMoleA/${JSON.stringify(ratio)}-${ref}`, { kind: 'molesPerMoleA', ratio, referenceIndex: ref }, () => rt.molesPerMoleA(ratio, ref));
    for (const [v, vm] of [[100, 160]] as const) {
      add(`bondiFfv/${v}-${vm}`, { kind: 'bondiFfv', vomega: v, vm }, () => rt.bondiFfv(v, vm));
      add(`deltaAlphaFromCte/${v}-${vm}`, { kind: 'deltaAlphaFromCte', vomega: v, vm }, () => rt.deltaAlphaFromCte(v, vm));
    }
    for (const k of [0.628, 0.66]) add(`ffvFromPackingK/${k}`, { kind: 'ffvFromPackingK', packingK: k }, () => rt.ffvFromPackingK(k));
    for (const c of [0.37, 0.7, 0.8, 1]) add(`packingKFromClass/${c}`, { kind: 'packingKFromClass', coefficient: c }, () => rt.packingKFromClassCoefficient(c));
    for (const amounts of [[0.5, 0.5], [1, 1], [0.3, 0.3, 0.4], [1]]) add(`looksLikeFractions/${JSON.stringify(amounts)}`, { kind: 'looksLikeFractions', amounts }, () => rt.looksLikeFractions(amounts));
    // relativeTg.test.ts 的結構輸入
    const PMMA = '[*:1]CC([*:2])(C)C(=O)OC';
    const TBMA = '[*:1]CC([*:2])(C)C(=O)OC(C)(C)C';
    const PHS = '[*:1]CC([*:2])c1ccc(O)cc1';
    const PS = '[*:1]CC([*:2])c1ccccc1';
    const PE = '[*:1]CC[*:2]';
    const PVC = '[*:1]CC(Cl)[*:2]';
    const PAN = '[*:1]CC([*:2])C#N';
    const PGMA = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';
    const pmma = (amount?: number) => ({ name: 'PMMA', smiles: PMMA, ...(amount === undefined ? {} : { amount }) });
    const tbma = (amount?: number) => ({ name: 'Poly(tBMA)', smiles: TBMA, ...(amount === undefined ? {} : { amount }) });
    const tg100 = { value: 100, unit: 'C' };
    const tg110 = { value: 110, unit: 'C' };
    const one = (smiles: string, extra: Record<string, unknown> = {}) => ({ monomers: [{ smiles, ...extra }] });
    const inputs: [string, any][] = [
      ['same-PMMA', { a: one(PMMA), b: one(PMMA) }],
      ['same-PVC', { a: one(PVC), b: one(PVC) }],
      ['cardo-vs-PS', { a: one('[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O'), b: one(PS) }],
      ['PS-to-PS-anchor', { a: one(PS), b: one(PS), tgA: tg100 }],
      ['PS-to-PE-anchor', { a: one(PS), b: one(PE), tgA: tg100 }],
      ['named-polystyrene-no-anchor', { a: { monomers: [{ name: 'Polystyrene', smiles: PS }] }, b: one(PE) }],
      ['user-k-over-table', { a: { monomers: [{ name: 'PMMA', smiles: PMMA, packingK: 0.7 }] }, b: { monomers: [{ name: 'PMMA', smiles: PMMA }] } }],
      ['PVC-density', { a: one(PVC, { density: 1.4 }), b: one(PVC, { density: 1.35 }), tgA: { value: 80, unit: 'C' } }],
      ['table-k-with-density', { a: { monomers: [{ name: 'PMMA', smiles: PMMA, density: 1.18 }] }, b: one(PMMA) }],
      ['user-k-with-density', { a: one(PS, { packingK: 0.6, density: 1.05 }), b: one(PS) }],
      ['PS-to-PGMA-override', { a: one(PS), b: one(PGMA), tgA: tg100, alphaOverride: 1000 }],
      ['PS-to-PAN', { a: one(PS), b: one(PAN), tgA: tg100 }],
      ['PGMA-to-PS', { a: one(PGMA), b: one(PS), tgA: tg100 }],
      ['override-negative', { a: one(PS), b: one(PE), tgA: tg100, alphaOverride: -1 }],
      ['override-800', { a: one(PS), b: one(PE), tgA: tg100, alphaOverride: 800 }],
      ['PS-to-small-bisphenol', { a: one(PS), b: one('CC(C)(c1ccc(O)cc1)c1ccc(O)cc1'), tgA: tg100 }],
      ['small-to-polymer', { a: one('CCO'), b: one(PS), tgA: tg100 }],
      ['polymer-with-small-in-B', { a: one(PS), b: { monomers: [{ smiles: PS }, { smiles: 'CCO' }] } }],
      ['PVC-density-100C', { a: one(PVC, { density: 1.3, densityTemperatureC: 100 }), b: one(PVC) }],
      ['PVC-density-25C', { a: one(PVC, { density: 1.4 }), b: one(PVC) }],
      ['PS-to-PVC', { a: one(PS), b: one(PVC), tgA: tg100 }],
      ['mn-both', { a: { monomers: [{ smiles: PS }], mn: 10000 }, b: { monomers: [{ smiles: PE }], mn: 25000 } }],
      ['mn-one', { a: { monomers: [{ smiles: PS }], mn: 10000 }, b: one(PE) }],
      ['reject-empty-A', { a: { monomers: [] }, b: one(PS) }],
      ['reject-amount-0', { a: one(PS, { amount: 0 }), b: one(PS) }],
      ['reject-k-1.1', { a: one(PS, { packingK: 1.1 }), b: one(PS) }],
      ['reject-no-name-no-smiles', { a: { monomers: [{}] }, b: one(PS) }],
      ['reject-bad-smiles', { a: one('C('), b: one(PS) }],
      ['reject-tgA-negative', { a: one(PS), b: one(PS), tgA: { value: -300, unit: 'C' } }],
      ['copolymer-7-3-to-5-5', { a: { monomers: [pmma(7), tbma(3)] }, b: { monomers: [pmma(5), tbma(5)] }, tgA: tg110 }],
      ['copolymer-7-3-to-2-8', { a: { monomers: [pmma(7), tbma(3)] }, b: { monomers: [pmma(2), tbma(8)] }, tgA: tg110 }],
      ['copolymer-PMMA-tBMA-to-PMMA-PHS', { a: { monomers: [pmma(1), tbma(1)] }, b: { monomers: [pmma(1), { name: 'PHS', smiles: PHS, amount: 1 }] }, tgA: tg110 }],
      ['copolymer-to-different-families', { a: { monomers: [pmma(1), tbma(1)] }, b: { monomers: [{ name: 'PHS', smiles: PHS }, { smiles: PS }] }, tgA: tg110 }],
      ['user-k-PS-add-PE', { a: one(PS, { packingK: 0.6 }), b: { monomers: [{ smiles: PS, packingK: 0.6 }, { smiles: PE, packingK: 0.6 }] }, tgA: tg110 }],
      ['implicit-anchor-PMMA-to-PS', { a: { monomers: [{ name: 'PMMA', smiles: PMMA }] }, b: one(PS), tgA: tg110 }],
      ['table-only-DABA-PABA', { a: { monomers: [{ name: 'DABA-6FDA', amount: 1 }, { name: 'PABA-6FDA', amount: 3 }] }, b: { monomers: [{ name: 'DABA-6FDA' }, { name: 'PABA-6FDA' }] }, tgA: tg110 }],
      ['anchor-from-table-PHS', { a: { monomers: [{ name: 'PHS', smiles: PHS }] }, b: one(PS) }],
      ['anchor-override-PHS', { a: { monomers: [{ name: 'PHS', smiles: PHS }] }, b: one(PS), tgA: { value: 160, unit: 'C' } }],
      ['table-blank-Tg', { a: { monomers: [{ name: 'PIM-1（SBI-based）', smiles: PS }] }, b: one(PE) }],
      ['no-anchor-copolymer', { a: { monomers: [pmma(1), tbma(1)] }, b: { monomers: [pmma(1), tbma(2)] } }],
      ['B-is-table-material', { a: { monomers: [{ name: 'PMMA', smiles: PMMA }] }, b: { monomers: [{ name: 'Poly(tBMA)', smiles: TBMA }] } }],
      ['table-without-smiles', { a: { monomers: [{ name: '6FDA-CARDO' }] }, b: { monomers: [{ name: '6FDA-CARDO(Br)' }] } }],
      ['B-name-not-in-table', { a: { monomers: [{ name: 'PMMA', smiles: PMMA }] }, b: { monomers: [{ name: 'Poly(maleic anhydride)', smiles: PS }] } }],
      ['B-copolymer-from-PMMA', { a: { monomers: [{ name: 'PMMA', smiles: PMMA }] }, b: { monomers: [pmma(1), tbma(1)] }, tgA: tg110 }],
      ['fox-missing-homopolymer-Tg', { a: { monomers: [pmma(1)] }, b: { monomers: [pmma(1), { smiles: PS, amount: 1 }] }, tgA: tg110 }],
      ['fox-given-homopolymer-Tg', { a: { monomers: [pmma(1)] }, b: { monomers: [pmma(1), { smiles: PS, amount: 1, homopolymerTg: tg100 }] }, tgA: tg110 }],
      ['fox-wt-basis', { a: { basis: 'wt', monomers: [pmma(100), tbma(50)] }, b: { basis: 'wt', monomers: [pmma(50), tbma(100)] }, tgA: tg110 }],
      ['single-B-no-fox', { a: { monomers: [pmma(1)] }, b: one(PS), tgA: tg110 }],
      ['ratio-auto-reference', { a: one(PS, { packingK: 0.6 }), b: { monomers: [{ smiles: PS, packingK: 0.6, amount: 1 }, { smiles: PE, packingK: 0.6, amount: 0.5 }] }, tgA: tg110 }],
      ['ratio-B-by-reference-auto', { a: one(PS, { packingK: 0.6 }), b: { basis: 'ratio', monomers: [{ smiles: PE, packingK: 0.6, amount: 1 }, { smiles: PS, packingK: 0.6, amount: 2 }] }, tgA: tg110 }],
      ['ratio-explicit-reference', { a: one(PS, { packingK: 0.6 }), b: { basis: 'ratio', referenceIndex: 1, monomers: [{ smiles: PE, packingK: 0.6, amount: 1 }, { smiles: PS, packingK: 0.6, amount: 2 }] }, tgA: tg110 }],
      ['fractions-warning-structure', { a: one(PS, { packingK: 0.6 }), b: { monomers: [{ smiles: PS, amount: 0.5 }, { smiles: PE, amount: 0.5 }] }, tgA: tg110 }],
      ['reject-ratio-no-reference', { a: one(PS, { packingK: 0.6 }), b: { basis: 'ratio', monomers: [{ smiles: PE }, { smiles: PVC }] }, tgA: tg110 }],
      ['reject-ratio-copolymer-A', { a: { monomers: [pmma(1), tbma(1)] }, b: { basis: 'ratio', referenceIndex: 0, monomers: [pmma(2), tbma(1)] } }],
      ['reject-ratio-in-A', { a: { basis: 'ratio', monomers: [{ smiles: PS }] }, b: one(PS, { packingK: 0.6 }) }],
      ['reject-ratio-index-5', { a: one(PS, { packingK: 0.6 }), b: { basis: 'ratio', referenceIndex: 5, monomers: [{ smiles: PS }, { smiles: PE }] }, tgA: tg110 }],
      ['density-both', { a: one(PS, { density: 1.05 }), b: one(PS, { density: 1.05 }) }],
      ['PS-PS-class-only', { a: one(PS), b: one(PS) }],
      ['PVC-Va', { a: one(PVC), b: one(PVC) }],
    ];
    for (const [id, input] of inputs) add(`structure/${id}`, { kind: 'relativeTg', input }, () => rt.relativeTg(RDKit, input));
    writeGolden('relativeTg', rdkitjs, cases);
  }

  // ================= tgMixing（含 tgFit、novolacUnits） =================
  {
    const cases: GoldenCase[] = [];
    const add = (id: string, input: Record<string, unknown>, fn: () => unknown) => cases.push({ id, input, output: run(fn) });
    for (const [a, b, c] of [[400, 50000, 1000], [415.93, 76819, 864], [400, 50000, 1e15], [400, 50000, 0], [400, 50000, -5]]) add(`foxFlory/${a}-${b}-${c}`, { kind: 'foxFlory', tgInfK: a, k: b, mn: c }, () => tm.foxFlory(a, b, c));
    const mixes: [string, { w: number; tgK: number }[]][] = [
      ['half-half', [{ w: 0.5, tgK: 300 }, { w: 0.5, tgK: 400 }]],
      ['20-80', [{ w: 0.2, tgK: 250 }, { w: 0.8, tgK: 350 }]],
      ['single', [{ w: 1, tgK: 333 }]],
      ['single-0.37', [{ w: 0.37, tgK: 333 }]],
      ['normalised', [{ w: 2, tgK: 300 }, { w: 2, tgK: 400 }]],
      ['same-Tg', [{ w: 0.3, tgK: 350 }, { w: 0.7, tgK: 350 }]],
      ['empty', []],
      ['w-zero', [{ w: 0, tgK: 300 }]],
      ['tg-zero', [{ w: 1, tgK: 0 }]],
    ];
    for (const [id, items] of mixes) add(`foxMix/${id}`, { kind: 'foxMix', items }, () => tm.foxMix(items));
    // tgMn035.test.ts 的回歸輸入與資料表的擬合點
    const fits: [string, { mn: number; tgK: number }[]][] = [
      ['literal-3-points', [{ mn: 1, tgK: 2 }, { mn: 1 / 2, tgK: 3 }, { mn: 1 / 3, tgK: 5 }]],
      ['exact-line', [100, 200, 400, 800].map((mn) => ({ mn, tgK: 400 - 10000 / mn }))],
      ['one-point', [{ mn: 100, tgK: 300 }]],
      ['mn-zero', [{ mn: 0, tgK: 300 }, { mn: 100, tgK: 300 }]],
      ['tg-negative', [{ mn: 100, tgK: -1 }, { mn: 200, tgK: 300 }]],
      ['same-mn', [{ mn: 100, tgK: 300 }, { mn: 100, tgK: 310 }]],
      ...TG_K_ROWS.filter((r: any) => r.fitPoints.length > 0).map((r: any) => [`table/${r.resinClass}`, r.fitPoints.map((id: string) => TG_POINTS.find((p: any) => p.id === id)).map((p: any) => ({ mn: p.mn, tgK: p.tgK }))] as [string, { mn: number; tgK: number }[]]),
    ];
    for (const [id, points] of fits) {
      add(`fitFlory/${id}`, { kind: 'fitFlory', points }, () => fitFlory(points));
      add(`predictFlory/${id}`, { kind: 'predictFlory', points, mn: 1000 }, () => predictFlory(fitFlory(points), 1000));
    }
    // 單元類別辨識與 K 表（所有含連接點的測試單元）
    for (const m of polymers) {
      add(`unit/${m.id}`, { kind: 'unit', smiles: m.smiles }, () => ({ cresol: identifyCresolNovolac(RDKit, m.smiles), kClass: tm.findKClass(RDKit, m.smiles)?.resinClass ?? null }));
      const c = { id: 'x', name: 'x', category: 'Resin', canonicalSmiles: m.smiles };
      add(`polymerComponent/${m.id}`, { kind: 'polymerComponent', component: c, mn: 1000, fraction: 0.5 }, () => tm.polymerComponentTg(RDKit, c, 1000, 0.5));
    }
    const smallC = { id: 's', name: 'S', category: 'Small Molecule', canonicalSmiles: 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2' };
    add('smallMoleculeComponent/SBI', { kind: 'smallComponent', component: smallC, fraction: 1 }, () => tm.smallMoleculeComponentTg(RDKit, smallC, 1));
    // tgMixing.test.ts、tgMn035.test.ts 的配方
    const NOVOLAC = '[*:1]Cc1cc([*:2])ccc1O';
    const DGEBA = '[*:1]Oc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC(O)C[*:2]';
    const SBI = 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2';
    const BADGE = 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1';
    const MEK = 'CCC(C)=O';
    const solid = (id: string, amount: number, smiles: string, extra: Record<string, unknown> = {}) => ({ id, name: `成分${id}`, canonicalSmiles: smiles, category: 'Small Molecule', amount, ...extra });
    const polymerC = (id: string, amount: number, unit: string, mn: number) => solid(id, amount, unit, { category: 'Resin', polymer: { mnInput: mn } });
    const formulation = (components: any[], unit: 'wt' | 'g' = 'wt') => ({ schemaVersion: 1, name: '測試', solid: { unit, components }, liquid: { unit: 'g', components: [] } });
    const cop = solid('p', 50, NOVOLAC, { category: 'Resin', polymer: { mnInput: 3000, units: [{ smiles: NOVOLAC, fraction: 50 }, { smiles: '[*:1]C([*:2])c1ccc2ccccc2c1', fraction: 50 }] } });
    const formulations: [string, any][] = [
      ['small-only', formulation([solid('a', 30, SBI), solid('b', 70, MEK)])],
      ['novolac-only', formulation([polymerC('n', 100, NOVOLAC, 1000)])],
      ['novolac-plus-small', formulation([polymerC('n', 60, NOVOLAC, 1000), solid('s', 40, SBI)])],
      ['novolac-extrapolated-3000', formulation([polymerC('n', 100, NOVOLAC, 3000)])],
      ['novolac-low-500', formulation([polymerC('n', 100, NOVOLAC, 500)])],
      ['novolac-mn-1e12', formulation([polymerC('n', 100, NOVOLAC, 1e12)])],
      ['novolac-mn-900', formulation([polymerC('n', 100, NOVOLAC, 900)])],
      ['dgeba-missing-K', formulation([polymerC('d', 60, DGEBA, 3000), solid('s', 40, SBI)])],
      ['dgeba-novolac-small', formulation([polymerC('d', 50, DGEBA, 3000), polymerC('n', 40, NOVOLAC, 1000), solid('s', 10, SBI)])],
      ['all-missing', formulation([polymerC('e', 50, '[*:1]CC([*:2])(C)C(=O)OCC1CO1', 2250), cop])],
      ['catalyst-volatile-excluded', formulation([polymerC('a', 50, NOVOLAC, 1000), solid('c', 10, MEK, { category: 'Catalyst/Initiator' }), solid('v', 40, BADGE, { volatileFlag: true })], 'g')],
      ['catalyst-only', formulation([solid('c', 10, MEK, { category: 'Catalyst/Initiator' })], 'g')],
      ['nan-amount', formulation([solid('a', Number.NaN, SBI)])],
      ['novolac-grams', formulation([polymerC('a', 50, NOVOLAC, 1000)], 'g')],
    ];
    for (const [id, f] of formulations) {
      // 與 computeFormulationTg 內部相同的前處理（formulation/compute 與 molecularWeight 不搬，039a）
      const mnById: Record<string, number | undefined> = {};
      const unitById: Record<string, number | undefined> = {};
      for (const c of [...f.solid.components, ...f.liquid.components]) {
        if (c.canonicalSmiles.includes('*')) {
          const analysis = analyzePolymerUnits(RDKit, c.canonicalSmiles, c.polymer);
          const resolved = c.polymer && analysis.ok ? resolvePolymer(c.polymer, analysis.mUnit, { mEnds: analysis.mEnds ?? 0, filled: analysis.endsFilled ?? [false, false] }) : null;
          mnById[c.id] = resolved?.ok ? resolved.mn : undefined;
          unitById[c.id] = resolved?.ok && analysis.ok ? analysis.mUnit : undefined;
        } else mnById[c.id] = averageMolecularWeight(RDKit, c.canonicalSmiles) ?? undefined;
      }
      const outcome = computeFormulation(f, mnById, { unitWeights: unitById });
      const solidResult = outcome.results.solid;
      const wtPct = solidResult ? Object.fromEntries(solidResult.components.map((c: any) => [c.id, c.wtPct.value ?? null])) : null;
      const errors = outcome.errors.filter((e: any) => e.area !== 'liquid').map((e: any) => e.message);
      const mn = Object.fromEntries(Object.entries(mnById).map(([k, v]) => [k, v ?? null]));
      add(`formulation/${id}`, { kind: 'formulation', solid: f.solid.components, wtPct, mn, errors }, () => tm.computeFormulationTg(RDKit, f));
    }
    writeGolden('tgMixing', rdkitjs, cases);
  }

  // ================= crosslink 第 0 層 =================
  const P = '[*:1]c1ccc(C2(c3ccc(C([*:2])c4ccc5ccccc5c4)c(O)c3)c3ccccc3-c3ccccc32)cc1O';
  const E = '[*:1]CC([*:2])(C)C(=O)OCC1CO1';
  const S = 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2';
  const PGMEA = 'COCC(C)OC(C)=O';
  const DGEBA_SMALL = 'C1OC1COc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC1CO1';
  const comp = (id: string, name: string, canonicalSmiles: string, category: string, extra: Record<string, unknown> = {}) => ({ id, name, canonicalSmiles, category, ...extra });
  const pc = comp('P', '酚醛樹脂 P', P, 'Resin', { polymer: { mnInput: 6000 } });
  const ec = comp('E', '環氧寡聚物 E', E, 'Resin', { polymer: { dpInput: 21 } });
  const sc = comp('S', 'SBI 雙酚 S', S, 'Small Molecule');
  const lc = comp('L', 'PGMEA', PGMEA, 'Solvent');
  const badge = comp('B', 'BADGE', 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1', 'Resin');
  const bpa = comp('A', 'BPA', 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1', 'Crosslinker');
  const phenol = comp('H', '苯酚', 'Oc1ccccc1', 'Small Molecule');
  const both = comp('X', 'X', 'Oc1ccc(OCC2CO2)cc1', 'Small Molecule');
  const tpp = comp('T', 'TPP', 'c1ccc(P(c2ccccc2)c2ccccc2)cc1', 'Catalyst/Initiator');
  // layer1.test.ts／lowMw.test.ts：以骨架範本做成的聚合物成分（單元＝範本單元、端基＝範本端基）
  const tpl = (id: string) => BACKBONE_TEMPLATES.find((t: any) => t.id === id);
  const polymerFromTemplate = (id: string, polymerPart: Record<string, number>) => {
    const t = tpl(id);
    return comp('P', 'P', t.unitSmiles, 'Resin', {
      polymer: { ...polymerPart, endGroups: { end1: { smiles: t.end1Smiles, ...(t.end1PresetId ? { presetId: t.end1PresetId } : {}) }, end2: { smiles: t.end2Smiles, ...(t.end2PresetId ? { presetId: t.end2PresetId } : {}) } } },
    });
  };
  const sBis = comp('S', 'S', S, 'Small Molecule');
  const crosslinkConfigs: [string, any[]][] = [
    ['4A-P-E-PGMEA', [pc, ec, lc]],
    ['4B-P-E-S-PGMEA', [pc, ec, sc, lc]],
    ['P-without-molecular-weight', [comp('P', 'P', P, 'Resin'), ec, lc]],
    ['solvent-only', [lc]],
    ['BADGE-BPA', [badge, bpa]],
    ['BADGE-phenol', [badge, phenol]],
    ['E-phenol-graft', [ec, phenol]],
    ['self-reactive-small', [both]],
    ['BADGE-BPA-TPP', [badge, bpa, tpp]],
    ['BT05-with-S', [polymerFromTemplate('BT05', { mwInput: 1000, pdiInput: 2 }), sBis]],
    ['BT01-with-S', [polymerFromTemplate('BT01', { mwInput: 3000, pdiInput: 1.5 }), sBis]],
    ['BT05-mw-3000', [polymerFromTemplate('BT05', { mwInput: 3000, pdiInput: 2 }), sBis]],
    ['DGEBA-small-with-S', [comp('D', 'DGEBA', DGEBA_SMALL, 'Resin'), sBis]],
    ['copolymer-PS-like', [comp('C', 'C', P, 'Resin', { polymer: { mnInput: 6000, units: [{ smiles: P, fraction: 60 }, { smiles: E, fraction: 40 }] } }), ec]],
  ];
  const withMolarMass = (cs: any[]) =>
    cs.map((c) => (c.canonicalSmiles.includes('*') ? c : { ...c, molarMass: averageMolecularWeight(RDKit, c.canonicalSmiles) }));
  {
    const cases: GoldenCase[] = [];
    for (const [id, cs] of crosslinkConfigs) {
      const input = { components: withMolarMass(cs) };
      const output = run(() => analyzeCrosslink(RDKit, cs, { functionalGroups: groups, reactionRules: tables.reactionRules.rows }));
      cases.push({ id: `analyze/${id}`, input: { kind: 'analyze', ...input }, output });
    }
    for (const m of polymers.concat(molecules.filter((x) => !x.smiles.includes('*')).slice(0, 80))) {
      const c = comp('m', 'm', m.smiles, 'Resin', { polymer: { mnInput: 6000 } });
      const small = comp('m', 'm', m.smiles, 'Small Molecule');
      const input = m.smiles.includes('*') ? { components: [c] } : { components: withMolarMass([small]) };
      cases.push({ id: `analyzeComponent/${m.id}`, input: { kind: 'analyzeComponent', ...input }, output: run(() => analyzeComponent(RDKit, m.smiles.includes('*') ? c : small, groups)) });
    }
    const f = (v: number | null) => v;
    for (const [fa, fb, ap, bp] of [[2, 2, false, false], [2, 3, false, false], [3, 3, false, false], [1, 2, false, false], [1, 20, false, true], [20, 1, true, false], [null, 2, false, true], [2, 2 + 1e-12, false, false], [2 - 1e-12, 2, false, false]] as const)
      cases.push({ id: `judgePair/${fa}-${fb}-${ap}-${bp}`, input: { kind: 'judgePair', fA: f(fa), fB: f(fb), aIsPolymer: ap, bIsPolymer: bp }, output: run(() => judgePair(fa, fb, ap, bp)) });
    for (const kinds of [['capping', 'network'], ['chain', 'capping'], ['graft'], [], ['undetermined'], ['undetermined', 'chain']])
      cases.push({ id: `judgeFormulation/${JSON.stringify(kinds)}`, input: { kind: 'judgeFormulation', kinds }, output: run(() => judgeFormulation(kinds)) });
    const mapSmarts = [...new Set(['[OX2H:1][cX3]:[c]', '[O:1]1[C:2][C:3]1', 'O1CC1', '[$([OH]C)]Cl[Br:5]', ...groups.map((g: any) => g.smarts)])];
    for (const s of mapSmarts) cases.push({ id: `queryAtomMaps/${s}`, input: { kind: 'queryAtomMaps', smarts: s }, output: run(() => queryAtomMaps(s)) });
    writeGolden('crosslink', rdkitjs, cases);
  }

  // ================= crosslink 第 1 層 =================
  {
    const cases: GoldenCase[] = [];
    const add = (id: string, input: Record<string, unknown>, fn: () => unknown) => cases.push({ id, input, output: run(fn) });
    const solidC = (id: string, name: string, smiles: string, amount: number, extra: Record<string, unknown> = {}) => ({ id, name, canonicalSmiles: smiles, category: 'Resin', amount, ...extra });
    const formulation = (comps: any[], unit: 'wt' | 'g' = 'wt') => ({ schemaVersion: 1, name: 'test', solid: { unit, components: comps }, liquid: { unit: 'wt', components: [{ id: 'L', name: 'PGMEA', canonicalSmiles: PGMEA, category: 'Solvent', amount: 100 }] } });
    const pol = solidC('P', 'P', P, 80, { polymer: { mnInput: 6000 } });
    const epo = solidC('E', 'E', E, 20, { polymer: { dpInput: 21 } });
    const sbi = solidC('S', 'S', S, 1, { category: 'Small Molecule' });
    const noMn = solidC('P', 'P', P, 80);
    const solidSpecs: [string, any][] = [
      ['F4A', formulation([pol, epo])],
      ['F4B', formulation([solidC('P', 'P', P, 79.2, { polymer: { mnInput: 6000 } }), solidC('E', 'E', E, 19.8, { polymer: { dpInput: 21 } }), sbi])],
      ['F4A-grams', formulation([{ ...pol, amount: 8 }, { ...epo, amount: 2 }], 'g')],
      ['F4A-50-20', formulation([{ ...pol, amount: 50 }, epo])],
      ['PGMEA-only', formulation([solidC('X', 'PGMEA', PGMEA, 100, { category: 'Solvent' })])],
      ['no-Mn', formulation([noMn, epo])],
      ['pdi-1-mw-6000-3000', formulation([solidC('P', 'P', P, 80, { polymer: { mwInput: 6000, pdiInput: 1 } }), solidC('E', 'E', E, 20, { polymer: { mwInput: 3000, pdiInput: 1 } })])],
      ['pdi-2', formulation([solidC('P', 'P', P, 80, { polymer: { mwInput: 6000, pdiInput: 2 } }), solidC('E', 'E', E, 20, { polymer: { mwInput: 4500, pdiInput: 2 } })])],
    ];
    const setups = new Map<string, any>();
    const tplForm = (p: any, s: any, amounts = [80, 20]) =>
      formulation([{ id: p.id, name: p.name, canonicalSmiles: p.canonicalSmiles, category: 'Resin', amount: amounts[0], ...(p.polymer ? { polymer: p.polymer } : {}) }, { id: s.id, name: s.name, canonicalSmiles: s.canonicalSmiles, category: 'Resin', amount: amounts[1], ...(s.polymer ? { polymer: s.polymer } : {}) }]);
    solidSpecs.push(
      ['BT05-low-mw', tplForm(polymerFromTemplate('BT05', { mwInput: 1000, pdiInput: 2 }), sBis)],
      ['BT01-low-mw', tplForm(polymerFromTemplate('BT01', { mwInput: 600, pdiInput: 2 }), sBis, [60, 40])],
      ['BT05-mw-3000', tplForm(polymerFromTemplate('BT05', { mwInput: 3000, pdiInput: 2 }), sBis)],
    );
    for (const [id, f] of solidSpecs) {
      const comps = [...f.solid.components, ...f.liquid.components].map((c: any) => ({ id: c.id, name: c.name, canonicalSmiles: c.canonicalSmiles, category: c.category, ...(c.polymer ? { polymer: c.polymer } : {}) }));
      const result = analyzeCrosslink(RDKit, comps, { functionalGroups: groups, reactionRules: tables.reactionRules.rows });
      const mw: Record<string, number | undefined> = {};
      for (const c of result.components) mw[c.id] = c.molarMass ?? undefined;
      const outcome = computeFormulation(f, mw);
      const solidResult = outcome.results.solid;
      const wtPct = solidResult ? Object.fromEntries(solidResult.components.map((c: any) => [c.id, c.wtPct.value ?? null])) : null;
      // prepare 的輸入：第 0 層結果（TS 輸出）、Solid 區的成分與單位、質量百分比
      add(`prepare/${id}`, { kind: 'prepare', result, solid: { unit: f.solid.unit, components: f.solid.components }, wtPct }, () => prepareLayer1(result, f, outcome));
      const prep = prepareLayer1(result, f, outcome);
      if (prep.ok) setups.set(id, prep);
    }
    const qs = [1, 0.5, 0.8];
    for (const [id, prep] of setups) {
      const setup = prep.setup;
      add(`buildSystem/${id}`, { kind: 'buildSystem', setup }, () => l1.buildSystem(setup));
      add(`groupTotals/${id}`, { kind: 'groupTotals', setup }, () => l1.groupTotals(setup));
      for (const q of qs) add(`layer1/${id}/q${q}`, { kind: 'layer1', setup, q }, () => l1.computeLayer1(setup, q));
      add(`stoichiometric/${id}`, { kind: 'stoichiometric', setup }, () => {
        const s = st.stoichiometricSetup(setup);
        return { setup: s, layer1: s ? l1.computeLayer1(s, 1) : null };
      });
      for (const ratio of [0.8, 1.5]) add(`atRatio/${id}/${ratio}`, { kind: 'atRatio', setup, ratio }, () => st.setupAtRatio(setup, ratio));
      add(`describe/${id}`, { kind: 'describe', prep, adjustedFromStoich: true }, () => {
        const s = st.stoichiometricSetup(setup);
        return s ? describeAmounts(prep, s) : null;
      });
      for (const opt of st.SCAN_OPTIONS) add(`scan/${id}/${opt.property}-${opt.direction}`, { kind: 'scan', setup, q: 1, option: opt }, () => st.scanRatio(setup, 1, opt));
      add(`scan/${id}/range-0.8-1.2`, { kind: 'scan', setup, q: 1, option: st.SCAN_OPTIONS[0], settings: { min: 0.8, max: 1.2, points: 5 } }, () => st.scanRatio(setup, 1, st.SCAN_OPTIONS[0], { min: 0.8, max: 1.2, points: 5 }));
      const sys = l1.buildSystem(setup).sys;
      add(`gelConversion/${id}`, { kind: 'gelConversion', sys }, () => mm.gelConversion(sys));
    }
    // layer1.test.ts 的掃描設定檢查與用量換算
    for (const s of [{ min: 0.5, max: 1.5, points: 41 }, { min: 0, max: 1, points: 5 }, { min: 1, max: 1, points: 5 }, { min: 0.5, max: 1.5, points: 1 }, { min: 0.5, max: 1.5, points: 2.5 }, { min: 0.5, max: 1.5, points: 502 }])
      add(`checkScanSettings/${JSON.stringify(s)}`, { kind: 'checkScanSettings', settings: s }, () => st.checkScanSettings(s));
    for (const r of [0.5, 1, 1.8, 3]) add(`defaultScanSettings/${r}`, { kind: 'defaultScanSettings', currentRatio: r }, () => st.defaultScanSettings(r));
    const items = [{ id: 'a', name: 'a', mass: 60, massOld: 80, molarMass: 400, amountOld: 80, isResin: true }, { id: 'b', name: 'b', mass: 40, massOld: 20, molarMass: 200, amountOld: 20 }];
    for (const unit of ['g', 'parts', 'wt', 'mol', 'phr', 'other']) add(`expressAmounts/${unit}`, { kind: 'expressAmounts', unit, items }, () => st.expressAmounts(unit, items));
    add('expressAmounts/mol-missing-molar-mass', { kind: 'expressAmounts', unit: 'mol', items: [{ ...items[0], molarMass: null }, items[1]] }, () => st.expressAmounts('mol', [{ ...items[0], molarMass: null }, items[1]]));
    // millerMacosko.test.ts 的系統
    const sp = (f: number, groupsN: number) => ({ f, n: groupsN / f, mass: groupsN / f });
    const afPlusB2 = (f: number, r: number) => ({ a: [sp(f, f)], b: [sp(2, f / r)] });
    const systems: [string, any][] = [
      ['A3+B2-r1', afPlusB2(3, 1)],
      ['A3+B2-r1.25', afPlusB2(3, 1.25)],
      ['A3+B2-r0.8', afPlusB2(3, 0.8)],
      ['A4+B2-r1', afPlusB2(4, 1)],
      ['A3+B3', { a: [sp(3, 30)], b: [sp(3, 30)] }],
      ['A300+B2', { a: [sp(300, 300)], b: [sp(2, 300)] }],
      ['direct-3-2', { a: [{ f: 3, n: 10, mass: 100 }], b: [{ f: 2, n: 15, mass: 50 }] }],
    ];
    for (const [id, sys] of systems) {
      add(`mm/gelConversion/${id}`, { kind: 'gelConversion', sys }, () => mm.gelConversion(sys));
      add(`mm/groupMoles/${id}`, { kind: 'groupMoles', species: sys.a }, () => mm.groupMoles(sys.a));
      for (const q of [0.5, 0.9, 1]) {
        const nA = mm.groupMoles(sys.a);
        const nB = mm.groupMoles(sys.b);
        const { pA, pB } = mm.conversions(nA, nB, q);
        add(`mm/conversions/${id}/q${q}`, { kind: 'conversions', nA, nB, q }, () => mm.conversions(nA, nB, q));
        add(`mm/gelSlope/${id}/q${q}`, { kind: 'gelSlope', sys, pA, pB }, () => mm.gelSlope(sys, pA, pB));
        const fp = run(() => mm.finiteProbability(sys, pA, pB)) as any;
        add(`mm/finiteProbability/${id}/q${q}`, { kind: 'finiteProbability', sys, pA, pB }, () => fp);
        add(`mm/solFraction/${id}/q${q}`, { kind: 'solFraction', sys, fp }, () => mm.solFraction(sys, fp));
        if (fp.gelled) add(`mm/networkDensity/${id}/q${q}`, { kind: 'networkDensity', sys, fp }, () => mm.networkDensity(sys, fp));
      }
    }
    for (const [f, p] of [[3, 0.55], [3, 0.7], [3, 0.8], [3, 0.95], [4, 0.4], [4, 0.6], [4, 0.9], [3, 0.5], [4, 0.3]] as const)
      add(`mm/homopolymer/${f}-${p}`, { kind: 'homopolymer', f, p }, () => mm.homopolymerFiniteProbability(f, p));
    for (const [f, n, mass] of [[3, 2, 5], [24.56, 1, 100], [2, 1, 1]] as const) add(`mm/splitFunctionality/${f}`, { kind: 'splitFunctionality', f, n, mass }, () => mm.splitFunctionality(f, n, mass));
    for (const [f, m, p] of [[3, 3, 0.5], [3, 3, 0], [3, 0, 1], [24, 3, 0.2], [4, 4, 0.9]] as const) add(`mm/effectiveJunction/${f}-${m}-${p}`, { kind: 'effectiveJunction', f, m, p }, () => mm.effectiveJunctionProbability(f, m, p));
    writeGolden('layer1', rdkitjs, cases);
  }
});
