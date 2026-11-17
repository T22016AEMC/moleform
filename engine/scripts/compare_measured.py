"""使用者實測 Tg 與引擎預測值的比對（任務 P6C、P6D，PLAN 6.9）。

用法（在專案根目錄）：
    engine/.venv/Scripts/python.exe engine/scripts/compare_measured.py 填好的檔案.csv [--include-demo]

三種模式，以「模式」欄區分（欄位留白或沒有「模式」欄 = unit，P6C 的舊檔照用）：
    unit     單一重複單元 Tg，一個樣品一列，呼叫 /tg。結構填含 * 連接點的 SMILES。
    mixture  混合配方（固化前）的 Tg，呼叫 /tg/mixing。一個樣品多列（每個成分一列），以「配方或樣品名」分組。
             每列填：成分名稱、結構（SMILES）、質量百分比（wt%，同一樣品合計 100）、Mn（g/mol，聚合物成分需要）、成分類別（選填，
             預設 Resin；催化劑填 Catalyst/Initiator，引擎不混入）。實測 Tg、用途、測量條件、備註、材料家族填在該樣品的任一列
             （通常第一列），其餘列留白；同一樣品填了不同的值會被判為無法判讀。
    relative 相對 Tg（D61），呼叫 /relative-tg。一個樣品多列，以樣品名分組，「角色」欄填 A（基準材料）或 B（目標材料）。
             每列填：角色、成分名稱、結構（SMILES）、B 的「莫耳數（每 1 mol A）」。A 的 Tg 錨點（°C）填在 A 列（輸入，D61 已定的例外；
             留白則由引擎的 k／Tg 表帶出，表裡沒有就回報缺錨點）。實測 Tg 填的是 **B** 的值，只拿來比對，不傳進任何計算。

共通欄位（模板：docs/verification/user-measured-template.csv，UTF-8，Excel 另存 CSV UTF-8 即可）：
    模式、配方或樣品名、結構（SMILES 或名稱）、實測 Tg（°C）、測量條件、用途（校準／驗證）、備註、材料家族（選填），
    mixture／relative 另有 角色、成分名稱、質量百分比、Mn、成分類別、莫耳數、A 的 Tg 錨點 等欄。
- 用途 = 驗證：預測誤差併入統計；用途 = 校準：該樣品只列出，**不併入任何驗證誤差統計**（校準與驗證資料要分開，避免自己驗自己）。
- 統計依材料家族分組，三種模式各自統計，不混在一起。
- 缺基團、缺 Mn、缺錨點、引擎回報 missing 等算不出預測值的樣品：列出原因，不算誤差、不進統計。
- 備註含「示範，非實測」的樣品是模板示範，預設不進統計；加 --include-demo 才納入（用來看統計長什麼樣子）。

D02：實測值只作驗證目標。引擎函式收到的請求只有結構、組成與（relative 的）A 錨點；實測值在預測完成之後才拿來減，
不傳進任何計算函式、也不寫進任何資料表。誤差 = 預測 − 實測（°C）。
"""

from __future__ import annotations

import argparse
import csv
import math
import os
import sys
from typing import Any

ENGINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

COL_MODE = "模式"
COL_NAME = "配方或樣品名"
COL_STRUCT = "結構（SMILES 或名稱）"
COL_TG = "實測 Tg（°C）"
COL_COND = "測量條件"
COL_PURPOSE = "用途（校準／驗證）"
COL_NOTE = "備註"
COL_FAMILY = "材料家族"
COL_ROLE = "角色（A／B）"
COL_COMP = "成分名稱"
COL_WT = "質量百分比（wt%）"
COL_MN = "Mn（g/mol）"
COL_CAT = "成分類別"
COL_MOL = "莫耳數（每 1 mol A）"
COL_ANCHOR = "A 的 Tg 錨點（°C）"
REQUIRED = (COL_NAME, COL_STRUCT, COL_TG, COL_PURPOSE)
MODES = ("unit", "mixture", "relative")
MODE_TITLES = {"unit": "單一重複單元 Tg（unit）", "mixture": "混合配方 Tg（mixture）", "relative": "相對 Tg（relative）"}
DEFAULT_CATEGORY = "Resin"
WT_SUM_TOLERANCE = 0.5
DEMO_MARK = "示範，非實測"
UNCLASSIFIED = "未分類"
DISCLAIMER = "預測值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。"


def _engine():
    if ENGINE_DIR not in sys.path:
        sys.path.insert(0, ENGINE_DIR)
    import moleform_engine as engine

    return engine


def predict_tg_c(smiles: str) -> tuple[float | None, str]:
    """只用結構呼叫引擎 /tg，回傳 (預測 Tg °C 或 None, 說明)。這裡拿不到實測值（D02）。"""
    code, body = _engine().handle_tg({"smiles": smiles})
    if code != 200 or not body.get("ok"):
        return None, "無法計算：" + "；".join(body.get("errors", [f"HTTP {code}"]))
    quantity = body["quantity"]
    if quantity["status"] != "predicted" or quantity["value"] is None:
        n = len(body.get("missing", []))
        return None, f"缺基團（{n} 處）" if n else "無法計算"
    note = "含校準基團" if body.get("containsCalibrated") else ""
    return quantity["value"] - 273.15, note


def _number(text: str) -> float | None:
    try:
        v = float(text.strip())
    except ValueError:
        return None
    return v if math.isfinite(v) else None


def predict_mixture_c(parts: list[dict[str, Any]]) -> tuple[float | None, str]:
    """呼叫 /tg/mixing。parts：[{name, smiles, wt, mn, category}]。只送成分與質量百分比、Mn（D02：沒有實測值）。"""
    components = [{"id": f"c{i}", "name": p["name"], "category": p["category"], "canonicalSmiles": p["smiles"]} for i, p in enumerate(parts)]
    request = {
        "components": components,
        "wtPct": {f"c{i}": p["wt"] for i, p in enumerate(parts)},
        "mn": {f"c{i}": p["mn"] for i, p in enumerate(parts)},
    }
    code, body = _engine().handle_tg_mixing(request)
    if code != 200 or not body.get("ok"):
        return None, "無法計算：" + "；".join(body.get("errors", [f"HTTP {code}"]))
    if body["status"] == "complete" and body["quantity"]["value"] is not None:
        return body["tgC"], ""
    reasons = [str(m) for m in body.get("messages", [])]
    return None, "；".join(reasons) if reasons else f"無法計算（{body['status']}）"


def predict_relative_c(a: list[dict[str, Any]], b: list[dict[str, Any]], anchor_c: float | None) -> tuple[float | None, str]:
    """呼叫 /relative-tg。A 的 Tg 錨點是輸入（D61）；B 的實測值不在請求裡。"""

    def side(items: list[dict[str, Any]]) -> dict[str, Any]:
        monomers = []
        for it in items:
            m: dict[str, Any] = {}
            if it["name"]:
                m["name"] = it["name"]
            if it["smiles"]:
                m["smiles"] = it["smiles"]
            if it["amount"] is not None:
                m["amount"] = it["amount"]
            monomers.append(m)
        return {"monomers": monomers, "basis": "mol"}

    request: dict[str, Any] = {"a": side(a), "b": side(b)}
    if anchor_c is not None:
        request["tgA"] = {"value": anchor_c, "unit": "C"}
    code, body = _engine().handle_relative_tg(request)
    if code != 200 or not body.get("ok"):
        return None, "無法計算：" + "；".join(body.get("errors", [f"HTTP {code}"]))
    tg_b = body["tgB"]
    if body["calculationStatus"] == "ok" and tg_b["status"] == "ok":
        return tg_b["tgK"] - 273.15, ""
    if tg_b["status"] == "table":
        return None, "B 是 k／Tg 表內材料且組成沒改，引擎直接回表內值（不是預測），不比對"
    reasons = [str(tg_b["message"])] if tg_b.get("message") else []
    if body["tgA"].get("status") == "missing":
        reasons.append(str(body["tgA"].get("message")))
    reasons += [f"{x.get('side', '')}「{x.get('monomer', '')}」缺資料" for x in body.get("missing", [])]
    return None, "；".join(reasons) if reasons else "缺資料（引擎回報 missing）"


def load_rows(path: str) -> list[dict[str, str]]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError("缺少欄位：" + "、".join(missing))
        return [dict(r) for r in reader]


def _cell(row: dict[str, str], col: str) -> str:
    return (row.get(col) or "").strip()


def _mode_of(row: dict[str, str]) -> str:
    return _cell(row, COL_MODE).lower() or "unit"


def _unique(rows: list[dict[str, str]], col: str) -> tuple[str, bool]:
    """同一樣品多列中某欄的值：取非空白者；回傳 (值, 是否有互相衝突)。"""
    vals = {_cell(r, col) for r in rows} - {""}
    return (sorted(vals)[0] if vals else ""), len(vals) > 1


def _finish(item: dict[str, Any], predicted: float | None, info: str, include_demo: bool) -> None:
    item["note"] = info
    if predicted is not None:
        item["predicted"] = predicted
        item["error"] = predicted - item["measured"]  # 實測值只在這裡、預測完成之後使用
        item["counted"] = item["use"] == "validation" and (include_demo or not item["demo"])


def _eval_group(mode: str, name: str, line: int, rows: list[dict[str, str]], include_demo: bool) -> dict[str, Any]:
    demo = any(DEMO_MARK in _cell(r, COL_NOTE) or DEMO_MARK in _cell(r, COL_NAME) for r in rows)
    family, _ = _unique(rows, COL_FAMILY)
    item: dict[str, Any] = {
        "line": line, "mode": mode, "name": name, "family": family or UNCLASSIFIED, "purpose": "", "demo": demo,
        "measured": None, "predicted": None, "error": None, "note": "", "counted": False,
    }

    def invalid(why: str) -> dict[str, Any]:
        item.update(use="invalid", note=why)
        return item

    tg_text, tg_conflict = _unique(rows, COL_TG)
    measured = _number(tg_text)
    if measured is None or tg_conflict:
        return invalid("實測 Tg 不是數字" if not tg_conflict else "同一樣品的實測 Tg 填了不同的值")
    item["measured"] = measured
    purpose, purpose_conflict = _unique(rows, COL_PURPOSE)
    item["purpose"] = purpose
    if purpose_conflict or purpose not in ("驗證", "校準"):
        return invalid("用途必須是「校準」或「驗證」（同一樣品只能有一種）")
    item["use"] = "validation" if purpose == "驗證" else "calibration"

    if mode == "mixture":
        parts: list[dict[str, Any]] = []
        for r in rows:
            smiles = _cell(r, COL_STRUCT)
            wt = _number(_cell(r, COL_WT))
            mn_text = _cell(r, COL_MN)
            mn = _number(mn_text) if mn_text else None
            if smiles == "" or wt is None or wt <= 0 or (mn_text and (mn is None or mn <= 0)):
                return invalid("每個成分都要有結構（SMILES）與大於 0 的質量百分比；Mn 留白或填大於 0 的數字")
            parts.append({"name": _cell(r, COL_COMP) or smiles, "smiles": smiles, "wt": wt, "mn": mn, "category": _cell(r, COL_CAT) or DEFAULT_CATEGORY})
        if abs(sum(p["wt"] for p in parts) - 100) > WT_SUM_TOLERANCE:
            return invalid("質量百分比合計不是 100")
        predicted, info = predict_mixture_c(parts)
    else:
        sides: dict[str, list[dict[str, Any]]] = {"A": [], "B": []}
        for r in rows:
            role = _cell(r, COL_ROLE).upper()
            if role not in sides:
                return invalid("角色必須填 A 或 B")
            amount_text = _cell(r, COL_MOL)
            amount = _number(amount_text) if amount_text else None
            if (amount_text and (amount is None or amount <= 0)) or (role == "B" and amount is None):
                return invalid("B 的每一列都要填大於 0 的莫耳數（每 1 mol A）；A 留白視為 1")
            smiles = _cell(r, COL_STRUCT)
            comp = _cell(r, COL_COMP)
            if smiles == "" and comp == "":
                return invalid("每個成分都要有結構（SMILES）或成分名稱")
            sides[role].append({"name": comp, "smiles": smiles, "amount": amount})
        if not sides["A"] or not sides["B"]:
            return invalid("relative 需要至少一列 A 與一列 B")
        anchor_text, anchor_conflict = _unique(rows, COL_ANCHOR)
        anchor = _number(anchor_text) if anchor_text else None
        if anchor_conflict or (anchor_text and anchor is None):
            return invalid("A 的 Tg 錨點必須是數字（只填一個值，或留白由引擎的 k／Tg 表帶出）")
        predicted, info = predict_relative_c(sides["A"], sides["B"], anchor)
    _finish(item, predicted, info, include_demo)
    return item


def evaluate(rows: list[dict[str, str]], include_demo: bool = False) -> list[dict[str, Any]]:
    """逐樣品算預測與誤差。每筆結果含 use（validation／calibration／invalid）與 counted（是否併入驗證統計）。
    unit 一列一個樣品；mixture／relative 以樣品名把多列合成一個樣品。"""
    out: list[dict[str, Any]] = []
    groups: dict[tuple[str, str], list[dict[str, str]]] = {}
    for r in rows:
        if _mode_of(r) in ("mixture", "relative"):
            groups.setdefault((_mode_of(r), _cell(r, COL_NAME)), []).append(r)
    done: set[tuple[str, str]] = set()
    for i, r in enumerate(rows, start=2):  # 第 1 列是標題
        name = _cell(r, COL_NAME)
        struct = _cell(r, COL_STRUCT)
        mode = _mode_of(r)
        if mode not in MODES:
            if name or struct:
                out.append({"line": i, "mode": "unit", "name": name, "family": UNCLASSIFIED, "purpose": "", "demo": False, "measured": None,
                            "predicted": None, "error": None, "note": "模式必須是 unit、mixture 或 relative", "counted": False, "use": "invalid"})
            continue
        if mode != "unit":
            key = (mode, name)
            if name == "" or key in done:
                if name == "" and struct:
                    out.append({"line": i, "mode": mode, "name": "", "family": UNCLASSIFIED, "purpose": "", "demo": False, "measured": None,
                                "predicted": None, "error": None, "note": "沒有樣品名，無法分組", "counted": False, "use": "invalid"})
                continue
            done.add(key)
            out.append(_eval_group(mode, name, i, groups[key], include_demo))
            continue
        purpose = _cell(r, COL_PURPOSE)
        note = _cell(r, COL_NOTE)
        family = _cell(r, COL_FAMILY) or UNCLASSIFIED
        demo = DEMO_MARK in note or DEMO_MARK in name
        item: dict[str, Any] = {"line": i, "mode": "unit", "name": name, "family": family, "purpose": purpose, "demo": demo, "measured": None, "predicted": None, "error": None, "note": "", "counted": False}
        if name == "" and struct == "":
            continue
        measured = _number(_cell(r, COL_TG))
        if measured is None:
            item.update(use="invalid", note="實測 Tg 不是數字")
            out.append(item)
            continue
        item["measured"] = measured
        if purpose == "驗證":
            item["use"] = "validation"
        elif purpose == "校準":
            item["use"] = "calibration"
        else:
            item.update(use="invalid", note="用途必須是「校準」或「驗證」")
            out.append(item)
            continue
        predicted, info = predict_tg_c(struct)  # 只傳結構
        _finish(item, predicted, info, include_demo)
        out.append(item)
    return out


def summarize(items: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    """只統計 counted 的列（用途 = 驗證）。回傳 {家族: {n, mean, mae, max}}，"全部" 為總計。"""
    groups: dict[str, list[float]] = {}
    for it in items:
        if it["counted"]:
            groups.setdefault(it["family"], []).append(it["error"])
    result: dict[str, dict[str, float]] = {}
    for fam, errs in sorted(groups.items()):
        result[fam] = _stats(errs)
    allerrs = [e for errs in groups.values() for e in errs]
    if allerrs:
        result["全部"] = _stats(allerrs)
    return result


def _stats(errs: list[float]) -> dict[str, float]:
    return {"n": len(errs), "mean": sum(errs) / len(errs), "mae": sum(abs(e) for e in errs) / len(errs), "max": max(abs(e) for e in errs)}


def _f(v: float | None) -> str:
    return "—" if v is None else f"{v:.1f}"


def _format_block(items: list[dict[str, Any]], h: str) -> list[str]:
    """一種模式的結果：驗證列、校準列、無法判讀、統計。h 是小標題前綴（## 或 ###）。"""
    lines: list[str] = []
    for title, use in (("驗證列", "validation"), ("校準列（不併入驗證誤差統計）", "calibration")):
        sel = [it for it in items if it.get("use") == use]
        lines += [f"{h} {title}", ""]
        if not sel:
            lines += ["（無）", ""]
            continue
        lines += ["| 樣品 | 家族 | 實測 °C | 預測 °C | 誤差 °C（預測−實測） | 說明 |", "|---|---|---|---|---|---|"]
        for it in sel:
            notes = [it["note"]] if it["note"] else []
            if it["demo"]:
                notes.append("示範列")
                if use == "validation" and it["predicted"] is not None and not it["counted"]:
                    notes.append("未併入統計")
            lines.append(f"| {it['name']} | {it['family']} | {_f(it['measured'])} | {_f(it['predicted'])} | {_f(it['error'])} | {'；'.join(notes)} |")
        lines.append("")
    bad = [it for it in items if it.get("use") == "invalid"]
    if bad:
        lines += [f"{h} 無法判讀的列", ""] + [f"- 第 {it['line']} 列（{it['name']}）：{it['note']}" for it in bad] + [""]
    stats = summarize(items)
    lines += [f"{h} 驗證誤差統計（只含用途 = 驗證、且算得出預測值的列）", ""]
    if not stats:
        lines += ["（沒有可統計的驗證列；示範列需加 --include-demo）", ""]
    else:
        lines += ["| 材料家族 | 筆數 | 平均誤差 °C | 平均絕對誤差 °C | 最大絕對誤差 °C |", "|---|---|---|---|---|"]
        for fam, s in stats.items():
            lines.append(f"| {fam} | {int(s['n'])} | {s['mean']:.1f} | {s['mae']:.1f} | {s['max']:.1f} |")
        lines.append("")
    ncal = sum(1 for it in items if it.get("use") == "calibration")
    if ncal:
        lines += [f"校準列 {ncal} 筆已排除在上表之外。", ""]
    return lines


def format_report(items: list[dict[str, Any]]) -> str:
    lines = ["# 實測 Tg 與預測值比對", "", DISCLAIMER, ""]
    present = [m for m in MODES if any(it.get("mode", "unit") == m for it in items)]
    if present == ["unit"] or not present:
        return "\n".join(lines + _format_block(items, "##"))  # 只有 unit：與 P6C 的輸出相同
    for m in present:
        lines += [f"## 模式：{MODE_TITLES[m]}", ""] + _format_block([it for it in items if it.get("mode", "unit") == m], "###")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="比對使用者實測 Tg 與引擎預測值（實測值只作驗證目標，D02）")
    parser.add_argument("csv", help="填好的實測 CSV（欄位與三種模式見 docs/verification/user-measured-template.csv）")
    parser.add_argument("--include-demo", action="store_true", help="把備註標「示範，非實測」的列也納入統計")
    args = parser.parse_args(argv)
    try:
        rows = load_rows(args.csv)
    except (OSError, ValueError) as e:
        print(f"讀取失敗：{e}", file=sys.stderr)
        return 2
    sys.stdout.reconfigure(encoding="utf-8")
    print(format_report(evaluate(rows, args.include_demo)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
