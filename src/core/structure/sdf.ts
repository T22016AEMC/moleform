// SDF／Molfile 檔案的分筆與組合（Phase 2.4）。純文字處理，不需要 RDKit。

export interface SdfRecord {
  /** 從 1 開始的序號 */
  index: number;
  /** Molfile 第一行（名稱欄），可能是空字串 */
  name: string;
  /** 從標題行到 M  END（含）的 Molfile 文字 */
  molblock: string;
  /** `> <欄位名>` 資料欄位 */
  properties: Record<string, string>;
}

/** 解析 SDF 文字；單一 Molfile（沒有 `$$$$`）會得到一筆。 */
export function parseSdf(text: string): SdfRecord[] {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith('$$$$')) {
      chunks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  chunks.push(current);

  const records: SdfRecord[] = [];
  for (const chunk of chunks) {
    if (!chunk.some((l) => l.trim() !== '')) continue;
    const end = chunk.findIndex((l) => /^M {2}END\b/.test(l));
    const molLines = end >= 0 ? chunk.slice(0, end + 1) : chunk;
    const dataLines = end >= 0 ? chunk.slice(end + 1) : [];
    records.push({
      index: records.length + 1,
      name: (molLines[0] ?? '').trim(),
      molblock: molLines.join('\n') + '\n',
      properties: parseProperties(dataLines),
    });
  }
  return records;
}

function parseProperties(lines: string[]): Record<string, string> {
  const props: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const header = /^>.*<([^>]+)>/.exec(lines[i]);
    if (!header) continue;
    const value: string[] = [];
    for (i++; i < lines.length && lines[i].trim() !== ''; i++) value.push(lines[i]);
    props[header[1]] = value.join('\n');
  }
  return props;
}

/** 列表顯示用的標籤：優先用名稱欄，其次常見的名稱資料欄位，最後用序號。 */
export function sdfRecordLabel(record: SdfRecord): string {
  const named =
    record.name ||
    record.properties['NAME'] ||
    record.properties['Name'] ||
    record.properties['_Name'] ||
    record.properties['ID'] ||
    '';
  const first = named.split('\n')[0].trim();
  return first ? `${record.index}. ${first}` : `${record.index}. （未命名）`;
}

/** 把一份 Molfile 包成單筆 SDF（Molfile 後接 `$$$$`）。 */
export function toSdf(molblock: string): string {
  const body = molblock.replace(/\r\n?/g, '\n').replace(/\n*$/, '\n');
  return `${body}$$$$\n`;
}
