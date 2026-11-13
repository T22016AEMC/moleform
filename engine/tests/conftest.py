"""pytest 共用設定（任務 M00）：黃金比對的版本檢查與 tolerance_cases 輸出。

執行：engine/.venv/Scripts/python -m pytest engine/tests
放寬的浮點案例寫到 engine/.reports/tolerance_cases.json（可用環境變數 MOLEFORM_TOLERANCE_REPORT 改路徑），並列在終端摘要。
"""

from __future__ import annotations

import json
import os

import pytest

import golden_compare as gc

REPORT_PATH = os.environ.get("MOLEFORM_TOLERANCE_REPORT") or os.path.join(gc.ENGINE_DIR, ".reports", "tolerance_cases.json")


@pytest.fixture(scope="module")
def golden_version_ok(request: pytest.FixtureRequest) -> str:
    """測試模組的 GOLDEN_MODULE 黃金檔與引擎 RDKit 版本必須一致，否則拒絕比對（測試失敗，不是略過）。"""
    module = request.module.GOLDEN_MODULE
    doc = gc.load_golden(module)
    try:
        gc.check_version(doc)
    except gc.VersionMismatchError as e:
        pytest.fail(str(e), pytrace=False)
    return module


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump({"tolerance_cases": gc.tolerance_report()}, f, ensure_ascii=False, indent=1)
        f.write("\n")


def pytest_terminal_summary(terminalreporter, exitstatus: int, config: pytest.Config) -> None:
    cases = gc.tolerance_report()
    terminalreporter.section("golden tolerance_cases")
    terminalreporter.write_line(f"放寬（相對誤差 ≤ {gc.REL_FALLBACK}）的浮點案例：{len(cases)} 個；清單：{REPORT_PATH}")
    for c in cases:
        terminalreporter.write_line(f"  {c['module']} {c['case_id']} {c['path']}: golden={c['golden']} python={c['python']} rel={c['rel_err']:.3e}")
