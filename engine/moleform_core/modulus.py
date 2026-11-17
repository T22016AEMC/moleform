"""體積模數 K 與彈性模數 E（van Krevelen 加成函數）。任務 P6B（PLAN 6.5；D62：新計算直接寫在 Python，沒有 TypeScript 對應）。

書中（van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 13.2.6 節，書頁 395）由加成函數估算體積模數 K 有三個方法：
- 式 (13.30)：K = ρ·(U_R/V)⁶ = (M/V)·(U_R/V)⁶（Rao 函數 U_R，增量表 Table 14.4）
- 式 (13.31)：K ≈ C_v/E_c = (C_v/C_p)·(C_p/E_c)（C_p：莫耳熱容；E_c：莫耳熱膨脹函數；C_p/C_v 取自 Fig. 5.4 的圖）
- 式 (13.32)：K ≈ 8.04·(E_coh + x_c·ΔH_m)/V（E_coh：內聚能，Chapter 7；ΔH_m：熔化熱，Chapter 5）
書的建議：沒有實驗值時取三個方法的平均（書頁 395：三個方法在 20% 內一致）。彈性模數 E 與剪切模數 G 的路徑是 E = 3G/(1 + G/(3K))（式 13.10、Table 13.2）
加上 Hartmann 函數 U_H 求 G（Example 13.2；增量同樣在 Table 14.4）。

本專案目前**沒有**這三個方法需要的增量表或函數：
- Rao 函數 U_R、Hartmann 函數 U_H 的增量（Table 14.4）：本專案沒有，本卡也沒有收錄。
- 莫耳熱容 C_p 的基團增量（Chapter 5）與 C_p/C_v 的圖（Fig. 5.4）：本專案沒有。（E_c 可由本專案的 CTE 模組取得，V 可由 Vm 模組取得。）
- 內聚能 E_coh 的基團增量（Chapter 7）與熔化熱 ΔH_m（Chapter 5）：本專案沒有。
依任務 P6B 的規則（只做能用本專案已有或本卡收錄的資料直接算出的方法，不自行找外部資料），三個方法與 E 都不做；本模組只回報每個方法缺什麼，
不輸出任何數值。要做的話，需要使用者決定收錄哪些表（見 docs/reports/P6B-結果.md）。
"""

from __future__ import annotations

from typing import Any

from .mol_graph import mol_from_smiles

MODULUS_MODEL = (
    "van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 13.2.6 節式 13.30–13.32（體積模數 K 的三個加成函數方法，書頁 395；Table 13.6）"
)
MODULUS_DISCLAIMER = (
    "本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。"
)
MODULUS_NOTES = "參考趨勢，與書的 20% 一致性（書頁 395）；目前缺必要的增量表，沒有輸出數值"
MODULUS_UNIT = "N/m²"

METHODS: tuple[dict[str, Any], ...] = (
    {
        "id": "rao",
        "equation": "式 (13.30)：K = ρ·(U_R/V)⁶",
        "page": "書頁 395（PDF 第 422 頁）",
        "status": "not_computable",
        "missing": ["Rao 函數 U_R 的基團增量（書中 Table 14.4）：本專案沒有這張表，P6B 也沒有收錄"],
        "available": ["V、ρ：可由本專案的 Vm 模組取得（Table 4.10）"],
    },
    {
        "id": "gruneisen",
        "equation": "式 (13.31)：K ≈ C_v/E_c = (C_v/C_p)·(C_p/E_c)",
        "page": "書頁 395（PDF 第 422 頁）",
        "status": "not_computable",
        "missing": [
            "莫耳熱容 C_p 的基團增量（書中 Chapter 5）：本專案沒有",
            "C_p/C_v（書中 Fig. 5.4，為圖）：本專案沒有",
        ],
        "available": ["E_c（莫耳熱膨脹函數）：可由本專案的 CTE 模組取得（式 4.17、4.18）"],
    },
    {
        "id": "gruneisen-tobolsky",
        "equation": "式 (13.32)：K ≈ 8.04·(E_coh + x_c·ΔH_m)/V",
        "page": "書頁 395（PDF 第 422 頁）",
        "status": "not_computable",
        "missing": [
            "內聚能 E_coh 的基團增量（書中 Chapter 7）：本專案沒有",
            "熔化熱 ΔH_m 的基團增量（書中 Chapter 5）：本專案沒有",
        ],
        "available": ["V：可由本專案的 Vm 模組取得"],
    },
)
YOUNG_PATH = {
    "equation": "E = 3G/(1 + G/(3K))（式 13.10，Table 13.2；Example 13.2）",
    "status": "not_computable",
    "missing": ["剪切模數 G：書中用 Hartmann 函數 U_H（增量在 Table 14.4），本專案沒有", "體積模數 K：見上列三個方法，目前都缺資料"],
}


def compute_modulus(smiles: str) -> dict[str, Any]:
    """檢查輸入並回報三個方法與 E 的路徑各缺什麼。目前不輸出數值（status 一律 missing）。status：missing／invalid。"""
    try:
        mol = mol_from_smiles(smiles)
    except Exception:  # noqa: BLE001
        mol = None
    if mol is None:
        return {"status": "invalid", "smiles": smiles, "message": "RDKit 無法解析這個 SMILES"}
    if mol.GetNumAtoms() == 0:
        return {"status": "invalid", "smiles": smiles, "message": "分子沒有任何原子"}
    return {
        "status": "missing",
        "smiles": smiles,
        "methods": [dict(m) for m in METHODS],
        "youngsModulus": dict(YOUNG_PATH),
        "summary": "體積模數 K 的三個方法都缺書中的增量表（Rao 函數、莫耳熱容、內聚能與熔化熱），本專案沒有也未收錄，所以不輸出 K；彈性模數 E 需要 K 與 G，同樣不輸出",
    }
