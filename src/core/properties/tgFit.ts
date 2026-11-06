// Fox–Flory 的線性回歸（任務 035）：Tg = Tg∞ − K/Mn，即 y = a + b·x，x = 1/Mn，y = Tg（K），Tg∞ = a，K = −b。
// 普通最小二乘，n 點 2 參數；標準誤差用 s² = SSE/(n−2)。只做計算，不判斷化學（D17）。
export interface FloryFit {
  n: number;
  tgInfK: number;
  k: number;
  /** Tg∞ 與 K 的標準誤差（n = 2 時無自由度，為 NaN） */
  seTgInf: number;
  seK: number;
  r2: number;
  /** 殘差 = 資料 − 擬合（K），與輸入順序相同 */
  residuals: number[];
  /** 殘差標準差 sqrt(SSE/(n−2)) */
  residualSd: number;
}

export interface FloryPoint {
  mn: number;
  tgK: number;
}

export function fitFlory(points: readonly FloryPoint[]): FloryFit {
  const n = points.length;
  if (n < 2) throw new Error('至少需要 2 個點');
  for (const p of points) if (!(p.mn > 0) || !(p.tgK > 0)) throw new Error('Mn 與 Tg 都必須大於 0');
  const x = points.map((p) => 1 / p.mn);
  const y = points.map((p) => p.tgK);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
    syy += (y[i] - my) ** 2;
  }
  if (!(sxx > 0)) throw new Error('所有點的 Mn 相同，無法回歸');
  const b = sxy / sxx;
  const a = my - b * mx;
  const residuals = y.map((v, i) => v - (a + b * x[i]));
  const sse = residuals.reduce((s, r) => s + r * r, 0);
  const dof = n - 2;
  const s2 = dof > 0 ? sse / dof : Number.NaN;
  return {
    n,
    tgInfK: a,
    k: -b,
    seTgInf: Math.sqrt(s2 * (1 / n + (mx * mx) / sxx)),
    seK: Math.sqrt(s2 / sxx),
    r2: syy > 0 ? 1 - sse / syy : 1,
    residuals,
    residualSd: Math.sqrt(s2),
  };
}

/** 以擬合預測 Tg（K） */
export const predictFlory = (fit: Pick<FloryFit, 'tgInfK' | 'k'>, mn: number): number => {
  if (!(mn > 0)) throw new Error('Mn 必須大於 0');
  return fit.tgInfK - fit.k / mn;
};
