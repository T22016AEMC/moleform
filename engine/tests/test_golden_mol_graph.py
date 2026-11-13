"""黃金比對：分子圖（src/core/properties/molGraph.ts ↔ engine/moleform_core/mol_graph.py）。

R1（芳香性）、R2（隱式氫與原子順序）的專屬案例 id 以 'R1/'、'R2/' 開頭。
原子順序與氫數直接逐字比對，不做任何排序或重排。
"""

from __future__ import annotations

import pytest
from rdkit import RDLogger

import golden_compare as gc
from moleform_core.mol_graph import mol_from_smiles, read_graph

GOLDEN_MODULE = "molGraph"
CASES = gc.golden_cases(GOLDEN_MODULE)

RDLogger.DisableLog("rdApp.*")  # 無效 SMILES 的解析訊息不輸出到測試紀錄


@pytest.mark.parametrize(("case_id", "inp", "out"), CASES, ids=[c[0] for c in CASES])
def test_golden(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    mol = mol_from_smiles(inp["smiles"])
    actual = {"invalid": True} if mol is None else read_graph(mol).to_json()
    gc.assert_case(GOLDEN_MODULE, case_id, out, actual)


def test_dedicated_risk_cases_present() -> None:
    ids = [c[0] for c in CASES]
    r1 = [i for i in ids if i.startswith("R1/")]
    r2 = [i for i in ids if i.startswith("R2/")]
    assert any("star" in i for i in r1), "R1 需要含 * 的重複單元案例"
    assert any(i in ("R1/pyrrole", "R1/pyridine", "R1/furan") for i in r1), "R1 需要雜環案例"
    assert any(i in ("R1/naphthalene", "R1/indole", "R1/pyrene") for i in r1), "R1 需要稠環案例"
    assert len(r2) > 0
