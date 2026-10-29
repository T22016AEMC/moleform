// 「我的配方」卡片（任務 014，Phase 3.6）：儲存、另存、清單、搜尋、載入、改名、刪除、匯出入、上次備份。
// 仿照「化合物庫」（任務 012），但使用另一個 IndexedDB 資料庫，不動到化合物庫的資料。
// 資料只存在使用者自己的瀏覽器（D23）；刪除用畫面內確認，不使用瀏覽器對話框。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  exportFormulationsJson,
  importFormulationsJson,
  removeFormulation,
  renameFormulation,
  saveFormulation,
  saveFormulationAs,
  searchFormulations,
  type SavedFormulation,
} from '../../core/formulation/library';
import type { Formulation } from '../../core/formulation/types';
import { dateStamp, displayDate } from '../../core/library/library';
import { summaryText } from '../../core/library/types';
import { downloadText } from '../download';
import { STORAGE_FAILED_MESSAGE } from '../library/storage';
import '../library/library.css';
import { createFormulationIndexedDbStorage, type FormulationStorage } from './storage';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface Props {
  /** 目前編輯中的配方 */
  formulation: Formulation;
  /** 目前編輯的是哪一筆已儲存的配方（沒有則為 null） */
  currentId: string | null;
  onLoad: (formulation: Formulation, id: string | null) => void;
  /** 儲存完成後，目前編輯的配方對應到這個 id（內容不變） */
  onSaved: (id: string | null) => void;
  storage?: FormulationStorage;
}

export function FormulationLibrary({ formulation, currentId, onLoad, onSaved, storage: storageProp }: Props) {
  const storage = useMemo(() => storageProp ?? createFormulationIndexedDbStorage(), [storageProp]);
  const [items, setItems] = useState<SavedFormulation[]>([]);
  const [storageOk, setStorageOk] = useState(true);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [renameError, setRenameError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<SavedFormulation[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [loaded, exported] = await Promise.all([storage.loadAll(), storage.getLastExport()]);
      if (cancelled) return;
      if (loaded.ok) setItems(loaded.value);
      else setStorageOk(false);
      if (exported.ok) setLastExport(exported.value);
    })();
    return () => {
      cancelled = true;
    };
  }, [storage]);

  /** 更新畫面上的清單並寫入儲存；儲存失敗時清單仍留在畫面（可匯出），並顯示提醒 */
  const commit = useCallback(
    async (next: SavedFormulation[]) => {
      setItems(next);
      const saved = await storage.saveAll(next);
      setStorageOk(saved.ok);
    },
    [storage],
  );

  async function save(asNew: boolean) {
    const result = asNew ? saveFormulationAs(itemsRef.current, formulation) : saveFormulation(itemsRef.current, formulation, currentId ?? undefined);
    if (!result.ok) {
      setMessage({ kind: 'error', text: result.error === '請輸入名稱' ? '請先在上方輸入配方名稱' : result.error });
      return;
    }
    setMessage({ kind: 'info', text: `已儲存「${result.value.saved.name}」` });
    onSaved(result.value.saved.id); // 之後的「儲存」會覆蓋這一筆
    await commit([...result.value.library]);
  }

  async function confirmDelete(id: string) {
    setConfirmDeleteId(null);
    await commit([...removeFormulation(itemsRef.current, id)]);
    if (id === currentId) onSaved(null);
  }

  async function applyRename() {
    if (!renaming) return;
    const renamed = renameFormulation(itemsRef.current, renaming.id, renaming.name);
    if (!renamed.ok) {
      setRenameError(renamed.error);
      return;
    }
    setRenaming(null);
    setRenameError('');
    await commit([...renamed.value]);
  }

  async function markExported(now: Date) {
    setLastExport(now.toISOString());
    await storage.setLastExport(now.toISOString());
  }

  function exportAll() {
    const now = new Date();
    downloadText(exportFormulationsJson(itemsRef.current, undefined, now), `moleform-formulations-${dateStamp(now)}.json`, 'application/json;charset=utf-8');
    setMessage({ kind: 'info', text: `已匯出 ${itemsRef.current.length} 筆配方` });
    void markExported(now); // 只有匯出全部才算備份
  }

  function exportOne(item: SavedFormulation) {
    const now = new Date();
    downloadText(exportFormulationsJson(itemsRef.current, [item.id], now), `moleform-formulations-${dateStamp(now)}.json`, 'application/json;charset=utf-8');
    setMessage({ kind: 'info', text: `已匯出「${item.name}」` });
  }

  async function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setMessage({ kind: 'error', text: `檔案太大（上限 ${MAX_FILE_BYTES / 1024 / 1024} MB）。` });
      return;
    }
    try {
      const outcome = importFormulationsJson(itemsRef.current, await file.text());
      if (!outcome.ok) {
        setMessage({ kind: 'error', text: outcome.error ?? '匯入失敗' });
        return;
      }
      setMessage({ kind: 'info', text: summaryText(outcome.summary) });
      if (outcome.summary.added || outcome.summary.updated) await commit([...outcome.library]);
    } catch {
      setMessage({ kind: 'error', text: '無法讀取這個檔案，未匯入任何資料。' });
    }
  }

  const shown = useMemo(
    () => searchFormulations(items, query).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)),
    [items, query],
  );

  return (
    <section className="card compound-library" aria-labelledby="my-formulations-title">
      <h2 id="my-formulations-title">我的配方</h2>
      <p className="library-warning">
        資料只存在這台電腦的這個瀏覽器。清除瀏覽器資料、換電腦或換瀏覽器都會看不到，請定期匯出備份。
      </p>
      <p className="library-last-export" role="status">
        上次備份（JSON）：{lastExport ? displayDate(lastExport) : '尚未備份'}
      </p>
      {!storageOk && <p className="error" role="alert">{STORAGE_FAILED_MESSAGE}</p>}

      <div className="library-row-actions">
        <button type="button" onClick={() => void save(false)}>{currentId ? '儲存（覆蓋）' : '儲存'}</button>
        <button type="button" disabled={!currentId} onClick={() => void save(true)}>另存</button>
      </div>

      <div className="library-tools">
        <label htmlFor="formulation-search">搜尋</label>
        <input id="formulation-search" type="search" value={query} autoComplete="off" placeholder="配方名稱" onChange={(e) => setQuery(e.target.value)} />
      </div>

      {items.length === 0 ? (
        <p className="library-empty">還沒有儲存的配方。</p>
      ) : shown.length === 0 ? (
        <p className="library-empty">沒有符合「{query}」的配方。</p>
      ) : (
        <ul className="library-list" aria-label="配方清單">
          {shown.map((item) => (
            <li key={item.id} className="library-item">
              {renaming?.id === item.id ? (
                <div className="library-edit">
                  <label htmlFor={`rename-${item.id}`}>名稱</label>
                  <input id={`rename-${item.id}`} type="text" maxLength={100} value={renaming.name} onChange={(e) => setRenaming({ id: item.id, name: e.target.value })} />
                  {renameError && <p className="error" role="alert">{renameError}</p>}
                  <div className="library-row-actions">
                    <button type="button" onClick={() => void applyRename()}>儲存變更</button>
                    <button type="button" onClick={() => { setRenaming(null); setRenameError(''); }}>取消</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="library-item-main">
                    <strong className="library-name">{item.name}{item.id === currentId ? '（編輯中）' : ''}</strong>
                    <small className="library-date">
                      Solid {item.formulation.solid.components.length} 項、Liquid {item.formulation.liquid.components.length} 項　更新：{displayDate(item.updatedAt)}
                    </small>
                  </div>
                  <div className="library-row-actions">
                    <button type="button" onClick={() => onLoad(item.formulation, item.id)}>載入</button>
                    <button type="button" onClick={() => { setRenaming({ id: item.id, name: item.name }); setRenameError(''); setConfirmDeleteId(null); }}>改名</button>
                    <button type="button" onClick={() => exportOne(item)}>匯出此配方</button>
                    {confirmDeleteId === item.id ? (
                      <>
                        <button type="button" className="library-danger" onClick={() => void confirmDelete(item.id)}>確定刪除？</button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)}>取消</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmDeleteId(item.id)}>刪除</button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="library-transfer">
        <input ref={fileInput} type="file" accept=".json" hidden onChange={(e) => void onPickFile(e)} />
        <button type="button" disabled={items.length === 0} onClick={exportAll}>匯出全部 JSON（備份）</button>
        <button type="button" onClick={() => fileInput.current?.click()}>匯入 JSON</button>
      </div>
      <small>匯入只在瀏覽器內讀取檔案，不會上傳。配方檔內含每個成分的結構，不依賴「化合物庫」也能還原。</small>
      {message && (
        <p className={message.kind === 'error' ? 'error' : 'library-message'} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </section>
  );
}
