"""半分解溫度 Td,1/2（van Krevelen Yd,1/2 基團貢獻）。任務 P6B（PLAN 6.4；D62：新計算直接寫在 Python，沒有 TypeScript 對應）。

方法（van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 21.2.2 節，書頁 767）：
- M·Td,1/2 = Yd,1/2 = Σ Ni·Yd,1/2,i（式 21.4，Table 21.2）；Td,1/2 = 1000·ΣYd,1/2,i ÷ M（K）。M 為重複單元分子量（本專案的原子量表加總）。
- 基團切分沿用 Yg 的切分程式（tg.compute_tg_book），資料表換成 `yd_groups.csv`（Table 21.2）；共軛狀態（n／c／cc）、–C(CH3)2– 自由／受阻的判定規則與 Tg 相同。
- Td,1/2 是書定義的「半分解溫度」（等溫失重或 TGA 失重達一半的特徵溫度），不是 5% 失重溫度（Td5）；若要 Td5 需另議。
- 不做：書中兩個值卻沒說明條件的 –C(=O)–O–、–C(=O)NH–（回報缺基團）、受阻 –C(CH3)2–，以及 Table 21.2 沒有 SMARTS 的基團（回報缺基團）。
"""

from __future__ import annotations

import math
from typing import Any

from . import tg as _tg
from .y_tables import yd_yg_rows

TD_MODEL = (
    "van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 21.2.2 節式 21.4："
    "Td,1/2 = 1000·ΣYd,1/2,i ÷ M（Yd,1/2,i：K·kg/mol；M：g/mol；Table 21.2）"
)
TD_DISCLAIMER = (
    "本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。"
)
TD_NOTES = "這是書定義的半分解溫度 Td,1/2（失重達一半的特徵溫度），不是 5% 失重溫度（Td5）；若要 Td5 需另議。"
TD_UNIT = "K"


def compute_td(smiles: str) -> dict[str, Any]:
    """聚合物重複單元（含 `*`）的 Td,1/2。status：ok／missing／invalid。"""
    res = _tg.compute_tg_book(smiles, yd_yg_rows())
    if res["status"] == "invalid":
        return res
    if res["status"] == "missing":
        return {"status": "missing", "smiles": smiles, "polymer": res["polymer"], "groups": res["groups"], "missing": res["missing"]}
    mass = res["formulaMass"]
    if mass is None or mass == 0:
        return {"status": "invalid", "smiles": smiles, "message": "重複單元分子量無法計算（原子量表沒有的元素）"}
    sum_yd = res["sumYg"]
    td_k = 1000 * sum_yd / mass
    if not math.isfinite(td_k):
        return {"status": "invalid", "smiles": smiles, "message": "沒有可計算的基團（沒有重原子）"}
    groups = [{**x, "ydi": x["ygi"]} for x in res["groups"]]
    for x in groups:
        del x["ygi"]
        del x["mi"]
    return {
        "status": "ok",
        "smiles": smiles,
        "polymer": res["polymer"],
        "tdK": td_k,
        "tdC": td_k - 273.15,
        "sumYd": sum_yd,
        "unitMass": mass,
        "groups": groups,
        "containsTentative": any(x["tentative"] for x in groups),
        "sources": list(dict.fromkeys(x["source"] for x in groups)),
    }
