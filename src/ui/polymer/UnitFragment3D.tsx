// 聚合物重複單元的 3D 片段（任務 024，D05）：連接點 `*` 換成甲基，當成小分子產生構象。
// 共聚物上方有「單元 N」選擇，一次只算目前選的那一種單元；端基不畫 3D，也不接在片段上。
// 單元片段的 3D 不存進化合物庫、不匯出（聚合物在化合物庫中維持以單元與比例儲存）。
import { useEffect, useState } from 'react';
import type { UnitFragment } from '../../core/polymer/unitFragment';
import { unitFragmentInWorker } from '../../worker/client';
import { Conformer3DCard } from '../structure/Conformer3DCard';

type Loaded = { smiles: string; state: { kind: 'ready'; fragment: UnitFragment; reactiveAtoms: number[] } | { kind: 'error'; message: string } };

interface Props {
  /** 全部單元的 SMILES（依單元清單順序，第一種是成分本身的結構）；一種時不顯示選擇 */
  units: readonly string[];
}

export function UnitFragment3D({ units }: Props) {
  const [picked, setPicked] = useState(0);
  const index = Math.min(picked, Math.max(units.length - 1, 0));
  const smiles = units[index] ?? '';
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (smiles.trim() === '' || !smiles.includes('*')) return;
    let cancelled = false;
    void unitFragmentInWorker(smiles).then((outcome) => {
      if (cancelled) return;
      if (!outcome) setLoaded({ smiles, state: { kind: 'error', message: '無法啟動結構計算，請稍後再試。' } });
      else if (!outcome.ok) setLoaded({ smiles, state: { kind: 'error', message: outcome.message } });
      else setLoaded({ smiles, state: { kind: 'ready', fragment: outcome.fragment, reactiveAtoms: outcome.reactiveAtoms } });
    });
    return () => {
      cancelled = true;
    };
  }, [smiles]);

  const current = loaded?.smiles === smiles ? loaded.state : null;
  return (
    <div className="unit-fragment-3d">
      {units.length > 1 && (
        <div className="conformer-select">
          <label htmlFor="unit-fragment-pick">單元</label>
          <select id="unit-fragment-pick" value={index} onChange={(e) => setPicked(Number(e.target.value))}>
            {units.map((_, i) => (
              <option key={i} value={i}>
                單元 {i + 1}
              </option>
            ))}
          </select>
        </div>
      )}
      {current?.kind === 'ready' ? (
        <Conformer3DCard
          structure={{ valid: true, molblock: current.fragment.molblock, canonicalSmiles: current.fragment.canonicalSmiles }}
          unit={{ cappedAtoms: current.fragment.cappedAtoms, reactiveAtoms: current.reactiveAtoms }}
        />
      ) : current?.kind === 'error' ? (
        <section className="card conformer-card">
          <h2>3D 結構（重複單元片段）</h2>
          <p className="structure-notice" role="status">{current.message}</p>
        </section>
      ) : (
        <p role="status">正在準備單元片段…</p>
      )}
    </div>
  );
}
