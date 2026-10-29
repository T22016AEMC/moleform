import { lazy, Suspense, useCallback, useState } from 'react';
import './theme.css';
import './base.css';
import { Header } from './Header';
import { Footer } from './Footer';
import type { StructureValidation } from '../core/structure/validate';
import { StructureInput, type LoadRequest } from './structure/StructureInput';
import { CompoundLibrary } from './library/CompoundLibrary';
import { Conformer3DCard } from './structure/Conformer3DCard';

// 只有開發模式才載入；正式建置會整段移除，示範資料不會進入 dist。
const DevPreview = import.meta.env.DEV ? lazy(() => import('./components/DevPreview')) : null;

export function App() {
  const [structure, setStructure] = useState<StructureValidation | null>(null);
  const [loadRequest, setLoadRequest] = useState<LoadRequest | null>(null);
  const loadIntoStructure = useCallback((input: string) => setLoadRequest((prev) => ({ id: (prev?.id ?? 0) + 1, input })), []);
  return (
    <main>
      <Header />
      <StructureInput onStructureChange={setStructure} loadRequest={loadRequest} />
      <CompoundLibrary structure={structure} onLoad={loadIntoStructure} />
      <Conformer3DCard structure={structure} />
      {DevPreview && (
        <Suspense fallback={null}>
          <DevPreview />
        </Suspense>
      )}
      <Footer />
    </main>
  );
}
