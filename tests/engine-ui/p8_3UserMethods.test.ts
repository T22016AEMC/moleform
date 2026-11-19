// 注意：scripts/golden/export-molGraph.ts 會掃描 tests/**/*.test.ts 內的單引號字串當作 SMILES 候選，本檔一律使用雙引號，避免動到黃金檔。
// 任務 P8-3：堆積係數 k 與參考聚合物 A 的資料層、引擎請求、面板列。k、Tg、密度都是測試用的假設值，不是材料數據。
import { describe, expect, it } from "vitest";
import { computeFormulation } from "../../src/core/formulation/compute";
import { parseFormulation, serializeFormulation } from "../../src/core/formulation/serialize";
import type { Formulation } from "../../src/core/formulation/types";
import { fromFormulation, packingKProblem, refTgProblem, toFormulation } from "../../src/ui/formulation/model";
import { componentDensityRequest, formulationRequests } from "../../src/ui/engine/propertyRequests";
import { componentDensityRows, formulationRows } from "../../src/ui/engine/propertyRows";

const UNIT = "[*:1]CC([*:2])c1ccccc1";
const UNIT_B = "[*:1]CC([*:2])(C)C(=O)OC";

function formulation(): Formulation {
  return {
    schemaVersion: 1,
    name: "t",
    solid: {
      unit: "wt",
      components: [
        {
          id: "p",
          name: "樹脂",
          canonicalSmiles: UNIT,
          category: "Resin",
          amount: 100,
          polymer: { mnInput: 10000 },
          packingK: 0.6,
          referencePolymer: { name: "參考", smiles: UNIT_B, tgC: 100, packingK: 0.62 },
        },
      ],
    },
    liquid: { unit: "g", components: [] },
  };
}

describe("堆積係數 k 與參考聚合物 A（P8-3）", () => {
  it("存檔再讀回、編輯狀態來回轉換不變", () => {
    const f = formulation();
    const r = parseFormulation(serializeFormulation(f));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.formulation.solid.components[0].packingK).toBe(0.6);
    expect(r.formulation.solid.components[0].referencePolymer).toEqual({ name: "參考", smiles: UNIT_B, tgC: 100, packingK: 0.62 });
    const back = toFormulation(fromFormulation(r.formulation));
    expect(back.solid.components[0].packingK).toBe(0.6);
    expect(back.solid.components[0].referencePolymer).toEqual(f.solid.components[0].referencePolymer);
  });

  it("不合法的 k 與 Tg 被拒、不寫入", () => {
    const bad = JSON.parse(serializeFormulation(formulation()));
    bad.solid.components[0].packingK = 1.5;
    expect(parseFormulation(JSON.stringify(bad)).ok).toBe(false);
    expect(packingKProblem("1")).not.toBeNull();
    expect(packingKProblem("0.6")).toBeNull();
    expect(refTgProblem("-300")).not.toBeNull();
    const state = fromFormulation(formulation());
    state.solidRows[0].packingKText = "abc";
    expect(toFormulation(state).solid.components[0].packingK).toBeUndefined();
  });

  it("請求帶 k、參考聚合物 A；共聚物密度送 units 不送 smiles", () => {
    const f = formulation();
    f.solid.components[0].polymer = { mnInput: 10000, units: [{ smiles: UNIT, fraction: 60 }, { smiles: UNIT_B, fraction: 40 }], fractionBasis: "wt" };
    const outcome = computeFormulation(f, { p: 10000 }, { unitWeights: { p: 102 } });
    const req = formulationRequests(f, outcome, { p: 10000 });
    const tgComp = (req.tgMixing?.body as { components: Record<string, unknown>[] }).components[0];
    expect(tgComp.packingK).toBe(0.6);
    expect(tgComp.referencePolymer).toEqual(f.solid.components[0].referencePolymer);
    const dens = (req.density?.body as { components: Record<string, unknown>[] }).components[0];
    expect(dens.smiles).toBeUndefined();
    expect(dens.units).toEqual(f.solid.components[0].polymer?.units);
    expect(dens.fractionBasis).toBe("wt");
    expect(dens.packingK).toBe(0.6);
    expect(componentDensityRequest(f.solid.components[0]).body).toEqual({ components: [{ name: "樹脂", w: 1, units: f.solid.components[0].polymer?.units, fractionBasis: "wt", packingK: 0.6 }] });
  });

  it("面板列：類別預設有標示；缺值寫缺什麼與可以怎麼補", () => {
    const rows = componentDensityRows({
      components: [
        { name: "A", density: 1.1, densitySource: "class", detail: "類別預設，非材料值（D57 類別「含芳香環」）" },
        { name: "B", density: null },
      ],
      missing: [{ index: 1, name: "B", reason: "莫耳體積表缺基團，算不出密度", remedy: "可以：填寫此成分的密度（文獻或供應商資料）" }],
    });
    expect(rows[0].quantity.source).toContain("類別預設，非材料值");
    expect(rows[1].quantity.status).toBe("missing");
    expect(rows[1].reason).toContain("莫耳體積表缺基團");
    expect(rows[1].reason).toContain("可以：");
    const tgRows = formulationRows({
      tgMixing: {
        ok: true,
        status: 200,
        body: {
          ok: true,
          quantity: { value: null, unit: "K", source: "Fox", status: "missing" },
          components: [{ id: "p", name: "樹脂", tgK: null, missingReason: "缺基團，算不出 Tg∞；Bondi FFV 相對 Tg（D61）條件不齊：需要參考聚合物 A 的 Tg（錨點）", fallback: { needs: ["參考聚合物 A 的 Tg（錨點）"] } }],
        },
      },
      mixReason: "x",
    });
    const tg = tgRows.find((r) => r.key === "tg-p");
    expect(tg?.reason).toContain("需要參考聚合物 A 的 Tg");
    expect(tg?.reason).toContain("可以：");
  });
});
