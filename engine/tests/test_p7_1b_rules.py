"""任務 P7-1B（D65 B 批）：縮合與加成體系反應規則的單元測試。每個新規則一個命中、一個不命中（第 0 層，用專案的真實資料表）；
第 1 層對不支援的新體系回報原因、對可用現有公式的體系照算；A 批修正（催化劑配對不再顯示「具封端」）。
資料表本身的 should_react／should_not_react 由 TypeScript 的 tests/data 檢查（RDKit.js）。"""

from __future__ import annotations

import pytest

from moleform_core import crosslink, layer1

BADGE = "CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1"
BPA = "CC(C)(c1ccc(O)cc1)c1ccc(O)cc1"
PAG = "c1ccc([S+](c2ccccc2)c2ccccc2)cc1.F[Sb-](F)(F)(F)(F)F"
MDI = "O=C=Nc1ccc(Cc2ccc(N=C=O)cc2)cc1"
BMI = "O=C1C=CC(=O)N1c1ccc(Cc2ccc(N3C(=O)C=CC3=O)cc2)cc1"
HMM = "OCN(CO)c1nc(N(CO)CO)nc(N(CO)CO)n1"  # 六羥甲基三聚氰胺
HMMM = "COCN(COC)c1nc(N(COC)COC)nc(N(COC)COC)n1"  # 六甲氧基甲基三聚氰胺
TEOS = "CCO[Si](OCC)(OCC)OCC"
SILANOL = "C[Si](C)(C)O"
BZ = "CN1COc2ccccc2C1"


def _comp(i: int, smiles: str, category: str = "Resin") -> dict:
    return {"id": f"c{i}", "name": f"成分{i}", "canonicalSmiles": smiles, "category": category, "molarMass": 100.0}


def _rule_ids(*smiles: str) -> set[str]:
    comps = [_comp(i, s) for i, s in enumerate(smiles)]
    return {p["ruleId"] for p in crosslink.analyze_crosslink(comps)["pairs"]}


# (規則 id, 命中的配方, 不命中的配方)
CASES = [
    ("isocyanate+alcohol", (MDI, "OCCO"), (MDI, "Oc1ccccc1")),
    ("isocyanate+phenol", (MDI, BPA), (MDI, "OCCO")),
    ("isocyanate+amine.primary.aliphatic", (MDI, "NCCN"), (MDI, "Nc1ccccc1")),
    ("isocyanate+amine.primary.aromatic", (MDI, "Nc1ccccc1"), (MDI, "CCN")),
    ("isocyanate+amine.secondary.aliphatic", (MDI, "CNC"), (MDI, "CNc1ccccc1")),
    ("isocyanate+amine.secondary.aromatic", (MDI, "CNc1ccccc1"), (MDI, "CNC")),
    ("melamine.methylol+hydroxyl.phenolic", (HMM, BPA), (HMMM, BPA)),
    ("melamine.methylol+hydroxyl.alcohol", (HMM, "OCCO"), (HMMM, "OCCO")),
    ("melamine.methylol+amide.nh", (HMM, "CC(=O)N"), (HMMM, "CC(=O)N")),
    ("melamine.alkoxymethyl+hydroxyl.phenolic", (HMMM, BPA), (HMM, BPA)),
    ("melamine.alkoxymethyl+hydroxyl.alcohol", (HMMM, "OCCO"), (HMM, "CC(=O)N")),
    ("melamine.alkoxymethyl+amide.nh", (HMMM, "CC(=O)N"), (HMM, "CC(=O)N")),
    ("silane.hydrolysis", (TEOS, "O"), (SILANOL, "O")),
    ("silanol.condensation-water", (SILANOL,), (TEOS,)),
    ("silanol+silane.alkoxy", (SILANOL, TEOS), (SILANOL, SILANOL)),
    ("hydrosilylation", ("C[SiH](C)O[SiH](C)C", "C=C[Si](C)(C)C"), ("C[Si](C)(C)C", "C=CCC")),
    ("maleimide+amine.primary.aliphatic", (BMI, "NCCN"), (BMI, "Nc1ccccc1")),
    ("maleimide+amine.primary.aromatic", (BMI, "Nc1ccccc1"), (BMI, "CCN")),
    ("maleimide+amine.secondary.aliphatic", (BMI, "CNC"), (BMI, "CNc1ccccc1")),
    ("maleimide+amine.secondary.aromatic", (BMI, "CNc1ccccc1"), (BMI, "CNC")),
    ("maleimide+allyl.ene", (BMI, "C=CCc1ccccc1O"), (BMI, "C=C[Si](C)(C)C")),
    ("benzoxazine+phenol_ring", (BZ, "Oc1ccccc1"), (BZ, "CCO")),
    ("benzoxazine.ring_opening", (BZ,), ("CN1CCOc2ccccc12",)),
    ("polyamic.imidization", ("CNC(=O)c1ccccc1C(=O)O",), ("O=C1c2ccccc2C(=O)N1c1ccccc1",)),
    ("pbo.cyclization", ("Oc1ccccc1NC(=O)c1ccccc1",), ("c1ccc2oc(nc2c1)-c1ccccc1",)),
]


@pytest.mark.parametrize("rule_id,hit,miss", CASES, ids=[c[0] for c in CASES])
def test_new_rule_hits_and_misses(rule_id: str, hit: tuple[str, ...], miss: tuple[str, ...]) -> None:
    assert rule_id in _rule_ids(*hit)
    assert rule_id not in _rule_ids(*miss)


def test_every_batch_b_rule_has_a_case() -> None:
    b_ids = {c[0] for c in CASES}
    new_rules = {r["id"] for r in crosslink.load_reaction_rules()} - {r for r in _A_RULE_IDS} - set(_C_RULE_IDS)
    assert b_ids == new_rules


# P7-1C（C 批）與 P7-2（D 批，test_p7_2_rules.py）新增的規則與官能基；本檔只管 A、B 批，計數時排除
_C_RULE_IDS = (
    "acrylate+initiator.thermal", "acrylate+initiator.photo", "methacrylate+initiator.thermal", "methacrylate+initiator.photo",
    "acrylamide+initiator.thermal", "acrylamide+initiator.photo", "styrene+initiator.thermal", "styrene+initiator.photo",
    "thiol+alkene.allyl", "thiol+vinyl.ether", "thiol+norbornene", "thiol+acrylate",
    # P7-2
    "maleimide.homopolymerization", "maleimide+propenyl.copolymerization", "benzoxazine+epoxy", "isocyanate.deblocking.oxime",
)
_C_GROUP_IDS = (
    "acrylate", "methacrylate", "acrylamide", "styrene", "vinyl.ether", "norbornene", "thiol", "initiator.thermal", "initiator.photo",
    # P7-2
    "alkene.propenyl.aryl", "isocyanate.blocked.oxime",
)

_A_RULE_IDS = (
    "epoxy+phenol", "epoxy+amine.primary.aliphatic", "epoxy+amine.primary.aromatic", "epoxy+amine.secondary.aliphatic",
    "epoxy+amine.secondary.aromatic", "epoxy+anhydride", "epoxy+cyanate", "cyanate.trimerization", "novolac+hmta",
    "resol.methylol+phenol_ring", "resol.methylol-ether", "resol.methylol-methylene", "epoxy+pag.cationic", "oxetane+pag.cationic",
)


def test_all_batch_b_rows_are_pending() -> None:
    a_groups = {
        "hydroxyl.phenolic", "ether.epoxide", "amine.primary.aliphatic", "amine.primary.aromatic", "amine.secondary.aliphatic",
        "amine.secondary.aromatic", "anhydride", "cyanate.ester", "ether.oxetane", "pag.onium", "aromatic.ch.phenol.ortho_para",
        "hydroxymethyl.phenolic", "hmta",
    }
    new_groups = [g for g in crosslink.load_functional_groups() if g["id"] not in a_groups and g["id"] not in _C_GROUP_IDS]
    new_rules = [r for r in crosslink.load_reaction_rules() if r["id"] not in _A_RULE_IDS and r["id"] not in _C_RULE_IDS]
    assert len(new_groups) == 15 and len(new_rules) == 25
    assert all(r["review_status"] == "pending" for r in [*new_groups, *new_rules])


def test_water_is_not_a_group_of_unrelated_rules() -> None:
    """水只與烷氧基矽烷配對（水解），不會與其他規則配對。"""
    assert _rule_ids(BADGE, "O") == set()
    assert _rule_ids(MDI, "O") == set()


def _prepare(smiles: tuple[str, ...]) -> dict:
    comps = [_comp(i, s) for i, s in enumerate(smiles)]
    result = crosslink.analyze_crosslink(comps)
    solid = [{"id": c["id"], "name": c["name"], "canonicalSmiles": c["canonicalSmiles"], "amount": 50.0} for c in comps]
    return layer1.prepare_layer1(result, solid, "g", {c["id"]: 100.0 / len(comps) for c in comps})


@pytest.mark.parametrize(
    "rule_id,smiles",
    [
        ("silane.hydrolysis", (TEOS, "O")),
        ("silanol.condensation-water", (SILANOL, TEOS)),  # 同配方另有 silanol+silane.alkoxy；回報先遇到的不支援規則
        ("maleimide+allyl.ene", (BMI, "C=CCc1ccccc1O")),
        ("benzoxazine+phenol_ring", (BZ, "Oc1ccccc1")),
        ("polyamic.imidization", ("CNC(=O)c1ccccc1C(=O)O",)),
        ("pbo.cyclization", ("Oc1ccccc1NC(=O)c1ccccc1",)),
    ],
)
def test_layer1_reports_unsupported_batch_b_system_instead_of_numbers(rule_id: str, smiles: tuple[str, ...]) -> None:
    prep = _prepare(smiles)
    assert prep["ok"] is False
    assert prep["reason"].startswith(layer1.MESSAGE_UNSUPPORTED_SYSTEM)
    assert rule_id in prep["reason"]
    assert "setup" not in prep


def test_layer1_supported_batch_b_systems_pass_prepare() -> None:
    """可用現有公式的體系（異氰酸酯＋羥基、矽氫加成、馬來醯亞胺＋胺、三聚氰胺類＋酚）不在不支援清單，prepare 通過。"""
    for smiles in ((MDI, BPA), ("C[SiH](C)O[SiH](C)C", "C=C[Si](C)(C)C"), (BMI, "NCCN"), (HMMM, BPA)):
        prep = _prepare(smiles)
        assert prep["ok"] is True, (smiles, prep.get("reason"))
    for rule_id in ("isocyanate+alcohol", "isocyanate+phenol", "hydrosilylation", "maleimide+amine.primary.aliphatic", "melamine.alkoxymethyl+hydroxyl.phenolic"):
        assert rule_id not in layer1.UNSUPPORTED_RULES


def test_unsupported_rule_ids_are_real_and_cover_all_batch_b_unsupported() -> None:
    rule_ids = {r["id"] for r in crosslink.load_reaction_rules()}
    assert set(layer1.UNSUPPORTED_RULES) <= rule_ids
    for rule_id in ("silane.hydrolysis", "silanol.condensation-water", "silanol+silane.alkoxy", "maleimide+allyl.ene", "benzoxazine+phenol_ring", "benzoxazine.ring_opening", "polyamic.imidization", "pbo.cyclization"):
        assert rule_id in layer1.UNSUPPORTED_RULES


# ---- A 批修正 1：催化劑（光酸產生劑）配對不再顯示「具封端」 ----


def test_pag_pair_is_labelled_catalyst_not_capping() -> None:
    result = crosslink.analyze_crosslink([_comp(0, BADGE), _comp(1, PAG, "Catalyst/Initiator")])
    kinds = {p["ruleId"]: p["kind"] for p in result["pairs"]}
    assert kinds == {"epoxy+pag.cationic": "catalyst"}
    assert crosslink.PAIR_KIND_LABEL["catalyst"] == "催化劑配對（不計當量）"
    assert "封端" not in crosslink.PAIR_KIND_LABEL[kinds["epoxy+pag.cationic"]]
    assert result["verdict"] == "catalyst"
    assert "封端" not in crosslink.VERDICT_LABEL[result["verdict"]]


def test_pag_does_not_change_verdict_of_a_real_reaction() -> None:
    """環氧＋雙酚 A（鏈延長）＋ PAG：PAG 的配對是催化劑配對，配方判定仍由環氧＋酚決定。"""
    result = crosslink.analyze_crosslink([_comp(0, BADGE), _comp(1, BPA), _comp(2, PAG, "Catalyst/Initiator")])
    kinds = {p["ruleId"]: p["kind"] for p in result["pairs"]}
    assert kinds["epoxy+phenol"] == "chain"
    assert kinds["epoxy+pag.cationic"] == "catalyst"
    assert result["verdict"] == "chain"


def test_pag_pair_layer1_still_unsupported() -> None:
    prep = _prepare((BADGE, PAG))
    assert prep["ok"] is False
    assert prep["reason"].startswith(layer1.MESSAGE_UNSUPPORTED_SYSTEM)
    assert "epoxy+pag.cationic" in prep["reason"]


def test_judge_formulation_catalyst_only_when_nothing_else() -> None:
    assert crosslink.judge_formulation(["catalyst"]) == "catalyst"
    assert crosslink.judge_formulation(["catalyst", "network"]) == "network"
    assert crosslink.judge_formulation(["catalyst", "capping"]) == "capping"
    assert crosslink.judge_formulation([]) == "none"
