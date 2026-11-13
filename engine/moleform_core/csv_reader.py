"""CSV 讀取與欄位檢查。對應 src/core/data/csv.ts（parseCsv）與 src/core/data/readers.ts（readTable、splitList）。

規則與 TypeScript 逐條相同（D22：缺欄位、欄位數不符、數字或整數清單轉換失敗一律回報在 issues，不靜默略過）。
為了與 JS 的字串處理逐字一致，這裡另外實作了 JS 的 `String.prototype.trim` 與 `Number(string)`：
Python 的 `str.strip()`、`float()`、`re` 的 `\\d` 與 `$` 規則都與 JS 不同（例如 float('1_000')、'nan'、全形數字）。
"""

from __future__ import annotations

import math
import re
from typing import Any, TypedDict

LIST_SEPARATOR = "|"


class CsvError(Exception):
    """對應 TS 的 CsvError；message 與 TS 逐字相同。"""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


# ---------- JS 相容的字串工具 ----------

# ECMAScript WhiteSpace + LineTerminator（String.prototype.trim 去除的字元）
_JS_WHITESPACE = (
    "\u0009\u000a\u000b\u000c\u000d   "
    "           "
    "    　﻿"
)


def js_trim(s: str) -> str:
    return s.strip(_JS_WHITESPACE)


_DECIMAL = re.compile(r"[+-]?(?:Infinity|(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)", re.ASCII)
_NON_DECIMAL = re.compile(r"0(?:[xX][0-9a-fA-F]+|[oO][0-7]+|[bB][01]+)", re.ASCII)


def js_number(s: str) -> float:
    """JS 的 `Number(string)`（StringToNumber）；無法轉換時回傳 NaN。"""
    t = js_trim(s)
    if t == "":
        return 0.0
    if _DECIMAL.fullmatch(t):
        if t.lstrip("+-") == "Infinity":
            return -math.inf if t.startswith("-") else math.inf
        return float(t)
    if _NON_DECIMAL.fullmatch(t):
        base = {"x": 16, "o": 8, "b": 2}[t[1].lower()]
        return float(int(t[2:], base))
    return math.nan


# ---------- parseCsv ----------


def parse_csv(text: str) -> list[list[str]]:
    """解析 CSV 文字為二維字串陣列。完全空白的行（含檔尾換行）會被略過。"""
    if text[:1] == "﻿":
        text = text[1:]

    records: list[list[str]] = []
    record: list[str] = []
    field = ""
    in_quotes = False
    field_quoted = False
    i = 0
    n = len(text)

    def end_field() -> None:
        nonlocal field, field_quoted
        record.append(field)
        field = ""
        field_quoted = False

    def end_record() -> None:
        nonlocal record
        quoted = field_quoted
        end_field()
        # 只有一個未加引號的空欄位 → 空行
        if not (len(record) == 1 and record[0] == "" and not quoted):
            records.append(record)
        record = []

    while i < n:
        ch = text[i]
        if in_quotes:
            if ch == '"':
                if i + 1 < n and text[i + 1] == '"':
                    field += '"'
                    i += 2
                    continue
                in_quotes = False
                i += 1
                continue
            field += ch
            i += 1
            continue
        if ch == '"':
            if field != "" or field_quoted:
                raise CsvError(f"第 {len(records) + 1} 筆記錄：引號出現在欄位中間")
            in_quotes = True
            field_quoted = True
            i += 1
        elif ch == ",":
            end_field()
            i += 1
        elif ch in ("\r", "\n"):
            end_record()
            i += 2 if ch == "\r" and i + 1 < n and text[i + 1] == "\n" else 1
        else:
            if field_quoted:
                raise CsvError(f"第 {len(records) + 1} 筆記錄：引號欄位結束後還有多餘字元")
            field += ch
            i += 1
    if in_quotes:
        raise CsvError("引號沒有結束")
    if field != "" or field_quoted or len(record) > 0:
        end_record()
    return records


# ---------- readTable ----------


class ColumnDef(TypedDict):
    name: str
    kind: str  # 'string' | 'list' | 'number' | 'intList'


class TableDef(TypedDict):
    file: str
    columns: list[ColumnDef]


_INT_TOKEN = re.compile(r"[0-9]+", re.ASCII)


def split_list(value: str) -> list[str]:
    if js_trim(value) == "":
        return []
    return [js_trim(x) for x in value.split(LIST_SEPARATOR)]


def read_table(table: TableDef, text: str) -> dict[str, Any]:
    """解析 CSV、核對標題列、把 `|` 清單與數字欄位轉型。回傳 {rows, rowNumbers, issues}（欄位名稱同 TS）。"""
    issues: list[dict[str, Any]] = []

    def fail(row: int | None, column: str | None, message: str) -> None:
        issues.append({"file": table["file"], "row": row, "column": column, "message": message})

    try:
        records = parse_csv(text)
    except CsvError as e:
        fail(None, None, f"CSV 格式錯誤：{e.message}")
        return {"rows": [], "rowNumbers": [], "issues": issues}

    expected = [c["name"] for c in table["columns"]]
    header = records[0] if records else None
    if header is None:
        fail(1, None, f"檔案是空的，缺少標題列（應為：{','.join(expected)}）")
        return {"rows": [], "rowNumbers": [], "issues": issues}
    if header != expected:
        fail(1, None, f"標題列與定義不一致。應為：{','.join(expected)}；實際為：{','.join(header)}")
        return {"rows": [], "rowNumbers": [], "issues": issues}

    rows: list[dict[str, Any]] = []
    row_numbers: list[int] = []
    for r in range(1, len(records)):
        row_no = r + 1
        record = records[r]
        if len(record) != len(expected):
            fail(row_no, None, f"欄位數應為 {len(expected)}，實際為 {len(record)}")
            continue
        row: dict[str, Any] = {}
        for col, raw in zip(table["columns"], record):
            name, kind = col["name"], col["kind"]
            if kind == "string":
                row[name] = js_trim(raw)
            elif kind == "list":
                row[name] = split_list(raw)
            elif kind == "number":
                t = js_trim(raw)
                if t == "":
                    row[name] = None
                else:
                    v = js_number(t)
                    if not math.isfinite(v):
                        fail(row_no, name, f"無法轉成數字：「{raw}」")
                        row[name] = None
                    else:
                        row[name] = v
            elif kind == "intList":
                values: list[float] = []
                for x in split_list(raw):
                    if _INT_TOKEN.fullmatch(x):
                        values.append(js_number(x))
                    else:
                        fail(row_no, name, f"應為以 {LIST_SEPARATOR} 分隔的整數，但有「{x}」")
                row[name] = values
            else:
                raise ValueError(f"未知的欄位型別：{kind}")
        rows.append(row)
        row_numbers.append(row_no)
    return {"rows": rows, "rowNumbers": row_numbers, "issues": issues}
