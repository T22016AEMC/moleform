"""重複單元分析：連接點檢查、不含連接點的分子量與分子式。對應 src/core/polymer/repeatUnit.ts（任務 M04，PLAN 6A.4-03；D62／D63）。

演算法與 TypeScript 逐步等價；TypeScript 仍是預設計算來源，本模組沒有接到介面。步驟與 TS 相同，順序也相同：
解析 → 找連接點（原子序為 0 的原子）→ 連接點數量檢查 → 各連接點的鄰居檢查 → 原子映射編號 → 分子式 → 分子量。

風險項（任務 M04 的 R2、R7）：

- **R2 原子索引與隱式氫數**：TS 讀 `get_json()`（原子順序即 RDKit 原子索引）；Python 直接用 RDKit 原子索引（`GetAtoms()` 順序），不重排。
  連接點＝原子序為 0 的原子，依索引順序排列（`attachmentOrder` 的「第一個出現者」就是索引最小的連接點）。
  分子式用 `AddHs` 補上隱含氫後逐原子計數，與 TS 的 `add_hs_in_place` 相同（預設選項）。
- **原子映射編號**：TS 不是直接讀映射編號，而是把 `get_v2Kmolblock()`（V2000）的原子行用空白切開、取第 14 個欄位（mmm）再轉成整數。
  這個做法有兩個**既有特性**，Python 照 TS 重現（不改成直接讀 `GetAtomMapNum()`）：(1) 映射編號 ≥ 100 時 iii 與 mmm 欄位黏在一起
  （例如 `0100`），第 14 個欄位變成 nnn（0），所以 `[*:100]` 會被當成沒有編號；(2) 帶電的連接點（`[*+]`、`[*+2]`）在寫 Molfile 時 RDKit 拋出例外，
  TS 沒有接，整個 `analyzeRepeatUnit` 拋出（Python 拋出 `RdkitCallError`）。兩者都列在 docs/migration-known-issues.md。
- **R7 分子量**：TS 用 RDKit.js 的描述子 `amw`（RDKit 的 `calcAMW`，含隱含氫、`*` 為 0）；Python 用 `rdMolDescriptors._CalcMolWt`（`Descriptors.MolWt` 只是它的包裝，同一個 C++ 函式 `calcAMW(mol, onlyHeavy=false)`；不用 `Descriptors` 是因為它會匯入 numpy，在引擎的處理執行緒中匯入 numpy 會卡住）。
  兩邊都用 RDKit 內建的週期表，不是專案的 `atomic_weights.py`；RDKit.js 與 Python 的 RDKit 版本相同（2026.9.1，M00 對齊）。
  全部元素的原子量與同位素以黃金案例逐字比對（`rawAmw`）。
- **JS 相容**：`trim` 用 `js_trim`（JS 會去掉 BOM 等，Python 的 `strip()` 不會）；Hill 順序的排序在 TS 是 `localeCompare`，
  元素符號（首字母大寫、其餘小寫的字母，以及 `#<原子序>`）用 ICU 排序與碼點排序結果相同（見 `hill_formula`）。
- TS 的 `RDKit.get_mol` 也接受 Molfile 與 JSON 字串；Python 端只接 SMILES（`Chem.MolFromSmiles`，M00 的決定）。介面送進來的一律是 SMILES。
"""

from __future__ import annotations

import math
import re
from typing import Any

from rdkit import Chem
from rdkit.Chem import rdMolDescriptors

from .csv_reader import js_number, js_trim
from .mol_graph import mol_from_smiles


class RdkitCallError(Exception):
    """TS 版在同一處會拋出 RDKit.js 的 WebAssembly 例外（沒有接）；Python 版拋出這個例外。"""


ELEMENTS = (
    "", "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
    "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
    "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe",
)  # fmt: skip
"""逐字取自 TS 的 ELEMENTS（到 Xe＝54；更重的元素 TS 寫成 `#<原子序>`）"""

_WS = re.compile(r"[ \t\n\v\f\r   -     　﻿]+")


def _fail(code: str, message: str) -> dict[str, Any]:
    return {"ok": False, "problem": {"code": code, "message": message}}


def hill_formula(counts: dict[str, int]) -> str:
    """Hill 順序：有碳時 C、H 在前，其餘依字母；沒有碳時全部依字母。

    TS 用 `localeCompare` 排序。鍵只會是元素符號（一個大寫字母＋最多一個小寫字母）或 `#<原子序>`：
    ICU 比較先看字母（忽略大小寫）、較短的前綴在前，大寫字母之間與小寫字母之間的順序與碼點順序相同；
    `#` 與數字在 ICU 與 ASCII 都排在字母前面，`#` 之間逐位比較數字。所以 Python 的字串排序與 `localeCompare` 結果相同
    （黃金案例涵蓋 B／Be／Bi／Br、C／Ca／Cl／Co、N／Na／Nb／Ne／Ni、S／Sb／Sc／Se／Si／Sn／Sr 與 `#<原子序>`）。
    """
    symbols = sorted(counts.keys())
    if "C" in counts:
        ordered = ["C", *(["H"] if "H" in counts else []), *[s for s in symbols if s != "C" and s != "H"]]
    else:
        ordered = symbols
    return "".join(f"{s}{counts[s] if counts[s] > 1 else ''}" for s in ordered)


def _atom_maps(molblock: str, atom_count: int) -> list[int]:
    """從 V2000 Molfile 讀出每個原子的原子映射編號（沒有為 0）。與 TS 的 `atomMaps` 逐步相同（欄位以空白切開、取第 14 個）。"""
    lines = re.split(r"\r?\n", molblock)
    maps: list[int] = []
    for i in range(atom_count):
        line = lines[4 + i] if 4 + i < len(lines) else ""
        tokens = _WS.split(js_trim(line))
        # x y z 符號 dd ccc sss hhh bbb vvv HHH rrr iii mmm …
        value = js_number(tokens[13]) if len(tokens) > 13 else math.nan
        is_integer = math.isfinite(value) and value == math.floor(value)
        maps.append(int(value) if is_integer else 0)
    return maps


def analyze_repeat_unit(smiles: str) -> dict[str, Any]:
    """對應 analyzeRepeatUnit。成功回傳 { ok, attachmentCount, attachmentOrder, mUnit, formula }；失敗回傳 { ok: False, problem: { code, message } }。"""
    text = js_trim(smiles)
    if text == "":
        return _fail("UNPARSABLE", "尚未輸入重複單元。")
    try:
        mol = mol_from_smiles(text)
    except Exception:  # TS：get_mol 拋例外視為 null
        mol = None
    if mol is None:
        return _fail("UNPARSABLE", "無法解析這個重複單元的結構。")

    atoms = list(mol.GetAtoms())
    dummies = [i for i, a in enumerate(atoms) if a.GetAtomicNum() == 0]

    if len(dummies) == 0:
        return _fail("NO_ATTACHMENT", "重複單元需要恰好兩個連接點（*），目前沒有連接點。請用 [*:1]、[*:2] 標出鏈的兩端。")
    if len(dummies) == 1:
        return _fail("TOO_FEW_ATTACHMENTS", "重複單元需要恰好兩個連接點（*），目前只有 1 個。")
    if len(dummies) > 2:
        return _fail("TOO_MANY_ATTACHMENTS", f"重複單元需要恰好兩個連接點（*），目前有 {len(dummies)} 個。")

    # 各連接點連到的原子
    neighbors: dict[int, list[int]] = {d: [] for d in dummies}
    for bond in mol.GetBonds():
        a, b = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        if a in neighbors:
            neighbors[a].append(b)
        if b in neighbors:
            neighbors[b].append(a)
    for d in dummies:
        n = neighbors[d]
        if len(n) == 0:
            return _fail("DANGLING_ATTACHMENT", "有連接點（*）沒有連到任何原子。")
        if any(atoms[x].GetAtomicNum() == 0 for x in n):
            return _fail("ATTACHMENT_TO_ATTACHMENT", "兩個連接點（*）不可直接相連。")
    # 兩個連接點可以連在同一個原子上（使用者 2026-10-30 決定放寬，原任務 015 的 SAME_ATOM 錯誤已取消）

    # 編號：[*:1]、[*:2]（順序不拘），或兩個都不編號（依出現順序視為 1、2）
    try:
        molblock = Chem.MolToMolBlock(mol)
    except Exception as e:  # 帶電連接點等：TS 在 get_v2Kmolblock 拋出 WebAssembly 例外
        raise RdkitCallError(f"寫出 Molfile 失敗：{e}") from e
    maps = _atom_maps(molblock, len(atoms))
    m1, m2 = maps[dummies[0]], maps[dummies[1]]
    if m1 == 0 and m2 == 0:
        order = [1, 2]
    elif m1 == 1 and m2 == 2:
        order = [1, 2]
    elif m1 == 2 and m2 == 1:
        order = [2, 1]
    else:
        return _fail(
            "BAD_NUMBERING",
            "兩個連接點的編號須為 [*:1] 與 [*:2]，或兩個都不編號；目前的編號不符（例如只編一個、編號重複或不是 1、2）。",
        )

    # 分子式：補上隱含氫後逐原子計數，連接點不計
    counts: dict[str, int] = {}
    for atom in Chem.AddHs(mol).GetAtoms():
        z = atom.GetAtomicNum()
        if z == 0:
            continue
        symbol = ELEMENTS[z] if z < len(ELEMENTS) else f"#{z}"
        counts[symbol] = counts.get(symbol, 0) + 1

    amw = float(rdMolDescriptors._CalcMolWt(mol))
    if not math.isfinite(amw) or amw <= 0:
        return _fail("UNPARSABLE", "無法計算這個重複單元的分子量。")
    return {"ok": True, "attachmentCount": 2, "attachmentOrder": order, "mUnit": amw, "formula": hill_formula(counts)}
