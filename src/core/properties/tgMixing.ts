// 成分 Tg（Fox–Flory；小分子不計 Tg，只給 Tm，D56）與混合配方的未固化 Tg（Fox 式）（任務 034，Phase 6.7 的 Tg 部分）。
// 只混聚合物與寡聚物的 Solid 成分，用質量分率；小分子（含 SBI 二酚）不參與混合、輸出列為「未計入」；Catalyst/Initiator（D26）與標記「揮發或分解」的成分不混；Liquid 區不混。
// 任一參與混合的成分算不出 Tg（缺基團、缺 K、無 Tm、無 Mn）就回報「缺成分 Tg：名稱」，不猜值、不略過，
// 並另外輸出去除這些成分後的「部分混合值」，明確標示非完整配方。
// 分子量只用於計算（D09）；聚合物的 Mn 依 D46、D47、D50 的現行算法（analyzePolymerUnits＋resolvePolymer）取得，不改動。
// 不使用任何使用者實測值當輸入（D02）。純 TypeScript（RDKit 由呼叫端傳入）。
import { TG_K_ROWS, type TgKRow } from '../data/tgMnData';
import { computeFormulation } from '../formulation/compute';
import { averageMolecularWeight } from '../formulation/molecularWeight';
import type { Component, Formulation } from '../formulation/types';
import { analyzePolymerUnits } from '../polymer/copolymer';
import { resolvePolymer } from '../polymer/convert';
import type { RDKitModule } from '../rdkit/types';
import { UNIFIED_NOTE } from '../result';
import { computeJoback } from './jobackTbTf';
import { computeTg } from './tgGroupContribution';

export const FOX_FLORY_MODEL = 'Fox–Flory：Tg = Tg∞ − K/Mn（van Krevelen 式 6.10，書頁 146；原出處 Fox and Flory 1950）。K 按樹脂類別由文獻資料擬合（tg_flory_k.csv），不跨類別';
export const FOX_MIX_MODEL =
  'Fox 混合式：1/Tg = Σ wᵢ/Tgᵢ（wᵢ 為質量分率）。書中沒有此式、Fox 1956 原文未核對；由 Gordon–Taylor 1952 式 (1)（原文頁 493）取 k = Tg₁/Tg₂ 導出；屬近似（假設成分互溶、混合體積加成）';
export const SMALL_MOLECULE_TG_MODEL = '小分子不計算 Tg，只給 Tm（Joback，D52；有文獻熔點時另標文獻值）（D56）';
export const SMALL_MOLECULE_TG_NA = '不適用（小分子只有 Tm，D56）';
export const SMALL_MOLECULE_WARNING = '未計入小分子的增塑效應，混合 Tg 可能偏高';
export const CATALYST_CATEGORY = 'Catalyst/Initiator';
export const FLAG_LOW = '低可信度';
export const FLAG_EXTRAPOLATED = '外推，未驗證';
export const FLAG_CALIBRATED = '含校準基團';

// ---------- 公式 ----------

/** Fox–Flory：Tg = Tg∞ − K/Mn（K 單位 K·g/mol、Mn 單位 g/mol） */
export function foxFlory(tgInfK: number, k: number, mn: number): number {
  if (!(mn > 0)) throw new Error('Mn 必須大於 0');
  return tgInfK - k / mn;
}

/** Fox 混合：1/Tg = Σ wᵢ/Tgᵢ；質量分率會先正規化為合計 1。單一成分回傳成分 Tg */
export function foxMix(items: readonly { w: number; tgK: number }[]): number {
  if (items.length === 0) throw new Error('沒有成分可混合');
  let total = 0;
  for (const it of items) {
    if (!(it.w > 0) || !(it.tgK > 0)) throw new Error('質量分率與 Tg 都必須大於 0');
    total += it.w;
  }
  const inv = items.reduce((s, it) => s + it.w / total / it.tgK, 0);
  return 1 / inv;
}

// ---------- 成分 Tg ----------

export interface ComponentTg {
  id: string;
  name: string;
  category: string;
  kind: 'polymer' | 'small';
  /** 在 Solid 區的質量分率（0–1）；算不出時為 null */
  solidFraction: number | null;
  /** not-applicable：小分子只有 Tm、不計 Tg（D56），不參與混合 */
  status: 'ok' | 'missing' | 'not-applicable';
  /** 成分 Tg（K）；小分子為 null */
  tgK: number | null;
  /** 聚合物：基團貢獻的 Tg∞（來源 a） */
  tgInfGroupK: number | null;
  /** 聚合物：用到的 K 與 Mn（只供驗證文件，D09） */
  kUsed: number | null;
  mn: number | null;
  /** 小分子：Joback Tm（K；只供顯示） */
  tmK: number | null;
  /** 低可信度、外推，未驗證、含校準基團等標記（D55） */
  flags: string[];
  /** 缺成分 Tg 時的原因 */
  missingReason: string | null;
  resinClass: string | null;
}

export type ExcludedKind = 'catalyst' | 'volatile';
export interface ExcludedComponent {
  id: string;
  name: string;
  kind: ExcludedKind;
  reason: string;
}

export interface TgKTable {
  rows: readonly TgKRow[];
}

const blank = (c: Component, kind: 'polymer' | 'small', fraction: number | null): ComponentTg => ({
  id: c.id,
  name: c.name,
  category: c.category,
  kind,
  solidFraction: fraction,
  status: 'missing',
  tgK: null,
  tgInfGroupK: null,
  kUsed: null,
  mn: null,
  tmK: null,
  flags: [],
  missingReason: null,
  resinClass: null,
});

const stripMaps = (smiles: string) => smiles.replace(/\[\*:\d+\]/g, '*');

function canonicalNoMaps(RDKit: RDKitModule, smiles: string): string | null {
  let mol;
  try {
    mol = RDKit.get_mol(stripMaps(smiles));
  } catch {
    return null;
  }
  if (!mol) return null;
  try {
    return mol.is_valid() ? mol.get_smiles() : null;
  } finally {
    mol.delete();
  }
}

/** 重複單元與哪個樹脂類別的代表單元相同（逐字比對，不近似）；找不到回傳 null */
export function findKClass(RDKit: RDKitModule, unitSmiles: string, rows: readonly TgKRow[] = TG_K_ROWS): TgKRow | null {
  const mine = canonicalNoMaps(RDKit, unitSmiles);
  if (mine === null) return null;
  for (const r of rows) if (canonicalNoMaps(RDKit, r.unitSmiles) === mine) return r;
  return null;
}

/** 聚合物成分的 Tg：Tg∞（基團貢獻）− K/Mn；缺基團、缺 K、無 Mn、共聚物都回報缺成分 Tg */
export function polymerComponentTg(RDKit: RDKitModule, c: Component, mn: number | null, fraction: number | null, rows: readonly TgKRow[] = TG_K_ROWS): ComponentTg {
  const out = blank(c, 'polymer', fraction);
  const units = c.polymer?.units;
  if (units && units.length > 1) {
    const bad: string[] = [];
    units.forEach((u, i) => {
      const r = computeTg(RDKit, u.smiles);
      if (r.status !== 'ok') bad.push(`單元 ${i + 1} 缺基團`);
    });
    out.missingReason = `共聚物成分：本卡不處理共聚比例影響，也沒有共聚物的 K${bad.length > 0 ? `（${bad.join('、')}）` : ''}`;
    return out;
  }
  const tg = computeTg(RDKit, c.canonicalSmiles);
  if (tg.status !== 'ok') {
    out.missingReason = tg.status === 'missing' ? '缺基團，算不出 Tg∞' : '結構無法計算 Tg∞';
    return out;
  }
  out.tgInfGroupK = tg.tgK;
  if (tg.containsCalibrated) out.flags.push(FLAG_CALIBRATED);
  const cls = findKClass(RDKit, c.canonicalSmiles, rows);
  if (!cls) {
    out.missingReason = '缺 K：此重複單元不屬於任何已有 K 的樹脂類別，未做分子量修正（只輸出 Tg∞）';
    return out;
  }
  out.resinClass = cls.resinClass;
  if (cls.state !== '收錄' || cls.k === null) {
    out.missingReason = `缺 K：類別「${cls.className}」資料不足，未做分子量修正（只輸出 Tg∞）`;
    return out;
  }
  if (mn === null || !(mn > 0)) {
    out.missingReason = '缺 Mn，無法做分子量修正';
    return out;
  }
  out.mn = mn;
  out.kUsed = cls.k;
  const tgK = foxFlory(tg.tgK, cls.k, mn);
  out.status = 'ok';
  out.tgK = tgK;
  out.flags.push(cls.confidence);
  if ((cls.mnMin !== null && mn < cls.mnMin) || (cls.mnMax !== null && mn > cls.mnMax)) out.flags.push(FLAG_EXTRAPOLATED);
  return out;
}

/** 小分子成分：不計算 Tg（D56），只給 Joback Tm（算不出時 Tm 為 null）；不參與混合 */
export function smallMoleculeComponentTg(RDKit: RDKitModule, c: Component, fraction: number | null): ComponentTg {
  const out = blank(c, 'small', fraction);
  out.status = 'not-applicable';
  out.missingReason = SMALL_MOLECULE_TG_NA;
  const j = computeJoback(RDKit, c.canonicalSmiles);
  if (j.status === 'ok' && j.tfK !== null) out.tmK = j.tfK;
  return out;
}

// ---------- 配方未固化 Tg ----------

export interface FormulationTgResult {
  status: 'complete' | 'incomplete' | 'unavailable' | 'error';
  model: string;
  confidence: 'trend';
  /** 完整配方的混合 Tg（K、°C）；不完整或不可用時為 null */
  tgK: number | null;
  tgC: number | null;
  components: ComponentTg[];
  /** 小分子成分名稱：不參與混合（D56），輸出備註「未計入：名稱」 */
  notCounted: string[];
  /** 缺成分 Tg 的成分名稱 */
  missing: string[];
  /** 去除缺成分後的部分混合值（非完整配方）；沒有任何可算成分時為 null */
  partial: { tgK: number; tgC: number; included: string[]; removed: string[]; fraction: number } | null;
  excluded: ExcludedComponent[];
  messages: string[];
  notes: string[];
}

export interface FormulationTgOptions {
  kRows?: readonly TgKRow[];
}

const isPolymer = (c: Component) => c.canonicalSmiles.includes('*');

/** 配方的未固化 Tg（Fox 式）。只混 Solid 區；結果標「參考趨勢」，附統一備註與模型名稱 */
export function computeFormulationTg(RDKit: RDKitModule, formulation: Formulation, options: FormulationTgOptions = {}): FormulationTgResult {
  const kRows = options.kRows ?? TG_K_ROWS;
  const base = {
    model: `${FOX_MIX_MODEL}；${FOX_FLORY_MODEL}；${SMALL_MOLECULE_TG_MODEL}`,
    confidence: 'trend' as const,
    tgK: null,
    tgC: null,
    notCounted: [] as string[],
    components: [] as ComponentTg[],
    missing: [] as string[],
    partial: null,
    excluded: [] as ExcludedComponent[],
    messages: [] as string[],
    notes: [UNIFIED_NOTE, 'Liquid 區成分不混。分子量只用於計算，不顯示在畫面上（D09）。'],
  };
  const solid = formulation.solid.components as Component[];

  // ---- 分子量（只供換算質量分率與 Fox–Flory，D46、D47、D50 的現行算法） ----
  const mnById: Record<string, number | undefined> = {};
  const unitById: Record<string, number | undefined> = {};
  for (const c of [...solid, ...(formulation.liquid.components as Component[])]) {
    if (isPolymer(c)) {
      const analysis = analyzePolymerUnits(RDKit, c.canonicalSmiles, c.polymer);
      const resolved = c.polymer && analysis.ok ? resolvePolymer(c.polymer, analysis.mUnit, { mEnds: analysis.mEnds ?? 0, filled: analysis.endsFilled ?? [false, false] }) : null;
      mnById[c.id] = resolved?.ok ? resolved.mn : undefined;
      unitById[c.id] = resolved?.ok && analysis.ok ? analysis.mUnit : undefined;
    } else {
      mnById[c.id] = averageMolecularWeight(RDKit, c.canonicalSmiles) ?? undefined;
    }
  }
  const outcome = computeFormulation(formulation, mnById, { unitWeights: unitById });
  const solidResult = outcome.results.solid;
  if (!solidResult) {
    return { ...base, status: 'error', messages: outcome.errors.filter((e) => e.area !== 'liquid').map((e) => e.message) };
  }
  const fractionOf = (id: string): number | null => {
    const v = solidResult.components.find((r) => r.id === id)?.wtPct.value;
    return v === null || v === undefined ? null : v / 100;
  };

  // ---- 分類：排除與參與混合 ----
  const excluded: ExcludedComponent[] = [];
  const components: ComponentTg[] = [];
  for (const c of solid) {
    if (c.category === CATALYST_CATEGORY) {
      excluded.push({ id: c.id, name: c.name, kind: 'catalyst', reason: 'Catalyst/Initiator（D26），不混入；不假設排除門檻，是否調整由使用者決定' });
      continue;
    }
    if (c.volatileFlag === true) {
      excluded.push({ id: c.id, name: c.name, kind: 'volatile', reason: '標記為揮發或分解，不混入' });
      continue;
    }
    const w = fractionOf(c.id);
    components.push(isPolymer(c) ? polymerComponentTg(RDKit, c, mnById[c.id] ?? null, w, kRows) : smallMoleculeComponentTg(RDKit, c, w));
  }

  const notCounted = components.filter((c) => c.status === 'not-applicable').map((c) => c.name);
  const messages: string[] = [];
  for (const e of excluded) messages.push(`${e.kind === 'catalyst' ? '催化劑／起始劑' : '揮發或分解'}成分未混入：${e.name}（${e.reason}）`);
  if (notCounted.length > 0) messages.push(`未計入：${notCounted.join('、')}（${SMALL_MOLECULE_TG_NA}）；${SMALL_MOLECULE_WARNING}`);
  if (components.length === 0) {
    return { ...base, status: 'unavailable', components, excluded, messages: [...messages, '沒有可混合的 Solid 成分'] };
  }
  const missing = components.filter((c) => c.status === 'missing');
  for (const m of missing) messages.push(`缺成分 Tg：${m.name}（${m.missingReason}）`);
  const usable = components.filter((c) => c.status === 'ok' && c.solidFraction !== null && c.solidFraction > 0);
  const mixOf = () => foxMix(usable.map((c) => ({ w: c.solidFraction as number, tgK: c.tgK as number })));

  if (usable.length === 0 && missing.length === 0) {
    return { ...base, status: 'unavailable', components, notCounted, excluded, messages: [...messages, '沒有聚合物或寡聚物成分可混合（小分子不計 Tg，D56）'] };
  }
  if (missing.length === 0) {
    const tgK = mixOf();
    return {
      ...base,
      status: 'complete',
      tgK,
      tgC: tgK - 273.15,
      components,
      notCounted,
      excluded,
      messages,
    };
  }
  let partial: FormulationTgResult['partial'] = null;
  if (usable.length > 0) {
    const tgK = mixOf();
    partial = {
      tgK,
      tgC: tgK - 273.15,
      included: usable.map((c) => c.name),
      removed: missing.map((m) => m.name),
      fraction: usable.reduce((s, c) => s + (c.solidFraction as number), 0),
    };
    messages.push(`部分混合值（非完整配方）：去除 ${partial.removed.join('、')} 後，只混 ${partial.included.join('、')}`);
  } else {
    messages.push('所有參與混合的成分都缺 Tg，沒有部分混合值');
  }
  return { ...base, status: 'incomplete', components, notCounted, missing: missing.map((m) => m.name), partial, excluded, messages };
}
