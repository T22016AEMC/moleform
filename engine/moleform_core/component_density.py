"""任務 P8-3：配方成分密度的取得順序（混合密度、混合介電的質量→體積換算、固化收縮共用）。

順序（使用者 2026-11-19 決定，任務 P8-3；只在既有順序最前面加上 k、最後面加上類別預設）：
  0. 呼叫端直接給的 density（引擎層的選用輸入，不改）
  1. 堆積係數 k（聚合物重複單元）：使用者輸入的 k ＞ k 表（成分名稱與 k 表「材料名稱」逐字相同）；Vm = VvdW／k（D61、任務 038），ρ = M／Vm
  2. 書 Va（莫耳體積基團表，298 K；既有的預測密度，不改）
  3. 使用者輸入的密度 userDensity（P7-4a，不改）
  4. D57 類別預設（只在書 Va 算不出時；k = 1／(c + 1.3)，標「類別預設，非材料值」）
沒有 k、沒有使用者密度時，結果與修改前逐位相同（第 2、3 步沿用既有程式）。
共聚物：各單元的 Vm 與單元質量按莫耳分率加權（wt% 先換算莫耳分率，`copolymer.analyze_polymer_units`），ρ = Σxᵢ·Mᵢ ÷ Σxᵢ·Vmᵢ
（與共聚比例掃描 `/copolymer-scan` 同一算法）。

只呼叫現有模組（vw、vm、free_volume、packing_k、relative_tg、copolymer），沒有新的參數或資料表；不為任何特定化合物寫分支。
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any

from . import vm as _vm
from .copolymer import analyze_polymer_units
from .free_volume import compute_free_volume_unit
from .js_compat import js_div
from .packing_k import find_packing_k_row
from .relative_tg import packing_k_from_class_coefficient, vm_from_packing_k
from .vw import compute_vdw_volume

USER_DENSITY_LABEL = "使用者輸入（文獻或供應商資料，非預測）"
CLASS_DEFAULT_MARK = "類別預設，非材料值"
SOURCE_LABELS = {
    "given": "呼叫端提供的密度",
    "userK": "使用者輸入的堆積係數 k（Vm = VvdW／k，D61）",
    "tableK": "k 表（材料名稱命中；Vm = VvdW／k，D61）",
    "predicted": "書 Va（莫耳體積基團表，298 K）",
    "user": USER_DENSITY_LABEL,
    "class": f"{CLASS_DEFAULT_MARK}（D57 類別係數換算 k = 1／(c + 1.3)，Vm = VvdW／k）",
}
SOURCE_ORDER = "取得順序：堆積係數 k（使用者輸入 ＞ k 表名稱命中）＞ 書 Va ＞ 使用者密度 ＞ D57 類別預設（只在 Va 算不出時）"
REMEDY = "可以：填寫此成分的密度（文獻或供應商資料）、把成分名稱改成 k 表的材料名稱、或輸入堆積係數 k"
REMEDY_NO_VW = "可以：填寫此成分的密度（文獻或供應商資料）；此結構書的 VW 缺基團，輸入堆積係數 k 或使用 k 表名稱也無法換算 Vm"


def _remedy(smiles_list: Sequence[str]) -> str:
    """缺密度時「使用者可以怎麼補」：VW 也缺時，k 幫不上忙，只建議填密度。"""
    for s in smiles_list:
        if compute_vdw_volume(s)["status"] != "ok":
            return REMEDY_NO_VW
    return REMEDY


def _positive(v: object, label: str) -> float:
    if not (isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and v > 0):
        raise ValueError(f"{label} 必須是大於 0 的有限數字")
    return float(v)


def _packing_k(c: Mapping[str, Any], label: str) -> tuple[float | None, str | None, dict[str, Any] | None]:
    """成分的堆積係數 k：使用者輸入 ＞ k 表（名稱逐字相同）。回傳 (k, 來源, k 表列資訊)。"""
    user_k = c.get("packingK")
    if user_k is not None:
        k = _positive(user_k, f"{label}的堆積係數 k（packingK）")
        if not (k < 1):
            raise ValueError(f"{label}的堆積係數 k（packingK）必須在 0 與 1 之間")
        return k, "userK", None
    name = c.get("name")
    if isinstance(name, str) and name != "":
        row = find_packing_k_row(name)
        if row is not None:
            return row.packing_k, "tableK", {"id": row.id, "name": row.name, "packingK": row.packing_k, "category": row.category}
    return None, None, None


def _unit_by_k(smiles: str, packing_k: float) -> dict[str, Any]:
    vw = compute_vdw_volume(smiles)
    if vw["status"] != "ok":
        return {"ok": False, "why": "書的 VW（Table 4.2，含 Bondi 補充）缺基團，無法由 k 算 Vm" if vw["status"] == "missing" else f"VW 無法計算：{vw.get('message', '')}"}
    v = vm_from_packing_k(vw["vw"], packing_k)
    return {"ok": True, "vm": v, "mass": vw["formulaMass"], "vvdw": vw["vw"]}


def _unit_by_va(smiles: str) -> dict[str, Any]:
    r = _vm.compute_molar_volume_density(smiles)
    if r["status"] == "ok" and r["amorphous"] is not None:
        return {"ok": True, "vm": r["amorphous"]["vm"], "mass": r["unitMass"], "density": r["amorphous"]["density"]}
    return {"ok": False, "status": r["status"], "message": r.get("message")}


def _unit_by_class(smiles: str) -> dict[str, Any]:
    fv = compute_free_volume_unit(smiles)
    if fv["status"] != "ok":
        return {"ok": False, "why": "D57 結構類別辨識不出（使用者經驗自由體積法的基團表缺基團），沒有類別預設"}
    coef = fv["coefficient"]
    k = packing_k_from_class_coefficient(coef["coefficient"])
    by_k = _unit_by_k(smiles, k)
    if not by_k["ok"]:
        return {"ok": False, "why": by_k["why"]}
    return {**by_k, "packingK": k, "className": coef["name"], "coefficient": coef["coefficient"]}


def _k_detail(k: float, k_src: str, row: Mapping[str, Any] | None) -> str:
    where = "使用者輸入" if k_src == "userK" else f"取自 k 表「{row['name']}」（{row['id']}，待使用者審）" if row is not None else "k 表"
    return f"堆積係數 k = {k}（{where}）"


def _class_detail(u: Mapping[str, Any]) -> str:
    return f"{CLASS_DEFAULT_MARK}（D57 類別「{u['className']}」，係數 c = {u['coefficient']}，k = 1／(c + 1.3)）"


def _result(density: float | None, source: str | None, why: str | None, **extra: Any) -> dict[str, Any]:
    out: dict[str, Any] = {"density": density, "source": source, "reason": why}
    out.update(extra)
    return out


def _single(c: Mapping[str, Any], smiles: str, label: str, user: float | None) -> dict[str, Any]:
    polymer = "*" in smiles
    notes: list[str] = []
    if polymer:
        k, k_src, row = _packing_k(c, label)
        if k is not None and k_src is not None:
            u = _unit_by_k(smiles, k)
            if u["ok"]:
                return _result(js_div(u["mass"], u["vm"]), k_src, None, vm=u["vm"], packingK=k, detail=_k_detail(k, k_src, row), kRow=row)
            notes.append(f"有堆積係數 k = {k}，但{u['why']}；改用下一順位")
    # 第 2、3 步：既有順序（書 Va ＞ 使用者密度），不改
    r = _vm.compute_molar_volume_density(smiles)
    if r["status"] == "ok" and r["amorphous"] is not None:
        return _result(r["amorphous"]["density"], "predicted", None, vm=r["amorphous"]["vm"], notes=notes)
    if user is not None:
        return _result(user, "user", None, notes=notes)
    if r["status"] == "unsupported":
        return _result(None, None, "小分子液體密度（Fedors）尚未收錄，請自行提供 density", remedy="可以：填寫此成分的密度（文獻或供應商資料）")
    if r["status"] not in ("missing", "ok"):
        raise ValueError(f"{label}：{r['message']}")
    # 第 4 步：書 Va 算不出（聚合物）→ D57 類別預設
    base_why = "莫耳體積表缺基團，算不出密度" if r["status"] == "missing" else "單元質量無法計算，算不出密度"
    cls = _unit_by_class(smiles)
    if cls["ok"]:
        return _result(js_div(cls["mass"], cls["vm"]), "class", None, vm=cls["vm"], packingK=cls["packingK"], detail=_class_detail(cls), notes=[*notes, f"書 Va：{base_why}"])
    return _result(None, None, base_why, notes=[*notes, cls["why"]], remedy=_remedy([smiles]))


def _copolymer(c: Mapping[str, Any], units: Sequence[Mapping[str, Any]], label: str, user: float | None) -> dict[str, Any]:
    spec = {"units": list(units), "fractionBasis": c.get("fractionBasis") or "mol"}
    analysis = analyze_polymer_units(units[0]["smiles"], spec)
    if not analysis["ok"]:
        return _result(None, None, f"共聚物組成有問題：{analysis['problem']['message']}", remedy="請修正共聚物的單元與比例")
    parts = [(u["smiles"], u["molFraction"]) for u in analysis["units"]]
    notes: list[str] = []

    def combine(per_unit: list[dict[str, Any]]) -> tuple[float, float]:
        mass = 0.0
        vol = 0.0
        for (_s, x), u in zip(parts, per_unit):
            mass = mass + x * u["mass"]
        for (_s, x), u in zip(parts, per_unit):
            vol = vol + x * u["vm"]
        return mass, vol

    def unit_rows(per_unit: list[dict[str, Any]], sources: list[str]) -> list[dict[str, Any]]:
        return [
            {"index": i + 1, "smiles": s, "molFraction": x, "vm": u["vm"], "mass": u["mass"], "source": src}
            for i, ((s, x), u, src) in enumerate(zip(parts, per_unit, sources))
        ]

    k, k_src, row = _packing_k(c, label)
    if k is not None and k_src is not None:
        per = [_unit_by_k(s, k) for s, _x in parts]
        bad = next((i for i, u in enumerate(per) if not u["ok"]), None)
        if bad is None:
            mass, vol = combine(per)
            detail = f"{_k_detail(k, k_src, row)}，各單元 Vm = VvdW／k"
            return _result(js_div(mass, vol), k_src, None, vm=vol, packingK=k, detail=detail, kRow=row, units=unit_rows(per, [k_src] * len(per)))
        notes.append(f"有堆積係數 k = {k}，但第 {bad + 1} 個單元：{per[bad]['why']}；改用下一順位")

    va = [_unit_by_va(s) for s, _x in parts]
    if all(u["ok"] for u in va):
        mass, vol = combine(va)
        return _result(js_div(mass, vol), "predicted", None, vm=vol, units=unit_rows(va, ["predicted"] * len(va)), notes=notes)
    if user is not None:
        return _result(user, "user", None, notes=notes)
    per: list[dict[str, Any]] = []
    sources: list[str] = []
    for i, ((s, _x), u) in enumerate(zip(parts, va)):
        if u["ok"]:
            per.append(u)
            sources.append("predicted")
            continue
        if u["status"] not in ("missing", "ok"):
            return _result(None, None, f"第 {i + 1} 個單元：{u.get('message') or '莫耳體積無法計算'}", remedy=REMEDY)
        cls = _unit_by_class(s)
        if not cls["ok"]:
            return _result(
                None, None, f"第 {i + 1} 個單元（{s}）取不到 Vm：書 Va 缺基團，{cls['why']}", notes=notes, remedy=_remedy([s]), missingUnit=i + 1
            )
        per.append(cls)
        sources.append("class")
    mass, vol = combine(per)
    class_units = [str(i + 1) for i, src in enumerate(sources) if src == "class"]
    return _result(
        js_div(mass, vol),
        "class",
        None,
        vm=vol,
        units=unit_rows(per, sources),
        detail=f"{CLASS_DEFAULT_MARK}：第 {'、'.join(class_units)} 個單元書 Va 缺基團，改用 D57 類別預設"
        + ("；其餘單元用書 Va" if len(class_units) < len(sources) else ""),
        notes=notes,
    )


def resolve_component_density(c: Mapping[str, Any], label: str) -> dict[str, Any]:
    """成分密度（g/cm³）。回傳 {density, source, reason, detail?, vm?, packingK?, units?, notes?, remedy?}；
    source：given／userK／tableK／predicted／user／class；算不出時 density 與 source 為 None，reason 說明缺什麼、remedy 說明可以怎麼補。"""
    if c.get("density") is not None:
        return _result(_positive(c["density"], f"{label}的 density"), "given", None)
    user = _positive(c["userDensity"], f"{label}的 userDensity") if c.get("userDensity") is not None else None
    if c.get("packingK") is not None:
        _packing_k(c, label)  # 先檢查格式（無效的 k 一律拒絕）
    units = c.get("units")
    if isinstance(units, Sequence) and not isinstance(units, (str, bytes)) and len(units) > 1:
        for u in units:
            if not (isinstance(u, Mapping) and isinstance(u.get("smiles"), str)):
                raise ValueError(f"{label}的 units 必須是由 {{smiles, fraction}} 組成的陣列")
        return _copolymer(c, units, label, user)
    smiles = c.get("smiles")
    if (not isinstance(smiles, str) or smiles.strip() == "") and isinstance(units, Sequence) and not isinstance(units, (str, bytes)) and len(units) == 1:
        only = units[0]
        smiles = only.get("smiles") if isinstance(only, Mapping) else None
    if not isinstance(smiles, str) or smiles.strip() == "":
        if user is not None:
            return _result(user, "user", None)
        return _result(None, None, "沒有提供密度（density 或 smiles）", remedy="可以：填寫此成分的密度（文獻或供應商資料）")
    return _single(c, smiles, label, user)
