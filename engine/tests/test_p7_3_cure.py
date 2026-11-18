"""任務 P7-3：固化預測（交聯第 2 層）的單元測試。只檢查程式有沒有照公式算對（D17）：
- 式 (6.13)：以書的 K 值與書中的資料（聚苯乙烯 Tg 373 K，Table 6.6；Fig. 6.5 的 1000/Mc = 2 mol/g，即 M_crl = 500 g/mol）手算對照。
- Pascault & Williams 1990 式 (4)、式 (11)：以文中 Table I 的 Tg0、Tg∞（DGEBA–PACM 237／439 K、DGEBA–3DCM 241／453 K）核對 Tg0/Tg∞（Table I 最後一欄 0.540、0.532），並手算 x = 0.5。
- 端點可用、第 1 層不支援的體系回報同一個原因、Tg,0 缺值時 Tg∞ 為 missing、Td 警示觸發與不觸發各一個。"""

from __future__ import annotations

import pytest

import moleform_engine as eng
from moleform_core import cure_prediction as cp
from moleform_core import crosslink, layer1

BADGE = "CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1"
BPA = "CC(C)(c1ccc(O)cc1)c1ccc(O)cc1"
PHTHALIC_ANHYDRIDE = "O=C1OC(=O)c2ccccc12"
CRESOL_NOVOLAC = "[*:1]Cc1cc([*:2])cc(C)c1O"
PGMA = "[*:1]CC([*:2])(C)C(=O)OCC1CO1"
PMMA = "[*:1]CC([*:2])(C)C(=O)OC"
PS = "[*:1]CC([*:2])c1ccccc1"
PE_LIKE = "[*:1]CC([*:2])C"


# ---------- 公式 ----------


def test_eq_6_13_with_book_values() -> None:
    # 聚苯乙烯 Tg,0 = 373 K（Table 6.6），M_crl = 500 g/mol：373 + 3.9×10⁴/500 = 451，373 + 5.2×10⁴/500 = 477
    assert cp.tg_crosslinked(373.0, cp.K_CRL_NIELSEN, 500.0) == pytest.approx(451.0)
    assert cp.tg_crosslinked(373.0, cp.K_CRL_BOOK_FIT, 500.0) == pytest.approx(477.0)
    assert (cp.K_CRL_NIELSEN, cp.K_CRL_BOOK_FIT) == (3.9e4, 5.2e4)
    with pytest.raises(ValueError):
        cp.tg_crosslinked(373.0, cp.K_CRL_NIELSEN, 0.0)


def test_lambda_matches_pascault_williams_table_1() -> None:
    assert cp.lambda_approx(237.0, 439.0) == pytest.approx(0.540, abs=5e-4)
    assert cp.lambda_approx(241.0, 453.0) == pytest.approx(0.532, abs=5e-4)


def test_dibenedetto_eq_4_hand_calculation() -> None:
    # Tg0 = 300、Tg∞ = 400：λ = 0.75；x = 0.5：λx/(1 − (1 − λ)x) = 0.375/0.875 = 3/7 → Tg = 300 + 100·3/7
    assert cp.tg_at_conversion(300.0, 400.0, 0.5) == pytest.approx(300.0 + 100.0 * 3 / 7)
    assert cp.tg_at_conversion(300.0, 400.0, 0.0) == pytest.approx(300.0)
    assert cp.tg_at_conversion(300.0, 400.0, 1.0) == pytest.approx(400.0)
    with pytest.raises(ValueError):
        cp.tg_at_conversion(300.0, 400.0, 1.1)


def test_max_conversion_inverts_eq_4() -> None:
    for x in (0.2, 0.5, 0.8, 0.95):
        t = cp.tg_at_conversion(237.0, 439.0, x)
        assert cp.max_conversion_at(237.0, 439.0, t) == pytest.approx(x)
    assert cp.max_conversion_at(237.0, 439.0, 439.0) == 1.0
    assert cp.max_conversion_at(237.0, 439.0, 500.0) == 1.0
    assert cp.max_conversion_at(237.0, 439.0, 237.0) == 0.0
    assert cp.max_conversion_at(237.0, 439.0, 200.0) == 0.0


# ---------- 端點 ----------


def _request(components: list[dict], amounts: dict, **extra: object) -> tuple[int, dict]:
    comps = []
    for c in components:
        d = dict(c)
        if "*" not in c["canonicalSmiles"]:
            d["molarMass"] = 300.0
        comps.append(d)
    code, analysis = eng.handle_crosslink_analyze({"components": comps})
    assert code == 200
    mn = {c["id"]: c["molarMass"] for c in analysis["components"]}
    solid = {"unit": "wt", "components": [{**c, "amount": amounts[c["id"]]} for c in components]}
    return eng.handle_crosslink_cure({"result": analysis, "solid": solid, "wtPct": amounts, "mn": mn, **extra})


def _novolac_badge() -> tuple[int, dict]:
    comps = [
        {"id": "N", "name": "novolac", "category": "Resin", "canonicalSmiles": CRESOL_NOVOLAC, "polymer": {"mnInput": 1000}},
        {"id": "B", "name": "BADGE", "category": "Resin", "canonicalSmiles": BADGE},
    ]
    return _request(comps, {"N": 80, "B": 20}, cureTempC=150)


def test_endpoint_returns_range_with_sources() -> None:
    code, out = _novolac_badge()
    assert (code, out["ok"], out["supported"]) == (200, True, True)
    tg0, m_crl, tg_inf = out["tg0"], out["mCrl"], out["tgInf"]
    assert (tg0["status"], m_crl["status"], tg_inf["status"]) == ("predicted", "predicted", "predicted")
    # 範圍：兩個書中 K 值各算一次，各標來源；數值照式 (6.13)
    assert tg_inf["low"]["tgK"] == pytest.approx(tg0["tgK"] + 3.9e4 / m_crl["value"])
    assert tg_inf["high"]["tgK"] == pytest.approx(tg0["tgK"] + 5.2e4 / m_crl["value"])
    assert "3.9×10⁴" in tg_inf["low"]["source"] and "5.2×10⁴" in tg_inf["high"]["source"]
    assert out["quantities"]["tgInfLow"]["status"] == "predicted" and out["quantities"]["tgInfHigh"]["unit"] == "K"
    # M_crl 就是限量官能基轉化率 100% 時第 1 層的 Mc
    assert m_crl["value"] > 0
    # 式 (6.14) 取不到 x_crl：回報原因，不估
    assert out["eq614"]["status"] == "missing" and "x_crl" in out["eq614"]["reason"]
    # 固化後 Tg 表：預設 0.5、0.8、0.9、1.0；100% 等於 Tg∞
    table = out["postCure"]["table"]
    assert [r["conversion"] for r in table] == [0.5, 0.8, 0.9, 1.0]
    assert table[-1]["low"]["tgK"] == pytest.approx(tg_inf["low"]["tgK"]) and table[-1]["high"]["tgK"] == pytest.approx(tg_inf["high"]["tgK"])
    assert out["postCure"]["minFullCureTemp"]["high"]["tgK"] == pytest.approx(tg_inf["high"]["tgK"])
    # 150 °C 高於這個體系的 Tg∞（約 358 K），最大轉化率為 1
    assert out["postCure"]["maxConversion"]["low"] == 1.0
    assert out["disclaimer"].startswith("本數值為依理論模型估算之參考值")


def test_max_conversion_below_tg_inf() -> None:
    comps = [
        {"id": "N", "name": "novolac", "category": "Resin", "canonicalSmiles": CRESOL_NOVOLAC, "polymer": {"mnInput": 1000}},
        {"id": "B", "name": "BADGE", "category": "Resin", "canonicalSmiles": BADGE},
    ]
    code, first = _request(comps, {"N": 80, "B": 20})
    assert code == 200 and first["postCure"]["maxConversion"] is None  # 沒給硬化溫度就不算
    low, high = first["tgInf"]["low"]["tgK"], first["tgInf"]["high"]["tgK"]
    t_k = (low + high) / 2  # 介於 Tg∞ 下限與上限之間
    code, out = _request(comps, {"N": 80, "B": 20}, cureTempC=t_k - 273.15)
    assert code == 200
    mc = out["postCure"]["maxConversion"]
    assert mc["low"] == 1.0 and 0 < mc["high"] < 1  # Tg∞ 下限已低於 T；上限仍高於 T，玻璃化限制成立
    assert mc["high"] == pytest.approx(cp.max_conversion_at(out["tg0"]["tgK"], high, t_k))


def test_unsupported_system_reports_same_reason_as_layer1() -> None:
    comps = [{"id": "B", "name": "BADGE", "category": "Resin", "canonicalSmiles": BADGE}, {"id": "A", "name": "anhydride", "category": "Resin", "canonicalSmiles": PHTHALIC_ANHYDRIDE}]
    code, out = _request(comps, {"B": 70, "A": 30})
    assert (code, out["supported"]) == (200, False)
    assert layer1.MESSAGE_UNSUPPORTED_SYSTEM in out["reason"] and "epoxy+anhydride" in out["reason"]
    # 同一份第 0 層結果交給第 1 層的整理函式，原因逐字相同
    analysis = crosslink.analyze_crosslink([{**c, "molarMass": 300.0} for c in comps])
    solid = [{**c, "amount": a} for c, a in zip(comps, (70, 30))]
    prep = layer1.prepare_layer1(analysis, solid, "wt", {"B": 70, "A": 30})
    assert prep["ok"] is False and out["reason"] == prep["reason"]


def test_missing_tg0_makes_tg_inf_missing() -> None:
    # PGMA 重複單元缺 Yg 基團（算不出 Tg），BPA 是小分子（D56 不計 Tg）：沒有可混合的 Tg
    comps = [
        {"id": "E", "name": "PGMA", "category": "Resin", "canonicalSmiles": PGMA, "polymer": {"mnInput": 3000}},
        {"id": "P", "name": "BPA", "category": "Resin", "canonicalSmiles": BPA},
    ]
    code, out = _request(comps, {"E": 80, "P": 20})
    assert (code, out["supported"]) == (200, True)
    assert out["tg0"]["status"] == "missing" and "缺" in out["tg0"]["reason"]
    assert out["tgInf"]["status"] == "missing" and out["tgInf"]["reason"].startswith("Tg,0 缺值")
    assert out["postCure"]["status"] == "missing"
    assert out["quantities"]["tgInfLow"]["status"] == "missing" and out["quantities"]["tgInfLow"]["value"] is None
    assert out["td"]["warning"]["status"] == "cannot-judge"
    assert out["mCrl"]["status"] == "predicted"  # M_crl 與 Tg,0 無關，仍照出


def test_bad_requests_are_rejected() -> None:
    assert eng.handle_crosslink_cure({})[0] == 400
    assert eng.handle_crosslink_cure({"result": {"pairs": [], "components": []}, "solid": {"unit": "wt", "components": [{"id": "x"}]}})[0] == 400
    code, _ = _request([{"id": "B", "name": "BADGE", "category": "Resin", "canonicalSmiles": BADGE}], {"B": 100}, cureTempC=-300)
    assert code == 400


# ---------- 7.7 Td 警示 ----------


def _solid(*items: tuple[str, str, str]) -> list[dict]:
    return [{"id": n, "name": n, "category": "Resin", "canonicalSmiles": s, **({"polymer": {"mnInput": 3000}} if "*" in s else {})} for n, s, _ in items]


def _tg_inf(high_k: float) -> dict:
    return {"status": "predicted", "low": {"tgK": high_k - 10}, "high": {"tgK": high_k}}


def test_td_warning_triggers_when_tg_inf_exceeds_lowest_td() -> None:
    solid = _solid(("pmma", PMMA, ""), ("ps", PS, ""), ("small", BADGE, ""))
    out = cp.compute_td_comparison(solid, _tg_inf(700.0))
    assert out["lowest"]["name"] == "pmma" and out["lowest"]["tdK"] == pytest.approx(604.29, abs=0.01)
    assert out["warning"]["status"] == "triggered" and out["warning"]["text"] == "估算 Tg∞ 高於成分 Td,1/2，完全固化前可能分解"
    assert [r["name"] for r in out["notCompared"]] == ["small"]  # 小分子不比較，列出


def test_td_warning_does_not_trigger_when_tg_inf_is_lower() -> None:
    solid = _solid(("pmma", PMMA, ""), ("ps", PS, ""))
    out = cp.compute_td_comparison(solid, _tg_inf(500.0))
    assert out["warning"]["status"] == "clear"
    assert out["lowest"]["name"] == "pmma"


def test_td_comparison_skips_catalysts_and_lists_missing_components() -> None:
    solid = _solid(("pmma", PMMA, ""), ("nov", CRESOL_NOVOLAC, ""))
    solid.append({"id": "cat", "name": "cat", "category": "Catalyst/Initiator", "canonicalSmiles": PE_LIKE})
    out = cp.compute_td_comparison(solid, _tg_inf(700.0))
    assert [e["name"] for e in out["excluded"]] == ["cat"]
    assert "nov" in [r["name"] for r in out["notCompared"]]  # 缺基團的成分不比較，列出
    assert out["lowest"]["name"] == "pmma" and out["warning"]["status"] == "triggered"
