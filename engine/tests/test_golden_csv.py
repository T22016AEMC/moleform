"""黃金比對：CSV 讀取（src/core/data/csv.ts、readers.ts ↔ engine/moleform_core/csv_reader.py）。"""

from __future__ import annotations

from typing import Any, Callable

import pytest

import golden_compare as gc
from moleform_core.csv_reader import CsvError, parse_csv, read_table, split_list

GOLDEN_MODULE = "csv"
CASES = gc.golden_cases(GOLDEN_MODULE)


def _run(fn: Callable[[], Any]) -> dict[str, Any]:
    try:
        return {"value": fn()}
    except CsvError as e:
        return {"error": {"name": "CsvError", "message": e.message}}


@pytest.mark.parametrize(("case_id", "inp", "out"), CASES, ids=[c[0] for c in CASES])
def test_golden(golden_version_ok: str, case_id: str, inp: dict, out: object) -> None:
    fn = inp["fn"]
    if fn == "parseCsv":
        actual = _run(lambda: parse_csv(inp["text"]))
    elif fn == "splitList":
        actual = _run(lambda: split_list(inp["value"]))
    elif fn == "readTable":
        actual = _run(lambda: read_table(inp["table"], inp["text"]))
    else:
        raise AssertionError(f"未知的函式 {fn}")
    gc.assert_case(GOLDEN_MODULE, case_id, out, actual)
