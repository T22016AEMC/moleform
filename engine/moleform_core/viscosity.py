"""黏度：溶劑與溫度依賴、聚合物溶液（任務 P8-2，PLAN 8.4、8.5）。直接寫在 Python（D62）。

出處：van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009)。
- 8.4 溶劑黏度：純溶劑黏度取自 solvents.csv（含溫度與來源）；溫度依賴用式 16.15a（Andrade）η = B·exp(Eη/RT)：使用者給兩個溫度的黏度，或 B 與 Eη；
  書只給「多數溶劑 Eη 在 7–14 kJ/mol」（書頁 608）這個範圍，**不當預設值**，只作範圍檢查（超出給 assumed 警示）；只有一個溫度的資料時不外推（missing）。
- **混合溶劑黏度：書中沒有混合規則**（第 8、9、15、16 章與索引逐章查證；8.2.2 節的 Grunberg–Nissan 式 8.3 是表面張力的內聚功 Wcoh，不是混合黏度式，不可挪用）
  → 回 missing，原因「書中無溶劑混合黏度式；待使用者指定出處」。
- 8.5 聚合物溶液：Θ 條件 [η]Θ = KΘ·M^½（式 9.34），KΘ 由式 9.42（J = KΘ^½·M − 4.2Z，書頁 253；任務卡寫成 KΘ·M^½ 與書不符，以書為準，並與 Table 9.4 的算值互證）與
  Table 9.3 基團 J 求得；Z 為每結構單元的主鏈原子數（沿用既有主鏈判定）。Mark–Houwink（式 9.32、9.33）K 與 a 一律由使用者輸入，**不內建任何 K、a**；
  Stockmayer–Fixman（式 9.38）B 由使用者輸入；濃溶液（式 16.21）K 由使用者輸入，沒有 K 時只輸出指數關係。書給特定系統的實驗圖（PVC–環己酮 Fig. 16.2）不當通用公式。
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from rdkit import Chem

from . import solvents as _sv
from . import tg as _tg
from . import vm as _vm
from .csv_reader import js_trim
from .mol_graph import mol_from_smiles, read_graph
from .tables import read_data_file
from .y_tables import _records, parse_book_number

J_GROUPS_FILE = "viscosity_j_groups.csv"
J_GROUPS_COLUMNS = ["id", "group", "smarts", "j", "source", "review_status", "positives", "negatives", "notes"]
ACRYLIC_ROW = "J18"
ESTER_ROW = "J17"

GAS_CONSTANT = 8.314462618  # J/(mol·K)（CODATA 2018，SI 定義值）
ANDRADE_MODEL = "Andrade 式 η = B·exp(Eη/RT)（van Krevelen & te Nijenhuis 4th ed. (2009)，式 16.15a，書頁 608；式 15.32 同形）"
THETA_MODEL = "Θ 條件極限黏度數：[η]Θ = KΘ·M^½（式 9.34）；KΘ 由 J = KΘ^½·M − 4.2Z（式 9.42）與 Table 9.3 基團貢獻求得（van Krevelen & te Nijenhuis 4th ed. (2009)，9.3.3 節，書頁 253）"
MH_MODEL = "Mark–Houwink 式 [η] = K·M^a（van Krevelen & te Nijenhuis 4th ed. (2009)，式 9.32、9.33，書頁 252）；K 與 a 由使用者輸入"
SF_MODEL = "Stockmayer–Fixman 式 [η] = KΘ·M^½ + B·M（式 9.38，書頁 252）；B 由使用者輸入"
CONC_MODEL = "濃溶液冪律式 η = K·c^a·M^b（式 16.21，書頁 607；書的算例 PVC–環己酮 a = 5.4、b = 3.4，書頁 608）；K 由使用者輸入"
MIXTURE_MISSING = "書中無溶劑混合黏度式；待使用者指定出處"
TREND_NOTE = "參考趨勢，非定量保證；書公式預估誤差見 MODELS.md"
VISCOSITY_DISCLAIMER = (
    "本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。"
)
ETA_UNIT = "mPa·s"
LVN_UNIT = "cm³/g"
KTHETA_UNIT = "cm³·mol^½/g^(3/2)"
E_LOW_KJ = 7.0  # 書頁 608：「for most solvents between 7 and 14 kJ/mol」
E_HIGH_KJ = 14.0
A_THETA = 0.5  # 式 9.34、9.36：Θ 條件 a = ½，剛棒 a = 2
A_ROD = 2.0
A_GOOD_SOLVENT_NOTE = "書頁 255：良溶劑中 a ≈ 0.8"
TEMPERATURE_MATCH_TOL_C = 0.01
THETA_NUMBER_NOTE = "Table 9.3 的括號值書標為不確定，可信度較低"


class ViscosityTableError(Exception):
    """Table 9.3 資料表格式錯誤（D22：不靜默略過）。"""

    def __init__(self, issues: list[str]):
        super().__init__("；".join(issues))
        self.issues = issues


@dataclass(frozen=True)
class JGroupRow:
    id: str
    name: str
    smarts: str
    j: float
    tentative: bool
    source: str
    positives: tuple[str, ...]
    negatives: tuple[str, ...]
    notes: str

    def usable(self) -> bool:
        return self.smarts != ""

    def to_yg_row(self) -> _tg.YgGroupRow:
        return _tg.YgGroupRow(
            id=self.id, name=self.name, smarts=self.smarts, ygi=self.j, mi=0.0, tentative=self.tentative, state="",
            section="Table 9.3", kind="單一基團", condition="", source=self.source, audit="pending",
            positives=self.positives, negatives=self.negatives, notes=self.notes,
        )  # fmt: skip


@lru_cache(maxsize=1)
def load_j_groups() -> tuple[JGroupRow, ...]:
    issues: list[str] = []
    rows: list[JGroupRow] = []
    for no, c in enumerate(_records(read_data_file(J_GROUPS_FILE), J_GROUPS_FILE, J_GROUPS_COLUMNS), start=2):
        id_, name, smarts, j, source, status, pos, neg, notes = c
        where = f"{J_GROUPS_FILE} 第 {no} 列"
        try:
            parsed = parse_book_number(j)
        except ValueError as e:
            issues.append(f"{where}：{e}")
            continue
        if parsed is None:
            issues.append(f"{where}：J 不可空白")
            continue
        if id_ == "" or name == "":
            issues.append(f"{where}：id、group 不可空白")
        if "Table 9.3" not in source or "頁" not in source:
            issues.append(f"{where}：出處需寫明書名、表號（Table 9.3）與書頁碼（D22）")
        if status != "pending":
            issues.append(f"{where}：review_status 必須是 pending")
        if smarts != "" and (js_trim(pos) == "" or js_trim(neg) == ""):
            issues.append(f"{where}：有 SMARTS 的列需要正例與反例（D22）")
        rows.append(
            JGroupRow(id_, name, smarts, parsed[0], parsed[1], source, _tg._split_list(pos), _tg._split_list(neg), notes)
        )  # fmt: skip
    ids = [r.id for r in rows]
    for dup in {i for i in ids if ids.count(i) > 1}:
        issues.append(f"{J_GROUPS_FILE}：id 重複：{dup}")
    if ACRYLIC_ROW not in ids or ESTER_ROW not in ids:
        issues.append(f"{J_GROUPS_FILE}：缺少 {ESTER_ROW} 或 {ACRYLIC_ROW}")
    if issues:
        raise ViscosityTableError(issues)
    return tuple(rows)


@lru_cache(maxsize=1)
def j_yg_rows() -> tuple[_tg.YgGroupRow, ...]:
    return tuple(r.to_yg_row() for r in load_j_groups() if r.usable())


def _q(value: float | None, unit: str, source: str, status: str = "predicted", **extra: Any) -> dict[str, Any]:
    if value is None:
        return {"value": None, "unit": unit, "source": source, "status": "missing", **extra}
    return {"value": value, "unit": unit, "source": source, "status": status, **extra}


def _positive(v: object, label: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not v > 0:
        raise ValueError(f"{label} 必須是大於 0 的有限數字")
    return float(v)


def _finite(v: object, label: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise ValueError(f"{label} 必須是有限數字")
    return float(v)


# ---------- 8.4 溶劑黏度與溫度依賴 ----------


def andrade_from_points(t1_c: float, eta1: float, t2_c: float, eta2: float) -> tuple[float, float]:
    """兩個溫度的黏度 → (Eη 單位 J/mol, B 單位同 η)。式 16.15a：ln η = ln B + Eη/(R·T)。"""
    t1, t2 = t1_c + 273.15, t2_c + 273.15
    if t1 == t2:
        raise ValueError("兩個溫度不可相同")
    e = GAS_CONSTANT * math.log(eta1 / eta2) / (1 / t1 - 1 / t2)
    b = eta1 / math.exp(e / (GAS_CONSTANT * t1))
    return e, b


def andrade_eta(b: float, e_j_mol: float, temperature_c: float) -> float:
    """式 16.15a：η = B·exp(Eη/(R·T))。"""
    return b * math.exp(e_j_mol / (GAS_CONSTANT * (temperature_c + 273.15)))


def _solvent_for(item: Mapping[str, Any]) -> _sv.Solvent | None:
    if isinstance(item.get("solventId"), str):
        s = _sv.get_solvent(item["solventId"])
        if s is None:
            raise ValueError(f"溶劑資料表沒有這個溶劑：{item['solventId']}")
        return s
    smiles = item.get("smiles")
    if isinstance(smiles, str) and js_trim(smiles) != "":
        if Chem.MolFromSmiles(smiles) is None:
            raise ValueError("RDKit 無法解析這個 SMILES")
        sid = _sv.solvent_id_for_smiles(smiles)
        return _sv.get_solvent(sid) if sid else None
    raise ValueError("每個溶劑需要 solventId 或 smiles")


def solvent_viscosity(item: Mapping[str, Any], temperature_c: float | None) -> dict[str, Any]:
    """單一溶劑的黏度與溫度依賴。item：{solventId | smiles, andrade?: {points?: [{temperatureC, viscosityMPas} ×2], B?, energyKjMol?}}。"""
    s = _solvent_for(item)
    label = s.name_en if s is not None else str(item.get("smiles") or "")
    row = None if s is None else s.pick("viscosity")
    out: dict[str, Any] = {
        "solventId": None if s is None else s.id, "name": label, "nameZh": None if s is None else s.name_zh, "smiles": None if s is None else s.smiles,
        "warnings": [],
    }  # fmt: skip
    if row is None:
        out["tableValue"] = _q(None, ETA_UNIT, "溶劑資料表", reason="溶劑資料表沒有這個溶劑的黏度（找不到可引用且標明溫度的值，維持 missing）" if s is not None else "這個結構不在溶劑資料表內")
    else:
        out["tableValue"] = _q(
            row.value, row.unit, f"{row.source}；{row.source_detail}", "literature", temperatureC=row.temperature_c, sourceOriginal=row.source_original, notes=row.notes
        )  # fmt: skip

    # ---- Andrade 參數（使用者輸入）----
    andrade = item.get("andrade")
    e_j: float | None = None
    b_val: float | None = None
    andrade_out: dict[str, Any] | None = None
    if andrade is not None:
        if not isinstance(andrade, Mapping):
            raise ValueError("andrade 必須是 JSON 物件")
        points = andrade.get("points")
        if points is not None:
            if not isinstance(points, list) or len(points) != 2 or not all(isinstance(p, Mapping) for p in points):
                raise ValueError("andrade.points 必須是兩個 {temperatureC, viscosityMPas} 的陣列")
            t1, t2 = _finite(points[0].get("temperatureC"), "temperatureC"), _finite(points[1].get("temperatureC"), "temperatureC")
            e1, e2 = _positive(points[0].get("viscosityMPas"), "viscosityMPas"), _positive(points[1].get("viscosityMPas"), "viscosityMPas")
            e_j, b_val = andrade_from_points(t1, e1, t2, e2)
            andrade_out = {"basis": "使用者輸入的兩個溫度的黏度", "points": [{"temperatureC": t1, "viscosityMPas": e1}, {"temperatureC": t2, "viscosityMPas": e2}]}
        elif andrade.get("B") is not None or andrade.get("energyKjMol") is not None:
            b_val = _positive(andrade.get("B"), "andrade.B")
            e_j = _finite(andrade.get("energyKjMol"), "andrade.energyKjMol") * 1000.0
            andrade_out = {"basis": "使用者輸入的 B 與 Eη"}
        else:
            raise ValueError("andrade 需要 points（兩個溫度的黏度）或 B 與 energyKjMol")
    if andrade_out is not None and e_j is not None and b_val is not None:
        e_kj = e_j / 1000.0
        in_range = E_LOW_KJ <= e_kj <= E_HIGH_KJ
        andrade_out["energyKjMol"] = _q(e_kj, "kJ/mol", ANDRADE_MODEL, "fitted" if andrade_out["basis"].startswith("使用者輸入的兩個") else "assumed")
        andrade_out["B"] = _q(b_val, ETA_UNIT, ANDRADE_MODEL, "fitted" if andrade_out["basis"].startswith("使用者輸入的兩個") else "assumed")
        andrade_out["inBookRange"] = in_range
        if not in_range:
            out["warnings"].append(
                f"Eη = {e_kj:.2f} kJ/mol 不在書頁 608 所述「多數溶劑 7–14 kJ/mol」的範圍內（僅為範圍提示，不是預設值）；請確認輸入的黏度與溫度"
            )
    out["andrade"] = andrade_out

    # ---- 指定溫度的黏度 ----
    unit_src = ANDRADE_MODEL
    if temperature_c is None:
        if row is not None:
            out["atTemperature"] = _q(row.value, row.unit, "溶劑資料表（資料表的溫度）", "literature", temperatureC=row.temperature_c)
        else:
            out["atTemperature"] = _q(None, ETA_UNIT, unit_src, reason="沒有指定溫度，且溶劑資料表沒有黏度")
        return out
    if row is not None and row.temperature_c is not None and abs(row.temperature_c - temperature_c) <= TEMPERATURE_MATCH_TOL_C:
        out["atTemperature"] = _q(row.value, row.unit, f"{row.source}；{row.source_detail}", "literature", temperatureC=row.temperature_c)
        return out
    if e_j is not None and b_val is not None:
        eta = andrade_eta(b_val, e_j, temperature_c)
        status = "predicted" if E_LOW_KJ <= e_j / 1000.0 <= E_HIGH_KJ else "assumed"
        out["atTemperature"] = _q(eta, ETA_UNIT, unit_src, status, temperatureC=temperature_c)
        if status == "assumed":
            out["atTemperature"]["note"] = "Eη 超出書所述 7–14 kJ/mol，標為 assumed"
        return out
    if row is not None:
        why = (
            f"溶劑資料表只有一個溫度（{row.temperature_c:g} °C）的黏度，不外推；式 16.15a 需要使用者提供兩個溫度的黏度，或 B 與 Eη"
            if row.temperature_c is not None
            else "溶劑資料表的黏度沒有標溫度，不外推"
        )
    else:
        why = "溶劑資料表沒有黏度，且沒有輸入兩個溫度的黏度或 B 與 Eη"
    out["atTemperature"] = _q(None, ETA_UNIT, unit_src, reason=why, temperatureC=temperature_c)
    return out


# ---------- 8.5 聚合物溶液 ----------


def _neighbors_periodic(g: Any, i: int, partner: Mapping[int, int]) -> list[int]:
    out: list[int] = []
    for nb in g.neighbors[i]:
        if g.z[nb] == 0:
            p = partner.get(nb)
            if p is not None:
                out.append(p)
        else:
            out.append(nb)
    return out


def compute_theta(smiles: str, molar_mass: float | None = None) -> dict[str, Any]:
    """Θ 條件：ΣJ、Z、KΘ（式 9.42 反解）與 [η]Θ（式 9.34，需 M）。status：ok／missing／invalid。"""
    text = js_trim(smiles)
    if text == "":
        return {"status": "invalid", "smiles": smiles, "message": "沒有結構（SMILES 是空的）"}
    try:
        mol = mol_from_smiles(text)
    except Exception:  # noqa: BLE001
        mol = None
    if mol is None:
        return {"status": "invalid", "smiles": smiles, "message": "RDKit 無法解析這個 SMILES"}
    if mol.GetNumAtoms() == 0:
        return {"status": "invalid", "smiles": smiles, "message": "分子沒有任何原子"}
    g = read_graph(mol)
    dummies = [i for i, z in enumerate(g.z) if z == 0]
    absent = {"kTheta": _q(None, KTHETA_UNIT, THETA_MODEL), "etaTheta": _q(None, LVN_UNIT, THETA_MODEL)}
    base: dict[str, Any] = {"smiles": text, "model": THETA_MODEL, "confidence": "參考趨勢", "trend": TREND_NOTE}
    if len(dummies) != 2:
        return {**base, "status": "missing", "quantities": absent, "groups": [], "missing": [], "reasons": {"kTheta": "需要含兩個連接點（*）的重複單元：Z 是每結構單元的主鏈原子數"}}
    res = _tg.compute_tg_book(text, j_yg_rows())
    if res["status"] == "invalid":
        return {"status": "invalid", "smiles": smiles, "message": res.get("message", "無法解析")}
    if res["status"] != "ok":
        miss = list(res.get("missing", []))
        return {
            **base, "status": "missing", "quantities": absent, "groups": [], "missing": miss,
            "reasons": {"kTheta": f"Table 9.3 沒有涵蓋的基團（{len(miss)} 個原子）：" + "；".join(m["description"] for m in miss[:6])},
        }  # fmt: skip
    mass = _vm.unit_mass_of(g)
    main_chain = _tg.main_chain_atoms(g, dummies)
    if mass is None or main_chain is None:
        return {**base, "status": "missing", "quantities": absent, "groups": [], "missing": [], "reasons": {"kTheta": "分子量或主鏈無法判定（原子量表沒有的元素、兩個連接點之間沒有路徑）"}}
    z_count = len(main_chain)
    partner = {dummies[0]: next(x for x in g.neighbors[dummies[1]] if g.z[x] != 0), dummies[1]: next(x for x in g.neighbors[dummies[0]] if g.z[x] != 0)}
    rows = {r.id: r for r in load_j_groups()}
    groups: list[dict[str, Any]] = []
    total = 0.0
    tentative: list[str] = []
    notes: list[str] = []
    for h in res["groups"]:
        row = rows[h["rowId"]]
        used = row
        context = None
        if row.id == ESTER_ROW:
            carbonyl = next(a for a in h["atoms"] if g.z[a] == 6)
            c_nb = [x for x in _neighbors_periodic(g, carbonyl, partner) if g.z[x] == 6]
            if carbonyl not in main_chain and any(x in main_chain for x in c_nb):
                used = rows[ACRYLIC_ROW]
                context = "側鏈酯，羰基碳接在主鏈上（acrylic）"
        total = total + used.j
        if used.tentative:
            tentative.append(used.name)
        groups.append({
            "rowId": used.id, "name": used.name, "j": used.j, "tentative": used.tentative, "atoms": h["atoms"], "source": used.source,
            "context": context,
        })  # fmt: skip
    if tentative:
        notes.append(f"含書中以括號標示的 Ji（{THETA_NUMBER_NOTE}）：{'、'.join(dict.fromkeys(tentative))}")
    if any(gr["rowId"] == ACRYLIC_ROW for gr in groups) or any(gr["rowId"] == ESTER_ROW for gr in groups):
        notes.append("書沒有定義 –COO–（acrylic）；程式的判定規則見 viscosity_j_groups.csv 的 J18（解讀，待使用者審）")
    k_theta = ((total + 4.2 * z_count) / mass) ** 2
    q: dict[str, Any] = {"kTheta": _q(k_theta, KTHETA_UNIT, THETA_MODEL, "predicted" if not tentative else "predicted", **({"note": "書中以括號標示，可信度較低"} if tentative else {}))}
    if molar_mass is None:
        q["etaTheta"] = _q(None, LVN_UNIT, THETA_MODEL, reason="沒有分子量 M")
    else:
        eta = k_theta * math.sqrt(molar_mass)
        q["etaTheta"] = _q(eta, LVN_UNIT, THETA_MODEL, "predicted", valueDlPerG=eta / 100.0, molarMass=molar_mass,
                           **({"note": "書中以括號標示，可信度較低"} if tentative else {}))  # fmt: skip
    return {
        **base, "status": "ok", "quantities": q, "groups": groups, "missing": [], "sumJ": total, "z": z_count, "unitMass": mass,
        "notes": notes, "reasons": {} if molar_mass is not None else {"etaTheta": "沒有分子量 M"},
    }  # fmt: skip


def mark_houwink(request: Mapping[str, Any] | None, molar_mass: float | None) -> dict[str, Any]:
    """式 9.32、9.33：[η] = K·M^a。K 與 a 一律由使用者輸入，附來源（必填）、溫度、溶劑；缺任一 → missing。**不內建任何 K、a**。"""
    out: dict[str, Any] = {"model": MH_MODEL, "warnings": []}
    why = None
    if not isinstance(request, Mapping):
        why = "沒有輸入 K 與 a；本引擎不內建任何 Mark–Houwink 的 K、a（書 9.3 節沒有給 K、a 表），請由使用者輸入並附來源、溫度、溶劑"
    elif request.get("K") is None or request.get("a") is None:
        why = "K 與 a 兩者都要由使用者輸入（本引擎不內建）"
    elif not isinstance(request.get("source"), str) or js_trim(request["source"]) == "":
        why = "K 與 a 需附來源（文獻、書名或論文、表號與頁碼）"
    elif molar_mass is None:
        why = "沒有分子量 M（Mv）"
    if why is not None:
        out["quantity"] = _q(None, LVN_UNIT, MH_MODEL, reason=why)
        out["status"] = "missing"
        return out
    assert isinstance(request, Mapping) and molar_mass is not None
    k = _positive(request["K"], "K")
    a = _positive(request["a"], "a")
    eta = k * molar_mass**a
    extra: dict[str, Any] = {
        "K": k, "a": a, "molarMass": molar_mass, "kaSource": request["source"], "temperatureC": request.get("temperatureC"), "solvent": request.get("solvent"),
        "valueDlPerG": eta / 100.0,
    }  # fmt: skip
    if request.get("temperatureC") is None:
        out["warnings"].append("沒有附溫度：K、a 依溫度與溶劑而定")
    if not isinstance(request.get("solvent"), str) or js_trim(str(request.get("solvent"))) == "":
        out["warnings"].append("沒有附溶劑：K、a 依溶劑而定")
    if a < A_THETA or a > A_ROD:
        out["warnings"].append(
            f"a = {a:g} 不在書所述的範圍（Θ 條件 a = ½，式 9.34；剛棒 a = 2，式 9.36）；{A_GOOD_SOLVENT_NOTE}；請確認輸入"
        )
    out["quantity"] = _q(eta, LVN_UNIT, MH_MODEL, "predicted", **extra)
    out["status"] = "ok"
    out["molarMassNote"] = "式 9.33 的 M 是黏度平均分子量 Mv（介於 Mn 與 Mw 之間）；這裡以輸入的分子量代入"
    return out


def stockmayer_fixman(k_theta: float | None, b: object, molar_mass: float | None) -> dict[str, Any]:
    """式 9.38：[η] = KΘ·M^½ + B·M。使用者給 B 時才算（KΘ 取 Table 9.3 的算值）。"""
    out: dict[str, Any] = {"model": SF_MODEL}
    why = None
    if b is None:
        why = "沒有輸入 B（使用者輸入的溶劑—聚合物交互作用參數）"
    elif k_theta is None:
        why = "KΘ 算不出（Table 9.3 缺基團）"
    elif molar_mass is None:
        why = "沒有分子量 M"
    if why is not None:
        out["quantity"] = _q(None, LVN_UNIT, SF_MODEL, reason=why)
        out["status"] = "missing"
        return out
    assert k_theta is not None and molar_mass is not None
    bv = _finite(b, "B")
    eta = k_theta * math.sqrt(molar_mass) + bv * molar_mass
    out["quantity"] = _q(eta, LVN_UNIT, SF_MODEL, "predicted", B=bv, molarMass=molar_mass)
    out["status"] = "ok"
    return out


def concentrated(request: Mapping[str, Any] | None, molar_mass: float | None) -> dict[str, Any]:
    """式 16.21：η = K·c^a·M^b（書的算例 a = 5.4、b = 3.4；a 在文獻中 4.0–5.6、b 接近 3.4）。K 由使用者輸入；沒有 K 只輸出指數關係，不給黏度值。"""
    relation = "η = K·c^a·M^b；書的算例 a = 5.4、b = 3.4（取自 PVC–環己酮的實驗圖，書頁 607–608，不是通用公式）；a 在文獻中 4.0–5.6，b 接近熔體的 3.4（書頁 607）"
    out: dict[str, Any] = {"model": CONC_MODEL, "relation": relation, "warnings": []}
    why = None
    if not isinstance(request, Mapping) or request.get("K") is None:
        why = "沒有輸入 K（依體系而定的經驗常數，書沒有給通用值）；只輸出指數關係，不給黏度值"
    elif request.get("concentration") is None:
        why = "沒有濃度 c（單位由 K 決定，書未規定）"
    elif molar_mass is None and request.get("molarMass") is None:
        why = "沒有分子量 M"
    if why is not None:
        out["quantity"] = _q(None, "依 K 的單位", CONC_MODEL, reason=why)
        out["status"] = "missing"
        return out
    assert isinstance(request, Mapping)
    k = _positive(request["K"], "K")
    c = _positive(request["concentration"], "concentration")
    m = _positive(request["molarMass"], "molarMass") if request.get("molarMass") is not None else float(molar_mass)  # type: ignore[arg-type]
    a = _positive(request["a"], "a") if request.get("a") is not None else 5.4
    b = _positive(request["b"], "b") if request.get("b") is not None else 3.4
    defaults = [n for n, v in (("a", request.get("a")), ("b", request.get("b"))) if v is None]
    if defaults:
        out["warnings"].append(f"{'、'.join(defaults)} 取書的算例值（5.4、3.4，PVC–環己酮），不是通用值")
    eta = k * c**a * m**b
    out["quantity"] = _q(
        eta, "依 K 的單位（書未規定 c 與 η 的單位）", CONC_MODEL, "assumed" if defaults else "predicted", K=k, concentration=c, molarMass=m, a=a, b=b,
        kSource=request.get("source"),
    )  # fmt: skip
    out["status"] = "ok"
    return out


# ---------- 端點邏輯 ----------


def compute_viscosity(request: Mapping[str, Any]) -> dict[str, Any]:
    """POST /viscosity 的計算。請求見 handler 說明。"""
    t = request.get("temperatureC")
    temperature_c = None if t is None else _finite(t, "temperatureC")
    out: dict[str, Any] = {"status": "ok", "trend": TREND_NOTE, "confidence": "參考趨勢"}
    solvents = request.get("solvents")
    if solvents is not None:
        if not isinstance(solvents, list) or len(solvents) > 20 or not all(isinstance(x, Mapping) for x in solvents):
            raise ValueError("solvents 必須是物件陣列（上限 20 項）")
        out["solvents"] = [solvent_viscosity(x, temperature_c) for x in solvents]
        if len(solvents) > 1:
            out["mixture"] = {
                "viscosity": _q(None, ETA_UNIT, "書中查證（第 8、9、15、16 章與索引）", reason=MIXTURE_MISSING),
                "reason": MIXTURE_MISSING,
                "note": "8.2.2 節的 Grunberg–Nissan 式 8.3 是表面張力的內聚功，不是混合黏度式，不可挪用",
            }  # fmt: skip
    pol = request.get("polymer")
    if pol is not None:
        if not isinstance(pol, Mapping) or not isinstance(pol.get("smiles"), str):
            raise ValueError("polymer 需要字串欄位 smiles（重複單元，含 *）")
        mm = pol.get("molarMass")
        molar_mass = None if mm is None else _positive(mm, "molarMass")
        theta = compute_theta(pol["smiles"], molar_mass)
        if theta["status"] == "invalid":
            raise ValueError(theta["message"])
        k_theta = theta["quantities"]["kTheta"]["value"]
        pout: dict[str, Any] = {"theta": theta}
        pout["markHouwink"] = mark_houwink(pol.get("markHouwink"), molar_mass)
        b_term = pol.get("B")
        pout["stockmayerFixman"] = stockmayer_fixman(k_theta, b_term, molar_mass)
        pout["concentrated"] = concentrated(pol.get("concentrated"), molar_mass)
        out["polymer"] = pout
    if solvents is None and pol is None:
        raise ValueError("請求需要 solvents 或 polymer")
    return out
