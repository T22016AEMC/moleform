// 3D 構象 Worker 的 client。Worker 只在第一次「產生 3D」時才建立（不拖慢首頁）；取消時直接結束 Worker，下次再重新建立。
import type { ConformerBatch } from '../core/conformer/types';
import type { ConformerResponse, GenerateRequest } from './conformerProtocol';

export interface GenerateProgress {
  stage: 'loading' | 'generating';
  done: number;
  total: number;
}

export type GenerateOutcome =
  | { ok: true; batch: ConformerBatch; resourcesMs: number; wallMs: number }
  | { ok: false; cancelled: boolean; error: string };

export interface GenerateHandle {
  promise: Promise<GenerateOutcome>;
  cancel: () => void;
}

let worker: Worker | null = null;
let nextId = 1;

/** 開始計算。回傳的 cancel() 會結束 Worker（工作階段隨之消失，之後的請求會重新計算）。 */
export function generateConformers(
  molblock: string,
  seed: number,
  target: number,
  onProgress: (progress: GenerateProgress) => void,
): GenerateHandle {
  let settle: (outcome: GenerateOutcome) => void = () => {};
  const promise = new Promise<GenerateOutcome>((resolve) => {
    settle = resolve;
  });
  const startedAt = performance.now();
  const id = nextId++;

  let w: Worker;
  try {
    worker ??= new Worker(new URL('./conformer.worker.ts', import.meta.url), { type: 'module' });
    w = worker;
  } catch (e) {
    worker = null;
    settle({ ok: false, cancelled: false, error: e instanceof Error ? e.message : String(e) });
    return { promise, cancel: () => {} };
  }

  const cleanup = () => {
    w.removeEventListener('message', onMessage);
    w.removeEventListener('error', onError);
  };
  const onMessage = (event: MessageEvent<ConformerResponse>) => {
    const data = event.data;
    if (data.id !== id) return;
    if (data.type === 'progress') {
      onProgress({ stage: data.stage, done: data.done, total: data.total });
      return;
    }
    cleanup();
    if (data.ok) settle({ ok: true, batch: data.batch, resourcesMs: data.resourcesMs, wallMs: performance.now() - startedAt });
    else settle({ ok: false, cancelled: false, error: data.error });
  };
  const onError = (event: ErrorEvent) => {
    cleanup();
    w.terminate();
    if (worker === w) worker = null;
    settle({ ok: false, cancelled: false, error: event.message || 'Worker 發生錯誤' });
  };
  w.addEventListener('message', onMessage);
  w.addEventListener('error', onError);

  const request: GenerateRequest = { type: 'generate', id, molblock, seed, target };
  w.postMessage(request);

  return {
    promise,
    cancel: () => {
      cleanup();
      w.terminate();
      if (worker === w) worker = null;
      settle({ ok: false, cancelled: true, error: '已取消' });
    },
  };
}
