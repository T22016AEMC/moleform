// 交聯第 0、1 層的引擎呼叫（任務 I05）：交聯頁與第 1 層卡片的計算一律由 Python 引擎完成（PLAN 6A.3 第二步）。
// 這裡只做三件事：把介面狀態整理成引擎請求本文、經桌面橋接呼叫引擎、把回應還原成介面用的型別。不計算任何化學量。
// 引擎不可用（純網頁、啟動失敗、逾時）時回傳原因，由畫面顯示；不退回 TypeScript 計算（沿用 I01）。
// 配方換算（computeFormulation）、官能基量換回使用者單位（describeAmounts）與輸入欄位的即時驗證仍在 TypeScript（B 類，見 docs/reports/I05-結果.md）。
import type { CrosslinkComponent, CrosslinkResult } from '../../core/crosslink/types';
import type { Layer1Result, Layer1Setup } from '../../core/crosslink/layer1/layer1';
import type { PrepareOutcome } from '../../core/crosslink/layer1/prepare';
import type { ScanOption, ScanResult, ScanSettings } from '../../core/crosslink/layer1/stoich';
import type { Formulation, FormulationOutcome } from '../../core/formulation/types';
import { averageWeightOf, drawCrosslinkInWorker } from '../../worker/client';
import { getBridge } from './engineClient';

export type EngineOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

export const MESSAGE_NO_ENGINE = '需要桌面版與引擎';
const STATUS_POLL_MS = 300;
const STATUS_POLL_MAX = 100; // 最多等約 30 秒（引擎啟動通常 1 秒左右）

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 等引擎就緒；回傳 null 表示可用，否則回傳要顯示的原因 */
async function waitForEngine(): Promise<string | null> {
  const bridge = getBridge();
  if (!bridge) return MESSAGE_NO_ENGINE;
  for (let i = 0; i < STATUS_POLL_MAX; i++) {
    const s = await bridge.status();
    if (s.state === 'ready') return null;
    if (s.state === 'unavailable') return `引擎無法使用：${s.error ?? '未啟動'}`;
    await sleep(STATUS_POLL_MS);
  }
  return '引擎無法使用：啟動逾時';
}

/** 一次 POST；引擎以 HTTP 400 拒絕時，error 是引擎回報的原因 */
async function post(path: string, body: Record<string, unknown>): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string; rejected: boolean }> {
  const why = await waitForEngine();
  if (why !== null) return { ok: false, error: why, rejected: false };
  const reply = await getBridge()!.call(path, body);
  if (!reply.ok) return { ok: false, error: reply.error, rejected: false };
  if (reply.status !== 200 || reply.body.ok !== true) {
    const errors = Array.isArray(reply.body.errors) ? reply.body.errors.filter((e): e is string => typeof e === 'string') : [];
    return { ok: false, error: errors.length > 0 ? errors.join('；') : `引擎回應 HTTP ${reply.status}`, rejected: true };
  }
  return { ok: true, body: reply.body };
}

// ---------- 請求本文（純函式，可直接測試） ----------

/**
 * 第 0 層請求。小分子的每分子質量由呼叫端傳入（D04；來自 averageWeightOf，與配方換算同一來源）；
 * 引擎只接 SMILES（D03），所以不送 molfile。
 */
export function analyzeBody(components: readonly CrosslinkComponent[], molarMass: Readonly<Record<string, number | null | undefined>>): Record<string, unknown> {
  return {
    components: components.map((c) => {
      const m = molarMass[c.id];
      const polymer = c.canonicalSmiles.includes('*');
      return {
        id: c.id,
        name: c.name,
        category: c.category,
        canonicalSmiles: c.canonicalSmiles,
        ...(c.polymer ? { polymer: c.polymer } : {}),
        ...(!polymer && typeof m === 'number' && Number.isFinite(m) ? { molarMass: m } : {}),
      };
    }),
  };
}

/** 第 1 層輸入整理的請求：第 0 層結果（去掉只供繪圖的原子位點）、Solid 區成分、配方換算出的質量百分比 */
export function prepareBody(result: CrosslinkResult, formulation: Formulation, outcome: FormulationOutcome | null): Record<string, unknown> {
  const solidResult = outcome?.results.solid;
  const wtPct = solidResult ? Object.fromEntries(solidResult.components.map((c) => [c.id, c.wtPct.value ?? null])) : null;
  return {
    result: {
      pairs: result.pairs,
      components: result.components.map((c) => ({
        id: c.id,
        name: c.name,
        isPolymer: c.isPolymer,
        dp: c.dp,
        molarMass: c.molarMass,
        distribution: c.distribution,
        problem: c.problem,
        units: c.units ? c.units.map((u) => ({ smiles: u.smiles, molFraction: u.molFraction })) : null,
      })),
    },
    solid: {
      unit: formulation.solid.unit,
      // 用量有錯誤（NaN）時 wtPct 為 null，引擎在讀用量前就回報原因；這裡只避免 JSON 把 NaN 變成 null
      components: formulation.solid.components.map((c) => ({
        id: c.id,
        name: c.name,
        canonicalSmiles: c.canonicalSmiles,
        amount: Number.isFinite(c.amount) ? c.amount : 0,
        ...(c.isResin ? { isResin: true } : {}),
      })),
    },
    wtPct,
  };
}

/**
 * 固化預測的請求（P7-3）：與第 1 層輸入整理同一份第 0 層結果與質量百分比，另帶 Solid 區成分的分類、聚合物設定與揮發標記（混合 Tg 與 Td 比較需要）、
 * 各成分的 Mn（聚合物）或每分子質量（小分子）與硬化溫度（°C，null 表示不算最大轉化率）。引擎自己判斷第 1 層是否支援。
 */
export function cureBody(
  result: CrosslinkResult,
  formulation: Formulation,
  outcome: FormulationOutcome | null,
  mnById: Readonly<Record<string, number | null | undefined>>,
  cureTempC: number | null,
): Record<string, unknown> {
  const base = prepareBody(result, formulation, outcome) as { result: unknown; solid: { unit: string }; wtPct: unknown };
  return {
    result: base.result,
    solid: {
      unit: base.solid.unit,
      components: formulation.solid.components.map((c) => ({
        id: c.id,
        name: c.name,
        canonicalSmiles: c.canonicalSmiles,
        amount: Number.isFinite(c.amount) ? c.amount : 0,
        category: c.category,
        ...(c.isResin ? { isResin: true } : {}),
        ...(c.polymer ? { polymer: c.polymer } : {}),
        ...(c.volatileFlag ? { volatileFlag: true } : {}),
      })),
    },
    wtPct: base.wtPct,
    mn: Object.fromEntries(formulation.solid.components.map((c) => [c.id, mnById[c.id] ?? null])),
    ...(cureTempC !== null ? { cureTempC } : {}),
  };
}

// ---------- 呼叫 ----------

export interface CrosslinkAnalysis {
  result: CrosslinkResult;
  svgs: Record<string, string>;
}

/** 交聯第 0 層：小分子每分子質量 → 引擎分析 → Worker 繪反應原子標記圖 */
export async function analyzeCrosslinkViaEngine(components: readonly CrosslinkComponent[], color: string): Promise<EngineOutcome<CrosslinkAnalysis>> {
  const molarMass: Record<string, number | null> = {};
  await Promise.all(
    components
      .filter((c) => !c.canonicalSmiles.includes('*'))
      .map(async (c) => {
        molarMass[c.id] = await averageWeightOf(c.canonicalSmiles);
      }),
  );
  const reply = await post('/crosslink/analyze', analyzeBody(components, molarMass));
  if (!reply.ok) return { ok: false, error: reply.error };
  const { ok: _ok, ...rest } = reply.body;
  const result = rest as unknown as CrosslinkResult;
  // 小分子有使用者畫的 Molfile 時，標記圖用 Molfile 畫、編號換成 Molfile 的編號（與分子工具 3D 一致，P7-1B 修正 2）
  const displaySources: Record<string, string> = {};
  for (const c of components) if (c.molfile && !c.canonicalSmiles.includes('*')) displaySources[c.id] = c.molfile;
  const drawn = await drawCrosslinkInWorker(result, color, displaySources);
  if (!drawn.ok) return { ok: false, error: drawn.error };
  return { ok: true, value: { result, svgs: drawn.svgs } };
}

/** 第 1 層輸入整理（body 由 prepareBody 產生）：引擎判斷是否支援（不支援時 ok: false 並附原因，這不是呼叫錯誤） */
export async function prepareLayer1ViaEngine(body: Record<string, unknown>): Promise<EngineOutcome<PrepareOutcome>> {
  const reply = await post('/crosslink/prepare', body);
  if (!reply.ok) return { ok: false, error: reply.error };
  const b = reply.body;
  if (b.supported === false) return { ok: true, value: { ok: false, reason: String(b.reason ?? '') } };
  return {
    ok: true,
    value: {
      ok: true,
      setup: b.setup as Layer1Setup,
      ruleId: b.ruleId as string,
      solidUnit: b.solidUnit as string,
      items: b.items as Extract<PrepareOutcome, { ok: true }>['items'],
      masses: b.masses as Record<string, number>,
    },
  };
}

export interface Layer1Computed {
  /** 指定轉化率的結果；官能基或質量為 0 無法計算時為 null */
  result: Layer1Result | null;
  /** 化學計量配比後的配方與結果；任一側官能基為 0 時為 null */
  stoichiometric: { setup: Layer1Setup; result: Layer1Result | null } | null;
}

/** 第 1 層（含理論配比）。conversion 為 0–1 */
export async function computeLayer1ViaEngine(setup: Layer1Setup, conversion: number): Promise<EngineOutcome<Layer1Computed>> {
  const reply = await post('/crosslink/layer1', { setup, conversion, stoichiometric: true });
  if (!reply.ok) {
    // 引擎對「官能基總量或固體總質量不是正數」回 400；TypeScript 版此情況是 null，畫面顯示「兩類官能基必須都有」
    if (reply.rejected && reply.error.startsWith('官能基總量')) return { ok: true, value: { result: null, stoichiometric: null } };
    return { ok: false, error: reply.error };
  }
  return {
    ok: true,
    value: {
      result: reply.body.result as Layer1Result,
      stoichiometric: (reply.body.stoichiometric as Layer1Computed['stoichiometric']) ?? null,
    },
  };
}

// ---------- 固化預測（P7-3） ----------

/** 引擎 `/crosslink/cure` 各項的回應（只列介面用到的欄位）；缺值時 status 為 missing 並附 reason */
export interface CureTgPoint {
  tgK: number;
  tgC: number;
}
export interface CureTgInfEnd extends CureTgPoint {
  kCrl: number;
  source: string;
}
export type CureTg0 = { status: 'predicted'; tgK: number; tgC: number; model: string; messages: string[] } | { status: 'missing'; reason: string; model: string; messages: string[] };
export type CureMCrl = { status: 'predicted'; value: number; unit: string } | { status: 'missing'; reason: string };
export type CureTgInf =
  | { status: 'predicted'; low: CureTgInfEnd; high: CureTgInfEnd; deltaLowK: number; deltaHighK: number }
  | { status: 'missing'; reason: string };
export type CurePostCure =
  | {
      status: 'predicted';
      lambda: { low: number; high: number };
      table: { conversion: number; low: CureTgPoint; high: CureTgPoint }[];
      minFullCureTemp: { low: CureTgPoint; high: CureTgPoint };
      maxConversion: { cureTempC: number; cureTempK: number; low: number; high: number } | null;
    }
  | { status: 'missing'; reason: string };
export interface CureTdRow {
  name: string;
  status: 'ok' | 'missing' | 'not-applicable';
  tdK: number | null;
  tdC: number | null;
  reason: string | null;
}
export interface CureTd {
  model: string;
  components: CureTdRow[];
  lowest: { name: string; tdK: number; tdC: number } | null;
  notCompared: { name: string; reason: string }[];
  excluded: { name: string; reason: string }[];
  warning: { status: 'triggered' | 'clear' | 'cannot-judge'; text: string };
}
export interface CureData {
  supported: true;
  ruleId: string;
  tg0: CureTg0;
  mCrl: CureMCrl;
  tgInf: CureTgInf;
  eq614: { status: 'missing'; reason: string; model: string };
  postCure: CurePostCure;
  td: CureTd;
  models: { tg0: string; tgInf: string; eq614: string; postCure: string };
  notes: { tgInf: string; kUnit: string; mCrl: string; lambda: string; fullCure: string; maxConversion: string; td: string };
}
export type CureOutcome = { supported: false; reason: string } | CureData;

/** 固化預測（body 由 cureBody 產生）：第 1 層不支援的體系回 supported: false 並附同一個原因（不是呼叫錯誤） */
export async function computeCureViaEngine(body: Record<string, unknown>): Promise<EngineOutcome<CureOutcome>> {
  const reply = await post('/crosslink/cure', body);
  if (!reply.ok) return { ok: false, error: reply.error };
  if (reply.body.supported === false) return { ok: true, value: { supported: false, reason: String(reply.body.reason ?? '') } };
  return { ok: true, value: reply.body as unknown as CureData };
}

/** 比例掃描（參考趨勢）。conversion 為 0–1；settings 已由呼叫端用 checkScanSettings 檢查過 */
export async function scanLayer1ViaEngine(setup: Layer1Setup, conversion: number, option: Pick<ScanOption, 'property' | 'direction'>, settings: ScanSettings): Promise<EngineOutcome<ScanResult | null>> {
  const reply = await post('/crosslink/layer1/scan', { setup, conversion, option: { property: option.property, direction: option.direction }, settings });
  if (!reply.ok) {
    if (reply.rejected && reply.error.startsWith('官能基總量')) return { ok: true, value: null };
    return { ok: false, error: reply.error };
  }
  const { ok: _ok, disclaimer: _d, model: _m, ...scan } = reply.body;
  return { ok: true, value: scan as unknown as ScanResult };
}
