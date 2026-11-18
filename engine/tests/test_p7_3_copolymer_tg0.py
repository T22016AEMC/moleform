"""任務 P7-3 追加：固化預測的 Tg,0 遇到共聚物成分時，改用各單元 Tg∞ 的 Fox 混合（與共聚比例掃描 `/copolymer-scan`〔P6A〕同一做法）。
只檢查程式有沒有照公式算對（D17）：手算 Fox（1/Tg = Σ wᵢ/Tgᵢ，wᵢ ∝ xᵢMᵢ）、與 `compute_copolymer_scan` 同一點逐位相同、缺比例／缺基團回報 missing 與原因。"""

from __future__ import annotations

import pytest

import moleform_engine as eng
from moleform_core import cure_prediction as cp
from moleform_core import mixing
from moleform_core.copolymer import analyze_polymer_units
from moleform_core.tg import compute_tg

PS = "[*:1]CC([*:2])c1ccccc1"
PE_LIKE = "[*:1]CC([*:2])C"
P_A = "[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O"  # Tg 可算
P_B = "[*:1]C([*:2])c1ccc2ccccc2c1"  # 萘基亞甲基：缺 Yg 基團
BADGE = "CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1"
M_PS = 8 * 12.011 + 8 * 1.008  # C8H8
M_PE = 3 * 12.011 + 6 * 1.008  # C3H6


def _cop(units: list[dict], basis: str | None = "mol", smiles: str = PS) -> dict:
    polymer: dict = {"mnInput": 3000, "units": units}
    if basis is not None:
        polymer["fractionBasis"] = basis
    return {"id": "C", "name": "cop", "category": "Resin", "canonicalSmiles": smiles, "polymer": polymer}


def _tg0(component: dict, extra: list[dict] | None = None, wt: dict | None = None) -> dict:
    solid = [component, *(extra or [])]
    wt_pct = wt or {c["id"]: 100.0 / len(solid) for c in solid}
    return cp.compute_tg0(solid, wt_pct, {c["id"]: 3000.0 for c in solid})


def test_copolymer_tg0_matches_hand_fox_mol_basis() -> None:
    tg_ps, tg_pe = compute_tg(PS)["tgK"], compute_tg(PE_LIKE)["tgK"]
    x = 0.4
    w_ps, w_pe = x * M_PS, (1 - x) * M_PE
    expected = 1 / (w_ps / (w_ps + w_pe) / tg_ps + w_pe / (w_ps + w_pe) / tg_pe)
    out = _tg0(_cop([{"smiles": PS, "fraction": 40}, {"smiles": PE_LIKE, "fraction": 60}]), wt={"C": 100.0})
    assert out["status"] == "predicted"
    assert out["tgK"] == pytest.approx(expected, rel=1e-5)
    assert min(tg_ps, tg_pe) < out["tgK"] < max(tg_ps, tg_pe)
    assert any("共聚物成分 cop 的 Tg" in m and "各單元均聚物的 Tg∞" in m for m in out["messages"])


def test_copolymer_tg0_equals_copolymer_scan_at_same_point() -> None:
    scan = mixing.compute_copolymer_scan(PS, PE_LIKE, [0.4])
    scan_tg = scan["rows"][0]["tg"]["value"]
    out = _tg0(_cop([{"smiles": PS, "fraction": 40}, {"smiles": PE_LIKE, "fraction": 60}]), wt={"C": 100.0})
    assert out["tgK"] == pytest.approx(scan_tg, rel=1e-12)


def test_copolymer_tg0_weight_basis_uses_weight_fractions_directly() -> None:
    tg_ps, tg_pe = compute_tg(PS)["tgK"], compute_tg(PE_LIKE)["tgK"]
    expected = 1 / (0.5 / tg_ps + 0.5 / tg_pe)
    out = _tg0(_cop([{"smiles": PS, "fraction": 50}, {"smiles": PE_LIKE, "fraction": 50}], basis="wt"), wt={"C": 100.0})
    assert out["tgK"] == pytest.approx(expected, rel=1e-12)


def test_small_molecule_next_to_copolymer_is_still_not_counted() -> None:
    cop = _cop([{"smiles": PS, "fraction": 40}, {"smiles": PE_LIKE, "fraction": 60}])
    only = _tg0(cop, wt={"C": 100.0})
    small = {"id": "B", "name": "BADGE", "category": "Resin", "canonicalSmiles": BADGE}
    out = _tg0(cop, [small], {"C": 80.0, "B": 20.0})
    assert out["status"] == "predicted" and out["tgK"] == pytest.approx(only["tgK"], rel=1e-12)
    assert any("未計入：BADGE" in m for m in out["messages"])


def test_missing_or_bad_fractions_are_reported_not_guessed() -> None:
    no_fraction = _tg0(_cop([{"smiles": PS}, {"smiles": PE_LIKE, "fraction": 60}]), wt={"C": 100.0})
    assert no_fraction["status"] == "missing" and "共聚物組成比例有問題" in no_fraction["messages"][-1]
    bad_sum = _tg0(_cop([{"smiles": PS, "fraction": 40}, {"smiles": PE_LIKE, "fraction": 50}]), wt={"C": 100.0})
    assert bad_sum["status"] == "missing" and "合計為 90" in bad_sum["messages"][-1]


def test_unit_without_groups_makes_copolymer_tg_missing_with_reason() -> None:
    # 4A 的 P：單元 B（萘基亞甲基）缺 Yg 基團，不估、不補
    out = _tg0(_cop([{"smiles": P_A, "fraction": 66.67}, {"smiles": P_B, "fraction": 33.33}], smiles=P_A), wt={"C": 100.0})
    assert out["status"] == "missing"
    assert "單元 2 缺基團" in out["messages"][-1] and "單元 1" not in out["messages"][-1]


def test_endpoint_uses_copolymer_tg0_for_tg_inf() -> None:
    cop = _cop([{"smiles": P_A, "fraction": 50}, {"smiles": PS, "fraction": 50}], smiles=P_A)
    comps = [cop, {"id": "B", "name": "BADGE", "category": "Resin", "canonicalSmiles": BADGE}]
    code, analysis = eng.handle_crosslink_analyze({"components": [{**c, **({} if "*" in c["canonicalSmiles"] else {"molarMass": 300.0})} for c in comps]})
    assert code == 200
    mn = {c["id"]: c["molarMass"] for c in analysis["components"]}
    solid = {"unit": "wt", "components": [{**c, "amount": a} for c, a in zip(comps, (80, 20))]}
    code, out = eng.handle_crosslink_cure({"result": analysis, "solid": solid, "wtPct": {"C": 80, "B": 20}, "mn": mn})
    assert (code, out["supported"]) == (200, True)
    tg_a, tg_s = compute_tg(P_A)["tgK"], compute_tg(PS)["tgK"]
    units = analyze_polymer_units(P_A, {"units": cop["polymer"]["units"], "fractionBasis": "mol"})["units"]
    w = [u["molFraction"] * u["mUnit"] for u in units]
    expected = 1 / (w[0] / sum(w) / tg_a + w[1] / sum(w) / tg_s)
    assert out["tg0"]["status"] == "predicted" and out["tg0"]["tgK"] == pytest.approx(expected, rel=1e-9)
    assert out["tgInf"]["status"] == "predicted"
    assert out["tgInf"]["low"]["tgK"] == pytest.approx(out["tg0"]["tgK"] + 3.9e4 / out["mCrl"]["value"])
    assert out["postCure"]["maxConversion"] is None  # 沒有硬化溫度就不算
