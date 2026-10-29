// 任務 011 C-11：以 MMFF94 官方驗證資料集確認 OpenChemLib 的 MMFF94 能量單位（K08）。
// 用資料集提供的座標，不做最佳化，直接算 OpenChemLib 能量，與 MMFF94.energies 的參考值（kcal/mol）比對。
// 原始資料檔在 data/（已加入 .gitignore，需自行下載，見 README.md）。這個腳本不接入正式程式碼。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Molecule, ForceFieldMMFF94, Resources } from 'openchemlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, 'data');
const read = (f) => fs.readFileSync(path.join(dataDir, f), 'utf8').replace(/\r/g, '');

Resources.registerFromNodejs();

// ---- 參考能量（OPTIMOL 欄）----
const ref = new Map();
for (const line of read('MMFF94.energies').split('\n')) {
  const m = line.match(/^(\S+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)/);
  if (m) ref.set(m[1], { optimol: Number(m[2]), batchmin: Number(m[3]) });
}
const titles = new Map();
for (const line of read('MMFF94.titles').split('\n')) {
  const i = line.indexOf(':');
  if (i > 0) titles.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
}

// ---- 解析 mol2 ----
const SYMBOL_TO_Z = { H: 1, C: 6, N: 7, O: 8, F: 9, Cl: 17, S: 16, P: 15, Br: 35, I: 53, Si: 14 };
function parseMol2(text) {
  const mols = [];
  for (const chunk of text.split('@<TRIPOS>MOLECULE').slice(1)) {
    const name = chunk.split('\n')[1].trim();
    const section = (tag) => {
      const m = chunk.split(`@<TRIPOS>${tag}`)[1];
      if (!m) return [];
      return m.split('@<TRIPOS>')[0].split('\n').filter((l) => l.trim());
    };
    const atoms = section('ATOM').map((l) => {
      const t = l.trim().split(/\s+/);
      return { name: t[1], x: +t[2], y: +t[3], z: +t[4], type: t[5], charge: +t[8] };
    });
    const bonds = section('BOND').map((l) => {
      const t = l.trim().split(/\s+/);
      return { a: +t[1] - 1, b: +t[2] - 1, type: t[3] };
    });
    mols.push({ name, atoms, bonds });
  }
  return mols;
}

// 元素符號取自 mol2 原子型別（例如 C.3、H、Cl）
const elementOf = (a) => a.type.split('.')[0];

function toMolfile(mol) {
  const f = (v) => v.toFixed(4).padStart(10);
  const lines = [mol.name, '  mmff-validation', '', `${String(mol.atoms.length).padStart(3)}${String(mol.bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`];
  for (const a of mol.atoms) lines.push(`${f(a.x)}${f(a.y)}${f(a.z)} ${elementOf(a).padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  for (const b of mol.bonds) lines.push(`${String(b.a + 1).padStart(3)}${String(b.b + 1).padStart(3)}${String(b.type).padStart(3)}  0`);
  lines.push('M  END');
  return lines.join('\n') + '\n';
}

// 先只挑「中性、只含 C/H/N/O/F/Cl/S、沒有芳香鍵型別、價數正常」的分子，避免把離子表示法差異誤判為單位問題
function isSimpleNeutral(mol) {
  const allowed = new Set(['H', 'C', 'N', 'O', 'F', 'Cl']);
  if (!mol.atoms.every((a) => allowed.has(elementOf(a)))) return false;
  if (mol.bonds.some((b) => !['1', '2', '3'].includes(b.type))) return false;
  const sum = mol.atoms.reduce((s, a) => s + a.charge, 0);
  if (Math.abs(sum) > 0.01) return false;
  const valence = mol.atoms.map(() => 0);
  for (const b of mol.bonds) { valence[b.a] += +b.type; valence[b.b] += +b.type; }
  const max = { H: 1, C: 4, N: 3, O: 2, F: 1, Cl: 1 };
  // 中性且價數飽和：每個原子的總鍵級等於其標準價數（排除銨、羧酸根、硝基等電荷表示法）
  return mol.atoms.every((a, i) => valence[i] === max[elementOf(a)]);
}

const all = parseMol2(read('MMFF94_hypervalent.mol2'));
const rows = [];
let skipped = 0;
for (const mol of all) {
  if (!ref.has(mol.name)) continue;
  if (!isSimpleNeutral(mol)) { skipped++; continue; }
  const row = { name: mol.name, title: titles.get(mol.name) ?? '', atoms: mol.atoms.length, ref: ref.get(mol.name).optimol };
  try {
    const m = Molecule.fromMolfile(toMolfile(mol));
    const ff = new ForceFieldMMFF94(m, 'MMFF94');
    row.ocl = ff.getTotalEnergy(); // 不呼叫 minimise()
    row.ratio = row.ocl / row.ref;
    row.diff = row.ocl - row.ref;
  } catch (e) {
    row.error = String(e.message ?? e);
  }
  rows.push(row);
}

const ok = rows.filter((r) => r.ocl !== undefined);
const fmt = (v, d = 4) => (v === undefined ? '' : v.toFixed(d));
const out = [];
out.push(`mol2 分子數 ${all.length}；有參考能量且通過「中性簡單分子」篩選 ${rows.length}（排除 ${skipped} 個）；成功計算 ${ok.length}，拋錯 ${rows.length - ok.length}`);
out.push('');
out.push('| 分子 | 名稱 | 原子數 | 參考值 (kcal/mol) | OpenChemLib 值 | 差異 | 比值 |');
out.push('|---|---|---|---|---|---|---|');
for (const r of ok.slice(0, 40)) out.push(`| ${r.name} | ${r.title.slice(0, 40)} | ${r.atoms} | ${fmt(r.ref, 5)} | ${fmt(r.ocl, 5)} | ${fmt(r.diff, 5)} | ${fmt(r.ratio, 6)} |`);
const abs = ok.map((r) => Math.abs(r.diff)).sort((a, b) => a - b);
const within = (t) => ok.filter((r) => Math.abs(r.diff) <= t).length;
out.push('');
out.push(`|差異| 中位數 ${fmt(abs[Math.floor(abs.length / 2)])}、最大 ${fmt(abs[abs.length - 1])}；≤0.01：${within(0.01)}/${ok.length}、≤0.1：${within(0.1)}/${ok.length}、≤1：${within(1)}/${ok.length}`);
const ratios = ok.filter((r) => Math.abs(r.ref) > 5).map((r) => r.ratio).sort((a, b) => a - b);
out.push(`|參考值|>5 的比值：中位數 ${fmt(ratios[Math.floor(ratios.length / 2)], 6)}、最小 ${fmt(ratios[0], 6)}、最大 ${fmt(ratios[ratios.length - 1], 6)}（n=${ratios.length}）`);
const bad = ok.filter((r) => Math.abs(r.diff) > 1);
out.push('');
out.push(`差異大於 1 的分子：${bad.length} 個` + (bad.length ? '\n' + bad.slice(0, 15).map((r) => `- ${r.name} ${r.title.slice(0, 40)}：參考 ${fmt(r.ref, 3)}，OCL ${fmt(r.ocl, 3)}，比值 ${fmt(r.ratio, 4)}`).join('\n') : ''));
if (rows.length - ok.length) out.push('\n拋錯：\n' + rows.filter((r) => r.error).slice(0, 10).map((r) => `- ${r.name}: ${r.error}`).join('\n'));
fs.writeFileSync(path.join(here, 'results.md'), out.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(here, 'results.json'), JSON.stringify(rows, null, 1), 'utf8');
console.log(out.join('\n'));
