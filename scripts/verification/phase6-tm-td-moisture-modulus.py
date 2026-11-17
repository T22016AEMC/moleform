"""任務 P6B 的書中算例對照（驗證只做一次）。產生 docs/verification/phase6-Tm-Td-吸濕-彈性模數-輸出.md。

用書自己的算例：Table 6.15（Tm）、Table 21.3（Td,1/2）、Example 18.4（尼龍 6,6 吸濕）；任務 P6E 起彈性模數用 Example 13.1、13.2、Table 13.6、Table 14.5。
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

# Table 13.6（書頁 396，PDF 第 423 頁）：(聚合物, ρ g/cm³, 書 Exp.（原文）, 書 (U_R/V)⁶·ρ 欄, 重複單元 SMILES 或 None＝書中只有名稱、沒有結構)
TABLE_136 = [
    ("Polyethylene (am) (extrapol.)", 0.85, "(1.9)", 1.95, "*CC*"),
    ("Polyethylene (ld)", 0.92, "3.4", 3.55, "*CC*"),
    ("Polyethylene (md)", 0.95, "4.5", 4.3, "*CC*"),
    ("Polyethylene (HD)", 0.97, "5.0", 5.05, "*CC*"),
    ("Polyethylene (cr) (extrapol.)", 1.00, "(6.0)", 6.3, "*CC*"),
    ("Polypropylene", 0.91, "3.5", 3.85, "*CC(*)C"),
    ("Polybutene-1", 0.91, "3.8", 3.8, "*CC(*)CC"),
    ("Polystyrene", 1.05, "5.0", 5.15, "*CC(*)c1ccccc1"),
    ("Poly(vinyl chloride)", 1.42, "5.5", 5.25, "*CC(*)Cl"),
    ("Poly(vinylidene fluoride)", 1.77, "5.4", 4.2, "*CC(F)(F)*"),
    ("Poly(chlorotrifluoroethylene)", 2.15, "5.2", 4.55, "*C(F)(F)C(F)(Cl)*"),
    ("Poly(tetrafluoroethylene)", 2.35, "2.5", 3.6, "*C(F)(F)C(F)(F)*"),
    ("Poly(vinyl butyral)", 1.11, "4.2", 3.1, None),
    ("Poly(methyl methacrylate)", 1.19, "5.1", 5.25, "*CC(C)(C(=O)OC)*"),
    ("Poly(isobutyl methacrylate)", 1.04, "2.9", 3.2, "*CC(C)(C(=O)OCC(C)C)*"),
    ("Polyisoprene (natural rubber)", 0.91, "2.0", 1.9, "*CC(C)=CC*"),
    ("Poly(chlorobutadiene)", 1.24, "2.3", 2.3, "*CC(Cl)=CC*"),
    ("Poly(methylene oxide)", 1.43, "6.9", 7.4, "*CO*"),
    ("Poly(ethylene oxide)", 1.21, "5.7", 6.9, "*CCO*"),
    ("Poly(2,6-dimethyl-p-phenylene oxide)", 1.07, "4.1", 4.0, "*Oc1c(C)cc(*)cc1C"),
    ("Poly(ethylene terephthalate)", 1.40, ">4", 7.4, "*OCCOC(=O)c1ccc(cc1)C(=O)*"),
    ("Nylon 6", 1.14, "5.1", 6.05, "*NCCCCCC(=O)*"),
    ("Nylon 66", 1.14, "8.1", 6.05, "*NCCCCCCNC(=O)CCCCC(=O)*"),
    ("Polyimide", 1.44, "6.0", 6.05, None),
    ("Poly(bisphenol carbonate)", 1.20, "5.0", 5.3, "*c1ccc(cc1)C(C)(C)c1ccc(cc1)OC(=O)O*"),
    ("Polysulphone", 1.24, "5.3", 6.2, "*c1ccc(cc1)C(C)(C)c1ccc(cc1)Oc1ccc(cc1)S(=O)(=O)c1ccc(cc1)O*"),
    ("Phenolformaldehyde resin", 1.22, "7.4", 5.4, None),
    ("Epoxy resin", 1.18, "6.4", 6.8, None),
]

# Table 14.5（書頁 516，PDF 第 543 頁）：(聚合物, V cm³/mol, 書 calculated U_R, 書 calculated U_H, SMILES 或 None)；ABS、PVB、PF、EP 書中沒有結構
TABLE_145 = [
    ("PE(HD)", 29.4, 1760, 1350, "*CC*"),
    ("PP", 46.1, 2755, 2325, "*CC(*)C"),
    ("PMP", 100.8, 5680, 4725, "*CC(*)CC(C)C"),
    ("PS", 99.0, 5780, 4725, "*CC(*)c1ccccc1"),
    ("PVC", 44.9, 2605, 2125, "*CC(*)Cl"),
    ("PVDF", 360, 1980, 1575, "*CC(F)(F)*"),
    ("PTFE", 45.9, 2200, 1800, "*C(F)(F)C(F)(F)*"),
    ("PMMA", 84.5, 5100, 4325, "*CC(C)(C(=O)OC)*"),
    ("POM", 21.1, 1280, 975, "*CO*"),
    ("PEO", 36.5, 2160, 1650, "*CCO*"),
    ("PA-6", 98.8, 6150, 4750, "*NCCCCCC(=O)*"),
    ("PA-66", 196.8, 12300, 9500, "*NCCCCCCNC(=O)CCCCC(=O)*"),
    ("PPO", 111.1, 6500, 5100, "*Oc1c(C)cc(*)cc1C"),
    ("PC", 213.7, 12575, 9900, "*c1ccc(cc1)C(C)(C)c1ccc(cc1)OC(=O)O*"),
    ("PSF", 356.9, 21250, 16600, "*c1ccc(cc1)C(C)(C)c1ccc(cc1)Oc1ccc(cc1)S(=O)(=O)c1ccc(cc1)O*"),
    ("PESF", 169, 9850, 7600, "*c1ccc(cc1)S(=O)(=O)c1ccc(cc1)O*"),
    ("ABS", 206, 11750, 9470, None),
    ("PVB", 88.7, 5140, 4275, None),
    ("PF", 87, 5570, 4375, None),
    ("EP-DM", 664, 41600, 33300, None),
    ("EP-RP", 407, 26400, 20935, None),
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
    w("# Phase 6（任務 P6B、P6E）：Tm、Td、吸濕性、彈性模數——書中算例對照")
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

    mo_a, mo_r = a, r
    # ---------------- 彈性模數（任務 P6E） ----------------
    w("## 4. 彈性模數（任務 P6E）：K、G、ν、E")
    w("")
    w("方法：式 13.30（K = ρ·(U_R/V)⁶）、式 14.12（G = ρ·(U_H/V)⁶）、Table 13.2（ν、E）、式 13.32（方法三）。V 一律用書中給的密度或 V（輸入密度路徑，V = M/ρ），")
    w("不使用 Vm 模組的估算值，這樣才能與書的算例同基準比較。相符標準：K、G 差 ≤ 0.05 GPa（書印 1～3 位）；U_R、U_H 差 ≤ 5（書印到 5）。不調整任何數值去湊。")
    w("方法二（式 13.31，需要 Fig. 5.4 的 C_p/C_v，是圖）本卡不做。方法三只對 Table 7.1（Hoftyzer and Van Krevelen 欄）與 Table 5.7 同時有值、基團定義可對應的基團啟用。")
    w("")

    def mod(smi: str, rho: float | None, xc: float | None = None) -> dict:
        return modulus.compute_modulus(smi, rho, xc)

    def ok(diff: float | None, tol: float) -> str:
        return "—" if diff is None else ("相符" if abs(diff) <= tol else "不符")

    n_match = 0
    n_bad = 0
    w("### 4.1 Example 13.1：聚乙烯（ρ 0.95、結晶度 70%）")
    w("")
    r = mod("*CC*", 0.95, 0.70)
    rao, tob = r["methods"][0], r["methods"][2]
    w("| 項目 | 書 | 本卡 | 差 | 判定 |")
    w("|---|---|---|---|---|")
    rows = [
        ("U_R", 1760.0, rao["sumUR"], 5.0, 0),
        ("V（cm³/mol）", 29.5, r["volume"]["value"], 0.05, 2),
        ("方法一 K（GPa）", 4.3, rao["value"], 0.05, 3),
        ("E_coh（J/mol）", 8380.0, tob["ecoh"], 5.0, 0),
        ("ΔH_m（kJ/mol）", 8.0, tob["dhm"], 0.05, 1),
        ("方法三 K（GPa）", 3.8, tob["value"], 0.05, 3),
    ]
    for name, book, mine, tol, dec in rows:
        res_txt = ok(mine - book, tol)
        n_match += res_txt == "相符"
        n_bad += res_txt == "不符"
        w(f"| {name} | {book} | {mine:.{dec}f} | {mine - book:+.{dec}f} | {res_txt} |")
    w("")
    w(f"兩個方法的平均 = {r['bulkModulus']['value']:.2f} GPa（書：三個方法的平均 4.1，其中方法二本卡不做，所以不比較）。")
    w("")
    w("### 4.2 Example 13.2：雙酚 A 聚碳酸酯（M 254、V 212、ρ 1.2）")
    w("")
    pc = "*c1ccc(cc1)C(C)(C)c1ccc(cc1)OC(=O)O*"
    r = mod(pc, 254.28 / 212.0)  # ρ 取 M/V，使 V 恰為書的 212
    rao = r["methods"][0]
    uh_sum = 0.0
    for grp in rao["groups"]:
        uh_sum += grp["uh"]
    w("| 項目 | 書 | 本卡 | 差 | 判定 |")
    w("|---|---|---|---|---|")
    ex = [
        ("U_R", 12575.0, rao["sumUR"], 5.0, 0),
        ("U_H", 9900.0, uh_sum, 5.0, 0),
        ("K（GPa）", 5.23, r["bulkModulus"]["value"], 0.05, 3),
        ("G（GPa）", 1.24, r["shearModulus"]["value"], 0.05, 3),
        ("ν", 0.39, r["poissonRatio"]["value"], 0.005, 3),
        ("E（GPa）", 3.52, r["youngsModulus"]["value"], 0.05, 3),
    ]
    for name, book, mine, tol, dec in ex:
        res_txt = ok(mine - book, tol)
        n_match += res_txt == "相符"
        n_bad += res_txt == "不符"
        w(f"| {name} | {book} | {mine:.{dec}f} | {mine - book:+.{dec}f} | {res_txt} |")
    w("")
    k5, g1, nu_b = 5.23, 1.24, 0.39
    e_formula = 3 * g1 / (1 + g1 / k5 / 3)
    w(f"E 不符的說明（書自己的算術）：用書印的 K = 5.23、G = 1.24 代入書的式 E = 3G/(1 + G/(3K)) 得 {e_formula:.2f} GPa；用書印的 ν = 0.39 代入 E = 2G(1 + ν) 得 {2 * g1 * (1 + nu_b):.2f} GPa；")
    w("兩個式都得 3.45 左右，與書印的 3.52 不一致。本卡的 E 由本卡的 K、G 用同一個式算出，沒有調整。（U_R、U_H、K、G、ν 都與書相符。）")
    w("")
    w("### 4.3 Table 13.6：方法一欄 (U_R/V)⁶·ρ（ρ 用書中表列的值）")
    w("")
    w("書的 ρ 只印到 0.01，而 K ∝ ρ⁷（M 固定時 V = M/ρ），所以 ρ 取整本身就造成 ±(7 × 0.005 ÷ ρ) 的 K 誤差（約 ±3～4%）：差在這個範圍內判為相符，超過才判不符。")
    w("最後一欄用書 Table 14.5 自己印的 calculated U_R 與 V 代入式 13.30（ρ 取 Table 13.6 的值），檢查 Table 13.6 與 Table 14.5 在書中是否一致，與本卡的謄錄無關。")
    w("")
    w("| 聚合物 | ρ | 書 Exp. | 書 方法一 | 本卡 U_R | 本卡 K（GPa） | 差 | ρ 取整誤差 | 判定／原因 | 書 Table 14.5 的 U_R、V 代入式 13.30 的 K |")
    w("|---|---|---|---|---|---|---|---|---|---|")
    t_ok = t_bad = t_na = 0
    book145 = {x[0]: x for x in TABLE_145}
    link145 = {
        "Polyethylene (HD)": "PE(HD)", "Polypropylene": "PP", "Polystyrene": "PS", "Poly(vinyl chloride)": "PVC", "Poly(tetrafluoroethylene)": "PTFE",
        "Poly(methyl methacrylate)": "PMMA", "Poly(methylene oxide)": "POM", "Poly(ethylene oxide)": "PEO", "Nylon 6": "PA-6", "Nylon 66": "PA-66",
        "Poly(2,6-dimethyl-p-phenylene oxide)": "PPO", "Poly(bisphenol carbonate)": "PC", "Polysulphone": "PSF",
    }  # fmt: skip
    BOOK_INCONSISTENT = {"Polypropylene", "Polystyrene", "Poly(methyl methacrylate)", "Poly(ethylene oxide)", "Nylon 6", "Nylon 66", "Polysulphone"}
    for name, rho, exp, book, smi in TABLE_136:
        if smi is None:
            t_na += 1
            w(f"| {name} | {rho} | {exp} | {book} | — | — | — | — | 無法算：書中只有名稱，沒有結構 | — |")
            continue
        r = mod(smi, rho)
        rao = r["methods"][0]
        if rao["status"] != "predicted":
            t_na += 1
            miss = "；".join(m["description"] for m in rao.get("missing", [])[:2]) or rao.get("reason", "")
            w(f"| {name} | {rho} | {exp} | {book} | — | — | — | — | 缺基團：{esc(miss)} | — |")
            continue
        d = rao["value"] - book
        tol = max(0.05, book * 7 * 0.005 / rho)
        verdict = "相符" if abs(d) <= tol else "不符"
        t_ok += verdict == "相符"
        t_bad += verdict.startswith("不符")
        key = link145.get(name)
        if verdict == "不符":
            verdict = "不符：書內不一致（13.6 與 14.5 矛盾），不調整" if name in BOOK_INCONSISTENT else "不符：原因不明，不調整"
        if key is None:
            self_k = "—"
        else:
            _, v145, ur145, _, _ = book145[key]
            self_k = f"{rho * (ur145 / v145) ** 6 * 0.1 / 1e9:.2f}（U_R {ur145}、V {v145}）"
        w(f"| {name} | {rho} | {exp} | {book} | {rao['sumUR']:.0f} | {rao['value']:.2f} | {d:+.2f} | ±{book * 7 * 0.005 / rho:.2f} | {verdict} | {self_k} |")
    w("")
    w("使用者 2026-11-17 決定：接受 Table 13.6 的不符——7 列（PP、PS、PMMA、PEO、PA-6、PA-66、PSF）是書的 Table 13.6 與 14.5 互相矛盾（書內不一致），其餘 8 列原因不明；一律照實列出，不調整。")
    w(f"Table 13.6 共 {len(TABLE_136)} 列：能算 {t_ok + t_bad} 列，其中相符 {t_ok}、不符 {t_bad}；不能算 {t_na} 列。")
    w("Table 14.5 的 PVDF 列印 V = 360（與 ρ 1.77 推得的約 36 差 10 倍，應為印刷錯誤），所以 PVDF 不放進最後一欄。")
    w("Table 13.6 的方法三欄（E_subl/V）需要各聚合物的結晶度 x_c，書中沒有列出，所以只用 Example 13.1（x_c = 0.70）對照；方法二欄（C_v/E）本卡不做。")
    w("")
    w("### 4.4 Table 14.5：U_R、U_H 的 calculated 欄（只比較基團加成值，與 V 無關）")
    w("")
    w("| 聚合物 | 書 U_R | 本卡 U_R | 判定 | 書 U_H | 本卡 U_H | 判定 | 原因／備註 |")
    w("|---|---|---|---|---|---|---|---|")
    u_ok = u_bad = u_na = 0
    for name, v, ur_b, uh_b, smi in TABLE_145:
        if smi is None:
            u_na += 1
            w(f"| {name} | {ur_b} | — | — | {uh_b} | — | — | 無法算：書中只有名稱，沒有結構 |")
            continue
        r = mod(smi, 1.0)
        rao = r["methods"][0]
        if rao.get("sumUR") is None:
            u_na += 1
            miss = "；".join(m["description"] for m in rao.get("missing", [])[:2])
            w(f"| {name} | {ur_b} | — | — | {uh_b} | — | — | 缺基團：{esc(miss)} |")
            continue
        ur = rao["sumUR"]
        uh_vals = [grp["uh"] for grp in rao["groups"]]
        uh = None if any(x is None for x in uh_vals) else sum(uh_vals)
        v1 = ok(ur - ur_b, 5)
        v2 = ok(None if uh is None else uh - uh_b, 5)
        u_ok += (v1 == "相符") + (v2 == "相符")
        u_bad += (v1 == "不符") + (v2 == "不符")
        uh_txt = "—" if uh is None else f"{uh:.0f}"
        d2 = "" if uh is None else f"（{uh - uh_b:+.0f}）"
        w(f"| {name} | {ur_b} | {ur:.0f} | {v1}（{ur - ur_b:+.0f}） | {uh_b} | {uh_txt} | {v2}{d2} | |")
    w("")
    w(f"Table 14.5 共 {len(TABLE_145)} 列（每列 U_R、U_H 兩個值）：能算的值中相符 {u_ok}、不符 {u_bad}；{u_na} 列無法算（書中沒有結構）。")
    w("")
    w(f"Example 13.1、13.2 的項目合計：相符 {n_match}、不符 {n_bad}。")
    w("")
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    print("Tm", tm_ok, tm_bad, tm_na, "| Td", td_ok, td_bad, td_na)
    print("moisture", mo_a["value"], mo_r["value"], mo_r["molesWaterPerUnit"], mo_r["unitMass"])
    print("wrote", OUT)


if __name__ == "__main__":
    main()
