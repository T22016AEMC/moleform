"""黃金比對：原子量（src/core/properties/atomicWeights.ts ↔ engine/moleform_core/atomic_weights.py）。"""

from __future__ import annotations

import pytest

import golden_compare as gc
from moleform_core.atomic_weights import ATOMIC_WEIGHTS, atomic_weight

GOLDEN_MODULE = "atomicWeights"
CASES = gc.golden_cases(GOLDEN_MODULE)


@pytest.mark.parametrize(("case_id", "inp", "out"), CASES, ids=[c[0] for c in CASES])
def test_golden(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    if case_id == "table":
        actual = {str(z): w for z, w in ATOMIC_WEIGHTS.items()}  # JS 物件的鍵是字串
    else:
        actual = atomic_weight(gc.plain(inp["z"]))
    gc.assert_case(GOLDEN_MODULE, case_id, out, actual)
