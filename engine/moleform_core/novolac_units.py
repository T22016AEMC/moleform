"""甲酚酚醛重複單元的類別辨識。對應 src/core/properties/novolacUnits.ts（任務 M05 組 1-4；D62／D63）。

SMARTS 逐字取自 TS。整個單元必須被 SMARTS 完整涵蓋（匹配原子數 = 單元原子數）。
"""

from __future__ import annotations

from rdkit import Chem

from .vw import raw_matches

NOVOLAC_ORTHO_CRESOL = "novolac_cresol_ortho"
NOVOLAC_PARA_CRESOL = "novolac_cresol_para"

CRESOL_NOVOLAC_SMARTS: tuple[dict[str, str], ...] = (
    {"resinClass": NOVOLAC_ORTHO_CRESOL, "label": "鄰甲酚酚醛（CH2 在 C6）", "smarts": "[#0]-[CH2]-c1:[cH]:c(-[#0]):[cH]:c(-[CH3]):c:1-[OH]"},
    {"resinClass": NOVOLAC_ORTHO_CRESOL, "label": "鄰甲酚酚醛（CH2 在 C4）", "smarts": "[#0]-c1:[cH]:c(-[CH2]-[#0]):[cH]:c(-[CH3]):c:1-[OH]"},
    {"resinClass": NOVOLAC_PARA_CRESOL, "label": "對甲酚酚醛", "smarts": "[#0]-[CH2]-c1:[cH]:c(-[CH3]):[cH]:c(-[#0]):c:1-[OH]"},
)


def identify_cresol_novolac(unit_smiles: str) -> str | None:
    """重複單元（含 * 連接點）是否為鄰／對甲酚酚醛單元；是則回傳類別 id，否則 None。"""
    try:
        mol = Chem.MolFromSmiles(unit_smiles)
    except Exception:  # noqa: BLE001
        return None
    if mol is None:
        return None
    total = mol.GetNumAtoms()
    for r in CRESOL_NOVOLAC_SMARTS:
        q = Chem.MolFromSmarts(r["smarts"])
        if q is None:
            continue
        found = raw_matches(mol, q)
        if found and len(found[0]) == total:
            return r["resinClass"]
    return None
