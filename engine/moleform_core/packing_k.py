"""使用者的堆積係數 k 與純聚物 Tg 表。對應 src/core/data/packingCoefficientK.ts（任務 M05 組 1-2；D62／D63）。

資料表直接讀專案的 src/data/packing_coefficient_k.csv（單一來源）。格式有問題時拋出 `TableDataError`（TS 靜默丟列，記為已知差異）。
命名同 TS：`packing_k` 是小寫 k（Vω／V，0 到 1）；與 Δα 覆寫值 K（1／Δα）是不同的量。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Sequence

from .csv_reader import js_number, js_trim
from .tables import TableDataError, make_fail, read_data_file, read_records

PACKING_K_FILE = "packing_coefficient_k.csv"
PACKING_K_COLUMNS = ["id", "結構類別", "材料名稱", "k", "Tg原文", "Tg下限", "Tg上限", "Tg近似", "出處", "稽核狀態", "備註"]
PACKING_K_NOT_FOUND = "k 表無此材料"
TG_BLANK_MARK = "—"
TG_TABLE_BLANK = "表中無 Tg，請輸入"
TG_LABEL_MIDPOINT = "範圍中點"
TG_LABEL_APPROX = "近似值"

_NUMBER = re.compile(r"-?[0-9]+(?:\.[0-9]+)?", re.ASCII)
_TG_TEXT = re.compile(r"(-?[0-9]+(?:\.[0-9]+)?)(?:–(-?[0-9]+(?:\.[0-9]+)?))?", re.ASCII)


@dataclass(frozen=True)
class PackingKRow:
    id: str
    category: str
    name: str
    packing_k: float
    packing_k_text: str
    tg_text: str
    tg_lower_c: float | None
    tg_upper_c: float | None
    tg_approx: bool
    source: str
    audit: str
    notes: str


def parse_tg_text(text: str) -> dict[str, Any]:
    """解析 Tg 原文：單值、範圍（en dash）、近似（「約」）、沒有（「—」）。"""
    t = js_trim(text)
    if t == TG_BLANK_MARK:
        return {"status": "blank"}
    approx = t.startswith("約")
    body = js_trim(t[1:]) if approx else t
    m = _TG_TEXT.fullmatch(body)
    if not m:
        return {"status": "invalid", "message": f"無法解析的 Tg 寫法：「{text}」（可接受：數值、「下限–上限」、前面加「約」、或「{TG_BLANK_MARK}」）"}
    lower = js_number(m.group(1))
    upper = lower if m.group(2) is None else js_number(m.group(2))
    if upper < lower:
        return {"status": "invalid", "message": f"Tg 範圍的上限小於下限：「{text}」"}
    return {"status": "ok", "lowerC": lower, "upperC": upper, "approx": approx}


def read_packing_k(text: str) -> tuple[list[PackingKRow], list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []
    fail = make_fail(PACKING_K_FILE, issues)
    rows: list[PackingKRow] = []
    for rec, no in read_records(text, PACKING_K_FILE, PACKING_K_COLUMNS, fail) or []:
        id_, category, name, k_text, tg_text, lower_text, upper_text, approx_text, source, audit, notes = rec
        ok = True
        if not _NUMBER.fullmatch(k_text):
            fail(no, "k", "必填欄位是空的" if k_text == "" else f"不是數字：「{k_text}」")
            ok = False
        for col, v in (("Tg下限", lower_text), ("Tg上限", upper_text)):
            if v != "" and not _NUMBER.fullmatch(v):
                fail(no, col, f"不是數字：「{v}」")
                ok = False
        if approx_text != "true" and approx_text != "false":
            fail(no, "Tg近似", "必填欄位是空的" if approx_text == "" else f"只能是 true 或 false：「{approx_text}」")
            ok = False
        if not ok:
            continue
        rows.append(
            PackingKRow(
                id_,
                category,
                name,
                js_number(k_text),
                k_text,
                tg_text,
                None if lower_text == "" else js_number(lower_text),
                None if upper_text == "" else js_number(upper_text),
                approx_text == "true",
                source,
                audit,
                notes,
            )
        )
    return rows, issues


@lru_cache(maxsize=1)
def load_packing_k_rows() -> tuple[PackingKRow, ...]:
    rows, issues = read_packing_k(read_data_file(PACKING_K_FILE))
    if issues:
        raise TableDataError(issues)
    return tuple(rows)


def find_packing_k_row(name: str, rows: Sequence[PackingKRow] | None = None) -> PackingKRow | None:
    """依材料名稱取列：精確比對（逐字相同，不修剪、不做近似）；查不到回傳 None。"""
    rows = load_packing_k_rows() if rows is None else rows
    for r in rows:
        if r.name == name:
            return r
    return None


def table_tg_of(row: PackingKRow) -> dict[str, Any]:
    """表內 Tg（°C）：範圍取中點並標「範圍中點」；有「約」標「近似值」；空白回報「表中無 Tg，請輸入」。"""
    if row.tg_lower_c is None or row.tg_upper_c is None:
        return {"status": "blank", "raw": row.tg_text, "message": TG_TABLE_BLANK}
    labels: list[str] = []
    is_range = row.tg_lower_c != row.tg_upper_c
    if is_range:
        labels.append(TG_LABEL_MIDPOINT)
    if row.tg_approx:
        labels.append(TG_LABEL_APPROX)
    return {
        "status": "ok",
        "tgC": (row.tg_lower_c + row.tg_upper_c) / 2 if is_range else row.tg_lower_c,
        "lowerC": row.tg_lower_c,
        "upperC": row.tg_upper_c,
        "raw": row.tg_text,
        "labels": labels,
    }
