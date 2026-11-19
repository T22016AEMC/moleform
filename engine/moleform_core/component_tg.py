"""任務 P8-3：配方成分 Tg 的備援——書的基團加成缺基團時，條件齊全才改用 Bondi FFV 相對 Tg（任務 038、D61）。

順序（不改原順序）：先用書的基團加成（`tg_mixing.polymer_component_tg`，Tg∞ − K/Mn）；**只有基團缺失**時才看備援條件：
  - 參考聚合物 A 的結構（SMILES，VvdW 需要）
  - 參考聚合物 A 的 Tg（使用者輸入的錨點；或 A 的名稱對到 k／Tg 表且表內有 Tg）——D61：錨點輸入不屬於 D02 禁止的實驗輸入
  - 本成分的堆積係數 k（使用者輸入，或成分名稱對到 k 表）
  - 參考聚合物 A 的堆積係數 k（使用者輸入，或 A 的名稱對到 k 表）
條件不齊就維持 missing，原因寫明缺什麼；程式不自行挑參考聚合物、不自訂 k 或 Δα。
共聚物成分：B 的組成以「每 1 mol A」為基準（D61 補註、任務 038c）：比例取各單元的莫耳分率，參考成分是與 A 結構相同的那個單元（恰好一個），否則 missing。
只呼叫現有模組（tg、relative_tg、packing_k、copolymer），沒有新的參數或資料表；不為任何特定化合物寫分支。
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .copolymer import analyze_polymer_units
from .packing_k import find_packing_k_row, table_tg_of
from .relative_tg import RELATIVE_TG_MODEL, relative_tg
from .tg import compute_tg
from .tg_mixing import _canonical_no_maps

METHOD = "bondiRelativeTg"
METHOD_LABEL = "Bondi FFV 相對 Tg（任務 038、D61；參考趨勢，非 Fox–Flory 的分子量修正值）"
FLAG_TREND = "參考趨勢"
FLAG_TABLE = "k／Tg 表內 Tg（非估算）"
REMEDY = "可以在此成分的「參考聚合物 A」欄位補上：A 的 SMILES、A 的 Tg（錨點）、A 的堆積係數 k；並在此成分輸入堆積係數 k（或把名稱改成 k 表的材料名稱）"


def _units(c: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    p = c.get("polymer")
    units = p.get("units") if isinstance(p, Mapping) else None
    if units and len(units) > 1:
        return list(units)
    return [{"smiles": c["canonicalSmiles"], "fraction": 100}]


def _group_missing(units: list[Mapping[str, Any]]) -> bool:
    for u in units:
        if compute_tg(u["smiles"])["status"] == "missing":
            return True
    return False


def _k_of(packing_k: Any, name: Any) -> tuple[float | None, str | None]:
    if packing_k is not None:
        return float(packing_k), "使用者輸入"
    if isinstance(name, str) and name != "":
        row = find_packing_k_row(name)
        if row is not None:
            return row.packing_k, f"k 表「{row.name}」"
    return None, None


def _with_reason(r: dict[str, Any], extra: str, needs: list[str] | None = None, message: str | None = None) -> dict[str, Any]:
    base = r.get("missingReason") or "算不出"
    out = {**r, "missingReason": f"{base}；{extra}"}
    out["fallback"] = {"method": METHOD, "status": "missing", "needs": needs or [], "message": message or extra, "remedy": REMEDY}
    return out


def bondi_fallback(c: Mapping[str, Any], r: dict[str, Any]) -> dict[str, Any]:
    """`tg_mixing.compute_formulation_tg` 的 polymer_fallback：r 是書的基團加成結果（status missing）。"""
    units = _units(c)
    if not _group_missing(units):
        return r  # 不是基團缺失（例如缺 K、缺 Mn）：不走備援，維持原結果
    ref = c.get("referencePolymer") if isinstance(c.get("referencePolymer"), Mapping) else None
    needs: list[str] = []
    ref_smiles = ref.get("smiles") if ref is not None else None
    if not (isinstance(ref_smiles, str) and ref_smiles.strip() != ""):
        needs.append("參考聚合物 A 的結構（SMILES）")
    ref_name = ref.get("name") if ref is not None else None
    tg_a_c = ref.get("tgC") if ref is not None else None
    if tg_a_c is None:
        row = find_packing_k_row(ref_name) if isinstance(ref_name, str) and ref_name != "" else None
        t = table_tg_of(row) if row is not None else None
        if t is None or t["status"] != "ok":
            needs.append("參考聚合物 A 的 Tg（錨點）")
    k_b, k_b_src = _k_of(c.get("packingK"), c.get("name"))
    if k_b is None:
        needs.append("本成分的堆積係數 k（輸入 k，或成分名稱對到 k 表）")
    k_a, _k_a_src = _k_of(ref.get("packingK") if ref is not None else None, ref_name)
    if k_a is None:
        needs.append("參考聚合物 A 的堆積係數 k（輸入 k，或 A 的名稱對到 k 表）")
    if needs:
        return _with_reason(r, f"Bondi FFV 相對 Tg（D61）條件不齊：需要{'、'.join(needs)}", needs)
    assert isinstance(ref_smiles, str) and ref is not None and k_b is not None and k_a is not None

    a_monomer: dict[str, Any] = {"smiles": ref_smiles, "packingK": k_a}
    if isinstance(ref_name, str) and ref_name != "":
        a_monomer["name"] = ref_name
    a = {"monomers": [a_monomer]}
    if len(units) == 1:
        b_monomer: dict[str, Any] = {"smiles": units[0]["smiles"], "packingK": k_b}
        if c.get("name"):
            b_monomer["name"] = c["name"]
        b: dict[str, Any] = {"monomers": [b_monomer]}
    else:
        p = c["polymer"]
        analysis = analyze_polymer_units(units[0]["smiles"], {"units": units, "fractionBasis": p.get("fractionBasis") or "mol"})
        if not analysis["ok"]:
            return _with_reason(r, f"Bondi FFV 相對 Tg：共聚物組成有問題（{analysis['problem']['message']}）")
        ref_canon = _canonical_no_maps(ref_smiles)
        matches = [i for i, u in enumerate(analysis["units"]) if ref_canon is not None and _canonical_no_maps(u["smiles"]) == ref_canon]
        if len(matches) != 1:
            return _with_reason(
                r,
                "Bondi FFV 相對 Tg：共聚物以「每 1 mol A」為基準（D61 補註），參考聚合物 A 必須是共聚物其中一個單元（結構相同的單元恰好一個）"
                f"，目前有 {len(matches)} 個",
                ["參考聚合物 A 改為共聚物其中一個單元的結構"],
            )
        b = {
            "monomers": [{"smiles": u["smiles"], "packingK": k_b, "amount": u["molFraction"]} for u in analysis["units"]],
            "basis": "ratio",
            "referenceIndex": matches[0],
        }
    inp: dict[str, Any] = {"a": a, "b": b}
    if tg_a_c is not None:
        inp["tgA"] = {"value": tg_a_c, "unit": "C"}
    out = relative_tg(inp)
    if out["status"] == "rejected":
        return _with_reason(r, f"Bondi FFV 相對 Tg 無法計算：{out['message']}")
    tg_b = out["tgB"]
    if tg_b.get("status") not in ("ok", "table"):
        miss = "；".join(m.get("message", "") for m in out.get("missing", []) if m.get("message"))
        why = miss or tg_b.get("message") or "Tg_B 算不出"
        return _with_reason(r, f"Bondi FFV 相對 Tg 算不出：{why}")
    flags = [FLAG_TREND] if tg_b["status"] == "ok" else [FLAG_TABLE]
    return {
        **r,
        "status": "ok",
        "tgK": tg_b["tgK"],
        "missingReason": None,
        "flags": flags,
        "tgMethod": METHOD,
        "tgModel": f"{METHOD_LABEL}；{RELATIVE_TG_MODEL}",
        "relativeTg": {
            "deltaF": out["deltaF"],
            "tgA": out["tgA"],
            "tgB": tg_b,
            "packingKB": {"value": k_b, "source": k_b_src},
            "warnings": out["warnings"],
            "notes": out["notes"],
            "bookReason": r.get("missingReason"),
        },
    }
