import { lazy, Suspense, useCallback, useState } from 'react';
import './theme.css';
import './base.css';
import { Header } from './Header';
import { Footer } from './Footer';
import type { StructureValidation } from '../core/structure/validate';
import { StructureInput, type LoadRequest } from './structure/StructureInput';
import { CompoundLibrary } from './library/CompoundLibrary';
import { FormulationPage } from './formulation/FormulationPage';
import { Conformer3DCard } from './structure/Conformer3DCard';

// 只有開發模式才載入；正式建置會整段移除，示範資料不會進入 dist。
const DevPreview = import.meta.env.DEV ? lazy(() => import('./components/DevPreview')) : null;

const TABS = [
  ['structure', '結構'],
  ['formulation', '配方'],
] as const;

export function App() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('structure');
  const [structure, setStructure] = useState<StructureValidation | null>(null);
  const [loadRequest, setLoadRequest] = useState<LoadRequest | null>(null);
  const loadIntoStructure = useCallback((input: string) => setLoadRequest((prev) => ({ id: (prev?.id ?? 0) + 1, input })), []);
  return (
    <main>
      <Header />
      <div className="tabs" role="tablist" aria-label="功能分頁">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {/* 兩個分頁都保持掛載（只是隱藏），切換時不會清除各頁的內容，也不會重新載入 Ketcher */}
      <div id="panel-structure" role="tabpanel" aria-labelledby="tab-structure" hidden={tab !== 'structure'}>
        <StructureInput onStructureChange={setStructure} loadRequest={loadRequest} />
        <CompoundLibrary structure={structure} onLoad={loadIntoStructure} />
        <Conformer3DCard structure={structure} />
      </div>
      <div id="panel-formulation" role="tabpanel" aria-labelledby="tab-formulation" hidden={tab !== 'formulation'}>
        <FormulationPage structure={structure} />
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
