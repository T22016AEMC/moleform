"""結晶熔點 Tm（van Krevelen Ym 基團貢獻）。任務 P6B（PLAN 6.4；D62：新計算直接寫在 Python，沒有 TypeScript 對應）。

方法（van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 6.3 節）：
- Ym = Σ Ymi，Tm = Ym ÷ M（式 6.20、6.21，書頁 153；M = 重複單元分子量）。
- 基團切分沿用 Yg 的切分程式（tg.compute_tg_book；Appendix II：Yg 與 Ym 的重疊基團沿用既有切分，不重複發明），只是資料表換成 `ym_groups.csv`
  （Table 6.8、Table 6.14）。共軛狀態（n／c／cc）、–C(CH3)2– 自由／受阻、–CH=CH– 順反的判定規則與 Tg 相同。
- 主鏈 –CH2–：Table 6.10 的 Ym(CH2) 依「該 CH2 與最近官能基的距離」（原子鍵長數 α／β／γ／δ，書頁 157）取值（1.0／3.0／4.6／5.7），
  沒有官能基時為極限值 5.7；Table 6.10 的整列數值由這些位置值加總而得（測試以 Table 6.10 逐列核對）。
- 長側鏈（梳形聚合物）：側鏈為直鏈烷基、基礎聚合物是 Table 6.9 的五個系列之一時，依式 (6.22)–(6.24)：
  N = 5：Ym ≈ Ym5；N < 5：Ym ≈ Ymo + N/5·(Ym5 − Ymo)；N > 5：Ym ≈ Ym5 + 5.7(N − 5)；M = Mo + N × 14.0。
- 官能基的奇偶效應（Table 6.12，±0.3～±2.5 每個官能基）書中只作為修正示範（Example 6.5），適用條件（哪些 CH2 序列的奇偶）書中說明不完整，本模組不套用，
  輸出備註註明。
- 不做：側鏈不是 Table 6.9 系列的 –CH2–、s／ss 受阻 –C(CH3)2–、–C(=O)– al／ar、書中沒有數值的基團（一律回報缺基團，不猜）。
"""

from __future__ import annotations

import math
from typing import Any

from rdkit import Chem

from . import tg as _tg
from .mol_graph import mol_from_smiles, read_graph
from .y_tables import load_ch2_sequence, load_side_chain, load_ym_rows, ym_yg_rows

TM_MODEL = (
    "van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 6.3 節式 6.20–6.21："
    "Tm = 1000·ΣYmi ÷ M（Ymi：K·kg/mol；M：g/mol；Table 6.8、6.14；–CH2– 依 Table 6.10 位置值；長側鏈依式 6.22–6.24）"
)
TM_DISCLAIMER = (
    "本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。"
    "書中說明約 75% 的聚合物計算值與實驗值差 20 K 以內（6.3.3 節）。"
)
TM_NOTES = (
    "Tm 只在聚合物可結晶時有意義；未套用 Table 6.12 的官能基奇偶效應（±0.3～±2.5 每個官能基，書中適用條件說明不完整）。"
)
TM_UNIT = "K"

# 主鏈上「不算官能基」的基團家族（其餘有雜原子或羰基的基團視為官能基，用於 –CH2– 的位置判定）
NON_FUNCTIONAL_PREFIXES = ("A.CH2", "A.CH(", "A.C(", "A.CHF", "A.CHCl", "A.CFCl", "A.CCl2", "A.CF2", "B.CH=", "B.pC6H4", "B.mC6H4", "B.naph")
NON_FUNCTIONAL_IDS = frozenset(
    {
        "T.BPA", "T.C6H4CH2C6H4", "T.C6H4C6H4", "T.C6H4CMePhC6H4", "T.C6H4CPh2C6H4", "T.C6H4C6H10C6H4",
        "T.C6H4CMe2C6H4CMe2C6H4", "T.CH2C6H4CH2", "A.cC6H10",
    }
)  # fmt: skip


def _is_functional(family_id: str) -> bool:
    if family_id in NON_FUNCTIONAL_IDS:
        return False
    return not family_id.startswith(NON_FUNCTIONAL_PREFIXES)


def _invalid(smiles: str, message: str) -> dict[str, Any]:
    return {"status": "invalid", "smiles": smiles, "message": message}


def _position_value(distance: int | None) -> float:
    """Ym(CH2)：distance = 與最近官能基相隔的原子鍵長數（1 = α）；沒有官能基（None）或 > δ 為標準增量。"""
    pos = load_ch2_sequence().position_values
    if distance is None or distance >= 5:
        return pos[4]
    return pos[distance - 1]


def _ch2_distances(g: Any, dummies: list[int], main: set[int] | None, groups: list[dict[str, Any]]) -> dict[int, int | None]:
    """每個主鏈 –CH2– 到最近官能基原子的原子鍵長數（只沿主鏈走；兩個連接點時連接點兩側視為相接）；沒有官能基為 None。"""
    nodes = set(main) if main is not None else {i for i, z in enumerate(g.z) if z != 0}
    partner: dict[int, int] = {}
    if len(dummies) == 2:
        d1, d2 = dummies
        a1 = next((x for x in g.neighbors[d1] if g.z[x] != 0), None)
        a2 = next((x for x in g.neighbors[d2] if g.z[x] != 0), None)
        if a1 is not None and a2 is not None:
            partner[d1] = a2
            partner[d2] = a1

    def adjacent(a: int) -> list[int]:
        out: list[int] = []
        for nb in g.neighbors[a]:
            t = partner.get(nb) if g.z[nb] == 0 else nb
            if t is not None and t in nodes and t != a:
                out.append(t)
        return out

    dist: dict[int, int] = {}
    queue: list[int] = []
    for grp in groups:
        if _is_functional(grp["familyId"]):
            for a in grp["atoms"]:
                if a in nodes and a not in dist:
                    dist[a] = 0
                    queue.append(a)
    head = 0
    while head < len(queue):
        cur = queue[head]
        head += 1
        for nb in adjacent(cur):
            if nb not in dist:
                dist[nb] = dist[cur] + 1
                queue.append(nb)
    out: dict[int, int | None] = {}
    for grp in groups:
        if grp["familyId"] == "A.CH2":
            a = grp["atoms"][0]
            out[a] = dist.get(a)
    return out


def _strip_maps(mol: Chem.Mol) -> Chem.Mol:
    m = Chem.RWMol(mol)
    for a in m.GetAtoms():
        a.SetAtomMapNum(0)
    return m.GetMol()


def _comb_side_chain(mol: Chem.Mol, g: Any, dummies: list[int]) -> dict[str, Any] | None:
    """找直鏈烷基側鏈（末端 CH3，中間為不在主鏈、不在環上的 –CH2–）。沒有（N = 0）回傳 None；有多條回傳 {"error": ...}。"""
    main = _tg.main_chain_atoms(g, dummies)
    if main is None:
        return None
    found: list[tuple[int, list[int], int]] = []  # (CH3 原子, 鏈上 CH2 原子, 接到的原子 Y)
    for t, z in enumerate(g.z):
        if z != 6 or g.h_count[t] != 3 or len(g.neighbors[t]) != 1 or t in main:
            continue
        chain: list[int] = []
        prev, cur = t, g.neighbors[t][0]
        while (
            g.z[cur] == 6 and g.h_count[cur] == 2 and len(g.neighbors[cur]) == 2 and cur not in main and not mol.GetAtomWithIdx(cur).IsInRing()
        ):
            chain.append(cur)
            nxt = [x for x in g.neighbors[cur] if x != prev][0]
            prev, cur = cur, nxt
        if len(chain) >= 1:
            found.append((t, chain, cur))
    if not found:
        return None
    if len(found) > 1:
        return {"error": "含有多條直鏈烷基側鏈（式 6.22–6.24 只處理單一側鏈）"}
    t, chain, y = found[0]
    rw = Chem.RWMol(_strip_maps(mol))
    rw.AddBond(y, t, Chem.BondType.SINGLE)
    for idx in sorted(chain, reverse=True):
        rw.RemoveAtom(idx)
    basic = rw.GetMol()
    try:
        Chem.SanitizeMol(basic)
    except Exception:  # noqa: BLE001
        return {"error": "側鏈截短後的基礎單元無法解析"}
    return {"n": len(chain), "chain": chain, "basic": Chem.MolToSmiles(basic)}


def _canonical(smiles: str) -> str | None:
    m = mol_from_smiles(smiles)
    return None if m is None else Chem.MolToSmiles(_strip_maps(m))


def _comb_ym(n: int, ymo: float, ym5: float) -> float:
    """式 (6.22)–(6.24)。"""
    if n == 5:
        return ym5
    if n < 5:
        return ymo + n / 5 * (ym5 - ymo)
    return ym5 + 5.7 * (n - 5)


def _result(smiles: str, polymer: bool, sum_ym: float, sum_m: float, groups: list[dict[str, Any]], extra: dict[str, Any]) -> dict[str, Any]:
    tm_k = 1000 * sum_ym / sum_m if sum_m != 0 else math.nan
    return {
        "status": "ok",
        "smiles": smiles,
        "polymer": polymer,
        "tmK": tm_k,
        "tmC": tm_k - 273.15,
        "sumYm": sum_ym,
        "sumM": sum_m,
        "groups": groups,
        "containsTentative": any(x.get("tentative") for x in groups),
        "sources": list(dict.fromkeys(x["source"] for x in groups)),
        **extra,
    }


def compute_tm(smiles: str) -> dict[str, Any]:
    """聚合物重複單元（含 `*`）的 Tm。status：ok／missing／invalid。"""
    try:
        mol = mol_from_smiles(smiles)
    except Exception:  # noqa: BLE001
        mol = None
    if mol is None:
        return _invalid(smiles, "RDKit 無法解析這個 SMILES")
    if mol.GetNumAtoms() == 0:
        return _invalid(smiles, "分子沒有任何原子")
    g = read_graph(mol)
    dummies = [i for i, z in enumerate(g.z) if z == 0]
    polymer = len(dummies) > 0

    # ---- 長側鏈（式 6.22–6.24） ----
    comb = _comb_side_chain(mol, g, dummies)
    if comb is not None:
        if "error" in comb:
            return _missing_comb(smiles, polymer, comb["error"])
        basic = comb["basic"]
        series = next((s for s in load_side_chain() if _canonical(s.basic_smiles) == basic), None)
        if series is None:
            return _missing_comb(
                smiles, polymer, "側鏈 –CH2–（式 6.22–6.24）只涵蓋 Table 6.9 的五個系列（聚烯烴、聚乙烯基醚、聚乙烯基酯、聚丙烯酸酯、聚甲基丙烯酸酯）；這個基礎單元不在其中"
            )
        n = comb["n"]
        ch2_mi = next((r.mi for r in load_ym_rows() if r.id == "A.CH2" and r.mi is not None), None)
        assert ch2_mi is not None
        sum_ym = _comb_ym(n, series.ymo, series.ym5)
        sum_m = series.mo + n * ch2_mi
        group = {
            "familyId": f"Table 6.9:{series.id}", "rowId": series.id, "name": f"{series.series}（{series.basic_polymer} 系列）側鏈 N = {n}",
            "kind": "側鏈修正", "ymi": sum_ym, "mi": sum_m, "state": "", "condition": "", "tentative": False,
            "atoms": list(comb["chain"]), "source": series.source, "calibrated": False,
        }  # fmt: skip
        eq = "式 6.22（N = 5：Ym ≈ Ym5）" if n == 5 else "式 6.23（N < 5）" if n < 5 else "式 6.24（N > 5）"
        return _result(smiles, polymer, sum_ym, sum_m, [group], {"sideChain": {"n": n, "series": series.series, "equation": eq, "ymo": series.ymo, "ym5": series.ym5, "mo": series.mo}})

    # ---- 一般情形：基團切分（沿用 Yg 切分程式）＋ 主鏈 CH2 依位置值 ----
    res = _tg.compute_tg_book(smiles, ym_yg_rows())
    if res["status"] == "invalid":
        return res
    main = _tg.main_chain_atoms(g, dummies)
    missing: list[dict[str, Any]] = list(res.get("missing", [])) if res["status"] == "missing" else []
    if main is not None:
        for grp in res["groups"]:
            if grp["familyId"] == "A.CH2" and grp["atoms"][0] not in main:
                a = grp["atoms"][0]
                missing.append(
                    {
                        "index": a,
                        "element": "C",
                        "description": f"{_tg._describe_atom(g, a)}；側鏈 –CH2–：只有 Table 6.9 的五個系列（直鏈烷基側鏈）可依式 6.22–6.24 計算",
                    }
                )
    if missing:
        missing.sort(key=lambda x: x["index"])
        return {"status": "missing", "smiles": smiles, "polymer": polymer, "groups": res["groups"], "missing": missing}

    groups = [{**x, "ymi": x["ygi"]} for x in res["groups"]]
    for x in groups:
        del x["ygi"]
    dist = _ch2_distances(g, dummies, main, groups)
    sum_ym = 0.0
    for grp in groups:
        if grp["familyId"] == "A.CH2":
            d = dist[grp["atoms"][0]]
            grp["ch2Distance"] = d
            grp["ymi"] = _position_value(d)
        sum_ym = sum_ym + grp["ymi"]
    sum_m = res["sumM"]
    return _result(smiles, polymer, sum_ym, sum_m, groups, {"formulaMass": res["formulaMass"]})


def _missing_comb(smiles: str, polymer: bool, reason: str) -> dict[str, Any]:
    return {"status": "missing", "smiles": smiles, "polymer": polymer, "groups": [], "missing": [{"index": None, "element": "", "description": reason}]}
