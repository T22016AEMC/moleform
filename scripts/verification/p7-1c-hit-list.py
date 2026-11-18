"""任務 P7-1C：產生 docs/verification/phase7-反應規則C-命中列表.md（D22 第 3 點：命中結果列表交使用者審化學正確性）。

用引擎第 0 層（crosslink.analyze_crosslink，專案的真實資料表）對每個體系的代表性小配方列出：每條規則對哪些成分的哪些位置（原子序，0 起算）命中、
每分子官能度 f 與當量（分子量 ÷ f，g/eq）、第 1 層是否支援。「使用者判定」欄留空。分子只用規則表測試分子與 docs/verification 已有的分子，不新增。
執行：engine/.venv/Scripts/python scripts/verification/p7-1c-hit-list.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))

from rdkit import Chem  # noqa: E402
from rdkit.Chem import Descriptors  # noqa: E402

from moleform_core import crosslink, layer1  # noqa: E402

AIBN = "CC(C)(C#N)N=NC(C)(C)C#N"
IRG = "O=C(c1ccccc1)C1(O)CCCCC1"  # Irgacure 184（McGrath 2006 的光起始劑）
TMPTA = "C=CC(=O)OCC(CC)(COC(=O)C=C)COC(=O)C=C"
BA = "C=CC(=O)OCCCC"
MMA = "CC(=C)C(=O)OC"
GMA = "CC(=C)C(=O)OCC1CO1"
GA = "C=CC(=O)OCC1CO1"
EPA = "C=CC(=O)OCC(O)COc1ccccc1"  # 環氧丙烯酸酯（環氧開環後，含羥基與丙烯酸酯）
AAM = "C=CC(=O)N"
MBA = "C=CC(=O)NCNC(=O)C=C"
STY = "C=Cc1ccccc1"
DVB = "C=Cc1ccc(C=C)cc1"
AMS = "CC(=C)c1ccccc1"
PETMP = "O=C(CCS)OCC(COC(=O)CCS)(COC(=O)CCS)COC(=O)CCS"
DABPA = "CC(C)(c1ccc(O)c(CC=C)c1)c1ccc(O)c(CC=C)c1"  # docs/verification（B 批）已有
DVE = "C=COCCOCCOC=C"
NB2 = "O=C(OCCOC(=O)C1CC2CC1C=C2)C1CC2CC1C=C2"
DMS = "CSC"
AME = "C=CCOC"
BPA = "CC(C)(c1ccc(O)cc1)c1ccc(O)cc1"  # 雙酚 A（規則測試分子與 docs/verification 已有）

INIT = "Catalyst/Initiator"
# (體系, 配方名, [(成分名, SMILES, 分類)])；分子只用規則表測試分子與 docs/verification 已有的分子
SYSTEMS = [
    ("1 壓克力／甲基丙烯酸酯（光起始劑）", "三羥甲基丙烷三丙烯酸酯（TMPTA）＋光起始劑 Irgacure 184", [("TMPTA", TMPTA, "Resin"), ("Irgacure 184", IRG, INIT)]),
    ("1 壓克力／甲基丙烯酸酯（熱起始劑）", "丙烯酸丁酯＋AIBN", [("丙烯酸丁酯", BA, "Small Molecule"), ("AIBN", AIBN, INIT)]),
    ("1 壓克力／甲基丙烯酸酯（光起始劑）", "甲基丙烯酸甲酯＋Irgacure 184", [("MMA", MMA, "Small Molecule"), ("Irgacure 184", IRG, INIT)]),
    ("1 壓克力／甲基丙烯酸酯（熱起始劑）", "甲基丙烯酸甲酯＋AIBN", [("MMA", MMA, "Small Molecule"), ("AIBN", AIBN, INIT)]),
    ("1 丙烯醯胺", "丙烯醯胺＋AIBN", [("丙烯醯胺", AAM, "Small Molecule"), ("AIBN", AIBN, INIT)]),
    ("1 丙烯醯胺", "N,N'-亞甲基雙丙烯醯胺＋Irgacure 184", [("MBA", MBA, "Resin"), ("Irgacure 184", IRG, INIT)]),
    ("1 苯乙烯類", "苯乙烯＋二乙烯苯＋AIBN", [("苯乙烯", STY, "Small Molecule"), ("二乙烯苯", DVB, "Small Molecule"), ("AIBN", AIBN, INIT)]),
    ("1 反例", "丙烯酸丁酯＋MMA（沒有起始劑）", [("丙烯酸丁酯", BA, "Small Molecule"), ("MMA", MMA, "Small Molecule")]),
    ("1 反例", "α-甲基苯乙烯＋AIBN（α-甲基苯乙烯不是苯乙烯基）", [("α-甲基苯乙烯", AMS, "Small Molecule"), ("AIBN", AIBN, INIT)]),
    ("1 反例", "烯丙基甲基醚＋AIBN（烯丙基醚無自由基鏈增長規則）", [("烯丙基甲基醚", AME, "Small Molecule"), ("AIBN", AIBN, INIT)]),
    ("2 硫醇–烯（烯丙基）", "PETMP（四官能硫醇）＋二烯丙基雙酚 A＋Irgacure 184", [("PETMP", PETMP, "Resin"), ("二烯丙基雙酚 A", DABPA, "Resin"), ("Irgacure 184", IRG, INIT)]),
    ("2 硫醇–烯（乙烯基醚）", "PETMP＋二乙二醇二乙烯基醚＋AIBN", [("PETMP", PETMP, "Resin"), ("二乙二醇二乙烯基醚", DVE, "Resin"), ("AIBN", AIBN, INIT)]),
    ("2 硫醇–烯（降冰片烯）", "PETMP＋乙二醇雙（5-降冰片烯-2-羧酸酯）＋Irgacure 184", [("PETMP", PETMP, "Resin"), ("乙二醇雙降冰片烯羧酸酯", NB2, "Resin"), ("Irgacure 184", IRG, INIT)]),
    ("2 硫醇–烯（丙烯酸酯，與鏈增長併行）", "PETMP＋TMPTA＋Irgacure 184", [("PETMP", PETMP, "Resin"), ("TMPTA", TMPTA, "Resin"), ("Irgacure 184", IRG, INIT)]),
    ("2 硫醇–烯（反例）", "二甲基硫醚（硫醚不是硫醇）＋二烯丙基雙酚 A", [("二甲基硫醚", DMS, "Small Molecule"), ("二烯丙基雙酚 A", DABPA, "Resin")]),
    ("2 硫醇–烯（反例）", "PETMP＋二甲基硫醚（有硫醇但沒有烯，硫醚不反應）", [("PETMP", PETMP, "Resin"), ("二甲基硫醚", DMS, "Small Molecule")]),
    ("3 雜化：含環氧的甲基丙烯酸酯", "甲基丙烯酸縮水甘油酯（GMA，同分子含環氧與甲基丙烯酸酯）＋AIBN", [("GMA", GMA, "Small Molecule"), ("AIBN", AIBN, INIT)]),
    ("3 雜化：含環氧的丙烯酸酯", "丙烯酸縮水甘油酯＋Irgacure 184", [("丙烯酸縮水甘油酯", GA, "Small Molecule"), ("Irgacure 184", IRG, INIT)]),
    ("3 雜化：環氧丙烯酸酯（環氧開環後）", "環氧丙烯酸酯（含羥基與丙烯酸酯）＋AIBN", [("環氧丙烯酸酯", EPA, "Resin"), ("AIBN", AIBN, INIT)]),
    ("3 雜化：只做官能基命中", "GMA＋雙酚 A（環氧＋酚照 A 批規則配對；甲基丙烯酸酯沒有起始劑，不配對，沒有跨體系規則）", [("GMA", GMA, "Small Molecule"), ("雙酚 A", BPA, "Small Molecule")]),
]


def fnum(v: float | None) -> str:
    return "—" if v is None else (str(int(v)) if float(v).is_integer() else f"{v:.2f}")


def main() -> None:
    lines: list[str] = []
    w = lines.append
    w("# 反應規則 C 批命中列表（任務 P7-1C，D65、D22 第 3 點）")
    w("")
    w("用引擎第 0 層與專案的真實資料表（`src/data/functional_groups.csv`、`reaction_rules.csv`）對每個體系的代表性小配方列出：每條規則對哪些成分的哪些位置命中、官能度與當量、第 1 層是否支援。")
    w("本檔由 `scripts/verification/p7-1c-hit-list.py` 產生；分子只用規則表測試分子與 docs/verification 已有的分子，沒有新增。**「使用者判定」欄留空，請審化學正確性。**")
    w("")
    w("- 位置：命中官能基的反應原子在該成分 SMILES 中的原子序（0 起算；聚合物重複單元不在本列表）。")
    w("- 官能度 f：位點數 × 規則的 functionality（每個基團形成的鍵數）；當量 = 分子量 ÷ f（g/eq），分子量由 RDKit 平均分子量計算，僅供驗證，不顯示於結果頁（D09）。")
    w("- 第 1 層：`支援` = 由現有 Miller–Macosko 公式計算；`不支援` = 回報原因、不給數值（鏈增長聚合不適用逐步聚合的凝膠點）。")
    w("- 所有新規則與官能基 `review_status` 皆為 `pending`。")
    w("- 配對判定「催化劑配對（不計當量）」：熱起始劑與光起始劑和光酸產生劑同一種表示法——起始劑是催化劑、不被計量消耗，不用官能度計數判定；起始劑的 f 沒有化學計量意義。")
    w("- 「成分官能基命中」列出成分命中的全部官能基（含 B 批以前的官能基），用來看含環氧的丙烯酸酯等同一分子命中兩種官能基；只做官能基命中，沒有跨體系規則。")
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
    out = ROOT / "docs" / "verification" / "phase7-反應規則C-命中列表.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print("已寫入", out)


if __name__ == "__main__":
    main()
