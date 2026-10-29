// 主執行緒與化學 Worker 之間的訊息格式。
import type { CrosslinkComponent, CrosslinkResult } from '../core/crosslink/types';
import type { FractionBasis, PolymerUnit, RepeatUnitAnalysis } from '../core/polymer/types';
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

/** 分析均聚物的重複單元：連接點規則與 M_unit（任務 015；M_unit 只用於計算，D09） */
export interface RepeatUnitRequest {
  type: 'repeatUnit';
  id: number;
  smiles: string;
  /** 共聚物的單元與比例基準（任務 020）；省略＝均聚物 */
  units?: PolymerUnit[];
  fractionBasis?: FractionBasis;
}

/** 交聯第 0 層：官能基辨識、配對、判定，並畫出參與反應成分的反應原子標記圖（任務 016） */
export interface CrosslinkRequest {
  type: 'crosslink';
  id: number;
  components: CrosslinkComponent[];
  /** 標記用的強調色（#rrggbb，來自 theme.css） */
  color: string;
}

/** 結構（Molfile 或 SMILES）上已登錄反應官能基的反應原子，供 3D 標記（任務 016） */
export interface ReactiveAtomsRequest {
  type: 'reactiveAtoms';
  id: number;
  source: string;
}

/** 畫出結構的 2D 圖（SVG）；mark 為 true 時標出反應原子（成分縮圖與詳細彈窗，任務 018） */
export interface DrawRequest {
  type: 'draw';
  id: number;
  source: string;
  width: number;
  height: number;
  /** 標記用的強調色（#rrggbb，來自 theme.css） */
  color: string;
  mark: boolean;
  /** 聚合物的重複單元：標記時排除連接點 */
  polymer: boolean;
}

export type ChemRequest = StatusRequest | ValidateRequest | WeightRequest | RepeatUnitRequest | CrosslinkRequest | ReactiveAtomsRequest | DrawRequest;

export type ChemResponse =
  | { type: 'crosslink'; id: number; ok: true; result: CrosslinkResult; svgs: Record<string, string> }
  | { type: 'crosslink'; id: number; ok: false; error: string }
  | { type: 'draw'; id: number; ok: true; svg: string | null; marked: number }
  | { type: 'draw'; id: number; ok: false; error: string }
  | { type: 'reactiveAtoms'; id: number; ok: true; atoms: number[] }
  | { type: 'reactiveAtoms'; id: number; ok: false; error: string }
  | { type: 'repeatUnit'; id: number; ok: true; analysis: RepeatUnitAnalysis }
  | { type: 'repeatUnit'; id: number; ok: false; error: string }
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
  if (request.type === 'weight' || request.type === 'repeatUnit') return typeof request.smiles === 'string';
  if (request.type === 'crosslink') return Array.isArray(request.components) && typeof request.color === 'string';
  if (request.type === 'reactiveAtoms') return typeof request.source === 'string';
  if (request.type === 'draw') {
    return typeof request.source === 'string' && typeof request.width === 'number' && typeof request.height === 'number'
      && typeof request.color === 'string' && typeof request.mark === 'boolean' && typeof request.polymer === 'boolean';
  }
  return request.type === 'validate' && typeof request.input === 'string';
}
