"""任務 M05 的數字對照：Python 的輸出與 docs/verification/phase6-*.md 內 TypeScript 輸出的數字（只比文件有列的欄位，不新增案例）。

文件由 TS 的驗證腳本（scripts/verification/phase6-*.ts）產生，數字已依欄位的位數捨入（toFixed）。這裡對每個「含 SMILES 欄的表」的每一列：
以 Python 引擎計算該 SMILES，再核對對應欄位——文件的數字必須等於 Python 值依文件位數的捨入（容許差 0.5 × 10^−位數）；
文件不是數字（缺基團、不適用、—）時 Python 也必須沒有值。用到的對照欄位見各 *_COLUMNS。
"""

from __future__ import annotations

import os
import re
from typing import Any, Callable

import pytest

import golden_compare as gc
from moleform_core import dielectric, free_volume, joback, relative_tg, tpsa_logp

DOCS_DIR = os.path.join(gc.REPO_ROOT, "docs", "verification")
_NUM = re.compile(r"\s*(-?[0-9]+(?:\.([0-9]+))?)(?:×10\^(-?[0-9]+))?[\s‡*†]*(?:（.*）)?\s*")
_SMILES = re.compile(r"`([^`]+)`")


def _tables(text: str) -> list[tuple[list[str], list[list[str]]]]:
    """文件中的 markdown 表：(標題列, 資料列)。"""
    out: list[tuple[list[str], list[list[str]]]] = []
    lines = text.split("\n")
    i = 0
    while i < len(lines) - 1:
        if lines[i].startswith("|") and re.match(r"^\|(-+\|)+$", lines[i + 1].strip()):
            header = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            rows: list[list[str]] = []
            j = i + 2
            while j < len(lines) and lines[j].startswith("|"):
                cells = re.split(r"(?<!\\)\|", lines[j].strip()[1:-1])
                rows.append([c.strip().replace("\\|", "|") for c in cells])
                j += 1
            out.append((header, rows))
            i = j
        else:
            i += 1
    return out


def _doc_number(cell: str) -> tuple[float, float] | None:
    """文件的數字與它的捨入半寬（0.5 × 10^−位數 × 10^指數）；不是數字回傳 None。"""
    m = _NUM.fullmatch(cell)
    if not m:
        return None
    decimals = len(m.group(2) or "")
    exp = int(m.group(3)) if m.group(3) else 0
    value = float(m.group(1)) * 10.0**exp
    return value, 0.5 * 10.0 ** (-decimals) * 10.0**exp


def _compare(doc_cell: str, py: float | None, where: str) -> str | None:
    doc = _doc_number(doc_cell)
    if py is None:
        return None if doc is None else f"{where}：文件有數字 {doc_cell}，Python 沒有值"
    if doc is None:
        return f"{where}：文件是「{doc_cell}」，Python 有值 {py}"
    value, half = doc
    if abs(py - value) <= half * (1 + 1e-9) + 1e-12 * abs(py):
        return None
    return f"{where}：文件 {doc_cell}，Python {py}"


def _check_doc(filename: str, columns: dict[str, Callable[[str], float | None]], required_headers: tuple[str, ...]) -> int:
    path = os.path.join(DOCS_DIR, filename)
    with open(path, encoding="utf-8") as f:
        text = f.read()
    problems: list[str] = []
    compared = 0
    for header, rows in _tables(text):
        if "SMILES" not in header or not all(any(h.startswith(r) for h in header) for r in required_headers):
            continue
        smiles_col = header.index("SMILES")
        for row in rows:
            m = _SMILES.fullmatch(row[smiles_col]) if smiles_col < len(row) else None
            if not m or len(row) != len(header):
                continue
            smiles = m.group(1)
            row_compared = False
            for prefix, getter in columns.items():
                idx = next((k for k, h in enumerate(header) if h.startswith(prefix)), None)
                if idx is None:
                    continue
                err = _compare(row[idx], getter(smiles), f"{filename} 〈{row[0]}〉 {header[idx]}")
                row_compared = True
                if err:
                    problems.append(err)
            compared += 1 if row_compared else 0
    assert not problems, "\n".join(problems[:30])
    return compared


def _joback(key: str) -> Callable[[str], float | None]:
    return lambda s: (joback.compute_joback(s).get(key) if joback.compute_joback(s)["status"] == "ok" else None)


def _tpsa(key: str) -> Callable[[str], float | None]:
    return lambda s: (tpsa_logp.compute_tpsa_logp(s).get(key) if tpsa_logp.compute_tpsa_logp(s)["status"] == "ok" else None)


def _diel(group: str, key: str) -> Callable[[str], float | None]:
    def get(s: str) -> float | None:
        r = dielectric.compute_dielectric_refraction(s)[group]
        return r.get(key) if r["status"] == "ok" else None

    return get


def _diel_va(s: str) -> float | None:
    r = dielectric.compute_dielectric(s)
    return r["volume"]["va"] if (r["status"] == "ok" and r["volume"]["status"] == "ok") else None


def _fv(key: str) -> Callable[[str], float | None]:
    def get(s: str) -> float | None:
        r = free_volume.compute_free_volume(s)
        return r.get(key) if r["status"] == "ok" else None

    return get


def _fv_va(s: str) -> float | None:
    r = free_volume.compute_free_volume(s)
    return r["components"][0]["va"] if r["status"] == "ok" else None


def _rel(key: str) -> Callable[[str], float | None]:
    def get(s: str) -> float | None:
        r = relative_tg.evaluate_relative_tg_composition({"monomers": [{"smiles": s}]})
        if r["status"] != "ok":
            return None
        if key == "ffv":
            return r["side"]["ffv"]
        if key == "deltaAlpha":
            return r["side"]["deltaAlpha"]
        return r["side"]["monomers"][0][key]

    return get


def test_phase6_tbtf() -> None:
    n = _check_doc("phase6-TbTf-輸出.md", {"Tb（K）": _joback("tbK"), "Tb（°C）": _joback("tbC"), "Tf（K）": _joback("tfK"), "Tf（°C）": _joback("tfC")}, ("Tb（K）",))
    assert n >= 6


def test_phase6_vw_tpsa_logp() -> None:
    n = _check_doc("phase6-VW-TPSA-LogP-輸出.md", {"TPSA": _tpsa("tpsa"), "Crippen LogP": _tpsa("logP")}, ("TPSA",))
    assert n >= 6


def test_phase6_dielectric_refraction() -> None:
    cols = {
        "ε（主要": _diel("dielectric", "epsPrimary"),
        "ε（第二估計": _diel("dielectric", "epsSecondary"),
        "ΣP_LL": _diel("dielectric", "sumPLL"),
        "ΣP_V": _diel("dielectric", "sumPV"),
        "Va（cm³/mol）": _diel_va,
        "ΣR": _diel("refraction", "sumR"),
        "α′": _diel("refraction", "alphaPrimeA3"),
    }
    n = _check_doc("phase6-介電-極化率-輸出.md", cols, ("ΣP_LL",))
    assert n >= 20


def test_phase6_free_volume() -> None:
    cols = {"Vω": _fv("vomega"), "Vf／Va": _fv("vfOverVa"), "Va": _fv_va, "Vf": _fv("vf")}
    n = _check_doc("phase6-自由體積-經驗係數-輸出.md", cols, ("Vω", "Vf"))
    assert n >= 10


def test_phase6_relative_tg() -> None:
    cols = {"VvdW": _rel("vomega"), "Vm（依取得順序）": _rel("vm"), "Bondi 型 FFV": _rel("ffv"), "Δα": _rel("deltaAlpha")}
    n = _check_doc("phase6-相對Tg-輸出.md", cols, ("VvdW", "Bondi 型 FFV"))
    assert n >= 5
