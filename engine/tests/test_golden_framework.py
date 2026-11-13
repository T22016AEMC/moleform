"""黃金比對框架本身的檢查（任務 M00）：版本不符拒絕、數字字串規則、放寬規則與記錄。"""

from __future__ import annotations

import json

import pytest

import golden_compare as gc


def _doc(tmp_path, rdkitjs: str = "2026.09.1", rel: str = "1e-12") -> dict:
    p = tmp_path / "m.json"
    p.write_text(
        '{"cases":[],"commit":"x","module":"m","rdkitjs":"%s","tolerance":{"relFallback":%s}}' % (rdkitjs, rel),
        encoding="utf-8",
    )
    return gc.load_golden("m", str(tmp_path))


def test_engine_handshake_reports_rdkit_2026_9_1() -> None:
    assert gc.engine_rdkit_version() == "2026.9.1"


def test_version_match_accepts_zero_padded(tmp_path) -> None:
    gc.check_version(_doc(tmp_path, "2026.09.1"), engine_version="2026.9.1")


@pytest.mark.parametrize("engine", ["2026.9.2", "2026.3.1", None, "2026.9.1rc1"])
def test_version_mismatch_refuses(tmp_path, engine) -> None:
    with pytest.raises(gc.VersionMismatchError):
        gc.check_version(_doc(tmp_path, "2026.09.1"), engine_version=engine)


def test_golden_files_record_current_engine_version() -> None:
    for module in ("atomicWeights", "csv", "molGraph"):
        gc.check_version(gc.load_golden(module))


def test_relfallback_cannot_be_loosened(tmp_path) -> None:
    with pytest.raises(gc.GoldenFormatError):
        _doc(tmp_path, rel="1e-9")


# 期望值取自 Node 24 的 JSON.stringify 輸出（任務 M00 執行時實測）
JS_REPR = [
    (1e21, "1e+21"),
    (1e20, "100000000000000000000"),
    (123456789012345680000.0, "123456789012345680000"),
    (1e-7, "1e-7"),
    (1e-6, "0.000001"),
    (0.000001234, "0.000001234"),
    (0.1, "0.1"),
    (-0.0, "0"),
    (5e-324, "5e-324"),
    (1.7976931348623157e308, "1.7976931348623157e+308"),
    (100.0, "100"),
    (1.5e-10, "1.5e-10"),
    (12.011, "12.011"),
    (2**53 + 2, "9007199254740994"),
    (-1e-7, "-1e-7"),
    (0.1 + 0.2, "0.30000000000000004"),
    (1234.5678, "1234.5678"),
    (7, "7"),
]


@pytest.mark.parametrize(("value", "expected"), JS_REPR)
def test_js_number_str(value, expected) -> None:
    assert gc.js_number_str(value) == expected


def _golden(text: str):
    return json.loads(text, parse_float=gc.Num, parse_int=gc.Num)


def test_float_exact_needs_no_tolerance() -> None:
    ctx = gc.CompareContext("m", "c")
    assert gc.compare(_golden("[0.30000000000000004, 3]"), [0.1 + 0.2, 3.0], ctx) == []
    assert ctx.tolerance_cases == []


def test_float_last_digit_is_recorded_not_silent() -> None:
    ctx = gc.CompareContext("m", "c")
    assert gc.compare(_golden("0.30000000000000004"), 0.3, ctx) == []
    assert len(ctx.tolerance_cases) == 1
    t = ctx.tolerance_cases[0]
    assert (t.golden, t.python) == ("0.30000000000000004", "0.3") and t.rel_err <= 1e-12


def test_float_beyond_tolerance_fails() -> None:
    ctx = gc.CompareContext("m", "c")
    assert gc.compare(_golden("1.0000000001"), 1.0, ctx)
    assert ctx.tolerance_cases == []


def test_integers_are_never_tolerated() -> None:
    ctx = gc.CompareContext("m", "c")
    assert gc.compare(_golden("[1, 2]"), [1, 3], ctx)


def test_types_and_keys_exact() -> None:
    ctx = gc.CompareContext("m", "c")
    assert gc.compare(_golden('{"a": 1}'), {"a": 1, "b": 2}, ctx)
    assert gc.compare(_golden('{"a": true}'), {"a": 1}, ctx)
    assert gc.compare(_golden('"1"'), 1, ctx)
    assert gc.compare(_golden("1"), True, ctx)
    assert gc.compare(_golden("[1]"), [1, 2], ctx)


def test_map_order_matters() -> None:
    ctx = gc.CompareContext("m", "c")
    g = _golden('{"$map": [["1-2", "cis"], ["3-4", "trans"]]}')
    assert gc.compare(g, {"1-2": "cis", "3-4": "trans"}, ctx) == []
    assert gc.compare(g, {"3-4": "trans", "1-2": "cis"}, ctx)
