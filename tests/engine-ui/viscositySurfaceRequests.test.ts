// 注意：scripts/golden/export-molGraph.ts 會掃描 tests/**/*.test.ts 內的單引號字串當作 SMILES 候選，本檔一律使用雙引號，避免動到黃金檔。
// 「黏度」與「表面與潤濕」卡片的請求本文（任務 P8-2）：橋接白名單含四個新端點；請求只搬運資料，不計算物性。
import { describe, expect, it } from "vitest";
import { ALLOWED_PATHS } from "../../desktop/bridge.cjs";
import type { Component, Formulation } from "../../src/core/formulation/types";
import {
  emptyAndrade,
  emptyPolymerFields,
  parseNumber,
  polymerMolarMass,
  surfaceTensionRequest,
  viscosityRequest,
  wettingRequest,
} from "../../src/ui/engine/viscositySurfaceRequests";

const component = (over: Partial<Component> & Pick<Component, "id" | "name" | "canonicalSmiles" | "category" | "amount">): Component => ({ ...over });

const polymer = component({ id: "P", name: "聚苯乙烯", canonicalSmiles: "*CC(*)c1ccccc1", category: "Resin", amount: 10, polymer: { mwInput: 100000 } });
const formulation: Formulation = {
  name: "測試",
  solid: { unit: "g", components: [polymer] },
  liquid: {
    unit: "g",
    components: [
      component({ id: "L1", name: "丙酮", canonicalSmiles: "CC(C)=O", category: "Solvent", amount: 30 }),
      component({ id: "L2", name: "乙醇", canonicalSmiles: "CCO", category: "Solvent", amount: 10 }),
    ],
  },
} as unknown as Formulation;

describe("橋接白名單", () => {
  it("/viscosity、/surface-tension、/interfacial、/wetting 在白名單內", () => {
    for (const p of ["/viscosity", "/surface-tension", "/interfacial", "/wetting"]) expect(ALLOWED_PATHS).toContain(p);
  });
});

describe("黏度請求", () => {
  const base = { temperatureText: "", andrade: {}, polymerId: "P", mnById: { P: 52000 }, polymer: emptyPolymerFields };

  it("溶劑逐一帶結構；Andrade 參數只在輸入完整時才送；聚合物帶重複單元與 Mw（Mw 優先於 Mn）", () => {
    const planned = viscosityRequest(formulation, {
      ...base,
      temperatureText: "30",
      andrade: { L1: { ...emptyAndrade, mode: "be", b: "0.02", e: "10" }, L2: { ...emptyAndrade, mode: "points", t1: "20", v1: "1.2" } },
    });
    expect(planned.reason).toBeNull();
    expect(planned.request?.path).toBe("/viscosity");
    const body = planned.request?.body as Record<string, unknown>;
    expect(body.temperatureC).toBe(30);
    expect(body.solvents).toEqual([
      { smiles: "CC(C)=O", andrade: { B: 0.02, energyKjMol: 10 } },
      { smiles: "CCO" },
    ]);
    expect(body.polymer).toEqual({ smiles: "*CC(*)c1ccccc1", molarMass: 100000 });
  });

  it("Mark–Houwink 的 K 與 a 只在使用者輸入時才送，並附來源；沒有輸入就不帶（引擎回資料不足）", () => {
    const filled = viscosityRequest(formulation, {
      ...base,
      polymer: { ...emptyPolymerFields, mhK: "0.01", mhA: "0.7", mhSource: "測試用假設值", mhSolvent: "測試溶劑", mhTemperature: "25", b: "0.1", concK: "2", concC: "0.3" },
    });
    const poly = (filled.request?.body as Record<string, any>).polymer as Record<string, unknown>;
    expect(poly.markHouwink).toEqual({ K: 0.01, a: 0.7, source: "測試用假設值", temperatureC: 25, solvent: "測試溶劑" });
    expect(poly.B).toBe(0.1);
    expect(poly.concentrated).toEqual({ K: 2, concentration: 0.3 });
    const empty = viscosityRequest(formulation, base);
    const emptyPoly = (empty.request?.body as Record<string, any>).polymer as Record<string, unknown>;
    expect(emptyPoly.markHouwink).toBeUndefined();
    expect(emptyPoly.concentrated).toBeUndefined();
  });

  it("沒有溶劑也沒有聚合物時不送請求並回報原因", () => {
    const empty = { ...formulation, solid: { unit: "g", components: [] }, liquid: { unit: "g", components: [] } } as unknown as Formulation;
    const planned = viscosityRequest(empty, { ...base, polymerId: null });
    expect(planned.request).toBeNull();
    expect(planned.reason).toContain("沒有溶劑");
  });

  it("分子量：沒有 Mw 時取 Mn；兩者都沒有回傳 null", () => {
    expect(polymerMolarMass(component({ id: "Q", name: "q", canonicalSmiles: "*CC*", category: "Resin", amount: 1 }), { Q: 4000 })).toEqual({ value: 4000, basis: "Mn" });
    expect(polymerMolarMass(polymer, {})).toEqual({ value: 100000, basis: "Mw" });
    expect(polymerMolarMass(component({ id: "R", name: "r", canonicalSmiles: "*CC*", category: "Resin", amount: 1 }), {})).toBeNull();
    expect(parseNumber(" 2.5 ")).toBe(2.5);
    expect(parseNumber("abc")).toBeNull();
  });
});

describe("表面與潤濕請求", () => {
  it("表面張力帶 SMILES 與溫度；沒有結構不送", () => {
    expect(surfaceTensionRequest("*CC(*)C", "20")).toEqual({ path: "/surface-tension", body: { smiles: "*CC(*)C", temperatureC: 20 } });
    expect(surfaceTensionRequest("  ", "")).toBeNull();
  });

  it("潤濕：固體用聚合物重複單元；液體用 Liquid 成分的結構，或書 Table 8.6 的 id", () => {
    const comp = formulation.liquid.components[0];
    expect(wettingRequest(polymer, comp, null).request).toEqual({ path: "/wetting", body: { solid: { smiles: "*CC(*)c1ccccc1" }, liquid: { smiles: "CC(C)=O" } } });
    expect(wettingRequest(polymer, null, { materialId: "SE-L14" }).request?.body.liquid).toEqual({ materialId: "SE-L14" });
    expect(wettingRequest(null, comp, null).request).toBeNull();
    expect(wettingRequest(polymer, null, null).reason).toContain("請選一種液體");
  });
});
