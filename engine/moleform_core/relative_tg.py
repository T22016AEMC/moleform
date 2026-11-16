"""簡易的聚合物 Tg 相對估算（Simha–Boyer 型，Bondi 型 FFV）。對應 src/core/properties/relativeTg.ts（任務 M05 組 1-2；D62／D63）。

演算法與 TypeScript 逐步等價：Tg_B = Tg_A − Δf／Δα；Δf =（Vf_B − Vf_A）／V_A；Vf = Vm − 1.3 × VvdW。
呼叫現有的 Python 模組：VW（`vw.compute_vdw_volume`）、D57 結構類別（`free_volume.compute_free_volume_unit`）、Va（`vm.compute_molar_volume_density`）、
CTE（`cte.cte_from_vw`）、k／Tg 表（`packing_k`）、Fox 混合（`tg_mixing.fox_mix`）。

輸入／輸出的欄位名稱與 TS 的 `RelativeTgInput`／`RelativeTgResult` 相同（JSON 物件；TS 的 `undefined` 對應「沒有這個鍵」）。
JS 語意：
- 加總用明確迴圈（不用內建 `sum()`）；除法用 `js_div`。
- `String(Number(v.toPrecision(d)))`（TS 的 `fmt`）用 `js_to_precision_number`＋`js_number_to_string`（正好一半往遠離零進位）。
- `Number.isFinite(v) && v > 0`（TS 的 `positive`）：Python 的 bool 要排除。
- TS 在輸入不合法時 `throw new Error(...)`（`compositionVolumes`、`molesPerMoleA`、`numericItems` 等）：Python 拋 `ValueError`，訊息逐字相同。
"""

from __future__ import annotations

import math
from typing import Any, Mapping, Sequence

from .cte import cte_from_vw
from .free_volume import compute_free_volume_unit
from .js_compat import is_js_number, js_div, js_number_to_string, js_to_precision_number
from .csv_reader import js_trim
from .packing_k import PACKING_K_NOT_FOUND, PackingKRow, find_packing_k_row, load_packing_k_rows, table_tg_of
from .tg_mixing import FOX_MIX_MODEL, UNIFIED_NOTE, fox_mix
from .vm import compute_molar_volume_density
from .vw import compute_vdw_volume

BONDI_OCCUPIED_FACTOR = 1.3
"""V0 ≈ 1.30 × VW（van Krevelen & te Nijenhuis 2009 式 4.2，書頁 76；Bondi 的近似）。固定常數，不開放覆寫"""
KELVIN_OFFSET = 273.15
VA_TEMPERATURE_K = 298
DEFAULT_DENSITY_TEMPERATURE_C = 25
VM_TEMPERATURE_TOLERANCE_K = 0.5

RELATIVE_TG_MODEL = (
    "簡易 Tg 相對估算（任務 038，D61）：Tg_B = Tg_A − Δf／Δα（Simha–Boyer 型）；Δf =（Vf_B − Vf_A）／V_A（使用者 2026-11-13 指定的範例算法，分母用 A 的體積）；"
    "Vf = Vm − 1.3 × VvdW；Bondi 型 FFV = 1 − 1.3 × VvdW／Vm（1.3：van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009) 式 4.2，書頁 76）；"
    "VvdW 用書的 Table 4.2 基團加成（含 Bondi 1964 補充）；Δα = α_l − α_g 取自書的 CTE 模型（式 4.17、4.18，書頁 91；V 用 A 的 Vm）"
)
RELATIVE_TG_DISCLAIMER = "簡易經驗估算，非經實驗驗證的通用預測模型；不是 WLF 完整模型；Δα 覆寫值 K 須由同家族實驗資料校正"
RELATIVE_TG_CONFIDENCE = "參考趨勢"
RELATIVE_TG_CTE_LABEL = "Δα 取自書的基團加成 CTE 模型（非實測）；相對估算，可能高估變化量，需同家族實驗校正"
RELATIVE_TG_OVERRIDE_LABEL = "Δα 取自使用者輸入的 Δα 覆寫值 K（K = 1／Δα）；相對估算，Δα 覆寫值 K 須由同家族實驗資料校正"
RELATIVE_TG_SMALL_MOLECULE = "不適用（小分子，D56）"
RELATIVE_TG_FFV_NOTE = (
    "本功能的自由體積分率稱為「Bondi 型 FFV」（1 − 1.3 × VvdW／Vm）：書（式 4.2，書頁 76）只說 V0(0) ≈ 1.3 × VW 是 Bondi 的近似，沒有把它定義為自由體積"
)
RELATIVE_TG_INCREMENT_NOTE = (
    "Δf 不是 FFV_B − FFV_A：Δf =（Vf_B − Vf_A）／V_A，分母只用 A 的體積（使用者 2026-11-13 指定的範例算法）。"
    "A、B 的堆積係數 k 相同時 FFV_A = FFV_B，但只要 B 的 Σ（莫耳數 × VvdW）與 A 不同，Δf 就不為 0；Δf 與 A、B 的莫耳數基準、重複單元的寫法有關"
)
RELATIVE_TG_MN_UNCHECKED = "未檢查分子量是否相近"
RELATIVE_TG_VA_WARNING = "Vm 來自 Va 估算：Δf 與 FFV 受 Va 估算誤差影響，可能與差值同量級"
RELATIVE_TG_TABLE_B_NOTE = "B 是 k／Tg 表內的材料且組成沒改：直接顯示表內 Tg（各材料的初始 Tg），不做估算；不以表內 Tg 互相預測或比對"
RELATIVE_TG_FOX_LABEL = "比較用，與本法獨立"
RELATIVE_TG_CALIBRATION_LABEL = "單一組校正，未經驗證"
RELATIVE_TG_MOLE_WEIGHTED_LABEL = "莫耳加權近似"
RELATIVE_TG_FRACTION_WARNING = (
    "請以每 1 mol A 為基準輸入：B 的莫耳數看起來是分率（總和為 1 且每項小於 1），基準不明；程式不自行換算（比例請用 basis「ratio」輸入）"
)
FRACTION_SUM_TOLERANCE = 1e-6

VM_SOURCE_LABELS = {
    "userK": "Vm 由使用者堆積係數估算（非實測）；堆積係數 k 為使用者輸入",
    "tableK": "Vm 由使用者堆積係數估算（非實測）；堆積係數 k 取自使用者的 k／Tg 表",
    "classK": "Vm 由 D57 結構類別係數換算的堆積係數估算；類別預設，非材料值",
    "density": "Vm 由使用者輸入的密度與結構單元質量計算（Vm = M／ρ）",
    "va": "Va 估算（任務 029，書的基團加成，298 K）",
}


# ---------- JS 相容的小工具 ----------


def _positive(v: Any) -> bool:
    """`Number.isFinite(v) && v > 0`"""
    return is_js_number(v) and math.isfinite(v) and v > 0


def _s(v: Any) -> str:
    """模板字串 `${v}` 中的數字（JS 的 Number#toString）；非數字原樣轉字串。"""
    return js_number_to_string(v) if is_js_number(v) else str(v)


def _fmt(v: float, digits: int = 4) -> str:
    """TS 的 `fmt`：`String(Number(v.toPrecision(digits)))`"""
    return js_number_to_string(js_to_precision_number(v, digits))


# ---------- 溫度 ----------


def to_kelvin(t: Mapping[str, Any]) -> float:
    return t["value"] if t["unit"] == "K" else t["value"] + KELVIN_OFFSET


def to_celsius(kelvin: float) -> float:
    return kelvin - KELVIN_OFFSET


# ---------- 純計算 ----------


def bondi_ffv(vomega: float, vm: float) -> float:
    """Bondi 型 FFV = 1 − 1.3 × VvdW／Vm"""
    return 1 - js_div(BONDI_OCCUPIED_FACTOR * vomega, vm)


def vm_from_packing_k(vomega: float, packing_k: float) -> float:
    return js_div(vomega, packing_k)


def ffv_from_packing_k(packing_k: float) -> float:
    return 1 - BONDI_OCCUPIED_FACTOR * packing_k


def packing_k_from_class_coefficient(coefficient: float) -> float:
    return js_div(1, coefficient + BONDI_OCCUPIED_FACTOR)


def composition_volumes(items: Sequence[Mapping[str, Any]]) -> dict[str, float]:
    """組成的體積（理想體積加成）：V = Σ n_i·Vm_i、Vf = Σ n_i·(Vm_i − 1.3·VvdW_i)。輸入不是正數時拋出。"""
    if len(items) == 0:
        raise ValueError("組成是空的")
    moles = 0
    vomega = 0
    vm = 0
    for it in items:
        if not _positive(it["moles"]) or not _positive(it["vomega"]) or not _positive(it["vm"]):
            raise ValueError("莫耳數、VvdW、Vm 都必須是大於 0 的數字")
        moles = moles + it["moles"]
        vomega = vomega + it["moles"] * it["vomega"]
        vm = vm + it["moles"] * it["vm"]
    v0 = BONDI_OCCUPIED_FACTOR * vomega
    return {"moles": moles, "vomega": vomega, "vm": vm, "v0": v0, "vf": vm - v0, "ffv": bondi_ffv(vomega, vm)}


def moles_per_mole_a(ratio: Sequence[float], reference_index: Any) -> list[float]:
    """比例 → 每 1 mol A 的莫耳數：n_i = r_i／r_參考。比例不是正數或參考索引超出範圍時拋出。"""
    if len(ratio) == 0:
        raise ValueError("比例是空的")
    is_int = is_js_number(reference_index) and math.isfinite(reference_index) and float(reference_index).is_integer()
    if not is_int or reference_index < 0 or reference_index >= len(ratio):
        raise ValueError(f"參考成分的索引超出範圍：{_s(reference_index)}")
    if not all(_positive(r) for r in ratio):
        raise ValueError("比例必須都是大於 0 的數字")
    ref = ratio[int(reference_index)]
    return [js_div(r, ref) for r in ratio]


def looks_like_fractions(amounts: Sequence[float]) -> bool:
    """看起來像分率：兩項以上、每項小於 1、總和為 1（容許差 FRACTION_SUM_TOLERANCE）。"""
    if len(amounts) < 2 or not all(x < 1 for x in amounts):
        return False
    total = 0
    for x in amounts:
        total = total + x
    return abs(total - 1) <= FRACTION_SUM_TOLERANCE


def free_volume_increment(a: Mapping[str, float], b: Mapping[str, float]) -> float:
    """Δf =（Vf_B − Vf_A）／V_A（範例算法：分母只用 A 的體積）"""
    return js_div(b["vf"] - a["vf"], a["vm"])


def delta_alpha_from_cte(vomega: float, vm: float) -> float:
    """Δα = α_l − α_g =（E_l − E_g）／V。E_l、E_g 由 `cte_from_vw` 取得（式 4.17、4.18）。"""
    c = cte_from_vw(vomega, None)
    return js_div(c["rubbery"]["molar"] - c["glassy"]["molar"], vm)


def estimate_tg_b(tg_a_k: float | None, delta_f: float | None, delta_alpha_a: float | None, alpha_override: Any = None) -> dict[str, Any]:
    """由 Tg_A、Δf 與 Δα（或 Δα 覆寫值 K）算 Tg_B。缺任何一項、或 Δα 覆寫值 K ≤ 0，就不輸出 Tg_B。（alpha_override 為 None＝TS 的 undefined）"""
    has_override = alpha_override is not None
    if has_override and not _positive(alpha_override):
        return {"status": "unavailable", "message": f"Δα 覆寫值 K 必須是正數（自由體積大者 Tg 低）：{_s(alpha_override)}；不輸出 Tg_B"}
    if delta_f is None:
        return {"status": "unavailable", "message": "缺 Δf（缺 VW 或缺莫耳體積），不輸出 Tg_B"}
    if not has_override and (delta_alpha_a is None or not _positive(delta_alpha_a)):
        return {"status": "unavailable", "message": "Δα 算不出來（缺 VW 或缺基團），使用者也沒有輸入 Δα 覆寫值 K：只顯示 FFV 與 Δf，不輸出 Tg_B"}
    if tg_a_k is None:
        return {"status": "unavailable", "message": "缺 A 的 Tg（錨點）：請輸入，或選用 k／Tg 表內有 Tg 的材料"}
    delta_tg_k = (-alpha_override) * delta_f if has_override else js_div(-delta_f, delta_alpha_a)
    tg_k = tg_a_k + delta_tg_k
    return {
        "status": "ok",
        "tgK": tg_k,
        "tgC": to_celsius(tg_k),
        "deltaTgK": delta_tg_k,
        "deltaAlphaUsed": js_div(1, alpha_override) if has_override else delta_alpha_a,
        "alphaSource": "override" if has_override else "cte",
        "label": RELATIVE_TG_OVERRIDE_LABEL if has_override else RELATIVE_TG_CTE_LABEL,
    }


def _numeric_items(items: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for it in items:
        has_k = it.get("packingK") is not None
        has_vm = it.get("vm") is not None
        if has_k == has_vm:
            raise ValueError("每一項必須恰好給堆積係數 k 或 Vm 其中一個")
        if has_k and not (it["packingK"] > 0 and it["packingK"] < 1):
            raise ValueError("堆積係數 k 必須在 0 與 1 之間")
        moles = it.get("moles")
        out.append({"moles": 1 if moles is None else moles, "vomega": it["vomega"], "vm": it["vm"] if has_vm else vm_from_packing_k(it["vomega"], it["packingK"])})
    return out


def relative_tg_from_volumes(inp: Mapping[str, Any]) -> dict[str, Any]:
    """純計算：輸入各單體的 VvdW 與堆積係數 k（或 Vm）、莫耳數、A 的 Tg；輸入不合法時拋出。"""
    warnings: list[str] = []
    b_items = inp["b"]
    b_moles = [1 if it.get("moles") is None else it["moles"] for it in inp["b"]]
    basis = inp.get("bBasis")
    if basis == "ratio":
        if inp.get("bReferenceIndex") is None:
            raise ValueError("比例輸入必須指定參考成分（A 的重複單元）的索引")
        converted = moles_per_mole_a(b_moles, inp["bReferenceIndex"])
        b_items = [{**it, "moles": converted[i]} for i, it in enumerate(inp["b"])]
    elif basis is not None and basis != "mol":
        raise ValueError(f"B 的 moles 單位只能是 mol 或 ratio：{basis}")
    elif looks_like_fractions(b_moles):
        warnings.append(RELATIVE_TG_FRACTION_WARNING)
    a = composition_volumes(_numeric_items(inp["a"]))
    b = composition_volumes(_numeric_items(b_items))
    tg_a_k = to_kelvin(inp["tgA"])
    if not _positive(tg_a_k):
        raise ValueError("A 的 Tg 必須高於絕對零度")
    delta_f = free_volume_increment(a, b)
    delta_alpha_a = delta_alpha_from_cte(a["vomega"], a["vm"])
    return {
        "a": a,
        "b": b,
        "deltaF": delta_f,
        "deltaAlphaA": delta_alpha_a,
        "deltaAlphaB": delta_alpha_from_cte(b["vomega"], b["vm"]),
        "tgAK": tg_a_k,
        "tgB": estimate_tg_b(tg_a_k, delta_f, delta_alpha_a, inp.get("alphaOverride")),
        "warnings": warnings,
    }


def calibrate_alpha_override(tg_a: Mapping[str, Any], tg_b: Mapping[str, Any], delta_f: float) -> dict[str, Any]:
    """輔助：由一對 Tg 皆已知的聚合物（A、B）與其 Δf 反推 Δα 覆寫值 K =（Tg_A − Tg_B）／Δf。Δf 為 0 時拒絕。"""
    if not math.isfinite(delta_f) or delta_f == 0:
        return {"status": "rejected", "message": "Δf 為 0（或不是數字），無法反推 Δα 覆寫值 K"}
    a = to_kelvin(tg_a)
    b = to_kelvin(tg_b)
    if not _positive(a) or not _positive(b):
        return {"status": "rejected", "message": "Tg 必須高於絕對零度"}
    return {"status": "ok", "alphaOverride": (a - b) / delta_f, "label": RELATIVE_TG_CALIBRATION_LABEL}


# ---------- 由結構計算 ----------


def _reject(code: str, message: str) -> dict[str, Any]:
    return {"rejected": {"code": code, "message": message}}


def _evaluate_monomer(m: Mapping[str, Any], basis: str, rows: Sequence[PackingKRow]) -> dict[str, Any]:
    name = m.get("name") if (m.get("name") is not None and m.get("name") != "") else None
    smiles = m.get("smiles") if (m.get("smiles") is not None and js_trim(m["smiles"]) != "") else None
    if name is None and smiles is None:
        return _reject("INVALID_INPUT", "單體沒有材料名稱，也沒有結構（SMILES）")
    label = name if name is not None else smiles
    amount = 1 if m.get("amount") is None else m["amount"]
    if not _positive(amount):
        return _reject("INVALID_INPUT", f"「{label}」的用量必須是大於 0 的數字：{_s(amount)}")
    user_k = m.get("packingK")
    if user_k is not None and not (_positive(user_k) and user_k < 1):
        return _reject("INVALID_INPUT", f"「{label}」的堆積係數 k 必須在 0 與 1 之間：{_s(user_k)}")
    density = m.get("density")
    if density is not None and not _positive(density):
        return _reject("INVALID_INPUT", f"「{label}」的密度必須是大於 0 的數字：{_s(density)}")

    notes: list[str] = []
    missing: list[dict[str, Any]] = []
    polymer: bool | None = None
    vomega: float | None = None
    mass: float | None = None
    vw_bondi_supplement = False

    # ---- VvdW：現有書的 VW 計算 ----
    if smiles is not None:
        vw = compute_vdw_volume(smiles)
        if vw["status"] == "invalid":
            return _reject("INVALID_STRUCTURE", f"「{label}」：{vw['message']}")
        polymer = vw["polymer"]
        if vw["status"] == "ok":
            vomega = vw["vw"]
            mass = vw["formulaMass"]
            vw_bondi_supplement = vw["bondiSupplement"]
            if vw["bondiSupplement"]:
                notes.append(f"VvdW {'；'.join(vw['bondiNotes'])}")
        else:
            missing.append({"what": "VW", "message": "缺 VW：書的 Table 4.2（含 Bondi 補充）缺基團，不計算、不猜值", "atoms": vw["missing"]})
    else:
        missing.append({"what": "VW", "message": "缺 VW：沒有結構（k／Tg 表不含 SMILES），請提供重複單元的 SMILES"})

    # ---- 堆積係數 k：使用者輸入 ＞ k 表（名稱精確比對）；都沒有且沒有可用的密度時才用 D57 類別預設 ----
    row = find_packing_k_row(name, rows) if name is not None else None
    packing_k: float | None = None
    packing_k_source: str | None = None
    density_usable = user_k is None and row is None and density is not None and mass is not None
    if user_k is not None:
        packing_k = user_k
        packing_k_source = "user"
    elif row is not None:
        packing_k = row.packing_k
        packing_k_source = "table"
    else:
        if name is not None:
            notes.append(f"{PACKING_K_NOT_FOUND}：{name}")
        if density_usable:
            notes.append("已輸入密度：Vm 用密度，D57 類別預設沒有使用（取得順序：堆積係數 k ＞ 密度 ＞ 類別預設 ＞ Va）")
        elif smiles is not None:
            fv = compute_free_volume_unit(smiles)
            if fv["status"] == "ok":
                packing_k = packing_k_from_class_coefficient(fv["coefficient"]["coefficient"])
                packing_k_source = "class"
                notes.append(
                    f"類別預設，非材料值（D57 類別「{fv['coefficient']['name']}」，係數 c = {_s(fv['coefficient']['coefficient'])}，堆積係數 k = 1／(c + 1.3)）"
                )
            else:
                notes.append("D57 結構類別辨識不出（使用者經驗自由體積法的基團表缺基團），沒有類別預設的堆積係數 k")

    # ---- Vm：堆積係數 k（使用者輸入、k 表）＞ 使用者密度 ＞ D57 類別預設 ＞ Va ----
    vm: float | None = None
    vm_source: str | None = None
    vm_temperature_k: float | None = None
    if packing_k is not None:
        vm_source = "userK" if packing_k_source == "user" else "tableK" if packing_k_source == "table" else "classK"
        if vomega is not None:
            vm = vm_from_packing_k(vomega, packing_k)
        if density is not None:
            notes.append(
                "已輸入密度，但缺結構單元質量（缺 VW），無法由密度算 Vm"
                if packing_k_source == "class"
                else "已輸入密度，但堆積係數 k 優先（取得順序：堆積係數 k ＞ 密度 ＞ 類別預設 ＞ Va），密度沒有使用"
            )
    elif density_usable and density is not None and mass is not None:
        vm = js_div(mass, density)
        vm_source = "density"
        t_c = m.get("densityTemperatureC")
        vm_temperature_k = (DEFAULT_DENSITY_TEMPERATURE_C if t_c is None else t_c) + KELVIN_OFFSET
    elif smiles is not None:
        va = compute_molar_volume_density(smiles)
        if va["status"] == "ok" and va["amorphous"] is not None:
            vm = va["amorphous"]["vm"]
            vm_source = "va"
            vm_temperature_k = VA_TEMPERATURE_K
    if vm_source is None:
        missing.append(
            {
                "what": "Vm",
                "message": "缺莫耳體積：缺堆積係數 k（不在 k／Tg 表、沒有輸入 k、D57 類別辨識不出），也沒有使用者密度與 Va；不能把 VvdW 當 FFV 的替代",
            }
        )

    vf = vm - BONDI_OCCUPIED_FACTOR * vomega if (vomega is not None and vm is not None) else None
    if vomega is not None and vm is not None:
        ffv = bondi_ffv(vomega, vm)
    elif packing_k is not None:
        ffv = ffv_from_packing_k(packing_k)
    else:
        ffv = None
    moles = amount if basis == "mol" else (js_div(amount, mass) if mass is not None else None)

    return {
        "result": {
            "label": label,
            "name": name,
            "smiles": smiles,
            "polymer": polymer,
            "amount": amount,
            "moles": moles,
            "vomega": vomega,
            "vwBondiSupplement": vw_bondi_supplement,
            "packingK": packing_k,
            "packingKSource": packing_k_source,
            "vm": vm,
            "vmSource": vm_source,
            "vmLabel": None if vm_source is None else VM_SOURCE_LABELS[vm_source],
            "vmTemperatureK": vm_temperature_k,
            "vf": vf,
            "ffv": ffv,
            "family": row.category if row is not None else None,
            "notes": notes,
        },
        "mass": mass,
        "row": row,
        "input": m,
        "missing": missing,
    }


def _evaluate_side(comp: Mapping[str, Any], side_name: str, rows: Sequence[PackingKRow]) -> dict[str, Any]:
    monomers_in = comp["monomers"]
    if len(monomers_in) == 0:
        return _reject("INVALID_INPUT", f"{side_name}：組成是空的")
    basis = "mol" if comp.get("basis") is None else comp["basis"]
    if basis != "mol" and basis != "wt":
        return _reject("INVALID_INPUT", f"{side_name}：用量的單位只能是 mol 或 wt（比例 ratio 只用於 A、B 比較時的 B）")
    mn = comp.get("mn")
    if mn is not None and not _positive(mn):
        return _reject("INVALID_INPUT", f"{side_name}：Mn 必須是大於 0 的數字：{_s(mn)}")
    monomers: list[dict[str, Any]] = []
    for m in monomers_in:
        e = _evaluate_monomer(m, basis, rows)
        if "rejected" in e:
            return _reject(e["rejected"]["code"], f"{side_name}：{e['rejected']['message']}")
        monomers.append(e)
    results = [e["result"] for e in monomers]
    flags = [r["polymer"] for r in results if r["polymer"] is not None]
    if True in flags and False in flags:
        return _reject("BASIS_MISMATCH", f"{side_name}：組成同時有重複單元（含連接點 *）與小分子，Vm 的基準不同（重複單元與分子），不計算")
    kind = None if len(flags) == 0 else ("polymer" if flags[0] else "small")

    volumes: dict[str, float] | None = None
    ffv: float | None = None
    ffv_basis: str | None = None
    delta_alpha: float | None = None
    if all(r["moles"] is not None and r["vomega"] is not None and r["vm"] is not None for r in results):
        volumes = composition_volumes([{"moles": r["moles"], "vomega": r["vomega"], "vm": r["vm"]} for r in results])
        ffv = volumes["ffv"]
        ffv_basis = "volume"
        delta_alpha = delta_alpha_from_cte(volumes["vomega"], volumes["vm"])
    elif len(results) == 1 and results[0]["packingK"] is not None:
        ffv = ffv_from_packing_k(results[0]["packingK"])
        ffv_basis = "packingK"
    elif all(r["ffv"] is not None and r["moles"] is not None for r in results):
        total = 0
        for r in results:
            total = total + r["moles"]
        ffv = 0
        for r in results:
            ffv = ffv + js_div(r["moles"], total) * r["ffv"]
        ffv_basis = "moleWeighted"
    return {"side": {"monomers": results, "volumes": volumes, "ffv": ffv, "ffvBasis": ffv_basis, "deltaAlpha": delta_alpha, "kind": kind}, "monomers": monomers, "basis": basis}


def _same_monomer(x: Mapping[str, Any], y: Mapping[str, Any]) -> bool:
    return (x["name"] is not None and x["name"] == y["name"]) or (x["smiles"] is not None and x["smiles"] == y["smiles"])


def _family_warnings(a: Mapping[str, Any], b: Mapping[str, Any]) -> list[str]:
    """結構家族的警示（只警示，不阻擋）：家族判斷用 k／Tg 表的「結構類別」欄。"""
    out: list[str] = []
    a_families = list(dict.fromkeys(m["family"] for m in a["monomers"] if m["family"] is not None))
    a_all_known = all(m["family"] is not None for m in a["monomers"])
    for mb in b["monomers"]:
        if any(_same_monomer(ma, mb) for ma in a["monomers"]):
            continue
        if mb["family"] is not None and mb["family"] in a_families:
            continue
        if mb["family"] is not None and a_all_known:
            out.append(f"B 的單體「{mb['label']}」（結構類別：{mb['family']}）與 A（{'、'.join(a_families)}）不在同一結構家族：Δα（含 Δα 覆寫值 K）可能不適用")
        else:
            out.append(f"無法判斷 B 的單體「{mb['label']}」與 A 是否同一結構家族（不在 k／Tg 表，沒有結構類別）：Δα（含 Δα 覆寫值 K）可能不適用")
    return out


def _fox_comparison(b: Mapping[str, Any]) -> dict[str, Any] | None:
    """Fox 混合式的並列比較：各均聚物 Tg 由使用者輸入或 k／Tg 表帶出；與本法獨立。"""
    if len(b["monomers"]) < 2:
        return None

    def unavailable(message: str) -> dict[str, Any]:
        return {"status": "unavailable", "label": RELATIVE_TG_FOX_LABEL, "message": message}

    components: list[dict[str, Any]] = []
    for e in b["monomers"]:
        r = e["result"]
        if b["basis"] == "wt":
            mass_amount: float | None = r["amount"]
        else:
            mass_amount = r["moles"] * e["mass"] if (r["moles"] is not None and e["mass"] is not None) else None
        if mass_amount is None:
            return unavailable(f"缺「{r['label']}」的結構單元質量（沒有結構或缺基團），算不出質量分率")
        hom = e["input"].get("homopolymerTg")
        if hom is not None:
            tg_k = to_kelvin(hom)
            if not _positive(tg_k):
                return unavailable(f"「{r['label']}」的均聚物 Tg 必須高於絕對零度")
            components.append({"label": r["label"], "mass": mass_amount, "tgK": tg_k, "tgSource": "user", "labels": []})
            continue
        t = None if e["row"] is None else table_tg_of(e["row"])
        if t is None or t["status"] != "ok":
            return unavailable(f"缺「{r['label']}」的均聚物 Tg（{PACKING_K_NOT_FOUND if t is None else t['message']}），請輸入")
        components.append({"label": r["label"], "mass": mass_amount, "tgK": t["tgC"] + KELVIN_OFFSET, "tgSource": "table", "labels": t["labels"]})
    total = 0
    for c in components:
        total = total + c["mass"]
    tg_k = fox_mix([{"w": c["mass"], "tgK": c["tgK"]} for c in components])
    return {
        "status": "ok",
        "tgK": tg_k,
        "tgC": to_celsius(tg_k),
        "label": RELATIVE_TG_FOX_LABEL,
        "model": FOX_MIX_MODEL,
        "components": [
            {"label": c["label"], "massFraction": js_div(c["mass"], total), "tgK": c["tgK"], "tgSource": c["tgSource"], "labels": c["labels"]} for c in components
        ],
    }


def _same_monomer_input(x: Mapping[str, Any], y: Mapping[str, Any]) -> bool:
    xs = x.get("smiles")
    ys = y.get("smiles")
    return (x.get("name") is not None and x["name"] != "" and x["name"] == y.get("name")) or (
        xs is not None and js_trim(xs) != "" and ys is not None and js_trim(xs) == js_trim(ys)
    )


def _ratio_to_moles_per_a(a: Mapping[str, Any], b: Mapping[str, Any]) -> dict[str, Any]:
    """B 以比例輸入時換算成每 1 mol A 的莫耳數（任務 038c）。參考成分：referenceIndex，省略時取與 A（單一成分）名稱或 SMILES 相同的那一項（恰好一項）。"""
    if len(a["monomers"]) != 1:
        return _reject("INVALID_INPUT", "B：比例輸入需換算成每 1 mol A，A 必須是單一成分；A 是共聚物時請直接輸入每 1 mol A 的莫耳數（basis mol）")
    ref = b.get("referenceIndex")
    if ref is None:
        matches = [i for i, m in enumerate(b["monomers"]) if _same_monomer_input(a["monomers"][0], m)]
        if len(matches) != 1:
            return _reject("INVALID_INPUT", f"B：比例輸入找不到唯一的參考成分（與 A 相同名稱或 SMILES 的成分有 {len(matches)} 項），請指定 referenceIndex")
        ref = matches[0]
    ratio = [1 if m.get("amount") is None else m["amount"] for m in b["monomers"]]
    try:
        moles = moles_per_mole_a(ratio, ref)
    except ValueError as e:
        return _reject("INVALID_INPUT", f"B：{e}")
    labels = [m.get("name") or m.get("smiles") or "" for m in b["monomers"]]
    return {
        "comp": {**b, "basis": "mol", "monomers": [{**m, "amount": moles[i]} for i, m in enumerate(b["monomers"])]},
        "note": (
            f"B 以比例 {':'.join(_fmt(r) for r in ratio)} 輸入，以「{labels[int(ref)]}」為參考成分換算成每 1 mol A："
            f"{'、'.join(f'{l} {_fmt(moles[i])} mol' for i, l in enumerate(labels))}"
        ),
    }


def relative_tg(inp: Mapping[str, Any], rows: Sequence[PackingKRow] | None = None) -> dict[str, Any]:
    """對應 relativeTg：簡易 Tg 相對估算（結構輸入）。A、B 各為組成清單（均聚物只有一項）。"""
    rows = load_packing_k_rows() if rows is None else rows
    tg_a_user: float | None = None
    if inp.get("tgA") is not None:
        tg_a_user = to_kelvin(inp["tgA"])
        if not _positive(tg_a_user):
            return {
                "status": "rejected",
                "code": "INVALID_INPUT",
                "message": f"A 的 Tg 必須是高於絕對零度的數字：{_s(inp['tgA']['value'])} {'K' if inp['tgA']['unit'] == 'K' else '°C'}",
            }
    # ---- 莫耳數基準（任務 038c） ----
    if inp["a"].get("basis") == "ratio":
        return {"status": "rejected", "code": "INVALID_INPUT", "message": "A：比例輸入只用於 B（換算成每 1 mol A）；A 的組成請以 mol 或 wt 輸入"}
    b_comp = inp["b"]
    basis_note: str | None = None
    if inp["b"].get("basis") == "ratio":
        c = _ratio_to_moles_per_a(inp["a"], inp["b"])
        if "rejected" in c:
            return {"status": "rejected", **c["rejected"]}
        b_comp = c["comp"]
        basis_note = c["note"]
    b_basis = "mol" if inp["b"].get("basis") is None else inp["b"]["basis"]
    fraction_warning = b_basis == "mol" and looks_like_fractions([1 if m.get("amount") is None else m["amount"] for m in inp["b"]["monomers"]])
    ea = _evaluate_side(inp["a"], "A", rows)
    if "rejected" in ea:
        return {"status": "rejected", **ea["rejected"]}
    eb = _evaluate_side(b_comp, "B", rows)
    if "rejected" in eb:
        return {"status": "rejected", **eb["rejected"]}
    a = ea["side"]
    b = eb["side"]

    # ---- 基準檢查：重複單元／分子、Vm 的溫度 ----
    if a["kind"] == "small" and b["kind"] == "polymer":
        return {"status": "rejected", "code": "BASIS_MISMATCH", "message": "A 是小分子、B 是重複單元：A、B 的單位基準不同（分子與重複單元），不計算"}
    temps = [m["vmTemperatureK"] for m in [*a["monomers"], *b["monomers"]] if m["vmTemperatureK"] is not None]
    if len(temps) > 0 and max(temps) - min(temps) > VM_TEMPERATURE_TOLERANCE_K:
        return {
            "status": "rejected",
            "code": "TEMPERATURE_MISMATCH",
            "message": f"A、B 的 Vm 溫度基準不同（{_fmt(min(temps), 5)} K 與 {_fmt(max(temps), 5)} K）：必須用同一溫度的 Vm，不計算",
        }

    warnings: list[str] = [RELATIVE_TG_FRACTION_WARNING] if fraction_warning else []
    notes: list[str] = [RELATIVE_TG_INCREMENT_NOTE, RELATIVE_TG_FFV_NOTE, *([basis_note] if basis_note is not None else [])]
    missing: list[dict[str, Any]] = []
    for e in ea["monomers"]:
        for x in e["missing"]:
            missing.append({"side": "A", "monomer": e["result"]["label"], **x})
    for e in eb["monomers"]:
        for x in e["missing"]:
            missing.append({"side": "B", "monomer": e["result"]["label"], **x})
    all_m = [*a["monomers"], *b["monomers"]]
    if len(temps) > 0 and any(m["vmSource"] is not None and m["vmTemperatureK"] is None for m in all_m):
        warnings.append("Vm 的來源不一致：堆積係數 k 的溫度基準使用者未註明，無法確認與 298 K 的 Va 或使用者密度是同一溫度")
    if any(m["vmSource"] == "va" for m in all_m):
        warnings.append(RELATIVE_TG_VA_WARNING)
    for m in all_m:
        if m["ffv"] is not None and m["ffv"] <= 0:
            warnings.append(f"「{m['label']}」的 Bondi 型 FFV 不是正數（Vm 不大於 1.3 × VvdW）")
    for s in (a, b):
        if s["ffvBasis"] == "moleWeighted":
            notes.append(f"{'A' if s is a else 'B'} 的 FFV 為{RELATIVE_TG_MOLE_WEIGHTED_LABEL}（有單體缺 VvdW，以 Σ x_i·FFV_i 計）")

    # ---- A 的 Tg（錨點）：使用者輸入優先；否則由 k／Tg 表帶出 ----
    a_row = ea["monomers"][0]["row"] if len(ea["monomers"]) == 1 else None
    tg_a: dict[str, Any]
    if tg_a_user is not None:
        tg_a = {"status": "ok", "tgK": tg_a_user, "tgC": to_celsius(tg_a_user), "source": "user", "raw": None, "labels": ["使用者輸入的錨點"]}
    elif a_row is not None:
        t = table_tg_of(a_row)
        if t["status"] == "ok":
            tg_a = {"status": "ok", "tgK": t["tgC"] + KELVIN_OFFSET, "tgC": t["tgC"], "source": "table", "raw": t["raw"], "labels": ["由 k／Tg 表帶出", *t["labels"]]}
        else:
            tg_a = {"status": "missing", "message": t["message"]}
    else:
        tg_a = {"status": "missing", "message": "缺 A 的 Tg（錨點）：請輸入（A 不是 k／Tg 表內的單一材料，無法由表帶出）"}

    # ---- Δf 與 Tg_B ----
    b_small = b["kind"] == "small"
    delta_f = free_volume_increment(a["volumes"], b["volumes"]) if (not b_small and a["volumes"] is not None and b["volumes"] is not None) else None
    b_row = eb["monomers"][0]["row"] if len(eb["monomers"]) == 1 else None
    alpha_override = inp.get("alphaOverride")
    tg_b: dict[str, Any]
    if b_small:
        tg_b = {"status": "notApplicable", "message": RELATIVE_TG_SMALL_MOLECULE}
        if a["kind"] == "polymer":
            notes.append("A 是重複單元、B 是小分子：單位基準不同，只顯示各自的 FFV，不計算 Δf")
    elif b_row is not None:
        t = table_tg_of(b_row)
        if t["status"] == "ok":
            tg_b = {
                "status": "table",
                "material": b_row.name,
                "tgC": t["tgC"],
                "tgK": t["tgC"] + KELVIN_OFFSET,
                "lowerC": t["lowerC"],
                "upperC": t["upperC"],
                "raw": t["raw"],
                "labels": t["labels"],
                "message": RELATIVE_TG_TABLE_B_NOTE,
            }
        else:
            tg_b = {
                "status": "tableBlank",
                "material": b_row.name,
                "raw": t["raw"],
                "message": f"{t['message']}（B 是 k／Tg 表內的材料且組成沒改：不以其他材料的 Tg 估算）",
            }
    else:
        tg_b = estimate_tg_b(tg_a["tgK"] if tg_a["status"] == "ok" else None, delta_f, a["deltaAlpha"], alpha_override)
        if tg_b["status"] == "unavailable" and alpha_override is not None and not _positive(alpha_override):
            warnings.append(tg_b["message"])
        if tg_b["status"] == "ok":
            warnings.extend(_family_warnings(a, b))

    # ---- 其他標示 ----
    if a["volumes"] is not None and b["volumes"] is not None and not b_small:
        ratio = js_div(b["volumes"]["moles"], a["volumes"]["moles"])
        notes.append(
            f"A、B 的總莫耳數相同（{_fmt(a['volumes']['moles'])}）：等莫耳的組成比較"
            if abs(ratio - 1) < 1e-9
            else f"B 的總莫耳數（{_fmt(b['volumes']['moles'])}）與 A（{_fmt(a['volumes']['moles'])}）不同：依範例算法視為在 A 之外增減單元，分母只用 A 的體積"
        )
    mn_ratio = js_div(inp["b"]["mn"], inp["a"]["mn"]) if (inp["a"].get("mn") is not None and inp["b"].get("mn") is not None) else None
    notes.append(RELATIVE_TG_MN_UNCHECKED if mn_ratio is None else f"Mn 比值（B／A）= {_fmt(mn_ratio)}（沒有設定門檻，是否相近由使用者判斷）")

    return {
        "status": "ok" if len(missing) == 0 else "missing",
        "a": a,
        "b": b,
        "deltaF": delta_f,
        "tgA": tg_a,
        "tgB": tg_b,
        "mnRatio": mn_ratio,
        "fox": _fox_comparison(eb),
        "missing": missing,
        "warnings": warnings,
        "notes": notes,
        "model": RELATIVE_TG_MODEL,
        "disclaimer": RELATIVE_TG_DISCLAIMER,
        "confidence": RELATIVE_TG_CONFIDENCE,
        "unifiedNote": UNIFIED_NOTE,
    }


def evaluate_relative_tg_composition(composition: Mapping[str, Any], rows: Sequence[PackingKRow] | None = None) -> dict[str, Any]:
    """單一組成的 VvdW、Vm、Bondi 型 FFV、Δα（批次輸出用；沒有 A、B 比較，也不給 Tg）。"""
    rows = load_packing_k_rows() if rows is None else rows
    e = _evaluate_side(composition, "輸入", rows)
    if "rejected" in e:
        return {"status": "rejected", **e["rejected"]}
    missing: list[dict[str, Any]] = []
    for m in e["monomers"]:
        for x in m["missing"]:
            missing.append({"monomer": m["result"]["label"], **x})
    return {"status": "ok", "side": e["side"], "missing": missing}
