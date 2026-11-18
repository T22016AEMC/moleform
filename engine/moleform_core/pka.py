"""pKa 估算（任務 P7-5，PLAN 7.3a，D38、D66）：Hammett／Taft 線性自由能法。

資料來源只有 Perrin, Dempsey & Serjeant, *pKa Prediction for Organic Acids and Bases*（Chapman & Hall, 1981）：
- `src/data/hammett_sigma.csv`：Table A.1（σmeta、σpara、Taft σ*）、A.4（para 特殊 σ）、A.5（apparent σortho）。
- `src/data/pka_equations.csv`：Table A.2／A.3 的式子（與正文 §6.3.3 的脂肪硫醇式 6.7、6.8），每個可解離基團類別一列。
數值只來自這兩張資料表（逐列經頁面圖像核對、`review_status = pending`）；不內插、不補值（D66）。缺值（取代基不在表中、
該位置書沒給值、環系不在 Perrin 涵蓋、基團沒有式子）→ `missing` 並列原因。

式子：
- Hammett：pKa = 截距 − ρ·Σσ（書式 5.1）；苯環上的取代基位置（ortho、meta、para）相對於可解離基團判定。
- Taft：pKa = 截距 − ρ*·Σσ*（書式 4.4）；σ* 取表值，表中沒有的 −CH2R 型取代基依書式 4.5：σ*(−CH2R) ≈ 0.4 × σ*(−R)，逐層衰減；
  每個衰減後的 σ* 與書的算例一樣取到小數第 2 位再加總（例：0.4 × 1.68 = 0.67，書頁 40）。
- 統計因子（log n）與書的「第二個質子」算法不做：每個位點個別以「其他基團保持中性」估算，只用於比較相對強弱。
- 聚合物重複單元的連接點 `*` 以甲基代替（D05、任務 024）後再估算。

結果是水溶液 25 °C 的估算值，可信度「參考趨勢」。
"""

from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache
from typing import Any

from rdkit import Chem

from .csv_reader import ColumnDef, TableDef, read_table
from .tables import TableDataError, read_data_file

PKA_MODEL = "Hammett／Taft 線性自由能法（Perrin, Dempsey & Serjeant 1981，Table A.1–A.5）"
PKA_UNIT = "pKa"
PKA_NOTE = "水溶液 25 °C 值，只用於比較相對強弱（D38），參考趨勢"
PKA_DISCLAIMER = "本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。"
ATTENUATION = 0.4  # 書式 4.5
MAX_HEAVY_ATOMS = 400

# 方向說明（用於位點活性排序，見 docs/MODELS.md）
DIRECTION_TEXT = {
    "nucleophile": "親核位點：pKa（共軛酸或質子化前的酸）愈高，依 Brønsted 關係傾向愈強的親核性；排名 1 ＝ pKa 最高",
    "acid": "酸性位點：pKa 愈低愈強的酸；排名 1 ＝ pKa 最低",
}


def _s(name: str) -> ColumnDef:
    return {"name": name, "kind": "string"}


def _l(name: str) -> ColumnDef:
    return {"name": name, "kind": "list"}


def _n(name: str) -> ColumnDef:
    return {"name": name, "kind": "number"}


_COMMON = [_s(x) for x in ("source_type", "source", "source_detail", "source_original", "review_status", "notes")]

HAMMETT_SIGMA_TABLE: TableDef = {
    "file": "hammett_sigma.csv",
    "columns": [
        _s("id"), _s("name_zh"), _s("smarts"), _s("match_mode"),
        _n("sigma_meta"), _n("sigma_para"), _n("sigma_star"), _s("a1_marks"), _l("approx_columns"),
        _n("sigma_para_phenol"), _n("sigma_para_aniline"),
        _n("sigma_ortho_acid"), _n("sigma_ortho_phenol"), _n("sigma_ortho_aniline"),
        _l("should_match"), _l("should_not_match"), *_COMMON,
    ],
}  # fmt: skip

PKA_EQUATIONS_TABLE: TableDef = {
    "file": "pka_equations.csv",
    "columns": [
        _s("id"), _s("name_zh"), _s("role"), _s("kind"), _s("center_smarts"), _n("key_map"), _n("center_map"),
        _n("intercept"), _n("rho"), _s("sigma_set"), _s("para_source"), _s("ortho_source"), _s("roots"), _n("priority"),
        _s("position_rule"), _s("original_ref"), _l("should_match"), _l("should_not_match"), *_COMMON,
    ],
}  # fmt: skip


def _load(table: TableDef) -> tuple[dict[str, Any], ...]:
    res = read_table(table, read_data_file(table["file"]))
    if res["issues"]:
        raise TableDataError(res["issues"])
    return tuple(res["rows"])


@lru_cache(maxsize=1)
def load_sigma_rows() -> tuple[dict[str, Any], ...]:
    """取代基常數表。每列附編譯好的 SMARTS（`_query`）與片段原子數（`_size`）。"""
    rows = []
    for r in _load(HAMMETT_SIGMA_TABLE):
        query = Chem.MolFromSmarts(r["smarts"])
        if query is None:
            raise TableDataError([f"hammett_sigma.csv：{r['id']} 的 SMARTS 無法解析"])
        rows.append({**r, "_query": query, "_size": query.GetNumAtoms()})
    return tuple(rows)


@lru_cache(maxsize=1)
def load_equation_rows() -> tuple[dict[str, Any], ...]:
    """pKa 式子表（依 priority 由小到大，同值維持檔案順序）。每列附編譯好的 SMARTS 與「映射編號 → 查詢原子序」。"""
    rows = []
    for r in _load(PKA_EQUATIONS_TABLE):
        query = Chem.MolFromSmarts(r["center_smarts"])
        if query is None:
            raise TableDataError([f"pka_equations.csv：{r['id']} 的 SMARTS 無法解析"])
        maps = {a.GetAtomMapNum(): a.GetIdx() for a in query.GetAtoms() if a.GetAtomMapNum() > 0}
        for need in (int(r["key_map"]), int(r["center_map"])):
            if need not in maps:
                raise TableDataError([f"pka_equations.csv：{r['id']} 的 SMARTS 缺映射編號 {need}"])
        rows.append({**r, "_query": query, "_maps": maps})
    return tuple(sorted(rows, key=lambda r: r["priority"]))


def _round2(x: float) -> float:
    return float(Decimal(repr(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


# ---------- 結構處理 ----------


def cap_attachments(mol: Chem.Mol) -> Chem.Mol:
    """聚合物重複單元的連接點 `*` 換成甲基碳（原子順序不變；D05、任務 024 的片段做法）。沒有連接點時回傳原分子。"""
    dummies = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() == 0]
    if not dummies:
        return mol
    rw = Chem.RWMol(mol)
    for i in dummies:
        a = rw.GetAtomWithIdx(i)
        a.SetAtomicNum(6)
        a.SetAtomMapNum(0)
        a.SetIsotope(0)
        a.SetNoImplicit(False)
        a.SetNumExplicitHs(0)
        a.SetFormalCharge(0)
    out = rw.GetMol()
    Chem.SanitizeMol(out)
    return out


def _smiles_of_fragment(frag: Chem.Mol) -> str:
    return Chem.MolToSmiles(frag).replace("[*]", "*")


def fragment_off(mol: Chem.Mol, atom: int, root: int) -> tuple[Chem.Mol | None, str | None]:
    """切斷 atom–root 這根鍵，取 root 那一側（連接點為一個虛原子 `*`）。鍵在環中、切不開時回傳 (None, 原因)。"""
    bond = mol.GetBondBetweenAtoms(atom, root)
    if bond is None:
        return None, "內部錯誤：兩個原子之間沒有鍵"
    if bond.IsInRing():
        return None, "取代基與分子其餘部分形成環（環狀胺、環上的醇或酸、稠環），Perrin 的式子沒有環的處理，不估"
    fm = Chem.FragmentOnBonds(mol, [bond.GetIdx()], addDummies=True, dummyLabels=[(0, 0)])
    mapping: list[tuple[int, ...]] = []
    frags = Chem.GetMolFrags(fm, asMols=True, sanitizeFrags=False, fragsMolAtomMapping=mapping)
    for f, atoms in zip(frags, mapping):
        if root in atoms:
            f.UpdatePropertyCache(strict=False)
            Chem.GetSymmSSSR(f)
            return f, None
    return None, "內部錯誤：找不到取代基片段"


def _match_sigma_row(frag: Chem.Mol) -> dict[str, Any] | None:
    n = frag.GetNumAtoms()
    rows = load_sigma_rows()
    for r in rows:
        if r["match_mode"] == "exact" and r["_size"] == n and frag.HasSubstructMatch(r["_query"]):
            return r
    for r in rows:
        if r["match_mode"] == "generic" and frag.HasSubstructMatch(r["_query"]):
            return r
    return None


def _row_by_id(row_id: str) -> dict[str, Any]:
    for r in load_sigma_rows():
        if r["id"] == row_id:
            return r
    raise TableDataError([f"hammett_sigma.csv 沒有 {row_id}"])


def _a1_source(row: dict[str, Any], column: str) -> str:
    if column in ("sigma_para_phenol", "sigma_para_aniline"):
        return "Perrin 1981 Table A.4 書頁 136"
    if column.startswith("sigma_ortho"):
        return "Perrin 1981 Table A.5 書頁 137–138"
    m = re.search(r"Table A\.1 書頁 (\d+)", row["source_detail"])
    return f"Perrin 1981 Table A.1 書頁 {m.group(1) if m else '?'}"


def _approx(row: dict[str, Any], column: str) -> bool:
    return column in row["approx_columns"]


# ---------- Hammett（苯環） ----------

_POSITION_NAME = {1: "ortho", 2: "meta", 3: "para"}


def _benzene_ring_of(mol: Chem.Mol, center: int) -> tuple[list[int] | None, str | None]:
    info = mol.GetRingInfo()
    rings = [r for r in info.AtomRings() if center in r]
    if len(rings) != 1:
        return None, "可解離基團所在的芳香環是稠環或不在環上，Perrin 的式子不涵蓋"
    ring = list(rings[0])
    if len(ring) != 6 or any(not mol.GetAtomWithIdx(i).GetIsAromatic() or mol.GetAtomWithIdx(i).GetAtomicNum() != 6 for i in ring):
        return None, "芳香環不是單一的六員碳環（雜環或其他環系），Perrin 的式子不涵蓋"
    if any(info.NumAtomRings(i) != 1 for i in ring):
        return None, "芳香環與其他環稠合（稠環），Perrin 的式子不涵蓋"
    return ring, None


def _hammett_sigma_for(row: dict[str, Any], position: str, para_source: str, ortho_source: str) -> tuple[str | None, str | None]:
    """回傳 (欄位名, 不能取值的原因)。para／ortho 的來源依 pka_equations 的 para_source、ortho_source 與 A.1 註腳。"""
    if position == "meta":
        return "sigma_meta", None
    if position == "para":
        if para_source == "A1":
            return "sigma_para", None
        primary, other, need = {"A4_phenol": ("sigma_para_phenol", "sigma_para_aniline", "†"), "A4_aniline": ("sigma_para_aniline", "sigma_para_phenol", "‡")}[para_source]
        if row[primary] is not None:
            return primary, None
        # 另一欄：只在 A.1 對應的註腳標記存在時才可用（† 酚欄沒有時試苯胺欄；‡ 苯胺欄沒有時試酚欄）
        if row[other] is not None and need in row["a1_marks"]:
            return other, None
        return "sigma_para", None
    if position == "ortho":
        col = {"A5_acid": "sigma_ortho_acid", "A5_phenol": "sigma_ortho_phenol", "A5_aniline": "sigma_ortho_aniline"}.get(ortho_source)
        if col is None:
            return None, "Perrin 的 Table A.5 沒有這一類基團的 ortho 常數"
        return col, None
    return None, f"未知位置 {position}"


def _hammett_benzene(mol: Chem.Mol, eq: dict[str, Any], center: int) -> tuple[float | None, list[dict[str, Any]], list[str]]:
    """苯環上的 Σσ。回傳 (Σσ 或 None, 明細, 缺值原因)。"""
    ring, problem = _benzene_ring_of(mol, center)
    if ring is None:
        return None, [], [problem or "環系不涵蓋"]
    details: list[dict[str, Any]] = []
    reasons: list[str] = []
    total = 0.0
    start = ring.index(center)
    for step in range(1, 6):
        atom = ring[(start + step) % 6]
        position = _POSITION_NAME[min(step, 6 - step)]
        for nb in mol.GetAtomWithIdx(atom).GetNeighbors():
            if nb.GetIdx() in ring or nb.GetAtomicNum() == 1:
                continue
            frag, why = fragment_off(mol, atom, nb.GetIdx())
            if frag is None:
                reasons.append(f"{position} 位置：{why}")
                continue
            smi = _smiles_of_fragment(frag)
            row = _match_sigma_row(frag)
            if row is None:
                reasons.append(f"取代基 {smi}（{position}）不在 hammett_sigma 表中，不估、不內插（D66）")
                continue
            col, why = _hammett_sigma_for(row, position, eq["para_source"], eq["ortho_source"])
            if col is None:
                reasons.append(f"取代基 {row['name_zh']}（{position}）：{why}")
                continue
            value = row[col]
            if value is None:
                reasons.append(f"取代基 {row['name_zh']}（{position}）：Perrin 的表中沒有這個位置的值（{col}），不補值")
                continue
            total += value
            details.append({
                "substituent": smi, "name": row["name_zh"], "rowId": row["id"], "position": position, "column": col,
                "value": value, "source": _a1_source(row, col), "approx": _approx(row, col), "marks": row["a1_marks"],
            })
    return (None if reasons else total), details, reasons


def _hammett_ring(mol: Chem.Mol, eq: dict[str, Any], match: tuple[int, ...], center: int) -> tuple[float | None, list[dict[str, Any]], list[str]]:
    """咪唑：只看 center（2 位或 4 位）上的取代基，用 A.1 σmeta（式本身指定 σmeta，A.3）。"""
    in_pattern = set(match)
    details: list[dict[str, Any]] = []
    reasons: list[str] = []
    total = 0.0
    for nb in mol.GetAtomWithIdx(center).GetNeighbors():
        if nb.GetIdx() in in_pattern or nb.GetAtomicNum() == 1:
            continue
        frag, why = fragment_off(mol, center, nb.GetIdx())
        if frag is None:
            reasons.append(f"咪唑環上的取代基：{why}")
            continue
        smi = _smiles_of_fragment(frag)
        row = _match_sigma_row(frag)
        if row is None:
            reasons.append(f"取代基 {smi}（咪唑環，σmeta）不在 hammett_sigma 表中，不估、不內插（D66）")
            continue
        if row["sigma_meta"] is None:
            reasons.append(f"取代基 {row['name_zh']}：Perrin 的表中沒有 σmeta，不補值")
            continue
        total += row["sigma_meta"]
        details.append({
            "substituent": smi, "name": row["name_zh"], "rowId": row["id"], "position": "meta", "column": "sigma_meta",
            "value": row["sigma_meta"], "source": _a1_source(row, "sigma_meta"), "approx": False, "marks": row["a1_marks"],
        })
    return (None if reasons else total), details, reasons


# ---------- Taft（σ*） ----------


def sigma_star_of(mol: Chem.Mol, atom: int, root: int) -> tuple[float | None, dict[str, Any] | None, str | None]:
    """切斷 atom–root 鍵後，root 那一側取代基的 σ*。回傳 (值, 明細, 缺值原因)。

    1. 取代基整體在 hammett_sigma 表中（先完全比對，再比對 Cn 通式列）：取表值。
    2. 否則若 root 是 −CH2−（兩個氫、另有恰好一個重原子鄰居），依書式 4.5 取 0.4 × σ*(後面的基團)，逐層遞迴，每個結果取到小數第 2 位。
    3. 其他情況回報缺值。
    """
    frag, why = fragment_off(mol, atom, root)
    if frag is None:
        return None, None, why
    smi = _smiles_of_fragment(frag)
    row = _match_sigma_row(frag)
    if row is not None:
        if row["sigma_star"] is None:
            return None, None, f"取代基 {row['name_zh']} 在表中沒有 σ*，不補值"
        return row["sigma_star"], {
            "substituent": smi, "name": row["name_zh"], "rowId": row["id"], "column": "sigma_star", "value": row["sigma_star"],
            "base": row["sigma_star"], "attenuationSteps": 0, "source": _a1_source(row, "sigma_star"), "approx": False,
        }, None
    ra = mol.GetAtomWithIdx(root)
    heavy_nbs = [n.GetIdx() for n in ra.GetNeighbors() if n.GetIdx() != atom and n.GetAtomicNum() != 1]
    if ra.GetAtomicNum() == 6 and not ra.GetIsAromatic() and ra.GetTotalNumHs() == 2 and ra.GetDegree() == 2 and len(heavy_nbs) == 1 and ra.GetHybridization() == Chem.HybridizationType.SP3:
        inner, detail, reason = sigma_star_of(mol, root, heavy_nbs[0])
        if inner is None:
            return None, None, reason
        assert detail is not None
        steps = detail["attenuationSteps"] + 1
        raw = ATTENUATION**steps * detail["base"]
        value = _round2(raw)
        return value, {
            "substituent": smi, "name": f"{detail['name']} 經 {steps} 個 −CH2− 衰減（書式 4.5）", "rowId": detail["rowId"], "column": "sigma_star",
            "value": value, "base": detail["base"], "attenuationSteps": steps, "attenuatedFrom": detail["substituent"],
            "source": detail["source"] + "；衰減：Perrin 1981 正文式 4.5 書頁 37", "approx": False,
        }, None
    return None, None, f"取代基 {smi} 不在 hammett_sigma 表中，也不是可依書式 4.5 衰減的 −CH2R，不估、不內插（D66）"


def _heavy_neighbors(mol: Chem.Mol, atom: int, exclude: set[int]) -> list[int]:
    return [n.GetIdx() for n in mol.GetAtomWithIdx(atom).GetNeighbors() if n.GetIdx() not in exclude and n.GetAtomicNum() != 1]


def _taft(mol: Chem.Mol, eq: dict[str, Any], match: tuple[int, ...], key: int, center: int) -> tuple[float | None, list[dict[str, Any]], list[str]]:
    roots_mode = eq["roots"]
    pattern_atoms = set(match)
    pairs: list[tuple[int, int]] = []  # (切斷鍵的一端 atom, 取代基根 root)
    if roots_mode == "neighbors_of_key":
        pairs = [(key, n) for n in _heavy_neighbors(mol, key, set())]
    elif roots_mode in ("neighbors_of_center", "neighbors_of_center_or_H"):
        pairs = [(center, n) for n in _heavy_neighbors(mol, center, pattern_atoms)]
    elif roots_mode == "center_group":
        # R 是 center 這個基團本身：切斷 center 與可解離基團之間的鍵
        group_nb = [n for n in _heavy_neighbors(mol, center, set()) if n in pattern_atoms]
        pairs = [(group_nb[0], center)] if group_nb else []
    details: list[dict[str, Any]] = []
    reasons: list[str] = []
    total = 0.0
    if not pairs:
        if roots_mode == "neighbors_of_center_or_H":
            h = _row_by_id("sub.H")
            details.append({
                "substituent": "*", "name": h["name_zh"], "rowId": h["id"], "column": "sigma_star", "value": h["sigma_star"], "base": h["sigma_star"],
                "attenuationSteps": 0, "source": _a1_source(h, "sigma_star"), "approx": False,
            })
            return h["sigma_star"], details, []
        return None, [], ["找不到取代基（內部錯誤）"]
    for a, r in pairs:
        value, detail, why = sigma_star_of(mol, a, r)
        if value is None:
            reasons.append(why or "σ* 缺值")
            continue
        total += value
        assert detail is not None
        details.append(detail)
    return (None if reasons else total), details, reasons


# ---------- 單一位點、整個分子 ----------


def _equation_text(eq: dict[str, Any]) -> str:
    sym = "σ*" if eq["sigma_set"] == "sigma_star" else "σ"
    rho = "ρ*" if eq["sigma_set"] == "sigma_star" else "ρ"
    return f"pKa = {eq['intercept']:g} − {eq['rho']:g}·Σ{sym}（{'Taft' if eq['kind'] == 'taft' else 'Hammett'}；截距與 {rho} 取自 Perrin 1981）"


def _missing_quantity(eq: dict[str, Any] | None) -> dict[str, Any]:
    return {"value": None, "unit": PKA_UNIT, "source": PKA_MODEL, "status": "missing"}


def estimate_group(mol: Chem.Mol, eq: dict[str, Any], match: tuple[int, ...]) -> dict[str, Any]:
    """一個可解離基團（一條式子的一個命中）的 pKa 估算。"""
    key = match[eq["_maps"][int(eq["key_map"])]]
    center = match[eq["_maps"][int(eq["center_map"])]]
    if eq["kind"] == "hammett":
        total, details, reasons = _hammett_benzene(mol, eq, center)
    elif eq["kind"] == "hammett_ring":
        total, details, reasons = _hammett_ring(mol, eq, match, center)
    else:
        total, details, reasons = _taft(mol, eq, match, key, center)
    source = f"{PKA_MODEL}；{eq['name_zh']}：{_equation_text(eq)}（{eq['source_detail']}）"
    quantity: dict[str, Any]
    if total is None:
        quantity = {"value": None, "unit": PKA_UNIT, "source": source, "status": "missing"}
        value = None
    else:
        value = eq["intercept"] - eq["rho"] * total
        quantity = {"value": value, "unit": PKA_UNIT, "source": source, "status": "predicted"}
    return {
        "classId": eq["id"],
        "className": eq["name_zh"],
        "role": eq["role"],
        "direction": DIRECTION_TEXT[eq["role"]],
        "keyAtom": key,
        "atoms": list(match),
        "quantity": quantity,
        "equation": {
            "text": _equation_text(eq), "kind": eq["kind"], "intercept": eq["intercept"], "rho": eq["rho"], "sigmaSet": eq["sigma_set"],
            "reference": eq["original_ref"], "table": eq["source_detail"], "positionRule": eq["position_rule"],
        },
        "sigmaSum": total,
        "sigmaDetails": details,
        "reason": None if total is not None else "；".join(dict.fromkeys(reasons)),
        "reviewStatus": eq["review_status"],
        "note": PKA_NOTE,
    }


def find_groups(mol: Chem.Mol) -> list[tuple[dict[str, Any], tuple[int, ...]]]:
    """分子上所有可解離基團：每個可解離原子只配一條式子（priority 小的優先）。"""
    assigned: dict[int, tuple[dict[str, Any], tuple[int, ...]]] = {}
    for eq in load_equation_rows():
        k = eq["_maps"][int(eq["key_map"])]
        for match in mol.GetSubstructMatches(eq["_query"]):
            key = match[k]
            if key not in assigned:
                assigned[key] = (eq, match)
    return [assigned[k] for k in sorted(assigned)]


def groups_for_mol(mol: Chem.Mol) -> list[dict[str, Any]]:
    return [estimate_group(mol, eq, match) for eq, match in find_groups(mol)]


def compute_pka(smiles: str) -> dict[str, Any]:
    """`POST /pka` 的計算。含連接點 `*` 的重複單元先以甲基代替。回傳 status：invalid／no-site／missing／predicted。"""
    try:
        mol = Chem.MolFromSmiles(smiles)
    except Exception:  # noqa: BLE001
        mol = None
    if mol is None:
        return {"status": "invalid", "message": "RDKit 無法解析這個 SMILES"}
    if mol.GetNumHeavyAtoms() == 0:
        return {"status": "invalid", "message": "沒有重原子"}
    if mol.GetNumHeavyAtoms() > MAX_HEAVY_ATOMS:
        return {"status": "invalid", "message": f"分子太大（重原子超過 {MAX_HEAVY_ATOMS}）"}
    polymer = any(a.GetAtomicNum() == 0 for a in mol.GetAtoms())
    capped = cap_attachments(mol) if polymer else mol
    groups = groups_for_mol(capped)
    out: dict[str, Any] = {"polymer": polymer, "groups": groups, "model": PKA_MODEL, "note": PKA_NOTE}
    if polymer:
        out["polymerNote"] = "含連接點 *：以甲基代替後估算（D05、任務 024）；端基不計入"
    if not groups:
        out["status"] = "no-site"
        out["message"] = "沒有 pka_equations 涵蓋的可解離基團（酚、芳香胺、苯甲酸、脂肪羧酸、脂肪胺、醇、硫醇、咪唑；環狀胺、三級醇等書沒有式子的類別不收）"
        return out
    out["status"] = "predicted" if any(g["quantity"]["status"] == "predicted" for g in groups) else "missing"
    return out


def validate_tables() -> list[str]:
    """資料表自我檢查：SMARTS 可解析、正例必須命中、反例不得命中（D22）。回傳問題清單（空＝通過）。"""
    problems: list[str] = []
    for r in load_sigma_rows():
        for s in r["should_match"]:
            frag = Chem.MolFromSmiles(s)
            if frag is None or _match_sigma_row(frag) is not r:
                problems.append(f"hammett_sigma {r['id']}：正例 {s} 沒有配到這一列")
        for s in r["should_not_match"]:
            frag = Chem.MolFromSmiles(s)
            if frag is not None and _match_sigma_row(frag) is r:
                problems.append(f"hammett_sigma {r['id']}：反例 {s} 不應配到這一列")
    for eq in load_equation_rows():
        for s in eq["should_match"]:
            m = Chem.MolFromSmiles(s)
            hit = m is not None and any(e["id"] == eq["id"] for e, _ in find_groups(m))
            if not hit:
                problems.append(f"pka_equations {eq['id']}：正例 {s} 沒有配到這一列")
        for s in eq["should_not_match"]:
            m = Chem.MolFromSmiles(s)
            if m is not None and any(e["id"] == eq["id"] for e, _ in find_groups(m)):
                problems.append(f"pka_equations {eq['id']}：反例 {s} 不應配到這一列")
    return problems
