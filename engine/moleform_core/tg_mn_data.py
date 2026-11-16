"""Fox–Flory K 表。對應 src/core/data/tgMnData.ts 的 `readTgK`、`TG_K_ROWS`（任務 M05 組 1-4；D62／D63）。

資料表直接讀專案的 src/data/tg_flory_k.csv（單一來源）。計算只需要 K 表（Tg–Mn 資料點表 `tg_mn_points.csv` 只用於資料檢查與擬合驗證，不在計算路徑上，未搬）。
格式有問題時拋出 `TableDataError`（TS 的 `TG_K_ROWS` 靜默丟掉格式錯誤的列，記為已知差異）。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from .csv_reader import js_number, js_trim, parse_csv, CsvError
from .tables import TableDataError, make_fail, read_data_file

TG_K_FILE = "tg_flory_k.csv"
TG_K_COLUMNS = [
    "類別", "類別名稱", "代表單元 SMILES", "狀態", "Tg∞固定值_K", "文獻Tg_K", "K", "K不確定度", "Mn下限", "Mn上限", "可信度",
    "擬合點", "檢驗點", "檢驗最大誤差_K", "擬合方式", "出處", "稽核狀態", "備註", "Tg∞來源", "Tg∞不確定度_K", "檢驗方式",
]  # fmt: skip

_NUMBER = re.compile(r"-?[0-9]+(?:\.[0-9]+)?", re.ASCII)


@dataclass(frozen=True)
class TgKRow:
    resin_class: str
    class_name: str
    unit_smiles: str
    state: str
    tg_inf_fixed_k: float | None
    literature_tg_k: float | None
    k: float | None
    k_uncertainty: float | None
    mn_min: float | None
    mn_max: float | None
    confidence: str
    fit_points: tuple[str, ...]
    check_points: tuple[str, ...]
    check_max_error_k: float | None
    fit_method: str
    source: str
    audit: str
    notes: str
    tg_inf_source: str
    tg_inf_uncertainty_k: float | None
    check_mode: str


def _split(s: str) -> tuple[str, ...]:
    return tuple(x for x in (js_trim(p) for p in s.split("|")) if x != "")


def read_tg_k(text: str) -> tuple[list[TgKRow], list[dict[str, Any]]]:
    issues: list[dict[str, Any]] = []
    fail = make_fail(TG_K_FILE, issues)
    try:
        recs = parse_csv(text)
    except CsvError as e:
        fail(None, None, f"CSV 格式錯誤：{e.message}")
        return [], issues
    if not recs:
        fail(1, None, f"檔案是空的，缺少標題列（應為：{','.join(TG_K_COLUMNS)}）")
        return [], issues
    header = recs[0]
    if len(header) != len(TG_K_COLUMNS) or any(h != TG_K_COLUMNS[i] for i, h in enumerate(header)):
        fail(1, None, f"標題列與定義不一致。應為：{','.join(TG_K_COLUMNS)}；實際為：{','.join(header)}")
        return [], issues
    rows: list[TgKRow] = []
    for r in range(1, len(recs)):
        rec = recs[r]
        no = r + 1
        if len(rec) != len(TG_K_COLUMNS):
            fail(no, None, f"欄位數應為 {len(TG_K_COLUMNS)}，實際為 {len(rec)}")
            continue
        c = [js_trim(s) for s in rec]
        bad = False
        nums: dict[int, float | None] = {}
        for i in (4, 5, 6, 7, 8, 9, 13, 19):
            t = c[i]
            if t == "":
                nums[i] = None
            elif not _NUMBER.fullmatch(t):
                fail(no, TG_K_COLUMNS[i], f"不是數字：「{rec[i]}」")
                bad = True
            else:
                nums[i] = js_number(t)
        if bad:
            continue
        rows.append(
            TgKRow(
                c[0], c[1], c[2], c[3], nums[4], nums[5], nums[6], nums[7], nums[8], nums[9], c[10], _split(c[11]), _split(c[12]),
                nums[13], c[14], c[15], c[16], c[17], c[18], nums[19], c[20],
            )
        )  # fmt: skip
    return rows, issues


@lru_cache(maxsize=1)
def load_tg_k_rows() -> tuple[TgKRow, ...]:
    rows, issues = read_tg_k(read_data_file(TG_K_FILE))
    if issues:
        raise TableDataError(issues)
    return tuple(rows)
