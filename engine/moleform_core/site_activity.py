"""反應位點相對活性排序（任務 P7-5，PLAN 7.3，D38、D39、D66）。

對交聯第 0 層命中的反應位點（`crosslink.find_group_sites` 的結果）產生**兩個分開的排序，不合成單一分數**：
1. 電子效應排序：同一成分、同一官能基類別（groupId）的各位點依 7.3a 的 pKa 估算值（`pka.py`）排序。
   親核位點（酚、胺、醇、硫醇、咪唑）pKa 愈高排名愈前；酸性位點（羧酸）pKa 愈低排名愈前（見 `pka.DIRECTION_TEXT`）。
   只在該類所有位點的 pKa 都算得出時排序；有 missing 的位點列出但整類不排。可信度「參考趨勢」（Brønsted 關係的方向，不是定量速率）。
2. 空間位阻排序：以 3D 構型算反應原子的相對可及表面積（SASA）。**這是幾何描述量，不是文獻公式。**
   參數固定（可重現）：RDKit ETKDGv3、randomSeed = 42、10 個構型、MMFF94 最佳化（maxIters = 2000）、探針半徑 1.4 Å、
   RDKit 的 Lee–Richards SASA（rdFreeSASA.CalcSASA）、原子半徑取 RDKit 週期表的 vdW 半徑（含氫）、各構型取平均。
   相對 SASA ＝ 位點反應原子的 SASA 合計 ÷ 這些原子各自「單獨存在」時的球面積 4π(r + 1.4)² 合計（0 ＝ 完全被遮蔽，1 ＝ 完全暴露）。
   排名 1 ＝ 相對 SASA 最大（最不受阻）；相對 SASA 相差不到 0.01 視為同名次（對稱位點的構型雜訊）。
   聚合物成分沿用任務 024 的重複單元片段做法（連接點 `*` 換成甲基、端基不計）；做不到的成分回報 missing。
兩個排序各自附「參考趨勢」，不合併、不自訂權重。
"""

from __future__ import annotations

import math
from typing import Any, Mapping, Sequence

from rdkit import Chem
from rdkit.Chem import AllChem, rdDistGeom, rdFreeSASA

from . import crosslink, pka

SASA_SEED = 42
SASA_CONFORMERS = 10
SASA_MMFF_ITERS = 2000
SASA_PROBE = 1.4
SASA_TIE = 0.01
SASA_MAX_HEAVY_ATOMS = 150
MAX_COMPONENTS = 200

SITE_MODEL = "反應位點相對活性排序（電子效應：Hammett／Taft pKa；位阻：3D 構型的相對可及表面積）"
ELECTRONIC_TREND = "參考趨勢：依 pKa 的 Brønsted 方向排序，不是定量的反應速率"
STERIC_TREND = "參考趨勢：幾何描述量（不是文獻公式），依單一固定種子的構型估算"
SASA_PARAMS = {
    "forceField": "MMFF94", "embedding": "ETKDGv3", "randomSeed": SASA_SEED, "conformers": SASA_CONFORMERS, "maxIters": SASA_MMFF_ITERS,
    "probeRadius": SASA_PROBE, "algorithm": "LeeRichards", "radii": "RDKit 週期表 vdW 半徑（含氫）", "average": "各構型取平均", "tieTolerance": SASA_TIE,
}
NOT_APPLICABLE_PKA = "這個官能基不是 pka_equations 涵蓋的可解離基團，沒有 pKa（電子效應排序不適用）"


def compute_sasa_per_atom(mol: Chem.Mol) -> tuple[list[float] | None, list[float] | None, str | None]:
    """整個分子各重原子的平均 SASA 與「單獨存在」球面積（Å²）。回傳 (sasa, free, 原因)；做不到時前兩者為 None。"""
    if mol.GetNumHeavyAtoms() > SASA_MAX_HEAVY_ATOMS:
        return None, None, f"分子太大（重原子超過 {SASA_MAX_HEAVY_ATOMS}），不做 3D"
    mh = Chem.AddHs(mol)
    ps = rdDistGeom.ETKDGv3()
    ps.randomSeed = SASA_SEED
    ps.numThreads = 1
    cids = list(rdDistGeom.EmbedMultipleConfs(mh, SASA_CONFORMERS, ps))
    if not cids:
        return None, None, "無法產生 3D 構型"
    if not AllChem.MMFFHasAllMoleculeParams(mh):
        return None, None, "MMFF94 沒有這個分子的全部參數，不做 3D（不改用其他力場）"
    AllChem.MMFFOptimizeMoleculeConfs(mh, maxIters=SASA_MMFF_ITERS, numThreads=1, mmffVariant="MMFF94")
    pt = Chem.GetPeriodicTable()
    radii = [pt.GetRvdw(a.GetAtomicNum()) for a in mh.GetAtoms()]
    opts = rdFreeSASA.SASAOpts()
    opts.algorithm = rdFreeSASA.SASAAlgorithm.LeeRichards
    opts.probeRadius = SASA_PROBE
    n_heavy = mol.GetNumAtoms()
    sums = [0.0] * n_heavy
    for cid in cids:
        rdFreeSASA.CalcSASA(mh, radii, confIdx=cid, opts=opts)
        for i in range(n_heavy):
            sums[i] += float(mh.GetAtomWithIdx(i).GetProp("SASA"))
    sasa = [s / len(cids) for s in sums]
    free = [4.0 * math.pi * (radii[i] + SASA_PROBE) ** 2 for i in range(n_heavy)]
    return sasa, free, None


def _rank(values: Sequence[float], descending: bool, tol: float) -> list[int]:
    """競賽排名（1、1、3…）；相差不超過 tol 視為同名次。"""
    order = sorted(range(len(values)), key=lambda i: -values[i] if descending else values[i])
    ranks = [0] * len(values)
    for pos, i in enumerate(order):
        if pos > 0 and abs(values[i] - values[order[pos - 1]]) <= tol:
            ranks[i] = ranks[order[pos - 1]]
        else:
            ranks[i] = pos + 1
    return ranks


def _site_pka(groups: Sequence[Mapping[str, Any]], site: Sequence[int]) -> dict[str, Any]:
    for g in groups:
        if g["keyAtom"] in site:
            return {**g, "applicable": True}
    return {
        "applicable": False,
        "quantity": {"value": None, "unit": pka.PKA_UNIT, "source": pka.PKA_MODEL, "status": "missing"},
        "reason": NOT_APPLICABLE_PKA,
        "sigmaDetails": [],
        "className": None,
        "classId": None,
        "role": None,
        "note": pka.PKA_NOTE,
    }


def _site_sasa(sasa: list[float] | None, free: list[float] | None, why: str | None, site: Sequence[int]) -> dict[str, Any]:
    unit = "無單位（0–1）"
    source = "RDKit rdFreeSASA（幾何描述量，非文獻公式）；參數見 sasaParams"
    if sasa is None or free is None:
        return {"relative": None, "absolute": None, "unit": unit, "source": source, "status": "missing", "reason": why or "沒有 3D 構型"}
    if any(a < 0 or a >= len(sasa) for a in site):
        return {"relative": None, "absolute": None, "unit": unit, "source": source, "status": "missing", "reason": "位點的原子編號不在結構內"}
    absolute = sum(sasa[a] for a in site)
    rel = absolute / sum(free[a] for a in site)
    return {"relative": rel, "absolute": absolute, "unit": unit, "source": source, "status": "predicted", "reason": None}


def _unit_rows(label: str | None, smiles: str, groups: Sequence[Mapping[str, Any]], unit_index: int | None) -> tuple[list[dict[str, Any]], str | None]:
    """一個結構（小分子或一種重複單元）的所有位點列。"""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return [], "無法解析這個結構"
    capped = pka.cap_attachments(mol)
    pka_groups = pka.groups_for_mol(capped)
    any_sites = any(g["sites"] for g in groups)
    sasa = free = None
    why: str | None = None
    if any_sites:
        sasa, free, why = compute_sasa_per_atom(capped)
    names = {x["id"]: x["name_zh"] for x in crosslink.load_functional_groups()}
    rows: list[dict[str, Any]] = []
    for g in groups:
        for site in g["sites"]:
            site_ids = [int(a) for a in site]
            rows.append({
                "groupId": g["groupId"],
                "groupName": names.get(g["groupId"], g["groupId"]),
                "unitIndex": unit_index,
                "atoms": site_ids,
                "pka": _site_pka(pka_groups, site_ids),
                "sasa": _site_sasa(sasa, free, why, site_ids),
                "electronic": None,
                "steric": None,
            })
    return rows, None


def _apply_rankings(rows: list[dict[str, Any]]) -> None:
    by_group: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        by_group.setdefault(r["groupId"], []).append(r)
    for pool in by_group.values():
        n = len(pool)
        # 電子效應：全部位點都有 pKa 才排
        bad = [r for r in pool if r["pka"]["quantity"]["status"] != "predicted"]
        if bad:
            reason = NOT_APPLICABLE_PKA if all(r["pka"]["applicable"] is False for r in pool) else "同類位點有 pKa 缺值（missing），不排序（缺值的位點列出原因）"
            for r in pool:
                r["electronic"] = {"rank": None, "of": n, "reason": reason, "trend": ELECTRONIC_TREND}
        else:
            role = pool[0]["pka"]["role"]
            values = [r["pka"]["quantity"]["value"] for r in pool]
            ranks = _rank(values, descending=(role != "acid"), tol=1e-9)
            for r, k in zip(pool, ranks):
                r["electronic"] = {"rank": k, "of": n, "reason": None, "direction": pka.DIRECTION_TEXT[role], "trend": ELECTRONIC_TREND}
        # 空間位阻：全部位點都有 SASA 才排
        bad_s = [r for r in pool if r["sasa"]["status"] != "predicted"]
        if bad_s:
            for r in pool:
                r["steric"] = {"rank": None, "of": n, "reason": "同類位點有 3D 缺值（missing），不排序", "trend": STERIC_TREND}
        else:
            ranks_s = _rank([r["sasa"]["relative"] for r in pool], descending=True, tol=SASA_TIE)
            for r, k in zip(pool, ranks_s):
                r["steric"] = {"rank": k, "of": n, "reason": None, "direction": "相對可及表面積愈大（愈不受阻）排名愈前；排名 1 ＝ 最暴露", "trend": STERIC_TREND}


def compute_site_activity(components: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """`POST /crosslink/site-activity` 的計算。`components` 是 `/crosslink/analyze` 回應中 components 的項目
    （只用 id、name、isPolymer、source、groups、units、problem）。電子排序與位阻排序是兩個分開的結果，不合併。"""
    out_components: list[dict[str, Any]] = []
    for c in components:
        entry: dict[str, Any] = {"id": c["id"], "name": c["name"], "isPolymer": bool(c.get("isPolymer")), "status": "ok", "reason": None, "sites": []}
        if c.get("problem"):
            entry.update(status="missing", reason=f"第 0 層對這個成分有問題：{c['problem']}")
            out_components.append(entry)
            continue
        rows: list[dict[str, Any]] = []
        if c.get("isPolymer"):
            units = c.get("units") or []
            if not units:
                entry.update(status="missing", reason="聚合物沒有可用的重複單元分析，無法做單元片段")
                out_components.append(entry)
                continue
            for i, u in enumerate(units):
                unit_rows, why = _unit_rows(None, u["smiles"], u.get("groups") or [], i)
                if why:
                    entry.update(status="missing", reason=f"單元 {i + 1}：{why}")
                    break
                rows.extend(unit_rows)
        else:
            rows, why = _unit_rows(None, c["source"], c.get("groups") or [], None)
            if why:
                entry.update(status="missing", reason=why)
        if entry["status"] == "ok":
            _apply_rankings(rows)
            entry["sites"] = rows
            if not rows:
                entry["reason"] = "第 0 層沒有命中這個成分的反應位點"
        out_components.append(entry)
    return {
        "model": SITE_MODEL,
        "electronicTrend": ELECTRONIC_TREND,
        "stericTrend": STERIC_TREND,
        "sasaParams": SASA_PARAMS,
        "pkaModel": pka.PKA_MODEL,
        "pkaNote": pka.PKA_NOTE,
        "polymerNote": "聚合物成分以重複單元片段計算（連接點 * 換成甲基；端基不計，D05、任務 024）",
        "disclaimer": pka.PKA_DISCLAIMER,
        "components": out_components,
    }
