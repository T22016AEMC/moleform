"""任務 P7-1B：產生 docs/verification/phase7-反應規則B-命中列表.md（D22 第 3 點：命中結果列表交使用者審化學正確性）。

用引擎第 0 層（crosslink.analyze_crosslink，專案的真實資料表）對每個體系的代表性小配方列出：每條規則對哪些成分的哪些位置（原子序，0 起算）命中、
每分子官能度 f 與當量（分子量 ÷ f，g/eq）、第 1 層是否支援。「使用者判定」欄留空。分子只用規則表測試分子與 docs/verification 已有的分子，不新增。
執行：engine/.venv/Scripts/python scripts/verification/p7-1b-hit-list.py
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
BPA = "CC(C)(c1ccc(O)cc1)c1ccc(O)cc1"
NOVOLAC = "Oc1ccc(Cc2ccc(O)c(Cc3ccccc3O)c2)cc1"
PAG = "c1ccc([S+](c2ccccc2)c2ccccc2)cc1.F[Sb-](F)(F)(F)(F)F"
MDI = "O=C=Nc1ccc(Cc2ccc(N=C=O)cc2)cc1"
MDA = "Nc1ccc(Cc2ccc(N)cc2)cc1"
HMM = "OCN(CO)c1nc(N(CO)CO)nc(N(CO)CO)n1"
HMMM = "COCN(COC)c1nc(N(COC)COC)nc(N(COC)COC)n1"
TEOS = "CCO[Si](OCC)(OCC)OCC"
DPSD = "O[Si](O)(c1ccccc1)c1ccccc1"
TMDS = "C[SiH](C)O[SiH](C)C"
BMI = "O=C1C=CC(=O)N1c1ccc(Cc2ccc(N3C(=O)C=CC3=O)cc2)cc1"
DABPA = "CC(C)(c1ccc(O)c(CC=C)c1)c1ccc(O)c(CC=C)c1"
BAA = "CC(C)(c1ccc2OCN(c3ccccc3)Cc2c1)c1ccc2OCN(c3ccccc3)Cc2c1"

# (體系, 配方名, [(成分名, SMILES, 分類)])；分子只用規則表測試分子與 docs/verification 已有的分子
SYSTEMS = [
    ("1 異氰酸酯＋酚羥基（芳基胺基甲酸酯）", "MDI＋雙酚 A", [("MDI", MDI, "Resin"), ("雙酚 A", BPA, "Small Molecule")]),
    ("1 異氰酸酯＋酚羥基", "MDI＋酚醛清漆三聚體", [("MDI", MDI, "Resin"), ("酚醛清漆三聚體", NOVOLAC, "Resin")]),
    ("1 異氰酸酯＋醇羥基（胺基甲酸酯）", "MDI＋乙二醇", [("MDI", MDI, "Resin"), ("乙二醇", "OCCO", "Small Molecule")]),
    ("1 異氰酸酯＋胺（脲）", "MDI＋乙二胺（一級脂肪胺）", [("MDI", MDI, "Resin"), ("乙二胺", "NCCN", "Small Molecule")]),
    ("1 異氰酸酯＋胺（脲）", "MDI＋MDA（一級芳香胺）", [("MDI", MDI, "Resin"), ("MDA", MDA, "Small Molecule")]),
    ("1 異氰酸酯＋胺（脲）", "MDI＋哌啶（二級脂肪胺）", [("MDI", MDI, "Resin"), ("哌啶", "C1CCNCC1", "Small Molecule")]),
    ("1 異氰酸酯（反例）", "MDI＋氰酸酯（雙酚 A 二氰酸酯；N#C–O 不是異氰酸酯）", [("MDI", MDI, "Resin"), ("BADCy", "CC(C)(c1ccc(OC#N)cc1)c1ccc(OC#N)cc1", "Resin")]),
    ("2 三聚氰胺類（酸催化）", "六甲氧基甲基三聚氰胺（烷氧基甲基）＋雙酚 A＋PAG（酸源）", [("HMMM", HMMM, "Resin"), ("雙酚 A", BPA, "Small Molecule"), ("三苯基鋶 SbF6", PAG, "Catalyst/Initiator")]),
    ("2 三聚氰胺類（酸催化）", "六羥甲基三聚氰胺（羥甲基）＋乙二醇", [("HMM", HMM, "Resin"), ("乙二醇", "OCCO", "Small Molecule")]),
    ("2 三聚氰胺類（酸催化）", "六甲氧基甲基三聚氰胺＋乙醯胺（醯胺 N–H）", [("HMMM", HMMM, "Resin"), ("乙醯胺", "CC(=O)N", "Small Molecule")]),
    ("3 矽烷水解縮合", "四乙氧基矽烷（TEOS）＋水（水解）", [("TEOS", TEOS, "Resin"), ("水", "O", "Solvent")]),
    ("3 矽烷水解縮合", "二苯基矽二醇單獨（矽醇自縮合）", [("二苯基矽二醇", DPSD, "Resin")]),
    ("3 矽烷水解縮合", "二苯基矽二醇＋TEOS（矽醇＋烷氧基縮合）", [("二苯基矽二醇", DPSD, "Resin"), ("TEOS", TEOS, "Resin")]),
    ("4 矽氫加成", "四甲基二矽氧烷（Si–H）＋2-烯丙基酚（烯丙基）", [("TMDS", TMDS, "Resin"), ("2-烯丙基酚", "C=CCc1ccccc1O", "Small Molecule")]),
    ("4 矽氫加成（反例）", "六甲基二矽氧烷（無 Si–H）＋2-烯丙基酚", [("六甲基二矽氧烷", "C[Si](C)(C)O[Si](C)(C)C", "Small Molecule"), ("2-烯丙基酚", "C=CCc1ccccc1O", "Small Molecule")]),
    ("5 馬來醯亞胺（BMI）＋胺（邁克爾加成）", "BMI＋乙二胺", [("BMI", BMI, "Resin"), ("乙二胺", "NCCN", "Small Molecule")]),
    ("5 馬來醯亞胺（BMI）＋烯丙基（ene）", "BMI＋二烯丙基雙酚 A", [("BMI", BMI, "Resin"), ("二烯丙基雙酚 A", DABPA, "Resin")]),
    ("6 苯并㗁嗪", "BA-a 型苯并㗁嗪＋酚醛清漆三聚體（與酚環空位形成曼尼希橋）", [("BA-a", BAA, "Resin"), ("酚醛清漆三聚體", NOVOLAC, "Resin")]),
    ("6 苯并㗁嗪", "BA-a 單獨（自開環聚合）", [("BA-a", BAA, "Resin")]),
    ("7 聚醯亞胺前驅物亞醯胺化", "鄰苯二甲醯胺酸（聚醯胺酸單元模型）", [("N-甲基鄰苯二甲醯胺酸", "CNC(=O)c1ccccc1C(=O)O", "Resin")]),
    ("7 聚醯亞胺前驅物亞醯胺化（反例）", "N-苯基鄰苯二甲醯亞胺（已環化）", [("N-苯基鄰苯二甲醯亞胺", "O=C1c2ccccc2C(=O)N1c1ccccc1", "Resin")]),
    ("7 PBO 前驅物環化", "N-(2-羥苯基)苯甲醯胺（聚羥基醯胺單元模型）", [("N-(2-羥苯基)苯甲醯胺", "Oc1ccccc1NC(=O)c1ccccc1", "Resin")]),
    ("A 批修正 1：催化劑配對", "BADGE＋三苯基鋶 PAG（舊版顯示「具封端」）", [("BADGE", BADGE, "Resin"), ("三苯基鋶 SbF6", PAG, "Catalyst/Initiator")]),
    ("A 批修正 1：催化劑配對", "BADGE＋雙酚 A＋PAG（配方判定由環氧＋酚決定）", [("BADGE", BADGE, "Resin"), ("雙酚 A", BPA, "Small Molecule"), ("三苯基鋶 SbF6", PAG, "Catalyst/Initiator")]),
]


def fnum(v: float | None) -> str:
    return "—" if v is None else (str(int(v)) if float(v).is_integer() else f"{v:.2f}")


def main() -> None:
    lines: list[str] = []
    w = lines.append
    w("# 反應規則 B 批命中列表（任務 P7-1B，D65、D22 第 3 點）")
    w("")
    w("用引擎第 0 層與專案的真實資料表（`src/data/functional_groups.csv`、`reaction_rules.csv`）對每個體系的代表性小配方列出：每條規則對哪些成分的哪些位置命中、官能度與當量、第 1 層是否支援。")
    w("本檔由 `scripts/verification/p7-1b-hit-list.py` 產生；分子只用規則表測試分子與 docs/verification 已有的分子，沒有新增。**「使用者判定」欄留空，請審化學正確性。**")
    w("")
    w("- 位置：命中官能基的反應原子在該成分 SMILES 中的原子序（0 起算；聚合物重複單元不在本列表）。")
    w("- 官能度 f：位點數 × 規則的 functionality（每個基團形成的鍵數）；當量 = 分子量 ÷ f（g/eq），分子量由 RDKit 平均分子量計算，僅供驗證，不顯示於結果頁（D09）。")
    w("- 第 1 層：`支援` = 由現有 Miller–Macosko 公式計算；`不支援` = 回報原因、不給數值。")
    w("- 所有新規則與官能基 `review_status` 皆為 `pending`。")
    w("- 配對判定「催化劑配對（不計當量）」是 A 批修正 1：光酸產生劑是催化劑、不被消耗，不用官能度計數判定。")
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
    out = ROOT / "docs" / "verification" / "phase7-反應規則B-命中列表.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print("已寫入", out)


if __name__ == "__main__":
    main()
