"""任務 P8-1：產生 docs/verification/phase8-溶劑與溶解性-輸出.md（D64：全部功能完成後只做一次）。

用法：engine/.venv/Scripts/python engine/scripts/verify_phase8.py
內容：(1) 溶劑資料表摘要；(2) 書的算例對照（Example 7.3、7.5、Table 7.6 的 calculated 欄）；(3) 聚合物成分對溶劑的 Ra、RED、χ（「使用者判定」欄留空）。
書的數值是看圖謄錄（van Krevelen & te Nijenhuis 4th ed. (2009) 書頁 204、207、215、219），本程式只負責計算與對照，不調整任何數值。
"""

from __future__ import annotations

import io
import math
import os
import sys

ENGINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ENGINE_DIR)

from moleform_core import hsp, modulus_tables as mt, solvents as sv, tg, vm  # noqa: E402

OUT = os.path.join(os.path.dirname(ENGINE_DIR), "docs", "verification", "phase8-溶劑與溶解性-輸出.md")


def f(x: float | None, nd: int = 2) -> str:
    return "—" if x is None else f"{x:.{nd}f}"


# 書 Table 7.6（書頁 204）：名稱、重複單元 SMILES、δ exp from、to、δ calc (H.+v.K.)
TABLE_76 = [
    ("Polyethylene", "*CC*", 15.8, 17.1, 16.0),
    ("Polypropylene", "*CC(*)C", 16.8, 18.8, 17.0),
    ("Polyisobutylene", "*CC(*)(C)C", 16.0, 16.6, 16.4),
    ("Polystyrene", "*CC(*)c1ccccc1", 17.4, 19.0, 19.1),
    ("Poly(vinyl chloride)", "*CC(*)Cl", 19.2, 22.1, 19.7),
    ("Poly(vinyl bromide)", "*CC(*)Br", 19.4, None, 20.3),
    ("Poly(vinylidene chloride)", "*CC(*)(Cl)Cl", 20.3, 25.0, 20.6),
    ("Poly(tetrafluoroethylene)", "*C(F)(F)C(F)(F)*", 12.7, None, 11.7),
    ("Poly(vinyl acetate)", "*CC(*)OC(C)=O", 19.1, 22.6, 19.6),
    ("Poly(vinyl propionate)", "*CC(*)OC(=O)CC", 18.0, None, 18.8),
    ("Poly(methyl acrylate)", "*CC(*)C(=O)OC", 19.9, 21.3, 19.9),
    ("Poly(ethyl acrylate)", "*CC(*)C(=O)OCC", 18.8, 19.2, 19.2),
    ("Poly(butyl acrylate)", "*CC(*)C(=O)OCCCC", 18.0, 18.6, 18.3),
    ("Poly(methyl methacrylate)", "*CC(*)(C)C(=O)OC", 18.6, 26.2, 19.0),
    ("Poly(ethyl methacrylate)", "*CC(*)(C)C(=O)OCC", 18.2, 18.7, 18.6),
    ("Poly(butyl methacrylate)", "*CC(*)(C)C(=O)OCCCC", 17.8, 18.4, 17.9),
    ("Polyacrylonitrile", "*CC(*)C#N", 25.6, 31.5, 25.7),
    ("Polybutadiene", "*CC=CC*", 16.6, 17.6, 17.5),
    ("Polyisoprene", "*CC(C)=CC*", 16.2, 20.5, 17.4),
    ("Polychloroprene", "*CC(Cl)=CC*", 16.8, 18.9, 19.2),
    ("Poly(oxy methylene)", "*CO*", 20.9, 22.5, 20.5),
    ("Poly(tetramethylene oxide)", "*CCCCO*", 17.0, 17.5, 17.6),
    ("Poly(propylene oxide)", "*CC(C)O*", 15.4, 20.3, 18.9),
    ("Poly(ethylene sulphide)", "*CCS*", 18.4, 19.2, 18.9),
    ("Poly(ethylene terephthalate)", "*CCOC(=O)c1ccc(cc1)C(=O)O*", 19.9, 21.9, 20.5),
    ("Poly(8-aminocaprylic acid)", "*NCCCCCCCC(=O)*", 26.0, None, 25.7),
    ("Poly(hexamethylene adipamide)", "*NCCCCCCNC(=O)CCCCC(=O)*", 27.8, None, 28.0),
]


def ecoh_route(smiles: str) -> tuple[float | None, str]:
    """Table 7.1（Hoftyzer–Van Krevelen 欄，專案資料表 ecoh_groups.csv 只收 6 個基團）的 δ = √(ΣEcoh / V)；V 用 Vm 模組（非晶）。"""
    res = tg.compute_tg_book(smiles, mt.ecoh_yg_rows())
    if res["status"] != "ok":
        return None, "Ecoh 表沒有涵蓋的基團"
    rows = {r.id: r for r in mt.load_ecoh_rows()}
    total = 0.0
    for g in res["groups"]:
        total = total + rows[g["rowId"]].value
    v = vm.compute_molar_volume_density(smiles)
    if v["status"] != "ok":
        return None, "Vm 模組缺基團"
    return math.sqrt(total / v["glassy"]["vm"]), ""


def main() -> None:
    w = io.StringIO()
    p = lambda s="": w.write(s + "\n")  # noqa: E731
    p("# Phase 8 溶劑與溶解性：輸出與書算例對照（任務 P8-1）")
    p()
    p("本檔由 `engine/scripts/verify_phase8.py` 產生（D64：功能全部完成後只做一次）。書的數值是看圖謄錄（van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009) 書頁 204、207、215、219；"
      "Hansen, Hansen Solubility Parameters 2nd ed. (2007) 書頁 7、8、40），本程式只負責計算與對照，不調整任何數值去湊（D17、鐵則 4）。**所有資料表列皆 `pending`，待使用者審。**")
    p()

    # ---- 1. 溶劑資料表 ----
    table = sv.load_solvents()
    p("## 1. 溶劑資料表（`src/data/solvents.csv`，23 個溶劑）")
    p()
    p("長表（一列一個值，每個值有出處與溫度）。下表取各物性最接近 25 °C 的一列，括號內是溫度（°C）；「—」＝資料表沒有這個值（原因在該溶劑 molecular_weight 列的備註）。")
    p()
    p("| 溶劑 | 分子量 | 密度 g/cm³ | 摩爾體積 cm³/mol | δD | δP | δH | 黏度 mPa·s | 表面張力 mN/m | 沸點 °C |")
    p("|---|---|---|---|---|---|---|---|---|---|")
    counts: dict[str, int] = {}
    for sid, s in table.items():
        def cell(prop: str, nd: int = 3) -> str:
            v = s.pick(prop)
            if v is None:
                counts[prop] = counts.get(prop, 0) + 1
                return "—"
            return f"{v.value:.{nd}g}" + ("" if v.temperature_c is None or prop in ("hsp_d", "hsp_p", "hsp_h") else f"（{v.temperature_c:g}）")
        p(f"| {s.name_zh}（{sid}） | {cell('molecular_weight', 6)} | {cell('density', 5)} | {cell('molar_volume', 5)} | {cell('hsp_d')} | {cell('hsp_p')} | {cell('hsp_h')} | {cell('viscosity')} | {cell('surface_tension')} | {cell('boiling_point')} |")
    p()
    p("各欄位的空欄數：" + "、".join(f"{k} {v} 個" for k, v in sorted(counts.items())) + "。")
    p()

    # ---- 2. 書算例對照 ----
    p("## 2. 書算例對照")
    p()
    p("### 2.1 Example 7.3（書頁 216）：雙丙酮醇，V = 123.8 cm³/mol（Hoftyzer–Van Krevelen，式 7.22–7.24）")
    p()
    r = hsp.compute_hsp("CC(=O)CC(C)(C)O", volume=123.8)
    q = r["quantities"]
    p("| 分量 | 書值 | 本程式 | 差 |")
    p("|---|---|---|---|")
    for key, name, book in (("deltaD", "δd", 15.8), ("deltaP", "δp", 7.4), ("deltaH", "δh", 13.3)):
        v = q[key]["value"]
        p(f"| {name} | {book} | {v:.4f} | {abs(v - book):.4f}（書印 1 位小數，四捨五入後相同：{'是' if round(v, 1) == book else '否'}） |")
    rounded_total = math.sqrt(15.8**2 + 7.4**2 + 13.3**2)
    p(f"| δ（式 7.14） | 21.9 | {q['delta']['value']:.4f} | 書用已四捨五入的 15.8、7.4、13.3 算：√(15.8²+7.4²+13.3²) = {rounded_total:.3f} → 21.9（本程式用未四捨五入的分量，得 {q['delta']['value']:.3f}） |")
    p()
    p("**結論**：三個分量都與書相同（書印位數）。總 δ 的差只來自書先把分量四捨五入。")
    p()
    p("### 2.2 Example 7.5（書頁 219）：聚醋酸乙烯酯 Hoftyzer–Van Krevelen 欄（δd 16.0、δp 6.8、δh 8.5、δ 19.4）")
    p()
    rv = hsp.compute_hsp("*CC(*)OC(C)=O")
    qv = rv["quantities"]
    p(f"- 本程式（V 取 Vm 模組 {rv['volume']['value']:.2f} cm³/mol）：δd {qv['deltaD']['value']:.2f}、δp {qv['deltaP']['value']:.2f}、δh {qv['deltaH']['value']:.2f}、δ {qv['delta']['value']:.2f}。基團：" + "、".join(g["name"] for g in rv["groups"]))
    sfd, sfp2, seh = rv["sums"]["sumFd"], rv["sums"]["sumFp2"], rv["sums"]["sumEh"]
    p(f"- ΣFdi = {sfd:.0f}、√ΣFpi² = {math.sqrt(sfp2):.0f}、ΣEhi = {seh:.0f}。書印的 δd 16.0 與 δp 6.8 對應 V ≈ {sfd / 16.0:.1f}（{math.sqrt(sfp2) / 6.8:.1f}）cm³/mol，但用同一個 V，ΣEhi = 7000 給出 δh = {math.sqrt(seh / (sfd / 16.0)):.2f}，與書印的 8.5 不同。")
    p("- **不一致且無法由書內資料解釋**：書在 Example 7.5 沒有寫 HVK 欄的算式與 V（該段的算式只展開 Hoy 法），HVK 欄的 δh 8.5 無法由 Table 7.10 的值（–COO– Ehi = 7000）重現；δd、δp 在 V ≈ 72 cm³/mol 時與書相符。本程式不調整任何數值（見報告，需使用者決定）。")
    p()
    p("### 2.3 Table 7.6（書頁 204）的 δ calc.（H. + v. K.）")
    p()
    p("書的 Table 7.6 標題是「Experimental and calculated values of δ」，calculated 欄標示 H. + v. K.（Hoftyzer + van Krevelen）。用本專案可算的兩條路對照：")
    p("(a) **Ecoh 路徑**：δ = √(ΣEcoh / V)，Ecoh 取 Table 7.1 的 Hoftyzer–Van Krevelen 欄（專案 `ecoh_groups.csv` 只收 6 個基團）、V 用 Vm 模組（非晶）；")
    p("(b) **Table 7.10 路徑**（本卡）：δ = √(δd² + δp² + δh²)，V 同上。")
    p()
    p("| 聚合物 | δ exp（from–to） | 書 δ calc | (a) Ecoh 路徑 | (b) Table 7.10 路徑 | (a)−書 | (b)−書 |")
    p("|---|---|---|---|---|---|---|")
    n_a = n_b = 0
    close_a = close_b = 0
    for name, smi, lo, hi, book in TABLE_76:
        a, a_why = ecoh_route(smi)
        hr = hsp.compute_hsp(smi)
        b = hr["quantities"]["delta"]["value"]
        b_why = "" if b is not None else "（" + "；".join(dict.fromkeys(hr["reasons"].values()))[:40] + "）"
        rng = f"{lo}–{hi}" if hi is not None else f"{lo}–"
        if a is not None:
            n_a += 1
            close_a += abs(a - book) <= 0.05
        if b is not None:
            n_b += 1
            close_b += abs(b - book) <= 0.05
        p(f"| {name} | {rng} | {book} | {f(a)}{'' if a is not None else '（' + a_why + '）'} | {f(b)}{b_why} | {f(None if a is None else a - book)} | {f(None if b is None else b - book)} |")
    p()
    p(f"算得出的列數：(a) Ecoh 路徑 {n_a} 列（其中與書相差 ≤ 0.05 的 {close_a} 列）；(b) Table 7.10 路徑 {n_b} 列（其中與書相差 ≤ 0.05 的 {close_b} 列）。")
    p()
    p("**說明**：(a) 欄在聚乙烯（16.00，書 16.0）與聚丙烯（17.04，書 17.0）與書相符，所以 Table 7.6 的 calculated 欄推定是 Ecoh／V 的總 δ（Table 7.1），"
      "不是 Table 7.10 的 δd、δp、δh 合成；(b) 欄與書不是同一個方法，不應逐列相等（V 也不一定與書同基準）。**未調整任何數值。**")
    p()
    p("**無法重現的列**（差超過書印位數，依卡片要求回報，見報告）：聚(乙烯硫醚) (a) 18.53 對書 18.9，差 −0.37；此列用的是既有的 Table 7.1 Ecoh 表（–S–）與 Vm 模組，不是本卡的 Table 7.10 資料；"
      "其餘書列因專案 Ecoh 表只收 6 個基團，或 Vm 模組缺基團（Table 4.10 子集），算不出（上表標明原因）。")
    p()

    # ---- 3. Ra、RED、χ ----
    p("## 3. 聚合物成分對溶劑的 Ra、RED、χ（「使用者判定」欄留空）")
    p()
    p("聚合物取 `docs/verification/` 現有的重複單元（phase4 測試體系 P、E 與 phase6／7 驗證清單的聚合物），單一溶劑，質量比例 1（只有一個溶劑時不影響結果）。"
      "Ra 用 Hansen 式 1.9（係數 4）；R0 只取書 Table 7.8（沒有就 RED 為 missing）；χ 用式 7.12（T = 298.15 K）；判斷門檻：RED < 1、χ ≤ 0.5。**參考趨勢，非定量保證；HSP 對聚合物分子量、結晶度、溫度未做修正。**"
      "聚合物的 HSP 缺值（缺基團、缺 Fpi／Ehi、缺 V）時，整列顯示原因。")
    p()
    polymers = [
        ("4A/4B P 單元 A（雙酚茀）", "[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O"),
        ("4A/4B P 單元 B（萘基次甲基）", "[*:1]C([*:2])c1ccc2ccccc2c1"),
        ("4A/4B E（PGMA）", "[*:1]CC([*:2])(C)C(=O)OCC1CO1"),
        ("聚苯乙烯", "[*:1]CC([*:2])c1ccccc1"),
        ("聚甲基丙烯酸甲酯", "[*:1]CC([*:2])(C)C(=O)OC"),
        ("聚氯乙烯", "[*:1]CC(Cl)[*:2]"),
        ("聚丙烯", "[*:1]CC([*:2])C"),
        ("聚對苯二甲酸乙二酯", "[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]"),
        ("尼龍 66", "[*:1]NC(=O)CCCCC(=O)NCCCCCC[*:2]"),
        ("聚乙烯基環己烷", "[*:1]CC([*:2])C1CCCCC1"),
        ("雙酚 A 聚碳酸酯", "[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]"),
        ("苯氧樹脂（雙酚 A 型）", "[*:1]Oc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC(O)C[*:2]"),
        ("甲酚酚醛單元（鄰甲酚）", "[*:1]Cc1cc([*:2])cc(C)c1O"),
    ]
    solv_ids = ["pgmea", "cyclohexanone", "acetone", "thf", "toluene", "ethanol", "nmp", "water"]
    p("| 聚合物 | 溶劑 | Ra（MPa^0.5） | R0 | RED | χ | 判斷 | 使用者判定 |")
    p("|---|---|---|---|---|---|---|---|")
    summary: list[str] = []
    for pname, smi in polymers:
        base = hsp.compute_hsp(smi)
        if base["status"] != "ok" or base["quantities"]["delta"]["value"] is None:
            why = "；".join(dict.fromkeys(base["reasons"].values()))
            miss = "、".join(dict.fromkeys(m["description"] for m in base.get("missing", [])))
            summary.append(f"- {pname}：HSP 算不出（{why}{'；缺：' + miss if miss else ''}）")
        first = hsp.compute_solubility(smi, [{"solventId": solv_ids[0], "amount": 1}])
        if first["status"] == "ok" and first["ra"]["value"] is None:
            p(f"| {pname} | （全部溶劑） | missing | — | — | — | 無法判斷（{first['reasons'].get('ra', '')[:70]}） | |")
            continue
        for sid in solv_ids:
            res = hsp.compute_solubility(smi, [{"solventId": sid, "amount": 1}])
            s = table[sid]
            if res["status"] != "ok":
                continue
            ra, r0, red, chi = res["ra"]["value"], res["r0"]["value"], res["red"]["value"], res["chi"]["value"]
            if ra is None:
                reason = res["reasons"].get("ra", "")
                p(f"| {pname} | {s.name_zh} | missing | — | — | — | 無法判斷（{reason[:60]}） | |")
                continue
            p(f"| {pname} | {s.name_zh} | {f(ra)} | {f(r0)} | {f(red)} | {f(chi, 3)} | {res['judgement']['overall']} | |")
    p()
    if summary:
        p("聚合物 HSP 缺值的原因：")
        p()
        for s in summary:
            p(s)
        p()
    p("共聚物（4A/4B 的 P）依單元逐一列出，沒有做共聚物的混合 HSP（本卡未要求）。")
    w.seek(0)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(w.read())
    print("wrote", OUT)


if __name__ == "__main__":
    main()
