"""Fox–Flory 的線性回歸。對應 src/core/properties/tgFit.ts（任務 M05 組 1-4；D62／D63）。

Tg = Tg∞ − K/Mn，即 y = a + b·x，x = 1/Mn，y = Tg（K）。普通最小二乘；加總一律用明確迴圈（不用內建 `sum()`）。
JS 的 `**` 與 `Math.sqrt` 對應：平方用 `d * d`（與 `x ** 2` 同為正確捨入的乘法）。
"""

from __future__ import annotations

import math
from typing import Any, Sequence

from .js_compat import js_div


def fit_flory(points: Sequence[dict[str, float]]) -> dict[str, Any]:
    n = len(points)
    if n < 2:
        raise ValueError("至少需要 2 個點")
    for p in points:
        if not (p["mn"] > 0) or not (p["tgK"] > 0):
            raise ValueError("Mn 與 Tg 都必須大於 0")
    x = [1 / p["mn"] for p in points]
    y = [p["tgK"] for p in points]
    sx = 0.0
    for v in x:
        sx = sx + v
    sy = 0.0
    for v in y:
        sy = sy + v
    mx = sx / n
    my = sy / n
    sxx = 0.0
    sxy = 0.0
    syy = 0.0
    for i in range(n):
        dx = x[i] - mx
        dy = y[i] - my
        sxx = sxx + dx * dx
        sxy = sxy + dx * dy
        syy = syy + dy * dy
    if not (sxx > 0):
        raise ValueError("所有點的 Mn 相同，無法回歸")
    b = sxy / sxx
    a = my - b * mx
    residuals = [v - (a + b * x[i]) for i, v in enumerate(y)]
    sse = 0.0
    for r in residuals:
        sse = sse + r * r
    dof = n - 2
    s2 = sse / dof if dof > 0 else math.nan
    return {
        "n": n,
        "tgInfK": a,
        "k": -b,
        "seTgInf": _sqrt(s2 * (1 / n + (mx * mx) / sxx)),
        "seK": _sqrt(s2 / sxx),
        "r2": 1 - sse / syy if syy > 0 else 1,
        "residuals": residuals,
        "residualSd": _sqrt(s2),
    }


def _sqrt(v: float) -> float:
    """Math.sqrt：負數與 NaN 回傳 NaN（Python 的 math.sqrt 會拋例外）。"""
    return math.nan if (math.isnan(v) or v < 0) else math.sqrt(v)


def predict_flory(fit: dict[str, float], mn: float) -> float:
    if not (mn > 0):
        raise ValueError("Mn 必須大於 0")
    return fit["tgInfK"] - js_div(fit["k"], mn)
