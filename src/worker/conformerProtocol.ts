// 主執行緒與 3D 構象 Worker 之間的訊息格式（與 RDKit 的 chem.worker 分開，3D 計算時不卡結構驗證）。
import type { ConformerBatch } from '../core/conformer/types';

export interface GenerateRequest {
  type: 'generate';
  id: number;
  /** 任務 010 驗證後的 V2000 Molfile */
  molblock: string;
  seed: number;
  /** 累計目標構象數；同一個結構與種子會沿用 Worker 內的工作階段繼續產生 */
  target: number;
}

export type ConformerRequest = GenerateRequest;

export type ConformerResponse =
  | { type: 'progress'; id: number; stage: 'loading' | 'generating'; done: number; total: number }
  | { type: 'result'; id: number; ok: true; batch: ConformerBatch; resourcesMs: number }
  | { type: 'result'; id: number; ok: false; error: string };

export function isConformerRequest(value: unknown): value is ConformerRequest {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    r.type === 'generate' &&
    typeof r.id === 'number' &&
    Number.isSafeInteger(r.id) &&
    typeof r.molblock === 'string' &&
    typeof r.seed === 'number' &&
    typeof r.target === 'number'
  );
}
