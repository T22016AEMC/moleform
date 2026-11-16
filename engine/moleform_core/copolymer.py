"""Random 共聚物的平均重複單元。對應 src/core/polymer/copolymer.ts（任務 M04，PLAN 6A.4-03；D62／D63）。

演算法與 TypeScript 逐步等價：每條鏈的組成視為等於平均組成；均聚物視為只有一種單元、100 mol%。
平均單元質量 M̄_unit ＝ Σ x_i·M_unit,i。所有加總（比例合計、wt% 換算的總莫耳、平均單元質量）都用明確迴圈由左至右累加
（**不可用內建 `sum()`**：Python 3.12 的 `sum()` 對 float 用補償加總，結果可能與 JS 的 `reduce` 不同）。
TypeScript 仍是預設計算來源，本模組沒有接到介面。

JS 語意的幾個地方：
- `spec?.units` 只有「沒有（undefined 或 null）」時才是假值；空陣列 `[]` 在 JS 是真值，所以 `units: []` 時 `single` 為假
  （`!spec?.units` 為 false），走多單元路徑、單元清單退回「成分自己的 SMILES，100」。Python 的 `not []` 是 True，不能直接用，故以 `is None` 判斷。
- `typeof f === 'number'`：Python 的 bool 要排除（`is_js_number`）。
- `Number(sum.toFixed(6))`：`js_to_fixed`（正好一半往遠離零進位）再轉回數字、再依 JS 的數字轉字串（`js_number_to_string`）。
"""

from __future__ import annotations

import math
from typing import Any, Mapping

from .csv_reader import js_number, js_trim
from .end_groups import analyze_end_groups
from .js_compat import is_js_number, js_div, js_number_to_string, js_to_fixed
from .repeat_unit import analyze_repeat_unit

FRACTION_TOLERANCE = 0.01
"""比例合計與 100 的容差（沿用任務 013）"""


def _bad(message: str) -> dict[str, Any]:
    return {"ok": False, "problem": {"code": "BAD_FRACTION", "message": message}}


def check_drawn_unit(structure: Mapping[str, Any] | None, analysis: Mapping[str, Any] | None, unit_number: int) -> dict[str, Any]:
    """對應 checkDrawnUnit：用 Ketcher 畫出的共聚物單元（任務 021）。structure＝{ valid, canonicalSmiles }，analysis＝analyze_repeat_unit 的結果。"""
    if structure is None or not structure["valid"] or js_trim(structure["canonicalSmiles"]) == "":
        return {"ok": False, "message": f"單元 {unit_number}：畫布上還沒有可用的結構。"}
    if "*" not in structure["canonicalSmiles"]:
        return {"ok": False, "message": f"單元 {unit_number}：重複單元需要恰好兩個連接點（*），目前沒有連接點。"}
    if analysis is None:
        return {"ok": False, "message": f"單元 {unit_number}：正在檢查連接點，請稍後再試。"}
    if not analysis["ok"]:
        return {"ok": False, "message": f"單元 {unit_number}：{analysis['problem']['message']}"}
    return {"ok": True, "smiles": structure["canonicalSmiles"]}


def units_of(canonical_smiles: str, spec: Mapping[str, Any] | None) -> list[Mapping[str, Any]]:
    """取出聚合物的所有單元：沒有 units（或空陣列）時為成分自己的 SMILES，100。"""
    units = spec.get("units") if spec is not None else None
    if units is not None and len(units) > 0:
        return list(units)
    return [{"smiles": canonical_smiles, "fraction": 100}]


def analyze_polymer_units(canonical_smiles: str, spec: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """對應 analyzePolymerUnits：分析各單元並求平均單元質量（mUnit 為 M̄_unit），再加上端基（M_ends 與是否有填）。
    錯誤：單元結構不合連接點規則、比例不是正數、比例合計不為 100（±0.01）、端基錯誤（BAD_END_GROUP）。"""
    units = _analyze_units_only(canonical_smiles, spec)
    if not units["ok"]:
        return units
    # 端基（任務 022）：M_ends 與是否有填；端基錯誤指出是端基 1 或 2
    ends = analyze_end_groups(spec)
    if not ends["ok"]:
        return {"ok": False, "problem": {"code": "BAD_END_GROUP", "message": ends["message"]}}
    return {**units, "mEnds": ends["mEnds"], "endsFilled": ends["filled"]}


def _analyze_units_only(canonical_smiles: str, spec: Mapping[str, Any] | None) -> dict[str, Any]:
    units = units_of(canonical_smiles, spec)
    spec_units = spec.get("units") if spec is not None else None
    single = len(units) == 1 and spec_units is None
    infos: list[dict[str, Any]] = []
    for i, unit in enumerate(units):
        a = analyze_repeat_unit(unit["smiles"])
        if not a["ok"]:
            if len(units) > 1:
                return {"ok": False, "problem": {**a["problem"], "message": f"單元 {i + 1}：{a['problem']['message']}"}}
            return a
        infos.append(a)
    if single:
        a = infos[0]
        return {"ok": True, **a, "units": [{"smiles": units[0]["smiles"], "mUnit": a["mUnit"], "molFraction": 1}]}
    basis = spec.get("fractionBasis") if spec is not None else None
    if basis is None:
        basis = "mol"
    for i, unit in enumerate(units):
        f = unit.get("fraction")  # 沒有這個欄位＝JS 的 undefined（不是數字）
        if not (is_js_number(f) and math.isfinite(f) and f > 0):
            return _bad(f"單元 {i + 1} 的比例必須是大於 0 的數字。")
    total_fraction = 0.0
    for unit in units:
        total_fraction = total_fraction + float(unit["fraction"])
    if abs(total_fraction - 100) > FRACTION_TOLERANCE + 1e-9:
        unit_label = "mol%" if basis == "mol" else "wt%"
        shown = js_number_to_string(js_number(js_to_fixed(total_fraction, 6)))
        return _bad(f"各單元的 {unit_label} 合計為 {shown}，應為 100（容差 ±0.01）。")
    # wt% 以各單元的 M_unit 換成莫耳分率：x_i ∝ w_i ÷ M_i
    weights: list[float] = []
    for i, unit in enumerate(units):
        fraction = float(unit["fraction"])
        weights.append(fraction if basis == "mol" else js_div(fraction, infos[i]["mUnit"]))
    total = 0.0
    for w in weights:
        total = total + w
    composition = [
        {"smiles": unit["smiles"], "mUnit": infos[i]["mUnit"], "molFraction": js_div(weights[i], total)} for i, unit in enumerate(units)
    ]
    m_avg = 0.0
    for c in composition:
        m_avg = m_avg + c["molFraction"] * c["mUnit"]
    return {"ok": True, **infos[0], "mUnit": m_avg, "units": composition}
