import { lazy, Suspense, useState } from 'react';
import './theme.css';
import './base.css';
import { Header } from './Header';
import { Footer } from './Footer';
import type { StructureValidation } from '../core/structure/validate';
import { StructureInput } from './structure/StructureInput';
import { Conformer3DCard } from './structure/Conformer3DCard';

// 只有開發模式才載入；正式建置會整段移除，示範資料不會進入 dist。
const DevPreview = import.meta.env.DEV ? lazy(() => import('./components/DevPreview')) : null;

export function App() {
  const [structure, setStructure] = useState<StructureValidation | null>(null);
  return (
    <main>
      <Header />
      <StructureInput onStructureChange={setStructure} />
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
