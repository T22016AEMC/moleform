"""van der Waals 體積（VW）。對應 src/core/properties/vanDerWaalsVolume.ts（任務 M01，PLAN 6A.4-01；D62／D63）。

演算法與 TypeScript 逐步等價；資料表直接讀專案的 src/data/vw_groups.csv、src/data/vw_groups_bondi.csv
（單一來源，D18、D22；本模組不含任何基團數值）。TypeScript 仍是預設計算來源，本模組沒有接到介面。

與 TypeScript 逐步對應的幾個地方（任務 M01 的風險項）：

- R1 芳香性：`atom.GetIsAromatic()` 對應 TS 的 `aromaticAtoms`（mol_graph.read_graph）。
- R3 SMARTS 配對：TS 呼叫 `mol.get_substruct_matches(query)`（RDKit.js，不帶 details，即預設的
  SubstructMatchParameters）。Python 端用 `mol.GetSubstructMatches(query, params)`，參數明確列在 `SUBSTRUCT_PARAMS`
  （與 RDKit 預設相同；為了不依賴預設值而寫明）。TS 另有兩個排序步驟（每個命中的原子由小到大、命中之間依序比較），
  屬於演算法本身，Python 照搬（`vw_matches`）；原始（未排序）的配對順序另以黃金檔逐字比對（`R3/raw/*` 案例），確認兩邊一致而非靠排序蓋過。
- R4 SMARTS 解析：`Chem.MolFromSmarts` 對應 `RDKit.get_qmol`；無法解析時與 TS 一樣拋出錯誤（不靜默略過）。
- 浮點加總：一律用明確的迴圈由左至右累加。**不可用內建 `sum()`**：Python 3.12 的 `sum()` 對 float 使用補償加總，
  與 JS 的 `reduce` 結果可能在最後一位不同。
- `Math.round`：JS 是「四捨五入、.5 往正無限大」，Python 的 `round` 是銀行家捨入，故另寫 `_js_round`。
- 原子索引、氫數、基團順序不做任何額外排序或重排（只有 TS 本來就有的排序）。
"""

from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from rdkit import Chem

from .atomic_weights import atomic_weight
from .csv_reader import CsvError, js_number, js_trim, parse_csv
from .mol_graph import MolGraph, mol_from_smiles, read_graph

# ---------- 常數（逐字取自 TS） ----------

VW_MODEL = (
    "van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 4.2.3 節：VW = ΣVW,i"
    "（基團增量見 Table 4.2，書頁 74–75；基團增量法源自 Bondi 1964）"
)
VW_DISCLAIMER = "van der Waals 體積為基團加成估算，非實測；以 cm³/mol（結構單元）表示。"
VW_BONDI_LABEL = "含 Bondi 補充基團（非書值）"
VW_BONDI_INTERPRETATION_LABEL = "含詮釋，待使用者審"
VW_MI_EXCEPTIONS: dict[str, float] = {"V07": 0.05, "V28": 0.03, "V30": 0.03}
DUMMY_END_RULES: dict[str, str] = {"BG12": "aromatic", "BG13": "alkyl"}
_SYMBOLS = {1: "H", 5: "B", 6: "C", 7: "N", 8: "O", 9: "F", 14: "Si", 15: "P", 16: "S", 17: "Cl", 35: "Br"}

VW_GROUPS_FILE = "vw_groups.csv"
VW_BONDI_FILE = "vw_groups_bondi.csv"
VW_GROUPS_COLUMNS = ["id", "基團名稱", "SMARTS", "原子數", "VW", "Mi", "二價／非二價", "出處", "稽核狀態", "備註"]
VW_BONDI_COLUMNS = [*VW_GROUPS_COLUMNS, "來源等級", "修正量"]

# 資料表的目錄：專案的 src/data（單一來源）。環境變數 MOLEFORM_DATA_DIR 可覆寫（供之後內嵌打包時改路徑）。
DATA_DIR = os.environ.get("MOLEFORM_DATA_DIR") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "src", "data"
)

# ---------- R3：配對參數 ----------

SUBSTRUCT_PARAMS = Chem.SubstructMatchParameters()
SUBSTRUCT_PARAMS.uniquify = True
SUBSTRUCT_PARAMS.useChirality = False
SUBSTRUCT_PARAMS.useEnhancedStereo = False
SUBSTRUCT_PARAMS.useQueryQueryMatches = False
SUBSTRUCT_PARAMS.recursionPossible = True
SUBSTRUCT_PARAMS.aromaticMatchesConjugated = False
SUBSTRUCT_PARAMS.maxMatches = 1000
SUBSTRUCT_PARAMS.numThreads = 1


# ---------- JS 相容的小工具 ----------


def _js_round(x: float) -> int:
    """JS 的 Math.round：.5 往正無限大。"""
    f = math.floor(x)
    return f + 1 if x - f >= 0.5 else f


def _js_is_integer(x: float) -> bool:
    return math.isfinite(x) and math.floor(x) == x


_NUMBER = re.compile(r"-?[0-9]+(?:\.[0-9]+)?", re.ASCII)
_ATOM_COUNT = re.compile(r"[0-9]+", re.ASCII)


# ---------- 資料表 ----------


@dataclass(frozen=True)
class VwGroupRow:
    id: str
    name: str
    smarts: str
    atom_count: int
    vw: float | None
    mi: float
    valence: str
    source: str
    audit: str
    notes: str
    # 以下只有 Bondi 補充表才有
    source_level: str = ""
    correction: float | None = None
    kind: str = "group"
    """'group'（BG）或 'correction'（BC）；書的基團一律是 'group'"""
    order: int = 0
    """切分順序（資料表的列序）"""


class VwDataError(Exception):
    """資料表格式錯誤（D22：不靜默略過）。"""

    def __init__(self, issues: list[str]):
        super().__init__("；".join(issues))
        self.issues = issues


def read_vw_groups(text: str) -> tuple[list[VwGroupRow], list[str]]:
    """對應 readVwGroups；回傳 (rows, issues)。"""
    return _read_table(text, VW_GROUPS_FILE, VW_GROUPS_COLUMNS, bondi=False)


def read_vw_groups_bondi(text: str) -> tuple[list[VwGroupRow], list[str]]:
    """對應 readVwGroupsBondi；回傳 (rows, issues)。"""
    return _read_table(text, VW_BONDI_FILE, VW_BONDI_COLUMNS, bondi=True)


def _read_table(text: str, file: str, columns: list[str], *, bondi: bool) -> tuple[list[VwGroupRow], list[str]]:
    issues: list[str] = []

    def fail(row: int | None, column: str | None, message: str) -> None:
        where = " / ".join(x for x in [file, None if row is None else f"第 {row} 列", column] if x is not None)
        issues.append(f"{where}：{message}")

    try:
        records = parse_csv(text)
    except CsvError as e:
        fail(None, None, f"CSV 格式錯誤：{e.message}")
        return [], issues
    if not records:
        fail(1, None, f"檔案是空的，缺少標題列（應為：{','.join(columns)}）")
        return [], issues
    header = records[0]
    if len(header) != len(columns) or any(h != columns[i] for i, h in enumerate(header)):
        fail(1, None, f"標題列與定義不一致。應為：{','.join(columns)}；實際為：{','.join(header)}")
        return [], issues
    rows: list[VwGroupRow] = []
    for r in range(1, len(records)):
        rec = records[r]
        no = r + 1
        if len(rec) != len(columns):
            fail(no, None, f"欄位數應為 {len(columns)}，實際為 {len(rec)}")
            continue
        cells = [js_trim(s) for s in rec]
        id_, name, smarts, atom_text, vw_text, mi_text, valence, source, audit, notes = cells[:10]
        corr_text = cells[11] if bondi else ""
        ok = True
        if not _ATOM_COUNT.fullmatch(atom_text) or not (1 <= js_number(atom_text) <= 30):
            fail(no, "原子數", f"只能是 1–30 的整數：「{atom_text}」")
            ok = False
        if (vw_text != "" or bondi) and not _NUMBER.fullmatch(vw_text):
            fail(no, "VW", f"不是數字：「{vw_text}」")
            ok = False
        if not _NUMBER.fullmatch(mi_text):
            fail(no, "Mi", f"不是數字：「{mi_text}」")
            ok = False
        if bondi and corr_text != "" and not _NUMBER.fullmatch(corr_text):
            fail(no, "修正量", f"不是數字：「{corr_text}」")
            ok = False
        if not ok:
            continue
        rows.append(
            VwGroupRow(
                id=id_,
                name=name,
                smarts=smarts,
                atom_count=int(js_number(atom_text)),
                vw=None if vw_text == "" else js_number(vw_text),
                mi=js_number(mi_text),
                valence=valence,
                source=source,
                audit=audit,
                notes=notes,
                source_level=cells[10] if bondi else "",
                correction=None if (not bondi or corr_text == "") else js_number(corr_text),
                kind=("correction" if id_.startswith("BC") else "group") if bondi else "group",
                order=len(rows),
            )
        )
    return rows, issues


def _read_file(name: str) -> str:
    with open(os.path.join(DATA_DIR, name), encoding="utf-8", newline="") as f:
        return f.read()


@lru_cache(maxsize=1)
def load_vw_groups() -> tuple[VwGroupRow, ...]:
    """書的基團表（Table 4.2），依資料表順序。格式有任何問題就拋出（TS 以測試保證無問題；這裡直接擋下）。"""
    rows, issues = read_vw_groups(_read_file(VW_GROUPS_FILE))
    if issues:
        raise VwDataError(issues)
    return tuple(rows)


@lru_cache(maxsize=1)
def load_vw_groups_bondi() -> tuple[VwGroupRow, ...]:
    """Bondi 補充表（BG 基團列與 BC 修正列）。"""
    rows, issues = read_vw_groups_bondi(_read_file(VW_BONDI_FILE))
    if issues:
        raise VwDataError(issues)
    return tuple(rows)


# ---------- 切分 ----------


def order_vw_groups(rows: tuple[VwGroupRow, ...] | list[VwGroupRow] | None = None) -> list[VwGroupRow]:
    """依切分順序排列：原子數由大到小，同大小依資料表順序（Python 的 sorted 穩定，與 JS 相同）。"""
    rows = load_vw_groups() if rows is None else rows
    indexed = [_with_order(r, i) for i, r in enumerate(rows)]
    return sorted(indexed, key=lambda r: (-r.atom_count, r.order))


def _with_order(r: VwGroupRow, order: int) -> VwGroupRow:
    return VwGroupRow(**{**r.__dict__, "order": order})


@lru_cache(maxsize=None)
def must_query(smarts: str) -> Chem.Mol:
    """對應 mustQuery（RDKit.get_qmol）。無法解析時拋出，與 TS 相同。"""
    q = Chem.MolFromSmarts(smarts)
    if q is None:
        raise ValueError(f"VW 基團表的 SMARTS 無法解析：{smarts}")
    return q


def raw_matches(mol: Chem.Mol, query: Chem.Mol) -> list[list[int]]:
    """RDKit 原始配對結果（未排序；順序與每個命中內的原子順序都照 RDKit 給的）。對應 JSON.parse(get_substruct_matches)。"""
    return [list(m) for m in mol.GetSubstructMatches(query, SUBSTRUCT_PARAMS)]


def vw_matches(mol: Chem.Mol, query: Chem.Mol) -> list[list[int]]:
    """對應 vwMatches：每個命中的原子由小到大排序，命中之間依序逐項比較（較短者在前）。這兩個排序是 TS 演算法的一部分。"""
    lst = [sorted(m) for m in raw_matches(mol, query)]
    lst.sort()  # list 的字典序比較：逐項比較，前綴相同則較短者在前，與 TS 比較函式相同
    return lst


def atoms_mass(g: MolGraph, atoms: list[int]) -> float | None:
    hw = atomic_weight(1)
    assert hw is not None
    total = 0.0
    for a in atoms:
        w = atomic_weight(g.z[a])
        if w is None:
            return None
        total += w + g.h_count[a] * hw
    return total


def mass_tolerance(groups: list[dict[str, Any]]) -> float:
    total = 0.0
    for g in groups:
        exc = VW_MI_EXCEPTIONS.get(g["id"])
        total += exc if exc is not None else (0.05 if _js_is_integer(_js_round(g["mi"] * 100) / 10) else 0.01)
    return total


def _symbol_of(z: int) -> str:
    return _SYMBOLS.get(z, f"#{z}")


def _describe_atom(g: MolGraph, i: int) -> str:
    h = g.h_count[i]
    label = f"{_symbol_of(g.z[i])}{('H' + (str(h) if h > 1 else '')) if h > 0 else ''}{'（芳香）' if g.aromatic[i] else ''}"
    near = "、".join("*" if g.z[n] == 0 else f"{_symbol_of(g.z[n])}{n}" for n in g.neighbors[i])
    return f"{label}，鄰居：{'無' if near == '' else near}"


def _component_count(g: MolGraph) -> int:
    n = len(g.z)
    seen = [False] * n
    count = 0
    for s in range(n):
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


def _dummy_end_class(g: MolGraph, dummy: int) -> str:
    dummies = [i for i, z in enumerate(g.z) if z == 0]
    if len(dummies) != 2:
        return "unknown"
    other = dummies[1] if dummies[0] == dummy else dummies[0]
    nb = g.neighbors[other]
    if len(nb) != 1:
        return "unknown"
    p = nb[0]
    if g.aromatic[p]:
        return "aromatic"
    return "alkyl" if g.z[p] == 6 else "unknown"


def _dummy_rule_ok(g: MolGraph, row_id: str, atoms: list[int]) -> bool:
    rule = DUMMY_END_RULES.get(row_id)
    if rule is None:
        return True
    for a in atoms:
        for nb in g.neighbors[a]:
            if g.z[nb] == 0:
                return _dummy_end_class(g, nb) == rule
    return False


def _invalid(smiles: str, message: str) -> dict[str, Any]:
    return {"status": "invalid", "smiles": smiles, "message": message}


def compute_vdw_volume(
    smiles: str,
    rows: tuple[VwGroupRow, ...] | list[VwGroupRow] | None = None,
    supplement: tuple[VwGroupRow, ...] | list[VwGroupRow] | None = None,
) -> dict[str, Any]:
    """對應 computeVdwVolume。回傳與 TS 的 VwResult 同樣欄位名稱的 dict（status 為 ok／missing／invalid）。

    rows、supplement 的預設規則與 TS 相同：省略 supplement 時，沒有指定 rows 就用內建 Bondi 補充表，指定了 rows 就不補充。
    """
    if js_trim(smiles) == "":
        return _invalid(smiles, "沒有結構（SMILES 是空的）")
    try:
        mol = mol_from_smiles(smiles)
    except Exception:  # noqa: BLE001 - 對應 TS 的 try/catch：任何解析例外都視為無法解析
        mol = None
    if mol is None:
        return _invalid(smiles, "RDKit 無法解析這個 SMILES")

    g = read_graph(mol)
    n = len(g.z)
    polymer = any(z == 0 for z in g.z)
    if not any(z > 1 for z in g.z):
        return _invalid(smiles, "沒有重原子")
    if _component_count(g) > 1:
        return _invalid(smiles, "含多個分子（以 . 分隔）；VW 一次只算一個分子或一個重複單元")

    # ---- 切分 ----
    owner = [-1] * n
    hits: list[dict[str, Any]] = []
    for row in order_vw_groups(load_vw_groups() if rows is None else rows):
        q = must_query(row.smarts)
        for atoms in vw_matches(mol, q):
            if any(owner[a] != -1 or g.z[a] == 0 for a in atoms):
                continue
            for a in atoms:
                owner[a] = len(hits)
            hits.append({"row": row, "atoms": atoms, "supplement": False})

    # ---- Bondi 補充（任務 037）：只處理書配不到的重原子 ----
    if supplement is not None:
        supplement_rows = supplement
    else:
        supplement_rows = [] if rows is not None else load_vw_groups_bondi()
    corrections: list[dict[str, Any]] = []
    if len(supplement_rows) > 0 and any(o == -1 and g.z[i] > 1 for i, o in enumerate(owner)):
        sup_groups = [r for r in supplement_rows if r.kind == "group"]
        sup_ordered = sorted(
            (_with_order(r, 1000 + i) for i, r in enumerate(sup_groups)),
            key=lambda r: (-r.atom_count, r.order),
        )
        for row in sup_ordered:
            q = must_query(row.smarts)
            for atoms in vw_matches(mol, q):
                if any(owner[a] != -1 or g.z[a] == 0 for a in atoms):
                    continue
                if not _dummy_rule_ok(g, row.id, atoms):
                    continue
                for a in atoms:
                    owner[a] = len(hits)
                hits.append({"row": row, "atoms": atoms, "supplement": True})
        # Table XVII 修正：命中的原子至少一個屬於補充基團才計次
        for row in (r for r in supplement_rows if r.kind == "correction"):
            q = must_query(row.smarts)
            count = 0
            for atoms in vw_matches(mol, q):
                if any(owner[a] != -1 and hits[owner[a]]["supplement"] for a in atoms):
                    count += 1
            if count > 0 and row.correction is not None:
                corrections.append(
                    {"id": row.id, "name": row.name, "delta": row.correction, "count": count, "source": row.source}
                )
    hits.sort(key=lambda h: (h["atoms"][0], h["row"].order))

    groups: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    for h in hits:
        row: VwGroupRow = h["row"]
        if row.vw is None:
            for a in h["atoms"]:
                missing.append(
                    {
                        "index": a,
                        "element": _symbol_of(g.z[a]),
                        "description": _describe_atom(g, a),
                        "reason": f"基團「{row.name}」在資料表的 VW 留空（書中數值有疑義，見備註）",
                    }
                )
        else:
            hit: dict[str, Any] = {
                "id": row.id,
                "name": row.name,
                "vw": row.vw,
                "mi": row.mi,
                "atoms": h["atoms"],
                "source": row.source,
            }
            if h["supplement"]:
                hit["supplement"] = True
            groups.append(hit)
    for i in range(n):
        if g.z[i] > 1 and owner[i] == -1:
            missing.append(
                {"index": i, "element": _symbol_of(g.z[i]), "description": _describe_atom(g, i), "reason": None}
            )
    missing.sort(key=lambda m: m["index"])
    used_supplement = any(h["supplement"] for h in hits)
    if missing:
        return {
            "status": "missing",
            "smiles": smiles,
            "polymer": polymer,
            "groups": groups,
            "missing": missing,
            "bondiSupplement": used_supplement,
        }

    # ---- 計算（明確迴圈，不用內建 sum；見模組說明） ----
    correction_total = 0.0
    for c in corrections:
        correction_total = correction_total + c["delta"] * c["count"]
    vw = 0.0
    for h in groups:
        vw = vw + h["vw"]
    vw = vw + correction_total
    interpretive = any(h["supplement"] and "詮釋" in h["row"].audit for h in hits)
    bondi_notes = [VW_BONDI_LABEL, *([VW_BONDI_INTERPRETATION_LABEL] if interpretive else [])] if used_supplement else []
    sum_mi = 0.0
    for h in groups:
        sum_mi = sum_mi + h["mi"]
    real = [i for i in range(n) if g.z[i] != 0]
    formula_mass = atoms_mass(g, real)
    mass_delta = None if formula_mass is None else sum_mi - formula_mass
    return {
        "status": "ok",
        "smiles": smiles,
        "polymer": polymer,
        "vw": vw,
        "sumMi": sum_mi,
        "formulaMass": formula_mass,
        "massDelta": mass_delta,
        "massWithinTolerance": None if mass_delta is None else abs(mass_delta) <= mass_tolerance(groups),
        "groups": groups,
        "sources": list(dict.fromkeys([*(h["source"] for h in groups), *(c["source"] for c in corrections)])),
        "model": VW_MODEL,
        "bondiSupplement": used_supplement,
        "bondiNotes": bondi_notes,
        "corrections": corrections,
    }
