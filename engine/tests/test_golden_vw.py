"""黃金比對：VW（src/core/properties/vanDerWaalsVolume.ts ↔ engine/moleform_core/vw.py）。任務 M01。

黃金檔 tests/golden/vw.json 有三種案例（input.kind）：
- compute：computeVdwVolume 的完整輸出（基團、原子索引、氫數相關的缺基團描述、浮點加總）。
- rawMatches（R3）：兩張資料表全部 SMARTS 對該分子的**原始**配對（RDKit.js 的順序，TS 沒有排序過），
  與 Python `GetSubstructMatches` 逐字比對（命中順序、每個命中內的原子順序都要相同）。
- rawQuery（R3）：任意 SMILES × SMARTS 的原始配對，探測 uniquify、手性、芳香對共軛、遞迴、配對順序等參數。
- smarts（R4）：每一列 SMARTS 在 Python 都能解析，正反例的配對與 TS 相同；另有無法解析的 SMARTS 兩邊都判為無法解析。
R1（芳香性）專屬案例 id 以 'R1/' 開頭，R3 以 'R3/' 開頭（rawMatches 為 'R3/raw/'），R4 以 'R4/' 開頭。
浮點加總、原子順序不做任何排序以外的處理；比對規則同 M00（字串、整數、陣列逐字；浮點先比最短字串，不同才允許 1e-12 並列入 tolerance_cases）。
"""

from __future__ import annotations

import pytest
from rdkit import Chem, RDLogger

import golden_compare as gc
from moleform_core.mol_graph import mol_from_smiles
from moleform_core.vw import (
    compute_vdw_volume,
    load_vw_groups,
    load_vw_groups_bondi,
    raw_matches,
    vw_matches,
)

GOLDEN_MODULE = "vw"
CASES = gc.golden_cases(GOLDEN_MODULE)
BY_KIND: dict[str, list[tuple[str, dict, object]]] = {"compute": [], "rawMatches": [], "rawQuery": [], "smarts": []}
for _id, _inp, _out in CASES:
    BY_KIND[_inp["kind"]].append((_id, _inp, _out))

RDLogger.DisableLog("rdApp.*")


def _all_rows():
    return [*load_vw_groups(), *load_vw_groups_bondi()]


def _ids(kind: str) -> list[str]:
    return [c[0] for c in BY_KIND[kind]]


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["compute"], ids=_ids("compute"))
def test_compute(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    gc.assert_case(GOLDEN_MODULE, case_id, out, compute_vdw_volume(inp["smiles"]))


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["rawMatches"], ids=_ids("rawMatches"))
def test_raw_matches(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    """R3：原始配對順序（未排序）逐字相同。"""
    mol = mol_from_smiles(inp["smiles"])
    assert mol is not None
    actual = {}
    for row in _all_rows():
        m = raw_matches(mol, Chem.MolFromSmarts(row.smarts))
        if m:
            actual[row.id] = m
    gc.assert_case(GOLDEN_MODULE, case_id, out, actual)


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["rawQuery"], ids=_ids("rawQuery"))
def test_raw_query_params(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    """R3：配對參數探針。RDKit.js 不帶 details 的預設行為，要與 Python 明確設定的 SUBSTRUCT_PARAMS 一致。"""
    mol = mol_from_smiles(inp["smiles"])
    q = Chem.MolFromSmarts(inp["smarts"])
    assert mol is not None and q is not None
    gc.assert_case(GOLDEN_MODULE, case_id, out, raw_matches(mol, q))


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["smarts"], ids=_ids("smarts"))
def test_smarts(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    """R4：SMARTS 可解析，正反例配對與 TS 一致。資料表列的 SMARTS 取自 Python 實際載入的 CSV，且必須與黃金檔記錄的相同。"""
    smarts = inp["smarts"]
    if inp["rowId"] is not None:
        row = next((r for r in _all_rows() if r.id == inp["rowId"]), None)
        assert row is not None, f"資料表沒有 {inp['rowId']}"
        assert row.smarts == smarts, f"{inp['rowId']} 的 SMARTS 與黃金檔不同（資料表改了，請重產黃金檔）"
    q = Chem.MolFromSmarts(smarts)
    actual: dict = {"valid": q is not None, "positives": {}, "negatives": {}}
    if q is not None:
        for key in ("positives", "negatives"):
            for s in inp[key]:
                mol = mol_from_smiles(s)
                actual[key][s] = {"invalid": True} if mol is None else vw_matches(mol, q)
    gc.assert_case(GOLDEN_MODULE, case_id, out, actual)


# ---------- 覆蓋與專屬案例 ----------


def test_every_table_row_has_smarts_case() -> None:
    ids = {c[1]["rowId"] for c in BY_KIND["smarts"] if c[1]["rowId"] is not None}
    assert ids == {r.id for r in _all_rows()}, "黃金檔的 SMARTS 案例必須剛好涵蓋兩張資料表的每一列"
    assert len(_all_rows()) == 43 + 18


def test_every_table_row_parses_in_python() -> None:
    for r in _all_rows():
        assert Chem.MolFromSmarts(r.smarts) is not None, f"{r.id} 的 SMARTS Python 無法解析"


def test_dedicated_risk_cases_present() -> None:
    ids = [c[0] for c in CASES]
    r1 = [i for i in ids if i.startswith("R1/")]
    r3 = [i for i in ids if i.startswith("R3/") and not i.startswith("R3/raw/")]
    r4 = [i for i in ids if i.startswith("R4/")]
    assert any("star" in i for i in r1), "R1 需要含 * 的重複單元案例"
    assert any(i in ("R1/pyridine", "R1/pyrrole", "R1/furan") for i in r1), "R1 需要雜環案例"
    assert any(i in ("R1/naphthalene", "R1/indole", "R1/pyrene") for i in r1), "R1 需要稠環案例"
    assert any("dummy-end" in i for i in r1), "R1 需要連接點另一端芳香／烷基的案例"
    assert any("PMMA" in i or "PVAc" in i for i in r3), "R3 需要需要優先順序判斷的基團案例"
    assert len([i for i in ids if i.startswith("R3/raw/")]) > 100
    assert len(r4) >= 61 + 5
    assert any(i.startswith("R4/invalid/") for i in r4), "R4 需要無法解析的 SMARTS 案例"
