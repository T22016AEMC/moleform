// 右欄的可展開／收合區塊（任務 018）。預設展開；展開狀態只存在畫面中（由工作台持有，不寫入任何儲存）。
import { createContext, useContext, useState, type ReactNode } from 'react';

export interface BlockState {
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
}

/** 工作台提供；沒有提供時（例如單獨預覽）每個區塊自己記住展開狀態 */
export const BlockStateContext = createContext<BlockState | null>(null);

export function useBlockStateStore(): BlockState {
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  return {
    isOpen: (id) => !closed.has(id),
    toggle: (id) =>
      setClosed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
  };
}

interface Props {
  id: string;
  title: string;
  children: ReactNode;
}

export function ResultBlock({ id, title, children }: Props) {
  const shared = useContext(BlockStateContext);
  const [localOpen, setLocalOpen] = useState(true);
  const open = shared ? shared.isOpen(id) : localOpen;
  const toggle = () => (shared ? shared.toggle(id) : setLocalOpen((v) => !v));
  const panelId = `block-${id}`;
  return (
    <section className="card result-block" aria-labelledby={`${panelId}-title`}>
      <h2 id={`${panelId}-title`}>
        <button type="button" className="result-block-toggle" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
          <span aria-hidden="true" className="result-block-chevron">{open ? '▾' : '▸'}</span>
          {title}
        </button>
      </h2>
      <div id={panelId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
