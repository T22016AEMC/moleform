"""資料表讀取的共用小工具（任務 M05）：對應各 TS 資料表模組內重複出現的 `readRecords`（解析 CSV、核對標題列、去空白）。

規則與 TS 相同；格式問題記在 issues（`{file, row, column, message}`），由各模組的 `load_*` 在有任何問題時拋出
`TableDataError`（D22；TS 的 `FOO_ROWS = readFoo(csv).rows` 會靜默丟掉格式錯誤的列，記為已知差異，不改 TS）。
"""

from __future__ import annotations

import os
from typing import Any, Callable

from .csv_reader import CsvError, js_trim, parse_csv
from .vw import DATA_DIR


class TableDataError(Exception):
    """資料表格式錯誤（D22：不靜默略過）。"""

    def __init__(self, issues: list[Any]):
        super().__init__("；".join(str(i) for i in issues))
        self.issues = issues


def read_data_file(name: str) -> str:
    with open(os.path.join(DATA_DIR, name), encoding="utf-8", newline="") as f:
        return f.read()


def read_records(
    text: str, file: str, columns: list[str], fail: Callable[[int | None, str | None, str], None]
) -> list[tuple[list[str], int]] | None:
    """對應 readRecords：回傳 [(各欄去空白後的字串, 列號)]；標題列或 CSV 有問題時回傳 None。"""
    try:
        records = parse_csv(text)
    except CsvError as e:
        fail(None, None, f"CSV 格式錯誤：{e.message}")
        return None
    if not records:
        fail(1, None, f"檔案是空的，缺少標題列（應為：{','.join(columns)}）")
        return None
    header = records[0]
    if len(header) != len(columns) or any(h != columns[i] for i, h in enumerate(header)):
        fail(1, None, f"標題列與定義不一致。應為：{','.join(columns)}；實際為：{','.join(header)}")
        return None
    out: list[tuple[list[str], int]] = []
    for r in range(1, len(records)):
        if len(records[r]) != len(columns):
            fail(r + 1, None, f"欄位數應為 {len(columns)}，實際為 {len(records[r])}")
            continue
        out.append(([js_trim(s) for s in records[r]], r + 1))
    return out


def make_fail(file: str, issues: list[dict[str, Any]]) -> Callable[[int | None, str | None, str], None]:
    def fail(row: int | None, column: str | None, message: str) -> None:
        issues.append({"file": file, "row": row, "column": column, "message": message})

    return fail
