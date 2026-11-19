"""任務 P8-3：配方面板接上使用者定義的算法（成分密度順序、共聚物加權密度、成分 Tg 的 Bondi FFV 備援）。
最少的單元測試（D64）：k 表命中、使用者密度優先於類別預設、類別預設有標示、共聚物莫耳分率加權密度（手算）、缺條件時 Tg 回 missing 並寫明缺什麼。
以下的堆積係數 k、密度、參考 Tg 都是「測試用」的假設值，不是材料數據。"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import moleform_engine as eng  # noqa: E402
from moleform_core import mixing, vm, vw  # noqa: E402
from moleform_core.packing_k import find_packing_k_row  # noqa: E402

PMMA = "*CC(*)(C)C(=O)OC"
PS = "*CC(*)c1ccccc1"
FLUORENE = "*Oc1ccc(cc1)C1(c2ccccc2-c2ccccc21)c1ccc(cc1)*"  # 書 Va 缺基團、D57 類別辨識得出（含芳香環）
NAPH = "*Cc1ccc2ccccc2c1*"  # 書的 Tg 基團加成缺基團、VW 有
AMIDE = "*CC(*)C(=O)N"  # 書 Va 與 D57 都缺基團


def _one(c: dict) -> dict:
    r = mixing.compute_mixture_density([{"w": 1.0, **c}])
    return r


def test_k_table_hit_by_exact_name() -> None:
    row = find_packing_k_row("PMMA")
    assert row is not None
    v = vw.compute_vdw_volume(PMMA)
    r = _one({"name": "PMMA", "smiles": PMMA})
    comp = r["components"][0]
    assert comp["densitySource"] == "tableK"
    assert comp["packingK"] == row.packing_k
    # ρ = M ÷ (VvdW ÷ k)
    assert r["density"] == pytest.approx(v["formulaMass"] / (v["vw"] / row.packing_k), rel=1e-12)
    # 名稱不同（不在 k 表）→ 沒有 k，照舊用書 Va，與修改前逐位相同
    plain = _one({"name": "樹脂", "smiles": PMMA})
    assert plain["components"][0]["densitySource"] == "predicted"
    assert plain["density"] == vm.compute_molar_volume_density(PMMA)["amorphous"]["density"]


def test_user_k_first_and_rejects_out_of_range() -> None:
    r = _one({"name": "樹脂", "smiles": PS, "packingK": 0.6, "userDensity": 5.0})
    assert r["components"][0]["densitySource"] == "userK"
    with pytest.raises(ValueError):
        _one({"smiles": PS, "packingK": 1.2})
    code, _ = eng.handle_mixture_density({"components": [{"w": 1.0, "smiles": PS, "packingK": 0}]})
    assert code == 400


def test_user_density_before_class_default_and_class_default_is_labelled() -> None:
    assert vm.compute_molar_volume_density(FLUORENE)["status"] == "missing"
    with_user = _one({"name": "茀單元", "smiles": FLUORENE, "userDensity": 1.2})
    assert with_user["components"][0]["densitySource"] == "user"
    assert with_user["density"] == pytest.approx(1.2)
    cls = _one({"name": "茀單元", "smiles": FLUORENE})
    comp = cls["components"][0]
    assert comp["densitySource"] == "class"
    assert "類別預設，非材料值" in comp["densitySourceLabel"]
    assert "類別預設，非材料值" in comp["detail"]


def test_copolymer_mole_fraction_weighted_density_hand_calc() -> None:
    # 書 Va：PMMA Vm 91.07、M 100.117；PS Vm 100.53、M 104.152（vm 模組的值）
    # 50/50 mol：ρ = (0.5×100.117 + 0.5×104.152) ÷ (0.5×91.07 + 0.5×100.53) = 102.1345 ÷ 95.8 = 1.0661221…
    units = [{"smiles": PMMA, "fraction": 50}, {"smiles": PS, "fraction": 50}]
    r = _one({"name": "共聚物", "units": units, "fractionBasis": "mol"})
    assert r["status"] == "predicted"
    assert r["density"] == pytest.approx(102.1345 / 95.8, rel=1e-9)
    assert [u["source"] for u in r["components"][0]["units"]] == ["predicted", "predicted"]
    # wt% 先換算莫耳分率：x_i ∝ w_i ÷ M_i
    w = _one({"name": "共聚物", "units": units, "fractionBasis": "wt"})
    x1 = (50 / 100.117) / (50 / 100.117 + 50 / 104.152)
    expected = (x1 * 100.117 + (1 - x1) * 104.152) / (x1 * 91.07 + (1 - x1) * 100.53)
    assert w["density"] == pytest.approx(expected, rel=1e-9)


def test_copolymer_missing_unit_is_named() -> None:
    r = _one({"name": "共聚物", "units": [{"smiles": PS, "fraction": 50}, {"smiles": AMIDE, "fraction": 50}]})
    assert r["status"] == "missing"
    m = r["missing"][0]
    assert "第 2 個單元" in m["reason"] and m["unit"] == 2
    assert m["remedy"].startswith("可以：")


def _tg(extra: dict) -> dict:
    comps = [{"id": "b", "name": "萘單元", "category": "Resin", "canonicalSmiles": NAPH, **extra}]
    code, body = eng.handle_tg_mixing({"components": comps, "wtPct": {"b": 100}, "mn": {"b": 5000}})
    assert code == 200
    return body["components"][0]


def test_tg_missing_states_what_is_needed() -> None:
    c = _tg({})
    assert c["status"] == "missing" and c["tgK"] is None
    assert "需要參考聚合物 A 的結構（SMILES）" in c["missingReason"]
    assert "參考聚合物 A 的 Tg（錨點）" in c["missingReason"]
    assert "本成分的堆積係數 k" in c["missingReason"]
    c2 = _tg({"packingK": 0.6, "referencePolymer": {"smiles": PS, "packingK": 0.62}})
    assert c2["status"] == "missing"
    assert c2["fallback"]["needs"] == ["參考聚合物 A 的 Tg（錨點）"]


def test_tg_bondi_fallback_when_inputs_complete() -> None:
    c = _tg({"packingK": 0.6, "referencePolymer": {"smiles": PS, "tgC": 100, "packingK": 0.62}})
    assert c["status"] == "ok" and c["tgMethod"] == "bondiRelativeTg"
    assert c["flags"] == ["參考趨勢"]
    code, rt = eng.handle_relative_tg(
        {"a": {"monomers": [{"smiles": PS, "packingK": 0.62}]}, "b": {"monomers": [{"name": "萘單元", "smiles": NAPH, "packingK": 0.6}]}, "tgA": {"value": 100, "unit": "C"}}
    )
    assert code == 200
    assert c["tgK"] == rt["tgB"]["tgK"]  # 與 /relative-tg 同一結果


def test_tg_group_ok_component_unchanged() -> None:
    # 書的基團加成算得出時不走備援（輸入參考聚合物也一樣）
    comps = [{"id": "p", "name": "樹脂", "category": "Resin", "canonicalSmiles": PS}]
    _, base = eng.handle_tg_mixing({"components": comps, "wtPct": {"p": 100}, "mn": {"p": 5000}})
    comps[0]["referencePolymer"] = {"smiles": PMMA, "tgC": 100, "packingK": 0.6}
    comps[0]["packingK"] = 0.6
    _, again = eng.handle_tg_mixing({"components": comps, "wtPct": {"p": 100}, "mn": {"p": 5000}})
    assert again["components"][0]["tgK"] == base["components"][0]["tgK"]
    assert "tgMethod" not in again["components"][0]
