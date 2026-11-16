"""聚合物模組的單元測試（任務 M04）：JS 數值語意的小工具與不能用內建 sum() 的檢查。黃金比對在 test_golden_polymer_*.py。"""

from __future__ import annotations

import builtins
import math

import golden_compare as gc
from moleform_core import copolymer, convert, js_compat, repeat_unit


def test_js_to_fixed_rounds_half_away_from_zero() -> None:
    """JS 的 toFixed 在正好一半時取較大的 n；Python 的 format 是銀行家捨入（.5 邊界）。"""
    assert js_compat.js_to_fixed(90.0078125, 6) == "90.007813"
    assert format(90.0078125, ".6f") == "90.007812"  # Python 的結果不同，所以不能用
    assert js_compat.js_to_fixed(58.0625, 3) == "58.063"
    assert js_compat.js_to_fixed(2.5, 0) == "3"
    assert js_compat.js_to_fixed(0.5, 0) == "1"
    assert js_compat.js_to_fixed(-0.0004, 3) == "-0.000"
    assert js_compat.js_to_fixed(0.0, 2) == "0.00"
    assert js_compat.js_to_fixed(1e21, 3) == "1e+21"
    assert js_compat.js_to_fixed(math.nan, 3) == "NaN"
    assert js_compat.js_to_fixed(-math.inf, 3) == "-Infinity"


def test_js_number_to_string_matches_golden_framework_rule() -> None:
    for x in (0.1 + 0.2, 1e21, 1e-7, 123456789012345680000.0, 5e-324, 1.7976931348623157e308, 100.0, 0.000001, 1e-6 / 10, -2.5, 6000 / 1.8):
        assert js_compat.js_number_to_string(x) == gc.js_number_str(x), x
    assert js_compat.js_number_to_string(math.nan) == "NaN"
    assert js_compat.js_number_to_string(-math.inf) == "-Infinity"


def test_js_max_and_div() -> None:
    assert math.isnan(js_compat.js_max(math.nan, 0.0)) and math.isnan(js_compat.js_max(0.0, math.nan))
    assert js_compat.js_max(-1.0, 0.0) == 0.0
    assert js_compat.js_div(1.0, 0.0) == math.inf and js_compat.js_div(-1.0, 0.0) == -math.inf and math.isnan(js_compat.js_div(0.0, 0.0))


def test_hill_formula_order() -> None:
    assert repeat_unit.hill_formula({"H": 4, "C": 2}) == "C2H4"
    assert repeat_unit.hill_formula({"Br": 1, "B": 1, "Be": 1}) == "BBeBr"
    assert repeat_unit.hill_formula({"N": 1, "H": 1}) == "HN"  # 沒有碳：全部依字母
    assert repeat_unit.hill_formula({"#78": 1, "C": 2, "H": 4}) == "C2H4#78"


def test_no_builtin_sum_in_polymer_modules(monkeypatch) -> None:
    """加總一律用明確迴圈：把內建 sum() 換成會拋例外的函式後，共聚物與換算仍能算。"""

    def boom(*_a, **_k):
        raise AssertionError("不得使用內建 sum()")

    monkeypatch.setattr(builtins, "sum", boom)
    spec = {"units": [{"smiles": "*CC*", "fraction": 70}, {"smiles": "*CC(*)C", "fraction": 30}], "fractionBasis": "wt", "endGroups": {"end1": {"smiles": "[*]C"}, "end2": {"smiles": "[*][H]"}}}
    result = copolymer.analyze_polymer_units("*CC*", spec)
    assert result["ok"] is True
    assert convert.resolve_polymer({"mwInput": 6000}, result["mUnit"], {"mEnds": result["mEnds"], "filled": result["endsFilled"]})["ok"] is True


def test_resolve_polymer_hand_calculation() -> None:
    r = convert.resolve_polymer({"mwInput": 6000, "pdiInput": 1.8}, 200)
    assert r["ok"] and abs(r["mn"] - 3333.3333333333335) < 1e-9 and abs(r["dpW"] - 30) < 1e-12
    assert convert.resolve_polymer({"mnInput": 50}, 120.15, {"mEnds": 58.0625, "filled": [True, True]}) == {"ok": False, "error": "Mn 必須大於端基質量合計（M_ends = 58.063）"}


def test_calcmolwt_wrapper_is_the_same_function() -> None:
    """R7：`Descriptors.MolWt` 與引擎使用的 `rdMolDescriptors._CalcMolWt` 結果完全相同。"""
    from rdkit import Chem
    from rdkit.Chem import Descriptors, rdMolDescriptors

    for smiles in ("*CC*", "*c1ccc(Oc2ccc(N3C(=O)c4cc5C(=O)N(*)C(=O)c5cc4C3=O)cc2)cc1", "[*:1]CC([*:2])(C)C(=O)OCC1CO1", "*[Si](C)(C)O*"):
        mol = Chem.MolFromSmiles(smiles)
        assert Descriptors.MolWt(mol) == rdMolDescriptors._CalcMolWt(mol)
