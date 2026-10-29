// Miller–Macosko 後凝膠性質（任務 017，D41、D42）。純 TypeScript，不可引用 React。
// 公式只取自 docs/references/ 的論文：
//   [M76] D. R. Miller, C. W. Macosko, Macromolecules 1976, 9, 206–211（DOI 10.1021/ma60050a004）
//   [T24] I. C. Tsimouri et al., Macromolecules 2024, 57, 4273–4284（僅用來交叉核對式 39、45，見 tests）
// 理想網路三項假設（[M76] 開頭）：(1) 同類官能基等活性；(2) 各基團獨立反應；(3) 有限分子內無分子內反應（環化）。
// 符號與式號見 docs/MODELS.md。
//
// 符號：A 側成分 A_fi（官能度 f_i），B 側成分 B_gj（官能度 g_j）。
//   a_i、b_j：A、B 側以「官能基莫耳分率」加權的成分比例（[M76] 式 17–21 的 a_fi、b_gj）。
//   pA、pB：A、B 官能基轉化率；pB = r·pA，r = (A 基團數)／(B 基團數)（[M76] 式 11–13 後的說明）。
//   x = P(F_A^out)、y = P(F_B^out)：由某基團向外看，通往「有限鏈」而非無限網路的機率。

/** 一種（虛擬）成分：官能度為整數 */
export interface MMSpecies {
  /** 官能度（整數；0 表示無官能基，視為惰性） */
  f: number;
  /** 分子數（相對值，與其他成分同一基準） */
  n: number;
  /** 質量（與其他成分同一基準） */
  mass: number;
}

export interface MMSystem {
  a: MMSpecies[];
  b: MMSpecies[];
}

const EPS = 1e-12;

/** 官能基莫耳數 Σ n·f */
export const groupMoles = (s: readonly MMSpecies[]): number => s.reduce((t, k) => t + k.n * k.f, 0);

/** 官能基莫耳分率 a_fi（[M76] 式 17–21 的加權） */
function groupFractions(s: readonly MMSpecies[]): number[] {
  const total = groupMoles(s);
  return s.map((k) => (total > 0 ? (k.n * k.f) / total : 0));
}

/**
 * 非整數官能度的處理（任務 017 B-8）：以相鄰兩個整數官能度的兩種「虛擬成分」混合近似，
 * 使數量平均官能度相等。例如 24.56 = 24（占 44%）＋ 25（占 56%）的分子數比；每個虛擬成分沿用同一個每分子質量。
 * 整數官能度原樣回傳。
 */
export function splitFunctionality(fAvg: number, n: number, mass: number): MMSpecies[] {
  const lo = Math.floor(fAvg + 1e-9);
  const t = fAvg - lo;
  if (t < 1e-9) return [{ f: lo, n, mass }];
  return [
    { f: lo, n: n * (1 - t), mass: mass * (1 - t) },
    { f: lo + 1, n: n * t, mass: mass * t },
  ];
}

/** 式 21 左邊「A 基團向外看通往有限鏈」的遞迴右側：RHS(x) = pA·Σ_j b_j[1 − pB + pB·Σ_i a_i x^(f_i−1)]^(g_j−1) + 1 − pA */
function rhs(a: readonly number[], fa: readonly number[], b: readonly number[], gb: readonly number[], pA: number, pB: number, x: number): number {
  let inner = 0;
  for (let i = 0; i < a.length; i++) if (fa[i] >= 1) inner += a[i] * x ** (fa[i] - 1); // 式 20
  const pFb = 1 - pB + pB * inner; // 式 19：P(F_B^out)
  let outer = 0;
  for (let j = 0; j < b.length; j++) if (gb[j] >= 1) outer += b[j] * pFb ** (gb[j] - 1); // 式 18
  return pA * outer + 1 - pA; // 式 17
}

/**
 * 式 21 的凝膠判斷：x = 1 恆為根；(0,1) 內有根，若且唯若 RHS 在 x = 1 的斜率大於 1
 * （RHS 為凸函數且遞增，[M76] 式 25–27 同樣的論證）。斜率 = pA·pB·Σb_j(g_j−1)·Σa_i(f_i−1)。
 */
export function gelSlope(sys: MMSystem, pA: number, pB: number): number {
  const a = groupFractions(sys.a);
  const b = groupFractions(sys.b);
  const sa = a.reduce((t, v, i) => t + v * Math.max(sys.a[i].f - 1, 0), 0);
  const sb = b.reduce((t, v, j) => t + v * Math.max(sys.b[j].f - 1, 0), 0);
  return pA * pB * sa * sb;
}

export interface FiniteProbability {
  /** P(F_A^out) */
  x: number;
  /** P(F_B^out) */
  y: number;
  /** (0,1) 內是否有解（已超過凝膠點） */
  gelled: boolean;
}

/**
 * 有限鏈機率（[M76] 式 17–21）：解式 21 在 (0,1) 內的根（二分法）；沒有根時為 1（尚未凝膠）。
 * 再由式 19 得 P(F_B^out) = pB·P(F_A^in) + 1 − pB。
 */
export function finiteProbability(sys: MMSystem, pA: number, pB: number): FiniteProbability {
  const a = groupFractions(sys.a);
  const b = groupFractions(sys.b);
  const fa = sys.a.map((k) => k.f);
  const gb = sys.b.map((k) => k.f);
  if (!(gelSlope(sys, pA, pB) > 1 + EPS)) return { x: 1, y: 1, gelled: false };
  let lo = 0; // h(lo) > 0
  let hi = 1; // h(hi) = 0（恆為根）；根左側 h > 0、右側 h < 0
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (rhs(a, fa, b, gb, pA, pB, mid) - mid > 0) lo = mid;
    else hi = mid;
  }
  const x = (lo + hi) / 2;
  let inner = 0;
  for (let i = 0; i < a.length; i++) if (fa[i] >= 1) inner += a[i] * x ** (fa[i] - 1);
  return { x, y: pB * inner + 1 - pB, gelled: true };
}

/**
 * A_f 均聚的有限鏈機率（[M76] 式 5–9）：解 p·x^(f−1) − x − p + 1 = 0 在 (0,1) 內的根；沒有根為 1。
 * 只用來核對式 8、9（測試），第 1 層計算不會呼叫它。
 */
export function homopolymerFiniteProbability(f: number, p: number): number {
  if (!(p * (f - 1) > 1 + EPS)) return 1; // 凝膠點 p_gel = 1/(f−1)
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (p * mid ** (f - 1) - mid - p + 1 > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 限量官能基轉化率 q 換算成 pA、pB（反應掉的鍵數相同，所以 pA·N_A = pB·N_B） */
export function conversions(nA: number, nB: number, q: number): { pA: number; pB: number } {
  const bonds = q * Math.min(nA, nB);
  return { pA: nA > 0 ? bonds / nA : 0, pB: nB > 0 ? bonds / nB : 0 };
}

/**
 * 凝膠點：限量官能基的凝膠轉化率 q_gel。以二分法求 gelSlope(q) = 1 的根（式 21 的凝膠條件，
 * 斜率隨 q 單調遞增）。q = 1 仍不凝膠時回傳 null。A_f＋B₂ 時等於 [M76] 式 27：r·p_gel² = 1/(f−1)。
 */
export function gelConversion(sys: MMSystem): number | null {
  const nA = groupMoles(sys.a);
  const nB = groupMoles(sys.b);
  if (!(nA > 0) || !(nB > 0)) return null;
  const slope = (q: number) => {
    const { pA, pB } = conversions(nA, nB, q);
    return gelSlope(sys, pA, pB);
  };
  if (!(slope(1) > 1 + EPS)) return null;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (slope(mid) > 1) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 溶膠質量分率（[M76] 式 39）：w_s = Σ_i w_Afi·P(F_A^out)^f_i + Σ_j w_Bgj·P(F_B^out)^g_j，
 * w 為各成分的質量分率（以 A、B 兩側成分的總質量為基準）。凝膠點之前 x = y = 1，所以 w_s = 1。
 */
export function solFraction(sys: MMSystem, fp: FiniteProbability): number {
  const total = [...sys.a, ...sys.b].reduce((t, k) => t + k.mass, 0);
  if (!(total > 0)) return 1;
  const part = (s: readonly MMSpecies[], p: number) => s.reduce((t, k) => t + k.mass * p ** k.f, 0);
  return (part(sys.a, fp.x) + part(sys.b, fp.y)) / total;
}

const lnFactorialCache: number[] = [0];
function lnFactorial(k: number): number {
  for (let i = lnFactorialCache.length; i <= k; i++) lnFactorialCache.push(lnFactorialCache[i - 1] + Math.log(i));
  return lnFactorialCache[k];
}

/**
 * 某個 f 官能的成分是「度數 m 的有效交聯點」的機率（[M76] 式 45）：
 * P(X_m,f) = C(f,m)·(1 − P(F^out))^m·P(F^out)^(f−m)，即 f 條臂中恰好 m 條通往無限網路（二項分布）。
 * B 側官能度 ≥ 3 時以 P(F_B^out) 寫出相同形式（[M76] 式 49 後的說明）。
 */
export function effectiveJunctionProbability(f: number, m: number, pFinite: number): number {
  if (m < 0 || m > f) return 0;
  if (pFinite <= 0) return m === f ? 1 : 0;
  if (pFinite >= 1) return m === 0 ? 1 : 0;
  const lnC = lnFactorial(f) - lnFactorial(m) - lnFactorial(f - m);
  return Math.exp(lnC + m * Math.log(1 - pFinite) + (f - m) * Math.log(pFinite));
}

export interface NetworkDensity {
  /** 有效交聯點總量 [X] = Σ_{m≥3} [X_m]（[M76] 式 49；分子數基準） */
  junctions: number;
  /** 有效網目鏈量 ν_c = Σ_{m≥3} (m−2)/2·[X_m]（[M76] 式 51） */
  chains: number;
}

/**
 * 交聯密度與有效網目鏈（[M76] 式 49、51）：[X_m] = Σ_{f_i ≥ m} [A_fi]_0·P(X_m,fi)，
 * [A_fi]_0 取該成分的分子數（呼叫端除以固體質量即為每克固體）。B 側官能度 ≥ 3 的成分以 P(F_B^out) 同樣加入。
 */
export function networkDensity(sys: MMSystem, fp: FiniteProbability): NetworkDensity {
  let junctions = 0;
  let chains = 0;
  const add = (s: readonly MMSpecies[], p: number) => {
    for (const k of s) {
      for (let m = 3; m <= k.f; m++) {
        const xm = k.n * effectiveJunctionProbability(k.f, m, p); // 式 49 的一項 [A_f]_0·P(X_m,f)
        junctions += xm;
        chains += ((m - 2) / 2) * xm; // 式 51
      }
    }
  };
  add(sys.a, fp.x);
  add(sys.b, fp.y);
  return { junctions, chains };
}
