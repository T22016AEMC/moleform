// 桌面版 preload 暴露的引擎橋接（任務 I01）。純網頁（npm run dev、GitHub Pages）沒有它，getBridge() 回傳 null。
// 網頁只拿得到 call／status 兩個函式；權杖、埠、白名單檢查都在桌面主程式端（desktop/bridge.cjs）。

/** 引擎「值、單位、來源、狀態」物件（D62） */
export interface EngineQuantity {
  value: number | null;
  unit: string;
  source: string;
  status: 'measured' | 'literature' | 'fitted' | 'predicted' | 'assumed' | 'missing';
}

export type EngineReply = { ok: true; status: number; body: Record<string, unknown> } | { ok: false; error: string };

export interface EngineStatus {
  state: 'not-started' | 'starting' | 'ready' | 'unavailable';
  error?: string;
}

export interface MoleformEngineBridge {
  call(path: string, body: Record<string, unknown>): Promise<EngineReply>;
  status(): Promise<EngineStatus>;
}

declare global {
  interface Window {
    moleformEngine?: MoleformEngineBridge;
  }
}

export function getBridge(): MoleformEngineBridge | null {
  return typeof window !== 'undefined' && window.moleformEngine ? window.moleformEngine : null;
}
