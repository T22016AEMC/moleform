"""聚合物黃金比對測試的共用輔助（任務 M04）。"""

from __future__ import annotations

import math
from typing import Any

import golden_compare as gc


def decode(value: Any) -> Any:
    """把黃金檔的輸入還原成 Python 值：數字（Num）→ int／float；{"$nonfinite": …} → NaN／±Infinity；其餘結構遞迴。
    （JS 的 undefined 在黃金檔裡就是「沒有這個鍵」，Python 端用 dict.get 取得 None 或哨兵，由被測函式自己處理。）"""
    if isinstance(value, gc.Num):
        return int(value.raw) if value.is_int_literal else float(value.raw)
    if isinstance(value, list):
        return [decode(v) for v in value]
    if isinstance(value, dict):
        if set(value) == {"$nonfinite"}:
            return {"NaN": math.nan, "Infinity": math.inf, "-Infinity": -math.inf}[value["$nonfinite"]]
        return {k: decode(v) for k, v in value.items()}
    return value


def by_kind(cases: list[tuple[str, Any, Any]], kinds: tuple[str, ...]) -> dict[str, list[tuple[str, Any, Any]]]:
    out: dict[str, list[tuple[str, Any, Any]]] = {k: [] for k in kinds}
    for case_id, inp, outp in cases:
        out[inp["kind"]].append((case_id, inp, outp))
    return out
