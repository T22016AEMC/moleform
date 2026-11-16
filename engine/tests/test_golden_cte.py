"""黃金比對：CTE（src/core/properties/cte.ts ↔ engine/moleform_core/cte.py）。任務 M03。

黃金檔 tests/golden/cte.json 的案例種類（input.kind）：
- compute：computeCte 的完整輸出（ok／notApplicable／missing／invalid；式 4.27 的 Tg 缺基團、Tg 低於 298 K 的備註）。
  Python 端直接呼叫 vw.compute_vdw_volume 與 tg.compute_tg（不經 HTTP）。
- cteFromVw：純計算（mass 為 null、VW 為 0 或負數、極大／極小數字）。
- glassAlpha：式 4.27 的純計算（含 V_g(298) 為 0 的除以零）。
比對規則同 M00（字串、整數、陣列逐字；浮點先比最短字串，不同才允許 1e-12 並列入 tolerance_cases）。
"""

from __future__ import annotations

import pytest
from rdkit import RDLogger

import golden_compare as gc
from moleform_core import cte

GOLDEN_MODULE = "cte"
CASES = gc.golden_cases(GOLDEN_MODULE)
KINDS = ("compute", "cteFromVw", "glassAlpha")
BY_KIND: dict[str, list[tuple[str, dict, object]]] = {k: [] for k in KINDS}
for _id, _inp, _out in CASES:
    BY_KIND[_inp["kind"]].append((_id, _inp, _out))

RDLogger.DisableLog("rdApp.*")


def _ids(kind: str) -> list[str]:
    return [c[0] for c in BY_KIND[kind]]


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["compute"], ids=_ids("compute"))
def test_compute(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    gc.assert_case(GOLDEN_MODULE, case_id, out, cte.compute_cte(inp["smiles"]))


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["cteFromVw"], ids=_ids("cteFromVw"))
def test_cte_from_vw(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    vw, mass = gc.plain(inp["vw"]), gc.plain(inp["mass"])
    gc.assert_case(GOLDEN_MODULE, case_id, out, cte.cte_from_vw(float(vw), None if mass is None else float(mass)))


@pytest.mark.parametrize(("case_id", "inp", "out"), BY_KIND["glassAlpha"], ids=_ids("glassAlpha"))
def test_glass_alpha(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    gc.assert_case(GOLDEN_MODULE, case_id, out, cte.glass_alpha_from_tg(float(gc.plain(inp["vw"])), float(gc.plain(inp["tgK"]))))


# ---------- 覆蓋 ----------


def test_coverage_of_result_kinds() -> None:
    outs = [(c[0], c[2]) for c in BY_KIND["compute"]]
    statuses = {o["status"] for _, o in outs}  # type: ignore[index]
    assert statuses == {"ok", "notApplicable", "missing", "invalid"}
    ok = [(i, o) for i, o in outs if o["status"] == "ok"]  # type: ignore[index]
    assert any(o["glassyFromTg"]["status"] == "missing" for _, o in ok), "需要 VW 可算但 Tg 缺基團的案例"  # type: ignore[index]
    assert any(o["glassyFromTg"]["status"] == "ok" and o["glassyFromTg"]["note"] is not None for _, o in ok), "需要 Tg 低於 298 K 的案例"  # type: ignore[index]
    assert any(o["glassyFromTg"]["status"] == "ok" and o["glassyFromTg"]["note"] is None for _, o in ok)  # type: ignore[index]
    assert any(o["vwBondiSupplement"] is True for _, o in ok), "需要用到 Bondi 補充基團的案例"  # type: ignore[index]
    assert any(i.startswith("boundary/") for i, _ in outs), "需要 Tg 在 298 K 附近的案例"


def test_tg_298k_boundary_cases() -> None:
    """式 4.27 備註的門檻（Tg < 298 K）：兩側各有緊鄰的案例（低側 0.001 K 以內，高側 0.1 K 以內）。"""
    oks = {c[0]: c[2] for c in BY_KIND["compute"] if c[0].startswith("boundary/") and c[2]["status"] == "ok"}  # type: ignore[index]
    tg_ks = {i: float(o["glassyFromTg"]["tgK"].raw) for i, o in oks.items() if o["glassyFromTg"]["status"] == "ok"}  # type: ignore[index]
    below = {i: v for i, v in tg_ks.items() if v < 298}
    above = {i: v for i, v in tg_ks.items() if v >= 298}
    assert any(298 - v < 0.001 for v in below.values()), below
    assert any(v - 298 < 0.1 for v in above.values()), above
    for i in below:
        assert oks[i]["glassyFromTg"]["note"] is not None  # type: ignore[index]
    for i in above:
        assert oks[i]["glassyFromTg"]["note"] is None  # type: ignore[index]
