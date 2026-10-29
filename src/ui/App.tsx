import { lazy, Suspense } from 'react';
import './theme.css';
import './base.css';
import { Header } from './Header';
import { Footer } from './Footer';

// 只有開發模式才載入；正式建置會整段移除，示範資料不會進入 dist。
const DevPreview = import.meta.env.DEV ? lazy(() => import('./components/DevPreview')) : null;

export function App() {
  return (
    <main>
      <Header />
      <section className="card">
        <p>MoleForm 建置中。</p>
      </section>
      {DevPreview && (
        <Suspense fallback={null}>
          <DevPreview />
        </Suspense>
      )}
      <Footer />
    </main>
  );
}