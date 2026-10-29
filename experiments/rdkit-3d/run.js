// 任務 001：測試官方 @rdkit/rdkit（RDKit_minimal）的 3D 能力。
// 不支援的功能以「記錄為不支援」處理，不讓腳本中斷。
const fs = require('fs');
const path = require('path');
const initRDKitModule = require('@rdkit/rdkit');

const pkgDir = path.join(__dirname, 'node_modules', '@rdkit', 'rdkit');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const wasmPath = path.join(pkgDir, 'dist', 'RDKit_minimal.wasm');
const outDir = path.join(__dirname, 'output');
fs.mkdirSync(outDir, { recursive: true });

const molecules = [
  { name: 'ethanol', smiles: 'CCO' },
  { name: 'propylene_oxide', smiles: 'CC1CO1' },
];

// 3D 相關的候選 API 名稱（RDKit 其他綁定常見的名稱）；逐一檢查是否存在於 Module 與 Mol 物件
const moduleCandidates = ['EmbedMolecule', 'embed_molecule', 'MMFFOptimizeMolecule', 'UFFOptimizeMolecule', 'EmbedMultipleConfs', 'get_conformers'];
const molCandidates = [
  'embed', 'embed_molecule', 'embed_multiple_confs', 'generate_conformers', 'add_conformer', 'get_conformer',
  'mmff_optimize', 'mmff_optimize_molecule', 'uff_optimize', 'uff_optimize_molecule', 'optimize', 'get_mmff_energy',
  'get_num_conformers', 'get_coords', 'get_new_coords', 'set_new_coords', 'has_coords', 'add_hs', 'get_molblock', 'get_v3Kmolblock',
];

const result = { rdkit: {}, api: {}, molecules: {} };
const ms = (t0) => Math.round((performance.now() - t0) * 10) / 10;

function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function angle(a, b, c) { const u = sub(a, b), v = sub(c, b); return Math.acos(dot(u, v) / Math.hypot(...u) / Math.hypot(...v)) * 180 / Math.PI; }
function dihedral(p0, p1, p2, p3) {
  const b0 = sub(p0, p1), b1 = sub(p2, p1), b2 = sub(p3, p2);
  const n1 = cross(b0, b1), n2 = cross(b1, b2);
  const m = cross(n1, b1.map((x) => x / Math.hypot(...b1)));
  return Math.atan2(dot(m, n2), dot(n1, n2)) * 180 / Math.PI;
}
// 解析 molblock 的原子座標與鍵（V2000）
function parseMolblock(mb) {
  const lines = mb.split('\n');
  const [na, nb] = [parseInt(lines[3].slice(0, 3)), parseInt(lines[3].slice(3, 6))];
  const atoms = [], bonds = [];
  for (let i = 0; i < na; i++) {
    const l = lines[4 + i];
    atoms.push({ xyz: [parseFloat(l.slice(0, 10)), parseFloat(l.slice(10, 20)), parseFloat(l.slice(20, 30))], el: l.slice(31, 34).trim() });
  }
  for (let i = 0; i < nb; i++) {
    const l = lines[4 + na + i];
    bonds.push([parseInt(l.slice(0, 3)) - 1, parseInt(l.slice(3, 6)) - 1]);
  }
  return { atoms, bonds };
}

(async () => {
  const t0 = performance.now();
  const RDKit = await initRDKitModule();
  result.rdkit = {
    package: pkg.name, packageVersion: pkg.version, license: pkg.license,
    rdkitVersion: RDKit.version(),
    wasmFileBytes: fs.statSync(wasmPath).size,
    initMs: ms(t0),
    node: process.version,
  };

  // 檢查 API 是否存在
  const probe = RDKit.get_mol('CCO');
  const modKeys = Object.keys(RDKit);
  const molKeys = new Set();
  for (let o = probe; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) Object.getOwnPropertyNames(o).forEach((k) => molKeys.add(k));
  result.api.moduleHas3DNames = Object.fromEntries(moduleCandidates.map((k) => [k, modKeys.includes(k)]));
  result.api.molHasNames = Object.fromEntries(molCandidates.map((k) => [k, molKeys.has(k)]));
  result.api.allMolMethods = [...molKeys].filter((k) => !k.startsWith('_') && k !== 'constructor').sort();
  result.api.allModuleFunctions = modKeys.filter((k) => !k.startsWith('_') && !k.startsWith('$')).sort();
  probe.delete();

  for (const m of molecules) {
    const r = { smiles: m.smiles, checks: {} };
    const mol = RDKit.get_mol(m.smiles);
    r.valid = mol.is_valid();

    // 1. 3D 座標（ETKDG 或等價）：minimal 版沒有 embed 類 API，只有 2D 版面（CoordGen／RDKit depiction）
    const has3DApi = ['embed', 'embed_molecule', 'generate_conformers'].some((k) => molKeys.has(k)) || modKeys.includes('EmbedMolecule');
    r.checks.coords3D = { supported: has3DApi ? '需進一步測試' : '不支援', api: 'Mol.set_new_coords / get_new_coords（只產生 2D 座標）', note: has3DApi ? '' : '沒有 ETKDG／距離幾何 API' };

    // 對照：加氫後的 2D 座標，確認 z 全為 0（證明不是 3D）
    const t1 = performance.now();
    let withH = null;
    try {
      const molH = RDKit.get_mol(mol.add_hs());
      molH.set_new_coords();
      const mb = molH.get_molblock();
      r.timing2DMs = ms(t1);
      const parsed = parseMolblock(mb);
      r.zRange = [Math.min(...parsed.atoms.map((a) => a.xyz[2])), Math.max(...parsed.atoms.map((a) => a.xyz[2]))];
      r.atomCountWithH = parsed.atoms.length;
      fs.writeFileSync(path.join(outDir, `${m.name}_2D_with_H.mol`), mb);
      r.output2D = `output/${m.name}_2D_with_H.mol（2D，z 全為 0，不是 3D 構型）`;
      withH = { molH, parsed, mb };
    } catch (e) { r.error2D = String(e); }

    // 2. MMFF94 / UFF
    const ffNames = ['mmff_optimize', 'mmff_optimize_molecule', 'uff_optimize', 'uff_optimize_molecule', 'optimize'];
    r.checks.forceField = { supported: ffNames.some((k) => molKeys.has(k)) ? '需進一步測試' : '不支援', api: '無', note: 'MMFF94／UFF 力場 API 不在 minimal 版' };

    // 3. 多構象與能量
    const confNames = ['embed_multiple_confs', 'get_num_conformers', 'get_conformer', 'get_mmff_energy'];
    r.checks.conformersEnergy = { supported: confNames.some((k) => molKeys.has(k)) ? '需進一步測試' : '不支援', api: '無', note: 'Mol 物件沒有構象列表或能量 API' };

    // 4. 含座標的 MOL 與 SDF
    if (withH) {
      const sdf = withH.mb.replace(/\n$/, '') + '\n$$$$\n';
      fs.writeFileSync(path.join(outDir, `${m.name}_2D_with_H.sdf`), sdf);
      r.checks.molSdfOutput = { supported: '部分支援', api: 'Mol.get_molblock / get_v3Kmolblock（SDF 由 molblock 加 $$$$ 自行組成）', note: '可輸出含座標的 MOL，但座標是 2D；沒有 3D 座標可輸出' };
    }

    // 5. 鍵長、鍵角、二面角：RDKit.js 沒有直接 API；可由 molblock 座標自行計算
    if (withH) {
      const { atoms, bonds } = withH.parsed;
      const bond0 = bonds[0];
      const len = dist(atoms[bond0[0]].xyz, atoms[bond0[1]].xyz);
      // 找一個角與一個二面角（沿著鏈）
      const adj = atoms.map(() => []);
      bonds.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
      let angleDeg = null, dihedralDeg = null;
      outer: for (let b = 0; b < atoms.length; b++) {
        for (const a of adj[b]) for (const c of adj[b]) if (a < c) {
          angleDeg = { atoms: [a, b, c], deg: angle(atoms[a].xyz, atoms[b].xyz, atoms[c].xyz) };
          break outer;
        }
      }
      outer2: for (const [b, c] of bonds) {
        for (const a of adj[b]) if (a !== c) for (const d of adj[c]) if (d !== b && d !== a) {
          dihedralDeg = { atoms: [a, b, c, d], deg: dihedral(atoms[a].xyz, atoms[b].xyz, atoms[c].xyz, atoms[d].xyz) };
          break outer2;
        }
      }
      r.checks.geometryMeasure = { supported: '不支援（RDKit.js 無 API）；可由座標自行計算', api: '自行解析 get_molblock 座標；本腳本已用純函式算出', sample2D: { bondLengthFirstBond: len, angle: angleDeg, dihedral: dihedralDeg }, note: '示範值來自 2D 座標，不具化學意義，只證明公式可由座標算出' };
      withH.molH.delete();
    }
    mol.delete();
    result.molecules[m.name] = r;
  }

  // 單次 2D 座標耗時重複 20 次取平均，供參考
  const t2 = performance.now();
  for (let i = 0; i < 20; i++) { const x = RDKit.get_mol('CC1CO1'); const y = RDKit.get_mol(x.add_hs()); y.set_new_coords(); y.get_molblock(); x.delete(); y.delete(); }
  result.timing2DAvgMs = ms(t2) / 20;

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ rdkit: result.rdkit, moduleHas3DNames: result.api.moduleHas3DNames, molHasNames: result.api.molHasNames, timing2DAvgMs: result.timing2DAvgMs }, null, 2));
  for (const [n, r] of Object.entries(result.molecules)) {
    console.log(`\n== ${n} (${r.smiles}) ==`);
    for (const [k, v] of Object.entries(r.checks)) console.log(`${k}: ${v.supported} | ${v.api}`);
  }
  console.log(`\n完整結果：${path.join(outDir, 'results.json')}`);
})().catch((e) => { console.error('腳本錯誤', e); process.exit(1); });
