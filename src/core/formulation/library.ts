// 「我的配方」的資料模型與純函式（任務 014）：儲存、另存、改名、刪除、搜尋、JSON 匯出入與合併。
// 每筆配方內含各成分的 canonical SMILES 與 Molfile（若有），不依賴化合物庫也能完整還原。
import { newId, validateName, type Validated } from '../library/library';
import type { ImportSummary } from '../library/types';
import { parseFormulationData } from './serialize';
import type { Formulation } from './types';

export const FORMULATION_LIBRARY_SCHEMA_VERSION = 1;

export interface SavedFormulation {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  formulation: Formulation;
}

export type FormulationLibrary = readonly SavedFormulation[];

export interface FormulationLibraryFile {
  schemaVersion: number;
  exportedAt: string;
  formulations: SavedFormulation[];
}

export interface FormulationImportOutcome {
  ok: boolean;
  error?: string;
  library: FormulationLibrary;
  summary: ImportSummary;
}

/** 儲存：給 id 時覆蓋該筆（保留建立時間），沒有 id（或找不到）時新增 */
export function saveFormulation(
  library: FormulationLibrary,
  formulation: Formulation,
  id?: string,
  now: Date = new Date(),
): Validated<{ library: FormulationLibrary; saved: SavedFormulation }> {
  const name = validateName(formulation.name);
  if (!name.ok) return name;
  const stamp = now.toISOString();
  const content: Formulation = { ...formulation, name: name.value };
  const existing = id ? library.find((f) => f.id === id) : undefined;
  if (existing) {
    const saved: SavedFormulation = { ...existing, name: name.value, updatedAt: stamp, formulation: content };
    return { ok: true, value: { library: library.map((f) => (f.id === existing.id ? saved : f)), saved } };
  }
  const saved: SavedFormulation = { id: newId(), name: name.value, createdAt: stamp, updatedAt: stamp, formulation: content };
  return { ok: true, value: { library: [...library, saved], saved } };
}

/** 另存：一律新增一筆 */
export function saveFormulationAs(library: FormulationLibrary, formulation: Formulation, now: Date = new Date()) {
  return saveFormulation(library, formulation, undefined, now);
}

export function renameFormulation(library: FormulationLibrary, id: string, name: string, now: Date = new Date()): Validated<FormulationLibrary> {
  const checked = validateName(name);
  if (!checked.ok) return checked;
  if (!library.some((f) => f.id === id)) return { ok: false, error: '找不到這筆配方' };
  return {
    ok: true,
    value: library.map((f) =>
      f.id === id ? { ...f, name: checked.value, updatedAt: now.toISOString(), formulation: { ...f.formulation, name: checked.value } } : f,
    ),
  };
}

export function removeFormulation(library: FormulationLibrary, id: string): FormulationLibrary {
  return library.filter((f) => f.id !== id);
}

/** 以配方名稱搜尋：不分大小寫、部分符合；空字串回傳全部 */
export function searchFormulations(library: FormulationLibrary, query: string): SavedFormulation[] {
  const q = query.trim().toLowerCase();
  return q === '' ? [...library] : library.filter((f) => f.name.toLowerCase().includes(q));
}

// ---------- JSON ----------

export function exportFormulationsJson(library: FormulationLibrary, ids?: readonly string[], now: Date = new Date()): string {
  const chosen = ids ? library.filter((f) => ids.includes(f.id)) : [...library];
  const file: FormulationLibraryFile = {
    schemaVersion: FORMULATION_LIBRARY_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    formulations: chosen,
  };
  return JSON.stringify(file, null, 2);
}

const isIso = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
/** 鍵的順序固定後再比較（讀回的物件鍵順序可能不同）；NaN 與 null 視為相同 */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return v;
  });
}
const sameSaved = (a: SavedFormulation, b: SavedFormulation) => stable(a) === stable(b);

function parseRow(row: unknown): { ok: true; saved: SavedFormulation } | { ok: false; reason: string } {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { ok: false, reason: '不是配方資料' };
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') return { ok: false, reason: '缺少 id' };
  if (typeof r.name !== 'string') return { ok: false, reason: '缺少名稱' };
  const name = validateName(r.name);
  if (!name.ok) return { ok: false, reason: '名稱不合規則（1–100 字）' };
  if (!isIso(r.createdAt) || !isIso(r.updatedAt)) return { ok: false, reason: '時間格式錯誤' };
  const parsed = parseFormulationData(r.formulation);
  if (!parsed.ok) return { ok: false, reason: `配方內容錯誤：${parsed.error}` };
  return { ok: true, saved: { id: r.id, name: name.value, createdAt: r.createdAt, updatedAt: r.updatedAt, formulation: parsed.formulation } };
}

/** 合併規則比照化合物庫：id 相同且內容相同 → 略過；內容不同 → updatedAt 較新者為準；id 不存在 → 新增 */
export function importFormulationsJson(library: FormulationLibrary, text: string): FormulationImportOutcome {
  const reject = (error: string): FormulationImportOutcome => ({
    ok: false,
    error,
    library,
    summary: { added: 0, updated: 0, skipped: 0, reasons: [] },
  });
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return reject('這不是有效的 JSON 檔案，未匯入任何資料。');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return reject('檔案格式不是 MoleForm 的配方庫，未匯入任何資料。');
  const file = data as Record<string, unknown>;
  if (file.schemaVersion !== FORMULATION_LIBRARY_SCHEMA_VERSION) {
    return reject(
      `不認得的資料版本（schemaVersion：${JSON.stringify(file.schemaVersion) ?? '無'}），本程式只支援版本 ${FORMULATION_LIBRARY_SCHEMA_VERSION}。未匯入任何資料。`,
    );
  }
  if (!Array.isArray(file.formulations)) return reject('檔案中沒有配方清單（formulations），未匯入任何資料。');

  const merged = [...library];
  const counts = new Map<string, number>();
  const skip = (reason: string) => counts.set(reason, (counts.get(reason) ?? 0) + 1);
  let added = 0;
  let updated = 0;
  for (const row of file.formulations as unknown[]) {
    const parsed = parseRow(row);
    if (!parsed.ok) {
      skip(parsed.reason);
      continue;
    }
    const index = merged.findIndex((f) => f.id === parsed.saved.id);
    if (index < 0) {
      merged.push(parsed.saved);
      added++;
    } else if (sameSaved(merged[index], parsed.saved)) {
      skip('內容相同');
    } else if (Date.parse(parsed.saved.updatedAt) > Date.parse(merged[index].updatedAt)) {
      merged[index] = parsed.saved;
      updated++;
    } else {
      skip('內容不同但現有的較新或一樣新');
    }
  }
  const reasons = [...counts].map(([reason, n]) => (n > 1 ? `${reason} ×${n}` : reason));
  const skipped = [...counts.values()].reduce((s, n) => s + n, 0);
  return { ok: true, library: merged, summary: { added, updated, skipped, reasons } };
}
