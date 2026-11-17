"""任務 P6B 的書中算例對照（驗證只做一次）。產生 docs/verification/phase6-Tm-Td-吸濕-彈性模數-輸出.md。

用書自己的算例：Table 6.15（Tm）、Table 21.3（Td,1/2）、Example 18.4（尼龍 6,6 吸濕）、Table 13.6（體積模數）。
每個聚合物只列：書值、本卡值、差。不調整任何數值去湊；對不上的只如實列出與可能原因。

重新產生（在專案根目錄）：engine/.venv/Scripts/python.exe scripts/verification/phase6-tm-td-moisture-modulus.py
注意：輸出文件不使用反引號（scripts/golden/export-molGraph.ts 會掃描 docs/verification/*.md 內反引號中形似 SMILES 的字串）。
"""

from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "engine"))
sys.stdout.reconfigure(encoding="utf-8")

import moleform_engine as engine  # noqa: E402
from moleform_core import moisture, modulus, td, tm  # noqa: E402

OUT = os.path.join(ROOT, "docs", "verification", "phase6-Tm-Td-吸濕-彈性模數-輸出.md")


def esc(smiles: str) -> str:
    return smiles.replace("*", "\\*").replace("|", "\\|")


# ---------------- Table 6.15（書頁 165–166，PDF 第 192–193 頁）----------------
# (聚合物, Tm exp 原文, Tm calc, 重複單元 SMILES)
TM_CASES = [
    ("Polyethylene", "410 (268/414)", 407, "*CC*"),
    ("Polyethylidene", "463", 464, "*C(*)C"),
    ("Polypropylene", "385/481", 445, "*CC(*)C"),
    ("Polyisobutylene", "275/317", 318, "*CC(C)(C)*"),
    ("Polystyrene", "498/523", 516, "*CC(*)c1ccccc1"),
    ("Polybutene", "379/415", 361, "*CC(*)CC"),
    ("Polyoctene", "235", 235, "*CC(*)CCCCCC"),
    ("Polyoctadecene", "314/383", 330, "*CC(*)CCCCCCCCCCCCCCCC"),
    ("Poly(vinyl methyl ether)", "417/423", 420, "*CC(*)OC"),
    ("Poly(vinyl ethyl ether)", "359", 354, "*CC(*)OCC"),
    ("Poly(vinyl heptadecyl ether)", "333", 329, "*CC(*)OCCCCCCCCCCCCCCCCC"),
    ("Poly(propyl acrylate)", "388/435", 360, "*CC(*)C(=O)OCCC"),
    ("Poly(butyl acrylate)", "320", 309, "*CC(*)C(=O)OCCCC"),
    ("Poly(docosyl acrylate)", "329/345", 336, "*CC(*)C(=O)OCCCCCCCCCCCCCCCCCCCCCC"),
    ("Poly(vinyl dodecanoate)", "274/302", 288, "*CC(*)OC(=O)CCCCCCCCCCC"),
    ("Poly(methyl methacrylate)", "433/473", 433, "*CC(C)(*)C(=O)OC"),
    ("Poly(docosyl methacrylate)", "328/334", 341, "*CC(C)(*)C(=O)OCCCCCCCCCCCCCCCCCCCCCC"),
    ("Poly(vinyl fluoride)", "503", 502, "*CC(*)F"),
    ("Poly(vinylidene fluoride)", "410/511", 488, "*CC(F)(F)*"),
    ("Poly(tetrafluoroethylene)", "292/672", 510, "*C(F)(F)C(F)(F)*"),
    ("Poly(vinyl chloride)", "485/583", 531, "*CC(*)Cl"),
    ("Poly(vinylidene chloride)", "463/483", 461, "*CC(Cl)(Cl)*"),
    ("Poly(trifluoro-chloroethylene)", "483/533", 494, "*C(F)(F)C(F)(Cl)*"),
    ("Poly(ethylene oxide)", "335/349", 352, "*CCO*"),
    ("Poly(trimethylene oxide)", "308", 319, "*CCCO*"),
    ("Poly(tetramethylene oxide)", "308/333", 299, "*CCCCO*"),
    ("Poly(ethylene sulphide)", "418/483", 407, "*CCS*"),
    ("Poly(decamethylene sulphide)", "351/365", 363, "*CCCCCCCCCCS*"),
    ("Poly(decamethylene disulphide)", "318/332", 343, "*CCCCCCCCCCSS*"),
    ("Poly(ethylene adipate)", "320/338", 348, "*CCOC(=O)CCCCC(=O)O*"),
    ("Poly(decamethylene adipate)", "343/355", 345, "*CCCCCCCCCCOC(=O)CCCCC(=O)O*"),
    ("Poly(decamethylene sebacate)", "344/358", 349, "*CCCCCCCCCCOC(=O)CCCCCCCCC(=O)O*"),
    ("Poly(ethylene terephthalate)", "538/557", 563, "*CCOC(=O)c1ccc(cc1)C(=O)O*"),
    ("Poly(decamethylene terephthalate)", "396/411", 480, "*CCCCCCCCCCOC(=O)c1ccc(cc1)C(=O)O*"),
    ("Poly(paraphenylene dimethylene adipate)", "343/354", 395, "*Cc1ccc(cc1)COC(=O)CCCCC(=O)O*"),
    ("Poly(tetramethylene anhydride)", "350/371", 335, "*C(=O)OC(=O)CCCC*"),
    ("Poly(hexadecamethylene anhydride)", "368", 369, "*C(=O)OC(=O)CCCCCCCCCCCCCCCC*"),
    ("Poly(tetramethylene carbonate)", "332", 327, "*OC(=O)OCCCC*"),
    ("Poly(decamethylene carbonate)", "328/378", 350, "*OC(=O)OCCCCCCCCCC*"),
    ("Poly(hexamethylene adipamide)", "523/545", 518, "*C(=O)NCCCCCCNC(=O)CCCC*"),
    ("Poly(decamethylene sebacamide)", "467/489", 469, "*C(=O)NCCCCCCCCCCNC(=O)CCCCCCCC*"),
    ("Poly(6-aminocaproic acid)", "487/506", 510, "*C(=O)NCCCCC*"),
    ("Poly(11-aminoundecanoic acid)", "455/493", 464, "*C(=O)NCCCCCCCCCC*"),
    ("Poly(nonamethylene azelamide)", "438/462", 436, "*C(=O)NCCCCCCCCCNC(=O)CCCCCCC*"),
    ("Poly(ethylene terephthalamide)", "728", 752, "*CCNC(=O)c1ccc(cc1)C(=O)N*"),
    ("Poly(hexamethylene terephthalamide)", "623/644", 634, "*CCCCCCNC(=O)c1ccc(cc1)C(=O)N*"),
    ("Poly(octadecamethylene terephthalamide)", "528", 542, "*CCCCCCCCCCCCCCCCCCNC(=O)c1ccc(cc1)C(=O)N*"),
    ("Poly(paraphenylene dimethylene adipamide)", "606/613", 598, "*NC(=O)CCCCC(=O)NCc1ccc(cc1)C*"),
    ("Poly(hexamethylene-4,4'-oxydibutyramide)", "460", 513, "*NC(=O)CCCOCCCC(=O)NCCCCCC*"),
    ("Poly(tetramethylene hexamethylene diurethane)", "446/462", 435, "*OC(=O)NCCCCCCNC(=O)OCCCC*"),
    ("Poly(decamethylene hexadecamethylene diurethane)", "401", 417, "*OC(=O)NCCCCCCCCCCNC(=O)OCCCCCCCCCCCCCCCC*"),
    ("Poly(paraphenylene dimethylene tetramethylene diurethane)", "500", 486, "*OC(=O)NCc1ccc(cc1)CNC(=O)OCCCC*"),
    ("Poly(hexamethylene octamethylene diurea)", "498/526", 531, "*NC(=O)NCCCCCCNC(=O)NCCCCCCCC*"),
    ("Poly(paraphenylene dimethylene hexamethylene diurea)", "579", 579, "*NC(=O)NCc1ccc(cc1)CNC(=O)NCCCCCC*"),
]

# ---------------- Table 21.3（書頁 770，PDF 第 797 頁）----------------
# (聚合物, Td exp, M, Yd exp, Yd calc, Td calc, SMILES)；Td calc 為 None 表示書中印「–」
TD_CASES = [
    ("Poly(methylene)", 687, 14, 9.6, 9.5, 680, "*C*"),
    ("Poly(ethylene) (branched)", 677, 28, 19, 19, 680, "*CC*"),
    ("Poly(propylene)", 660, 42, 28, 28, 665, "*CC(*)C"),
    ("Poly(isobutylene)", 621, 56, 35, 35, 625, "*CC(C)(C)*"),
    ("Poly(styrene)", 637, 104, 66, 66, 630, "*CC(*)c1ccccc1"),
    ("Poly(m-methyl styrene)", 631, 118, 75, 75.5, 640, "*CC(*)c1cccc(C)c1"),
    ("Poly(alpha-methyl styrene)", 559, 118, 66, 65.5, 555, "*CC(*)(C)c1ccccc1"),
    ("Poly(vinyl fluoride)", 663, 46, 30, 27.5, 600, "*CC(*)F"),
    ("Poly(vinyl chloride)", 543, 62.5, 34, 33, 530, "*CC(*)Cl"),
    ("Poly(trifluoro ethylene)", 682, 82, 56, 56.5, 690, "*C(F)C(F)(F)*"),
    ("Poly(chloro-trifluoro ethylene)", 653, 116.5, 76, 77.5, 600, "*C(F)(Cl)C(F)(F)*"),
    ("Poly(tetrafluoro ethylene)", 782, 100, 78, 77, 770, "*C(F)(F)C(F)(F)*"),
    ("Poly(vinyl cyclohexane)", 642, 110, 70, 69.5, 630, "*CC(*)C1CCCCC1"),
    ("Poly(vinyl alcohol)", 547, 44, 24, 23.5, 535, "*CC(*)O"),
    ("Poly(vinyl acetate)", 542, 86, 47, 47, 545, "*CC(*)OC(C)=O"),
    ("Poly(acrylonitrile)", 723, 53, 38, 37.5, 708, "*CC(*)C#N"),
    ("Poly(methyl acrylate)", 601, 86, 52, 52, 605, "*CC(*)C(=O)OC"),
    ("Poly(methyl methacrylate)", 610, 100, 61, 60.5, 605, "*CC(C)(*)C(=O)OC"),
    ("Poly(butadiene)", 680, 54, 37, 37, 688, "*CC=CC*"),
    ("Poly(isoprene)", 596, 68, 40, 41, 605, "*CC(C)=CC*"),
    ("Poly(p-phenylene)", 925, 76, 70, 75, 985, "*c1ccc(*)cc1"),
    ("Poly(benzyl)", 703, 90, 64, 63.5, 705, "*Cc1ccc(*)cc1"),
    ("Poly(p-xylylene)", 715, 104, 74.5, 72, 695, "*CCc1ccc(*)cc1"),
    ("Poly(ethylene oxide)", 618, 44, 27, 27, 615, "*CCO*"),
    ("Poly(propylene oxide)", 586, 58, 33, 33.5, 578, "*CC(C)O*"),
    ("Poly(2,6-dimethyl p-phenylene oxide)", 753, 120, 90, 90, 750, "*Oc1c(C)cc(*)cc1C"),
    ("Poly(ethylene terephthalate)", 723, 192, 139, 138, 720, "*CCOC(=O)c1ccc(cc1)C(=O)O*"),
    ("Poly(dian terephthalate)", 750, 358, 268, 262, 735, "*c1ccc(cc1)C(C)(C)c1ccc(cc1)OC(=O)c1ccc(cc1)C(=O)O*"),
    ("Poly(dian carbonate)", 750, 254, 190, 173, 683, "*c1ccc(cc1)C(C)(C)c1ccc(cc1)OC(=O)O*"),
    ("Poly(hexamethylene adipamide)", 693, 226, 156, 160, 635, "*C(=O)NCCCCCCNC(=O)CCCC*"),
    ("Poly(epsilon-caproamide) (Nylon 6)", 703, 113, 79, 80, 635, "*C(=O)NCCCCC*"),
    ("Poly(p-phenylene terephthalamide)", 800, 238, 190, 189, 798, "*NC(=O)c1ccc(cc1)C(=O)Nc1ccc(cc1)*"),
    ("Poly(pyromellitide) (Kapton)", 840, 382, 320, 316, 830, "*N1C(=O)c2cc3C(=O)N(C(=O)c3cc2C1=O)c1ccc(Oc2ccc(*)cc2)cc1"),
    ("Poly(m-phenylene 2,5-oxadiazole)", 800, 144, 115, 115, 720, "*c1cccc(c1)-c1nnc(o1)*"),
]

NYLON66 = "*C(=O)NCCCCCCNC(=O)CCCC*"

# Table 13.6（書頁 396，PDF 第 423 頁）列名；三個方法都缺資料，全部不可算
TABLE_136 = [
    "Polyethylene (am)", "Polyethylene (ld)", "Polyethylene (md)", "Polyethylene (HD)", "Polyethylene (cr)", "Polypropylene", "Polybutene-1",
    "Polystyrene", "Poly(vinyl chloride)", "Poly(vinylidene fluoride)", "Poly(chlorotrifluoroethylene)", "Poly(tetrafluoroethylene)",
    "Poly(vinyl butyral)", "Poly(methyl methacrylate)", "Poly(isobutyl methacrylate)", "Polyisoprene (natural rubber)", "Poly(chlorobutadiene)",
    "Poly(methylene oxide)", "Poly(ethylene oxide)", "Poly(2,6-dimethyl-p-phenylene oxide)", "Poly(ethylene terephthalate)", "Nylon 6", "Nylon 66",
    "Polyimide", "Poly(bisphenol carbonate)", "Polysulphone", "Phenolformaldehyde resin", "Epoxy resin",
]


def fmt(x: float | None, d: int = 1) -> str:
    return "—" if x is None else f"{x:.{d}f}"


def tm_value(smiles: str) -> tuple[float | None, str]:
    r = tm.compute_tm(smiles)
    if r["status"] == "ok":
        return r["tmK"], ""
    if r["status"] == "missing":
        return None, "缺基團：" + "；".join(m["description"] for m in r["missing"][:2])
    return None, r.get("message", "無效")


def td_values(smiles: str) -> tuple[float | None, float | None, float | None, str]:
    r = td.compute_td(smiles)
    if r["status"] == "ok":
        return r["sumYd"], r["tdK"], r["unitMass"], ""
    if r["status"] == "missing":
        return None, None, None, "缺基團：" + "；".join(m["description"] for m in r["missing"][:2])
    return None, None, None, r.get("message", "無效")


def main() -> None:
    lines: list[str] = []
    w = lines.append
    w("# Phase 6（任務 P6B）：Tm、Td、吸濕性、彈性模數——書中算例對照")
    w("")
    w("產生方式：engine/.venv/Scripts/python.exe scripts/verification/phase6-tm-td-moisture-modulus.py。內容只有程式算出的數字與書中印的數字並列，不調整任何數值去湊；")
    w("判斷由使用者進行（D17）。書：van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009)。")
    w("相符標準（依書自己表中顯示的精度）：Tm 差 ≤ 1 K（書印整數）；Yd,1/2 差 ≤ 0.25 K·kg/mol（書印到 0.5）；Td,1/2 差 ≤ 5 K（書的 calc 欄多以 5 K 為單位）。")
    w("重複單元的 SMILES 由本卡依聚合物名稱寫出（書中 Table 6.15、21.3 只有名稱），切法使組合基團落在單元內；SMILES 不用反引號，避免被黃金檔腳本掃描。")
    w("")

    # ---------------- Tm ----------------
    w("## 1. Tm：Table 6.15（書頁 165–166）calculated 欄")
    w("")
    w("| 聚合物 | 重複單元 SMILES | 書 Tm exp (K) | 書 Tm calc (K) | 本卡 Tm (K) | 差（本卡 − 書 calc） | 判定 |")
    w("|---|---|---|---|---|---|---|")
    tm_ok = tm_bad = tm_na = 0
    tm_rows = []
    for name, exp, calc, smi in TM_CASES:
        v, why = tm_value(smi)
        if v is None:
            tm_na += 1
            w(f"| {name} | {esc(smi)} | {exp} | {calc} | — | — | 無法計算：{why} |")
            tm_rows.append((name, None))
            continue
        d = v - calc
        ok = abs(d) <= 1.0
        tm_ok += ok
        tm_bad += not ok
        w(f"| {name} | {esc(smi)} | {exp} | {calc} | {v:.1f} | {d:+.1f} | {'相符' if ok else '不符'} |")
        tm_rows.append((name, d))
    n = len(TM_CASES)
    w("")
    w(f"結果：{n} 個聚合物中，相符 {tm_ok} 個、不符 {tm_bad} 個、無法計算 {tm_na} 個。")
    w("")
    diffs = sorted((abs(d), name, d) for name, d in tm_rows if d is not None and abs(d) > 1.0)
    if diffs:
        w("不符者的差（本卡 − 書 calc，K）：" + "；".join(f"{name} {d:+.0f}" for _, name, d in diffs))
        w("")
    w("不符與無法計算的觀察（只是把書自己的表並列，**沒有採用任何一項去調整數值**）：")
    w("")
    w("- Poly(propyl acrylate)、Poly(butyl acrylate)：Table 6.9 聚丙烯酸酯的 Ymo 印 48（Fig. 6.6 在 N = 0 約 48）。若 Ymo 取 44（Table 6.9 聚乙烯酯的值，也約等於 Table 6.8 的 5.7 + 38 = 43.7），式 6.23 得 360 與 309，與書 Table 6.15 的 calc 相同。書的 Table 6.9 與 Table 6.15 在這裡彼此不一致。")
    w("- Poly(methyl methacrylate)：Table 6.9 的 Ymo = 47.3（= Table 6.8 的 5.7 + 41.5）得 471.5；書 calc 433。Poly(docosyl methacrylate)：式 6.24 以 Ym5 = 40.0 得 332.9，書 calc 341。")
    w("- Poly(ethylene terephthalate)、Poly(decamethylene terephthalate)：本卡不套用 Table 6.12 的奇偶效應。若各加 +1.5（–CO–O– 的奇偶效應一次）約得 564.8 與 481.7，仍與書 calc 563、480 有 1–2 K 差。")
    w("- Poly(hexamethylene adipamide)：Table 6.11 的 (4,6) 為 25.2，加 2 × 45 得 115.2，Tm = 509.7；書 calc 518 需要 Ym = 117.2。Poly(nonamethylene azelamide)：Table 6.11 的 (9,7) 為 57.2，加 2 × 45 得 147.2，Tm = 474.8；書 calc 436 需要 Ym = 135.4。兩者書自己的 Table 6.11 加總都得不到書的 calc。")
    w("- 含對伸苯基二亞甲基（–CH2–C6H4–CH2–，Table 6.14 的 47）的聚醯胺、聚胺基甲酸酯、聚脲：Poly(paraphenylene dimethylene adipate) +28、adipamide −9、diurethane +25、diurea +27，正負號不同，沒有單一修正能解釋。Poly(ethylene terephthalamide) −10；Poly(hexamethylene-4,4'-oxydibutyramide) −29（含醚 –O– 13.5 與兩段 CH2 序列）。")
    w("- 先前（第一版輸出）有 4 個脂肪族聚酯無法計算，原因是我的 SMILES 切法讓酯基跨在重複單元的邊界（B.COO 配不到、退而配到 –C(=O)–）；改成酯基落在單元內的寫法後可計算，3 個相符，Poly(paraphenylene dimethylene adipate) 不符（+28）。這是驗證輸入的修正，不是規則或數值的改動。")
    w("")

    # ---------------- Td ----------------
    w("## 2. Td,1/2：Table 21.3（書頁 770）calculated 欄")
    w("")
    w("| 聚合物 | 重複單元 SMILES | 書 Td exp (K) | 書 M | 書 Yd calc | 書 Td calc (K) | 本卡 Yd | 本卡 Td (K) | 差 Yd | 差 Td (K) | 判定 |")
    w("|---|---|---|---|---|---|---|---|---|---|---|")
    td_ok = td_bad = td_na = 0
    yd_ok = tdcol_ok = 0
    for name, exp, m, yexp, ycalc, tcalc, smi in TD_CASES:
        y, t, mass, why = td_values(smi)
        if y is None or t is None:
            td_na += 1
            w(f"| {name} | {esc(smi)} | {exp} | {m} | {ycalc} | {tcalc} | — | — | — | — | 無法計算：{why} |")
            continue
        dy = y - ycalc
        dt = t - tcalc
        yd_match = abs(dy) <= 0.25
        td_match = abs(dt) <= 5.0
        ok = yd_match and td_match
        yd_ok += yd_match
        tdcol_ok += td_match
        td_ok += ok
        td_bad += not ok
        w(f"| {name} | {esc(smi)} | {exp} | {m} | {ycalc} | {tcalc} | {y:.1f} | {t:.1f} | {dy:+.2f} | {dt:+.1f} | {'相符' if ok else '不符'} |")
    n = len(TD_CASES)
    w("")
    w(f"結果：{n} 個聚合物中，相符 {td_ok} 個（Yd 與 Td 兩欄都在精度內）、不符 {td_bad} 個、無法計算 {td_na} 個（Cellulose 書中沒有 calc 值，未列入）。")
    w(f"分開看：算得出的 {n - td_na} 個中，Yd calc 欄相符 {yd_ok} 個、Td calc 欄相符 {tdcol_ok} 個；Yd 相符而 Td 欄不符的是書的 Td calc 欄與它自己的 Yd ÷ M 不一致（見下）。")
    w("")
    w("不符與無法計算的觀察（同樣只是並列，沒有採用任何一項去調整）：")
    w("")
    w("- Poly(chloro-trifluoro ethylene)、Poly(m-phenylene 2,5-oxadiazole)、兩個尼龍：本卡的 Yd 與書 Yd calc 完全相同（77.5、115），只是書的 Td calc 欄與它自己的 Yd ÷ M 不一致（77.5 ÷ 116.5 = 665 K，書印 600；115 ÷ 144 = 799 K，書印 720）。尼龍兩列（Yd 160、80 相符）的書 Td calc 635 與 160 ÷ 226、80 ÷ 113（= 707 K）不一致。")
    w("- Poly(isoprene)：–CH=C(CH3)– 21.5 + 2 × 9.5 = 40.5，書 calc 41。Poly(p-xylylene)：2 × 9.5 + 54 = 73，書 calc 72。")
    w("- Poly(p-phenylene)：本卡沿用 Yg 的共軛規則（只有雙鍵系統基團算共軛的鄰居），相鄰的伸苯基不算，所以取 n 值 54；書 calc 75 是 cc 值。這是規則的限制，不是謄錄錯誤。")
    w("- 無法計算的 2 個：")
    w("  - Poly(m-methyl styrene)：Table 21.2 沒有甲苯基 –CH(C6H4CH3)–；書 calc 75.5 = 66 + 9.5，看起來把 CH3 當作 9.5，書中沒有這樣的基團。")
    w("  - Poly(propylene oxide)：Yg 的 –CH(CH3)– 切分排除接氧的 CH，所以缺基團；就算算，Table 21.2 加總為 9.5 + 18.5 + 8 = 36，書 calc 33.5。")
    w("- 使用者 2026-11-17 決定的指定（只選值，不改書的數字，標「詮釋（依書算例推得）、待使用者審」）：")
    w("  - –C(CH3)2– 夾在兩個芳香環之間用 Table 21.2 的第三個值 35。依據：Poly(dian terephthalate) 262 = 119 + 2 × 54 + 35、Poly(dian carbonate) 173 = 30 + 2 × 54 + 35。結果兩者 Yd 完全相符。")
    w("  - –C(=O)NH– 用 32.5。依據：Poly(hexamethylene adipamide) 160 = 10 × 9.5 + 2 × 32.5、Poly(epsilon-caproamide) 80 = 5 × 9.5 + 32.5。32.5 不是 Table 21.2 –C(=O)NH– 的 30 或 37（是 –O–C(=O)–NH– 的值）；30、37 兩列保留、不使用。結果兩者 Yd 完全相符。")
    w("  - 書的算例沒有明確用到的 –C(=O)–O– 20／25 與受阻 –C(CH3)2– 的 s 值，Tm 的 –C(CH3)2– 受阻（s 22、ss 39）與 –C(=O)– al／ar，維持回報缺基團。")
    w("")

    # ---------------- 吸濕 ----------------
    w("## 3. 吸濕性：Example 18.4（書頁 691）尼龍 6,6，RH 0.7，結晶度 70%")
    w("")
    r = moisture.compute_moisture(NYLON66, 0.7, 0.7)
    a = moisture.compute_moisture(NYLON66, 0.7, None)
    w("| 項目 | 書 | 本卡 | 判定 |")
    w("|---|---|---|---|")
    w(f"| 每結構單元莫耳含水量（mol） | 1.5（2 個 CONH × 0.75；CH2 忽略） | {r['molesWaterPerUnit']:.5f}（含 10 個 CH2 × 3.3e-5） | 相符（差 {r['molesWaterPerUnit'] - 1.5:+.5f}） |")
    w(f"| 結構單元分子量 | 226.3 | {r['unitMass']:.2f} | 相符 |")
    w(f"| 非晶 g 水／100 g | 12 | {a['value']:.2f} | {'相符' if abs(a['value'] - 12) <= 0.5 else '不符'} |")
    w(f"| 結晶度 70%（式 18.15） | 3.6 | {r['value']:.2f} | {'相符' if abs(r['value'] - 3.6) <= 0.05 else '不符'} |")
    w("")
    w(f"本卡的基團清單：" + "；".join(f"{g['name']} × {g['count']}（{g['valuePerGroup']}）" for g in r["groups"]) + f"；未涵蓋原子 {len(r['uncovered'])} 個。")
    w("書中的實驗值 4 g／100 g 只作對照，不參與計算。")
    w("")

    # ---------------- 彈性模數 ----------------
    w("## 4. 體積模數 K：Table 13.6（書頁 396）")
    w("")
    res = modulus.compute_modulus("*CC*")
    w(f"Table 13.6 共 {len(TABLE_136)} 列。三個方法本專案都缺必要的增量表，所以**能算的列數為 0**，沒有任何一列可對照：")
    w("")
    w("| 方法 | 缺什麼 |")
    w("|---|---|")
    for m in res["methods"]:
        w(f"| {m['equation']} | {'；'.join(m['missing'])} |")
    w(f"| 彈性模數 E：{res['youngsModulus']['equation']} | {'；'.join(res['youngsModulus']['missing'])} |")
    w("")
    w("書中的 Example 13.1（聚乙烯，三個方法 4.3、4.0、3.8 ×10⁹ N/m²，平均 4.1）與 Example 13.2（雙酚 A 聚碳酸酯）也都需要 Table 14.4 或 Chapter 5、7 的資料，同樣無法重現。")
    w("")
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    print("Tm", tm_ok, tm_bad, tm_na, "| Td", td_ok, td_bad, td_na)
    print("moisture", a["value"], r["value"], r["molesWaterPerUnit"], r["unitMass"])
    print("wrote", OUT)


if __name__ == "__main__":
    main()
