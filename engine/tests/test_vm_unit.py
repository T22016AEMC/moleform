"""Vm／密度與 CTE 模組的單元檢查（任務 M03）：不依賴黃金檔的行為——資料表讀取與錯誤處理、JS 相容的 `toFixed` 與除法、
298 K 狀態判斷的精確邊界（TS 黃金案例碰不到的「剛好 25 °C」）、不使用內建 `sum()`、公式的手算對照。

黃金比對（與 TypeScript 逐字相同）在 test_golden_vm.py、test_golden_cte.py。
"""

from __future__ import annotations

import math
from pathlib import Path

import pytest
from rdkit import RDLogger

from moleform_core import cte, tg, vm

RDLogger.DisableLog("rdApp.*")

HEADER = ",".join(vm.MOLAR_VOLUME_GROUPS_COLUMNS)
ROW = "M01,–CH2–,[CX4H2;D2;!R],1,16.37,14.68,出處 Table 4.10 書頁 88,待使用者審,備註"


# ---------- 資料表 ----------


def test_real_table_loads_without_issues() -> None:
    rows = vm.load_molar_volume_groups()
    assert [r.id for r in rows] == [f"M{i:02d}" for i in range(1, 28)]
    assert rows[0].va == 16.37 and rows[0].vc == 14.68 and rows[0].atom_count == 1
    # 書中印於括號內的列，備註要寫明（TS 的 tentative 判斷依據）
    assert [r.id for r in rows if vm.TENTATIVE_MARK in r.notes] == ["M09", "M10", "M13", "M16", "M19", "M20", "M26"]


def test_number_formats() -> None:
    rows, issues = vm.read_molar_volume_groups(f"{HEADER}\n{ROW}\n")
    assert issues == [] and rows[0].va == 16.37
    for column, text in (("Va", "abc"), ("Vc", ""), ("Va", "1e3"), ("Va", "1."), ("Vc", "(1)"), ("Va", "+1"), ("Vc", "٣")):
        bad = ROW.replace("16.37", text) if column == "Va" else ROW.replace("14.68", text)
        rows, issues = vm.read_molar_volume_groups(f"{HEADER}\n{bad}\n")
        assert rows == [] and len(issues) == 1 and column in issues[0], (column, text, issues)


@pytest.mark.parametrize("atoms", ["0", "31", "1.5", "", "abc"])
def test_atom_count_range(atoms: str) -> None:
    rows, issues = vm.read_molar_volume_groups(f"{HEADER}\n{ROW.replace(',1,16.37', f',{atoms},16.37')}\n")
    assert rows == [] and len(issues) == 1 and "原子數" in issues[0]


def test_header_and_column_count_errors() -> None:
    assert "標題列與定義不一致" in vm.read_molar_volume_groups("a,b\n1,2\n")[1][0]
    assert "檔案是空的" in vm.read_molar_volume_groups("")[1][0]
    rows, issues = vm.read_molar_volume_groups(f"{HEADER}\nM01,基團\n")
    assert rows == [] and "欄位數應為 9" in issues[0]


def test_bad_table_raises_instead_of_dropping(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """D22：TS 靜默丟掉格式錯誤的列；Python 載入時直接拋出 MolarVolumeDataError（已知差異，docs/migration-known-issues.md）。"""
    (tmp_path / vm.MOLAR_VOLUME_GROUPS_FILE).write_text(f"{HEADER}\n{ROW.replace('16.37', 'abc')}\n", encoding="utf-8")
    monkeypatch.setattr(vm, "DATA_DIR", str(tmp_path))
    vm.load_molar_volume_groups.cache_clear()
    try:
        with pytest.raises(vm.MolarVolumeDataError):
            vm.load_molar_volume_groups()
    finally:
        vm.load_molar_volume_groups.cache_clear()


def test_unparsable_smarts_raises_like_ts() -> None:
    with pytest.raises(ValueError, match="莫耳體積基團表的 SMARTS 無法解析"):
        vm.must_query("[C")


# ---------- JS 相容的小工具 ----------


@pytest.mark.parametrize(
    ("x", "digits", "expected"),
    [
        (0.25, 1, "0.3"),  # 正好一半：JS 取較大的 n（Python 的 format 會給 0.2）
        (0.35, 1, "0.3"),  # 0.35 的 double 略小於 0.35
        (2.5, 0, "3"),
        (-2.5, 0, "-3"),  # 負數先取正再加負號：遠離零
        (-0.04, 1, "-0.0"),
        (-0.0, 1, "0.0"),
        (1.005, 2, "1.00"),  # 1.005 的 double 略小於 1.005
        (24.995506419400954, 1, "25.0"),
        (25.03496110630948, 1, "25.0"),
        (99.56853986551403, 1, "99.6"),
        (-80.29285714285712, 1, "-80.3"),
        (1e20, 1, "100000000000000000000.0"),
        (math.nan, 1, "NaN"),
        (math.inf, 1, "Infinity"),
        (-math.inf, 1, "-Infinity"),
    ],
)
def test_js_to_fixed(x: float, digits: int, expected: str) -> None:
    assert vm.js_to_fixed(x, digits) == expected


def test_js_to_fixed_differs_from_python_format_on_ties() -> None:
    assert f"{0.25:.1f}" == "0.2" and vm.js_to_fixed(0.25, 1) == "0.3"


def test_js_div_matches_js() -> None:
    assert math.isnan(vm._js_div(0.0, 0.0)) and vm._js_div(1.0, 0.0) == math.inf and vm._js_div(-1.0, 0.0) == -math.inf
    assert vm._js_div(1.0, -0.0) == -math.inf


# ---------- 298 K 狀態判斷 ----------


def _fake_tg(monkeypatch: pytest.MonkeyPatch, result: dict) -> None:
    monkeypatch.setattr(tg, "compute_tg", lambda smiles, **kw: result)


def test_state_exactly_25_is_undetermined(monkeypatch: pytest.MonkeyPatch) -> None:
    """TS：Tg 剛好等於 25 °C 判為「狀態未定」（書中沒有規定）。真實分子很難剛好 25.0，黃金案例碰不到這一支，所以用假的 Tg 結果測。"""
    _fake_tg(monkeypatch, {"status": "ok", "tgC": 25.0, "tgK": 298.15})
    s = vm.judge_state("*CC*")
    assert s == {"state": "undetermined", "tgC": 25.0, "basis": "Tg 剛好等於 25 °C，書中沒有規定；玻璃態與橡膠態結果都輸出"}


@pytest.mark.parametrize(("tg_c", "state"), [(25.0000000001, "glassy"), (24.9999999999, "rubbery"), (25.04, "glassy"), (24.96, "rubbery")])
def test_state_threshold_sides(monkeypatch: pytest.MonkeyPatch, tg_c: float, state: str) -> None:
    _fake_tg(monkeypatch, {"status": "ok", "tgC": tg_c, "tgK": tg_c + 273.15})
    s = vm.judge_state("*CC*")
    assert s["state"] == state
    assert "25.0 °C" in s["basis"]  # toFixed(1)：24.96 與 25.04 都寫成 25.0，但狀態不同（TS 也是）


def test_state_tg_not_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_tg(monkeypatch, {"status": "invalid", "message": "測試訊息"})
    assert vm.judge_state("*CC*") == {"state": "undetermined", "tgC": None, "basis": "Tg 無法計算：測試訊息"}
    _fake_tg(monkeypatch, {"status": "missing"})
    s = vm.judge_state("*CC*")
    assert s["state"] == "undetermined" and s["tgC"] is None and "缺基團" in s["basis"]


def test_state_uses_book_groups_only(monkeypatch: pytest.MonkeyPatch) -> None:
    """TS 的 judgeState 呼叫 computeTg(..., { calibrated: false })：Python 也不得使用校準基團。"""
    seen: dict = {}

    def spy(smiles: str, **kwargs):  # type: ignore[no-untyped-def]
        seen.update(kwargs)
        return {"status": "missing"}

    monkeypatch.setattr(tg, "compute_tg", spy)
    vm.judge_state("*CC*")
    assert seen == {"calibrated": False}


def test_state_phenol_unit_is_undetermined_without_calibration() -> None:
    """含酚羥基的單元：Vm 表沒有對應基團（缺基團），而 Tg 要用校準基團才算得出——Vm 不使用校準值，所以不會因此判出狀態。"""
    r = vm.compute_molar_volume_density("[*:1]CC([*:2])c1ccc(O)cc1")
    assert r["status"] == "missing"
    assert vm.judge_state("[*:1]CC([*:2])c1ccc(O)cc1")["state"] == "undetermined"


# ---------- 計算 ----------


def test_polystyrene_hand_calculation() -> None:
    """Va：CH2 16.37 + CH(C6H5) 84.16 = 100.53；單元質量 = 8 個 C + 8 個 H（8×12.011 + 8×1.008）。"""
    r = vm.compute_molar_volume_density("[*:1]CC([*:2])c1ccccc1")
    assert r["status"] == "ok"
    assert r["amorphous"]["vm"] == 16.37 + 84.16
    assert r["unitMass"] == pytest.approx(8 * 12.011 + 8 * 1.008, abs=1e-9)
    assert r["amorphous"]["density"] == pytest.approx(r["unitMass"] / 100.53, rel=1e-15)
    assert r["crystalline"]["vm"] == pytest.approx(14.68 + 75.48, abs=1e-12)
    assert r["glassy"] is r["rubbery"] or r["glassy"] == r["rubbery"] == r["amorphous"]


def test_vm_uses_explicit_loops_not_builtin_sum(monkeypatch: pytest.MonkeyPatch) -> None:
    """Python 3.12 的 sum() 對 float 做補償加總，與 JS 的逐項相加不同：模組內不得呼叫內建 sum()（見 vw.py 的說明）。"""
    import builtins

    def forbidden(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise AssertionError("不得使用內建 sum()")

    monkeypatch.setattr(builtins, "sum", forbidden)
    assert vm.compute_molar_volume_density("[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]")["status"] == "ok"
    assert cte.compute_cte("[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]")["status"] == "ok"


def test_status_and_messages() -> None:
    assert vm.compute_molar_volume_density("")["message"] == "沒有結構（SMILES 是空的）"
    assert vm.compute_molar_volume_density("   ")["status"] == "invalid"
    assert vm.compute_molar_volume_density("xyz")["message"] == "RDKit 無法解析這個 SMILES"
    assert vm.compute_molar_volume_density("[H+]")["message"] == "沒有重原子"
    assert vm.compute_molar_volume_density("*CC*.*OC*")["status"] == "invalid"
    assert vm.compute_molar_volume_density("CCO")["status"] == "unsupported"
    # 空字串不拋例外（TS 在 Vm 一開始就擋下；不像 Tg 的 computeTg('') 拋出）
    assert vm.compute_molar_volume_density("")["status"] == "invalid"


def test_missing_reports_hints() -> None:
    """酯基（脂肪族）與接 * 的醚：配不到基團，附書中沒有定義條件的補充說明。"""
    r = vm.compute_molar_volume_density("*CC(=O)OCC*")
    assert r["status"] == "missing"
    assert any(m["reason"] and "酯基" in m["reason"] for m in r["missing"])
    assert vm.compute_molar_volume_density("*CCOCC*")["status"] == "ok"  # 兩側都是飽和碳的醚：M09
    r = vm.compute_molar_volume_density("[*:1]CCO[*:2]")
    assert r["status"] == "missing" and any(m["reason"] and "醚" in m["reason"] for m in r["missing"])  # 醚接連接點：不配對


# ---------- CTE ----------


def test_cte_hand_calculation() -> None:
    """VW = 100、M = 200：E_l = 0.1、E_g = 0.045、α_l = 0.1/160、α_g = 0.045/160、β = α/3、e = E/M。"""
    out = cte.cte_from_vw(100.0, 200.0)
    assert out["rubbery"]["molar"] == pytest.approx(0.1, abs=1e-15)
    assert out["glassy"]["molar"] == pytest.approx(0.045, abs=1e-15)
    assert out["rubbery"]["alpha"] == pytest.approx(0.1 / 160, rel=1e-14)
    assert out["glassy"]["alpha"] == pytest.approx(0.045 / 160, rel=1e-14)
    assert out["rubbery"]["beta"] == pytest.approx(0.1 / 160 / 3, rel=1e-14)
    assert out["rubbery"]["specific"] == pytest.approx(0.1 / 200, rel=1e-14)
    assert cte.cte_from_vw(100.0, None)["rubbery"]["specific"] is None


def test_cte_division_by_zero_like_js() -> None:
    out = cte.cte_from_vw(0.0, 0.0)
    assert math.isnan(out["rubbery"]["alpha"]) and math.isnan(out["rubbery"]["specific"])
    zero_vg = cte.glass_alpha_from_tg(10.0, -1.43 / 0.55e-3)
    assert zero_vg["vg298"] == 0.0 and zero_vg["alpha"] == math.inf


def test_cte_glass_formula() -> None:
    """式 4.27：Tg = 300、400、500 K 時 V_g(298)/VW = 1.595、1.650、1.705。"""
    for tg_k, ratio in ((300, 1.595), (400, 1.65), (500, 1.705)):
        assert cte.glass_alpha_from_tg(1.0, float(tg_k))["vg298"] == pytest.approx(ratio, abs=1e-12)


def test_cte_statuses() -> None:
    assert cte.compute_cte("CCO") == {"status": "notApplicable", "smiles": "CCO", "message": "不適用（小分子，D56）"}
    assert cte.compute_cte("")["status"] == "invalid" and cte.compute_cte("C(")["status"] == "invalid"
    r = cte.compute_cte("[*:1]C[Se]C[*:2]")
    assert r["status"] == "missing" and r["missingInput"] == "VW" and r["message"] == "缺 VW：Table 4.2 缺基團，不計算、不猜值"
    r = cte.compute_cte("[*:1]CC([*:2])C#N")
    assert r["status"] == "ok" and r["glassyFromTg"]["status"] == "missing" and "缺 Tg" in r["glassyFromTg"]["message"]


@pytest.mark.parametrize(("tg_c", "text"), [(0.25, "Tg = 0.3 °C"), (-0.25, "Tg = -0.3 °C"), (30.25, "Tg = 30.3 °C"), (-0.04, "Tg = -0.0 °C")])
def test_state_basis_text_uses_js_to_fixed(monkeypatch: pytest.MonkeyPatch, tg_c: float, text: str) -> None:
    """依據文字的 Tg 用 JS 的 toFixed(1)：正好一半往遠離零進位（Python 的 .1f 會得到 0.2、-0.2、30.2）。"""
    _fake_tg(monkeypatch, {"status": "ok", "tgC": tg_c, "tgK": tg_c + 273.15})
    assert vm.judge_state("*CC*")["basis"].startswith(text)
