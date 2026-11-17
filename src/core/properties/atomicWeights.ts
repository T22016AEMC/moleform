// 【黃金基準，不供介面使用】任務 I05（PLAN 6A.3 第二步）：介面已改呼叫 Python 引擎（engine/moleform_core/atomic_weights.py）。
// 本檔只供黃金檔匯出（scripts/golden/export-*.ts）與測試，直到使用者決定凍結黃金檔；src/ui、src/worker 不得引用（tests/architecture.test.ts 檢查）。
// 標準原子量（IUPAC，g/mol），只用來核對基團的 Mi 與分子（重複單元）的莫耳質量，不是 Yg 的輸入。
export const ATOMIC_WEIGHTS: Readonly<Record<number, number>> = {
  1: 1.008,
  5: 10.81,
  6: 12.011,
  7: 14.007,
  8: 15.999,
  9: 18.998,
  14: 28.085,
  15: 30.974,
  16: 32.06,
  17: 35.45,
  35: 79.904,
};

/** 原子序 z 的原子量；表中沒有的元素回傳 null（呼叫端應回報而不是猜值） */
export function atomicWeight(z: number): number | null {
  return ATOMIC_WEIGHTS[z] ?? null;
}
