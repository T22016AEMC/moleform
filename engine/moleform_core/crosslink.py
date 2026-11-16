"""交聯第 0 層：官能基辨識、配對、網路判定、催化劑與溫度、審核狀態。對應 src/core/crosslink/groups.ts、analyze.ts、judge.ts、types.ts
（任務 M05 組 2-7；D62／D63）。`draw.ts`（畫圖）留在 TypeScript，不搬。

演算法與 TypeScript 逐步等價；官能基表與反應規則表直接讀專案的 src/data/functional_groups.csv、reaction_rules.csv（單一來源），
欄位轉型沿用 M00 的 `csv_reader.read_table`（與 TS 的 `readTable` 逐字一致）。TypeScript 仍是預設計算來源，本模組沒有接到介面。

與 TS 不同、依 039a 與任務卡的呼叫端傳入：
- 小分子的每分子質量（TS：`averageMolecularWeight`，屬 `formulation/molecularWeight`，本卡不搬）：由成分的 `molarMass` 欄位傳入（沒有則為 None）。
- 結構一律用 `canonicalSmiles`（D03：Python 只接 SMILES；TS 對小分子優先用 `molfile`，Python 忽略 `molfile` 欄位）。
RDKit 配對：`vw.raw_matches`（與 RDKit.js `get_substruct_matches` 預設參數相同；M01 以黃金比對確認）；連接點＝原子序 0 的原子。
浮點：官能基數的加權（Σ x_i·位點數）以明確迴圈由左至右累加（不用內建 `sum()`）。
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any, Mapping, Sequence

from rdkit import Chem

from .convert import resolve_polymer
from .copolymer import analyze_polymer_units
from .csv_reader import ColumnDef, TableDef, read_table
from .end_groups import analyze_end_groups
from .js_compat import js_number_to_string
from .tables import TableDataError, read_data_file
from .vw import raw_matches

CROSSLINK_MODEL_NAME = "反應規則表（交聯第 0 層）"
CATALYST_CATEGORY = "Catalyst/Initiator"
MESSAGE_NO_TEMPERATURE = "尚無文獻資料"
MESSAGE_NO_CATALYST = "不需催化劑"
MESSAGE_PENDING_REVIEW = "使用中的反應規則尚未經使用者審核"

VERDICT_LABEL = {
    "network": "配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層",
    "chain": "具鏈延長的結構條件",
    "capping": "具封端／接枝的結構條件",
    "undetermined": "無法判定（聚合物缺少分子量）",
    "none": "無反應",
}
PAIR_KIND_LABEL = {
    "network": "具形成網路的結構條件",
    "chain": "具鏈延長的結構條件",
    "capping": "具封端的結構條件",
    "graft": "具接枝的結構條件",
    "undetermined": "無法判定",
}

EPS = 1e-9

# ---------- 資料表 ----------


def _s(name: str) -> ColumnDef:
    return {"name": name, "kind": "string"}


def _l(name: str) -> ColumnDef:
    return {"name": name, "kind": "list"}


def _n(name: str) -> ColumnDef:
    return {"name": name, "kind": "number"}


_COMMON = [_s(x) for x in ("source_type", "source", "source_detail", "source_original", "review_status", "notes")]

FUNCTIONAL_GROUPS_TABLE: TableDef = {
    "file": "functional_groups.csv",
    "columns": [_s("id"), _s("name_zh"), _s("smarts"), {"name": "reactive_atom_maps", "kind": "intList"}, _l("should_match"), _l("should_not_match"), *_COMMON],
}
REACTION_RULES_TABLE: TableDef = {
    "file": "reaction_rules.csv",
    "columns": [
        _s("id"), _s("reaction_type"), _s("group_a"), _s("group_b"), _s("reaction_smarts"), _s("catalyst_required"),
        _n("temp_min_c"), _n("temp_max_c"), _n("functionality_a"), _n("functionality_b"), _s("byproduct"),
        _n("bond_volume_change"), _s("bond_volume_change_unit"), _l("should_react"), _l("should_not_react"), *_COMMON,
    ],
}  # fmt: skip


def _load(table: TableDef) -> tuple[dict[str, Any], ...]:
    res = read_table(table, read_data_file(table["file"]))
    if res["issues"]:
        raise TableDataError(res["issues"])
    return tuple(res["rows"])


@lru_cache(maxsize=1)
def load_functional_groups() -> tuple[dict[str, Any], ...]:
    """官能基表（讀取層的問題直接拋出；TS 的 `loadTables` 只回報 issues，資料列照用——資料正常時結果相同）。"""
    return _load(FUNCTIONAL_GROUPS_TABLE)


@lru_cache(maxsize=1)
def load_reaction_rules() -> tuple[dict[str, Any], ...]:
    return _load(REACTION_RULES_TABLE)


# ---------- groups.ts ----------

_MAP_SUFFIX = re.compile(r":([0-9]+)$", re.ASCII)
_ORGANIC = set("BCNOPSFIcnops*")


def query_atom_maps(smarts: str) -> list[int]:
    """讀出 SMARTS 中每個原子的映射編號（依原子在字串中出現的順序，沒有映射為 0）。只處理最外層的原子。"""
    maps: list[int] = []
    i = 0
    n = len(smarts)
    while i < n:
        ch = smarts[i]
        if ch == "[":
            depth = 1
            j = i + 1
            while j < n and depth > 0:
                if smarts[j] == "[":
                    depth += 1
                elif smarts[j] == "]":
                    depth -= 1
                j += 1
            content = smarts[i + 1 : j - 1]
            m = _MAP_SUFFIX.search(content)
            maps.append(int(m.group(1)) if m else 0)
            i = j
        elif ch in _ORGANIC:
            # Cl、Br 是兩個字元的一個原子
            if (ch == "C" and smarts[i + 1 : i + 2] == "l") or (ch == "B" and smarts[i + 1 : i + 2] == "r"):
                i += 1
            maps.append(0)
            i += 1
        else:
            i += 1
    return maps


def _parse_query(smarts: str) -> Chem.Mol | None:
    try:
        return Chem.MolFromSmarts(smarts)
    except Exception:  # noqa: BLE001
        return None


def find_group_sites(mol: Chem.Mol, groups: Sequence[Mapping[str, Any]], exclude_attachments: bool) -> list[dict[str, Any]]:
    """在 mol 上找每個官能基的位點。exclude_attachments 為 True（聚合物的重複單元）時，排除比對到連接點 * 的匹配。回傳只含有位點的官能基。"""
    dummies = {a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() == 0} if exclude_attachments else set()
    result: list[dict[str, Any]] = []
    for group in groups:
        query = _parse_query(group["smarts"])
        if query is None:
            continue  # SMARTS 無法解析由資料表檢查回報
        maps = query_atom_maps(group["smarts"])
        query_index_of_map = [maps.index(m) if m in maps else -1 for m in group["reactive_atom_maps"]]
        if any(k < 0 for k in query_index_of_map):
            continue  # reactive_atom_maps 與 SMARTS 不符，由資料表檢查回報
        seen: set[str] = set()
        sites: list[list[int]] = []
        for atoms in raw_matches(mol, query):
            if any(a in dummies for a in atoms):
                continue
            site = [atoms[k] for k in query_index_of_map]
            key = ",".join(str(x) for x in sorted(site))
            if key in seen:
                continue
            seen.add(key)
            sites.append(site)
        if sites:
            result.append({"groupId": group["id"], "sites": sites})
    return result


def parse_structure(source: str) -> Chem.Mol | None:
    """解析結構文字（SMILES；D03）；失敗回傳 None。"""
    try:
        return Chem.MolFromSmiles(source)
    except Exception:  # noqa: BLE001
        return None


# ---------- judge.ts ----------


def judge_pair(f_a: float | None, f_b: float | None, a_is_polymer: bool, b_is_polymer: bool) -> str:
    """網路判定：只依「每分子平均官能度 f」的計數判定（兩邊都 f ≥ 2 且至少一邊 f > 2 → 網路；都 = 2 → 鏈延長；有一邊 < 2 → 封端／接枝；未知 → 無法判定）。"""
    if f_a is None or f_b is None:
        return "undetermined"
    low = f_a if f_a < f_b else f_b  # Math.min（此處沒有 NaN）
    if low < 2 - EPS:
        other_is_polymer = b_is_polymer if f_a <= f_b else a_is_polymer
        return "graft" if other_is_polymer else "capping"
    return "network" if (f_a > 2 + EPS or f_b > 2 + EPS) else "chain"


def judge_formulation(kinds: Sequence[str]) -> str:
    """整個配方的判定：任一配對為網路即「可形成網路」。"""
    if "network" in kinds:
        return "network"
    if "chain" in kinds:
        return "chain"
    if "capping" in kinds or "graft" in kinds:
        return "capping"
    if "undetermined" in kinds:
        return "undetermined"
    return "none"


# ---------- analyze.ts ----------


def analyze_component(c: Mapping[str, Any], groups: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """分析單一成分：解析結構、找官能基位點；聚合物排除連接點並換算聚合度。
    `c`：{ id, name, canonicalSmiles, category, polymer?, molarMass? }（`molarMass`：小分子的每分子質量，由呼叫端傳入）。"""
    is_polymer = "*" in c["canonicalSmiles"]
    source = c["canonicalSmiles"]
    base: dict[str, Any] = {
        "id": c["id"],
        "name": c["name"],
        "isPolymer": is_polymer,
        "source": source,
        "dp": None,
        "molarMass": None,
        "distribution": None,
        "ends": None,
        "endGroupCounts": {},
        "groups": [],
        "units": None,
        "unitGroupCounts": {},
        "problem": None,
    }
    mol = parse_structure(source)
    if mol is None:
        return {**base, "problem": "無法解析這個成分的結構"}
    base["groups"] = find_group_sites(mol, groups, is_polymer)

    if not is_polymer:
        base["molarMass"] = c.get("molarMass")
    if is_polymer:
        polymer = c.get("polymer")
        unit = analyze_polymer_units(c["canonicalSmiles"], polymer)
        if not unit["ok"]:
            return {**base, "problem": unit["problem"]["message"]}
        composition = unit.get("units") or []
        copolymer = polymer is not None and polymer.get("units") is not None and len(composition) > 1
        unit_analyses: list[dict[str, Any]] = []
        counts: dict[str, float] = {}
        for u in composition:
            unit_mol = parse_structure(u["smiles"])
            sites: list[dict[str, Any]] = []
            if unit_mol is not None:
                sites = find_group_sites(unit_mol, groups, True)
            unit_analyses.append({"smiles": u["smiles"], "molFraction": u["molFraction"], "groups": sites})
            for g in sites:
                counts[g["groupId"]] = counts.get(g["groupId"], 0) + u["molFraction"] * len(g["sites"])
        base["units"] = unit_analyses
        base["unitGroupCounts"] = counts
        if copolymer:
            # 第一種單元的位點；其他單元才有的官能基以空位點列出，讓配對判斷知道這個成分含有它
            first = unit_analyses[0]["groups"]
            extra = [{"groupId": gid, "sites": []} for gid in counts if not any(g["groupId"] == gid for g in first)]
            base["groups"] = [*first, *extra]
        # 端基（任務 022，D50）：用相同的 SMARTS 與 * 處理辨識端基上的官能基
        end_info = analyze_end_groups(polymer)
        if end_info["ok"] and polymer is not None and polymer.get("endGroups") is not None:
            end_analyses: list[dict[str, Any] | None] = []
            for info in end_info["ends"]:
                if info is None:
                    end_analyses.append(None)
                    continue
                end_mol = parse_structure(info["smiles"])
                sites = []
                if end_mol is not None:
                    sites = find_group_sites(end_mol, groups, True)
                end_analyses.append({"smiles": info["smiles"], "groups": sites})
                for g in sites:
                    base["endGroupCounts"][g["groupId"]] = base["endGroupCounts"].get(g["groupId"], 0) + len(g["sites"])
            base["ends"] = end_analyses
            only_ends = [gid for gid in base["endGroupCounts"] if not any(g["groupId"] == gid for g in base["groups"])]
            base["groups"] = [*base["groups"], *({"groupId": gid, "sites": []} for gid in only_ends)]
        if polymer is None:
            return {**base, "problem": "聚合物需要填入 Mw（或 Mn、DP），才能判定"}
        resolved = resolve_polymer(
            polymer, unit["mUnit"], {"mEnds": unit["mEnds"] if unit.get("mEnds") is not None else 0, "filled": unit.get("endsFilled") or [False, False]}
        )
        if not resolved["ok"]:
            return {**base, "problem": resolved["error"]}
        base["dp"] = resolved["dp"]
        base["molarMass"] = resolved["mn"]
        base["distribution"] = {"mw": resolved["mw"], "mn": resolved["mn"], "mUnit": unit["mUnit"], "mEnds": unit["mEnds"] if unit.get("mEnds") is not None else 0}
    return base


def _sites_of(a: Mapping[str, Any], group_id: str) -> int:
    for g in a["groups"]:
        if g["groupId"] == group_id:
            return len(g["sites"])
    return 0


def _functionality_of(a: Mapping[str, Any], group_id: str, per_group: float) -> float | None:
    """此成分每分子平均的反應官能度：位點數 × 規則官能度（每個基團形成的鍵數）；聚合物再乘聚合度。"""
    sites = _sites_of(a, group_id)
    if a["isPolymer"]:
        if a["dp"] is None:
            return None
        unit = a["unitGroupCounts"].get(group_id, sites)
        return unit * per_group * a["dp"] + a["endGroupCounts"].get(group_id, 0) * per_group
    return sites * per_group


def _has_group(a: Mapping[str, Any], group_id: str) -> bool:
    return any(g["groupId"] == group_id for g in a["groups"])


def _temperature_text(rule: Mapping[str, Any]) -> str:
    lo, hi = rule["temp_min_c"], rule["temp_max_c"]
    if lo is None or hi is None:
        return MESSAGE_NO_TEMPERATURE
    return f"{js_number_to_string(lo)} °C" if lo == hi else f"{js_number_to_string(lo)}–{js_number_to_string(hi)} °C"


def analyze_crosslink(
    components: Sequence[Mapping[str, Any]],
    functional_groups: Sequence[Mapping[str, Any]] | None = None,
    reaction_rules: Sequence[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """對應 analyzeCrosslink：官能基辨識、配對、網路判定。省略資料表時用專案的 functional_groups.csv、reaction_rules.csv。"""
    fgroups = load_functional_groups() if functional_groups is None else functional_groups
    rules = load_reaction_rules() if reaction_rules is None else reaction_rules
    analyses = [analyze_component(c, fgroups) for c in components]
    group_name = {g["id"]: g for g in fgroups}
    has_catalyst = any(c["category"] == CATALYST_CATEGORY for c in components)

    warnings: list[str] = []
    pairs: list[dict[str, Any]] = []
    marks: dict[str, set[int]] = {}
    used_rules: set[str] = set()
    used_groups: set[str] = set()
    catalyst_warned: set[str] = set()

    def end(a: Mapping[str, Any], group_id: str, per_group: float) -> dict[str, Any]:
        if a["isPolymer"]:
            per_unit: float | None = a["unitGroupCounts"].get(group_id, _sites_of(a, group_id)) * per_group
            per_chain: float | None = a["endGroupCounts"].get(group_id, 0) * per_group
        else:
            per_unit = None
            per_chain = None
        return {
            "componentId": a["id"],
            "name": a["name"],
            "groupId": group_id,
            "isPolymer": a["isPolymer"],
            "f": _functionality_of(a, group_id, per_group),
            "perUnit": per_unit,
            "perChain": per_chain,
        }

    unit_marks: dict[str, list[set[int]]] = {}
    end_marks: dict[str, list[set[int]]] = {}

    def mark(a: Mapping[str, Any], group_id: str) -> None:
        s = marks.setdefault(a["id"], set())
        for g in a["groups"]:
            if g["groupId"] == group_id:
                for site in g["sites"]:
                    s.update(site)
                break
        if a["ends"] is not None:
            per_end = end_marks.get(a["id"])
            if per_end is None:
                per_end = [set() for _ in a["ends"]]
            for k, e in enumerate(a["ends"]):
                if e is None:
                    continue
                for g in e["groups"]:
                    if g["groupId"] == group_id:
                        for site in g["sites"]:
                            per_end[k].update(site)
                        break
            end_marks[a["id"]] = per_end
        if a["units"] is not None and len(a["units"]) > 1:
            per_unit = unit_marks.get(a["id"])
            if per_unit is None:
                per_unit = [set() for _ in a["units"]]
            for k, u in enumerate(a["units"]):
                for g in u["groups"]:
                    if g["groupId"] == group_id:
                        for site in g["sites"]:
                            per_unit[k].update(site)
                        break
            unit_marks[a["id"]] = per_unit

    for rule in rules:
        per_a = 1 if rule["functionality_a"] is None else rule["functionality_a"]
        per_b = 1 if rule["functionality_b"] is None else rule["functionality_b"]
        self_rule = rule["group_b"] == ""
        same_group = rule["group_a"] == rule["group_b"]

        if rule["catalyst_required"] == "none":
            catalyst = {"status": "none", "message": MESSAGE_NO_CATALYST}
        elif has_catalyst:
            catalyst = {"status": "present", "message": f"需要催化劑（{rule['catalyst_required']}）；配方含 {CATALYST_CATEGORY} 類成分"}
        else:
            catalyst = {"status": "missing", "message": f"需要催化劑（{rule['catalyst_required']}），但配方沒有 {CATALYST_CATEGORY} 類成分"}

        for i in range(len(analyses)):
            for j in range(i if (self_rule or same_group) else 0, len(analyses)):
                A = analyses[i]
                B = analyses[j]
                if self_rule:
                    if j != i or not _has_group(A, rule["group_a"]):
                        continue
                else:
                    if not _has_group(A, rule["group_a"]) or not _has_group(B, rule["group_b"]):
                        continue
                    # 同一個官能基在兩邊時，同一個成分不與自己配對
                    if same_group and i == j:
                        continue
                end_a = end(A, rule["group_a"], per_a)
                end_b = None if self_rule else end(B, rule["group_b"], per_b)
                ga = group_name.get(rule["group_a"])
                name_a = ga["name_zh"] if ga is not None else rule["group_a"]
                if self_rule:
                    name_b = None
                else:
                    gb = group_name.get(rule["group_b"])
                    name_b = gb["name_zh"] if gb is not None else rule["group_b"]
                kind = judge_pair(end_a["f"], end_a["f"], A["isPolymer"], A["isPolymer"]) if self_rule else judge_pair(end_a["f"], end_b["f"], A["isPolymer"], B["isPolymer"])
                pairs.append(
                    {
                        "ruleId": rule["id"],
                        "reactionLabel": f"{name_a if name_b is None else name_a + '–' + name_b} {rule['reaction_type']}",
                        "groupAName": name_a,
                        "groupBName": "" if name_b is None else name_b,
                        "a": end_a,
                        "b": end_b,
                        "self": i == j,
                        "kind": kind,
                        "catalyst": catalyst,
                        "temperature": _temperature_text(rule),
                    }
                )
                used_rules.add(rule["id"])
                used_groups.add(rule["group_a"])
                mark(A, rule["group_a"])
                if not self_rule:
                    used_groups.add(rule["group_b"])
                    mark(B, rule["group_b"])
                if catalyst["status"] == "missing" and rule["id"] not in catalyst_warned:
                    catalyst_warned.add(rule["id"])
                    warnings.append(f"規則「{rule['id']}」{catalyst['message']}（D26）")

    participating: set[str] = set()
    for p in pairs:
        participating.add(p["a"]["componentId"])
        if p["b"] is not None:
            participating.add(p["b"]["componentId"])
    for a in analyses:
        if a["problem"] is not None:
            warnings.append(f"「{a['name']}」：{a['problem']}")

    marked_atoms = {id_: sorted(s) for id_, s in marks.items()}
    marked_unit_atoms = {id_: [sorted(s) for s in sets] for id_, sets in unit_marks.items()}
    marked_end_atoms: dict[str, list[list[int] | None]] = {}
    for id_, sets in end_marks.items():
        analysis = next((a for a in analyses if a["id"] == id_), None)
        if all(len(s) == 0 for s in sets):
            continue  # 端基上沒有反應原子：不需要畫
        marked_end_atoms[id_] = [sorted(s) if (analysis is not None and analysis["ends"] is not None and k < len(analysis["ends"]) and analysis["ends"][k] is not None) else None for k, s in enumerate(sets)]

    return {
        "modelName": CROSSLINK_MODEL_NAME,
        "confidence": "direct",
        "verdict": judge_formulation([p["kind"] for p in pairs]),
        "pairs": pairs,
        "nonParticipants": [{"id": a["id"], "name": a["name"]} for a in analyses if a["id"] not in participating],
        "components": analyses,
        "markedAtoms": marked_atoms,
        "markedUnitAtoms": marked_unit_atoms,
        "markedEndAtoms": marked_end_atoms,
        "warnings": warnings,
        "pendingReview": {
            "rules": [r["id"] for r in rules if r["id"] in used_rules and r["review_status"] == "pending"],
            "groups": [g["id"] for g in fgroups if g["id"] in used_groups and g["review_status"] == "pending"],
        },
    }
