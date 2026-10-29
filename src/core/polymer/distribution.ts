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

/** 兩成分近似的 M₁、M₂；mn 大於 mw（不合理）時視為 PDI = 1 */
export function twoComponentMasses(mw: number, mn: number): TwoComponent {
  const spread = Math.sqrt(Math.max(mw * mw - mn * mw, 0));
  const single = spread <= 1e-9 * mw;
  return { m1: single ? mw : mw - spread, m2: single ? mw : mw + spread, single };
}
