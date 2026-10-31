// 任務 030 D 節：幾何 VW 可行性（拋棄式驗證腳本，不進 src、不進建置）。
// 兩種幾何算法，都用書中 Table 4.1 的原子半徑（Bondi 1968 的 van der Waals 半徑、共價半徑）：
//   (a) 書中公式（式 4.1，書頁 73）：每個原子 = 球體積 − Σ 與「共價鍵結鄰居」的球冠；鍵長 l = 兩原子共價半徑之和（常數，與構象無關）。
//   (b) 3D 座標的球體聯集：用任務 024 的 3D 流程（封端片段 → ConformerSession）取得原子座標，在格點上數「被任一 vdW 球涵蓋」的體積；
//       以放射平面（power diagram：argmin d² − R²）把體積分給各原子，只加總「單元」的原子（封端甲基與其氫不計）。
// 與書中 Table 4.2／4.7 的值比較。執行：node scripts/diagnosis/030-d-geometric-vw.ts
// 輸出 docs/verification/030-診斷-D-幾何VW-輸出.md
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resources } from 'openchemlib';
import { createServer } from 'vite';
import { T47, VW as BOOK } from './030-book-values.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', '030-診斷-D-幾何VW-輸出.md');
const NA = 0.6022140857; // cm³/mol per Å^3（Avogadro 常數 ×1e-24）

// Table 4.1（書頁 72）：nm → Å。vdW：Bondi (1968) 欄。共價半徑依鍵型。
const VDW: Record<number, number> = { 1: 1.2, 6: 1.7, 7: 1.55, 8: 1.5, 9: 1.47, 14: 2.1, 15: 1.8, 16: 1.8, 17: 1.75, 35: 1.85 };
const SYM: Record<number, string> = { 1: 'H', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl', 35: 'Br' };
const SYM2Z: Record<string, number> = Object.fromEntries(Object.entries(SYM).map(([z, s]) => [s, Number(z)]));

interface Atom { z: number; x: number; y: number; z3: number }
interface Graph { atoms: Atom[]; nb: { j: number; bo: number }[][]; arom: boolean[] }

/** 共價半徑（Å），依 Table 4.1 的鍵型分列；沒有的元素（例如 B）回傳 null */
function covalent(z: number, g: Graph, i: number): number | null {
  const bos = g.nb[i].map((n) => n.bo);
  const has = (k: number) => bos.includes(k);
  switch (z) {
    case 1: return 0.31;
    case 9: return 0.64;
    case 17: return 0.99;
    case 35: return 1.14;
    case 6: return g.arom[i] ? 0.7 : has(3) ? 0.6 : has(2) ? 0.67 : 0.77;
    case 8: return has(2) ? 0.62 : 0.66;
    case 7: return g.arom[i] ? 0.65 : has(3) ? 0.55 : has(2) ? 0.63 : 0.7;
    case 16: return has(2) ? 0.94 : 1.04;
    case 15: return has(3) ? 0.93 : has(2) ? 1.0 : 1.1;
    case 14: return 1.17;
    default: return null;
  }
}

/** 書中式 (4.1)：回傳每個原子的體積（Å^3）；缺半徑的元素回傳 null */
function bookAtomVolumes(g: Graph): (number | null)[] {
  return g.atoms.map((a, i) => {
    const R = VDW[a.z];
    const ci = covalent(a.z, g, i);
    if (R === undefined || ci === null) return null;
    let v = (4 / 3) * Math.PI * R ** 3;
    for (const { j } of g.nb[i]) {
      const zj = g.atoms[j].z;
      const r = VDW[zj];
      const cj = covalent(zj, g, j);
      if (r === undefined || cj === null) return null;
      const l = ci + cj;
      const h = R - l / 2 - (R * R) / (2 * l) + (r * r) / (2 * l);
      v -= Math.PI * h * h * (R - h / 3);
    }
    return v;
  });
}

/** 球體聯集（格點法）：回傳每個原子分到的體積（Å^3，放射平面分配）與聯集總體積 */
function unionVolumes(atoms: Atom[], step: number): { per: number[]; total: number } {
  const R = atoms.map((a) => VDW[a.z]);
  const maxR = Math.max(...R);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  atoms.forEach((a, i) => {
    const p = [a.x, a.y, a.z3];
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k] - R[i]);
      max[k] = Math.max(max[k], p[k] + R[i]);
    }
  });
  const cell = maxR;
  const dims = [0, 1, 2].map((k) => Math.max(1, Math.ceil((max[k] - min[k]) / cell)));
  const cells = new Map<number, number[]>();
  const key = (cx: number, cy: number, cz: number) => (cx * dims[1] + cy) * dims[2] + cz;
  atoms.forEach((a, i) => {
    const cx = Math.min(dims[0] - 1, Math.floor((a.x - min[0]) / cell));
    const cy = Math.min(dims[1] - 1, Math.floor((a.y - min[1]) / cell));
    const cz = Math.min(dims[2] - 1, Math.floor((a.z3 - min[2]) / cell));
    const k = key(cx, cy, cz);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k)!.push(i);
  });
  const per = new Array<number>(atoms.length).fill(0);
  let count = 0;
  const nx = Math.ceil((max[0] - min[0]) / step);
  const ny = Math.ceil((max[1] - min[1]) / step);
  const nz = Math.ceil((max[2] - min[2]) / step);
  for (let ix = 0; ix < nx; ix++) {
    const px = min[0] + (ix + 0.5) * step;
    const cx = Math.min(dims[0] - 1, Math.floor((px - min[0]) / cell));
    for (let iy = 0; iy < ny; iy++) {
      const py = min[1] + (iy + 0.5) * step;
      const cy = Math.min(dims[1] - 1, Math.floor((py - min[1]) / cell));
      for (let iz = 0; iz < nz; iz++) {
        const pz = min[2] + (iz + 0.5) * step;
        const cz = Math.min(dims[2] - 1, Math.floor((pz - min[2]) / cell));
        let best = -1;
        let bestP = Infinity;
        let inside = false;
        for (let dx = -1; dx <= 1; dx++) {
          const x2 = cx + dx;
          if (x2 < 0 || x2 >= dims[0]) continue;
          for (let dy = -1; dy <= 1; dy++) {
            const y2 = cy + dy;
            if (y2 < 0 || y2 >= dims[1]) continue;
            for (let dz = -1; dz <= 1; dz++) {
              const z2 = cz + dz;
              if (z2 < 0 || z2 >= dims[2]) continue;
              const list = cells.get(key(x2, y2, z2));
              if (!list) continue;
              for (const i of list) {
                const a = atoms[i];
                const d2 = (px - a.x) ** 2 + (py - a.y) ** 2 + (pz - a.z3) ** 2;
                if (d2 <= R[i] * R[i]) inside = true;
                const pw = d2 - R[i] * R[i];
                if (pw < bestP) {
                  bestP = pw;
                  best = i;
                }
              }
            }
          }
        }
        if (inside && best >= 0) {
          per[best] += 1;
          count++;
        }
      }
    }
  }
  const dv = step ** 3;
  return { per: per.map((c) => c * dv), total: count * dv };
}

/** V2000 Molfile → 原子、鍵（鍵序 1／2／3，4 視為芳香）；氫為明確原子 */
function parseMolfile(text: string): { atoms: Atom[]; bonds: [number, number, number][] } {
  const ls = text.split(/\r?\n/);
  const na = Number(ls[3].slice(0, 3));
  const nb = Number(ls[3].slice(3, 6));
  const atoms: Atom[] = [];
  for (let i = 0; i < na; i++) {
    const l = ls[4 + i];
    atoms.push({ x: Number(l.slice(0, 10)), y: Number(l.slice(10, 20)), z3: Number(l.slice(20, 30)), z: SYM2Z[l.slice(31, 34).trim()] ?? 0 });
  }
  const bonds: [number, number, number][] = [];
  for (let i = 0; i < nb; i++) {
    const l = ls[4 + na + i];
    bonds.push([Number(l.slice(0, 3)) - 1, Number(l.slice(3, 6)) - 1, Number(l.slice(6, 9))]);
  }
  return { atoms, bonds };
}

const server = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true } });
try {
  Resources.registerFromNodejs();
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { capRepeatUnit } = await server.ssrLoadModule('/src/core/polymer/unitFragment.ts');
  const { ConformerSession } = await server.ssrLoadModule('/src/core/conformer/session.ts');
  const { computeVdwVolume } = await server.ssrLoadModule('/src/core/properties/vanDerWaalsVolume.ts');
  const { readGraph } = await server.ssrLoadModule('/src/core/properties/molGraph.ts');
  const { validateStructure } = await server.ssrLoadModule('/src/core/structure/validate.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const { USER_SMALL, USER_UNITS, SEMI } = await import('./030-structures.ts');
  const RDKit = await getRDKit();

  const STEP = 0.08;
  const NCONF = 5;

  /** 一個結構（單元或小分子）的幾何 VW：書中公式與 3D 聯集 */
  function geometric(smiles: string, kind: 'unit' | 'mol') {
    let capSmiles = smiles;
    let capped: number[] = [];
    let molblock: string;
    if (kind === 'unit') {
      const r = capRepeatUnit(RDKit, smiles);
      if (!r.ok) return { error: r.message } as const;
      capSmiles = r.fragment.smiles;
      capped = r.fragment.cappedAtoms;
      molblock = r.fragment.molblock;
    } else {
      const v = validateStructure(RDKit, smiles);
      if (!v.valid) return { error: '無法解析' } as const;
      molblock = v.molblock;
    }
    let batch;
    try {
      batch = new ConformerSession(molblock).generate(NCONF);
    } catch (e) {
      return { error: `3D 失敗：${e instanceof Error ? e.message : String(e)}` } as const;
    }
    {
      const probe = parseMolfile(batch.conformers[0].molfile).atoms;
      const bad = probe.find((a) => VDW[a.z] === undefined);
      if (bad) return { error: `Table 4.1 沒有元素 ${SYM[bad.z] ?? bad.z} 的半徑，無法算` } as const;
    }
    const perConf: { book: number | null; unionUnit: number; unionTotal: number; energy: number | null }[] = [];
    let unitCount = 0;
    for (const c of batch.conformers) {
      const { atoms, bonds } = parseMolfile(c.molfile);
      const nb: { j: number; bo: number }[][] = atoms.map(() => []);
      for (const [a, b, o] of bonds) {
        nb[a].push({ j: b, bo: o === 4 ? 1 : o });
        nb[b].push({ j: a, bo: o === 4 ? 1 : o });
      }
      // 芳香性：以 RDKit 讀這個 Molfile（原子順序不變）
      const m = RDKit.get_mol(c.molfile);
      let arom: boolean[] = atoms.map(() => false);
      if (m && m.is_valid()) {
        const rg = readGraph(m);
        if (rg.z.length === atoms.length) arom = rg.aromatic;
        m.delete();
      }
      const g: Graph = { atoms, nb, arom };
      // 單元的原子：重原子中不是封端碳者，再加上接在這些原子上的氫
      const isUnit = atoms.map((a, i) => {
        if (kind === 'mol') return true;
        if (a.z === 1) return nb[i].length === 1 && !isCapAtom(nb[i][0].j);
        return !isCapAtom(i);
      });
      function isCapAtom(i: number): boolean {
        return capped.includes(i);
      }
      unitCount = isUnit.filter(Boolean).length;
      const bv = bookAtomVolumes(g);
      const book = bv.some((x, i) => isUnit[i] && x === null) ? null : bv.reduce((s: number, x, i) => (isUnit[i] ? s + (x as number) : s), 0) * NA;
      const u = unionVolumes(atoms, STEP);
      const unionUnit = u.per.reduce((s, x, i) => (isUnit[i] ? s + x : s), 0) * NA;
      perConf.push({ book, unionUnit, unionTotal: u.total * NA, energy: c.energy });
    }
    return { capSmiles, optimized: batch.optimized, perConf, unitCount } as const;
  }

  const lines: string[] = [];
  const out = (t = '') => lines.push(t);
  const f2 = (x: number | null | undefined, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d));
  const sg = (x: number | null, d = 2) => (x === null || !Number.isFinite(x) ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(d)}`);
  const cell = (t: string) => t.replace(/\|/g, '\\|');
  const verdict = (d: number | null, ref: number) => {
    if (d === null) return '—';
    const ok = Math.abs(d) <= 0.5 || Math.abs(d / ref) <= 0.01;
    return ok ? '可行' : '不可行（> 0.5 且 > 1%）';
  };

  out('# 任務 030 D：幾何 VW 可行性（輸出）');
  out();
  out('由 `scripts/diagnosis/030-d-geometric-vw.ts` 產生（拋棄式；不進 src、不進建置）。');
  out();
  out('## D-1：書中 VW 的計算定義（書頁 72–73，PDF 第 99–100 頁）');
  out();
  out('- **原子半徑（Table 4.1，書頁 72）**：列出各元素的共價半徑，以及 Pauling (1940)、Bondi (1968)、Slonimskii et al. (1970) 三套 van der Waals 半徑（nm）。書中 4.2.3 節沒有說明用哪一套；Table 4.2 的值與 Bondi 的基團體積一致（書頁 73 「Bondi (1964) was the first to calculate…」），本診斷採 **Bondi (1968) 欄**：H 0.120、F 0.147、Cl 0.175、Br 0.185、O 0.150、S 0.180、N 0.155、P 0.180、C 0.170、Si 0.210 nm；**B 沒有半徑，書中沒有硼**。共價半徑依鍵型分列（–O– 0.066／=O 0.062；>C< 0.077／Car 0.070／=C< 0.067／≡C– 0.060；–N< 0.070／Nar 0.065／=N– 0.063／≡N 0.055；–S– 0.104／=S 0.094；–P< 0.110；>Si< 0.117；H 0.031；F 0.064；Cl 0.099；Br 0.114）。');
  out('- **球體重疊（書頁 73）**：「the Van der Waals volume is assumed to be bounded by the outer surface of a number of interpenetrating spheres. The radii of the spheres are assumed to be (constant) atomic radii for the elements involved and the distances between the centres of the spheres are the (constant) bond distances.」所以：球半徑＝vdW 半徑，球心距＝**常數的鍵長**（與構象無關）；要算重疊，只對「共價鍵結」的鄰居計算球冠。');
  out('- **重疊公式（式 4.1，書頁 73）**：原子 A（半徑 R）的體積 V_W,A = N_A [ (4/3)πR³ − Σ π h_i² (R − h_i/3) ]，h_i = R − l_i/2 − R²/(2 l_i) + r_i²/(2 l_i)；r_i 是共價鍵結的原子 i 的半徑，l_i 是 A 與 i 的鍵長。**加總只含共價鍵結的鄰居**，不含非鍵結原子（1,3 位等）的重疊，也不處理三球同時重疊。');
  out('- **結構單元的 VW**：書頁 73 說基團的 VW 已含周圍原子的影響，結構單元的 VW ≈ 基團 VW 之和（Table 4.2）；本節的幾何算法是直接用式 4.1 對每個原子加總（Bondi 1964 建立基團值的方法）。**書中沒有給鍵長的數值表**；本診斷取鍵長 l ＝ 兩原子的共價半徑（Table 4.1）之和，這是我的解讀（不是書中明列）。');
  out();
  out('## D-2：任務 024 的 3D 流程能否輸出原子座標');
  out();
  out('- **函式**：`capRepeatUnit(RDKit, unitSmiles)`（`src/core/polymer/unitFragment.ts`）把連接點換成甲基，回傳封端 SMILES、2D Molfile、封端原子索引（`cappedAtoms`）；`new ConformerSession(molblock).generate(n)`（`src/core/conformer/session.ts`）回傳 `ConformerRecord[]`，每筆的 `molfile` 是**含 3D 座標與明確氫的 V2000 Molfile**（重原子索引與輸入相同，氫接在後面），另有 `energy`（MMFF94）、`relativeEnergy`、`optimized`、`converged`。');
  out('- **限制**：(1) 座標是封端片段（連接點換成甲基）的座標，**不是聚合物鏈**；(2) 固定種子 42、構象數上限 30，重原子間距離矩陣 RMS ≤ 0.1 Å 視為同一構象；(3) 不支援 MMFF94 的元素（例如硼、部分價態的硫）改為未最佳化的初始構象（K07），座標仍可取得；(4) 大分子（> 100 重原子）可能很慢；(5) 單元內的相對構象反映「小片段的單分子」，沒有鏈間堆積；(6) 本診斷腳本直接在 Node 中使用同一個 `ConformerSession`（需 `Resources.registerFromNodejs()`），沒有改動 src。');
  out();

  const SPECS: { name: string; smiles: string; kind: 'unit' | 'mol'; ref: number | null; refSrc: string }[] = [
    { name: '聚乙烯單元（–CH2CH2–）', smiles: '[*:1]CC[*:2]', kind: 'unit', ref: 2 * BOOK.CH2, refSrc: 'Table 4.2：2 × –CH2– 10.23（Table 4.7 沒有 PE）' },
    { name: '聚苯乙烯單元', smiles: '[*:1]CC([*:2])c1ccccc1', kind: 'unit', ref: 62.9, refSrc: 'Table 4.7 書頁 82' },
    { name: 'PET 單元', smiles: '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]', kind: 'unit', ref: 94.2, refSrc: 'Table 4.7 書頁 83' },
    { name: '雙酚 A 單元（–C6H4–C(CH3)2–C6H4–）', smiles: '[*:1]c1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]', kind: 'unit', ref: 2 * BOOK.phenylene + BOOK.C_CH3_2, refSrc: 'Table 4.2：2 × 43.3 + 30.7（–C6H4–、–C(CH3)2–）' },
    { name: '聚氯乙烯單元', smiles: '[*:1]CC(Cl)[*:2]', kind: 'unit', ref: 29.2, refSrc: 'Table 4.7 書頁 82' },
    { name: '聚（4-甲基戊烯）單元', smiles: '[*:1]CC([*:2])CC(C)C', kind: 'unit', ref: 61.4, refSrc: 'Table 4.7 書頁 82' },
    { name: '聚（乙烯基環己烷）單元', smiles: '[*:1]CC([*:2])C1CCCCC1', kind: 'unit', ref: 73.8, refSrc: 'Table 4.7 書頁 82' },
    { name: '聚乙酸乙烯酯（PVAc）單元（含酯）', smiles: '[*:1]CC([*:2])OC(C)=O', kind: 'unit', ref: 45.9, refSrc: 'Table 4.7 書頁 82' },
    { name: 'PMMA 單元', smiles: '[*:1]CC([*:2])(C)C(=O)OC', kind: 'unit', ref: 56.1, refSrc: 'Table 4.7 書頁 82' },
    { name: '聚甲基丙烯酸乙酯（PEMA）單元', smiles: '[*:1]CC([*:2])(C)C(=O)OCC', kind: 'unit', ref: 66.3, refSrc: 'Table 4.7 書頁 82' },
    { name: '聚甲基丙烯酸苯酯單元', smiles: '[*:1]CC([*:2])(C)C(=O)Oc1ccccc1', kind: 'unit', ref: 88.3, refSrc: 'Table 4.7 書頁 82' },
    { name: '聚甲基丙烯酸苄酯單元', smiles: '[*:1]CC([*:2])(C)C(=O)OCc1ccccc1', kind: 'unit', ref: 98.5, refSrc: 'Table 4.7 書頁 82' },
    { name: '聚（二甲基苯醚）單元（芳香醚）', smiles: '[*:1]Oc1c(C)cc([*:2])cc1C', kind: 'unit', ref: 69.3, refSrc: 'Table 4.7 書頁 83' },
    { name: '聚（二苯基苯醚）單元（芳香醚）', smiles: '[*:1]Oc1c(-c2ccccc2)cc([*:2])cc1-c1ccccc1', kind: 'unit', ref: 133.7, refSrc: 'Table 4.7 書頁 83' },
    { name: '尼龍 6 單元（醯胺）', smiles: '[*:1]C(=O)NCCCCC[*:2]', kind: 'unit', ref: 64.2, refSrc: 'Table 4.7 書頁 83' },
    { name: '尼龍 6,6 單元', smiles: '[*:1]NC(=O)CCCCC(=O)NCCCCCC[*:2]', kind: 'unit', ref: 128.3, refSrc: 'Table 4.7 書頁 83' },
    { name: '雙酚 A 聚碳酸酯單元', smiles: '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]', kind: 'unit', ref: 136.2, refSrc: 'Table 4.7 書頁 83（4,4-isopropylenediphenylene carbonate）' },
    { name: '聚（亞甲基二伸苯碳酸酯）單元', smiles: '[*:1]OC(=O)Oc1ccc(cc1)Cc1ccc([*:2])cc1', kind: 'unit', ref: 115.8, refSrc: 'Table 4.7 書頁 83' },
    { name: '聚（硫代二伸苯碳酸酯）單元', smiles: '[*:1]OC(=O)Oc1ccc(cc1)Sc1ccc([*:2])cc1', kind: 'unit', ref: 116.3, refSrc: 'Table 4.7 書頁 83' },
  ];
  void T47;

  out('## D-3：與書中值比較（有書中參考值的結構）');
  out();
  out(`幾何：**(a) 書中式 4.1**（共價鍵結鄰居的球冠，鍵長＝共價半徑和）；**(b) 3D 聯集**（${NCONF} 個構象，格點 ${STEP} Å，放射平面分配）。差值＝幾何 − 書中值（cm³/mol）；判定門檻：差 ≤ 0.5 cm³/mol 或 ≤ 1%（任務單）。(b) 欄為 ${NCONF} 個構象的平均，括號為最小～最大。`);
  out();
  out('| 結構 | 書中參考值（出處） | 專案 Table 4.2 加總 | (a) 書中式 4.1 | 差 | (a) 判定 | (b) 3D 聯集（平均） | (b) 構象範圍 | 差 | (b) 判定 |');
  out('|---|---|---|---|---|---|---|---|---|---|');
  const statsA: number[] = [];
  const statsB: number[] = [];
  const relA: number[] = [];
  const relB: number[] = [];
  const spread: { name: string; range: number; rel: number }[] = [];
  let passA = 0;
  let passB = 0;
  let nRef = 0;
  for (const s of SPECS) {
    const t42 = computeVdwVolume(RDKit, s.smiles);
    const t42v = t42.status === 'ok' ? t42.vw : null;
    const r = geometric(s.smiles, s.kind);
    if ('error' in r) {
      out(`| ${cell(s.name)} | ${s.ref} | ${f2(t42v)} | 失敗：${r.error} | — | — | — | — | — | — |`);
      continue;
    }
    const books = r.perConf.map((p) => p.book);
    const a = books[0];
    const us = r.perConf.map((p) => p.unionUnit);
    const mean = us.reduce((x, y) => x + y, 0) / us.length;
    const mn = Math.min(...us);
    const mx = Math.max(...us);
    const da = a === null ? null : a - (s.ref as number);
    const db = mean - (s.ref as number);
    if (da !== null) (statsA.push(Math.abs(da)), relA.push((da / (s.ref as number)) * 100));
    (statsB.push(Math.abs(db)), relB.push((db / (s.ref as number)) * 100));
    spread.push({ name: s.name, range: mx - mn, rel: ((mx - mn) / mean) * 100 });
    if (da !== null && (Math.abs(da) <= 0.5 || Math.abs(da / (s.ref as number)) <= 0.01)) passA++;
    if (Math.abs(db) <= 0.5 || Math.abs(db / (s.ref as number)) <= 0.01) passB++;
    nRef++;
    out(`| ${cell(s.name)} | ${s.ref!.toFixed(2)}（${cell(s.refSrc)}） | ${f2(t42v)} | ${f2(a)} | ${sg(da)} | ${verdict(da, s.ref as number)} | ${f2(mean)} | ${f2(mn)}～${f2(mx)} | ${sg(db)} | ${verdict(db, s.ref as number)} |`);
  }
  out();
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  out(`**統計（${SPECS.length} 個有書中值的結構）**：(a) 平均絕對差 ${f2(avg(statsA))}、最大絕對差 ${f2(Math.max(...statsA))} cm³/mol，相對誤差平均 ${sg(avg(relA), 1)}%（範圍 ${sg(Math.min(...relA), 1)}% 至 ${sg(Math.max(...relA), 1)}%）；(b) 平均絕對差 ${f2(avg(statsB))}、最大絕對差 ${f2(Math.max(...statsB))} cm³/mol，相對誤差平均 ${sg(avg(relB), 1)}%（範圍 ${sg(Math.min(...relB), 1)}% 至 ${sg(Math.max(...relB), 1)}%）。`);
  out();

  out(`**通過門檻（差 ≤ 0.5 cm³/mol 或 ≤ 1%）的結構數**：(a) ${passA}／${nRef}；(b) ${passB}／${nRef}。`);
  out();
  out('## D-5：構象對 VW 的影響');
  out();
  out('(a) 書中式 4.1：球心距是常數鍵長，**與構象無關，構象影響＝0（數學上為零，不是量測值）**。(b) 3D 聯集：不同構象的單元體積範圍（最大 − 最小，cm³/mol）：');
  out();
  out('| 結構 | (b) 構象體積範圍（cm³/mol） | 佔平均值 |');
  out('|---|---|---|');
  for (const s of spread) {
    out(`| ${cell(s.name)} | ${f2(s.range)} | ${f2(s.rel, 3)}% |`);
  }
  out();
  const ranges = spread.map((x) => x.range);
  out(`構象間範圍：平均 ${f2(avg(ranges))}、最大 ${f2(Math.max(...ranges))} cm³/mol（${spread.length} 個結構，每個 ${NCONF} 個構象）。`);
  out();

  // 格點收斂檢查
  {
    const r = capRepeatUnit(RDKit, '[*:1]CC([*:2])c1ccccc1');
    if (r.ok) {
      const b = new ConformerSession(r.fragment.molblock).generate(1);
      const { atoms } = parseMolfile(b.conformers[0].molfile);
      out('## 格點收斂檢查（聚苯乙烯封端片段的第 1 個構象，聯集總體積）');
      out();
      out('| 格點間距（Å） | 聯集總體積（cm³/mol） |');
      out('|---|---|');
      for (const st of [0.16, 0.08, 0.04]) out(`| ${st} | ${f2(unionVolumes(atoms, st).total * NA, 3)} |`);
      out();
    }
  }

  // 沒有書中值的結構：只列幾何值
  out('## D-4：任務 028 留空的結構（沒有書中參考值）——幾何算得出什麼');
  out();
  out('這些結構的 VW 在專案 Table 4.2 切分中缺基團。下表只列幾何值；**沒有書中參考值可以比對**（書中沒有這些結構的 VW），所以不能宣稱「準確」，只能看跟可驗證結構的偏差是否一致。');
  out();
  out('| 結構 | 類型 | 缺的原子團（任務 028） | (a) 書中式 4.1 | (b) 3D 聯集（平均） | (b) 構象範圍 | 備註 |');
  out('|---|---|---|---|---|---|---|');
  const extra: { name: string; smiles: string; kind: 'unit' | 'mol'; why: string; bookNote?: string }[] = [
    { name: '環氧丙烷', smiles: 'CC1CO1', kind: 'mol', why: '環氧環' },
    { name: '環氧氯丙烷', smiles: 'ClCC1CO1', kind: 'mol', why: '環氧環' },
    { name: 'BADGE', smiles: USER_SMALL.find((s: any) => s.name === 'BADGE').smiles, kind: 'mol', why: '醚 O、環氧環' },
    { name: 'PGMEA', smiles: 'COCC(C)OC(C)=O', kind: 'mol', why: '醚 O' },
    { name: 'E PGMA 型環氧單元', smiles: USER_UNITS[2].smiles, kind: 'unit', why: '環氧環' },
    { name: 'BT03 酚醛環氧（EPN）單元', smiles: BACKBONE_TEMPLATES.find((t: any) => t.id === 'BT03').unitSmiles, kind: 'unit', why: '醚 O、環氧環' },
    { name: 'BT05 雙酚 A 環氧單元', smiles: BACKBONE_TEMPLATES.find((t: any) => t.id === 'BT05').unitSmiles, kind: 'unit', why: '醚 O' },
    { name: 'BT06 雙酚茀環氧單元', smiles: BACKBONE_TEMPLATES.find((t: any) => t.id === 'BT06').unitSmiles, kind: 'unit', why: '醚 O、茀稠環' },
    { name: 'P 單元 A（雙酚茀）', smiles: USER_UNITS[0].smiles, kind: 'unit', why: '茀稠環' },
    { name: 'SBI 雙酚', smiles: USER_SMALL.find((s: any) => s.name.startsWith('SBI')).smiles, kind: 'mol', why: '螺／稠合環' },
    { name: 'P 單元 B（萘基次甲基）', smiles: USER_UNITS[1].smiles, kind: 'unit', why: '（專案可算：78.25）', bookNote: '書中基團加總 78.25（專案 Table 4.2 切分）' },
    { name: '三苯基膦', smiles: USER_SMALL.find((s: any) => s.name === '三苯基膦').smiles, kind: 'mol', why: 'P' },
    { name: '三氟化硼', smiles: 'FB(F)F', kind: 'mol', why: 'B（Table 4.1 無半徑）' },
    ...SEMI.filter((s: any) => ['聚醯亞胺 PMDA–ODA 單元', '聚醯亞胺 BPDA–PDA 單元', '聚苯并噁唑（PBO）單元', '甲基丙烯酸 2-甲基-2-金剛烷酯（MAdMA）單元', '2-甲基咪唑', 'DVS-BCB（二乙烯基四甲基二矽氧烷雙苯并環丁烯）'].includes(s.name)).map((s: any) => ({ name: `${s.name}※`, smiles: s.smiles, kind: s.kind === '聚合物單元' ? ('unit' as const) : ('mol' as const), why: '半導體材料（待使用者審）', bookNote: s.name === '聚醯亞胺 PMDA–ODA 單元' ? `書中整體基團加總：均苯四甲醯亞胺 ${BOOK.pyromellitimide} + 2×伸苯基 ${BOOK.phenylene} + –O– ${BOOK.O_a}｜${BOOK.O_b} = ${(BOOK.pyromellitimide + 2 * BOOK.phenylene + BOOK.O_a).toFixed(1)}｜${(BOOK.pyromellitimide + 2 * BOOK.phenylene + BOOK.O_b).toFixed(1)}（Table 4.2）` : undefined })),
  ];
  for (const e of extra) {
    const r = geometric(e.smiles, e.kind);
    if ('error' in r) {
      out(`| ${cell(e.name)} | ${e.kind === 'unit' ? '單元' : '小分子'} | ${e.why} | 失敗：${r.error} | — | — | — |`);
      continue;
    }
    const us = r.perConf.map((p) => p.unionUnit);
    const mean = avg(us);
    const t42 = computeVdwVolume(RDKit, e.smiles);
    const refNote = t42.status === 'ok' ? `專案 Table 4.2 加總 ${t42.vw.toFixed(2)}` : '專案 Table 4.2 缺基團';
    out(`| ${cell(e.name)} | ${e.kind === 'unit' ? '單元' : '小分子'} | ${e.why} | ${f2(r.perConf[0].book)} | ${f2(mean)} | ${f2(Math.min(...us))}～${f2(Math.max(...us))} | ${refNote}${e.bookNote ? `；${e.bookNote}` : ''}${r.optimized ? '' : '；3D 未經力場最佳化'} |`);
  }
  out();

  // 醚 O 的幾何貢獻 vs 任務 028 反推的 3.66／3.70
  out('## 附：–O–（芳香醚）的幾何貢獻與任務 028 的書中反推值');
  out();
  const derive = (name: string, smiles: string, ref: number, known: number) => {
    const r = geometric(smiles, 'unit');
    if ('error' in r) return `| ${name} | 失敗 | — | — |`;
    const a = r.perConf[0].book as number;
    const mean = avg(r.perConf.map((p) => p.unionUnit));
    return `| ${name} | ${ref}（書中） − ${known.toFixed(2)}（已知基團）＝ ${(ref - known).toFixed(2)} | (a) ${f2(a)} − ${known.toFixed(2)} ＝ ${f2(a - known)} | (b) ${f2(mean)} − ${known.toFixed(2)} ＝ ${f2(mean - known)} |`;
  };
  out('| 聚合物 | 任務 028 反推（Table 4.7 − 已知基團） | 幾何 (a) 單元 − 已知基團 | 幾何 (b) 單元 − 已知基團 |');
  out('|---|---|---|---|');
  out(derive('聚（二甲基苯醚）', '[*:1]Oc1c(C)cc([*:2])cc1C', 69.3, 4 * BOOK.CarExo + 2 * BOOK.CHar + 2 * BOOK.CH3));
  out(derive('聚（二苯基苯醚）', '[*:1]Oc1c(-c2ccccc2)cc([*:2])cc1-c1ccccc1', 133.7, 4 * BOOK.CarExo + 2 * BOOK.CHar + 2 * BOOK.phenyl));
  out();

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(`已寫入 ${OUTPUT}`);
} finally {
  await server.close();
}
