"""成分 Tg（Fox–Flory）與混合配方的未固化 Tg（Fox 式）。對應 src/core/properties/tgMixing.ts（任務 M05 組 1-2、1-4；D62／D63）。

演算法與 TypeScript 逐步等價。依 039a 的建議，**不搬** `formulation/compute` 與 `formulation/molecularWeight`：
`compute_formulation_tg` 由呼叫端傳入已經算好的各成分質量百分比（TS 的 `solidResult.components[].wtPct.value`）與分子量／Mn
（TS 的 `mnById`），Python 版只做其餘邏輯（分類、成分 Tg、Fox 混合、部分混合值）。

- 加總一律用明確迴圈（不用內建 `sum()`）；`foxMix` 的 `s + w / total / tgK` 照 TS 的運算順序（先 `w / total` 再 `/ tgK`）。
- 小分子成分的 Tm 用 Joback（`joback.compute_joback`）。
"""

from __future__ import annotations

import re
from typing import Any, Mapping, Sequence

from rdkit import Chem

from .joback import compute_joback
from .novolac_units import identify_cresol_novolac
from .tg import compute_tg
from .tg_mn_data import TgKRow, load_tg_k_rows

FOX_FLORY_MODEL = "Fox–Flory：Tg = Tg∞ − K/Mn（van Krevelen 式 6.10，書頁 146；原出處 Fox and Flory 1950）。K 按樹脂類別由文獻資料擬合（tg_flory_k.csv），不跨類別"
FOX_MIX_MODEL = (
    "Fox 混合式：1/Tg = Σ wᵢ/Tgᵢ（wᵢ 為質量分率）。書中沒有此式、Fox 1956 原文未核對；由 Gordon–Taylor 1952 式 (1)（原文頁 493）取 k = Tg₁/Tg₂ 導出；"
    "屬近似（假設成分互溶、混合體積加成）"
)
SMALL_MOLECULE_TG_MODEL = "小分子不計算 Tg，只給 Tm（Joback，D52；有文獻熔點時另標文獻值）（D56）"
SMALL_MOLECULE_TG_NA = "不適用（小分子只有 Tm，D56）"
SMALL_MOLECULE_WARNING = "未計入小分子的增塑效應，混合 Tg 可能偏高"
CATALYST_CATEGORY = "Catalyst/Initiator"
FLAG_LOW = "低可信度"
FLAG_EXTRAPOLATED = "外推，未驗證"
FLAG_CALIBRATED = "含校準基團"
UNIFIED_NOTE = "本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。"

_MAP_TOKEN = re.compile(r"\[\*:[0-9]+\]", re.ASCII)


# ---------- 公式 ----------


def fox_flory(tg_inf_k: float, k: float, mn: float) -> float:
    """Fox–Flory：Tg = Tg∞ − K/Mn（K 單位 K·g/mol、Mn 單位 g/mol）。"""
    if not (mn > 0):
        raise ValueError("Mn 必須大於 0")
    return tg_inf_k - k / mn


def fox_mix(items: Sequence[Mapping[str, float]]) -> float:
    """Fox 混合：1/Tg = Σ wᵢ/Tgᵢ；質量分率會先正規化為合計 1。單一成分回傳成分 Tg。"""
    if len(items) == 0:
        raise ValueError("沒有成分可混合")
    total = 0.0
    for it in items:
        if not (it["w"] > 0) or not (it["tgK"] > 0):
            raise ValueError("質量分率與 Tg 都必須大於 0")
        total = total + it["w"]
    inv = 0.0
    for it in items:
        inv = inv + it["w"] / total / it["tgK"]
    return 1 / inv


# ---------- 成分 Tg ----------


def _blank(c: Mapping[str, Any], kind: str, fraction: float | None) -> dict[str, Any]:
    return {
        "id": c["id"],
        "name": c["name"],
        "category": c["category"],
        "kind": kind,
        "solidFraction": fraction,
        "status": "missing",
        "tgK": None,
        "tgInfGroupK": None,
        "kUsed": None,
        "mn": None,
        "tmK": None,
        "flags": [],
        "missingReason": None,
        "resinClass": None,
    }


def _canonical_no_maps(smiles: str) -> str | None:
    try:
        mol = Chem.MolFromSmiles(_MAP_TOKEN.sub("*", smiles))
    except Exception:  # noqa: BLE001
        return None
    if mol is None:
        return None
    return Chem.MolToSmiles(mol)


def find_k_class(unit_smiles: str, rows: Sequence[TgKRow] | None = None) -> TgKRow | None:
    """重複單元與哪個樹脂類別的代表單元相同（逐字比對，不近似）；找不到回傳 None。"""
    rows = load_tg_k_rows() if rows is None else rows
    cresol = identify_cresol_novolac(unit_smiles)
    if cresol is not None:
        for r in rows:
            if r.resin_class == cresol:
                return r
        return None
    mine = _canonical_no_maps(unit_smiles)
    if mine is None:
        return None
    for r in rows:
        if _canonical_no_maps(r.unit_smiles) == mine:
            return r
    return None


def polymer_component_tg(
    c: Mapping[str, Any], mn: float | None, fraction: float | None, rows: Sequence[TgKRow] | None = None
) -> dict[str, Any]:
    """聚合物成分的 Tg：Tg∞（基團貢獻）− K/Mn；缺基團、缺 K、無 Mn、共聚物都回報缺成分 Tg。"""
    rows = load_tg_k_rows() if rows is None else rows
    out = _blank(c, "polymer", fraction)
    polymer = c.get("polymer")
    units = polymer.get("units") if polymer is not None else None
    if units and len(units) > 1:
        bad: list[str] = []
        for i, u in enumerate(units):
            r = compute_tg(u["smiles"])
            if r["status"] != "ok":
                bad.append(f"單元 {i + 1} 缺基團")
        out["missingReason"] = f"共聚物成分：本卡不處理共聚比例影響，也沒有共聚物的 K{'（' + '、'.join(bad) + '）' if len(bad) > 0 else ''}"
        return out
    tg = compute_tg(c["canonicalSmiles"])
    cls = find_k_class(c["canonicalSmiles"], rows)
    fitted_inf = cls.tg_inf_fixed_k if (cls is not None and cls.state == "收錄" and cls.tg_inf_source == "擬合" and cls.tg_inf_fixed_k is not None) else None
    if tg["status"] == "ok":
        out["tgInfGroupK"] = tg["tgK"]
        if tg["containsCalibrated"]:
            out["flags"].append(FLAG_CALIBRATED)
    elif fitted_inf is None:
        out["missingReason"] = "缺基團，算不出 Tg∞" if tg["status"] == "missing" else "結構無法計算 Tg∞"
        return out
    if cls is None:
        out["missingReason"] = "缺 K：此重複單元不屬於任何已有 K 的樹脂類別，未做分子量修正（只輸出 Tg∞）"
        return out
    out["resinClass"] = cls.resin_class
    if cls.state != "收錄" or cls.k is None:
        out["missingReason"] = f"缺 K：類別「{cls.class_name}」資料不足，未做分子量修正（只輸出 Tg∞）"
        return out
    if mn is None or not (mn > 0):
        out["missingReason"] = "缺 Mn，無法做分子量修正"
        return out
    out["mn"] = mn
    out["kUsed"] = cls.k
    tg_inf = fitted_inf if fitted_inf is not None else (tg["tgK"] if tg["status"] == "ok" else None)
    if tg_inf is None:
        out["missingReason"] = "缺基團，算不出 Tg∞"
        return out
    tg_k = fox_flory(tg_inf, cls.k, mn)
    out["status"] = "ok"
    out["tgK"] = tg_k
    out["flags"].append(cls.confidence)
    if (cls.mn_min is not None and mn < cls.mn_min) or (cls.mn_max is not None and mn > cls.mn_max):
        out["flags"].append(FLAG_EXTRAPOLATED)
    return out


def small_molecule_component_tg(c: Mapping[str, Any], fraction: float | None) -> dict[str, Any]:
    """小分子成分：不計算 Tg（D56），只給 Joback Tm（算不出時 Tm 為 None）；不參與混合。"""
    out = _blank(c, "small", fraction)
    out["status"] = "not-applicable"
    out["missingReason"] = SMALL_MOLECULE_TG_NA
    j = compute_joback(c["canonicalSmiles"])
    if j["status"] == "ok" and j["tfK"] is not None:
        out["tmK"] = j["tfK"]
    return out


# ---------- 配方未固化 Tg ----------


def _is_polymer(c: Mapping[str, Any]) -> bool:
    return "*" in c["canonicalSmiles"]


def compute_formulation_tg(
    solid: Sequence[Mapping[str, Any]],
    wt_pct_by_id: Mapping[str, float | None] | None,
    mn_by_id: Mapping[str, float | None],
    *,
    error_messages: Sequence[str] | None = None,
    k_rows: Sequence[TgKRow] | None = None,
) -> dict[str, Any]:
    """對應 computeFormulationTg 的 Fox 混合部分。

    `solid`：Solid 區的成分（id、name、category、canonicalSmiles、polymer、volatileFlag）。
    `wt_pct_by_id`：各成分的質量百分比（TS 的 `solidResult.components[].wtPct.value`）；`None` 表示配方換算失敗
    （TS 的 `!solidResult`），此時回報 status 'error' 並附 `error_messages`（TS 的 `outcome.errors` 中 area 不是 liquid 的訊息）。
    `mn_by_id`：各成分的分子量／Mn（TS 的 `mnById`，沒有為 None）。
    """
    k_rows = load_tg_k_rows() if k_rows is None else k_rows
    base: dict[str, Any] = {
        "model": f"{FOX_MIX_MODEL}；{FOX_FLORY_MODEL}；{SMALL_MOLECULE_TG_MODEL}",
        "confidence": "trend",
        "tgK": None,
        "tgC": None,
        "notCounted": [],
        "components": [],
        "missing": [],
        "partial": None,
        "excluded": [],
        "messages": [],
        "notes": [UNIFIED_NOTE, "Liquid 區成分不混。分子量只用於計算，不顯示在畫面上（D09）。"],
    }
    if wt_pct_by_id is None:
        return {**base, "status": "error", "messages": list(error_messages or [])}

    def fraction_of(id_: str) -> float | None:
        v = wt_pct_by_id.get(id_)
        return None if v is None else v / 100

    # ---- 分類：排除與參與混合 ----
    excluded: list[dict[str, Any]] = []
    components: list[dict[str, Any]] = []
    for c in solid:
        if c["category"] == CATALYST_CATEGORY:
            excluded.append({"id": c["id"], "name": c["name"], "kind": "catalyst", "reason": "Catalyst/Initiator（D26），不混入；不假設排除門檻，是否調整由使用者決定"})
            continue
        if c.get("volatileFlag") is True:
            excluded.append({"id": c["id"], "name": c["name"], "kind": "volatile", "reason": "標記為揮發或分解，不混入"})
            continue
        w = fraction_of(c["id"])
        if _is_polymer(c):
            components.append(polymer_component_tg(c, mn_by_id.get(c["id"]), w, k_rows))
        else:
            components.append(small_molecule_component_tg(c, w))

    not_counted = [c["name"] for c in components if c["status"] == "not-applicable"]
    messages: list[str] = []
    for e in excluded:
        messages.append(f"{'催化劑／起始劑' if e['kind'] == 'catalyst' else '揮發或分解'}成分未混入：{e['name']}（{e['reason']}）")
    if len(not_counted) > 0:
        messages.append(f"未計入：{'、'.join(not_counted)}（{SMALL_MOLECULE_TG_NA}）；{SMALL_MOLECULE_WARNING}")
    if len(components) == 0:
        return {**base, "status": "unavailable", "components": components, "excluded": excluded, "messages": [*messages, "沒有可混合的 Solid 成分"]}
    missing = [c for c in components if c["status"] == "missing"]
    for m in missing:
        messages.append(f"缺成分 Tg：{m['name']}（{m['missingReason']}）")
    usable = [c for c in components if c["status"] == "ok" and c["solidFraction"] is not None and c["solidFraction"] > 0]

    def mix_of() -> float:
        return fox_mix([{"w": c["solidFraction"], "tgK": c["tgK"]} for c in usable])

    if len(usable) == 0 and len(missing) == 0:
        return {
            **base,
            "status": "unavailable",
            "components": components,
            "notCounted": not_counted,
            "excluded": excluded,
            "messages": [*messages, "沒有聚合物或寡聚物成分可混合（小分子不計 Tg，D56）"],
        }
    if len(missing) == 0:
        tg_k = mix_of()
        return {**base, "status": "complete", "tgK": tg_k, "tgC": tg_k - 273.15, "components": components, "notCounted": not_counted, "excluded": excluded, "messages": messages}
    partial: dict[str, Any] | None = None
    if len(usable) > 0:
        tg_k = mix_of()
        fraction = 0.0
        for c in usable:
            fraction = fraction + c["solidFraction"]
        partial = {
            "tgK": tg_k,
            "tgC": tg_k - 273.15,
            "included": [c["name"] for c in usable],
            "removed": [m["name"] for m in missing],
            "fraction": fraction,
        }
        messages.append(f"部分混合值（非完整配方）：去除 {'、'.join(partial['removed'])} 後，只混 {'、'.join(partial['included'])}")
    else:
        messages.append("所有參與混合的成分都缺 Tg，沒有部分混合值")
    return {
        **base,
        "status": "incomplete",
        "components": components,
        "notCounted": not_counted,
        "missing": [m["name"] for m in missing],
        "partial": partial,
        "excluded": excluded,
        "messages": messages,
    }
