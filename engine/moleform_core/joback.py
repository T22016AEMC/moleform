"""Joback 法的沸點與熔點。對應 src/core/properties/jobackTbTf.ts 與 src/core/data/jobackGroups.ts（任務 M05 組 1-3；D62／D63）。

演算法與 TypeScript 逐步等價：Tb = 198.2 + ΣTbi、Tf = 122.5 + ΣTfi；基團依原子數由大到小、同大小依表 III 順序貪婪配對；
資料表直接讀專案的 src/data/joback_groups.csv（單一來源）。配對用 `vw.vw_matches`（RDKit.js 預設參數；命中內與命中之間的排序是 TS 演算法的一部分）。
加總用明確迴圈（不用內建 `sum()`）。格式有問題時拋出 `TableDataError`（TS 靜默丟列，記為已知差異）。
TS 的 `JOBACK_PAPER_LIMITS`（論文限制的引文清單）只供畫面顯示，不在計算路徑上，未搬。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Sequence

from .csv_reader import js_number, js_trim
from .mol_graph import MolGraph, mol_from_smiles, read_graph
from .tables import TableDataError, make_fail, read_data_file, read_records
from .vw import must_query, vw_matches

JOBACK_GROUPS_FILE = "joback_groups.csv"
JOBACK_GROUPS_COLUMNS = ["id", "基團名稱", "SMARTS", "原子數", "Tbi", "Tfi", "出處", "稽核狀態", "備註"]
JOBACK_TB_CONSTANT = 198.2
JOBACK_TF_CONSTANT = 122.5
JOBACK_MODEL = "Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243：式 (2) Tb = 198.2 + ΣTbi、式 (3) Tf = 122.5 + ΣTfi"
JOBACK_DISCLAIMER = "Joback 法為基團加成估算，僅用於小分子；數值為估算，非實測。"
POLYMER_NOT_APPLICABLE = "不適用（聚合物單元）：Joback 法只用於小分子，含連接點（*）的結構不計算"

_SYMBOLS = {
    1: "H", 3: "Li", 5: "B", 6: "C", 7: "N", 8: "O", 9: "F", 11: "Na", 12: "Mg", 13: "Al", 14: "Si", 15: "P", 16: "S", 17: "Cl",
    19: "K", 20: "Ca", 26: "Fe", 29: "Cu", 30: "Zn", 34: "Se", 35: "Br", 50: "Sn", 53: "I",
}  # fmt: skip
_NUMBER = re.compile(r"-?[0-9]+(?:\.[0-9]+)?", re.ASCII)
_ATOM_COUNT = re.compile(r"[123]", re.ASCII)


def _symbol_of(z: int) -> str:
    return _SYMBOLS.get(z, f"#{z}")


@dataclass(frozen=True)
class JobackGroupRow:
    id: str
    name: str
    smarts: str
    atom_count: int
    tbi: float
    tfi: float | None
    source: str
    audit: str
    notes: str
    order: int = 0


def read_joback_groups(text: str) -> tuple[list[JobackGroupRow], list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []
    fail = make_fail(JOBACK_GROUPS_FILE, issues)
    rows: list[JobackGroupRow] = []
    for rec, no in read_records(text, JOBACK_GROUPS_FILE, JOBACK_GROUPS_COLUMNS, fail) or []:
        id_, name, smarts, atom_text, tb_text, tf_text, source, audit, notes = rec
        ok = True
        if not _ATOM_COUNT.fullmatch(atom_text):
            fail(no, "原子數", f"只能是 1、2 或 3：「{atom_text}」")
            ok = False
        if not _NUMBER.fullmatch(tb_text):
            fail(no, "Tbi", f"不是數字：「{tb_text}」")
            ok = False
        if tf_text != "" and not _NUMBER.fullmatch(tf_text):
            fail(no, "Tfi", f"不是數字：「{tf_text}」")
            ok = False
        if not ok:
            continue
        rows.append(
            JobackGroupRow(id_, name, smarts, int(js_number(atom_text)), js_number(tb_text), None if tf_text == "" else js_number(tf_text), source, audit, notes)
        )
    return rows, issues


@lru_cache(maxsize=1)
def load_joback_groups() -> tuple[JobackGroupRow, ...]:
    rows, issues = read_joback_groups(read_data_file(JOBACK_GROUPS_FILE))
    if issues:
        raise TableDataError(issues)
    return tuple(rows)


def order_joback_groups(rows: Sequence[JobackGroupRow] | None = None) -> list[JobackGroupRow]:
    """依切分順序排列：原子數由大到小，同大小依表 III 順序。"""
    rows = load_joback_groups() if rows is None else rows
    indexed = [JobackGroupRow(**{**r.__dict__, "order": i}) for i, r in enumerate(rows)]
    return sorted(indexed, key=lambda r: (-r.atom_count, r.order))


def _describe_atom(g: MolGraph, i: int) -> str:
    h = g.h_count[i]
    label = f"{_symbol_of(g.z[i])}{('H' + (str(h) if h > 1 else '')) if h > 0 else ''}{'（芳香）' if g.aromatic[i] else ''}"
    near = "、".join(f"{_symbol_of(g.z[n])}{n}" for n in g.neighbors[i])
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


def compute_joback(smiles: str, rows: Sequence[JobackGroupRow] | None = None) -> dict[str, Any]:
    """對應 computeJoback。回傳與 TS 的 JobackResult 同樣欄位名稱的 dict（status 為 ok／missing／not-applicable／invalid）。"""
    if "*" in smiles:
        return {"status": "not-applicable", "smiles": smiles, "reason": POLYMER_NOT_APPLICABLE}
    if js_trim(smiles) == "":
        return {"status": "invalid", "smiles": smiles, "message": "沒有結構（SMILES 是空的）"}
    try:
        mol = mol_from_smiles(smiles)
    except Exception:  # noqa: BLE001 - 對應 TS 的 try/catch
        mol = None
    if mol is None:
        return {"status": "invalid", "smiles": smiles, "message": "RDKit 無法解析這個 SMILES"}
    g = read_graph(mol)
    n = len(g.z)
    if any(z == 0 for z in g.z):
        return {"status": "not-applicable", "smiles": smiles, "reason": POLYMER_NOT_APPLICABLE}
    if not any(z > 1 for z in g.z):
        return {"status": "invalid", "smiles": smiles, "message": "沒有重原子"}
    if _component_count(g) > 1:
        return {"status": "invalid", "smiles": smiles, "message": "含多個分子（以 . 分隔）；Joback 法一次只算一個分子"}

    # ---- 切分 ----
    owner = [-1] * n
    hits: list[dict[str, Any]] = []
    for row in order_joback_groups(rows):
        q = must_query(row.smarts)
        for atoms in vw_matches(mol, q):
            if any(owner[a] != -1 for a in atoms):
                continue
            for a in atoms:
                owner[a] = len(hits)
            hits.append({"row": row, "atoms": atoms})
    hits.sort(key=lambda h: (h["atoms"][0], h["row"].order))
    groups = [
        {"id": h["row"].id, "name": h["row"].name, "tbi": h["row"].tbi, "tfi": h["row"].tfi, "atoms": h["atoms"], "source": h["row"].source}
        for h in hits
    ]
    missing = [
        {"index": i, "element": _symbol_of(g.z[i]), "description": _describe_atom(g, i)} for i in range(n) if g.z[i] > 1 and owner[i] == -1
    ]
    if missing:
        return {"status": "missing", "smiles": smiles, "groups": groups, "missing": missing}

    # ---- 計算（明確迴圈，不用內建 sum） ----
    sum_tb = 0.0
    for h in groups:
        sum_tb = sum_tb + h["tbi"]
    tf_unavailable = list(dict.fromkeys(h["name"] for h in groups if h["tfi"] is None))
    sum_tf: float | None
    if len(tf_unavailable) > 0:
        sum_tf = None
    else:
        sum_tf = 0.0
        for h in groups:
            sum_tf = sum_tf + h["tfi"]
    tb_k = JOBACK_TB_CONSTANT + sum_tb
    tf_k = None if sum_tf is None else JOBACK_TF_CONSTANT + sum_tf
    return {
        "status": "ok",
        "smiles": smiles,
        "tbK": tb_k,
        "tbC": tb_k - 273.15,
        "tfK": tf_k,
        "tfC": None if tf_k is None else tf_k - 273.15,
        "sumTb": sum_tb,
        "sumTf": sum_tf,
        "tfUnavailable": tf_unavailable,
        "groups": groups,
        "sources": list(dict.fromkeys(h["source"] for h in groups)),
        "model": JOBACK_MODEL,
    }


def count_joback_groups(groups: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """把切分結果依基團 id 合併成「基團 × 個數」，依 id 排序（id 皆為 Jnn 的 ASCII 字串，與 localeCompare 順序相同）。"""
    merged: dict[str, dict[str, Any]] = {}
    for h in groups:
        e = merged.get(h["id"])
        if e is not None:
            e["count"] += 1
        else:
            merged[h["id"]] = {"id": h["id"], "name": h["name"], "tbi": h["tbi"], "tfi": h["tfi"], "count": 1}
    return sorted(merged.values(), key=lambda e: e["id"])
