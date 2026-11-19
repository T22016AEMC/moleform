"""Hansen 溶解度參數（HSP）、混合溶劑、Ra／RED、Flory–Huggins χ 與溶解性判斷（任務 P8-1，PLAN 8.3；D62：新計算直接寫在 Python）。

出處（本機書與手冊，逐式看圖確認）：
- van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009)，第 7 章：
  - 式 7.22–7.24（Hoftyzer–Van Krevelen 基團貢獻，書頁 213–215）：δd = ΣFdi / V、δp = √(ΣFpi²) / V、δh = √(ΣEhi / V)；基團值 Table 7.10（書頁 215）。
    V 是摩爾體積（cm³/mol；書的 Example 7.3 用 123.8 cm³/mol 得 δd = 1960/123.8 = 15.8），Fdi、Fpi 單位 (MJ/m³)^½·cm³/mol，Ehi 單位 J/mol，δ 單位 (MJ/m³)^½ = MPa^½。
    書另有「對稱因子」（Table 7.10 末三列：一個對稱面 δp × 0.5、兩個 × 0.25、更多 × 0）；本模組**不套用**（需判斷分子的對稱面），結果附註。
  - 式 7.14：δ² = δd² + δp² + δh²（總 δ）。
  - 式 7.12（書頁 203）：χ ≈ 0.34 + (Vs / RT)(δP − δS)²；Vs 為溶劑莫耳體積。書頁 201：高分子量聚合物只有在 χ ≤ 0.5 時才可能溶解。
  - Table 7.8（書頁 207，引 Hansen 1971）：部分聚合物的 δd、δp、δH 與「交互作用直徑 2R」；R0（半徑）= 2R ÷ 2。
- Hansen, Hansen Solubility Parameters: A User's Handbook, 2nd ed. (2007)：
  - 式 1.9（書頁 7）：(Ra)² = 4(δD2 − δD1)² + (δP2 − δP1)² + (δH2 − δH1)²。
  - 式 1.10（書頁 8）：RED = Ra / R0；RED < 1 表示高親和，RED 等於或接近 1 是邊界，RED 越大親和越低。
  - 書頁 40：混合溶劑的 HSP 通常以「體積分率 × 各溶劑 HSP」加總。
  Hansen 的 Ra 有係數 4（式 1.9）；van Krevelen 書的式 7.25 沒有 4（書頁 219：Δδ 要小，例如小於 5）。因為 R0 取自 Hansen 1971（Table 7.8），
  本模組的 Ra 與 RED 用 Hansen 的式 1.9；式 7.25 的距離另外列為 `bookDistance`，只供對照。

所有輸出標示「參考趨勢，非定量保證；HSP 對聚合物分子量、結晶度、溫度未做修正」。缺值一律回報 missing 與原因，不猜；加總一律用明確迴圈。
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
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

HSP_GROUPS_FILE = "hsp_groups.csv"
HSP_GROUPS_COLUMNS = ["id", "基團名稱", "SMARTS", "Fdi", "Fpi", "Ehi", "表格區段", "出處", "稽核狀態", "正例 SMILES", "反例 SMILES", "備註"]
HSP_POLYMERS_FILE = "hsp_polymers.csv"
HSP_POLYMERS_COLUMNS = ["id", "聚合物", "重複單元 SMILES", "δ", "δd", "δp", "δH", "2R", "表格區段", "出處", "稽核狀態", "備註"]

HSP_MODEL = "Hoftyzer–Van Krevelen 基團貢獻（van Krevelen & te Nijenhuis 4th ed. (2009)，7.3.4.1 節式 7.22–7.24，Table 7.10）"
RA_MODEL = "Hansen 距離 Ra（Hansen, Hansen Solubility Parameters: A User's Handbook 2nd ed. (2007)，式 1.9）"
RED_MODEL = "RED = Ra / R0（Hansen 2007 式 1.10）；R0 = van Krevelen 2009 Table 7.8 的 2R ÷ 2"
MIX_MODEL = "混合溶劑 HSP：體積分率加權平均（Hansen 2007 書頁 40）；體積分率由質量與密度算出"
CHI_MODEL = "Flory–Huggins χ ≈ 0.34 + (Vs/RT)(δP − δS)²（van Krevelen 2009 式 7.12，書頁 203）；δ 為式 7.14 的總 δ"
HSP_DISCLAIMER = (
    "本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。"
)
TREND_NOTE = "參考趨勢，非定量保證；HSP 對聚合物分子量、結晶度、溫度未做修正"
SYMMETRY_NOTE = "未套用 Table 7.10 的對稱因子（δp × 0.5／0.25／0），對稱的分子其 δp、δh 實際可能較小"

HSP_UNIT = "MPa^0.5"
GAS_CONSTANT = 8.314462618  # J/(mol·K)（CODATA 2018，SI 定義值）
DEFAULT_TEMPERATURE_K = 298.15  # 25 °C：溶劑 HSP 的評估溫度（Hansen 2007 書頁 99）
CHI_ENTROPIC = 0.34  # 式 7.12 的常數（書：非極性系統慣用 0.34）
CHI_LIMIT = 0.5  # 書頁 201：高分子量聚合物只有 χ ≤ 0.5 才可能溶解
MAX_SOLVENTS = 20


class HspTableError(Exception):
    """HSP 資料表格式錯誤（D22：不靜默略過）。"""

    def __init__(self, issues: list[str]):
        super().__init__("；".join(issues))
        self.issues = issues


# ---------- 資料表 ----------


@dataclass(frozen=True)
class HspGroupRow:
    id: str
    name: str
    smarts: str
    fd: float | None
    fp: float | None
    eh: float | None
    tentative: bool
    source: str
    audit: str
    positives: tuple[str, ...]
    negatives: tuple[str, ...]
    notes: str

    def usable(self) -> bool:
        return self.smarts != ""

    def to_yg_row(self) -> _tg.YgGroupRow:
        """轉成切分程式使用的列（ygi 存 Fdi 供顯示用；實際加總在本模組；mi 不使用，存 0.0）。"""
        return _tg.YgGroupRow(
            id=self.id, name=self.name, smarts=self.smarts, ygi=0.0 if self.fd is None else self.fd, mi=0.0, tentative=self.tentative, state="",
            section="Table 7.10", kind="單一基團", condition="", source=self.source, audit=self.audit,
            positives=self.positives, negatives=self.negatives, notes=self.notes,
        )  # fmt: skip


@dataclass(frozen=True)
class HspPolymerRow:
    id: str
    name: str
    smiles: str
    delta: float
    delta_d: float
    delta_p: float
    delta_h: float
    two_r: float | None
    source: str
    audit: str
    notes: str

    @property
    def r0(self) -> float | None:
        return None if self.two_r is None else self.two_r / 2


@lru_cache(maxsize=1)
def load_hsp_groups() -> tuple[HspGroupRow, ...]:
    issues: list[str] = []
    rows: list[HspGroupRow] = []
    for no, c in enumerate(_records(read_data_file(HSP_GROUPS_FILE), HSP_GROUPS_FILE, HSP_GROUPS_COLUMNS), start=2):
        id_, name, smarts, fd, fp, eh, section, source, audit, pos, neg, notes = c
        try:
            vals = [parse_book_number(x) for x in (fd, fp, eh)]
        except ValueError as e:
            issues.append(f"{HSP_GROUPS_FILE} 第 {no} 列：{e}")
            continue
        if id_ == "" or name == "" or audit == "":
            issues.append(f"{HSP_GROUPS_FILE} 第 {no} 列：id、基團名稱、稽核狀態不可空白")
        if "Table 7.10" not in source or "頁" not in source:
            issues.append(f"{HSP_GROUPS_FILE} 第 {no} 列：出處需寫明書名、表號（Table 7.10）與書頁碼（D22）")
        if smarts != "" and (js_trim(pos) == "" or js_trim(neg) == ""):
            issues.append(f"{HSP_GROUPS_FILE} 第 {no} 列：有 SMARTS 的列需要正例與反例（D22）")
        tentative = any(v is not None and v[1] for v in vals)
        if tentative and "書中標為暫定" not in audit:
            issues.append(f"{HSP_GROUPS_FILE} 第 {no} 列：書中括號值，稽核狀態需註明「書中標為暫定」")
        if smarts != "" and any(v is None for v in vals) and "無值" not in audit:
            issues.append(f"{HSP_GROUPS_FILE} 第 {no} 列：書中沒有值（印「–」）的欄位，稽核狀態需註明「無值」")
        rows.append(
            HspGroupRow(
                id=id_, name=name, smarts=smarts, fd=None if vals[0] is None else vals[0][0], fp=None if vals[1] is None else vals[1][0],
                eh=None if vals[2] is None else vals[2][0], tentative=tentative, source=source, audit=audit,
                positives=_tg._split_list(pos), negatives=_tg._split_list(neg), notes=notes,
            )
        )  # fmt: skip
    ids = [r.id for r in rows]
    for dup in {i for i in ids if ids.count(i) > 1}:
        issues.append(f"{HSP_GROUPS_FILE}：id 重複：{dup}")
    if issues:
        raise HspTableError(issues)
    return tuple(rows)


@lru_cache(maxsize=1)
def hsp_yg_rows() -> tuple[_tg.YgGroupRow, ...]:
    return tuple(r.to_yg_row() for r in load_hsp_groups() if r.usable())


def _unmapped_canonical(smiles: str) -> str | None:
    """重複單元的 canonical SMILES，去掉連接點編號（`[*:1]` → `*`），讓寫法不同的同一單元得到同一個字串。"""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    for a in mol.GetAtoms():
        a.SetAtomMapNum(0)
    return Chem.MolToSmiles(mol)


@lru_cache(maxsize=1)
def load_hsp_polymers() -> tuple[HspPolymerRow, ...]:
    issues: list[str] = []
    rows: list[HspPolymerRow] = []
    for no, c in enumerate(_records(read_data_file(HSP_POLYMERS_FILE), HSP_POLYMERS_FILE, HSP_POLYMERS_COLUMNS), start=2):
        id_, name, smiles, d, dd, dp, dh, two_r, section, source, audit, notes = c
        try:
            nums = [parse_book_number(x) for x in (d, dd, dp, dh)]
            tr = parse_book_number(two_r)
        except ValueError as e:
            issues.append(f"{HSP_POLYMERS_FILE} 第 {no} 列：{e}")
            continue
        if any(v is None for v in nums):
            issues.append(f"{HSP_POLYMERS_FILE} 第 {no} 列：δ、δd、δp、δH 不可空白")
            continue
        if "Table 7.8" not in source or "頁" not in source:
            issues.append(f"{HSP_POLYMERS_FILE} 第 {no} 列：出處需寫明書名、表號（Table 7.8）與書頁碼（D22）")
        if _unmapped_canonical(smiles) is None or smiles.count("*") != 2:
            issues.append(f"{HSP_POLYMERS_FILE} 第 {no} 列：重複單元 SMILES 需能解析且恰好兩個連接點")
        if tr is None and "沒有 R0" not in notes:
            issues.append(f"{HSP_POLYMERS_FILE} 第 {no} 列：2R 空白時備註需註明「沒有 R0」")
        rows.append(
            HspPolymerRow(
                id=id_, name=name, smiles=smiles, delta=nums[0][0], delta_d=nums[1][0], delta_p=nums[2][0], delta_h=nums[3][0],  # type: ignore[index]
                two_r=None if tr is None else tr[0], source=source, audit=audit, notes=notes,
            )
        )  # fmt: skip
    if issues:
        raise HspTableError(issues)
    return tuple(rows)


def polymer_row_for(smiles: str) -> HspPolymerRow | None:
    """重複單元與 Table 7.8 的某個聚合物相同（忽略連接點編號與寫法）就回傳該列。"""
    key = _unmapped_canonical(smiles)
    if key is None:
        return None
    for r in load_hsp_polymers():
        if _unmapped_canonical(r.smiles) == key:
            return r
    return None


# ---------- 基本運算 ----------


def _q(value: float | None, unit: str, source: str, status: str = "predicted") -> dict[str, Any]:
    if value is None:
        return {"value": None, "unit": unit, "source": source, "status": "missing"}
    return {"value": value, "unit": unit, "source": source, "status": status}


def total_delta(d: float, p: float, h: float) -> float:
    """式 7.14：δ² = δd² + δp² + δh²。"""
    return math.sqrt(d * d + p * p + h * h)


def hansen_ra(d1: float, p1: float, h1: float, d2: float, p2: float, h2: float) -> float:
    """Hansen 式 1.9：Ra² = 4(δD2−δD1)² + (δP2−δP1)² + (δH2−δH1)²。"""
    return math.sqrt(4 * (d2 - d1) ** 2 + (p2 - p1) ** 2 + (h2 - h1) ** 2)


def book_distance(d1: float, p1: float, h1: float, d2: float, p2: float, h2: float) -> float:
    """van Krevelen 式 7.25：Δδ = [(δd,P−δd,S)² + (δp,P−δp,S)² + (δh,P−δh,S)²]^½（沒有係數 4）。"""
    return math.sqrt((d2 - d1) ** 2 + (p2 - p1) ** 2 + (h2 - h1) ** 2)


def flory_huggins_chi(vs: float, delta_p: float, delta_s: float, temperature_k: float = DEFAULT_TEMPERATURE_K) -> float:
    """式 7.12：χ ≈ 0.34 + Vs(δP − δS)²/(RT)。Vs 為 cm³/mol、δ 為 MPa^0.5，Vs·δ² 的單位正好是 J/mol。"""
    return CHI_ENTROPIC + vs * (delta_p - delta_s) ** 2 / (GAS_CONSTANT * temperature_k)


# ---------- 基團貢獻（式 7.22–7.24） ----------


def _invalid(smiles: str, message: str) -> dict[str, Any]:
    return {"status": "invalid", "smiles": smiles, "message": message}


def _volume(smiles: str, mass: float | None, polymer: bool, volume: float | None, density: float | None) -> tuple[dict[str, Any] | None, str | None]:
    """V（cm³/mol）：輸入摩爾體積 > 輸入密度（V = M/ρ）> 聚合物的 Vm 模組（Table 4.10，非晶）> 溶劑資料表（小分子）。回傳 (volume, 缺的原因)。"""
    if volume is not None:
        return {"value": volume, "unit": "cm³/mol", "basis": "輸入摩爾體積"}, None
    if mass is None or mass <= 0:
        return None, "分子量無法計算（原子量表沒有的元素）"
    if density is not None:
        return {"value": mass / density, "unit": "cm³/mol", "basis": "輸入密度（V = M/ρ）", "density": density}, None
    if polymer:
        vm = _vm.compute_molar_volume_density(smiles)
        if vm["status"] == "ok":
            amorphous = vm["glassy"]
            return {"value": amorphous["vm"], "unit": "cm³/mol", "basis": "Vm 模組（Table 4.10，非晶）", "density": amorphous["density"]}, None
        n = len(vm.get("missing", []))
        return None, f"沒有摩爾體積：Vm 模組缺 {n} 個基團的莫耳體積增量（可輸入密度 density 或摩爾體積 volume）"
    sid = _sv.solvent_id_for_smiles(smiles)
    if sid is not None:
        s = _sv.get_solvent(sid)
        mv = None if s is None else s.pick("molar_volume")
        if mv is not None:
            return {"value": mv.value, "unit": "cm³/mol", "basis": f"溶劑資料表（{sid}，{mv.temperature_c} °C，由分子量與密度計算）"}, None
    return None, "小分子需要摩爾體積：請輸入 volume（cm³/mol）或 density（g/cm³）"


def compute_hsp(smiles: str, volume: float | None = None, density: float | None = None) -> dict[str, Any]:
    """Hoftyzer–Van Krevelen 基團貢獻的 δd、δp、δh 與總 δ。

    status：ok（δd 至少算得出）／missing（切分有缺基團或沒有 V，全部算不出）／invalid。
    三個分量各自判斷：某個基團在書中沒有 Fpi（或 Ehi）時，只有 δp（或 δh）回報 missing，並列出是哪些基團；總 δ 需要三個分量都有。
    """
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
    absent = {k: _q(None, HSP_UNIT, HSP_MODEL) for k in ("deltaD", "deltaP", "deltaH", "delta")}

    res = _tg.compute_tg_book(smiles, hsp_yg_rows())
    base: dict[str, Any] = {"smiles": smiles, "polymer": polymer, "model": HSP_MODEL, "confidence": "理論估算", "trend": TREND_NOTE}
    if res["status"] != "ok":
        miss = list(res.get("missing", []))
        return {
            **base, "status": "missing", "quantities": absent, "groups": [], "missing": miss, "volume": None,
            "reasons": {k: f"Table 7.10 沒有涵蓋的基團（{len(miss)} 個原子）" for k in absent},
        }  # fmt: skip

    rows_by_id = {r.id: r for r in load_hsp_groups()}
    groups = []
    for x in res["groups"]:
        r = rows_by_id[x["rowId"]]
        groups.append({"rowId": r.id, "name": r.name, "fd": r.fd, "fp": r.fp, "eh": r.eh, "tentative": r.tentative, "atoms": x["atoms"], "source": x["source"]})
    vol, vol_reason = _volume(smiles, mass, polymer, volume, density)
    if vol is None:
        return {
            **base, "status": "missing", "quantities": absent, "groups": groups, "missing": [], "volume": None,
            "reasons": {k: vol_reason or "V 無法取得" for k in absent},
        }  # fmt: skip
    v = vol["value"]

    def lacking(field: str) -> list[str]:
        names: list[str] = []
        for gr in groups:
            if gr[field] is None and gr["name"] not in names:
                names.append(gr["name"])
        return names

    reasons: dict[str, str] = {}
    values: dict[str, float | None] = {"deltaD": None, "deltaP": None, "deltaH": None}
    sum_fd = 0.0
    sum_fp2 = 0.0
    sum_eh = 0.0
    sum_fp = 0.0
    for gr in groups:
        if gr["fd"] is not None:
            sum_fd = sum_fd + gr["fd"]
        if gr["fp"] is not None:
            sum_fp2 = sum_fp2 + gr["fp"] * gr["fp"]
            sum_fp = sum_fp + gr["fp"]
        if gr["eh"] is not None:
            sum_eh = sum_eh + gr["eh"]
    for field, key, label in (("fd", "deltaD", "Fdi"), ("fp", "deltaP", "Fpi"), ("eh", "deltaH", "Ehi")):
        lack = lacking(field)
        if lack:
            reasons[key] = f"Table 7.10 沒有這些基團的 {label}（印「–」）：{'、'.join(lack)}"
    if "deltaD" not in reasons:
        values["deltaD"] = sum_fd / v
    if "deltaP" not in reasons:
        values["deltaP"] = math.sqrt(sum_fp2) / v
    if "deltaH" not in reasons:
        values["deltaH"] = math.sqrt(sum_eh / v)
    total = None
    if all(values[k] is not None for k in values):
        total = total_delta(values["deltaD"], values["deltaP"], values["deltaH"])  # type: ignore[arg-type]
    else:
        reasons["delta"] = "總 δ 需要 δd、δp、δh 三個分量都算得出"
    warnings: list[str] = []
    if sum_fp > 0:
        warnings.append(SYMMETRY_NOTE)
    if any(gr["tentative"] for gr in groups):
        warnings.append("含書中括號值（暫定）的基團")
    if polymer and volume is None and density is None:
        warnings.append("V 取自 Vm 模組（Table 4.10 非晶莫耳體積，基團加成估算）")
    q = {
        "deltaD": _q(values["deltaD"], HSP_UNIT, HSP_MODEL),
        "deltaP": _q(values["deltaP"], HSP_UNIT, HSP_MODEL),
        "deltaH": _q(values["deltaH"], HSP_UNIT, HSP_MODEL),
        "delta": _q(total, HSP_UNIT, HSP_MODEL + "；總 δ 為式 7.14"),
    }
    return {
        **base, "status": "ok" if values["deltaD"] is not None else "missing", "quantities": q, "groups": groups, "missing": [], "volume": vol,
        "reasons": reasons, "warnings": warnings, "sums": {"sumFd": sum_fd, "sumFp2": sum_fp2, "sumEh": sum_eh},
    }  # fmt: skip


def solvent_hsp(solvent_id: str) -> dict[str, Any]:
    """溶劑資料表的 HSP（Hansen 2007 Table A.1，25 °C；不是基團貢獻估算）。"""
    s = _sv.get_solvent(solvent_id)
    if s is None:
        return {"status": "invalid", "message": f"溶劑資料表沒有這個溶劑：{solvent_id}"}
    out: dict[str, Any] = {"status": "ok", "solventId": s.id, "nameEn": s.name_en, "nameZh": s.name_zh, "smiles": s.smiles, "quantities": {}, "reasons": {}}
    for key, prop in (("deltaD", "hsp_d"), ("deltaP", "hsp_p"), ("deltaH", "hsp_h")):
        v = s.pick(prop)
        if v is None:
            out["quantities"][key] = _q(None, HSP_UNIT, "溶劑資料表")
            out["reasons"][key] = "溶劑資料表沒有這個值"
            out["status"] = "missing"
        else:
            out["quantities"][key] = _q(v.value, v.unit, f"{v.source}；{v.source_detail}")
    dd, dp, dh = (out["quantities"][k]["value"] for k in ("deltaD", "deltaP", "deltaH"))
    out["quantities"]["delta"] = _q(None if None in (dd, dp, dh) else total_delta(dd, dp, dh), HSP_UNIT, "式 7.14：δ² = δd² + δp² + δh²")
    return out


# ---------- 混合溶劑 ----------


def _positive(v: object, label: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not v > 0:
        raise ValueError(f"{label} 必須是大於 0 的有限數字")
    return float(v)


def mix_solvents(items: object, basis: str = "mass") -> dict[str, Any]:
    """混合溶劑的 HSP 與莫耳體積。items：[{solventId 或 smiles, amount, userDensity?, userDensitySource?, name?}]。

    basis "mass"：amount 是質量（或質量分率，只看比例），體積分率 φ_i = (m_i/ρ_i) / Σ(m_j/ρ_j)；密度取使用者輸入（優先）或溶劑資料表（最接近 25 °C），
    缺密度的溶劑讓整個混合回報 missing 並指出是哪一個。basis "volume"：amount 是體積（或體積分率）。
    混合 HSP = Σφ_i·δ_i（Hansen 2007 書頁 40）；混合莫耳體積 Vs = 1 / Σ(φ_i / V_i)（V_i = M_i/ρ_i，體積加成，用於 χ）。
    """
    if basis not in ("mass", "volume"):
        raise ValueError("basis 必須是 mass 或 volume")
    if not isinstance(items, Sequence) or isinstance(items, (str, bytes)) or len(items) == 0:
        raise ValueError("solvents 必須是至少一項的陣列")
    if len(items) > MAX_SOLVENTS:
        raise ValueError(f"solvents 太多（上限 {MAX_SOLVENTS}）")
    comps: list[dict[str, Any]] = []
    problems: list[str] = []
    for i, it in enumerate(items):
        if not isinstance(it, Mapping):
            raise ValueError(f"第 {i + 1} 個溶劑必須是物件")
        amount = _positive(it.get("amount"), f"第 {i + 1} 個溶劑的 amount")
        sid = it.get("solventId")
        if sid is None and isinstance(it.get("smiles"), str):
            sid = _sv.solvent_id_for_smiles(it["smiles"])
        label = str(it.get("name") or sid or f"第 {i + 1} 個溶劑")
        s = _sv.get_solvent(sid) if isinstance(sid, str) else None
        comp: dict[str, Any] = {"label": label, "solventId": None if s is None else s.id, "amount": amount}
        if s is None:
            problems.append(f"「{label}」不在溶劑資料表（需要資料表內的溶劑才有 HSP；HSP 不接受使用者輸入的實測值，D02）")
            comps.append(comp)
            continue
        hsp = [s.pick(p) for p in ("hsp_d", "hsp_p", "hsp_h")]
        if any(h is None for h in hsp):
            problems.append(f"「{label}」的溶劑資料表沒有完整的 HSP")
        else:
            comp["hsp"] = {"deltaD": hsp[0].value, "deltaP": hsp[1].value, "deltaH": hsp[2].value, "temperatureC": hsp[0].temperature_c}  # type: ignore[union-attr]
        mw = s.pick("molecular_weight")
        comp["molecularWeight"] = None if mw is None else mw.value
        user = it.get("userDensity")
        if user is not None:
            comp["density"] = {"value": _positive(user, f"「{label}」的 userDensity"), "unit": "g/cm³", "source": str(it.get("userDensitySource") or "使用者輸入"), "temperatureC": None, "basis": "user"}
        else:
            dv = s.pick("density")
            if dv is not None:
                comp["density"] = {"value": dv.value, "unit": dv.unit, "source": f"溶劑資料表：{dv.source}", "temperatureC": dv.temperature_c, "basis": "table"}
        comps.append(comp)

    need_density = True  # 莫耳體積 Vs 一律需要密度；質量基準的體積分率也需要
    for c in comps:
        if need_density and "density" not in c and c["solventId"] is not None:
            problems.append(f"「{c['label']}」沒有密度（溶劑資料表留空且沒有輸入）")
    result: dict[str, Any] = {"status": "missing", "basis": basis, "components": comps, "problems": problems, "model": MIX_MODEL}
    if problems:
        result["reason"] = "；".join(problems)
        return result

    # 體積分率
    vols: list[float] = []
    for c in comps:
        vols.append(c["amount"] / c["density"]["value"] if basis == "mass" else c["amount"])
    total_v = 0.0
    for v in vols:
        total_v = total_v + v
    sum_d = 0.0
    sum_p = 0.0
    sum_h = 0.0
    inv_v = 0.0
    for c, v in zip(comps, vols):
        phi = v / total_v
        c["volumeFraction"] = phi
        sum_d = sum_d + phi * c["hsp"]["deltaD"]
        sum_p = sum_p + phi * c["hsp"]["deltaP"]
        sum_h = sum_h + phi * c["hsp"]["deltaH"]
        mw = c["molecularWeight"]
        if mw is None:
            result["reason"] = f"「{c['label']}」沒有分子量，無法算莫耳體積"
            return result
        c["molarVolume"] = mw / c["density"]["value"]
        inv_v = inv_v + phi / c["molarVolume"]
    result.update(
        {
            "status": "ok",
            "hsp": {"deltaD": sum_d, "deltaP": sum_p, "deltaH": sum_h, "delta": total_delta(sum_d, sum_p, sum_h)},
            "molarVolume": 1.0 / inv_v,
        }
    )
    return result


# ---------- 溶解性 ----------


def _joined_reasons(poly: Mapping[str, Any]) -> str:
    """聚合物 HSP 各分量缺值的原因（相同的原因只寫一次）。"""
    seen: list[str] = []
    for v in poly["reasons"].values():
        if v not in seen:
            seen.append(v)
    return "；".join(seen)


def judge(red: float | None, chi: float | None, red_reason: str | None, chi_reason: str | None) -> dict[str, Any]:
    """RED 與 χ 的定性判斷（門檻照書：RED < 1，Hansen 2007 式 1.10 之後的說明；χ ≤ 0.5，van Krevelen 2009 書頁 201）。"""
    parts: list[dict[str, Any]] = []
    flags: list[bool] = []
    if red is not None:
        ok = red < 1.0
        flags.append(ok)
        parts.append({"basis": "RED", "value": red, "text": "RED < 1：高親和，傾向溶解（Hansen 2007）" if ok else "RED ≥ 1：親和較低（等於 1 是邊界；越大越低），傾向不溶解（Hansen 2007）"})
    else:
        parts.append({"basis": "RED", "value": None, "text": f"RED 無法判斷：{red_reason}"})
    if chi is not None:
        ok = chi <= CHI_LIMIT
        flags.append(ok)
        parts.append({"basis": "χ", "value": chi, "text": "χ ≤ 0.5：高分子量聚合物有可能溶解（van Krevelen 2009 書頁 201；必要條件）" if ok else "χ > 0.5：高分子量聚合物不易溶解（van Krevelen 2009 書頁 201）"})
    else:
        parts.append({"basis": "χ", "value": None, "text": f"χ 無法判斷：{chi_reason}"})
    if not flags:
        overall = "無法判斷"
    elif all(flags):
        overall = "傾向溶解"
    elif not any(flags):
        overall = "傾向不溶解"
    else:
        overall = "RED 與 χ 的結論不一致，無法判斷"
    return {"overall": overall, "parts": parts, "note": TREND_NOTE, "confidence": "參考趨勢"}


def compute_solubility(
    polymer_smiles: str,
    solvents: object,
    basis: str = "mass",
    temperature_k: float = DEFAULT_TEMPERATURE_K,
    polymer_volume: float | None = None,
    polymer_density: float | None = None,
) -> dict[str, Any]:
    """聚合物（重複單元 SMILES）與（混合）溶劑的 HSP、Ra、RED、χ 與溶解性判斷。"""
    if not (isinstance(temperature_k, (int, float)) and not isinstance(temperature_k, bool) and math.isfinite(temperature_k) and 100 <= temperature_k <= 700):
        raise ValueError("temperatureK 必須是 100 到 700 之間的數字（K）")
    poly = compute_hsp(polymer_smiles, polymer_volume, polymer_density)
    if poly["status"] == "invalid":
        return {"status": "invalid", "message": poly["message"]}
    mix = mix_solvents(solvents, basis)
    out: dict[str, Any] = {
        "status": "ok", "polymer": poly, "solvent": mix, "temperatureK": temperature_k,
        "models": {"hsp": HSP_MODEL, "mix": MIX_MODEL, "ra": RA_MODEL, "red": RED_MODEL, "chi": CHI_MODEL},
        "notes": [TREND_NOTE, "溶劑的 HSP 是 25 °C 的值，沒有做溫度修正"], "confidence": "參考趨勢", "disclaimer": HSP_DISCLAIMER,
    }  # fmt: skip
    pq = poly["quantities"]
    p_vals = [pq[k]["value"] for k in ("deltaD", "deltaP", "deltaH")]
    s_hsp = mix.get("hsp")
    reasons: dict[str, str] = {}

    # R0（只用書 Table 7.8）
    table_row = polymer_row_for(polymer_smiles)
    r0 = None if table_row is None else table_row.r0
    if table_row is None:
        r0_reason = "書 Table 7.8 沒有這個聚合物的 R0（本專案不自行訂 R0）"
    elif r0 is None:
        r0_reason = f"書 Table 7.8 的「{table_row.name}」2R 印「–」，沒有 R0"
    else:
        r0_reason = None
    out["r0"] = _q(r0, HSP_UNIT, "van Krevelen 2009 Table 7.8：R0 = 2R ÷ 2" + ("" if table_row is None else f"（{table_row.name}）"))
    out["tableMatch"] = None if table_row is None else {"id": table_row.id, "name": table_row.name, "deltaD": table_row.delta_d, "deltaP": table_row.delta_p, "deltaH": table_row.delta_h, "delta": table_row.delta, "twoR": table_row.two_r, "source": table_row.source}

    ra = None
    if s_hsp is None:
        reasons["ra"] = mix.get("reason", "混合溶劑的 HSP 算不出")
    elif None in p_vals:
        reasons["ra"] = "聚合物的 HSP 算不出：" + _joined_reasons(poly) if poly["reasons"] else "聚合物的 HSP 算不出"
    else:
        ra = hansen_ra(p_vals[0], p_vals[1], p_vals[2], s_hsp["deltaD"], s_hsp["deltaP"], s_hsp["deltaH"])
    out["ra"] = _q(ra, HSP_UNIT, RA_MODEL)
    red = None
    if ra is not None and r0 is not None:
        red = ra / r0
    out["red"] = _q(red, "", RED_MODEL)
    if ra is None:
        reasons["red"] = reasons["ra"]
    elif r0 is None:
        reasons["red"] = r0_reason  # type: ignore[assignment]
    if r0_reason is not None:
        reasons["r0"] = r0_reason

    # 書 Table 7.8 的聚合物 δ 與 R0 配成一組（Hansen 1971 的球心），另列 Ra／RED 供對照
    book_ra = None
    book_red = None
    book_dist = None
    if table_row is not None and s_hsp is not None:
        book_ra = hansen_ra(table_row.delta_d, table_row.delta_p, table_row.delta_h, s_hsp["deltaD"], s_hsp["deltaP"], s_hsp["deltaH"])
        book_dist = book_distance(table_row.delta_d, table_row.delta_p, table_row.delta_h, s_hsp["deltaD"], s_hsp["deltaP"], s_hsp["deltaH"])
        if r0 is not None:
            book_red = book_ra / r0
    out["bookCenter"] = {
        "ra": _q(book_ra, HSP_UNIT, RA_MODEL + "；聚合物 δ 取書 Table 7.8（Hansen 1971）"),
        "red": _q(book_red, "", RED_MODEL + "；聚合物 δ 取書 Table 7.8（Hansen 1971）"),
    }
    out["bookDistance"] = _q(book_dist, HSP_UNIT, "van Krevelen 2009 式 7.25（沒有係數 4），只供對照；書頁 219 說 Δδ 要小（例如小於 5，依聚合物而定）")

    # χ（式 7.12）
    chi = None
    if s_hsp is None:
        reasons["chi"] = mix.get("reason", "混合溶劑的 HSP 算不出")
    elif pq["delta"]["value"] is None:
        reasons["chi"] = "聚合物的總 δ 算不出：" + _joined_reasons(poly)
    else:
        vs = mix["molarVolume"]
        chi = flory_huggins_chi(vs, pq["delta"]["value"], s_hsp["delta"], temperature_k)
        out["chiParts"] = {"entropic": CHI_ENTROPIC, "enthalpic": chi - CHI_ENTROPIC, "vs": vs, "deltaPolymer": pq["delta"]["value"], "deltaSolvent": s_hsp["delta"], "R": GAS_CONSTANT}
    out["chi"] = _q(chi, "", CHI_MODEL)

    out["reasons"] = reasons
    out["judgement"] = judge(red, chi, reasons.get("red"), reasons.get("chi"))
    return out
