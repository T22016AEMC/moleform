"""任務 P7-4：在 docs/verification/phase7-固化預測-輸出.md 新增一節「反應溫度範圍與固化收縮」（PLAN 7.2、7.6）。

P7-3 的內容不動：本腳本讀入現有檔案，移除先前產生的 P7-4 一節（以標題為界）再附上新的一節，所以可重複執行。
用引擎的 HTTP 處理函式（moleform_engine.handle_crosslink_analyze／handle_crosslink_cure，與介面走同一條路徑）對配方 4A、4B 各算一次；
另附補充案例（非任務指定）：沒有文獻密度可用的小分子體系，密度與分子量用「示意輸入」（1.0 g/cm³ 等，**不是材料數據**），只為顯示數值路徑。
「使用者判定」欄留空。執行：engine/.venv/Scripts/python scripts/verification/p7-4-temp-shrinkage.py
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))

import moleform_engine as eng  # noqa: E402
from moleform_core import crosslink  # noqa: E402
from moleform_core.cure_shrinkage import compute_temperature_ranges, _is_photo_triggered  # noqa: E402

OUT = ROOT / "docs" / "verification" / "phase7-固化預測-輸出.md"
HEADING = "# 任務 P7-4 輸出：反應溫度範圍與固化收縮（PLAN 7.2、7.6）"

# 重用 P7-3 腳本的 4A、4B 配方（單一來源）
_spec = importlib.util.spec_from_file_location("p73cure", ROOT / "scripts" / "verification" / "p7-3-cure.py")
assert _spec is not None and _spec.loader is not None
p73 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(p73)

TETRATHIOL = "C(OC(=O)CCS)(COC(=O)CCS)(COC(=O)CCS)COC(=O)CCS"
TRIALLYL = "C=CCn1c(=O)n(CC=C)c(=O)n(CC=C)c1=O"
BADGE = "CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1"
BPA = "CC(C)(c1ccc(O)cc1)c1ccc(O)cc1"
PHTHALIC_ANHYDRIDE = "O=C1OC(=O)c2ccccc12"


def run(comps: list[dict], amounts: dict, molar_mass: dict | None = None) -> tuple[dict, dict]:
    request_comps = []
    for c in comps:
        d = dict(c)
        if "*" not in c["canonicalSmiles"]:
            if molar_mass is not None:
                d["molarMass"] = molar_mass[c["id"]]
            else:
                from rdkit import Chem
                from rdkit.Chem import Descriptors

                d["molarMass"] = Descriptors.MolWt(Chem.MolFromSmiles(c["canonicalSmiles"]))
        request_comps.append(d)
    code, analysis = eng.handle_crosslink_analyze({"components": request_comps})
    assert code == 200, analysis
    mn = {c["id"]: c["molarMass"] for c in analysis["components"]}
    solid = {"unit": "wt", "components": [{**c, "amount": amounts[c["id"]]} for c in comps]}
    code, out = eng.handle_crosslink_cure({"result": analysis, "solid": solid, "wtPct": amounts, "mn": mn})
    assert code == 200, out
    return analysis, out


def esc(s: str | None) -> str:
    return (s or "").replace("|", "／").replace("\n", " ")


def temp_lines(ranges: dict) -> list[str]:
    lines = [f"反應溫度範圍（7.2）：{ranges['note']}", "", "| 反應規則 | 文獻溫度範圍 | 適用條件（notes 摘要） | 出處 | 審核狀態 | 使用者判定 |", "|---|---|---|---|---|---|"]
    for r in ranges["rows"]:
        cond = r["conditions"] or ("光觸發（溫度不是觸發條件）" if r["status"] == "photo" else "無（規則表欄位空白）")
        lines.append(f"| {esc(r['ruleId'])} | {esc(r['text'])} | {esc(cond)} | {esc(r['source'])} | {esc(r['reviewStatus'])} | |")
    if not ranges["rows"]:
        lines.append("| （配方中沒有命中的反應規則） | | | | | |")
    lines.append("")
    return lines


def shrink_lines(s: dict) -> list[str]:
    lines = ["固化收縮（7.6，參考趨勢，正值＝體積減少）：", ""]
    lines += ["| 反應 | 類型 | ΔV（cm³/mol） | 說明 | 使用者判定 |", "|---|---|---|---|---|"]
    for r in s["reactions"]:
        kind = {"direct": "直接文獻值", "interpreted": r.get("interpretation") or "詮釋", "missing": "無值（不計入）"}[r["kind"]]
        dv = "—" if r["deltaV"] is None else f"{r['deltaV']:g}"
        why = r["reason"] if r["kind"] == "missing" else (r["note"] or f"出處：{r['source']}")
        lines.append(f"| {esc(r['name'])}（{esc(r['ruleId'])}） | {esc(kind)} | {dv} | {esc(why)} | |")
    lines.append("")
    if s["status"] == "missing":
        lines += [f"收縮率：**missing**——{esc(s['reason'])}", ""]
        return lines
    lines += [f"混合密度 ρ = {s['density']['gPerCm3']:.4f} g/cm³（{esc(s['density']['model'])}）", "", "| 轉化率 | 收縮率（%） | 其中直接文獻值（%） | 其中詮釋值（%） | 形成的鍵（mol/kg Solid） | 使用者判定 |", "|---|---|---|---|---|---|"]
    for r in s["table"]:
        lines.append(f"| {r['conversion'] * 100:.0f}% | {r['totalPct']:.4f} | {r['directPct']:.4f} | {r['interpretedPct']:.4f} | {r['byReaction'][0]['bondsMolPerKg']:.4f} | |")
    lines.append("")
    return lines


def section() -> list[str]:
    rules = crosslink.load_reaction_rules()
    lines = [
        HEADING,
        "",
        "產生方式：`engine/.venv/Scripts/python scripts/verification/p7-4-temp-shrinkage.py`（引擎 `/crosslink/analyze` → `/crosslink/cure`，與介面同一條路徑）。",
        "溫度範圍只顯示規則表的文獻值（待使用者審，不計算、不補值、不內插）；固化收縮 = Σ（單位鍵體積變化 × 形成的鍵莫耳數）÷ 配方總體積（S05），"
        "環氧開環沿用值標「詮釋：沿用環氧開環值（外推）」並與直接文獻值分列。所有數值為依理論模型估算之參考值，非實測值。「使用者判定」欄留空。",
        "",
    ]
    for title, desc, comps, amounts in p73.CASES[:2]:
        _, out = run(comps, amounts)
        lines += [f"## {title}", "", desc, ""]
        lines += temp_lines(out["temperatureRanges"])
        lines += shrink_lines(out["shrinkage"])
    lines += [
        "4A、4B 的固化收縮為 missing 是預期的：P 是共聚物（以第一種單元代表會失真，不計算密度）、E（PGMA）的莫耳體積表缺基團、S（SBI 雙酚）是小分子（小分子液體密度尚未收錄）。"
        "介面沒有密度輸入欄位，所以以小分子為主的配方目前多半是 missing；密度只能由引擎請求的選用欄位 `density` 提供（介面不送）。",
        "",
        "## 補充案例 A（非任務指定；示意輸入）：硫醇–烯，直接有文獻值",
        "",
        "示意輸入（**不是材料數據**）：四硫醇（4 個 –SH）M = 400 g/mol、密度 1.2 g/cm³；三烯丙基化合物（3 個烯丙基）M = 300 g/mol、密度 1.0 g/cm³；Solid wt% 各 50。"
        "手算：–SH 0.5 mol、烯丙基 0.5 mol（1:1）；轉化率 100% 形成 5.0 mol/kg；ρ = 1/(0.5/1.2 + 0.5/1.0) = 1.0909 g/cm³；收縮率 = 12.6 × 5.0 ÷ 916.67 = 6.8727 %。",
        "",
    ]
    comps_a = [
        {"id": "T", "name": "四硫醇（示意）", "category": "Resin", "canonicalSmiles": TETRATHIOL, "density": 1.2},
        {"id": "E", "name": "三烯丙基（示意）", "category": "Resin", "canonicalSmiles": TRIALLYL, "density": 1.0},
    ]
    _, out = run(comps_a, {"T": 50, "E": 50}, {"T": 400.0, "E": 300.0})
    lines += temp_lines(out["temperatureRanges"]) + shrink_lines(out["shrinkage"])
    lines += [
        "## 補充案例 B（非任務指定；示意輸入）：環氧＋酚，環氧開環沿用",
        "",
        "示意輸入（**不是材料數據**）：環氧（2 個環氧基）M = 400 g/mol、酚（2 個酚羥基）M = 200 g/mol，密度皆 1.0 g/cm³；Solid wt% 各 50。"
        "手算：環氧基 0.25 mol（限量）；轉化率 100% 形成 2.5 mol/kg；V = 1000 cm³/kg；收縮率 = 11 × 2.5 ÷ 1000 = 2.75 %。規則 epoxy+phenol 在規則表沒有自己的值，沿用 epoxy+pag.cationic 的環氧開環值。",
        "",
    ]
    comps_b = [
        {"id": "E", "name": "環氧（示意）", "category": "Resin", "canonicalSmiles": BADGE, "density": 1.0},
        {"id": "P", "name": "雙酚（示意）", "category": "Resin", "canonicalSmiles": BPA, "density": 1.0},
    ]
    _, out = run(comps_b, {"E": 50, "P": 50}, {"E": 400.0, "P": 200.0})
    lines += temp_lines(out["temperatureRanges"]) + shrink_lines(out["shrinkage"])
    lines += ["## 補充案例 C（非任務指定）：第 1 層不支援的體系（環氧＋酸酐）", ""]
    comps_c = [{"id": "B", "name": "BADGE", "category": "Resin", "canonicalSmiles": BADGE}, {"id": "A", "name": "酸酐", "category": "Resin", "canonicalSmiles": PHTHALIC_ANHYDRIDE}]
    _, out = run(comps_c, {"B": 70, "A": 30})
    lines += [f"固化預測回報第 1 層同一個原因：{esc(out['reason'])}", "", "固化收縮不硬算；溫度範圍只是顯示規則表的值，仍列出：", ""]
    lines += temp_lines(out["temperatureRanges"])

    lines += ["## 規則表現況（資料多為空，僅顯示有文獻值的反應）", ""]
    with_range = [r for r in rules if r["temp_min_c"] is not None or r["temp_max_c"] is not None]
    photo = [r for r in rules if _is_photo_triggered(r)]
    with_dv = [r for r in rules if r["bond_volume_change"] is not None]
    lines += [
        f"- 規則 {len(rules)} 條；有溫度範圍 {len(with_range)} 條：{'、'.join(r['id'] for r in with_range)}",
        f"- 光觸發 {len(photo)} 條：{'、'.join(r['id'] for r in photo)}",
        f"- 有 `bond_volume_change` {len(with_dv)} 條：{'、'.join(r['id'] for r in with_dv)}",
        "- 其中第 1 層支援、可算固化收縮的只有硫醇–烯 3 條（直接文獻值）；環氧＋酚與環氧＋胺 4 條沿用環氧開環值（詮釋）；（甲基）丙烯酸酯與陽離子環氧的第 1 層為「尚未支援」。",
        "",
    ]
    # 溫度範圍欄位：所有有範圍的規則逐條列出（用 compute_temperature_ranges，與介面同一函式）
    all_rows = compute_temperature_ranges([{"ruleId": r["id"], "reactionLabel": r["id"]} for r in with_range], rules)
    lines += temp_lines(all_rows)
    return lines


def main() -> None:
    text = OUT.read_text(encoding="utf-8")
    if HEADING in text:
        text = text[: text.index(HEADING)].rstrip("\n") + "\n"
    text = text.rstrip("\n") + "\n\n" + "\n".join(section()).rstrip("\n") + "\n"
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
