"""任務 P7-2：產生 docs/verification/phase7-反應規則D-命中列表.md（D22 第 3 點：命中結果列表交使用者審化學正確性；D67：本卡填入數值的總表）。

用引擎第 0 層（crosslink.analyze_crosslink，專案的真實資料表）對四條新規則的代表性小配方列出：每條規則對哪些成分的哪些位置（原子序，0 起算）命中、
每分子官能度 f 與當量（分子量 ÷ f，g/eq）、第 1 層是否支援。「使用者判定」欄留空。分子只用規則表測試分子與 docs/verification 已有的分子，不新增。
檔案末尾附「本卡填入數值的總表」（規則 id、欄位、數值、單位、出處、適用條件、使用者判定）；總表的數值由資料表讀出（不手抄），出處與條件文字見 TABLE_NOTES。
執行：engine/.venv/Scripts/python scripts/verification/p7-2-hit-list.py
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))

from rdkit import Chem  # noqa: E402
from rdkit.Chem import Descriptors  # noqa: E402

from moleform_core import crosslink, layer1  # noqa: E402

AIBN = "CC(C)(C#N)N=NC(C)(C)C#N"
PMI = "O=C1C=CC(=O)N1c1ccccc1"  # N-苯基馬來醯亞胺（Shibahara 1998 的模型化合物）
BMI = "O=C1C=CC(=O)N1c1ccc(Cc2ccc(N3C(=O)C=CC3=O)cc2)cc1"  # 雙馬來醯亞胺（docs/verification 已有）
SUCC = "O=C1CCC(=O)N1C"  # N-甲基琥珀醯亞胺（飽和，反例）
DABPA = "CC(C)(c1ccc(O)c(CC=C)c1)c1ccc(O)c(CC=C)c1"  # docs/verification（B 批）已有
PROPENYL = "CC(C)(c1ccc(O)c(C=CC)c1)c1ccc(O)c(C=CC)c1"  # 二丙烯基雙酚 A（規則測試分子）
ENE_ADDUCT = "CN1C(=O)CC(C=Cc2ccccc2O)C1=O"  # 烯丙基酚與 N-甲基馬來醯亞胺 ene 加成物的內烯（規則測試分子）
STY = "C=Cc1ccccc1"
BZ = "CC(C)(c1ccc2OCN(c3ccccc3)Cc2c1)c1ccc2OCN(c3ccccc3)Cc2c1"  # 雙酚 A 型苯并㗁嗪（docs/verification 已有）
BADGE = "CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1"  # docs/verification 已有
ETOH = "CCO"
MEKO_BLOCKED = "CCCCNC(=O)ON=C(C)CC"  # 丁酮肟封端的丁基異氰酸酯（規則測試分子）
HDI_MEKO = "CC(C)=NOC(=O)NCCCCCCNC(=O)ON=C(C)C"  # 六亞甲基二異氰酸酯，丙酮肟封端（規則測試分子）
PHENOL_BLOCKED = "CNC(=O)Oc1ccccc1"  # 酚封端（本卡不收，反例）
CAPRO_BLOCKED = "CNC(=O)N1CCCCCC1=O"  # 己內醯胺封端（本卡不收，反例）
BUTANOL = "CCCCO"

INIT = "Catalyst/Initiator"
# (體系, 配方名, [(成分名, SMILES, 分類)])；分子只用規則表測試分子與 docs/verification 已有的分子
SYSTEMS = [
    ("1 馬來醯亞胺自聚（熱起始劑觸發）", "N-苯基馬來醯亞胺＋AIBN", [("N-苯基馬來醯亞胺", PMI, "Small Molecule"), ("AIBN", AIBN, INIT)]),
    ("1 馬來醯亞胺自聚（熱起始劑觸發）", "雙馬來醯亞胺（BMI）＋AIBN", [("BMI", BMI, "Resin"), ("AIBN", AIBN, INIT)]),
    ("1 反例", "雙馬來醯亞胺（BMI），沒有起始劑（自聚規則由起始劑觸發，不配對）", [("BMI", BMI, "Resin")]),
    ("1 反例", "N-甲基琥珀醯亞胺（飽和）＋AIBN", [("N-甲基琥珀醯亞胺", SUCC, "Small Molecule"), ("AIBN", AIBN, INIT)]),
    ("2 ene 後續共聚（馬來醯亞胺＋ene 加成物的內烯）", "N-苯基馬來醯亞胺＋ene 加成物（烯丙基酚與馬來醯亞胺 ene 後的內烯）", [("N-苯基馬來醯亞胺", PMI, "Small Molecule"), ("ene 加成物", ENE_ADDUCT, "Small Molecule")]),
    ("2 ene 後續共聚（馬來醯亞胺＋丙烯基酚）", "BMI＋二丙烯基雙酚 A", [("BMI", BMI, "Resin"), ("二丙烯基雙酚 A", PROPENYL, "Resin")]),
    ("2 對照（P7-1B 既有 ene 規則）", "BMI＋二烯丙基雙酚 A（烯丙基，不是丙烯基內烯，只命中 maleimide+allyl.ene）", [("BMI", BMI, "Resin"), ("二烯丙基雙酚 A", DABPA, "Resin")]),
    ("2 反例", "N-苯基馬來醯亞胺＋苯乙烯（端烯，不是芳基丙烯基型內烯）", [("N-苯基馬來醯亞胺", PMI, "Small Molecule"), ("苯乙烯", STY, "Small Molecule")]),
    ("3 苯并㗁嗪＋環氧", "雙酚 A 型苯并㗁嗪＋雙酚 A 二縮水甘油醚（BADGE）", [("苯并㗁嗪 BA-a", BZ, "Resin"), ("BADGE", BADGE, "Resin")]),
    ("3 反例", "雙酚 A 型苯并㗁嗪＋乙醇（沒有環氧）", [("苯并㗁嗪 BA-a", BZ, "Resin"), ("乙醇", ETOH, "Small Molecule")]),
    ("4 肟封端異氰酸酯解封端", "丁酮肟封端的丁基異氰酸酯（單一成分）", [("MEKO 封端丁基異氰酸酯", MEKO_BLOCKED, "Small Molecule")]),
    ("4 肟封端異氰酸酯解封端", "HDI 的雙（丙酮肟）封端物（單一成分，兩個封端基）", [("HDI 雙肟封端物", HDI_MEKO, "Resin")]),
    ("4 反例", "酚封端異氰酸酯（本卡不收酚封端）", [("酚封端異氰酸酯", PHENOL_BLOCKED, "Small Molecule")]),
    ("4 反例", "己內醯胺封端異氰酸酯（本卡不收己內醯胺封端）", [("己內醯胺封端異氰酸酯", CAPRO_BLOCKED, "Small Molecule")]),
    ("4 解封端後的反應（既有規則，不屬本卡）", "遊離異氰酸酯＋丁醇（對照：解封端放出的異氰酸酯再走 isocyanate+alcohol）", [("丁基異氰酸酯", "CCCCN=C=O", "Small Molecule"), ("丁醇", BUTANOL, "Small Molecule")]),
]

# 本卡填入數值的總表：規則 id → (欄位, 單位, 出處, 適用條件)；數值由資料表讀出
VOL_UNIT = "cm3/mol（每莫耳反應 C=C 的收縮量，正值＝體積減少）"
STANS = "Stansbury & Ge, RadTech Report (May/June 2003) p.57（https://sites.lafayette.edu/lss/files/2013/04/Stansbury_RadtechReport2003.pdf）"
YE = "Ye 等, Macromolecules 2011 Table 2（DOI 10.1021/ma2018809；PMC3252887）"
LOCHAB = "Lochab 等, Polymers 13 (2021) 1260 §3（DOI 10.3390/polym13081260；PMC8069336）"
ROLPH = "Rolph 等, Polym. Chem. 7 (2016) 7351 Table 2（DOI 10.1039/C6PY01776B；https://wrap.warwick.ac.uk/id/eprint/87384/1/WRAP_C6PY01776B.pdf）"
TABLE_NOTES = [
    ("acrylate+initiator.thermal", "bond_volume_change", VOL_UNIT, STANS, "丙烯酸甲酯聚合的 molar shrinkage 22.6；密度法；其他丙烯酸酯為同類外推。另見 " + YE + "（（甲基）丙烯酸酯均聚 22.6 mL/mol）"),
    ("acrylate+initiator.photo", "bond_volume_change", VOL_UNIT, STANS, "同上（與熱／光起始無關的鏈增長 C=C 收縮量）"),
    ("methacrylate+initiator.thermal", "bond_volume_change", VOL_UNIT, STANS, "「大多數甲基丙烯酸酯約 23 ± 1.8 cm3/mol C=C」（引 Patel 等 1987 單酯系列）；其他來源 22.5、23.0、22.6，量值略異，見規則 notes"),
    ("methacrylate+initiator.photo", "bond_volume_change", VOL_UNIT, STANS, "同上"),
    ("thiol+alkene.allyl", "bond_volume_change", VOL_UNIT, YE, "硫醇–烯逐步加成的通用 shrinkage factor 12.6（文獻自稱 estimated，引 Lu 等 2005 Dent. Mater. 21:1129）；不是烯丙基個別量測值"),
    ("thiol+vinyl.ether", "bond_volume_change", VOL_UNIT, YE, "同上；不是乙烯基醚個別量測值"),
    ("thiol+norbornene", "bond_volume_change", VOL_UNIT, YE, "同上；不是降冰片烯個別量測值"),
    ("epoxy+pag.cationic", "bond_volume_change", "cm3/mol（每莫耳環氧基開環的收縮量，正值＝體積減少）", STANS, "文獻只給環氧乙烷 ≈ 11；環氧樹脂（縮水甘油醚、環脂族環氧）為同類外推"),
    ("benzoxazine.ring_opening", "temp_min_c／temp_max_c", "°C", LOCHAB, "苯并㗁嗪單體熱開環聚合（不加催化劑）的一般範圍 160–220，隨結構、環數、純度而變；不是後硬化溫度。同篇另有 140–240（無催化劑，引 ref 121）、加胺 120–150"),
    ("benzoxazine+phenol_ring", "temp_min_c／temp_max_c", "°C", LOCHAB, "同上，是同一個開環在含酚體系中的表示，沿用同一範圍（同體系外推）"),
    ("isocyanate.deblocking.oxime", "temp_min_c／temp_max_c", "°C", ROLPH, "肟封端（MEKO 等）解封端溫度，文獻彙整各研究所報範圍，量測法不同（DSC、TGA、FTIR 等），文獻稱僅供近似指引；範圍很寬。同表：酚 60–180、己內醯胺 70–170、吡唑 85–200"),
]


def fnum(v: float | None) -> str:
    return "—" if v is None else (str(int(v)) if float(v).is_integer() else f"{v:.2f}")


def read_rules() -> dict[str, dict[str, str]]:
    with open(ROOT / "src" / "data" / "reaction_rules.csv", encoding="utf-8-sig", newline="") as f:
        return {r["id"]: r for r in csv.DictReader(f)}


def main() -> None:
    lines: list[str] = []
    w = lines.append
    w("# 反應規則 D 批命中列表與本卡填入數值總表（任務 P7-2，D67、D22 第 3 點）")
    w("")
    w("用引擎第 0 層與專案的真實資料表（`src/data/functional_groups.csv`、`reaction_rules.csv`）對四條新規則（馬來醯亞胺自聚、ene 後續共聚、苯并㗁嗪＋環氧、肟封端異氰酸酯解封端）的代表性小配方列出：每條規則對哪些成分的哪些位置命中、官能度與當量、第 1 層是否支援。")
    w("本檔由 `scripts/verification/p7-2-hit-list.py` 產生；分子只用規則表測試分子與 docs/verification 已有的分子，沒有新增。**「使用者判定」欄留空，請審化學正確性。**")
    w("")
    w("- 位置：命中官能基的反應原子在該成分 SMILES 中的原子序（0 起算；聚合物重複單元不在本列表）。")
    w("- 官能度 f：位點數 × 規則的 functionality（每個基團形成的鍵數）；當量 = 分子量 ÷ f（g/eq），分子量由 RDKit 平均分子量計算，僅供驗證，不顯示於結果頁（D09）。")
    w("- 第 1 層：`支援` = 由現有 Miller–Macosko 公式計算；`不支援` = 回報原因、不給數值。四條新規則第 1 層一律不支援（原因見表）。")
    w("- 所有新規則與官能基 `review_status` 皆為 `pending`；四條規則的反應 SMARTS 全是自行撰寫（D22），maleimide+propenyl.copolymerization 與 benzoxazine+epoxy 是形式表示，請特別審。")
    w("- 馬來醯亞胺自聚用「熱自由基起始劑觸發」表示（與 C 批鏈增長同一種催化劑配對表示法）；BMI 沒有起始劑時無此配對，所以 P7-1B 既有的 BMI＋二胺等配方輸出不變。")
    w("- 不做反向驗證與邊界探針（D64）。")
    w("")
    for system, name, comps in SYSTEMS:
        components = []
        for i, (cname, smi, cat) in enumerate(comps):
            mol = Chem.MolFromSmiles(smi)
            components.append({"id": f"c{i}", "name": cname, "canonicalSmiles": smi, "category": cat, "molarMass": Descriptors.MolWt(mol)})
        result = crosslink.analyze_crosslink(components)
        sites_of = {c["id"]: {g["groupId"]: g["sites"] for g in c["groups"]} for c in result["components"]}
        mw_of = {c["id"]: c["molarMass"] for c in components}
        w(f"## {system}：{name}")
        w("")
        w("成分：" + "；".join(f"{c['name']}（`{c['canonicalSmiles']}`，{c['category']}）" for c in components))
        w("")
        w("成分官能基命中：" + "；".join(f"{c['name']}：" + ("、".join(f"{gid} × {len(s)}" for gid, s in sites_of[c["id"]].items()) or "（無）") for c in components))
        w("")
        if not result["pairs"]:
            w("**第 0 層：無反應配對**（符合預期的反例時請於判定欄確認）。")
            w("")
            w("| 規則 | 命中成分與位置 | 官能度與當量 | 第 1 層 | 使用者判定 |")
            w("|---|---|---|---|---|")
            w("| （無） | — | — | — | |")
            w("")
            continue
        w(f"第 0 層判定：{crosslink.VERDICT_LABEL[result['verdict']]}")
        w("")
        w("| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |")
        w("|---|---|---|---|---|---|---|---|")
        rule_ids = sorted({p["ruleId"] for p in result["pairs"]})
        solid = [{"id": c["id"], "name": c["name"], "canonicalSmiles": c["canonicalSmiles"], "amount": 50.0, "isResin": True} for c in components if c["category"] in ("Resin", "Small Molecule")]
        wt = {c["id"]: 50.0 for c in solid}
        for p in result["pairs"]:
            ends = [p["a"]] + ([p["b"]] if p["b"] is not None else [])
            hit = "<br>".join(f"{e['name']}：{e['groupId']} × {len(sites_of[e['componentId']].get(e['groupId'], []))}，{sites_of[e['componentId']].get(e['groupId'], [])}" for e in ends)
            feq = "<br>".join(f"{e['name']}：f = {fnum(e['f'])}，當量 {fnum(mw_of[e['componentId']] / e['f']) if e['f'] else '—'} g/eq" for e in ends)
            # 第 1 層是否支援以「這條規則」判斷；配方同時有多條規則時，整份配方的第 1 層回報單一規則限制
            if p["ruleId"] in layer1.UNSUPPORTED_RULES:
                l1 = f"不支援：{layer1.MESSAGE_UNSUPPORTED_SYSTEM}：{layer1.UNSUPPORTED_RULES[p['ruleId']]}"
            elif len(rule_ids) > 1:
                l1 = f"不支援（整份配方）：{layer1.MESSAGE_MULTI_RULE}"
            else:
                prep = layer1.prepare_layer1(result, solid, "g", wt)
                l1 = "支援" if prep["ok"] else "不支援：" + prep["reason"]
            w(f"| {p['ruleId']} | {hit} | {feq} | {p['catalyst']['message']} | {p['temperature']} | {crosslink.PAIR_KIND_LABEL[p['kind']]} | {l1} | |")
        if result["warnings"]:
            w("")
            w("警告：" + "；".join(result["warnings"]))
        w("")

    rules = read_rules()
    w("## 本卡填入數值的總表（D67）")
    w("")
    w("數值由資料表讀出；`review_status` 皆為 `pending`。單位鍵體積變化的數值是文獻原文的「收縮量」（正值＝體積減少），沒有任何換算；溫度不是計算結果，不進任何公式（S03）。**「使用者判定」欄留空，請逐條審。**")
    w("沒有找到可引用數值的規則欄位（總表以外的所有溫度與單位鍵體積變化欄）維持空白，原因見各規則 notes 與報告；光觸發的規則溫度欄維持空白（notes 寫「光觸發」）。")
    w("")
    w("| 規則 id | 欄位 | 數值 | 單位 | 出處 | 適用條件 | 使用者判定 |")
    w("|---|---|---|---|---|---|---|")
    for rid, field, unit, src, cond in TABLE_NOTES:
        r = rules[rid]
        if field == "bond_volume_change":
            val = r["bond_volume_change"]
            assert val != "", rid
        else:
            val = f"{r['temp_min_c']}–{r['temp_max_c']}"
            assert r["temp_min_c"] != "", rid
        w(f"| {rid} | {field} | {val} | {unit} | {src} | {cond} | |")
    w("")
    w("既有且不覆蓋：`resol.methylol+phenol_ring` 的 60–100 °C 是可溶酚醛的製備（縮合階段）條件（P7-1A，Pilato 2010 Table 4.2），沒有找到完整硬化溫度的明確範圍，未更動。")
    w("")
    out = ROOT / "docs" / "verification" / "phase7-反應規則D-命中列表.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print("已寫入", out)


if __name__ == "__main__":
    main()
