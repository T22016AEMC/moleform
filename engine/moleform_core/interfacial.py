"""界面張力與潤濕（任務 P8-2，PLAN 8.7）。直接寫在 Python（D62）。

出處：van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009)，8.2.4 節（Young 式 8.6、鋪展係數、Zisman 的 γcr）、8.4 節（式 8.20–8.23，Owens–Wendt）、
Table 8.6（14 種液體的力分量）、Table 8.7（27 種聚合物的 γc、γs、γd、γp）、Table 8.8（Van Oss 的 LW／AB 分量，14 列，與 γd、γp 是不同的分解，不互換）、Example 8.4。

- 式 8.22（Owens–Wendt，F2）：γ12 = [(γ1d)^½ − (γ2d)^½]² + [(γ1p)^½ − (γ2p)^½]²。
- 式 8.23：1 + cosθ = (2/γLV)[(γSd·γLd)^½ + (γSp·γLp)^½]。cosθ > 1 → 完全潤濕（θ = 0）；cosθ < −1 → θ 回 missing 並說明。
- 式 8.6（Young，πeq ≈ 0）：γLV·cosθ = γSV − γSL ≈ γS − γSL（黏附張力）。
- 鋪展係數（書的定義）：S = γLV + γSL − γSV；**書原文：完全潤濕時 S 為負**（S < 0 → 完全潤濕、液體會鋪展；S ≥ 0 → 不完全潤濕）。
- 資料只來自 `surface_energy.csv`（書的表號與頁碼，pending）；不在表內的物質（沒有 γd、γp）Owens–Wendt 輸出 missing，不補。γcr 只作資料顯示，不另做擬合。
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from rdkit import Chem

from . import solvents as _sv
from .csv_reader import js_number, js_trim
from .tables import read_data_file
from .y_tables import _records

SURFACE_ENERGY_FILE = "surface_energy.csv"
SURFACE_ENERGY_COLUMNS = [
    "id", "table", "name_en", "smiles_or_polymer", "kind", "gamma", "gamma_d", "gamma_p", "gc", "neg_dgamma_dT", "polarity",
    "gamma_lw", "gamma_ab", "gamma_plus", "gamma_minus", "unit", "temperature_c", "source", "review_status", "note",
]  # fmt: skip
OW_MODEL = "Owens–Wendt 界面張力（van Krevelen & te Nijenhuis 4th ed. (2009)，式 8.22，F2 型 8.21b）"
CONTACT_MODEL = "接觸角（Owens–Wendt，van Krevelen & te Nijenhuis 4th ed. (2009)，式 8.23）"
YOUNG_MODEL = "Young 式（式 8.6，πeq ≈ 0）與鋪展係數 S = γLV + γSL − γSV（8.2.4 節）"
INTERFACIAL_TREND = "參考趨勢，非定量保證；書公式預估誤差見 MODELS.md；書的 γd、γp 來自特定液體與聚合物的實驗，括號值與 ≈ 值為書標的估計"
INTERFACIAL_DISCLAIMER = (
    "本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。"
)
GAMMA_UNIT = "mN/m"
ACCEPTED_TABLES = ("8.6", "8.7", "8.8")


class SurfaceEnergyTableError(Exception):
    """surface_energy.csv 格式錯誤（D22：不靜默略過）。"""

    def __init__(self, issues: list[str]):
        super().__init__("；".join(issues))
        self.issues = issues


@dataclass(frozen=True)
class SurfaceEnergyRow:
    id: str
    table: str
    name_en: str
    smiles: str
    kind: str
    gamma: float | None
    gamma_d: float | None
    gamma_p: float | None
    gc: float | None
    neg_dgamma_dt: float | None
    polarity: float | None
    gamma_lw: float | None
    gamma_ab: float | None
    gamma_plus: float | None
    gamma_minus: float | None
    temperature_c: float | None
    source: str
    note: str

    @property
    def has_components(self) -> bool:
        return self.gamma_d is not None and self.gamma_p is not None


def _num(text: str, where: str, issues: list[str]) -> float | None:
    if text == "":
        return None
    v = js_number(text)
    if math.isnan(v):
        issues.append(f"{where}：不是數字「{text}」")
        return None
    return v


@lru_cache(maxsize=1)
def load_surface_energy() -> tuple[SurfaceEnergyRow, ...]:
    issues: list[str] = []
    rows: list[SurfaceEnergyRow] = []
    seen: set[str] = set()
    for no, c in enumerate(_records(read_data_file(SURFACE_ENERGY_FILE), SURFACE_ENERGY_FILE, SURFACE_ENERGY_COLUMNS), start=2):
        (id_, table, name, smi, kind, g, gd, gp, gc, dg, pol, lw, ab, plus, minus, unit, temp, source, status, note) = c
        where = f"{SURFACE_ENERGY_FILE} 第 {no} 列"
        nums = [_num(x, where, issues) for x in (g, gd, gp, gc, dg, pol, lw, ab, plus, minus, temp)]
        if id_ == "" or name == "":
            issues.append(f"{where}：id、name_en 不可空白")
        if id_ in seen:
            issues.append(f"{where}：id 重複：{id_}")
        seen.add(id_)
        if table not in ACCEPTED_TABLES:
            issues.append(f"{where}：table 只能是 {'、'.join(ACCEPTED_TABLES)}")
        if kind not in ("liquid", "polymer"):
            issues.append(f"{where}：kind 只能是 liquid 或 polymer")
        if unit != "mN/m":
            issues.append(f"{where}：unit 必須是 mN/m")
        if f"Table {table}" not in source or "頁" not in source:
            issues.append(f"{where}：出處需寫明書名、表號（Table {table}）與書頁碼")
        if status != "pending":
            issues.append(f"{where}：review_status 必須是 pending")
        if smi != "" and Chem.MolFromSmiles(smi) is None:
            issues.append(f"{where}：SMILES 無法解析「{smi}」")
        if (gd != "" or gp != "") and not (gd != "" and gp != ""):
            issues.append(f"{where}：γd 與 γp 必須同時有或同時沒有")
        rows.append(SurfaceEnergyRow(id_, table, name, smi, kind, *nums[:6], *nums[6:10], nums[10], source, note))  # type: ignore[arg-type]
    if issues:
        raise SurfaceEnergyTableError(issues)
    return tuple(rows)


def _canonical_unmapped(smiles: str) -> str | None:
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    for a in mol.GetAtoms():
        a.SetAtomMapNum(0)
    return Chem.MolToSmiles(mol)


def polymer_row_for(smiles: str, table: str | None = None) -> SurfaceEnergyRow | None:
    """重複單元與表中某個聚合物相同就回傳該列；table 指定時只看該表（預設優先 8.7，其次 8.8）。"""
    key = _canonical_unmapped(smiles)
    if key is None:
        return None
    order = [table] if table else ["8.7", "8.8"]
    for t in order:
        for r in load_surface_energy():
            if r.kind == "polymer" and r.table == t and r.smiles != "" and _canonical_unmapped(r.smiles) == key:
                return r
    return None


def liquid_row_for(smiles: str) -> SurfaceEnergyRow | None:
    key = _canonical_unmapped(smiles)
    if key is None:
        return None
    for r in load_surface_energy():
        if r.kind == "liquid" and r.smiles != "" and _canonical_unmapped(r.smiles) == key:
            return r
    return None


def _q(value: float | None, unit: str, source: str, status: str = "predicted", **extra: Any) -> dict[str, Any]:
    if value is None:
        return {"value": None, "unit": unit, "source": source, "status": "missing", **extra}
    return {"value": value, "unit": unit, "source": source, "status": status, **extra}


# ---------- 公式 ----------


def interfacial_tension(d1: float, p1: float, d2: float, p2: float) -> float:
    """式 8.22：γ12 = (√γ1d − √γ2d)² + (√γ1p − √γ2p)²。"""
    return (math.sqrt(d1) - math.sqrt(d2)) ** 2 + (math.sqrt(p1) - math.sqrt(p2)) ** 2


def cos_theta(sd: float, sp: float, ld: float, lp: float, g_lv: float) -> float:
    """式 8.23：1 + cosθ = (2/γLV)[(γSd γLd)^½ + (γSp γLp)^½]。"""
    return 2 * (math.sqrt(sd * ld) + math.sqrt(sp * lp)) / g_lv - 1


# ---------- 物質解析 ----------


def resolve_material(spec: object) -> dict[str, Any]:
    """spec：{materialId? | solventId? | smiles? | name?}。回傳 {status, label, kind, row, gamma(dict), source...}；找不到回 status = missing 並說明。"""
    if not isinstance(spec, Mapping):
        raise ValueError("物質需要 JSON 物件（materialId、solventId、smiles 或 name 擇一）")
    rows = load_surface_energy()
    row: SurfaceEnergyRow | None = None
    solvent: _sv.Solvent | None = None
    smiles = spec.get("smiles")
    if isinstance(spec.get("materialId"), str):
        row = next((r for r in rows if r.id == spec["materialId"]), None)
        if row is None:
            raise ValueError(f"surface_energy.csv 沒有這個 id：{spec['materialId']}")
    elif isinstance(spec.get("solventId"), str):
        solvent = _sv.get_solvent(spec["solventId"])
        if solvent is None:
            raise ValueError(f"溶劑資料表沒有這個溶劑：{spec['solventId']}")
        row = liquid_row_for(solvent.smiles)
    elif isinstance(smiles, str) and js_trim(smiles) != "":
        if Chem.MolFromSmiles(smiles) is None:
            raise ValueError("RDKit 無法解析這個 SMILES")
        if "*" in smiles:
            row = polymer_row_for(smiles)
        else:
            row = liquid_row_for(smiles)
            sid = _sv.solvent_id_for_smiles(smiles)
            solvent = _sv.get_solvent(sid) if sid else None
    elif isinstance(spec.get("name"), str):
        key = spec["name"].strip().lower()
        row = next((r for r in rows if r.name_en.lower() == key and r.table in ("8.6", "8.7")), None) or next((r for r in rows if r.name_en.lower() == key), None)
    else:
        raise ValueError("物質需要 materialId、solventId、smiles 或 name 其中一個")
    label = row.name_en if row is not None else (solvent.name_en if solvent is not None else str(smiles or spec.get("name") or ""))
    kind = row.kind if row is not None else ("liquid" if solvent is not None else ("polymer" if isinstance(smiles, str) and "*" in smiles else "unknown"))
    return {"row": row, "solvent": solvent, "label": label, "kind": kind, "smiles": smiles if isinstance(smiles, str) else None}


def _gamma_of(m: Mapping[str, Any]) -> dict[str, Any]:
    """γ（液體：γLV；固體：γS≈γSV）。優先書的表（Table 8.6／8.7），其次溶劑資料表（液體）。"""
    row: SurfaceEnergyRow | None = m["row"]
    s: _sv.Solvent | None = m["solvent"]
    if row is not None and row.gamma is not None:
        return _q(row.gamma, GAMMA_UNIT, row.source, "literature", temperatureC=row.temperature_c, table=row.table)
    if s is not None:
        v = s.pick("surface_tension")
        if v is not None:
            return _q(v.value, v.unit, f"{v.source}；{v.source_detail}", "literature", temperatureC=v.temperature_c, table="solvents.csv")
        return _q(None, GAMMA_UNIT, "溶劑資料表", reason="溶劑資料表沒有這個溶劑的表面張力（找不到可引用且標明溫度的值）")
    return _q(None, GAMMA_UNIT, "surface_energy.csv", reason="這個物質不在 surface_energy.csv，也不在溶劑資料表")


def _components_reason(m: Mapping[str, Any]) -> str | None:
    """沒有 γd、γp 的原因；有就回傳 None。"""
    row: SurfaceEnergyRow | None = m["row"]
    if row is not None and row.has_components:
        return None
    if row is not None and row.table == "8.8":
        return f"「{m['label']}」只在 Table 8.8（Van Oss 的 LW／AB 分量，與 Owens–Wendt 的 γd、γp 是不同的分解，不互換）"
    if m["kind"] == "liquid" or m["solvent"] is not None:
        return f"「{m['label']}」不在書 Table 8.6（14 種液體），沒有 γd、γp；不補、不用其他來源推算"
    return f"「{m['label']}」不在書 Table 8.7（27 種聚合物），沒有 γd、γp；不補、不用其他來源推算"


def _describe(m: Mapping[str, Any]) -> dict[str, Any]:
    row: SurfaceEnergyRow | None = m["row"]
    reason = _components_reason(m)
    out: dict[str, Any] = {"label": m["label"], "kind": m["kind"], "smiles": m["smiles"], "gamma": _gamma_of(m)}
    if row is not None:
        out["materialId"] = row.id
        out["table"] = row.table
        out["note"] = row.note
        out["gc"] = _q(row.gc, GAMMA_UNIT, row.source, "literature") if row.gc is not None else None
    if reason is None and row is not None:
        out["gammaD"] = _q(row.gamma_d, GAMMA_UNIT, row.source, "literature")
        out["gammaP"] = _q(row.gamma_p, GAMMA_UNIT, row.source, "literature")
        if row.gamma is not None and row.gamma_d is not None and row.gamma_p is not None and abs(row.gamma - (row.gamma_d + row.gamma_p)) > 0.5:
            out["closureNote"] = f"書值 γ = {row.gamma:g} 與 γd + γp = {row.gamma_d + row.gamma_p:g} 不相等（書印 ± 或 ≈ 值）；式 8.22 只用分量"
    else:
        out["gammaD"] = _q(None, GAMMA_UNIT, "surface_energy.csv", reason=reason)
        out["gammaP"] = _q(None, GAMMA_UNIT, "surface_energy.csv", reason=reason)
    out["componentsReason"] = reason
    return out


def _tentative_note(m: Mapping[str, Any]) -> list[str]:
    row: SurfaceEnergyRow | None = m["row"]
    notes: list[str] = []
    if row is not None and row.has_components and ("括號" in row.note or "≈" in row.note or "∼" in row.note or "±" in row.note):
        notes.append(f"「{row.name_en}」的分量含書標為估計的值（{row.table}）：{row.note}")
    return notes


# ---------- 端點邏輯 ----------


def compute_interfacial(spec_a: object, spec_b: object) -> dict[str, Any]:
    """兩個物質之間的界面張力 γ12（式 8.22）。任一物質沒有 γd、γp → γ12 為 missing 並逐項說明。"""
    a, b = resolve_material(spec_a), resolve_material(spec_b)
    da, db = _describe(a), _describe(b)
    reasons: list[str] = [r for r in (da["componentsReason"], db["componentsReason"]) if r]
    gamma12 = None
    if not reasons:
        ra, rb = a["row"], b["row"]
        gamma12 = interfacial_tension(ra.gamma_d, ra.gamma_p, rb.gamma_d, rb.gamma_p)
    notes = _tentative_note(a) + _tentative_note(b)
    for d in (da, db):
        if d.get("closureNote"):
            notes.append(d["closureNote"])
    q = _q(gamma12, GAMMA_UNIT, OW_MODEL)
    if gamma12 is None:
        q["reason"] = "；".join(reasons)
    return {
        "status": "ok" if gamma12 is not None else "missing", "model": OW_MODEL, "confidence": "參考趨勢", "trend": INTERFACIAL_TREND,
        "a": da, "b": db, "quantities": {"gamma12": q}, "notes": notes, "reasons": reasons,
    }  # fmt: skip


def verdict_of(s: float, cos_t: float) -> str:
    if s <= 0 or cos_t >= 1:
        return "完全潤濕（書：S 為負時完全潤濕，θ = 0°）"
    if cos_t >= 0:
        return "部分潤濕（0° < θ < 90°）"
    return "不潤濕（θ > 90°，液體傾向從固體表面收縮）"


def compute_wetting(solid_spec: object, liquid_spec: object) -> dict[str, Any]:
    """固體（聚合物）與液體：γ12（式 8.22）、cosθ 與 θ（式 8.23）、黏附張力（式 8.6）、鋪展係數 S = γLV + γSL − γSV。"""
    solid, liquid = resolve_material(solid_spec), resolve_material(liquid_spec)
    ds, dl = _describe(solid), _describe(liquid)
    g_sv_q, g_lv_q = ds["gamma"], dl["gamma"]
    reasons: list[str] = [r for r in (ds["componentsReason"], dl["componentsReason"]) if r]
    if solid["kind"] != "polymer":
        reasons.append("固體需要聚合物（重複單元 SMILES，含 *，或 surface_energy.csv 的聚合物 id）")
    notes = _tentative_note(solid) + _tentative_note(liquid)
    absent = lambda unit, why: _q(None, unit, YOUNG_MODEL, reason=why)  # noqa: E731
    reason_text = "；".join(reasons) if reasons else None
    out_q: dict[str, Any] = {"gammaSV": g_sv_q, "gammaLV": g_lv_q}
    result: dict[str, Any] = {
        "model": f"{OW_MODEL}；{CONTACT_MODEL}；{YOUNG_MODEL}", "confidence": "參考趨勢", "trend": INTERFACIAL_TREND,
        "solid": ds, "liquid": dl, "notes": notes, "reasons": reasons,
    }  # fmt: skip
    if reasons or g_sv_q["value"] is None or g_lv_q["value"] is None:
        why = reason_text or "表面張力缺值"
        out_q.update({
            "gamma12": absent(GAMMA_UNIT, why), "cosTheta": absent("", why), "theta": absent("°", why),
            "adhesionTension": absent(GAMMA_UNIT, why), "spreadingCoefficient": absent(GAMMA_UNIT, why),
        })  # fmt: skip
        return {**result, "status": "missing", "quantities": out_q, "verdict": None}
    rs, rl = solid["row"], liquid["row"]
    g_sv, g_lv = g_sv_q["value"], g_lv_q["value"]
    g_sl = interfacial_tension(rs.gamma_d, rs.gamma_p, rl.gamma_d, rl.gamma_p)
    cos_t = cos_theta(rs.gamma_d, rs.gamma_p, rl.gamma_d, rl.gamma_p, g_lv)
    adhesion = g_sv - g_sl  # 式 8.6：γLV cosθ ≈ γS − γSL
    s_coef = g_lv + g_sl - g_sv  # 書的定義（8.2.4 節）；負值 → 完全潤濕
    out_q["gamma12"] = _q(g_sl, GAMMA_UNIT, OW_MODEL)
    out_q["cosTheta"] = _q(cos_t, "", CONTACT_MODEL)
    if cos_t > 1:
        out_q["theta"] = _q(0.0, "°", CONTACT_MODEL, note="cosθ > 1：完全潤濕，θ 以 0° 表示")
    elif cos_t < -1:
        out_q["theta"] = _q(None, "°", CONTACT_MODEL, reason=f"cosθ = {cos_t:.3f} < −1，式 8.23 的輸入（書的分量與估計值）無法給出物理上成立的角度，不給 θ")
    else:
        out_q["theta"] = _q(math.degrees(math.acos(cos_t)), "°", CONTACT_MODEL)
    out_q["adhesionTension"] = _q(adhesion, GAMMA_UNIT, YOUNG_MODEL + "；式 8.6：γLV·cosθ ≈ γS − γSL（πeq ≈ 0）")
    out_q["spreadingCoefficient"] = _q(s_coef, GAMMA_UNIT, YOUNG_MODEL + "；S = γLV + γSL − γSV（書的定義，S 為負時完全潤濕）")
    if cos_t < -1:
        verdict = "不潤濕（cosθ < −1，式 8.23 無法給出角度）"
    else:
        verdict = verdict_of(s_coef, cos_t)
    if abs(adhesion / g_lv - cos_t) > 0.02:
        notes.append(
            f"式 8.23 的 cosθ（{cos_t:.3f}）與 Young 式（γS − γSL）/γLV（{adhesion / g_lv:.3f}）略有差異：式 8.23 只用分量，Young 式用書的 γS（γ ≠ γd + γp 時兩者不同）"
        )
    return {**result, "status": "ok", "quantities": out_q, "verdict": verdict}


def list_materials() -> dict[str, Any]:
    """下拉選單用：表中聚合物（Table 8.7 有分量；Table 8.8 只有 Van Oss 分量）與液體（Table 8.6）。"""
    pol = []
    liq = []
    for r in load_surface_energy():
        item = {"id": r.id, "name": r.name_en, "smiles": r.smiles, "table": r.table, "hasComponents": r.has_components}
        (pol if r.kind == "polymer" else liq).append(item)
    return {"polymers": pol, "liquids": liq}
