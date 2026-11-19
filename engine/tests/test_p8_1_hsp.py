"""任務 P8-1：溶劑資料表、Liquid 區 vol% 換算、HSP 與溶解性的最少單元測試（D64）。
檢查程式有沒有照公式算對（D17）：每個溶劑的 SMILES 與分子量、端點可用、缺基團與缺 R0 的回報、混合溶劑 HSP 與 vol% 各手算一例（附算式）。
不做反向驗證與邊界探針。測試中的密度 0.8、1.2 g/cm³ 是「測試用」假設值，不是材料數據。"""

from __future__ import annotations

import pytest
from rdkit import Chem
from rdkit.Chem import Descriptors

import moleform_engine as eng
from moleform_core import hsp, liquid_volume, solvents

SOLVENT_IDS = sorted(solvents.load_solvents())


def test_solvent_table_has_the_23_listed_solvents_and_all_rows_are_pending() -> None:
    table = solvents.load_solvents()
    assert len(table) == 23
    for s in table.values():
        for rows in s.values.values():
            for r in rows:
                assert r.review_status == "pending", (s.id, r.property)
                assert r.source and r.source_detail, (s.id, r.property)
        # HSP 三分量與分子量、摩爾體積每個溶劑都有
        for prop in ("hsp_d", "hsp_p", "hsp_h", "molecular_weight", "molar_volume", "density", "boiling_point"):
            assert s.pick(prop) is not None, (s.id, prop)


@pytest.mark.parametrize("solvent_id", SOLVENT_IDS)
def test_each_solvent_smiles_parses_and_molecular_weight_matches_table(solvent_id: str) -> None:
    s = solvents.get_solvent(solvent_id)
    assert s is not None
    mol = Chem.MolFromSmiles(s.smiles)
    assert mol is not None
    mw = s.pick("molecular_weight")
    assert mw is not None and mw.value == pytest.approx(Descriptors.MolWt(mol), abs=0.0006)
    # 摩爾體積 = 分子量 ÷ 密度（同一溫度）
    vm, d = s.pick("molar_volume"), s.pick("density")
    assert vm is not None and d is not None
    assert vm.value == pytest.approx(mw.value / d.value, abs=0.0006)
    assert solvents.solvent_id_for_smiles(s.smiles) == solvent_id


def test_hsp_group_table_passes_positive_and_negative_examples() -> None:
    from rdkit import Chem

    for r in hsp.load_hsp_groups():
        if not r.usable():
            continue
        q = Chem.MolFromSmarts(r.smarts)
        assert q is not None, r.id
        for smi in r.positives:
            assert Chem.MolFromSmiles(smi).HasSubstructMatch(q), (r.id, "應命中", smi)
        for smi in r.negatives:
            assert not Chem.MolFromSmiles(smi).HasSubstructMatch(q), (r.id, "不應命中", smi)


def test_endpoints_exist_and_follow_quantity_format() -> None:
    assert eng.POST_ROUTES["/hsp"] is eng.handle_hsp
    assert eng.POST_ROUTES["/solubility"] is eng.handle_solubility
    assert eng.POST_ROUTES["/liquid-volume"] is eng.handle_liquid_volume
    code, body = eng.handle_hsp({"smiles": "*CC(*)c1ccccc1"})
    assert code == 200 and body["status"] == "ok"
    for k in ("deltaD", "deltaP", "deltaH", "delta"):
        q = body["quantities"][k]
        assert set(q) == {"value", "unit", "source", "status"} and q["status"] == "predicted" and q["unit"] == "MPa^0.5"
    code, body = eng.handle_hsp({"solventId": "acetone"})
    assert code == 200 and body["quantities"]["deltaD"]["value"] == pytest.approx(15.5)  # Hansen 2007 Table A.1
    assert eng.handle_hsp({"smiles": ""})[0] == 400
    assert eng.handle_hsp({"solventId": "no-such-solvent"})[0] == 400


def test_book_example_7_3_diacetone_alcohol() -> None:
    """書 Example 7.3：雙丙酮醇，V = 123.8 cm³/mol → δd 15.8、δp 7.4、δh 13.3（書印的位數）。"""
    code, body = eng.handle_hsp({"smiles": "CC(=O)CC(C)(C)O", "volume": 123.8})
    assert code == 200
    q = body["quantities"]
    assert q["deltaD"]["value"] == pytest.approx(1960 / 123.8)  # ΣFdi/V
    assert q["deltaP"]["value"] == pytest.approx((770**2 + 500**2) ** 0.5 / 123.8)  # √ΣFpi²/V
    assert q["deltaH"]["value"] == pytest.approx((22000 / 123.8) ** 0.5)  # √(ΣEhi/V)
    assert [round(q[k]["value"], 1) for k in ("deltaD", "deltaP", "deltaH")] == [15.8, 7.4, 13.3]


def test_missing_group_is_reported_with_the_group_list() -> None:
    # Si 不在 Table 7.10：切分有缺基團，全部分量 missing，並列出缺的原子
    code, body = eng.handle_hsp({"smiles": "*[Si](C)(C)O*"})
    assert code == 200 and body["status"] == "missing"
    assert all(body["quantities"][k]["status"] == "missing" for k in ("deltaD", "deltaP", "deltaH", "delta"))
    assert any(m["element"] == "Si" for m in body["missing"])
    # PTFE（V 用輸入的測試值 40 cm³/mol）：Fpi、Ehi 在書中是「–」→ 只有 δd 算得出，δp、δh 回報 missing 並指出是 –F
    code, body = eng.handle_hsp({"smiles": "*C(F)(F)C(F)(F)*", "volume": 40.0})
    assert code == 200
    assert body["quantities"]["deltaD"]["status"] == "predicted"
    assert body["quantities"]["deltaP"]["status"] == "missing" and "–F" in body["reasons"]["deltaP"]
    assert body["quantities"]["delta"]["status"] == "missing"


def test_red_is_missing_when_r0_is_not_in_table_7_8() -> None:
    solvents_req = [{"solventId": "toluene", "amount": 1}]
    # PET 不在 Table 7.8：Ra 照常輸出，RED 回報 missing 並說明（不自行訂 R0）
    code, body = eng.handle_solubility({"smiles": "*CCOC(=O)c1ccc(cc1)C(=O)O*", "solvents": solvents_req})
    assert code == 200 and body["status"] == "ok"
    assert body["ra"]["status"] == "predicted" and body["red"]["status"] == "missing" and body["r0"]["status"] == "missing"
    assert "Table 7.8" in body["reasons"]["red"]
    # 聚丁二烯在 Table 7.8 但 2R 印「–」：同樣沒有 R0（V 用輸入的測試值 55 cm³/mol：Vm 模組沒有 –CH=CH– 的莫耳體積增量）
    code, body = eng.handle_solubility({"smiles": "*CC=CC*", "solvents": solvents_req, "polymerVolume": 55.0})
    assert code == 200 and body["ra"]["status"] == "predicted" and body["red"]["status"] == "missing" and "2R" in body["reasons"]["red"]
    # 聚苯乙烯：R0 = 2R ÷ 2 = 12.7 ÷ 2
    code, body = eng.handle_solubility({"smiles": "*CC(*)c1ccccc1", "solvents": solvents_req})
    assert body["r0"]["value"] == pytest.approx(6.35)
    assert body["red"]["value"] == pytest.approx(body["ra"]["value"] / 6.35)
    assert body["judgement"]["confidence"] == "參考趨勢" and "未做修正" in body["judgement"]["note"]


def test_ra_chi_hand_calculation() -> None:
    # Ra² = 4(δD2−δD1)² + (δP2−δP1)² + (δH2−δH1)²：聚苯乙烯（Table 7.8）對甲苯（Table A.1）
    # = 4 × (18.0−17.6)² + (1.4−6.1)² + (2.0−4.1)² = 0.64 + 22.09 + 4.41 = 27.14
    assert hsp.hansen_ra(17.6, 6.1, 4.1, 18.0, 1.4, 2.0) == pytest.approx(27.14**0.5)
    # χ = 0.34 + Vs(δP−δS)²/(RT)，Vs = 100 cm³/mol、δP = 20、δS = 18、T = 298.15 K：0.34 + 100 × 4 / (8.314462618 × 298.15)
    assert hsp.flory_huggins_chi(100.0, 20.0, 18.0) == pytest.approx(0.34 + 400.0 / (8.314462618 * 298.15))


def test_mixed_solvent_hsp_hand_calculation() -> None:
    """PGMEA 10 g（ρ 0.969，HSP 15.6/5.6/9.8）＋丙酮 5 g（ρ 0.7845，HSP 15.5/10.4/7.0）：
    體積 10/0.969 = 10.3199、5/0.7845 = 6.3735；φ_PGMEA = 10.3199/16.6934 = 0.61823；δD_mix = 0.61823×15.6 + 0.38177×15.5 = 15.5618。"""
    mix = hsp.mix_solvents([{"solventId": "pgmea", "amount": 10}, {"solventId": "acetone", "amount": 5}], "mass")
    assert mix["status"] == "ok"
    v1, v2 = 10 / 0.969, 5 / 0.7845
    phi1 = v1 / (v1 + v2)
    assert mix["components"][0]["volumeFraction"] == pytest.approx(phi1)
    assert mix["hsp"]["deltaD"] == pytest.approx(phi1 * 15.6 + (1 - phi1) * 15.5)
    assert mix["hsp"]["deltaP"] == pytest.approx(phi1 * 5.6 + (1 - phi1) * 10.4)
    assert mix["hsp"]["deltaH"] == pytest.approx(phi1 * 9.8 + (1 - phi1) * 7.0)
    assert round(mix["hsp"]["deltaD"], 4) == 15.5618


def test_liquid_volume_percent_hand_calculation_and_missing_density() -> None:
    """測試用密度：A 0.8、B 1.2 g/cm³；A 60 g、B 40 g → V_A = 75、V_B = 33.333 cm³；vol% A = 75/108.333 = 69.2308、B = 30.7692。"""
    code, body = eng.handle_liquid_volume(
        {"components": [
            {"name": "A", "amount": 60, "amountIsGram": True, "userDensity": 0.8},
            {"name": "B", "amount": 40, "amountIsGram": True, "userDensity": 1.2},
        ]}
    )  # fmt: skip
    assert code == 200 and body["status"] == "ok"
    a, b = body["components"]
    assert a["volPct"]["value"] == pytest.approx(100 * 75 / (75 + 40 / 1.2)) and round(a["volPct"]["value"], 4) == 69.2308
    assert b["volPct"]["value"] == pytest.approx(30.76923, abs=1e-4)
    assert a["volumeCm3"]["value"] == pytest.approx(75.0)
    # 溶劑資料表的密度（以 SMILES 對應）：與輸入密度並存時，輸入優先
    code, body = eng.handle_liquid_volume({"components": [{"name": "丙酮", "amount": 1, "smiles": "CC(C)=O"}, {"name": "未知", "amount": 1, "smiles": "CCCCCCCCCCCC", "userDensity": 0.75}]})
    assert body["status"] == "ok" and body["components"][0]["density"]["basis"] == "table" and body["components"][0]["density"]["temperatureC"] == 20
    assert body["components"][1]["density"]["basis"] == "user"
    # 缺密度：表中沒有且沒有輸入 → 所有成分的 vol% 回報 missing，並指出是誰
    code, body = eng.handle_liquid_volume({"components": [{"name": "丙酮", "amount": 1, "smiles": "CC(C)=O"}, {"name": "某液體", "amount": 1, "smiles": "CCCCCCCCCCCC"}]})
    assert code == 200 and body["status"] == "missing"
    assert all(c["volPct"]["status"] == "missing" for c in body["components"]) and "某液體" in body["components"][0]["volPct"]["reason"]
    assert liquid_volume.resolve_density({"name": "x"})[0] is None
    assert eng.handle_liquid_volume({"components": []})[0] == 400


def test_table_7_8_polymers_match_their_own_repeat_units() -> None:
    for r in hsp.load_hsp_polymers():
        assert hsp.polymer_row_for(r.smiles) is r
    assert hsp.polymer_row_for("*CC(*)c1ccccc1").name == "Polystyrene"
    assert hsp.polymer_row_for("[*:2]C(Cl)C[*:1]").name == "Poly(vinyl chloride)"  # 方向與連接點編號不影響對應
    assert hsp.polymer_row_for("*CCOC(=O)c1ccc(cc1)C(=O)O*") is None
