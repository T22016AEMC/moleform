"""Mw／Mn／DP 與 PDI 的換算。對應 src/core/polymer/convert.ts（任務 M04，PLAN 6A.4-03；D62／D63）。

演算法與 TypeScript 逐步等價：Mn ＝ Mw ÷ PDI；DP_n ＝ (Mn − M_ends) ÷ M̄_unit；DP_w ＝ (Mw − M_ends) ÷ M̄_unit；輸入 DP 時 Mn ＝ DP × M̄_unit ＋ M_ends。
TypeScript 仍是預設計算來源，本模組沒有接到介面。

JS 語意的幾個地方（逐項照 TS 重現）：
- JS 只有 number（雙精度）：所有數字輸入先轉成 `float`，運算順序與 TS 逐步相同（`mn = mw / pdi`、`mw = mn * pdi`、`mn = dp * mUnit + mEnds`）。
- `given(v) = v !== undefined && !Number.isNaN(v)`：`null` 算「有填」（`Number.isNaN(null)` 是 false），之後 `isPositive(null)` 為假，回傳「必須是大於 0 的數字」。
  Python 用哨兵 `UNDEFINED` 區分「沒有這個鍵」與 `None`（JSON null）。
- `Number(mEnds.toFixed(3))`：`js_to_fixed`（正好一半往遠離零進位；Python 的 `format` 是銀行家捨入）再轉回數字、再依 JS 轉字串。
  本模組沒有 `Math.round` 與 `pow`／`log`。
- 除法用 `js_div`（JS 的除以零不拋例外）。
"""

from __future__ import annotations

import math
from typing import Any, Mapping

from .csv_reader import js_number, js_trim
from .end_groups import end_group_note
from .js_compat import is_js_number, js_div, js_number_to_string, js_to_fixed
from .polymer_types import DEFAULT_PDI, END_GROUP_NOTE

UNDEFINED: Any = object()
"""JS 的 undefined（與 None＝null 區分）"""

MESSAGE_PDI_RANGE = "PDI 必須是大於或等於 1 的數字。"
MESSAGE_PDI_DEFAULT = "使用預設 PDI = 2"
MESSAGE_PDI_LEGACY = "PDI 未填，使用預設值 2"


def _is_positive(v: Any) -> bool:
    return is_js_number(v) and math.isfinite(v) and v > 0


def _is_pdi(v: Any) -> bool:
    return is_js_number(v) and math.isfinite(v) and v >= 1


def dp_from_mn(mn: float, m_unit: float) -> float:
    return js_div(float(mn), float(m_unit))


def mn_from_dp(dp: float, m_unit: float) -> float:
    return float(dp) * float(m_unit)


def _given(v: Any) -> bool:
    return v is not UNDEFINED and not (isinstance(v, float) and math.isnan(v))


def resolve_polymer(spec: Mapping[str, Any], m_unit: Any, ends: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """對應 resolvePolymer：由使用者輸入的 Mw、Mn 或 DP（擇一）、選填的 PDI、平均重複單元質量與端基求出其他值。
    成功回傳 { ok, basis, mw, mn, dp, dpW, pdi, pdiIsDefault, legacy, note }；失敗回傳 { ok: False, error }。"""
    m_ends_raw = ends.get("mEnds") if ends is not None else None
    m_ends = float(m_ends_raw) if m_ends_raw is not None else 0.0
    mw_input = spec.get("mwInput", UNDEFINED)
    mn_input = spec.get("mnInput", UNDEFINED)
    dp_input = spec.get("dpInput", UNDEFINED)
    pdi_input = spec.get("pdiInput", UNDEFINED)
    has_mw = _given(mw_input)
    has_mn = _given(mn_input)
    has_dp = _given(dp_input)
    count = 0
    for flag in (has_mw, has_mn, has_dp):
        if flag:
            count += 1
    if count > 1:
        return {"ok": False, "error": "Mw、Mn、DP 請擇一填寫。"}
    if count == 0:
        return {"ok": False, "error": "請輸入 Mw（或改填 Mn、DP）。"}
    if not _is_positive(m_unit):
        return {"ok": False, "error": "重複單元的分子量無法計算。"}
    m_unit = float(m_unit)
    has_pdi = _given(pdi_input)
    if has_pdi and not _is_pdi(pdi_input):
        return {"ok": False, "error": MESSAGE_PDI_RANGE}
    pdi = float(pdi_input) if has_pdi else float(DEFAULT_PDI)

    if has_mw:
        if not _is_positive(mw_input):
            return {"ok": False, "error": "Mw 必須是大於 0 的數字。"}
        basis = "mw"
        mw = float(mw_input)
        mn = js_div(mw, pdi)
    elif has_mn:
        if not _is_positive(mn_input):
            return {"ok": False, "error": "Mn 必須是大於 0 的數字。"}
        basis = "mn"
        mn = float(mn_input)
        mw = mn * pdi
    else:
        if not _is_positive(dp_input):
            return {"ok": False, "error": "DP 必須是大於 0 的數字。"}
        basis = "dp"
        mn = mn_from_dp(dp_input, m_unit) + m_ends
        mw = mn * pdi
    if not (mn > m_ends):
        shown = js_number_to_string(js_number(js_to_fixed(m_ends, 3)))
        return {"ok": False, "error": f"Mn 必須大於端基質量合計（M_ends = {shown}）"}
    return {
        "ok": True,
        "basis": basis,
        "mw": mw,
        "mn": mn,
        "dp": dp_from_mn(mn - m_ends, m_unit),
        "dpW": dp_from_mn(mw - m_ends, m_unit),
        "pdi": pdi,
        "pdiIsDefault": not has_pdi,
        "legacy": (not has_pdi) and basis != "mw",
        "note": end_group_note(ends["filled"]) if ends is not None else END_GROUP_NOTE,
    }


def parse_polymer_spec(value: Any) -> dict[str, Any]:
    """對應 parsePolymerSpec：驗證從檔案讀回的聚合物設定。格式不對回傳 { ok: False, reason }，沒有問題回傳 { ok: True, spec }（整理後的設定）。
    舊檔（只有 mnInput 或 dpInput）可直接讀入。"""
    if not isinstance(value, dict):  # JS：!value || typeof !== 'object' || Array.isArray（null、數字、字串、陣列都不是設定物件）
        return {"ok": False, "reason": "聚合物設定格式錯誤"}

    def norm(v: Any) -> Any:
        return UNDEFINED if v is None else v  # undefined 與 null 都視為沒填

    mw = norm(value.get("mwInput"))
    mn = norm(value.get("mnInput"))
    dp = norm(value.get("dpInput"))
    pdi = norm(value.get("pdiInput"))
    if (mw is not UNDEFINED and not _is_positive(mw)) or (mn is not UNDEFINED and not _is_positive(mn)) or (dp is not UNDEFINED and not _is_positive(dp)):
        return {"ok": False, "reason": "Mw、Mn 或 DP 必須是大於 0 的數字"}
    if pdi is not UNDEFINED and not _is_pdi(pdi):
        return {"ok": False, "reason": "PDI 必須是大於或等於 1 的數字"}
    count = 0
    for v in (mw, mn, dp):
        if v is not UNDEFINED:
            count += 1
    if count > 1:
        return {"ok": False, "reason": "Mw、Mn、DP 只能填一個"}
    if count == 0:
        return {"ok": False, "reason": "聚合物缺少 Mw、Mn 或 DP"}
    if mw is not UNDEFINED:
        spec: dict[str, Any] = {"mwInput": mw}
    elif mn is not UNDEFINED:
        spec = {"mnInput": mn}
    else:
        spec = {"dpInput": dp}
    if pdi is not UNDEFINED:
        spec["pdiInput"] = pdi
    # 共聚物（任務 020）：舊檔沒有 units，視為均聚物
    units = value.get("units")
    fraction_basis = value.get("fractionBasis")
    if units is not None:
        if not isinstance(units, list) or len(units) == 0:
            return {"ok": False, "reason": "共聚物的單元清單格式錯誤"}
        parsed_units: list[dict[str, Any]] = []
        for u in units:
            # JS：!u || typeof u !== 'object'（陣列是 object，會繼續往下；之後取不到 smiles 而被擋下）
            if not isinstance(u, (dict, list)):
                return {"ok": False, "reason": "共聚物的單元格式錯誤"}
            smiles = u.get("smiles") if isinstance(u, dict) else None
            fraction = u.get("fraction") if isinstance(u, dict) else None
            if not isinstance(smiles, str) or "*" not in smiles:
                return {"ok": False, "reason": "共聚物的單元需有 SMILES 與連接點（*）"}
            if not is_js_number(fraction) or not math.isfinite(fraction) or fraction <= 0:
                return {"ok": False, "reason": "共聚物單元的比例必須是大於 0 的數字"}
            parsed_units.append({"smiles": smiles, "fraction": fraction})
        if fraction_basis is not None and fraction_basis != "mol" and fraction_basis != "wt":
            return {"ok": False, "reason": "共聚物的比例基準必須是 mol 或 wt"}
        spec["units"] = parsed_units
        if fraction_basis == "mol" or fraction_basis == "wt":
            spec["fractionBasis"] = fraction_basis
    # 端基（任務 022）：舊檔沒有，視為兩端都不填
    end_groups = value.get("endGroups")
    if end_groups is not None:
        if not isinstance(end_groups, dict):
            return {"ok": False, "reason": "端基設定格式錯誤"}
        parsed_ends: dict[str, Any] = {}
        for key in ("end1", "end2"):
            e = end_groups.get(key)
            if e is None:
                continue
            if not isinstance(e, dict) or not isinstance(e.get("smiles"), str) or js_trim(e["smiles"]) == "":
                return {"ok": False, "reason": f"端基 {1 if key == 'end1' else 2} 的 SMILES 格式錯誤"}
            preset_id = e.get("presetId")
            parsed_ends[key] = {"smiles": e["smiles"], "presetId": preset_id} if isinstance(preset_id, str) else {"smiles": e["smiles"]}
        if "end1" in parsed_ends or "end2" in parsed_ends:
            spec["endGroups"] = parsed_ends
    return {"ok": True, "spec": spec}
