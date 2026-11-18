// 注意：scripts/golden/export-molGraph.ts 會掃描 tests/**/*.test.ts 內的單引號字串當作 SMILES 候選，本檔一律使用雙引號，避免動到黃金檔。
// 固化預測（任務 P7-3）：請求本文只搬運資料、不計算；橋接白名單含 /crosslink/cure。
import { describe, expect, it } from "vitest";
import { ALLOWED_PATHS } from "../../desktop/bridge.cjs";
import type { CrosslinkResult } from "../../src/core/crosslink/types";
import type { Formulation, FormulationOutcome } from "../../src/core/formulation/types";
import { CURE_TEMP_HINT, CURE_TEMP_REQUIRED_TEXT, DEFAULT_CURE_TEMP_TEXT } from "../../src/ui/crosslink/cureText";
import { cureBody } from "../../src/ui/engine/crosslinkEngine";

describe("橋接白名單含固化預測端點", () => {
  it("/crosslink/cure 在白名單內", () => {
    expect(ALLOWED_PATHS).toContain("/crosslink/cure");
  });
});

describe("硬化溫度沒有預設值", () => {
  it("欄位初始為空白，提示文字為「請輸入硬化溫度」，說明不含預設值", () => {
    expect(DEFAULT_CURE_TEMP_TEXT).toBe("");
    expect(CURE_TEMP_REQUIRED_TEXT).toBe("請輸入硬化溫度");
    expect(CURE_TEMP_HINT).not.toContain("150");
  });
});

describe("固化預測請求本文", () => {
  const result = {
    pairs: [{ ruleId: "r", a: { componentId: "A" }, b: { componentId: "B" } }],
    components: [{ id: "A", name: "A", isPolymer: true, dp: 10, molarMass: 1000, distribution: null, problem: null, units: null }],
    markedAtoms: {},
    markedUnitAtoms: {},
    markedEndAtoms: {},
  } as unknown as CrosslinkResult;
  const formulation = {
    solid: {
      unit: "wt",
      components: [
        { id: "A", name: "A", canonicalSmiles: "[*:1]CC[*:2]", category: "Resin", amount: 80, isResin: true, polymer: { mnInput: 1000 } },
        { id: "B", name: "B", canonicalSmiles: "OCCO", category: "Small Molecule", amount: 20, volatileFlag: true },
      ],
    },
    liquid: { unit: "wt", components: [] },
  } as unknown as Formulation;
  const outcome = { results: { solid: { components: [{ id: "A", wtPct: { value: 80 } }, { id: "B", wtPct: { value: 20 } }] } }, errors: [] } as unknown as FormulationOutcome;

  it("帶成分分類、聚合物設定、揮發標記、Mn 與硬化溫度", () => {
    const body = cureBody(result, formulation, outcome, { A: 1000, B: 62.07 }, 150) as {
      solid: { unit: string; components: Record<string, unknown>[] };
      wtPct: unknown;
      mn: unknown;
      cureTempC: number;
    };
    expect(body.solid.unit).toBe("wt");
    expect(body.solid.components[0]).toEqual({ id: "A", name: "A", canonicalSmiles: "[*:1]CC[*:2]", amount: 80, category: "Resin", isResin: true, polymer: { mnInput: 1000 } });
    expect(body.solid.components[1]).toEqual({ id: "B", name: "B", canonicalSmiles: "OCCO", amount: 20, category: "Small Molecule", volatileFlag: true });
    expect(body.wtPct).toEqual({ A: 80, B: 20 });
    expect(body.mn).toEqual({ A: 1000, B: 62.07 });
    expect(body.cureTempC).toBe(150);
  });

  it("沒有硬化溫度時不送 cureTempC；缺 Mn 的成分送 null", () => {
    const body = cureBody(result, formulation, outcome, { A: 1000 }, null) as { mn: unknown } & Record<string, unknown>;
    expect("cureTempC" in body).toBe(false);
    expect(body.mn).toEqual({ A: 1000, B: null });
  });
});
