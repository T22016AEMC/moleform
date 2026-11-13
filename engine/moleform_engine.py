"""MoleForm Python 引擎原型（任務 039 B-6，D62）。

握手、JSON 格式示範，以及 VW（任務 M01）；不含其他物性或微影公式。
- 只監聽 127.0.0.1，埠由作業系統隨機指定（port 0）。
- 一次性權杖由父程式（Electron 主程式）從 stdin 第一行傳入，不放在命令列或環境變數。
- stdin 關閉（父程式結束或主動關閉）時，引擎自行結束。
- 只用 Python 標準函式庫；NumPy／SciPy／RDKit 只讀取已安裝版本（importlib.metadata），未安裝回報 null。
- 不發出任何對外連線。
- 任務 M01 起新增 POST /vw（van der Waals 體積）；除此之外不含任何物性公式。尚未接到介面，TypeScript 仍是預設計算來源。
"""

from __future__ import annotations

import hmac
import json
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


POST_ROUTES = {"/demo/quantity": handle_demo_quantity, "/vw": handle_vw}


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
