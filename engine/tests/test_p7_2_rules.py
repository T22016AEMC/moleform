"""任務 P7-2（D67）：以公開文獻補反應溫度範圍（S03）與單位鍵體積變化（S05），並補四條待補規則的單元測試。
本檔只檢查「資料表有沒有照卡填、每個填入的數值都有出處與適用條件」，不檢查數值是否正確（那是使用者審核，D17）。
四條新規則各一個命中、一個不命中（第 0 層，用專案的真實資料表）；第 1 層對四條規則回報原因、不給數值。
資料表本身的 should_match／should_not_match、should_react／should_not_react 由 TypeScript 的 tests/data 檢查（RDKit.js）。"""

from __future__ import annotations

import pytest

from moleform_core import crosslink, layer1

AIBN = "CC(C)(C#N)N=NC(C)(C)C#N"
BMI = "O=C1C=CC(=O)N1c1ccc(Cc2ccc(N3C(=O)C=CC3=O)cc2)cc1"
PMI = "O=C1C=CC(=O)N1c1ccccc1"
DABPA = "CC(C)(c1ccc(O)c(CC=C)c1)c1ccc(O)c(CC=C)c1"
PROPENYL = "CC(C)(c1ccc(O)c(C=CC)c1)c1ccc(O)c(C=CC)c1"  # 丙烯基酚（ene 加成物的內烯同型）
ENE_ADDUCT = "CN1C(=O)CC(C=Cc2ccccc2O)C1=O"  # 烯丙基酚與 N-甲基馬來醯亞胺經 ene 反應後的內烯（Ar–CH=CH–CH2–琥珀醯亞胺）
BZ_BPA = "CC(C)(c1ccc2OCN(c3ccccc3)Cc2c1)c1ccc2OCN(c3ccccc3)Cc2c1"  # 雙酚 A 型苯并㗁嗪（BA-a）
BADGE = "CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1"
MEKO_BLOCKED = "CCCCNC(=O)ON=C(C)CC"  # 丁酮肟封端的丁基異氰酸酯
PHENOL_BLOCKED = "CNC(=O)Oc1ccccc1"  # 酚封端（本卡不收）
CAPROLACTAM_BLOCKED = "CNC(=O)N1CCCCCC1=O"  # 己內醯胺封端（本卡不收）
BUTYL_ISOCYANATE = "CCCCN=C=O"


def _comp(i: int, smiles: str) -> dict:
    category = "Catalyst/Initiator" if smiles == AIBN else "Resin"
    return {"id": f"c{i}", "name": f"成分{i}", "canonicalSmiles": smiles, "category": category, "molarMass": 100.0}


def _result(*smiles: str) -> dict:
    return crosslink.analyze_crosslink([_comp(i, s) for i, s in enumerate(smiles)])


def _rule_ids(*smiles: str) -> set[str]:
    return {p["ruleId"] for p in _result(*smiles)["pairs"]}


def _groups(smiles: str) -> dict[str, int]:
    mol = crosslink.parse_structure(smiles)
    return {g["groupId"]: len(g["sites"]) for g in crosslink.find_group_sites(mol, crosslink.load_functional_groups(), False)}


# (規則 id, 命中的配方, 不命中的配方)
CASES = [
    ("maleimide.homopolymerization", (PMI, AIBN), ("O=C1CCC(=O)N1C", AIBN)),
    ("maleimide+propenyl.copolymerization", (PMI, ENE_ADDUCT), (PMI, "C=Cc1ccccc1")),
    ("benzoxazine+epoxy", (BZ_BPA, BADGE), (BZ_BPA, "CCO")),
    ("isocyanate.deblocking.oxime", (MEKO_BLOCKED,), (PHENOL_BLOCKED,)),
]

NEW_RULE_IDS = tuple(c[0] for c in CASES)
NEW_GROUP_IDS = ("alkene.propenyl.aryl", "isocyanate.blocked.oxime")


@pytest.mark.parametrize("rule_id,hit,miss", CASES, ids=[c[0] for c in CASES])
def test_new_rule_hits_and_misses(rule_id: str, hit: tuple[str, ...], miss: tuple[str, ...]) -> None:
    assert rule_id in _rule_ids(*hit)
    assert rule_id not in _rule_ids(*miss)


def test_maleimide_homopolymerization_needs_initiator_and_leaves_old_pairs_alone() -> None:
    """自聚規則由起始劑觸發：沒有起始劑時 BMI＋二胺的配對與 P7-1B 完全相同（不多出自反應配對），第 1 層仍可計算。"""
    assert _rule_ids(PMI) == set() and _rule_ids(BMI) == set()
    assert _rule_ids(BMI, "NCCN") == {"maleimide+amine.primary.aliphatic"}
    assert _rule_ids(BMI, DABPA) == {"maleimide+allyl.ene"}
    kinds = {p["ruleId"]: p["kind"] for p in _result(PMI, AIBN)["pairs"]}
    assert kinds == {"maleimide.homopolymerization": "catalyst"}


def test_new_groups_distinguish_neighbours() -> None:
    assert _groups(ENE_ADDUCT).get("alkene.propenyl.aryl") == 1
    assert _groups(PROPENYL).get("alkene.propenyl.aryl") == 2
    # 烯丙基、苯乙烯（端烯）不是芳基丙烯基型內烯
    assert "alkene.propenyl.aryl" not in _groups(DABPA)
    assert "alkene.propenyl.aryl" not in _groups("C=Cc1ccccc1")
    assert _groups(MEKO_BLOCKED).get("isocyanate.blocked.oxime") == 1
    # 游離異氰酸酯、酚封端、己內醯胺封端都不是肟封端
    for smi in (BUTYL_ISOCYANATE, PHENOL_BLOCKED, CAPROLACTAM_BLOCKED):
        assert "isocyanate.blocked.oxime" not in _groups(smi)
    assert "isocyanate" not in _groups(MEKO_BLOCKED)  # 封端後沒有游離 N=C=O


def test_all_p7_2_rows_are_pending_and_counted() -> None:
    new_groups = [g for g in crosslink.load_functional_groups() if g["id"] in NEW_GROUP_IDS]
    new_rules = [r for r in crosslink.load_reaction_rules() if r["id"] in NEW_RULE_IDS]
    assert len(new_groups) == 2 and len(new_rules) == 4
    assert all(r["review_status"] == "pending" for r in [*new_groups, *new_rules])
    # 四條都是自行撰寫（D22），notes 非空
    assert all(r["source"] == "自行撰寫" and r["notes"] for r in [*new_groups, *new_rules])
    # 資料表總列數：官能基 39、規則 55
    assert len(crosslink.load_functional_groups()) == 39 and len(crosslink.load_reaction_rules()) == 55


# ---- 填入的數值都有出處與適用條件（D67）；不檢查數值對不對 ----

# 本卡填入的單位鍵體積變化（id → 值）與溫度範圍（id → (min, max)）；其餘規則的這兩欄維持原狀
EXPECTED_VOLUME = {
    "acrylate+initiator.thermal": 22.6,
    "acrylate+initiator.photo": 22.6,
    "methacrylate+initiator.thermal": 23.0,
    "methacrylate+initiator.photo": 23.0,
    "thiol+alkene.allyl": 12.6,
    "thiol+vinyl.ether": 12.6,
    "thiol+norbornene": 12.6,
    "epoxy+pag.cationic": 11.0,
}
EXPECTED_TEMPERATURE = {
    "benzoxazine.ring_opening": (160.0, 220.0),
    "benzoxazine+phenol_ring": (160.0, 220.0),
    "isocyanate.deblocking.oxime": (85.0, 260.0),
}
PRE_EXISTING_TEMPERATURE = {"resol.methylol+phenol_ring": (60.0, 100.0)}  # P7-1A，製備條件，不覆蓋


def test_filled_numbers_match_the_card_and_nothing_else_is_filled() -> None:
    rules = {r["id"]: r for r in crosslink.load_reaction_rules()}
    volumes = {k: r["bond_volume_change"] for k, r in rules.items() if r["bond_volume_change"] is not None}
    assert volumes == EXPECTED_VOLUME
    temps = {k: (r["temp_min_c"], r["temp_max_c"]) for k, r in rules.items() if r["temp_min_c"] is not None or r["temp_max_c"] is not None}
    assert temps == {**EXPECTED_TEMPERATURE, **PRE_EXISTING_TEMPERATURE}


@pytest.mark.parametrize("rule_id", sorted({*EXPECTED_VOLUME, *EXPECTED_TEMPERATURE}))
def test_every_filled_number_has_source_and_conditions(rule_id: str) -> None:
    r = {x["id"]: x for x in crosslink.load_reaction_rules()}[rule_id]
    assert r["review_status"] == "pending"
    assert "P7-2（D67）" in r["notes"] and "P7-2（D67）" in r["source_detail"]
    # 出處要有可點開的網址、DOI 或 PMC 編號
    assert any(k in r["source_detail"] for k in ("http", "DOI", "PMC"))
    if r["bond_volume_change"] is not None:
        assert r["bond_volume_change_unit"] and "cm3/mol" in r["bond_volume_change_unit"]
        assert "適用條件" in r["notes"]
    if r["temp_min_c"] is not None:
        assert r["temp_min_c"] <= r["temp_max_c"]
        assert "適用條件" in r["notes"]


def test_light_triggered_rules_keep_temperature_blank() -> None:
    rules = {r["id"]: r for r in crosslink.load_reaction_rules()}
    for rid in ("epoxy+pag.cationic", "oxetane+pag.cationic", "acrylate+initiator.photo", "methacrylate+initiator.photo", "styrene+initiator.photo", "acrylamide+initiator.photo"):
        assert rules[rid]["temp_min_c"] is None and rules[rid]["temp_max_c"] is None


# ---- 第 1 層：四條新規則都回報「尚未支援」與原因，不給數值（未改任何公式） ----


def _prepare(*smiles: str) -> dict:
    result = _result(*smiles)
    comps = [_comp(i, s) for i, s in enumerate(smiles)]
    solid = [{"id": c["id"], "name": c["name"], "canonicalSmiles": c["canonicalSmiles"], "amount": 50.0} for c in comps]
    return layer1.prepare_layer1(result, solid, "g", {c["id"]: 100.0 / len(comps) for c in comps})


@pytest.mark.parametrize("rule_id,hit,_miss", CASES, ids=[c[0] for c in CASES])
def test_layer1_reports_unsupported(rule_id: str, hit: tuple[str, ...], _miss: tuple[str, ...]) -> None:
    assert rule_id in layer1.UNSUPPORTED_RULES
    prep = _prepare(*hit)
    assert prep["ok"] is False
    assert prep["reason"].startswith(layer1.MESSAGE_UNSUPPORTED_SYSTEM) or layer1.MESSAGE_MULTI_RULE in prep["reason"]
    assert "setup" not in prep


def test_unsupported_rule_ids_are_real() -> None:
    rule_ids = {r["id"] for r in crosslink.load_reaction_rules()}
    assert set(layer1.UNSUPPORTED_RULES) <= rule_ids
