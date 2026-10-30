import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import './theme.css';
import './base.css';
import { Header } from './Header';
import { Footer } from './Footer';
import type { StructureValidation } from '../core/structure/validate';
import { StructureInput, type LoadRequest } from './structure/StructureInput';
import { CompoundLibrary } from './library/CompoundLibrary';
import { Workbench } from './workbench/Workbench';
import { Conformer3DCard } from './structure/Conformer3DCard';
import type { PolymerSpec } from '../core/polymer/types';
import type { BackboneTemplateRow } from '../core/data/backboneTemplates';
import { applyBackboneTemplate, drawTargetNumber, editFromSpec, tabLeaveNeedsConfirm } from './polymer/model';
import { PolymerSettings } from './polymer/PolymerSettings';
import { usePolymerInput } from './polymer/usePolymerInput';
import { useUnitDrawing } from './polymer/useUnitDrawing';

// 只有開發模式才載入；正式建置會整段移除，示範資料不會進入 dist。
const DevPreview = import.meta.env.DEV ? lazy(() => import('./components/DevPreview')) : null;

// 三個分頁（D45）：配方工作台（預設）、分子工具（原「結構」）、化合物庫（原「我的化合物」）
const TABS = [
  ['workbench', '配方工作台'],
  ['tools', '分子工具'],
  ['library', '化合物庫'],
] as const;

export function App() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('workbench');
  const [structure, setStructure] = useState<StructureValidation | null>(null);
  const [loadRequest, setLoadRequest] = useState<LoadRequest | null>(null);
  const { context: polymer, setEdit: setPolymerEdit } = usePolymerInput(structure);
  // 共聚物單元用 Ketcher 畫時借用「分子工具」的 Ketcher（同一時間只有一個，D28）
  const [mainUnverified, setMainUnverified] = useState(false); // 分子工具的結構畫布有尚未驗證的筆畫
  const unitDrawing = useUnitDrawing(mainUnverified);
  const [pendingTab, setPendingTab] = useState<(typeof TABS)[number][0] | null>(null);
  // 離開分子工具時，單元繪圖有未套用的修改 → 先確認；沒有就直接切換（單元繪圖由下面的 effect 收掉）
  const requestTab = (next: (typeof TABS)[number][0]) => {
    if (tabLeaveNeedsConfirm(tab, next, unitDrawing)) setPendingTab(next);
    else setTab(next);
  };
  // 離開「分子工具」就收掉單元繪圖（釋放 Ketcher，避免和配方工作台的彈窗同時有兩個）
  const closeUnitDrawing = unitDrawing.close;
  useEffect(() => {
    if (tab !== 'tools') closeUnitDrawing();
  }, [tab, closeUnitDrawing]);
  const loadIntoStructure = useCallback(
    (input: string, polymerSpec?: PolymerSpec) => {
      setLoadRequest((prev) => ({ id: (prev?.id ?? 0) + 1, input }));
      // 載入聚合物時一併還原 Mw／Mn／DP 與 PDI；一般化合物不改動已填的值
      if (polymerSpec) setPolymerEdit(editFromSpec(polymerSpec));
      // 結構載入「分子工具」，順便切過去讓使用者看到
      setTab('tools');
    },
    [setPolymerEdit],
  );
  // 骨架範本（任務 023，D51）：結構換成範本的單元，端基換成範本的端基；分子量欄位不動
  const applyTemplate = useCallback(
    (row: BackboneTemplateRow) => {
      setLoadRequest((prev) => ({ id: (prev?.id ?? 0) + 1, input: row.unitSmiles }));
      setPolymerEdit((edit) => applyBackboneTemplate(edit, row));
    },
    [setPolymerEdit],
  );
  return (
    <main className={tab === 'workbench' ? 'main-wide' : undefined}>
      <Header />
      <div className="tab-cards" aria-label="功能分頁">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} aria-controls={`panel-${id}`} onClick={() => requestTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {pendingTab && unitDrawing.target && (
        <div className="structure-notice" role="alertdialog" aria-label="離開分頁確認">
          <p>單元 {drawTargetNumber(unitDrawing.target, polymer.edit)} 在 Ketcher 裡有尚未套用的修改，離開會放棄這些修改。確定要離開嗎？</p>
          <div className="library-row-actions">
            <button
              type="button"
              className="library-danger"
              onClick={() => {
                setTab(pendingTab);
                setPendingTab(null);
              }}
            >
              放棄並離開
            </button>
            <button type="button" onClick={() => setPendingTab(null)}>取消</button>
          </div>
        </div>
      )}
      {/* 各分頁都保持掛載（只是隱藏），切換時不會清除各頁的內容；Ketcher 只在「分子工具」顯示時才載入 */}
      <div id="panel-workbench" hidden={tab !== 'workbench'}>
        <Workbench />
      </div>
      <div id="panel-tools" hidden={tab !== 'tools'}>
        <StructureInput onStructureChange={setStructure} loadRequest={loadRequest} active={tab === 'tools' && !unitDrawing.target} onUnverifiedChange={setMainUnverified} />
        <PolymerSettings context={polymer} onChange={setPolymerEdit} draw={unitDrawing} onApplyTemplate={applyTemplate} />
        <Conformer3DCard structure={structure} />
      </div>
      <div id="panel-library" hidden={tab !== 'library'}>
        <CompoundLibrary structure={structure} polymer={polymer} onLoad={loadIntoStructure} />
      </div>
      {DevPreview && (
        <Suspense fallback={null}>
          <DevPreview />
        </Suspense>
      )}
      <Footer />
    </main>
  );
}
