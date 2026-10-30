// 分子量分布的兩成分等重量近似（任務 019，D47）。**本專案推導，非論文原式**（說明見 docs/MODELS.md）。
// 每個聚合物成分以兩種虛擬成分表示，重量分率各 0.5，分子量 M₁、M₂ 使 Mn、Mw 與輸入相同：
//   M₁ + M₂ = 2·Mw、M₁·M₂ = Mn·Mw  →  M₁,₂ = Mw ∓ √(Mw² − Mn·Mw)。PDI = 1 時兩者相等。
// 這些分子量只在背景計算，不顯示在結果區（D09）。純 TypeScript。

export interface TwoComponent {
  /** 較小的虛擬成分分子量 M₁（g/mol） */
  m1: number;
  /** 較大的虛擬成分分子量 M₂（g/mol） */
  m2: number;
  /** 兩者相同（PDI = 1），退化為單一成分 */
  single: boolean;
}

/** 分布近似的一個虛擬成分：分子量與重量分率 */
export interface DistributionSpecies {
  m: number;
  weightFraction: number;
}

export interface DistributionSpecies2 {
  species: DistributionSpecies[];
  /** 使用了低分子量修正（M₁ < M_ends，任務 023，D51） */
  lowMw: boolean;
}

/**
 * 含端基的兩成分近似（任務 023，D51；本專案處理，非論文公式）。
 * 先照原式算 M₁；M₁ ≥ M_ends（含沒有端基）時完全不變：M₁、M₂ 各 0.5。
 * M₁ < M_ends 時改用「n = 0 分子（M_a = M_ends，重量分率 w）＋較重成分 M_b（1 − w）」，Mn、Mw 不變：
 *   w·M_a + (1 − w)·M_b = Mw、w ÷ M_a + (1 − w) ÷ M_b = 1 ÷ Mn
 *   消去 M_b 得 (1 − w)² = (Mw − w·M_a)(1 ÷ Mn − w ÷ M_a)；w² 項兩邊相消，化為一次式
 *   w = (Mw ÷ Mn − 1) ÷ (Mw ÷ M_a + M_a ÷ Mn − 2)。
 * 呼叫端保證 M_ends < Mn（見 resolvePolymer）；找不到落在 0 < w < 1 的解時拋出內部錯誤。
 */
export function twoComponentSpecies(mw: number, mn: number, mEnds: number): DistributionSpecies2 {
  const { m1, m2, single } = twoComponentMasses(mw, mn);
  if (single) return { species: [{ m: mw, weightFraction: 1 }], lowMw: false };
  if (m1 >= mEnds) {
    return {
      species: [
        { m: m1, weightFraction: 0.5 },
        { m: m2, weightFraction: 0.5 },
      ],
      lowMw: false,
    };
  }
  const w = (mw / mn - 1) / (mw / mEnds + mEnds / mn - 2);
  const mb = (mw - w * mEnds) / (1 - w);
  if (!(w > 0 && w < 1) || !(mb > mEnds) || !Number.isFinite(mb)) {
    throw new Error(`低分子量修正無解：Mw = ${mw}、Mn = ${mn}、M_ends = ${mEnds}`);
  }
  return {
    species: [
      { m: mEnds, weightFraction: w },
      { m: mb, weightFraction: 1 - w },
    ],
    lowMw: true,
  };
}

/** 兩成分近似的 M₁、M₂；mn 大於 mw（不合理）時視為 PDI = 1 */
export function twoComponentMasses(mw: number, mn: number): TwoComponent {
  const spread = Math.sqrt(Math.max(mw * mw - mn * mw, 0));
  const single = spread <= 1e-9 * mw;
  return { m1: single ? mw : mw - spread, m2: single ? mw : mw + spread, single };
}
