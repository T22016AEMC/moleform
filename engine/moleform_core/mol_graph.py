"""把 RDKit 分子讀成簡單的圖（原子序、氫數、鄰居、芳香性、雙鍵順反）。對應 src/core/properties/molGraph.ts。

TypeScript 版從 RDKit.js 的 `get_json()`（RDKit MolInterchange 格式）讀取；Python 版直接讀 RDKit 物件，
對應關係（任務 M00，風險 R1／R2）：

- z：JSON `atoms[i].z`（預設 6 時省略）→ `atom.GetAtomicNum()`；`*` 為 0。
- hCount：JSON `atoms[i].impHs`（0 時省略）→ `atom.GetTotalNumHs()`（不含以原子形式存在的 H 鄰居，
  與 JSON 寫出的值相同；以黃金比對確認）。
- 原子順序：JSON 的 atoms 順序即 RDKit 原子索引；Python 直接用索引 0..n-1，**不重新排序**。
- neighbors：由鍵（依鍵索引順序）建立，之後每個清單由小到大排序——這是 TypeScript 原本就做的步驟，照搬。
- aromatic：JSON `extensions[rdkitRepresentation].aromaticAtoms` → `atom.GetIsAromatic()`。
- doubleBondStereo：JSON `bonds[k].stereo` 為 cis／trans（RDKit 寫出時 STEREOCIS／STEREOZ → cis，
  STEREOTRANS／STEREOE → trans）→ `bond.GetStereo()` 同樣對應；鍵為 'min-max'，依鍵索引順序加入。

分子由呼叫端以 `Chem.MolFromSmiles(smiles)` 建立（對應 TS 的 `RDKit.get_mol(smiles)`，不帶選項）。
"""

from __future__ import annotations

from dataclasses import dataclass

from rdkit import Chem

_CIS = (Chem.BondStereo.STEREOCIS, Chem.BondStereo.STEREOZ)
_TRANS = (Chem.BondStereo.STEREOTRANS, Chem.BondStereo.STEREOE)


@dataclass(frozen=True)
class MolGraph:
    z: list[int]
    """原子序；連接點（`*`）為 0"""
    h_count: list[int]
    """隱含氫數"""
    neighbors: list[list[int]]
    aromatic: list[bool]
    double_bond_stereo: dict[str, str]
    """有順反標示的雙鍵：'i-j'（小的在前）→ 'cis'／'trans'；依鍵索引順序（與 TS 的 Map 插入順序相同）"""

    def to_json(self) -> dict:
        """與 TypeScript 的 MolGraph 欄位名稱相同的 JSON 形式（黃金比對用）。"""
        return {
            "z": self.z,
            "hCount": self.h_count,
            "neighbors": self.neighbors,
            "aromatic": self.aromatic,
            "doubleBondStereo": self.double_bond_stereo,
        }


def read_graph(mol: Chem.Mol) -> MolGraph:
    n = mol.GetNumAtoms()
    neighbors: list[list[int]] = [[] for _ in range(n)]
    double_bond_stereo: dict[str, str] = {}
    for bond in mol.GetBonds():
        a, b = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        neighbors[a].append(b)
        neighbors[b].append(a)
    for bond in mol.GetBonds():
        stereo = bond.GetStereo()
        label = "cis" if stereo in _CIS else "trans" if stereo in _TRANS else None
        if label is not None:
            a, b = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
            double_bond_stereo[f"{min(a, b)}-{max(a, b)}"] = label
    for lst in neighbors:
        lst.sort()
    atoms = list(mol.GetAtoms())
    return MolGraph(
        z=[a.GetAtomicNum() for a in atoms],
        h_count=[a.GetTotalNumHs() for a in atoms],
        neighbors=neighbors,
        aromatic=[a.GetIsAromatic() for a in atoms],
        double_bond_stereo=double_bond_stereo,
    )


def mol_from_smiles(smiles: str) -> Chem.Mol | None:
    """對應 TS 的 `RDKit.get_mol(smiles)`（預設選項）；無效時回傳 None。"""
    return Chem.MolFromSmiles(smiles)
