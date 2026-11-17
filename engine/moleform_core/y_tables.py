"""P6B 資料表讀取：Ym（Table 6.8／6.14）、Yd,1/2（Table 21.2）、Table 6.9／6.10、吸濕性（Table 18.14）。

資料表都在 `src/data/`（單一來源，D18、D22；本模組不含任何基團數值）。Ym、Yd 表的欄位與 yg_groups.csv 相同（Ygi 換成 Ymi／Yd,1/2,i），
所以轉成 tg.YgGroupRow 後可直接交給 Yg 的切分程式（Appendix II：Yg 與 Ym 的重疊基團沿用既有切分，不重複發明）。
格式有任何問題直接拋出 YTableError（D22：不靜默略過）。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from functools import lru_cache

from .csv_reader import CsvError, js_number, js_trim, parse_csv
from .tg import YgGroupRow, _read_file, _split_list

YM_FILE = "ym_groups.csv"
YD_FILE = "yd_groups.csv"
SIDE_CHAIN_FILE = "ym_side_chain.csv"
CH2_SEQUENCE_FILE = "ym_ch2_sequence.csv"
WATER_FILE = "water_groups.csv"

YM_COLUMNS = ["id", "基團名稱", "SMARTS", "Ymi", "Mi", "共軛狀態", "表格區段", "類型", "條件", "出處", "稽核狀態", "正例 SMILES", "反例 SMILES", "備註"]
YD_COLUMNS = ["id", "基團名稱", "SMARTS", "Yd,1/2,i", "共軛狀態", "表格區段", "類型", "條件", "出處", "稽核狀態", "正例 SMILES", "反例 SMILES", "備註"]
SIDE_COLUMNS = ["id", "系列", "基礎聚合物", "基礎單元 SMILES", "Ymo", "Ym5", "Mo", "M5", "出處", "稽核狀態", "備註"]
SEQ_COLUMNS = ["id", "類型", "鍵", "m = 0（無官能基）", "m = 1（有官能基）", "出處", "稽核狀態", "備註"]
WATER_COLUMNS = ["id", "基團名稱", "SMARTS", "計數方式", "RH 0.3", "RH 0.5", "RH 0.7", "RH 0.9", "RH 1.0", "出處", "稽核狀態", "正例 SMILES", "反例 SMILES", "備註"]
WATER_RH = (0.3, 0.5, 0.7, 0.9, 1.0)

_PAREN = re.compile(r"\((-?[0-9]+(?:\.[0-9]+)?(?:[eE]-?[0-9]+)?)\)", re.ASCII)
_PLAIN = re.compile(r"-?[0-9]+(?:\.[0-9]+)?(?:[eE]-?[0-9]+)?", re.ASCII)


class YTableError(Exception):
    """資料表格式錯誤（D22：不靜默略過）。"""

    def __init__(self, issues: list[str]):
        super().__init__("；".join(issues))
        self.issues = issues


def parse_book_number(text: str) -> tuple[float, bool] | None:
    """書中數值：括號數字回傳 (值, True)（書中標為暫定／不確定）；空字串回傳 None（書中無值）；其他格式拋 ValueError。"""
    t = js_trim(text)
    if t == "":
        return None
    m = _PAREN.fullmatch(t)
    body = m.group(1) if m else t
    if not _PLAIN.fullmatch(body):
        raise ValueError(f"不是數字：「{text}」")
    return js_number(body), m is not None


def _records(text: str, file: str, columns: list[str]) -> list[list[str]]:
    try:
        records = parse_csv(text)
    except CsvError as e:
        raise YTableError([f"{file}：CSV 格式錯誤：{e.message}"]) from e
    if not records:
        raise YTableError([f"{file}：檔案是空的，缺少標題列"])
    header = records[0]
    if header != columns:
        raise YTableError([f"{file}：標題列與定義不一致。應為：{','.join(columns)}；實際為：{','.join(header)}"])
    out = []
    for no, rec in enumerate(records[1:], start=2):
        if len(rec) != len(columns):
            raise YTableError([f"{file} 第 {no} 列：欄位數應為 {len(columns)}，實際為 {len(rec)}"])
        out.append([js_trim(c) for c in rec])
    return out


@dataclass(frozen=True)
class YRow:
    """Ym／Yd 表的一列（含書中無值或無 SMARTS 的列，僅謄錄）。"""

    id: str
    name: str
    smarts: str
    value: float | None
    tentative: bool
    mi: float | None
    state: str
    section: str
    kind: str
    condition: str
    source: str
    audit: str
    positives: tuple[str, ...]
    negatives: tuple[str, ...]
    notes: str

    def usable(self) -> bool:
        """有 SMARTS 且有數值才參與切分與計算。"""
        return self.smarts != "" and self.value is not None

    def to_yg_row(self) -> YgGroupRow:
        """轉成 Yg 切分程式使用的列（ygi 存這個表的值；Yd 沒有 Mi 欄，mi 存 0.0，引擎改用重複單元質量）。"""
        assert self.value is not None
        return YgGroupRow(
            id=self.id, name=self.name, smarts=self.smarts, ygi=self.value, mi=0.0 if self.mi is None else self.mi,
            tentative=self.tentative, state=self.state, section=self.section, kind=self.kind, condition=self.condition,
            source=self.source, audit=self.audit, positives=self.positives, negatives=self.negatives, notes=self.notes,
        )  # fmt: skip


def read_y_table(text: str, file: str, columns: list[str], with_mi: bool) -> list[YRow]:
    issues: list[str] = []
    rows: list[YRow] = []
    for no, c in enumerate(_records(text, file, columns), start=2):
        if with_mi:
            id_, name, smarts, y, mi, state, section, kind, cond, source, audit, pos, neg, notes = c
        else:
            id_, name, smarts, y, state, section, kind, cond, source, audit, pos, neg, notes = c
            mi = ""
        try:
            yv = parse_book_number(y)
            miv = parse_book_number(mi)
        except ValueError as e:
            issues.append(f"{file} 第 {no} 列：{e}")
            continue
        if id_ == "" or name == "" or section == "" or kind == "" or audit == "":
            issues.append(f"{file} 第 {no} 列：id、基團名稱、表格區段、類型、稽核狀態不可空白")
        if not re.search(r"Table (6\.\d+|21\.\d+)", source) or "頁" not in source:
            issues.append(f"{file} 第 {no} 列：出處需寫明書名、表號與書頁碼（D22）")
        if state != "" and not id_.endswith("." + state):
            issues.append(f"{file} 第 {no} 列：有共軛狀態的列，id 必須以「.{state}」結尾")
        if cond != "" and not id_.endswith("." + cond):
            issues.append(f"{file} 第 {no} 列：有條件的列，id 必須以「.{cond}」結尾")
        if smarts != "" and (js_trim(pos) == "" or js_trim(neg) == ""):
            issues.append(f"{file} 第 {no} 列：有 SMARTS 的列需要正例與反例（D22）")
        rows.append(
            YRow(
                id=id_, name=name, smarts=smarts, value=None if yv is None else yv[0], tentative=bool(yv and yv[1]),
                mi=None if miv is None else miv[0], state=state, section=section, kind=kind, condition=cond, source=source,
                audit=audit, positives=_split_list(pos), negatives=_split_list(neg), notes=notes,
            )
        )  # fmt: skip
    ids = [r.id for r in rows]
    for dup in {i for i in ids if ids.count(i) > 1}:
        issues.append(f"{file}：id 重複：{dup}")
    for r in rows:
        if r.tentative and "書中標為暫定" not in r.audit:
            issues.append(f"{file}：{r.id} 是書中括號值，稽核狀態需註明「書中標為暫定」")
    if issues:
        raise YTableError(issues)
    return rows


@lru_cache(maxsize=1)
def load_ym_rows() -> tuple[YRow, ...]:
    return tuple(read_y_table(_read_file(YM_FILE), YM_FILE, YM_COLUMNS, True))


@lru_cache(maxsize=1)
def load_yd_rows() -> tuple[YRow, ...]:
    return tuple(read_y_table(_read_file(YD_FILE), YD_FILE, YD_COLUMNS, False))


def usable_yg_rows(rows: tuple[YRow, ...]) -> tuple[YgGroupRow, ...]:
    return tuple(r.to_yg_row() for r in rows if r.usable())


@lru_cache(maxsize=1)
def ym_yg_rows() -> tuple[YgGroupRow, ...]:
    return usable_yg_rows(load_ym_rows())


# 使用者 2026-11-17 的決定（只決定「選哪個值」，不改書的任何數字；依據的書算例寫在 yd_groups.csv 對應列的備註）：
# - –C(CH3)2– 夾在兩個芳香環之間（受阻）用 Table 21.2 大括號的第三個值（ss，35）：切分程式的條件名稱是 hindered。
# - –C(=O)NH– 用 Table 21.3 算例用的 32.5（條件為 eg 的列）；書的 30、37（v1、v2）兩列保留、不使用。
# 書的算例沒有明確用到的基團（–C(=O)–O– 的 20／25、受阻的 s 值）維持回報缺基團。
YD_ENGINE_CONDITION = {"A.C(CH3)2.ss": "hindered"}


@lru_cache(maxsize=1)
def yd_yg_rows() -> tuple[YgGroupRow, ...]:
    rows = [r for r in load_yd_rows() if r.usable()]
    eg_families = {r.id.rsplit(".", 1)[0] for r in rows if r.condition == "eg"}
    out: list[YgGroupRow] = []
    for r in rows:
        family = r.id.rsplit(".", 1)[0] if (r.state or r.condition) else r.id
        if family in eg_families and r.condition in ("v1", "v2"):
            continue  # 被詮釋列取代的書中兩個值：保留在資料表，引擎不使用
        yg = r.to_yg_row()
        if r.condition == "eg":
            yg = replace(yg, id=family, condition="")
        elif r.id in YD_ENGINE_CONDITION:
            cond = YD_ENGINE_CONDITION[r.id]
            yg = replace(yg, id=f"{family}.{cond}", condition=cond)
        out.append(yg)
    return tuple(out)


# ---------- Table 6.9 ----------


@dataclass(frozen=True)
class SideChainSeries:
    id: str
    series: str
    basic_polymer: str
    basic_smiles: str
    ymo: float
    ym5: float
    mo: float
    m5: float
    source: str
    audit: str
    notes: str


@lru_cache(maxsize=1)
def load_side_chain() -> tuple[SideChainSeries, ...]:
    rows = []
    for c in _records(_read_file(SIDE_CHAIN_FILE), SIDE_CHAIN_FILE, SIDE_COLUMNS):
        id_, series, basic, smi, ymo, ym5, mo, m5, source, audit, notes = c
        try:
            nums = [parse_book_number(x) for x in (ymo, ym5, mo, m5)]
        except ValueError as e:
            raise YTableError([f"{SIDE_CHAIN_FILE} {id_}：{e}"]) from e
        if any(n is None for n in nums):
            raise YTableError([f"{SIDE_CHAIN_FILE} {id_}：Ymo、Ym5、Mo、M5 不可空白"])
        v = [n[0] for n in nums if n is not None]
        rows.append(SideChainSeries(id_, series, basic, smi, v[0], v[1], v[2], v[3], source, audit, notes))
    return tuple(rows)


# ---------- 亞甲基序列（位置值與 Table 6.10） ----------


@dataclass(frozen=True)
class Ch2Sequence:
    position_values: tuple[float, ...]
    """距最近官能基 1、2、3、4（及以上）個原子鍵長的 Ym(CH2)；索引 0 = α"""
    table_610: tuple[tuple[int, float, float], ...]
    """(CH2 總數, m = 0 的 ΣYm(CH2), m = 1 的 ΣYm(CH2))"""


@lru_cache(maxsize=1)
def load_ch2_sequence() -> Ch2Sequence:
    pos: list[float] = []
    t610: list[tuple[int, float, float]] = []
    for c in _records(_read_file(CH2_SEQUENCE_FILE), CH2_SEQUENCE_FILE, SEQ_COLUMNS):
        id_, kind, key, m0, m1, source, audit, notes = c
        try:
            v0 = parse_book_number(m0)
            v1 = parse_book_number(m1)
        except ValueError as e:
            raise YTableError([f"{CH2_SEQUENCE_FILE} {id_}：{e}"]) from e
        if kind == "位置值":
            if v1 is None:
                raise YTableError([f"{CH2_SEQUENCE_FILE} {id_}：位置值不可空白"])
            pos.append(v1[0])
        elif kind == "Table 6.10":
            if v0 is None or v1 is None:
                raise YTableError([f"{CH2_SEQUENCE_FILE} {id_}：Table 6.10 的值不可空白"])
            t610.append((int(key), v0[0], v1[0]))
        else:
            raise YTableError([f"{CH2_SEQUENCE_FILE} {id_}：類型只能是「位置值」或「Table 6.10」"])
    if len(pos) != 5:
        raise YTableError([f"{CH2_SEQUENCE_FILE}：位置值應有 5 列（α、β、γ、δ、>δ）"])
    return Ch2Sequence(tuple(pos), tuple(t610))


# ---------- Table 18.14 ----------


@dataclass(frozen=True)
class WaterGroup:
    id: str
    name: str
    smarts: str
    rule: str
    values: tuple[float | None, ...]
    """對應 WATER_RH；None = 書中此格空白"""
    uncertain: tuple[bool, ...]
    """對應 WATER_RH；True = 書中括號值（不確定）"""
    source: str
    audit: str
    positives: tuple[str, ...]
    negatives: tuple[str, ...]
    notes: str


@lru_cache(maxsize=1)
def load_water_groups() -> tuple[WaterGroup, ...]:
    rows = []
    for c in _records(_read_file(WATER_FILE), WATER_FILE, WATER_COLUMNS):
        id_, name, smarts, rule, *cells, source, audit, pos, neg, notes = c
        vals: list[float | None] = []
        unc: list[bool] = []
        for cell in cells:
            try:
                p = parse_book_number(cell)
            except ValueError as e:
                raise YTableError([f"{WATER_FILE} {id_}：{e}"]) from e
            vals.append(None if p is None else p[0])
            unc.append(bool(p and p[1]))
        if smarts == "" or pos == "" or neg == "":
            raise YTableError([f"{WATER_FILE} {id_}：需要 SMARTS 與正反例（D22）"])
        if "Table 18.14" not in source or "頁" not in source:
            raise YTableError([f"{WATER_FILE} {id_}：出處需寫明表號與書頁碼"])
        rows.append(WaterGroup(id_, name, smarts, rule, tuple(vals), tuple(unc), source, audit, _split_list(pos), _split_list(neg), notes))
    return tuple(rows)
