"""P6E 資料表讀取：Rao／Hartmann 函數（Table 14.4）、內聚能 Ecoh（Table 7.1）、熔化熱 ΔHm（Table 5.7）。

資料表都在 `src/data/`（單一來源，D18、D22；本模組不含任何基團數值）。三張表的格式問題一律拋出 ModulusTableError（D22：不靜默略過）。
Rao 表轉成 tg.YgGroupRow 後交給 Tm／Td 同一個切分程式（大基團優先於小基團）；U_H、Ecoh、ΔHm 依切分結果的 rowId 另外查表。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache

from .csv_reader import js_trim
from .tg import YgGroupRow, _read_file, _split_list
from .y_tables import _records, parse_book_number

RAO_FILE = "rao_hartmann_groups.csv"
ECOH_FILE = "ecoh_groups.csv"
HM_FILE = "hm_groups.csv"

RAO_COLUMNS = ["id", "基團名稱", "SMARTS", "U_R", "U_H", "表格區段", "類型", "出處", "稽核狀態", "正例 SMILES", "反例 SMILES", "備註"]
ECOH_COLUMNS = ["id", "基團名稱", "SMARTS", "Ecoh（J/mol）", "表格區段", "出處", "稽核狀態", "正例 SMILES", "反例 SMILES", "備註"]
HM_COLUMNS = ["id", "基團名稱", "SMARTS", "ΔHm（kJ/mol）", "表格區段", "出處", "稽核狀態", "正例 SMILES", "反例 SMILES", "備註"]


class ModulusTableError(Exception):
    """資料表格式錯誤（D22：不靜默略過）。"""

    def __init__(self, issues: list[str]):
        super().__init__("；".join(issues))
        self.issues = issues


@dataclass(frozen=True)
class RaoRow:
    id: str
    name: str
    smarts: str
    ur: float
    ur_tentative: bool
    uh: float | None
    """書中沒有 U_H（印「–」）時為 None：含此基團的分子 G、ν、E 回報 missing"""
    uh_tentative: bool
    """U_H 欄整欄是書中暫定值（表標題）；括號值另外標在這裡之外的稽核狀態"""
    uh_paren: bool
    section: str
    kind: str
    source: str
    audit: str
    positives: tuple[str, ...]
    negatives: tuple[str, ...]
    notes: str

    def usable(self) -> bool:
        return self.smarts != ""

    def to_yg_row(self) -> YgGroupRow:
        """轉成切分程式使用的列（ygi 存 U_R；mi 不使用，存 0.0）。"""
        return YgGroupRow(
            id=self.id, name=self.name, smarts=self.smarts, ygi=self.ur, mi=0.0, tentative=self.ur_tentative, state="",
            section=self.section, kind=self.kind, condition="", source=self.source, audit=self.audit,
            positives=self.positives, negatives=self.negatives, notes=self.notes,
        )  # fmt: skip


@dataclass(frozen=True)
class ValueRow:
    """Ecoh（J/mol）或 ΔHm（kJ/mol）的一列。"""

    id: str
    name: str
    smarts: str
    value: float
    tentative: bool
    section: str
    source: str
    audit: str
    positives: tuple[str, ...]
    negatives: tuple[str, ...]
    notes: str

    def to_yg_row(self) -> YgGroupRow:
        return YgGroupRow(
            id=self.id, name=self.name, smarts=self.smarts, ygi=self.value, mi=0.0, tentative=self.tentative, state="",
            section=self.section, kind="單一基團", condition="", source=self.source, audit=self.audit,
            positives=self.positives, negatives=self.negatives, notes=self.notes,
        )  # fmt: skip


def _check_common(file: str, no: int, id_: str, source: str, table: str, smarts: str, pos: str, neg: str, issues: list[str]) -> None:
    if id_ == "":
        issues.append(f"{file} 第 {no} 列：id 不可空白")
    if not re.search(rf"Table {re.escape(table)}", source) or "頁" not in source:
        issues.append(f"{file} 第 {no} 列：出處需寫明書名、表號（Table {table}）與書頁碼（D22）")
    if smarts != "" and (js_trim(pos) == "" or js_trim(neg) == ""):
        issues.append(f"{file} 第 {no} 列：有 SMARTS 的列需要正例與反例（D22）")


@lru_cache(maxsize=1)
def load_rao_rows() -> tuple[RaoRow, ...]:
    issues: list[str] = []
    rows: list[RaoRow] = []
    for no, c in enumerate(_records(_read_file(RAO_FILE), RAO_FILE, RAO_COLUMNS), start=2):
        id_, name, smarts, ur, uh, section, kind, source, audit, pos, neg, notes = c
        try:
            urv = parse_book_number(ur)
            uhv = parse_book_number(uh)
        except ValueError as e:
            issues.append(f"{RAO_FILE} 第 {no} 列：{e}")
            continue
        if urv is None:
            issues.append(f"{RAO_FILE} 第 {no} 列：U_R 不可空白")
            continue
        _check_common(RAO_FILE, no, id_, source, "14.4", smarts, pos, neg, issues)
        if name == "" or section == "" or kind == "" or audit == "":
            issues.append(f"{RAO_FILE} 第 {no} 列：基團名稱、表格區段、類型、稽核狀態不可空白")
        if "書中暫定值" not in audit and uhv is not None:
            issues.append(f"{RAO_FILE} 第 {no} 列：U_H 為書中暫定值，稽核狀態需註明「書中暫定值」")
        if (urv[1] or (uhv is not None and uhv[1])) and "書中標為暫定" not in audit:
            issues.append(f"{RAO_FILE} 第 {no} 列：有書中括號值，稽核狀態需註明「書中標為暫定」")
        if uhv is None and smarts != "" and "無值" not in audit:
            issues.append(f"{RAO_FILE} 第 {no} 列：書中沒有 U_H，稽核狀態需註明「無值」")
        rows.append(
            RaoRow(
                id=id_, name=name, smarts=smarts, ur=urv[0], ur_tentative=urv[1], uh=None if uhv is None else uhv[0],
                uh_tentative=True, uh_paren=bool(uhv and uhv[1]), section=section, kind=kind, source=source, audit=audit,
                positives=_split_list(pos), negatives=_split_list(neg), notes=notes,
            )
        )  # fmt: skip
    ids = [r.id for r in rows]
    for dup in {i for i in ids if ids.count(i) > 1}:
        issues.append(f"{RAO_FILE}：id 重複：{dup}")
    if issues:
        raise ModulusTableError(issues)
    return tuple(rows)


def _read_value_table(file: str, columns: list[str], table: str) -> tuple[ValueRow, ...]:
    issues: list[str] = []
    rows: list[ValueRow] = []
    for no, c in enumerate(_records(_read_file(file), file, columns), start=2):
        id_, name, smarts, val, section, source, audit, pos, neg, notes = c
        try:
            v = parse_book_number(val)
        except ValueError as e:
            issues.append(f"{file} 第 {no} 列：{e}")
            continue
        if v is None or smarts == "":
            issues.append(f"{file} 第 {no} 列：數值與 SMARTS 不可空白（無值的基團不收錄）")
            continue
        _check_common(file, no, id_, source, table, smarts, pos, neg, issues)
        if v[1] and "書中標為暫定" not in audit:
            issues.append(f"{file} 第 {no} 列：書中括號值，稽核狀態需註明「書中標為暫定」")
        rows.append(
            ValueRow(
                id=id_, name=name, smarts=smarts, value=v[0], tentative=v[1], section=section, source=source, audit=audit,
                positives=_split_list(pos), negatives=_split_list(neg), notes=notes,
            )
        )  # fmt: skip
    ids = [r.id for r in rows]
    for dup in {i for i in ids if ids.count(i) > 1}:
        issues.append(f"{file}：id 重複：{dup}")
    if issues:
        raise ModulusTableError(issues)
    return tuple(rows)


@lru_cache(maxsize=1)
def load_ecoh_rows() -> tuple[ValueRow, ...]:
    return _read_value_table(ECOH_FILE, ECOH_COLUMNS, "7.1")


@lru_cache(maxsize=1)
def load_hm_rows() -> tuple[ValueRow, ...]:
    return _read_value_table(HM_FILE, HM_COLUMNS, "5.7")


@lru_cache(maxsize=1)
def rao_yg_rows() -> tuple[YgGroupRow, ...]:
    return tuple(r.to_yg_row() for r in load_rao_rows() if r.usable())


@lru_cache(maxsize=1)
def ecoh_yg_rows() -> tuple[YgGroupRow, ...]:
    return tuple(r.to_yg_row() for r in load_ecoh_rows())
