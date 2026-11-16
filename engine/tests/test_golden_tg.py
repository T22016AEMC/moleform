"""黃金比對：Tg（src/core/properties/tgGroupContribution.ts ↔ engine/moleform_core/tg.py）。任務 M02。

黃金檔 tests/golden/tg.json 的案例種類（input.kind）：
- compute：computeTg（預設選項、partition＝fewest／fromEnd、calibrated＝false 的變體）的完整輸出；TS 拋出例外的案例
  記為 { threw: true }，Python 要求同樣拋出。
- r5：同一個 computeTg 呼叫，另含 TS 餵給 RDKit.get_mol 的「改寫後 JSON」的原子（含順序、氫數、電荷、同位素、手性）與鍵
  （含 stereoAtoms），以及 get_smiles() 的 canonical SMILES；Python 的 RWMol 重建要逐項相同（R5）。
- rawMatches（R3）：全部 SMARTS 對該分子的**原始**配對（RDKit.js 的順序，TS 沒有排序過），與 Python `GetSubstructMatches` 逐字比對。
- rawQuery（R3）：任意 SMILES × SMARTS 的原始配對，探測 uniquify、手性、芳香對共軛、遞迴、配對順序等參數。
- smarts（R4）：每一列 SMARTS 在 Python 都能解析，正反例的原始配對與第一個命中與 TS 相同；另有無法解析的 SMARTS 兩邊都判為無法解析。
- families：buildYgFamilies 的家族清單（切分順序、基團原子數）。
R1（芳香性）專屬案例 id 以 'R1/' 開頭，R2（氫數與索引）'R2/'，R3 以 'R3/' 開頭（rawMatches 為 'R3/raw/'），R4 以 'R4/'，R5 以 'R5/'
（改寫重建的細節為 'R5/rebuild/'）。比對規則同 M00（字串、整數、陣列逐字；浮點先比最短字串，不同才允許 1e-12 並列入 tolerance_cases）。
"""

from __future__ import annotations

import pytest
from rdkit import Chem, RDLogger

import golden_compare as gc
from moleform_core import tg
from moleform_core.mol_graph import mol_from_smiles
from moleform_core.vw import raw_matches

GOLDEN_MODULE = "tg"
CASES = gc.golden_cases(GOLDEN_MODULE)
BY_KIND: dict[str, list[tuple[str, dict, object]]] = {
    "compute": [], "r5": [], "rawMatches": [], "rawQuery": [], "smarts": [], "families": [],
}  # fmt: skip
for _id, _inp, _out in CASES:
    BY_KIND[_inp["kind"]].append((_id, _inp, _out))

RDLogger.DisableLog("rdApp.*")


def _ids(kind: str) -> list[str]:
    return [c[0] for c in BY_KIND[kind]]


def _all_rows() -> list[tuple[str, str, str]]:
    """(id, SMARTS, 資料表)：書中基團表與校準基團表的每一列。"""
    return [
        *((r.id, r.smarts, "yg_groups") for r in tg.load_yg_groups()),
        *((r.id, r.smarts, "yg_calibrated_groups") for r in tg.load_yg_calibrated()),
    ]


def _compute(inp: dict) -> dict:
    opts = inp["options"]
    kwargs = {}
    if "partition" in opts:
        kwargs["partition"] = opts["partition"]
    if "calibrated" in opts:
        kwargs["calibrated"] = opts["calibrated"]
    return tg.compute_tg(inp["smiles"], **kwargs)


# ---------- compute ----------


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["compute"], ids=_ids("compute"))
def test_compute(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    if isinstance(out, dict) and set(out) == {"threw"}:
        with pytest.raises(ValueError):
            _compute(inp)
        return
    gc.assert_case(GOLDEN_MODULE, case_id, out, _compute(inp))


# ---------- R5：改寫後重建分子 ----------


def _describe_rebuild(o: tg.StripOutcome) -> dict:
    return {
        "atoms": [[a.z, a.imp_hs, a.chg, a.n_rad, a.isotope, a.stereo] for a in o.atoms],
        "bonds": [b.to_json() for b in o.bonds],
        "hasExtensions": False,  # Python 端的改寫從不帶芳香性資訊（對應 TS 的 delete m.extensions）
        "built": o.built,
        "canonicalSmiles": o.smiles,
    }


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["r5"], ids=_ids("r5"))
def test_r5_rebuild(golden_version_ok: str, case_id: str, inp: dict, out: dict, monkeypatch: pytest.MonkeyPatch) -> None:
    """R5：結果、改寫後的原子順序與氫數、鍵與 stereoAtoms、canonical SMILES 與 TS 逐字相同。"""
    recorded: list[tg.StripOutcome] = []
    real = tg.strip_outcome

    def spy(mol: Chem.Mol, drop: set[int]) -> tg.StripOutcome:
        outcome = real(mol, drop)
        recorded.append(outcome)
        return outcome

    monkeypatch.setattr(tg, "strip_outcome", spy)
    actual = {"result": tg.compute_tg(inp["smiles"]), "rebuilds": [_describe_rebuild(o) for o in recorded]}
    gc.assert_case(GOLDEN_MODULE, case_id, out, actual)


# ---------- R3：原始配對順序 ----------


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["rawMatches"], ids=_ids("rawMatches"))
def test_raw_matches(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    """R3：原始配對順序（未排序）逐字相同。"""
    mol = mol_from_smiles(inp["smiles"])
    assert mol is not None
    actual = {}
    for smarts in dict.fromkeys(s for _, s, _ in _all_rows()):
        m = raw_matches(mol, Chem.MolFromSmarts(smarts))
        if m:
            actual[smarts] = m
    gc.assert_case(GOLDEN_MODULE, case_id, out, actual)


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["rawQuery"], ids=_ids("rawQuery"))
def test_raw_query_params(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    """R3：配對參數探針。RDKit.js 不帶 details 的預設行為，要與 Python 明確設定的 SUBSTRUCT_PARAMS 一致。"""
    mol = mol_from_smiles(inp["smiles"])
    q = Chem.MolFromSmarts(inp["smarts"])
    assert mol is not None and q is not None
    gc.assert_case(GOLDEN_MODULE, case_id, out, raw_matches(mol, q))


# ---------- R4：SMARTS 解析與正反例 ----------


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["smarts"], ids=_ids("smarts"))
def test_smarts(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    """R4：SMARTS 可解析，正反例的原始配對與第一個命中與 TS 相同。資料表列的 SMARTS 取自 Python 實際載入的 CSV，且必須與黃金檔記錄的相同。"""
    smarts = inp["smarts"]
    if inp["rowId"] is not None:
        row = next((r for r in _all_rows() if r[0] == inp["rowId"]), None)
        assert row is not None, f"資料表沒有 {inp['rowId']}"
        assert row[1] == smarts, f"{inp['rowId']} 的 SMARTS 與黃金檔不同（資料表改了，請重產黃金檔）"
        py_row = next(
            (r for r in [*tg.load_yg_groups(), *tg.load_yg_calibrated()] if r.id == inp["rowId"]), None
        )
        assert py_row is not None
        assert list(py_row.positives) == inp["positives"] and list(py_row.negatives) == inp["negatives"], (
            f"{inp['rowId']} 的正反例與黃金檔不同（資料表改了，請重產黃金檔）"
        )
    q = Chem.MolFromSmarts(smarts)
    actual: dict = {"valid": q is not None, "positives": {}, "negatives": {}}
    if q is not None:
        for key in ("positives", "negatives"):
            for s in inp[key]:
                mol = mol_from_smiles(s)
                actual[key][s] = {"invalid": True} if mol is None else {"raw": raw_matches(mol, q), "first": tg.first_match(mol, q)}
    gc.assert_case(GOLDEN_MODULE, case_id, out, actual)


# ---------- families ----------


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["families"], ids=_ids("families"))
def test_families(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    rows = list(tg.load_yg_groups())
    if inp["withCalibratedWhole"]:
        rows += [tg.calibrated_as_yg_row(r) for r in tg.load_yg_calibrated() if r.kind == "整體基團"]
    actual = [
        {"id": f.id, "name": f.name, "smarts": f.smarts, "section": f.section, "kind": f.kind, "size": f.size, "order": f.order, "rowIds": [r.id for r in f.rows]}
        for f in tg.build_yg_families(rows)
    ]
    gc.assert_case(GOLDEN_MODULE, case_id, out, actual)


# ---------- 覆蓋與專屬案例 ----------


def test_every_table_row_has_smarts_case() -> None:
    ids = {c[1]["rowId"] for c in BY_KIND["smarts"] if c[1]["rowId"] is not None}
    assert ids == {r[0] for r in _all_rows()}, "黃金檔的 SMARTS 案例必須剛好涵蓋兩張資料表的每一列"
    assert len(_all_rows()) == len(tg.load_yg_groups()) + len(tg.load_yg_calibrated())


def test_every_table_row_parses_in_python() -> None:
    for rid, smarts, _ in _all_rows():
        assert Chem.MolFromSmarts(smarts) is not None, f"{rid} 的 SMARTS Python 無法解析"


def test_dedicated_risk_cases_present() -> None:
    ids = [c[0] for c in CASES]
    r1 = [i for i in ids if i.startswith("R1/")]
    r2 = [i for i in ids if i.startswith("R2/")]
    r3 = [i for i in ids if i.startswith("R3/") and not i.startswith("R3/raw/")]
    r4 = [i for i in ids if i.startswith("R4/")]
    r5 = [i for i in ids if i.startswith("R5/rebuild/R5/")]
    assert any("star" in i for i in r1), "R1 需要含 * 的重複單元案例"
    assert any("pyridine" in i or "thiophene" in i or "furan" in i for i in r1), "R1 需要雜環案例"
    assert any("naphthalene" in i or "anthracene" in i or "carbazole" in i for i in r1), "R1 需要稠環案例"
    assert any("PMMA" in i or "PVAc" in i or "PMDA" in i for i in r3), "R3 需要需要優先順序判斷的基團案例"
    assert len([i for i in ids if i.startswith("R3/raw/")]) > 100
    assert len(r2) >= 10
    assert len(r4) >= len(_all_rows()) + 5
    assert any(i.startswith("R4/invalid/") for i in r4), "R4 需要無法解析的 SMARTS 案例"
    # R5：含 *、雜環、稠環、手性、雙鍵立體，且確實走到改寫重建
    reached = {c[0]: c[2] for c in BY_KIND["r5"] if c[0].startswith("R5/rebuild/R5/") and c[2]["rebuilds"]}  # type: ignore[index]
    assert len(reached) >= 100, "R5 專屬案例需要至少 100 個走到改寫重建"
    for needle in ("star-", "hetero-", "fused-", "chiral-", "dbl-"):
        assert any(needle in i for i in reached), f"R5 需要 {needle} 類案例"
    assert any(i.startswith("R5/rebuild/R5/control-") and not c["rebuilds"] for i, c in ((c[0], c[2]) for c in BY_KIND["r5"])), "R5 需要不走改寫的對照案例"  # type: ignore[index]
    assert len(r5) >= 100


def test_r5_cases_cover_stereo_outcomes() -> None:
    """R5 的立體案例要涵蓋三種結果：手性保留、雙鍵順反被清掉（canonical SMILES 不帶 / \\）、stereoAtoms 過期使重建失敗。"""
    outs = {c[0]: c[2] for c in BY_KIND["r5"]}  # type: ignore[index]
    chiral = outs["R5/rebuild/R5/chiral-star-S"]["rebuilds"][0]  # type: ignore[index]
    assert chiral["built"] and "@" in chiral["canonicalSmiles"]
    kept = outs["R5/rebuild/R5/dbl-trans-star"]["rebuilds"][0]  # type: ignore[index]
    assert kept["built"] and "/" not in kept["canonicalSmiles"] and "\\" not in kept["canonicalSmiles"]
    assert any(b["stereo"] == "trans" for b in kept["bonds"])
    failed = outs["R5/rebuild/R5/dbl-trans-OH-first"]["rebuilds"][0]  # type: ignore[index]
    assert failed["built"] is False and failed["canonicalSmiles"] is None
    assert outs["R5/rebuild/R5/dbl-trans-OH-first"]["result"]["status"] == "missing"  # type: ignore[index]
