// 注意：scripts/golden/export-molGraph.ts 會掃描 tests/**/*.test.ts 內的單引號字串當作 SMILES 候選，本檔一律使用雙引號，避免動到黃金檔。
// 交聯頁切到引擎（任務 I05）：請求本文的轉換只搬運資料、不計算；橋接白名單含交聯四個端點。
import { describe, expect, it } from "vitest";
import { ALLOWED_PATHS } from "../../desktop/bridge.cjs";
import type { CrosslinkResult } from "../../src/core/crosslink/types";
import type { Formulation, FormulationOutcome } from "../../src/core/formulation/types";
import { analyzeBody, prepareBody } from "../../src/ui/engine/crosslinkEngine";

describe("橋接白名單含交聯端點", () => {
  it("四個交聯端點都在白名單內", () => {
    for (const p of ["/crosslink/analyze", "/crosslink/prepare", "/crosslink/layer1", "/crosslink/layer1/scan"]) expect(ALLOWED_PATHS).toContain(p);
  });
});

describe("第 0 層請求本文", () => {
  const polymer = { id: "P", name: "P", canonicalSmiles: "[*:1]CC[*:2]", category: "Resin", polymer: { mnInput: 6000 }, molfile: "MOLFILE" };
  const small = { id: "S", name: "S", canonicalSmiles: "OCCO", category: "Small Molecule", molfile: "MOLFILE" };

  it("小分子帶每分子質量、聚合物不帶；不送 molfile", () => {
    const body = analyzeBody([polymer, small], { P: 999, S: 62.068 }) as { components: Record<string, unknown>[] };
    expect(body.components[0]).toEqual({ id: "P", name: "P", category: "Resin", canonicalSmiles: "[*:1]CC[*:2]", polymer: { mnInput: 6000 } });
    expect(body.components[1]).toEqual({ id: "S", name: "S", category: "Small Molecule", canonicalSmiles: "OCCO", molarMass: 62.068 });
  });

  it("每分子質量算不出來（null、NaN、缺）時不送該欄位", () => {
    for (const m of [null, Number.NaN, undefined]) {
      const body = analyzeBody([small], { S: m }) as { components: Record<string, unknown>[] };
      expect("molarMass" in body.components[0]).toBe(false);
    }
  });
});

describe("第 1 層輸入整理的請求本文", () => {
  const result = {
    pairs: [{ ruleId: "r", a: { componentId: "A" }, b: { componentId: "B" } }],
    components: [
      {
        id: "A",
        name: "A",
        isPolymer: true,
        dp: 10,
        molarMass: 1000,
        distribution: { mw: 1100, mn: 1000, mUnit: 100, mEnds: 0 },
        problem: null,
        units: [{ smiles: "[*:1]CC[*:2]", molFraction: 1, groups: [{ groupId: "g", sites: [[0, 1, 2]] }] }],
        groups: [{ groupId: "g", sites: [[0, 1, 2]] }],
        source: "[*:1]CC[*:2]",
      },
    ],
    markedAtoms: { A: [0, 1, 2] },
    markedUnitAtoms: {},
    markedEndAtoms: {},
  } as unknown as CrosslinkResult;
  const formulation = (amount: number): Formulation =>
    ({
      solid: { unit: "wt", components: [{ id: "A", name: " A ", canonicalSmiles: "[*:1]CC[*:2]", category: "Resin", amount, isResin: true }] },
      liquid: { unit: "wt", components: [] },
    }) as unknown as Formulation;
  const outcomeWith = (value: number | null): FormulationOutcome =>
    ({ results: { solid: { components: [{ id: "A", wtPct: { value } }] } }, errors: [] }) as unknown as FormulationOutcome;

  it("只送第 1 層需要的欄位（原子位點與標記原子不送，避免超過 60 KB）", () => {
    const body = prepareBody(result, formulation(100), outcomeWith(100)) as { result: { pairs: unknown[]; components: Record<string, unknown>[] }; solid: { unit: string; components: Record<string, unknown>[] }; wtPct: Record<string, number | null> | null };
    expect(body.result.pairs).toEqual(result.pairs);
    const c = body.result.components[0];
    expect(Object.keys(c).sort()).toEqual(["distribution", "dp", "id", "isPolymer", "molarMass", "name", "problem", "units"]);
    expect(c.units).toEqual([{ smiles: "[*:1]CC[*:2]", molFraction: 1 }]);
    expect(body.solid).toEqual({ unit: "wt", components: [{ id: "A", name: " A ", canonicalSmiles: "[*:1]CC[*:2]", amount: 100, isResin: true }] });
    expect(body.wtPct).toEqual({ A: 100 });
  });

  it("配方換算失敗（沒有 Solid 結果）時 wtPct 為 null；用量是 NaN 時以 0 代替（引擎在讀用量前就回報原因）", () => {
    const noSolid = { results: {}, errors: [{ area: "solid", message: "x" }] } as unknown as FormulationOutcome;
    const body = prepareBody(result, formulation(Number.NaN), noSolid) as { solid: { components: { amount: number }[] }; wtPct: unknown };
    expect(body.wtPct).toBeNull();
    expect(body.solid.components[0].amount).toBe(0);
    expect((prepareBody(result, formulation(1), null) as { wtPct: unknown }).wtPct).toBeNull();
  });

  it("成分的質量百分比為 null 時照樣傳 null", () => {
    expect((prepareBody(result, formulation(1), outcomeWith(null)) as { wtPct: unknown }).wtPct).toEqual({ A: null });
  });
});
