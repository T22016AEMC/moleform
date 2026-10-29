// 主執行緒與化學 Worker 之間的訊息格式。
import type { StructureValidation } from '../core/structure/validate';

export interface StatusRequest {
  type: 'status';
  id: number;
}

/** 驗證 SMILES 或 Molfile（自動判斷格式） */
export interface ValidateRequest {
  type: 'validate';
  id: number;
  input: string;
}

/** 計算平均分子量（配方換算用，不顯示在畫面上，D09） */
export interface WeightRequest {
  type: 'weight';
  id: number;
  smiles: string;
}

export type ChemRequest = StatusRequest | ValidateRequest | WeightRequest;

export type ChemResponse =
  | { type: 'weight'; id: number; ok: true; weight: number | null }
  | { type: 'weight'; id: number; ok: false; error: string }
  | { type: 'status'; id: number; ready: true; version: string }
  | { type: 'status'; id: number; ready: false; error: string }
  | { type: 'validate'; id: number; ok: true; result: StructureValidation }
  | { type: 'validate'; id: number; ok: false; error: string };

export function isChemRequest(value: unknown): value is ChemRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  if (typeof request.id !== 'number' || !Number.isSafeInteger(request.id)) return false;
  if (request.type === 'status') return true;
  if (request.type === 'weight') return typeof request.smiles === 'string';
  return request.type === 'validate' && typeof request.input === 'string';
}
