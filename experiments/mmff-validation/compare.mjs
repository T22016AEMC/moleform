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

// 元素符號取自 mol2 原子型別（例如 C.3、H、Cl）；mol2 的元素符號大小寫混用，統一成首字大寫
const elementOf = (a) => { const e = a.type.split('.')[0]; return e[0].toUpperCase() + e.slice(1).toLowerCase(); };

// 鍵級：1／2／3；am（醯胺）視為單鍵
const bondOrder = (b) => (b.type === 'am' ? 1 : Number(b.type));
const BOND_TYPES = new Set(['1', '2', '3', 'am']);
const SUPPORTED = new Set(['H', 'C', 'N', 'O', 'F', 'Cl', 'Br', 'I', 'S', 'P', 'Si']);
const BASE = new Set(['H', 'C', 'N', 'O', 'F', 'Cl']);

// 由總鍵級推形式電荷（mol2 的 hypervalent 表示法沒有形式電荷欄位，也沒下載 MMFF94.fc_hypervalent）。
// 推不出（不在表內）者回傳 null，整個分子排除；之後還會用「形式電荷總和 = mol2 部分電荷總和的四捨五入」核對。
const CHARGE_BY_VALENCE = {
  H: { 1: 0 },
  C: { 4: 0 },
  N: { 3: 0, 4: 1, 2: -1, 5: 0 },
  O: { 2: 0, 1: -1, 3: 1 },
  F: { 1: 0, 0: -1 },
  Cl: { 1: 0, 0: -1, 3: 0, 5: 0, 7: 0 },
  Br: { 1: 0, 0: -1, 3: 0, 5: 0 },
  I: { 1: 0, 0: -1, 3: 0, 5: 0, 7: 0 },
  S: { 2: 0, 1: -1, 3: 1, 4: 0, 6: 0 },
  P: { 3: 0, 4: 1, 5: 0, 2: -1, 6: -1 },
  Si: { 4: 0 },
};

function formalCharges(mol) {
  const valence = mol.atoms.map(() => 0);
  for (const b of mol.bonds) { valence[b.a] += bondOrder(b); valence[b.b] += bondOrder(b); }
  const charges = mol.atoms.map((a, i) => CHARGE_BY_VALENCE[elementOf(a)]?.[valence[i]]);
  return charges.some((c) => c === undefined) ? null : charges;
}

function toMolfile(mol, charges) {
  const f = (v) => v.toFixed(4).padStart(10);
  const lines = [mol.name, '  mmff-validation', '', `${String(mol.atoms.length).padStart(3)}${String(mol.bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`];
  for (const a of mol.atoms) lines.push(`${f(a.x)}${f(a.y)}${f(a.z)} ${elementOf(a).padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  for (const b of mol.bonds) lines.push(`${String(b.a + 1).padStart(3)}${String(b.b + 1).padStart(3)}${String(bondOrder(b)).padStart(3)}  0`);
  const charged = charges.map((c, i) => [i + 1, c]).filter(([, c]) => c !== 0);
  for (let i = 0; i < charged.length; i += 8) {
    const part = charged.slice(i, i + 8);
    lines.push(`M  CHG${String(part.length).padStart(3)}${part.map(([n, c]) => `${String(n).padStart(4)}${String(c).padStart(4)}`).join('')}`);
  }
  lines.push('M  END');
  return lines.join('\n') + '\n';
}

const GROUPS = {
  A: '中性，只含 C/H/N/O/F/Cl（任務 011 第一次比對的範圍）',
  B: '中性，含 S／P／Si／Br／I',
  C: '離子或兩性離子（有形式電荷；形式電荷由價數推得）',
};

const all = parseMol2(read('MMFF94_hypervalent.mol2'));
const rows = [];
const excludedNames = [];
const excluded = { 無參考能量: 0, 含其他元素或鍵型別: 0, 形式電荷無法推定: 0, 電荷總和不符: 0 };
for (const mol of all) {
  if (!ref.has(mol.name)) { excluded.無參考能量++; continue; }
  if (!mol.atoms.every((a) => SUPPORTED.has(elementOf(a))) || !mol.bonds.every((b) => BOND_TYPES.has(b.type))) { excluded.含其他元素或鍵型別++; excludedNames.push(`${mol.name}（含 ${[...new Set(mol.atoms.map(elementOf))].filter((e) => !SUPPORTED.has(e)).join('、') || '未支援鍵型別'}）`); continue; }
  const charges = formalCharges(mol);
  if (!charges) { excluded.形式電荷無法推定++; excludedNames.push(`${mol.name}（形式電荷無法由價數推定）`); continue; }
  const net = charges.reduce((s, c) => s + c, 0);
  const partial = mol.atoms.reduce((s, a) => s + a.charge, 0);
  if (Math.abs(net - Math.round(partial)) > 0.05 || Math.abs(partial - Math.round(partial)) > 0.05) { excluded.電荷總和不符++; continue; }
  const elements = new Set(mol.atoms.map(elementOf));
  const group = charges.some((c) => c !== 0) ? 'C' : [...elements].every((e) => BASE.has(e)) ? 'A' : 'B';
  const row = { group, name: mol.name, title: titles.get(mol.name) ?? '', atoms: mol.atoms.length, elements: [...elements].sort().join(''), netCharge: net, ref: ref.get(mol.name).optimol };
  try {
    const m = Molecule.fromMolfile(toMolfile(mol, charges));
    const ff = new ForceFieldMMFF94(m, 'MMFF94');
    row.ocl = ff.getTotalEnergy(); // 不呼叫 minimise()
    row.ratio = row.ocl / row.ref;
    row.diff = row.ocl - row.ref;
  } catch (e) {
    row.error = String(e.message ?? e);
  }
  rows.push(row);
}

const fmt = (v, d = 4) => (v === undefined ? '' : v.toFixed(d));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const out = [];
out.push(`mol2 分子數 ${all.length}；納入比對 ${rows.length}；排除：${Object.entries(excluded).map(([k, v]) => `${k} ${v}`).join('、')}`);
out.push(`被排除的分子：${excludedNames.join('、')}`);
for (const g of ['A', 'B', 'C']) {
  const inGroup = rows.filter((r) => r.group === g);
  const ok = inGroup.filter((r) => r.ocl !== undefined);
  const errs = inGroup.filter((r) => r.error);
  out.push('');
  out.push(`## 群組 ${g}：${GROUPS[g]}`);
  out.push(`分子 ${inGroup.length}；成功計算 ${ok.length}；拋錯 ${errs.length}`);
  if (!ok.length) continue;
  const abs = ok.map((r) => Math.abs(r.diff));
  const within = (tol) => ok.filter((r) => Math.abs(r.diff) <= tol).length;
  const ratios = ok.filter((r) => Math.abs(r.ref) > 5).map((r) => r.ratio);
  out.push(`|差異| 中位數 ${fmt(median(abs), 5)}、最大 ${fmt(Math.max(...abs), 5)}；≤0.01：${within(0.01)}、≤0.1：${within(0.1)}、≤1：${within(1)}（共 ${ok.length}）`);
  if (ratios.length) out.push(`|參考值|>5 的比值：中位數 ${fmt(median(ratios), 6)}、最小 ${fmt(Math.min(...ratios), 6)}、最大 ${fmt(Math.max(...ratios), 6)}（n=${ratios.length}）`);
  const bad = ok.filter((r) => Math.abs(r.diff) > 0.01).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  out.push(`差異大於 0.01 kcal/mol 的分子：${bad.length} 個`);
  for (const r of bad.slice(0, 40)) out.push(`- ${r.name} [${r.elements}] 電荷 ${r.netCharge}：參考 ${fmt(r.ref, 3)}，OCL ${fmt(r.ocl, 3)}，差 ${fmt(r.diff, 3)}，比值 ${fmt(r.ratio, 4)}`);
  if (errs.length) out.push('拋錯：\n' + errs.slice(0, 40).map((r) => `- ${r.name} [${r.elements}] 電荷 ${r.netCharge}：${r.error}`).join('\n'));
}
fs.writeFileSync(path.join(here, 'results.md'), out.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(here, 'results.json'), JSON.stringify(rows, null, 1), 'utf8');
console.log(out.join('\n'));
