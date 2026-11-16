"""聚合物端基的分析。對應 src/core/polymer/endGroups.ts（任務 M04，PLAN 6A.4-03；D62／D63）。

演算法與 TypeScript 逐步等價：端基 SMILES 恰好一個 `*`；端基質量 M_end 與重複單元的 M_unit 同一算法
（RDKit 平均分子量，R7；`*` 質量為 0），見 repeat_unit.py 的說明。M_ends 用明確迴圈由左至右累加（不用內建 `sum()`）。
TypeScript 仍是預設計算來源，本模組沒有接到介面。
"""

from __future__ import annotations

import math
from typing import Any, Mapping

from rdkit.Chem import rdMolDescriptors

from .csv_reader import js_trim
from .mol_graph import mol_from_smiles
from .polymer_types import END_GROUP_NOTE


def analyze_end_group(end: Mapping[str, Any], which: int) -> dict[str, Any]:
    """對應 analyzeEndGroup。成功 { ok: True, info: { smiles, mEnd } }；失敗 { ok: False, message }（指出是端基 1 或 2）。"""
    label = f"端基 {which}"
    text = js_trim(end["smiles"])
    if text == "":
        return {"ok": False, "message": f"{label}：尚未輸入 SMILES。"}
    try:
        mol = mol_from_smiles(text)
    except Exception:  # TS：get_mol 拋例外視為 null
        mol = None
    if mol is None:
        return {"ok": False, "message": f"{label}：無法解析這個結構。"}
    atoms = list(mol.GetAtoms())
    dummies = [i for i, a in enumerate(atoms) if a.GetAtomicNum() == 0]
    if len(dummies) != 1:
        return {"ok": False, "message": f"{label}：端基需要恰好一個連接點（*），目前有 {len(dummies)} 個。"}
    d = dummies[0]
    if not any(b.GetBeginAtomIdx() == d or b.GetEndAtomIdx() == d for b in mol.GetBonds()):
        return {"ok": False, "message": f"{label}：連接點（*）沒有連到任何原子。"}
    amw = float(rdMolDescriptors._CalcMolWt(mol))
    if not math.isfinite(amw) or amw <= 0:
        return {"ok": False, "message": f"{label}：無法計算端基的分子量。"}
    return {"ok": True, "info": {"smiles": text, "mEnd": amw}}


def analyze_end_groups(spec: Mapping[str, Any] | None) -> dict[str, Any]:
    """對應 analyzeEndGroups。沒填的端基略過；M_ends ＝已填端基的質量合計。"""
    ends: list[dict[str, Any] | None] = [None, None]
    m_ends = 0.0
    end_groups = spec.get("endGroups") if spec is not None else None
    for which in (1, 2):
        end = end_groups.get("end1" if which == 1 else "end2") if end_groups is not None else None
        if end is None:
            continue
        r = analyze_end_group(end, which)
        if not r["ok"]:
            return r
        ends[which - 1] = r["info"]
        m_ends += r["info"]["mEnd"]
    return {"ok": True, "ends": ends, "mEnds": m_ends, "filled": [ends[0] is not None, ends[1] is not None]}


def end_group_note(filled: Any) -> str:
    """結果附註：兩端都填 → 無；都不填 → 「未計入端基」；只填一端 → 「端基 N 未填，未計入」。"""
    if filled[0] and filled[1]:
        return ""
    if not filled[0] and not filled[1]:
        return END_GROUP_NOTE
    return f"端基 {2 if filled[0] else 1} 未填，未計入"
