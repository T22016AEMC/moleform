import { describe, expect, it } from 'vitest';
import { CsvError, parseCsv } from '../../src/core/data/csv';
import { splitList } from '../../src/core/data/readers';
import { splitPair } from '../../src/core/data/validate';

describe('parseCsv', () => {
  it('基本解析與 CRLF／LF、檔尾換行', () => {
    expect(parseCsv('a,b\r\n1,2\n3,4\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('去除 BOM', () => {
    expect(parseCsv('﻿a,b\n')).toEqual([['a', 'b']]);
  });

  it('雙引號：欄位內逗號、換行、跳脫引號', () => {
    expect(parseCsv('a,b\n"x,y","line1\nline2","say ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x,y', 'line1\nline2', 'say "hi"'],
    ]);
  });

  it('空欄位與略過空行；引號空字串不是空行', () => {
    expect(parseCsv('a,b,c\n,,\n\n""\n')).toEqual([['a', 'b', 'c'], ['', '', ''], ['']]);
  });

  it('引號未結束會丟出 CsvError', () => {
    expect(() => parseCsv('a,"b\n')).toThrow(CsvError);
  });

  it('引號出現在欄位中間會丟出 CsvError', () => {
    expect(() => parseCsv('a,b"c"\n')).toThrow(CsvError);
  });
});

describe('清單與組合解析', () => {
  it('splitList 以 | 分隔，空字串為空陣列', () => {
    expect(splitList('CCO|CCC')).toEqual(['CCO', 'CCC']);
    expect(splitList('')).toEqual([]);
  });

  it('splitPair 以方括號外的 + 分隔', () => {
    expect(splitPair('CCO+CC(=O)O')).toEqual(['CCO', 'CC(=O)O']);
    expect(splitPair('[NH4+]+CCO')).toEqual(['[NH4+]', 'CCO']);
    expect(splitPair('CCO')).toBeNull();
    expect(splitPair('A+B+C')).toBeNull();
    expect(splitPair('CCO+')).toBeNull();
  });
});
