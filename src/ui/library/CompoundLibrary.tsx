// 「化合物庫」卡片（任務 012，Phase 2.8）：儲存、搜尋、載入、改名、刪除、匯出入。
// 資料只存在使用者自己的瀏覽器（IndexedDB，D23），不經過任何伺服器；不存也不顯示分子量、官能基數量或當量（D09）。
// 刪除用畫面內的確認按鈕，不使用瀏覽器對話框。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  exportLibraryJson,
  exportLibrarySdf,
  importLibraryJson,
  importLibrarySdf,
  type Canonicalize,
  type ValidateMolfile,
} from '../../core/library/exchange';
import {
  addCompound,
  dateStamp,
  displayDate,
  editNotes,
  editPolymer,
  findDuplicates,
  removeCompound,
  renameCompound,
  searchCompounds,
  sortCompounds,
  validateName,
  type SortKey,
} from '../../core/library/library';
import { NAME_MAX, NOTES_MAX, summaryText, type Compound } from '../../core/library/types';
import type { PolymerSpec } from '../../core/polymer/types';
import type { StructureValidation } from '../../core/structure/validate';
import { validateInput } from '../../worker/client';
import { specFromEdit, editFromSpec, polymerLabel, type PolymerEdit } from '../polymer/model';
import type { PolymerContext } from '../polymer/usePolymerInput';
import { downloadText } from '../download';
import { LIBRARY_CHANGED_EVENT } from '../workbench/libraryBridge';
import { createIndexedDbStorage, STORAGE_FAILED_MESSAGE, type LibraryStorage } from './storage';
import './library.css';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 與任務 010 的結構檔案上限相同
const SMILES_PREVIEW_CHARS = 48;

const canonicalize: Canonicalize = async (smiles) => {
  const outcome = await validateInput(smiles);
  return outcome.ok && outcome.result.valid ? outcome.result.canonicalSmiles : null;
};

const validateMolfile: ValidateMolfile = async (molfile) => {
  const outcome = await validateInput(molfile);
  if (!outcome.ok) return { ok: false, reason: '結構驗證未完成' };
  if (outcome.result.valid) {
    return { ok: true, canonicalSmiles: outcome.result.canonicalSmiles, molfile: outcome.result.molblock };
  }
  return { ok: false, reason: outcome.result.problems.find((p) => p.level === 'error')?.message ?? '結構無效或是空的' };
};

const truncate = (text: string) => ([...text].length > SMILES_PREVIEW_CHARS ? `${[...text].slice(0, SMILES_PREVIEW_CHARS).join('')}…` : text);

interface Editing {
  id: string;
  name: string;
  notes: string;
  /** 只有聚合物才有：Mn 或 DP 的編輯狀態 */
  polymer?: PolymerEdit;
}

interface Props {
  /** 目前「結構輸入」的驗證結果；有效時才能儲存 */
  structure: StructureValidation | null;
  /** 「均聚物設定」的目前狀態；結構含連接點時，儲存會存成聚合物 */
  polymer: PolymerContext;
  /** 把化合物送進結構輸入（Molfile 或 SMILES）；聚合物一併帶出 Mn 或 DP */
  onLoad: (input: string, polymer?: PolymerSpec) => void;
  /** 測試或預覽時可換成其他儲存實作；預設為瀏覽器 IndexedDB */
  storage?: LibraryStorage;
}

export function CompoundLibrary({ structure, polymer, onLoad, storage: storageProp }: Props) {
  const storage = useMemo(() => storageProp ?? createIndexedDbStorage(), [storageProp]);
  const [library, setLibrary] = useState<Compound[]>([]);
  const [storageOk, setStorageOk] = useState(true);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [saveName, setSaveName] = useState('');
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editError, setEditError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<Compound[]>([]);
  libraryRef.current = library;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [loaded, exported] = await Promise.all([storage.loadAll(), storage.getLastExport()]);
      if (cancelled) return;
      if (loaded.ok) setLibrary(loaded.value);
      else setStorageOk(false);
      if (exported.ok) setLastExport(exported.value);
    })();
    return () => {
      cancelled = true;
    };
  }, [storage]);

  // 配方工作台的彈窗把成分存進化合物庫後，重新讀取（任務 018）；否則這裡的舊清單之後會覆蓋新存的資料
  useEffect(() => {
    const reload = () => {
      void storage.loadAll().then((loaded) => {
        if (loaded.ok) setLibrary(loaded.value);
      });
    };
    window.addEventListener(LIBRARY_CHANGED_EVENT, reload);
    return () => window.removeEventListener(LIBRARY_CHANGED_EVENT, reload);
  }, [storage]);

  /** 更新畫面上的清單並寫入儲存；儲存失敗時清單仍留在畫面（可匯出），並顯示提醒 */
  const commit = useCallback(
    async (next: Compound[]) => {
      setLibrary(next);
      const saved = await storage.saveAll(next);
      setStorageOk(saved.ok);
    },
    [storage],
  );

  const canSave = !!structure?.valid;

  async function save(force: boolean) {
    if (!structure?.valid) return;
    const name = validateName(saveName);
    if (!name.ok) {
      setFormError(name.error);
      return;
    }
    // 含連接點的結構視為均聚物：須符合連接點規則，並填好 Mn 或 DP
    if (polymer.hasMark) {
      if (!polymer.analysis) {
        setFormError('正在檢查連接點，請稍後再儲存');
        return;
      }
      if (!polymer.analysis.ok) {
        setFormError(`含連接點的結構需符合均聚物規則才能儲存：${polymer.analysis.problem.message}`);
        return;
      }
      if (!polymer.spec) {
        setFormError('這是聚合物的重複單元，請先在「均聚物設定」填入 Mw（或 Mn、DP）');
        return;
      }
    }
    const duplicates = findDuplicates(libraryRef.current, structure.canonicalSmiles);
    if (duplicates.length && !force) {
      setDuplicateOf(duplicates.map((d) => d.name).join('、'));
      return;
    }
    const added = addCompound(libraryRef.current, {
      name: saveName,
      canonicalSmiles: structure.canonicalSmiles,
      molfile: structure.molblock,
      ...(polymer.hasMark && polymer.spec ? { polymer: polymer.spec } : {}),
    });
    if (!added.ok) {
      setFormError(added.error);
      return;
    }
    setFormError('');
    setDuplicateOf(null);
    setSaveName('');
    setMessage({ kind: 'info', text: `已儲存「${added.value.compound.name}」` });
    await commit([...added.value.library]);
  }

  function cancelDuplicate() {
    setDuplicateOf(null);
  }

  async function confirmDelete(id: string) {
    setConfirmDeleteId(null);
    if (editing?.id === id) setEditing(null);
    await commit([...removeCompound(libraryRef.current, id)]);
  }

  async function saveEdit() {
    if (!editing) return;
    const renamed = renameCompound(libraryRef.current, editing.id, editing.name);
    if (!renamed.ok) {
      setEditError(renamed.error);
      return;
    }
    const noted = editNotes(renamed.value, editing.id, editing.notes);
    if (!noted.ok) {
      setEditError(noted.error);
      return;
    }
    let next = noted.value;
    if (editing.polymer) {
      const spec = specFromEdit(editing.polymer, library.find((c) => c.id === editing.id)?.canonicalSmiles);
      if (!spec) {
        setEditError('請輸入大於 0 的 Mw（或 Mn、DP），PDI 若有填需為數字');
        return;
      }
      const changed = editPolymer(next, editing.id, spec);
      if (!changed.ok) {
        setEditError(changed.error);
        return;
      }
      next = changed.value;
    }
    setEditError('');
    setEditing(null);
    await commit([...next]);
  }

  function load(compound: Compound) {
    onLoad(compound.molfile || compound.canonicalSmiles, compound.polymer);
  }

  async function markExported(now: Date) {
    setLastExport(now.toISOString());
    await storage.setLastExport(now.toISOString());
  }

  function exportJson() {
    const now = new Date();
    downloadText(exportLibraryJson(libraryRef.current, now), `moleform-compounds-${dateStamp(now)}.json`, 'application/json;charset=utf-8');
    setMessage({ kind: 'info', text: `已匯出 ${libraryRef.current.length} 筆（JSON）` });
    void markExported(now);
  }

  async function exportSdf() {
    setBusy(true);
    try {
      const entries = [];
      const failed: string[] = [];
      for (const compound of libraryRef.current) {
        let molfile = compound.molfile;
        if (!molfile) {
          const outcome = await validateInput(compound.canonicalSmiles);
          molfile = outcome.ok && outcome.result.valid ? outcome.result.molblock : '';
        }
        if (molfile) entries.push({ compound, molfile });
        else failed.push(compound.name);
      }
      downloadText(exportLibrarySdf(entries), `moleform-compounds-${dateStamp(new Date())}.sdf`, 'chemical/x-mdl-sdfile');
      setMessage(
        failed.length
          ? { kind: 'error', text: `已匯出 ${entries.length} 筆（SDF）；無法產生結構而略過：${failed.join('、')}` }
          : { kind: 'info', text: `已匯出 ${entries.length} 筆（SDF）` },
      );
    } finally {
      setBusy(false);
    }
  }

  async function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setMessage({ kind: 'error', text: `檔案太大（上限 ${MAX_FILE_BYTES / 1024 / 1024} MB），請拆成較小的檔案。` });
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const isJson = /\.json$/i.test(file.name);
      const outcome = isJson
        ? await importLibraryJson(libraryRef.current, text, canonicalize)
        : await importLibrarySdf(libraryRef.current, text, validateMolfile);
      if (!outcome.ok) {
        setMessage({ kind: 'error', text: outcome.error ?? '匯入失敗' });
        return;
      }
      setMessage({ kind: 'info', text: summaryText(outcome.summary) });
      if (outcome.summary.added || outcome.summary.updated) await commit([...outcome.library]);
    } catch {
      setMessage({ kind: 'error', text: '無法讀取這個檔案，未匯入任何資料。' });
    } finally {
      setBusy(false);
    }
  }

  const shown = useMemo(() => sortCompounds(searchCompounds(library, query), sortKey), [library, query, sortKey]);

  return (
    <section className="card compound-library" aria-labelledby="library-title">
      <h2 id="library-title">化合物庫</h2>
      <p className="library-warning">
        資料只存在這台電腦的這個瀏覽器。清除瀏覽器資料、換電腦或換瀏覽器都會看不到，請定期匯出備份。
      </p>
      <p className="library-last-export" role="status">
        上次備份（JSON）：{lastExport ? displayDate(lastExport) : '尚未備份'}
      </p>
      {!storageOk && (
        <p className="error" role="alert">{STORAGE_FAILED_MESSAGE}</p>
      )}

      <div className="library-save">
        <label htmlFor="library-name">名稱</label>
        <input
          id="library-name"
          type="text"
          value={saveName}
          maxLength={NAME_MAX}
          autoComplete="off"
          placeholder={canSave ? '例如：BADGE' : '請先在「結構輸入」輸入有效的結構'}
          disabled={!canSave}
          onChange={(event) => {
            setSaveName(event.target.value);
            setFormError('');
            setDuplicateOf(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save(false);
          }}
        />
        <button type="button" disabled={!canSave} onClick={() => void save(false)}>儲存目前結構</button>
      </div>
      {formError && <p className="error" role="alert">{formError}</p>}
      {duplicateOf && (
        <div className="library-duplicate" role="alert">
          <p>已有相同結構：{duplicateOf}</p>
          <div className="library-row-actions">
            <button type="button" onClick={() => void save(true)}>仍要另存</button>
            <button type="button" onClick={cancelDuplicate}>取消</button>
          </div>
        </div>
      )}

      <div className="library-tools">
        <label htmlFor="library-search">搜尋</label>
        <input
          id="library-search"
          type="search"
          value={query}
          autoComplete="off"
          placeholder="名稱或 SMILES"
          onChange={(event) => setQuery(event.target.value)}
        />
        <label htmlFor="library-sort">排序</label>
        <select id="library-sort" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
          <option value="updated">更新時間（新到舊）</option>
          <option value="name">名稱</option>
        </select>
      </div>

      {library.length === 0 ? (
        <p className="library-empty">還沒有儲存的化合物。</p>
      ) : shown.length === 0 ? (
        <p className="library-empty">沒有符合「{query}」的化合物。</p>
      ) : (
        <ul className="library-list" aria-label="化合物清單">
          {shown.map((compound) => (
            <li key={compound.id} className="library-item">
              {editing?.id === compound.id ? (
                <div className="library-edit">
                  <label htmlFor={`edit-name-${compound.id}`}>名稱</label>
                  <input
                    id={`edit-name-${compound.id}`}
                    type="text"
                    value={editing.name}
                    maxLength={NAME_MAX}
                    onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                  />
                  <label htmlFor={`edit-notes-${compound.id}`}>備註（最多 {NOTES_MAX} 字）</label>
                  <textarea
                    id={`edit-notes-${compound.id}`}
                    rows={3}
                    value={editing.notes}
                    maxLength={NOTES_MAX}
                    onChange={(event) => setEditing({ ...editing, notes: event.target.value })}
                  />
                  {editing.polymer && (
                    <div className="polymer-edit">
                      <label htmlFor={`edit-polymer-basis-${compound.id}`}>聚合物設定（Mw、Mn、DP 擇一；PDI 留空使用預設值 2）</label>
                      <select
                        id={`edit-polymer-basis-${compound.id}`}
                        value={editing.polymer.basis}
                        onChange={(event) => setEditing({ ...editing, polymer: { ...editing.polymer!, basis: event.target.value as PolymerEdit['basis'] } })}
                      >
                        <option value="mw">Mw（g/mol）</option>
                        <option value="mn">Mn（g/mol）</option>
                        <option value="dp">DP（數量平均，重複單元數）</option>
                      </select>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={editing.polymer.basis === 'mw' ? 'Mw' : editing.polymer.basis === 'mn' ? 'Mn' : 'DP'}
                        value={editing.polymer.text}
                        onChange={(event) => setEditing({ ...editing, polymer: { ...editing.polymer!, text: event.target.value } })}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label="PDI（選填，預設 2）"
                        placeholder="PDI（選填，預設 2）"
                        value={editing.polymer.pdiText}
                        onChange={(event) => setEditing({ ...editing, polymer: { ...editing.polymer!, pdiText: event.target.value } })}
                      />
                    </div>
                  )}
                  {editError && <p className="error" role="alert">{editError}</p>}
                  <div className="library-row-actions">
                    <button type="button" onClick={() => void saveEdit()}>儲存變更</button>
                    <button type="button" onClick={() => { setEditing(null); setEditError(''); }}>取消</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="library-item-main">
                    <strong className="library-name">{compound.name}</strong>
                    {compound.polymer && (
                      <span className="library-badge">聚合物　{polymerLabel(compound.polymer)}</span>
                    )}
                    <code className="library-smiles" title={compound.canonicalSmiles}>{truncate(compound.canonicalSmiles)}</code>
                    <small className="library-date">更新：{displayDate(compound.updatedAt)}</small>
                    {compound.notes && <p className="library-notes">{compound.notes}</p>}
                  </div>
                  <div className="library-row-actions">
                    <button type="button" onClick={() => load(compound)}>載入</button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing({
                          id: compound.id,
                          name: compound.name,
                          notes: compound.notes,
                          ...(compound.polymer ? { polymer: editFromSpec(compound.polymer) } : {}),
                        });
                        setEditError('');
                        setConfirmDeleteId(null);
                      }}
                    >
                      改名／備註
                    </button>
                    {confirmDeleteId === compound.id ? (
                      <>
                        <button type="button" className="library-danger" onClick={() => void confirmDelete(compound.id)}>確定刪除？</button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)}>取消</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmDeleteId(compound.id)}>刪除</button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="library-transfer">
        <input ref={fileInput} type="file" accept=".json,.sdf,.sd" hidden onChange={(event) => void onPickFile(event)} />
        <button type="button" disabled={busy || library.length === 0} onClick={exportJson}>匯出 JSON（備份）</button>
        <button type="button" disabled={busy || library.length === 0} onClick={() => void exportSdf()}>匯出 SDF</button>
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>匯入 JSON／SDF</button>
      </div>
      <small>匯入只在瀏覽器內讀取檔案，不會上傳。JSON 用於備份與分享給同事；SDF 可用其他化學軟體開啟。</small>
      {message && (
        <p className={message.kind === 'error' ? 'error' : 'library-message'} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </section>
  );
}
