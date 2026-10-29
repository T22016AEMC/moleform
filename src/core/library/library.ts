// 化合物庫的純函式（任務 012）。每個函式回傳新的陣列，不修改傳入的資料，Node 即可測試。
import { parsePolymerSpec } from '../polymer/convert';
import type { PolymerSpec } from '../polymer/types';
import { NAME_MAX, NOTES_MAX, type Compound, type Library } from './types';

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateName(name: string): Validated<string> {
  const trimmed = name.trim();
  if (trimmed === '') return { ok: false, error: '請輸入名稱' };
  if ([...trimmed].length > NAME_MAX) return { ok: false, error: `名稱最多 ${NAME_MAX} 字` };
  return { ok: true, value: trimmed };
}

export function validateNotes(notes: string): Validated<string> {
  if ([...notes].length > NOTES_MAX) return { ok: false, error: `備註最多 ${NOTES_MAX} 字` };
  return { ok: true, value: notes };
}

export function newId(): string {
  // randomUUID 只在安全環境（HTTPS、localhost）可用；退路用隨機數
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export interface NewCompoundInput {
  name: string;
  canonicalSmiles: string;
  molfile?: string;
  notes?: string;
  /** 聚合物設定；有值時 canonicalSmiles 必須含連接點 `*` */
  polymer?: PolymerSpec;
}

function checkPolymer(polymer: PolymerSpec | undefined, smiles: string): Validated<PolymerSpec | undefined> {
  if (polymer === undefined) return { ok: true, value: undefined };
  const parsed = parsePolymerSpec(polymer);
  if (!parsed.ok) return { ok: false, error: parsed.reason };
  if (!smiles.includes('*')) return { ok: false, error: '聚合物的重複單元需要連接點（*）' };
  return { ok: true, value: parsed.spec };
}

/** 新增一筆；名稱或備註不合規則時回傳錯誤 */
export function addCompound(
  library: Library,
  input: NewCompoundInput,
  now: Date = new Date(),
  id: string = newId(),
): Validated<{ library: Library; compound: Compound }> {
  const name = validateName(input.name);
  if (!name.ok) return name;
  const notes = validateNotes(input.notes ?? '');
  if (!notes.ok) return notes;
  if (input.canonicalSmiles.trim() === '') return { ok: false, error: '沒有可儲存的結構' };
  const polymer = checkPolymer(input.polymer, input.canonicalSmiles);
  if (!polymer.ok) return polymer;
  if (library.some((c) => c.id === id)) return { ok: false, error: '編號重複' };
  const stamp = now.toISOString();
  const compound: Compound = {
    id,
    name: name.value,
    canonicalSmiles: input.canonicalSmiles,
    molfile: input.molfile ?? '',
    notes: notes.value,
    ...(polymer.value ? { polymer: polymer.value } : {}),
    createdAt: stamp,
    updatedAt: stamp,
  };
  return { ok: true, value: { library: [...library, compound], compound } };
}

function updateOne(
  library: Library,
  id: string,
  change: (c: Compound) => Compound,
): Validated<Library> {
  if (!library.some((c) => c.id === id)) return { ok: false, error: '找不到這筆化合物' };
  return { ok: true, value: library.map((c) => (c.id === id ? change(c) : c)) };
}

export function renameCompound(library: Library, id: string, name: string, now: Date = new Date()): Validated<Library> {
  const checked = validateName(name);
  if (!checked.ok) return checked;
  return updateOne(library, id, (c) => ({ ...c, name: checked.value, updatedAt: now.toISOString() }));
}

export function editNotes(library: Library, id: string, notes: string, now: Date = new Date()): Validated<Library> {
  const checked = validateNotes(notes);
  if (!checked.ok) return checked;
  return updateOne(library, id, (c) => ({ ...c, notes: checked.value, updatedAt: now.toISOString() }));
}

/** 修改聚合物的 Mn 或 DP；只能用在已經是聚合物的化合物 */
export function editPolymer(library: Library, id: string, polymer: PolymerSpec, now: Date = new Date()): Validated<Library> {
  const target = library.find((c) => c.id === id);
  if (!target) return { ok: false, error: '找不到這筆化合物' };
  const checked = checkPolymer(polymer, target.canonicalSmiles);
  if (!checked.ok) return checked;
  return updateOne(library, id, (c) => ({ ...c, polymer: checked.value, updatedAt: now.toISOString() }));
}

export function removeCompound(library: Library, id: string): Library {
  return library.filter((c) => c.id !== id);
}

/** 以名稱或 SMILES 搜尋：不分大小寫、部分符合；空字串回傳全部 */
export function searchCompounds(library: Library, query: string): Compound[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...library];
  return library.filter((c) => c.name.toLowerCase().includes(q) || c.canonicalSmiles.toLowerCase().includes(q));
}

/** 依 canonical SMILES 找已存在的化合物（完全相同才算重複） */
export function findDuplicates(library: Library, canonicalSmiles: string): Compound[] {
  return library.filter((c) => c.canonicalSmiles === canonicalSmiles);
}

export type SortKey = 'name' | 'updated';

/** 名稱：由小到大（依語系）；時間：最近更新的在前 */
export function sortCompounds(library: readonly Compound[], key: SortKey): Compound[] {
  const copy = [...library];
  if (key === 'name') return copy.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  return copy.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

/** 兩筆內容是否相同（比較所有欄位） */
export function sameCompound(a: Compound, b: Compound): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.canonicalSmiles === b.canonicalSmiles &&
    a.molfile === b.molfile &&
    a.notes === b.notes &&
    a.polymer?.mnInput === b.polymer?.mnInput &&
    a.polymer?.dpInput === b.polymer?.dpInput &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt
  );
}

/** 本機日期 YYYYMMDD（檔名用） */
export function dateStamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
}

/** 本機日期 YYYY-MM-DD（畫面用） */
export function displayDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
