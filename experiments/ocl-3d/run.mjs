// 任務 005：測試 OpenChemLib JS 的 3D 能力，並與 RDKit.js 對照原子編號。
// API 名稱依 node_modules/openchemlib/dist/openchemlib.d.ts。
// 不支援或失敗的功能記錄為結果，不讓腳本中斷。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Molecule, ConformerGenerator, ForceFieldMMFF94, Resources, version as oclVersion } from 'openchemlib';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'output');
fs.mkdirSync(outDir, { recursive: true });
const initRDKitModule = require('@rdkit/rdkit');

const pkgOf = (n) => JSON.parse(fs.readFileSync(path.join(here, 'node_modules', n, 'package.json'), 'utf8'));
const ms = (t) => Math.round((performance.now() - t) * 10) / 10;
const molecules = [
  { name: 'ethanol', smiles: 'CCO' },
  { name: 'propylene_oxide', smiles: 'CC1CO1' },
  { name: 'BADGE', smiles: 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1' },
];
const SEED = 12345;
const MAX_CONFS = 30;

const coords = (m) => Array.from({ length: m.getAllAtoms() }, (_, i) => [m.getAtomX(i), m.getAtomY(i), m.getAtomZ(i)]);
const zRange = (m) => { const z = coords(m).map((c) => c[2]); return [Math.min(...z), Math.max(...z)]; };
const sameCoords = (a, b) => a.length === b.length && a.every((c, i) => c.every((v, k) => Math.abs(v - b[i][k]) < 1e-9));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const angle3 = (a, b, c) => {
  const u = a.map((v, k) => v - b[k]), w = c.map((v, k) => v - b[k]);
  return Math.acos(u.reduce((s, v, k) => s + v * w[k], 0) / Math.hypot(...u) / Math.hypot(...w)) * 180 / Math.PI;
};
const elementsOf = (m) => Array.from({ length: m.getAllAtoms() }, (_, i) => m.getAtomicNo(i));
const bondsOf = (m) => Array.from({ length: m.getAllBonds() }, (_, b) => [m.getBondAtom(0, b), m.getBondAtom(1, b)]);
const sdfBlock = (molfile, props = {}) =>
  molfile.replace(/\s+$/, '') + '\n' + Object.entries(props).map(([k, v]) => `>  <${k}>\n${v}\n`).join('\n') + '\n$$$$\n';

const result = { ocl: {}, rdkit: {}, molecules: {}, extra: {} };

// ---- 環境與事實 ----
const oclPkg = pkgOf('openchemlib');
const rdPkg = pkgOf('@rdkit/rdkit');
const oclDist = path.join(here, 'node_modules', 'openchemlib', 'dist');
result.ocl = {
  package: oclPkg.name, packageVersion: oclPkg.version, libVersionString: oclVersion, license: oclPkg.license,
  runtimeDependencies: oclPkg.dependencies ?? {},
  distFilesBytes: Object.fromEntries(fs.readdirSync(oclDist).map((f) => [f, fs.statSync(path.join(oclDist, f)).size])),
  node: process.version,
};
result.rdkit = { packageVersion: rdPkg.version, license: rdPkg.license };

// ConformerGenerator 需要先註冊靜態資源 resources.json（不註冊會拋 "static resources must be registered first"）
// 瀏覽器版應改用 Resources.registerFromUrl()
{
  const t = performance.now();
  Resources.registerFromNodejs();
  result.ocl.registerResourcesMs = ms(t);
}

const tRd = performance.now();
const RDKit = await initRDKitModule();
result.rdkit.initMs = ms(tRd);

for (const m of molecules) {
  const r = { smiles: m.smiles, checks: {} };

  // 1. 3D 座標：ConformerGenerator.getOneConformerAsMolecule（會補上明確氫原子）
  let t = performance.now();
  const mol = Molecule.fromSmiles(m.smiles);
  r.heavyAtomsFromSmiles = mol.getAllAtoms();
  const gen = new ConformerGenerator(SEED);
  const conf = gen.getOneConformerAsMolecule(mol);
  r.timingFirstConformerMs = ms(t);
  if (!conf) {
    r.checks.coords3D = { supported: '失敗（回傳 null）', api: 'ConformerGenerator.getOneConformerAsMolecule' };
    result.molecules[m.name] = r;
    continue;
  }
  r.atomsWithH = conf.getAllAtoms();
  r.zRange = zRange(conf);
  r.is3D = conf.is3D();
  r.checks.coords3D = {
    supported: r.zRange[0] !== r.zRange[1] ? '支援' : '不支援（z 全相同）',
    api: 'ConformerGenerator(seed).getOneConformerAsMolecule(mol)（Molecule.is3D() 亦可確認）',
  };

  // 4. MOL / SDF 輸出（先輸出最初的構象，之後會被 MMFF 最佳化版本覆蓋為另一個檔）
  const molfile = conf.toMolfile();
  fs.writeFileSync(path.join(outDir, `${m.name}_3D_etkdg-like.mol`), molfile);
  fs.writeFileSync(path.join(outDir, `${m.name}_3D_etkdg-like.sdf`), sdfBlock(molfile));
  const parsedBack = Molecule.fromMolfile(molfile);
  r.molfileRoundTripZRange = zRange(parsedBack);
  r.checks.molSdfOutput = {
    supported: zRange(parsedBack)[0] !== zRange(parsedBack)[1] ? '支援' : '不支援',
    api: 'Molecule.toMolfile()／toMolfileV3()（含 z 座標）；SDF 為 molfile 加 $$$$（自行組成）；另有 SDFileParser 可讀 SDF',
  };

  // 5. 鍵長、鍵角、二面角
  const bonds = bondsOf(conf);
  const xyz = coords(conf);
  const b0 = bonds[0];
  const ownLen = dist(xyz[b0[0]], xyz[b0[1]]);
  const oclLen = conf.getBondLength(0);
  // 找一個角與二面角（重原子優先）
  const adj = xyz.map(() => []);
  bonds.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
  let ang = null, tor = null;
  outer: for (let b = 0; b < xyz.length; b++) for (const a of adj[b]) for (const c of adj[b]) if (a < c) { ang = [a, b, c]; break outer; }
  outer2: for (const [b, c] of bonds) for (const a of adj[b]) if (a !== c) for (const d of adj[c]) if (d !== b && d !== a) { tor = [a, b, c, d]; break outer2; }
  r.checks.geometry = {
    supported: '部分支援',
    api: 'getBondLength(bond)、calculateTorsion(atoms[4])（弧度）、getBondAngle(a,b)（只是鍵方向角，不是鍵角）；鍵角需自行由座標計算',
    sample: {
      bondLength_own: ownLen, bondLength_getBondLength: oclLen,
      lengthsAgree: Math.abs(ownLen - oclLen) < 1e-6,
      angle_own_deg: ang ? angle3(xyz[ang[0]], xyz[ang[1]], xyz[ang[2]]) : null,
      torsion_calculateTorsion_deg: tor ? conf.calculateTorsion(tor) * 180 / Math.PI : null,
    },
  };

  // 2. MMFF94 / MMFF94s 最佳化（在帶氫的構象上）
  const ff = {};
  for (const table of ['MMFF94', 'MMFF94s', 'MMFF94s+']) {
    try {
      const work = conf.getCompactCopy();
      t = performance.now();
      const field = new ForceFieldMMFF94(work, table);
      const e0 = field.getTotalEnergy();
      const code = field.minimise();
      const e1 = field.getTotalEnergy();
      ff[table] = { ok: true, returnCode: code, energyBefore: e0, energyAfter: e1, ms: ms(t), size: field.size() };
      if (table === 'MMFF94') {
        const mf = work.toMolfile();
        fs.writeFileSync(path.join(outDir, `${m.name}_3D_mmff94.mol`), mf);
        fs.writeFileSync(path.join(outDir, `${m.name}_3D_mmff94.sdf`), sdfBlock(mf, { MMFF94_energy: e1 }));
        r.mmffZRange = zRange(work);
      }
    } catch (e) { ff[table] = { ok: false, error: String(e) }; }
  }
  r.forceField = ff;
  r.checks.mmff = {
    supported: ff.MMFF94.ok ? '支援' : '不支援／失敗',
    api: 'new ForceFieldMMFF94(molecule, "MMFF94" | "MMFF94s" | "MMFF94s+") → getTotalEnergy()、minimise()（回傳碼，0 為成功）；ForceFieldMMFF94.size()',
    fallback: '型別定義中沒有其他力場類別（沒有 UFF 等退路）',
  };

  // 3. 多構象與能量：initializeConformers → getNextConformerAsMolecule，逐一 MMFF94 最佳化並取能量
  t = performance.now();
  const base = Molecule.fromSmiles(m.smiles);
  const g2 = new ConformerGenerator(SEED);
  const okInit = g2.initializeConformers(base);
  const confs = [];
  if (okInit) {
    for (let i = 0; i < MAX_CONFS; i++) {
      const c = g2.getNextConformerAsMolecule(null);
      if (!c) break;
      confs.push(c);
    }
  }
  r.timingConformerGenMs = ms(t);
  r.potentialConformerCount = okInit ? g2.getPotentialConformerCount() : null;
  r.rotatableBonds = base.getRotatableBondCount();
  t = performance.now();
  const energies = [];
  const conformerSdf = [];
  confs.forEach((c, i) => {
    try {
      const field = new ForceFieldMMFF94(c, 'MMFF94');
      const code = field.minimise();
      const e = field.getTotalEnergy();
      energies.push({ index: i, energy: e, returnCode: code });
    } catch (e) { energies.push({ index: i, error: String(e) }); }
  });
  r.timingMinimiseAllMs = ms(t);
  const good = energies.filter((x) => x.energy !== undefined);
  const emin = Math.min(...good.map((x) => x.energy));
  confs.forEach((c, i) => {
    const e = energies[i].energy;
    if (e === undefined) return;
    conformerSdf.push(sdfBlock(c.toMolfile(), { MMFF94_energy: e, relative_energy: e - emin, conformer_index: i }));
  });
  if (conformerSdf.length) fs.writeFileSync(path.join(outDir, `${m.name}_conformers_mmff94.sdf`), conformerSdf.join(''));
  r.conformers = {
    requestedMax: MAX_CONFS, delivered: confs.length,
    energies: good.map((x) => ({ i: x.index, E: Math.round(x.energy * 1000) / 1000, relE: Math.round((x.energy - emin) * 1000) / 1000 })),
    energyUnit: '未在型別定義註明（MMFF94 通常為 kcal/mol；本報告不下結論，待使用者或官方文件確認）',
  };
  r.checks.conformers = {
    supported: confs.length > 1 ? '支援' : (confs.length === 1 ? '部分支援（只得到 1 個構象）' : '不支援／失敗'),
    api: 'ConformerGenerator.initializeConformers(mol, {strategy, maxTorsionSets, use60degreeSteps})、getNextConformerAsMolecule()、getConformerCount()、getPotentialConformerCount()、molecules()；能量用 ForceFieldMMFF94.getTotalEnergy()（需自己對每個構象建力場）',
  };

  // 可重現性：相同種子、不同種子
  const run = (seed) => {
    const g = new ConformerGenerator(seed);
    const c = g.getOneConformerAsMolecule(Molecule.fromSmiles(m.smiles));
    return c ? coords(c) : null;
  };
  const a1 = run(SEED), a2 = run(SEED), b1 = run(SEED + 1);
  r.reproducibility = { sameSeedIdentical: a1 && a2 ? sameCoords(a1, a2) : null, differentSeedIdentical: a1 && b1 ? sameCoords(a1, b1) : null };

  // 7. 與 RDKit.js 的原子編號對應
  const rd = RDKit.get_mol(m.smiles);
  const rdNoH = (() => { rd.set_new_coords(); return rd.get_molblock(); })();
  const rdH = RDKit.get_mol(rd.add_hs()); rdH.set_new_coords();
  const rdWithHBlock = rdH.get_molblock();
  const rdElements = (mb) => { const L = mb.split('\n'); const n = parseInt(L[3].slice(0, 3)); return Array.from({ length: n }, (_, i) => L[4 + i].slice(31, 34).trim()); };
  const Z = { H: 1, C: 6, O: 8, N: 7 };
  const mapTest = {};
  for (const [label, mb] of [['rdkit_molblock_no_H', rdNoH], ['rdkit_molblock_with_H', rdWithHBlock]]) {
    const rdEls = rdElements(mb).map((e) => Z[e]);
    const info = { rdkitAtomCount: rdEls.length };
    try {
      const { molecule: parsed, map } = Molecule.fromMolfileWithAtomMap(mb);
      const parsedEls = elementsOf(parsed);
      info.oclAtomCountAfterParse = parsedEls.length;
      info.fromMolfileWithAtomMap_map = map;
      info.sameOrderAsRdkitAfterParse = JSON.stringify(parsedEls) === JSON.stringify(rdEls);
      // 交給 ConformerGenerator 產生 3D 之後
      const gg = new ConformerGenerator(SEED);
      const c3 = gg.getOneConformerAsMolecule(parsed.getCompactCopy());
      if (c3) {
        const els3 = elementsOf(c3);
        info.oclAtomCountAfter3D = els3.length;
        const heavyRd = rdEls.filter((z) => z !== 1);
        const heavy3 = els3.slice(0, heavyRd.length);
        info.heavyAtomOrderSameAfter3D_firstNIndexes = JSON.stringify(heavy3) === JSON.stringify(heavyRd);
        info.hydrogensAfterHeavyAtoms = els3.slice(heavyRd.length).every((z) => z === 1);
        info.firstHydrogenIndexAfter3D = els3.indexOf(1);
        // 重原子鍵連接是否與 RDKit 的重原子鍵一致（以索引比對）
        const rdBonds = (() => { const L = mb.split('\n'); const na = parseInt(L[3].slice(0, 3)), nb = parseInt(L[3].slice(3, 6)); return Array.from({ length: nb }, (_, i) => [parseInt(L[4 + na + i].slice(0, 3)) - 1, parseInt(L[4 + na + i].slice(3, 6)) - 1]); })();
        const key = ([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`);
        const rdHeavyBonds = new Set(rdBonds.filter(([a, b]) => rdEls[a] !== 1 && rdEls[b] !== 1).map(key));
        const oclHeavyBonds = new Set(bondsOf(c3).filter(([a, b]) => a < heavyRd.length && b < heavyRd.length).map(key));
        info.heavyBondsIdenticalByIndex = rdHeavyBonds.size === oclHeavyBonds.size && [...rdHeavyBonds].every((k) => oclHeavyBonds.has(k));
      } else info.conformer3D = '失敗（回傳 null）';
    } catch (e) { info.error = String(e); }
    mapTest[label] = info;
  }
  r.atomMappingWithRdkit = mapTest;
  rd.delete(); rdH.delete();

  r.checks.rdkitMapping = { supported: '見 atomMappingWithRdkit', api: 'Molecule.fromMolfile／fromMolfileWithAtomMap、getAtomicNo、getAllAtoms、getBondAtom' };
  result.molecules[m.name] = r;
}

// 力場參數缺漏的退路：試幾個較少見元素的分子（只記錄是否拋錯）
result.extra.missingParams = {};
for (const [name, smi] of [['trimethylborane', 'CB(C)C'], ['tetramethylsilane', 'C[Si](C)(C)C'], ['SF6', 'FS(F)(F)(F)(F)F'], ['trimethylphosphine', 'CP(C)C']]) {
  const rec = { smiles: smi };
  try {
    const c = new ConformerGenerator(SEED).getOneConformerAsMolecule(Molecule.fromSmiles(smi));
    if (!c) rec.conformer = '失敗（回傳 null）';
    else {
      try { const f = new ForceFieldMMFF94(c, 'MMFF94'); rec.mmff = { ok: true, code: f.minimise(), energy: f.getTotalEnergy() }; }
      catch (e) { rec.mmff = { ok: false, error: String(e).slice(0, 200) }; }
    }
  } catch (e) { rec.conformer = String(e).slice(0, 200); }
  result.extra.missingParams[name] = rec;
}

// 初始化時間：dynamic import 本身已載入；這裡記錄首次呼叫（建立第一個 Molecule）的時間
{
  const t = performance.now(); Molecule.fromSmiles('CCO');
  result.ocl.firstMoleculeCallMs = ms(t);
}

fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(result, null, 2), 'utf8');

console.log(JSON.stringify({ ocl: result.ocl, rdkit: result.rdkit }, null, 2));
for (const [n, r] of Object.entries(result.molecules)) {
  console.log(`\n== ${n} (${r.smiles}) 原子數(含H)=${r.atomsWithH} z範圍=${r.zRange}`);
  for (const [k, v] of Object.entries(r.checks)) console.log(`  ${k}: ${v.supported}`);
  console.log(`  構象數=${r.conformers?.delivered} 潛在=${r.potentialConformerCount} 可旋轉鍵=${r.rotatableBonds}`);
  console.log(`  耗時：第一個構象 ${r.timingFirstConformerMs} ms；產生構象 ${r.timingConformerGenMs} ms；全部 MMFF 最佳化 ${r.timingMinimiseAllMs} ms`);
  console.log(`  可重現：同種子相同=${r.reproducibility.sameSeedIdentical}；不同種子相同=${r.reproducibility.differentSeedIdentical}`);
  console.log(`  MMFF94 最佳化：${JSON.stringify(r.forceField.MMFF94)}`);
  console.log(`  RDKit 對應：${JSON.stringify(r.atomMappingWithRdkit)}`);
}
console.log('\n缺參數測試：', JSON.stringify(result.extra.missingParams, null, 2));
console.log(`\n完整結果：${path.join(outDir, 'results.json')}`);
