// Random 共聚物的平均重複單元（任務 020，D04）。純 TypeScript（需傳入 RDKit）。
// 每條鏈的組成視為等於平均組成（見 docs/MODELS.md「共聚物」）；均聚物視為只有一種單元、100 mol%。
// 平均單元質量 M̄_unit = Σ x_i·M_unit,i；分子量只用於計算，不顯示（D09）。
import type { RDKitModule } from '../rdkit/types';
import { analyzeRepeatUnit } from './repeatUnit';
import type { PolymerSpec, PolymerUnit, RepeatUnitAnalysis, RepeatUnitInfo } from './types';

/** 比例合計與 100 的容差（沿用任務 013） */
export const FRACTION_TOLERANCE = 0.01;

const bad = (message: string): RepeatUnitAnalysis => ({ ok: false, problem: { code: 'BAD_FRACTION', message } });

/** 取出聚合物的所有單元：沒有 units 時為成分自己的 SMILES，100 */
export function unitsOf(canonicalSmiles: string, spec: Pick<PolymerSpec, 'units'> | undefined): PolymerUnit[] {
  return spec?.units && spec.units.length > 0 ? spec.units : [{ smiles: canonicalSmiles, fraction: 100 }];
}

/**
 * 分析聚合物的各單元並求平均單元質量。回傳的 mUnit 為 M̄_unit。
 * 錯誤：單元結構不合連接點規則、比例不是正數、比例合計不為 100（±0.01）。
 */
export function analyzePolymerUnits(RDKit: RDKitModule, canonicalSmiles: string, spec?: Pick<PolymerSpec, 'units' | 'fractionBasis'>): RepeatUnitAnalysis {
  const units = unitsOf(canonicalSmiles, spec);
  const single = units.length === 1 && !spec?.units;
  const infos: RepeatUnitInfo[] = [];
  for (let i = 0; i < units.length; i++) {
    const a = analyzeRepeatUnit(RDKit, units[i].smiles);
    if (!a.ok) return units.length > 1 ? { ok: false, problem: { ...a.problem, message: `單元 ${i + 1}：${a.problem.message}` } } : a;
    infos.push(a);
  }
  if (single) {
    const a = infos[0];
    return { ok: true, ...a, units: [{ smiles: units[0].smiles, mUnit: a.mUnit, molFraction: 1 }] };
  }
  const basis = spec?.fractionBasis ?? 'mol';
  for (let i = 0; i < units.length; i++) {
    const f = units[i].fraction;
    if (!(typeof f === 'number' && Number.isFinite(f) && f > 0)) return bad(`單元 ${i + 1} 的比例必須是大於 0 的數字。`);
  }
  const sum = units.reduce((t, u) => t + u.fraction, 0);
  if (Math.abs(sum - 100) > FRACTION_TOLERANCE + 1e-9) {
    return bad(`各單元的 ${basis === 'mol' ? 'mol%' : 'wt%'} 合計為 ${Number(sum.toFixed(6))}，應為 100（容差 ±0.01）。`);
  }
  // wt% 以各單元的 M_unit 換成莫耳分率：x_i ∝ w_i ÷ M_i
  const weights = units.map((u, i) => (basis === 'mol' ? u.fraction : u.fraction / infos[i].mUnit));
  const total = weights.reduce((t, w) => t + w, 0);
  const composition = units.map((u, i) => ({ smiles: u.smiles, mUnit: infos[i].mUnit, molFraction: weights[i] / total }));
  const mAvg = composition.reduce((t, c) => t + c.molFraction * c.mUnit, 0);
  return { ok: true, ...infos[0], mUnit: mAvg, units: composition };
}
