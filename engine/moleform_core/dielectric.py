"""聚合物（重複單元）的介電常數 ε、莫耳折射 ΣR 與分子極化率 α。對應 src/core/properties/dielectricRefraction.ts、
src/core/data/polarizationGroups.ts、src/core/data/molarRefractionGroups.ts（任務 M05 組 1-5；D62／D63）。

演算法與 TypeScript 逐步等價；資料表直接讀專案的 src/data/polarization_groups.csv 與 molar_refraction_groups.csv（單一來源）。
- 切分：基團依原子數由大到小、同大小依資料表順序貪婪配對（`vw.vw_matches`，與 TS 的 `vwMatches` 相同）；連接點不屬於任何基團；
  配不到的原子依「補充說明」的 SMARTS 由上而下附上原因。命中的排序鍵 `order` 是基團在原資料表的列序（TS 的 `rows.indexOf(row)`）。
- ε 的 V 取 `vm.compute_molar_volume_density` 的非晶態莫耳體積 Va；結構單元質量用 `vm.unit_mass_of`（與 TS 的 `unitMassOf` 相同的明確迴圈）。
- 加總用明確迴圈（不用內建 `sum()`）；`(ΣP_V/M) ** 2` 以 `x * x` 計算；α 的算式照 TS 的運算順序（見 `alpha_prime_from_r`、`alpha_si_from_r`）。
- 格式有問題時拋出 `TableDataError`（TS 靜默丟列，記為已知差異）。
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Sequence

from .csv_reader import js_number, js_trim
from .js_compat import js_div, js_number_to_string
from .mol_graph import MolGraph, mol_from_smiles, read_graph
from .tables import TableDataError, make_fail, read_data_file, read_records
from .vm import compute_molar_volume_density, unit_mass_of
from .vw import must_query, vw_matches

POLARIZATION_GROUPS_FILE = "polarization_groups.csv"
POLARIZATION_GROUPS_COLUMNS = ["id", "基團名稱", "SMARTS", "原子數", "P_LL", "P_V", "出處", "稽核狀態", "備註"]
MOLAR_REFRACTION_GROUPS_FILE = "molar_refraction_groups.csv"
MOLAR_REFRACTION_GROUPS_COLUMNS = ["id", "基團名稱", "SMARTS", "原子數", "R", "出處", "稽核狀態", "備註"]

DIELECTRIC_MODEL = (
    "van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 11.2.3 節：主要 ε 用式 (11.8) P_V = ε^½·M，"
    "第二個估計用式 (11.7) P_LL = (ε − 1)/(ε + 2)·V（V ＝ Va，任務 029）；基團增量見 Table 11.1（書頁 321）"
)
REFRACTION_MODEL = (
    "van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 10.2 節 Table 10.4（R_LL，λ = 589 nm，書頁 293–294）；"
    "α 由式 (11.10)、(11.11)（書頁 321–322）換算"
)
DIELECTRIC_DISCLAIMER = "基團加成估算，非實測；含極性基團的 ε 受頻率與溫度影響（Table 11.2 觀測值屬 10²–10⁹ Hz 低頻範圍）。"

N_A = 6.02214076e23
"""阿伏加德羅常數（SI 2019 定義值，mol⁻¹）"""
EPSILON_0 = 8.854188e-12
"""真空電容率，書中式 (11.3) 的值"""

_SYMBOLS = {1: "H", 5: "B", 6: "C", 7: "N", 8: "O", 9: "F", 14: "Si", 15: "P", 16: "S", 17: "Cl", 35: "Br", 53: "I"}
_NUMBER = re.compile(r"-?[0-9]+(?:\.[0-9]+)?", re.ASCII)
_INT = re.compile(r"[0-9]+", re.ASCII)
_MARK = re.compile(r"\[暫定:(LL,V|LL|V)\]")

# Table 11.1 配不到的原子，若屬於書中沒有的情況，補充說明（優先順序由上而下）。逐字取自 TS。
P_MISSING_HINTS: tuple[tuple[str, str], ...] = (
    ("[c;R1;D3]1[c;R1;D3][cH;R1][cH;R1][cH;R1][cH;R1]1", "鄰位伸苯基：Table 11.1 只有單取代苯基與對伸苯基，沒有鄰位（使用者 2026-11-01 決定不放寬）"),
    ("[c;R1;D3]1[cH;R1][c;R1;D3][cH;R1][cH;R1][cH;R1]1", "間位伸苯基：Table 11.1 只有單取代苯基與對伸苯基，沒有間位（使用者 2026-11-01 決定不放寬）"),
    ("[R]", "環上原子：Table 11.1 沒有環狀脂肪族、雜環或稠環基團"),
)
# Table 10.4 配不到的原子，若屬於書中變體沒有定義判斷條件或優先順序的情況，補充說明（優先順序由上而下）。逐字取自 TS。
R_MISSING_HINTS: tuple[tuple[str, str], ...] = (
    (
        "[CX3;D3;!R;$(C-[#6,#0])](=[OX1])-[OX2H0;D2;!R]",
        "酯基 –COO–：Table 10.4 分五列（甲酯、乙酯、高級酯、接在苯環上、乙酸酯）但沒有定義條件；兩個烷基旗標同時成立（如乙酸甲酯、乙酸乙酯）書中沒說，不配對（見 R25 備註）",
    ),
    ("[CX3;D3;!R](=[OX1])-[NX3H1]", "醯胺：Table 10.4 只有二級醯胺 –CONH–，不含醯亞胺或 N 上有第二個取代基者"),
    ("[R]", "環上原子：Table 10.4 的環結構用 Δ ring structure 增量修正，書中沒說怎麼套用，不收"),
    ("[c;R1;D3]", "多取代的苯環：書中用「伸苯基減 H_ar」，但沒說減在哪一個異構物，不配對"),
)


def _symbol_of(z: int) -> str:
    return _SYMBOLS.get(z, f"#{z}")


# ---------- 資料表 ----------


@dataclass(frozen=True)
class PolarizationGroupRow:
    id: str
    name: str
    smarts: str
    atom_count: int
    p_ll: float
    p_v: float
    tentative_ll: bool
    tentative_v: bool
    source: str
    audit: str
    notes: str


@dataclass(frozen=True)
class MolarRefractionGroupRow:
    id: str
    name: str
    smarts: str
    atom_count: int
    r: float
    source: str
    audit: str
    notes: str


def read_polarization_groups(text: str) -> tuple[list[PolarizationGroupRow], list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []
    fail = make_fail(POLARIZATION_GROUPS_FILE, issues)
    rows: list[PolarizationGroupRow] = []
    for rec, no in read_records(text, POLARIZATION_GROUPS_FILE, POLARIZATION_GROUPS_COLUMNS, fail) or []:
        id_, name, smarts, atom_text, pll_text, pv_text, source, audit, notes = rec
        ok = True
        if not _INT.fullmatch(atom_text) or js_number(atom_text) < 1 or js_number(atom_text) > 30:
            fail(no, "原子數", f"只能是 1–30 的整數：「{atom_text}」")
            ok = False
        if not _NUMBER.fullmatch(pll_text):
            fail(no, "P_LL", f"不是數字：「{pll_text}」")
            ok = False
        if not _NUMBER.fullmatch(pv_text):
            fail(no, "P_V", f"不是數字：「{pv_text}」")
            ok = False
        if not ok:
            continue
        m = _MARK.search(notes)
        mark = m.group(1) if m else ""
        rows.append(
            PolarizationGroupRow(
                id_, name, smarts, int(js_number(atom_text)), js_number(pll_text), js_number(pv_text),
                mark in ("LL", "LL,V"), mark in ("V", "LL,V"), source, audit, notes,
            )
        )  # fmt: skip
    return rows, issues


def read_molar_refraction_groups(text: str) -> tuple[list[MolarRefractionGroupRow], list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []
    fail = make_fail(MOLAR_REFRACTION_GROUPS_FILE, issues)
    rows: list[MolarRefractionGroupRow] = []
    for rec, no in read_records(text, MOLAR_REFRACTION_GROUPS_FILE, MOLAR_REFRACTION_GROUPS_COLUMNS, fail) or []:
        id_, name, smarts, atom_text, r_text, source, audit, notes = rec
        ok = True
        if not _INT.fullmatch(atom_text) or js_number(atom_text) < 1 or js_number(atom_text) > 30:
            fail(no, "原子數", f"只能是 1–30 的整數：「{atom_text}」")
            ok = False
        if not _NUMBER.fullmatch(r_text):
            fail(no, "R", f"不是數字：「{r_text}」")
            ok = False
        if not ok:
            continue
        rows.append(MolarRefractionGroupRow(id_, name, smarts, int(js_number(atom_text)), js_number(r_text), source, audit, notes))
    return rows, issues


@lru_cache(maxsize=1)
def load_polarization_groups() -> tuple[PolarizationGroupRow, ...]:
    rows, issues = read_polarization_groups(read_data_file(POLARIZATION_GROUPS_FILE))
    if issues:
        raise TableDataError(issues)
    return tuple(rows)


@lru_cache(maxsize=1)
def load_molar_refraction_groups() -> tuple[MolarRefractionGroupRow, ...]:
    rows, issues = read_molar_refraction_groups(read_data_file(MOLAR_REFRACTION_GROUPS_FILE))
    if issues:
        raise TableDataError(issues)
    return tuple(rows)


# ---------- 切分 ----------


def _describe_atom(g: MolGraph, i: int) -> str:
    h = g.h_count[i]
    label = f"{_symbol_of(g.z[i])}{('H' + (str(h) if h > 1 else '')) if h > 0 else ''}{'（芳香）' if g.aromatic[i] else ''}"
    near = "、".join("*" if g.z[n] == 0 else f"{_symbol_of(g.z[n])}{n}" for n in g.neighbors[i])
    return f"{label}，鄰居：{'無' if near == '' else near}"


def _component_count(g: MolGraph) -> int:
    seen = [False] * len(g.z)
    count = 0
    for s in range(len(g.z)):
        if seen[s]:
            continue
        count += 1
        stack = [s]
        seen[s] = True
        while stack:
            cur = stack.pop()
            for nb in g.neighbors[cur]:
                if not seen[nb]:
                    seen[nb] = True
                    stack.append(nb)
    return count


def _partition(mol: Any, g: MolGraph, rows: Sequence[Any], hints: Sequence[tuple[str, str]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """切分：回傳命中的基團與配不到的原子（每個重原子恰好屬於一個基團；連接點不屬於任何基團）。"""
    n = len(g.z)
    owner = [-1] * n
    hits: list[dict[str, Any]] = []
    ordered = sorted(range(len(rows)), key=lambda i: (-rows[i].atom_count, i))  # 穩定排序：原子數由大到小，同大小依資料表順序
    for idx in ordered:
        row = rows[idx]
        q = must_query(row.smarts)
        for atoms in vw_matches(mol, q):
            if any(owner[a] != -1 or g.z[a] == 0 for a in atoms):
                continue
            for a in atoms:
                owner[a] = len(hits)
            hits.append({"row": row, "atoms": atoms, "order": idx})
    hits.sort(key=lambda h: (h["atoms"][0], h["order"]))
    missing_idx = [i for i in range(n) if g.z[i] > 1 and owner[i] == -1]
    missing: list[dict[str, Any]] = []
    if missing_idx:
        reasons: dict[int, str] = {}
        for smarts, reason in hints:
            q = must_query(smarts)
            for atoms in vw_matches(mol, q):
                for a in atoms:
                    if owner[a] == -1 and g.z[a] != 0 and a not in reasons:
                        reasons[a] = reason
        for i in missing_idx:
            missing.append({"index": i, "element": _symbol_of(g.z[i]), "description": _describe_atom(g, i), "reason": reasons.get(i)})
    return hits, missing


def _parse_unit(smiles: str) -> tuple[Any, MolGraph] | dict[str, Any]:
    if js_trim(smiles) == "":
        return {"status": "invalid", "smiles": smiles, "message": "沒有結構（SMILES 是空的）"}
    try:
        mol = mol_from_smiles(smiles)
    except Exception:  # noqa: BLE001 - 對應 TS 的 try/catch
        mol = None
    if mol is None:
        return {"status": "invalid", "smiles": smiles, "message": "RDKit 無法解析這個 SMILES"}
    g = read_graph(mol)
    if not any(z > 1 for z in g.z):
        return {"status": "invalid", "smiles": smiles, "message": "沒有重原子"}
    if not any(z == 0 for z in g.z):
        return {
            "status": "unsupported",
            "smiles": smiles,
            "message": "不適用（小分子）：Table 11.1 與 Table 10.4 是聚合物重複單元的基團增量，不含連接點（*）的小分子不套用",
        }
    if _component_count(g) > 1:
        return {"status": "invalid", "smiles": smiles, "message": "含多個分子（以 . 分隔）；一次只算一個重複單元"}
    return mol, g


# ---------- 介電常數 ----------


def epsilon_from_pll(sum_pll: float, volume: float) -> float | None:
    """式 (11.7) 解 ε：ε = (1 + 2x)/(1 − x)，x = P/V；x ≥ 1 時無解（回傳 None）。"""
    x = js_div(sum_pll, volume)
    return None if x >= 1 else js_div(1 + 2 * x, 1 - x)


def epsilon_from_pv(sum_pv: float, mass: float) -> float:
    """式 (11.8) 解 ε：ε = (P_V/M)²。"""
    q = js_div(sum_pv, mass)
    return q * q


def compute_dielectric(smiles: str) -> dict[str, Any]:
    parsed = _parse_unit(smiles)
    if isinstance(parsed, dict):
        return parsed
    mol, g = parsed
    hits, missing = _partition(mol, g, load_polarization_groups(), P_MISSING_HINTS)
    groups = [
        {
            "id": h["row"].id,
            "name": h["row"].name,
            "pLL": h["row"].p_ll,
            "pV": h["row"].p_v,
            "tentativeLL": h["row"].tentative_ll,
            "tentativeV": h["row"].tentative_v,
            "atoms": h["atoms"],
            "source": h["row"].source,
        }
        for h in hits
    ]
    if missing:
        return {"status": "missing", "smiles": smiles, "polymer": True, "groups": groups, "missing": missing}
    mass = unit_mass_of(g)
    if mass is None:
        return {"status": "invalid", "smiles": smiles, "message": "有元素不在原子量表，無法算結構單元質量"}
    sum_pll = 0.0
    for h in groups:
        sum_pll = sum_pll + h["pLL"]
    sum_pv = 0.0
    for h in groups:
        sum_pv = sum_pv + h["pV"]
    vd = compute_molar_volume_density(smiles)
    volume: dict[str, Any]
    if vd["status"] == "ok" and vd["amorphous"] is not None:
        volume = {"status": "ok", "va": vd["amorphous"]["vm"]}
    elif vd["status"] == "missing":
        volume = {"status": "missing", "message": "缺莫耳體積（Table 4.10 缺基團，任務 029）", "missing": vd["missing"]}
    else:
        volume = {"status": "missing", "message": f"缺莫耳體積（{'無法算' if vd['status'] == 'ok' else vd['message']}）", "missing": []}
    eps_ll: float | None = None
    eps_ll_note: str | None = None
    if volume["status"] == "ok":
        eps_ll = epsilon_from_pll(sum_pll, volume["va"])
        if eps_ll is None:
            eps_ll_note = f"ΣP_LL（{js_number_to_string(sum_pll)}）≥ Va（{js_number_to_string(volume['va'])}），式 (11.7) 無解"
    else:
        eps_ll_note = "缺莫耳體積，僅 P_V 估計"
    eps_v = epsilon_from_pv(sum_pv, mass)
    return {
        "status": "ok",
        "smiles": smiles,
        "polymer": True,
        "unitMass": mass,
        "groups": groups,
        "sumPLL": sum_pll,
        "sumPV": sum_pv,
        "volume": volume,
        "epsLL": eps_ll,
        "epsLLNote": eps_ll_note,
        "epsV": eps_v,
        "epsPrimary": eps_v,
        "epsSecondary": eps_ll,
        "relDiff": None if eps_ll is None else js_div(abs(eps_ll - eps_v), eps_ll),
        "usesTentativeLL": any(h["tentativeLL"] for h in groups),
        "usesTentativeV": any(h["tentativeV"] for h in groups),
        "sources": list(dict.fromkeys(h["source"] for h in groups)),
        "model": DIELECTRIC_MODEL,
    }


# ---------- 莫耳折射與極化率 ----------


def alpha_prime_from_r(sum_r: float) -> float:
    """α′（Å³）：α′ = 3R/(4π·N_A)，R 以 cm³/mol 輸入，1 cm³ = 10²⁴ Å³。（TS：`((3 * sumR) / (4 * Math.PI * N_A)) * 1e24`）"""
    return js_div(3 * sum_r, 4 * math.pi * N_A) * 1e24


def alpha_si_from_r(sum_r: float) -> float:
    """α（SI）：α = 3ε₀R/N_A，R 以 cm³/mol 輸入（換成 m³/mol 乘 10⁻⁶）。（TS：`(3 * EPSILON_0 * sumR * 1e-6) / N_A`）"""
    return (3 * EPSILON_0 * sum_r * 1e-6) / N_A


def compute_refraction(smiles: str) -> dict[str, Any]:
    parsed = _parse_unit(smiles)
    if isinstance(parsed, dict):
        return parsed
    mol, g = parsed
    hits, missing = _partition(mol, g, load_molar_refraction_groups(), R_MISSING_HINTS)
    groups = [{"id": h["row"].id, "name": h["row"].name, "r": h["row"].r, "atoms": h["atoms"], "source": h["row"].source} for h in hits]
    if missing:
        return {"status": "missing", "smiles": smiles, "polymer": True, "groups": groups, "missing": missing}
    sum_r = 0.0
    for h in groups:
        sum_r = sum_r + h["r"]
    return {
        "status": "ok",
        "smiles": smiles,
        "polymer": True,
        "groups": groups,
        "sumR": sum_r,
        "alphaPrimeA3": alpha_prime_from_r(sum_r),
        "alphaSI": alpha_si_from_r(sum_r),
        "sources": list(dict.fromkeys(h["source"] for h in groups)),
        "model": REFRACTION_MODEL,
    }


def compute_dielectric_refraction(smiles: str) -> dict[str, Any]:
    """一次回傳 ε 與 ΣR／α（兩者各自切分、各自回報缺基團）。"""
    return {"dielectric": compute_dielectric(smiles), "refraction": compute_refraction(smiles)}


def count_groups(groups: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """把切分結果依基團 id 合併成「基團 × 個數」，依 id 排序（id 皆為 Pnn／Rnn 的 ASCII 字串）。"""
    merged: dict[str, dict[str, Any]] = {}
    for h in groups:
        e = merged.get(h["id"])
        if e is not None:
            e["count"] += 1
        else:
            merged[h["id"]] = {**h, "count": 1}
    return sorted(merged.values(), key=lambda e: e["id"])
