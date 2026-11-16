"""分子量分布的兩成分等重量近似。對應 src/core/polymer/distribution.ts（任務 M04，PLAN 6A.4-03；D62／D63）。**本專案推導，非論文原式**（說明見 docs/MODELS.md）。

每個聚合物成分以兩種虛擬成分表示，重量分率各 0.5，分子量 M₁、M₂ 使 Mn、Mw 與輸入相同：
  M₁ + M₂ = 2·Mw、M₁·M₂ = Mn·Mw  →  M₁,₂ = Mw ∓ √(Mw² − Mn·Mw)。PDI = 1 時兩者相等。
含端基的低分子量修正（任務 023，D51）見 `two_component_species`。這些分子量只在背景計算。TypeScript 仍是預設計算來源，本模組沒有接到介面。

浮點與 JS 語意：運算順序與 TS 逐步對照（`mw * mw - mn * mw`、`mw - spread`、`(mw / mn - 1) / (mw / m_ends + m_ends / mn - 2)`）；
除法用 `js_div`（除以零不拋例外）；`Math.max` 用 `js_max`（遇到 NaN 回傳 NaN）；`Math.sqrt` 用 `math.sqrt`（IEEE 正確捨入，與 JS 相同；
Python 的 `math.sqrt` 對 NaN 與 +Infinity 不拋例外，負數不會出現，因為先取 max 0）；`${n}` 用 `js_number_to_string`。
float 的乘法與減法溢位時 Python 與 JS 一樣得到 ±Infinity（不拋例外）。沒有加總、`pow`、`log`。
"""

from __future__ import annotations

import math
from typing import Any

from .js_compat import js_div, js_max, js_number_to_string


class LowMwNoSolutionError(Exception):
    """TS 的 `throw new Error('低分子量修正無解：…')`（內部錯誤：呼叫端保證 M_ends < Mn）。"""


def two_component_masses(mw: float, mn: float) -> dict[str, Any]:
    """對應 twoComponentMasses：兩成分近似的 M₁、M₂；mn 大於 mw（不合理）時視為 PDI = 1。回傳 { m1, m2, single }。"""
    mw = float(mw)
    mn = float(mn)
    spread = math.sqrt(js_max(mw * mw - mn * mw, 0.0))
    single = spread <= 1e-9 * mw
    return {"m1": mw if single else mw - spread, "m2": mw if single else mw + spread, "single": single}


def two_component_species(mw: float, mn: float, m_ends: float) -> dict[str, Any]:
    """對應 twoComponentSpecies：含端基的兩成分近似。回傳 { species: [{ m, weightFraction }], lowMw }。
    M₁ ≥ M_ends（含沒有端基）時完全不變：M₁、M₂ 各 0.5；M₁ < M_ends 時改用「n = 0 分子（M_a = M_ends，重量分率 w）＋較重成分 M_b」。
    找不到落在 0 < w < 1 的解時拋出 `LowMwNoSolutionError`（TS 拋出 Error，訊息逐字相同）。"""
    mw = float(mw)
    mn = float(mn)
    m_ends = float(m_ends)
    r = two_component_masses(mw, mn)
    m1, m2, single = r["m1"], r["m2"], r["single"]
    if single:
        return {"species": [{"m": mw, "weightFraction": 1}], "lowMw": False}
    if m1 >= m_ends:
        return {"species": [{"m": m1, "weightFraction": 0.5}, {"m": m2, "weightFraction": 0.5}], "lowMw": False}
    w = js_div(js_div(mw, mn) - 1, js_div(mw, m_ends) + js_div(m_ends, mn) - 2)
    mb = js_div(mw - w * m_ends, 1 - w)
    if not (w > 0 and w < 1) or not (mb > m_ends) or not math.isfinite(mb):
        raise LowMwNoSolutionError(
            f"低分子量修正無解：Mw = {js_number_to_string(mw)}、Mn = {js_number_to_string(mn)}、M_ends = {js_number_to_string(m_ends)}"
        )
    return {"species": [{"m": m_ends, "weightFraction": w}, {"m": mb, "weightFraction": 1 - w}], "lowMw": True}
