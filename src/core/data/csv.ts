// 小型 CSV 解析器：處理 UTF-8 BOM、雙引號、欄位內逗號與換行（RFC 4180）。純 TypeScript。

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvError';
  }
}

/** 解析 CSV 文字為二維字串陣列。完全空白的行（含檔尾換行）會被略過。 */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldQuoted = false;
  let i = 0;

  const endField = () => {
    record.push(field);
    field = '';
    fieldQuoted = false;
  };
  const endRecord = () => {
    const quoted = fieldQuoted;
    endField();
    // 只有一個未加引號的空欄位 → 空行
    if (!(record.length === 1 && record[0] === '' && !quoted)) records.push(record);
    record = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      if (field !== '' || fieldQuoted) {
        throw new CsvError(`第 ${records.length + 1} 筆記錄：引號出現在欄位中間`);
      }
      inQuotes = true;
      fieldQuoted = true;
      i++;
    } else if (ch === ',') {
      endField();
      i++;
    } else if (ch === '\r' || ch === '\n') {
      endRecord();
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
    } else {
      if (fieldQuoted) {
        throw new CsvError(`第 ${records.length + 1} 筆記錄：引號欄位結束後還有多餘字元`);
      }
      field += ch;
      i++;
    }
  }
  if (inQuotes) throw new CsvError('引號沒有結束');
  if (field !== '' || fieldQuoted || record.length > 0) endRecord();
  return records;
}
