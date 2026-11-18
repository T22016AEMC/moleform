"""交聯第 2 層（續）：反應溫度範圍顯示（7.2，S03）與固化收縮（7.6，S05）。任務 P7-4（D62：直接寫在 Python，沒有 TypeScript 版）。

7.2：顯示規則表（`reaction_rules.csv`）記錄的文獻典型溫度範圍，**不計算**；欄位為空顯示「無文獻範圍」，不補值、不內插；光觸發規則顯示「光觸發」。
7.6：收縮率 = Σ（各反應的 bond_volume_change × 該反應在指定轉化率下形成的鍵莫耳數）÷ 配方總體積。
  - 鍵莫耳數取第 1 層 `compute_layer1` 的 bondsFormedMolPerKg（限量官能基轉化率 = x；每 kg Solid）。第 1 層的官能度已是「每個基團形成的鍵數」，
    逐步加成的每一次反應在兩側各消耗一個「鍵單位」，所以每莫耳形成的鍵＝每莫耳反應（規則表單位的「每莫耳反應」）。不重算第 1 層。
  - 配方總體積 = 1000 g ÷ 混合密度（`mixing.compute_mixture_density`，P6A，理想體積加成）。Catalyst/Initiator 與標記揮發／分解的成分不混入密度（與既有混合一致），
    視為與混合物同密度；成分缺密度時整項 missing 並列原因。
  - 單位依 `bond_volume_change_unit`（cm3/mol、mL/mol 視為相同；「正值＝體積減少」為 P7-2 約定）；只做單位換算。
  - 缺值：已命中但沒有 bond_volume_change 的反應不計入並明確列出（`excluded`），不補值；全部命中的反應都沒有值時整項 missing。
    第 1 層目前只支援單一反應規則，所以實際上只會出現「這一條有值」或「這一條沒有值（整項 missing）」；多條反應時結果為不完整（下限）的標示留待第 1 層支援多條規則時加入。
  - 環氧開環的沿用（詮釋，使用者 2026-11-18 於 P7-4 任務卡指定）：下列規則的體積變化事件同樣是環氧環開環（環氧被親核基攻擊開環）；
    這些規則沒有直接的文獻值時，沿用規則表中 `epoxy+pag.cationic` 的環氧開環值（P7-2：Stansbury & Ge 2003 的環氧乙烷值，外推到所有環氧），標「詮釋：沿用環氧開環值（外推）」，
    與直接有文獻值的反應分開列示。其他體系不做這種沿用。
"""

from __future__ import annotations

import re
from typing import Any, Mapping, Sequence

from .layer1 import compute_layer1
from .mixing import compute_mixture_density
from .tg_mixing import CATALYST_CATEGORY

# ---------- 文字 ----------

TEMP_NOTE = "文獻典型範圍，非預測；製備條件與硬化條件已區分的依 notes 顯示。欄位為空顯示「無文獻範圍」，不補值、不內插；規則表數值皆待使用者審（pending）。"
NO_RANGE_TEXT = "無文獻範圍"
PHOTO_TEXT = "光觸發"
NO_CONDITIONS_TEXT = "notes 沒有溫度相關的敘述"

SHRINKAGE_MODEL = (
    "固化收縮率 = Σ(ΔV_i × n_i) ÷ V_total（S05）：ΔV_i 為規則表的文獻單位鍵體積變化（cm3/mol，正值＝體積減少），"
    "n_i 為第 1 層在該轉化率形成的鍵莫耳數（每 kg Solid），V_total = 1000 g ÷ ρ_mix（混合密度，P6A，理想體積加成）"
)
SHRINKAGE_NOTE = (
    "參考趨勢。正值＝體積減少。以 Solid 區計算（Liquid 區溶劑不計）；Catalyst/Initiator 與揮發／分解成分不混入密度，視為與混合物同密度。"
    "每莫耳形成的鍵視為每莫耳反應（逐步加成每次反應消耗兩側各一個鍵單位）；規則表的文獻值多為單一單體的外推，見各反應的說明。"
)
INTERPRETATION_TEXT = "詮釋：沿用環氧開環值（外推）"
INTERPRETATION_DETAIL = (
    "這條規則的體積變化事件同樣是環氧環開環，規則表沒有直接的文獻值，沿用規則 {source} 的環氧開環值；"
    "該值取自環氧乙烷（Stansbury & Ge 2003），外推到所有環氧（含縮水甘油醚），詮釋為使用者於 P7-4 任務卡指定，待使用者審。"
)

# 體積變化事件同樣是「環氧環開環」的規則（環氧被酚羥基或胺基開環）。環氧＋酸酐（先酸酐開環成單酯酸再開環環氧）與環氧＋氰酸酯
# （三嗪、異氰脲酸酯、噁唑烷酮多條路徑）的體積變化事件不只環氧開環，不列入；兩者第 1 層本來就是「尚未支援」。
EPOXY_RING_OPENING_RULES = frozenset(
    {
        "epoxy+phenol",
        "epoxy+amine.primary.aliphatic",
        "epoxy+amine.primary.aromatic",
        "epoxy+amine.secondary.aliphatic",
        "epoxy+amine.secondary.aromatic",
    }
)
EPOXY_RING_OPENING_SOURCE_RULE = "epoxy+pag.cationic"

_UNIT_PATTERN = re.compile(r"^\s*(?:cm3|cm³|mL)\s*/\s*mol")
SUMMARY_MAX_CHARS = 700


# ---------- 7.2 溫度範圍 ----------


def summarize_conditions(notes: str | None) -> str:
    """notes 的摘要（只用於有溫度範圍的規則）：取 notes 內「適用條件：」起的句子（P7-2 記錄範圍時的寫法）；沒有這種句子時改取同時提到「溫度」與「°C」的句子。
    不含體積變化的敘述與已被取代的「留空」說明；原文逐字摘出、不改寫；都沒有時回傳固定說明。完整 notes 另附。"""
    if not notes:
        return NO_CONDITIONS_TEXT
    sentences = [s.strip() for s in notes.split("。") if s.strip()]
    clean = [s for s in sentences if "體積" not in s and "bond_volume_change" not in s]
    picked = [s[s.index("適用條件：") :] for s in clean if "適用條件：" in s]
    if not picked:
        picked = [s for s in clean if "溫度" in s and "°C" in s and "留空" not in s]
    if not picked:
        return NO_CONDITIONS_TEXT
    text = "。".join(picked) + "。"
    return text if len(text) <= SUMMARY_MAX_CHARS else text[:SUMMARY_MAX_CHARS] + "…"


def _is_photo_triggered(rule: Mapping[str, Any]) -> bool:
    """光觸發：催化劑欄以「光」開頭（光酸、光自由基起始劑）。「自由基起始劑（光起始劑或熱起始劑）」光熱皆可，不算光觸發。"""
    return str(rule.get("catalyst_required") or "").startswith("光")


def _range_text(lo: float | None, hi: float | None) -> str:
    def f(v: float) -> str:
        return f"{v:g}"

    if lo is not None and hi is not None:
        return f"{f(lo)} °C" if lo == hi else f"{f(lo)}–{f(hi)} °C"
    if lo is not None:
        return f"{f(lo)} °C 以上（規則表只有下限）"
    if hi is not None:
        return f"{f(hi)} °C 以下（規則表只有上限）"
    return NO_RANGE_TEXT


def compute_temperature_ranges(pairs: Sequence[Mapping[str, Any]], rules: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """第 0 層命中的每條反應規則（依首次出現順序、同一規則只列一次）的文獻溫度範圍。"""
    by_id = {r["id"]: r for r in rules}
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for p in pairs:
        rid = p["ruleId"]
        if rid in seen:
            continue
        seen.add(rid)
        rule = by_id.get(rid)
        if rule is None:
            rows.append({"ruleId": rid, "label": p.get("reactionLabel", rid), "status": "none", "text": NO_RANGE_TEXT, "tempMinC": None, "tempMaxC": None,
                         "conditions": "規則表找不到這條規則", "source": "", "sourceDetail": "", "reviewStatus": "", "catalyst": "", "notes": ""})
            continue
        lo, hi = rule["temp_min_c"], rule["temp_max_c"]
        has_range = lo is not None or hi is not None
        photo = _is_photo_triggered(rule)
        if has_range:
            status, text = "range", _range_text(lo, hi)
            if photo:
                text = f"{PHOTO_TEXT}；{text}"
        elif photo:
            status, text = "photo", PHOTO_TEXT
        else:
            status, text = "none", NO_RANGE_TEXT
        rows.append(
            {
                "ruleId": rid,
                "label": p.get("reactionLabel", rid),
                "status": status,
                "text": text,
                "tempMinC": lo,
                "tempMaxC": hi,
                "conditions": summarize_conditions(rule.get("notes")) if has_range else "",
                "source": rule.get("source_detail") or rule.get("source") or "",
                "sourceDetail": rule.get("source_detail") or "",
                "reviewStatus": rule.get("review_status") or "",
                "catalyst": rule.get("catalyst_required") or "",
                "notes": rule.get("notes") or "",
            }
        )
    return {"rows": rows, "note": TEMP_NOTE}


# ---------- 7.6 固化收縮 ----------


def parse_volume_unit(unit_text: str | None) -> tuple[int | None, str | None]:
    """`bond_volume_change_unit` → (符號, 缺值原因)。單位只認 cm3/mol 與 mL/mol（兩者相同，換算係數 1）；
    符號：「正值＝體積減少」→ +1（P7-2 約定，結果以「正值＝體積減少」輸出）、「正值＝體積增加」→ −1。單位或符號約定讀不出來就不用，不猜。"""
    t = (unit_text or "").strip()
    if t == "":
        return None, "規則表有數值但沒有單位，不換算"
    if not _UNIT_PATTERN.match(t):
        return None, f"單位「{t}」不是 cm3/mol 或 mL/mol，不換算"
    if "正值＝體積減少" in t:
        return 1, None
    if "正值＝體積增加" in t:
        return -1, None
    return None, f"單位「{t}」沒有說明正負號約定，不換算"


def _is_copolymer(c: Mapping[str, Any]) -> bool:
    polymer = c.get("polymer")
    units = polymer.get("units") if isinstance(polymer, Mapping) else None
    return isinstance(units, list) and len(units) > 1


def _direct_value(rule: Mapping[str, Any]) -> tuple[float | None, str | None]:
    """規則表自己的數值 → (cm3/mol、正值＝體積減少, 原因)；沒有數值時回 (None, None)。"""
    raw = rule.get("bond_volume_change")
    if raw is None:
        return None, None
    sign, why = parse_volume_unit(rule.get("bond_volume_change_unit"))
    if sign is None:
        return None, why
    return sign * raw, None


def reaction_volume_change(rule_id: str, rules_by_id: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    """一條反應的單位鍵體積變化：直接文獻值（direct）、環氧開環沿用（interpreted）或沒有值（missing）。"""
    rule = rules_by_id.get(rule_id)
    base: dict[str, Any] = {"ruleId": rule_id, "deltaV": None, "unit": None, "source": None, "reason": None, "note": None, "interpretation": None, "borrowedFrom": None}
    if rule is None:
        return {**base, "kind": "missing", "reason": "規則表找不到這條規則"}
    value, why = _direct_value(rule)
    if value is not None:
        return {**base, "kind": "direct", "deltaV": value, "unit": rule.get("bond_volume_change_unit"), "source": rule.get("source_detail") or rule.get("source")}
    if why is not None:
        return {**base, "kind": "missing", "reason": why}
    if rule_id in EPOXY_RING_OPENING_RULES:
        src = rules_by_id.get(EPOXY_RING_OPENING_SOURCE_RULE)
        sv, swhy = _direct_value(src) if src is not None else (None, "規則表找不到環氧開環的規則")
        if sv is not None and src is not None:
            return {
                **base,
                "kind": "interpreted",
                "deltaV": sv,
                "unit": src.get("bond_volume_change_unit"),
                "source": src.get("source_detail") or src.get("source"),
                "interpretation": INTERPRETATION_TEXT,
                "note": INTERPRETATION_DETAIL.format(source=EPOXY_RING_OPENING_SOURCE_RULE),
                "borrowedFrom": EPOXY_RING_OPENING_SOURCE_RULE,
            }
        return {**base, "kind": "missing", "reason": f"規則表沒有 bond_volume_change，環氧開環值也取不到（{swhy or '規則 ' + EPOXY_RING_OPENING_SOURCE_RULE + ' 沒有數值'}）"}
    return {**base, "kind": "missing", "reason": "規則表沒有 bond_volume_change（無文獻值），不補值"}


def formulation_density(solid: Sequence[Mapping[str, Any]], wt_pct: Mapping[str, float | None]) -> dict[str, Any]:
    """配方混合密度（g/cm3）：既有的理想體積加成（`compute_mixture_density`）。混合的成分與既有混合相同（排除 Catalyst/Initiator 與揮發／分解），
    質量分率在混合成分內正規化。成分可帶 `density`（g/cm3，引擎層的選用輸入；介面不送）；否則由 smiles 以莫耳體積表算（只有聚合物重複單元）；缺密度整項 missing。"""
    mixed = [c for c in solid if c["category"] != CATALYST_CATEGORY and c.get("volatileFlag") is not True and (wt_pct.get(c["id"]) or 0) > 0]
    if len(mixed) == 0:
        return {"status": "missing", "reason": "沒有可混合的 Solid 成分（Catalyst/Initiator 與揮發／分解成分不混入密度）"}
    total = 0.0
    for c in mixed:
        total = total + float(wt_pct[c["id"]])  # type: ignore[arg-type]
    items: list[dict[str, Any]] = []
    for c in mixed:
        item: dict[str, Any] = {"name": c["name"], "w": float(wt_pct[c["id"]]) / total}  # type: ignore[arg-type]
        if c.get("density") is not None:
            item["density"] = c["density"]
        elif not _is_copolymer(c):
            item["smiles"] = c["canonicalSmiles"]
        items.append(item)
    try:
        r = compute_mixture_density(items)
    except ValueError as e:
        return {"status": "missing", "reason": f"混合密度無法計算：{e}"}
    if r["status"] != "predicted":
        by_name = {c["name"]: c for c in mixed}
        parts = []
        for m in r["missing"]:
            comp = by_name.get(m["name"], {})
            reason = "共聚物以第一種單元代表會失真，不計算密度" if _is_copolymer(comp) and comp.get("density") is None else m["reason"]
            parts.append(f"{m['name']}（{reason}）")
        return {"status": "missing", "reason": "成分缺密度：" + "、".join(parts) + "；不猜值，整項不計算"}
    return {"status": "predicted", "density": r["density"], "model": r["model"], "note": r["note"]}


def compute_shrinkage(
    prep: Mapping[str, Any],
    solid: Sequence[Mapping[str, Any]],
    wt_pct: Mapping[str, float | None],
    conversions: Sequence[float],
    rules: Sequence[Mapping[str, Any]],
    pairs: Sequence[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    """固化收縮表（指定轉化率）。`prep` 為 `prepare_layer1` 的成功結果（單一反應規則）；`pairs` 為第 0 層配對（取反應名稱）。"""
    by_id = {r["id"]: r for r in rules}
    labels = {p["ruleId"]: p.get("reactionLabel") for p in pairs}
    reactions = [reaction_volume_change(prep["ruleId"], by_id)]
    for r in reactions:
        r["name"] = labels.get(r["ruleId"]) or r["ruleId"]
    out: dict[str, Any] = {"model": SHRINKAGE_MODEL, "note": SHRINKAGE_NOTE, "reactions": reactions, "excluded": []}
    usable = [r for r in reactions if r["kind"] != "missing"]
    excluded = [r for r in reactions if r["kind"] == "missing"]
    out["excluded"] = [{"ruleId": r["ruleId"], "name": r["name"], "reason": r["reason"]} for r in excluded]
    if len(usable) == 0:
        return {**out, "status": "missing", "reason": "所有命中的反應都沒有單位鍵體積變化：" + "；".join(f"{r['ruleId']}（{r['reason']}）" for r in excluded)}

    dens = formulation_density(solid, wt_pct)
    if dens["status"] != "predicted":
        return {**out, "status": "missing", "reason": dens["reason"]}
    rho = dens["density"]
    out["density"] = {"gPerCm3": rho, "model": dens["model"], "note": dens["note"]}

    table: list[dict[str, Any]] = []
    for x in conversions:
        r1 = compute_layer1(prep["setup"], x)
        if r1 is None:
            return {**out, "status": "missing", "reason": "官能基總量或固體總質量不是正數，沒有第 1 層的鍵莫耳數"}
        bonds = r1["bondsFormedMolPerKg"]  # mol / kg Solid
        by_reaction = []
        direct_pct = 0.0
        interpreted_pct = 0.0
        for r in usable:
            # ΔV[cm3/mol] × n[mol/kg] ÷ (1000 g ÷ ρ[g/cm3] = V[cm3/kg]) × 100 %
            pct = r["deltaV"] * bonds / (1000.0 / rho) * 100.0
            by_reaction.append({"ruleId": r["ruleId"], "kind": r["kind"], "pct": pct, "bondsMolPerKg": bonds})
            if r["kind"] == "direct":
                direct_pct = direct_pct + pct
            else:
                interpreted_pct = interpreted_pct + pct
        table.append({"conversion": x, "totalPct": direct_pct + interpreted_pct, "directPct": direct_pct, "interpretedPct": interpreted_pct, "byReaction": by_reaction})
    return {**out, "status": "predicted", "table": table}
