"""任務 P7-5：用 Perrin 1981 書中自己給的算例與對照表驗證 pKa 估算，輸出 docs/verification/phase7-pKa-輸出.md。

比對對象全是書中印出的數字（書的預測值，或書中表格的實驗值）；不用使用者的任何實測值（D02）。
本腳本走 `/pka` 的處理函式（moleform_engine.handle_pka，與介面同一條路徑）。「使用者判定」欄留空。
執行：engine/.venv/Scripts/python scripts/verification/p7-5-pka.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))

import moleform_engine as eng  # noqa: E402
from moleform_core import pka, site_activity  # noqa: E402

OUT = ROOT / "docs" / "verification" / "phase7-pKa-輸出.md"

# (標籤, SMILES, 位點選擇, 書的值, 書中位置, 統計因子（書手加、程式不做）, 備註)
WORKED = [
    ("4-氯-3,5-二甲基酚", "Oc1cc(C)c(Cl)c(C)c1", 0, 9.70, "§5.3.1 書頁 47–48（書的實驗值 9.71）", None,
     "書的算式 9.92 − 2.23 × (0.24 − 0.06 − 0.06) 代入實際等於 9.65，書印 9.70：書內算式與其印出的結果不一致（本卡照書顯示的算式算，不調整數值）"),
    ("鄰苯三酚，C1（或 C3）上的 −OH", "Oc1cccc(O)c1O", 0, 9.24, "§5.3.2 書頁 48", -0.30, "書另減統計因子 log 2 = 0.3（兩個等價位點）"),
    ("鄰苯三酚，C2 上的 −OH", "Oc1cccc(O)c1O", 2, 9.74, "§5.3.2 書頁 48", None, ""),
    ("苯六酚", "Oc1c(O)c(O)c(O)c(O)c1O", 0, 8.31, "§5.3.3 書頁 49（書的實驗值 9.0）", -0.78, "書另減統計因子 log 6 = 0.78（六個等價位點）"),
    ("苦味酸", "Oc1c([N+](=O)[O-])cc([N+](=O)[O-])cc1[N+](=O)[O-]", 0, 0.91, "§5.3.4 書頁 49（書的實驗值 0.33）", None, ""),
    ("2,6-二氯-1,4-苯二酚，C1 上的 −OH", "Oc1c(Cl)cc(O)cc1Cl", 0, 6.82, "§5.3.5 書頁 50（書的實驗值 7.30）", None, ""),
    ("2,6-二氯-1,4-苯二酚，C4 上的 −OH", "Oc1c(Cl)cc(O)cc1Cl", 1, 8.20, "§5.3.5 書頁 50", None, ""),
    ("3,4,5-三羥基苯甲酸，−COOH", "OC(=O)c1cc(O)c(O)c(O)c1", "acid", 4.32, "§5.3.6 書頁 50（書的實驗值 4.46）", None, "只比羧基：書算酚羥基時改用 −COO⁻ 的 σ，與本版「其他基團保持中性」不同，不比"),
    ("4-溴-1,2-苯二甲酸，較強的 −COOH", "OC(=O)c1ccc(Br)cc1C(O)=O", "min", 2.86, "§5.3.7 書頁 51（書的實驗值 2.50）", None, "書的 pKa2 用 −COO⁻ 的 σ，不比"),
    ("4-羥基-3,5-二甲氧基苯甲酸，−COOH", "OC(=O)c1cc(OC)c(O)c(OC)c1", "acid", 4.36, "§5.3.8 書頁 51–52（書的實驗值 4.34）", None, ""),
    ("3-碘-4-甲硫基苯胺", "Nc1ccc(SC)c(I)c1", 0, 3.34, "§5.3.9 書頁 52（書的實驗值 3.44）", None, ""),
    ("4-溴-3-硝基苯胺", "Nc1ccc(Br)c([N+](=O)[O-])c1", 0, 1.82, "§5.3.10 書頁 52（書的實驗值 1.80）", None, ""),
    ("2-(甲胺基)乙醯胺", "CNCC(N)=O", 0, 8.43, "§4.4.1 書頁 40（書的實驗值 8.31）", None, "σ*(−CH2CONH2) = 0.4 × 1.68 = 0.67"),
    ("乙酸 2-(二甲胺基)乙酯", "CC(=O)OCCN(C)C", 0, 8.26, "§4.4.2 書頁 40–41（書的實驗值 8.35）", None, "σ*(−CH2CH2OCOCH3) = 0.4 × 0.4 × 2.56 → 0.41"),
    ("2,3-二羥基-2-羥甲基丙酸", "OCC(O)(CO)C(=O)O", "acid", 3.01, "§4.4.3 書頁 41（書的實驗值 3.29）", None, ""),
    ("1,8-二胺基-3,6-二硫雜辛烷", "NCCSCCSCCN", 0, 9.66, "§4.4.4 書頁 41（書的實驗值 9.06 與 9.47）", 0.30, "書另加統計因子 +0.3（較大的 pKa）；書以 −CH2CH2SCH2CH3 近似，本卡逐層衰減到 −SR 通式列，結果同為 0.25"),
    ("乙醇", "CCO", 0, 15.9, "§6.3.1 書頁 60（書：式 6.5 給乙醇 15.9）", None, ""),
]

# (標籤, SMILES, 書的實驗值, 書中位置)
TABLE_1_2 = [
    ("苯胺", "Nc1ccccc1", 4.69), ("苯甲酸", "OC(=O)c1ccccc1", 4.21), ("苯酚", "Oc1ccccc1", 10.00), ("硫酚", "Sc1ccccc1", 6.52),
    ("對硝基酚", "Oc1ccc([N+](=O)[O-])cc1", 7.15), ("乙酸", "CC(=O)O", 4.76), ("乙硫醇", "CCS", 10.54), ("甲醇", "CO", 15.5),
    ("乙胺", "CCN", 10.81), ("二乙胺", "CCNCC", 11.09), ("三乙胺", "CCN(CC)CC", 10.78),
    ("哌啶（環狀胺）", "C1CCNCC1", 11.28), ("環己烷羧酸（α 碳在環上）", "OC(=O)C1CCCCC1", 4.90),
]
TABLE_3_1 = [
    ("甲胺", "CN", 10.63), ("乙胺", "CCN", 10.70), ("丙胺", "CCCN", 10.60), ("第二丁胺", "CCC(C)N", 10.56), ("第三丁胺", "CC(C)(C)N", 10.68),
    ("二甲胺", "CNC", 10.78), ("二乙胺", "CCNCC", 11.02), ("二丙胺", "CCCNCCC", 11.00), ("二異丙胺", "CC(C)NC(C)C", 11.05),
    ("三甲胺", "CN(C)C", 9.80), ("三乙胺", "CCN(CC)CC", 10.75), ("乙基二甲胺", "CCN(C)C", 10.05), ("二乙基甲胺", "CCN(CC)C", 10.35),
    ("丙基二甲胺", "CCCN(C)C", 10.05), ("異丙基二甲胺", "CC(C)N(C)C", 10.36), ("第三丁基二甲胺", "CC(C)(C)N(C)C", 9.97), ("三丙胺", "CCCN(CCC)CCC", 10.66),
]
TABLE_3_2 = [
    ("乙酸", "CC(=O)O", 4.76), ("丙酸", "CCC(=O)O", 4.86), ("丁酸", "CCCC(=O)O", 4.83), ("戊酸", "CCCCC(=O)O", 4.84), ("己酸", "CCCCCC(=O)O", 4.85),
    ("異丁酸", "CC(C)C(=O)O", 4.88), ("2-甲基丁酸", "CCC(C)C(=O)O", 4.80), ("二乙基乙酸", "CCC(CC)C(=O)O", 4.74),
    ("三甲基乙酸（新戊酸）", "CC(C)(C)C(=O)O", 5.03), ("2,2-二甲基丁酸（書註 18°）", "CCC(C)(C)C(=O)O", 5.04), ("2,2-二甲基己酸", "CCCCC(C)(C)C(=O)O", 4.97),
]


def groups_of(smiles: str) -> list[dict]:
    code, body = eng.handle_pka({"smiles": smiles})
    assert code == 200, body
    return body["groups"]


def pick(groups: list[dict], how: object) -> dict | None:
    if not groups:
        return None
    if isinstance(how, int):
        return groups[how]
    pool = [g for g in groups if (how != "acid" or g["role"] == "acid") and g["quantity"]["status"] == "predicted"]
    if not pool:
        return groups[0]
    return min(pool, key=lambda g: g["quantity"]["value"]) if how in ("min", "acid") else pool[0]


def value_text(g: dict | None) -> tuple[str, float | None, str]:
    if g is None:
        return "—", None, "沒有 pKa 類別涵蓋的可解離基團"
    q = g["quantity"]
    if q["status"] != "predicted":
        return "missing", None, g["reason"] or ""
    return f"{q['value']:.2f}", q["value"], ""


def sigma_text(g: dict | None) -> str:
    if g is None or not g["sigmaDetails"]:
        return ""
    parts = []
    for d in g["sigmaDetails"]:
        label = d.get("position") or ("σ*×" + str(d["attenuationSteps"]) if d.get("attenuationSteps") else "σ*")
        parts.append(f"{d['name']}（{label}）{d['value']:+.2f}")
    return "；".join(parts)


def section() -> list[str]:
    L: list[str] = []
    L += ["# 任務 P7-5 輸出：pKa 估算對 Perrin 1981 書中算例與對照表（PLAN 7.3a，D38、D66）", ""]
    L += [
        "產生方式：`engine/.venv/Scripts/python scripts/verification/p7-5-pka.py`（走 `/pka` 的處理函式，與介面同一條路徑）。",
        "比對對象全是**書中印出的數字**（書的預測值或書中表格的實驗值，Perrin, Dempsey & Serjeant 1981）；**沒有使用者的任何實測值**（D02）。",
        "「差」＝ 本卡值 − 書的值；「使用者判定」欄留空，由使用者填寫。本卡值是水溶液 25 °C 的估算，只用於比較相對強弱（參考趨勢）。",
        "SMILES 不用反引號標示：scripts/golden/export-molGraph.ts 會掃描 docs/verification/*.md 的反引號字串當 SMILES 候選，本檔的 SMILES 都已在其他案例中，避免改動黃金檔。",
        "各位點的式子、Σσ 與每個 σ 的明細（取代基、位置、值、出處）見 `/pka` 的回應。程式不加統計因子（log n）：書的算例若加了，欄位「書手加的統計因子」列出，比對時由我們把它加到本卡值上。",
        "",
        "## A. 書自己的算例（書的預測值）",
        "",
        "| 分子 | SMILES | 書中位置 | 書的預測值 | 本卡值 | 書手加的統計因子 | 差 | Σσ 或 Σσ* 明細 | 備註 | 使用者判定 |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    diffs: list[float] = []
    for label, smi, how, book, where, stat, note in WORKED:
        g = pick(groups_of(smi), how)
        txt, val, why = value_text(g)
        if val is None:
            L.append(f"| {label} | {smi} | {where} | {book:.2f} | {txt} | | | {why} | {note} | |")
            continue
        adj = val + (stat or 0.0)
        d = adj - book
        diffs.append(d)
        stat_txt = "" if stat is None else f"{stat:+.2f}"
        L.append(f"| {label} | {smi} | {where} | {book:.2f} | {txt} | {stat_txt} | {d:+.2f} | {sigma_text(g)} | {note} | |")
    big = [x for x in diffs if abs(x) > 0.0051]
    L += ["", f"A 節共 {len(WORKED)} 列；差的絕對值 ≤ 0.005（書印兩位小數的精度）者 {len(diffs) - len(big)} 列，超過者 {len(big)} 列（見上表備註）。", ""]

    def exp_table(title: str, rows: list[tuple[str, str, float]], cite: str) -> None:
        L.extend([f"## {title}", "", cite, "", "| 分子 | SMILES | 式子 | 書的實驗值 | 本卡值 | 差 | 說明（missing 的原因） | 使用者判定 |", "|---|---|---|---|---|---|---|---|"])
        for label, smi, exp in rows:
            g = pick(groups_of(smi), 0)
            txt, val, why = value_text(g)
            cls = g["className"] if g else "—"
            if val is None:
                L.append(f"| {label} | {smi} | {cls} | {exp:.2f} | {txt} | | {why} | |")
            else:
                L.append(f"| {label} | {smi} | {cls} | {exp:.2f} | {txt} | {val - exp:+.2f} | | |")
        L.append("")

    exp_table("B. Table 1.2（書頁 4，水溶液 20–25 °C）的個別 pKa", TABLE_1_2, "書中這張表是**實驗值**，不是預測；列出式子的估算與書值的差，供使用者判斷。")
    exp_table("C. Table 3.1（書頁 22，脂肪胺，25 °C、I = 0.01–0.1）", TABLE_3_1, "書中是實驗值；本卡的 Taft 式（Hall 1957 的三條式）只考慮 σ*，不含書正文另外的簡化規則（式 3.2–3.4）。")
    exp_table("D. Table 3.2（書頁 24，脂肪酸，25 °C、I = 0）", TABLE_3_2, "書中是實驗值；各列用 RCH2COOH、R¹R²CHCOOH、R¹R²R³COOH 三條 Taft 式。")
    # SASA 參數與重現
    mol = pka.Chem.MolFromSmiles("CC(C)(c1ccc(O)cc1)c1ccc(O)cc1")
    a = site_activity.compute_sasa_per_atom(mol)
    b = site_activity.compute_sasa_per_atom(mol)
    L += [
        "## E. 空間位阻（SASA）重現性檢查",
        "",
        f"參數：{site_activity.SASA_PARAMS}。雙酚 A 兩次獨立計算的各原子 SASA 逐位相同：**{a[0] == b[0]}**（固定種子、固定構型數與優化方式）。",
        "SASA 是幾何描述量，不是文獻公式；沒有書中數值可對照，所以不在這份文件做「對書的比對」。",
        "",
    ]
    return L


def main() -> None:
    OUT.write_text("\n".join(section()).rstrip("\n") + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
