// 注意：scripts/golden/export-molGraph.ts 會掃描 tests/**/*.test.ts 內的單引號字串當作 SMILES 候選，本檔一律使用雙引號，避免動到黃金檔。
// 桌面橋接白名單（任務 I01）：允許的路徑通過；非白名單路徑、任意網址、非 127.0.0.1 目標被拒；回應不含權杖。
import { describe, expect, it, vi } from 'vitest';
import { ALLOWED_PATHS, callEngine, isAllowedPath, validateCall } from "../../desktop/bridge.cjs";

const engine = { host: "127.0.0.1", port: 51234, token: "SECRET-TOKEN" };

describe("橋接白名單", () => {
  it("白名單內的每個路徑都通過檢查，並以 POST 轉給引擎", async () => {
    for (const p of ALLOWED_PATHS) {
      const send = vi.fn(async () => ({ status: 200, body: { ok: true } }));
      const reply = await callEngine(engine, p, { smiles: "*CC*" }, send);
      expect(reply).toEqual({ ok: true, status: 200, body: { ok: true } });
      expect(send).toHaveBeenCalledWith(engine, "POST", p, { smiles: "*CC*" });
    }
  });

  it("非白名單路徑與任意網址被拒絕，不會送出請求", async () => {
    const bad = ["/handshake", "/demo/quantity", "/crosslink/analyze", "/vw?x=1", "/vw/", "/../vw", "//evil.example/vw", "http://evil.example/vw", "http://127.0.0.1:1/vw", "", "vw"];
    for (const p of bad) {
      expect(isAllowedPath(p)).toBe(false);
      const send = vi.fn();
      const reply = await callEngine(engine, p, {}, send);
      expect(reply.ok).toBe(false);
      expect(send).not.toHaveBeenCalled();
    }
    expect(isAllowedPath(undefined)).toBe(false);
    expect(isAllowedPath({ toString: () => "/vw" })).toBe(false);
  });

  it("引擎位址不是 127.0.0.1 時拒絕", async () => {
    for (const host of ["192.168.1.5", "localhost", "0.0.0.0", "evil.example", undefined]) {
      const send = vi.fn();
      const reply = await callEngine({ ...engine, host }, "/vw", { smiles: "CC" }, send);
      expect(reply.ok).toBe(false);
      expect(send).not.toHaveBeenCalled();
    }
    expect((await callEngine(null, "/vw", {}, vi.fn())).ok).toBe(false);
  });

  it("請求本文必須是 JSON 物件且不超過上限", () => {
    expect(validateCall("/vw", [1]).ok).toBe(false);
    expect(validateCall("/vw", "x").ok).toBe(false);
    expect(validateCall("/vw", null).ok).toBe(false);
    expect(validateCall("/vw", { smiles: "x".repeat(70 * 1024) }).ok).toBe(false);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(validateCall("/vw", cyclic).ok).toBe(false);
  });

  it("回應與錯誤都不含權杖或埠", async () => {
    const boom = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const failed = await callEngine(engine, "/vw", { smiles: "CC" }, boom);
    const ok = await callEngine(engine, "/vw", { smiles: "CC" }, async () => ({ status: 200, body: { ok: true } }));
    for (const r of [failed, ok]) {
      const text = JSON.stringify(r);
      expect(text).not.toContain("SECRET-TOKEN");
      expect(text).not.toContain("51234");
    }
    expect(failed.ok).toBe(false);
  });
});
