import type { ChemRequest, ChemResponse } from './protocol';

export type ChemStatus = { ready: true; version: string } | { ready: false; error: string };

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  worker ??= new Worker(new URL('./chem.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/** 詢問化學 Worker 的 RDKit 狀態；Worker 本身啟動失敗時回傳 ready: false。 */
export function getChemStatus(): Promise<ChemStatus> {
  return new Promise((resolve) => {
    let w: Worker;
    try {
      w = getWorker();
    } catch (e) {
      resolve({ ready: false, error: e instanceof Error ? e.message : String(e) });
      return;
    }
    const id = nextId++;
    const onMessage = (event: MessageEvent<ChemResponse>) => {
      if (event.data.type !== 'status' || event.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      resolve(event.data.ready ? { ready: true, version: event.data.version } : { ready: false, error: event.data.error });
    };
    const onError = (event: ErrorEvent) => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      resolve({ ready: false, error: event.message || 'Worker 發生錯誤' });
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    const request: ChemRequest = { type: 'status', id };
    w.postMessage(request);
  });
}