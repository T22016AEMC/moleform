// 「加入成分」彈窗（任務 018，D45）：貼 SMILES、從化合物庫搜尋、用 Ketcher 畫，三種方式擇一。
// 結構通過驗證（任務 010）後顯示 2D 預覽；含連接點 * 時直接設定 Mn 或 DP（任務 015）。
// 不顯示分子量、官能基數量與當量（D09）；不使用瀏覽器對話框。
import { useEffect, useMemo, useState } from 'react';
import { LIQUID_CATEGORIES, SOLID_CATEGORIES } from '../../core/formulation/types';
import { searchCompounds } from '../../core/library/library';
import type { Compound } from '../../core/library/types';
import type { RepeatUnitAnalysis } from '../../core/polymer/types';
import type { StructureValidation } from '../../core/structure/validate';
import { analyzeRepeatUnitInWorker, validateInput } from '../../worker/client';
import type { Row } from '../formulation/model';
import { createIndexedDbStorage } from '../library/storage';
import { analysisKey, specFromEdit } from '../polymer/model';
import { PolymerFields } from '../polymer/PolymerFields';
import { UnitDrawPanel } from '../polymer/UnitDrawPanel';
import { useUnitDrawing } from '../polymer/useUnitDrawing';
import { saveCompoundToLibrary } from './libraryBridge';
import { KetcherPane } from './KetcherPane';
import { Modal } from './Modal';
import {
  candidateFromCompound,
  candidateFromValidation,
  drawSource,
  initialForm,
  isPolymerSmiles,
  libraryInputFromRow,
  rowFromCandidate,
  type AddForm,
  type Candidate,
} from './model';
import { StructureImage } from './StructureImage';

type Method = 'smiles' | 'library' | 'ketcher';
const METHODS: [Method, string][] = [
  ['smiles', '貼 SMILES'],
  ['library', '從化合物庫搜尋'],
  ['ketcher', '用 Ketcher 畫'],
];
const VALIDATE_DELAY_MS = 300;

interface Props {
  area: 'solid' | 'liquid';
  /** 目前配方的成分數（預設名稱「成分 N」用） */
  existingCount: number;
  onAdd: (row: Row) => void;
  onClose: () => void;
}

const firstError = (v: StructureValidation) => v.problems.find((p) => p.level === 'error')?.message ?? '這不是可用的結構，無法加入';

export function AddComponentDialog({ area, existingCount, onAdd, onClose }: Props) {
  const categories: readonly string[] = area === 'solid' ? SOLID_CATEGORIES : LIQUID_CATEGORIES;
  const defaultCategory = area === 'solid' ? 'Small Molecule' : 'Solvent';
  const [method, setMethod] = useState<Method>('smiles');

  // 三種方式各自保留自己的結果，切換時不清掉
  const [smilesText, setSmilesText] = useState('');
  const [smilesView, setSmilesView] = useState<{ validation: StructureValidation | null; busy: boolean; failed: boolean }>({ validation: null, busy: false, failed: false });
  const [compounds, setCompounds] = useState<Compound[] | null>(null);
  const [libraryNote, setLibraryNote] = useState('');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Compound | null>(null);
  const [ketcher, setKetcher] = useState<StructureValidation | null>(null);
  const [ketcherDirty, setKetcherDirty] = useState(false);
  // 共聚物單元用 Ketcher 畫：借用本彈窗唯一的 Ketcher（畫單元時暫時卸下主結構的 Ketcher，之後以最近一次的結構還原）
  const [mainUnverified, setMainUnverified] = useState(false); // 主結構的畫布有尚未驗證的筆畫
  const [lastCanvas, setLastCanvas] = useState<string | undefined>(undefined); // 畫布最近一次匯出的 Molfile（借用後用來還原，即使驗證沒通過）
  const draw = useUnitDrawing(mainUnverified);
  // 離開「用 Ketcher 畫」方式後，下次回來是空白畫布（和原本一樣）；只有借用 Ketcher 畫單元時才需要還原
  useEffect(() => {
    if (method !== 'ketcher') setLastCanvas(undefined);
  }, [method]);

  const [form, setForm] = useState<AddForm>(() => initialForm(null, existingCount, defaultCategory));
  const [nameTouched, setNameTouched] = useState(false);
  const [analysis, setAnalysis] = useState<{ key: string; value: RepeatUnitAnalysis | null } | null>(null);
  const [message, setMessage] = useState('');
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);

  // ---- 貼 SMILES：輸入後稍等再驗證 ----
  useEffect(() => {
    if (smilesText.trim() === '') {
      setSmilesView({ validation: null, busy: false, failed: false });
      return;
    }
    setSmilesView((v) => ({ ...v, busy: true }));
    let cancelled = false;
    const timer = setTimeout(() => {
      void validateInput(smilesText).then((outcome) => {
        if (!cancelled) setSmilesView({ validation: outcome.ok ? outcome.result : null, busy: false, failed: !outcome.ok });
      });
    }, VALIDATE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [smilesText]);

  // ---- 從化合物庫：切到該方式時才讀取（只讀，不修改它） ----
  useEffect(() => {
    if (method !== 'library' || compounds !== null) return;
    let cancelled = false;
    void createIndexedDbStorage()
      .loadAll()
      .then((loaded) => {
        if (cancelled) return;
        setCompounds(loaded.ok ? loaded.value : []);
        if (!loaded.ok) setLibraryNote('無法讀取「化合物庫」（瀏覽器儲存不可用）');
      });
    return () => {
      cancelled = true;
    };
  }, [method, compounds]);

  const shownCompounds = useMemo(() => (compounds ? searchCompounds(compounds, query) : []), [compounds, query]);

  const candidate: Candidate | null =
    method === 'smiles' ? candidateFromValidation(smilesView.validation) : method === 'library' ? (picked ? candidateFromCompound(picked) : null) : candidateFromValidation(ketcher);
  const candidateKey = candidate ? `${method}|${candidate.canonicalSmiles}|${candidate.compoundId ?? ''}` : '';
  const polymer = candidate ? isPolymerSmiles(candidate.canonicalSmiles) : false;

  // 結構改變：名稱（沒改過才換）與 Mn／DP 重設
  useEffect(() => {
    setForm((f) => {
      const fresh = initialForm(candidate, existingCount, f.category);
      return { ...f, name: nameTouched && !candidate?.name ? f.name : fresh.name, polymerEdit: fresh.polymerEdit };
    });
    setDuplicate(null);
    setMessage('');
    // 只在結構（candidateKey）改變時重設
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateKey]);

  // 聚合物：分析重複單元（不顯示 M_unit，D09）
  const polymerSmiles = polymer && candidate ? candidate.canonicalSmiles : '';
  const polymerSpec = polymerSmiles ? specFromEdit(form.polymerEdit, polymerSmiles) : null;
  const polymerKey = polymerSmiles ? analysisKey(polymerSmiles, polymerSpec) : '';
  useEffect(() => {
    if (!polymerSmiles) return;
    let cancelled = false;
    void analyzeRepeatUnitInWorker(polymerSmiles, polymerSpec).then((value) => {
      if (!cancelled) setAnalysis({ key: polymerKey, value });
    });
    return () => {
      cancelled = true;
    };
    // polymerSpec 的內容由 polymerKey 決定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polymerKey]);
  const currentAnalysis = analysis?.key === polymerKey ? analysis.value : null;

  function requestClose() {
    if (((method === 'ketcher' && ketcherDirty && ketcher !== null) || draw.dirty) && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  async function submit(force = false) {
    if (!candidate) return;
    const row = rowFromCandidate(area, candidate, form, existingCount);
    if (form.saveToLibrary) {
      setSaving(true);
      try {
        const outcome = await saveCompoundToLibrary(libraryInputFromRow(row), { force });
        if (outcome.kind === 'duplicate') {
          setDuplicate(outcome.names);
          return;
        }
        if (outcome.kind === 'error') {
          setMessage(`無法存進化合物庫：${outcome.message}`);
          return;
        }
      } finally {
        setSaving(false);
      }
    }
    onAdd(row);
    onClose();
  }

  const previewValidation = method === 'smiles' ? smilesView.validation : method === 'ketcher' ? ketcher : null;
  const problems = previewValidation?.problems ?? [];

  return (
    <Modal title={`加入成分（${area === 'solid' ? 'Solid' : 'Liquid'}）`} onRequestClose={requestClose}>
      <div className="modal-tabs" role="tablist" aria-label="加入方式">
        {METHODS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={method === id} aria-pressed={method === id} onClick={() => setMethod(id)}>
            {label}
          </button>
        ))}
      </div>

      {method === 'smiles' && (
        <div className="modal-section">
          <label htmlFor="add-smiles">SMILES</label>
          <input id="add-smiles" type="text" value={smilesText} spellCheck={false} autoComplete="off" placeholder="例如 CCO" onChange={(e) => setSmilesText(e.target.value)} />
          {smilesView.busy && <small role="status">驗證中…</small>}
          {smilesView.failed && <p className="error" role="alert">結構驗證未完成，請稍後再試</p>}
        </div>
      )}

      {method === 'library' && (
        <div className="modal-section">
          <label htmlFor="add-library-search">搜尋（名稱或 SMILES）</label>
          <input id="add-library-search" type="search" value={query} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
          {libraryNote && <p className="error" role="alert">{libraryNote}</p>}
          {compounds === null ? (
            <small role="status">讀取中…</small>
          ) : compounds.length === 0 ? (
            <p className="library-empty">「化合物庫」還沒有資料。</p>
          ) : shownCompounds.length === 0 ? (
            <p className="library-empty">沒有符合「{query}」的化合物。</p>
          ) : (
            <ul className="modal-pick-list" aria-label="化合物清單">
              {shownCompounds.map((c) => (
                <li key={c.id}>
                  <button type="button" className={picked?.id === c.id ? 'is-picked' : ''} aria-pressed={picked?.id === c.id} onClick={() => setPicked(c)}>
                    <StructureImage label={`${c.name} 的結構`} source={drawSource(c)} width={72} height={48} polymer={isPolymerSmiles(c.canonicalSmiles)} />
                    <span className="modal-pick-name">{c.name}</span>
                    {isPolymerSmiles(c.canonicalSmiles) && <span className="polymer-tag">聚合物</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {method === 'ketcher' && !draw.target && (
        <div className="modal-section">
          <p>在下方畫結構；畫好後會自動驗證，通過後可在下面加入。</p>
          <KetcherPane initialInput={lastCanvas ?? (ketcher?.valid ? ketcher.molblock : undefined)} onStructure={setKetcher} onDirtyChange={setKetcherDirty} onUnverifiedChange={setMainUnverified} onExported={setLastCanvas} />
        </div>
      )}
      {(draw.target || draw.pending) && (
        <div className="modal-section">
          <UnitDrawPanel draw={draw} edit={form.polymerEdit} onEditChange={(polymerEdit) => setForm((f) => ({ ...f, polymerEdit }))} />
        </div>
      )}

      {/* 驗證訊息與 2D 預覽 */}
      <div className="modal-section modal-preview" aria-live="polite">
        {candidate ? (
          <>
            <StructureImage label="結構預覽" source={drawSource(candidate)} width={240} height={160} polymer={polymer} />
            <div>
              <p className="modal-ok">結構可用{polymer ? '（聚合物的重複單元）' : ''}。</p>
              {problems.map((p) => (
                <p key={p.code + p.message} className="structure-notice" role="status">{p.message}</p>
              ))}
            </div>
          </>
        ) : method === 'smiles' && smilesView.validation && !smilesView.validation.valid ? (
          <p className="error" role="alert">{smilesView.validation.empty ? '請輸入結構' : firstError(smilesView.validation)}</p>
        ) : method === 'ketcher' && ketcher && !ketcher.valid && !ketcher.empty ? (
          <p className="error" role="alert">{firstError(ketcher)}</p>
        ) : (
          <p className="structure-placeholder">{method === 'library' ? '請從清單選一個化合物。' : '還沒有可用的結構。'}</p>
        )}
      </div>

      {candidate && (
        <div className="modal-section modal-form">
          <div className="modal-form-row">
            <div className="field">
              <label htmlFor="add-name">名稱</label>
              <input
                id="add-name"
                type="text"
                maxLength={100}
                value={form.name}
                autoComplete="off"
                onChange={(e) => {
                  setNameTouched(true);
                  setForm((f) => ({ ...f, name: e.target.value }));
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="add-category">分類</label>
              <select id="add-category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {polymer && (
            <div className="polymer-row">
              <span className="field-label">聚合物（Mw、Mn、DP 擇一；可加單元成為共聚物）</span>
              {currentAnalysis?.ok === false && <p className="form-error" role="alert">{currentAnalysis.problem.message}</p>}
              <PolymerFields idPrefix="add-polymer" edit={form.polymerEdit} onChange={(polymerEdit) => setForm((f) => ({ ...f, polymerEdit }))} analysis={currentAnalysis} firstSmiles={polymerSmiles} onDrawUnit={draw.request} />
            </div>
          )}

          <label className="check modal-check">
            <input type="checkbox" checked={form.saveToLibrary} onChange={(e) => setForm((f) => ({ ...f, saveToLibrary: e.target.checked }))} />
            同時存進化合物庫
          </label>
        </div>
      )}

      {duplicate !== null && (
        <div className="library-duplicate" role="alertdialog" aria-label="重複結構確認">
          <p>化合物庫已有相同結構：「{duplicate}」。仍要再存一筆嗎？</p>
          <div className="library-row-actions">
            <button type="button" onClick={() => void submit(true)}>仍要存入並加入</button>
            <button
              type="button"
              onClick={() => {
                setForm((f) => ({ ...f, saveToLibrary: false }));
                setDuplicate(null);
              }}
            >
              不存進化合物庫
            </button>
          </div>
        </div>
      )}
      {message && <p className="error" role="alert">{message}</p>}

      {confirmClose && (
        <div className="structure-notice" role="alertdialog" aria-label="放棄修改確認">
          <p>Ketcher 裡有尚未加入的結構，確定要關閉嗎？</p>
          <div className="library-row-actions">
            <button type="button" className="library-danger" onClick={onClose}>放棄並關閉</button>
            <button type="button" onClick={() => setConfirmClose(false)}>繼續編輯</button>
          </div>
        </div>
      )}

      <div className="modal-actions">
        <button type="button" disabled={!candidate || saving} onClick={() => void submit()}>加入</button>
        <button type="button" className="secondary" onClick={requestClose}>取消</button>
      </div>
    </Modal>
  );
}
