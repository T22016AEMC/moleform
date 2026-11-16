// Task I02 (D63): assemble the embedded Python engine into desktop/engine-runtime (git-ignored, rebuilt from scratch on every run).
// Layout (becomes resources/engine in the packaged app):
//   python/            official Windows embeddable Python (same version as engine/.venv) + Lib/site-packages (pip --target)
//   moleform_core/, moleform_engine.py   copied from engine/
//   data/              CSV tables copied from src/data (single source, never edited by hand; D18, D22)
//   THIRD-PARTY-LICENSES-ENGINE.txt
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'desktop', 'engine-runtime');
const cache = join(root, 'desktop', 'engine-runtime-cache');
const lock = JSON.parse(readFileSync(join(root, 'scripts', 'embed-python.lock.json'), 'utf8'));
const venvPy = join(root, 'engine', '.venv', 'Scripts', 'python.exe');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`failed: ${cmd} ${args.join(' ')}`);
}
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

// 1. the lock must match the dev environment version (never substitute another version)
if (!existsSync(venvPy)) throw new Error('engine/.venv not found (needed for pip and for the version check)');
const ver = spawnSync(venvPy, ['-c', 'import platform;print(platform.python_version())'], { encoding: 'utf8' }).stdout.trim();
if (ver !== lock.version) throw new Error(`engine/.venv is Python ${ver} but the lock pins ${lock.version}; stop and ask the user`);

// 2. download (cached) + verify the embeddable zip
mkdirSync(cache, { recursive: true });
const zip = join(cache, `python-${lock.version}-embed-amd64.zip`);
if (!existsSync(zip) || sha256(zip) !== lock.sha256) {
  const res = await fetch(lock.url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
}
if (sha256(zip) !== lock.sha256) throw new Error('embeddable Python sha256 mismatch');

// 3. rebuild from scratch (idempotent)
rmSync(out, { recursive: true, force: true });
const py = join(out, 'python');
mkdirSync(py, { recursive: true });
run(join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', py]);
const pth = readdirSync(py).find((f) => f.endsWith('._pth'));
if (!pth) throw new Error('._pth not found');
const zipName = readdirSync(py).find((f) => /^python\d+\.zip$/.test(f));
// ".." lets the engine script's folder (moleform_core, moleform_engine.py) be importable: with a ._pth file Python does not add the script dir.
writeFileSync(join(py, pth), `${zipName}\n.\nLib/site-packages\n..\n`, 'utf8');

// 4. install pinned packages with hashes into site-packages (no venv copy, no bytecode so reruns are identical)
const sp = join(py, 'Lib', 'site-packages');
mkdirSync(sp, { recursive: true });
run(venvPy, ['-m', 'pip', 'install', '--require-hashes', '--no-deps', '--only-binary', ':all:', '--no-compile', '--disable-pip-version-check',
  '--platform', 'win_amd64', '--python-version', '3.12', '--implementation', 'cp', '--abi', 'cp312',
  '--target', sp, '-r', join(root, 'engine', 'requirements.txt')]);

// pip writes console-script launchers (bin/*.exe embeds the build machine's venv path) and RECORD files that list them; neither is needed at runtime, and they make reruns differ.
rmSync(join(sp, 'bin'), { recursive: true, force: true });
for (const d of readdirSync(sp).filter((n) => n.endsWith('.dist-info'))) rmSync(join(sp, d, 'RECORD'), { force: true });

// 5. engine code + data tables
cpSync(join(root, 'engine', 'moleform_core'), join(out, 'moleform_core'), { recursive: true, filter: (s) => !s.includes('__pycache__') });
cpSync(join(root, 'engine', 'moleform_engine.py'), join(out, 'moleform_engine.py'));
const needed = new Set();
for (const f of readdirSync(join(root, 'engine', 'moleform_core'))) {
  if (!f.endsWith('.py')) continue;
  for (const m of readFileSync(join(root, 'engine', 'moleform_core', f), 'utf8').matchAll(/"([A-Za-z0-9_]+\.csv)"/g)) needed.add(m[1]);
}
mkdirSync(join(out, 'data'));
for (const name of [...needed].sort()) {
  const src = join(root, 'src', 'data', name);
  if (!existsSync(src)) throw new Error(`table missing in src/data: ${name}`);
  cpSync(src, join(out, 'data', name));
}

// 6. third-party licenses (text taken from the shipped packages themselves)
let text = 'MoleForm engine runtime - third-party licenses\n\n';
const add = (title, file) => { text += `${'='.repeat(78)}\n${title}\n  (${file})\n${'='.repeat(78)}\n${readFileSync(file, 'utf8')}\n\n`; };
add(`Python ${lock.version} (embeddable package, python.org)`, join(py, 'LICENSE.txt'));
for (const d of readdirSync(sp).filter((n) => n.endsWith('.dist-info')).sort()) {
  const base = join(sp, d);
  const meta = readFileSync(join(base, 'METADATA'), 'utf8');
  const lic = (meta.match(/^License(?:-Expression)?: (.*)$/m) || [])[1] || '';
  text += `${'='.repeat(78)}\n${d.replace('.dist-info', '')}  [${lic}]\n${'='.repeat(78)}\n`;
  const files = [];
  const walk = (dir) => { for (const e of readdirSync(dir)) { const p = join(dir, e); statSync(p).isDirectory() ? walk(p) : /(LICEN[SC]E|COPYING|NOTICE)/i.test(e) && files.push(p); } };
  walk(base);
  const pkgDir = join(sp, d.split('-')[0].toLowerCase());
  for (const extra of ['license.txt', 'LICENSE']) if (existsSync(join(pkgDir, extra))) files.push(join(pkgDir, extra));
  if (!files.length) throw new Error(`no license file found for ${d}`);
  for (const f of [...new Set(files)].sort()) text += `--- ${f.slice(sp.length + 1)} ---\n${readFileSync(f, 'utf8')}\n\n`;
}
writeFileSync(join(out, 'THIRD-PARTY-LICENSES-ENGINE.txt'), text, 'utf8');
console.log(`engine runtime assembled: ${out}`);
