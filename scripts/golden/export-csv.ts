// 黃金資料：CSV 讀取（src/core/data/csv.ts 的 parseCsv、src/core/data/readers.ts 的 splitList 與四個資料表讀取器）（任務 M00）。
// 案例：tests/data/csv.test.ts 的輸入、邊界情況、src/data/*.csv 全部實際檔案的 parseCsv 結果、
//       四個資料表讀取器（標題列核對、欄位數、數字與整數清單轉換；D22 缺欄位報錯）。
// readTable 的案例把 TableDef 一併放在 input，Python 端用同一份欄位定義（不在 Python 另抄一份）。
// 執行：node scripts/golden/export-csv.ts
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, rdkitjsVersion, withVite, writeGolden, type GoldenCase } from './common.ts';

const PARSE_INPUTS: [string, string][] = [
  // tests/data/csv.test.ts
  ['test:crlf-lf', 'a,b\r\n1,2\n3,4\r\n'],
  ['test:bom', '﻿a,b\n'],
  ['test:quotes', 'a,b\n"x,y","line1\nline2","say ""hi"""\n'],
  ['test:empty-fields', 'a,b,c\n,,\n\n""\n'],
  ['test:unterminated-quote', 'a,"b\n'],
  ['test:quote-mid-field', 'a,b"c"\n'],
  // 邊界情況
  ['edge:empty', ''],
  ['edge:only-newlines', '\n\r\n\r'],
  ['edge:cr-only', 'a,b\r1,2\r'],
  ['edge:no-trailing-newline', 'a,b\n1,2'],
  ['edge:trailing-comma', 'a,b,\n1,2,\n'],
  ['edge:single-comma', ','],
  ['edge:quoted-crlf', '"a\r\nb",c\r\n'],
  ['edge:quoted-empty-then-text', '"",x\n'],
  ['edge:text-after-quote', '"ab"c,d\n'],
  ['edge:quote-after-quote', '"a""",b\n'],
  ['edge:second-record-error', 'a\n\nb\nc"d"\n'],
  ['edge:whitespace-kept', ' a , b \n'],
  ['edge:bom-only', '﻿'],
  ['edge:inner-bom-kept', 'a,﻿b\n'],
  ['edge:unicode', '名稱,值\n苯,𝟙\n'],
  ['edge:unterminated-at-eof', '"abc'],
];

const SPLIT_INPUTS = ['CCO|CCC', '', '   ', ' a | b |', '|', 'a||b', '　x　|﻿y', 'single'];

await withVite(async (server) => {
  const { parseCsv } = await server.ssrLoadModule('/src/core/data/csv.ts');
  const readers = await server.ssrLoadModule('/src/core/data/readers.ts');
  const types = await server.ssrLoadModule('/src/core/data/types.ts');

  const run = (fn: () => unknown) => {
    try {
      return { value: fn() };
    } catch (e) {
      const err = e as Error;
      return { error: { name: err.name, message: err.message } };
    }
  };

  const cases: GoldenCase[] = [];
  for (const [id, text] of PARSE_INPUTS) cases.push({ id: `parseCsv/${id}`, input: { fn: 'parseCsv', text }, output: run(() => parseCsv(text)) });

  const dataDir = resolve(ROOT, 'src', 'data');
  for (const file of readdirSync(dataDir).filter((f) => f.endsWith('.csv')).sort()) {
    // 以 Node 讀到的原始文字為輸入（放進黃金檔，避免換行轉換造成兩邊讀到不同文字）
    const text = readFileSync(resolve(dataDir, file), 'utf8');
    cases.push({ id: `parseCsv/data:${file}`, input: { fn: 'parseCsv', text }, output: run(() => parseCsv(text)) });
  }

  for (const [i, value] of SPLIT_INPUTS.entries()) {
    cases.push({ id: `splitList/${i}`, input: { fn: 'splitList', value }, output: run(() => readers.splitList(value)) });
  }

  const tables: [string, string, (text: string) => unknown][] = [
    ['FUNCTIONAL_GROUPS_TABLE', 'functional_groups.csv', readers.readFunctionalGroups],
    ['REACTION_RULES_TABLE', 'reaction_rules.csv', readers.readReactionRules],
    ['GROUP_CONTRIBUTIONS_TABLE', 'group_contributions.csv', readers.readGroupContributions],
    ['SOLVENTS_TABLE', 'solvents.csv', readers.readSolvents],
  ];
  for (const [defName, file, reader] of tables) {
    const table = types[defName] as { file: string; columns: { name: string; kind: string }[] };
    const header = table.columns.map((c) => c.name).join(',');
    const width = table.columns.length;
    const blank = Array<string>(width).fill('');
    const rowWith = (overrides: Record<string, string>) =>
      table.columns.map((c, i) => (c.name in overrides ? overrides[c.name] : blank[i])).map((v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',');
    const numberCol = table.columns.find((c) => c.kind === 'number')?.name;
    const intListCol = table.columns.find((c) => c.kind === 'intList')?.name;
    const listCol = table.columns.find((c) => c.kind === 'list')?.name;
    const stringCol = table.columns.find((c) => c.kind === 'string')!.name;

    const texts: [string, string][] = [
      ['real', readFileSync(resolve(dataDir, file), 'utf8')],
      ['empty-file', ''],
      ['header-missing-column', `${table.columns.slice(0, -1).map((c) => c.name).join(',')}\n`],
      ['header-renamed', `${header.replace(stringCol, `${stringCol}_x`)}\n`],
      ['header-only', `${header}\n`],
      ['row-too-short', `${header}\n${blank.slice(1).join(',')}\n`],
      ['row-too-long', `${header}\n${[...blank, 'extra'].join(',')}\n`],
      ['bad-csv', `${header}\n"unterminated\n`],
      ['string-trim', `${header}\n${rowWith({ [stringCol]: ' 　 value  ' })}\n`],
    ];
    if (numberCol) {
      for (const [k, v] of [
        ['ok', ' 1.5e3 '], ['hex', '0x1F'], ['bin', '0b101'], ['oct', '0o17'], ['dot', '.5'], ['trailing-dot', '5.'],
        ['plus', '+7'], ['neg-zero', '-0'], ['underscore', '1_000'], ['nan', 'NaN'], ['inf', 'Infinity'], ['inf-lower', 'inf'],
        ['overflow', '1e400'], ['tiny', '1e-400'], ['text', 'abc'], ['comma', '1,5'], ['fullwidth', '１２'], ['many-digits', '0.1000000000000000055511151231257827'],
        ['neg-hex', '-0x10'], ['exp-only', '1e'], ['big-int', '9007199254740993'],
      ] as const) {
        texts.push([`number-${k}`, `${header}\n${rowWith({ [numberCol]: v })}\n`]);
      }
    }
    if (intListCol) {
      for (const [k, v] of [['ok', '1|2| 3 '], ['empty', ''], ['bad', '1|x|-2|2.0'], ['fullwidth', '１'], ['leading-zero', '007'], ['trailing-newline-token', '1\n|2']] as const) {
        texts.push([`intList-${k}`, `${header}\n${rowWith({ [intListCol]: v })}\n`]);
      }
    }
    if (listCol) texts.push(['list-values', `${header}\n${rowWith({ [listCol]: ' a | b ||c ' })}\n`]);
    for (const [k, text] of texts) {
      cases.push({ id: `readTable/${defName}/${k}`, input: { fn: 'readTable', table, text }, output: run(() => reader(text)) });
    }
  }

  writeGolden('csv', await rdkitjsVersion(server), cases);
});
