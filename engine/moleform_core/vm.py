"""聚合物（重複單元）298 K 的莫耳體積與密度。對應 src/core/properties/molarVolumeDensity.ts
（任務 M03，PLAN 6A.4-04；D62／D63）。

演算法與 TypeScript 逐步等價；資料表直接讀專案的 src/data/molar_volume_polymer_groups.csv
（單一來源，D18、D22；本模組不含任何基團數值）。TypeScript 仍是預設計算來源，本模組沒有接到介面。

與 TypeScript 逐步對應的幾個地方（任務 M03 的風險項）：

- R1 芳香性：`atom.GetIsAromatic()` 對應 TS 的 `aromaticAtoms`（mol_graph.read_graph）。
- R2 原子索引、氫數：缺基團的原子位置、基團 atoms、`describeAtom` 的氫數、單元質量的氫數都用 read_graph 的結果，不重排。
- R3 SMARTS 配對：沿用 vw.py 的 `vw_matches`（內含明確設定、與 RDKit.js 預設相同的 SubstructMatchParameters；
  命中內由小到大、命中之間依序比較的兩個排序是 TS `vwMatches` 的一部分）。
- R4 SMARTS 解析：`Chem.MolFromSmarts` 對應 `RDKit.get_qmol`，無法解析時與 TS 一樣拋出（不靜默略過）。
- 玻璃態／橡膠態判斷：呼叫 tg.compute_tg（calibrated=False，與 TS `judgeState` 相同），直接用 Python 函式，不經 HTTP。
  Tg（°C）與界線 25 °C 的比較、`toFixed(1)` 的文字（JS 是「正好一半往遠離零的方向進位」，Python 的 `format` 是銀行家捨入，
  所以另寫 `js_to_fixed`）都照 TS。
- 浮點加總：一律用明確的迴圈由左至右累加。**不可用內建 `sum()`**：Python 3.12 的 `sum()` 對 float 使用補償加總，
  與 JS 的 `reduce` 結果可能在最後一位不同。除法用 `_js_div`（JS 的除以零不拋例外）。
- 資料表格式有問題時直接拋出 `MolarVolumeDataError`（D22；TS 的 `MOLAR_VOLUME_GROUPS` 會靜默丟掉格式錯誤的列，
  記為已知差異，不改 TS）。
"""

from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, localcontext
from functools import lru_cache
from typing import Any, Sequence

from rdkit import Chem

from . import tg as _tg
from .atomic_weights import atomic_weight
from .csv_reader import CsvError, js_number, js_trim, parse_csv
from .mol_graph import MolGraph, mol_from_smiles, read_graph
from .vw import DATA_DIR, vw_matches

# ---------- 常數（逐字取自 TS） ----------

MOLAR_VOLUME_MODEL = (
    "van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 4.3.7 節："
    "Vm = ΣVi(298)（基團增量見 Table 4.10，書頁 88）；密度 = 結構單元質量 ÷ Vm"
)
MOLAR_VOLUME_DISCLAIMER = "莫耳體積與密度為基團加成估算，非實測；以 cm³/mol 與 g/cm³（結構單元）表示。"
STATE_BOUNDARY_C = 25
"""298 K 判斷玻璃態／橡膠態的 Tg 界線（°C，書頁 79、80：Tg 低於／高於 25 °C）"""
TENTATIVE_MARK = "書中印於括號內"
_SYMBOLS = {1: "H", 5: "B", 6: "C", 7: "N", 8: "O", 9: "F", 14: "Si", 15: "P", 16: "S", 17: "Cl", 35: "Br"}

MOLAR_VOLUME_GROUPS_FILE = "molar_volume_polymer_groups.csv"
MOLAR_VOLUME_GROUPS_COLUMNS = ["id", "基團名稱", "SMARTS", "原子數", "Va", "Vc", "出處", "稽核狀態", "備註"]

# 配不到的原子，若屬於書中 al./ar.、general／acrylics 這類沒有定義條件的情況，補充說明（優先順序由上而下）。逐字取自 TS。
MISSING_HINTS: tuple[tuple[str, str], ...] = (
    (
        "[CX3H0;D3](=[OX1])-[OX2H0;D2]-[#6,#0]",
        "酯基 –COO–：Table 4.10 分 general 與 acrylics 兩列但書中沒有定義條件；只收羰基碳接芳香碳者（資料表 M11），其他酯不配對",
    ),
    (
        "[OX2H0;D2;!R](-[#6,#0])-[#6,#0]",
        "醚 –O–：Table 4.10 分 al. 與 ar. 兩列但書中沒有定義；只收兩側都是非芳香飽和碳（M09）或兩側都是芳香碳（M10）者，接連接點 * 或芳基烷基醚不配對",
    ),
)

_NUMBER = re.compile(r"-?[0-9]+(?:\.[0-9]+)?", re.ASCII)
_ATOM_COUNT = re.compile(r"[0-9]+", re.ASCII)


# ---------- JS 相容的小工具 ----------


def _js_div(a: float, b: float) -> float:
    """JS 的 `/`：除以零不拋例外（0/0 → NaN；x/0 → ±Infinity，零的正負號照 IEEE）。"""
    return _tg._js_div(a, b)


def js_to_fixed(x: float, digits: int) -> str:
    """JS 的 `Number#toFixed`：取最接近的 n（n / 10^digits − x 最接近零），兩個一樣近時取較大的 n；負數先取正再加負號
    （所以 -0.04.toFixed(1) 是 "-0.0"，-0 是 "0.0"）。Python 的 `format` 對正好一半是銀行家捨入，不能用。"""
    if math.isnan(x):
        return "NaN"
    if math.isinf(x):
        return "Infinity" if x > 0 else "-Infinity"
    if abs(x) >= 1e21:
        raise ValueError("toFixed 對 1e21 以上的數字回傳指數表示，本模組不會遇到這種值")
    with localcontext() as ctx:
        ctx.prec = 80
        d = Decimal(abs(x)).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP)
        s = format(d, "f")
    return ("-" if x < 0 else "") + s


# ---------- 資料表 ----------


@dataclass(frozen=True)
class MolarVolumeGroupRow:
    id: str
    name: str
    smarts: str
    atom_count: int
    va: float
    """Va,i(298)：非晶態（玻璃態、橡膠態）莫耳體積增量，cm³/mol"""
    vc: float
    """Vc,i(298)：結晶態莫耳體積增量，cm³/mol"""
    source: str
    audit: str
    notes: str
    order: int = 0
    """切分順序（資料表的列序）"""


class MolarVolumeDataError(Exception):
    """資料表格式錯誤（D22：不靜默略過）。"""

    def __init__(self, issues: list[str]):
        super().__init__("；".join(issues))
        self.issues = issues


def read_molar_volume_groups(text: str) -> tuple[list[MolarVolumeGroupRow], list[str]]:
    """對應 readMolarVolumeGroups；回傳 (rows, issues)。"""
    issues: list[str] = []
    columns = MOLAR_VOLUME_GROUPS_COLUMNS

    def fail(row: int | None, column: str | None, message: str) -> None:
        where = " / ".join(
            x for x in [MOLAR_VOLUME_GROUPS_FILE, None if row is None else f"第 {row} 列", column] if x is not None
        )
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
    rows: list[MolarVolumeGroupRow] = []
    for r in range(1, len(records)):
        rec = records[r]
        no = r + 1
        if len(rec) != len(columns):
            fail(no, None, f"欄位數應為 {len(columns)}，實際為 {len(rec)}")
            continue
        id_, name, smarts, atom_text, va_text, vc_text, source, audit, notes = (js_trim(s) for s in rec)
        ok = True
        if not _ATOM_COUNT.fullmatch(atom_text) or not (1 <= js_number(atom_text) <= 30):
            fail(no, "原子數", f"只能是 1–30 的整數：「{atom_text}」")
            ok = False
        if not _NUMBER.fullmatch(va_text):
            fail(no, "Va", f"不是數字：「{va_text}」")
            ok = False
        if not _NUMBER.fullmatch(vc_text):
            fail(no, "Vc", f"不是數字：「{vc_text}」")
            ok = False
        if not ok:
            continue
        rows.append(
            MolarVolumeGroupRow(
                id=id_,
                name=name,
                smarts=smarts,
                atom_count=int(js_number(atom_text)),
                va=js_number(va_text),
                vc=js_number(vc_text),
                source=source,
                audit=audit,
                notes=notes,
                order=len(rows),
            )
        )
    return rows, issues


def _read_file(name: str) -> str:
    with open(os.path.join(DATA_DIR, name), encoding="utf-8", newline="") as f:
        return f.read()


@lru_cache(maxsize=1)
def load_molar_volume_groups() -> tuple[MolarVolumeGroupRow, ...]:
    """聚合物莫耳體積基團表（Table 4.10），依資料表順序。格式有任何問題就拋出（TS 靜默丟列；這裡直接擋下）。"""
    rows, issues = read_molar_volume_groups(_read_file(MOLAR_VOLUME_GROUPS_FILE))
    if issues:
        raise MolarVolumeDataError(issues)
    return tuple(rows)


# ---------- 切分 ----------


def order_molar_volume_groups(rows: Sequence[MolarVolumeGroupRow] | None = None) -> list[MolarVolumeGroupRow]:
    """依切分順序排列：原子數由大到小，同大小依資料表順序（Python 的 sorted 穩定，與 JS 相同）。"""
    rows = load_molar_volume_groups() if rows is None else rows
    indexed = [MolarVolumeGroupRow(**{**r.__dict__, "order": i}) for i, r in enumerate(rows)]
    return sorted(indexed, key=lambda r: (-r.atom_count, r.order))


@lru_cache(maxsize=None)
def must_query(smarts: str) -> Chem.Mol:
    """對應 mustQuery（RDKit.get_qmol）。無法解析時拋出，與 TS 相同。"""
    q = Chem.MolFromSmarts(smarts)
    if q is None:
        raise ValueError(f"莫耳體積基團表的 SMARTS 無法解析：{smarts}")
    return q


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


def unit_mass_of(g: MolGraph) -> float | None:
    """結構單元質量（g/mol）；元素不在原子量表時回傳 None（明確迴圈，不用 sum）。"""
    hw = atomic_weight(1)
    assert hw is not None
    total = 0.0
    for i in range(len(g.z)):
        if g.z[i] == 0:
            continue
        w = atomic_weight(g.z[i])
        if w is None:
            return None
        total += w + g.h_count[i] * hw
    return total


# ---------- 298 K 的狀態判斷 ----------


def judge_state(smiles: str) -> dict[str, Any]:
    """對應 judgeState：需要 Tg（任務 026 的基團加成，不含校準基團）；Tg 算不出來或剛好 25 °C 就是「狀態未定」。"""
    tg = _tg.compute_tg(smiles, calibrated=False)  # 維持任務 029 的行為（TS 同樣 calibrated: false）
    if tg["status"] != "ok":
        return {
            "state": "undetermined",
            "tgC": None,
            "basis": (
                "Tg 算不出來（任務 026 的基團表缺基團），不判斷 298 K 的狀態；玻璃態與橡膠態結果都輸出"
                if tg["status"] == "missing"
                else f"Tg 無法計算：{tg['message']}"
            ),
        }
    tg_c = tg["tgC"]
    if tg_c > STATE_BOUNDARY_C:
        return {
            "state": "glassy",
            "tgC": tg_c,
            "basis": f"Tg = {js_to_fixed(tg_c, 1)} °C，高於 {STATE_BOUNDARY_C} °C → 玻璃態（書頁 80，4.3.3 節）",
        }
    if tg_c < STATE_BOUNDARY_C:
        return {
            "state": "rubbery",
            "tgC": tg_c,
            "basis": f"Tg = {js_to_fixed(tg_c, 1)} °C，低於 {STATE_BOUNDARY_C} °C → 橡膠態（書頁 79，4.3.2 節）",
        }
    return {
        "state": "undetermined",
        "tgC": tg_c,
        "basis": f"Tg 剛好等於 {STATE_BOUNDARY_C} °C，書中沒有規定；玻璃態與橡膠態結果都輸出",
    }


def _volume_and_density(vm: float, mass: float | None) -> dict[str, float] | None:
    return None if mass is None else {"vm": vm, "density": _js_div(mass, vm)}


def _invalid(smiles: str, message: str) -> dict[str, Any]:
    return {"status": "invalid", "smiles": smiles, "message": message}


def compute_molar_volume_density(smiles: str, rows: Sequence[MolarVolumeGroupRow] | None = None) -> dict[str, Any]:
    """對應 computeMolarVolumeDensity。回傳與 TS 的 MolarVolumeResult 同樣欄位名稱的 dict
    （status 為 ok／missing／unsupported／invalid）。"""
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
    if not any(z > 1 for z in g.z):
        return _invalid(smiles, "沒有重原子")
    if not any(z == 0 for z in g.z):
        return {
            "status": "unsupported",
            "smiles": smiles,
            "message": "不含連接點（*）的小分子：液體莫耳體積要用 Fedors 1974（使用者 2026-10-31 決定另開任務，與 8.3 溶解度參數合併），本任務未實作；聚合物表不套用在小分子",
        }
    if _component_count(g) > 1:
        return _invalid(smiles, "含多個分子（以 . 分隔）；一次只算一個重複單元")

    # ---- 切分 ----
    owner = [-1] * n
    hits: list[dict[str, Any]] = []
    for row in order_molar_volume_groups(load_molar_volume_groups() if rows is None else rows):
        q = must_query(row.smarts)
        for atoms in vw_matches(mol, q):
            if any(owner[a] != -1 or g.z[a] == 0 for a in atoms):
                continue
            for a in atoms:
                owner[a] = len(hits)
            hits.append({"row": row, "atoms": atoms})
    hits.sort(key=lambda h: (h["atoms"][0], h["row"].order))
    groups: list[dict[str, Any]] = [
        {
            "id": h["row"].id,
            "name": h["row"].name,
            "va": h["row"].va,
            "vc": h["row"].vc,
            "tentative": TENTATIVE_MARK in h["row"].notes,
            "atoms": h["atoms"],
            "source": h["row"].source,
        }
        for h in hits
    ]

    missing_idx = [i for i in range(n) if g.z[i] > 1 and owner[i] == -1]
    if missing_idx:
        reasons: dict[int, str] = {}
        for smarts, reason in MISSING_HINTS:
            q = must_query(smarts)
            for atoms in vw_matches(mol, q):
                for a in atoms:
                    if owner[a] == -1 and g.z[a] != 0 and a not in reasons:
                        reasons[a] = reason
        missing = [
            {"index": i, "element": _symbol_of(g.z[i]), "description": _describe_atom(g, i), "reason": reasons.get(i)}
            for i in missing_idx
        ]
        return {"status": "missing", "smiles": smiles, "polymer": True, "groups": groups, "missing": missing}

    # ---- 計算（明確迴圈，不用內建 sum；見模組說明） ----
    vm_a = 0.0
    for h in groups:
        vm_a = vm_a + h["va"]
    vm_c = 0.0
    for h in groups:
        vm_c = vm_c + h["vc"]
    mass = unit_mass_of(g)
    amorphous = _volume_and_density(vm_a, mass)
    state = judge_state(smiles)
    return {
        "status": "ok",
        "smiles": smiles,
        "polymer": True,
        "unitMass": mass,
        "amorphous": amorphous,
        "crystalline": _volume_and_density(vm_c, mass),
        "glassy": amorphous,
        "rubbery": amorphous,
        "state": state,
        "groups": groups,
        "usesTentative": any(h["tentative"] for h in groups),
        "sources": list(dict.fromkeys(h["source"] for h in groups)),
        "model": MOLAR_VOLUME_MODEL,
    }


def count_molar_volume_groups(groups: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """對應 countMolarVolumeGroups：把切分結果依基團 id 合併成「基團 × 個數」，依 id 排序
    （TS 用 localeCompare；id 全是 M01–M27 的 ASCII 字串，與字串比較順序相同）。"""
    merged: dict[str, dict[str, Any]] = {}
    for h in groups:
        e = merged.get(h["id"])
        if e is not None:
            e["count"] += 1
        else:
            merged[h["id"]] = {
                "id": h["id"],
                "name": h["name"],
                "va": h["va"],
                "vc": h["vc"],
                "tentative": h["tentative"],
                "count": 1,
            }
    return sorted(merged.values(), key=lambda e: e["id"])
