"""任務 P7-1A：產生 docs/verification/phase7-反應規則A-命中列表.md（D22 第 3 點：命中結果列表交使用者審化學正確性）。

用引擎第 0 層（crosslink.analyze_crosslink，專案的真實資料表）對每個體系的代表性小配方列出：每條規則對哪些成分的哪些位置（原子序，0 起算）命中、
每分子官能度 f 與當量（分子量 ÷ f，g/eq）、第 1 層是否支援。「使用者判定」欄留空。分子只用規則表測試分子與 docs/verification 已有的分子，不新增。
執行：engine/.venv/Scripts/python scripts/verification/p7-1a-hit-list.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))

from rdkit import Chem  # noqa: E402
from rdkit.Chem import Descriptors  # noqa: E402

from moleform_core import crosslink, layer1  # noqa: E402

BADGE = "CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1"
BADCY = "CC(C)(c1ccc(OC#N)cc1)c1ccc(OC#N)cc1"
HMTA = "C1N2CN3CN1CN(C2)C3"
PAG = "c1ccc([S+](c2ccccc2)c2ccccc2)cc1.F[Sb-](F)(F)(F)(F)F"
NOVOLAC = "Oc1ccc(Cc2ccc(O)c(Cc3ccccc3O)c2)cc1"
BPA = "CC(C)(c1ccc(O)cc1)c1ccc(O)cc1"

# (體系, 配方名, [(成分名, SMILES, 分類)])
SYSTEMS = [
    ("1 環氧＋酚（已有 D25；酚醛各類型）", "BADGE＋酚醛清漆三聚體", [("BADGE", BADGE, "Resin"), ("酚醛清漆三聚體", NOVOLAC, "Resin")]),
    ("1 環氧＋酚", "BADGE＋鄰甲酚", [("BADGE", BADGE, "Resin"), ("鄰甲酚", "Cc1ccccc1O", "Small Molecule")]),
    ("1 環氧＋酚", "BADGE＋雙酚 A", [("BADGE", BADGE, "Resin"), ("雙酚 A", BPA, "Small Molecule")]),
    ("1 環氧＋酚", "BADGE＋聯苯芳烷基酚（小分子片段）", [("BADGE", BADGE, "Resin"), ("聯苯芳烷基酚", "Oc1ccc(Cc2ccc(cc2)-c2ccc(Cc3ccccc3O)cc2)cc1", "Resin")]),
    ("1 環氧＋酚", "BADGE＋雙環戊二烯改質酚（示意結構）", [("BADGE", BADGE, "Resin"), ("DCPD 改質酚", "Oc1ccc(cc1)C1CC2C3CC=CC3C2C1", "Resin")]),
    ("2 環氧＋胺", "BADGE＋乙二胺（一級脂肪胺）", [("BADGE", BADGE, "Resin"), ("乙二胺", "NCCN", "Small Molecule")]),
    ("2 環氧＋胺", "BADGE＋4,4'-二胺基二苯甲烷（一級芳香胺）", [("BADGE", BADGE, "Resin"), ("MDA", "Nc1ccc(Cc2ccc(N)cc2)cc1", "Small Molecule")]),
    ("2 環氧＋胺", "BADGE＋哌啶（二級脂肪胺）", [("BADGE", BADGE, "Resin"), ("哌啶", "C1CCNCC1", "Small Molecule")]),
    ("2 環氧＋胺", "BADGE＋N-甲基苯胺（二級芳香胺）", [("BADGE", BADGE, "Resin"), ("N-甲基苯胺", "CNc1ccccc1", "Small Molecule")]),
    ("2 環氧＋胺", "BADGE＋二乙三胺（一級＋二級脂肪胺，兩條規則）", [("BADGE", BADGE, "Resin"), ("二乙三胺", "NCCNCCN", "Small Molecule")]),
    ("3 環氧＋酸酐", "BADGE＋MHHPA", [("BADGE", BADGE, "Resin"), ("MHHPA", "CC1CCC2C(C1)C(=O)OC2=O", "Small Molecule")]),
    ("4 環氧＋氰酸酯", "BADGE＋雙酚 A 二氰酸酯", [("BADGE", BADGE, "Resin"), ("BADCy", BADCY, "Resin")]),
    ("4 氰酸酯三聚", "雙酚 A 二氰酸酯單獨", [("BADCy", BADCY, "Resin")]),
    ("5 酚醛清漆＋HMTA", "酚醛清漆三聚體＋HMTA", [("酚醛清漆三聚體", NOVOLAC, "Resin"), ("HMTA", HMTA, "Small Molecule")]),
    ("5 酚醛清漆＋HMTA", "2,4,6-三甲基酚（無空位，反例）＋HMTA", [("2,4,6-三甲基酚", "Cc1cc(C)c(O)c(C)c1", "Small Molecule"), ("HMTA", HMTA, "Small Molecule")]),
    ("6 可溶酚醛", "2-羥甲基酚（含羥甲基與空位）", [("2-羥甲基酚", "OCc1ccccc1O", "Resin")]),
    ("6 可溶酚醛", "2,4,6-三羥甲基酚＋苯酚", [("2,4,6-三羥甲基酚", "Oc1c(CO)cc(CO)cc1CO", "Resin"), ("苯酚", "Oc1ccccc1", "Small Molecule")]),
    ("7 陽離子光酸", "BADGE＋三苯基鋶 PAG", [("BADGE", BADGE, "Resin"), ("三苯基鋶 SbF6", PAG, "Catalyst/Initiator")]),
    ("7 陽離子光酸", "氧雜環丁烷（3-乙基-3-羥甲基）＋PAG", [("EHO 氧雜環丁烷", "CCC1(CO)COC1", "Resin"), ("三苯基鋶 SbF6", PAG, "Catalyst/Initiator")]),
    ("7 陽離子光酸", "BADGE＋氧雜環丁烷＋PAG（共聚）", [("BADGE", BADGE, "Resin"), ("EHO 氧雜環丁烷", "CCC1(CO)COC1", "Resin"), ("三苯基鋶 SbF6", PAG, "Catalyst/Initiator")]),
    ("7 陽離子光酸（反例）", "BADGE＋非鎓鹽（四甲基銨）", [("BADGE", BADGE, "Resin"), ("四甲基銨", "C[N+](C)(C)C", "Catalyst/Initiator")]),
]


def fnum(v: float | None) -> str:
    return "—" if v is None else (str(int(v)) if float(v).is_integer() else f"{v:.2f}")


def main() -> None:
    lines: list[str] = []
    w = lines.append
    w("# 反應規則 A 批命中列表（任務 P7-1A，D65、D22 第 3 點）")
    w("")
    w("用引擎第 0 層與專案的真實資料表（`src/data/functional_groups.csv`、`reaction_rules.csv`）對每個體系的代表性小配方列出：每條規則對哪些成分的哪些位置命中、官能度與當量、第 1 層是否支援。")
    w("本檔由 `scripts/verification/p7-1a-hit-list.py` 產生；分子只用規則表測試分子與 docs/verification 已有的分子，沒有新增。**「使用者判定」欄留空，請審化學正確性。**")
    w("")
    w("- 位置：命中官能基的反應原子在該成分 SMILES 中的原子序（0 起算；聚合物重複單元不在本列表）。")
    w("- 官能度 f：位點數 × 規則的 functionality（每個基團形成的鍵數）；當量 = 分子量 ÷ f（g/eq），分子量由 RDKit 平均分子量計算，僅供驗證，不顯示於結果頁（D09）。")
    w("- 第 1 層：`支援` = 由現有 Miller–Macosko 公式計算；`不支援` = 回報原因、不給數值。")
    w("- 所有新規則與官能基 `review_status` 皆為 `pending`。")
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
        solid = [{"id": c["id"], "name": c["name"], "canonicalSmiles": c["canonicalSmiles"], "amount": 50.0, "isResin": True} for c in components if c["category"] != "Catalyst/Initiator"]
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
    out = ROOT / "docs" / "verification" / "phase7-反應規則A-命中列表.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print("已寫入", out)


if __name__ == "__main__":
    main()
