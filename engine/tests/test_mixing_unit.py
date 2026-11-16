"""任務 P6A：混合密度、混合介電常數、共聚比例掃描的最少單元測試（新公式，沒有 TS 版可比；手算值與端點對照現有模組）。"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import moleform_engine as eng  # noqa: E402
from moleform_core import dielectric, free_volume, mixing, tg, vm  # noqa: E402

PS = "*CC(*)c1ccccc1"
PE = "*CC*"
NO_GROUP = "*CC(*)C(=O)N"  # Tg、Vm、ε、自由體積表都缺基團
NO_FV = "*CC(*)Cl"  # 只有自由體積表缺基團，其餘三欄算得出


def test_route_table_has_three_endpoints() -> None:
    for path in ("/mixture-density", "/mixture-dielectric", "/copolymer-scan"):
        assert path in eng.POST_ROUTES


# ---------- (a)(b) 混合密度 ----------


def test_density_two_components_matches_hand_calc() -> None:
    # w = 0.4 / 0.6，ρ = 1.2 / 0.9 → 1/ρ = 0.4/1.2 + 0.6/0.9 = 1/3 + 2/3 = 1 → ρ = 1.0
    r = mixing.compute_mixture_density([{"w": 0.4, "density": 1.2}, {"w": 0.6, "density": 0.9}])
    assert r["status"] == "predicted"
    assert r["density"] == pytest.approx(1.0, rel=1e-12)
    assert r["note"] == "理想混合，未含過量體積"


def test_density_single_component_equals_component() -> None:
    r = mixing.compute_mixture_density([{"w": 1.0, "density": 1.234}])
    assert r["density"] == pytest.approx(1.234, rel=1e-12)


def test_density_from_smiles_uses_vm() -> None:
    expected = vm.compute_molar_volume_density(PS)["amorphous"]["density"]
    r = mixing.compute_mixture_density([{"w": 1.0, "smiles": PS}])
    assert r["density"] == pytest.approx(expected, rel=1e-12)


# ---------- (c) 混合介電常數 ----------


def test_dielectric_bounds_order_and_hand_calc() -> None:
    r = mixing.compute_mixture_dielectric([{"phi": 0.5, "epsilon": 2.0}, {"phi": 0.5, "epsilon": 8.0}])
    assert r["wienerUpper"] == pytest.approx(5.0)  # 0.5·2 + 0.5·8
    assert r["wienerLower"] == pytest.approx(3.2)  # 1/(0.25 + 0.0625)
    assert r["lichtenecker"] == pytest.approx(4.0)  # exp(0.5·ln2 + 0.5·ln8) = √16
    assert r["wienerUpper"] >= r["lichtenecker"] >= r["wienerLower"]


def test_dielectric_single_component_and_mass_basis() -> None:
    r = mixing.compute_mixture_dielectric([{"phi": 1.0, "epsilon": 3.3}])
    assert r["wienerUpper"] == pytest.approx(3.3) and r["lichtenecker"] == pytest.approx(3.3) and r["wienerLower"] == pytest.approx(3.3)
    # 質量分率 0.5/0.5、密度 1/2 → 體積比 0.5 : 0.25 → φ = 2/3、1/3
    m = mixing.compute_mixture_dielectric(
        [{"w": 0.5, "density": 1.0, "epsilon": 2.0}, {"w": 0.5, "density": 2.0, "epsilon": 5.0}], basis="mass"
    )
    assert m["wienerUpper"] == pytest.approx(2 * 2 / 3 + 5 / 3)


# ---------- (d) 缺值回報 missing ----------


def test_density_missing_reports_component() -> None:
    r = mixing.compute_mixture_density([{"name": "溶劑", "w": 0.3}, {"name": "樹脂", "w": 0.7, "density": 1.1}])
    assert r["status"] == "missing" and "density" not in r
    assert [m["name"] for m in r["missing"]] == ["溶劑"]
    small_molecule = mixing.compute_mixture_density([{"w": 0.5, "smiles": "CCO"}, {"w": 0.5, "density": 1.0}])
    assert small_molecule["status"] == "missing"  # 小分子液體（Fedors 尚未收錄）不猜
    code, body = eng.handle_mixture_density({"components": [{"w": 1.0}]})
    assert code == 200 and body["quantities"]["density"]["status"] == "missing" and body["quantities"]["density"]["value"] is None


def test_dielectric_missing_reports_component() -> None:
    r = mixing.compute_mixture_dielectric([{"phi": 0.5, "epsilon": 3.0}, {"name": "X", "phi": 0.5}])
    assert r["status"] == "missing" and [m["field"] for m in r["missing"]] == ["epsilon"]
    code, body = eng.handle_mixture_dielectric({"components": [{"phi": 0.5, "epsilon": 3.0}, {"phi": 0.5, "smiles": NO_GROUP}]})
    assert code == 200 and body["quantities"]["lichtenecker"]["status"] == "missing"


# ---------- (e) 共聚比例掃描 ----------


def test_scan_endpoints_equal_existing_modules() -> None:
    r = mixing.compute_copolymer_scan(PS, PE)
    assert [row["x"] for row in r["rows"]] == mixing.default_grid() and len(r["rows"]) == 11
    one, zero = r["rows"][-1], r["rows"][0]  # x = 1 為單元 A（PS），x = 0 為單元 B（PE）
    for row, smi in ((one, PS), (zero, PE)):
        assert row["tg"]["value"] == tg.compute_tg(smi)["tgK"]
        assert row["density"]["value"] == vm.compute_molar_volume_density(smi)["amorphous"]["density"]
        assert row["epsilon"]["value"] == dielectric.compute_dielectric(smi)["epsPrimary"]
        assert row["freeVolume"]["value"] == free_volume.compute_free_volume(smi)["vf"]
    middle = r["rows"][5]
    assert all(middle[k]["status"] == "predicted" for k in ("tg", "density", "epsilon", "freeVolume"))


def test_scan_missing_column_does_not_block_others() -> None:
    r = mixing.compute_copolymer_scan(PS, NO_FV, [0, 0.5, 1])
    zero, half, one = r["rows"]
    assert zero["freeVolume"]["status"] == "missing" and one["freeVolume"]["status"] == "predicted"
    assert half["freeVolume"]["status"] == "missing" and half["freeVolume"]["reason"]
    assert all(row[k]["status"] == "predicted" for row in r["rows"] for k in ("tg", "density", "epsilon"))
    assert mixing.compute_copolymer_scan(PS, NO_GROUP, [0, 1])["rows"][0]["tg"]["status"] == "missing"
    code, body = eng.handle_copolymer_scan({"unitA": PS, "unitB": PE, "grid": [0, 1]})
    assert code == 200 and body["rows"][1]["tg"]["unit"] == "K" and not math.isnan(body["rows"][1]["tg"]["value"])
