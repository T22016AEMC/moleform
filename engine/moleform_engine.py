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
  /tg/mixing、/tg/flory-fit、/dielectric、/tpsa-logp、/crosslink/analyze、/crosslink/prepare、/crosslink/layer1、/crosslink/layer1/scan；
  除此之外不含任何物性公式。尚未接到介面，TypeScript 仍是預設計算來源。
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


POST_ROUTES = {
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
    "/demo/quantity": handle_demo_quantity,
    "/vw": handle_vw,
    "/tg": handle_tg,
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
