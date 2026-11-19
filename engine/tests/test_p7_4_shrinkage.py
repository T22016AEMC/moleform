"""任務 P7-4：反應溫度範圍顯示（7.2）與固化收縮（7.6）的單元測試。只檢查程式有沒有照公式算對（D17）：
- 溫度範圍：只顯示規則表的文獻值；欄位為空顯示「無文獻範圍」，不補值；光觸發規則顯示「光觸發」。
- 收縮率手算對照（硫醇–烯、直接有文獻值；環氧＋酚、環氧開環沿用）。測試輸入的密度與分子量是為了好算的假設值，不是材料數據。
- 缺值反應列出不補、單位與符號、環氧開環沿用有標示、不支援體系回報原因、端點可用。"""

from __future__ import annotations

import copy

import pytest

import moleform_engine as eng
from moleform_core import crosslink, cure_prediction as cp, cure_shrinkage as cs, layer1

TETRATHIOL = "C(OC(=O)CCS)(COC(=O)CCS)(COC(=O)CCS)COC(=O)CCS"  # 4 個 –SH
TRIALLYL = "C=CCn1c(=O)n(CC=C)c(=O)n(CC=C)c1=O"  # 3 個烯丙基
BADGE = "CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1"  # 2 個環氧
BPA = "CC(C)(c1ccc(O)cc1)c1ccc(O)cc1"  # 2 個酚羥基
HDI = "O=C=NCCCCCCN=C=O"
DIOL = "OCCCCO"
PHTHALIC_ANHYDRIDE = "O=C1OC(=O)c2ccccc12"
CRESOL_NOVOLAC = "[*:1]Cc1cc([*:2])cc(C)c1O"


def _run(components: list[dict], amounts: dict, molar_mass: dict, **extra: object) -> tuple[int, dict]:
    comps = []
    for c in components:
        d = dict(c)
        if "*" not in c["canonicalSmiles"]:
            d["molarMass"] = molar_mass[c["id"]]
        comps.append(d)
    code, analysis = eng.handle_crosslink_analyze({"components": comps})
    assert code == 200, analysis
    mn = {c["id"]: c["molarMass"] for c in analysis["components"]}
    solid = {"unit": "wt", "components": [{**c, "amount": amounts[c["id"]]} for c in components]}
    return eng.handle_crosslink_cure({"result": analysis, "solid": solid, "wtPct": amounts, "mn": mn, **extra})


def _thiol_ene() -> tuple[int, dict]:
    # 假設值（好算用）：四硫醇 M = 400、密度 1.2；三烯丙基 M = 300、密度 1.0；各 50 g/100 g Solid
    comps = [
        {"id": "T", "name": "四硫醇", "category": "Resin", "canonicalSmiles": TETRATHIOL, "density": 1.2},
        {"id": "E", "name": "三烯丙基", "category": "Resin", "canonicalSmiles": TRIALLYL, "density": 1.0},
    ]
    return _run(comps, {"T": 50, "E": 50}, {"T": 400.0, "E": 300.0})


def _epoxy_phenol(with_density: bool = True) -> tuple[int, dict]:
    # 假設值：環氧 M = 400（每分子 2 個環氧基）、酚 M = 200（每分子 2 個酚羥基），各 50 g/100 g Solid；密度皆 1.0
    extra = {"density": 1.0} if with_density else {}
    comps = [
        {"id": "E", "name": "環氧", "category": "Resin", "canonicalSmiles": BADGE, **extra},
        {"id": "P", "name": "雙酚", "category": "Resin", "canonicalSmiles": BPA, **extra},
    ]
    return _run(comps, {"E": 50, "P": 50}, {"E": 400.0, "P": 200.0})


# ---------- 7.6 手算對照 ----------


def test_thiol_ene_shrinkage_hand_calculation() -> None:
    code, out = _thiol_ene()
    assert (code, out["ok"], out["supported"], out["ruleId"]) == (200, True, True, "thiol+alkene.allyl")
    s = out["shrinkage"]
    assert s["status"] == "predicted"
    # 手算（以 100 g Solid 為基準）：
    #   –SH = 50/400 × 4 = 0.5 mol；烯丙基 = 50/300 × 3 = 0.5 mol → 1:1，兩側同時耗盡
    #   轉化率 1.0 形成的鍵 = 0.5 mol／100 g = 5.0 mol/kg（轉化率 0.5 為 2.5 mol/kg）
    #   混合密度：1/ρ = 0.5/1.2 + 0.5/1.0 = 0.916667 → ρ = 1.090909 g/cm³，V = 1000/ρ = 916.667 cm³/kg
    #   收縮率 = 12.6 cm³/mol × 5.0 mol/kg ÷ 916.667 cm³/kg = 0.068727 → 6.8727 %（轉化率 0.5：3.4364 %）
    inv_rho = 0.5 / 1.2 + 0.5 / 1.0
    assert s["density"]["gPerCm3"] == pytest.approx(1 / inv_rho)
    by_x = {r["conversion"]: r for r in s["table"]}
    assert [r["conversion"] for r in s["table"]] == [0.5, 0.8, 0.9, 1.0]
    assert by_x[1.0]["totalPct"] == pytest.approx(12.6 * 5.0 / (1000 * inv_rho) * 100)
    assert by_x[1.0]["totalPct"] == pytest.approx(6.8727, abs=1e-4)
    assert by_x[0.5]["totalPct"] == pytest.approx(3.4364, abs=1e-4)
    assert by_x[0.5]["byReaction"][0]["bondsMolPerKg"] == pytest.approx(2.5)
    # 直接有文獻值：全部在 directPct，沒有詮釋值
    r = s["reactions"][0]
    assert r["kind"] == "direct" and r["deltaV"] == 12.6 and r["interpretation"] is None
    assert (by_x[1.0]["directPct"], by_x[1.0]["interpretedPct"]) == (by_x[1.0]["totalPct"], 0.0)
    assert "參考趨勢" in s["note"] and "正值＝體積減少" in s["note"]


def test_epoxy_ring_opening_reuse_is_labelled_and_listed_separately() -> None:
    code, out = _epoxy_phenol()
    assert (code, out["supported"], out["ruleId"]) == (200, True, "epoxy+phenol")
    s = out["shrinkage"]
    assert s["status"] == "predicted"
    # 手算：環氧基 = 50/400 × 2 = 0.25 mol（限量）、酚羥基 = 50/200 × 2 = 0.5 mol → 轉化率 1.0 形成 0.25 mol／100 g = 2.5 mol/kg
    #   ρ = 1.0 → V = 1000 cm³/kg；收縮率 = 11 × 2.5 ÷ 1000 = 2.75 %；轉化率 0.8：11 × 2.0 ÷ 1000 = 2.2 %
    by_x = {r["conversion"]: r for r in s["table"]}
    assert by_x[1.0]["totalPct"] == pytest.approx(2.75)
    assert by_x[0.8]["totalPct"] == pytest.approx(2.2)
    # epoxy+phenol 在規則表沒有自己的值：沿用 epoxy+pag.cationic 的環氧開環值，標「詮釋」，且與直接文獻值分開
    r = s["reactions"][0]
    rules = {x["id"]: x for x in crosslink.load_reaction_rules()}
    assert rules["epoxy+phenol"]["bond_volume_change"] is None
    assert r["kind"] == "interpreted" and r["borrowedFrom"] == "epoxy+pag.cationic"
    assert r["deltaV"] == rules["epoxy+pag.cationic"]["bond_volume_change"]
    assert "詮釋：沿用環氧開環值（外推）" == r["interpretation"] and "外推" in r["note"]
    assert (by_x[1.0]["directPct"], by_x[1.0]["interpretedPct"]) == (0.0, by_x[1.0]["totalPct"])
    assert by_x[1.0]["byReaction"][0]["kind"] == "interpreted"


def test_epoxy_reuse_only_for_epoxy_ring_opening_rules() -> None:
    rules = {x["id"]: x for x in crosslink.load_reaction_rules()}
    # 環氧＋酚、四種環氧＋胺沿用；酸酐、氰酸酯的體積變化事件不只環氧開環，不沿用；其他體系（異氰酸酯、矽烷、苯并㗁嗪…）不沿用
    for rid in ("epoxy+phenol", "epoxy+amine.primary.aliphatic", "epoxy+amine.primary.aromatic", "epoxy+amine.secondary.aliphatic", "epoxy+amine.secondary.aromatic"):
        assert cs.reaction_volume_change(rid, rules)["kind"] == "interpreted"
    for rid in ("epoxy+anhydride", "epoxy+cyanate", "isocyanate+alcohol", "silane.hydrolysis", "benzoxazine+epoxy", "acrylamide+initiator.thermal"):
        r = cs.reaction_volume_change(rid, rules)
        assert r["kind"] == "missing" and r["deltaV"] is None and r["interpretation"] is None
    # 規則表自己有值的環氧規則（陽離子環氧）是直接值
    assert cs.reaction_volume_change("epoxy+pag.cationic", rules)["kind"] == "direct"
    # 沿用的來源規則也沒有值時：不補，回報原因
    blank = {k: dict(v) for k, v in rules.items()}
    blank["epoxy+pag.cationic"]["bond_volume_change"] = None
    r = cs.reaction_volume_change("epoxy+phenol", blank)
    assert r["kind"] == "missing" and "環氧開環值也取不到" in r["reason"]


def test_reaction_without_value_is_listed_not_filled() -> None:
    # 異氰酸酯＋醇：第 1 層支援，但規則表沒有 bond_volume_change，也不是環氧開環：整項 missing，列出反應與原因，不補值
    comps = [
        {"id": "I", "name": "HDI", "category": "Resin", "canonicalSmiles": HDI, "density": 1.0},
        {"id": "D", "name": "丁二醇", "category": "Resin", "canonicalSmiles": DIOL, "density": 1.0},
    ]
    code, out = _run(comps, {"I": 50, "D": 50}, {"I": 168.0, "D": 90.0})
    assert (code, out["supported"], out["ruleId"]) == (200, True, "isocyanate+alcohol")
    s = out["shrinkage"]
    assert s["status"] == "missing" and "table" not in s
    assert s["reactions"][0]["kind"] == "missing" and s["reactions"][0]["deltaV"] is None
    assert s["excluded"][0]["ruleId"] == "isocyanate+alcohol" and "沒有 bond_volume_change" in s["excluded"][0]["reason"]
    assert "沒有單位鍵體積變化" in s["reason"] and "isocyanate+alcohol" in s["reason"]


# ---------- 單位與符號 ----------


def test_volume_unit_and_sign_conventions() -> None:
    assert cs.parse_volume_unit("cm3/mol（每莫耳反應的 C=C 的收縮量；正值＝體積減少）") == (1, None)
    assert cs.parse_volume_unit("mL/mol（正值＝體積減少）") == (1, None)  # 1 mL = 1 cm³，只換算單位
    assert cs.parse_volume_unit("cm3/mol（正值＝體積增加）") == (-1, None)
    for bad in ("", None, "m3/mol（正值＝體積減少）", "cm3/mol", "cm3/mol（符號不明）"):
        sign, why = cs.parse_volume_unit(bad)
        assert sign is None and why  # 讀不出來就不用，不猜


def _rules_with(thiol_unit: str, thiol_value: float | None = 12.6) -> list[dict]:
    rules = [dict(r) for r in crosslink.load_reaction_rules()]
    for r in rules:
        if r["id"] == "thiol+alkene.allyl":
            r["bond_volume_change"] = thiol_value
            r["bond_volume_change_unit"] = thiol_unit
    return rules


def test_sign_convention_flips_with_unit_text() -> None:
    code, base = _thiol_ene()
    assert code == 200
    # 同一份第 0 層結果與配方，只把規則表單位改成「正值＝體積增加」：收縮率符號相反、絕對值相同
    comps = [
        {"id": "T", "name": "四硫醇", "category": "Resin", "canonicalSmiles": TETRATHIOL, "density": 1.2},
        {"id": "E", "name": "三烯丙基", "category": "Resin", "canonicalSmiles": TRIALLYL, "density": 1.0},
    ]
    code, analysis = eng.handle_crosslink_analyze({"components": [{**comps[0], "molarMass": 400.0}, {**comps[1], "molarMass": 300.0}]})
    assert code == 200
    solid = {"unit": "wt", "components": [{**c, "amount": 50} for c in comps]}
    mn = {c["id"]: c["molarMass"] for c in analysis["components"]}
    flipped = cp.compute_cure_prediction(analysis, solid, {"T": 50, "E": 50}, mn, reaction_rules=_rules_with("mL/mol（正值＝體積增加）"))
    plain = cp.compute_cure_prediction(analysis, solid, {"T": 50, "E": 50}, mn, reaction_rules=_rules_with("mL/mol（正值＝體積減少）"))
    assert flipped["shrinkage"]["reactions"][0]["deltaV"] == -12.6 and plain["shrinkage"]["reactions"][0]["deltaV"] == 12.6
    assert flipped["shrinkage"]["table"][-1]["totalPct"] == pytest.approx(-plain["shrinkage"]["table"][-1]["totalPct"])
    assert plain["shrinkage"]["table"][-1]["totalPct"] == pytest.approx(base["shrinkage"]["table"][-1]["totalPct"])
    # 單位讀不出來：該反應不計入、列出原因，不補值
    bad = cp.compute_cure_prediction(analysis, solid, {"T": 50, "E": 50}, mn, reaction_rules=_rules_with("L/mol（正值＝體積減少）"))
    assert bad["shrinkage"]["status"] == "missing" and "不是 cm3/mol 或 mL/mol" in bad["shrinkage"]["reason"]


# ---------- 缺密度、不支援 ----------


def test_missing_density_makes_shrinkage_missing_with_reason() -> None:
    code, out = _epoxy_phenol(with_density=False)
    assert (code, out["supported"]) == (200, True)
    s = out["shrinkage"]
    assert s["status"] == "missing" and "成分缺密度" in s["reason"] and "不猜值" in s["reason"]
    assert s["reactions"][0]["kind"] == "interpreted"  # 反應資訊仍列出
    assert "table" not in s


def test_unsupported_system_reports_same_reason_and_still_lists_temperature() -> None:
    comps = [{"id": "B", "name": "BADGE", "category": "Resin", "canonicalSmiles": BADGE}, {"id": "A", "name": "anhydride", "category": "Resin", "canonicalSmiles": PHTHALIC_ANHYDRIDE}]
    code, out = _run(comps, {"B": 70, "A": 30}, {"B": 340.0, "A": 148.0})
    assert (code, out["supported"]) == (200, False)
    assert layer1.MESSAGE_UNSUPPORTED_SYSTEM in out["reason"] and "epoxy+anhydride" in out["reason"]
    assert "shrinkage" not in out  # 不硬算
    # 溫度範圍只是顯示規則表的值，不是計算：不支援的體系也列
    row = out["temperatureRanges"]["rows"][0]
    assert row["ruleId"] == "epoxy+anhydride" and row["text"] == "無文獻範圍" and row["status"] == "none"


def test_endpoint_rejects_bad_density_and_keeps_wire_format() -> None:
    comps = [{"id": "B", "name": "BADGE", "category": "Resin", "canonicalSmiles": BADGE, "molarMass": 340.0}]
    code, analysis = eng.handle_crosslink_analyze({"components": comps})
    assert code == 200
    bad = {"result": analysis, "solid": {"unit": "wt", "components": [{"id": "B", "name": "BADGE", "category": "Resin", "canonicalSmiles": BADGE, "amount": 100, "density": -1}]}, "wtPct": {"B": 100}, "mn": {"B": 340.0}}
    code, out = eng.handle_crosslink_cure(bad)
    assert code == 400 and "density" in out["errors"][0]
    code, out = _thiol_ene()
    assert code == 200 and out["shrinkage"]["table"][0]["conversion"] == 0.5 and out["temperatureRanges"]["rows"][0]["ruleId"] == "thiol+alkene.allyl"
    assert out["notes"]["temperature"] == cs.TEMP_NOTE and out["notes"]["shrinkage"] == cs.SHRINKAGE_NOTE


# ---------- 7.2 溫度範圍 ----------


def _pairs(*ids: str) -> list[dict]:
    return [{"ruleId": i, "reactionLabel": f"label-{i}"} for i in ids]


def test_temperature_ranges_show_table_values_only() -> None:
    rules = crosslink.load_reaction_rules()
    rows = {r["ruleId"]: r for r in cs.compute_temperature_ranges(_pairs("benzoxazine.ring_opening", "resol.methylol+phenol_ring", "isocyanate.deblocking.oxime", "epoxy+phenol", "epoxy+pag.cationic", "acrylate+initiator.photo", "thiol+alkene.allyl"), rules)["rows"]}
    # 有範圍：照規則表（不內插、不調整），附出處、適用條件摘要、審核狀態
    bz = rows["benzoxazine.ring_opening"]
    assert (bz["status"], bz["tempMinC"], bz["tempMaxC"], bz["text"]) == ("range", 160, 220, "160–220 °C")
    assert "Lochab" in bz["source"] and bz["reviewStatus"] == "pending" and "開環聚合溫度" in bz["conditions"]
    assert rows["resol.methylol+phenol_ring"]["text"] == "60–100 °C" and "不是完整硬化溫度" in rows["resol.methylol+phenol_ring"]["conditions"]
    assert rows["isocyanate.deblocking.oxime"]["text"] == "85–260 °C" and "不是完整硬化溫度" in rows["isocyanate.deblocking.oxime"]["conditions"]
    # 欄位為空：無文獻範圍，沒有補值
    for rid in ("epoxy+phenol", "thiol+alkene.allyl"):
        r = rows[rid]
        assert (r["status"], r["text"], r["tempMinC"], r["tempMaxC"]) == ("none", "無文獻範圍", None, None)
    # 光觸發（催化劑欄以「光」開頭）：顯示「光觸發」；熱或光皆可的硫醇–烯不算
    assert rows["epoxy+pag.cationic"]["status"] == "photo" and rows["epoxy+pag.cationic"]["text"] == "光觸發"
    assert rows["acrylate+initiator.photo"]["text"] == "光觸發"
    assert "自由基起始劑" in rows["thiol+alkene.allyl"]["catalyst"] and rows["thiol+alkene.allyl"]["status"] == "none"
    # 同一條規則只列一次，依首次出現順序
    out = cs.compute_temperature_ranges(_pairs("epoxy+phenol", "epoxy+phenol", "isocyanate+alcohol"), rules)
    assert [r["ruleId"] for r in out["rows"]] == ["epoxy+phenol", "isocyanate+alcohol"]
    assert "非預測" in out["note"] and "不補值" in out["note"]


def test_temperature_counts_in_rule_table() -> None:
    # 目前規則表：4 條有溫度範圍（P7-2 的 3 條＋既有 resol 的 1 條），6 條光觸發
    rules = crosslink.load_reaction_rules()
    with_range = [r["id"] for r in rules if r["temp_min_c"] is not None or r["temp_max_c"] is not None]
    assert sorted(with_range) == sorted(["resol.methylol+phenol_ring", "benzoxazine+phenol_ring", "benzoxazine.ring_opening", "isocyanate.deblocking.oxime"])
    assert len([r for r in rules if cs._is_photo_triggered(r)]) == 6
    assert len([r for r in rules if r["bond_volume_change"] is not None]) == 8


def test_temperature_only_one_bound_is_not_completed() -> None:
    rules = copy.deepcopy([dict(r) for r in crosslink.load_reaction_rules()])
    for r in rules:
        if r["id"] == "epoxy+phenol":
            r["temp_min_c"] = 120.0  # 只有下限
    row = cs.compute_temperature_ranges(_pairs("epoxy+phenol"), rules)["rows"][0]
    assert row["tempMinC"] == 120.0 and row["tempMaxC"] is None and "只有下限" in row["text"]  # 不補上限
    row = cs.compute_temperature_ranges(_pairs("no.such.rule"), rules)["rows"][0]
    assert row["status"] == "none" and row["text"] == "無文獻範圍"


def test_density_includes_only_mixed_components_and_marks_copolymer() -> None:
    solid = [
        {"id": "A", "name": "A", "category": "Resin", "canonicalSmiles": BADGE, "density": 1.0},
        {"id": "C", "name": "催化劑", "category": "Catalyst/Initiator", "canonicalSmiles": BPA},
        {"id": "V", "name": "溶劑", "category": "Resin", "canonicalSmiles": BPA, "volatileFlag": True},
    ]
    d = cs.formulation_density(solid, {"A": 90, "C": 5, "V": 5})
    assert d["status"] == "predicted" and d["density"] == pytest.approx(1.0)  # 催化劑與揮發成分不混入
    cop = {"id": "P", "name": "共聚物", "category": "Resin", "canonicalSmiles": CRESOL_NOVOLAC, "polymer": {"units": [{"smiles": CRESOL_NOVOLAC, "fraction": 50}, {"smiles": "[*:1]CC([*:2])c1ccccc1", "fraction": 50}]}}
    d = cs.formulation_density([cop], {"P": 100})
    # 任務 P8-3（使用者 2026-11-19 同意改此行）：共聚物按莫耳分率加權各單元，不再回 missing；第 1 單元書 Va 缺基團 → 類別預設並標示
    assert d["status"] == "predicted" and d["components"][0]["densitySource"] == "class" and "類別預設，非材料值" in d["components"][0]["detail"]
    assert cs.formulation_density([solid[1]], {"C": 100})["status"] == "missing"
