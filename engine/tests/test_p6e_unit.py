"""任務 P6E 的最少單元測試：端點可用、缺基團回報、U_H 缺時 G／E 回報 missing 但 K 仍輸出，
加上 D22 要求的資料表 SMARTS 正反例。不做反向驗證、不加邊界探針。書的算例對照在
docs/verification/phase6-Tm-Td-吸濕-彈性模數-輸出.md（驗證只做一次，不在這裡重做）。
"""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import moleform_engine as engine  # noqa: E402
from moleform_core import modulus_tables as mt  # noqa: E402
from moleform_core import tg  # noqa: E402
from moleform_core.mol_graph import mol_from_smiles  # noqa: E402

PE = "[*:1]CC[*:2]"
PC = "[*:1]c1ccc(cc1)C(C)(C)c1ccc(cc1)OC(=O)O[*:2]"
SILOXANE = "[*:1]O[Si](C)(C)O[*:2]"  # –Si(CH3)2– 書中沒有 U_H
CHAIN_WITH_BORON = "[*:1]CB(C)C[*:2]"  # B 不在 Table 14.4


def test_modulus_endpoint_available_and_example_13_1() -> None:
    code, body = engine.handle_modulus({"smiles": PE, "density": 0.95, "crystallinity": 0.7})
    assert code == 200 and body["ok"] is True
    assert body["quantity"]["status"] == "predicted" and body["quantity"]["unit"] == "GPa"
    rao, _, tobolsky = body["methods"]
    assert rao["value"] == pytest.approx(4.3, abs=0.05)  # Example 13.1 方法一
    assert tobolsky["value"] == pytest.approx(3.8, abs=0.05)  # Example 13.1 方法三
    assert body["moduli"]["bulk"]["basis"].startswith("平均")


def test_example_13_2_pc_all_moduli() -> None:
    code, body = engine.handle_modulus({"smiles": PC, "density": 254.28 / 212.0})
    assert code == 200
    m = body["moduli"]
    assert m["bulk"]["value"] == pytest.approx(5.23, abs=0.02)
    assert m["shear"]["value"] == pytest.approx(1.24, abs=0.02)
    assert m["poisson"]["value"] == pytest.approx(0.39, abs=0.005)
    assert m["bulk"]["basis"].startswith("單一方法")  # 方法三對這個分子沒有可對應的基團
    assert body["methods"][2]["status"] == "missing"
    assert [x["id"] for x in body["methods"]] == ["rao", "gruneisen", "gruneisen-tobolsky"]
    assert body["methods"][1]["status"] == "not_implemented"


def test_missing_groups_reported() -> None:
    code, body = engine.handle_modulus({"smiles": CHAIN_WITH_BORON, "density": 1.0})
    assert code == 200
    assert body["quantity"]["status"] == "missing" and body["quantity"]["value"] is None
    rao = body["methods"][0]
    assert rao["status"] == "missing" and len(rao["missing"]) > 0
    assert body["moduli"]["bulk"]["reason"]


def test_missing_uh_keeps_k_but_not_g_and_e() -> None:
    code, body = engine.handle_modulus({"smiles": SILOXANE, "density": 1.0})
    assert code == 200
    m = body["moduli"]
    assert m["bulk"]["status"] == "predicted" and m["bulk"]["value"] is not None
    for key in ("shear", "poisson", "young"):
        assert m[key]["status"] == "missing" and m[key]["value"] is None
    assert "U_H" in m["shear"]["reason"]


def test_bad_inputs_rejected() -> None:
    assert engine.handle_modulus({"smiles": "C(("})[0] == 400
    assert engine.handle_modulus({"smiles": PE, "density": -1})[0] == 400
    assert engine.handle_modulus({"smiles": PE, "crystallinity": 1.5})[0] == 400
    assert "/modulus" in engine.POST_ROUTES


def test_p6e_tables_smarts_positive_and_negative() -> None:
    """D22：每條 SMARTS 的正例要命中、反例不得命中；每列有表號與頁碼、稽核狀態「待使用者審」。"""
    tables = (
        [r for r in mt.load_rao_rows() if r.usable()],
        list(mt.load_ecoh_rows()),
        list(mt.load_hm_rows()),
    )
    for rows in tables:
        for r in rows:
            q = tg.must_query(r.smarts)
            assert "頁" in r.source and "Table" in r.source and r.audit.startswith("待使用者審"), r.id
            for s in r.positives:
                m = mol_from_smiles(s)
                assert m is not None and tg.all_matches(m, q), f"{r.id} 正例未命中：{s}"
            for s in r.negatives:
                m = mol_from_smiles(s)
                assert m is not None and not tg.all_matches(m, q), f"{r.id} 反例命中：{s}"
    assert all(r.uh is None or r.uh_tentative for r in mt.load_rao_rows())
