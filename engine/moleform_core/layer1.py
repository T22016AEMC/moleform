"""交聯第 1 層：Miller–Macosko 後凝膠性質、官能基比、理論配比與比例掃描、由第 0 層結果整理輸入。
對應 src/core/crosslink/layer1/millerMacosko.ts、layer1.ts、stoich.ts、prepare.ts（任務 M05 組 2-8；D62／D63）。
分子量分布（`distribution`）已在 M04（`distribution.two_component_species`）。TypeScript 仍是預設計算來源，本模組沒有接到介面。

演算法與 TypeScript 逐步等價：
- 加總（官能基莫耳數、溶膠分率、交聯密度、各種 reduce）一律用明確迴圈由左至右累加（不用內建 `sum()`）；運算順序與 TS 對照。
- JS 的 `x ** n`、`Math.exp`、`Math.log` 對應 Python 的 `**`、`math.exp`、`math.log`（同為 IEEE double；V8 與 CRT 的 pow／exp／log 在最後一位可能不同，
  黃金比對以最短字串先比、不同才允許 1e-12 並列入 tolerance_cases）。
- `Math.floor(fAvg + 1e-9)` 用 `_floor`（Python 的 `math.floor` 遇到 NaN／Infinity 會拋例外，JS 不會）。
- `String(Number(v.toFixed(2)))`（TS 的 `fmt`）用 `js_to_fixed`（正好一半往遠離零進位）＋`js_number`＋`js_number_to_string`。
- `prepare_layer1` 依 039a 不搬 `formulation/compute`：由呼叫端傳入已算好的 Solid 區各成分質量百分比（TS 的 `solidResult.components[].wtPct.value`）與 Solid 區的單位、成分
  （id、name、canonicalSmiles、amount、isResin）；`wt_by_id` 為 None 表示配方換算失敗（TS 的 `!solidResult`）。
"""

from __future__ import annotations

import math
from typing import Any, Mapping, Sequence

from .csv_reader import js_number, js_trim
from .distribution import two_component_species
from .js_compat import js_div, js_max, js_number_to_string, js_to_fixed

LAYER1_MODEL_NAME = "Miller–Macosko（理想逐步反應，無分子內環化、同類官能基等活性、無副反應）"
LAYER1_DIRECT_MODEL_NAME = "官能基計量（交聯第 1 層）"
MESSAGE_NOT_GELLED = "未凝膠，不適用"
MESSAGE_NEVER_GELS = "理論上不會凝膠"
NOTE_MASS_BASIS = "以質量為基準，未換算體積"
NOTE_COPOLYMER = "共聚物以平均組成計算，未考慮鏈間組成分布"
NOTE_NON_INTEGER = "官能度以相鄰整數混合近似"
NOTE_DISTRIBUTION = "分子量分布以兩成分（等重量）近似；凝膠點只取決於 Mw，溶膠分率與交聯密度為近似值"
NOTE_LOW_MW = "低分子量：以 n = 0 分子與較重成分兩成分近似"
NOTE_MC_DEFINITION = "Mc 為依 Miller–Macosko 式 51 推導的質量基準定義（每克固體的有效網目鏈莫耳數的倒數），非論文原式"
NOTE_M06 = "理想模型未考慮分子內環化、官能基活性差異與副反應；實際凝膠點通常比理論晚，實際交聯密度通常比理論低。"
MESSAGE_MULTI_RULE = "目前只支援單一反應規則的第 1 層計算"

SCAN_DISCLAIMER = "未考慮副反應與反應不完全，實際最佳配比以實驗為準"
SCAN_MODEL_NAME = "Miller–Macosko 比例掃描"
DEFAULT_SCAN_POINTS = 41
SCAN_MIN_DEFAULT = 0.5
SCAN_MAX_FLOOR = 1.5

EPS = 1e-12


def _floor(x: float) -> float:
    return x if (math.isnan(x) or math.isinf(x)) else float(math.floor(x))


# ---------- millerMacosko.ts ----------


def group_moles(s: Sequence[Mapping[str, Any]]) -> float:
    """官能基莫耳數 Σ n·f"""
    t = 0
    for k in s:
        t = t + k["n"] * k["f"]
    return t


def _group_fractions(s: Sequence[Mapping[str, Any]]) -> list[float]:
    """官能基莫耳分率 a_fi（[M76] 式 17–21 的加權）"""
    total = group_moles(s)
    return [js_div(k["n"] * k["f"], total) if total > 0 else 0 for k in s]


def split_functionality(f_avg: float, n: float, mass: float) -> list[dict[str, Any]]:
    """非整數官能度的處理（任務 017 B-8）：以相鄰兩個整數官能度的兩種「虛擬成分」混合近似，使數量平均官能度相等。整數官能度原樣回傳。"""
    lo = _floor(f_avg + 1e-9)
    t = f_avg - lo
    if t < 1e-9:
        return [{"f": lo, "n": n, "mass": mass}]
    return [
        {"f": lo, "n": n * (1 - t), "mass": mass * (1 - t)},
        {"f": lo + 1, "n": n * t, "mass": mass * t},
    ]


def _rhs(a: Sequence[float], fa: Sequence[float], b: Sequence[float], gb: Sequence[float], pA: float, pB: float, x: float) -> float:
    """式 21 左邊「A 基團向外看通往有限鏈」的遞迴右側：RHS(x) = pA·Σ_j b_j[1 − pB + pB·Σ_i a_i x^(f_i−1)]^(g_j−1) + 1 − pA"""
    inner = 0
    for i in range(len(a)):
        if fa[i] >= 1:
            inner = inner + a[i] * (x ** (fa[i] - 1))  # 式 20
    p_fb = 1 - pB + pB * inner  # 式 19：P(F_B^out)
    outer = 0
    for j in range(len(b)):
        if gb[j] >= 1:
            outer = outer + b[j] * (p_fb ** (gb[j] - 1))  # 式 18
    return pA * outer + 1 - pA  # 式 17


def gel_slope(sys: Mapping[str, Sequence[Mapping[str, Any]]], pA: float, pB: float) -> float:
    """式 21 的凝膠判斷：斜率 = pA·pB·Σb_j(g_j−1)·Σa_i(f_i−1)。"""
    a = _group_fractions(sys["a"])
    b = _group_fractions(sys["b"])
    sa = 0
    for i, v in enumerate(a):
        sa = sa + v * js_max(sys["a"][i]["f"] - 1, 0)
    sb = 0
    for j, v in enumerate(b):
        sb = sb + v * js_max(sys["b"][j]["f"] - 1, 0)
    return pA * pB * sa * sb


def finite_probability(sys: Mapping[str, Sequence[Mapping[str, Any]]], pA: float, pB: float) -> dict[str, Any]:
    """有限鏈機率（[M76] 式 17–21）：解式 21 在 (0,1) 內的根（二分法）；沒有根時為 1（尚未凝膠）。"""
    a = _group_fractions(sys["a"])
    b = _group_fractions(sys["b"])
    fa = [k["f"] for k in sys["a"]]
    gb = [k["f"] for k in sys["b"]]
    if not (gel_slope(sys, pA, pB) > 1 + EPS):
        return {"x": 1, "y": 1, "gelled": False}
    lo = 0.0
    hi = 1.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if _rhs(a, fa, b, gb, pA, pB, mid) - mid > 0:
            lo = mid
        else:
            hi = mid
    x = (lo + hi) / 2
    inner = 0
    for i in range(len(a)):
        if fa[i] >= 1:
            inner = inner + a[i] * (x ** (fa[i] - 1))
    return {"x": x, "y": pB * inner + 1 - pB, "gelled": True}


def homopolymer_finite_probability(f: float, p: float) -> float:
    """A_f 均聚的有限鏈機率（[M76] 式 5–9）。只用來核對式 8、9。"""
    if not (p * (f - 1) > 1 + EPS):
        return 1
    lo = 0.0
    hi = 1.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if p * (mid ** (f - 1)) - mid - p + 1 > 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def conversions(nA: float, nB: float, q: float) -> dict[str, float]:
    """限量官能基轉化率 q 換算成 pA、pB（反應掉的鍵數相同，所以 pA·N_A = pB·N_B）。"""
    bonds = q * (nA if nA < nB else nB)  # Math.min（此處沒有 NaN）
    return {"pA": js_div(bonds, nA) if nA > 0 else 0, "pB": js_div(bonds, nB) if nB > 0 else 0}


def gel_conversion(sys: Mapping[str, Sequence[Mapping[str, Any]]]) -> float | None:
    """凝膠點：限量官能基的凝膠轉化率 q_gel（二分法求 gelSlope(q) = 1 的根）。q = 1 仍不凝膠時回傳 None。"""
    nA = group_moles(sys["a"])
    nB = group_moles(sys["b"])
    if not (nA > 0) or not (nB > 0):
        return None

    def slope(q: float) -> float:
        c = conversions(nA, nB, q)
        return gel_slope(sys, c["pA"], c["pB"])

    if not (slope(1) > 1 + EPS):
        return None
    lo = 0.0
    hi = 1.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if slope(mid) > 1:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def sol_fraction(sys: Mapping[str, Sequence[Mapping[str, Any]]], fp: Mapping[str, Any]) -> float:
    """溶膠質量分率（[M76] 式 39）。凝膠點之前 x = y = 1，所以 w_s = 1。"""
    total = 0
    for k in [*sys["a"], *sys["b"]]:
        total = total + k["mass"]
    if not (total > 0):
        return 1

    def part(s: Sequence[Mapping[str, Any]], p: float) -> float:
        t = 0
        for k in s:
            t = t + k["mass"] * (p ** k["f"])
        return t

    return js_div(part(sys["a"], fp["x"]) + part(sys["b"], fp["y"]), total)


_LN_FACTORIAL_CACHE: list[float] = [0]


def _ln_factorial(k: int) -> float:
    for i in range(len(_LN_FACTORIAL_CACHE), k + 1):
        _LN_FACTORIAL_CACHE.append(_LN_FACTORIAL_CACHE[i - 1] + math.log(i))
    return _LN_FACTORIAL_CACHE[k]


def effective_junction_probability(f: int, m: int, p_finite: float) -> float:
    """某個 f 官能的成分是「度數 m 的有效交聯點」的機率（[M76] 式 45）：二項分布。"""
    if m < 0 or m > f:
        return 0
    if p_finite <= 0:
        return 1 if m == f else 0
    if p_finite >= 1:
        return 1 if m == 0 else 0
    ln_c = _ln_factorial(f) - _ln_factorial(m) - _ln_factorial(f - m)
    return math.exp(ln_c + m * math.log(1 - p_finite) + (f - m) * math.log(p_finite))


def network_density(sys: Mapping[str, Sequence[Mapping[str, Any]]], fp: Mapping[str, Any]) -> dict[str, float]:
    """交聯密度與有效網目鏈（[M76] 式 49、51）。"""
    junctions = 0
    chains = 0

    def add(s: Sequence[Mapping[str, Any]], p: float) -> None:
        nonlocal junctions, chains
        for k in s:
            m = 3
            while m <= k["f"]:
                xm = k["n"] * effective_junction_probability(int(k["f"]), m, p)  # 式 49 的一項 [A_f]_0·P(X_m,f)
                junctions = junctions + xm
                chains = chains + ((m - 2) / 2) * xm  # 式 51
                m += 1

    add(sys["a"], fp["x"])
    add(sys["b"], fp["y"])
    return {"junctions": junctions, "chains": chains}


# ---------- layer1.ts ----------


def _fmt(v: float) -> str:
    return js_number_to_string(js_number(js_to_fixed(v, 2)))


def ratio_text(name_a: str, name_b: str, ratio_b_to_a: float) -> str:
    """官能基比的顯示格式：「環氧基 : 酚羥基 = 1 : 2.33」"""
    return f"{name_a} : {name_b} = 1 : {_fmt(ratio_b_to_a)}"


def build_system(setup: Mapping[str, Any]) -> dict[str, Any]:
    """組出 Miller–Macosko 用的 A、B 兩側成分。聚合物（有分子量分布）以兩個等重量的虛擬成分表示（D47）；非整數官能度拆成相鄰整數的虛擬成分（B-8）。"""
    state = {"mixture": False, "lowMw": False}

    def split(f: float, n: float, mass: float) -> list[dict[str, Any]]:
        parts = split_functionality(f, n, mass)
        if len(parts) > 1:
            state["mixture"] = True
        return parts

    def species(c: Mapping[str, Any]) -> list[dict[str, Any]]:
        d = c.get("distribution")
        if d:
            m_ends = d["mEnds"] if d.get("mEnds") is not None else 0
            dist = two_component_species(d["mw"], d["mn"], m_ends)
            if len(dist["species"]) > 1:
                if dist["lowMw"]:
                    state["lowMw"] = True

                def f_of(m: float) -> float:
                    if m < m_ends:
                        raise ValueError(f"內部錯誤：成分分子量 {js_number_to_string(m)} 小於端基質量合計 {js_number_to_string(m_ends)}")
                    return js_div(m - m_ends, d["mUnit"]) * d["groupsPerUnit"] + (d["endGroups"] if d.get("endGroups") is not None else 0)

                out: list[dict[str, Any]] = []
                for sp in dist["species"]:
                    m = sp["m"]
                    w = sp["weightFraction"]
                    out.extend(split(f_of(m), js_div(w * c["mass"], m), w * c["mass"]))
                return out
        return split(c["groupsPerMolecule"], js_div(c["mass"], c["molarMass"]), c["mass"])

    a: list[dict[str, Any]] = []
    for c in setup["components"]:
        if c["side"] == "A":
            a.extend(species(c))
    b: list[dict[str, Any]] = []
    for c in setup["components"]:
        if c["side"] == "B":
            b.extend(species(c))
    return {"sys": {"a": a, "b": b}, "mixture": state["mixture"], "lowMw": state["lowMw"]}


def group_totals(setup: Mapping[str, Any]) -> dict[str, float]:
    """兩類官能基的總莫耳數（以 setup 的質量基準；內部使用）"""
    sys = build_system(setup)["sys"]
    return {"nA": group_moles(sys["a"]), "nB": group_moles(sys["b"])}


def compute_layer1(setup: Mapping[str, Any], q: float) -> dict[str, Any] | None:
    """依目前配方與限量官能基轉化率 q（0–1）計算第 1 層。nA 或 nB 為 0 時回傳 None。"""
    built = build_system(setup)
    sys, mixture, low_mw = built["sys"], built["mixture"], built["lowMw"]
    nA = group_moles(sys["a"])
    nB = group_moles(sys["b"])
    if not (nA > 0) or not (nB > 0) or not (setup["totalMass"] > 0):
        return None
    total_mass = setup["totalMass"]

    ratio = nB / nA
    equal = abs(nA - nB) <= 1e-9 * js_max(nA, nB)
    limiting = "equal" if equal else ("A" if nA < nB else "B")
    excess = None if equal else ("B" if limiting == "A" else "A")
    n_lim = nA if nA < nB else nB
    n_excess = nA if nA > nB else nB

    c = conversions(nA, nB, q)
    pA, pB = c["pA"], c["pB"]
    gel_q = gel_conversion(sys)
    fp = finite_probability(sys, pA, pB)
    gelled = fp["gelled"]
    dens = network_density(sys, fp) if gelled else None

    def per_kg(v: float) -> float:
        return (v / total_mass) * 1000

    comps = setup["components"]
    return {
        "ratioBToA": ratio,
        "ratioText": ratio_text(setup["nameA"], setup["nameB"], ratio),
        "limiting": limiting,
        "excess": excess,
        "excessPct": (n_excess / n_lim - 1) * 100,
        "maxBondsMolPerKg": (n_lim / total_mass) * 1000,
        "conversion": q,
        "bondsFormedMolPerKg": ((q * n_lim) / total_mass) * 1000,
        "residualAPct": (1 - pA) * 100,
        "residualBPct": (1 - pB) * 100,
        "residualTotalPct": (1 - (pA * nA + pB * nB) / (nA + nB)) * 100,
        "gelConversion": gel_q,
        "gelled": gelled,
        "solFraction": sol_fraction(sys, fp),
        "junctionsMolPerKg": per_kg(dens["junctions"]) if dens else None,
        "effectiveChainsMolPerKg": per_kg(dens["chains"]) if dens else None,
        "mcGPerMol": total_mass / dens["chains"] if (dens and dens["chains"] > 0) else None,
        "usedMixtureApprox": mixture,
        "usedLowMwCorrection": low_mw,
        "hasPolymer": any(c["isPolymer"] for c in comps),
        "hasCopolymer": any(bool(c.get("isCopolymer")) for c in comps),
    }


# ---------- stoich.ts ----------


def default_scan_settings(current_ratio: float) -> dict[str, Any]:
    """預設掃描範圍自動包含目前配方的當量比：下限 0.5，上限 max(1.5, 目前當量比 × 1.2)"""
    return {"min": SCAN_MIN_DEFAULT, "max": js_max(SCAN_MAX_FLOOR, current_ratio * 1.2), "points": DEFAULT_SCAN_POINTS}


def scale_side_b(setup: Mapping[str, Any], factor: float) -> dict[str, Any]:
    """把 group_b 側所有成分的質量乘上同一個係數；其餘成分不變。"""
    components = [{**c, "mass": c["mass"] * factor} if c["side"] == "B" else c for c in setup["components"]]
    added = 0
    for i, c in enumerate(components):
        added = added + (c["mass"] - setup["components"][i]["mass"])
    return {**setup, "components": components, "totalMass": setup["totalMass"] + added}


def stoichiometric_setup(setup: Mapping[str, Any]) -> dict[str, Any] | None:
    """化學計量配比：回傳調整後的配方；官能基任一側為 0 時回傳 None。"""
    t = group_totals(setup)
    if not (t["nA"] > 0) or not (t["nB"] > 0):
        return None
    return scale_side_b(setup, t["nA"] / t["nB"])


def setup_at_ratio(setup: Mapping[str, Any], ratio: float) -> dict[str, Any] | None:
    """以指定當量比（N_B／N_A）調整 group_b 側。"""
    t = group_totals(setup)
    if not (t["nA"] > 0) or not (t["nB"] > 0):
        return None
    return scale_side_b(setup, (ratio * t["nA"]) / t["nB"])


def express_amounts(unit: str, items: Sequence[Mapping[str, Any]]) -> list[float] | None:
    """把調整後的質量換回使用者的 Solid 區單位。無法換算（mol% 缺分子量、phr 沒有樹脂）回傳 None。"""
    if unit in ("g", "parts"):
        return [i["amountOld"] * (i["mass"] / i["massOld"]) if i["massOld"] > 0 else 0 for i in items]
    if unit == "wt":
        total = 0
        for i in items:
            total = total + i["mass"]
        return [(i["mass"] / total) * 100 for i in items] if total > 0 else None
    if unit == "mol":
        if any(i["molarMass"] is None for i in items):
            return None
        moles = [js_div(i["mass"], i["molarMass"]) for i in items]
        total = 0
        for m in moles:
            total = total + m
        return [(m / total) * 100 for m in moles] if total > 0 else None
    if unit == "phr":
        resin = 0
        for i in items:
            resin = resin + (i["mass"] if i.get("isResin") else 0)
        return [(i["mass"] / resin) * 100 for i in items] if resin > 0 else None
    return None


SCAN_OPTIONS: tuple[dict[str, str], ...] = (
    {"property": "crosslinkDensity", "direction": "max", "label": "交聯密度 ν_c（最大）", "unit": "mol/kg", "description": "網最密"},
    {"property": "networkMolecules", "direction": "max", "label": "連入網路的分子數（最大）", "unit": "mol/kg", "description": "最多分子被連進網路（聚合物體系中不代表網較密）"},
    {"property": "mc", "direction": "min", "label": "Mc（最小）", "unit": "g/mol", "description": "網最密"},
    {"property": "mc", "direction": "max", "label": "Mc（最大）", "unit": "g/mol", "description": "網最鬆"},
    {"property": "gelConversion", "direction": "min", "label": "凝膠轉化率（最小）", "unit": "%", "description": "最早凝膠"},
    {"property": "gelConversion", "direction": "max", "label": "凝膠轉化率（最大）", "unit": "%", "description": "最晚凝膠"},
    {"property": "residualA", "direction": "min", "label": "殘留官能基：A 側（最小）", "unit": "%", "description": "A 側官能基殘留最少"},
    {"property": "residualB", "direction": "min", "label": "殘留官能基：B 側（最小）", "unit": "%", "description": "B 側官能基殘留最少"},
    {"property": "residualTotal", "direction": "min", "label": "殘留官能基：兩類合計（最小）", "unit": "%", "description": "兩類官能基合計殘留最少"},
)  # fmt: skip


def scan_value(r: Mapping[str, Any], prop: str) -> float | None:
    """取出掃描物性的數值；不適用（未凝膠等）時為 None。交聯密度與連入網路的分子數未凝膠視為 0。"""
    if prop == "crosslinkDensity":
        return r["effectiveChainsMolPerKg"] if r["gelled"] else 0
    if prop == "networkMolecules":
        return r["junctionsMolPerKg"] if r["gelled"] else 0
    if prop == "mc":
        return r["mcGPerMol"]
    if prop == "gelConversion":
        return None if r["gelConversion"] is None else r["gelConversion"] * 100
    if prop == "residualA":
        return r["residualAPct"]
    if prop == "residualB":
        return r["residualBPct"]
    if prop == "residualTotal":
        return r["residualTotalPct"]
    raise ValueError(f"未知的掃描物性：{prop}")


def check_scan_settings(s: Mapping[str, Any]) -> str | None:
    """掃描設定是否有效（回傳錯誤說明，或 None）。"""
    vals = [s["min"], s["max"], s["points"]]
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in vals):
        return "掃描範圍必須是數字"
    if not (s["min"] > 0):
        return "當量比下限必須大於 0"
    if not (s["max"] > s["min"]):
        return "當量比上限必須大於下限"
    if float(s["points"]) != math.floor(s["points"]) or s["points"] < 2 or s["points"] > 501:
        return "點數必須是 2–501 的整數"
    return None


def scan_ratio(setup: Mapping[str, Any], q: float, option: Mapping[str, Any], settings: Mapping[str, Any] | None = None) -> dict[str, Any] | None:
    """比例掃描：保持 group_a 側與其他成分不變，調整 group_b 側；轉化率沿用使用者的限量官能基轉化率。"""
    t = group_totals(setup)
    nA, nB = t["nA"], t["nB"]
    if not (nA > 0) or not (nB > 0):
        return None
    if settings is None:
        settings = default_scan_settings(nB / nA)
    if check_scan_settings(settings) is not None:
        return None
    points: list[dict[str, Any]] = []
    best_index: int | None = None
    n_points = int(settings["points"])
    for i in range(n_points):
        ratio = settings["min"] + ((settings["max"] - settings["min"]) * i) / (n_points - 1)
        s = setup_at_ratio(setup, ratio)
        assert s is not None
        r = compute_layer1(s, q)
        value = scan_value(r, option["property"]) if r else None
        points.append({"ratio": ratio, "value": value})
        if value is not None:
            best = None if best_index is None else points[best_index]["value"]
            if best is None or (value > best if option["direction"] == "max" else value < best):
                best_index = i
    return {
        "points": points,
        "bestIndex": best_index,
        "currentRatio": nB / nA,
        "bestSetup": None if best_index is None else setup_at_ratio(setup, points[best_index]["ratio"]),
    }


# ---------- prepare.ts ----------


def prepare_layer1(
    result: Mapping[str, Any],
    solid_components: Sequence[Mapping[str, Any]],
    solid_unit: str,
    wt_by_id: Mapping[str, float | None] | None,
) -> dict[str, Any]:
    """由第 0 層結果與配方換算結果，整理出第 1 層的輸入。只處理「一條反應規則、兩類官能基（A、B）」的逐步加成體系；其他情況回傳不支援的原因。
    `wt_by_id`：Solid 區各成分的質量百分比；None 表示配方換算失敗（TS 的 `!solidResult`）。"""
    pairs = result["pairs"]
    if len(pairs) == 0:
        return {"ok": False, "reason": "配方中沒有反應配對"}
    rule_ids = {p["ruleId"] for p in pairs}
    if len(rule_ids) > 1:
        return {"ok": False, "reason": MESSAGE_MULTI_RULE}
    rule_id = pairs[0]["ruleId"]
    first = pairs[0]
    if first["b"] is None or first["a"]["groupId"] == first["b"]["groupId"]:
        return {"ok": False, "reason": "第 1 層只支援兩類不同官能基互相反應的規則（自反應或同類官能基暫不支援）"}

    undetermined = next(
        (
            c
            for c in result["components"]
            if c["problem"] is not None and any(p["a"]["componentId"] == c["id"] or (p["b"] is not None and p["b"]["componentId"] == c["id"]) for p in pairs)
        ),
        None,
    )
    if undetermined is not None:
        return {"ok": False, "reason": f"「{undetermined['name']}」：{undetermined['problem']}"}

    if wt_by_id is None:
        return {"ok": False, "reason": "請先修正「配方工作台」 Solid 區的用量錯誤，才能計算第 1 層"}
    solid_comps = solid_components
    if len(solid_comps) == 0 or any(wt_by_id.get(c["id"]) is None for c in solid_comps):
        return {"ok": False, "reason": "請先填完「配方工作台」 Solid 區的用量"}

    f_a: dict[str, float | None] = {}
    f_b: dict[str, float | None] = {}
    end_a: dict[str, dict[str, float]] = {}
    end_b: dict[str, dict[str, float]] = {}
    for p in pairs:
        f_a[p["a"]["componentId"]] = p["a"]["f"]
        f_b[p["b"]["componentId"]] = p["b"]["f"]
        if p["a"]["perUnit"] is not None:
            end_a[p["a"]["componentId"]] = {"perUnit": p["a"]["perUnit"], "perChain": p["a"]["perChain"] if p["a"]["perChain"] is not None else 0}
        if p["b"]["perUnit"] is not None:
            end_b[p["b"]["componentId"]] = {"perUnit": p["b"]["perUnit"], "perChain": p["b"]["perChain"] if p["b"]["perChain"] is not None else 0}
    for id_ in f_a:
        if id_ in f_b:
            return {"ok": False, "reason": "同一個成分同時含兩類反應官能基，第 1 層暫不支援"}

    solid_ids = {c["id"] for c in solid_comps}
    analysis = {c["id"]: c for c in result["components"]}
    components: list[dict[str, Any]] = []
    for side, fmap in (("A", f_a), ("B", f_b)):
        for id_, f in fmap.items():
            a = analysis[id_]
            if id_ not in solid_ids:
                return {"ok": False, "reason": f"「{a['name']}」在 Liquid 區，第 1 層只計算 Solid 區成分的反應"}
            if f is None or not (f > 0) or a["molarMass"] is None or not (a["molarMass"] > 0):
                return {"ok": False, "reason": f"「{a['name']}」缺少計算所需的資料（聚合物需 Mw、Mn 或 DP）"}
            end = end_a.get(id_) if side == "A" else end_b.get(id_)
            distribution = None
            if a["isPolymer"] and a["distribution"] and a["dp"] is not None and a["dp"] > 0 and end:
                distribution = {**a["distribution"], "groupsPerUnit": end["perUnit"], "endGroups": end["perChain"]}
            comp: dict[str, Any] = {"id": id_, "name": a["name"], "side": side, "isPolymer": a["isPolymer"]}
            if a["units"] is not None and len(a["units"]) > 1:
                comp["isCopolymer"] = True
            comp["mass"] = wt_by_id[id_]
            comp["molarMass"] = a["molarMass"]
            comp["groupsPerMolecule"] = f
            if distribution is not None:
                comp["distribution"] = distribution
            components.append(comp)

    total_mass = 0
    for c in solid_comps:
        total_mass = total_mass + wt_by_id[c["id"]]
    masses = {c["id"]: wt_by_id[c["id"]] for c in solid_comps}
    items: list[dict[str, Any]] = []
    for c in solid_comps:
        item: dict[str, Any] = {
            "id": c["id"],
            "name": js_trim(c["name"]) or c["canonicalSmiles"],
            "massOld": wt_by_id[c["id"]],
            "molarMass": analysis[c["id"]]["molarMass"] if c["id"] in analysis else None,
            "amountOld": c["amount"],
        }
        if c.get("isResin"):
            item["isResin"] = True
        items.append(item)
    return {
        "ok": True,
        "setup": {"nameA": first["groupAName"], "nameB": first["groupBName"], "components": components, "totalMass": total_mass},
        "ruleId": rule_id,
        "solidUnit": solid_unit,
        "items": items,
        "masses": masses,
    }


def describe_amounts(prep: Mapping[str, Any], adjusted: Mapping[str, Any]) -> dict[str, Any]:
    """調整後的配方（理論配比或掃描最佳點）換回使用者單位與重量份的各成分用量。"""
    new_mass = {c["id"]: c["mass"] for c in adjusted["components"]}
    items = [{**i, "mass": new_mass.get(i["id"], i["massOld"])} for i in prep["items"]]
    amounts = express_amounts(prep["solidUnit"], items)
    return {
        "unit": prep["solidUnit"],
        "rows": [{"id": i["id"], "name": i["name"], "parts": i["mass"], "amount": amounts[k] if amounts else None} for k, i in enumerate(items)],
    }
