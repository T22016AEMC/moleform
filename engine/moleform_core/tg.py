"""Tg（van Krevelen Yg 基團貢獻，含校準基團）。對應 src/core/properties/tgGroupContribution.ts
（任務 M02，PLAN 6A.4-02；D62／D63）。

演算法與 TypeScript 逐步等價；資料表直接讀專案的 src/data/yg_groups.csv、src/data/yg_calibrated_groups.csv
（單一來源，D18、D22；本模組不含任何基團數值）。TypeScript 仍是預設計算來源，本模組沒有接到介面。

與 TypeScript 逐步對應的幾個地方（任務 M02 的風險項）：

- R1 芳香性：`atom.GetIsAromatic()` 對應 TS 的 `aromaticAtoms`（mol_graph.read_graph）。
- R2 原子索引、氫數：缺基團的原子位置、基團 atoms、`describeAtom` 的氫數都用 read_graph 的結果，不重排。
- R3 SMARTS 配對：沿用 vw.py 的 `raw_matches`（明確設定與 RDKit.js 預設相同的 SubstructMatchParameters，保持 RDKit 給的
  原始順序）；TS `allMatches` 的兩個排序（命中內由小到大、命中之間依序比較）屬演算法本身，照搬（`all_matches`）。
- R4 SMARTS 解析：`Chem.MolFromSmarts` 對應 `RDKit.get_qmol`，無法解析時與 TS 一樣拋出（不靜默略過）。
- R5 改寫後重建分子（TS 的 `stripSubstituents`）：見 `strip_substituents` 的說明。
- 浮點加總與除法：一律用明確的迴圈由左至右累加（**不可用內建 `sum()`**，Python 3.12 的 `sum()` 對 float 使用補償加總，
  與 JS 的 `reduce` 結果可能在最後一位不同）；除法用 `_js_div`（JS 的除以零不拋例外）。
- 資料表格式有問題時直接拋出 `TgDataError`（D22；TS 的 `YG_GROUPS` 會靜默丟掉格式錯誤的列，記為已知差異，不改 TS）。
"""

from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Sequence

from rdkit import Chem

from .atomic_weights import atomic_weight
from .csv_reader import CsvError, js_number, js_trim, parse_csv
from .mol_graph import MolGraph, mol_from_smiles, read_graph
from .vw import DATA_DIR, raw_matches

# ---------- 常數（逐字取自 TS） ----------

TG_MODEL = (
    "van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 式 6.4–6.5："
    "Tg = 1000·ΣYgi ÷ M（Ygi：K·kg/mol；M：g/mol）"
)
TG_DISCLAIMER = (
    "本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。"
)

HYDROGEN_BOND_FAMILIES: tuple[str, ...] = (
    "A.urethane",
    "A.urea",
    "B.CONH",
    "T.NHCOpC6H4CONH",
    "T.NHCOmC6H4CONH",
    "T.NHpC6H4CO",
    "T.NHC6H4NHCOC6H4COp",
    "T.NHC6H4NHCOC6H4COm",
)
CONJ_UNDEFINED_FAMILIES: tuple[str, ...] = ("C.phthalimide",)
TG_MASS_TOLERANCE = 0.01
OXYGEN_MASS = 15.999
CALIBRATED_SECTION = "校準基團（非書中值）"
CALIBRATED_AUDIT_MARK = "校準值（非書中值）"
_SYMBOLS = {1: "H", 5: "B", 6: "C", 7: "N", 8: "O", 9: "F", 14: "Si", 15: "P", 16: "S", 17: "Cl", 35: "Br"}

YG_GROUPS_FILE = "yg_groups.csv"
YG_GROUPS_COLUMNS = [
    "id", "基團名稱", "SMARTS", "Ygi", "Mi", "共軛狀態", "表格區段", "類型", "條件", "出處", "稽核狀態",
    "正例 SMILES", "反例 SMILES", "備註",
]  # fmt: skip
YG_CALIBRATED_FILE = "yg_calibrated_groups.csv"
YG_CALIBRATED_COLUMNS = [
    "id", "基團名稱", "類型", "SMARTS", "Ygi", "Mi", "錨點", "推導", "檢驗", "稽核狀態", "正例 SMILES", "反例 SMILES",
]  # fmt: skip



# ---------- JS 相容的小工具 ----------


def _js_div(a: float, b: float) -> float:
    """JS 的 `/`：除以零不拋例外（0/0 → NaN；x/0 → ±Infinity，零的正負號照 IEEE）。"""
    if b == 0:
        if a == 0 or math.isnan(a):
            return math.nan
        negative = (a < 0) != (math.copysign(1.0, b) < 0)
        return -math.inf if negative else math.inf
    return a / b


_PAREN_NUMBER = re.compile(r"\((-?[0-9]+(?:\.[0-9]+)?)\)", re.ASCII)
_PLAIN_NUMBER = re.compile(r"-?[0-9]+(?:\.[0-9]+)?", re.ASCII)


def _split_list(s: str) -> tuple[str, ...]:
    return tuple(x for x in (js_trim(p) for p in s.split("|")) if x != "")


# ---------- 資料表 ----------


@dataclass(frozen=True)
class YgGroupRow:
    id: str
    name: str
    smarts: str
    ygi: float
    """Ygi（K·kg/mol）；書中以括號標示的暫定值去掉括號後存這裡，tentative 為 True"""
    mi: float
    tentative: bool
    state: str
    """n／c／cc；沒有共軛狀態的基團為空字串"""
    section: str
    kind: str
    condition: str
    source: str
    audit: str
    positives: tuple[str, ...]
    negatives: tuple[str, ...]
    notes: str


@dataclass(frozen=True)
class YgCalibratedRow:
    id: str
    name: str
    kind: str
    smarts: str
    ygi: float
    mi: float
    anchor: str
    derivation: str
    check: str
    audit: str
    positives: tuple[str, ...]
    negatives: tuple[str, ...]


class EmptyMoleculeError(ValueError):
    """分子沒有任何原子（空字串）：TS 的 computeTg 對此拋出例外，Python 同樣拋出（HTTP 介面先擋下，回 400）。"""


class TgDataError(Exception):
    """資料表格式錯誤（D22：不靜默略過）。"""

    def __init__(self, issues: list[str]):
        super().__init__("；".join(issues))
        self.issues = issues


def _read_records(text: str, file: str, columns: list[str]) -> tuple[list[list[str]], list[str]]:
    """共用的 CSV 前段（對應 readYgGroups／readYgCalibrated 的開頭）：回傳資料列（不含標題列）與問題清單。"""
    issues: list[str] = []

    def fail(row: int | None, message: str) -> None:
        where = " / ".join(x for x in [file, None if row is None else f"第 {row} 列"] if x is not None)
        issues.append(f"{where}：{message}")

    try:
        records = parse_csv(text)
    except CsvError as e:
        fail(None, f"CSV 格式錯誤：{e.message}")
        return [], issues
    if not records:
        fail(1, f"檔案是空的，缺少標題列（應為：{','.join(columns)}）")
        return [], issues
    header = records[0]
    if len(header) != len(columns) or any(h != columns[i] for i, h in enumerate(header)):
        fail(1, f"標題列與定義不一致。應為：{','.join(columns)}；實際為：{','.join(header)}")
        return [], issues
    return records[1:], issues


def read_yg_groups(text: str) -> tuple[list[YgGroupRow], list[str]]:
    """對應 readYgGroups；回傳 (rows, issues)。數值無法解析的列不收（與 TS 相同），問題寫在 issues。"""
    columns = YG_GROUPS_COLUMNS
    records, issues = _read_records(text, YG_GROUPS_FILE, columns)

    def fail(no: int, column: str | None, message: str) -> None:
        where = " / ".join(x for x in [YG_GROUPS_FILE, f"第 {no} 列", column] if x is not None)
        issues.append(f"{where}：{message}")

    rows: list[YgGroupRow] = []
    for r, rec in enumerate(records, start=1):
        no = r + 1
        if len(rec) != len(columns):
            fail(no, None, f"欄位數應為 {len(columns)}，實際為 {len(rec)}")
            continue
        cells = [js_trim(s) for s in rec]
        id_, name, smarts, ygi_text, mi_text, state, section, kind, condition, source, audit, pos, neg, notes = cells
        ygi = _parse_yg_number(ygi_text)
        mi = _parse_yg_number(mi_text)
        if ygi is None:
            fail(no, "Ygi", f"不是數字：「{ygi_text}」")
        if mi is None:
            fail(no, "Mi", f"不是數字：「{mi_text}」")
        if ygi is None or mi is None:
            continue
        rows.append(
            YgGroupRow(
                id=id_, name=name, smarts=smarts, ygi=ygi[0], mi=mi[0], tentative=ygi[1], state=state, section=section,
                kind=kind, condition=condition, source=source, audit=audit, positives=_split_list(pos),
                negatives=_split_list(neg), notes=notes,
            )
        )  # fmt: skip
    return rows, issues


def _parse_yg_number(text: str) -> tuple[float, bool] | None:
    """對應 parseNumber：括號數字是書中標為暫定的值（回傳 (值, True)）。"""
    t = js_trim(text)
    m = _PAREN_NUMBER.fullmatch(t)
    body = m.group(1) if m else t
    if not _PLAIN_NUMBER.fullmatch(body):
        return None
    return js_number(body), m is not None


def read_yg_calibrated(text: str) -> tuple[list[YgCalibratedRow], list[str]]:
    """對應 readYgCalibrated；回傳 (rows, issues)。"""
    columns = YG_CALIBRATED_COLUMNS
    records, issues = _read_records(text, YG_CALIBRATED_FILE, columns)

    def fail(no: int, column: str | None, message: str) -> None:
        where = " / ".join(x for x in [YG_CALIBRATED_FILE, f"第 {no} 列", column] if x is not None)
        issues.append(f"{where}：{message}")

    def to_number(text: str) -> float | None:
        t = js_trim(text)
        return js_number(t) if _PLAIN_NUMBER.fullmatch(t) else None

    rows: list[YgCalibratedRow] = []
    for r, rec in enumerate(records, start=1):
        no = r + 1
        if len(rec) != len(columns):
            fail(no, None, f"欄位數應為 {len(columns)}，實際為 {len(rec)}")
            continue
        cells = [js_trim(s) for s in rec]
        id_, name, kind, smarts, ygi_text, mi_text, anchor, derivation, check, audit, pos, neg = cells
        ygi = to_number(ygi_text)
        mi = to_number(mi_text)
        if ygi is None:
            fail(no, "Ygi", f"不是數字：「{ygi_text}」")
        if mi is None:
            fail(no, "Mi", f"不是數字：「{mi_text}」")
        if ygi is None or mi is None:
            continue
        rows.append(
            YgCalibratedRow(
                id=id_, name=name, kind=kind, smarts=smarts, ygi=ygi, mi=mi, anchor=anchor, derivation=derivation,
                check=check, audit=audit, positives=_split_list(pos), negatives=_split_list(neg),
            )
        )  # fmt: skip
    return rows, issues


def _read_file(name: str) -> str:
    with open(os.path.join(DATA_DIR, name), encoding="utf-8", newline="") as f:
        return f.read()


@lru_cache(maxsize=1)
def load_yg_groups() -> tuple[YgGroupRow, ...]:
    """書中基團表（Table 6.1／6.3），依資料表順序。格式有任何問題就拋出（TS 以測試保證無問題；這裡直接擋下）。"""
    rows, issues = read_yg_groups(_read_file(YG_GROUPS_FILE))
    if issues:
        raise TgDataError(issues)
    return tuple(rows)


@lru_cache(maxsize=1)
def load_yg_calibrated() -> tuple[YgCalibratedRow, ...]:
    """校準基團表（D54）。"""
    rows, issues = read_yg_calibrated(_read_file(YG_CALIBRATED_FILE))
    if issues:
        raise TgDataError(issues)
    return tuple(rows)


def calibrated_as_yg_row(r: YgCalibratedRow) -> YgGroupRow:
    """對應 calibratedAsYgRow：整體基團轉成切分程式使用的 Yg 基團列。"""
    return YgGroupRow(
        id=r.id, name=r.name, smarts=r.smarts, ygi=r.ygi, mi=r.mi, tentative=False, state="", section=CALIBRATED_SECTION,
        kind="組合基團", condition="", source=f"{CALIBRATED_AUDIT_MARK}：{r.anchor}", audit=r.audit,
        positives=r.positives, negatives=r.negatives, notes=r.derivation,
    )  # fmt: skip


def yg_family_id(row: YgGroupRow) -> str:
    """對應 ygFamilyId：有共軛狀態或條件的列去掉最後一段後綴，其餘就是 id 本身。"""
    if row.state == "" and row.condition == "":
        return row.id
    i = row.id.rfind(".")
    return row.id if i < 0 else row.id[:i]


# ---------- 家族 ----------


@dataclass(frozen=True)
class YgFamily:
    id: str
    name: str
    smarts: str
    section: str
    kind: str
    size: int
    """SMARTS 描述的基團原子數（以第一個正例的命中計）"""
    order: int
    rows: tuple[YgGroupRow, ...]


@lru_cache(maxsize=None)
def must_query(smarts: str) -> Chem.Mol:
    """對應 mustQuery（RDKit.get_qmol）。無法解析時拋出，與 TS 相同。"""
    q = Chem.MolFromSmarts(smarts)
    if q is None:
        raise ValueError(f"Yg 基團表的 SMARTS 無法解析：{smarts}")
    return q


def first_match(mol: Chem.Mol, query: Chem.Mol) -> list[int] | None:
    """對應 firstMatch（RDKit.js 的 get_substruct_match）；沒有命中回傳 None。"""
    m = mol.GetSubstructMatch(query)
    return list(m) if len(m) > 0 else None


def build_yg_families(rows: Sequence[YgGroupRow] | None = None) -> list[YgFamily]:
    """對應 buildYgFamilies：把資料表的列整理成家族（含 SMARTS 的基團原子數）；依切分順序排序。"""
    return list(_build_families(tuple(load_yg_groups() if rows is None else rows)))


@lru_cache(maxsize=16)
def _build_families(rows: tuple[YgGroupRow, ...]) -> tuple[YgFamily, ...]:
    by_id: dict[str, dict[str, Any]] = {}
    for order, r in enumerate(rows):
        fid = yg_family_id(r)
        f = by_id.get(fid)
        if f is None:
            f = {"id": fid, "name": r.name, "smarts": r.smarts, "section": r.section, "kind": r.kind, "order": order, "rows": []}
            by_id[fid] = f
        f["rows"].append(r)
    families: list[YgFamily] = []
    for f in by_id.values():
        sample = f["rows"][0].positives[0] if f["rows"][0].positives else None
        mol = mol_from_smiles(sample) if sample else None
        q = must_query(f["smarts"])
        atoms = first_match(mol, q) if mol is not None else None
        size = len(atoms) if atoms else 0
        families.append(
            YgFamily(f["id"], f["name"], f["smarts"], f["section"], f["kind"], size, f["order"], tuple(f["rows"]))
        )
    families.sort(key=lambda f: (-f.size, f.order))  # 穩定排序，與 JS 的 b.size - a.size || a.order - b.order 相同
    return tuple(families)


# ---------- 配對 ----------


def all_matches(mol: Chem.Mol, query: Chem.Mol) -> list[list[int]]:
    """對應 allMatches：RDKit 原始配對 → 每個命中的原子由小到大排序 → 命中之間依序逐項比較（前綴相同者較短在前）。"""
    lst = [sorted(m) for m in raw_matches(mol, query)]
    lst.sort()  # list 的字典序比較與 TS 的比較函式相同
    return lst


@dataclass(frozen=True)
class Candidate:
    family: YgFamily
    atoms: list[int]


def choose_partition(strategy: str, candidates: list[Candidate], g: MolGraph, dummies: list[int]) -> list[Candidate]:
    """對應 choosePartition：依規則從所有候選命中挑出互不重疊的切分；candidates 已依家族順序（大基團在前）排列。"""

    def greedy() -> list[Candidate]:
        taken: set[int] = set()
        picked: list[Candidate] = []
        for c in candidates:
            if any(a in taken or g.z[a] == 0 for a in c.atoms):
                continue
            taken.update(c.atoms)
            picked.append(c)
        return picked

    if strategy == "greedy":
        return greedy()
    usable = [c for c in candidates if all(g.z[a] != 0 for a in c.atoms)]
    if strategy == "fewest":
        heavy = [i for i, z in enumerate(g.z) if z > 1]
        by_atom: dict[int, list[int]] = {}
        for k, c in enumerate(usable):
            for a in c.atoms:
                by_atom[a] = [*by_atom.get(a, []), k]
        best: list[int] | None = None
        steps = 0
        covered: set[int] = set()
        chosen: list[int] = []

        def dfs() -> None:
            nonlocal best, steps
            steps += 1
            if steps > 200000:
                return
            if best is not None and len(chosen) >= len(best):
                return
            open_atoms = [a for a in heavy if a not in covered]
            if len(open_atoms) == 0:
                best = list(chosen)
                return
            pick = -1
            options: list[int] = []
            for a in open_atoms:
                opts = [k for k in by_atom.get(a, []) if all(x not in covered for x in usable[k].atoms)]
                if len(opts) == 0:
                    return
                if pick == -1 or len(opts) < len(options):
                    pick = a
                    options = opts
            for k in options:
                covered.update(usable[k].atoms)
                chosen.append(k)
                dfs()
                chosen.pop()
                for x in usable[k].atoms:
                    covered.discard(x)

        dfs()
        if best is None:
            return greedy()
        return [usable[k] for k in sorted(best)]
    # fromEnd
    start = next((n for n in g.neighbors[dummies[0]] if g.z[n] != 0), None) if len(dummies) > 0 else None
    dist: dict[int, int] = {}
    queue: list[int] = []
    if start is not None:
        dist[start] = 0
        queue.append(start)
    head = 0
    while head < len(queue):
        for n in g.neighbors[queue[head]]:
            if g.z[n] == 0 or n in dist:
                continue
            dist[n] = dist[queue[head]] + 1
            queue.append(n)
        head += 1
    order = sorted((i for i in range(len(g.z)) if g.z[i] > 1), key=lambda a: (dist.get(a, 1e9), a))
    taken: set[int] = set()
    picked: list[Candidate] = []
    for a in order:
        if a in taken:
            continue
        c = next((x for x in usable if a in x.atoms and all(y not in taken for y in x.atoms)), None)
        if c is None:
            continue
        taken.update(c.atoms)
        picked.append(c)
    return picked


def main_chain_atoms(g: MolGraph, dummies: list[int]) -> set[int] | None:
    """主鏈原子：兩個連接點的鄰居之間最短路徑上的原子；連接點不是正好兩個時回傳 None。"""
    if len(dummies) != 2:
        return None
    a = next((n for n in g.neighbors[dummies[0]] if g.z[n] != 0), None)
    b = next((n for n in g.neighbors[dummies[1]] if g.z[n] != 0), None)
    if a is None or b is None:
        return None
    prev: dict[int, int] = {a: -1}
    queue = [a]
    head = 0
    while head < len(queue):
        cur = queue[head]
        if cur == b:
            break
        for n in g.neighbors[cur]:
            if g.z[n] == 0 or n in prev:
                continue
            prev[n] = cur
            queue.append(n)
        head += 1
    if b not in prev:
        return None
    path: set[int] = set()
    cur = b
    while cur != -1:
        path.add(cur)
        cur = prev[cur]
    return path


def _symbol_of(z: int) -> str:
    return _SYMBOLS.get(z, f"#{z}")


def _describe_atom(g: MolGraph, i: int) -> str:
    h = g.h_count[i]
    label = f"{_symbol_of(g.z[i])}{('H' + (str(h) if h > 1 else '')) if h > 0 else ''}{'（芳香）' if g.aromatic[i] else ''}"
    near = "、".join("*" if g.z[n] == 0 else f"{_symbol_of(g.z[n])}{n}" for n in g.neighbors[i])
    return f"{label}，鄰居：{'無' if near == '' else near}"


def _state_of(sides: int) -> str:
    return "n" if sides <= 0 else "c" if sides == 1 else "cc"


# ---------- 只用書中基團（或指定 rows）的切分與計算 ----------


def _invalid(smiles: str, message: str) -> dict[str, Any]:
    return {"status": "invalid", "smiles": smiles, "message": message}


def compute_tg_book(
    smiles: str, rows: Sequence[YgGroupRow] | None = None, partition: str = "greedy"
) -> dict[str, Any]:
    """對應 computeTgBook（任務 026 起的規則，D54 之後不變）。"""
    try:
        mol = mol_from_smiles(smiles)
    except Exception:  # noqa: BLE001 - 對應 TS 的 try/catch：任何解析例外都視為無法解析
        mol = None
    if mol is None:
        return _invalid(smiles, "RDKit 無法解析這個 SMILES")
    if mol.GetNumAtoms() == 0:
        # TS：RDKit.js 的 get_mol('') 得到沒有原子的有效分子，之後 get_json() 對它拋出 WebAssembly 例外，computeTg 沒有接，直接拋出。
        # Python 端同樣拋出（黃金檔記為 { threw: true }）；HTTP 介面在呼叫前先擋下空白輸入（400）。
        raise EmptyMoleculeError("分子沒有任何原子（空字串）：TypeScript 的 computeTg 對此拋出例外")
    g = read_graph(mol)
    n = len(g.z)
    dummies = [i for i, z in enumerate(g.z) if z == 0]
    polymer = len(dummies) > 0
    families = build_yg_families(rows)

    # ---- 切分 ----
    owner = [-1] * n
    candidates: list[Candidate] = []
    for f in families:
        q = must_query(f.smarts)
        for atoms in all_matches(mol, q):
            candidates.append(Candidate(f, atoms))
    hits = choose_partition(partition, candidates, g, dummies)
    for k, h in enumerate(hits):
        for a in h.atoms:
            owner[a] = k

    # 連接點的週期性鄰接：正好兩個連接點時，各自的鄰居互為對面
    partner: dict[int, int] = {}
    if len(dummies) == 2:
        d1, d2 = dummies
        a1 = next((x for x in g.neighbors[d1] if g.z[x] != 0), None)
        a2 = next((x for x in g.neighbors[d2] if g.z[x] != 0), None)
        if a1 is not None and a2 is not None:
            partner[d1] = a2
            partner[d2] = a1

    def exits_of(atoms: list[int]) -> list[int | None]:
        members = set(atoms)
        out: list[int | None] = []
        for a in atoms:
            for nb in g.neighbors[a]:
                if nb in members:
                    continue
                out.append(partner.get(nb) if g.z[nb] == 0 else nb)
        return out

    main_chain = main_chain_atoms(g, dummies)
    hydrogen_bonded = any(h.family.id in HYDROGEN_BOND_FAMILIES for h in hits)

    # ---- 取值（共軛狀態、條件）與缺基團 ----
    missing_idx: set[int] = {i for i in range(n) if g.z[i] > 1 and owner[i] == -1}
    missing_notes: dict[int, str] = {}
    resolved: list[dict[str, Any]] = []
    for h in hits:
        f = h.family
        row: YgGroupRow | None = None
        note = ""
        if any(r.state != "" for r in f.rows):
            exits = exits_of(h.atoms)
            if f.section == "B 芳香環系統":
                sides = len([x for x in exits if x is not None and owner[x] >= 0 and hits[owner[x]].family.section == "B 雙鍵系統"])
            else:
                sides = len([x for x in exits if x is not None and g.aromatic[x]])
            state = _state_of(sides)
            row = next((r for r in f.rows if r.state == state), None)
            if row is None:
                note = f"{f.name} 在資料表沒有共軛狀態 {state} 的值"
            elif f.section == "B 芳香環系統" and any(
                x is not None and owner[x] >= 0 and hits[owner[x]].family.id in CONJ_UNDEFINED_FAMILIES for x in exits
            ):
                # 相鄰的 N-鄰苯二甲醯亞胺（書中標 c）與這個伸苯基的共軛狀態，書中沒有說清楚：不自行決定（任務 031，BPDA–PDA）
                row = None
                note = f"{f.name} 與相鄰的 N-鄰苯二甲醯亞胺的共軛狀態，書中沒有說清楚（待使用者決定）"
        elif any(r.condition != "" for r in f.rows):
            cond: str | None = None
            if f.id == "A.CH2":
                if main_chain is not None and h.atoms[0] not in main_chain:
                    note = "側鏈 –CH2–（書中要用式 6.6–6.8，程式未實作）"
                else:
                    cond = "hb" if hydrogen_bonded else "gen"
            elif f.id == "A.C(CH3)2":
                exits = exits_of(h.atoms)
                cond = "hindered" if len(exits) == 2 and all(x is not None and g.aromatic[x] for x in exits) else "free"
            elif f.id == "A.Si(CH3)2":
                exits = exits_of(h.atoms)
                cond = "hindered" if len(exits) == 2 and all(x is not None and g.aromatic[x] for x in exits) else "free"
            elif f.id == "B.CH=CH":
                key = f"{min(h.atoms[0], h.atoms[1])}-{max(h.atoms[0], h.atoms[1])}"
                stereo = g.double_bond_stereo.get(key)
                if stereo is None:
                    note = "–CH=CH– 沒有順反標示（書中 cis 3.8、trans 7.4），無法選值"
                else:
                    cond = stereo
            else:
                note = f"{f.name} 沒有條件判定規則"
            if cond is not None:
                row = next((r for r in f.rows if r.condition == cond), None)
                if row is None:
                    note = f"{f.name} 在資料表沒有條件 {cond} 的值"
        else:
            row = f.rows[0]
        if row is None:
            for a in h.atoms:
                missing_idx.add(a)
                missing_notes[a] = note
            continue
        resolved.append(
            {
                "familyId": f.id,
                "rowId": row.id,
                "name": row.name,
                "kind": row.kind,
                "ygi": row.ygi,
                "mi": row.mi,
                "state": row.state,
                "condition": row.condition,
                "tentative": row.tentative,
                "atoms": h.atoms,
                "source": row.source,
                "calibrated": row.section == CALIBRATED_SECTION,
            }
        )

    if len(missing_idx) > 0:
        missing = [
            {
                "index": i,
                "element": _symbol_of(g.z[i]),
                "description": f"{_describe_atom(g, i)}；{missing_notes[i]}" if missing_notes.get(i) else _describe_atom(g, i),
            }
            for i in sorted(missing_idx)
        ]
        return {"status": "missing", "smiles": smiles, "polymer": polymer, "containsCalibrated": False, "groups": resolved, "missing": missing}

    # ---- 計算（明確迴圈，不用內建 sum；見模組說明） ----
    sum_yg = 0.0
    for h in resolved:
        sum_yg = sum_yg + h["ygi"]
    sum_m = 0.0
    for h in resolved:
        sum_m = sum_m + h["mi"]
    formula_mass: float | None = 0.0
    hw = atomic_weight(1)
    assert hw is not None
    for i in range(n):
        if g.z[i] == 0:
            continue
        w = atomic_weight(g.z[i])
        if w is None:
            formula_mass = None
            break
        formula_mass = formula_mass + (w + g.h_count[i] * hw)
    mass_delta = None if formula_mass is None else sum_m - formula_mass
    tg_k = _js_div(1000 * sum_yg, sum_m)
    return {
        "status": "ok",
        "smiles": smiles,
        "polymer": polymer,
        "tgK": tg_k,
        "tgC": tg_k - 273.15,
        "sumYg": sum_yg,
        "sumM": sum_m,
        "containsCalibrated": any(h["calibrated"] for h in resolved),
        "formulaMass": formula_mass,
        "massDelta": mass_delta,
        "massWithinTolerance": None if mass_delta is None else abs(mass_delta) <= TG_MASS_TOLERANCE,
        "groups": resolved,
        "sources": list(dict.fromkeys(h["source"] for h in resolved)),
    }


# ---------- R5：移除取代基、補回氫、重建分子 ----------
#
# TS 的 stripSubstituents（tgGroupContribution.ts 約 491–514 行）做的事：
#   1. 用 RDKit.js 的 `mol.get_json()` 取得分子的 JSON（RDKit MolInterchange 格式）。JSON 的原子順序＝RDKit 原子索引；
#      每個原子只記錄與預設不同的欄位（z、impHs＝總氫數、chg、nRad、isotope、stereo＝四面體手性 cw／ccw）；
#      每個鍵記錄 bo（芳香環寫成 Kekulé 的單／雙鍵）、stereo（雙鍵順反）與 stereoAtoms；
#      芳香性另放在 `extensions[rdkitRepresentation]`（aromaticAtoms、aromaticBonds、cipRanks、atomRings）。
#   2. 在 JSON 上刪掉要移除的原子（酚羥基的 O）與連到它們的鍵；其餘原子重新編號（保持原順序）；
#      原本連到被移除原子的原子，impHs 加上被移除的鍵數（補回氫）。**鍵的 `atoms` 會重新編號，但 `stereoAtoms` 不會**。
#   3. `delete m.extensions`：丟掉芳香性等資訊，讓 RDKit 重新判定。JSON 沒有原子映射編號，所以 `[*:1]` 重建後是 `*`。
#   4. `RDKit.get_mol(JSON)` 重建分子（RDKit 對沒有 extensions 的 JSON 做完整 sanitize 與芳香性判定），再 `get_smiles()` 取
#      canonical SMILES；重建失敗（get_mol 回傳 null 或拋例外）→ 回傳 null，呼叫端退回書中基團的缺基團結果。
#
# Python 沒有 `get_json()` 的逐字對應，也不拿 JSON 字串來改：直接用 RDKit 物件做同一件事，分兩步，
# 對應 TS 的「改寫 JSON」與「get_mol(JSON)」：
#   `rewrite_without_atoms`：從分子讀出同一組欄位（Kekulé 化的複本，與 JSON 寫出器的鍵序一致）、刪原子、重新編號、補氫，
#       結果是與 TS 改寫後 JSON 的 atoms／bonds 同形的資料（可與黃金檔逐項比對原子順序與 stereoAtoms）。
#   `rebuild_molecule`：用 RWMol 從這份資料建出分子（原子逐一 AddAtom，NoImplicit＋明確氫數；鍵依序 AddBond；
#       最後才設雙鍵順反與 stereoAtoms），再 SanitizeMol（對應「沒有 extensions → 重新判定芳香性」）。
#   canonical SMILES 一律由 `Chem.MolToSmiles` 直接取得，**沒有任何字串後處理**。
# TS 這段的已知特性（Python 照做，不修正；報告第 3 節）：stereoAtoms 沒重新編號，所以含雙鍵順反的分子，被移除的原子索引
# 小於順反標示所指的原子時重建會失敗（→ None）；其他情形下 canonical SMILES 不帶雙鍵順反（RDKit 在無鍵方向資訊時
# 於輸出前清掉）。手性中心（cw／ccw）會保留。


@dataclass
class RebuiltAtom:
    z: int
    imp_hs: int
    chg: int
    n_rad: int
    isotope: int
    stereo: str


@dataclass
class RebuiltBond:
    a: int
    b: int
    bo: int
    stereo: str
    stereo_atoms: tuple[int, int] | None

    def to_json(self) -> dict[str, Any]:
        return {"atoms": [self.a, self.b], "bo": self.bo, "stereo": self.stereo, "stereoAtoms": list(self.stereo_atoms) if self.stereo_atoms else None}


_CHIRAL_NAME = {
    Chem.ChiralType.CHI_TETRAHEDRAL_CW: "cw",
    Chem.ChiralType.CHI_TETRAHEDRAL_CCW: "ccw",
    Chem.ChiralType.CHI_OTHER: "other",
}
_CHIRAL_TAG = {v: k for k, v in _CHIRAL_NAME.items()}
_STEREO_NAME = {
    Chem.BondStereo.STEREOCIS: "cis",
    Chem.BondStereo.STEREOZ: "cis",
    Chem.BondStereo.STEREOTRANS: "trans",
    Chem.BondStereo.STEREOE: "trans",
    Chem.BondStereo.STEREOANY: "either",
}
_STEREO_TAG = {"cis": Chem.BondStereo.STEREOCIS, "trans": Chem.BondStereo.STEREOTRANS, "either": Chem.BondStereo.STEREOANY}


def rewrite_without_atoms(mol: Chem.Mol, drop: set[int]) -> tuple[list[RebuiltAtom], list[RebuiltBond]]:
    """TS stripSubstituents 的「改寫 JSON」：移除 drop 的原子，其餘重新編號（保持原順序），補回氫。"""
    kek = Chem.Mol(mol)
    Chem.Kekulize(kek, clearAromaticFlags=True)  # JSON 把芳香環寫成 Kekulé 的單／雙鍵
    n = kek.GetNumAtoms()
    remap: dict[int, int] = {}
    k = 0
    for i in range(n):
        if i not in drop:
            remap[i] = k
            k += 1
    host_hs: dict[int, int] = {}
    for b in kek.GetBonds():
        x, y = b.GetBeginAtomIdx(), b.GetEndAtomIdx()
        if y in drop and x not in drop:
            host_hs[x] = host_hs.get(x, 0) + 1
        if x in drop and y not in drop:
            host_hs[y] = host_hs.get(y, 0) + 1
    atoms: list[RebuiltAtom] = []
    for i in range(n):
        if i in drop:
            continue
        a = kek.GetAtomWithIdx(i)
        atoms.append(
            RebuiltAtom(
                z=a.GetAtomicNum(),
                imp_hs=a.GetTotalNumHs() + host_hs.get(i, 0),
                chg=a.GetFormalCharge(),
                n_rad=a.GetNumRadicalElectrons(),
                isotope=a.GetIsotope(),
                stereo=_CHIRAL_NAME.get(a.GetChiralTag(), "unspecified"),
            )
        )
    bonds: list[RebuiltBond] = []
    for b in kek.GetBonds():
        x, y = b.GetBeginAtomIdx(), b.GetEndAtomIdx()
        if x in drop or y in drop:
            continue
        stereo = _STEREO_NAME.get(b.GetStereo(), "unspecified")
        sa = list(b.GetStereoAtoms())
        # stereoAtoms 保持原始索引、不重新編號（TS 只重新編號鍵的 atoms，見上方說明）
        stereo_atoms = (sa[0], sa[1]) if stereo in ("cis", "trans") and len(sa) == 2 else None
        bonds.append(RebuiltBond(remap[x], remap[y], int(b.GetBondType()), stereo, stereo_atoms))
    return atoms, bonds


def rebuild_molecule(atoms: list[RebuiltAtom], bonds: list[RebuiltBond]) -> Chem.Mol:
    """TS 的 `RDKit.get_mol(JSON)`：由原子與鍵的資料建出分子並 sanitize（沒有芳香性資訊，由 RDKit 重新判定）。
    重建失敗（例如 stereoAtoms 不是鍵端原子的鄰居）時拋出例外。"""
    rw = Chem.RWMol()
    for a in atoms:
        na = Chem.Atom(a.z)
        na.SetFormalCharge(a.chg)
        na.SetIsotope(a.isotope)
        na.SetNumRadicalElectrons(a.n_rad)
        na.SetNoImplicit(True)
        na.SetNumExplicitHs(a.imp_hs)
        if a.stereo in _CHIRAL_TAG:
            na.SetChiralTag(_CHIRAL_TAG[a.stereo])
        rw.AddAtom(na)
    for b in bonds:
        rw.AddBond(b.a, b.b, Chem.BondType.values[b.bo])
    for b in bonds:  # 順反標示要等所有鍵都建好才設（stereoAtoms 必須是鍵端原子的鄰居）
        if b.stereo in _STEREO_TAG:
            bond = rw.GetBondBetweenAtoms(b.a, b.b)
            if b.stereo_atoms is not None:
                bond.SetStereoAtoms(b.stereo_atoms[0], b.stereo_atoms[1])
            bond.SetStereo(_STEREO_TAG[b.stereo])
    out = rw.GetMol()
    Chem.SanitizeMol(out)
    return out


@dataclass
class StripOutcome:
    """一次「移除取代基並重建」的完整紀錄（測試用來與 TS 黃金檔逐項比對）。"""

    atoms: list[RebuiltAtom]
    bonds: list[RebuiltBond]
    built: bool
    """重建分子成功（對應 TS 的 get_mol 回傳有效分子）"""
    smiles: str | None
    """canonical SMILES（`Chem.MolToSmiles`，沒有任何字串後處理）；重建失敗為 None"""


def strip_outcome(mol: Chem.Mol, drop: set[int]) -> StripOutcome:
    atoms, bonds = rewrite_without_atoms(mol, drop)
    try:
        out = rebuild_molecule(atoms, bonds)
        return StripOutcome(atoms, bonds, True, Chem.MolToSmiles(out))
    except Exception:  # noqa: BLE001 - 對應 TS：get_mol 回傳 null／拋例外 → null
        return StripOutcome(atoms, bonds, False, None)


def strip_substituents(mol: Chem.Mol, drop: set[int]) -> str | None:
    """對應 stripSubstituents：移除指定原子（取代基）並把與它相連的原子補回一個氫，回傳新的 canonical SMILES；失敗回傳 None。"""
    return strip_outcome(mol, drop).smiles


def increment_sites(mol: Chem.Mol, row: YgCalibratedRow) -> list[int]:
    """對應 incrementSites：找出「H 換成 X」增量基團的原子（SMARTS 只描述取代基原子本身）。"""
    q = must_query(row.smarts)
    return [a[0] for a in all_matches(mol, q)]


# ---------- 含校準基團的完整計算 ----------


def compute_tg(
    smiles: str,
    *,
    rows: Sequence[YgGroupRow] | None = None,
    partition: str = "greedy",
    calibrated: bool = True,
    calibrated_rows: Sequence[YgCalibratedRow] | None = None,
) -> dict[str, Any]:
    """對應 computeTg（任務 026；含校準基團，任務 033、D54）。回傳與 TS 的 TgResult 同樣欄位名稱的 dict（status 為 ok／missing／invalid）。

    書中基團先配對：只用書中基團就能完整切分時，結果與 compute_tg_book 完全相同。書中基團配不到（缺基團）時才試校準基團：
    整體基團與書中基團一起參加切分；「H 換成 X」增量先把取代基換回氫（Table 6.20 的做法），用書中基團切分，再加上 n × ΔYg、n × ΔM。
    加上校準基團仍然配不完時，回傳只用書中基團的缺基團結果。
    """
    book = compute_tg_book(smiles, rows, partition)
    if book["status"] != "missing" or calibrated is False:
        return book
    cal_rows = tuple(load_yg_calibrated() if calibrated_rows is None else calibrated_rows)
    if len(cal_rows) == 0:
        return book
    whole_rows = [calibrated_as_yg_row(r) for r in cal_rows if r.kind == "整體基團"]
    inc_rows = [r for r in cal_rows if r.kind == "H 換成 X 增量"]
    try:
        mol = mol_from_smiles(smiles)
    except Exception:  # noqa: BLE001
        mol = None
    if mol is None:
        return book
    sites: list[tuple[YgCalibratedRow, int]] = []
    for r in inc_rows:
        for atom in increment_sites(mol, r):
            sites.append((r, atom))
    work = smiles
    if len(sites) > 0:
        stripped = strip_substituents(mol, {atom for _, atom in sites})
        if stripped is None:
            return book
        work = stripped
    book_rows = load_yg_groups() if rows is None else rows
    second = compute_tg_book(work, [*book_rows, *whole_rows], partition)
    if second["status"] != "ok":
        return book
    add_yg = 0.0
    for r, _ in sites:
        add_yg = add_yg + r.ygi
    add_m = 0.0
    for r, _ in sites:
        add_m = add_m + r.mi
    sum_yg = second["sumYg"] + add_yg
    sum_m = second["sumM"] + add_m
    formula_mass = None if second["formulaMass"] is None else second["formulaMass"] + len(sites) * OXYGEN_MASS
    mass_delta = None if formula_mass is None else sum_m - formula_mass
    groups = [
        *second["groups"],
        *(
            {
                "familyId": r.id,
                "rowId": r.id,
                "name": r.name,
                "kind": r.kind,
                "ygi": r.ygi,
                "mi": r.mi,
                "state": "",
                "condition": "",
                "tentative": False,
                "atoms": [atom],
                "source": f"校準值（非書中值）：{r.anchor}",
                "calibrated": True,
            }
            for r, atom in sites
        ),
    ]
    tg_k = _js_div(1000 * sum_yg, sum_m)
    return {
        **second,
        "smiles": smiles,
        "tgK": tg_k,
        "tgC": tg_k - 273.15,
        "sumYg": sum_yg,
        "sumM": sum_m,
        "containsCalibrated": any(x["calibrated"] for x in groups),
        "formulaMass": formula_mass,
        "massDelta": mass_delta,
        "massWithinTolerance": None if mass_delta is None else abs(mass_delta) <= TG_MASS_TOLERANCE,
        "groups": groups,
        "sources": list(dict.fromkeys(x["source"] for x in groups)),
    }
