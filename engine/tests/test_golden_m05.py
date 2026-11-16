"""黃金比對：任務 M05 的其餘計算模組（TypeScript ↔ Python）。D62、D63、D64。

黃金檔由 scripts/golden/export-remaining.ts 產生（tests/golden/{freeVolume,relativeTg,joback,tgMixing,dielectric,tpsaLogp,crosslink,layer1}.json）。
比對規則同 M00：字串、整數、布林、null、陣列長度、物件鍵集合完全相同；浮點先比最短字串，不同才允許相對誤差 ≤ 1e-12 並列入 tolerance_cases。
TS 丟出的錯誤（`{ threw: true, message? }`）：Python 必須拋出例外，且 TS 有 message 時訊息逐字相同。
"""

from __future__ import annotations

from typing import Any, Callable

import pytest
from rdkit import RDLogger

import golden_compare as gc
from moleform_core import (
    crosslink,
    dielectric,
    free_volume,
    joback,
    layer1,
    relative_tg,
    tg_fit,
    tg_mixing,
    tpsa_logp,
)
from moleform_core.novolac_units import identify_cresol_novolac

RDLogger.DisableLog("rdApp.*")

MODULES = ("freeVolume", "relativeTg", "joback", "tgMixing", "dielectric", "tpsaLogp", "crosslink", "layer1")
CASES: dict[str, list[tuple[str, Any, Any]]] = {m: gc.golden_cases(m) for m in MODULES}


def _is_threw(out: Any) -> bool:
    return isinstance(out, dict) and "threw" in out and out["threw"] is True and set(out) <= {"threw", "message"}


def check(module: str, case_id: str, out: Any, fn: Callable[[], Any]) -> None:
    if _is_threw(out):
        with pytest.raises(Exception) as info:  # noqa: PT011 - TS 的 throw new Error / WebAssembly 例外
            fn()
        if "message" in out:
            assert str(info.value) == out["message"]
        return
    gc.assert_case(module, case_id, out, fn())


def _param(module: str) -> list[Any]:
    return [pytest.param(cid, inp, out, id=cid) for cid, inp, out in CASES[module]]


@pytest.fixture(scope="module", params=MODULES)
def _versions(request: pytest.FixtureRequest) -> None:
    """每個黃金檔的 RDKit.js 版本必須與引擎的 RDKit 一致，否則拒絕比對。"""
    doc = gc.load_golden(request.param)
    try:
        gc.check_version(doc)
    except gc.VersionMismatchError as e:
        pytest.fail(str(e), pytrace=False)


def test_versions(_versions: None) -> None:
    pass


# ---------- 單一 SMILES 的模組 ----------


@pytest.mark.parametrize(("case_id", "inp", "out"), _param("freeVolume"))
def test_free_volume(case_id: str, inp: dict, out: Any) -> None:
    spec = gc.plain(inp["spec"]) if "spec" in inp else None
    check("freeVolume", case_id, out, lambda: free_volume.compute_free_volume(inp["smiles"], spec))


@pytest.mark.parametrize(("case_id", "inp", "out"), _param("joback"))
def test_joback(case_id: str, inp: dict, out: Any) -> None:
    check("joback", case_id, out, lambda: joback.compute_joback(inp["smiles"]))


@pytest.mark.parametrize(("case_id", "inp", "out"), _param("dielectric"))
def test_dielectric(case_id: str, inp: dict, out: Any) -> None:
    check("dielectric", case_id, out, lambda: dielectric.compute_dielectric_refraction(inp["smiles"]))


@pytest.mark.parametrize(("case_id", "inp", "out"), _param("tpsaLogp"))
def test_tpsa_logp(case_id: str, inp: dict, out: Any) -> None:
    check("tpsaLogp", case_id, out, lambda: tpsa_logp.compute_tpsa_logp(inp["smiles"]))


# ---------- 相對 Tg ----------


def _relative_tg_call(inp: dict) -> Any:
    kind = inp["kind"]
    p = gc.plain
    if kind == "relativeTg":
        return relative_tg.relative_tg(p(inp["input"]))
    if kind == "composition":
        return relative_tg.evaluate_relative_tg_composition(p(inp["composition"]))
    if kind == "volumes":
        return relative_tg.relative_tg_from_volumes(p(inp["input"]))
    if kind == "calibrate":
        return relative_tg.calibrate_alpha_override(p(inp["tgA"]), p(inp["tgB"]), p(inp["deltaF"]))
    if kind == "molesPerMoleA":
        return relative_tg.moles_per_mole_a(p(inp["ratio"]), p(inp["referenceIndex"]))
    if kind == "bondiFfv":
        return relative_tg.bondi_ffv(p(inp["vomega"]), p(inp["vm"]))
    if kind == "deltaAlphaFromCte":
        return relative_tg.delta_alpha_from_cte(p(inp["vomega"]), p(inp["vm"]))
    if kind == "ffvFromPackingK":
        return relative_tg.ffv_from_packing_k(p(inp["packingK"]))
    if kind == "packingKFromClass":
        return relative_tg.packing_k_from_class_coefficient(p(inp["coefficient"]))
    if kind == "looksLikeFractions":
        return relative_tg.looks_like_fractions(p(inp["amounts"]))
    raise AssertionError(f"未知的案例種類：{kind}")


@pytest.mark.parametrize(("case_id", "inp", "out"), _param("relativeTg"))
def test_relative_tg(case_id: str, inp: dict, out: Any) -> None:
    check("relativeTg", case_id, out, lambda: _relative_tg_call(inp))


# ---------- 成分 Tg ----------


def _tg_mixing_call(inp: dict) -> Any:
    kind = inp["kind"]
    p = gc.plain
    if kind == "foxFlory":
        return tg_mixing.fox_flory(p(inp["tgInfK"]), p(inp["k"]), p(inp["mn"]))
    if kind == "foxMix":
        return tg_mixing.fox_mix(p(inp["items"]))
    if kind == "fitFlory":
        return tg_fit.fit_flory(p(inp["points"]))
    if kind == "predictFlory":
        return tg_fit.predict_flory(tg_fit.fit_flory(p(inp["points"])), p(inp["mn"]))
    if kind == "unit":
        k = tg_mixing.find_k_class(inp["smiles"])
        return {"cresol": identify_cresol_novolac(inp["smiles"]), "kClass": None if k is None else k.resin_class}
    if kind == "polymerComponent":
        return tg_mixing.polymer_component_tg(p(inp["component"]), p(inp["mn"]), p(inp["fraction"]))
    if kind == "smallComponent":
        return tg_mixing.small_molecule_component_tg(p(inp["component"]), p(inp["fraction"]))
    if kind == "formulation":
        return tg_mixing.compute_formulation_tg(p(inp["solid"]), p(inp["wtPct"]), p(inp["mn"]), error_messages=p(inp["errors"]))
    raise AssertionError(f"未知的案例種類：{kind}")


@pytest.mark.parametrize(("case_id", "inp", "out"), _param("tgMixing"))
def test_tg_mixing(case_id: str, inp: dict, out: Any) -> None:
    check("tgMixing", case_id, out, lambda: _tg_mixing_call(inp))


# ---------- 交聯 ----------


def _crosslink_call(inp: dict) -> Any:
    kind = inp["kind"]
    p = gc.plain
    if kind == "analyze":
        return crosslink.analyze_crosslink(p(inp["components"]))
    if kind == "analyzeComponent":
        return crosslink.analyze_component(p(inp["components"][0]), crosslink.load_functional_groups())
    if kind == "judgePair":
        return crosslink.judge_pair(p(inp["fA"]), p(inp["fB"]), inp["aIsPolymer"], inp["bIsPolymer"])
    if kind == "judgeFormulation":
        return crosslink.judge_formulation(inp["kinds"])
    if kind == "queryAtomMaps":
        return crosslink.query_atom_maps(inp["smarts"])
    raise AssertionError(f"未知的案例種類：{kind}")


@pytest.mark.parametrize(("case_id", "inp", "out"), _param("crosslink"))
def test_crosslink(case_id: str, inp: dict, out: Any) -> None:
    check("crosslink", case_id, out, lambda: _crosslink_call(inp))


def _layer1_call(inp: dict) -> Any:
    kind = inp["kind"]
    p = gc.plain
    if kind == "prepare":
        solid = p(inp["solid"])
        return layer1.prepare_layer1(p(inp["result"]), solid["components"], solid["unit"], p(inp["wtPct"]))
    if kind == "buildSystem":
        return layer1.build_system(p(inp["setup"]))
    if kind == "groupTotals":
        return layer1.group_totals(p(inp["setup"]))
    if kind == "layer1":
        return layer1.compute_layer1(p(inp["setup"]), p(inp["q"]))
    if kind == "stoichiometric":
        s = layer1.stoichiometric_setup(p(inp["setup"]))
        return {"setup": s, "layer1": layer1.compute_layer1(s, 1) if s else None}
    if kind == "atRatio":
        return layer1.setup_at_ratio(p(inp["setup"]), p(inp["ratio"]))
    if kind == "describe":
        prep = p(inp["prep"])
        s = layer1.stoichiometric_setup(prep["setup"])
        return layer1.describe_amounts(prep, s) if s else None
    if kind == "scan":
        return layer1.scan_ratio(p(inp["setup"]), p(inp["q"]), p(inp["option"]), p(inp["settings"]) if "settings" in inp else None)
    if kind == "checkScanSettings":
        return layer1.check_scan_settings(p(inp["settings"]))
    if kind == "defaultScanSettings":
        return layer1.default_scan_settings(p(inp["currentRatio"]))
    if kind == "expressAmounts":
        return layer1.express_amounts(inp["unit"], p(inp["items"]))
    if kind == "gelConversion":
        return layer1.gel_conversion(p(inp["sys"]))
    if kind == "groupMoles":
        return layer1.group_moles(p(inp["species"]))
    if kind == "conversions":
        return layer1.conversions(p(inp["nA"]), p(inp["nB"]), p(inp["q"]))
    if kind == "gelSlope":
        return layer1.gel_slope(p(inp["sys"]), p(inp["pA"]), p(inp["pB"]))
    if kind == "finiteProbability":
        return layer1.finite_probability(p(inp["sys"]), p(inp["pA"]), p(inp["pB"]))
    if kind == "solFraction":
        return layer1.sol_fraction(p(inp["sys"]), p(inp["fp"]))
    if kind == "networkDensity":
        return layer1.network_density(p(inp["sys"]), p(inp["fp"]))
    if kind == "homopolymer":
        return layer1.homopolymer_finite_probability(p(inp["f"]), p(inp["p"]))
    if kind == "splitFunctionality":
        return layer1.split_functionality(p(inp["f"]), p(inp["n"]), p(inp["mass"]))
    if kind == "effectiveJunction":
        return layer1.effective_junction_probability(p(inp["f"]), p(inp["m"]), p(inp["p"]))
    raise AssertionError(f"未知的案例種類：{kind}")


@pytest.mark.parametrize(("case_id", "inp", "out"), _param("layer1"))
def test_layer1(case_id: str, inp: dict, out: Any) -> None:
    check("layer1", case_id, out, lambda: _layer1_call(inp))


# ---------- 覆蓋（只檢查黃金檔涵蓋到各種結果狀態，不新增案例） ----------


def _statuses(module: str, key: str | None = None) -> set[str]:
    out = set()
    for _id, _inp, o in CASES[module]:
        if isinstance(o, dict) and not _is_threw(o):
            v = o.get(key) if key else o.get("status")
            if isinstance(v, str):
                out.add(v)
    return out


def test_coverage_of_statuses() -> None:
    assert {"ok", "missing", "invalid"} <= _statuses("freeVolume")
    assert {"ok", "missing", "not-applicable", "invalid"} <= _statuses("joback")
    assert {"ok", "invalid"} <= _statuses("tpsaLogp")
    assert {"ok", "rejected"} <= _statuses("relativeTg")
    dielectric_statuses = {o["dielectric"]["status"] for _i, _p, o in CASES["dielectric"] if isinstance(o, dict) and "dielectric" in o}
    assert {"ok", "missing", "unsupported", "invalid"} <= dielectric_statuses
    tg_statuses = {o["status"] for _i, _p, o in CASES["tgMixing"] if isinstance(o, dict) and isinstance(o.get("status"), str) and "components" in o}
    assert {"complete", "incomplete", "unavailable", "error"} <= tg_statuses
    verdicts = {o["verdict"] for _i, _p, o in CASES["crosslink"] if isinstance(o, dict) and "verdict" in o}
    assert {"network", "chain", "capping", "none"} <= verdicts
