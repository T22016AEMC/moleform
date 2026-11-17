"""使用者實測 Tg 與引擎預測值的比對（任務 P6C，PLAN 6.9）。

用法（在專案根目錄）：
    engine/.venv/Scripts/python.exe engine/scripts/compare_measured.py 填好的檔案.csv [--include-demo]

輸入 CSV 欄位（模板：docs/verification/user-measured-template.csv，UTF-8，Excel 另存 CSV UTF-8 即可）：
    配方或樣品名、結構（SMILES 或名稱）、實測 Tg（°C）、測量條件、用途（校準／驗證）、備註，另有選填欄「材料家族」。
- 結構要填單一重複單元 SMILES（含 * 連接點，與 /tg 端點相同）；填名稱或引擎算不出的結構只會列出「無法計算」，不進統計。
- 用途 = 驗證：預測誤差併入統計；用途 = 校準：該列只列出，**不併入任何驗證誤差統計**（校準與驗證資料要分開，避免自己驗自己）。
- 備註含「示範，非實測」的列是模板示範，預設不進統計；加 --include-demo 才納入（用來看統計長什麼樣子）。

D02：實測值只作驗證目標。預測函式 predict_tg_c 只收到 SMILES；實測值在預測完成之後才拿來減，
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

COL_NAME = "配方或樣品名"
COL_STRUCT = "結構（SMILES 或名稱）"
COL_TG = "實測 Tg（°C）"
COL_COND = "測量條件"
COL_PURPOSE = "用途（校準／驗證）"
COL_NOTE = "備註"
COL_FAMILY = "材料家族"
REQUIRED = (COL_NAME, COL_STRUCT, COL_TG, COL_PURPOSE)
DEMO_MARK = "示範，非實測"
UNCLASSIFIED = "未分類"
DISCLAIMER = "預測值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。"


def predict_tg_c(smiles: str) -> tuple[float | None, str]:
    """只用結構呼叫引擎 /tg，回傳 (預測 Tg °C 或 None, 說明)。這裡拿不到實測值（D02）。"""
    if ENGINE_DIR not in sys.path:
        sys.path.insert(0, ENGINE_DIR)
    import moleform_engine as engine

    code, body = engine.handle_tg({"smiles": smiles})
    if code != 200 or not body.get("ok"):
        return None, "無法計算：" + "；".join(body.get("errors", [f"HTTP {code}"]))
    quantity = body["quantity"]
    if quantity["status"] != "predicted" or quantity["value"] is None:
        n = len(body.get("missing", []))
        return None, f"缺基團（{n} 處）" if n else "無法計算"
    note = "含校準基團" if body.get("containsCalibrated") else ""
    return quantity["value"] - 273.15, note


def load_rows(path: str) -> list[dict[str, str]]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
        if missing:
            raise ValueError("缺少欄位：" + "、".join(missing))
        return [dict(r) for r in reader]


def evaluate(rows: list[dict[str, str]], include_demo: bool = False) -> list[dict[str, Any]]:
    """逐列算預測與誤差。每列結果含 use（validation／calibration／invalid）與 counted（是否併入驗證統計）。"""
    out: list[dict[str, Any]] = []
    for i, r in enumerate(rows, start=2):  # 第 1 列是標題
        name = (r.get(COL_NAME) or "").strip()
        struct = (r.get(COL_STRUCT) or "").strip()
        purpose = (r.get(COL_PURPOSE) or "").strip()
        note = (r.get(COL_NOTE) or "").strip()
        family = (r.get(COL_FAMILY) or "").strip() or UNCLASSIFIED
        demo = DEMO_MARK in note or DEMO_MARK in name
        item: dict[str, Any] = {"line": i, "name": name, "family": family, "purpose": purpose, "demo": demo, "measured": None, "predicted": None, "error": None, "note": "", "counted": False}
        if name == "" and struct == "":
            continue
        try:
            measured = float((r.get(COL_TG) or "").strip())
            if not math.isfinite(measured):
                raise ValueError
        except ValueError:
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
        item["note"] = info
        if predicted is not None:
            item["predicted"] = predicted
            item["error"] = predicted - measured  # 實測值只在這裡、預測完成之後使用
            item["counted"] = item["use"] == "validation" and (include_demo or not demo)
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


def format_report(items: list[dict[str, Any]]) -> str:
    lines = ["# 實測 Tg 與預測值比對", "", DISCLAIMER, ""]
    for title, use in (("驗證列", "validation"), ("校準列（不併入驗證誤差統計）", "calibration")):
        sel = [it for it in items if it.get("use") == use]
        lines += [f"## {title}", ""]
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
        lines += ["## 無法判讀的列", ""] + [f"- 第 {it['line']} 列（{it['name']}）：{it['note']}" for it in bad] + [""]
    stats = summarize(items)
    lines += ["## 驗證誤差統計（只含用途 = 驗證、且算得出預測值的列）", ""]
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
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="比對使用者實測 Tg 與引擎預測值（實測值只作驗證目標，D02）")
    parser.add_argument("csv", help="填好的實測 CSV（欄位見 docs/verification/user-measured-template.csv）")
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
