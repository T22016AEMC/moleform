import type { StructureValidation } from '../core/structure/validate';
import type { ChemRequest, ChemResponse } from './protocol';

export type ChemStatus = { ready: true; version: string } | { ready: false; error: string };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (response: ChemResponse) => void>();

function failAll(error: string) {
  for (const [id, resolve] of pending) {
    resolve({ type: 'status', id, ready: false, error });
  }
  pending.clear();
}

function getWorker(): Worker {
  if (!worker) {
    const w = new Worker(new URL('./chem.worker.ts', import.meta.url), { type: 'module' });
    w.addEventListener('message', (event: MessageEvent<ChemResponse>) => {
      const resolve = pending.get(event.data.id);
      if (!resolve) return;
      pending.delete(event.data.id);
      resolve(event.data);
    });
    w.addEventListener('error', (event: ErrorEvent) => {
      // Worker 掛掉後丟棄它，下次請求會重新建立
      w.terminate();
      worker = null;
      failAll(event.message || 'Worker 發生錯誤');
    });
    worker = w;
  }
  return worker;
}

/** 送出請求並等待同編號的回應；Worker 本身出錯時回傳 status 失敗回應。 */
function request(build: (id: number) => ChemRequest): Promise<ChemResponse> {
  return new Promise((resolve) => {
    const id = nextId++;
    try {
      const w = getWorker();
      pending.set(id, resolve);
      w.postMessage(build(id));
    } catch (e) {
      pending.delete(id);
      resolve({ type: 'status', id, ready: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

/** 詢問化學 Worker 的 RDKit 狀態；Worker 本身啟動失敗時回傳 ready: false。 */
export async function getChemStatus(): Promise<ChemStatus> {
  const response = await request((id) => ({ type: 'status', id }));
  if (response.type !== 'status') return { ready: false, error: '收到非預期的回應' };
  return response.ready ? { ready: true, version: response.version } : { ready: false, error: response.error };
}

export type ValidateOutcome = { ok: true; result: StructureValidation } | { ok: false; error: string };

/** 請 Worker 中的 RDKit 驗證 SMILES 或 Molfile。 */
export async function validateInput(input: string): Promise<ValidateOutcome> {
  const response = await request((id) => ({ type: 'validate', id, input }));
  if (response.type === 'validate') return response.ok ? { ok: true, result: response.result } : { ok: false, error: response.error };
  return { ok: false, error: response.type === 'status' && !response.ready ? response.error : '收到非預期的回應' };
}
