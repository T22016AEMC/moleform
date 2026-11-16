"""Tg 模組的單元檢查（任務 M02）：不依賴黃金檔的行為——資料表讀取與錯誤處理、JS 相容的除法、R5 的幾個已知特性。

黃金比對（與 TypeScript 逐字相同）在 test_golden_tg.py。
"""

from __future__ import annotations

import math

import pytest
from rdkit import Chem, RDLogger

from moleform_core import tg

RDLogger.DisableLog("rdApp.*")

YG_HEADER = ",".join(tg.YG_GROUPS_COLUMNS)
CAL_HEADER = ",".join(tg.YG_CALIBRATED_COLUMNS)
YG_ROW = "A.X,基團,[CH2],2.7,14,,A,單一基團,,Table 6.1 頁 133,待使用者審,CC,N,"
CAL_ROW = "CAL.X,基團,H 換成 X 增量,[OX2H1;$(O-c)],16.43,16.0,錨點 2009 頁 1,推導,差 +1 K,校準值（非書中值）,Oc1ccccc1,CCO"


# ---------- 資料表 ----------


def test_real_tables_load_without_issues() -> None:
    rows = tg.load_yg_groups()
    cal = tg.load_yg_calibrated()
    assert len(rows) == 71 and [r.id for r in cal] == ["CAL.OH.ar", "CAL.fluorene.diaryl"]
    assert all(r.positives and r.negatives for r in rows)  # D22：每個基團都有正反例


def test_yg_number_formats() -> None:
    rows, issues = tg.read_yg_groups(f"{YG_HEADER}\n{YG_ROW.replace('2.7', '(3.5)')}\n")
    assert issues == [] and rows[0].ygi == 3.5 and rows[0].tentative is True  # 書中括號標示的暫定值
    rows, issues = tg.read_yg_groups(f"{YG_HEADER}\n{YG_ROW}\n")
    assert rows[0].ygi == 2.7 and rows[0].tentative is False and rows[0].positives == ("CC",)


@pytest.mark.parametrize("bad", ["abc", "", "1e3", "(1", "1.", "٣", "+1"])
def test_yg_bad_number_reports_and_drops_row(bad: str) -> None:
    rows, issues = tg.read_yg_groups(f"{YG_HEADER}\n{YG_ROW.replace('2.7', bad)}\n")
    assert rows == [] and len(issues) == 1 and "Ygi" in issues[0]


def test_yg_header_and_column_count_errors() -> None:
    assert "標題列與定義不一致" in tg.read_yg_groups("a,b\n1,2\n")[1][0]
    assert "檔案是空的" in tg.read_yg_groups("")[1][0]
    rows, issues = tg.read_yg_groups(f"{YG_HEADER}\nA.X,基團\n")
    assert rows == [] and "欄位數應為 14" in issues[0]


def test_calibrated_reader() -> None:
    rows, issues = tg.read_yg_calibrated(f"{CAL_HEADER}\n{CAL_ROW}\n")
    assert issues == [] and rows[0].ygi == 16.43 and rows[0].mi == 16.0
    # 校準表不接受括號暫定值
    rows, issues = tg.read_yg_calibrated(f"{CAL_HEADER}\n{CAL_ROW.replace('16.43', '(16.43)')}\n")
    assert rows == [] and "Ygi" in issues[0]


def test_bad_table_raises_instead_of_dropping(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    """D22：TS 靜默丟掉格式錯誤的列；Python 載入時直接拋出 TgDataError（已知差異，報告第 8 節）。"""
    (tmp_path / tg.YG_GROUPS_FILE).write_text(f"{YG_HEADER}\n{YG_ROW.replace('2.7', 'abc')}\n", encoding="utf-8")
    monkeypatch.setattr(tg, "DATA_DIR", str(tmp_path))
    tg.load_yg_groups.cache_clear()
    try:
        with pytest.raises(tg.TgDataError):
            tg.load_yg_groups()
    finally:
        tg.load_yg_groups.cache_clear()


def test_unparsable_smarts_raises() -> None:
    with pytest.raises(ValueError, match="Yg 基團表的 SMARTS 無法解析"):
        tg.must_query("[C")


def test_family_id() -> None:
    plain = next(r for r in tg.load_yg_groups() if not r.state and not r.condition)
    assert tg.yg_family_id(plain) == plain.id  # 沒有共軛狀態、條件
    conditional = next(r for r in tg.load_yg_groups() if r.condition)
    assert tg.yg_family_id(conditional) == conditional.id.rsplit(".", 1)[0]
    states = [r for r in tg.load_yg_groups() if r.state]
    assert all(tg.yg_family_id(r) == r.id.rsplit(".", 1)[0] for r in states)


# ---------- JS 相容 ----------


def test_js_division() -> None:
    assert math.isnan(tg._js_div(0.0, 0.0))
    assert tg._js_div(1.0, 0.0) == math.inf
    assert tg._js_div(-1.0, 0.0) == -math.inf
    assert tg._js_div(1.0, -0.0) == -math.inf
    assert tg._js_div(6.0, 3.0) == 2.0


def test_no_heavy_atom_gives_nan_like_ts() -> None:
    r = tg.compute_tg("[H+]")
    assert r["status"] == "ok" and math.isnan(r["tgK"]) and r["sumM"] == 0.0


def test_empty_smiles_raises_like_ts() -> None:
    with pytest.raises(tg.EmptyMoleculeError):
        tg.compute_tg("")
    assert tg.compute_tg("   ")["status"] == "invalid"


def test_explicit_sum_matches_js_reduce_not_builtin_sum() -> None:
    """Python 3.12 的內建 sum() 對 float 用補償加總，與 JS reduce 不同；tg.py 一律用明確迴圈（M01 的教訓）。"""
    values = [0.1] * 10
    explicit = 0.0
    for v in values:
        explicit = explicit + v
    assert explicit == 0.9999999999999999
    assert sum(values) != explicit or sys_version_sum_is_plain()


def sys_version_sum_is_plain() -> bool:
    import sys

    return sys.version_info < (3, 12)


# ---------- R5 ----------


def _mol(smiles: str) -> Chem.Mol:
    m = Chem.MolFromSmiles(smiles)
    assert m is not None
    return m


def test_r5_drops_atom_map_and_aromaticity_is_redetermined() -> None:
    mol = _mol("[*:1]CC([*:2])c1ccc(O)cc1")
    drop = {i for i, a in enumerate(mol.GetAtoms()) if a.GetSymbol() == "O"}
    outcome = tg.strip_outcome(mol, drop)
    assert outcome.built and outcome.smiles == "*CC(*)c1ccccc1"  # 映射編號消失、環重新判定為芳香
    assert [a.imp_hs for a in outcome.atoms][-3:] == [1, 1, 1]
    assert all(b.bo in (1, 2) for b in outcome.bonds)  # Kekulé 的單／雙鍵，沒有芳香鍵


def test_r5_host_atom_gets_hydrogen_back() -> None:
    mol = _mol("Oc1ccccc1")
    outcome = tg.strip_outcome(mol, {0})
    assert [a.imp_hs for a in outcome.atoms] == [1] * 6 and outcome.smiles == "c1ccccc1"


def test_r5_chirality_is_kept() -> None:
    mol = _mol("N[C@@H](Cc1ccc(O)cc1)C(=O)O")
    drop = {i for i, a in enumerate(mol.GetAtoms()) if a.GetSymbol() == "O" and a.GetTotalNumHs() == 1 and a.GetNeighbors()[0].GetIsAromatic()}
    assert tg.strip_outcome(mol, drop).smiles == "N[C@@H](Cc1ccccc1)C(=O)O"


def test_r5_known_ts_behaviours_are_reproduced() -> None:
    """TS 沒有重新編號 stereoAtoms：被移除的原子索引小於順反標示所指的原子時重建失敗；其餘情形 canonical SMILES 不帶順反。"""
    stale = _mol("Oc1ccc(/C=C/CC[*:1])cc1")
    out = tg.strip_outcome(stale, {0})
    assert out.built is False and out.smiles is None
    assert tg.compute_tg("Oc1ccc(/C=C/CC[*:1])cc1")["status"] == "missing"
    later = _mol("[*:1]CC/C=C/c1ccc(O)cc1")
    drop = {i for i, a in enumerate(later.GetAtoms()) if a.GetSymbol() == "O"}
    assert tg.strip_outcome(later, drop).smiles == "*CCC=Cc1ccccc1"
    # 結果：含順反標示的酚羥基單元，cis／trans 資訊在改寫時遺失，第二次切分的 –CH=CH– 取不到值 → 退回書中基團的缺基團結果（只列酚羥基的 O）
    r = tg.compute_tg("[*:1]CC/C=C/c1ccc(O)cc1")
    assert r["status"] == "missing" and [m["element"] for m in r["missing"]] == ["O"]
