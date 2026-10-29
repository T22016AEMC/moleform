import { lazy, Suspense, useCallback, useState } from 'react';
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
import { editFromSpec } from './polymer/model';
import { PolymerSettings } from './polymer/PolymerSettings';
import { usePolymerInput } from './polymer/usePolymerInput';

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
  const loadIntoStructure = useCallback(
    (input: string, polymerSpec?: PolymerSpec) => {
      setLoadRequest((prev) => ({ id: (prev?.id ?? 0) + 1, input }));
      // 載入聚合物時一併還原 Mn 或 DP；一般化合物不改動已填的值
      if (polymerSpec) setPolymerEdit(editFromSpec(polymerSpec));
      // 結構載入「分子工具」，順便切過去讓使用者看到
      setTab('tools');
    },
    [setPolymerEdit],
  );
  return (
    <main className={tab === 'workbench' ? 'main-wide' : undefined}>
      <Header />
      <div className="tab-cards" aria-label="功能分頁">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {/* 各分頁都保持掛載（只是隱藏），切換時不會清除各頁的內容；Ketcher 只在「分子工具」顯示時才載入 */}
      <div id="panel-workbench" hidden={tab !== 'workbench'}>
        <Workbench />
      </div>
      <div id="panel-tools" hidden={tab !== 'tools'}>
        <StructureInput onStructureChange={setStructure} loadRequest={loadRequest} active={tab === 'tools'} />
        <PolymerSettings context={polymer} onChange={setPolymerEdit} />
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
