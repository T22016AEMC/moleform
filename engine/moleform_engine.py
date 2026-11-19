"""MoleForm Python 引擎原型（任務 039 B-6，D62）。

握手、JSON 格式示範，以及 VW（任務 M01）、Tg（任務 M02）、Vm／密度與 CTE（任務 M03）、聚合物基礎（M04）、其餘計算模組（M05）；不含微影公式。
- 只監聽 127.0.0.1，埠由作業系統隨機指定（port 0）。
- 一次性權杖由父程式（Electron 主程式）從 stdin 第一行傳入，不放在命令列或環境變數。
- stdin 關閉（父程式結束或主動關閉）時，引擎自行結束。
- 只用 Python 標準函式庫；NumPy／SciPy／RDKit 只讀取已安裝版本（importlib.metadata），未安裝回報 null。
- 不發出任何對外連線。
- 任務 M01 起新增 POST /vw（van der Waals 體積）、任務 M02 起新增 POST /tg（Tg，Yg 基團貢獻）、任務 M03 起新增 POST /vm
  （莫耳體積與密度）與 POST /cte（熱膨脹係數）；任務 M04 起新增聚合物基礎 POST /polymer/repeat-unit、/polymer/end-groups、
  /polymer/copolymer、/polymer/convert、/polymer/distribution；任務 M05 起新增其餘計算模組 POST /free-volume、/relative-tg、/joback、
  /tg/mixing、/tg/flory-fit、/dielectric、/tpsa-logp、/crosslink/analyze、/crosslink/prepare、/crosslink/layer1、/crosslink/layer1/scan；任務 P7-3 起新增 /crosslink/cure（固化預測）；
  除此之外不含任何物性公式。尚未接到介面，TypeScript 仍是預設計算來源。
- 任務 P7-5 起新增 POST /pka（pKa 估算，Hammett／Taft）與 /crosslink/site-activity（反應位點相對活性：電子效應與空間位阻兩個分開的排序）。
- 任務 P6B 起新增 POST /tm（結晶熔點）、/td（半分解溫度）、/moisture（吸濕性）、/modulus（體積模數 K、剪切模數 G、泊松比 ν、楊氏模數 E；任務 P6E 補完）。
"""

from __future__ import annotations

import hmac
import json
import math
import os
import platform
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import metadata

PROTOCOL_VERSION = 1
ENGINE_NAME = "moleform-engine"
MAX_BODY_BYTES = 64 * 1024
REPORTED_PACKAGES = ("numpy", "scipy", "rdkit")
STATUSES = ("measured", "literature", "fitted", "predicted", "assumed", "missing")


def package_versions() -> dict[str, str | None]:
    """已安裝套件的版本（與 pip 讀同一份安裝資訊）；未安裝回報 None。"""
    versions: dict[str, str | None] = {}
    for name in REPORTED_PACKAGES:
        try:
            versions[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            versions[name] = None
    return versions


def handshake_payload() -> dict:
    return {
        "engine": ENGINE_NAME,
        "protocol": PROTOCOL_VERSION,
        "python": platform.python_version(),
        "implementation": platform.python_implementation(),
        "executable": sys.executable,
        "packages": package_versions(),
        "statuses": list(STATUSES),
    }


def validate_quantity(obj: object) -> list[str]:
    """檢查「值、單位、來源、狀態」格式；只檢查格式，不做任何計算。"""
    if not isinstance(obj, dict):
        return ["quantity 必須是 JSON 物件"]
    errors: list[str] = []
    expected = {"value", "unit", "source", "status"}
    missing = sorted(expected - obj.keys())
    extra = sorted(obj.keys() - expected)
    if missing:
        errors.append(f"缺少欄位：{', '.join(missing)}")
    if extra:
        errors.append(f"不認得的欄位：{', '.join(extra)}")
    status = obj.get("status")
    if status not in STATUSES:
        errors.append(f"status 必須是 {' / '.join(STATUSES)} 之一")
    value = obj.get("value")
    if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))):
        errors.append("value 必須是數字或 null")
    if status == "missing" and value is not None:
        errors.append("status 為 missing 時 value 必須是 null")
    if status != "missing" and "value" in obj and value is None:
        errors.append("value 為 null 時 status 必須是 missing")
    for key in ("unit", "source"):
        if key in obj and not isinstance(obj[key], str):
            errors.append(f"{key} 必須是字串")
    return errors


def handle_demo_quantity(request: object) -> tuple[int, dict]:
    quantity = request.get("quantity") if isinstance(request, dict) else None
    errors = validate_quantity(quantity)
    if errors:
        return 400, {"ok": False, "errors": errors}
    # 原樣回傳（格式示範）；不做任何計算
    return 200, {"ok": True, "quantity": quantity, "note": "格式示範：引擎未計算任何數值"}


ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
MAX_SMILES_CHARS = 10000
VW_UNIT = "cm³/mol"


def handle_vw(request: object) -> tuple[int, dict]:
    """van der Waals 體積（任務 M01）。請求 {"smiles": "<小分子或含 * 的重複單元 SMILES>"}。

    回應沿用「值、單位、來源、狀態」格式（quantity），另附基團、缺基團清單、Bondi 補充標示與質量核對。
    缺基團：HTTP 200，quantity.status = "missing"、value = null，missing 列出原子位置與描述（不計算、不拋例外）。
    SMILES 無法解析、含多個分子、沒有重原子：HTTP 400。只做 VW，不含其他物性公式；尚未接到介面（TypeScript 仍是預設）。
    """
    smiles = request.get("smiles") if isinstance(request, dict) else None
    if not isinstance(smiles, str):
        return 400, {"ok": False, "errors": ["請求需要字串欄位 smiles"]}
    if len(smiles) > MAX_SMILES_CHARS:
        return 400, {"ok": False, "errors": [f"smiles 太長（上限 {MAX_SMILES_CHARS} 字元）"]}
    try:
        # 延後載入：握手不需要 RDKit。以 python -I 啟動時 sys.path 不含腳本所在目錄，所以明確加入引擎自己的目錄。
        if ENGINE_DIR not in sys.path:
            sys.path.insert(0, ENGINE_DIR)
        from moleform_core import vw
    except ImportError as e:
        return 503, {"ok": False, "errors": [f"引擎無法載入 VW 模組（RDKit 沒有安裝？）：{e}"]}
    try:
        result = vw.compute_vdw_volume(smiles)
    except (vw.VwDataError, ValueError, OSError) as e:
        return 500, {"ok": False, "errors": [f"VW 資料表或 SMARTS 錯誤：{e}"]}
    if result["status"] == "invalid":
        return 400, {"ok": False, "errors": [result["message"]]}
    if result["status"] == "missing":
        quantity = {"value": None, "unit": VW_UNIT, "source": vw.VW_MODEL, "status": "missing"}
        body = {k: result[k] for k in ("polymer", "groups", "missing", "bondiSupplement")}
        return 200, {"ok": True, "quantity": quantity, **body, "disclaimer": vw.VW_DISCLAIMER}
    quantity = {"value": result["vw"], "unit": VW_UNIT, "source": vw.VW_MODEL, "status": "predicted"}
    keys = ("polymer", "groups", "corrections", "sources", "bondiSupplement", "bondiNotes", "sumMi", "formulaMass", "massDelta", "massWithinTolerance")
    return 200, {"ok": True, "quantity": quantity, **{k: result[k] for k in keys}, "disclaimer": vw.VW_DISCLAIMER}


TG_UNIT = "K"


def handle_tg(request: object) -> tuple[int, dict]:
    """Tg（van Krevelen Yg 基團貢獻，含校準基團；任務 M02）。請求 {"smiles": "<小分子或含 * 的重複單元 SMILES>"}。

    回應沿用「值、單位、來源、狀態」格式（quantity，單位 K），另附基團、缺基團清單、是否含校準基團與質量核對。
    算得出：HTTP 200、status = "predicted"（基團增量估算，非實測）；含校準基團時 containsCalibrated = true（非書中值）。
    缺基團：HTTP 200，quantity.status = "missing"、value = null，missing 列出原子位置與描述（不計算、不拋例外）。
    SMILES 無法解析、空白、沒有可計算的基團（沒有重原子）：HTTP 400。只做 Tg，不含其他物性公式；尚未接到介面（TypeScript 仍是預設）。
    """
    smiles = request.get("smiles") if isinstance(request, dict) else None
    if not isinstance(smiles, str):
        return 400, {"ok": False, "errors": ["請求需要字串欄位 smiles"]}
    if len(smiles) > MAX_SMILES_CHARS:
        return 400, {"ok": False, "errors": [f"smiles 太長（上限 {MAX_SMILES_CHARS} 字元）"]}
    if smiles.strip() == "":
        return 400, {"ok": False, "errors": ["沒有結構（SMILES 是空的）"]}
    try:
        if ENGINE_DIR not in sys.path:
            sys.path.insert(0, ENGINE_DIR)
        from moleform_core import tg
    except ImportError as e:
        return 503, {"ok": False, "errors": [f"引擎無法載入 Tg 模組（RDKit 沒有安裝？）：{e}"]}
    try:
        result = tg.compute_tg(smiles)
    except tg.EmptyMoleculeError as e:
        return 400, {"ok": False, "errors": [str(e)]}
    except (tg.TgDataError, ValueError, OSError) as e:
        return 500, {"ok": False, "errors": [f"Tg 資料表或 SMARTS 錯誤：{e}"]}
    if result["status"] == "invalid":
        return 400, {"ok": False, "errors": [result["message"]]}
    if result["status"] == "missing":
        quantity = {"value": None, "unit": TG_UNIT, "source": tg.TG_MODEL, "status": "missing"}
        body = {k: result[k] for k in ("polymer", "containsCalibrated", "groups", "missing")}
        return 200, {"ok": True, "quantity": quantity, **body, "disclaimer": tg.TG_DISCLAIMER}
    if not math.isfinite(result["tgK"]):
        return 400, {"ok": False, "errors": ["沒有可計算的基團（沒有重原子）"]}
    quantity = {"value": result["tgK"], "unit": TG_UNIT, "source": tg.TG_MODEL, "status": "predicted"}
    keys = ("polymer", "tgC", "sumYg", "sumM", "containsCalibrated", "formulaMass", "massDelta", "massWithinTolerance", "groups", "sources")
    return 200, {"ok": True, "quantity": quantity, **{k: result[k] for k in keys}, "disclaimer": tg.TG_DISCLAIMER}


TM_UNIT = "K"
TD_UNIT = "K"


def _load_core(*names: str):
    """載入 moleform_core 的模組；RDKit 沒有安裝時回傳 503 錯誤回應。"""
    import importlib

    if ENGINE_DIR not in sys.path:
        sys.path.insert(0, ENGINE_DIR)
    try:
        return tuple(importlib.import_module(f"moleform_core.{n}") for n in names), None
    except ImportError as e:
        return None, (503, {"ok": False, "errors": [f"引擎無法載入計算模組（RDKit 沒有安裝？）：{e}"]})


def _missing_body(result: dict) -> dict:
    return {k: result[k] for k in ("polymer", "groups", "missing") if k in result}


def handle_tm(request: object) -> tuple[int, dict]:
    """聚合物重複單元的結晶熔點 Tm（van Krevelen Ym 基團貢獻，任務 P6B）。請求 {"smiles": "<含 * 的重複單元 SMILES>", "crystallizable": true／false／省略}。

    Tm = 1000·ΣYmi ÷ M（式 6.20、6.21）；主鏈 –CH2– 依 Table 6.10 位置值，Table 6.9 系列的長側鏈依式 6.22–6.24。
    crystallizable 為 false：HTTP 200，quantity.status = "missing"、value = null、notApplicable = true（不適用，不是數值）；
    省略：照算並加警告「Tm 只在聚合物可結晶時有意義」。
    缺基團：HTTP 200，quantity.status = "missing"，missing 列出缺的基團（原子位置與描述）。SMILES 無法解析或空白：HTTP 400。
    """
    smiles, error = _read_smiles(request)
    if error is not None:
        return error
    assert smiles is not None
    crystallizable = request.get("crystallizable") if isinstance(request, dict) else None
    if crystallizable is not None and not isinstance(crystallizable, bool):
        return 400, {"ok": False, "errors": ["crystallizable 必須是 true、false 或省略"]}
    loaded, err = _load_core("tm", "mol_graph", "y_tables")
    if err is not None:
        return err
    assert loaded is not None
    tm, mol_graph, y_tables = loaded
    absent = {"value": None, "unit": TM_UNIT, "source": tm.TM_MODEL, "status": "missing"}
    try:
        if crystallizable is False:
            if mol_graph.mol_from_smiles(smiles) is None:
                return 400, {"ok": False, "errors": ["RDKit 無法解析這個 SMILES"]}
            return 200, {
                "ok": True, "quantity": absent, "notApplicable": True,
                "message": "不適用：聚合物不可結晶（crystallizable = false），沒有結晶熔點 Tm", "disclaimer": tm.TM_DISCLAIMER,
            }  # fmt: skip
        result = tm.compute_tm(smiles)
    except (y_tables.YTableError, ValueError, OSError) as e:
        return 500, {"ok": False, "errors": [f"Tm 資料表或 SMARTS 錯誤：{e}"]}
    if result["status"] == "invalid":
        return 400, {"ok": False, "errors": [result["message"]]}
    if result["status"] == "missing":
        return 200, {"ok": True, "quantity": absent, **_missing_body(result), "disclaimer": tm.TM_DISCLAIMER}
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["沒有可計算的基團（沒有重原子）"]}
    warnings: list[str] = []
    if crystallizable is None:
        warnings.append("Tm 只在聚合物可結晶時有意義（未指定 crystallizable）")
    if not result["polymer"]:
        warnings.append("輸入沒有連接點 *：Tm 的方法針對聚合物重複單元；小分子的熔點請用 /joback（D56）")
    if result["containsTentative"]:
        warnings.append("含書中括號值（暫定，不確定）的基團")
    quantity = {"value": result["tmK"], "unit": TM_UNIT, "source": tm.TM_MODEL, "status": "predicted"}
    keys = ("polymer", "tmC", "sumYm", "sumM", "containsTentative", "groups", "sources", "sideChain", "formulaMass")
    body = {k: result[k] for k in keys if k in result}
    return 200, {"ok": True, "quantity": quantity, **body, "warnings": warnings, "notes": tm.TM_NOTES, "disclaimer": tm.TM_DISCLAIMER}


def handle_td(request: object) -> tuple[int, dict]:
    """聚合物重複單元的半分解溫度 Td,1/2（van Krevelen Yd,1/2 基團貢獻，任務 P6B）。請求 {"smiles": "<含 * 的重複單元 SMILES>"}。

    Td,1/2 = 1000·ΣYd,1/2,i ÷ M（式 21.4）；輸出 K 與 °C（tdC）。這是書定義的半分解溫度，不是 5% 失重溫度（Td5），備註寫在 notes。
    缺基團：HTTP 200，quantity.status = "missing"，missing 列出缺的基團。SMILES 無法解析或空白：HTTP 400。
    """
    smiles, error = _read_smiles(request)
    if error is not None:
        return error
    assert smiles is not None
    loaded, err = _load_core("td", "y_tables")
    if err is not None:
        return err
    assert loaded is not None
    td, y_tables = loaded
    try:
        result = td.compute_td(smiles)
    except (y_tables.YTableError, ValueError, OSError) as e:
        return 500, {"ok": False, "errors": [f"Td 資料表或 SMARTS 錯誤：{e}"]}
    if result["status"] == "invalid":
        return 400, {"ok": False, "errors": [result["message"]]}
    if result["status"] == "missing":
        quantity = {"value": None, "unit": TD_UNIT, "source": td.TD_MODEL, "status": "missing"}
        return 200, {"ok": True, "quantity": quantity, **_missing_body(result), "disclaimer": td.TD_DISCLAIMER}
    warnings: list[str] = []
    if not result["polymer"]:
        warnings.append("輸入沒有連接點 *：Td,1/2 的方法針對聚合物重複單元")
    if result["containsTentative"]:
        warnings.append("含書中括號值（暫定，不確定）的基團")
    quantity = {"value": result["tdK"], "unit": TD_UNIT, "source": td.TD_MODEL, "status": "predicted"}
    keys = ("polymer", "tdC", "sumYd", "unitMass", "containsTentative", "groups", "sources")
    return 200, {"ok": True, "quantity": quantity, **{k: result[k] for k in keys}, "warnings": warnings, "notes": td.TD_NOTES, "disclaimer": td.TD_DISCLAIMER}


def handle_moisture(request: object) -> tuple[int, dict]:
    """聚合物重複單元的吸濕量（van Krevelen Table 18.14，任務 P6B）。請求 {"smiles", "rh": 0.3／0.5／0.7／0.9／1.0, "crystallinity": 0～1（可省略）}。

    g 水／100 g 聚合物（25 °C、非晶區基團加成，參考趨勢）；結晶度依式 18.15 乘 (1 − x_c)。rh 不在 Table 18.14 的五個值內：HTTP 400（拒絕）。
    表中沒有的基團列在 uncovered 並加警告；書中括號值標在 groups 的 uncertain 與 warnings；書中空白的格子（–NH3⁺、–COO⁻）回報 missing。
    """
    smiles, error = _read_smiles(request)
    if error is not None:
        return error
    assert smiles is not None
    loaded, err = _load_core("moisture", "y_tables")
    if err is not None:
        return err
    assert loaded is not None
    moisture, y_tables = loaded
    req = request if isinstance(request, dict) else {}
    try:
        rh = moisture.check_rh(req.get("rh"))
        crystallinity = moisture.check_crystallinity(req.get("crystallinity"))
    except ValueError as e:
        return 400, {"ok": False, "errors": [str(e)]}
    try:
        result = moisture.compute_moisture(smiles, rh, crystallinity)
    except (y_tables.YTableError, ValueError, OSError) as e:
        return 500, {"ok": False, "errors": [f"吸濕性資料表或 SMARTS 錯誤：{e}"]}
    if result["status"] == "invalid":
        return 400, {"ok": False, "errors": [result["message"]]}
    warnings: list[str] = []
    if result["uncovered"]:
        warnings.append(f"有 {len(result['uncovered'])} 個原子不在 Table 18.14 涵蓋的基團內，視為無貢獻（見 uncovered）")
    if result["status"] == "missing":
        quantity = {"value": None, "unit": moisture.WATER_UNIT, "source": moisture.WATER_MODEL, "status": "missing"}
        body = {k: result[k] for k in ("polymer", "rh", "groups", "missingValues", "uncovered")}
        return 200, {"ok": True, "quantity": quantity, **body, "warnings": warnings, "notes": moisture.WATER_NOTES, "disclaimer": moisture.WATER_DISCLAIMER}
    if not result["polymer"]:
        warnings.append("輸入沒有連接點 *：吸濕量以結構單元計，請輸入聚合物重複單元")
    if result["uncertainGroups"]:
        warnings.append("書中括號值（不確定）：" + "、".join(result["uncertainGroups"]))
    quantity = {"value": result["value"], "unit": moisture.WATER_UNIT, "source": moisture.WATER_MODEL, "status": "predicted"}
    keys = ("polymer", "rh", "crystallinity", "amorphousValue", "molesWaterPerUnit", "unitMass", "groups", "uncovered", "uncertainGroups", "sources")
    return 200, {"ok": True, "quantity": quantity, **{k: result[k] for k in keys}, "warnings": warnings, "notes": moisture.WATER_NOTES, "disclaimer": moisture.WATER_DISCLAIMER}


def handle_modulus(request: object) -> tuple[int, dict]:
    """體積模數 K、剪切模數 G、泊松比 ν、楊氏模數 E（van Krevelen 13.2.4–13.2.6 節，任務 P6E）。
    請求 {"smiles": "<含 * 的重複單元 SMILES>", "density": g/cm³（可省略）, "crystallinity": 0～1（可省略）}。

    方法一（式 13.30，Rao 函數）與方法三（式 13.32，內聚能＋熔化熱；只涵蓋 Table 7.1 與 Table 5.7 基團定義可對應的基團）；方法二不做。
    G 用 Hartmann 函數（式 14.12，U_H 為書中暫定值）；ν、E 依 Table 13.2，K、G 都有才輸出。K 以 GPa 輸出：兩個以上方法時取平均，只有一個方法時標「單一方法」。
    quantity = K（缺值時 status = "missing"，原因在 moduli.bulk.reason）；moduli 含 bulk／shear／poisson／young 四個量；methods 列出各方法的值或缺的基團。
    density 省略：V 用 Vm 模組；crystallinity 省略：方法三視為 0 並加警告。SMILES 無法解析或空白、density／crystallinity 不合法：HTTP 400。
    """
    smiles, error = _read_smiles(request)
    if error is not None:
        return error
    assert smiles is not None
    loaded, err = _load_core("modulus", "moisture", "modulus_tables", "y_tables")
    if err is not None:
        return err
    assert loaded is not None
    modulus, moisture, modulus_tables, y_tables = loaded
    req = request if isinstance(request, dict) else {}
    try:
        density = modulus.check_density(req.get("density"))
        crystallinity = moisture.check_crystallinity(req.get("crystallinity"))
    except ValueError as e:
        return 400, {"ok": False, "errors": [str(e)]}
    try:
        result = modulus.compute_modulus(smiles, density, crystallinity)
    except (modulus_tables.ModulusTableError, y_tables.YTableError, ValueError, OSError) as e:
        return 500, {"ok": False, "errors": [f"彈性模數資料表或 SMARTS 錯誤：{e}"]}
    if result["status"] == "invalid":
        return 400, {"ok": False, "errors": [result["message"]]}
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["彈性模數的計算結果不是有限數值"]}
    keys = ("polymer", "unitMass", "volume", "volumeReason", "methods")
    moduli = {
        "bulk": result["bulkModulus"], "shear": result["shearModulus"], "poisson": result["poissonRatio"], "young": result["youngsModulus"],
    }
    bulk = result["bulkModulus"]
    quantity = {"value": bulk["value"], "unit": modulus.MODULUS_UNIT, "source": modulus.MODULUS_MODEL, "status": bulk["status"]}
    return 200, {
        "ok": True, "quantity": quantity, "moduli": moduli, **{k: result[k] for k in keys}, "warnings": result["warnings"],
        "notes": modulus.MODULUS_NOTES, "disclaimer": modulus.MODULUS_DISCLAIMER,
    }  # fmt: skip


VM_UNIT = "cm³/mol"
DENSITY_UNIT = "g/cm³"
CTE_UNIT = "K⁻¹"


def _json_safe(value: object) -> bool:
    """結果裡所有數字都是有限的（JSON 不能表示 NaN／Infinity）。"""
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, dict):
        return all(_json_safe(v) for v in value.values())
    if isinstance(value, (list, tuple)):
        return all(_json_safe(v) for v in value)
    return True


def _read_smiles(request: object) -> tuple[str | None, tuple[int, dict] | None]:
    """取出並檢查請求的 smiles；回傳 (smiles, None) 或 (None, 錯誤回應)。空白由這裡先擋下（與 /tg 相同）。"""
    smiles = request.get("smiles") if isinstance(request, dict) else None
    if not isinstance(smiles, str):
        return None, (400, {"ok": False, "errors": ["請求需要字串欄位 smiles"]})
    if len(smiles) > MAX_SMILES_CHARS:
        return None, (400, {"ok": False, "errors": [f"smiles 太長（上限 {MAX_SMILES_CHARS} 字元）"]})
    if smiles.strip() == "":
        return None, (400, {"ok": False, "errors": ["沒有結構（SMILES 是空的）"]})
    return smiles, None


def handle_vm(request: object) -> tuple[int, dict]:
    """聚合物重複單元 298 K 的莫耳體積與密度（任務 M03）。請求 {"smiles": "<含 * 的重複單元 SMILES>"}。

    回應沿用「值、單位、來源、狀態」格式（quantity：莫耳體積 Vm，cm³/mol；density：密度，g/cm³），另附結晶態、玻璃態／橡膠態、
    298 K 狀態判斷（依 Tg）、基團與來源。算得出：HTTP 200、status = "predicted"（基團增量估算，非實測）。
    缺基團：HTTP 200，quantity.status = "missing"、value = null，missing 列出原子位置、描述與補充說明。
    不含 * 的小分子：HTTP 200，quantity.status = "missing"、value = null、unsupported = true（本卡不做小分子液體法，Fedors 1974 另開任務）。
    SMILES 無法解析、空白、含多個分子、沒有重原子：HTTP 400。只做 Vm／密度；尚未接到介面（TypeScript 仍是預設）。
    """
    smiles, error = _read_smiles(request)
    if error is not None:
        return error
    assert smiles is not None
    try:
        if ENGINE_DIR not in sys.path:
            sys.path.insert(0, ENGINE_DIR)
        from moleform_core import vm
    except ImportError as e:
        return 503, {"ok": False, "errors": [f"引擎無法載入 Vm 模組（RDKit 沒有安裝？）：{e}"]}
    try:
        result = vm.compute_molar_volume_density(smiles)
    except (vm.MolarVolumeDataError, ValueError, OSError) as e:
        return 500, {"ok": False, "errors": [f"Vm 資料表或 SMARTS 錯誤：{e}"]}
    status = result["status"]
    if status == "invalid":
        return 400, {"ok": False, "errors": [result["message"]]}
    absent = {"value": None, "unit": VM_UNIT, "source": vm.MOLAR_VOLUME_MODEL, "status": "missing"}
    if status == "unsupported":
        return 200, {"ok": True, "quantity": absent, "unsupported": True, "message": result["message"], "disclaimer": vm.MOLAR_VOLUME_DISCLAIMER}
    if status == "missing":
        body = {k: result[k] for k in ("polymer", "groups", "missing")}
        return 200, {"ok": True, "quantity": absent, **body, "disclaimer": vm.MOLAR_VOLUME_DISCLAIMER}
    amorphous = result["amorphous"]
    if amorphous is None or not _json_safe(result):
        return 400, {"ok": False, "errors": ["沒有可計算的莫耳體積或密度（單元質量無法計算）"]}
    quantity = {"value": amorphous["vm"], "unit": VM_UNIT, "source": vm.MOLAR_VOLUME_MODEL, "status": "predicted"}
    density = {"value": amorphous["density"], "unit": DENSITY_UNIT, "source": vm.MOLAR_VOLUME_MODEL, "status": "predicted"}
    keys = ("polymer", "unitMass", "amorphous", "crystalline", "glassy", "rubbery", "state", "groups", "usesTentative", "sources")
    return 200, {"ok": True, "quantity": quantity, "density": density, **{k: result[k] for k in keys}, "disclaimer": vm.MOLAR_VOLUME_DISCLAIMER}


def handle_cte(request: object) -> tuple[int, dict]:
    """聚合物重複單元的熱膨脹係數 CTE（任務 M03）。請求 {"smiles": "<含 * 的重複單元 SMILES>"}。

    CTE 沒有單一數值（書中橡膠態、玻璃態兩種，玻璃態另有兩種算法），所以 `quantities` 是一組「值、單位、來源、狀態」物件：
    rubberyAlpha／rubberyBeta／glassyAlpha／glassyBeta（式 4.8b，不需 Tg）／glassyFromTgAlpha／glassyFromTgBeta（式 4.27，需要 Tg，缺 Tg 時為 missing）。
    算得出：HTTP 200、status = "predicted"。缺 VW：HTTP 200，各 quantity 為 missing，missing 列出缺基團的原子。
    不含 * 的小分子：HTTP 200，各 quantity 為 missing、notApplicable = true（D56）。
    SMILES 無法解析、空白、含多個分子、沒有重原子：HTTP 400。只做 CTE；尚未接到介面（TypeScript 仍是預設）。
    """
    smiles, error = _read_smiles(request)
    if error is not None:
        return error
    assert smiles is not None
    try:
        if ENGINE_DIR not in sys.path:
            sys.path.insert(0, ENGINE_DIR)
        from moleform_core import cte, tg, vw
    except ImportError as e:
        return 503, {"ok": False, "errors": [f"引擎無法載入 CTE 模組（RDKit 沒有安裝？）：{e}"]}
    try:
        result = cte.compute_cte(smiles)
    except (vw.VwDataError, tg.TgDataError, ValueError, OSError) as e:
        return 500, {"ok": False, "errors": [f"CTE 所需的資料表或 SMARTS 錯誤：{e}"]}
    status = result["status"]
    if status == "invalid":
        return 400, {"ok": False, "errors": [result["message"]]}
    names = ("rubberyAlpha", "rubberyBeta", "glassyAlpha", "glassyBeta", "glassyFromTgAlpha", "glassyFromTgBeta")
    if status in ("notApplicable", "missing"):
        absent = {n: {"value": None, "unit": CTE_UNIT, "source": cte.CTE_MODEL, "status": "missing"} for n in names}
        if status == "notApplicable":
            return 200, {"ok": True, "quantities": absent, "notApplicable": True, "message": result["message"], "disclaimer": cte.CTE_DISCLAIMER}
        return 200, {"ok": True, "quantities": absent, "message": result["message"], "missing": result["missing"], "disclaimer": cte.CTE_DISCLAIMER}
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["沒有可計算的 VW（結果不是有限數字）"]}

    def q(value: float | None) -> dict:
        if value is None:
            return {"value": None, "unit": CTE_UNIT, "source": cte.CTE_MODEL, "status": "missing"}
        return {"value": value, "unit": CTE_UNIT, "source": cte.CTE_MODEL, "status": "predicted"}

    gt = result["glassyFromTg"]
    from_tg = gt["status"] == "ok"
    quantities = {
        "rubberyAlpha": q(result["rubbery"]["alpha"]),
        "rubberyBeta": q(result["rubbery"]["beta"]),
        "glassyAlpha": q(result["glassy"]["alpha"]),
        "glassyBeta": q(result["glassy"]["beta"]),
        "glassyFromTgAlpha": q(gt["alpha"] if from_tg else None),
        "glassyFromTgBeta": q(gt["beta"] if from_tg else None),
    }
    keys = ("polymer", "vw", "rubbery", "glassy", "glassyFromTg", "vwBondiSupplement", "vwBondiNotes", "sources")
    return 200, {"ok": True, "quantities": quantities, **{k: result[k] for k in keys}, "disclaimer": cte.CTE_DISCLAIMER}


MASS_UNIT = "g/mol"


def _is_number(v: object) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _load_polymer():
    """延後載入聚合物模組（任務 M04）；RDKit 沒有安裝時回傳 503 的回應。"""
    try:
        if ENGINE_DIR not in sys.path:
            sys.path.insert(0, ENGINE_DIR)
        from moleform_core import convert, copolymer, distribution, end_groups, polymer_types, repeat_unit
    except ImportError as e:
        return None, (503, {"ok": False, "errors": [f"引擎無法載入聚合物模組（RDKit 沒有安裝？）：{e}"]})
    return (convert, copolymer, distribution, end_groups, polymer_types, repeat_unit), None


def _mass(value: float, source: str) -> dict:
    return {"value": value, "unit": MASS_UNIT, "source": source, "status": "predicted"}


def _check_end_groups(value: object) -> str | None:
    """endGroups 的型別檢查（HTTP 層）；回傳錯誤訊息或 None。"""
    if value is None:
        return None
    if not isinstance(value, dict):
        return "endGroups 必須是物件"
    for key in ("end1", "end2"):
        end = value.get(key)
        if end is None:
            continue
        if not isinstance(end, dict) or not isinstance(end.get("smiles"), str):
            return f"endGroups.{key} 必須是含字串欄位 smiles 的物件"
        if len(end["smiles"]) > MAX_SMILES_CHARS:
            return f"endGroups.{key}.smiles 太長（上限 {MAX_SMILES_CHARS} 字元）"
    return None


def handle_polymer_repeat_unit(request: object) -> tuple[int, dict]:
    """重複單元分析（任務 M04）。請求 {"smiles": "<含兩個 * 的重複單元 SMILES>"}。
    200：quantity＝M_unit（g/mol，RDKit 平均分子量，不含連接點、不補氫），另附 formula、attachmentCount、attachmentOrder。
    連接點不合規則、無法解析、空白：400（errors 為 TS 的中文訊息，code 為 TS 的問題代碼）。尚未接到介面（TypeScript 仍是預設）。"""
    smiles, error = _read_smiles(request)
    if error is not None:
        return error
    assert smiles is not None
    mods, err = _load_polymer()
    if err is not None:
        return err
    repeat_unit, polymer_types = mods[5], mods[4]
    try:
        result = repeat_unit.analyze_repeat_unit(smiles)
    except repeat_unit.RdkitCallError as e:
        return 400, {"ok": False, "errors": [str(e)]}
    if not result["ok"]:
        return 400, {"ok": False, "errors": [result["problem"]["message"]], "code": result["problem"]["code"]}
    return 200, {
        "ok": True,
        "quantity": _mass(result["mUnit"], polymer_types.RDKIT_AMW_SOURCE),
        "formula": result["formula"],
        "attachmentCount": result["attachmentCount"],
        "attachmentOrder": result["attachmentOrder"],
    }


def handle_polymer_end_groups(request: object) -> tuple[int, dict]:
    """端基分析（任務 M04）。請求 {"endGroups": {"end1": {"smiles": "<含一個 * 的端基>"}, "end2": {...}}}（沒填的略過）。
    200：quantity＝M_ends（已填端基的質量合計，g/mol），另附 ends（各端基 M_end）、filled、note。錯誤（指出端基 1 或 2）：400。"""
    if not isinstance(request, dict):
        return 400, {"ok": False, "errors": ["請求需要 JSON 物件"]}
    problem = _check_end_groups(request.get("endGroups"))
    if problem is not None:
        return 400, {"ok": False, "errors": [problem]}
    mods, err = _load_polymer()
    if err is not None:
        return err
    end_groups, polymer_types = mods[3], mods[4]
    result = end_groups.analyze_end_groups({"endGroups": request.get("endGroups")})
    if not result["ok"]:
        return 400, {"ok": False, "errors": [result["message"]]}
    return 200, {
        "ok": True,
        "quantity": _mass(result["mEnds"], polymer_types.RDKIT_AMW_SOURCE),
        "ends": result["ends"],
        "filled": result["filled"],
        "note": end_groups.end_group_note(result["filled"]),
    }


def handle_polymer_copolymer(request: object) -> tuple[int, dict]:
    """Random 共聚物的平均重複單元（任務 M04）。請求 {"smiles": "<成分自己的重複單元 SMILES>", "units": [{"smiles", "fraction"}]?,
    "fractionBasis": "mol"|"wt"?, "endGroups": {...}?}。沒有 units ＝均聚物。
    200：quantity＝平均單元質量 M̄_unit（g/mol），另附 formula（第一種單元）、units（各單元莫耳分率）、mEnds、endsFilled；
    單元結構、比例或端基有問題：400（TS 的中文訊息與問題代碼）。"""
    smiles, error = _read_smiles(request)
    if error is not None:
        return error
    assert smiles is not None and isinstance(request, dict)
    units = request.get("units")
    if units is not None:
        if not isinstance(units, list) or not all(isinstance(u, dict) and isinstance(u.get("smiles"), str) for u in units):
            return 400, {"ok": False, "errors": ["units 必須是由 {smiles, fraction} 組成的陣列"]}
        if any(len(u["smiles"]) > MAX_SMILES_CHARS for u in units):
            return 400, {"ok": False, "errors": [f"units 的 smiles 太長（上限 {MAX_SMILES_CHARS} 字元）"]}
    basis = request.get("fractionBasis")
    if basis is not None and basis not in ("mol", "wt"):
        return 400, {"ok": False, "errors": ["fractionBasis 必須是 mol 或 wt"]}
    problem = _check_end_groups(request.get("endGroups"))
    if problem is not None:
        return 400, {"ok": False, "errors": [problem]}
    mods, err = _load_polymer()
    if err is not None:
        return err
    copolymer, polymer_types, repeat_unit = mods[1], mods[4], mods[5]
    spec = {k: request[k] for k in ("units", "fractionBasis", "endGroups") if request.get(k) is not None}
    try:
        result = copolymer.analyze_polymer_units(smiles, spec)
    except repeat_unit.RdkitCallError as e:
        return 400, {"ok": False, "errors": [str(e)]}
    if not result["ok"]:
        return 400, {"ok": False, "errors": [result["problem"]["message"]], "code": result["problem"]["code"]}
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    body = {k: result[k] for k in ("formula", "units", "mEnds", "endsFilled", "attachmentCount", "attachmentOrder")}
    if units is not None and len(units) > 1:
        body["note"] = polymer_types.COPOLYMER_NOTE
    return 200, {"ok": True, "quantity": _mass(result["mUnit"], polymer_types.RDKIT_AMW_SOURCE), **body}


def handle_polymer_convert(request: object) -> tuple[int, dict]:
    """Mw／Mn／DP 與 PDI 的換算（任務 M04）。請求 {"polymer": {"mwInput"|"mnInput"|"dpInput": 數字（擇一）, "pdiInput": 數字?},
    "mUnit": 平均重複單元質量, "ends": {"mEnds": 數字, "filled": [布林, 布林]}?}。
    200：quantities＝mw、mn（g/mol）、dp、dpW（重複單元數）、pdi（無單位），另附 basis、pdiIsDefault、legacy、note。輸入無效（TS 的 error 訊息）：400。"""
    if not isinstance(request, dict) or not isinstance(request.get("polymer"), dict):
        return 400, {"ok": False, "errors": ["請求需要物件欄位 polymer"]}
    polymer = request["polymer"]
    for key in ("mwInput", "mnInput", "dpInput", "pdiInput"):
        if key in polymer and polymer[key] is not None and not _is_number(polymer[key]):
            return 400, {"ok": False, "errors": [f"polymer.{key} 必須是有限數字"]}
    if not _is_number(request.get("mUnit")):
        return 400, {"ok": False, "errors": ["請求需要數字欄位 mUnit"]}
    ends = request.get("ends")
    if ends is not None:
        filled = ends.get("filled") if isinstance(ends, dict) else None
        valid = isinstance(ends, dict) and _is_number(ends.get("mEnds")) and isinstance(filled, list) and len(filled) == 2 and all(isinstance(f, bool) for f in filled)
        if not valid:
            return 400, {"ok": False, "errors": ["ends 必須是 {mEnds: 數字, filled: [布林, 布林]}"]}
    mods, err = _load_polymer()
    if err is not None:
        return err
    convert = mods[0]
    spec = {k: polymer[k] for k in ("mwInput", "mnInput", "dpInput", "pdiInput") if polymer.get(k) is not None}
    result = convert.resolve_polymer(spec, request["mUnit"], ends)
    if not result["ok"]:
        return 400, {"ok": False, "errors": [result["error"]]}
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    source = "Mn = Mw ÷ PDI；DP_n = (Mn − M_ends) ÷ M̄_unit；DP_w = (Mw − M_ends) ÷ M̄_unit（D47、D50）"

    def q(value: float, unit: str) -> dict:
        return {"value": value, "unit": unit, "source": source, "status": "predicted"}

    quantities = {
        "mw": q(result["mw"], MASS_UNIT),
        "mn": q(result["mn"], MASS_UNIT),
        "dp": q(result["dp"], "重複單元數"),
        "dpW": q(result["dpW"], "重複單元數"),
        "pdi": q(result["pdi"], ""),
    }
    return 200, {"ok": True, "quantities": quantities, **{k: result[k] for k in ("basis", "pdiIsDefault", "legacy", "note")}}


def handle_polymer_distribution(request: object) -> tuple[int, dict]:
    """分子量分布的兩成分等重量近似（任務 M04；本專案推導，非論文原式）。請求 {"mw": 數字, "mn": 數字, "mEnds": 數字?}（mEnds 預設 0，須小於 Mn）。
    200：species＝各虛擬成分 {mass（quantity，g/mol）, weightFraction}，另附 lowMw（是否使用低分子量修正）。輸入無效或找不到解：400。"""
    if not isinstance(request, dict):
        return 400, {"ok": False, "errors": ["請求需要 JSON 物件"]}
    mw, mn = request.get("mw"), request.get("mn")
    m_ends = request.get("mEnds", 0)
    if not (_is_number(mw) and mw > 0 and _is_number(mn) and mn > 0):
        return 400, {"ok": False, "errors": ["mw 與 mn 必須是大於 0 的有限數字"]}
    if not (_is_number(m_ends) and 0 <= m_ends < mn):
        return 400, {"ok": False, "errors": ["mEnds 必須是大於或等於 0 且小於 Mn 的有限數字"]}
    mods, err = _load_polymer()
    if err is not None:
        return err
    distribution = mods[2]
    try:
        result = distribution.two_component_species(mw, mn, m_ends)
    except distribution.LowMwNoSolutionError as e:
        return 400, {"ok": False, "errors": [str(e)]}
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    source = "兩成分等重量近似：M₁,₂ = Mw ∓ √(Mw² − Mn·Mw)；含端基的低分子量修正（D47、D51；本專案推導，非論文原式）"
    species = [{"mass": {"value": s["m"], "unit": MASS_UNIT, "source": source, "status": "predicted"}, "weightFraction": s["weightFraction"]} for s in result["species"]]
    return 200, {"ok": True, "species": species, "lowMw": result["lowMw"]}


# ---------- 任務 M05：其餘計算模組 ----------

FV_UNIT = "cm³/mol"
TEMPERATURE_UNIT = "K"
AREA_UNIT = "Å²"
POLARIZABILITY_VOLUME_UNIT = "Å³"
POLARIZABILITY_SI_UNIT = "J⁻¹ C² m²"
MAX_LIST_ITEMS = 200


def _import_core(*names: str):
    """延後載入 moleform_core 的模組（RDKit 沒有安裝時回傳 503 的回應）。"""
    try:
        import importlib

        if ENGINE_DIR not in sys.path:
            sys.path.insert(0, ENGINE_DIR)
        return [importlib.import_module(f"moleform_core.{n}") for n in names], None
    except ImportError as e:
        return None, (503, {"ok": False, "errors": [f"引擎無法載入計算模組（RDKit 沒有安裝？）：{e}"]})


def _q(value: float | None, unit: str, source: str, status: str = "predicted") -> dict:
    """「值、單位、來源、狀態」物件；沒有值時為 missing（value = null）。"""
    if value is None:
        return {"value": None, "unit": unit, "source": source, "status": "missing"}
    return {"value": value, "unit": unit, "source": source, "status": status}


def _check_spec(request: dict) -> str | None:
    """共聚物組成（units／fractionBasis／endGroups）的型別檢查（HTTP 層）。"""
    units = request.get("units")
    if units is not None:
        if not isinstance(units, list) or not all(isinstance(u, dict) and isinstance(u.get("smiles"), str) for u in units):
            return "units 必須是由 {smiles, fraction} 組成的陣列"
        if any(len(u["smiles"]) > MAX_SMILES_CHARS for u in units):
            return f"units 的 smiles 太長（上限 {MAX_SMILES_CHARS} 字元）"
    basis = request.get("fractionBasis")
    if basis is not None and basis not in ("mol", "wt"):
        return "fractionBasis 必須是 mol 或 wt"
    return _check_end_groups(request.get("endGroups"))


def _computation_error(e: Exception) -> tuple[int, dict]:
    """計算過程拋出的例外：輸入格式或數值不合法（TS 的 `throw new Error`）→ 400；資料表錯誤 → 500。"""
    from_tables = type(e).__name__ == "TableDataError" or isinstance(e, OSError)
    if from_tables:
        return 500, {"ok": False, "errors": [f"資料表或 SMARTS 錯誤：{e}"]}
    return 400, {"ok": False, "errors": [str(e) if isinstance(e, ValueError) else f"輸入格式不正確（{type(e).__name__}：{e}）"]}


def handle_free_volume(request: object) -> tuple[int, dict]:
    """使用者定義的經驗自由體積法 Vf = Vω × 經驗係數（任務 M05）。請求 {"smiles": "<重複單元或小分子 SMILES>", "units"?, "fractionBasis"?, "endGroups"?}
    （units 兩個以上＝Random 共聚物，按莫耳分率加權；wt% 先換成莫耳分率）。**不是書中的自由體積分率**。
    200：quantity＝Vf（cm³/mol，predicted）；缺基團：quantity 為 missing，附 components 與 message。SMILES 無法解析、空白、含多個分子、組成有問題：400。"""
    smiles, error = _read_smiles(request)
    if error is not None:
        return error
    assert smiles is not None and isinstance(request, dict)
    problem = _check_spec(request)
    if problem is not None:
        return 400, {"ok": False, "errors": [problem]}
    mods, err = _import_core("free_volume")
    if err is not None:
        return err
    (fv,) = mods
    spec = {k: request[k] for k in ("units", "fractionBasis", "endGroups") if request.get(k) is not None}
    try:
        result = fv.compute_free_volume(smiles, spec if spec else None)
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if result["status"] == "invalid":
        return 400, {"ok": False, "errors": [result["message"]]}
    if result["status"] == "missing":
        return 200, {"ok": True, "quantity": _q(None, FV_UNIT, fv.FREE_VOLUME_MODEL), "components": result["components"], "message": result["message"], "disclaimer": fv.FREE_VOLUME_DISCLAIMER}
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    keys = ("polymer", "copolymer", "vomega", "effectiveCoefficient", "components", "va", "vaNote", "vfOverVa", "sources")
    return 200, {"ok": True, "quantity": _q(result["vf"], FV_UNIT, fv.FREE_VOLUME_MODEL), **{k: result[k] for k in keys}, "disclaimer": fv.FREE_VOLUME_DISCLAIMER}


def _check_composition(comp: object, name: str) -> str | None:
    if not isinstance(comp, dict) or not isinstance(comp.get("monomers"), list):
        return f"{name} 必須是含 monomers 陣列的物件"
    if len(comp["monomers"]) > MAX_LIST_ITEMS:
        return f"{name}.monomers 太多（上限 {MAX_LIST_ITEMS}）"
    for m in comp["monomers"]:
        if not isinstance(m, dict):
            return f"{name}.monomers 的每一項必須是物件"
        for key in ("name", "smiles"):
            if m.get(key) is not None and not isinstance(m[key], str):
                return f"{name}.monomers 的 {key} 必須是字串"
        if isinstance(m.get("smiles"), str) and len(m["smiles"]) > MAX_SMILES_CHARS:
            return f"{name}.monomers 的 smiles 太長（上限 {MAX_SMILES_CHARS} 字元）"
        for key in ("amount", "packingK", "density", "densityTemperatureC"):
            if m.get(key) is not None and not _is_number(m[key]):
                return f"{name}.monomers 的 {key} 必須是有限數字"
    for key in ("mn", "referenceIndex"):
        if comp.get(key) is not None and not _is_number(comp[key]):
            return f"{name}.{key} 必須是有限數字"
    if comp.get("basis") is not None and comp["basis"] not in ("mol", "wt", "ratio"):
        return f"{name}.basis 必須是 mol、wt 或 ratio"
    return None


def _check_temperature(t: object, name: str) -> str | None:
    if not isinstance(t, dict) or not _is_number(t.get("value")) or t.get("unit") not in ("C", "K"):
        return f"{name} 必須是 {{value: 數字, unit: \"C\" 或 \"K\"}}"
    return None


def handle_relative_tg(request: object) -> tuple[int, dict]:
    """簡易 Tg 相對估算（任務 M05；Simha–Boyer 型，Bondi 型 FFV；參考趨勢）。請求 {"a": 組成, "b": 組成, "tgA"?: {value, unit}, "alphaOverride"?: 數字}，
    組成 ＝ {"monomers": [{name?, smiles?, amount?, packingK?, density?, densityTemperatureC?, homopolymerTg?}], "basis"?: "mol"|"wt"|"ratio", "referenceIndex"?, "mn"?}。
    200：quantity＝Tg_B（K）；B 是 k／Tg 表內的材料時直接用表內 Tg（literature）；缺 VW、缺莫耳體積、缺錨點時 quantity 為 missing（附原因）。
    輸入無效、基準不符、Vm 溫度不同：400（code 為 TS 的拒絕代碼）。"""
    if not isinstance(request, dict):
        return 400, {"ok": False, "errors": ["請求需要 JSON 物件"]}
    for side in ("a", "b"):
        problem = _check_composition(request.get(side), side)
        if problem is not None:
            return 400, {"ok": False, "errors": [problem]}
    if request.get("tgA") is not None:
        problem = _check_temperature(request["tgA"], "tgA")
        if problem is not None:
            return 400, {"ok": False, "errors": [problem]}
    if request.get("alphaOverride") is not None and not _is_number(request["alphaOverride"]):
        return 400, {"ok": False, "errors": ["alphaOverride 必須是有限數字"]}
    mods, err = _import_core("relative_tg")
    if err is not None:
        return err
    (rt,) = mods
    inp = {k: request[k] for k in ("a", "b", "tgA", "alphaOverride") if request.get(k) is not None}
    try:
        result = rt.relative_tg(inp)
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if result["status"] == "rejected":
        return 400, {"ok": False, "errors": [result["message"]], "code": result["code"]}
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    tg_b = result["tgB"]
    if tg_b["status"] == "ok":
        quantity = _q(tg_b["tgK"], TEMPERATURE_UNIT, rt.RELATIVE_TG_MODEL)
    elif tg_b["status"] == "table":
        quantity = _q(tg_b["tgK"], TEMPERATURE_UNIT, "使用者提供的 k／Tg 表（各材料的初始 Tg）", "literature")
    else:
        quantity = _q(None, TEMPERATURE_UNIT, rt.RELATIVE_TG_MODEL)
    keys = ("a", "b", "deltaF", "tgA", "tgB", "mnRatio", "fox", "missing", "warnings", "notes", "disclaimer", "confidence", "unifiedNote")
    return 200, {"ok": True, "quantity": quantity, "calculationStatus": result["status"], **{k: result[k] for k in keys}}


def handle_joback(request: object) -> tuple[int, dict]:
    """Joback 法的沸點 Tb 與熔點 Tf（任務 M05；小分子，基團加成估算）。請求 {"smiles": "<小分子 SMILES>"}。
    200：quantities＝tb、tf（K，predicted）；缺基團或含表 III 沒有 Tfi 的基團時對應的 quantity 為 missing；含連接點（*）：notApplicable。無法解析、空白、含多個分子：400。"""
    smiles, error = _read_smiles(request)
    if error is not None:
        return error
    assert smiles is not None
    mods, err = _import_core("joback")
    if err is not None:
        return err
    (jb,) = mods
    try:
        result = jb.compute_joback(smiles)
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    status = result["status"]
    if status == "invalid":
        return 400, {"ok": False, "errors": [result["message"]]}
    absent = {"tb": _q(None, TEMPERATURE_UNIT, jb.JOBACK_MODEL), "tf": _q(None, TEMPERATURE_UNIT, jb.JOBACK_MODEL)}
    if status == "not-applicable":
        return 200, {"ok": True, "quantities": absent, "notApplicable": True, "message": result["reason"], "disclaimer": jb.JOBACK_DISCLAIMER}
    if status == "missing":
        return 200, {"ok": True, "quantities": absent, "groups": result["groups"], "missing": result["missing"], "disclaimer": jb.JOBACK_DISCLAIMER}
    quantities = {"tb": _q(result["tbK"], TEMPERATURE_UNIT, jb.JOBACK_MODEL), "tf": _q(result["tfK"], TEMPERATURE_UNIT, jb.JOBACK_MODEL)}
    keys = ("tbC", "tfC", "sumTb", "sumTf", "tfUnavailable", "groups", "sources")
    return 200, {"ok": True, "quantities": quantities, **{k: result[k] for k in keys}, "disclaimer": jb.JOBACK_DISCLAIMER}


def handle_dielectric(request: object) -> tuple[int, dict]:
    """聚合物重複單元的介電常數 ε、莫耳折射 ΣR 與分子極化率 α（任務 M05；基團加成估算）。請求 {"smiles": "<含 * 的重複單元 SMILES>"}。
    200：quantities＝epsilon（式 11.8，主要）、epsilonSecondary（式 11.7，需要 Va）、molarRefraction（cm³/mol）、alphaPrime（Å³）、alpha（SI）；
    缺基團時對應的 quantity 為 missing（ε 與 ΣR 各自切分、各自回報缺基團）。不含 * 的小分子：notApplicable。無法解析、空白、含多個分子：400。"""
    smiles, error = _read_smiles(request)
    if error is not None:
        return error
    assert smiles is not None
    mods, err = _import_core("dielectric")
    if err is not None:
        return err
    (de,) = mods
    try:
        both = de.compute_dielectric_refraction(smiles)
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    d, r = both["dielectric"], both["refraction"]
    if d["status"] == "invalid":
        return 400, {"ok": False, "errors": [d["message"]]}
    names = ("epsilon", "epsilonSecondary", "molarRefraction", "alphaPrime", "alpha")
    absent = {n: _q(None, "", de.DIELECTRIC_MODEL) for n in names}
    if d["status"] == "unsupported":
        return 200, {"ok": True, "quantities": absent, "notApplicable": True, "message": d["message"], "disclaimer": de.DIELECTRIC_DISCLAIMER}
    if not _json_safe(both):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    dm, rm = de.DIELECTRIC_MODEL, de.REFRACTION_MODEL
    quantities = {
        "epsilon": _q(d["epsPrimary"] if d["status"] == "ok" else None, "", dm),
        "epsilonSecondary": _q(d["epsSecondary"] if d["status"] == "ok" else None, "", dm),
        "molarRefraction": _q(r["sumR"] if r["status"] == "ok" else None, "cm³/mol", rm),
        "alphaPrime": _q(r["alphaPrimeA3"] if r["status"] == "ok" else None, POLARIZABILITY_VOLUME_UNIT, rm),
        "alpha": _q(r["alphaSI"] if r["status"] == "ok" else None, POLARIZABILITY_SI_UNIT, rm),
    }
    return 200, {"ok": True, "quantities": quantities, "dielectric": d, "refraction": r, "disclaimer": de.DIELECTRIC_DISCLAIMER}


def handle_tpsa_logp(request: object) -> tuple[int, dict]:
    """TPSA 與 Crippen LogP（任務 M05；RDKit 描述子，TPSA 只計 N、O）。請求 {"smiles": "<小分子或含 * 的重複單元 SMILES>"}。
    含 * 的單元：連接點換成甲基再計算，capped = true 並附備註。200：quantities＝tpsa（Å²）、logP（無單位）。無法解析、空白、含多個分子、只有連接點：400。"""
    smiles, error = _read_smiles(request)
    if error is not None:
        return error
    assert smiles is not None
    mods, err = _import_core("tpsa_logp")
    if err is not None:
        return err
    (tl,) = mods
    try:
        result = tl.compute_tpsa_logp(smiles)
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if result["status"] == "invalid":
        return 400, {"ok": False, "errors": [result["message"]]}
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    quantities = {
        "tpsa": _q(result["tpsa"], AREA_UNIT, result["models"]["tpsa"]),
        "logP": _q(result["logP"], "", result["models"]["logP"]),
    }
    return 200, {
        "ok": True,
        "quantities": quantities,
        "capped": result["capped"],
        "computedSmiles": result["computedSmiles"],
        "note": result["note"],
        "disclaimer": tl.TPSA_LOGP_DISCLAIMER,
    }


def _check_wt_map(value: object, name: str, ids: set[str]) -> str | None:
    if not isinstance(value, dict):
        return f"{name} 必須是物件（成分 id → 數字或 null）"
    for k, v in value.items():
        if k not in ids:
            return f"{name} 有不認得的成分 id：{k}"
        if v is not None and not _is_number(v):
            return f"{name}.{k} 必須是有限數字或 null"
    return None


def handle_tg_mixing(request: object) -> tuple[int, dict]:
    """成分 Tg（Fox–Flory）與配方未固化 Tg（Fox 式；參考趨勢）（任務 M05）。**不含配方換算與分子量**（formulation/compute、molecularWeight 留在 TypeScript，039a）：
    由呼叫端傳入已算好的各成分質量百分比 wtPct 與 Mn mn。請求 {"components": [{id, name, category, canonicalSmiles, polymer?, volatileFlag?}] (Solid 區),
    "wtPct": {id: 數字|null}（null＝配方換算失敗，errors 為訊息）, "mn": {id: 數字|null}, "errors"?: [字串]}。
    200：quantity＝完整配方的混合 Tg（K，predicted）；不完整時 quantity 為 missing，附部分混合值 partial。成分格式不合：400。"""
    if not isinstance(request, dict):
        return 400, {"ok": False, "errors": ["請求需要 JSON 物件"]}
    comps = request.get("components")
    if not isinstance(comps, list) or len(comps) > MAX_LIST_ITEMS:
        return 400, {"ok": False, "errors": [f"components 必須是陣列（上限 {MAX_LIST_ITEMS} 項）"]}
    for c in comps:
        if not isinstance(c, dict) or not all(isinstance(c.get(k), str) for k in ("id", "name", "category", "canonicalSmiles")):
            return 400, {"ok": False, "errors": ["components 的每一項需要字串欄位 id、name、category、canonicalSmiles"]}
        if len(c["canonicalSmiles"]) > MAX_SMILES_CHARS:
            return 400, {"ok": False, "errors": [f"canonicalSmiles 太長（上限 {MAX_SMILES_CHARS} 字元）"]}
        if c.get("polymer") is not None:
            if not isinstance(c["polymer"], dict):
                return 400, {"ok": False, "errors": ["polymer 必須是物件"]}
            problem = _check_spec(c["polymer"])
            if problem is not None:
                return 400, {"ok": False, "errors": [problem]}
    ids = {c["id"] for c in comps}
    if len(ids) != len(comps):
        return 400, {"ok": False, "errors": ["components 的 id 不可重複"]}
    wt = request.get("wtPct")
    if wt is not None:
        problem = _check_wt_map(wt, "wtPct", ids)
        if problem is not None:
            return 400, {"ok": False, "errors": [problem]}
    problem = _check_wt_map(request.get("mn", {}), "mn", ids)
    if problem is not None:
        return 400, {"ok": False, "errors": [problem]}
    errors = request.get("errors")
    if errors is not None and not (isinstance(errors, list) and all(isinstance(m, str) for m in errors)):
        return 400, {"ok": False, "errors": ["errors 必須是字串陣列"]}
    mods, err = _import_core("tg_mixing")
    if err is not None:
        return err
    (tm,) = mods
    try:
        result = tm.compute_formulation_tg(comps, wt, request.get("mn", {}), error_messages=errors)
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    quantity = _q(result["tgK"], TEMPERATURE_UNIT, result["model"])
    return 200, {"ok": True, "quantity": quantity, **{k: result[k] for k in ("status", "confidence", "tgC", "components", "notCounted", "missing", "partial", "excluded", "messages", "notes")}}


def handle_tg_flory_fit(request: object) -> tuple[int, dict]:
    """Fox–Flory 的線性回歸 Tg = Tg∞ − K/Mn（任務 M05）。請求 {"points": [{"mn": 數字, "tgK": 數字}]}（至少 2 點，Mn 與 Tg 須大於 0，Mn 不可全相同）。
    200：quantities＝tgInf（K）、k（K·g/mol），另附標準誤差、R²、殘差（status = "fitted"）。輸入無效：400。"""
    if not isinstance(request, dict) or not isinstance(request.get("points"), list):
        return 400, {"ok": False, "errors": ["請求需要陣列欄位 points"]}
    pts = request["points"]
    if len(pts) > MAX_LIST_ITEMS or not all(isinstance(p, dict) and _is_number(p.get("mn")) and _is_number(p.get("tgK")) for p in pts):
        return 400, {"ok": False, "errors": [f"points 必須是 {{mn, tgK}} 數字物件的陣列（上限 {MAX_LIST_ITEMS} 點）"]}
    mods, err = _import_core("tg_fit")
    if err is not None:
        return err
    (tf,) = mods
    try:
        fit = tf.fit_flory([{"mn": p["mn"], "tgK": p["tgK"]} for p in pts])
    except ValueError as e:
        return 400, {"ok": False, "errors": [str(e)]}
    source = "Fox–Flory：Tg = Tg∞ − K/Mn（van Krevelen 式 6.10）；普通最小二乘（x = 1/Mn）"
    quantities = {
        "tgInf": _q(fit["tgInfK"], TEMPERATURE_UNIT, source, "fitted"),
        "k": _q(fit["k"], "K·g/mol", source, "fitted"),
    }
    # 兩點時沒有自由度，標準誤差是 NaN（JSON 不能表示）：以 null 回報
    body = {k: (None if isinstance(v, float) and not math.isfinite(v) else v) for k, v in fit.items() if k not in ("tgInfK", "k")}
    return 200, {"ok": True, "quantities": quantities, **body}


def _check_crosslink_components(comps: object) -> str | None:
    if not isinstance(comps, list) or len(comps) > MAX_LIST_ITEMS:
        return f"components 必須是陣列（上限 {MAX_LIST_ITEMS} 項）"
    for c in comps:
        if not isinstance(c, dict) or not all(isinstance(c.get(k), str) for k in ("id", "name", "category", "canonicalSmiles")):
            return "components 的每一項需要字串欄位 id、name、category、canonicalSmiles"
        if len(c["canonicalSmiles"]) > MAX_SMILES_CHARS:
            return f"canonicalSmiles 太長（上限 {MAX_SMILES_CHARS} 字元）"
        if c.get("molarMass") is not None and not _is_number(c["molarMass"]):
            return "molarMass 必須是有限數字"
        if c.get("polymer") is not None:
            if not isinstance(c["polymer"], dict):
                return "polymer 必須是物件"
            problem = _check_spec(c["polymer"])
            if problem is not None:
                return problem
    return None


def handle_crosslink_analyze(request: object) -> tuple[int, dict]:
    """交聯第 0 層（任務 M05）：官能基辨識、配對、網路判定、催化劑與溫度、審核狀態（可信度「直接計算」）。
    請求 {"components": [{id, name, category, canonicalSmiles, polymer?, molarMass?}]}（molarMass＝小分子的每分子質量，由呼叫端傳入；只接 SMILES，D03）。
    200：verdict、pairs、components、markedAtoms、warnings、pendingReview 等（成分的結構問題記在 warnings，不是錯誤）。成分格式不合：400。"""
    if not isinstance(request, dict):
        return 400, {"ok": False, "errors": ["請求需要 JSON 物件"]}
    problem = _check_crosslink_components(request.get("components"))
    if problem is not None:
        return 400, {"ok": False, "errors": [problem]}
    mods, err = _import_core("crosslink")
    if err is not None:
        return err
    (cl,) = mods
    try:
        result = cl.analyze_crosslink(request["components"])
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    return 200, {"ok": True, **result}


def _check_setup(setup: object) -> str | None:
    if not isinstance(setup, dict) or not isinstance(setup.get("components"), list) or len(setup["components"]) > MAX_LIST_ITEMS:
        return f"setup 必須是含 components 陣列的物件（上限 {MAX_LIST_ITEMS} 項）"
    for key in ("nameA", "nameB"):
        if not isinstance(setup.get(key), str):
            return f"setup.{key} 必須是字串"
    if not _is_number(setup.get("totalMass")):
        return "setup.totalMass 必須是有限數字"
    for c in setup["components"]:
        if not isinstance(c, dict) or c.get("side") not in ("A", "B") or not all(_is_number(c.get(k)) for k in ("mass", "molarMass", "groupsPerMolecule")):
            return "setup.components 的每一項需要 side（A 或 B）與數字欄位 mass、molarMass、groupsPerMolecule"
        d = c.get("distribution")
        if d is not None and not (isinstance(d, dict) and all(_is_number(d.get(k)) for k in ("mw", "mn", "mUnit", "groupsPerUnit"))):
            return "distribution 需要數字欄位 mw、mn、mUnit、groupsPerUnit"
    return None


def _layer1_common(request: object, need_q: bool = True):
    if not isinstance(request, dict):
        return None, (400, {"ok": False, "errors": ["請求需要 JSON 物件"]})
    problem = _check_setup(request.get("setup"))
    if problem is not None:
        return None, (400, {"ok": False, "errors": [problem]})
    if need_q and not (_is_number(request.get("conversion")) and 0 <= request["conversion"] <= 1):
        return None, (400, {"ok": False, "errors": ["conversion（限量官能基轉化率）必須是 0 到 1 的數字"]})
    mods, err = _import_core("layer1")
    if err is not None:
        return None, err
    return mods[0], None


def handle_crosslink_layer1(request: object) -> tuple[int, dict]:
    """交聯第 1 層（任務 M05）：官能基比、過量、理論最大成鍵數、凝膠點、溶膠分率、交聯密度、Mc、殘留官能基（Miller–Macosko；理想模型）。
    請求 {"setup": {nameA, nameB, totalMass, components: [{id, name, side, isPolymer, mass, molarMass, groupsPerMolecule, isCopolymer?, distribution?}]},
    "conversion": 0–1, "stoichiometric"?: true（另算理論配比後的結果）}。200：result（與 TS 同欄位）。官能基或質量為 0：400。"""
    l1, err = _layer1_common(request)
    if err is not None:
        return err
    assert isinstance(request, dict)
    try:
        result = l1.compute_layer1(request["setup"], request["conversion"])
        stoich = None
        if request.get("stoichiometric") is True:
            adjusted = l1.stoichiometric_setup(request["setup"])
            stoich = None if adjusted is None else {"setup": adjusted, "result": l1.compute_layer1(adjusted, request["conversion"])}
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if result is None:
        return 400, {"ok": False, "errors": ["官能基總量或固體總質量不是正數，無法計算第 1 層"]}
    if not _json_safe(result) or not _json_safe(stoich):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    quantities = {
        "ratioBToA": _q(result["ratioBToA"], "", l1.LAYER1_DIRECT_MODEL_NAME),
        "gelConversion": _q(result["gelConversion"], "", l1.LAYER1_MODEL_NAME),
        "solFraction": _q(result["solFraction"], "", l1.LAYER1_MODEL_NAME),
        "effectiveChains": _q(result["effectiveChainsMolPerKg"], "mol/kg", l1.LAYER1_MODEL_NAME),
        "mc": _q(result["mcGPerMol"], MASS_UNIT, l1.LAYER1_MODEL_NAME),
    }
    return 200, {"ok": True, "quantities": quantities, "result": result, "stoichiometric": stoich}


def handle_crosslink_layer1_scan(request: object) -> tuple[int, dict]:
    """交聯第 1 層的比例掃描（任務 M05；參考趨勢）。請求 {"setup", "conversion", "option": {"property", "direction"}, "settings"?: {min, max, points}}。
    property 是 crosslinkDensity、networkMolecules、mc、gelConversion、residualA、residualB、residualTotal 之一，direction 是 max 或 min。200：points、bestIndex、currentRatio、bestSetup。"""
    l1, err = _layer1_common(request)
    if err is not None:
        return err
    assert isinstance(request, dict)
    option = request.get("option")
    if not (isinstance(option, dict) and option.get("direction") in ("max", "min") and any(o["property"] == option.get("property") for o in l1.SCAN_OPTIONS)):
        return 400, {"ok": False, "errors": ["option 需要 property（掃描物性）與 direction（max 或 min）"]}
    settings = request.get("settings")
    if settings is not None:
        if not isinstance(settings, dict):
            return 400, {"ok": False, "errors": ["settings 必須是 {min, max, points}"]}
        problem = l1.check_scan_settings(settings) if all(k in settings for k in ("min", "max", "points")) else "settings 需要 min、max、points"
        if problem is not None:
            return 400, {"ok": False, "errors": [problem]}
    try:
        scan = l1.scan_ratio(request["setup"], request["conversion"], option, settings)
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if scan is None:
        return 400, {"ok": False, "errors": ["官能基總量不是正數，無法掃描"]}
    if not _json_safe(scan):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    return 200, {"ok": True, "disclaimer": l1.SCAN_DISCLAIMER, "model": l1.SCAN_MODEL_NAME, **scan}


def handle_crosslink_prepare(request: object) -> tuple[int, dict]:
    """由第 0 層結果與配方換算結果整理第 1 層的輸入（任務 M05）。**不含配方換算**（留在 TypeScript，039a）：由呼叫端傳入 Solid 區成分與已算好的質量百分比。
    請求 {"result": <crosslink/analyze 的回應>, "solid": {"unit": "wt"|"g"|…, "components": [{id, name, canonicalSmiles, amount, isResin?}]}, "wtPct": {id: 數字|null}|null}。
    200：ok = true 時附 setup、ruleId、items、masses；第 1 層不支援的情況（多規則、缺資料…）ok = false 並附 reason（不是 HTTP 錯誤）。格式不合：400。"""
    if not isinstance(request, dict) or not isinstance(request.get("result"), dict):
        return 400, {"ok": False, "errors": ["請求需要物件欄位 result（交聯第 0 層的結果）"]}
    result = request["result"]
    if not (isinstance(result.get("pairs"), list) and isinstance(result.get("components"), list)):
        return 400, {"ok": False, "errors": ["result 需要 pairs 與 components 陣列"]}
    solid = request.get("solid")
    if not (isinstance(solid, dict) and isinstance(solid.get("unit"), str) and isinstance(solid.get("components"), list)):
        return 400, {"ok": False, "errors": ["solid 需要字串 unit 與 components 陣列"]}
    if len(solid["components"]) > MAX_LIST_ITEMS or not all(
        isinstance(c, dict) and all(isinstance(c.get(k), str) for k in ("id", "name", "canonicalSmiles")) and _is_number(c.get("amount")) for c in solid["components"]
    ):
        return 400, {"ok": False, "errors": ["solid.components 的每一項需要字串 id、name、canonicalSmiles 與數字 amount"]}
    ids = {c["id"] for c in solid["components"]}
    wt = request.get("wtPct")
    if wt is not None:
        problem = _check_wt_map(wt, "wtPct", ids)
        if problem is not None:
            return 400, {"ok": False, "errors": [problem]}
    mods, err = _import_core("layer1")
    if err is not None:
        return err
    (l1,) = mods
    try:
        prep = l1.prepare_layer1(result, solid["components"], solid["unit"], wt)
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if not _json_safe(prep):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    if not prep["ok"]:
        return 200, {"ok": False, "supported": False, "reason": prep["reason"]}
    return 200, {"ok": True, "supported": True, **{k: prep[k] for k in ("setup", "ruleId", "solidUnit", "items", "masses")}}


def handle_crosslink_cure(request: object) -> tuple[int, dict]:
    """交聯第 2 層：固化預測（任務 P7-3；PLAN 7.4、7.5、7.7）。Tg,0（未交聯 Tg 估計）、Tg∞（式 6.13，兩個書中 K 值各算一次，輸出範圍）、
    式 6.14 對照（取不到 x_crl 時回報原因）、固化後 Tg 表、完全固化最低溫度、指定硬化溫度下的最大轉化率、Tg∞ 高於成分 Td,1/2 的警示。
    任務 P7-4 起加入 temperatureRanges（7.2：第 0 層命中規則的文獻溫度範圍，只顯示規則表的值，支援與否都列）與 shrinkage（7.6：固化收縮表，缺值反應列出、環氧開環沿用標「詮釋」）。
    請求 {"result": <crosslink/analyze 的回應>, "solid": {"unit", "components": [{id, name, category, canonicalSmiles, amount, polymer?, volatileFlag?, isResin?, density?（g/cm³，選用，只供固化收縮的混合密度；介面不送）}]},
    "wtPct": {id: 數字|null}|null, "mn": {id: 數字|null}, "cureTempC"?: 硬化溫度（°C）, "conversions"?: [0–1]（預設 0.5、0.8、0.9、1.0）}。
    200：第 1 層不支援的體系 supported = false 並附同一個原因（不是 HTTP 錯誤）；支援時各項分別為 predicted 或 missing（附原因）。格式不合：400。"""
    if not isinstance(request, dict) or not isinstance(request.get("result"), dict):
        return 400, {"ok": False, "errors": ["請求需要物件欄位 result（交聯第 0 層的結果）"]}
    result = request["result"]
    if not (isinstance(result.get("pairs"), list) and isinstance(result.get("components"), list)):
        return 400, {"ok": False, "errors": ["result 需要 pairs 與 components 陣列"]}
    solid = request.get("solid")
    if not (isinstance(solid, dict) and isinstance(solid.get("unit"), str) and isinstance(solid.get("components"), list) and len(solid["components"]) <= MAX_LIST_ITEMS):
        return 400, {"ok": False, "errors": [f"solid 需要字串 unit 與 components 陣列（上限 {MAX_LIST_ITEMS} 項）"]}
    for c in solid["components"]:
        if not (isinstance(c, dict) and all(isinstance(c.get(k), str) for k in ("id", "name", "category", "canonicalSmiles")) and _is_number(c.get("amount"))):
            return 400, {"ok": False, "errors": ["solid.components 的每一項需要字串 id、name、category、canonicalSmiles 與數字 amount"]}
        if len(c["canonicalSmiles"]) > MAX_SMILES_CHARS:
            return 400, {"ok": False, "errors": [f"canonicalSmiles 太長（上限 {MAX_SMILES_CHARS} 字元）"]}
        if c.get("polymer") is not None:
            if not isinstance(c["polymer"], dict):
                return 400, {"ok": False, "errors": ["polymer 必須是物件"]}
            problem = _check_spec(c["polymer"])
            if problem is not None:
                return 400, {"ok": False, "errors": [problem]}
        if c.get("density") is not None and not (_is_number(c["density"]) and c["density"] > 0):
            return 400, {"ok": False, "errors": ["density（g/cm³，選用）必須是大於 0 的有限數字"]}
        if c.get("userDensity") is not None and not (_is_number(c["userDensity"]) and c["userDensity"] > 0):
            return 400, {"ok": False, "errors": ["userDensity（使用者輸入的密度，g/cm³，選用）必須是大於 0 的有限數字"]}
        if c.get("userDensitySource") is not None and not (isinstance(c["userDensitySource"], str) and len(c["userDensitySource"]) <= 500):
            return 400, {"ok": False, "errors": ["userDensitySource（密度來源）必須是不超過 500 字的文字"]}
    ids = {c["id"] for c in solid["components"]}
    if len(ids) != len(solid["components"]):
        return 400, {"ok": False, "errors": ["solid.components 的 id 不可重複"]}
    wt = request.get("wtPct")
    if wt is not None:
        problem = _check_wt_map(wt, "wtPct", ids)
        if problem is not None:
            return 400, {"ok": False, "errors": [problem]}
    mn = request.get("mn", {})
    problem = _check_wt_map(mn, "mn", ids)
    if problem is not None:
        return 400, {"ok": False, "errors": [problem]}
    temp = request.get("cureTempC")
    if temp is not None and not (_is_number(temp) and -273.15 < temp <= 2000):
        return 400, {"ok": False, "errors": ["cureTempC（硬化溫度，°C）必須是高於 −273.15 的有限數字"]}
    conversions = request.get("conversions")
    if conversions is not None and not (isinstance(conversions, list) and 0 < len(conversions) <= 20 and all(_is_number(x) and 0 <= x <= 1 for x in conversions)):
        return 400, {"ok": False, "errors": ["conversions 必須是由 0 到 1 的數字組成的陣列（最多 20 個）"]}
    mods, err = _import_core("cure_prediction")
    if err is not None:
        return err
    (cp,) = mods
    try:
        out = cp.compute_cure_prediction(result, solid, wt, mn, temp, tuple(conversions) if conversions is not None else cp.DEFAULT_CONVERSIONS)
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if not _json_safe(out):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    if not out["supported"]:
        return 200, {"ok": True, "supported": False, "reason": out["reason"], "temperatureRanges": out["temperatureRanges"]}
    tg0, m_crl, tg_inf = out["tg0"], out["mCrl"], out["tgInf"]
    quantities = {
        "tg0": _q(tg0.get("tgK"), TEMPERATURE_UNIT, out["models"]["tg0"]),
        "mCrl": _q(m_crl.get("value"), MASS_UNIT, cp.TG_INF_MODEL),
        "tgInfLow": _q(tg_inf["low"]["tgK"] if tg_inf["status"] == "predicted" else None, TEMPERATURE_UNIT, cp.K_CRL_SOURCES["low"]),
        "tgInfHigh": _q(tg_inf["high"]["tgK"] if tg_inf["status"] == "predicted" else None, TEMPERATURE_UNIT, cp.K_CRL_SOURCES["high"]),
    }
    return 200, {"ok": True, "supported": True, "quantities": quantities, **out}


def _mixing_envelope(result: dict, model: str, note: str, quantities: dict) -> tuple[int, dict]:
    """混合端點共用的回應：統一備註＋各端點備註；缺值時 quantities 內各值為 missing。"""
    from moleform_core.tg_mixing import UNIFIED_NOTE

    body = {k: v for k, v in result.items() if k not in ("model", "note")}
    return 200, {"ok": True, "quantities": quantities, **body, "model": model, "note": note, "disclaimer": UNIFIED_NOTE}


def handle_mixture_density(request: object) -> tuple[int, dict]:
    """混合密度（任務 P6A）：理想體積加成 1/ρ_mix = Σ(w_i/ρ_i)。請求 {"components": [{"name"?, "w": 質量分率, "density"?: g/cm³, "smiles"?: 含 * 的單元}]}。
    任一成分缺密度 → HTTP 200、status = "missing"、列出 missing，不猜值。格式不合：400。尚未接到介面。"""
    if not isinstance(request, dict) or not isinstance(request.get("components"), list):
        return 400, {"ok": False, "errors": ["請求需要陣列欄位 components"]}
    mods, err = _import_core("mixing")
    if err is not None:
        return err
    (mx,) = mods
    try:
        result = mx.compute_mixture_density(request["components"])
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    quantities = {"density": _q(result.get("density"), DENSITY_UNIT, mx.DENSITY_MODEL)}
    return _mixing_envelope(result, mx.DENSITY_MODEL, mx.DENSITY_NOTE, quantities)


def handle_mixture_dielectric(request: object) -> tuple[int, dict]:
    """混合介電常數（任務 P6A）：Wiener 上界／下界與 Lichtenecker 估計值。請求 {"basis"?: "volume"|"mass", "components": [{"name"?, "phi"|"w", "epsilon"?, "smiles"?, "density"?}]}。
    缺任一成分的 ε（mass 時含密度）→ HTTP 200、status = "missing"、列出 missing。格式不合：400。尚未接到介面。"""
    if not isinstance(request, dict) or not isinstance(request.get("components"), list):
        return 400, {"ok": False, "errors": ["請求需要陣列欄位 components"]}
    mods, err = _import_core("mixing")
    if err is not None:
        return err
    (mx,) = mods
    try:
        result = mx.compute_mixture_dielectric(request["components"], request.get("basis", "volume"))
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    quantities = {
        "wienerUpper": _q(result.get("wienerUpper"), "", mx.DIELECTRIC_MODEL),
        "wienerLower": _q(result.get("wienerLower"), "", mx.DIELECTRIC_MODEL),
        "lichtenecker": _q(result.get("lichtenecker"), "", mx.DIELECTRIC_MODEL),
    }
    return _mixing_envelope(result, mx.DIELECTRIC_MODEL, mx.DIELECTRIC_NOTE, quantities)


def handle_copolymer_scan(request: object) -> tuple[int, dict]:
    """共聚比例掃描（任務 P6A）。請求 {"unitA": "<含 * 的重複單元>", "unitB": "...", "grid"?: [單元 A 的莫耳分率 0–1]}（預設 0 到 1 每 0.1）。
    每列 {x, tg, density, epsilon, freeVolume}，每格為「值、單位、來源、狀態」；缺基團的格子 status = "missing"（附 reason），其餘照出。單元結構不合：400。尚未接到介面。"""
    if not isinstance(request, dict) or not isinstance(request.get("unitA"), str) or not isinstance(request.get("unitB"), str):
        return 400, {"ok": False, "errors": ["請求需要字串欄位 unitA、unitB"]}
    if len(request["unitA"]) > MAX_SMILES_CHARS or len(request["unitB"]) > MAX_SMILES_CHARS:
        return 400, {"ok": False, "errors": [f"smiles 太長（上限 {MAX_SMILES_CHARS} 字元）"]}
    mods, err = _import_core("mixing", "tg", "vm", "dielectric", "free_volume")
    if err is not None:
        return err
    mx, tg, vm, de, fv = mods
    try:
        result = mx.compute_copolymer_scan(request["unitA"], request["unitB"], request.get("grid"))
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    cols = {
        "tg": (TG_UNIT, mx.SCAN_MODEL),
        "density": (DENSITY_UNIT, vm.MOLAR_VOLUME_MODEL),
        "epsilon": ("", de.DIELECTRIC_MODEL),
        "freeVolume": (FV_UNIT, fv.FREE_VOLUME_MODEL),
    }
    rows = []
    for r in result["rows"]:
        row: dict = {"x": r["x"]}
        for name, (unit, source) in cols.items():
            cell = r[name]
            row[name] = {**_q(cell["value"], unit, source), "reason": cell["reason"]}
        rows.append(row)
    from moleform_core.tg_mixing import UNIFIED_NOTE

    return 200, {"ok": True, "unitA": result["unitA"], "unitB": result["unitB"], "rows": rows, "model": mx.SCAN_MODEL, "note": mx.SCAN_NOTE, "disclaimer": UNIFIED_NOTE}


def handle_pka(request: object) -> tuple[int, dict]:
    """pKa 估算（任務 P7-5；PLAN 7.3a，D38、D66）：Hammett／Taft 線性自由能法，Perrin 1981 Table A.1–A.5。請求 {"smiles": "<小分子或含 * 的重複單元 SMILES>"}。

    回應的每個可解離基團（groups）各有 quantity（值、單位、來源、狀態）、所用式子（equation）與每個 σ 的明細（sigmaDetails：取代基、位置、σ 值、出處）。
    水溶液 25 °C 值，只用於比較相對強弱（參考趨勢）。缺值（取代基不在表中、該位置書沒給值、環系不涵蓋、基團沒有式子）：該基團 quantity.status = "missing"
    並附 reason，不估、不內插；沒有任何涵蓋的可解離基團：status = "no-site"。SMILES 無法解析或空白：400。含連接點 *：以甲基代替後估算。"""
    smiles, error = _read_smiles(request)
    if error is not None:
        return error
    assert smiles is not None
    mods, err = _import_core("pka", "tables")
    if err is not None:
        return err
    pka, tables = mods
    try:
        result = pka.compute_pka(smiles)
    except (tables.TableDataError, OSError) as e:
        return 500, {"ok": False, "errors": [f"pKa 資料表或 SMARTS 錯誤：{e}"]}
    if result["status"] == "invalid":
        return 400, {"ok": False, "errors": [result["message"]]}
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    return 200, {"ok": True, **result, "disclaimer": pka.PKA_DISCLAIMER}


def handle_crosslink_site_activity(request: object) -> tuple[int, dict]:
    """反應位點相對活性排序（任務 P7-5；PLAN 7.3）。請求 {"components": [<`/crosslink/analyze` 回應 components 的項目>]}（用到 id、name、isPolymer、source、groups、units、problem）。

    每個位點兩個分開的排序，不合併：電子效應（pKa，Hammett／Taft，參考趨勢）與空間位阻（3D 構型的相對可及表面積；幾何描述量、不是文獻公式，參數固定、可重現）。
    同一成分同一官能基類別的位點只在 pKa（或 SASA）都算得出時排序；缺值的位點列出原因。聚合物成分以重複單元片段（連接點換成甲基）計算。格式不合：400。"""
    if not isinstance(request, dict):
        return 400, {"ok": False, "errors": ["請求需要 JSON 物件"]}
    comps = request.get("components")
    if not isinstance(comps, list) or len(comps) > MAX_LIST_ITEMS:
        return 400, {"ok": False, "errors": [f"components 必須是陣列（上限 {MAX_LIST_ITEMS} 項）"]}
    for c in comps:
        if not (isinstance(c, dict) and isinstance(c.get("id"), str) and isinstance(c.get("name"), str) and isinstance(c.get("source"), str)):
            return 400, {"ok": False, "errors": ["components 的每一項需要字串欄位 id、name、source"]}
        if len(c["source"]) > MAX_SMILES_CHARS:
            return 400, {"ok": False, "errors": [f"source 太長（上限 {MAX_SMILES_CHARS} 字元）"]}
        groups = c.get("groups")
        if groups is not None and not (
            isinstance(groups, list)
            and all(isinstance(g, dict) and isinstance(g.get("groupId"), str) and isinstance(g.get("sites"), list) and all(isinstance(s, list) and all(isinstance(a, int) and not isinstance(a, bool) for a in s) for s in g["sites"]) for g in groups)
        ):
            return 400, {"ok": False, "errors": ["groups 必須是 {groupId, sites: [[原子編號…]]} 的陣列"]}
        units = c.get("units")
        if units is not None and not (isinstance(units, list) and all(isinstance(u, dict) and isinstance(u.get("smiles"), str) for u in units)):
            return 400, {"ok": False, "errors": ["units 必須是含字串 smiles 的陣列"]}
    mods, err = _import_core("site_activity", "tables")
    if err is not None:
        return err
    sa, tables = mods
    try:
        result = sa.compute_site_activity(comps)
    except (tables.TableDataError, OSError) as e:
        return 500, {"ok": False, "errors": [f"pKa 資料表或 SMARTS 錯誤：{e}"]}
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    return 200, {"ok": True, **result}


def handle_hsp(request: object) -> tuple[int, dict]:
    """Hansen 溶解度參數（任務 P8-1，PLAN 8.3）。請求二擇一：
    - {"smiles": "<聚合物重複單元（含 *）或小分子 SMILES>", "volume"?: cm³/mol, "density"?: g/cm³}：Hoftyzer–Van Krevelen 基團貢獻（Table 7.10）的 δd、δp、δh 與總 δ。
      聚合物的 V 取 Vm 模組；小分子需要 volume 或 density（或在溶劑資料表內）。缺基團或缺 Fpi／Ehi：對應分量 missing 並列出缺的基團。
    - {"solventId": "<溶劑資料表的 id>"}：溶劑資料表的 HSP（Hansen 2007 Table A.1，25 °C；不是估算）。
    回傳 quantities（deltaD／deltaP／deltaH／delta，各為 value／unit／source／status）。SMILES 無法解析、格式不合：400。"""
    if not isinstance(request, dict):
        return 400, {"ok": False, "errors": ["請求必須是 JSON 物件"]}
    mods, err = _import_core("hsp")
    if err is not None:
        return err
    (hsp,) = mods
    try:
        if "solventId" in request:
            sid = request["solventId"]
            if not isinstance(sid, str):
                return 400, {"ok": False, "errors": ["solventId 必須是字串"]}
            result = hsp.solvent_hsp(sid)
            if result["status"] == "invalid":
                return 400, {"ok": False, "errors": [result["message"]]}
            return 200, {"ok": True, **result, "disclaimer": hsp.HSP_DISCLAIMER}
        smiles, error = _read_smiles(request)
        if error is not None:
            return error
        assert smiles is not None
        volume = request.get("volume")
        density = request.get("density")
        if volume is not None and not (_is_number(volume) and volume > 0):
            return 400, {"ok": False, "errors": ["volume 必須是大於 0 的數字（cm³/mol）"]}
        if density is not None and not (_is_number(density) and density > 0):
            return 400, {"ok": False, "errors": ["density 必須是大於 0 的數字（g/cm³）"]}
        result = hsp.compute_hsp(smiles, None if volume is None else float(volume), None if density is None else float(density))
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if result["status"] == "invalid":
        return 400, {"ok": False, "errors": [result["message"]]}
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    return 200, {"ok": True, **result, "disclaimer": hsp.HSP_DISCLAIMER}


def handle_solubility(request: object) -> tuple[int, dict]:
    """聚合物與（混合）溶劑的溶解性（任務 P8-1，PLAN 8.3）。請求
    {"smiles": "<聚合物重複單元>", "solvents": [{"solventId"? | "smiles"?, "amount": 質量或體積, "name"?, "userDensity"?, "userDensitySource"?}],
     "basis"?: "mass"|"volume"（預設 mass：amount 是質量，體積分率由密度算）, "temperatureK"?: 298.15, "polymerVolume"?, "polymerDensity"?}。
    回傳聚合物、溶劑（混合）HSP、Ra、R0、RED、χ、判斷；缺值（缺基團、缺密度、書 Table 7.8 沒有 R0）逐項回報 missing 與原因。格式不合：400。
    結果標示「參考趨勢，非定量保證；HSP 對聚合物分子量、結晶度、溫度未做修正」。"""
    if not isinstance(request, dict):
        return 400, {"ok": False, "errors": ["請求必須是 JSON 物件"]}
    smiles, error = _read_smiles(request)
    if error is not None:
        return error
    assert smiles is not None
    if not isinstance(request.get("solvents"), list):
        return 400, {"ok": False, "errors": ["請求需要陣列欄位 solvents"]}
    for key in ("polymerVolume", "polymerDensity"):
        v = request.get(key)
        if v is not None and not (_is_number(v) and v > 0):
            return 400, {"ok": False, "errors": [f"{key} 必須是大於 0 的數字"]}
    mods, err = _import_core("hsp")
    if err is not None:
        return err
    (hsp,) = mods
    t = request.get("temperatureK", hsp.DEFAULT_TEMPERATURE_K)
    try:
        result = hsp.compute_solubility(
            smiles, request["solvents"], request.get("basis", "mass"), t,
            request.get("polymerVolume"), request.get("polymerDensity"),
        )  # fmt: skip
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if result["status"] == "invalid":
        return 400, {"ok": False, "errors": [result["message"]]}
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    return 200, {"ok": True, **result}


def handle_liquid_volume(request: object) -> tuple[int, dict]:
    """Liquid 區 vol% 換算（任務 P8-1，PLAN 8.2）。請求 {"components": [{"id"?, "name", "amount": 質量（g）或 wt% 比例, "amountIsGram"?: bool,
    "smiles"?, "solventId"?, "userDensity"?: g/cm³, "userDensitySource"?}]}。密度：輸入優先，否則依 SMILES／solventId 取溶劑資料表。
    任一成分缺密度 → HTTP 200、status = "missing"、各成分 volPct 為 missing 並說明是誰缺。格式不合：400。"""
    if not isinstance(request, dict) or not isinstance(request.get("components"), list):
        return 400, {"ok": False, "errors": ["請求需要陣列欄位 components"]}
    mods, err = _import_core("liquid_volume")
    if err is not None:
        return err
    (lv,) = mods
    try:
        result = lv.compute_liquid_volume(request["components"])
    except Exception as e:  # noqa: BLE001
        return _computation_error(e)
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    return 200, {"ok": True, **result, "disclaimer": "本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。"}


def _p82_table_error(e: Exception) -> tuple[int, dict] | None:
    """任務 P8-2 的資料表格式錯誤 → 500（D22：不靜默略過）；其他例外交給 _computation_error。"""
    if type(e).__name__ in ("ParachorTableError", "ViscosityTableError", "SurfaceEnergyTableError", "SolventTableError", "YTableError"):
        return 500, {"ok": False, "errors": [f"資料表錯誤：{e}"]}
    return None


def handle_viscosity(request: object) -> tuple[int, dict]:
    """溶劑與聚合物溶液的黏度（任務 P8-2，PLAN 8.4、8.5）。請求（至少一項）：
    - "solvents": [{"solventId"? | "smiles"?, "andrade"?: {"points": [{"temperatureC", "viscosityMPas"} ×2]} 或 {"B": mPa·s, "energyKjMol": kJ/mol}}]，"temperatureC"?: 指定溫度。
      純溶劑黏度取溶劑資料表（單一溫度）；其他溫度需使用者給 Andrade 參數（式 16.15a），只有一個溫度的資料不外推（missing）。Eη 超出書所述 7–14 kJ/mol 標 assumed。
      多於一種溶劑：混合黏度 missing（書中無溶劑混合黏度式；待使用者指定出處）。
    - "polymer": {"smiles": "<重複單元，含 *>", "molarMass"?: g/mol, "markHouwink"?: {"K","a","source","temperatureC"?,"solvent"?}, "B"?: Stockmayer–Fixman 的 B,
      "concentrated"?: {"K","concentration","molarMass"?,"a"?,"b"?,"source"?}}：Θ 條件 KΘ 與 [η]Θ（Table 9.3、式 9.42、9.34）；Mark–Houwink、含 B 項、濃溶液只在使用者輸入 K（等）時才算。
    回傳各量為 value／unit／source／status。格式不合、SMILES 無法解析：400。"""
    if not isinstance(request, dict):
        return 400, {"ok": False, "errors": ["請求必須是 JSON 物件"]}
    mods, err = _import_core("viscosity")
    if err is not None:
        return err
    (vis,) = mods
    try:
        result = vis.compute_viscosity(request)
    except Exception as e:  # noqa: BLE001
        return _p82_table_error(e) or _computation_error(e)
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    return 200, {"ok": True, **result, "disclaimer": vis.VISCOSITY_DISCLAIMER}


def handle_surface_tension(request: object) -> tuple[int, dict]:
    """表面張力（Parachor，任務 P8-2，PLAN 8.6）。請求 {"smiles": "<小分子或重複單元（含 *）>" 或 "solventId": "<溶劑資料表 id>", "temperatureC"?, "volume"?: cm³/mol, "density"?: g/cm³}。
    Table 8.1 三組（Sugden、Mumford–Phillips、Quayle 兩端）並列，不挑一組；quantities 的 gammaMin／gammaMax 是三組範圍。
    V：聚合物取非晶莫耳體積（298 K）；溶劑取溶劑資料表 M ÷ ρ，需要有該溫度的密度，否則 missing。缺基團回報缺基團。SMILES 無法解析、格式不合：400。"""
    if not isinstance(request, dict):
        return 400, {"ok": False, "errors": ["請求必須是 JSON 物件"]}
    smiles = request.get("smiles")
    solvent_id = request.get("solventId")
    if smiles is None and solvent_id is None:
        return 400, {"ok": False, "errors": ["請求需要字串欄位 smiles 或 solventId"]}
    if smiles is not None and (not isinstance(smiles, str) or len(smiles) > MAX_SMILES_CHARS):
        return 400, {"ok": False, "errors": [f"smiles 必須是字串（上限 {MAX_SMILES_CHARS} 字元）"]}
    if solvent_id is not None and not isinstance(solvent_id, str):
        return 400, {"ok": False, "errors": ["solventId 必須是字串"]}
    for key in ("volume", "density"):
        v = request.get(key)
        if v is not None and not (_is_number(v) and v > 0):
            return 400, {"ok": False, "errors": [f"{key} 必須是大於 0 的數字"]}
    t = request.get("temperatureC")
    if t is not None and not (_is_number(t) and -273.15 < t < 1000):
        return 400, {"ok": False, "errors": ["temperatureC 必須是合理的攝氏溫度數字"]}
    mods, err = _import_core("parachor")
    if err is not None:
        return err
    (par,) = mods
    try:
        result = par.compute_surface_tension(
            smiles or "", None if t is None else float(t), request.get("volume"), request.get("density"), solvent_id,
        )  # fmt: skip
    except Exception as e:  # noqa: BLE001
        return _p82_table_error(e) or _computation_error(e)
    if result["status"] == "invalid":
        return 400, {"ok": False, "errors": [result["message"]]}
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    return 200, {"ok": True, **result, "disclaimer": par.SURFACE_DISCLAIMER}


def handle_interfacial(request: object) -> tuple[int, dict]:
    """兩物質間的界面張力 γ12（Owens–Wendt，式 8.22，任務 P8-2，PLAN 8.7）。請求 {"a": 物質, "b": 物質}，物質 = {"materialId"? | "solventId"? | "smiles"? | "name"?}，
    或 {"list": true}（列出 surface_energy.csv 的聚合物與液體）。資料只來自書 Table 8.6、8.7（pending）；沒有 γd、γp 的物質 γ12 為 missing 並說明，不補。"""
    if not isinstance(request, dict):
        return 400, {"ok": False, "errors": ["請求必須是 JSON 物件"]}
    mods, err = _import_core("interfacial")
    if err is not None:
        return err
    (itf,) = mods
    try:
        if request.get("list") is True:
            return 200, {"ok": True, **itf.list_materials()}
        if "a" not in request or "b" not in request:
            return 400, {"ok": False, "errors": ["請求需要 a 與 b 兩個物質（或 list: true）"]}
        result = itf.compute_interfacial(request["a"], request["b"])
    except Exception as e:  # noqa: BLE001
        return _p82_table_error(e) or _computation_error(e)
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    return 200, {"ok": True, **result, "disclaimer": itf.INTERFACIAL_DISCLAIMER}


def handle_wetting(request: object) -> tuple[int, dict]:
    """固體（聚合物）與液體的潤濕（任務 P8-2，PLAN 8.7）。請求 {"solid": 物質, "liquid": 物質}（物質格式同 /interfacial），或 {"list": true}。
    輸出 γ12（式 8.22）、cosθ 與 θ（式 8.23；cosθ > 1 為完全潤濕、< −1 θ 回 missing 並說明）、黏附張力（式 8.6）、鋪展係數 S = γLV + γSL − γSV（書：S 為負時完全潤濕）。
    液體不在 Table 8.6（沒有 γd、γp）：Owens–Wendt 相關量 missing，但 γLV（溶劑資料表的文獻值）照列。格式不合：400。"""
    if not isinstance(request, dict):
        return 400, {"ok": False, "errors": ["請求必須是 JSON 物件"]}
    mods, err = _import_core("interfacial")
    if err is not None:
        return err
    (itf,) = mods
    try:
        if request.get("list") is True:
            return 200, {"ok": True, **itf.list_materials()}
        if "solid" not in request or "liquid" not in request:
            return 400, {"ok": False, "errors": ["請求需要 solid 與 liquid 兩個物質（或 list: true）"]}
        result = itf.compute_wetting(request["solid"], request["liquid"])
    except Exception as e:  # noqa: BLE001
        return _p82_table_error(e) or _computation_error(e)
    if not _json_safe(result):
        return 400, {"ok": False, "errors": ["結果不是有限數字"]}
    return 200, {"ok": True, **result, "disclaimer": itf.INTERFACIAL_DISCLAIMER}


POST_ROUTES = {
    "/viscosity": handle_viscosity,
    "/surface-tension": handle_surface_tension,
    "/interfacial": handle_interfacial,
    "/wetting": handle_wetting,
    "/hsp": handle_hsp,
    "/solubility": handle_solubility,
    "/liquid-volume": handle_liquid_volume,
    "/pka": handle_pka,
    "/crosslink/site-activity": handle_crosslink_site_activity,
    "/mixture-density": handle_mixture_density,
    "/mixture-dielectric": handle_mixture_dielectric,
    "/copolymer-scan": handle_copolymer_scan,
    "/free-volume": handle_free_volume,
    "/relative-tg": handle_relative_tg,
    "/joback": handle_joback,
    "/tg/mixing": handle_tg_mixing,
    "/tg/flory-fit": handle_tg_flory_fit,
    "/dielectric": handle_dielectric,
    "/tpsa-logp": handle_tpsa_logp,
    "/crosslink/analyze": handle_crosslink_analyze,
    "/crosslink/prepare": handle_crosslink_prepare,
    "/crosslink/layer1": handle_crosslink_layer1,
    "/crosslink/layer1/scan": handle_crosslink_layer1_scan,
    "/crosslink/cure": handle_crosslink_cure,
    "/demo/quantity": handle_demo_quantity,
    "/vw": handle_vw,
    "/tg": handle_tg,
    "/tm": handle_tm,
    "/td": handle_td,
    "/moisture": handle_moisture,
    "/modulus": handle_modulus,
    "/vm": handle_vm,
    "/cte": handle_cte,
    "/polymer/repeat-unit": handle_polymer_repeat_unit,
    "/polymer/end-groups": handle_polymer_end_groups,
    "/polymer/copolymer": handle_polymer_copolymer,
    "/polymer/convert": handle_polymer_convert,
    "/polymer/distribution": handle_polymer_distribution,
}


class EngineServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, token: str):
        self.token = token
        super().__init__(("127.0.0.1", 0), EngineHandler)


class EngineHandler(BaseHTTPRequestHandler):
    server: EngineServer
    server_version = "MoleFormEngine/0"
    sys_version = ""

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - 標準函式庫的參數名稱
        return  # 不寫存取紀錄（避免把請求內容寫進 stderr）

    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        # 瀏覽器發出的請求一律拒絕（只接受 Electron 主程式）；Host 必須是本機位址（防 DNS rebinding）
        if self.headers.get("Origin") is not None:
            self._send(403, {"error": "forbidden"})
            return False
        port = self.server.server_address[1]
        if self.headers.get("Host") != f"127.0.0.1:{port}":
            self._send(403, {"error": "forbidden"})
            return False
        auth = self.headers.get("Authorization", "")
        expected = f"Bearer {self.server.token}"
        if not hmac.compare_digest(auth.encode("utf-8"), expected.encode("utf-8")):
            self._send(401, {"error": "unauthorized"})
            return False
        return True

    def do_GET(self) -> None:  # noqa: N802 - 標準函式庫的方法名稱
        if not self._authorized():
            return
        if self.path == "/handshake":
            self._send(200, handshake_payload())
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if not self._authorized():
            return
        if self.path not in POST_ROUTES:
            self._send(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length < 0 or length > MAX_BODY_BYTES:
            self._send(413, {"error": "body too large or invalid length"})
            return
        try:
            request = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send(400, {"ok": False, "errors": ["請求不是有效的 JSON"]})
            return
        code, payload = POST_ROUTES[self.path](request)
        self._send(code, payload)

    def do_PUT(self) -> None:  # noqa: N802
        self._send(405, {"error": "method not allowed"})

    do_DELETE = do_PUT
    do_PATCH = do_PUT


def main() -> int:
    token = sys.stdin.readline().strip()
    if len(token) < 32:
        print(json.dumps({"event": "error", "message": "token missing or too short"}), flush=True)
        return 2
    server = EngineServer(token)
    del token

    def watch_parent() -> None:
        # 父程式關閉 stdin（或父程式結束）→ 讀到 EOF → 關閉伺服器
        try:
            while sys.stdin.readline():
                pass
        finally:
            server.shutdown()

    threading.Thread(target=watch_parent, name="parent-watch", daemon=True).start()
    host, port = server.server_address[:2]
    print(json.dumps({"event": "listening", "host": host, "port": port}), flush=True)
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()
    print(json.dumps({"event": "stopped"}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
