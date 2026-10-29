// Miller–Macosko 計算核心的測試（任務 017）：只檢查程式依論文公式運作（D17）。
// 公式出處 [M76] = Miller & Macosko, Macromolecules 1976, 9, 206；[T24] = Tsimouri et al., Macromolecules 2024, 57, 4273。
// 封閉解由測試以論文式子直接寫出，與程式的通式數值解比對。
import { describe, expect, it } from 'vitest';
import {
  conversions,
  effectiveJunctionProbability,
  finiteProbability,
  gelConversion,
  groupMoles,
  homopolymerFiniteProbability,
  networkDensity,
  solFraction,
  splitFunctionality,
  type MMSystem,
} from '../../../src/core/crosslink/layer1/millerMacosko';

/** 以官能基莫耳數建立成分：f 官能的成分 groups 個官能基 → 分子數 groups／f；質量任意（此處用分子數） */
const sp = (f: number, groups: number) => ({ f, n: groups / f, mass: groups / f });

/** A_f＋B₂，r = (A 基團數)／(B 基團數)；A 基團數固定為 f（一個分子） */
function afPlusB2(f: number, r: number): MMSystem {
  return { a: [sp(f, f)], b: [sp(2, f / r)] };
}

describe('[M76] 式 8、9：A_f 均聚的有限鏈機率', () => {
  it('式 8（f = 3）：P(F_A^out) = (1−p)/p', () => {
    for (const p of [0.55, 0.7, 0.8, 0.95]) expect(homopolymerFiniteProbability(3, p)).toBeCloseTo((1 - p) / p, 9);
  });
  it('式 9（f = 4）：P(F_A^out) = (1/p − 3/4)^(1/2) − 1/2', () => {
    for (const p of [0.4, 0.6, 0.9]) expect(homopolymerFiniteProbability(4, p)).toBeCloseTo(Math.sqrt(1 / p - 0.75) - 0.5, 9);
  });
  it('凝膠點之前為 1（p ≤ 1/(f−1)）', () => {
    expect(homopolymerFiniteProbability(3, 0.5)).toBe(1);
    expect(homopolymerFiniteProbability(4, 0.3)).toBe(1);
  });
  it('式 38（f = 3）：w_s = P^3 = ((1−p)/p)^3，與 Flory 一致', () => {
    const p = 0.8;
    expect(homopolymerFiniteProbability(3, p) ** 3).toBeCloseTo(((1 - p) / p) ** 3, 9);
  });
});

describe('[M76] 式 15、16：A₃＋B₂、A₄＋B₂', () => {
  it('式 15（f = 3）：P(F_A^out) = (1 − r p²)/(r p²)', () => {
    for (const [r, pA] of [[1, 0.9], [0.75, 0.95], [0.9, 0.85]] as const) {
      const sys = afPlusB2(3, r);
      const { pA: a, pB: b } = { pA, pB: r * pA };
      const fp = finiteProbability(sys, a, b);
      const c = r * pA * pA;
      expect(fp.x).toBeCloseTo((1 - c) / c, 9);
    }
  });
  it('式 16（f = 4）：P(F_A^out) = (1/(r p²) − 3/4)^(1/2) − 1/2', () => {
    for (const [r, pA] of [[1, 0.8], [0.8, 0.95]] as const) {
      const fp = finiteProbability(afPlusB2(4, r), pA, r * pA);
      expect(fp.x).toBeCloseTo(Math.sqrt(1 / (r * pA * pA) - 0.75) - 0.5, 9);
    }
  });
  it('式 13：P(F_B^out) = r p·P(F_A^in) + 1 − r p（P(F_A^in) = x^(f−1)，式 4）', () => {
    const r = 0.8;
    const pA = 0.95;
    const fp = finiteProbability(afPlusB2(4, r), pA, r * pA);
    expect(fp.y).toBeCloseTo(r * pA * fp.x ** 3 + 1 - r * pA, 12);
  });
});

describe('[M76] 式 23、24：混合物', () => {
  // 以官能基分率 a_i 建立 A 側混合物（總 A 基團 100，r = 1，B₂）
  const mixture = (a: Record<number, number>, r: number): MMSystem => ({
    a: Object.entries(a).map(([f, frac]) => sp(Number(f), frac * 100)),
    b: [sp(2, 100 / r)],
  });
  it('式 23：A₃＋A₂＋A₁＋B₂：x = (1 − (a₃+a₂)rp²)/(a₃ r p²)', () => {
    const a3 = 0.5;
    const a2 = 0.4;
    const a1 = 0.1;
    const r = 1;
    const pA = 0.95; // 式 23 只在解介於 0 與 1 之間時成立（已過凝膠點）
    const fp = finiteProbability(mixture({ 3: a3, 2: a2, 1: a1 }, r), pA, r * pA);
    const c = r * pA * pA;
    expect(fp.x).toBeCloseTo((1 - (a3 + a2) * c) / (a3 * c), 9);
  });
  it('式 24：A₄＋A₃＋A₂＋A₁＋B₂（二次式的根，由式 22 因式分解得到）', () => {
    // 式 22：c(a4 x³ + a3 x² + a2 x + a1) − x − c + 1 = 0，c = r p²；消去根 x = 1 後解二次式，
    // 判別式與式 24 根號內的 a₃² − a₄(3a₄ + 2a₃ + 4a₂ − 4/c) 相同。
    const a4 = 0.2;
    const a3 = 0.3;
    const a2 = 0.4;
    const a1 = 0.1;
    const r = 1;
    const pA = 0.9;
    const c = r * pA * pA;
    const disc = a3 * a3 - a4 * (3 * a4 + 2 * a3 + 4 * a2 - 4 / c);
    const expected = (Math.sqrt(disc) - (a4 + a3)) / (2 * a4);
    const fp = finiteProbability(mixture({ 4: a4, 3: a3, 2: a2, 1: a1 }, r), pA, r * pA);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(1);
    expect(fp.x).toBeCloseTo(expected, 9);
  });
});

describe('凝膠點（[M76] 式 21、25–27）', () => {
  it('A₃＋B₂ 等當量：凝膠轉化率 1/√2 ≈ 0.7071', () => {
    expect(gelConversion(afPlusB2(3, 1))).toBeCloseTo(Math.SQRT1_2, 9);
  });
  it('式 27：A_f＋B₂ 的 r·p_gel² = 1/(f−1)（A 為限量，p_gel 即限量官能基轉化率）', () => {
    for (const [f, r] of [[3, 0.8], [4, 1], [5, 0.6]] as const) {
      const q = gelConversion(afPlusB2(f, r)) as number;
      expect(r * q * q).toBeCloseTo(1 / (f - 1), 9);
    }
  });
  it('B 為限量（A 過量）時，凝膠轉化率是限量官能基 B 的轉化率', () => {
    const sys = afPlusB2(3, 1.25); // A 基團比 B 多
    const q = gelConversion(sys) as number;
    const { pA, pB } = conversions(groupMoles(sys.a), groupMoles(sys.b), q);
    expect(pA * pB * 1 * 2).toBeCloseTo(1, 9); // p_A p_B (f−1)(g−1) = 1
  });
  it('A₂＋B₂ 不凝膠', () => {
    expect(gelConversion({ a: [sp(2, 100)], b: [sp(2, 100)] })).toBeNull();
  });
  it('過量太多時在 100% 轉化率內不凝膠', () => {
    expect(gelConversion(afPlusB2(3, 0.3))).toBeNull(); // r p² ≤ 1/2 對所有 p ≤ 1
  });
  it('凝膠點之前沒有 (0,1) 內的根（x = y = 1），之後有', () => {
    const sys = afPlusB2(3, 1);
    expect(finiteProbability(sys, 0.7, 0.7).gelled).toBe(false);
    expect(finiteProbability(sys, 0.72, 0.72).gelled).toBe(true);
  });
});

describe('溶膠分率（[M76] 式 39；[T24] 式 2 交叉核對）', () => {
  it('凝膠點之前為 1；等當量 A₃＋B₂ 完全反應為 0', () => {
    const sys = afPlusB2(3, 1);
    const before = conversions(groupMoles(sys.a), groupMoles(sys.b), 0.6);
    expect(solFraction(sys, finiteProbability(sys, before.pA, before.pB))).toBe(1);
    const full = finiteProbability(sys, 1, 1);
    expect(solFraction(sys, full)).toBeCloseTo(0, 12);
  });
  it('剛過凝膠點時接近 1', () => {
    const sys = afPlusB2(3, 1);
    const q = (gelConversion(sys) as number) + 1e-4;
    const fp = finiteProbability(sys, q, q);
    expect(solFraction(sys, fp)).toBeGreaterThan(0.99);
  });
  it('A₃＋B₂ 的式 39 與 [T24] 式 2：W_sol = ω_A·x^f + ω_B·[1 − rp + rp·x^(f−1)]^g', () => {
    const f = 4;
    const g = 2;
    const r = 0.8;
    const pA = 0.9;
    const sys: MMSystem = { a: [{ f, n: 1, mass: 3 }], b: [{ f: g, n: f / r / g, mass: 7 }] };
    const fp = finiteProbability(sys, pA, r * pA);
    const wA = 3 / 10;
    const wB = 7 / 10;
    const t24 = wA * fp.x ** f + wB * (1 - r * pA + r * pA * fp.x ** (f - 1)) ** g;
    expect(solFraction(sys, fp)).toBeCloseTo(t24, 12);
  });
});

describe('有效交聯點與交聯密度（[M76] 式 45、49、51；[T24] 式 21）', () => {
  it('式 45：度數 m 的機率為二項分布，各 m 加總為 1', () => {
    const x = 0.3;
    let sum = 0;
    for (let m = 0; m <= 5; m++) sum += effectiveJunctionProbability(5, m, x);
    expect(sum).toBeCloseTo(1, 12);
    expect(effectiveJunctionProbability(4, 4, x)).toBeCloseTo((1 - x) ** 4, 12); // Scanlan：X₄
    expect(effectiveJunctionProbability(4, 3, x)).toBeCloseTo(4 * (1 - x) ** 3 * x, 12);
  });
  it('完全反應的等當量 A₃＋B₂：[X] = [A₃]₀，ν_c = [A₃]₀／2', () => {
    const sys = afPlusB2(3, 1);
    const d = networkDensity(sys, finiteProbability(sys, 1, 1));
    expect(d.junctions).toBeCloseTo(sys.a[0].n, 12);
    expect(d.chains).toBeCloseTo(sys.a[0].n / 2, 12);
  });
  it('式 49、51（A₃）：[X₃] = [A₃]₀(1−x)³，ν_c = (3−2)/2·[X₃]', () => {
    const sys = afPlusB2(3, 1);
    const fp = finiteProbability(sys, 0.9, 0.9);
    const d = networkDensity(sys, fp);
    expect(d.junctions).toBeCloseTo(sys.a[0].n * (1 - fp.x) ** 3, 12);
    expect(d.chains).toBeCloseTo(0.5 * sys.a[0].n * (1 - fp.x) ** 3, 12);
  });
  it('A₄：ν_c = [A₄]₀·(½·P(X₃) + 1·P(X₄))', () => {
    const sys = afPlusB2(4, 1);
    const fp = finiteProbability(sys, 0.95, 0.95);
    const d = networkDensity(sys, fp);
    const n = sys.a[0].n;
    expect(d.chains).toBeCloseTo(n * (0.5 * 4 * (1 - fp.x) ** 3 * fp.x + (1 - fp.x) ** 4), 12);
  });
  it('B 側官能度 ≥ 3 時，以 P(F_B^out) 同樣加入（[M76] 式 49 後的說明）', () => {
    const sys: MMSystem = { a: [sp(3, 30)], b: [sp(3, 30)] };
    const fp = finiteProbability(sys, 0.95, 0.95);
    const d = networkDensity(sys, fp);
    expect(d.junctions).toBeCloseTo(sys.a[0].n * (1 - fp.x) ** 3 + sys.b[0].n * (1 - fp.y) ** 3, 12);
  });
  it('官能度很大（聚合物，f ≈ 300）也能算，不溢位', () => {
    const sys: MMSystem = { a: [sp(300, 300)], b: [sp(2, 300)] };
    const fp = finiteProbability(sys, 0.9, 0.9);
    const d = networkDensity(sys, fp);
    expect(Number.isFinite(d.chains)).toBe(true);
    expect(d.chains).toBeGreaterThan(0);
  });
});

describe('非整數官能度的混合近似（任務 017 B-8）', () => {
  it('整數官能度原樣回傳', () => {
    expect(splitFunctionality(3, 2, 5)).toEqual([{ f: 3, n: 2, mass: 5 }]);
  });
  it('24.56 = 24（44%）＋ 25（56%），數量平均官能度與總分子數、總質量不變', () => {
    const parts = splitFunctionality(24.56, 10, 100);
    expect(parts.map((p) => p.f)).toEqual([24, 25]);
    expect(parts[0].n + parts[1].n).toBeCloseTo(10, 12);
    expect(parts[0].mass + parts[1].mass).toBeCloseTo(100, 12);
    expect(groupMoles(parts) / 10).toBeCloseTo(24.56, 12);
  });
  it('f 為整數時，與直接以整數 f 計算的結果相同', () => {
    const direct: MMSystem = { a: [{ f: 3, n: 10, mass: 100 }], b: [{ f: 2, n: 15, mass: 50 }] };
    const viaSplit: MMSystem = { a: splitFunctionality(3, 10, 100), b: splitFunctionality(2, 15, 50) };
    expect(gelConversion(viaSplit)).toBe(gelConversion(direct));
    const fp1 = finiteProbability(direct, 0.9, 0.9);
    const fp2 = finiteProbability(viaSplit, 0.9, 0.9);
    expect(fp2.x).toBe(fp1.x);
    expect(solFraction(viaSplit, fp2)).toBe(solFraction(direct, fp1));
    expect(networkDensity(viaSplit, fp2)).toEqual(networkDensity(direct, fp1));
  });
});
