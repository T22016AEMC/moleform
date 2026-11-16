"""黃金比對：端基、共聚物、換算、分布（任務 M04）。

對應 tests/golden/polymer-{endGroups,copolymer,convert,distribution}.json；比對規則同 M00。
輸入含 NaN／Infinity 時以 {"$nonfinite"} 記錄，用 polymer_helpers.decode 還原；「沒有這個欄位」就是 JS 的 undefined。
"""

from __future__ import annotations

import pytest
from rdkit import RDLogger

import golden_compare as gc
from moleform_core import convert, copolymer, distribution, end_groups, repeat_unit
from polymer_helpers import by_kind, decode

RDLogger.DisableLog("rdApp.*")

ENDS = "polymer-endGroups"
COPOLY = "polymer-copolymer"
CONVERT = "polymer-convert"
DIST = "polymer-distribution"


def _params(module: str, kinds: tuple[str, ...]) -> list:
    cases = by_kind(gc.golden_cases(module), kinds)
    return [pytest.param(module, c[0], c[1], c[2], id=f"{module}:{c[0]}") for k in kinds for c in cases[k]]


def run_case(module: str, inp: dict) -> object:
    kind = inp["kind"]
    d = decode(inp)
    try:
        if kind == "endGroup":
            return end_groups.analyze_end_group(d["end"], d["which"])
        if kind == "endGroups":
            return end_groups.analyze_end_groups(d.get("spec"))
        if kind == "note":
            return end_groups.end_group_note(d["filled"])
        if kind == "analyze":
            return copolymer.analyze_polymer_units(d["canonicalSmiles"], d.get("spec"))
        if kind == "units":
            return copolymer.units_of(d["canonicalSmiles"], d.get("spec"))
        if kind == "drawn":
            return copolymer.check_drawn_unit(d["structure"], d["analysis"], d["unitNumber"])
        if kind == "resolve":
            return convert.resolve_polymer(d["spec"], d["mUnit"], d.get("ends"))
        if kind == "parse":
            return convert.parse_polymer_spec(d["value"])
        if kind == "dpFromMn":
            return convert.dp_from_mn(d["mn"], d["mUnit"])
        if kind == "mnFromDp":
            return convert.mn_from_dp(d["dp"], d["mUnit"])
        if kind == "masses":
            return distribution.two_component_masses(d["mw"], d["mn"])
        if kind == "species":
            return distribution.two_component_species(d["mw"], d["mn"], d["mEnds"])
    except repeat_unit.RdkitCallError:
        return {"threw": True}
    except distribution.LowMwNoSolutionError as e:
        return {"threw": True, "message": str(e)}
    raise AssertionError(kind)


ALL = (
    _params(ENDS, ("endGroup", "endGroups", "note"))
    + _params(COPOLY, ("analyze", "units", "drawn"))
    + _params(CONVERT, ("resolve", "parse", "dpFromMn", "mnFromDp"))
    + _params(DIST, ("masses", "species"))
)


@pytest.mark.parametrize(("module", "case_id", "inp", "out"), ALL)
def test_golden(golden_version_ok_for: None, module: str, case_id: str, inp: dict, out: object) -> None:
    gc.assert_case(module, case_id, out, run_case(module, inp))


@pytest.fixture(scope="module")
def golden_version_ok_for() -> None:
    """四個黃金檔的 RDKit.js 版本都必須與引擎的 RDKit 版本一致，否則拒絕比對。"""
    for module in (ENDS, COPOLY, CONVERT, DIST):
        try:
            gc.check_version(gc.load_golden(module))
        except gc.VersionMismatchError as e:
            pytest.fail(str(e), pytrace=False)


def test_coverage() -> None:
    conv = {c[0]: c[2] for c in gc.golden_cases(CONVERT)}
    assert any(o.get("ok") is True for k, o in conv.items() if k.startswith("resolve/"))  # type: ignore[union-attr]
    assert any("error" in o for k, o in conv.items() if k.startswith("resolve/"))  # type: ignore[operator]
    dist = [c[2] for c in gc.golden_cases(DIST) if c[0].startswith("species/")]
    assert any("threw" in o for o in dist), "需要「低分子量修正無解」的案例"  # type: ignore[operator]
    assert any(o.get("lowMw") is True for o in dist)  # type: ignore[union-attr]
    cop = {c[0]: c[2] for c in gc.golden_cases(COPOLY)}
    assert any(k.startswith("analyze/roundhalf/") for k in cop), ".5 捨入的專屬案例"
    ties = [o["problem"]["message"] for k, o in cop.items() if k.startswith("analyze/roundhalf/90+1/128")]  # type: ignore[index]
    assert all("90.007813" in m for m in ties), ties  # JS toFixed 進位（Python 的 format 會得到 90.007812）
