// 注意：scripts/golden/export-molGraph.ts 會掃描 tests/**/*.test.ts 內的單引號字串當作 SMILES 候選，本檔一律使用雙引號，避免動到黃金檔。
// 溶劑資料表選項、Liquid vol% 與溶解性的請求本文（任務 P8-1）：橋接白名單含三個新端點；請求只搬運資料，不計算物性。
import { describe, expect, it } from "vitest";
import { ALLOWED_PATHS } from "../../desktop/bridge.cjs";
import { bundledTexts, loadTables } from "../../src/core/data/load";
import { densitySourceText, pickNearest, solventOptions } from "../../src/core/data/solventOptions";
import { computeFormulation } from "../../src/core/formulation/compute";
import type { Component, Formulation } from "../../src/core/formulation/types";
import { liquidVolumeRequest, solubilityPolymers, solubilityRequest } from "../../src/ui/engine/solventRequests";

const component = (over: Partial<Component> & Pick<Component, "id" | "name" | "canonicalSmiles" | "category" | "amount">): Component => ({ ...over });

const formulation: Formulation = {
  name: "測試",
  solid: { unit: "g", components: [component({ id: "P", name: "聚苯乙烯", canonicalSmiles: "*CC(*)c1ccccc1", category: "Resin", amount: 10 })] },
  liquid: {
    unit: "g",
    components: [
      component({ id: "L1", name: "丙酮", canonicalSmiles: "CC(C)=O", category: "Solvent", amount: 30 }),
      component({ id: "L2", name: "自訂液體", canonicalSmiles: "CCCCCCCCCCCC", category: "Solvent", amount: 10, density: 0.75, densitySource: "測試用來源" }),
    ],
  },
} as unknown as Formulation;

describe("橋接白名單與溶劑資料表選項", () => {
  it("/hsp、/solubility、/liquid-volume 在白名單內", () => {
    for (const p of ["/hsp", "/solubility", "/liquid-volume"]) expect(ALLOWED_PATHS).toContain(p);
  });

  it("溶劑資料表 23 個溶劑都有選項；密度取最接近 25 °C 的一列並標出溫度", () => {
    const { tables, issues } = loadTables(bundledTexts);
    expect(issues).toEqual([]);
    const options = solventOptions(tables.solvents.rows);
    expect(options).toHaveLength(23);
    const water = options.find((o) => o.id === "water");
    expect(water?.density?.temperatureC).toBe(25);
    const acetone = options.find((o) => o.id === "acetone");
    expect(acetone?.density).toMatchObject({ value: 0.7845, temperatureC: 20 });
    expect(densitySourceText(acetone!)).toContain("20 °C");
  });

  it("pickNearest：距離相同取較低溫度；沒有溫度的列視為距離 0", () => {
    expect(pickNearest([{ temperature_c: 30 }, { temperature_c: 20 }])?.temperature_c).toBe(20);
    expect(pickNearest([{ temperature_c: 20 }, { temperature_c: null }])?.temperature_c).toBeNull();
    expect(pickNearest([])).toBeNull();
  });
});

describe("Liquid vol% 與溶解性的請求本文", () => {
  const outcome = computeFormulation(formulation, { "L1": 58.08, "L2": 170.33, "P": 104.15 });

  it("Liquid vol%：有質量用 g；密度只帶使用者填的（成分上的值），其餘由引擎依結構對應溶劑資料表", () => {
    const planned = liquidVolumeRequest(formulation, outcome);
    expect(planned.reason).toBeNull();
    expect(planned.request?.path).toBe("/liquid-volume");
    const comps = (planned.request?.body.components ?? []) as Record<string, unknown>[];
    expect(comps.map((c) => [c.name, c.amount, c.amountIsGram, c.userDensity])).toEqual([
      ["丙酮", 30, true, undefined],
      ["自訂液體", 10, true, 0.75],
    ]);
    expect(comps[1].userDensitySource).toBe("測試用來源");
  });

  it("Liquid 沒有成分或換算沒有結果時，回報原因而不送請求", () => {
    const empty = { ...formulation, liquid: { unit: "g", components: [] } } as unknown as Formulation;
    expect(liquidVolumeRequest(empty, outcome).request).toBeNull();
    expect(liquidVolumeRequest(formulation, null).reason).toContain("沒有 Liquid");
  });

  it("溶解性：只有含連接點的 Solid 成分可選；混合溶劑帶 Liquid 成分，單一溶劑帶 solventId", () => {
    expect(solubilityPolymers(formulation).map((c) => c.id)).toEqual(["P"]);
    const mixed = solubilityRequest(formulation, outcome, "P", { kind: "liquid" });
    expect(mixed.request?.path).toBe("/solubility");
    expect(mixed.request?.body.smiles).toBe("*CC(*)c1ccccc1");
    expect(mixed.request?.body.basis).toBe("mass");
    expect((mixed.request?.body.solvents as unknown[]).length).toBe(2);
    const single = solubilityRequest(formulation, outcome, "P", { kind: "solvent", id: "toluene" });
    expect(single.request?.body.solvents).toEqual([{ solventId: "toluene", amount: 1 }]);
    expect(solubilityRequest(formulation, outcome, null, { kind: "liquid" }).reason).toContain("請選一個聚合物");
  });
});
