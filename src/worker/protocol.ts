// 主執行緒與化學 Worker 之間的訊息格式。
import type { CrosslinkResult } from '../core/crosslink/types';
import type { UnitFragment } from '../core/polymer/unitFragment';
import type { EndGroups, FractionBasis, PolymerUnit, RepeatUnitAnalysis } from '../core/polymer/types';
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
  /** 兩端的端基（任務 022）；省略＝不填 */
  endGroups?: EndGroups;
}

/**
 * 畫出交聯第 0 層參與反應成分的反應原子標記圖（任務 016；I05 起第 0 層的計算由 Python 引擎完成，Worker 只負責繪圖）。
 * result 是引擎回傳的第 0 層結果（只用到各成分的結構與 markedAtoms、markedUnitAtoms、markedEndAtoms）。
 */
export interface CrosslinkDrawRequest {
  type: 'crosslinkDraw';
  id: number;
  result: CrosslinkResult;
  /** 標記用的強調色（#rrggbb，來自 theme.css） */
  color: string;
  /**
   * 成分 id → 顯示用結構（使用者畫的 Molfile）。有給且與引擎用的 SMILES 是同一個分子時，改畫這個結構，
   * 引擎的 SMILES 原子編號換成這個結構的編號（與「分子工具」3D 畫面一致）；對應不到時照舊畫 SMILES（P7-1B 修正 2）
   */
  displaySources?: Record<string, string>;
}

/** 結構（Molfile 或 SMILES）上反應官能基的反應原子，供 3D 標記（任務 016）；groupIds：只標這些官能基（目前配方中配到對的，P7-1B 修正 2） */
export interface ReactiveAtomsRequest {
  type: 'reactiveAtoms';
  id: number;
  source: string;
  groupIds?: string[];
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
  /** 標記時只標這些官能基（目前配方中配到對的）；沒給時標所有已登錄的官能基 */
  groupIds?: string[];
}

/** 重複單元的 3D 片段（任務 024）：連接點改成甲基；同時回傳反應原子（以原單元計算，排除連接點，編號與 2D 單元圖相同） */
export interface UnitFragmentRequest {
  type: 'unitFragment';
  id: number;
  smiles: string;
  /** 反應原子只標這些官能基（目前配方中配到對的）；沒給時標所有已登錄的官能基 */
  groupIds?: string[];
}

export type ChemRequest = StatusRequest | ValidateRequest | WeightRequest | RepeatUnitRequest | CrosslinkDrawRequest | ReactiveAtomsRequest | DrawRequest | UnitFragmentRequest;

export type ChemResponse =
  | { type: 'unitFragment'; id: number; ok: true; fragment: UnitFragment | null; message: string; reactiveAtoms: number[] }
  | { type: 'unitFragment'; id: number; ok: false; error: string }
  | { type: 'crosslinkDraw'; id: number; ok: true; svgs: Record<string, string> }
  | { type: 'crosslinkDraw'; id: number; ok: false; error: string }
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

const optionalStrings = (v: unknown) => v === undefined || (Array.isArray(v) && v.every((x) => typeof x === 'string'));

export function isChemRequest(value: unknown): value is ChemRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  if (typeof request.id !== 'number' || !Number.isSafeInteger(request.id)) return false;
  if (request.type === 'status') return true;
  if (request.type === 'weight' || request.type === 'repeatUnit') return typeof request.smiles === 'string';
  if (request.type === 'crosslinkDraw') {
    const result = request.result as { components?: unknown } | null;
    return !!result && typeof result === 'object' && Array.isArray(result.components) && typeof request.color === 'string';
  }
  if (request.type === 'reactiveAtoms') return typeof request.source === 'string' && optionalStrings(request.groupIds);
  if (request.type === 'unitFragment') return typeof request.smiles === 'string' && optionalStrings(request.groupIds);
  if (request.type === 'draw') {
    return typeof request.source === 'string' && typeof request.width === 'number' && typeof request.height === 'number'
      && typeof request.color === 'string' && typeof request.mark === 'boolean' && typeof request.polymer === 'boolean'
      && optionalStrings(request.groupIds);
  }
  return request.type === 'validate' && typeof request.input === 'string';
}
