// 注意：scripts/golden/export-molGraph.ts 會掃描 tests/**/*.test.ts 內的單引號字串當作 SMILES 候選，本檔一律使用雙引號，避免動到黃金檔。
// 反應溫度範圍與固化收縮（任務 P7-4）：介面只搬運引擎回應、不計算；第 1 層不支援的體系仍帶回溫度範圍；固化收縮沒有新端點（併入 /crosslink/cure，白名單不變）。
import { afterEach, describe, expect, it } from "vitest";
import { ALLOWED_PATHS } from "../../desktop/bridge.cjs";
import { SHRINKAGE_SECTION_TITLE, SHRINKAGE_SIGN_TEXT, TEMP_NO_RANGE_TEXT, TEMP_SECTION_TITLE } from "../../src/ui/crosslink/cureText";
import { computeCureViaEngine } from "../../src/ui/engine/crosslinkEngine";

type Fake = { call: (path: string, body: Record<string, unknown>) => Promise<unknown>; status: () => Promise<{ state: string }> };

function installBridge(body: Record<string, unknown>): { paths: string[] } {
  const paths: string[] = [];
  const fake: Fake = {
    call: async (path) => {
      paths.push(path);
      return { ok: true, status: 200, body: { ok: true, ...body } };
    },
    status: async () => ({ state: "ready" }),
  };
  (globalThis as unknown as { window: unknown }).window = { moleformEngine: fake };
  return { paths };
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

const ranges = { rows: [{ ruleId: "epoxy+phenol", label: "環氧–酚", status: "none", text: "無文獻範圍", tempMinC: null, tempMaxC: null, conditions: "", source: "", reviewStatus: "pending", catalyst: "none", notes: "" }], note: "文獻典型範圍，非預測" };

describe("固化預測介面：溫度範圍與固化收縮", () => {
  it("沒有新端點：併入 /crosslink/cure，白名單不變", () => {
    expect(ALLOWED_PATHS).toContain("/crosslink/cure");
    expect(ALLOWED_PATHS.filter((p: string) => p.includes("shrink") || p.includes("temperature"))).toEqual([]);
  });

  it("第 1 層不支援的體系：回報同一個原因，並帶回溫度範圍（只是規則表的文獻值）", async () => {
    const { paths } = installBridge({ supported: false, reason: "此體系的凝膠點與當量計算尚未支援", temperatureRanges: ranges });
    const out = await computeCureViaEngine({});
    expect(paths).toEqual(["/crosslink/cure"]);
    expect(out.ok).toBe(true);
    if (out.ok && !out.value.supported) {
      expect(out.value.reason).toBe("此體系的凝膠點與當量計算尚未支援");
      expect(out.value.temperatureRanges?.rows[0].text).toBe("無文獻範圍");
    } else {
      throw new Error("應為不支援");
    }
  });

  it("舊版引擎沒有 temperatureRanges 時為 null，不會壞", async () => {
    installBridge({ supported: false, reason: "x" });
    const out = await computeCureViaEngine({});
    expect(out.ok && !out.value.supported && out.value.temperatureRanges).toBe(null);
  });

  it("支援的體系：原樣帶回收縮與溫度範圍，缺值保持 missing 與原因", async () => {
    const shrinkage = { status: "missing", reason: "成分缺密度：A（沒有提供密度）；不猜值，整項不計算", model: "m", note: "n", reactions: [], excluded: [] };
    installBridge({ supported: true, ruleId: "epoxy+phenol", temperatureRanges: ranges, shrinkage });
    const out = await computeCureViaEngine({});
    expect(out.ok && out.value.supported && out.value.shrinkage.status).toBe("missing");
    expect(out.ok && out.value.supported && out.value.temperatureRanges.rows).toHaveLength(1);
  });

  it("區塊文字", () => {
    expect(TEMP_SECTION_TITLE).toBe("反應溫度範圍");
    expect(TEMP_NO_RANGE_TEXT).toBe("無文獻範圍");
    expect(SHRINKAGE_SECTION_TITLE).toBe("固化收縮");
    expect(SHRINKAGE_SIGN_TEXT).toContain("正值＝體積減少");
  });
});
