// 產生網站的第三方授權聲明 dist/THIRD-PARTY-NOTICES.txt（OpenChemLib、3Dmol.js 及 3Dmol 的執行期相依套件）。
// 做法參考 packages/ketcher-frame/notices.mjs（Ketcher 的聲明另在 dist/ketcher/）。不提交產物。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const roots = ['openchemlib', '3dmol'];

/** 依 Node 的解析規則找套件目錄：先找依賴者底下巢狀的 node_modules，再往上找。 */
function locate(name, fromDir) {
  for (let dir = fromDir; ; dir = resolve(dir, '..')) {
    const candidate = resolve(dir, 'node_modules', name);
    if (existsSync(resolve(candidate, 'package.json'))) return candidate;
    if (dir === resolve(dir, '..')) throw new Error(`找不到套件 ${name}`);
  }
}

const seen = new Set();
const packages = [];
function collect(name, fromDir) {
  const dir = locate(name, fromDir);
  if (seen.has(dir)) return;
  seen.add(dir);
  const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'));
  packages.push({ dir, pkg });
  for (const dep of Object.keys(pkg.dependencies ?? {})) collect(dep, dir);
}
roots.forEach((name) => collect(name, root));

const sections = [
  '第三方套件聲明（3D 結構功能）\n以下套件隨本網站散布，授權全文取自各套件目錄內的授權檔。套件原始碼未修改。',
];
for (const { dir, pkg } of packages) {
  const files = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(f));
  const license = typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.licenses ?? '詳見套件聲明');
  sections.push(
    `\n${pkg.name}@${pkg.version}\n授權：${license}\n網址：${pkg.homepage ?? pkg.repository?.url ?? ''}\n` +
      (files.length ? files.map((f) => `${f}\n${readFileSync(resolve(dir, f), 'utf8')}`).join('\n') : '（套件內沒有授權檔，授權名稱見上）'),
  );
}

// thermo（MIT）的 Joback SMARTS 轉錄在 src/data/joback_groups.csv；聲明取自根目錄 THIRD_PARTY_NOTICES.md（任務 027）
const thermoNotice = readFileSync(resolve(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
sections.push(`第三方資料來源聲明（Joback 基團的 SMARTS）\n${thermoNotice.slice(thermoNotice.indexOf('## thermo 0.6.1'))}`);

if (!existsSync(resolve(root, 'dist'))) throw new Error('dist/ 不存在，請先執行 vite build');
const notices = sections.join('\n\n');
// 建置後檢查：聲明檔必須含 thermo 與其 MIT 聲明，否則建置失敗
for (const needle of ['thermo 0.6.1', 'Caleb Bell', 'MIT License', 'Permission is hereby granted']) {
  if (!notices.includes(needle)) throw new Error(`THIRD-PARTY-NOTICES.txt 缺少 thermo 聲明（找不到「${needle}」）`);
}
writeFileSync(resolve(root, 'dist', 'THIRD-PARTY-NOTICES.txt'), notices, 'utf8');
console.log(`THIRD-PARTY-NOTICES.txt：${packages.map((p) => `${p.pkg.name}@${p.pkg.version}`).join('、')}`);
