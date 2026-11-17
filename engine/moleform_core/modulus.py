"""體積模數 K、剪切模數 G、泊松比 ν 與楊氏模數 E（van Krevelen 加成函數）。任務 P6E（PLAN 6.5；D62：新計算直接寫在 Python，沒有 TypeScript 對應）。

書（van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009)，13.2.4–13.2.6 節、Example 13.1／13.2、Table 13.2／13.6）：
- 方法一（式 13.30）：K = ρ·(U_R/V)⁶；Rao 函數 U_R 的基團值在 Table 14.4（書頁 515）。
- 剪切模數（式 14.12）：G = ρ·(U_H/V)⁶；Hartmann 函數 U_H 的基團值同在 Table 14.4（書中標為暫定）。
- 泊松比與楊氏模數（Table 13.2，式 13.10、13.11；Example 13.2）：ν = (1 − (2/3)·G/K) / (2·(1 + (1/3)·G/K))；E = 3G / (1 + (1/3)·G/K)。
- 方法三（式 13.32）：K ≈ 8.04·(E_coh + x_c·ΔH_m)/V；E_coh 見 Table 7.1（Hoftyzer and Van Krevelen 欄，Example 13.1 用的 8380 J/mol = 2 × 4190），
  ΔH_m 見 Table 5.7（Example 13.1 用的 8000 J/mol = 2 × 4.0 kJ/mol）。兩張表只收錄基團定義可對應的列（見 modulus_tables），其餘基團回報 missing。
- 方法二（式 13.31：C_v/E_c，需要 C_p/C_v，書中是圖 5.4）：本專案不做（P6E 決定）。
- 書的建議（書頁 395）：沒有實驗值時取各方法的平均；各方法一致性約 20%。

單位換算：U_R、U_H 的單位是 (cm³/mol)(cm/s)^(1/3)，V 為 cm³/mol，ρ 為 g/cm³，所以 ρ·(U/V)⁶ 的單位是 g/(cm·s²) = dyn/cm²；
1 dyn/cm² = 0.1 N/m²（Example 13.2：4.36×10¹⁰ × 1.20 = 5.23×10¹⁰ dyn/cm² = 5.23×10⁹ N/m²）。程式以 GPa 輸出：K[GPa] = ρ·(U_R/V)⁶ × 0.1 ÷ 10⁹。
方法三：E 的單位 J/mol、V 以 m³/mol（V[cm³/mol] × 10⁻⁶），K[N/m²] = 8.04·E/V（Example 13.1：8.04 × 14000 ÷ 29.5×10⁻⁶ = 3.8×10⁹）。

V 的取得：輸入帶密度 ρ → V = M/ρ（標示「輸入密度」）；否則用 Vm 模組的非晶莫耳體積（Table 4.10 基團加成，glassy = amorphous）；兩者都沒有 → K 回報 missing 與原因。
M 為重複單元分子量（本專案原子量表）。基團切分沿用 Tm／Td 的切分程式（大基團優先於小基團）。
"""

from __future__ import annotations

import math
from typing import Any

from . import tg as _tg
from . import vm as _vm
from .mol_graph import mol_from_smiles, read_graph
from .modulus_tables import ecoh_yg_rows, load_ecoh_rows, load_hm_rows, load_rao_rows, rao_yg_rows

MODULUS_MODEL = (
    "van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 13.2.6 節式 13.30、13.32（體積模數 K）、式 14.12（剪切模數 G）、"
    "Table 13.2（泊松比 ν、楊氏模數 E）；基團值 Table 14.4（U_R、U_H）、Table 7.1（E_coh）、Table 5.7（ΔH_m）"
)
MODULUS_DISCLAIMER = (
    "本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。"
)
MODULUS_NOTES = "參考趨勢；書稱各方法一致性約 20%（書頁 395）；U_H 為書中暫定值（Table 14.4 標題）"
MODULUS_UNIT = "GPa"
NU_UNIT = ""

DYN_CM2_TO_GPA = 0.1 / 1e9  # 1 dyn/cm² = 0.1 N/m²；再換成 GPa
GRUNEISEN_TOBOLSKY = 8.04  # 式 13.32 的常數（書中印的值）

SOURCE_RAO = "式 13.30：K = ρ·(U_R/V)⁶（Table 14.4）"
SOURCE_HARTMANN = "式 14.12：G = ρ·(U_H/V)⁶（Table 14.4，U_H 書中暫定）"
SOURCE_TOBOLSKY = "式 13.32：K ≈ 8.04·(E_coh + x_c·ΔH_m)/V（Table 7.1、Table 5.7）"
SOURCE_TABLE132 = "Table 13.2（式 13.10、13.11）"

METHOD_TWO = {
    "id": "gruneisen",
    "name": "方法二",
    "equation": "式 13.31：K ≈ C_v/E_c = (C_v/C_p)·(C_p/E_c)",
    "status": "not_implemented",
    "reason": "需要 C_p/C_v（書中 Fig. 5.4，是圖）；P6E 決定不做方法二",
}


def check_density(x: object) -> float | None:
    if x is None:
        return None
    if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(float(x)) or float(x) <= 0:
        raise ValueError("密度 density 必須是大於 0 的數字（g/cm³）")
    return float(x)


def _quantity(value: float | None, unit: str, source: str) -> dict[str, Any]:
    return {"value": value, "unit": unit, "source": source, "status": "missing" if value is None else "predicted"}


def _group_json(g: dict[str, Any], rows_by_id: dict[str, Any], uh: bool) -> dict[str, Any]:
    r = rows_by_id[g["rowId"]]
    out = {"rowId": g["rowId"], "name": g["name"], "ur": r.ur, "uh": r.uh, "urTentative": r.ur_tentative, "uhParen": r.uh_paren, "atoms": g["atoms"], "source": g["source"]}
    if not uh:
        out.pop("uh")
    return out


def bulk_modulus_rao(ur: float, v: float, rho: float) -> float:
    """式 13.30（Example 13.2 的單位換算：dyn/cm² → N/m² → GPa）。"""
    return rho * (ur / v) ** 6 * DYN_CM2_TO_GPA


def shear_modulus_hartmann(uh: float, v: float, rho: float) -> float:
    """式 14.12。"""
    return rho * (uh / v) ** 6 * DYN_CM2_TO_GPA


def bulk_modulus_tobolsky(ecoh: float, dhm_kj: float, xc: float, v: float) -> float:
    """式 13.32：E_coh（J/mol）、ΔH_m（kJ/mol）、V（cm³/mol）→ K（GPa）。"""
    e_subl = ecoh + xc * dhm_kj * 1000.0
    return GRUNEISEN_TOBOLSKY * e_subl / (v * 1e-6) / 1e9


def poisson_ratio(k: float, g: float) -> float:
    """Table 13.2，式 13.11：ν = (1 − (2/3)G/K) / (2(1 + (1/3)G/K))。"""
    r = g / k
    return (1 - (2 / 3) * r) / (2 * (1 + (1 / 3) * r))


def young_modulus(k: float, g: float) -> float:
    """Table 13.2，式 13.10：E = 3G / (1 + (1/3)G/K)。"""
    return 3 * g / (1 + (1 / 3) * g / k)


def _invalid(smiles: str, message: str) -> dict[str, Any]:
    return {"status": "invalid", "smiles": smiles, "message": message}


def _missing_groups(res: dict[str, Any]) -> list[dict[str, Any]]:
    return list(res.get("missing", []))


def _volume(smiles: str, mass: float | None, density: float | None) -> tuple[dict[str, Any] | None, str | None]:
    """V（cm³/mol）：輸入密度優先；否則 Vm 模組。回傳 (volume, 缺的原因)。"""
    if mass is None or mass <= 0:
        return None, "重複單元分子量無法計算（原子量表沒有的元素）"
    if density is not None:
        return {"value": mass / density, "unit": "cm³/mol", "density": density, "basis": "輸入密度（V = M/ρ）"}, None
    vm = _vm.compute_molar_volume_density(smiles)
    if vm["status"] == "ok":
        amorphous = vm["glassy"]
        return {"value": amorphous["vm"], "unit": "cm³/mol", "density": amorphous["density"], "basis": "Vm 模組（Table 4.10，非晶）"}, None
    if vm["status"] == "unsupported":
        return None, "沒有密度：" + str(vm.get("message", "Vm 模組不支援此輸入")) + "（可輸入密度 density）"
    n = len(vm.get("missing", []))
    return None, f"沒有密度：Vm 模組缺 {n} 個基團的莫耳體積增量（可輸入密度 density 改用輸入密度）"


def _rao_method(smiles: str, mass: float | None, vol: dict[str, Any] | None, vol_reason: str | None) -> tuple[dict[str, Any], dict[str, Any]]:
    """方法一（K）與剪切模數（G）。回傳 (方法一的 dict, G 的 dict)。"""
    res = _tg.compute_tg_book(smiles, rao_yg_rows())
    rows_by_id = {r.id: r for r in load_rao_rows()}
    k_method: dict[str, Any] = {"id": "rao", "name": "方法一（Rao 函數）", "equation": SOURCE_RAO, "unit": MODULUS_UNIT}
    g_method: dict[str, Any] = {"id": "hartmann", "name": "剪切模數 G（Hartmann 函數）", "equation": SOURCE_HARTMANN, "unit": MODULUS_UNIT}
    if res["status"] != "ok":
        miss = _missing_groups(res)
        reason = f"Table 14.4 沒有涵蓋的基團（{len(miss)} 個原子）"
        for m in (k_method, g_method):
            m.update({"status": "missing", "value": None, "missing": miss, "reason": reason, "groups": []})
        return k_method, g_method
    groups = [_group_json(g, rows_by_id, True) for g in res["groups"]]
    ur = res["sumYg"]
    k_method.update({"groups": groups, "sumUR": ur, "containsTentative": any(g["urTentative"] for g in groups)})
    g_method.update({"groups": groups})
    if vol is None:
        for m in (k_method, g_method):
            m.update({"status": "missing", "value": None, "reason": vol_reason or "V 無法取得", "missing": []})
        return k_method, g_method
    v = vol["value"]
    rho = mass / v  # type: ignore[operator]
    k_method.update({"status": "predicted", "value": bulk_modulus_rao(ur, v, rho), "missing": []})
    lacking = [g["name"] for g in groups if g["uh"] is None]
    if lacking:
        g_method.update({"status": "missing", "value": None, "missing": [], "reason": "書中沒有這些基團的 U_H（Table 14.4 印「–」）：" + "、".join(lacking)})
        return k_method, g_method
    uh = 0.0
    for g in groups:
        uh = uh + g["uh"]
    g_method.update({
        "status": "predicted", "value": shear_modulus_hartmann(uh, v, rho), "sumUH": uh, "missing": [],
        "containsParen": any(g["uhParen"] for g in groups),
    })  # fmt: skip
    return k_method, g_method


def _tobolsky_method(smiles: str, mol: Any, mass: float | None, vol: dict[str, Any] | None, vol_reason: str | None, xc: float | None) -> dict[str, Any]:
    method: dict[str, Any] = {"id": "gruneisen-tobolsky", "name": "方法三（內聚能＋熔化熱）", "equation": SOURCE_TOBOLSKY, "unit": MODULUS_UNIT}
    res = _tg.compute_tg_book(smiles, ecoh_yg_rows())
    if res["status"] != "ok":
        miss = _missing_groups(res)
        method.update({
            "status": "missing", "value": None, "missing": miss, "groups": [],
            "reason": f"Table 7.1 與 Table 5.7 同時涵蓋的基團不含這個分子的 {len(miss)} 個原子（只收錄基團定義可對應的列）",
        })  # fmt: skip
        return method
    g = read_graph(mol)
    dummies = [i for i, z in enumerate(g.z) if z == 0]
    main = _tg.main_chain_atoms(g, dummies)
    side = [x for x in res["groups"] if x["rowId"] == "E.CH2" and main is not None and x["atoms"][0] not in main]
    if side:
        method.update({
            "status": "missing", "value": None, "groups": [],
            "missing": [{"index": x["atoms"][0], "element": "C", "description": _tg._describe_atom(g, x["atoms"][0]) + "；側鏈 –CH2–：Table 5.7 的 ΔHm 為 −0.7，E_coh 沒有側鏈值，本卡不收"} for x in side],
            "reason": "含側鏈 –CH2–（Table 5.7 的側鏈值與主鏈不同，本卡不收錄）",
        })  # fmt: skip
        return method
    ecoh_by_id = {r.id: r for r in load_ecoh_rows()}
    hm_by_id = {r.id: r for r in load_hm_rows()}
    groups: list[dict[str, Any]] = []
    ecoh = 0.0
    dhm = 0.0
    for x in res["groups"]:
        e = ecoh_by_id[x["rowId"]]
        h = hm_by_id[x["rowId"]]
        groups.append({"rowId": x["rowId"], "name": x["name"], "ecoh": e.value, "dhm": h.value, "ecohTentative": e.tentative, "atoms": x["atoms"], "sources": [e.source, h.source]})
        ecoh = ecoh + e.value
        dhm = dhm + h.value
    method.update({"groups": groups, "ecoh": ecoh, "dhm": dhm, "containsTentative": any(x["ecohTentative"] for x in groups)})
    if vol is None:
        method.update({"status": "missing", "value": None, "reason": vol_reason or "V 無法取得", "missing": []})
        return method
    x_used = 0.0 if xc is None else xc
    method.update({
        "status": "predicted", "value": bulk_modulus_tobolsky(ecoh, dhm, x_used, vol["value"]), "crystallinity": x_used,
        "crystallinityAssumed": xc is None, "missing": [],
    })  # fmt: skip
    return method


def compute_modulus(smiles: str, density: float | None = None, crystallinity: float | None = None) -> dict[str, Any]:
    """K（方法一、方法三與平均）、G、ν、E。status：ok（至少算出 K）／missing（K 算不出）／invalid。"""
    try:
        mol = mol_from_smiles(smiles)
    except Exception:  # noqa: BLE001
        mol = None
    if mol is None:
        return _invalid(smiles, "RDKit 無法解析這個 SMILES")
    if mol.GetNumAtoms() == 0:
        return _invalid(smiles, "分子沒有任何原子")
    g = read_graph(mol)
    polymer = any(z == 0 for z in g.z)
    mass = _vm.unit_mass_of(g)
    vol, vol_reason = _volume(smiles, mass, density)

    rao, shear = _rao_method(smiles, mass, vol, vol_reason)
    tobolsky = _tobolsky_method(smiles, mol, mass, vol, vol_reason, crystallinity)
    methods = [rao, METHOD_TWO, tobolsky]

    usable = [m for m in (rao, tobolsky) if m["status"] == "predicted"]
    k: float | None = None
    k_basis = "沒有可用的方法"
    if len(usable) >= 2:
        total = 0.0
        for m in usable:
            total = total + m["value"]
        k = total / len(usable)
        k_basis = f"平均（{len(usable)} 個方法：{'、'.join(m['name'] for m in usable)}；書的建議，書頁 395）"
    elif len(usable) == 1:
        k = usable[0]["value"]
        k_basis = f"單一方法（{usable[0]['name']}），不取平均"
    g_val = shear["value"] if shear["status"] == "predicted" else None

    nu: float | None = None
    e_val: float | None = None
    if k is not None and g_val is not None:
        nu = poisson_ratio(k, g_val)
        e_val = young_modulus(k, g_val)

    k_reasons = [f"{m['name']}：{m.get('reason', '')}" for m in (rao, tobolsky) if m["status"] != "predicted"]
    k_q = _quantity(k, MODULUS_UNIT, MODULUS_MODEL)
    g_q = _quantity(g_val, MODULUS_UNIT, SOURCE_HARTMANN)
    nu_q = _quantity(nu, NU_UNIT, SOURCE_TABLE132)
    e_q = _quantity(e_val, MODULUS_UNIT, SOURCE_TABLE132)
    g_reason = None if g_val is not None else shear.get("reason", "")
    ne_reason = None if nu is not None else ("需要 K 與 G 都算得出：" + ("K 缺（見 K 的原因）" if k is None else "G 缺（見 G 的原因）"))
    warnings: list[str] = []
    if not polymer:
        warnings.append("輸入沒有連接點 *：加成函數針對聚合物重複單元")
    if density is not None:
        warnings.append("V 使用輸入密度（V = M/ρ），不是 Vm 模組的估算值")
    if tobolsky["status"] == "predicted" and tobolsky["crystallinityAssumed"]:
        warnings.append("方法三沒有輸入結晶度，視為 x_c = 0（只用 E_coh）")
    if rao.get("containsTentative") or tobolsky.get("containsTentative"):
        warnings.append("含書中括號值（暫定，不確定）的基團")
    if shear["status"] == "predicted":
        warnings.append("G、ν、E 用書中暫定的 U_H（Table 14.4）" + ("；含括號值" if shear.get("containsParen") else ""))
    return {
        "status": "ok" if k is not None else "missing",
        "smiles": smiles,
        "polymer": polymer,
        "unitMass": mass,
        "volume": vol,
        "volumeReason": vol_reason,
        "methods": methods,
        "bulkModulus": {**k_q, "basis": k_basis, "reason": None if k is not None else "；".join(k_reasons)},
        "shearModulus": {**g_q, "reason": g_reason},
        "poissonRatio": {**nu_q, "reason": ne_reason},
        "youngsModulus": {**e_q, "reason": ne_reason},
        "warnings": warnings,
    }
