"""任務 P7-3：產生 docs/verification/phase7-固化預測-輸出.md（交聯第 2 層：Tg∞、固化後 Tg、完全固化最低溫度、最大轉化率、Td 警示）。

用引擎的 HTTP 處理函式（moleform_engine.handle_crosslink_analyze／handle_crosslink_cure，與介面走同一條路徑）對配方 4A、4B（docs/verification/phase4-測試體系.md）各算一次；
另附一個「補充案例」：鄰甲酚酚醛（有 K 的樹脂類別）＋ BADGE，用來顯示 Tg,0 可算時的數值路徑（4A、4B 因共聚物與 PGMA 缺基團，Tg,0 為 missing）。
「使用者判定」欄留空。執行：engine/.venv/Scripts/python scripts/verification/p7-3-cure.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "engine"))

from rdkit import Chem  # noqa: E402
from rdkit.Chem import Descriptors  # noqa: E402

import moleform_engine as eng  # noqa: E402

CURE_TEMP_C = 150  # 驗證輸出用的硬化溫度（可在介面修改）
OUT = ROOT / "docs" / "verification" / "phase7-固化預測-輸出.md"

P_A = "[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O"
P_B = "[*:1]C([*:2])c1ccc2ccccc2c1"
E_PGMA = "[*:1]CC([*:2])(C)C(=O)OCC1CO1"
S_SBI = "OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2"
CRESOL_NOVOLAC = "[*:1]Cc1cc([*:2])cc(C)c1O"
BADGE = "CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1"


def comp_p() -> dict:
    return {
        "id": "P",
        "name": "P（雙酚茀–萘甲醛型酚醛）",
        "category": "Resin",
        "canonicalSmiles": P_A,
        "polymer": {"units": [{"smiles": P_A, "fraction": 66.67}, {"smiles": P_B, "fraction": 33.33}], "fractionBasis": "mol", "mwInput": 6000, "pdiInput": 1.8},
    }


def comp_e() -> dict:
    return {"id": "E", "name": "E（PGMA 型環氧）", "category": "Resin", "canonicalSmiles": E_PGMA, "polymer": {"mwInput": 4500}}


CASES = [
    ("配方 4A", "Solid（wt%）P 80、E 20（PGMEA 為 Liquid，不參與）", [comp_p(), comp_e()], {"P": 80, "E": 20}),
    ("配方 4B", "Solid（wt%）P 79.2、E 19.8、S 1（PGMEA 為 Liquid，不參與）", [comp_p(), comp_e(), {"id": "S", "name": "S（SBI 雙酚）", "category": "Resin", "canonicalSmiles": S_SBI}], {"P": 79.2, "E": 19.8, "S": 1}),
    (
        "補充案例（非任務指定）",
        "Solid（wt%）鄰甲酚酚醛（Mn 1000）80、BADGE 20；用來顯示 Tg,0 可算時的數值路徑",
        [
            {"id": "N", "name": "鄰甲酚酚醛（Mn 1000）", "category": "Resin", "canonicalSmiles": CRESOL_NOVOLAC, "polymer": {"mnInput": 1000}},
            {"id": "B", "name": "BADGE", "category": "Resin", "canonicalSmiles": BADGE},
        ],
        {"N": 80, "B": 20},
    ),
]


def fmt(v: float | None, digits: int = 1) -> str:
    return "—" if v is None else f"{v:.{digits}f}"


def k_c(tg_k: float | None) -> str:
    return "—" if tg_k is None else f"{tg_k:.1f} K（{tg_k - 273.15:.1f} °C）"


def run_case(comps: list[dict], amounts: dict) -> tuple[dict, dict]:
    request_comps = []
    for c in comps:
        d = dict(c)
        if "*" not in c["canonicalSmiles"]:
            d["molarMass"] = Descriptors.MolWt(Chem.MolFromSmiles(c["canonicalSmiles"]))
        request_comps.append(d)
    code, analysis = eng.handle_crosslink_analyze({"components": request_comps})
    assert code == 200, analysis
    mn = {c["id"]: c["molarMass"] for c in analysis["components"]}
    solid = {"unit": "wt", "components": [{**c, "amount": amounts[c["id"]]} for c in comps]}
    code, out = eng.handle_crosslink_cure({"result": analysis, "solid": solid, "wtPct": amounts, "mn": mn, "cureTempC": CURE_TEMP_C})
    assert code == 200, out
    return analysis, out


def render(title: str, desc: str, analysis: dict, out: dict) -> list[str]:
    lines = [f"## {title}", "", desc, ""]
    if not out["supported"]:
        lines += [f"第 1 層不支援，固化預測回報同一個原因：{out['reason']}", ""]
        return lines
    rows: list[tuple[str, str, str]] = []
    tg0, mcrl, tgi, post, td = out["tg0"], out["mCrl"], out["tgInf"], out["postCure"], out["td"]
    rows.append(("Tg,0（未交聯 Tg 估計）", k_c(tg0.get("tgK")) if tg0["status"] == "predicted" else f"missing：{tg0['reason']}", "Fox 混合（既有 `tg_mixing`），" + "；".join(tg0.get("messages", [])) if tg0.get("messages") else "Fox 混合（既有 `tg_mixing`）"))
    rows.append(("M_crl（= Mc，限量官能基 100% 反應）", f"{mcrl['value']:.1f} g/mol" if mcrl["status"] == "predicted" else f"missing：{mcrl['reason']}", f"規則 {out['ruleId']}；{out['notes']['mCrl']}"))
    if tgi["status"] == "predicted":
        rows.append(("Tg∞ 下限（K_crl = 3.9×10⁴）", k_c(tgi["low"]["tgK"]), tgi["low"]["source"]))
        rows.append(("Tg∞ 上限（K_crl = 5.2×10⁴）", k_c(tgi["high"]["tgK"]), tgi["high"]["source"]))
        rows.append(("ΔTg = Tg∞ − Tg,0", f"{tgi['deltaLowK']:.1f}–{tgi['deltaHighK']:.1f} K", "書頁 149：環氧以二胺或酸酐硬化的資料，高交聯度時 ΔTg 約 80 K（只對照，不調整）"))
    else:
        rows.append(("Tg∞（式 6.13，範圍）", f"missing：{tgi['reason']}", out["notes"]["tgInf"]))
    rows.append(("式 (6.14) 對照值", f"missing：{out['eq614']['reason']}", out["models"]["eq614"]))
    if post["status"] == "predicted":
        lam = post["lambda"]
        rows.append(("λ = Tg0/Tg∞（近似，S02）", f"{lam['low']:.3f}（Tg∞ 下限）／{lam['high']:.3f}（Tg∞ 上限）", out["notes"]["lambda"]))
        for r in post["table"]:
            rows.append((f"固化後 Tg（轉化率 {r['conversion'] * 100:.0f}%）", f"{k_c(r['low']['tgK'])} 至 {k_c(r['high']['tgK'])}", "範圍：Tg∞ 下限與上限各算一次"))
        m = post["minFullCureTemp"]
        rows.append(("完全固化最低溫度", f"{k_c(m['low']['tgK'])} 至 {k_c(m['high']['tgK'])}", out["notes"]["fullCure"]))
        mc = post["maxConversion"]
        if mc is not None:
            rows.append((f"最大轉化率（硬化溫度 {mc['cureTempC']:.0f} °C）", f"{mc['low'] * 100:.1f}%（Tg∞ 下限）／{mc['high'] * 100:.1f}%（Tg∞ 上限）", out["notes"]["maxConversion"]))
    else:
        rows.append(("固化後 Tg、完全固化最低溫度、最大轉化率", f"missing：{post['reason']}", out["models"]["postCure"]))
    td_rows = "；".join(f"{r['name']}：{k_c(r['tdK']) if r['status'] == 'ok' else '未比較（' + r['reason'] + '）'}" for r in td["components"])
    rows.append(("成分 Td,1/2", td_rows or "沒有 Solid 成分", td["model"]))
    rows.append(("Tg∞ 高於 Td 警示", td["warning"]["text"] + f"（{td['warning']['status']}）", out["notes"]["td"]))
    lines += ["| 項目 | 結果 | 模型／備註 | 使用者判定 |", "|---|---|---|---|"]
    for a, b, c in rows:
        lines.append(f"| {a} | {b} | {c.replace('|', '／')} | |")
    lines.append("")
    return lines


def main() -> None:
    lines = [
        "# 任務 P7-3 輸出：固化預測（交聯第 2 層）",
        "",
        "產生方式：`engine/.venv/Scripts/python scripts/verification/p7-3-cure.py`（引擎 `/crosslink/analyze` → `/crosslink/cure`，與介面同一條路徑）。",
        f"硬化溫度固定為 {CURE_TEMP_C} °C（介面可修改）。所有數值為依理論模型估算之參考值，非實測值；Tg∞ 範圍是式 (6.13) 兩個書中 K 值各算一次，不選單一值。「使用者判定」欄留空。",
        "",
    ]
    for title, desc, comps, amounts in CASES:
        analysis, out = run_case(comps, amounts)
        lines += render(title, desc, analysis, out)
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
