// 注意：scripts/golden/export-molGraph.ts 會掃描 tests/**/*.test.ts 內的單引號字串當作 SMILES 候選，本檔一律使用雙引號，避免動到黃金檔。
// 任務 P6B：物性面板新增 Tm、Td、吸濕性（含相對濕度）與體積／彈性模數的請求與列。
import { describe, expect, it } from "vitest";
import { ALLOWED_PATHS } from "../../desktop/bridge.cjs";
import { DEFAULT_RH, MOISTURE_RH, thermalRequests } from "../../src/ui/engine/propertyRequests";
import { unitRows } from "../../src/ui/engine/propertyRows";
import type { EngineReply } from "../../src/ui/engine/engineClient";

const UNIT = "[*:1]CC[*:2]";
const SMALL = "CCO";

function reply(body: Record<string, unknown>): EngineReply {
  return { ok: true, status: 200, body: { ok: true, ...body } };
}

describe("Tm、Td、吸濕性、模數的請求", () => {
  it("聚合物單元送出 /tm、/td、/moisture（帶相對濕度）、/modulus；小分子不送出", () => {
    const reqs = thermalRequests({ canonicalSmiles: UNIT }, 0.5);
    expect(reqs.map((r) => r.path)).toEqual(["/tm", "/td", "/moisture", "/modulus"]);
    expect(reqs.find((r) => r.path === "/moisture")?.body).toEqual({ smiles: UNIT, rh: 0.5 });
    expect(thermalRequests({ canonicalSmiles: UNIT }).find((r) => r.path === "/moisture")?.body.rh).toBe(DEFAULT_RH);
    expect(thermalRequests({ canonicalSmiles: SMALL })).toEqual([]);
  });

  it("相對濕度只有 Table 18.14 的五個值；四個新端點都在橋接白名單內", () => {
    expect([...MOISTURE_RH]).toEqual([0.3, 0.5, 0.7, 0.9, 1.0]);
    for (const p of ["/tm", "/td", "/moisture", "/modulus"]) expect(ALLOWED_PATHS).toContain(p);
  });
});

describe("面板的列", () => {
  it("聚合物：四項都有列；缺值時顯示 missing 與原因", () => {
    const rows = unitRows(
      {
        "/tm": reply({ quantity: { value: 407.1, unit: "K", source: "Ym", status: "predicted" }, warnings: ["Tm 只在聚合物可結晶時有意義（未指定 crystallizable）"], notes: "備註" }),
        "/td": reply({ quantity: { value: null, unit: "K", source: "Yd", status: "missing" }, missing: [{ index: 3, description: "C，鄰居：*" }] }),
        "/moisture": reply({ rh: 0.7, quantity: { value: 5.97, unit: "g 水／100 g 聚合物", source: "Table 18.14", status: "predicted" }, warnings: ["書中括號值（不確定）：x"] }),
        "/modulus": reply({
          quantity: { value: null, unit: "GPa", source: "13.2.6", status: "missing" },
          moduli: {
            bulk: { value: null, unit: "GPa", source: "13.2.6", status: "missing", reason: "Table 14.4 沒有涵蓋的基團" },
            shear: { value: null, unit: "GPa", source: "14.12", status: "missing", reason: "書中沒有 U_H" },
            poisson: { value: null, unit: "", source: "13.2", status: "missing", reason: "需要 K 與 G" },
            young: { value: null, unit: "GPa", source: "13.2", status: "missing", reason: "需要 K 與 G" },
          },
          methods: [{ id: "rao", name: "方法一", equation: "式 13.30", status: "missing", value: null, reason: "缺基團", missing: [{ index: 1, description: "B" }] }],
        }),
      },
      true,
    );
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.tm?.quantity.value).toBe(407.1);
    expect(byKey.tm?.reason).toContain("可結晶");
    expect(byKey.td?.quantity.status).toBe("missing");
    expect(byKey.td?.reason).toContain("缺基團");
    expect(byKey.moisture?.label).toContain("RH 0.7");
    expect(byKey.moisture?.reason).toContain("括號值");
    expect(byKey.modulus?.quantity.value).toBeNull();
    expect(byKey.modulus?.reason).toContain("Table 14.4");
    expect(byKey["modulus-g"]?.reason).toContain("U_H");
    expect(byKey["modulus-e"]?.quantity.status).toBe("missing");
    expect(byKey["modulus-rao"]?.reason).toContain("缺基團");
  });

  it("彈性模數：K、G、ν、E 與各方法值都有列", () => {
    const rows = unitRows(
      {
        "/modulus": reply({
          quantity: { value: 5.23, unit: "GPa", source: "式 13.30", status: "predicted" },
          moduli: {
            bulk: { value: 5.23, unit: "GPa", source: "式 13.30", status: "predicted", basis: "單一方法（方法一）", reason: null },
            shear: { value: 1.24, unit: "GPa", source: "式 14.12", status: "predicted", reason: null },
            poisson: { value: 0.39, unit: "", source: "Table 13.2", status: "predicted", reason: null },
            young: { value: 3.45, unit: "GPa", source: "Table 13.2", status: "predicted", reason: null },
          },
          methods: [
            { id: "rao", name: "方法一", equation: "式 13.30", status: "predicted", value: 5.23 },
            { id: "gruneisen", name: "方法二", equation: "式 13.31", status: "not_implemented", reason: "不做方法二" },
          ],
          warnings: [],
        }),
      },
      true,
    );
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.modulus?.quantity.value).toBe(5.23);
    expect(byKey.modulus?.reason).toContain("單一方法");
    expect(byKey["modulus-g"]?.quantity.value).toBe(1.24);
    expect(byKey["modulus-nu"]?.quantity.value).toBe(0.39);
    expect(byKey["modulus-e"]?.quantity.value).toBe(3.45);
    expect(byKey["modulus-rao"]?.quantity.value).toBe(5.23);
    expect(byKey["modulus-gruneisen"]?.quantity.status).toBe("missing");
  });

  it("小分子：Tm、Td、吸濕量、模數顯示不適用與原因，不隱藏", () => {
    const rows = unitRows({}, false);
    for (const key of ["tm", "td", "moisture", "modulus"]) {
      const row = rows.find((r) => r.key === key);
      expect(row?.quantity.status).toBe("missing");
      expect(row?.reason).toContain("不適用");
    }
  });
});
