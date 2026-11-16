// 黃金資料的輸入集合：export-remaining.ts（任務 M05）使用。
// 這個檔名不是 export-*.ts，所以 CI 的 `for f in scripts/golden/export-*.ts` 不會把它當匯出程式執行；它只提供輸入，不計算任何物性。
// 依使用者 2026-11-16 的建置規則（D64）：**輸入只取現有測試的輸入與 docs/verification、scripts/verification 的分子與算例，不加額外專屬案例**。
// 分子來源（以 SMILES 去重，保留第一次出現；形似 SMILES 的字串必須能被 RDKit.js 解析才收）：
//   1. 本卡各模組的現有測試：tests/properties/{freeVolume,relativeTg,jobackTbTf,dielectricRefraction,tpsaLogp,tgMixing,tgMn035}.test.ts 與
//      {freeVolumeCases,freeVolumeXlsxRows,jobackCases,dielectricCases}.ts、tests/crosslink/**、tests/polymer/unitFragment.test.ts
//   2. docs/verification/phase6-{TbTf,VW-TPSA-LogP,介電-極化率,自由體積-經驗係數,相對Tg,Tg-混合}-輸出.md 內的 SMILES
//   3. scripts/verification/phase6-*.ts 的分子清單；使用者材料單元（scripts/diagnosis/030-structures.ts）與骨架範本 BT01–BT06（src/data/backbone_templates.csv）
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ROOT } from './common.ts';

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

export interface InputMolecule {
  id: string;
  smiles: string;
}

export interface InputSources {
  parses: (smiles: string) => boolean;
  USER_UNITS: { name: string; smiles: string }[];
  BACKBONE_TEMPLATES: { id: string; unitSmiles: string }[];
}

const QUOTED = /'((?:[^'\\\n]|\\.)*)'/g;
const BACKTICKED = /`([^`\n]+)`/g;

/** 收集分子清單（去重，保留第一次出現）。 */
export function collectMolecules(src: InputSources): InputMolecule[] {
  const molecules: InputMolecule[] = [];
  const seen = new Set<string>();
  const add = (id: string, smiles: string, requireParse: boolean) => {
    if (seen.has(smiles)) return;
    if (requireParse && !src.parses(smiles)) return;
    seen.add(smiles);
    molecules.push({ id, smiles });
  };
  for (const u of src.USER_UNITS) add(`userUnit/${u.name}`, u.smiles, false);
  for (const t of src.BACKBONE_TEMPLATES) add(`BT/${t.id}`, t.unitSmiles, false);
  const sourceFiles: [string, RegExp, boolean][] = [
    ...[
      'freeVolume.test.ts',
      'freeVolumeCases.ts',
      'freeVolumeXlsxRows.ts',
      'relativeTg.test.ts',
      'jobackTbTf.test.ts',
      'jobackCases.ts',
      'dielectricRefraction.test.ts',
      'dielectricCases.ts',
      'tpsaLogp.test.ts',
      'tgMixing.test.ts',
      'tgMn035.test.ts',
    ].map((f) => [join('tests/properties', f), QUOTED, true] as [string, RegExp, boolean]),
    [join('tests/crosslink', 'crosslink.test.ts'), QUOTED, true],
    ...listDir('tests/crosslink/layer1', /\.test\.ts$/).map((f) => [f, QUOTED, true] as [string, RegExp, boolean]),
    [join('tests/polymer', 'unitFragment.test.ts'), QUOTED, true],
    ...listDir('docs/verification', /^phase6-(TbTf|VW-TPSA-LogP|介電-極化率|自由體積-經驗係數|相對Tg|Tg-混合)-輸出\.md$/).map((f) => [f, BACKTICKED, false] as [string, RegExp, boolean]),
    ...listDir('scripts/verification', /^phase6-.*\.ts$/).map((f) => [f, QUOTED, true] as [string, RegExp, boolean]),
  ];
  for (const [file, pattern, unescape] of sourceFiles) {
    const rel = relative(ROOT, resolve(ROOT, file)).replace(/\\/g, '/');
    let n = 0;
    for (const smiles of candidates(resolve(ROOT, file), pattern, unescape)) add(`${rel}#${++n}`, smiles, true);
  }
  return molecules;
}
