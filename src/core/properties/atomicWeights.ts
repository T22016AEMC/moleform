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
