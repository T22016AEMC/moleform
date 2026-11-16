"""黃金比對：重複單元分析（src/core/polymer/repeatUnit.ts ↔ engine/moleform_core/repeat_unit.py）。任務 M04。

黃金檔 tests/golden/polymer-repeatUnit.json：input.kind = analyze（analyzeRepeatUnit 的完整輸出；TS 拋出例外記為 { threw: true }）。
比對規則同 M00（字串、整數、陣列逐字；浮點先比最短字串，不同才允許 1e-12 並列入 tolerance_cases）。
"""

from __future__ import annotations

import pytest
from rdkit import RDLogger

import golden_compare as gc
from moleform_core import repeat_unit

GOLDEN_MODULE = "polymer-repeatUnit"
CASES = gc.golden_cases(GOLDEN_MODULE)

RDLogger.DisableLog("rdApp.*")


def run_analyze(smiles: str) -> dict:
    try:
        return repeat_unit.analyze_repeat_unit(smiles)
    except repeat_unit.RdkitCallError:
        return {"threw": True}


@pytest.mark.parametrize(("case_id", "inp", "out"), CASES, ids=[c[0] for c in CASES])
def test_analyze(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    assert inp["kind"] == "analyze"
    gc.assert_case(GOLDEN_MODULE, case_id, out, run_analyze(inp["smiles"]))


def test_coverage_of_result_kinds() -> None:
    outs = {c[0]: c[2] for c in CASES}
    codes = {o["problem"]["code"] for o in outs.values() if "problem" in o}  # type: ignore[operator,index]
    assert codes == {
        "UNPARSABLE",
        "NO_ATTACHMENT",
        "TOO_FEW_ATTACHMENTS",
        "TOO_MANY_ATTACHMENTS",
        "DANGLING_ATTACHMENT",
        "ATTACHMENT_TO_ATTACHMENT",
        "BAD_NUMBERING",
    }
    assert any(o.get("ok") is True for o in outs.values())  # type: ignore[union-attr]
    assert any("threw" in o for o in outs.values()), "需要 TS 拋出例外（帶電連接點）的案例"  # type: ignore[operator]
    orders = {tuple(gc.plain(o["attachmentOrder"])) for o in outs.values() if o.get("ok") is True}  # type: ignore[union-attr,index]
    assert orders == {(1, 2), (2, 1)}


def test_map_100_quirk_is_reproduced() -> None:
    """TS 從 Molfile 文字讀映射編號：≥ 100 時欄位黏在一起而讀成 0（既有特性，docs/migration-known-issues.md K06）。"""
    outs = {c[0]: c[2] for c in CASES}
    both = outs["analyze/map/100-100"]
    assert both["ok"] is True  # type: ignore[index]
    assert gc.plain(both["attachmentOrder"]) == [1, 2]  # type: ignore[index]
    assert outs["analyze/map/100-2"]["problem"]["code"] == "BAD_NUMBERING"  # type: ignore[index]
