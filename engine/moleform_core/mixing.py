"""任務 P6A：混合密度、混合介電常數、共聚比例掃描（PLAN 6.7 剩餘；D62：新計算模組直接寫在 Python，沒有 TS 版）。

公式為標準混合法則（出處「待使用者審」，見 docs/MODELS.md）。缺值一律回報 missing，不猜；加總一律用明確迴圈。
共聚比例掃描只呼叫現有模組（tg、tg_mixing.fox_mix、vm、dielectric、free_volume、repeat_unit）；沒有新的參數或資料表。
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any

from . import dielectric as _de
from . import free_volume as _fv
from . import vm as _vm
from .repeat_unit import analyze_repeat_unit
from .tg import compute_tg
from .tg_mixing import fox_mix

FRACTION_SUM_TOLERANCE = 1e-6
MAX_COMPONENTS = 200

DENSITY_MODEL = "理想體積加成混合密度：1/ρ_mix = Σ(w_i/ρ_i)（w_i 為質量分率；無過量體積）。公式為標準混合法則，出處待使用者審"
DENSITY_NOTE = "理想混合，未含過量體積"
DIELECTRIC_MODEL = (
    "混合介電常數：Wiener 並聯上界 ε = Σφ_i·ε_i、Wiener 串聯下界 1/ε = Σφ_i/ε_i、Lichtenecker 對數混合 ln ε = Σφ_i·ln ε_i（估計值；φ_i 為體積分率）。"
    "公式為標準混合法則，出處待使用者審"
)
DIELECTRIC_NOTE = "參考趨勢，非精確值"
SCAN_MODEL = (
    "共聚比例掃描（Random，莫耳分率 x 為單元 A）：Tg 用 Fox 式 1/Tg = Σwᵢ/Tgᵢ（wᵢ ＝ xᵢMᵢ 正規化，Tgᵢ 為單元均聚物的基團貢獻 Tg）；"
    "密度 = Σxᵢ·Mᵢ ÷ Σxᵢ·Vmᵢ；ε 用式 (11.8) ε = (Σxᵢ·P_Vᵢ ÷ Σxᵢ·Mᵢ)²；自由體積沿用 free_volume 的莫耳分率加權。"
    "Tg、密度、ε 的共聚物算法為本卡的組合用法，待使用者審"
)
SCAN_NOTE = "參考趨勢；某欄算不出（缺基團）時該欄標 missing，其餘照出"


# ---------- 輸入檢查 ----------


def _is_num(v: object) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _positive(v: object, label: str) -> float:
    if not _is_num(v) or not (v > 0):  # type: ignore[operator]
        raise ValueError(f"{label} 必須是大於 0 的有限數字")
    return float(v)  # type: ignore[arg-type]


def _components(items: object) -> list[Mapping[str, Any]]:
    if not isinstance(items, Sequence) or isinstance(items, (str, bytes)) or len(items) == 0:
        raise ValueError("components 必須是至少一項的陣列")
    if len(items) > MAX_COMPONENTS:
        raise ValueError(f"components 太多（上限 {MAX_COMPONENTS}）")
    for i, c in enumerate(items):
        if not isinstance(c, Mapping):
            raise ValueError(f"第 {i + 1} 個成分必須是物件")
    return list(items)


def _name(c: Mapping[str, Any], i: int) -> str:
    n = c.get("name")
    return n if isinstance(n, str) and n != "" else f"成分 {i + 1}"


def _check_sum(values: Sequence[float], label: str) -> None:
    total = 0.0
    for v in values:
        total = total + v
    if abs(total - 1) > FRACTION_SUM_TOLERANCE:
        raise ValueError(f"{label}合計必須為 1（目前 {total}）")


USER_DENSITY_LABEL = "使用者輸入（文獻或供應商資料，非預測）"


def _density_resolve(c: Mapping[str, Any], label: str) -> tuple[float | None, str | None, str | None]:
    """成分密度（g/cm³）：回傳 (值, 缺值原因, 來源)。來源為 "given"（呼叫端的 density）、"predicted"（莫耳體積表）、"user"（userDensity）。
    順序：density 優先；其次由 smiles 的預測密度（聚合物，不改現有行為）；預測取不到時才用 userDensity（使用者輸入的文獻／供應商值）。"""
    if c.get("density") is not None:
        return _positive(c["density"], f"{label}的 density"), None, "given"
    user = _positive(c["userDensity"], f"{label}的 userDensity") if c.get("userDensity") is not None else None
    smiles = c.get("smiles")
    if not isinstance(smiles, str) or smiles.strip() == "":
        if user is not None:
            return user, None, "user"
        return None, "沒有提供密度（density 或 smiles）", None
    r = _vm.compute_molar_volume_density(smiles)
    if r["status"] == "ok" and r["amorphous"] is not None:
        return r["amorphous"]["density"], None, "predicted"
    if user is not None:
        return user, None, "user"
    if r["status"] == "unsupported":
        return None, "小分子液體密度（Fedors）尚未收錄，請自行提供 density", None
    if r["status"] == "missing":
        return None, "莫耳體積表缺基團，算不出密度", None
    if r["status"] == "ok":
        return None, "單元質量無法計算，算不出密度", None
    raise ValueError(f"{label}：{r['message']}")


def _density_of(c: Mapping[str, Any], label: str) -> tuple[float | None, str | None]:
    """成分密度（g/cm³）；回傳 (值, 缺值原因)。"""
    rho, why, _src = _density_resolve(c, label)
    return rho, why


def _epsilon_of(c: Mapping[str, Any], label: str) -> tuple[float | None, str | None]:
    """成分介電常數：呼叫端傳入的 epsilon 優先，否則由 smiles 呼叫 dielectric（式 11.8）；回傳 (值, 缺值原因)。"""
    if c.get("epsilon") is not None:
        return _positive(c["epsilon"], f"{label}的 epsilon"), None
    smiles = c.get("smiles")
    if not isinstance(smiles, str) or smiles.strip() == "":
        return None, "沒有提供介電常數（epsilon 或 smiles）"
    d = _de.compute_dielectric(smiles)
    if d["status"] == "ok":
        return d["epsPrimary"], None
    if d["status"] == "missing":
        return None, "極化表缺基團，算不出介電常數"
    if d["status"] == "unsupported":
        return None, "小分子介電常數尚未收錄，請自行提供 epsilon"
    raise ValueError(f"{label}：{d['message']}")


# ---------- 混合密度 ----------


def compute_mixture_density(items: object) -> dict[str, Any]:
    """理想體積加成：1/ρ_mix = Σ(w_i/ρ_i)。成分 {name?, w, density? | smiles?}；任一成分缺密度 → status = missing。"""
    comps = _components(items)
    weights = [_positive(c.get("w"), f"{_name(c, i)}的質量分率 w") for i, c in enumerate(comps)]
    _check_sum(weights, "質量分率")
    rows: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    for i, c in enumerate(comps):
        name = _name(c, i)
        rho, why, src = _density_resolve(c, name)
        row: dict[str, Any] = {"name": name, "w": weights[i], "density": rho}
        if src == "user":
            row["densitySource"] = "user"
            row["densitySourceLabel"] = USER_DENSITY_LABEL
            if isinstance(c.get("userDensitySource"), str) and c["userDensitySource"].strip() != "":
                row["userDensitySource"] = c["userDensitySource"]
        elif src is not None:
            row["densitySource"] = src
        rows.append(row)
        if rho is None:
            missing.append({"index": i, "name": name, "field": "density", "reason": why})
    if missing:
        return {
            "status": "missing",
            "components": rows,
            "missing": missing,
            "message": "缺成分密度：" + "、".join(f"{m['name']}（{m['reason']}）" for m in missing) + "；不猜值，整體不計算",
            "model": DENSITY_MODEL,
            "note": DENSITY_NOTE,
        }
    inv = 0.0
    for r in rows:
        inv = inv + r["w"] / r["density"]
    return {"status": "predicted", "density": 1 / inv, "components": rows, "missing": [], "model": DENSITY_MODEL, "note": DENSITY_NOTE}


# ---------- 混合介電常數 ----------


def compute_mixture_dielectric(items: object, basis: str = "volume") -> dict[str, Any]:
    """Wiener 並聯上界、串聯下界與 Lichtenecker 對數混合。basis = "volume"（成分給 phi）或 "mass"（成分給 w 與密度，換算成體積分率）。
    成分 {name?, phi | w, epsilon? | smiles?, density?（mass 時）}；任一成分缺 ε（或 mass 時缺密度）→ status = missing。"""
    if basis not in ("volume", "mass"):
        raise ValueError("basis 必須是 volume 或 mass")
    comps = _components(items)
    rows: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    fracs: list[float] = []
    for i, c in enumerate(comps):
        name = _name(c, i)
        fracs.append(_positive(c.get("phi" if basis == "volume" else "w"), f"{name}的{'體積' if basis == 'volume' else '質量'}分率"))
    _check_sum(fracs, "體積分率" if basis == "volume" else "質量分率")
    for i, c in enumerate(comps):
        name = _name(c, i)
        eps, why = _epsilon_of(c, name)
        row: dict[str, Any] = {"name": name, "epsilon": eps}
        if basis == "volume":
            row["phi"] = fracs[i]
        else:
            row["w"] = fracs[i]
            rho, why_rho = _density_of(c, name)
            row["density"] = rho
            if rho is None:
                missing.append({"index": i, "name": name, "field": "density", "reason": why_rho})
        if eps is None:
            missing.append({"index": i, "name": name, "field": "epsilon", "reason": why})
        rows.append(row)
    if missing:
        return {
            "status": "missing",
            "components": rows,
            "missing": missing,
            "message": "缺成分資料：" + "、".join(f"{m['name']}（{m['reason']}）" for m in missing) + "；不猜值，整體不計算",
            "model": DIELECTRIC_MODEL,
            "note": DIELECTRIC_NOTE,
        }
    if basis == "mass":
        vols: list[float] = []
        total = 0.0
        for r in rows:
            v = r["w"] / r["density"]
            vols.append(v)
            total = total + v
        for r, v in zip(rows, vols):
            r["phi"] = v / total
    upper = 0.0
    inv_lower = 0.0
    log_mix = 0.0
    for r in rows:
        upper = upper + r["phi"] * r["epsilon"]
        inv_lower = inv_lower + r["phi"] / r["epsilon"]
        log_mix = log_mix + r["phi"] * math.log(r["epsilon"])
    return {
        "status": "predicted",
        "wienerUpper": upper,
        "wienerLower": 1 / inv_lower,
        "lichtenecker": math.exp(log_mix),
        "components": rows,
        "missing": [],
        "model": DIELECTRIC_MODEL,
        "note": DIELECTRIC_NOTE,
    }


# ---------- 共聚比例掃描 ----------


def default_grid() -> list[float]:
    """0 到 1 每 0.1，包含兩端。"""
    return [i / 10 for i in range(11)]


def _grid(grid: object) -> list[float]:
    if grid is None:
        return default_grid()
    if not isinstance(grid, Sequence) or isinstance(grid, (str, bytes)) or len(grid) == 0 or len(grid) > MAX_COMPONENTS:
        raise ValueError(f"grid 必須是 1 到 {MAX_COMPONENTS} 個數字的陣列")
    out: list[float] = []
    for x in grid:
        if not _is_num(x) or not (0 <= x <= 1):  # type: ignore[operator]
            raise ValueError("grid 的每一項必須是 0 到 1 之間的數字（單元 A 的莫耳分率）")
        out.append(float(x))  # type: ignore[arg-type]
    return out


def _cell(value: float | None, reason: str | None) -> dict[str, Any]:
    return {"value": value, "status": "predicted" if value is not None else "missing", "reason": reason}


def _unit_info(smiles: str, label: str) -> dict[str, Any]:
    """單元的現有模組結果（只算一次）；單元結構不合規則 → ValueError。"""
    a = analyze_repeat_unit(smiles)
    if not a["ok"]:
        raise ValueError(f"{label}：{a['problem']['message']}")
    tg = compute_tg(smiles)
    vm = _vm.compute_molar_volume_density(smiles)
    de = _de.compute_dielectric(smiles)
    return {"smiles": smiles, "mUnit": a["mUnit"], "tg": tg, "vm": vm, "de": de}


def _why_tg(u: dict[str, Any], label: str) -> str | None:
    s = u["tg"]["status"]
    if s == "ok":
        return None
    return f"單元 {label} 缺基團，算不出 Tg" if s == "missing" else f"單元 {label}：{u['tg'].get('message', 'Tg 無法計算')}"


def _why_vm(u: dict[str, Any], label: str) -> str | None:
    v = u["vm"]
    if v["status"] == "ok" and v["amorphous"] is not None:
        return None
    return f"單元 {label} 缺基團，算不出莫耳體積" if v["status"] == "missing" else f"單元 {label}：莫耳體積無法計算"


def _why_de(u: dict[str, Any], label: str) -> str | None:
    d = u["de"]
    if d["status"] == "ok":
        return None
    return f"單元 {label} 缺基團，算不出介電常數" if d["status"] == "missing" else f"單元 {label}：介電常數無法計算"


def compute_copolymer_scan(unit_a: object, unit_b: object, grid: object = None) -> dict[str, Any]:
    """對單元 A 的莫耳分率網格逐點算 Tg（Fox）、密度、ε、自由體積；某欄缺基團標 missing，其餘照出。"""
    if not isinstance(unit_a, str) or not isinstance(unit_b, str):
        raise ValueError("unitA、unitB 必須是含 * 的重複單元 SMILES 字串")
    xs = _grid(grid)
    ua = _unit_info(unit_a, "單元 A")
    ub = _unit_info(unit_b, "單元 B")
    rows: list[dict[str, Any]] = []
    for x in xs:
        # 莫耳分率 > 0 的單元才參與（端點因此與單一單元的現有模組結果逐位相同）
        parts: list[tuple[dict[str, Any], float, str]] = []
        if x > 0:
            parts.append((ua, x, "A"))
        if x < 1:
            parts.append((ub, 1 - x, "B"))

        # Tg：Fox，wᵢ ∝ xᵢMᵢ
        tg_why = next((w for p, _, lab in parts if (w := _why_tg(p, lab)) is not None), None)
        tg_val: float | None = None
        if tg_why is None:
            if len(parts) == 1:
                tg_val = parts[0][0]["tg"]["tgK"]
            else:
                items = [{"w": f * p["mUnit"], "tgK": p["tg"]["tgK"]} for p, f, _ in parts]
                tg_val = fox_mix(items)

        # 密度：Σx·M ÷ Σx·Vm
        vm_why = next((w for p, _, lab in parts if (w := _why_vm(p, lab)) is not None), None)
        dens_val: float | None = None
        if vm_why is None:
            mass = 0.0
            vol = 0.0
            for p, f, _ in parts:
                mass = mass + f * p["vm"]["unitMass"]
            for p, f, _ in parts:
                vol = vol + f * p["vm"]["amorphous"]["vm"]
            dens_val = mass / vol

        # ε：式 11.8，(Σx·P_V ÷ Σx·M)²
        de_why = next((w for p, _, lab in parts if (w := _why_de(p, lab)) is not None), None)
        eps_val: float | None = None
        if de_why is None:
            spv = 0.0
            mass_d = 0.0
            for p, f, _ in parts:
                spv = spv + f * p["de"]["sumPV"]
            for p, f, _ in parts:
                mass_d = mass_d + f * p["de"]["unitMass"]
            eps_val = _de.epsilon_from_pv(spv, mass_d)

        # 自由體積：現有 free_volume（莫耳分率加權）
        if len(parts) == 1:
            fv = _fv.compute_free_volume(parts[0][0]["smiles"])
        else:
            fv = _fv.compute_free_volume(
                ua["smiles"],
                {"units": [{"smiles": ua["smiles"], "fraction": x * 100}, {"smiles": ub["smiles"], "fraction": (1 - x) * 100}], "fractionBasis": "mol"},
            )
        fv_val: float | None = None
        fv_why: str | None = None
        if fv["status"] == "ok":
            fv_val = fv["vf"]
        elif fv["status"] == "missing":
            fv_why = fv["message"]
        else:
            fv_why = fv["message"]

        rows.append(
            {
                "x": x,
                "tg": _cell(tg_val, tg_why),
                "density": _cell(dens_val, vm_why),
                "epsilon": _cell(eps_val, de_why),
                "freeVolume": _cell(fv_val, fv_why),
            }
        )
    return {"status": "ok", "unitA": unit_a, "unitB": unit_b, "rows": rows, "model": SCAN_MODEL, "note": SCAN_NOTE}
