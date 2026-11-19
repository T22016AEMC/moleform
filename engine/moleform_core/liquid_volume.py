"""Liquid 區的 vol% 換算（任務 P8-1，PLAN 8.2；D62：新計算直接寫在 Python）。

每個 Liquid 成分的體積 V_i = m_i / ρ_i，vol%_i = 100·V_i / ΣV_j。質量用 wt% 比例即可（vol% 只需要相對質量）；有實際質量（g）時另算體積（cm³）。
密度：使用者輸入優先（P7-4a 的「密度」欄位）；沒有輸入時，成分的 SMILES 或 solventId 對應到溶劑資料表（`solvents.csv`）才使用表中的密度
（最接近 25 °C 的一列，標出溫度與出處）。兩者都沒有 → 該成分的密度為 missing；任何一個成分缺密度，所有成分的 vol% 都回報 missing（總體積不明）並指出是誰。
這是「直接計算」（質量 ÷ 密度的體積加成），沒有過量體積修正；密度是文獻或使用者輸入值，不是實測輸入（D02）。
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any

from . import solvents as _sv

LIQUID_VOLUME_MODEL = "Liquid 區體積百分率：V_i = m_i/ρ_i，vol%_i = 100·V_i/ΣV_j（理想體積加成，無過量體積）"
LIQUID_VOLUME_NOTE = "直接計算；密度為溶劑資料表（文獻值，待使用者審）或使用者輸入"
MAX_COMPONENTS = 200


def _q(value: float | None, unit: str, source: str) -> dict[str, Any]:
    if value is None:
        return {"value": None, "unit": unit, "source": source, "status": "missing"}
    return {"value": value, "unit": unit, "source": source, "status": "predicted"}


def _positive(v: object, label: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not v > 0:
        raise ValueError(f"{label} 必須是大於 0 的有限數字")
    return float(v)


def _non_negative(v: object, label: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0:
        raise ValueError(f"{label} 必須是不小於 0 的有限數字")
    return float(v)


def resolve_density(item: Mapping[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    """成分的密度：使用者輸入 > 溶劑資料表。回傳 (密度 dict, 缺的原因)。"""
    user = item.get("userDensity")
    if user is not None:
        return {"value": _positive(user, "userDensity"), "unit": "g/cm³", "source": str(item.get("userDensitySource") or "使用者輸入"), "temperatureC": None, "basis": "user"}, None
    sid = item.get("solventId")
    if not isinstance(sid, str) and isinstance(item.get("smiles"), str) and item["smiles"].strip() != "":
        sid = _sv.solvent_id_for_smiles(item["smiles"])
    s = _sv.get_solvent(sid) if isinstance(sid, str) else None
    if s is None:
        return None, "沒有輸入密度，且不在溶劑資料表（請在成分填入密度，或從溶劑資料表選取）"
    d = s.pick("density")
    if d is None:
        return None, f"溶劑資料表的「{s.name_en}」沒有密度，且沒有輸入密度"
    return {"value": d.value, "unit": d.unit, "source": f"溶劑資料表：{d.source}", "sourceDetail": d.source_detail, "temperatureC": d.temperature_c, "solventId": s.id, "basis": "table"}, None


def compute_liquid_volume(items: object) -> dict[str, Any]:
    """items：[{id?, name, amount（質量或 wt% 比例）, amountIsGram?, smiles?, solventId?, userDensity?, userDensitySource?}]。

    status：ok（全部算得出）／missing（至少一個成分缺密度或沒有質量比例）。每個成分都有 density、volPct（value／unit／source／status）與（質量是 g 時）volumeCm3。
    """
    if not isinstance(items, Sequence) or isinstance(items, (str, bytes)) or len(items) == 0:
        raise ValueError("components 必須是至少一項的陣列")
    if len(items) > MAX_COMPONENTS:
        raise ValueError(f"components 太多（上限 {MAX_COMPONENTS}）")
    rows: list[dict[str, Any]] = []
    problems: list[str] = []
    for i, it in enumerate(items):
        if not isinstance(it, Mapping):
            raise ValueError(f"第 {i + 1} 個成分必須是物件")
        name = str(it.get("name") or f"第 {i + 1} 項")
        amount = _non_negative(it.get("amount"), f"「{name}」的 amount")
        density, reason = resolve_density(it)
        row: dict[str, Any] = {"id": it.get("id"), "name": name, "amount": amount, "density": density, "densityReason": reason}
        if density is None:
            problems.append(f"「{name}」：{reason}")
        rows.append(row)
    is_gram = all(bool(it.get("amountIsGram")) for it in items)  # type: ignore[union-attr]
    total_v = 0.0
    if not problems:
        for r in rows:
            r["_v"] = r["amount"] / r["density"]["value"]
            total_v = total_v + r["_v"]
    result_rows: list[dict[str, Any]] = []
    status = "ok"
    if problems:
        status = "missing"
    elif not total_v > 0:
        status = "missing"
        problems.append("所有成分的用量都是 0，無法換算 vol%")
    for r in rows:
        v = r.pop("_v", None)
        if status == "ok" and v is not None:
            vol_pct = _q(100.0 * v / total_v, "%", LIQUID_VOLUME_MODEL)
            vol_cm3 = _q(v, "cm³", "體積 = 質量 ÷ 密度") if is_gram else None
        else:
            vol_pct = _q(None, "%", LIQUID_VOLUME_MODEL)
            vol_cm3 = None
        vol_pct["reason"] = None if status == "ok" else "；".join(problems)
        result_rows.append({**r, "volPct": vol_pct, "volumeCm3": vol_cm3})
    total = None
    if status == "ok" and is_gram:
        total = _q(total_v, "cm³", "各成分體積加總（理想體積加成）")
    return {"status": status, "components": result_rows, "totalVolume": total, "problems": problems, "model": LIQUID_VOLUME_MODEL, "note": LIQUID_VOLUME_NOTE}
