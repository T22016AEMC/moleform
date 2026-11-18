"""任務 P7-5：pKa 估算（Hammett／Taft）與反應位點相對活性排序的最少單元測試（D64）。
檢查程式有沒有照公式算對（D17）：手算一個 Hammett 例子、一個 Taft 例子、缺值與不涵蓋的環系回報 missing、
有 missing 時不排序、SASA 固定種子重現同值。不做反向驗證與邊界探針。"""

from __future__ import annotations

import pytest

import moleform_engine as eng
from moleform_core import crosslink as cl
from moleform_core import pka, site_activity


def _groups(smiles: str) -> list[dict]:
    code, body = eng.handle_pka({"smiles": smiles})
    assert code == 200, body
    return body["groups"]


def test_endpoints_exist_and_follow_quantity_format() -> None:
    assert eng.POST_ROUTES["/pka"] is eng.handle_pka
    assert eng.POST_ROUTES["/crosslink/site-activity"] is eng.handle_crosslink_site_activity
    code, body = eng.handle_pka({"smiles": "Oc1ccccc1"})
    assert code == 200 and body["status"] == "predicted"
    q = body["groups"][0]["quantity"]
    assert set(q) == {"value", "unit", "source", "status"} and q["status"] == "predicted" and q["unit"] == "pKa"
    assert q["value"] == pytest.approx(9.92)  # 苯酚：Σσ = 0
    assert eng.handle_pka({"smiles": ""})[0] == 400
    assert eng.handle_pka({"smiles": "not-a-smiles"})[0] == 400


def test_data_tables_pass_positive_and_negative_examples() -> None:
    assert pka.validate_tables() == []


def test_hammett_hand_calculation() -> None:
    # 4-氯-3,5-二甲基酚（書 §5.3.1）：pKa = 9.92 − 2.23 × (σp Cl 0.24 + 2 × σm CH3 (−0.06)) = 9.92 − 2.23 × 0.12
    (g,) = _groups("Oc1cc(C)c(Cl)c(C)c1")
    assert g["classId"] == "phenol"
    assert g["sigmaSum"] == pytest.approx(0.24 - 0.06 - 0.06)
    assert g["quantity"]["value"] == pytest.approx(9.92 - 2.23 * 0.12)
    assert {(d["name"], d["position"]) for d in g["sigmaDetails"]} == {("氯", "para"), ("甲基 −CH3", "meta")}
    # 苦味酸（書 §5.3.4）：ortho NO2 取 A.5 酚欄 1.40，para NO2 取 A.4 酚欄 1.24
    (p,) = _groups("Oc1c([N+](=O)[O-])cc([N+](=O)[O-])cc1[N+](=O)[O-]")
    assert p["quantity"]["value"] == pytest.approx(9.92 - 2.23 * (1.40 + 1.40 + 1.24))


def test_taft_hand_calculation_with_attenuation() -> None:
    # 2-(甲胺基)乙醯胺（書 §4.4.1）：R1 = CH3（σ* 0）、R2 = −CH2CONH2（σ* = 0.4 × 1.68 → 0.67）；pKa = 10.59 − 3.23 × 0.67
    (g,) = _groups("CNCC(N)=O")
    assert g["classId"] == "amine.secondary.conj_acid"
    assert g["sigmaSum"] == pytest.approx(0.67)
    assert g["quantity"]["value"] == pytest.approx(10.59 - 3.23 * 0.67)
    steps = {d["attenuationSteps"] for d in g["sigmaDetails"]}
    assert steps == {0, 1}


def test_missing_when_substituent_not_in_table() -> None:
    # 雙酚 A 的酚：para 位置是 −C(CH3)2Ar，不在 Perrin 的表中 → missing，不估、不內插
    groups = _groups("CC(C)(c1ccc(O)cc1)c1ccc(O)cc1")
    assert len(groups) == 2
    for g in groups:
        assert g["quantity"]["status"] == "missing" and g["quantity"]["value"] is None
        assert "不在 hammett_sigma 表" in g["reason"]


def test_missing_when_ring_system_not_covered() -> None:
    for smiles in ("Oc1ccc2ccccc2c1", "Oc1cccnc1"):  # 稠環、雜環
        (g,) = _groups(smiles)
        assert g["quantity"]["status"] == "missing"
        assert "稠環" in g["reason"] or "六員碳環" in g["reason"]


def _site_components(smiles: str) -> list[dict]:
    comp = {"id": "A", "name": "測試", "category": "Resin", "canonicalSmiles": smiles}
    return cl.analyze_crosslink([comp])["components"]


def test_ranking_follows_direction_and_is_skipped_when_any_pka_is_missing() -> None:
    # 兩個酚都算得出：親核位點 pKa 愈高排名愈前（對氯酚 9.39 > 對硝基酚 7.16）
    code, body = eng.handle_crosslink_site_activity({"components": _site_components("Oc1ccc(Cl)cc1.Oc1ccc([N+](=O)[O-])cc1")})
    assert code == 200
    rows = [r for r in body["components"][0]["sites"] if r["groupId"] == "hydroxyl.phenolic"]
    assert len(rows) == 2
    by_value = sorted(rows, key=lambda r: r["pka"]["quantity"]["value"], reverse=True)
    assert [r["electronic"]["rank"] for r in by_value] == [1, 2]
    assert all(r["steric"]["rank"] in (1, 2) for r in rows)  # 位阻排序是另一個獨立的排序
    assert "electronic" in rows[0] and "steric" in rows[0] and "score" not in rows[0]
    # 其中一個 pKa 是 missing：兩個酚都列出，但電子排序不排
    code, body = eng.handle_crosslink_site_activity({"components": _site_components("Oc1ccc(Cl)cc1.Oc1ccc(C(C)(C)c2ccccc2)cc1")})
    rows = [r for r in body["components"][0]["sites"] if r["groupId"] == "hydroxyl.phenolic"]
    assert sorted(r["pka"]["quantity"]["status"] for r in rows) == ["missing", "predicted"]
    assert all(r["electronic"]["rank"] is None and "missing" in r["electronic"]["reason"] for r in rows)
    assert all(r["steric"]["rank"] is not None for r in rows)  # 位阻排序仍照常


def test_polymer_unit_is_capped_with_methyl_and_sasa_is_reproducible() -> None:
    (g,) = _groups("[*:1]CC([*:2])c1ccc(O)cc1")  # 聚(4-羥基苯乙烯)重複單元：兩個連接點各接甲基 → para 取代基為第二丁基 σp −0.19
    assert g["quantity"]["value"] == pytest.approx(9.92 + 2.23 * 0.19)
    mol = pka.cap_attachments(pka.Chem.MolFromSmiles("[*:1]CC([*:2])c1ccc(O)cc1"))
    first = site_activity.compute_sasa_per_atom(mol)
    second = site_activity.compute_sasa_per_atom(mol)
    assert first[2] is None and first[0] is not None
    assert first[0] == second[0]  # 固定種子、固定構型數與優化方式：逐位相同
    assert all(0.0 <= a <= f for a, f in zip(first[0], first[1]))
