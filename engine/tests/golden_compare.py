"""黃金比對共用程式（任務 M00，D62／D63）。

讀取 tests/golden/<module>.json（TypeScript 匯出，見 scripts/golden/common.ts），與 Python 輸出逐字比對。

規則：
- 字串、布林、null、陣列長度、物件鍵集合：完全相同。
- 數字：黃金檔保留 JSON 原文（JS 的最短 round-trip 表示）；Python 值以同一規則（JS Number#toString）轉成字串後比較。
  - 字串相同 → 通過。
  - 不同時，只有 Python 值是 float（浮點計算結果）才允許相對誤差 ≤ 1e-12，並記入 tolerance_cases（不靜默放寬）；
    Python 值是 int（原子索引、計數等）一律不放寬。
- Map 以 {"$map": [[k, v], ...]} 表示，要求 Python 端的 dict 順序相同；非有限數字以 {"$nonfinite": ...} 表示。
- 版本：黃金檔的 rdkitjs 與引擎握手回報的 RDKit 版本（moleform_engine.handshake_payload）不一致 → 拒絕比對。
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
from dataclasses import asdict, dataclass, field
from typing import Any

ENGINE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(ENGINE_DIR)
GOLDEN_DIR = os.path.join(REPO_ROOT, "tests", "golden")
if ENGINE_DIR not in sys.path:
    sys.path.insert(0, ENGINE_DIR)

import moleform_engine  # noqa: E402

REL_FALLBACK = 1e-12
"""浮點逐字不同時可接受的相對誤差（使用者 2026-11-13 決定）；黃金檔記錄的值必須與此相同。"""


class VersionMismatchError(RuntimeError):
    """黃金檔的 RDKit.js 版本與 Python 引擎的 RDKit 版本不同：拒絕比對。"""


class GoldenFormatError(ValueError):
    pass


@dataclass(frozen=True)
class Num:
    """黃金檔中的數字，保留 JSON 原文。"""

    raw: str

    @property
    def is_int_literal(self) -> bool:
        return re.fullmatch(r"-?[0-9]+", self.raw) is not None


@dataclass
class ToleranceCase:
    module: str
    case_id: str
    path: str
    golden: str
    python: str
    rel_err: float


@dataclass
class CompareContext:
    module: str
    case_id: str
    tolerance_cases: list[ToleranceCase] = field(default_factory=list)


# ---------- 讀檔與版本 ----------


def load_golden(module: str, golden_dir: str = GOLDEN_DIR) -> dict[str, Any]:
    path = os.path.join(golden_dir, f"{module}.json")
    with open(path, encoding="utf-8") as f:
        doc = json.load(f, parse_float=Num, parse_int=Num, parse_constant=_reject_constant)
    for key in ("module", "commit", "rdkitjs", "cases", "tolerance"):
        if key not in doc:
            raise GoldenFormatError(f"{path} 缺少欄位 {key}")
    if doc["module"] != module:
        raise GoldenFormatError(f"{path} 的 module 是 {doc['module']!r}，應為 {module!r}")
    rel = doc["tolerance"].get("relFallback")
    if not isinstance(rel, Num) or float(rel.raw) != REL_FALLBACK:
        raise GoldenFormatError(f"{path} 的 tolerance.relFallback 必須是 {REL_FALLBACK!r}（不得放寬）")
    return doc


def _reject_constant(name: str) -> Any:
    raise GoldenFormatError(f"黃金檔不應含有 JSON 常數 {name}")


def normalize_version(v: str) -> tuple[int, ...]:
    """'2026.09.1' 與 '2026.9.1' 視為相同；其他格式（含 rc、dev）不正規化，原樣比對會失敗。"""
    if not re.fullmatch(r"[0-9]+(\.[0-9]+)*", v):
        raise VersionMismatchError(f"無法辨識的版本字串：{v!r}")
    return tuple(int(p) for p in v.split("."))


def engine_rdkit_version() -> str | None:
    return moleform_engine.handshake_payload()["packages"].get("rdkit")


_ASK_ENGINE = object()


def check_version(doc: dict[str, Any], engine_version: Any = _ASK_ENGINE) -> None:
    """engine_version 省略時向引擎握手查詢；測試可直接傳入版本字串或 None（未安裝）。"""
    golden_v = doc["rdkitjs"]
    engine_v = engine_rdkit_version() if engine_version is _ASK_ENGINE else engine_version
    if engine_v is None:
        raise VersionMismatchError("引擎握手沒有回報 RDKit 版本（未安裝）：拒絕比對")
    if normalize_version(golden_v) != normalize_version(engine_v):
        raise VersionMismatchError(
            f"黃金檔 {doc['module']} 由 RDKit.js {golden_v} 產生，引擎的 RDKit 是 {engine_v}：版本不符，拒絕比對"
        )


# ---------- JS 數字字串 ----------


def js_number_str(x: int | float) -> str:
    """JS 的 Number#toString（= JSON.stringify 對有限數字的輸出）。"""
    if isinstance(x, bool):
        raise TypeError("bool 不是數字")
    if isinstance(x, int):
        if abs(x) > 2**53:
            x = float(x)  # JS 沒有任意精度整數；超過 2^53 照 double 表示
        else:
            return str(x)
    if math.isnan(x) or math.isinf(x):
        raise ValueError("非有限數字沒有 JSON 表示")
    if x == 0:
        return "0"  # JS 的 -0 也輸出 "0"
    sign = "-" if x < 0 else ""
    r = repr(abs(x))  # Python 的 repr 同為最短 round-trip 數字
    mantissa, _, exp = r.partition("e")
    int_part, _, frac_part = mantissa.partition(".")
    digits = (int_part + frac_part).lstrip("0")
    # 小數點位置：value = 0.d1d2... × 10^n
    lead_zeros = len(int_part + frac_part) - len((int_part + frac_part).lstrip("0"))
    n = len(int_part) - lead_zeros + (int(exp) if exp else 0)
    digits = digits.rstrip("0") or "0"
    k = len(digits)
    if k <= n <= 21:
        s = digits + "0" * (n - k)
    elif 0 < n <= 21:
        s = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        s = "0." + "0" * (-n) + digits
    else:
        e = n - 1
        s = digits[0] + ("." + digits[1:] if k > 1 else "") + "e" + ("+" if e >= 0 else "-") + str(abs(e))
    return sign + s


# ---------- 比對 ----------


def compare(golden: Any, actual: Any, ctx: CompareContext, path: str = "$") -> list[str]:
    """回傳差異描述清單（空清單＝通過）；放寬的浮點案例記入 ctx.tolerance_cases。"""
    if golden is None:
        return [] if actual is None else [f"{path}: 應為 null，實際為 {actual!r}"]
    if isinstance(golden, bool):
        return [] if isinstance(actual, bool) and actual == golden else [f"{path}: 應為 {golden!r}，實際為 {actual!r}"]
    if isinstance(golden, str):
        return [] if isinstance(actual, str) and actual == golden else [f"{path}: 應為 {golden!r}，實際為 {actual!r}"]
    if isinstance(golden, Num):
        return _compare_number(golden, actual, ctx, path)
    if isinstance(golden, list):
        if not isinstance(actual, (list, tuple)):
            return [f"{path}: 應為陣列，實際為 {type(actual).__name__}"]
        if len(actual) != len(golden):
            return [f"{path}: 陣列長度應為 {len(golden)}，實際為 {len(actual)}"]
        out: list[str] = []
        for i, (g, a) in enumerate(zip(golden, actual)):
            out += compare(g, a, ctx, f"{path}[{i}]")
        return out
    if isinstance(golden, dict):
        if set(golden) == {"$map"}:
            if not isinstance(actual, dict):
                return [f"{path}: 應為有序 dict（Map），實際為 {type(actual).__name__}"]
            return compare(golden["$map"], [list(kv) for kv in actual.items()], ctx, f"{path}<map>")
        if set(golden) == {"$nonfinite"}:
            want = golden["$nonfinite"]
            ok = isinstance(actual, float) and (
                (want == "NaN" and math.isnan(actual))
                or (want == "Infinity" and actual == math.inf)
                or (want == "-Infinity" and actual == -math.inf)
            )
            return [] if ok else [f"{path}: 應為 {want}，實際為 {actual!r}"]
        if not isinstance(actual, dict):
            return [f"{path}: 應為物件，實際為 {type(actual).__name__}"]
        bad_keys = [k for k in actual if not isinstance(k, str)]
        if bad_keys:
            return [f"{path}: 物件的鍵必須是字串，實際有 {bad_keys!r}"]
        missing, extra = sorted(set(golden) - set(actual)), sorted(set(actual) - set(golden))
        if missing or extra:
            return [f"{path}: 鍵不同（缺 {missing}，多 {extra}）"]
        out = []
        for k in golden:
            out += compare(golden[k], actual[k], ctx, f"{path}.{k}")
        return out
    raise GoldenFormatError(f"{path}: 黃金檔中無法辨識的值 {golden!r}")


def _compare_number(golden: Num, actual: Any, ctx: CompareContext, path: str) -> list[str]:
    if isinstance(actual, bool) or not isinstance(actual, (int, float)):
        return [f"{path}: 應為數字 {golden.raw}，實際為 {actual!r}"]
    if isinstance(actual, float) and not math.isfinite(actual):
        return [f"{path}: 應為 {golden.raw}，實際為 {actual!r}"]
    py = js_number_str(actual)
    if py == golden.raw:
        return []
    if isinstance(actual, int):
        return [f"{path}: 整數應為 {golden.raw}，實際為 {py}"]
    g = float(golden.raw)
    denom = max(abs(g), abs(actual))
    rel = abs(actual - g) / denom if denom else 0.0
    if rel <= REL_FALLBACK:
        ctx.tolerance_cases.append(ToleranceCase(ctx.module, ctx.case_id, path, golden.raw, py, rel))
        return []
    return [f"{path}: 浮點應為 {golden.raw}，實際為 {py}（相對誤差 {rel:.3e} > {REL_FALLBACK}）"]


# ---------- 給 pytest 用的輔助 ----------

TOLERANCE_LOG: list[ToleranceCase] = []
"""整個 pytest 執行期間放寬的浮點案例（conftest 在結束時寫出並列在終端摘要）。"""


def golden_cases(module: str) -> list[tuple[str, Any, Any]]:
    """(id, input, output) 清單，供 pytest 參數化。讀檔時不檢查版本（版本在測試執行時檢查並拒絕）。"""
    doc = load_golden(module)
    return [(c["id"], c["input"], c["output"]) for c in doc["cases"]]


def assert_case(module: str, case_id: str, output: Any, actual: Any) -> None:
    ctx = CompareContext(module, case_id)
    diffs = compare(output, actual, ctx)
    TOLERANCE_LOG.extend(ctx.tolerance_cases)
    if diffs:
        shown = "\n".join(diffs[:20])
        more = f"\n…另有 {len(diffs) - 20} 處" if len(diffs) > 20 else ""
        raise AssertionError(f"[{module}] {case_id} 與黃金輸出不同：\n{shown}{more}")


def plain(value: Any) -> Any:
    """把黃金檔中的 Num 轉回 Python 數字（當作計算輸入時使用）。"""
    if isinstance(value, Num):
        return int(value.raw) if value.is_int_literal else float(value.raw)
    if isinstance(value, list):
        return [plain(v) for v in value]
    if isinstance(value, dict):
        return {k: plain(v) for k, v in value.items()}
    return value


def tolerance_report() -> list[dict[str, Any]]:
    return [asdict(t) for t in TOLERANCE_LOG]
