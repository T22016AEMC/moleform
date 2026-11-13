"""標準原子量（IUPAC，g/mol）。對應 src/core/properties/atomicWeights.ts。

數值逐字取自 src/core/properties/atomicWeights.ts 的 ATOMIC_WEIGHTS（不憑記憶）；
兩邊是否一致由 tests/golden/atomicWeights.json 的黃金比對檢查（含整張表）。
只用來核對基團的 Mi 與分子（重複單元）的莫耳質量，不是 Yg 的輸入。
"""

from __future__ import annotations

from types import MappingProxyType

ATOMIC_WEIGHTS = MappingProxyType(
    {
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
    }
)


def atomic_weight(z: int | float) -> float | None:
    """原子序 z 的原子量；表中沒有的元素回傳 None（呼叫端應回報而不是猜值）。"""
    if isinstance(z, bool):  # JS 沒有 bool 當索引的情況；避免 True 被當成 1
        return None
    return ATOMIC_WEIGHTS.get(z)
