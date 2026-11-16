"""使用者定義的經驗自由體積法 Vf = Vω × 經驗係數。對應 src/core/properties/freeVolume.ts 與 src/core/data/freeVolumeTables.ts
（任務 M05 組 1-1；D62／D63）。

演算法與 TypeScript 逐步等價；資料表直接讀專案的 src/data/free_volume_{groups,corrections,coefficients}.csv（單一來源，D18、D22）。
TypeScript 仍是預設計算來源，本模組沒有接到介面。

與 TS 對應的幾個地方：
- 配對：`vw.vw_matches`（RDKit.js 預設的 SubstructMatchParameters）；基團命中再去掉「情境原子」（依查詢原子序），佔用原子由小到大排序，
  命中之間逐項比較排序（`group_matches`）。修正項的命中依「排序後的原子集合」去重。
- 浮點加總一律用明確迴圈由左至右累加（不用內建 `sum()`）；除法用 `js_div`。
- 資料表格式有問題時直接拋出 `TableDataError`（TS 的 `FREE_VOLUME_*` 靜默丟掉格式錯誤的列，記為已知差異）。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Mapping, Sequence

from rdkit import Chem

from .copolymer import analyze_polymer_units
from .csv_reader import js_number, js_trim
from .js_compat import js_div
from .mol_graph import MolGraph, mol_from_smiles, read_graph
from .tables import TableDataError, make_fail, read_data_file, read_records
from .vm import compute_molar_volume_density
from .vw import raw_matches, vw_matches

FREE_VOLUME_GROUPS_FILE = "free_volume_groups.csv"
FREE_VOLUME_COEFFICIENTS_FILE = "free_volume_coefficients.csv"
FREE_VOLUME_CORRECTIONS_FILE = "free_volume_corrections.csv"
FREE_VOLUME_GROUPS_COLUMNS = ["id", "基團名稱", "SMARTS", "原子數", "情境原子", "Vω", "出處", "稽核狀態", "備註"]
FREE_VOLUME_COEFFICIENTS_COLUMNS = ["id", "類別", "係數", "辨識方式", "SMARTS", "優先順序", "出處", "稽核狀態", "備註"]
FREE_VOLUME_CORRECTIONS_COLUMNS = ["id", "修正名稱", "SMARTS", "修正量", "出處", "稽核狀態", "備註"]

FREE_VOLUME_MODEL = (
    "使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證）：Vf = Vω × 經驗係數，Vω = Σ 基團 Vω − Σ Bondi (1964) Table XVII 修正"
    "（自由體積算法_使用者表.xlsx；芳香 C 依 Bondi Table XV 分 C–H 8.11（使用者值）、取代 5.54、縮合 4.74，任務 036d、D60；不另計芳香 H）；"
    "不是 van Krevelen 書中的自由體積分率，不用於 CTE"
)
FREE_VOLUME_DISCLAIMER = "使用者定義的經驗法，非書中的自由體積分率，未經獨立驗證；以 cm³/mol（結構單元或分子）表示。"
FREE_VOLUME_VA_NOTE = "Vf／Va 的 Va 用書的 Table 4.10（任務 029）計算，非使用者定義"

_SYMBOLS = {1: "H", 5: "B", 6: "C", 7: "N", 8: "O", 9: "F", 14: "Si", 15: "P", 16: "S", 17: "Cl", 35: "Br", 53: "I"}

_NUMBER = re.compile(r"-?[0-9]+(?:\.[0-9]+)?", re.ASCII)
_ATOM_COUNT = re.compile(r"[0-9]+", re.ASCII)
_CONTEXT = re.compile(r"[0-9]+(?:;[0-9]+)*", re.ASCII)


def _symbol_of(z: int) -> str:
    return _SYMBOLS.get(z, f"#{z}")


# ---------- 資料表 ----------


@dataclass(frozen=True)
class FreeVolumeGroupRow:
    id: str
    name: str
    smarts: str
    atom_count: int
    context: tuple[int, ...]
    vw: float
    source: str
    audit: str
    notes: str
    order: int = 0


@dataclass(frozen=True)
class FreeVolumeCorrectionRow:
    id: str
    name: str
    smarts: str
    decrement: float
    source: str
    audit: str
    notes: str


@dataclass(frozen=True)
class FreeVolumeCoefficientRow:
    id: str
    name: str
    coefficient: float
    mode: str
    smarts: str
    priority: int
    source: str
    audit: str
    notes: str


def read_free_volume_groups(text: str) -> tuple[list[FreeVolumeGroupRow], list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []
    fail = make_fail(FREE_VOLUME_GROUPS_FILE, issues)
    rows: list[FreeVolumeGroupRow] = []
    for rec, no in read_records(text, FREE_VOLUME_GROUPS_FILE, FREE_VOLUME_GROUPS_COLUMNS, fail) or []:
        id_, name, smarts, atom_text, context_text, vw_text, source, audit, notes = rec
        ok = True
        context: list[int] = []
        if context_text != "":
            if not _CONTEXT.fullmatch(context_text):
                fail(no, "情境原子", f"只能是以分號分隔的原子序（從 0 起算）：「{context_text}」")
                ok = False
            else:
                context = [int(js_number(x)) for x in context_text.split(";")]
        if not _ATOM_COUNT.fullmatch(atom_text) or js_number(atom_text) < 1 or js_number(atom_text) > 10:
            fail(no, "原子數", f"只能是 1–10 的整數：「{atom_text}」")
            ok = False
        if not _NUMBER.fullmatch(vw_text):
            fail(no, "Vω", f"不是數字：「{vw_text}」")
            ok = False
        if not ok:
            continue
        rows.append(
            FreeVolumeGroupRow(id_, name, smarts, int(js_number(atom_text)), tuple(context), js_number(vw_text), source, audit, notes)
        )
    return rows, issues


def read_free_volume_coefficients(text: str) -> tuple[list[FreeVolumeCoefficientRow], list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []
    fail = make_fail(FREE_VOLUME_COEFFICIENTS_FILE, issues)
    rows: list[FreeVolumeCoefficientRow] = []
    for rec, no in read_records(text, FREE_VOLUME_COEFFICIENTS_FILE, FREE_VOLUME_COEFFICIENTS_COLUMNS, fail) or []:
        id_, name, coef_text, mode, smarts, priority_text, source, audit, notes = rec
        ok = True
        if not _NUMBER.fullmatch(coef_text):
            fail(no, "係數", f"不是數字：「{coef_text}」")
            ok = False
        if not _ATOM_COUNT.fullmatch(priority_text) or js_number(priority_text) < 1:
            fail(no, "優先順序", f"只能是正整數：「{priority_text}」")
            ok = False
        if not ok:
            continue
        rows.append(
            FreeVolumeCoefficientRow(id_, name, js_number(coef_text), mode, smarts, int(js_number(priority_text)), source, audit, notes)
        )
    return rows, issues


def read_free_volume_corrections(text: str) -> tuple[list[FreeVolumeCorrectionRow], list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []
    fail = make_fail(FREE_VOLUME_CORRECTIONS_FILE, issues)
    rows: list[FreeVolumeCorrectionRow] = []
    for rec, no in read_records(text, FREE_VOLUME_CORRECTIONS_FILE, FREE_VOLUME_CORRECTIONS_COLUMNS, fail) or []:
        id_, name, smarts, dec_text, source, audit, notes = rec
        if not _NUMBER.fullmatch(dec_text) or js_number(dec_text) <= 0:
            fail(no, "修正量", f"只能是正數（從 Vω 減去的量）：「{dec_text}」")
            continue
        rows.append(FreeVolumeCorrectionRow(id_, name, smarts, js_number(dec_text), source, audit, notes))
    return rows, issues


@lru_cache(maxsize=1)
def load_free_volume_groups() -> tuple[FreeVolumeGroupRow, ...]:
    rows, issues = read_free_volume_groups(read_data_file(FREE_VOLUME_GROUPS_FILE))
    if issues:
        raise TableDataError(issues)
    return tuple(rows)


@lru_cache(maxsize=1)
def load_free_volume_coefficients() -> tuple[FreeVolumeCoefficientRow, ...]:
    rows, issues = read_free_volume_coefficients(read_data_file(FREE_VOLUME_COEFFICIENTS_FILE))
    if issues:
        raise TableDataError(issues)
    return tuple(rows)


@lru_cache(maxsize=1)
def load_free_volume_corrections() -> tuple[FreeVolumeCorrectionRow, ...]:
    rows, issues = read_free_volume_corrections(read_data_file(FREE_VOLUME_CORRECTIONS_FILE))
    if issues:
        raise TableDataError(issues)
    return tuple(rows)


def order_free_volume_groups(rows: Sequence[FreeVolumeGroupRow] | None = None) -> list[FreeVolumeGroupRow]:
    """依切分順序排列：原子數由大到小，同大小依資料表順序（穩定排序）。"""
    rows = load_free_volume_groups() if rows is None else rows
    indexed = [FreeVolumeGroupRow(**{**r.__dict__, "order": i}) for i, r in enumerate(rows)]
    return sorted(indexed, key=lambda r: (-r.atom_count, r.order))


@lru_cache(maxsize=None)
def must_query(smarts: str) -> Chem.Mol:
    q = Chem.MolFromSmarts(smarts)
    if q is None:
        raise ValueError(f"自由體積資料表的 SMARTS 無法解析：{smarts}")
    return q


# ---------- 橋環偵測 ----------


def has_bridged_aliphatic_ring(g: MolGraph) -> bool:
    """對應 hasBridgedAliphaticRing：非芳香原子的環系統中是否有橋環或籠狀結構（三條互不相交、各至少兩個鍵的路徑）。"""
    n = len(g.z)

    def in_set(i: int) -> bool:
        return g.z[i] != 0 and not g.aromatic[i]

    adj: list[list[int]] = [[v for v in g.neighbors[i] if in_set(v)] if in_set(i) else [] for i in range(n)]
    disc = [-1] * n
    low = [0] * n
    bridge: set[str] = set()
    time = [0]

    def key(a: int, b: int) -> str:
        return f"{a}-{b}" if a < b else f"{b}-{a}"

    def dfs(u: int, parent: int) -> None:
        disc[u] = low[u] = time[0]
        time[0] += 1
        for v in adj[u]:
            if v == parent:
                continue
            if disc[v] == -1:
                dfs(v, u)
                low[u] = min(low[u], low[v])
                if low[v] > disc[u]:
                    bridge.add(key(u, v))
            else:
                low[u] = min(low[u], disc[v])

    for i in range(n):
        if in_set(i) and disc[i] == -1:
            dfs(i, -1)
    ring = [[v for v in lst if key(u, v) not in bridge] for u, lst in enumerate(adj)]
    heavy = [len(lst) for lst in ring]
    for a in range(n):
        if heavy[a] < 3:
            continue
        for b in range(a + 1, n):
            if heavy[b] < 3:
                continue
            if _disjoint_paths(ring, a, b) >= 3:
                return True
    return False


def _disjoint_paths(ring: Sequence[Sequence[int]], a: int, b: int) -> int:
    """a 到 b 的內部頂點互不相交的路徑數（不用 a–b 直接的鍵）；頂點容量 1 的最大流，最多數到 3。"""
    n = len(ring)
    cap: dict[str, int] = {}
    nbr: list[list[int]] = [[] for _ in range(2 * n)]

    def add_edge(x: int, y: int, c: int) -> None:
        k = f"{x}>{y}"
        if k not in cap:
            nbr[x].append(y)
            if f"{y}>{x}" not in cap:
                cap[f"{y}>{x}"] = 0
                nbr[y].append(x)
        cap[k] = cap.get(k, 0) + c

    for v in range(n):
        if len(ring[v]) == 0:
            continue
        add_edge(2 * v, 2 * v + 1, 99 if v == a or v == b else 1)
        for w in ring[v]:
            if (v == a and w == b) or (v == b and w == a):
                continue
            add_edge(2 * v + 1, 2 * w, 1)
    s = 2 * a + 1
    t = 2 * b
    flow = 0
    while flow < 3:
        prev: dict[int, int] = {s: -1}
        queue = [s]
        qi = 0
        while qi < len(queue) and t not in prev:
            u = queue[qi]
            for v in nbr[u]:
                if v not in prev and cap.get(f"{u}>{v}", 0) > 0:
                    prev[v] = u
                    queue.append(v)
            qi += 1
        if t not in prev:
            break
        v = t
        while prev[v] != -1:
            u = prev[v]
            cap[f"{u}>{v}"] = cap.get(f"{u}>{v}", 0) - 1
            cap[f"{v}>{u}"] = cap.get(f"{v}>{u}", 0) + 1
            v = u
        flow += 1
    return flow


def has_aliphatic_ring(g: MolGraph) -> bool:
    """有沒有非芳香的環（含環氧環）：非芳香原子的誘導子圖，邊數 > 頂點數 − 連通分量數。"""
    n = len(g.z)

    def in_set(i: int) -> bool:
        return g.z[i] != 0 and not g.aromatic[i]

    seen = [False] * n
    verts = 0
    edges = 0
    comps = 0
    for i in range(n):
        if not in_set(i):
            continue
        verts += 1
        edges += len([j for j in g.neighbors[i] if j > i and in_set(j)])
        if seen[i]:
            continue
        comps += 1
        stack = [i]
        seen[i] = True
        while stack:
            u = stack.pop()
            for v in g.neighbors[u]:
                if in_set(v) and not seen[v]:
                    seen[v] = True
                    stack.append(v)
    return edges > verts - comps


# ---------- 共用 ----------


def _describe_atom(g: MolGraph, i: int) -> str:
    h = g.h_count[i]
    label = f"{_symbol_of(g.z[i])}{('H' + (str(h) if h > 1 else '')) if h > 0 else ''}{'（芳香）' if g.aromatic[i] else ''}"
    near = "、".join("*" if g.z[n] == 0 else f"{_symbol_of(g.z[n])}{n}" for n in g.neighbors[i])
    return f"{label}，鄰居：{'無' if near == '' else near}"


def _component_count(g: MolGraph) -> int:
    seen = [False] * len(g.z)
    count = 0
    for i in range(len(g.z)):
        if seen[i]:
            continue
        count += 1
        stack = [i]
        seen[i] = True
        while stack:
            u = stack.pop()
            for v in g.neighbors[u]:
                if not seen[v]:
                    seen[v] = True
                    stack.append(v)
    return count


def group_matches(mol: Chem.Mol, query: Chem.Mol, context: Sequence[int]) -> list[list[int]]:
    """對應 groupMatches：去掉情境原子（依查詢原子序）後的佔用原子（由小到大），命中之間逐項比較排序。"""
    lst = [sorted(a for qi, a in enumerate(m) if qi not in context) for m in raw_matches(mol, query)]
    lst.sort()
    return lst


def count_free_volume_corrections(mol: Chem.Mol, rows: Sequence[FreeVolumeCorrectionRow] | None = None) -> list[dict[str, Any]]:
    """對應 countFreeVolumeCorrections：每個修正項的命中依命中原子集合去重（同一個環、同一個酯基只算一次）。"""
    rows = load_free_volume_corrections() if rows is None else rows
    out: list[dict[str, Any]] = []
    for row in rows:
        q = must_query(row.smarts)
        keys: set[tuple[int, ...]] = set()
        for m in raw_matches(mol, q):
            keys.add(tuple(sorted(m)))
        if len(keys) > 0:
            out.append(
                {"id": row.id, "name": row.name, "decrement": row.decrement, "count": len(keys), "contribution": -len(keys) * row.decrement}
            )
    return out


def _coefficient_by_id(rows: Sequence[FreeVolumeCoefficientRow], id_: str) -> FreeVolumeCoefficientRow:
    for r in rows:
        if r.id == id_:
            return r
    raise ValueError(f"自由體積係數表缺少 {id_}")


def _pick_coefficient(mol: Chem.Mol, g: MolGraph, rows: Sequence[FreeVolumeCoefficientRow]) -> dict[str, Any]:
    def pick(id_: str, reason: str) -> dict[str, Any]:
        r = _coefficient_by_id(rows, id_)
        return {"id": r.id, "name": r.name, "coefficient": r.coefficient, "reason": reason}

    def matches(smarts: str) -> bool:
        return len(vw_matches(mol, must_query(smarts))) > 0

    sbi = _coefficient_by_id(rows, "FC01")
    arom = _coefficient_by_id(rows, "FC03")
    if matches(sbi.smarts):
        return pick("FC01", "含螺雙茚滿（SBI）螺環骨架")
    if has_bridged_aliphatic_ring(g):
        return pick("FC02", "含橋環或籠狀脂環（金剛烷、降冰片烷等）")
    if matches(arom.smarts):
        return pick("FC03", "含芳香環")
    if has_aliphatic_ring(g):
        return pick("FC05", "有脂環（含環氧環）、無芳香環、非橋環")
    return pick("FC04", "無環的脂肪族")


def _invalid(smiles: str, message: str) -> dict[str, Any]:
    return {"status": "invalid", "smiles": smiles, "message": message}


def compute_free_volume_unit(
    smiles: str,
    groups: Sequence[FreeVolumeGroupRow] | None = None,
    corrections: Sequence[FreeVolumeCorrectionRow] | None = None,
    coefficients: Sequence[FreeVolumeCoefficientRow] | None = None,
) -> dict[str, Any]:
    """對應 computeFreeVolumeUnit：一個單元（聚合物的重複單元或小分子）的 Vω、係數、Vf。"""
    if js_trim(smiles) == "":
        return _invalid(smiles, "沒有結構（SMILES 是空的）")
    try:
        mol = mol_from_smiles(smiles)
    except Exception:  # noqa: BLE001 - 對應 TS 的 try/catch
        mol = None
    if mol is None:
        return _invalid(smiles, "RDKit 無法解析這個 SMILES")
    g = read_graph(mol)
    n = len(g.z)
    polymer = any(z == 0 for z in g.z)
    if not any(z > 1 for z in g.z):
        return _invalid(smiles, "沒有重原子")
    if _component_count(g) > 1:
        return _invalid(smiles, "含多個分子（以 . 分隔）；一次只算一個分子或一個重複單元")

    # ---- 切分 ----
    owner = [-1] * n
    hits: list[dict[str, Any]] = []
    for row in order_free_volume_groups(groups):
        q = must_query(row.smarts)
        for atoms in group_matches(mol, q, row.context):
            if any(owner[a] != -1 or g.z[a] == 0 for a in atoms):
                continue
            for a in atoms:
                owner[a] = len(hits)
            hits.append({"row": row, "atoms": atoms})
    hits.sort(key=lambda h: (h["atoms"][0], h["row"].order))
    group_hits = [{"id": h["row"].id, "name": h["row"].name, "vw": h["row"].vw, "atoms": h["atoms"], "source": h["row"].source} for h in hits]
    missing = [
        {"index": i, "element": _symbol_of(g.z[i]), "description": _describe_atom(g, i)}
        for i in range(n)
        if g.z[i] > 1 and owner[i] == -1
    ]
    if missing:
        return {"status": "missing", "smiles": smiles, "polymer": polymer, "groups": group_hits, "missing": missing}

    # ---- 計算（明確迴圈，不用內建 sum） ----
    vomega_groups = 0.0
    for h in group_hits:
        vomega_groups = vomega_groups + h["vw"]
    corr = count_free_volume_corrections(mol, corrections)
    corr_sum = 0.0
    for c in corr:
        corr_sum = corr_sum + c["contribution"]
    vomega = vomega_groups + corr_sum
    coefficient = _pick_coefficient(mol, g, load_free_volume_coefficients() if coefficients is None else coefficients)
    return {
        "status": "ok",
        "smiles": smiles,
        "polymer": polymer,
        "vomega": vomega,
        "vomegaGroups": vomega_groups,
        "corrections": corr,
        "coefficient": coefficient,
        "vf": vomega * coefficient["coefficient"],
        "groups": group_hits,
        "contributions": count_free_volume_groups(group_hits),
        "sources": list(dict.fromkeys(h["source"] for h in group_hits)),
    }


def count_free_volume_groups(groups: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """把切分結果依基團 id 合併成「基團 × 個數 × 貢獻」；依 id 排序（id 皆為 FVnn 的 ASCII 字串，與 localeCompare 順序相同）。"""
    merged: dict[str, dict[str, Any]] = {}
    for h in groups:
        cur = merged.get(h["id"])
        if cur is not None:
            cur["count"] += 1
            cur["contribution"] += h["vw"]
        else:
            merged[h["id"]] = {"id": h["id"], "name": h["name"], "vw": h["vw"], "count": 1, "contribution": h["vw"]}
    return sorted(merged.values(), key=lambda e: e["id"])


def _va_of(smiles: str) -> dict[str, Any]:
    r = compute_molar_volume_density(smiles)
    if r["status"] == "ok" and r["amorphous"] is not None:
        return {"va": r["amorphous"]["vm"], "note": None}
    if r["status"] == "missing":
        return {"va": None, "note": "缺 Va（Table 4.10 缺基團）"}
    if r["status"] == "unsupported":
        return {"va": None, "note": "缺 Va（小分子液體的莫耳體積未實作，任務 029 範圍只有聚合物）"}
    return {"va": None, "note": f"缺 Va（{r['message'] if r['status'] == 'invalid' else '無法計算'}）"}


def compute_free_volume(
    smiles: str,
    spec: Mapping[str, Any] | None = None,
    groups: Sequence[FreeVolumeGroupRow] | None = None,
    corrections: Sequence[FreeVolumeCorrectionRow] | None = None,
    coefficients: Sequence[FreeVolumeCoefficientRow] | None = None,
) -> dict[str, Any]:
    """對應 computeFreeVolume。`spec` 是共聚物組成（units 與 fractionBasis）；沒有 spec 或只有一個單元時視為均聚物／單一分子。
    共聚物按單體莫耳分率加權；任何單元缺基團或結構有誤，整體回報，不略過。"""
    spec_units = spec.get("units") if spec is not None else None
    multi = spec_units is not None and len(spec_units) > 1
    if multi:
        analysis = analyze_polymer_units(smiles, spec)
        if not analysis["ok"]:
            return _invalid(smiles, analysis["problem"]["message"])
        parts = [{"smiles": u["smiles"], "molFraction": u["molFraction"]} for u in analysis["units"]]
    else:
        only = spec_units[0]["smiles"] if spec_units is not None and len(spec_units) == 1 else smiles
        parts = [{"smiles": only, "molFraction": 1}]

    components: list[dict[str, Any]] = []
    for p in parts:
        unit = compute_free_volume_unit(p["smiles"], groups, corrections, coefficients)
        if unit["status"] == "invalid":
            return _invalid(smiles, f"單元「{p['smiles']}」：{unit['message']}" if multi else unit["message"])
        v = _va_of(p["smiles"]) if unit["status"] == "ok" else {"va": None, "note": None}
        components.append({"smiles": p["smiles"], "molFraction": p["molFraction"], "unit": unit, "va": v["va"], "vaNote": v["note"]})
    bad = [c for c in components if c["unit"]["status"] == "missing"]
    if bad:
        message = (
            f"共聚物的單元缺基團（{'、'.join('「' + c['smiles'] + '」' for c in bad)}），整體不計算、不略過"
            if multi
            else "缺基團：使用者表沒有對應的基團，不計算、不猜值"
        )
        return {"status": "missing", "smiles": smiles, "components": components, "message": message}
    oks = [c["unit"] for c in components if c["unit"]["status"] == "ok"]
    # TS 以 oks[i]?.vomega ?? 0 取值（components 與 oks 此時等長）；明確迴圈由左至右累加
    vomega = 0.0
    vf = 0.0
    for i, c in enumerate(components):
        vomega = vomega + c["molFraction"] * (oks[i]["vomega"] if i < len(oks) else 0)
    for i, c in enumerate(components):
        vf = vf + c["molFraction"] * (oks[i]["vf"] if i < len(oks) else 0)
    va_missing = next((c for c in components if c["va"] is None), None)
    va: float | None
    if va_missing is not None:
        va = None
    else:
        va = 0.0
        for c in components:
            va = va + c["molFraction"] * c["va"]
    sources: list[str] = []
    for u in oks:
        for s in u["sources"]:
            sources.append(s)
    return {
        "status": "ok",
        "smiles": smiles,
        "polymer": any(u["polymer"] for u in oks),
        "copolymer": multi,
        "vomega": vomega,
        "vf": vf,
        "effectiveCoefficient": js_div(vf, vomega),
        "components": components,
        "va": va,
        "vaNote": va_missing["vaNote"] if va_missing is not None else None,
        "vfOverVa": None if va is None else js_div(vf, va),
        "sources": list(dict.fromkeys(sources)),
        "model": FREE_VOLUME_MODEL,
    }
