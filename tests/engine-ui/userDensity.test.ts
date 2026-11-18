// 任務 P7-4a：成分密度輸入的資料層測試。密度數字都是測試用的假設值，不是材料數據。
import { describe, expect, it } from "vitest";
import { parseFormulation, serializeFormulation } from "../../src/core/formulation/serialize";
import type { Formulation } from "../../src/core/formulation/types";
import { densityProblem, fromFormulation, toFormulation } from "../../src/ui/formulation/model";
import { formulationRequests, userDensityFields } from "../../src/ui/engine/propertyRequests";

const base = (extra: Record<string, unknown>) =>
  JSON.stringify({
    schemaVersion: 1,
    name: "t",
    solid: { unit: "g", components: [{ id: "a", name: "A", canonicalSmiles: "CC", category: "Small Molecule", amount: 1, ...extra }] },
    liquid: { unit: "g", components: [] },
  });

describe("成分密度（P7-4a）", () => {
  it("舊配方沒有密度欄位，照舊載入", () => {
    const r = parseFormulation(base({}));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.formulation.solid.components[0].density).toBeUndefined();
  });

  it("密度與來源寫入再讀回", () => {
    const r = parseFormulation(base({ density: 1.1, densitySource: "測試用" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const again = parseFormulation(serializeFormulation(r.formulation));
    expect(again.ok && again.formulation.solid.components[0].density).toBe(1.1);
    const state = fromFormulation(r.formulation);
    expect(state.solidRows[0].densityText).toBe("1.1");
    const back: Formulation = toFormulation(state);
    expect(back.solid.components[0].density).toBe(1.1);
    expect(back.solid.components[0].densitySource).toBe("測試用");
  });

  it("非正數密度被拒", () => {
    for (const bad of [0, -2, "1.2"]) expect(parseFormulation(base({ density: bad })).ok).toBe(false);
    expect(densityProblem("0")).not.toBeNull();
    expect(densityProblem("-1")).not.toBeNull();
    expect(densityProblem("abc")).not.toBeNull();
    expect(densityProblem("")).toBeNull();
    expect(densityProblem("1.2")).toBeNull();
  });

  it("無效密度不寫入配方、也不送引擎", () => {
    const r = parseFormulation(base({ density: 1.1 }));
    if (!r.ok) throw new Error("load");
    const state = fromFormulation(r.formulation);
    state.solidRows[0].densityText = "-3";
    expect(toFormulation(state).solid.components[0].density).toBeUndefined();
    expect(userDensityFields({ density: -3 })).toEqual({});
  });

  it("混合請求帶 userDensity 與來源", () => {
    const r = parseFormulation(base({ density: 1.1, densitySource: "測試用" }));
    if (!r.ok) throw new Error("load");
    const req = formulationRequests(r.formulation, null, {});
    expect(req.density).toBeNull(); // 沒有換算結果時不混合
    expect(userDensityFields(r.formulation.solid.components[0])).toEqual({ userDensity: 1.1, userDensitySource: "測試用" });
  });
});
