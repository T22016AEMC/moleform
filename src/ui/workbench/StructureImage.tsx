// 結構的 2D 圖（RDKit 在 Worker 產生 SVG）：成分縮圖與成分詳細彈窗共用，同一張圖只畫一次。
import { useEffect, useState } from 'react';
import { DEFAULT_MARK_COLOR } from '../../core/crosslink/draw';
import { drawStructureInWorker, type DrawnStructure } from '../../worker/client';

const cache = new Map<string, DrawnStructure>();

/** theme.css 的強調色（反應原子標記用） */
function accentColor(): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || DEFAULT_MARK_COLOR;
  } catch {
    return DEFAULT_MARK_COLOR;
  }
}

export interface DrawOptions {
  /** Molfile 或 SMILES */
  source: string;
  width: number;
  height: number;
  /** 標出反應原子（編號從 1 起算） */
  mark?: boolean;
  /** 聚合物的重複單元 */
  polymer?: boolean;
}

type DrawState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'done'; drawn: DrawnStructure };

export function useStructureDrawing({ source, width, height, mark = false, polymer = false }: DrawOptions): DrawState {
  const key = JSON.stringify([source, width, height, mark, polymer]);
  const [state, setState] = useState<{ key: string; value: DrawState } | null>(null);

  useEffect(() => {
    const cached = cache.get(key);
    if (cached) {
      setState({ key, value: { kind: 'done', drawn: cached } });
      return;
    }
    if (source.trim() === '') {
      setState({ key, value: { kind: 'failed' } });
      return;
    }
    let cancelled = false;
    void drawStructureInWorker({ source, width, height, color: accentColor(), mark, polymer }).then((drawn) => {
      if (cancelled) return;
      if (drawn?.svg) {
        cache.set(key, drawn);
        setState({ key, value: { kind: 'done', drawn } });
      } else {
        setState({ key, value: { kind: 'failed' } });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key, source, width, height, mark, polymer]);

  return state?.key === key ? state.value : { kind: 'loading' };
}

interface ImageProps extends DrawOptions {
  /** 替代文字（圖是裝飾性質的縮圖時，仍提供名稱給輔助工具） */
  label: string;
  className?: string;
}

export function StructureImage({ label, className, ...options }: ImageProps) {
  const state = useStructureDrawing(options);
  const style = { width: options.width, height: options.height };
  if (state.kind === 'done' && state.drawn.svg) {
    return <div className={`structure-image ${className ?? ''}`} style={style} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: state.drawn.svg }} />;
  }
  return (
    <div className={`structure-image structure-image-empty ${className ?? ''}`} style={style} role="img" aria-label={label}>
      <small>{state.kind === 'loading' ? '繪製中…' : '無法繪圖'}</small>
    </div>
  );
}
