// 主執行緒與化學 Worker 之間的訊息格式。

export interface StatusRequest {
  type: 'status';
  id: number;
}

export type ChemRequest = StatusRequest;

export type ChemResponse =
  | { type: 'status'; id: number; ready: true; version: string }
  | { type: 'status'; id: number; ready: false; error: string };

export function isChemRequest(value: unknown): value is ChemRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return request.type === 'status' && typeof request.id === 'number' && Number.isSafeInteger(request.id);
}