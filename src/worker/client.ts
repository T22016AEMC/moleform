import type { CrosslinkComponent, CrosslinkResult } from '../core/crosslink/types';
import type { PolymerSpec, RepeatUnitAnalysis } from '../core/polymer/types';
import type { UnitFragment } from '../core/polymer/unitFragment';
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

/** 請 Worker 計算平均分子量；失敗或無法計算時回傳 null。只用於配方換算，不顯示（D09）。 */
export async function averageWeightOf(smiles: string): Promise<number | null> {
  const response = await request((id) => ({ type: 'weight', id, smiles }));
  return response.type === 'weight' && response.ok ? response.weight : null;
}

/** 請 Worker 分析重複單元（連接點規則、M_unit）；Worker 失敗時回傳 null。M_unit 只用於計算，不顯示（D09）。 */
export async function analyzeRepeatUnitInWorker(smiles: string, spec?: Pick<PolymerSpec, 'units' | 'fractionBasis' | 'endGroups'> | null): Promise<RepeatUnitAnalysis | null> {
  const response = await request((id) => ({
    type: 'repeatUnit',
    id,
    smiles,
    ...(spec?.units ? { units: spec.units } : {}),
    ...(spec?.fractionBasis ? { fractionBasis: spec.fractionBasis } : {}),
    ...(spec?.endGroups ? { endGroups: spec.endGroups } : {}),
  }));
  return response.type === 'repeatUnit' && response.ok ? response.analysis : null;
}

/** 請 Worker 中的 RDKit 驗證 SMILES 或 Molfile。 */
export async function validateInput(input: string): Promise<ValidateOutcome> {
  const response = await request((id) => ({ type: 'validate', id, input }));
  if (response.type === 'validate') return response.ok ? { ok: true, result: response.result } : { ok: false, error: response.error };
  return { ok: false, error: response.type === 'status' && !response.ready ? response.error : '收到非預期的回應' };
}

export type CrosslinkOutcome = { ok: true; result: CrosslinkResult; svgs: Record<string, string> } | { ok: false; error: string };

/** 請 Worker 做交聯第 0 層分析並畫出反應原子標記圖（任務 016） */
export async function analyzeCrosslinkInWorker(components: CrosslinkComponent[], color: string): Promise<CrosslinkOutcome> {
  const response = await request((id) => ({ type: 'crosslink', id, components, color }));
  if (response.type === 'crosslink') return response.ok ? { ok: true, result: response.result, svgs: response.svgs } : { ok: false, error: response.error };
  return { ok: false, error: response.type === 'status' && !response.ready ? response.error : '收到非預期的回應' };
}

export interface DrawnStructure {
  /** 結構無法解析時為 null */
  svg: string | null;
  /** 標出的反應原子數 */
  marked: number;
}

/** 畫出結構的 2D 圖（成分縮圖、成分詳細彈窗，任務 018）；Worker 失敗時回傳 null */
export async function drawStructureInWorker(options: {
  source: string;
  width: number;
  height: number;
  color: string;
  mark: boolean;
  polymer: boolean;
}): Promise<DrawnStructure | null> {
  const response = await request((id) => ({ type: 'draw', id, ...options }));
  return response.type === 'draw' && response.ok ? { svg: response.svg, marked: response.marked } : null;
}

export type UnitFragmentOutcome = { ok: true; fragment: UnitFragment; reactiveAtoms: number[] } | { ok: false; message: string };

/** 重複單元的 3D 片段（連接點改成甲基）與反應原子（任務 024）；Worker 失敗時回傳 null */
export async function unitFragmentInWorker(smiles: string): Promise<UnitFragmentOutcome | null> {
  const response = await request((id) => ({ type: 'unitFragment', id, smiles }));
  if (response.type !== 'unitFragment' || !response.ok) return null;
  return response.fragment ? { ok: true, fragment: response.fragment, reactiveAtoms: response.reactiveAtoms } : { ok: false, message: response.message };
}

/** 結構上已登錄反應官能基的反應原子（0 起算）；Worker 失敗時回傳 null */
export async function reactiveAtomsInWorker(source: string): Promise<number[] | null> {
  const response = await request((id) => ({ type: 'reactiveAtoms', id, source }));
  return response.type === 'reactiveAtoms' && response.ok ? response.atoms : null;
}
