// 「成分詳細」彈窗（任務 018，D45）：大的 2D 結構（標出反應原子）、小分子 3D、聚合物的 Mn／DP、用 Ketcher 修改結構、存進化合物庫。
// 不顯示分子量、官能基數量與當量（D09）；聚合物不提供 3D（D05）；不使用瀏覽器對話框。
import { useEffect, useState } from 'react';
import type { RepeatUnitAnalysis } from '../../core/polymer/types';
import type { StructureValidation } from '../../core/structure/validate';
import { analyzeRepeatUnitInWorker, validateInput } from '../../worker/client';
import type { Row } from '../formulation/model';
import { analysisKey, emptyPolymerEdit, endFromEdit, specFromEdit } from '../polymer/model';
import { PolymerFields } from '../polymer/PolymerFields';
import { UnitDrawPanel } from '../polymer/UnitDrawPanel';
import { useUnitDrawing } from '../polymer/useUnitDrawing';
import { Conformer3DCard } from '../structure/Conformer3DCard';
import { saveCompoundToLibrary } from './libraryBridge';
import { KetcherPane } from './KetcherPane';
import { Modal } from './Modal';
import { applyStructureToRow, candidateFromValidation, isPolymerSmiles, libraryInputFromRow } from './model';
import { StructureImage, useStructureDrawing } from './StructureImage';

interface Props {
  row: Row;
  area: 'solid' | 'liquid';
  /** 以函式更新這個成分（配方的狀態在工作台） */
  onChange: (update: (row: Row) => Row) => void;
  onClose: () => void;
}

/** 這個成分的 Molfile；舊的配方沒有存 Molfile 時，改由 RDKit 從 SMILES 產生（原子編號才與 3D 畫面一致） */
function useMolblock(row: Row): string {
  const [fetched, setFetched] = useState<{ smiles: string; molblock: string } | null>(null);
  const has = !!row.molfile && row.molfile.trim() !== '';
  useEffect(() => {
    if (has) return;
    let cancelled = false;
    void validateInput(row.canonicalSmiles).then((outcome) => {
      if (!cancelled && outcome.ok && outcome.result.valid) setFetched({ smiles: row.canonicalSmiles, molblock: outcome.result.molblock });
    });
    return () => {
      cancelled = true;
    };
  }, [has, row.canonicalSmiles]);
  if (has) return row.molfile as string;
  return fetched?.smiles === row.canonicalSmiles ? fetched.molblock : '';
}

export function ComponentDetailDialog({ row, area, onChange, onClose }: Props) {
  const polymer = isPolymerSmiles(row.canonicalSmiles);
  const molblock = useMolblock(row);
  const source = polymer ? row.canonicalSmiles : molblock || row.canonicalSmiles;
  const drawing = useStructureDrawing({ source, width: 440, height: 300, mark: true, polymer });

  // 共聚物：所有單元並排顯示（第一種單元是成分本身的結構）
  const extraUnits = polymer ? (row.polymerEdit?.extraUnits ?? []) : [];
  const copolymerUnits = extraUnits.length > 0 ? [{ smiles: row.canonicalSmiles, fractionText: row.polymerEdit?.firstFractionText ?? '' }, ...extraUnits.map((u) => ({ smiles: u.smiles.trim(), fractionText: u.fractionText }))].filter((u) => u.smiles !== '') : [];
  // 端基：有填的端基在單元圖旁各畫一張小圖（標出反應原子）
  const endFigures = polymer && row.polymerEdit
    ? ([1, 2] as const).flatMap((which) => {
        const end = endFromEdit(which === 1 ? row.polymerEdit?.end1 : row.polymerEdit?.end2);
        return end ? [{ which, smiles: end.smiles }] : [];
      })
    : [];
  const fractionLabel = (row.polymerEdit?.fractionBasis ?? 'mol') === 'mol' ? 'mol%' : 'wt%';
  const [analysis, setAnalysis] = useState<{ key: string; value: RepeatUnitAnalysis | null } | null>(null);
  const polymerSpec = polymer && row.polymerEdit ? specFromEdit(row.polymerEdit, row.canonicalSmiles) : null;
  const polymerKey = analysisKey(row.canonicalSmiles, polymerSpec);
  useEffect(() => {
    if (!polymer) return;
    let cancelled = false;
    void analyzeRepeatUnitInWorker(row.canonicalSmiles, polymerSpec).then((value) => {
      if (!cancelled) setAnalysis({ key: polymerKey, value });
    });
    return () => {
      cancelled = true;
    };
    // polymerSpec 的內容由 polymerKey 決定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polymer, polymerKey]);
  const currentAnalysis = analysis?.key === polymerKey ? analysis.value : null;

  // ---- 用 Ketcher 編輯 ----
  const [editing, setEditing] = useState(false);
  const [ketcher, setKetcher] = useState<StructureValidation | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<null | 'close' | 'discard'>(null);
  const candidate = candidateFromValidation(ketcher);
  // 共聚物單元用 Ketcher 畫：借用本彈窗唯一的 Ketcher（畫單元時暫時卸下結構編輯的 Ketcher，之後以最近一次的結構還原）
  const [mainUnverified, setMainUnverified] = useState(false); // 結構編輯的畫布有尚未驗證的筆畫
  const [lastCanvas, setLastCanvas] = useState<string | undefined>(undefined); // 畫布最近一次匯出的 Molfile（借用後用來還原，即使驗證沒通過）
  const draw = useUnitDrawing(mainUnverified);

  function requestClose() {
    if (((editing && dirty) || draw.dirty) && pendingConfirm !== 'close') {
      setPendingConfirm('close');
      return;
    }
    onClose();
  }

  function stopEditing() {
    setLastCanvas(undefined);
    setEditing(false);
    setKetcher(null);
    setDirty(false);
    setPendingConfirm(null);
  }

  function applyKetcher() {
    if (!candidate) return;
    onChange((r) => applyStructureToRow(r, candidate));
    stopEditing();
  }

  // ---- 存進化合物庫 ----
  const [libraryMessage, setLibraryMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  async function saveToLibrary(force = false) {
    const outcome = await saveCompoundToLibrary(libraryInputFromRow({ ...row, molfile: molblock || row.molfile }), { force });
    if (outcome.kind === 'duplicate') {
      setDuplicate(outcome.names);
      return;
    }
    setDuplicate(null);
    setLibraryMessage(outcome.kind === 'saved' ? { kind: 'info', text: `已存進化合物庫：「${outcome.name}」` } : { kind: 'error', text: outcome.message });
  }

  return (
    <Modal title={`成分詳細：${row.name || '（未命名）'}`} onRequestClose={requestClose} wide>
      <div className="modal-section">
        <label htmlFor="detail-name">名稱</label>
        <input id="detail-name" type="text" maxLength={100} value={row.name} autoComplete="off" onChange={(e) => onChange((r) => ({ ...r, name: e.target.value }))} />
        <small>{area === 'solid' ? 'Solid' : 'Liquid'}　{row.category}{polymer && <span className="polymer-tag">{extraUnits.length > 0 ? '共聚物' : '聚合物'}</span>}</small>
      </div>

      <div className="modal-section detail-structure">
        <h3>結構</h3>
        {copolymerUnits.length > 1 && (
          <div className="detail-units" role="group" aria-label="共聚物的所有單元">
            {copolymerUnits.map((u, i) => (
              <figure key={i} className="detail-unit">
                <StructureImage label={`單元 ${i + 1} 的結構（標出反應原子）`} source={u.smiles} width={300} height={220} mark polymer />
                <figcaption>單元 {i + 1}、{u.fractionText.trim() || '—'} {fractionLabel}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {endFigures.length > 0 && (
          <div className="detail-ends" role="group" aria-label="端基">
            {endFigures.map((e) => (
              <figure key={e.which} className="detail-unit">
                <StructureImage label={`端基 ${e.which} 的結構（標出反應原子）`} source={e.smiles} width={180} height={130} mark polymer />
                <figcaption>端基 {e.which}</figcaption>
              </figure>
            ))}
          </div>
        )}
        <div className="detail-structure-box" hidden={copolymerUnits.length > 1}>
          {drawing.kind === 'done' && drawing.drawn.svg ? (
            <div className="structure-image" role="img" aria-label={`${row.name} 的結構圖`} dangerouslySetInnerHTML={{ __html: drawing.drawn.svg }} />
          ) : (
            <p className="structure-placeholder">{drawing.kind === 'loading' ? '繪製中…' : '無法繪圖'}</p>
          )}
        </div>
        {drawing.kind === 'done' && (
          <small>
            {drawing.drawn.marked > 0
              ? `以強調色標出可參與反應的原子；編號從 1 起算，與下方 3D 畫面的原子編號一致。${polymer ? '聚合物顯示重複單元。' : ''}`
              : `這個結構沒有已登錄的反應官能基。${polymer ? '聚合物顯示重複單元。' : ''}`}
          </small>
        )}
      </div>

      {polymer ? (
        <div className="modal-section polymer-row">
          <h3>聚合物設定</h3>
          {currentAnalysis?.ok === false && <p className="form-error" role="alert">{currentAnalysis.problem.message}</p>}
          {(
            <PolymerFields
              idPrefix="detail-polymer"
              edit={row.polymerEdit ?? emptyPolymerEdit()}
              onChange={(polymerEdit) => onChange((r) => ({ ...r, polymerEdit }))}
              analysis={currentAnalysis}
              firstSmiles={row.canonicalSmiles}
              onDrawUnit={draw.request}
              onReplaceFirst={(smiles, polymerEdit) => onChange(({ molfile: _m, compoundId: _c, ...r }) => ({ ...r, canonicalSmiles: smiles, polymerEdit }))}
            />
          )}
          <UnitDrawPanel draw={draw} edit={row.polymerEdit ?? emptyPolymerEdit()} onEditChange={(polymerEdit) => onChange((r) => ({ ...r, polymerEdit }))} />
          <small>聚合物不提供 3D（D05）。</small>
        </div>
      ) : (
        <Conformer3DCard structure={molblock ? { valid: true, molblock, canonicalSmiles: row.canonicalSmiles } : null} />
      )}

      <div className="modal-section">
        <h3>修改結構</h3>
        {editing ? (
          <>
            <p>在 Ketcher 修改後，按「套用到這個成分」。成分的名稱、分類與用量不變。</p>
            {!draw.target && <KetcherPane initialInput={lastCanvas ?? (ketcher?.valid ? ketcher.molblock : molblock || row.canonicalSmiles)} onStructure={setKetcher} onDirtyChange={setDirty} onUnverifiedChange={setMainUnverified} onExported={setLastCanvas} />}
            {draw.target && <p role="status">正在畫共聚物的單元，結構編輯暫時收合；畫完後會還原。</p>}
            {ketcher && !ketcher.valid && !ketcher.empty && (
              <p className="error" role="alert">{ketcher.problems.find((p) => p.level === 'error')?.message ?? '這不是可用的結構'}</p>
            )}
            <div className="library-row-actions">
              <button type="button" disabled={!candidate || !dirty} onClick={applyKetcher}>套用到這個成分</button>
              <button type="button" className="secondary" onClick={() => (dirty ? setPendingConfirm('discard') : stopEditing())}>放棄修改</button>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => setEditing(true)}>用 Ketcher 編輯結構</button>
        )}
      </div>

      {pendingConfirm && (
        <div className="structure-notice" role="alertdialog" aria-label="放棄修改確認">
          <p>Ketcher 裡有尚未套用的修改，確定要放棄嗎？</p>
          <div className="library-row-actions">
            <button type="button" className="library-danger" onClick={() => (pendingConfirm === 'close' ? onClose() : stopEditing())}>{pendingConfirm === 'close' ? '放棄並關閉' : '放棄修改'}</button>
            <button type="button" onClick={() => setPendingConfirm(null)}>繼續編輯</button>
          </div>
        </div>
      )}

      <div className="modal-section">
        <h3>化合物庫</h3>
        {duplicate !== null ? (
          <div className="library-duplicate" role="alertdialog" aria-label="重複結構確認">
            <p>化合物庫已有相同結構：「{duplicate}」。仍要再存一筆嗎？</p>
            <div className="library-row-actions">
              <button type="button" onClick={() => void saveToLibrary(true)}>仍要存入</button>
              <button type="button" className="secondary" onClick={() => setDuplicate(null)}>不存</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => void saveToLibrary()}>存進化合物庫</button>
        )}
        {libraryMessage && (
          <p className={libraryMessage.kind === 'error' ? 'error' : 'library-message'} role={libraryMessage.kind === 'error' ? 'alert' : 'status'}>{libraryMessage.text}</p>
        )}
      </div>

      <div className="modal-actions">
        <button type="button" onClick={requestClose}>完成</button>
      </div>
    </Modal>
  );
}
