// 網路判定（任務 016）：只依「每分子平均官能度 f」的計數判定，不判斷反應會不會實際發生（D17）。
//   兩邊都 f ≥ 2，且至少一邊 f > 2 → 網路
//   兩邊都 f = 2                 → 鏈延長（線性）
//   有一邊 f < 2（例如 f = 1）    → 封端；若另一邊是聚合物 → 接枝
//   任一邊 f 未知（缺 Mn／DP）    → 無法判定
import type { PairKind, Verdict } from './types';

const EPS = 1e-9;

export function judgePair(fA: number | null, fB: number | null, aIsPolymer: boolean, bIsPolymer: boolean): PairKind {
  if (fA === null || fB === null) return 'undetermined';
  const low = Math.min(fA, fB);
  if (low < 2 - EPS) {
    const otherIsPolymer = fA <= fB ? bIsPolymer : aIsPolymer;
    return otherIsPolymer ? 'graft' : 'capping';
  }
  return fA > 2 + EPS || fB > 2 + EPS ? 'network' : 'chain';
}

/** 整個配方的判定：任一配對為網路即「可形成網路」 */
export function judgeFormulation(kinds: readonly PairKind[]): Verdict {
  if (kinds.includes('network')) return 'network';
  if (kinds.includes('chain')) return 'chain';
  if (kinds.includes('capping') || kinds.includes('graft')) return 'capping';
  if (kinds.includes('undetermined')) return 'undetermined';
  return 'none';
}
