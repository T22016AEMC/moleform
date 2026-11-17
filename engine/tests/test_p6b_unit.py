"""任務 P6B 的最少單元測試：端點可用、缺基團回報、crystallizable = false 回「不適用」、RH 不在表內時拒絕，
加上 D22 要求的資料表 SMARTS 正反例與位置值／Table 6.10 的謄錄交叉核對。不做反向驗證、不加邊界探針。
書的算例對照在 docs/verification/phase6-Tm-Td-吸濕-彈性模數-輸出.md（驗證只做一次，不在這裡重做）。
"""

from __future__ import annotations

import os
import sys

import pytest
from rdkit import Chem

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import moleform_engine as engine  # noqa: E402
from moleform_core import tg, y_tables  # noqa: E402

PE = "[*:1]CC[*:2]"
NYLON66 = "[*:1]C(=O)NCCCCCCNC(=O)CCCC[*:2]"
PET_CUT = "[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]"
PS = "[*:1]CC([*:2])c1ccccc1"
KETONE = "[*:1]CC(=O)CC[*:2]"
ALIPHATIC_ESTER = "[*:1]CCCCOC(=O)CC[*:2]"


def test_tables_load_and_sources_present() -> None:
    assert len(y_tables.load_ym_rows()) > 0
    assert len(y_tables.load_yd_rows()) > 0
    assert len(y_tables.load_water_groups()) > 0
    assert len(y_tables.load_side_chain()) == 5
    for r in (*y_tables.load_ym_rows(), *y_tables.load_yd_rows()):
        assert "Table" in r.source and "頁" in r.source
        assert r.audit.startswith("待使用者審")


def test_smarts_positive_and_negative_examples() -> None:
    """D22：每條 SMARTS 的正例要命中、反例不得命中。"""
    for r in (*y_tables.load_ym_rows(), *y_tables.load_yd_rows()):
        if r.smarts == "":
            continue
        q = Chem.MolFromSmarts(r.smarts)
        assert q is not None, r.id
        for p in r.positives:
            assert Chem.MolFromSmiles(p).HasSubstructMatch(q), (r.id, p)
        for n in r.negatives:
            assert not Chem.MolFromSmiles(n).HasSubstructMatch(q), (r.id, n)
    for w in y_tables.load_water_groups():
        q = Chem.MolFromSmarts(w.smarts)
        assert q is not None, w.id
        assert all(Chem.MolFromSmiles(p).HasSubstructMatch(q) for p in w.positives), w.id
        assert not any(Chem.MolFromSmiles(n).HasSubstructMatch(q) for n in w.negatives), w.id


def test_shared_groups_reuse_yg_partition() -> None:
    """Appendix II：與 Yg 重疊的基團沿用 Yg 表的 SMARTS（Ym、Yd 表的 SMARTS 與 Yg 表同名家族相同）。"""
    yg = {tg.yg_family_id(r): r.smarts for r in tg.load_yg_groups()}
    shared = 0
    for r in (*y_tables.load_ym_rows(), *y_tables.load_yd_rows()):
        fid = tg.yg_family_id(tg.YgGroupRow(r.id, "", "", 0.0, 0.0, False, r.state, "", "", r.condition, "", "", (), (), ""))
        if r.smarts != "" and fid in yg:
            shared += 1
            assert r.smarts == yg[fid], r.id
    assert shared > 30


def test_ch2_position_values_reproduce_table_610() -> None:
    """謄錄交叉核對：位置值（α／β／γ／δ）逐列加總 = Table 6.10 的 m = 1 欄；m = 0 欄 = 5.7 × N。"""
    seq = y_tables.load_ch2_sequence()
    pos = seq.position_values
    assert len(seq.table_610) == 20
    for n, m0, m1 in seq.table_610:
        total = 0.0
        for i in range(1, n + 1):
            d = min(i, n + 1 - i)
            total += pos[min(d, 5) - 1] if d < 5 else pos[4]
        assert total == pytest.approx(m1, abs=0.051), n
        assert m0 == pytest.approx(5.7 * n, abs=0.051), n


def test_tm_ok_and_sources() -> None:
    code, body = engine.handle_tm({"smiles": PE, "crystallizable": True})
    assert code == 200 and body["ok"] is True
    assert body["quantity"]["status"] == "predicted" and body["quantity"]["unit"] == "K"
    assert body["quantity"]["value"] == pytest.approx(407.1, abs=0.1)
    assert body["warnings"] == []
    # 未提供 crystallizable：照算並警告
    code, body = engine.handle_tm({"smiles": PE})
    assert code == 200 and body["quantity"]["status"] == "predicted"
    assert any("可結晶" in w for w in body["warnings"])


def test_tm_not_applicable_when_not_crystallizable() -> None:
    code, body = engine.handle_tm({"smiles": PE, "crystallizable": False})
    assert code == 200
    assert body["quantity"]["value"] is None and body["quantity"]["status"] == "missing"
    assert body["notApplicable"] is True and "不適用" in body["message"]


def test_tm_td_report_missing_groups() -> None:
    # –C(=O)–（al／ar 書中沒有定義）→ Tm 缺基團；Table 21.2 的 –C(=O)–O– 有兩個值卻沒說明條件 → Td 缺基團
    code, body = engine.handle_tm({"smiles": KETONE})
    assert code == 200 and body["quantity"]["status"] == "missing"
    assert len(body["missing"]) > 0
    code, body = engine.handle_td({"smiles": ALIPHATIC_ESTER})
    assert code == 200 and body["quantity"]["status"] == "missing"
    assert len(body["missing"]) > 0


def test_td_ok_reports_half_decomposition_note() -> None:
    code, body = engine.handle_td({"smiles": PS})
    assert code == 200 and body["quantity"]["status"] == "predicted"
    assert body["quantity"]["value"] == pytest.approx(633.7, abs=0.1)
    assert body["tdC"] == pytest.approx(body["quantity"]["value"] - 273.15)
    assert "Td5" in body["notes"]


def test_moisture_ok_with_crystallinity_and_rh_must_be_in_table() -> None:
    code, body = engine.handle_moisture({"smiles": NYLON66, "rh": 0.7, "crystallinity": 0.7})
    assert code == 200 and body["quantity"]["status"] == "predicted"
    assert body["amorphousValue"] == pytest.approx(12.0, abs=0.2)
    assert body["quantity"]["value"] == pytest.approx(3.6, abs=0.1)
    assert body["uncovered"] == []
    for bad in (0.6, 0, 1.1, "0.7", None):
        code, body = engine.handle_moisture({"smiles": NYLON66, "rh": bad})
        assert code == 400 and body["ok"] is False


def test_moisture_lists_uncovered_groups() -> None:
    # 碳酸酯基不在 Table 18.14：視為無貢獻但要列出並警告
    code, body = engine.handle_moisture({"smiles": "[*:1]Oc1ccc(cc1)C(C)(C)c1ccc(cc1)OC(=O)[*:2]", "rh": 0.5})
    assert code == 200
    assert len(body["uncovered"]) > 0
    assert any("未涵蓋" in w or "不在 Table 18.14" in w for w in body["warnings"])


# 彈性模數的測試在 test_p6e_unit.py（任務 P6E 補完；P6B 時 /modulus 只回報缺什麼）


def test_invalid_smiles_rejected() -> None:
    for handler in (engine.handle_tm, engine.handle_td, engine.handle_modulus):
        assert handler({"smiles": "C(("})[0] == 400
        assert handler({"smiles": "  "})[0] == 400
    assert engine.handle_moisture({"smiles": "C((", "rh": 0.5})[0] == 400


def test_routes_registered() -> None:
    for path in ("/tm", "/td", "/moisture", "/modulus"):
        assert path in engine.POST_ROUTES


def test_td_uses_user_decided_interpretations() -> None:
    """使用者 2026-11-17 的指定：夾在兩個芳香環間的 –C(CH3)2– 用第三個值 35；–C(=O)NH– 用 32.5（依書 Table 21.3 算例）。"""
    code, body = engine.handle_td({"smiles": "[*:1]C(=O)NCCCCC[*:2]"})
    assert code == 200 and body["quantity"]["status"] == "predicted"
    assert body["sumYd"] == pytest.approx(80.0)
    code, body = engine.handle_td({"smiles": "[*:1]c1ccc(cc1)C(C)(C)c1ccc(cc1)OC(=O)O[*:2]"})
    assert code == 200 and body["sumYd"] == pytest.approx(173.0)
