"""任務 M05 新增模組的單元測試：不能用內建 sum() 的檢查、JS 捨入小工具、幾個手算核對。黃金比對在 test_golden_m05.py。"""

from __future__ import annotations

import builtins
import math

from moleform_core import (
    crosslink,
    dielectric,
    free_volume,
    joback,
    js_compat,
    layer1,
    relative_tg,
    tg_fit,
    tg_mixing,
    tpsa_logp,
)

P = "[*:1]c1ccc(C2(c3ccc(C([*:2])c4ccc5ccccc5c4)c(O)c3)c3ccccc3-c3ccccc32)cc1O"
E = "[*:1]CC([*:2])(C)C(=O)OCC1CO1"


def test_js_to_precision_number_rounds_half_away_from_zero() -> None:
    """JS 的 toPrecision 在正好一半時取較大的 n；Python 的 format 是銀行家捨入。"""
    assert js_compat.js_to_precision_number(1.0625, 4) == 1.063
    assert float(format(1.0625, ".3e")) == 1.062  # Python 的結果不同，所以不能用
    assert js_compat.js_to_precision_number(2.5, 1) == 3
    assert js_compat.js_to_precision_number(-2.5, 1) == -3
    assert js_compat.js_to_precision_number(123456, 2) == 120000
    assert js_compat.js_to_precision_number(0.000123456, 3) == 0.000123
    assert math.isnan(js_compat.js_to_precision_number(math.nan, 4))


def test_no_builtin_sum_in_m05_modules(monkeypatch) -> None:
    """加總一律用明確迴圈：把內建 sum() 換成會拋例外的函式後，各模組仍能算。"""

    def boom(*_a, **_k):
        raise AssertionError("不得使用內建 sum()")

    monkeypatch.setattr(builtins, "sum", boom)
    ps = "*CC(*)c1ccccc1"
    assert free_volume.compute_free_volume(ps, {"units": [{"smiles": ps, "fraction": 50}, {"smiles": "*CC(*)C", "fraction": 50}]})["status"] == "ok"
    assert joback.compute_joback("CCO")["status"] == "ok"
    assert dielectric.compute_dielectric_refraction(ps)["dielectric"]["status"] == "ok"
    assert tpsa_logp.compute_tpsa_logp("CCO")["status"] == "ok"
    assert tg_mixing.fox_mix([{"w": 1, "tgK": 300}, {"w": 3, "tgK": 400}]) > 0
    assert tg_fit.fit_flory([{"mn": 1000, "tgK": 300}, {"mn": 2000, "tgK": 330}, {"mn": 4000, "tgK": 345}])["n"] == 3
    r = relative_tg.relative_tg({"a": {"monomers": [{"name": "PMMA", "smiles": "*CC(*)(C)C(=O)OC"}]}, "b": {"monomers": [{"name": "X", "smiles": "*CC(*)(C)C(=O)OCC"}]}})
    assert r["status"] == "ok"
    comps = [
        {"id": "P", "name": "P", "canonicalSmiles": P, "category": "Resin", "polymer": {"mnInput": 6000}},
        {"id": "E", "name": "E", "canonicalSmiles": E, "category": "Resin", "polymer": {"dpInput": 21}},
    ]
    analysis = crosslink.analyze_crosslink(comps)
    prep = layer1.prepare_layer1(analysis, [{**c, "amount": a} for c, a in zip(comps, (80, 20))], "wt", {"P": 80, "E": 20})
    assert prep["ok"] and layer1.compute_layer1(prep["setup"], 1) is not None
    assert layer1.scan_ratio(prep["setup"], 1, layer1.SCAN_OPTIONS[0]) is not None


def test_fox_mix_and_flory_hand_calculation() -> None:
    assert abs(tg_mixing.fox_mix([{"w": 0.5, "tgK": 300}, {"w": 0.5, "tgK": 400}]) - 1 / (0.5 / 300 + 0.5 / 400)) < 1e-12
    assert tg_mixing.fox_flory(400, 100000, 1000) == 300
    fit = tg_fit.fit_flory([{"mn": 1000, "tgK": 300}, {"mn": 2000, "tgK": 350}])
    assert abs(fit["tgInfK"] - 400) < 1e-9 and abs(fit["k"] - 100000) < 1e-6
    assert math.isnan(fit["seK"])  # 兩點沒有自由度


def test_layer1_miller_macosko_a_f_plus_b2() -> None:
    """A_f + B_2 的凝膠點（[M76] 式 27）：r·p_gel² = 1/(f−1)，限量官能基 A，r = N_A/N_B = 1。"""
    f = 4
    sys = {"a": [{"f": f, "n": 1.0, "mass": 1.0}], "b": [{"f": 2, "n": f / 2, "mass": 1.0}]}
    assert abs(layer1.gel_conversion(sys) - math.sqrt(1 / (f - 1))) < 1e-12


def test_crosslink_judge_and_query_maps() -> None:
    assert crosslink.judge_pair(2, 3, False, False) == "network"
    assert crosslink.judge_pair(2, 2, False, False) == "chain"
    assert crosslink.judge_pair(1, 20, False, True) == "graft"
    assert crosslink.judge_pair(None, 2, False, True) == "undetermined"
    assert crosslink.query_atom_maps("[OX2H:1][cX3]:[c]") == [1, 0, 0]
    assert crosslink.query_atom_maps("O1CC1") == [0, 0, 0]
    assert crosslink.query_atom_maps("[$([OH]C)]Cl[Br:5]") == [0, 0, 5]
