"""任務 P8-2：黏度、表面張力、界面與潤濕的最少單元測試（D64）。
檢查程式有沒有照公式算對（D17）：端點可用、缺基團回報、Mark–Houwink 缺 K 時 missing、單一溫度黏度不外推、Parachor 手算一例（附算式）、Owens–Wendt 手算一例（附算式）。
不做反向驗證與邊界探針。測試中的 Andrade 參數、K 與 a 是「測試用」假設值，不是材料數據。"""

from __future__ import annotations

import math

import pytest
from rdkit import Chem

import moleform_engine as eng
from moleform_core import interfacial, parachor, viscosity

MIXTURE_REASON = "書中無溶劑混合黏度式；待使用者指定出處"


def test_four_endpoints_are_registered() -> None:
    assert eng.POST_ROUTES["/viscosity"] is eng.handle_viscosity
    assert eng.POST_ROUTES["/surface-tension"] is eng.handle_surface_tension
    assert eng.POST_ROUTES["/interfacial"] is eng.handle_interfacial
    assert eng.POST_ROUTES["/wetting"] is eng.handle_wetting


def test_surface_energy_table_is_book_only_and_pending() -> None:
    rows = interfacial.load_surface_energy()
    assert len(rows) == 55
    assert {t: sum(1 for r in rows if r.table == t) for t in ("8.6", "8.7", "8.8")} == {"8.6": 14, "8.7": 27, "8.8": 14}
    for r in rows:
        assert f"Table {r.table}" in r.source and "頁" in r.source, r.id
        assert r.gamma is not None, r.id
    # Table 8.8 是 Van Oss 的 LW／AB 分解，不放進 Owens–Wendt 的 γd、γp
    assert all(not r.has_components for r in rows if r.table == "8.8")
    assert all(r.has_components for r in rows if r.table in ("8.6", "8.7"))


def test_j_group_and_parachor_tables_pass_examples() -> None:
    for r in viscosity.load_j_groups():
        if not r.usable():
            continue
        q = Chem.MolFromSmarts(r.smarts)
        assert q is not None, r.id
        for smi in r.positives:
            assert Chem.MolFromSmiles(smi).HasSubstructMatch(q), (r.id, "應命中", smi)
        for smi in r.negatives:
            assert not Chem.MolFromSmiles(smi).HasSubstructMatch(q), (r.id, "不應命中", smi)
    assert len(parachor.load_parachor_groups()) == 18  # Table 8.1 共 18 列


def test_parachor_hand_calculation_pmma_example_8_1() -> None:
    # 書 Example 8.1：PMMA 單元 –CH2–、>C<、2 個 –CH3、–COO–。
    # Sugden：Ps = 39.0 + 4.8 + 2×(39.0 + 17.1) + (4.8 + 60) = 220.8；V 用書的 86.5 cm³/mol：γ = (220.8/86.5)^4 = 42.46 mN/m
    ps_hand = 39.0 + 4.8 + 2 * (39.0 + 17.1) + (4.8 + 60)
    assert ps_hand == pytest.approx(220.8)
    res = parachor.compute_surface_tension("*CC(C)(C(=O)OC)*", volume=86.5)
    assert res["status"] == "ok"
    sets = {s["key"]: s for s in res["sets"]}
    assert sets["sugden"]["parachor"]["value"] == pytest.approx(220.8)
    assert sets["sugden"]["gamma"]["value"] == pytest.approx((220.8 / 86.5) ** 4)
    # 另兩組（C 5 個、H 8 個、酯基 O2 一個，無雙鍵、無環）：Mumford–Phillips 5×9.2 + 8×15.4 + 60 = 229.2；Quayle 5×9.0 + 8×15.5 + 54.8 = 223.8
    assert sets["mumford_phillips"]["parachor"]["value"] == pytest.approx(5 * 9.2 + 8 * 15.4 + 60.0)
    assert sets["quayle_low"]["parachor"]["value"] == pytest.approx(5 * 9.0 + 8 * 15.5 + 54.8)
    # 三組並列：範圍是三組結果的最小與最大，不是挑其中一組
    gammas = [s["gamma"]["value"] for s in res["sets"]]
    assert res["quantities"]["gammaMin"]["value"] == pytest.approx(min(gammas))
    assert res["quantities"]["gammaMax"]["value"] == pytest.approx(max(gammas))


def test_missing_groups_are_reported_not_guessed() -> None:
    # Si 不在 Table 8.1：回報缺基團，不給 γ
    code, body = eng.handle_surface_tension({"smiles": "*[Si](C)(C)O*"})
    assert code == 200 and body["ok"] is True
    assert body["status"] == "missing"
    assert body["quantities"]["gammaMin"]["value"] is None and body["quantities"]["gammaMin"]["status"] == "missing"
    assert any(m["element"] == "Si" for m in body["missing"])
    # Θ 黏度：沒有 Table 9.3 的基團（吡啶環只有圖，沒有 SMARTS）→ 缺基團
    th = viscosity.compute_theta("*CC(c1ccncc1)*", 1.0e5)
    assert th["status"] == "missing" and th["missing"]
    assert th["quantities"]["kTheta"]["value"] is None


def test_surface_tension_of_solvent_needs_density_at_that_temperature() -> None:
    # 丙酮的密度只有 20 °C 的值：25 °C 回報 missing（不內插、不換算）；20 °C 可算
    code, body = eng.handle_surface_tension({"solventId": "acetone", "temperatureC": 25})
    assert code == 200 and body["status"] == "missing" and "25" in body["reasons"]["gamma"]
    code, body = eng.handle_surface_tension({"solventId": "acetone", "temperatureC": 20})
    assert code == 200 and body["status"] == "ok"
    assert body["quantities"]["gammaMin"]["value"] < body["quantities"]["gammaMax"]["value"] + 1e-9


def test_mark_houwink_without_user_k_is_missing_and_with_k_is_computed() -> None:
    code, body = eng.handle_viscosity({"polymer": {"smiles": "*CC(c1ccccc1)*", "molarMass": 1.0e5}})
    assert code == 200
    mh = body["polymer"]["markHouwink"]
    assert mh["status"] == "missing" and mh["quantity"]["value"] is None and mh["quantity"]["status"] == "missing"
    assert "不內建" in mh["quantity"]["reason"]
    # 缺來源也是 missing
    code, body = eng.handle_viscosity({"polymer": {"smiles": "*CC(c1ccccc1)*", "molarMass": 1.0e5, "markHouwink": {"K": 0.01, "a": 0.7}}})
    assert body["polymer"]["markHouwink"]["status"] == "missing"
    # 測試用 K = 0.01、a = 0.7、M = 1e5（假設值）：[η] = K·M^a = 0.01 × (1e5)^0.7 = 0.01 × 10^3.5
    code, body = eng.handle_viscosity(
        {"polymer": {"smiles": "*CC(c1ccccc1)*", "molarMass": 1.0e5, "markHouwink": {"K": 0.01, "a": 0.7, "source": "測試用假設值", "temperatureC": 25, "solvent": "測試"}}}
    )
    q = body["polymer"]["markHouwink"]["quantity"]
    assert q["status"] == "predicted" and q["value"] == pytest.approx(0.01 * 10**3.5)
    # 濃溶液沒有 K：只給指數關係，不給黏度值
    conc = body["polymer"]["concentrated"]
    assert conc["quantity"]["value"] is None and "只輸出指數關係" in conc["quantity"]["reason"]
    assert "5.4" in conc["relation"]


def test_theta_k_matches_book_formula_for_polystyrene() -> None:
    # 書式 9.42：J = KΘ^½·M − 4.2Z。聚苯乙烯：ΣJ = 2.35 + 1.15 + 18.25 = 21.75，Z = 2，單元質量 M（C8H8）= 104.15
    th = viscosity.compute_theta("*CC(c1ccccc1)*", 1.0e5)
    assert th["status"] == "ok" and th["sumJ"] == pytest.approx(21.75) and th["z"] == 2
    k_hand = ((21.75 + 4.2 * 2) / th["unitMass"]) ** 2
    assert th["quantities"]["kTheta"]["value"] == pytest.approx(k_hand)
    # [η]Θ = KΘ·M^½（式 9.34）
    assert th["quantities"]["etaTheta"]["value"] == pytest.approx(k_hand * math.sqrt(1.0e5))


def test_single_temperature_viscosity_is_not_extrapolated() -> None:
    # 丙酮在溶劑資料表只有 20 °C 一個黏度：指定 40 °C 而沒有 Andrade 參數 → missing，不外推
    code, body = eng.handle_viscosity({"solvents": [{"solventId": "acetone"}], "temperatureC": 40})
    assert code == 200
    s = body["solvents"][0]
    assert s["tableValue"]["status"] == "literature" and s["tableValue"]["temperatureC"] == 20
    assert s["atTemperature"]["value"] is None and s["atTemperature"]["status"] == "missing"
    assert "不外推" in s["atTemperature"]["reason"]
    # 資料表有的溫度就直接取表值
    code, body = eng.handle_viscosity({"solvents": [{"solventId": "acetone"}], "temperatureC": 20})
    assert body["solvents"][0]["atTemperature"]["status"] == "literature"


def test_andrade_with_user_parameters_and_range_check() -> None:
    # 測試用：B = 0.02 mPa·s、Eη = 10 kJ/mol（在書的 7–14 範圍內）→ η(25 °C) = B·exp(Eη/(R·T))
    code, body = eng.handle_viscosity({"solvents": [{"solventId": "acetone", "andrade": {"B": 0.02, "energyKjMol": 10.0}}], "temperatureC": 25})
    eta = body["solvents"][0]["atTemperature"]
    assert eta["status"] == "predicted" and eta["value"] == pytest.approx(0.02 * math.exp(10000.0 / (8.314462618 * 298.15)))
    # 測試用：兩個溫度的黏度 20 °C 1.0、40 °C 0.9 → Eη 只有約 4 kJ/mol，超出 7–14 → assumed 並有警示
    pts = {"points": [{"temperatureC": 20, "viscosityMPas": 1.0}, {"temperatureC": 40, "viscosityMPas": 0.9}]}
    code, body = eng.handle_viscosity({"solvents": [{"solventId": "acetone", "andrade": pts}], "temperatureC": 30})
    s = body["solvents"][0]
    e_hand = 8.314462618 * math.log(1.0 / 0.9) / (1 / 293.15 - 1 / 313.15) / 1000.0
    assert s["andrade"]["energyKjMol"]["value"] == pytest.approx(e_hand) and e_hand < 7.0
    assert s["atTemperature"]["status"] == "assumed" and s["warnings"]


def test_mixed_solvent_viscosity_has_no_book_rule() -> None:
    code, body = eng.handle_viscosity({"solvents": [{"solventId": "acetone"}, {"solventId": "ethanol"}]})
    assert code == 200
    assert body["mixture"]["viscosity"]["value"] is None and body["mixture"]["viscosity"]["status"] == "missing"
    assert body["mixture"]["reason"] == MIXTURE_REASON


def test_owens_wendt_hand_calculation_polyethylene_water() -> None:
    # 式 8.22：γ12 = (√γ1d − √γ2d)² + (√γ1p − √γ2p)²。聚乙烯（線型，Table 8.7）γd 35.7、γp 0；水（Table 8.6）γd 21.8、γp 51
    # = (√35.7 − √21.8)² + (0 − √51)² = (5.97494 − 4.66905)² + 51 = 1.70533 + 51 = 52.705
    hand = (math.sqrt(35.7) - math.sqrt(21.8)) ** 2 + (0 - math.sqrt(51)) ** 2
    assert hand == pytest.approx(52.705, abs=1e-3)
    code, body = eng.handle_interfacial({"a": {"smiles": "*CC*"}, "b": {"smiles": "O"}})
    assert code == 200 and body["status"] == "ok"
    assert body["quantities"]["gamma12"]["value"] == pytest.approx(hand)
    # 式 8.23：cosθ = 2(√(γSd γLd) + √(γSp γLp))/γLV − 1 = 2·√(35.7×21.8)/72.8 − 1
    code, body = eng.handle_wetting({"solid": {"smiles": "*CC*"}, "liquid": {"solventId": "water"}})
    q = body["quantities"]
    cos_hand = 2 * math.sqrt(35.7 * 21.8) / 72.8 - 1
    assert q["cosTheta"]["value"] == pytest.approx(cos_hand)
    assert q["theta"]["value"] == pytest.approx(math.degrees(math.acos(cos_hand)))
    # 式 8.6：黏附張力 = γS − γSL = 35.7 − 52.705；S = γLV + γSL − γSV = 72.8 + 52.705 − 35.7（S > 0 → 不完全潤濕）
    assert q["adhesionTension"]["value"] == pytest.approx(35.7 - hand)
    assert q["spreadingCoefficient"]["value"] == pytest.approx(72.8 + hand - 35.7)
    assert "不潤濕" in body["verdict"]


def test_complete_wetting_when_spreading_coefficient_is_negative() -> None:
    # 聚乙烯上的正己烷：cosθ = 2√(35.7×18.4)/18.4 − 1 = 1.786 > 1 → 完全潤濕（θ = 0°）；S = 18.4 + (√35.7 − √18.4)² − 35.7 < 0（書：S 為負時完全潤濕）
    code, body = eng.handle_wetting({"solid": {"smiles": "*CC*"}, "liquid": {"smiles": "CCCCCC"}})
    q = body["quantities"]
    assert q["cosTheta"]["value"] > 1 and q["theta"]["value"] == 0.0
    assert q["spreadingCoefficient"]["value"] == pytest.approx(18.4 + (math.sqrt(35.7) - math.sqrt(18.4)) ** 2 - 35.7)
    assert q["spreadingCoefficient"]["value"] < 0 and "完全潤濕" in body["verdict"]


def test_solvent_without_components_keeps_gamma_but_owens_wendt_is_missing() -> None:
    # PGMEA 不在 Table 8.6：γd、γp 不補 → γ12、θ、S 為 missing；表面張力（溶劑資料表沒有值的也維持 missing）照實回報
    code, body = eng.handle_wetting({"solid": {"smiles": "*CC*"}, "liquid": {"solventId": "pgmea"}})
    assert code == 200 and body["status"] == "missing"
    for key in ("gamma12", "cosTheta", "theta", "spreadingCoefficient"):
        assert body["quantities"][key]["value"] is None
    assert "Table 8.6" in body["quantities"]["gamma12"]["reason"]
    # 有表面張力的溶劑（甲苯 25 °C 27.73）：γLV 照列
    code, body = eng.handle_wetting({"solid": {"smiles": "*CC*"}, "liquid": {"solventId": "toluene"}})
    assert body["status"] == "missing"
    assert body["quantities"]["gammaLV"]["value"] == pytest.approx(27.73) and body["quantities"]["gammaLV"]["status"] == "literature"


def test_bad_requests_return_400() -> None:
    assert eng.handle_viscosity({})[0] == 400
    assert eng.handle_surface_tension({"smiles": "not a smiles"})[0] == 400
    assert eng.handle_wetting({"solid": {"smiles": "*CC*"}})[0] == 400
    code, body = eng.handle_interfacial({"a": {"name": "not in table"}, "b": {"smiles": "O"}})
    assert code == 200 and body["status"] == "missing" and body["quantities"]["gamma12"]["value"] is None
