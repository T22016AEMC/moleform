// 化合物庫的瀏覽器儲存（任務 012）：IndexedDB 的簡單包裝，不使用套件。
// 所有操作都不會拋出錯誤：失敗（無痕模式、使用者封鎖網站資料、空間不足）時回傳 { ok: false }，
// 由畫面顯示提醒，其他功能照常運作。資料只存在這個瀏覽器（D23）。
import type { Compound } from '../../core/library/types';

export type StorageResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface LibraryStorage {
  loadAll(): Promise<StorageResult<Compound[]>>;
  /** 以傳入的清單取代儲存的全部內容 */
  saveAll(compounds: readonly Compound[]): Promise<StorageResult<void>>;
  getLastExport(): Promise<StorageResult<string | null>>;
  setLastExport(iso: string): Promise<StorageResult<void>>;
}

export const STORAGE_FAILED_MESSAGE = '無法使用瀏覽器儲存，化合物不會被保存，請使用匯出功能備份';

const DB_NAME = 'moleform-library';
const DB_VERSION = 1;
const COMPOUNDS = 'compounds';
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
      if (!db.objectStoreNames.contains(COMPOUNDS)) db.createObjectStore(COMPOUNDS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('無法開啟 IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB 被其他分頁封鎖'));
  });
}

/** factory 預設為瀏覽器的 indexedDB；測試可傳入假的實作 */
export function createIndexedDbStorage(factory?: IDBFactory | undefined): LibraryStorage {
  let opening: Promise<IDBDatabase> | null = null;

  const database = (): Promise<IDBDatabase> => {
    if (!opening) {
      let idb: IDBFactory | undefined = factory;
      try {
        idb = factory ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB);
      } catch {
        idb = undefined; // 部分瀏覽器在封鎖網站資料時，讀取 indexedDB 本身就會拋錯
      }
      opening = idb
        ? openDatabase(idb)
        : Promise.reject(new Error('這個瀏覽器環境沒有 IndexedDB'));
      // 失敗後允許下次重試
      opening.catch(() => {
        opening = null;
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
      run(async (db) => {
        const tx = db.transaction(COMPOUNDS, 'readonly');
        return (await requestResult(tx.objectStore(COMPOUNDS).getAll())) as Compound[];
      }),
    saveAll: (compounds) =>
      run(async (db) => {
        const tx = db.transaction(COMPOUNDS, 'readwrite');
        const store = tx.objectStore(COMPOUNDS);
        store.clear();
        for (const compound of compounds) store.put(compound);
        await transactionDone(tx);
      }),
    getLastExport: () =>
      run(async (db) => {
        const tx = db.transaction(META, 'readonly');
        const value = await requestResult(tx.objectStore(META).get(LAST_EXPORT_KEY));
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
export function createMemoryStorage(options: { failing?: boolean } = {}): LibraryStorage {
  let compounds: Compound[] = [];
  let lastExport: string | null = null;
  const fail = <T>(): StorageResult<T> => ({ ok: false, error: '模擬的儲存失敗' });
  return {
    loadAll: async () => (options.failing ? fail() : { ok: true, value: compounds.map((c) => ({ ...c })) }),
    saveAll: async (next) => {
      if (options.failing) return fail();
      compounds = next.map((c) => ({ ...c }));
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
