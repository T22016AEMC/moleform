// 用 Ketcher 畫共聚物單元的面板（任務 021）：沿用該處唯一的 Ketcher，標示「正在畫：單元 N」，
// 畫好按「套用到單元 N」才寫回該列的 SMILES。結構處理沿用第一種單元（K09：SMILES 先由 RDKit 轉成 Molfile 再送進 Ketcher）。
import { useEffect, useState } from 'react';
import { checkDrawnUnit } from '../../core/polymer/copolymer';
import type { StructureValidation } from '../../core/structure/validate';
import { analyzeRepeatUnitInWorker, validateInput } from '../../worker/client';
import { KetcherPane } from '../workbench/KetcherPane';
import { applyDrawnUnit, drawTargetNumber, drawTargetSmiles, type PolymerEdit } from './model';
import type { UnitDrawing } from './useUnitDrawing';

interface Props {
  draw: UnitDrawing;
  edit: PolymerEdit;
  onEditChange: (edit: PolymerEdit) => void;
}

export function UnitDrawPanel({ draw, edit, onEditChange }: Props) {
  const { target } = draw;
  const number = target ? drawTargetNumber(target, edit) : 0;
  const initialSmiles = target ? drawTargetSmiles(target, edit) : '';
  const targetKey = target ? (target.kind === 'new' ? 'new' : `edit-${target.index}`) : '';
  const [loaded, setLoaded] = useState<{ key: string; input: string } | null>(null);
  const [structure, setStructure] = useState<StructureValidation | null>(null);
  const [error, setError] = useState('');

  // 載入該列的結構：SMILES 先由 RDKit 轉成 Molfile（連接點保留為 *），再送進 Ketcher
  useEffect(() => {
    if (!targetKey) return;
    let cancelled = false;
    setStructure(null);
    setError('');
    if (initialSmiles.trim() === '') {
      setLoaded({ key: targetKey, input: '' });
      return;
    }
    void validateInput(initialSmiles.trim()).then((outcome) => {
      if (!cancelled) setLoaded({ key: targetKey, input: outcome.ok && outcome.result.valid ? outcome.result.molblock : initialSmiles });
    });
    return () => {
      cancelled = true;
    };
    // 只在換單元時重新載入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  if (!target) return null;
  const ready = loaded?.key === targetKey;

  async function apply() {
    const analysis = structure?.valid && structure.canonicalSmiles.includes('*') ? await analyzeRepeatUnitInWorker(structure.canonicalSmiles) : null;
    const checked = checkDrawnUnit(structure, analysis, number);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError('');
    onEditChange(applyDrawnUnit(edit, target!, checked.smiles));
    draw.close();
  }

  const pendingNumber = draw.pending && draw.pending !== 'close' ? drawTargetNumber(draw.pending, edit) : null;
  return (
    <div className="unit-draw-panel" role="group" aria-label={`正在畫：單元 ${number}`}>
      <p className="unit-draw-banner" role="status">
        <strong>正在畫：單元 {number}</strong>　畫好後按「套用到單元 {number}」才會寫回；重複單元需要恰好兩個連接點（*）。
      </p>
      {ready ? (
        <KetcherPane key={targetKey} initialInput={loaded.input} onStructure={setStructure} onDirtyChange={draw.setDirty} />
      ) : (
        <p role="status">正在載入…</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {structure && !structure.valid && !structure.empty && !error && (
        <p className="form-error" role="alert">單元 {number}：{structure.problems.find((p) => p.level === 'error')?.message ?? '這不是可用的結構'}</p>
      )}
      {draw.pending && (
        <div className="structure-notice" role="alertdialog" aria-label="放棄修改確認">
          <p>
            單元 {number} 的 Ketcher 有尚未套用的修改，確定要{draw.pending === 'close' ? '放棄' : `放棄並改畫單元 ${pendingNumber}`}嗎？
          </p>
          <div className="library-row-actions">
            <button type="button" className="library-danger" onClick={draw.confirmPending}>放棄修改</button>
            <button type="button" onClick={draw.cancelPending}>繼續編輯</button>
          </div>
        </div>
      )}
      <div className="library-row-actions">
        <button type="button" disabled={!structure?.valid} onClick={() => void apply()}>套用到單元 {number}</button>
        <button type="button" className="secondary" onClick={draw.requestCancel}>取消</button>
      </div>
    </div>
  );
}
