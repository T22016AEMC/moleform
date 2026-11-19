"""溶劑資料表 solvents.csv 的讀取與查詢（任務 P8-1，PLAN 8.1、8.2；D72）。

資料表在 `src/data/solvents.csv`（長表：一列一個溶劑的一個物性值，每個值有自己的出處與溫度；本模組不含任何數值）。
格式規則與 TypeScript 端（`src/core/data/validate.ts` 的 validateSolvents）一致：必填欄位、`(solvent_id, property, temperature_c)` 唯一、
同一 solvent_id 的名稱／CAS／SMILES 每列一致、共用出處欄位。格式問題一律拋出 SolventTableError（D22：不靜默略過）。

查詢規則：同一個物性有多個溫度時，取最接近 25 °C 的一列（HSP 只有 25 °C）。回傳 {value, unit, temperatureC, source, ...}。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from rdkit import Chem

from .csv_reader import js_number, js_trim
from .tables import make_fail, read_data_file, read_records

SOLVENTS_FILE = "solvents.csv"
SOLVENTS_COLUMNS = [
    "solvent_id", "name_en", "name_zh", "cas", "smiles", "property", "value", "unit", "temperature_c",
    "source_type", "source", "source_detail", "source_original", "review_status", "notes",
]  # fmt: skip
SOURCE_TYPES = ("book", "paper", "package", "self", "user")
REVIEW_STATUSES = ("pending", "approved")
REFERENCE_TEMPERATURE_C = 25.0


class SolventTableError(Exception):
    """溶劑資料表格式錯誤（D22：不靜默略過）。"""

    def __init__(self, issues: list[Any]):
        super().__init__("；".join(str(i) for i in issues))
        self.issues = issues


@dataclass(frozen=True)
class SolventValue:
    property: str
    value: float
    unit: str
    temperature_c: float | None
    source_type: str
    source: str
    source_detail: str
    source_original: str
    review_status: str
    notes: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "value": self.value, "unit": self.unit, "temperatureC": self.temperature_c, "sourceType": self.source_type,
            "source": self.source, "sourceDetail": self.source_detail, "sourceOriginal": self.source_original,
            "reviewStatus": self.review_status, "notes": self.notes,
        }  # fmt: skip


@dataclass
class Solvent:
    id: str
    name_en: str
    name_zh: str
    cas: str
    smiles: str
    values: dict[str, list[SolventValue]] = field(default_factory=dict)

    def pick(self, prop: str, target_c: float = REFERENCE_TEMPERATURE_C) -> SolventValue | None:
        """該物性中最接近 target_c 的一列；與溫度無關的列（沒有溫度）視為距離 0；沒有這個物性回傳 None。"""
        rows = self.values.get(prop)
        if not rows:
            return None
        best = None
        best_d = None
        for r in rows:
            d = 0.0 if r.temperature_c is None else abs(r.temperature_c - target_c)
            if best is None or d < best_d or (d == best_d and (r.temperature_c or 0) < (best.temperature_c or 0)):
                best, best_d = r, d
        return best


def _canonical(smiles: str) -> str | None:
    mol = Chem.MolFromSmiles(smiles)
    return None if mol is None else Chem.MolToSmiles(mol)


@lru_cache(maxsize=1)
def load_solvents() -> dict[str, Solvent]:
    issues: list[dict[str, Any]] = []
    fail = make_fail(SOLVENTS_FILE, issues)
    records = read_records(read_data_file(SOLVENTS_FILE), SOLVENTS_FILE, SOLVENTS_COLUMNS, fail)
    out: dict[str, Solvent] = {}
    seen: dict[tuple[str, str, str], int] = {}
    if records is None:
        raise SolventTableError(issues)
    for c, no in records:
        sid, name_en, name_zh, cas, smiles, prop, value, unit, temp, stype, source, detail, original, status, notes = c
        for col, v in (("solvent_id", sid), ("name_en", name_en), ("smiles", smiles), ("property", prop), ("value", value), ("unit", unit)):
            if v == "":
                fail(no, col, "必填欄位是空的")
        if stype not in SOURCE_TYPES:
            fail(no, "source_type", f"只能是 {'、'.join(SOURCE_TYPES)}，實際為「{stype}」")
        if source == "" or detail == "":
            fail(no, "source", "source 與 source_detail 必填")
        if status not in REVIEW_STATUSES:
            fail(no, "review_status", f"只能是 {'、'.join(REVIEW_STATUSES)}，實際為「{status}」")
        if stype == "self" and notes == "":
            fail(no, "notes", "source_type 為 self 時必填（說明為何自行撰寫，D22）")
        if stype == "package" and original == "":
            fail(no, "source_original", "source_type 為 package 時必填（套件引用的原始文獻）")
        try:
            val = js_number(value)
            tval = None if temp == "" else js_number(temp)
        except Exception:  # noqa: BLE001
            fail(no, "value", f"數值欄位不是數字：value「{value}」、temperature_c「{temp}」")
            continue
        key = (sid, prop, temp)
        if key in seen:
            fail(no, "solvent_id, property, temperature_c", f"重複：「{sid} / {prop} / {temp or '(空)'}」已出現在第 {seen[key]} 列")
        seen[key] = no
        sol = out.get(sid)
        if sol is None:
            sol = Solvent(sid, name_en, name_zh, cas, smiles)
            out[sid] = sol
        else:
            for col, a, b in (("name_en", sol.name_en, name_en), ("name_zh", sol.name_zh, name_zh), ("cas", sol.cas, cas), ("smiles", sol.smiles, smiles)):
                if a != b:
                    fail(no, col, f"同一 solvent_id（{sid}）的 {col} 與前面的列不一致（「{a}」≠「{b}」）")
        sol.values.setdefault(prop, []).append(SolventValue(prop, val, unit, tval, stype, source, detail, original, status, notes))
    if issues:
        raise SolventTableError(issues)
    return out


@lru_cache(maxsize=1)
def _by_canonical_smiles() -> dict[str, str]:
    result: dict[str, str] = {}
    for sid, s in load_solvents().items():
        canon = _canonical(s.smiles)
        if canon is not None:
            result[canon] = sid
    return result


def solvent_id_for_smiles(smiles: str) -> str | None:
    """SMILES（任何寫法）對應到溶劑資料表的 solvent_id；沒有對應回傳 None。"""
    canon = _canonical(js_trim(smiles))
    return None if canon is None else _by_canonical_smiles().get(canon)


def get_solvent(solvent_id: str) -> Solvent | None:
    return load_solvents().get(solvent_id)


def solvent_summary(s: Solvent) -> dict[str, Any]:
    """下拉選單用：名稱、SMILES 與密度（最接近 25 °C）、分子量、HSP（有就列）。"""
    d = s.pick("density")
    mw = s.pick("molecular_weight")
    hsp = {p: (s.pick(p).as_dict() if s.pick(p) else None) for p in ("hsp_d", "hsp_p", "hsp_h")}
    return {
        "id": s.id, "nameEn": s.name_en, "nameZh": s.name_zh, "cas": s.cas, "smiles": s.smiles,
        "density": None if d is None else d.as_dict(), "molecularWeight": None if mw is None else mw.as_dict(), "hsp": hsp,
    }  # fmt: skip
