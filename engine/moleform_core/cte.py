"""聚合物（重複單元）的熱膨脹係數 CTE。對應 src/core/properties/cte.ts（任務 M03，PLAN 6A.4-05；D62／D63）。

演算法與 TypeScript 逐步等價：由 VW（vw.compute_vdw_volume）與 Tg（tg.compute_tg）計算，直接呼叫 Python 函式，不經 HTTP。
TypeScript 仍是預設計算來源，本模組沒有接到介面。

- 係數（式 4.17、4.18、4.24、4.8b、4.27）逐字取自 TS 的 CTE_COEFFICIENTS；Python 的浮點字面值與 JS 相同（同為 IEEE 754 double）。
- 運算順序與 TS 逐步對照：`E = 係數 × VW`、`α = E ÷ V`、`β = α ÷ 3`、`e = E ÷ M`、`V_g(298) = (1.43 + 0.55e-3 × Tg) × VW`、
  `α_g = (0.45e-3 × VW) ÷ V_g(298)`。除法用 `_js_div`（JS 的除以零不拋例外）。
- 本模組沒有加總；VW 與質量由 vw.py 以明確迴圈（不用內建 `sum()`）算出。
- R1／R2／R3／R4 的配對與原子索引都在 vw.py、tg.py 內處理（M01、M02 已逐字比對），本模組不碰 RDKit。
"""

from __future__ import annotations

from typing import Any

from . import tg as _tg
from .vw import compute_vdw_volume

CTE_MODEL = (
    "van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 4.4 節 MTE 模型："
    "E_l = 1.00×10⁻³·VW（式 4.17，書頁 91）、E_g = 0.45×10⁻³·VW（式 4.18）；α = E/V（式 4.9，書頁 89）；"
    "V_r(298) = 1.60·VW（式 4.24）、V_g(298) = [1.43 + 0.55×10⁻³·Tg]·VW（式 4.27，書頁 95）；β = α/3（式 4.9）"
)
CTE_DISCLAIMER = (
    "基團加成估算，非實測；CTE 隨溫度與固化度變化。書中平均偏差：E_l 8%、E_g 12%（Table 4.12，書頁 94）；實驗數據本身約 ±5%。"
)
CTE_SMALL_MOLECULE = "不適用（小分子，D56）"

# 書中係數（式 4.17、4.18、4.24、4.8b、4.27）；逐字取自 TS 的 CTE_COEFFICIENTS
CTE_EL = 1.0e-3
CTE_EG = 0.45e-3
CTE_VR298 = 1.6
CTE_VG298_SIMPLE = 1.6
CTE_VG298_BASE = 1.43
CTE_VG298_PER_TG = 0.55e-3


def _js_div(a: float, b: float) -> float:
    return _tg._js_div(a, b)


def _values_of(molar: float, volume: float, mass: float | None) -> dict[str, Any]:
    alpha = _js_div(molar, volume)
    return {
        "molar": molar,
        "specific": None if mass is None else _js_div(molar, mass),
        "alpha": alpha,
        "beta": _js_div(alpha, 3),
    }


def cte_from_vw(vw: float, mass: float | None) -> dict[str, dict[str, Any]]:
    """對應 cteFromVw：純計算（輸入為已知 VW、質量）。"""
    return {
        "rubbery": _values_of(CTE_EL * vw, CTE_VR298 * vw, mass),
        "glassy": _values_of(CTE_EG * vw, CTE_VG298_SIMPLE * vw, mass),
    }


def glass_alpha_from_tg(vw: float, tg_k: float) -> dict[str, float]:
    """對應 glassAlphaFromTg：式 4.27，V_g(298) = [1.43 + 0.55e-3·Tg]·VW，α_g = E_g / V_g(298)。"""
    vg298 = (CTE_VG298_BASE + CTE_VG298_PER_TG * tg_k) * vw
    alpha = _js_div(CTE_EG * vw, vg298)
    return {"vg298": vg298, "alpha": alpha, "beta": _js_div(alpha, 3)}


def compute_cte(smiles: str) -> dict[str, Any]:
    """對應 computeCte。回傳與 TS 的 CteResult 同樣欄位名稱的 dict（status 為 ok／notApplicable／missing／invalid）。"""
    vwr = compute_vdw_volume(smiles)
    if vwr["status"] == "invalid":
        return vwr
    if not vwr["polymer"]:
        return {"status": "notApplicable", "smiles": smiles, "message": CTE_SMALL_MOLECULE}
    if vwr["status"] == "missing":
        return {
            "status": "missing",
            "smiles": smiles,
            "missingInput": "VW",
            "message": "缺 VW：Table 4.2 缺基團，不計算、不猜值",
            "missing": vwr["missing"],
        }
    mass = vwr["formulaMass"]
    vals = cte_from_vw(vwr["vw"], mass)
    tg = _tg.compute_tg(smiles)  # 預設選項（含校準基團），與 TS `computeTg(RDKit, smiles)` 相同
    if tg["status"] == "ok":
        g = glass_alpha_from_tg(vwr["vw"], tg["tgK"])
        glassy_from_tg: dict[str, Any] = {
            "status": "ok",
            "tgK": tg["tgK"],
            "containsCalibrated": tg["containsCalibrated"],
            **g,
            "note": (
                "Tg 低於 298 K：298 K 時聚合物已是橡膠態，式 4.27 的 V_g(298) 是外推值；書中沒有說明此情形"
                if tg["tgK"] < 298
                else None
            ),
        }
    else:
        glassy_from_tg = {
            "status": "missing",
            "message": (
                "缺 Tg：Table 6.1 缺基團（含校準基團仍配不完），式 4.27 不計算"
                if tg["status"] == "missing"
                else f"缺 Tg：{tg['message']}"
            ),
        }
    return {
        "status": "ok",
        "smiles": smiles,
        "polymer": True,
        "vw": vwr["vw"],
        "rubbery": vals["rubbery"],
        "glassy": vals["glassy"],
        "glassyFromTg": glassy_from_tg,
        "vwBondiSupplement": vwr["bondiSupplement"],
        "vwBondiNotes": vwr["bondiNotes"],
        "sources": vwr["sources"],
        "model": CTE_MODEL,
    }
