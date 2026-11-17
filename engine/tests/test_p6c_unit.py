"""任務 P6C 的最少單元測試。

1. 公式測試覆蓋盤點（docs/verification/phase6-公式測試覆蓋.md）找到的缺口：Tm 長側鏈式 6.22–6.24、Td 的共軛值（c）——
   手算值與算式寫在測試裡，數值取自 src/data 的資料表（Table 6.9、Table 21.2）。
2. engine/scripts/compare_measured.py：實測值不得進入任何計算（D02）、用途為「校準」的列不併入驗證誤差。
不做反向驗證、不加邊界探針。
"""

from __future__ import annotations

import os
import sys

import pytest

ENGINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ENGINE_DIR)
sys.path.insert(0, os.path.join(ENGINE_DIR, "scripts"))

import compare_measured as cm  # noqa: E402
import moleform_engine as engine  # noqa: E402


def _tm(smiles: str) -> dict:
    code, body = engine.handle_tm({"smiles": smiles, "crystallizable": True})
    assert code == 200 and body["quantity"]["status"] == "predicted", body
    return body


def test_tm_side_chain_eq_622_to_624_hand_calc() -> None:
    """Table 6.9 聚烯烴系列：Ymo = 18.7、Ym5 = 26.3、Mo = 42.0（ym_side_chain.csv S1）；M = Mo + N × 14.0。"""
    # N = 1（聚丁烯，側鏈 –C2H5）：式 6.23，Ym = 18.7 + 1/5 × (26.3 − 18.7) = 20.22；M = 42.0 + 14.0 = 56.0；Tm = 1000 × 20.22 / 56.0 = 361.07 K
    body = _tm("[*:1]CC([*:2])CC")
    assert body["sideChain"]["n"] == 1
    assert body["quantity"]["value"] == pytest.approx(361.07, abs=0.01)
    # N = 5（聚辛烯，側鏈 –C6H13）：式 6.22，Ym = Ym5 = 26.3；M = 42.0 + 5 × 14.0 = 112.0；Tm = 1000 × 26.3 / 112.0 = 234.82 K
    body = _tm("[*:1]CC([*:2])CCCCCC")
    assert body["sideChain"]["n"] == 5
    assert body["quantity"]["value"] == pytest.approx(234.82, abs=0.01)
    # N = 15（聚十八烯，側鏈 –C16H33）：式 6.24，Ym = 26.3 + 5.7 × (15 − 5) = 83.3；M = 42.0 + 15 × 14.0 = 252.0；Tm = 1000 × 83.3 / 252.0 = 330.56 K
    body = _tm("[*:1]CC([*:2])CCCCCCCCCCCCCCCC")
    assert body["sideChain"]["n"] == 15
    assert body["quantity"]["value"] == pytest.approx(330.56, abs=0.01)


def test_td_conjugated_phenylene_value_hand_calc() -> None:
    """Table 21.2：對伸苯基的三個值依共軛分 n／c／cc = 54／62／75（yd_groups.csv）；–C(=O)NH– 用 32.5（使用者 2026-11-17 決定）。
    聚對苯二甲醯對苯二胺 –NH–C(=O)–C6H4–C(=O)–NH–C6H4–：兩個伸苯基各有一側共軛 → 2 × 62 = 124；兩個 –C(=O)NH– → 2 × 32.5 = 65；
    ΣYd = 124 + 65 = 189；M = 238.24（C14H10N2O2）；Td = 1000 × 189 / 238.24 = 793.3 K。"""
    code, body = engine.handle_td({"smiles": "[*:1]NC(=O)c1ccc(cc1)C(=O)Nc1ccc(cc1)[*:2]"})
    assert code == 200 and body["quantity"]["status"] == "predicted", body
    assert body["sumYd"] == pytest.approx(189.0)
    assert body["quantity"]["value"] == pytest.approx(793.3, abs=0.1)


# ---------------- compare_measured.py ----------------


def _row(name: str, struct: str, tg: str, purpose: str, family: str, note: str = "") -> dict[str, str]:
    return {cm.COL_NAME: name, cm.COL_STRUCT: struct, cm.COL_TG: tg, cm.COL_COND: "", cm.COL_PURPOSE: purpose, cm.COL_NOTE: note, cm.COL_FAMILY: family}


PS_UNIT = "*CC(*)c1ccccc1"
PMMA_UNIT = "*CC(C)(*)C(=O)OC"


def test_compare_measured_never_passes_measured_value_to_engine(monkeypatch: pytest.MonkeyPatch) -> None:
    """D02：呼叫引擎的請求只有結構；實測值不出現在任何請求裡。"""
    seen: list[dict] = []
    real = engine.handle_tg

    def spy(request: object) -> tuple[int, dict]:
        seen.append(dict(request))  # type: ignore[arg-type]
        return real(request)

    monkeypatch.setattr(engine, "handle_tg", spy)
    rows = [_row("a", PS_UNIT, "123.456", "驗證", "F1"), _row("b", PMMA_UNIT, "98.765", "校準", "F2")]
    cm.evaluate(rows)
    assert len(seen) == 2
    for req in seen:
        assert set(req) == {"smiles"}
        assert "123.456" not in repr(req) and "98.765" not in repr(req)


def test_compare_measured_excludes_calibration_rows_from_validation_stats() -> None:
    rows = [
        _row("v1", PS_UNIT, "100", "驗證", "F1"),
        _row("v2", PMMA_UNIT, "110", "驗證", "F1"),
        _row("c1", PS_UNIT, "0", "校準", "F2"),  # 誤差會很大；若被誤併入統計，F2 與最大誤差都會改變
        _row("demo", PS_UNIT, "500", "驗證", "F3", "示範，非實測"),
        _row("bad", PS_UNIT, "100", "其他", "F1"),
        _row("name-only", "聚苯乙烯", "100", "驗證", "F1"),
    ]
    items = cm.evaluate(rows)
    stats = cm.summarize(items)
    assert set(stats) == {"F1", "全部"}  # 校準（F2）與示範（F3）都沒進統計
    assert stats["F1"]["n"] == 2 and stats["全部"]["n"] == 2
    ps, pmma = items[0]["predicted"], items[1]["predicted"]
    assert stats["F1"]["mean"] == pytest.approx(((ps - 100) + (pmma - 110)) / 2)
    assert stats["F1"]["max"] == pytest.approx(max(abs(ps - 100), abs(pmma - 110)))
    assert items[2]["use"] == "calibration" and items[2]["error"] is not None and not items[2]["counted"]
    assert items[4]["use"] == "invalid"
    assert items[5]["predicted"] is None and not items[5]["counted"]  # 名稱不是 SMILES：列出但不進統計
    # 加 --include-demo 才納入示範列
    with_demo = cm.summarize(cm.evaluate(rows, include_demo=True))
    assert "F3" in with_demo and with_demo["全部"]["n"] == 3


# ---------------- P6D：mixture／relative 模式 ----------------

NOVOLAC_UNIT = "[*:1]Cc1cc([*:2])ccc1O"
BADGE = "CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1"
PMMA_ETHYL = "*CC(*)(C)C(=O)OCC"


def _mrow(name: str, comp: str, smiles: str, wt: str, mn: str, tg: str = "", purpose: str = "", family: str = "") -> dict[str, str]:
    return {cm.COL_MODE: "mixture", cm.COL_NAME: name, cm.COL_COMP: comp, cm.COL_STRUCT: smiles, cm.COL_WT: wt, cm.COL_MN: mn, cm.COL_TG: tg, cm.COL_PURPOSE: purpose, cm.COL_FAMILY: family}


def _rrow(name: str, role: str, smiles: str, mol: str = "", anchor: str = "", tg: str = "", purpose: str = "", family: str = "") -> dict[str, str]:
    return {cm.COL_MODE: "relative", cm.COL_NAME: name, cm.COL_ROLE: role, cm.COL_COMP: role, cm.COL_STRUCT: smiles, cm.COL_MOL: mol, cm.COL_ANCHOR: anchor, cm.COL_TG: tg, cm.COL_PURPOSE: purpose, cm.COL_FAMILY: family}


def test_compare_measured_mixture_mode_calls_mixing_without_measured_value(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[dict] = []
    real = engine.handle_tg_mixing

    def spy(request: object) -> tuple[int, dict]:
        seen.append(dict(request))  # type: ignore[arg-type]
        return real(request)

    monkeypatch.setattr(engine, "handle_tg_mixing", spy)
    rows = [_mrow("m1", "poly", NOVOLAC_UNIT, "70", "1000", "123.456", "驗證", "F1"), _mrow("m1", "small", BADGE, "30", "")]
    items = cm.evaluate(rows)
    assert len(items) == 1 and items[0]["mode"] == "mixture" and items[0]["counted"]
    assert items[0]["predicted"] is not None and items[0]["error"] == pytest.approx(items[0]["predicted"] - 123.456)
    assert len(seen) == 1 and set(seen[0]) == {"components", "wtPct", "mn"} and "123.456" not in repr(seen[0])


def test_compare_measured_relative_mode_anchor_is_input_and_measured_is_not(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[dict] = []
    real = engine.handle_relative_tg

    def spy(request: object) -> tuple[int, dict]:
        seen.append(dict(request))  # type: ignore[arg-type]
        return real(request)

    monkeypatch.setattr(engine, "handle_relative_tg", spy)
    rows = [_rrow("r1", "A", PMMA_UNIT, anchor="100"), _rrow("r1", "B", PMMA_ETHYL, mol="1", tg="87.654", purpose="驗證", family="F1")]
    items = cm.evaluate(rows)
    assert len(items) == 1 and items[0]["mode"] == "relative" and items[0]["predicted"] is not None and items[0]["counted"]
    assert seen[0]["tgA"] == {"value": 100.0, "unit": "C"} and "87.654" not in repr(seen[0])


def test_compare_measured_new_modes_calibration_not_counted_and_missing_not_error() -> None:
    rows = [
        _mrow("cal", "poly", NOVOLAC_UNIT, "100", "1000", "0", "校準", "F2"),
        _mrow("val", "poly", NOVOLAC_UNIT, "100", "1000", "100", "驗證", "F1"),
        _mrow("nomn", "poly", NOVOLAC_UNIT, "100", "", "100", "驗證", "F1"),  # 缺 Mn：算不出，不是誤差
        _rrow("rmiss", "A", "*C#N", anchor="100"),
        _rrow("rmiss", "B", PMMA_ETHYL, mol="1", tg="90", purpose="驗證", family="F1"),  # A 缺基團：算不出
    ]
    items = cm.evaluate(rows)
    assert [it["name"] for it in items] == ["cal", "val", "nomn", "rmiss"]
    assert items[0]["use"] == "calibration" and items[0]["error"] is not None and not items[0]["counted"]
    for it in items[2:]:
        assert it["predicted"] is None and it["error"] is None and it["note"] and not it["counted"]
    stats = cm.summarize(items)
    assert set(stats) == {"F1", "全部"} and stats["F1"]["n"] == 1  # 只有 val 進統計
