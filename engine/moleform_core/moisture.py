"""吸濕性（25 °C 平衡含水量，van Krevelen 基團貢獻）。任務 P6B（PLAN 6.5；D62：新計算直接寫在 Python，沒有 TypeScript 對應）。

方法（van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 18.3.4 節，書頁 689–691）：
- Table 18.14（引 Barrie 1968）：非晶聚合物每結構基團在相對濕度 0.3／0.5／0.7／0.9／1.0 下的莫耳含水量（mol 水／mol 基團，25 °C）。
- 每重複單元的莫耳含水量 = Σ（基團數 × 表值）；g 水／100 g 聚合物 = 莫耳含水量 × 18 ÷ M × 100（水的分子量 18，Example 18.4；M = 重複單元分子量，
  vm.unit_mass_of，本專案原子量表）。
- 結晶度：S = S_a·(1 − x_c)（式 18.15，書頁 663；Example 18.4 用它處理半結晶尼龍 6,6）。
- 表中沒有的基團視為無貢獻，但一律列出「未涵蓋基團」並警告，不靜默忽略；書中括號值標「書中括號值（不確定）」；書中空白的格子（–NH3⁺ 在 0.3、0.5、1.0，
  –COO⁻ 在 0.9、1.0）無值，回報缺值，不內插。
- 結果是參考趨勢：25 °C、非晶區基團加成，不含溫度、聚合物間氫鍵可及性等影響（書頁 689：可及性與結晶度使基團數與溶解度沒有簡單關係）。
"""

from __future__ import annotations

from typing import Any

from rdkit import Chem

from . import vm as _vm
from .mol_graph import mol_from_smiles, read_graph
from .tg import _describe_atom, _symbol_of
from .y_tables import WATER_RH, WaterGroup, load_water_groups

WATER_MODEL = (
    "van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 18.3.4 節 Table 18.14（引 Barrie 1968）："
    "g 水／100 g 聚合物 = 100·18·Σ(基團數×莫耳含水量) ÷ M；結晶度修正 S = S_a(1 − x_c)（式 18.15，Example 18.4）"
)
WATER_DISCLAIMER = (
    "本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。"
)
WATER_NOTES = "25 °C、非晶區、參考趨勢"
WATER_MOLAR_MASS = 18.0
WATER_UNIT = "g 水／100 g 聚合物"


def check_rh(rh: object) -> float:
    """RH 只允許 Table 18.14 的 0.3、0.5、0.7、0.9、1.0；其他拒絕（ValueError）。"""
    if isinstance(rh, bool) or not isinstance(rh, (int, float)):
        raise ValueError("相對濕度 rh 必須是數字")
    for allowed in WATER_RH:
        if abs(float(rh) - allowed) < 1e-9:
            return allowed
    raise ValueError("相對濕度只允許 Table 18.14 的 0.3、0.5、0.7、0.9、1.0")


def check_crystallinity(x: object) -> float | None:
    if x is None:
        return None
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        raise ValueError("結晶度 crystallinity 必須是 0～1 的數字")
    if not 0.0 <= float(x) <= 1.0:
        raise ValueError("結晶度 crystallinity 必須在 0～1 之間（例如 70% 填 0.7）")
    return float(x)


def _ordered_groups() -> list[tuple[WaterGroup, Chem.Mol]]:
    out: list[tuple[WaterGroup, Chem.Mol]] = []
    for order, grp in enumerate(load_water_groups()):
        q = Chem.MolFromSmarts(grp.smarts)
        if q is None:
            raise ValueError(f"吸濕性基團表的 SMARTS 無法解析：{grp.smarts}")
        out.append((grp, q))
    # 原子數多的基團先配對；同樣大小依資料表順序（穩定排序）
    out.sort(key=lambda t: -t[1].GetNumAtoms())
    return out


def _invalid(smiles: str, message: str) -> dict[str, Any]:
    return {"status": "invalid", "smiles": smiles, "message": message}


def compute_moisture(smiles: str, rh: float, crystallinity: float | None = None) -> dict[str, Any]:
    """聚合物重複單元的吸濕量。rh、crystallinity 請先用 check_rh、check_crystallinity 檢查。status：ok／missing／invalid。"""
    rh_index = WATER_RH.index(rh)
    mol = mol_from_smiles(smiles)
    if mol is None:
        return _invalid(smiles, "RDKit 無法解析這個 SMILES")
    if mol.GetNumAtoms() == 0:
        return _invalid(smiles, "分子沒有任何原子")
    g = read_graph(mol)
    polymer = any(z == 0 for z in g.z)
    owner = [-1] * len(g.z)
    for i, z in enumerate(g.z):
        if z == 0:
            owner[i] = -2  # 連接點不屬於任何基團
    counts: dict[str, int] = {}
    atoms_of: dict[str, list[list[int]]] = {}
    for grp, q in _ordered_groups():
        for match in mol.GetSubstructMatches(q, uniquify=True, maxMatches=10000):
            if any(owner[a] != -1 for a in match):
                continue
            for a in match:
                owner[a] = 1
            counts[grp.id] = counts.get(grp.id, 0) + 1
            atoms_of.setdefault(grp.id, []).append(list(match))
    uncovered = [
        {"index": i, "element": _symbol_of(g.z[i]), "description": _describe_atom(g, i)}
        for i, z in enumerate(g.z)
        if z > 1 and owner[i] == -1
    ]
    by_id = {grp.id: grp for grp in load_water_groups()}
    groups: list[dict[str, Any]] = []
    missing_values: list[dict[str, Any]] = []
    moles = 0.0
    for gid, n in counts.items():
        grp = by_id[gid]
        value = grp.values[rh_index]
        entry: dict[str, Any] = {
            "id": gid, "name": grp.name, "count": n, "valuePerGroup": value, "uncertain": grp.uncertain[rh_index],
            "atoms": atoms_of[gid], "source": grp.source,
        }  # fmt: skip
        groups.append(entry)
        if value is None:
            missing_values.append({"id": gid, "name": grp.name, "count": n, "reason": f"Table 18.14 在相對濕度 {rh} 沒有數值（書中此格空白），不內插"})
    if missing_values:
        return {"status": "missing", "smiles": smiles, "polymer": polymer, "rh": rh, "groups": groups, "missingValues": missing_values, "uncovered": uncovered}
    for entry in groups:
        moles = moles + entry["count"] * entry["valuePerGroup"]
        entry["contribution"] = entry["count"] * entry["valuePerGroup"]
    mass = _vm.unit_mass_of(g)
    if mass is None or mass == 0:
        return _invalid(smiles, "重複單元分子量無法計算（原子量表沒有的元素）")
    amorphous = moles * WATER_MOLAR_MASS / mass * 100
    value = amorphous if crystallinity is None else amorphous * (1 - crystallinity)
    uncertain = [e["name"] for e in groups if e["uncertain"]]
    return {
        "status": "ok",
        "smiles": smiles,
        "polymer": polymer,
        "rh": rh,
        "crystallinity": crystallinity,
        "value": value,
        "amorphousValue": amorphous,
        "molesWaterPerUnit": moles,
        "unitMass": mass,
        "groups": groups,
        "uncovered": uncovered,
        "uncertainGroups": uncertain,
        "sources": list(dict.fromkeys(e["source"] for e in groups)),
    }

