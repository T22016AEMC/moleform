"""任務 P7-1C（D65 C 批）：自由基體系反應規則（壓克力／甲基丙烯酸酯、硫醇–烯）的單元測試。每個新規則一個命中、一個不命中（第 0 層，用專案的真實資料表）；
第 1 層對鏈增長體系回報原因、不給數值，對可用現有公式的硫醇–烯照算；起始劑用催化劑配對表示法；含環氧的丙烯酸酯同時命中兩種官能基。
資料表本身的 should_match／should_not_match、should_react／should_not_react 由 TypeScript 的 tests/data 檢查（RDKit.js）。"""

from __future__ import annotations

import pytest

from moleform_core import crosslink, layer1

AIBN = "CC(C)(C#N)N=NC(C)(C)C#N"
IRG184 = "O=C(c1ccccc1)C1(O)CCCCC1"  # 1-羥基環己基苯基酮（McGrath 2006 的光起始劑）
ACR = "C=CC(=O)OC"
TMPTA = "C=CC(=O)OCC(CC)(COC(=O)C=C)COC(=O)C=C"
MMA = "CC(=C)C(=O)OC"
GMA = "CC(=C)C(=O)OCC1CO1"
AAM = "C=CC(=O)N"
STY = "C=Cc1ccccc1"
PETMP = "O=C(CCS)OCC(COC(=O)CCS)(COC(=O)CCS)COC(=O)CCS"  # 四（3-巰基丙酸）季戊四醇酯（規則測試分子）
DABPA = "CC(C)(c1ccc(O)c(CC=C)c1)c1ccc(O)c(CC=C)c1"  # 二烯丙基雙酚 A（docs/verification 已有）
DVE = "C=COCCOCCOC=C"
NB2 = "O=C(OCCOC(=O)C1CC2CC1C=C2)C1CC2CC1C=C2"
BADGE = "CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1"
BPA = "CC(C)(c1ccc(O)cc1)c1ccc(O)cc1"


def _comp(i: int, smiles: str, category: str = "Resin") -> dict:
    return {"id": f"c{i}", "name": f"成分{i}", "canonicalSmiles": smiles, "category": category, "molarMass": 100.0}


def _result(*smiles: str) -> dict:
    comps = [_comp(i, s, "Catalyst/Initiator" if s in (AIBN, IRG184) else "Resin") for i, s in enumerate(smiles)]
    return crosslink.analyze_crosslink(comps)


def _rule_ids(*smiles: str) -> set[str]:
    return {p["ruleId"] for p in _result(*smiles)["pairs"]}


def _groups(smiles: str) -> dict[str, int]:
    mol = crosslink.parse_structure(smiles)
    return {g["groupId"]: len(g["sites"]) for g in crosslink.find_group_sites(mol, crosslink.load_functional_groups(), False)}


# (規則 id, 命中的配方, 不命中的配方)
CASES = [
    ("acrylate+initiator.thermal", (ACR, AIBN), (MMA, AIBN)),
    ("acrylate+initiator.photo", (ACR, IRG184), (MMA, IRG184)),
    ("methacrylate+initiator.thermal", (MMA, AIBN), (ACR, AIBN)),
    ("methacrylate+initiator.photo", (MMA, IRG184), (ACR, IRG184)),
    ("acrylamide+initiator.thermal", (AAM, AIBN), (ACR, AIBN)),
    ("acrylamide+initiator.photo", (AAM, IRG184), (MMA, IRG184)),
    ("styrene+initiator.thermal", (STY, AIBN), (ACR, AIBN)),
    ("styrene+initiator.photo", (STY, IRG184), (ACR, IRG184)),
    ("thiol+alkene.allyl", (PETMP, DABPA), (PETMP, "C=C[Si](C)(C)C")),
    ("thiol+vinyl.ether", (PETMP, DVE), (PETMP, "CC(=O)OC=C")),
    ("thiol+norbornene", (PETMP, NB2), (PETMP, "C1CC2CCC1C2")),
    ("thiol+acrylate", (PETMP, ACR), (PETMP, MMA)),
]


@pytest.mark.parametrize("rule_id,hit,miss", CASES, ids=[c[0] for c in CASES])
def test_new_rule_hits_and_misses(rule_id: str, hit: tuple[str, ...], miss: tuple[str, ...]) -> None:
    assert rule_id in _rule_ids(*hit)
    assert rule_id not in _rule_ids(*miss)


def test_no_initiator_no_chain_growth_pair() -> None:
    """單體沒有起始劑時沒有鏈增長配對（起始劑只是觸發條件）。"""
    assert _rule_ids(ACR) == set()
    assert _rule_ids(TMPTA, MMA, AAM, STY) == set()


def test_all_batch_c_rows_are_pending_and_counted() -> None:
    from_c_groups = {"acrylate", "methacrylate", "acrylamide", "styrene", "vinyl.ether", "norbornene", "thiol", "initiator.thermal", "initiator.photo"}
    new_groups = [g for g in crosslink.load_functional_groups() if g["id"] in from_c_groups]
    new_rules = [r for r in crosslink.load_reaction_rules() if r["id"] in {c[0] for c in CASES}]
    assert len(new_groups) == 9 and len(new_rules) == 12
    assert all(r["review_status"] == "pending" for r in [*new_groups, *new_rules])
    # 數值欄全留空（本機文獻找不到可引用的範圍或單位鍵體積變化）
    assert all(r["temp_min_c"] is None and r["temp_max_c"] is None and r["bond_volume_change"] is None for r in new_rules)


# ---- 官能基區分：丙烯酸酯／甲基丙烯酸酯／丙烯醯胺／苯乙烯／乙烯基醚／烯丙基／降冰片烯／硫醇與硫醚 ----


@pytest.mark.parametrize(
    "smiles,expected",
    [
        (ACR, {"acrylate": 1}),
        (TMPTA, {"acrylate": 3}),
        (MMA, {"methacrylate": 1}),
        (AAM, {"acrylamide": 1, "amide.nh": 1}),
        (STY, {"styrene": 1, "alkene.terminal": 1}),
        ("C=COCC", {"vinyl.ether": 1}),
        ("C=CCOC", {"alkene.allyl": 1, "alkene.terminal": 1}),
        ("C1=CC2CCC1C2", {"norbornene": 1}),
        ("CCS", {"thiol": 1}),
        ("CSC", {}),  # 硫醚不是硫醇
    ],
)
def test_groups_are_distinguished(smiles: str, expected: dict[str, int]) -> None:
    c_groups = {"acrylate", "methacrylate", "acrylamide", "styrene", "vinyl.ether", "norbornene", "thiol", "alkene.allyl", "alkene.terminal", "amide.nh"}
    found = {k: v for k, v in _groups(smiles).items() if k in c_groups}
    assert found == expected


def test_acrylate_and_methacrylate_do_not_overlap() -> None:
    assert "methacrylate" not in _groups(ACR) and "acrylate" not in _groups(MMA)
    assert "acrylate" not in _groups("C=CC(=O)NC") and "acrylamide" not in _groups(ACR)


def test_epoxy_acrylate_hits_both_groups_without_cross_rule() -> None:
    """含環氧的（甲基）丙烯酸酯同一分子命中兩種官能基；只做官能基命中，沒有跨體系規則。"""
    assert {"methacrylate", "ether.epoxide"} <= set(_groups(GMA))
    assert {"acrylate", "ether.epoxide"} <= set(_groups("C=CC(=O)OCC1CO1"))
    assert _rule_ids(GMA) == set()  # 單獨一個分子沒有配對
    assert _rule_ids(GMA, BPA) == {"epoxy+phenol"}  # 環氧照 A 批規則配對；甲基丙烯酸酯沒有起始劑，不配對


# ---- 催化劑配對（起始劑不計當量） ----


@pytest.mark.parametrize("monomer,initiator,rule_id", [(ACR, AIBN, "acrylate+initiator.thermal"), (MMA, IRG184, "methacrylate+initiator.photo")])
def test_initiator_pair_is_labelled_catalyst(monomer: str, initiator: str, rule_id: str) -> None:
    result = _result(monomer, initiator)
    kinds = {p["ruleId"]: p["kind"] for p in result["pairs"]}
    assert kinds[rule_id] == "catalyst"
    assert crosslink.PAIR_KIND_LABEL["catalyst"] == "催化劑配對（不計當量）"
    assert result["verdict"] == "catalyst"


def test_initiator_does_not_change_verdict_of_thiol_ene_pair() -> None:
    result = _result(PETMP, DABPA, AIBN)
    kinds = {p["ruleId"]: p["kind"] for p in result["pairs"]}
    assert kinds == {"thiol+alkene.allyl": "network"}  # 起始劑沒有配對，PETMP f = 4、DABPA f = 2
    assert result["verdict"] == "network"
    assert result["pairs"][0]["catalyst"]["status"] == "present"


# ---- 第 1 層 ----


def _prepare(*smiles: str) -> dict:
    result = _result(*smiles)
    comps = [_comp(i, s) for i, s in enumerate(smiles)]
    solid = [{"id": c["id"], "name": c["name"], "canonicalSmiles": c["canonicalSmiles"], "amount": 50.0} for c in comps]
    return layer1.prepare_layer1(result, solid, "g", {c["id"]: 100.0 / len(comps) for c in comps})


@pytest.mark.parametrize(
    "rule_id,smiles",
    [
        ("acrylate+initiator.thermal", (TMPTA, AIBN)),
        ("methacrylate+initiator.photo", (MMA, IRG184)),
        ("styrene+initiator.thermal", (STY, AIBN)),
        ("thiol+acrylate", (PETMP, TMPTA)),
    ],
)
def test_layer1_reports_unsupported_chain_growth_instead_of_numbers(rule_id: str, smiles: tuple[str, ...]) -> None:
    prep = _prepare(*smiles)
    assert prep["ok"] is False
    assert prep["reason"].startswith(layer1.MESSAGE_UNSUPPORTED_SYSTEM)
    assert rule_id in prep["reason"]
    assert "setup" not in prep


def test_layer1_thiol_ene_step_growth_systems_pass_prepare() -> None:
    """硫醇＋烯丙基、乙烯基醚、降冰片烯是 1:1 等活性逐步加成，不在不支援清單，prepare 通過並照現有公式給出第 1 層輸入。"""
    for rule_id, smiles in (("thiol+alkene.allyl", (PETMP, DABPA)), ("thiol+vinyl.ether", (PETMP, DVE)), ("thiol+norbornene", (PETMP, NB2))):
        assert rule_id not in layer1.UNSUPPORTED_RULES
        prep = _prepare(*smiles)
        assert prep["ok"] is True, (rule_id, prep.get("reason"))
        assert "setup" in prep


def test_unsupported_rule_ids_are_real_and_cover_all_chain_growth() -> None:
    rule_ids = {r["id"] for r in crosslink.load_reaction_rules()}
    assert set(layer1.UNSUPPORTED_RULES) <= rule_ids
    for rule_id in ("acrylate+initiator.thermal", "acrylate+initiator.photo", "methacrylate+initiator.thermal", "methacrylate+initiator.photo",
                    "acrylamide+initiator.thermal", "acrylamide+initiator.photo", "styrene+initiator.thermal", "styrene+initiator.photo", "thiol+acrylate"):
        assert rule_id in layer1.UNSUPPORTED_RULES
    for rule_id in ("thiol+alkene.allyl", "thiol+vinyl.ether", "thiol+norbornene"):
        assert rule_id not in layer1.UNSUPPORTED_RULES


def test_epoxy_formulations_are_unchanged_by_batch_c() -> None:
    """既有體系不受 C 批影響：環氧＋雙酚 A 仍是單一規則、第 1 層可算。"""
    assert _rule_ids(BADGE, BPA) == {"epoxy+phenol"}
    assert _prepare(BADGE, BPA)["ok"] is True
