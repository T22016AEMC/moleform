// SDF 分筆與 Molfile 匯出入的行為測試（任務 010）。
import { beforeAll, describe, expect, it } from 'vitest';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { parseSdf, sdfRecordLabel, toSdf } from '../../src/core/structure/sdf';
import { validateStructure } from '../../src/core/structure/validate';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const SMILES = ['CCO', 'C[C@@H](C(=O)O)N', 'C/C=C/C'];

function buildSdf(): string {
  const parts = SMILES.map((smiles, i) => {
    const mol = validateStructure(RDKit, smiles).molblock.split('\n');
    mol[0] = i === 1 ? '' : `mol-${i + 1}`; // 第二筆名稱欄刻意留空
    return `${mol.join('\n').replace(/\n*$/, '\n')}> <ID>\nID-${i + 1}\n\n$$$$\n`;
  });
  return parts.join('');
}

describe('parseSdf', () => {
  it('多筆 SDF 正確分筆，筆數、名稱、資料欄位都對', () => {
    const records = parseSdf(buildSdf());
    expect(records).toHaveLength(3);
    expect(records.map((r) => r.index)).toEqual([1, 2, 3]);
    expect(records.map((r) => r.name)).toEqual(['mol-1', '', 'mol-3']);
    expect(records.map((r) => r.properties.ID)).toEqual(['ID-1', 'ID-2', 'ID-3']);
    for (const r of records) expect(r.molblock.trimEnd().endsWith('M  END')).toBe(true);
  });

  it('每一筆讀回後的 canonical SMILES 與原本一致（含手性與 E/Z）', () => {
    const expected = SMILES.map((s) => validateStructure(RDKit, s).canonicalSmiles);
    const actual = parseSdf(buildSdf()).map((r) => validateStructure(RDKit, r.molblock).canonicalSmiles);
    expect(actual).toEqual(expected);
  });

  it('CRLF 換行與 BOM 也能分筆', () => {
    const text = '﻿' + buildSdf().replace(/\n/g, '\r\n');
    const records = parseSdf(text);
    expect(records).toHaveLength(3);
    expect(validateStructure(RDKit, records[0].molblock).valid).toBe(true);
  });

  it('單一 Molfile（沒有 $$$$）得到一筆', () => {
    const mol = validateStructure(RDKit, 'CCO').molblock;
    const records = parseSdf(mol);
    expect(records).toHaveLength(1);
    expect(validateStructure(RDKit, records[0].molblock).canonicalSmiles).toBe('CCO');
  });

  it('最後一筆沒有 $$$$ 結尾、筆與筆之間有多餘空行也不會多算', () => {
    const mol = validateStructure(RDKit, 'CCO').molblock;
    const text = `${mol}$$$$\n\n\n${mol}`;
    expect(parseSdf(text)).toHaveLength(2);
  });

  it('空檔案或只有空白得到 0 筆', () => {
    expect(parseSdf('')).toEqual([]);
    expect(parseSdf('\n  \n')).toEqual([]);
  });
});

describe('sdfRecordLabel', () => {
  it('有名稱用名稱，沒有名稱用資料欄位，都沒有就標示未命名；一律帶序號', () => {
    const [a, b, c] = parseSdf(buildSdf());
    expect(sdfRecordLabel(a)).toBe('1. mol-1');
    expect(sdfRecordLabel(b)).toBe('2. ID-2');
    expect(sdfRecordLabel(c)).toBe('3. mol-3');
    const bare = parseSdf(validateStructure(RDKit, 'CCO').molblock)[0];
    expect(sdfRecordLabel(bare)).toBe('1. （未命名）');
  });
});

describe('匯出的 Molfile／SDF 再讀回', () => {
  it.each(SMILES)('%s：MOL 讀回後 canonical SMILES 不變', (smiles) => {
    const exported = validateStructure(RDKit, smiles);
    const reread = validateStructure(RDKit, exported.molblock);
    expect(reread.canonicalSmiles).toBe(exported.canonicalSmiles);
  });

  it.each(SMILES)('%s：SDF 是 Molfile 加 $$$$，分筆後讀回不變', (smiles) => {
    const exported = validateStructure(RDKit, smiles);
    const sdf = toSdf(exported.molblock);
    expect(sdf.endsWith('M  END\n$$$$\n')).toBe(true);
    const records = parseSdf(sdf);
    expect(records).toHaveLength(1);
    expect(validateStructure(RDKit, records[0].molblock).canonicalSmiles).toBe(exported.canonicalSmiles);
  });

  it('toSdf 只加一個 $$$$，不重複加換行', () => {
    expect(toSdf('x\nM  END\n\n\n')).toBe('x\nM  END\n$$$$\n');
    expect(toSdf('x\r\nM  END')).toBe('x\nM  END\n$$$$\n');
  });
});
