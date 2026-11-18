"""任務 P7-1A（D65）：反應規則 A 批的單元測試。每個新規則一個命中、一個不命中（第 0 層，用專案的真實資料表）；
第 1 層遇到不支援的體系回報原因而不是數值；酚醛各類型的酚羥基與鄰／對位空位命中；不支援清單的規則 id 都真實存在（I05 起清單只在 Python）。
資料表本身的 should_react／should_not_react 由 TypeScript 的 tests/data 檢查（RDKit.js）。"""

from __future__ import annotations

import pytest

from moleform_core import crosslink, layer1

BADGE = "CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1"
BADCY = "CC(C)(c1ccc(OC#N)cc1)c1ccc(OC#N)cc1"
HMTA = "C1N2CN3CN1CN(C2)C3"
PAG = "c1ccc([S+](c2ccccc2)c2ccccc2)cc1.F[Sb-](F)(F)(F)(F)F"
HMP = "OCc1ccccc1O"  # 2-羥甲基酚（可溶酚醛的羥甲基酚）


def _comp(i: int, smiles: str, category: str = "Resin") -> dict:
    return {"id": f"c{i}", "name": f"成分{i}", "canonicalSmiles": smiles, "category": category, "molarMass": 100.0}


def _rule_ids(*smiles: str) -> set[str]:
    comps = [_comp(i, s) for i, s in enumerate(smiles)]
    return {p["ruleId"] for p in crosslink.analyze_crosslink(comps)["pairs"]}


# (規則 id, 命中的配方, 不命中的配方)
CASES = [
    ("epoxy+amine.primary.aliphatic", (BADGE, "NCCN"), (BADGE, "Nc1ccccc1")),
    ("epoxy+amine.primary.aromatic", (BADGE, "Nc1ccccc1"), (BADGE, "CCN")),
    ("epoxy+amine.secondary.aliphatic", (BADGE, "CNC"), (BADGE, "CNc1ccccc1")),
    ("epoxy+amine.secondary.aromatic", (BADGE, "CNc1ccccc1"), (BADGE, "CNC")),
    ("epoxy+anhydride", (BADGE, "O=C1OC(=O)c2ccccc12"), (BADGE, "CC(=O)OC")),
    ("epoxy+cyanate", (BADGE, BADCY), (BADGE, "N#Cc1ccccc1")),
    ("cyanate.trimerization", (BADCY,), ("N#Cc1ccccc1",)),
    ("novolac+hmta", ("Oc1ccc(Cc2ccccc2O)cc1", HMTA), ("Cc1cc(C)c(O)c(C)c1", HMTA)),
    ("resol.methylol+phenol_ring", (HMP,), ("OCc1ccccc1",)),
    ("resol.methylol-ether", (HMP,), ("OCc1ccccc1",)),
    ("resol.methylol-methylene", (HMP,), ("OCc1ccccc1",)),
    ("epoxy+pag.cationic", (BADGE, PAG), (BADGE, "C[N+](C)(C)C")),
    ("oxetane+pag.cationic", ("CCC1(CO)COC1", PAG), ("C1CCOC1", PAG)),
]


@pytest.mark.parametrize("rule_id,hit,miss", CASES, ids=[c[0] for c in CASES])
def test_new_rule_hits_and_misses(rule_id: str, hit: tuple[str, ...], miss: tuple[str, ...]) -> None:
    assert rule_id in _rule_ids(*hit)
    assert rule_id not in _rule_ids(*miss)


def test_cationic_rules_do_not_touch_plain_epoxy_formulations() -> None:
    """陽離子規則只在配方含 PAG 時配對：環氧＋酚醛（4A、4B 類）仍只有 epoxy+phenol 一條規則。"""
    assert _rule_ids(BADGE, "CC(C)(c1ccc(O)cc1)c1ccc(O)cc1") == {"epoxy+phenol"}


def test_all_new_rows_are_pending() -> None:
    # P7-1B 起資料表含 B 批的 15 個官能基與 25 條規則（B 批另有 test_p7_1b_rules.py）、P7-1C 起含 C 批的 9 個官能基與 12 條規則
    # （test_p7_1c_rules.py）；這裡計 A + B + C 全部新列
    new_groups = [g for g in crosslink.load_functional_groups() if g["id"] not in ("hydroxyl.phenolic", "ether.epoxide")]
    new_rules = [r for r in crosslink.load_reaction_rules() if r["id"] != "epoxy+phenol"]
    assert len(new_groups) == 11 + 15 + 9 and len(new_rules) == 13 + 25 + 12
    assert all(r["review_status"] == "pending" for r in [*new_groups, *new_rules])


# 酚醛各類型：酚羥基命中（epoxy+phenol 可配對）、鄰／對位空位有無的正反例
PHENOLICS = {
    "酚醛清漆寡聚物": ("Oc1ccc(Cc2ccc(O)c(Cc3ccccc3O)c2)cc1", True),
    "可溶酚醛（含羥甲基）": ("Oc1c(CO)cc(C)cc1", True),
    "鄰甲酚": ("Cc1ccccc1O", True),
    "雙酚 A": ("CC(C)(c1ccc(O)cc1)c1ccc(O)cc1", True),
    "聯苯芳烷基酚": ("Oc1ccc(Cc2ccc(cc2)-c2ccc(Cc3ccccc3O)cc2)cc1", True),
    "雙環戊二烯改質酚": ("Oc1ccc(cc1)C1CC2C3CC=CC3C2C1", True),
    "三位全取代的酚（無空位）": ("Cc1cc(C)c(O)c(C)c1", False),
}


@pytest.mark.parametrize("name", list(PHENOLICS))
def test_phenolic_types_match_hydroxyl_and_vacancy(name: str) -> None:
    smiles, has_vacancy = PHENOLICS[name]
    mol = crosslink.parse_structure(smiles)
    found = {g["groupId"]: len(g["sites"]) for g in crosslink.find_group_sites(mol, crosslink.load_functional_groups(), False)}
    assert found.get("hydroxyl.phenolic", 0) >= 1
    assert ("aromatic.ch.phenol.ortho_para" in found) is has_vacancy
    assert _rule_ids(BADGE, smiles) >= {"epoxy+phenol"}


def test_layer1_reports_unsupported_system_instead_of_numbers() -> None:
    """環氧＋酸酐（多步、鏈增長）：第 1 層回報「尚未支援」與原因，不給數值（卡 P7-1A 第 5 步）。"""
    comps = [_comp(0, BADGE), _comp(1, "O=C1OC(=O)c2ccccc12")]
    result = crosslink.analyze_crosslink(comps)
    solid = [{"id": c["id"], "name": c["name"], "canonicalSmiles": c["canonicalSmiles"], "amount": 50.0} for c in comps]
    prep = layer1.prepare_layer1(result, solid, "g", {c["id"]: 50.0 for c in comps})
    assert prep["ok"] is False
    assert prep["reason"].startswith(layer1.MESSAGE_UNSUPPORTED_SYSTEM)
    assert "epoxy+anhydride" in prep["reason"]
    assert "setup" not in prep


def test_unsupported_rules_are_real_rule_ids_and_exclude_epoxy_amine() -> None:
    # I05：清單只在 Python（TypeScript 側的同一份清單已退役）
    rule_ids = {r["id"] for r in crosslink.load_reaction_rules()}
    assert set(layer1.UNSUPPORTED_RULES) <= rule_ids
    # 單一步驟兩類官能基配對的新規則（環氧＋胺）仍由第 1 層計算
    assert not any(k.startswith("epoxy+amine") for k in layer1.UNSUPPORTED_RULES)
