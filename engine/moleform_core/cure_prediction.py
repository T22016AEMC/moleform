"""交聯第 2 層（固化預測）：Tg∞、固化後 Tg、完全固化最低溫度、指定溫度下最大轉化率、Tg∞ 高於 Td 警示。任務 P7-3（PLAN 7.4、7.5、7.7；D62：直接寫在 Python，沒有 TypeScript 版）。

方法來源（全部取自本機文獻，不憑記憶）：
- 交聯對 Tg（7.4）：van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 6.2.4.4 節（書頁 148–149，PDF 第 175–176 頁，已對原文）。
  式 (6.13)：Tg,crl = Tg,0 + K_crl / M_crl；本節給兩個 K_crl：3.9×10⁴（Nielsen 1969，經驗式）與 5.2×10⁴（書以 Bicerano 2002 的苯乙烯–二乙烯苯資料畫 Fig. 6.5 擬合）。
  書印的單位是「K mol g⁻¹」，但式 (6.13) 的量綱（ΔTg 為 K、M_crl 為 g/mol）要求 K_crl 的單位是 K·g/mol；本模組只取書印的數字、M_crl 以 g/mol 代入，不改數字。
  式 (6.14)（DiBenedetto 未發表式，由 Nielsen 引用）：Tg,crl = Tg,0 + 1.2·Tg,0·x_crl/(1 − x_crl)，x_crl ＝ 交聯數／主鏈原子數（4 官能交聯點計為 3 官能的兩倍）。
- 固化後 Tg（7.5）：Pascault & Williams, J. Polym. Sci. B 28 (1990) 85–95（本機 PDF，已看原圖），式 (4)（期刊頁 89）：
  (Tg − Tg0)/(Tg∞ − Tg0) = λ·x / (1 − (1 − λ)·x)，x 為官能基轉化率，λ 為 0 到 1 的可調參數；式 (11)（期刊頁 91）：若 ΔCp·Tg 近似為常數，λ = ΔCp∞/ΔCp0 = Tg0/Tg∞（S02：標示為近似）。
  原式由 DiBenedetto（J. Polym. Sci. B 25 (1987) 1949）的對應態理論經 Nielsen 引用而來，本機也有該論文，但式 (4) 的形式取自 Pascault & Williams。
- 完全固化最低溫度：T ≥ Tg∞ 才可能 100% 轉化（由式 (4) 與玻璃化推論，不是文獻原句）；指定硬化溫度 T 的最大轉化率：解 Tg(x) = T（玻璃化限制），
  令 r = (T − Tg0)/(Tg∞ − Tg0)，x_max = r / (λ + (1 − λ)·r)；T ≥ Tg∞ 時為 1，T ≤ Tg0 時為 0。
- Td 警示（7.7，S04）：Tg∞（上限）高於配方 Solid 區成分中最低的 Td,1/2 時警示（`td.compute_td`，式 21.4）。

輸入沿用 I05 之後的做法（交聯頁走引擎）：呼叫端傳第 0 層結果、Solid 區成分與質量百分比；第 1 層不支援的體系回報同一個原因，不硬算。
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

from .layer1 import compute_layer1, prepare_layer1
from .td import compute_td
from .tg_mixing import CATALYST_CATEGORY, UNIFIED_NOTE, compute_formulation_tg

# ---------- 常數（出處見檔頭） ----------

K_CRL_NIELSEN = 3.9e4  # K·g/mol 的數字部分，書頁 149（Nielsen 1969）
K_CRL_BOOK_FIT = 5.2e4  # 書頁 149，Fig. 6.5（苯乙烯–二乙烯苯，Bicerano 2002 資料）
K_CRL_SOURCES = {
    "low": "K_crl = 3.9×10⁴（Nielsen 1969 的經驗值，引自 van Krevelen & te Nijenhuis 2009 書頁 149，式 6.13）",
    "high": "K_crl = 5.2×10⁴（van Krevelen & te Nijenhuis 2009 書頁 149、Fig. 6.5：以 Bicerano 2002 的苯乙烯–二乙烯苯資料擬合，式 6.13）",
}
DEFAULT_CONVERSIONS = (0.5, 0.8, 0.9, 1.0)
FULL_CONVERSION = 1.0

TG_INF_MODEL = "交聯對 Tg：Tg,crl = Tg,0 + K_crl / M_crl（van Krevelen 式 6.13，書頁 149）"
EQ614_MODEL = "交聯對 Tg：Tg,crl = Tg,0 + 1.2·Tg,0·x_crl/(1 − x_crl)（DiBenedetto 式，van Krevelen 式 6.14，書頁 149）"
POST_CURE_MODEL = "固化後 Tg：(Tg − Tg0)/(Tg∞ − Tg0) = λx/(1 − (1 − λ)x)（Pascault & Williams 1990 式 4）；λ ≈ Tg0/Tg∞（同文式 11，S02，近似）"
TD_MODEL_NOTE = "Td,1/2：1000·ΣYd,1/2,i ÷ M（van Krevelen 式 21.4，書頁 767）"

NOTE_TG_INF = "參考趨勢；K_crl 依體系而異；環氧體系高交聯度時 ΔTg 趨近定值（書頁 149：環氧以二胺或酸酐硬化的資料，ΔTg 約 80 K）。以下範圍是兩個書中 K 值各算一次，不是誤差範圍，也不選其中一個。"
NOTE_K_UNIT = "書印 K_crl 單位為「K mol g⁻¹」，但式 (6.13) 的量綱要求 K·g/mol；這裡只取書印的數字，M_crl 以 g/mol 代入。"
NOTE_MCRL = (
    "M_crl 取本專案的 Mc（限量官能基 100% 反應時，Miller–Macosko 式 51 的質量基準 Mc = 1 ÷ 每克固體的有效網目鏈莫耳數；固體含不參與反應與過量的成分）。"
    "書的 x_crl 是「交聯數／主鏈原子數」，4 官能交聯點計為 3 官能的兩倍（書頁 148），書沒有給與 M_crl 的換算式；"
    "本專案的有效網目鏈對每個 m 官能交聯點計 (m−2)/2 條，兩種計數的比例關係未驗證，因此不換算、直接代入。"
)
NOTE_LAMBDA = "λ = Tg0/Tg∞ 為近似（Pascault & Williams 式 11 假設 ΔCp·Tg 為常數；原文建議 λ 當作可調參數，本程式不接受實驗值、不調整）。"
NOTE_FULL_CURE = "完全固化最低溫度：T ≥ Tg∞ 才可能 100% 轉化（由玻璃化限制推論，非文獻原句）。"
NOTE_MAX_CONVERSION = "最大轉化率：硬化溫度 T 下 Tg(x) 到達 T 時轉化率不再上升（玻璃化限制），解式 (4) 的 Tg(x) = T；未考慮動力學、時間與後硬化。"
WARNING_TEXT = "估算 Tg∞ 高於成分 Td,1/2，完全固化前可能分解"
NOTE_TD = (
    "Td,1/2 是書定義的半分解溫度（失重達一半的特徵溫度），不是 5% 失重溫度。以配方 Solid 區中最低的成分 Td,1/2 比較：固化未完成時材料仍由未反應成分構成，"
    "最弱成分的分解溫度才是限制。Catalyst/Initiator 與標記揮發／分解的成分不比較；小分子成分的 Td,1/2 方法針對聚合物重複單元，不計算並列出。"
)
EQ614_MISSING_REASON = (
    "無法取得 x_crl：式 (6.14) 的 x_crl = 交聯數／主鏈原子數。第 1 層有交聯點資料，但引擎沒有「網路的主鏈原子數」"
    "（書也沒有說明環氧、酚環等熱固網路中哪些原子算主鏈），這裡不估。"
)


# ---------- 公式 ----------


def tg_crosslinked(tg0_k: float, k_crl: float, m_crl: float) -> float:
    """式 (6.13)：Tg,crl = Tg,0 + K_crl / M_crl（K_crl 數字取書印值、M_crl 為 g/mol）。"""
    if not (m_crl > 0):
        raise ValueError("M_crl 必須大於 0")
    return tg0_k + k_crl / m_crl


def lambda_approx(tg0_k: float, tg_inf_k: float) -> float:
    """Pascault & Williams 式 (11)：λ ≈ Tg0 / Tg∞（近似，S02）。"""
    if not (tg_inf_k > 0):
        raise ValueError("Tg∞ 必須大於 0")
    return tg0_k / tg_inf_k


def tg_at_conversion(tg0_k: float, tg_inf_k: float, x: float) -> float:
    """Pascault & Williams 式 (4)：Tg = Tg0 + (Tg∞ − Tg0)·λx / (1 − (1 − λ)x)，λ = Tg0/Tg∞（式 11）。x 為 0 到 1。"""
    if not (0 <= x <= 1):
        raise ValueError("轉化率必須在 0 到 1 之間")
    lam = lambda_approx(tg0_k, tg_inf_k)
    return tg0_k + (tg_inf_k - tg0_k) * (lam * x) / (1 - (1 - lam) * x)


def max_conversion_at(tg0_k: float, tg_inf_k: float, t_k: float) -> float:
    """玻璃化限制：解 Tg(x) = T。r = (T − Tg0)/(Tg∞ − Tg0)，x = r / (λ + (1 − λ)r)；T ≥ Tg∞ 為 1，T ≤ Tg0 為 0。"""
    if t_k >= tg_inf_k:
        return 1.0
    if t_k <= tg0_k:
        return 0.0
    lam = lambda_approx(tg0_k, tg_inf_k)
    r = (t_k - tg0_k) / (tg_inf_k - tg0_k)
    return r / (lam + (1 - lam) * r)


# ---------- 各項 ----------


def _missing(reason: str, **extra: Any) -> dict[str, Any]:
    return {"status": "missing", "reason": reason, **extra}


def compute_tg0(solid: Sequence[Mapping[str, Any]], wt_pct: Mapping[str, float | None], mn_by_id: Mapping[str, float | None]) -> dict[str, Any]:
    """Tg,0（未交聯 Tg 估計）：沿用既有的混合 Tg（Fox，`compute_formulation_tg`），不新增模型。完整才給值；缺成分 Tg 時 missing 並列出原因。"""
    mix = compute_formulation_tg(solid, wt_pct, mn_by_id)
    base = {"model": mix["model"], "messages": mix["messages"]}
    if mix["status"] == "complete":
        return {"status": "predicted", "tgK": mix["tgK"], "tgC": mix["tgC"], **base}
    if mix["status"] == "incomplete":
        reason = f"配方有成分缺 Tg：{'、'.join(mix['missing'])}（詳見訊息），未交聯 Tg 不完整"
    elif mix["status"] == "unavailable":
        reason = "沒有可混合的聚合物或寡聚物成分（小分子不計 Tg，D56）"
    else:
        reason = "配方換算失敗，沒有未交聯 Tg"
    return _missing(reason, **base)


def compute_m_crl(setup: Mapping[str, Any]) -> dict[str, Any]:
    """M_crl：限量官能基轉化率 = 1 時第 1 層的 Mc（g/mol）。未凝膠、官能基為 0 時 missing 並說明。"""
    r = compute_layer1(setup, FULL_CONVERSION)
    if r is None:
        return _missing("官能基總量或固體總質量不是正數，沒有第 1 層結果")
    if not r["gelled"] or r["mcGPerMol"] is None:
        return _missing("限量官能基 100% 反應時仍未凝膠（沒有有效網目鏈），不適用交聯對 Tg 的式 (6.13)")
    return {"status": "predicted", "value": r["mcGPerMol"], "unit": "g/mol", "layer1": {"gelConversion": r["gelConversion"], "ratioText": r["ratioText"]}}


def compute_tg_inf(tg0: Mapping[str, Any], m_crl: Mapping[str, Any]) -> dict[str, Any]:
    """Tg∞ 範圍：式 (6.13) 兩個書中 K 值各算一次（下限 K = 3.9×10⁴、上限 K = 5.2×10⁴），不選單一值。"""
    if tg0["status"] != "predicted":
        return _missing(f"Tg,0 缺值：{tg0['reason']}")
    if m_crl["status"] != "predicted":
        return _missing(f"M_crl 缺值：{m_crl['reason']}")
    low = tg_crosslinked(tg0["tgK"], K_CRL_NIELSEN, m_crl["value"])
    high = tg_crosslinked(tg0["tgK"], K_CRL_BOOK_FIT, m_crl["value"])
    return {
        "status": "predicted",
        "low": {"tgK": low, "tgC": low - 273.15, "kCrl": K_CRL_NIELSEN, "source": K_CRL_SOURCES["low"]},
        "high": {"tgK": high, "tgC": high - 273.15, "kCrl": K_CRL_BOOK_FIT, "source": K_CRL_SOURCES["high"]},
        "deltaLowK": low - tg0["tgK"],
        "deltaHighK": high - tg0["tgK"],
    }


def compute_post_cure(tg0: Mapping[str, Any], tg_inf: Mapping[str, Any], conversions: Sequence[float], cure_temp_c: float | None) -> dict[str, Any]:
    """固化後 Tg 表（指定轉化率）、完全固化最低溫度、指定硬化溫度下的最大轉化率；Tg∞ 取式 (6.13) 的下限與上限各算一次（範圍）。"""
    if tg_inf["status"] != "predicted":
        return _missing(f"Tg∞ 缺值：{tg_inf['reason']}")
    t0 = tg0["tgK"]
    ends = {"low": tg_inf["low"]["tgK"], "high": tg_inf["high"]["tgK"]}
    table = []
    for x in conversions:
        row: dict[str, Any] = {"conversion": x}
        for key, tgi in ends.items():
            tg = tg_at_conversion(t0, tgi, x)
            row[key] = {"tgK": tg, "tgC": tg - 273.15}
        table.append(row)
    out: dict[str, Any] = {
        "status": "predicted",
        "lambda": {key: lambda_approx(t0, tgi) for key, tgi in ends.items()},
        "table": table,
        "minFullCureTemp": {key: {"tgK": tgi, "tgC": tgi - 273.15} for key, tgi in ends.items()},
        "maxConversion": None,
    }
    if cure_temp_c is not None:
        t_k = cure_temp_c + 273.15
        out["maxConversion"] = {"cureTempC": cure_temp_c, "cureTempK": t_k, **{key: max_conversion_at(t0, tgi, t_k) for key, tgi in ends.items()}}
    return out


def compute_td_comparison(solid: Sequence[Mapping[str, Any]], tg_inf: Mapping[str, Any]) -> dict[str, Any]:
    """7.7：Tg∞（上限）高於最低的成分 Td,1/2 時警示。成分缺 Td 不比較，列出。"""
    rows: list[dict[str, Any]] = []
    excluded: list[dict[str, str]] = []
    for c in solid:
        if c["category"] == CATALYST_CATEGORY:
            excluded.append({"name": c["name"], "reason": "Catalyst/Initiator，不比較"})
            continue
        if c.get("volatileFlag") is True:
            excluded.append({"name": c["name"], "reason": "標記為揮發或分解，不比較"})
            continue
        row: dict[str, Any] = {"name": c["name"], "status": "missing", "tdK": None, "tdC": None, "reason": None}
        rows.append(row)
        if "*" not in c["canonicalSmiles"]:
            row["status"] = "not-applicable"
            row["reason"] = "小分子：Td,1/2 方法針對聚合物重複單元，不計算"
            continue
        units = (c.get("polymer") or {}).get("units")
        if units and len(units) > 1:
            row["reason"] = "共聚物成分：不處理共聚比例，沒有 Td,1/2"
            continue
        try:
            r = compute_td(c["canonicalSmiles"])
        except ValueError as e:
            row["reason"] = str(e)
            continue
        if r["status"] == "ok":
            row.update(status="ok", tdK=r["tdK"], tdC=r["tdC"], reason=None)
        elif r["status"] == "missing":
            row["reason"] = "缺基團，算不出 Td,1/2"
        else:
            row["reason"] = r.get("message") or "結構無法計算 Td,1/2"
    ok = [r for r in rows if r["status"] == "ok"]
    lowest = min(ok, key=lambda r: r["tdK"]) if ok else None
    not_compared = [{"name": r["name"], "reason": r["reason"]} for r in rows if r["status"] != "ok"]
    out: dict[str, Any] = {
        "model": TD_MODEL_NOTE,
        "components": rows,
        "lowest": None if lowest is None else {"name": lowest["name"], "tdK": lowest["tdK"], "tdC": lowest["tdC"]},
        "notCompared": not_compared,
        "excluded": excluded,
    }
    if tg_inf["status"] != "predicted":
        out["warning"] = {"status": "cannot-judge", "text": f"無法判斷：Tg∞ 缺值（{tg_inf['reason']}）"}
    elif lowest is None:
        out["warning"] = {"status": "cannot-judge", "text": "無法判斷：沒有可比較的成分 Td,1/2"}
    elif tg_inf["high"]["tgK"] > lowest["tdK"]:
        out["warning"] = {"status": "triggered", "text": WARNING_TEXT, "tgInfHighK": tg_inf["high"]["tgK"], "lowestName": lowest["name"], "lowestTdK": lowest["tdK"]}
    else:
        out["warning"] = {"status": "clear", "text": "估算 Tg∞（上限）未高於已比較成分的最低 Td,1/2", "tgInfHighK": tg_inf["high"]["tgK"], "lowestName": lowest["name"], "lowestTdK": lowest["tdK"]}
    return out


def compute_cure_prediction(
    result: Mapping[str, Any],
    solid: Mapping[str, Any],
    wt_pct: Mapping[str, float | None] | None,
    mn_by_id: Mapping[str, float | None],
    cure_temp_c: float | None = None,
    conversions: Sequence[float] = DEFAULT_CONVERSIONS,
) -> dict[str, Any]:
    """固化預測。`result` 為第 0 層結果，`solid` 為 {unit, components:[id, name, canonicalSmiles, amount, category, polymer?, volatileFlag?, isResin?]}。
    第 1 層不支援的體系回傳 supported = False 與第 1 層同一個原因；其餘各項分別回報 predicted 或 missing（附原因）。"""
    prep = prepare_layer1(result, solid["components"], solid["unit"], wt_pct)
    if not prep["ok"]:
        return {"supported": False, "reason": prep["reason"]}
    assert wt_pct is not None  # prepare_layer1 在 wt_pct 為 None 時已回報 ok = False
    tg0 = compute_tg0(solid["components"], wt_pct, mn_by_id)
    m_crl = compute_m_crl(prep["setup"])
    tg_inf = compute_tg_inf(tg0, m_crl)
    return {
        "supported": True,
        "ruleId": prep["ruleId"],
        "tg0": tg0,
        "mCrl": m_crl,
        "tgInf": tg_inf,
        "eq614": _missing(EQ614_MISSING_REASON, model=EQ614_MODEL),
        "postCure": compute_post_cure(tg0, tg_inf, conversions, cure_temp_c),
        "td": compute_td_comparison(solid["components"], tg_inf),
        "models": {"tg0": tg0.get("model"), "tgInf": TG_INF_MODEL, "eq614": EQ614_MODEL, "postCure": POST_CURE_MODEL},
        "notes": {
            "tgInf": NOTE_TG_INF,
            "kUnit": NOTE_K_UNIT,
            "mCrl": NOTE_MCRL,
            "lambda": NOTE_LAMBDA,
            "fullCure": NOTE_FULL_CURE,
            "maxConversion": NOTE_MAX_CONVERSION,
            "td": NOTE_TD,
        },
        "disclaimer": UNIFIED_NOTE,
    }
