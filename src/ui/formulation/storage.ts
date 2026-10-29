// 「我的配方」的瀏覽器儲存（任務 014）：另一個 IndexedDB 資料庫（moleform-formulations），
// 不動到化合物庫（moleform-library）的任何資料。寫法與 src/ui/library/storage.ts 相同：所有操作都不拋錯，
// 失敗（無痕、封鎖網站資料、空間不足）時回傳 { ok: false }。資料只存在這個瀏覽器（D23）。
import type { SavedFormulation } from '../../core/formulation/library';
import type { StorageResult } from '../library/storage';

export interface FormulationStorage {
  loadAll(): Promise<StorageResult<SavedFormulation[]>>;
  /** 以傳入的清單取代儲存的全部內容 */
  saveAll(items: readonly SavedFormulation[]): Promise<StorageResult<void>>;
  getLastExport(): Promise<StorageResult<string | null>>;
  setLastExport(iso: string): Promise<StorageResult<void>>;
}

const DB_NAME = 'moleform-formulations';
const DB_VERSION = 1;
const ITEMS = 'formulations';
const META = 'meta';
const LAST_EXPORT_KEY = 'lastExport';

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 請求失敗'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 交易失敗'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 交易中止（可能空間不足）'));
  });
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('無法開啟 IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB 被其他分頁封鎖'));
  });
}

/** factory 預設為瀏覽器的 indexedDB；測試可傳入假的實作 */
export function createFormulationIndexedDbStorage(factory?: IDBFactory | undefined): FormulationStorage {
  let opening: Promise<IDBDatabase> | null = null;

  const database = (): Promise<IDBDatabase> => {
    if (!opening) {
      let idb: IDBFactory | undefined = factory;
      try {
        idb = factory ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB);
      } catch {
        idb = undefined; // 部分瀏覽器在封鎖網站資料時，讀取 indexedDB 本身就會拋錯
      }
      opening = idb ? openDatabase(idb) : Promise.reject(new Error('這個瀏覽器環境沒有 IndexedDB'));
      opening.catch(() => {
        opening = null; // 失敗後允許下次重試
      });
    }
    return opening;
  };

  async function run<T>(work: (db: IDBDatabase) => Promise<T>): Promise<StorageResult<T>> {
    try {
      return { ok: true, value: await work(await database()) };
    } catch (e) {
      return { ok: false, error: describe(e) };
    }
  }

  return {
    loadAll: () =>
      run(async (db) => (await requestResult(db.transaction(ITEMS, 'readonly').objectStore(ITEMS).getAll())) as SavedFormulation[]),
    saveAll: (items) =>
      run(async (db) => {
        const tx = db.transaction(ITEMS, 'readwrite');
        const store = tx.objectStore(ITEMS);
        store.clear();
        for (const item of items) store.put(item);
        await transactionDone(tx);
      }),
    getLastExport: () =>
      run(async (db) => {
        const value = await requestResult(db.transaction(META, 'readonly').objectStore(META).get(LAST_EXPORT_KEY));
        return typeof value === 'string' ? value : null;
      }),
    setLastExport: (iso) =>
      run(async (db) => {
        const tx = db.transaction(META, 'readwrite');
        tx.objectStore(META).put(iso, LAST_EXPORT_KEY);
        await transactionDone(tx);
      }),
  };
}

/** 記憶體版本（測試用；也可模擬失敗） */
export function createFormulationMemoryStorage(options: { failing?: boolean } = {}): FormulationStorage {
  let items: SavedFormulation[] = [];
  let lastExport: string | null = null;
  const fail = <T>(): StorageResult<T> => ({ ok: false, error: '模擬的儲存失敗' });
  return {
    loadAll: async () => (options.failing ? fail() : { ok: true, value: structuredClone(items) }),
    saveAll: async (next) => {
      if (options.failing) return fail();
      items = structuredClone([...next]);
      return { ok: true, value: undefined };
    },
    getLastExport: async () => (options.failing ? fail() : { ok: true, value: lastExport }),
    setLastExport: async (iso) => {
      if (options.failing) return fail();
      lastExport = iso;
      return { ok: true, value: undefined };
    },
  };
}
