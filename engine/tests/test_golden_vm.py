"""黃金比對：Vm／密度（src/core/properties/molarVolumeDensity.ts ↔ engine/moleform_core/vm.py）。任務 M03。

黃金檔 tests/golden/vm.json 的案例種類（input.kind）：
- compute：computeMolarVolumeDensity 的完整輸出（options.dropIds＝資料表去掉哪幾列，測缺基團與切分順序）。
- state：judgeState 的輸出（Tg 與 25 °C 的比較、依據文字）；TS 拋出例外者記為 { threw: true }。
- count：countMolarVolumeGroups 的輸出。
- rawMatches（R3）：資料表與缺基團補充說明（MISSING_HINTS）全部 SMARTS 對該分子的**原始**配對（RDKit.js 的順序，TS 沒有排序過）。
- rawQuery（R3）：任意 SMILES × SMARTS 的原始配對，探測 uniquify、手性、芳香對共軛、遞迴、配對順序等參數。
- smarts（R4）：每一列 SMARTS 在 Python 都能解析，正反例的原始配對與 vwMatches 結果與 TS 相同；另有無法解析的 SMARTS 兩邊都判為無法解析。
- order：orderMolarVolumeGroups 的切分順序。
R1（芳香性）專屬案例 id 以 'R1/' 開頭，R2 'R2/'，R3 以 'R3/' 開頭（rawMatches 為 'R3/raw/'），R4 以 'R4/'，玻璃態／橡膠態邊界以 'boundary/' 開頭。
比對規則同 M00（字串、整數、陣列逐字；浮點先比最短字串，不同才允許 1e-12 並列入 tolerance_cases）。
"""

from __future__ import annotations

import pytest
from rdkit import Chem, RDLogger

import golden_compare as gc
from moleform_core import vm
from moleform_core.mol_graph import mol_from_smiles
from moleform_core.vw import raw_matches, vw_matches

GOLDEN_MODULE = "vm"
CASES = gc.golden_cases(GOLDEN_MODULE)
KINDS = ("compute", "state", "count", "rawMatches", "rawQuery", "smarts", "order")
BY_KIND: dict[str, list[tuple[str, dict, object]]] = {k: [] for k in KINDS}
for _id, _inp, _out in CASES:
    BY_KIND[_inp["kind"]].append((_id, _inp, _out))

RDLogger.DisableLog("rdApp.*")


def _ids(kind: str) -> list[str]:
    return [c[0] for c in BY_KIND[kind]]


def _rows_without(drop_ids: list[str]) -> list[vm.MolarVolumeGroupRow]:
    return [r for r in vm.load_molar_volume_groups() if r.id not in drop_ids]


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["compute"], ids=_ids("compute"))
def test_compute(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    drop = inp["options"].get("dropIds")
    rows = None if drop is None else _rows_without(drop)
    gc.assert_case(GOLDEN_MODULE, case_id, out, vm.compute_molar_volume_density(inp["smiles"], rows))


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["state"], ids=_ids("state"))
def test_state(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    gc.assert_case(GOLDEN_MODULE, case_id, out, vm.judge_state(inp["smiles"]))


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["count"], ids=_ids("count"))
def test_count(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    result = vm.compute_molar_volume_density(inp["smiles"])
    assert result["status"] == "ok"
    gc.assert_case(GOLDEN_MODULE, case_id, out, vm.count_molar_volume_groups(result["groups"]))


# ---------- R3：原始配對順序 ----------


def _distinct_smarts() -> list[str]:
    return list(dict.fromkeys([*(r.smarts for r in vm.load_molar_volume_groups()), *(s for s, _ in vm.MISSING_HINTS)]))


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["rawMatches"], ids=_ids("rawMatches"))
def test_raw_matches(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    """R3：原始配對順序（未排序）逐字相同。"""
    mol = mol_from_smiles(inp["smiles"])
    assert mol is not None
    actual = {}
    for smarts in _distinct_smarts():
        m = raw_matches(mol, Chem.MolFromSmarts(smarts))
        if m:
            actual[smarts] = m
    gc.assert_case(GOLDEN_MODULE, case_id, out, actual)


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["rawQuery"], ids=_ids("rawQuery"))
def test_raw_query_params(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    """R3：配對參數探針。RDKit.js 不帶 details 的預設行為，要與 Python 明確設定的 SUBSTRUCT_PARAMS 一致。"""
    mol = mol_from_smiles(inp["smiles"])
    q = Chem.MolFromSmarts(inp["smarts"])
    assert mol is not None and q is not None
    gc.assert_case(GOLDEN_MODULE, case_id, out, raw_matches(mol, q))


# ---------- R4：SMARTS 解析與正反例 ----------


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["smarts"], ids=_ids("smarts"))
def test_smarts(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    """R4：SMARTS 可解析，正反例的原始配對與已排序配對與 TS 相同。資料表列的 SMARTS 取自 Python 實際載入的 CSV，且必須與黃金檔記錄的相同。"""
    smarts = inp["smarts"]
    if inp["rowId"] is not None:
        row = next((r for r in vm.load_molar_volume_groups() if r.id == inp["rowId"]), None)
        assert row is not None, f"資料表沒有 {inp['rowId']}"
        assert row.smarts == smarts, f"{inp['rowId']} 的 SMARTS 與黃金檔不同（資料表改了，請重產黃金檔）"
    q = Chem.MolFromSmarts(smarts)
    actual: dict = {"valid": q is not None, "positives": {}, "negatives": {}}
    if q is not None:
        for key in ("positives", "negatives"):
            for s in inp[key]:
                mol = mol_from_smiles(s)
                actual[key][s] = {"invalid": True} if mol is None else {"raw": raw_matches(mol, q), "sorted": vw_matches(mol, q)}
    gc.assert_case(GOLDEN_MODULE, case_id, out, actual)


# ---------- order ----------


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["order"], ids=_ids("order"))
def test_order(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    actual = [
        {"id": f.id, "atomCount": f.atom_count, "order": f.order}
        for f in vm.order_molar_volume_groups(_rows_without(inp["dropIds"]))
    ]
    gc.assert_case(GOLDEN_MODULE, case_id, out, actual)


# ---------- 覆蓋與專屬案例 ----------


def test_every_table_row_has_smarts_case() -> None:
    ids = {c[1]["rowId"] for c in BY_KIND["smarts"] if c[1]["rowId"] is not None}
    assert ids == {r.id for r in vm.load_molar_volume_groups()}, "黃金檔的 SMARTS 案例必須剛好涵蓋資料表的每一列"
    assert len(vm.load_molar_volume_groups()) == 27


def test_every_table_row_parses_in_python() -> None:
    for r in vm.load_molar_volume_groups():
        assert Chem.MolFromSmarts(r.smarts) is not None, f"{r.id} 的 SMARTS Python 無法解析"


def test_missing_hint_smarts_match_golden() -> None:
    """缺基團補充說明的 SMARTS（TS 的 MISSING_HINTS 沒有匯出，由匯出程式從原始碼讀出）必須與 Python 的相同。"""
    golden = [c[1]["smarts"] for c in BY_KIND["smarts"] if c[0].startswith("R4/hint")]
    assert golden == [s for s, _ in vm.MISSING_HINTS]


def test_dedicated_risk_cases_present() -> None:
    ids = [c[0] for c in BY_KIND["compute"]]
    r1 = [i for i in ids if i.startswith("R1/")]
    r2 = [i for i in ids if i.startswith("R2/")]
    r3 = [i for i in ids if i.startswith("R3/")]
    r4 = [c[0] for c in BY_KIND["smarts"] if c[0].startswith("R4/")]
    assert any("star" in i for i in r1), "R1 需要含 * 的重複單元案例"
    assert any("hetero" in i for i in r1), "R1 需要雜環案例"
    assert any("fused" in i for i in r1), "R1 需要稠環案例"
    assert len(r2) >= 10
    assert any("PMMA" in i or "PVAc" in i for i in r3), "R3 需要需要優先順序判斷的基團案例"
    assert len([c for c in BY_KIND["rawMatches"] if c[0].startswith("R3/raw/")]) > 100
    assert len(r4) >= 27 + 2 + 5
    assert any(i.startswith("R4/invalid/") for i in r4), "R4 需要無法解析的 SMARTS 案例"
    assert any(i.startswith("missing/") for i in ids), "需要缺基團案例"


def test_state_boundary_cases() -> None:
    """玻璃態／橡膠態邊界：Tg 在 25 °C 兩側各有緊鄰的案例（最近的 ±0.04 °C 以內），狀態未定（Tg 缺基團）也有案例。"""
    outs = {c[0]: c[2] for c in BY_KIND["compute"] if "#" not in c[0]}  # 不含去掉資料表列的變體
    below = [o for i, o in outs.items() if i.startswith("boundary/below-") and o["status"] == "ok"]  # type: ignore[index]
    above = [o for i, o in outs.items() if i.startswith("boundary/above-") and o["status"] == "ok"]  # type: ignore[index]
    assert len(below) >= 10 and len(above) >= 8
    assert all(o["state"]["state"] == "rubbery" for o in below)  # type: ignore[index]
    assert all(o["state"]["state"] == "glassy" for o in above)  # type: ignore[index]
    tg_below = max(float(o["state"]["tgC"].raw) for o in below)  # type: ignore[index]
    tg_above = min(float(o["state"]["tgC"].raw) for o in above)  # type: ignore[index]
    assert 24.99 < tg_below < 25 < tg_above < 25.04, (tg_below, tg_above)
    undetermined = [i for i, o in outs.items() if i.startswith("boundary/Tg-missing") and o["state"]["state"] == "undetermined"]  # type: ignore[index]
    assert len(undetermined) >= 2
