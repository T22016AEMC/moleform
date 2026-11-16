"""JS 數值語意的小工具（任務 M04）：聚合物模組（repeat_unit、end_groups、copolymer、convert、distribution）共用。

只放「JS 與 Python 行為不同」而需要明確寫出等價做法的運算；全部逐項對應 ECMAScript 規格：

- `js_div`：JS 的 `/`，除以零不拋例外（0/0 → NaN、x/0 → ±Infinity，零的正負號照 IEEE）。
- `js_max`：`Math.max(a, b)`，任一個是 NaN 就回傳 NaN（Python 的 `max(nan, 0)` 與 `max(0, nan)` 結果不同）。
- `js_to_fixed`：`Number#toFixed`。取 n / 10^digits 與 x 最接近的整數 n，兩個一樣近時取**較大的** n（正好一半往遠離零進位）；
  Python 的 `format(x, ".3f")` 在正好一半時是銀行家捨入，不能用。以精確的十進位展開計算（`Decimal(float)` 是精確的），不經過浮點運算。
- `js_number_to_string`：`Number#toString()`（ECMAScript Number::toString，最短 round-trip 數字，指數表示的切換點 1e21 與 1e-6）。
  `${n}` 與 `String(n)` 都是這個結果；Python 的 `repr`／`str` 在 1e16 以上與 1e-5 以下的表示都不同。
- `is_js_number`：`typeof v === 'number'`（Python 的 bool 是 int 的子類別，要排除）。

本模組不用內建 `sum()`，也沒有任何浮點加總。
"""

from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal, localcontext
from typing import Any


def is_js_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def js_div(a: float, b: float) -> float:
    if b == 0:
        if a == 0 or math.isnan(a):
            return math.nan
        negative = (a < 0) != (math.copysign(1.0, b) < 0)
        return -math.inf if negative else math.inf
    return a / b


def js_max(a: float, b: float) -> float:
    """Math.max 的兩個引數版本：任一個是 NaN → NaN；+0 大於 -0（本模組不會遇到負零，仍照規格寫）。"""
    if math.isnan(a) or math.isnan(b):
        return math.nan
    if a == b:
        return b if math.copysign(1.0, a) < 0 else a
    return a if a > b else b


def js_number_to_string(x: float) -> str:
    """ECMAScript Number::toString（以 10 為底）。"""
    if isinstance(x, bool):
        raise TypeError("bool 不是數字")
    x = float(x)
    if math.isnan(x):
        return "NaN"
    if x == 0:
        return "0"  # +0 與 -0 都是 "0"
    if math.isinf(x):
        return "Infinity" if x > 0 else "-Infinity"
    sign = "-" if x < 0 else ""
    r = repr(abs(x))  # Python 的 repr 同為最短 round-trip 的十進位數字（位數與 JS 相同）
    mantissa, _, exp = r.partition("e")
    int_part, _, frac_part = mantissa.partition(".")
    all_digits = int_part + frac_part
    stripped = all_digits.lstrip("0")
    lead_zeros = len(all_digits) - len(stripped)
    # value = 0.d1d2…dk × 10^n
    n = len(int_part) - lead_zeros + (int(exp) if exp else 0)
    digits = stripped.rstrip("0") or "0"
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


def js_to_fixed(x: float, digits: int) -> str:
    """`x.toFixed(digits)`（digits 為 0–100 的整數）。|x| ≥ 1e21 時 JS 回傳 `String(x)`（指數表示）。"""
    x = float(x)
    if math.isnan(x):
        return "NaN"
    if abs(x) >= 1e21:
        return js_number_to_string(x)
    # 負數先取正再補負號（-0.0004.toFixed(3) 是 "-0.000"；-0 不算負數，結果是 "0.000"）
    negative = x < 0
    with localcontext() as ctx:
        ctx.prec = 120
        d = Decimal(abs(x)).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP)
        s = format(d, "f")
    return ("-" if negative else "") + s
