// 化合物庫的匯出與匯入（任務 012）：JSON（完整備份）與 SDF（給其他化學軟體）。
// SMILES 驗證需要 RDKit，所以匯入函式接收呼叫端提供的驗證函式（瀏覽器用 Worker，測試直接用 RDKit）。
import { parseSdf } from '../structure/sdf';
import { newId, sameCompound, validateName, validateNotes } from './library';
import {
  NAME_MAX,
  NOTES_MAX,
  SCHEMA_VERSION,
  type Compound,
  type ImportOutcome,
  type ImportSummary,
  type Library,
  type LibraryFile,
} from './types';

/** 回傳 canonical SMILES；無法解析時回傳 null */
export type Canonicalize = (smiles: string) => Promise<string | null>;

/** 驗證一個 Molfile；成功時回傳 canonical SMILES 與（必要時補上 2D 座標的）Molfile */
export type ValidateMolfile = (
  molfile: string,
) => Promise<{ ok: true; canonicalSmiles: string; molfile: string } | { ok: false; reason: string }>;

// ---------- 略過原因的彙整 ----------

class Reasons {
  private readonly counts = new Map<string, number>();
  add(reason: string): void {
    this.counts.set(reason, (this.counts.get(reason) ?? 0) + 1);
  }
  get total(): number {
    let sum = 0;
    for (const n of this.counts.values()) sum += n;
    return sum;
  }
  list(): string[] {
    return [...this.counts].map(([reason, n]) => (n > 1 ? `${reason} ×${n}` : reason));
  }
}

function emptySummary(): ImportSummary {
  return { added: 0, updated: 0, skipped: 0, reasons: [] };
}

function rejected(library: Library, error: string): ImportOutcome {
  return { ok: false, error, library, summary: emptySummary() };
}

// ---------- JSON ----------

export function exportLibraryJson(library: Library, now: Date = new Date()): string {
  const file: LibraryFile = { schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), compounds: [...library] };
  return JSON.stringify(file, null, 2);
}

const isIso = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));

/** 檢查一列的欄位格式（不含 SMILES 解析）；失敗回傳原因 */
function parseRow(row: unknown): { ok: true; compound: Compound } | { ok: false; reason: string } {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { ok: false, reason: '不是化合物資料' };
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return { ok: false, reason: '缺少 id' };
  if (typeof r.name !== 'string') return { ok: false, reason: '缺少名稱' };
  const name = validateName(r.name);
  if (!name.ok) return { ok: false, reason: `名稱不合規則（1–${NAME_MAX} 字）` };
  if (typeof r.canonicalSmiles !== 'string' || r.canonicalSmiles.trim() === '') return { ok: false, reason: '缺少 SMILES' };
  if (r.molfile != null && typeof r.molfile !== 'string') return { ok: false, reason: 'Molfile 格式錯誤' };
  if (r.notes != null && typeof r.notes !== 'string') return { ok: false, reason: '備註格式錯誤' };
  const notes = validateNotes((r.notes as string | null | undefined) ?? '');
  if (!notes.ok) return { ok: false, reason: `備註超過 ${NOTES_MAX} 字` };
  if (!isIso(r.createdAt) || !isIso(r.updatedAt)) return { ok: false, reason: '時間格式錯誤' };
  return {
    ok: true,
    compound: {
      id: r.id,
      name: name.value,
      canonicalSmiles: r.canonicalSmiles,
      molfile: (r.molfile as string | null | undefined) ?? '',
      notes: notes.value,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    },
  };
}

/**
 * 合併規則：id 已存在且內容相同 → 略過；id 已存在但內容不同 → updatedAt 較新者為準
 * （相同或較舊則保留現有並略過）；id 不存在 → 新增。
 */
function mergeInto(library: Compound[], incoming: Compound, summary: ImportSummary, reasons: Reasons): void {
  const index = library.findIndex((c) => c.id === incoming.id);
  if (index < 0) {
    library.push(incoming);
    summary.added++;
    return;
  }
  const existing = library[index];
  if (sameCompound(existing, incoming)) {
    reasons.add('內容相同');
    return;
  }
  if (Date.parse(incoming.updatedAt) > Date.parse(existing.updatedAt)) {
    library[index] = incoming;
    summary.updated++;
    return;
  }
  reasons.add('內容不同但現有的較新或一樣新');
}

export async function importLibraryJson(library: Library, text: string, canonicalize: Canonicalize): Promise<ImportOutcome> {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return rejected(library, '這不是有效的 JSON 檔案，未匯入任何資料。');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return rejected(library, '檔案格式不是 MoleForm 的化合物庫，未匯入任何資料。');
  }
  const file = data as Record<string, unknown>;
  if (file.schemaVersion !== SCHEMA_VERSION) {
    return rejected(
      library,
      `不認得的資料版本（schemaVersion：${JSON.stringify(file.schemaVersion) ?? '無'}），本程式只支援版本 ${SCHEMA_VERSION}。未匯入任何資料。`,
    );
  }
  if (!Array.isArray(file.compounds)) {
    return rejected(library, '檔案中沒有化合物清單（compounds），未匯入任何資料。');
  }

  const merged = [...library];
  const summary = emptySummary();
  const reasons = new Reasons();
  for (const row of file.compounds as unknown[]) {
    const parsed = parseRow(row);
    if (!parsed.ok) {
      reasons.add(parsed.reason);
      continue;
    }
    const canonical = await canonicalize(parsed.compound.canonicalSmiles);
    if (canonical === null) {
      reasons.add('SMILES 無法解析');
      continue;
    }
    mergeInto(merged, { ...parsed.compound, canonicalSmiles: canonical }, summary, reasons);
  }
  summary.skipped = reasons.total;
  summary.reasons = reasons.list();
  return { ok: true, library: merged, summary };
}

// ---------- SDF ----------

export interface SdfEntry {
  compound: Compound;
  /** 要寫進 SDF 的 Molfile（呼叫端確保有值；沒有圖面時由 SMILES 產生） */
  molfile: string;
}

const oneLine = (text: string) => text.replace(/[\r\n]+/g, ' ').trim();

/** SDF 的資料欄位不能含空行（空行代表欄位結束），所以備註中的空行會被合併 */
const sdfValue = (text: string) => text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '').join('\n');

/** 全部化合物存成一個 SDF：標題列為名稱，另附 MoleForm_Name、MoleForm_Notes 欄位 */
export function exportLibrarySdf(entries: readonly SdfEntry[]): string {
  return entries
    .map(({ compound, molfile }) => {
      const lines = molfile.replace(/\r\n?/g, '\n').replace(/\n*$/, '').split('\n');
      lines[0] = oneLine(compound.name);
      const notes = sdfValue(compound.notes);
      const props = [`> <MoleForm_Name>\n${oneLine(compound.name)}\n`];
      if (notes) props.push(`> <MoleForm_Notes>\n${notes}\n`);
      return `${lines.join('\n')}\n${props.join('\n')}\n$$$$\n`;
    })
    .join('');
}

/** 匯入 SDF：每筆建立一個新的化合物（新 id）；名稱取 MoleForm_Name、標題列，都沒有就用「匯入 N」 */
export async function importLibrarySdf(
  library: Library,
  text: string,
  validate: ValidateMolfile,
  now: Date = new Date(),
): Promise<ImportOutcome> {
  let records;
  try {
    records = parseSdf(text);
  } catch {
    return rejected(library, '無法讀取這個檔案，未匯入任何資料。');
  }
  if (!records.length) return rejected(library, '檔案中沒有任何結構，未匯入任何資料。');

  const merged = [...library];
  const summary = emptySummary();
  const reasons = new Reasons();
  const stamp = now.toISOString();
  for (const record of records) {
    const checked = await validate(record.molblock);
    if (!checked.ok) {
      reasons.add(checked.reason);
      continue;
    }
    const name = [...(record.properties.MoleForm_Name?.trim() || record.name.trim() || `匯入 ${record.index}`)]
      .slice(0, NAME_MAX)
      .join('');
    const notes = [...(record.properties.MoleForm_Notes ?? '')].slice(0, NOTES_MAX).join('');
    merged.push({
      id: newId(),
      name,
      canonicalSmiles: checked.canonicalSmiles,
      molfile: checked.molfile,
      notes,
      createdAt: stamp,
      updatedAt: stamp,
    });
    summary.added++;
  }
  summary.skipped = reasons.total;
  summary.reasons = reasons.list();
  return { ok: true, library: merged, summary };
}
