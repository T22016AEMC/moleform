import { lazy, Suspense, useCallback, useState } from 'react';
import './theme.css';
import './base.css';
import { Header } from './Header';
import { Footer } from './Footer';
import type { StructureValidation } from '../core/structure/validate';
import { StructureInput, type LoadRequest } from './structure/StructureInput';
import { CompoundLibrary } from './library/CompoundLibrary';
import { FormulationPage } from './formulation/FormulationPage';
import { CrosslinkPage } from './crosslink/CrosslinkPage';
import type { Formulation } from '../core/formulation/types';
import { Conformer3DCard } from './structure/Conformer3DCard';
import type { PolymerSpec } from '../core/polymer/types';
import { editFromSpec } from './polymer/model';
import { PolymerSettings } from './polymer/PolymerSettings';
import { usePolymerInput } from './polymer/usePolymerInput';

// 只有開發模式才載入；正式建置會整段移除，示範資料不會進入 dist。
const DevPreview = import.meta.env.DEV ? lazy(() => import('./components/DevPreview')) : null;

const TABS = [
  ['structure', '結構'],
  ['formulation', '配方'],
  ['crosslink', '交聯'],
] as const;

export function App() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('structure');
  const [structure, setStructure] = useState<StructureValidation | null>(null);
  const [formulation, setFormulation] = useState<Formulation | null>(null);
  const [loadRequest, setLoadRequest] = useState<LoadRequest | null>(null);
  const { context: polymer, setEdit: setPolymerEdit } = usePolymerInput(structure);
  const loadIntoStructure = useCallback(
    (input: string, polymerSpec?: PolymerSpec) => {
      setLoadRequest((prev) => ({ id: (prev?.id ?? 0) + 1, input }));
      // 載入聚合物時一併還原 Mn 或 DP；一般化合物不改動已填的值
      if (polymerSpec) setPolymerEdit(editFromSpec(polymerSpec));
    },
    [setPolymerEdit],
  );
  return (
    <main>
      <Header />
      <div className="tab-cards" aria-label="功能分頁">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {/* 各分頁都保持掛載（只是隱藏），切換時不會清除各頁的內容，也不會重新載入 Ketcher */}
      <div id="panel-structure" hidden={tab !== 'structure'}>
        <StructureInput onStructureChange={setStructure} loadRequest={loadRequest} />
        <PolymerSettings context={polymer} onChange={setPolymerEdit} />
        <CompoundLibrary structure={structure} polymer={polymer} onLoad={loadIntoStructure} />
        <Conformer3DCard structure={structure} />
      </div>
      <div id="panel-formulation" hidden={tab !== 'formulation'}>
        <FormulationPage structure={structure} polymer={polymer} onFormulationChange={setFormulation} />
      </div>
      <div id="panel-crosslink" hidden={tab !== 'crosslink'}>
        <CrosslinkPage formulation={formulation} />
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
