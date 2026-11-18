"""任務 P7-4a：成分可手動輸入密度（userDensity／userDensitySource）。
以下密度（1.0、5.0 g/cm3）全是「測試用」的假設值，不是材料數據，也不寫進 docs/verification/ 的正式結果。
檢查：小分子有輸入密度時收縮由 missing 變成有值（且與直接給 density 的結果相同）、預測密度優先（聚合物不改現有行為）、
來源標示「使用者輸入」、非正數／非有限數被拒。"""

from __future__ import annotations

import pytest

import moleform_engine as eng
from moleform_core import mixing as mx

from test_p7_4_shrinkage import BADGE, BPA, _run

PS = "*CC(*)c1ccccc1"  # 聚苯乙烯重複單元（有預測密度）


def _epoxy_phenol(extra_e: dict, extra_p: dict) -> tuple[int, dict]:
    comps = [
        {"id": "E", "name": "環氧", "category": "Resin", "canonicalSmiles": BADGE, **extra_e},
        {"id": "P", "name": "雙酚", "category": "Resin", "canonicalSmiles": BPA, **extra_p},
    ]
    return _run(comps, {"E": 50, "P": 50}, {"E": 400.0, "P": 200.0})


def test_small_molecule_without_density_is_missing() -> None:
    code, body = _epoxy_phenol({}, {})
    assert code == 200
    assert body["shrinkage"]["status"] == "missing"


def test_user_density_makes_shrinkage_available_and_matches_density_input() -> None:
    code, body = _epoxy_phenol(
        {"userDensity": 1.0, "userDensitySource": "測試用來源"},
        {"userDensity": 1.0},
    )
    assert code == 200
    s = body["shrinkage"]
    assert s["status"] == "predicted"
    assert s["density"]["gPerCm3"] == pytest.approx(1.0)
    by_name = {c["name"]: c for c in s["density"]["components"]}
    assert by_name["環氧"]["densitySource"] == "user"
    assert "使用者輸入" in by_name["環氧"]["densitySourceLabel"]
    assert by_name["環氧"]["userDensitySource"] == "測試用來源"
    code2, ref = _epoxy_phenol({"density": 1.0}, {"density": 1.0})
    assert code2 == 200
    assert [r["totalPct"] for r in s["table"]] == pytest.approx([r["totalPct"] for r in ref["shrinkage"]["table"]])


def test_predicted_density_wins_for_polymer() -> None:
    base = mx.compute_mixture_density([{"w": 1.0, "smiles": PS}])
    with_user = mx.compute_mixture_density([{"w": 1.0, "smiles": PS, "userDensity": 5.0}])
    assert base["status"] == "predicted"
    assert with_user["density"] == base["density"]
    assert with_user["components"][0]["densitySource"] == "predicted"


@pytest.mark.parametrize("bad", [0, -1.0, "1.2", True, float("inf")])
def test_non_positive_user_density_rejected(bad: object) -> None:
    code, body = eng.handle_crosslink_cure(
        {
            "result": {"pairs": [], "components": []},
            "solid": {"unit": "wt", "components": [{"id": "E", "name": "x", "category": "Resin", "canonicalSmiles": BADGE, "amount": 1, "userDensity": bad}]},
            "mn": {},
        }
    )
    assert code == 400
    with pytest.raises(ValueError):
        mx.compute_mixture_density([{"w": 1.0, "smiles": BADGE, "userDensity": bad}])


def test_mixture_density_endpoint_accepts_user_density() -> None:
    code, body = eng.handle_mixture_density({"components": [{"name": "S", "w": 1.0, "smiles": BADGE, "userDensity": 1.25}]})
    assert code == 200
    assert body["density"] == pytest.approx(1.25)
