// 工作台的彈窗把成分存進「我的化合物」（任務 018）。寫入瀏覽器儲存後發出事件，「化合物庫」分頁據此重新讀取，
// 避免它畫面上的舊清單之後覆蓋新存的資料。資料只存在使用者自己的瀏覽器（D23）。
import { addCompound, findDuplicates, type NewCompoundInput } from '../../core/library/library';
import type { Compound } from '../../core/library/types';
import { createIndexedDbStorage, STORAGE_FAILED_MESSAGE, type LibraryStorage } from '../library/storage';

export const LIBRARY_CHANGED_EVENT = 'moleform:library-changed';

export type SaveOutcome =
  | { kind: 'saved'; name: string }
  | { kind: 'duplicate'; names: string }
  | { kind: 'error'; message: string };

/** force 為 true 時，即使庫裡已有相同結構也照樣新增 */
export async function saveCompoundToLibrary(
  input: NewCompoundInput,
  options: { force?: boolean; storage?: LibraryStorage } = {},
): Promise<SaveOutcome> {
  const storage = options.storage ?? createIndexedDbStorage();
  const loaded = await storage.loadAll();
  if (!loaded.ok) return { kind: 'error', message: STORAGE_FAILED_MESSAGE };
  const library: Compound[] = loaded.value;
  const duplicates = findDuplicates(library, input.canonicalSmiles);
  if (duplicates.length > 0 && !options.force) return { kind: 'duplicate', names: duplicates.map((d) => d.name).join('、') };
  const added = addCompound(library, input);
  if (!added.ok) return { kind: 'error', message: added.error };
  const saved = await storage.saveAll([...added.value.library]);
  if (!saved.ok) return { kind: 'error', message: STORAGE_FAILED_MESSAGE };
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(LIBRARY_CHANGED_EVENT));
  return { kind: 'saved', name: added.value.compound.name };
}
