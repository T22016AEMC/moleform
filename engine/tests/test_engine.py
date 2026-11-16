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

    def test_tg_ok_calibrated_missing_invalid(self) -> None:
        """任務 M02：POST /tg。書中基團算得出（PVC：ΣYg 22.1／ΣM 62.5）、含校準基團（PVPh）、缺基團回 missing，無效輸入回 400。"""
        status, body = self.request("POST", "/tg", {"smiles": "*CC(Cl)*"})
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        q = body["quantity"]
        self.assertEqual(set(q), {"value", "unit", "source", "status"})
        self.assertEqual((q["status"], q["unit"]), ("predicted", "K"))
        self.assertAlmostEqual(q["value"], 1000 * 22.1 / 62.5, places=9)
        self.assertAlmostEqual(body["tgC"], q["value"] - 273.15, places=9)
        self.assertFalse(body["containsCalibrated"])
        self.assertTrue(body["polymer"])
        self.assertIn("非實測值", body["disclaimer"])
        # 含校準基團（酚羥基，D54）：算得出但要標示
        status, body = self.request("POST", "/tg", {"smiles": "[*:1]CC([*:2])c1ccc(O)cc1"})
        self.assertEqual(status, 200)
        self.assertEqual(body["quantity"]["status"], "predicted")
        self.assertTrue(body["containsCalibrated"])
        self.assertAlmostEqual(body["tgC"], 186.7, delta=0.1)
        # 缺基團（2-萘基）：不計算，列出原子
        status, body = self.request("POST", "/tg", {"smiles": "*CC(c1ccc2ccccc2c1)*"})
        self.assertEqual(status, 200)
        self.assertEqual(body["quantity"]["status"], "missing")
        self.assertIsNone(body["quantity"]["value"])
        self.assertTrue(body["missing"])
        # 無法解析、空字串、空白、沒有重原子、缺欄位、型別錯誤、太長
        for bad in ({"smiles": "xyz"}, {"smiles": ""}, {"smiles": "   "}, {"smiles": "[H+]"}, {"smiles": "*"}, {}, {"smiles": 1}, {"smiles": "C" * 10001}):
            with self.subTest(bad=str(bad)[:40]):
                status, body = self.request("POST", "/tg", bad)
                self.assertEqual(status, 400)
                self.assertFalse(body["ok"])

    def test_tg_requires_token(self) -> None:
        self.assertEqual(self.request("POST", "/tg", {"smiles": "CC"}, headers={"Authorization": "Bearer wrong"})[0], 401)

    def test_vm_ok_missing_unsupported_invalid(self) -> None:
        """任務 M03：POST /vm。聚苯乙烯（Vm = ΣVa 100.53、玻璃態）、聚乙烯（橡膠態）、缺基團、小分子（不支援）、無效輸入回 400。"""
        status, body = self.request("POST", "/vm", {"smiles": "[*:1]CC([*:2])c1ccccc1"})
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        q = body["quantity"]
        self.assertEqual(set(q), {"value", "unit", "source", "status"})
        self.assertEqual((q["status"], q["unit"]), ("predicted", "cm³/mol"))
        self.assertAlmostEqual(q["value"], 16.37 + 84.16, places=9)
        self.assertEqual((body["density"]["status"], body["density"]["unit"]), ("predicted", "g/cm³"))
        self.assertAlmostEqual(body["density"]["value"], body["unitMass"] / q["value"], places=12)
        self.assertEqual(body["state"]["state"], "glassy")
        self.assertEqual(body["glassy"], body["rubbery"])
        self.assertIn("非實測", body["disclaimer"])
        status, body = self.request("POST", "/vm", {"smiles": "*CC*"})
        self.assertEqual((status, body["state"]["state"]), (200, "rubbery"))
        # 缺基團：不計算，列出原子與補充說明
        status, body = self.request("POST", "/vm", {"smiles": "*CC(=O)OCC*"})
        self.assertEqual(status, 200)
        self.assertEqual(body["quantity"]["status"], "missing")
        self.assertIsNone(body["quantity"]["value"])
        self.assertTrue(body["missing"])
        # 不含 * 的小分子：200、missing、unsupported
        status, body = self.request("POST", "/vm", {"smiles": "CCO"})
        self.assertEqual(status, 200)
        self.assertTrue(body["unsupported"])
        self.assertEqual(body["quantity"]["status"], "missing")
        # 無法解析、空字串、空白、沒有重原子、多個分子、缺欄位、型別錯誤、太長
        bad_requests = ({"smiles": "xyz"}, {"smiles": ""}, {"smiles": "   "}, {"smiles": "[H+]"}, {"smiles": "*"}, {"smiles": "*CC*.*OC*"}, {}, {"smiles": 1}, {"smiles": "C" * 10001})
        for bad in bad_requests:
            with self.subTest(bad=str(bad)[:40]):
                status, body = self.request("POST", "/vm", bad)
                self.assertEqual(status, 400)
                self.assertFalse(body["ok"])

    def test_cte_ok_missing_notapplicable_invalid(self) -> None:
        """任務 M03：POST /cte。聚苯乙烯（α_l = 6.25e-4、α_g = 2.8125e-4）、Tg 缺基團（式 4.27 回 missing）、缺 VW、小分子、無效輸入回 400。"""
        status, body = self.request("POST", "/cte", {"smiles": "[*:1]CC([*:2])c1ccccc1"})
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        quantities = body["quantities"]
        self.assertEqual(set(quantities), {"rubberyAlpha", "rubberyBeta", "glassyAlpha", "glassyBeta", "glassyFromTgAlpha", "glassyFromTgBeta"})
        for q in quantities.values():
            self.assertEqual(set(q), {"value", "unit", "source", "status"})
            self.assertEqual((q["status"], q["unit"]), ("predicted", "K⁻¹"))
        self.assertAlmostEqual(quantities["rubberyAlpha"]["value"], 6.25e-4, places=12)
        self.assertAlmostEqual(quantities["glassyAlpha"]["value"], 2.8125e-4, places=12)
        self.assertAlmostEqual(quantities["rubberyBeta"]["value"], quantities["rubberyAlpha"]["value"] / 3, places=15)
        self.assertEqual(body["glassyFromTg"]["status"], "ok")
        self.assertIn("非實測", body["disclaimer"])
        # VW 可算、Tg 缺基團（聚丙烯腈）：式 4.27 為 missing，其餘照算
        status, body = self.request("POST", "/cte", {"smiles": "[*:1]CC([*:2])C#N"})
        self.assertEqual(status, 200)
        self.assertEqual(body["quantities"]["glassyAlpha"]["status"], "predicted")
        self.assertEqual(body["quantities"]["glassyFromTgAlpha"]["status"], "missing")
        self.assertIsNone(body["quantities"]["glassyFromTgAlpha"]["value"])
        # 缺 VW
        status, body = self.request("POST", "/cte", {"smiles": "[*:1]C[Se]C[*:2]"})
        self.assertEqual(status, 200)
        self.assertEqual(body["quantities"]["rubberyAlpha"]["status"], "missing")
        self.assertTrue(body["missing"])
        # 小分子：不適用（D56）
        status, body = self.request("POST", "/cte", {"smiles": "CCO"})
        self.assertEqual(status, 200)
        self.assertTrue(body["notApplicable"])
        self.assertEqual(body["quantities"]["glassyAlpha"]["status"], "missing")
        for bad in ({"smiles": "xyz"}, {"smiles": ""}, {"smiles": "   "}, {"smiles": "[H+]"}, {"smiles": "*"}, {}, {"smiles": 1}, {"smiles": "C" * 10001}):
            with self.subTest(bad=str(bad)[:40]):
                status, body = self.request("POST", "/cte", bad)
                self.assertEqual(status, 400)
                self.assertFalse(body["ok"])

    def test_vm_cte_require_token(self) -> None:
        for path in ("/vm", "/cte"):
            self.assertEqual(self.request("POST", path, {"smiles": "*CC*"}, headers={"Authorization": "Bearer wrong"})[0], 401)

    def test_polymer_endpoints(self) -> None:
        """任務 M04：聚合物基礎五個端點（value/unit/source/status；輸入無效回 400）。"""
        status, body = self.request("POST", "/polymer/repeat-unit", {"smiles": "*CC*"})
        self.assertEqual(status, 200)
        q = body["quantity"]
        self.assertEqual(set(q), {"value", "unit", "source", "status"})
        self.assertEqual((q["unit"], q["status"], body["formula"]), ("g/mol", "predicted", "C2H4"))
        self.assertAlmostEqual(q["value"], 2 * 12.011 + 4 * 1.008, places=2)
        for bad in ({"smiles": "CCO"}, {"smiles": "*CC"}, {"smiles": "[*:1]CC[*:3]"}, {"smiles": "[*+]CC*"}, {"smiles": ""}, {}, {"smiles": 1}):
            with self.subTest(bad=str(bad)):
                status, body = self.request("POST", "/polymer/repeat-unit", bad)
                self.assertEqual((status, body["ok"]), (400, False))
        status, body = self.request("POST", "/polymer/end-groups", {"endGroups": {"end1": {"smiles": "[*]CCCC"}, "end2": {"smiles": "[*][H]"}}})
        self.assertEqual(status, 200)
        self.assertAlmostEqual(body["quantity"]["value"], 58.124, places=3)
        self.assertEqual((body["filled"], body["note"]), ([True, True], ""))
        status, body = self.request("POST", "/polymer/end-groups", {"endGroups": {"end1": {"smiles": "CCO"}}})
        self.assertEqual((status, body["errors"]), (400, ["端基 1：端基需要恰好一個連接點（*），目前有 0 個。"]))
        status, body = self.request("POST", "/polymer/copolymer", {"smiles": "*CC*", "units": [{"smiles": "*CC*", "fraction": 50}, {"smiles": "*CC(*)C", "fraction": 50}]})
        self.assertEqual(status, 200)
        self.assertEqual(body["note"], "共聚物以平均組成計算，未考慮鏈間組成分布")
        self.assertAlmostEqual(sum(u["molFraction"] for u in body["units"]), 1.0, places=12)
        status, body = self.request("POST", "/polymer/copolymer", {"smiles": "*CC*", "units": [{"smiles": "*CC*", "fraction": 60}, {"smiles": "*CC(*)C", "fraction": 30}]})
        self.assertEqual((status, body["code"]), (400, "BAD_FRACTION"))
        status, body = self.request("POST", "/polymer/convert", {"polymer": {"mwInput": 6000, "pdiInput": 1.8}, "mUnit": 200})
        self.assertEqual(status, 200)
        self.assertAlmostEqual(body["quantities"]["mn"]["value"], 6000 / 1.8, places=9)
        self.assertAlmostEqual(body["quantities"]["dpW"]["value"], 30, places=9)
        for bad in ({"polymer": {"mwInput": 6000, "mnInput": 3000}, "mUnit": 200}, {"polymer": {"mwInput": 6000, "pdiInput": 0.5}, "mUnit": 200}, {"polymer": {"mwInput": 6000}}, {}):
            with self.subTest(bad=str(bad)):
                self.assertEqual(self.request("POST", "/polymer/convert", bad)[0], 400)
        status, body = self.request("POST", "/polymer/distribution", {"mw": 6000, "mn": 6000 / 1.8})
        self.assertEqual((status, body["lowMw"], len(body["species"])), (200, False, 2))
        status, body = self.request("POST", "/polymer/distribution", {"mw": 1000, "mn": 500, "mEnds": 340.41})
        self.assertEqual((status, body["lowMw"]), (200, True))
        for bad in ({"mw": 1000, "mn": 500, "mEnds": 600}, {"mw": -1, "mn": 5}, {"mw": "x", "mn": 5}):
            with self.subTest(bad=str(bad)):
                self.assertEqual(self.request("POST", "/polymer/distribution", bad)[0], 400)
        for path in ("/polymer/repeat-unit", "/polymer/end-groups", "/polymer/copolymer", "/polymer/convert", "/polymer/distribution"):
            self.assertEqual(self.request("POST", path, {"smiles": "*CC*"}, headers={"Authorization": "Bearer wrong"})[0], 401)

    def test_exits_when_stdin_closes(self) -> None:
        assert self.proc.stdin
        self.proc.stdin.close()
        self.assertEqual(self.proc.wait(timeout=10), 0)
        time.sleep(0.2)
        with self.assertRaises(OSError):
            socket.create_connection(("127.0.0.1", self.port), timeout=1).close()


if __name__ == "__main__":
    unittest.main()
