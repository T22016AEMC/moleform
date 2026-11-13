"""引擎原型的自動檢查（任務 039 B-6）：只監聽 127.0.0.1、權杖、握手、格式驗證、stdin 關閉即結束。

執行：python -m unittest discover -s engine/tests -v
"""

from __future__ import annotations

import http.client
import json
import os
import secrets
import socket
import subprocess
import sys
import time
import unittest

ENGINE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "moleform_engine.py")


class EngineProcessTest(unittest.TestCase):
    def setUp(self) -> None:
        self.token = secrets.token_hex(32)
        self.proc = subprocess.Popen(
            [sys.executable, "-I", ENGINE],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        assert self.proc.stdin and self.proc.stdout
        self.proc.stdin.write(self.token + "\n")
        self.proc.stdin.flush()
        line = json.loads(self.proc.stdout.readline())
        self.assertEqual(line["event"], "listening")
        self.host, self.port = line["host"], line["port"]

    def tearDown(self) -> None:
        if self.proc.poll() is None:
            self.proc.kill()
        self.proc.wait(timeout=10)
        for stream in (self.proc.stdin, self.proc.stdout, self.proc.stderr):
            if stream and not stream.closed:
                stream.close()

    def request(self, method: str, path: str, body: object | None = None, headers: dict | None = None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        h = {"Authorization": f"Bearer {self.token}"}
        h.update(headers or {})
        data = None if body is None else json.dumps(body).encode("utf-8")
        if data is not None:
            h["Content-Type"] = "application/json"
        conn.request(method, path, body=data, headers=h)
        resp = conn.getresponse()
        payload = json.loads(resp.read().decode("utf-8"))
        conn.close()
        return resp.status, payload

    def test_binds_loopback_only(self) -> None:
        self.assertEqual(self.host, "127.0.0.1")
        self.assertGreater(self.port, 0)
        # 用本機其他位址（若有）連線應失敗
        try:
            others = {ai[4][0] for ai in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)}
        except socket.gaierror:
            others = set()
        for addr in others - {"127.0.0.1"}:
            with self.subTest(addr=addr), self.assertRaises(OSError):
                socket.create_connection((addr, self.port), timeout=1).close()

    def test_rejects_missing_or_wrong_token(self) -> None:
        self.assertEqual(self.request("GET", "/handshake", headers={"Authorization": ""})[0], 401)
        self.assertEqual(self.request("GET", "/handshake", headers={"Authorization": "Bearer wrong"})[0], 401)

    def test_rejects_browser_origin(self) -> None:
        self.assertEqual(self.request("GET", "/handshake", headers={"Origin": "http://example.com"})[0], 403)

    def test_handshake_reports_versions(self) -> None:
        status, body = self.request("GET", "/handshake")
        self.assertEqual(status, 200)
        self.assertEqual(body["engine"], "moleform-engine")
        self.assertEqual(body["protocol"], 1)
        self.assertEqual(body["python"].split(".")[:2], [str(sys.version_info.major), str(sys.version_info.minor)])
        self.assertEqual(set(body["packages"]), {"numpy", "scipy", "rdkit"})
        self.assertEqual(body["statuses"], ["measured", "literature", "fitted", "predicted", "assumed", "missing"])

    def test_quantity_format_roundtrip(self) -> None:
        q = {"value": 1.05, "unit": "g/cm3", "source": "格式示範（非真實數值）", "status": "assumed"}
        status, body = self.request("POST", "/demo/quantity", {"quantity": q})
        self.assertEqual(status, 200)
        self.assertEqual(body["quantity"], q)
        missing = {"value": None, "unit": "K", "source": "", "status": "missing"}
        self.assertEqual(self.request("POST", "/demo/quantity", {"quantity": missing})[0], 200)

    def test_quantity_format_errors(self) -> None:
        bad = [
            {"value": 1, "unit": "K", "source": "x", "status": "guessed"},
            {"value": 1, "unit": "K", "source": "x", "status": "missing"},
            {"value": None, "unit": "K", "source": "x", "status": "measured"},
            {"value": "1", "unit": "K", "source": "x", "status": "fitted"},
            {"value": 1, "unit": "K", "status": "fitted"},
            {"value": 1, "unit": "K", "source": "x", "status": "fitted", "extra": 1},
        ]
        for q in bad:
            with self.subTest(q=q):
                status, body = self.request("POST", "/demo/quantity", {"quantity": q})
                self.assertEqual(status, 400)
                self.assertFalse(body["ok"])

    def test_vw_ok_missing_invalid(self) -> None:
        """任務 M01：POST /vw。與 TypeScript 黃金輸出的數值相同（聚苯乙烯單元），缺基團回 missing，無效 SMILES 回 400。"""
        status, body = self.request("POST", "/vw", {"smiles": "[*:1]CC([*:2])c1ccccc1"})
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        q = body["quantity"]
        self.assertEqual(set(q), {"value", "unit", "source", "status"})
        self.assertEqual(q["status"], "predicted")
        self.assertEqual(q["unit"], "cm³/mol")
        self.assertAlmostEqual(q["value"], 62.83, places=9)  # 10.23 + 52.6（Table 4.2）
        self.assertTrue(body["polymer"])
        self.assertEqual([g["id"] for g in body["groups"]], ["V01", "V02"])
        # 缺基團（噻吩的 S 與芳香碳）：不計算，列出原子
        status, body = self.request("POST", "/vw", {"smiles": "c1ccsc1"})
        self.assertEqual(status, 200)
        self.assertEqual(body["quantity"]["status"], "missing")
        self.assertIsNone(body["quantity"]["value"])
        self.assertTrue(body["missing"])
        self.assertEqual({m["element"] for m in body["missing"]} >= {"S"}, True)
        # 無法解析、空字串、多個分子、缺欄位、型別錯誤
        for bad in ({"smiles": "xyz"}, {"smiles": ""}, {"smiles": "CC.CC"}, {}, {"smiles": 1}, {"smiles": "C" * 10001}):
            with self.subTest(bad=str(bad)[:40]):
                status, body = self.request("POST", "/vw", bad)
                self.assertEqual(status, 400)
                self.assertFalse(body["ok"])

    def test_vw_requires_token(self) -> None:
        self.assertEqual(self.request("POST", "/vw", {"smiles": "CC"}, headers={"Authorization": "Bearer wrong"})[0], 401)

    def test_exits_when_stdin_closes(self) -> None:
        assert self.proc.stdin
        self.proc.stdin.close()
        self.assertEqual(self.proc.wait(timeout=10), 0)
        time.sleep(0.2)
        with self.assertRaises(OSError):
            socket.create_connection(("127.0.0.1", self.port), timeout=1).close()


if __name__ == "__main__":
    unittest.main()
