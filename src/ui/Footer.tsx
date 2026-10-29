import { useEffect, useState } from 'react';
import { getChemStatus, type ChemStatus } from '../worker/client';
import './components/components.css';

export function Footer() {
  const [status, setStatus] = useState<ChemStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    getChemStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="site-footer" role="status">
      {status === null && '化學引擎載入中…'}
      {status?.ready === true && `RDKit ${status.version} 已就緒`}
      {status?.ready === false && (
        <p className="error">化學引擎載入失敗：{status.error}</p>
      )}
    </footer>
  );
}