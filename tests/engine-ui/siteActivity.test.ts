// 注意：scripts/golden/export-molGraph.ts 會掃描 tests/**/*.test.ts 內的單引號字串當作 SMILES 候選，本檔一律使用雙引號，避免動到黃金檔。
// 位點活性（任務 P7-5）：橋接白名單含 /pka 與 /crosslink/site-activity；請求本文只搬運該成分的結構與官能基位點；兩個排序分開、不合併。
import { describe, expect, it } from "vitest";
import { ALLOWED_PATHS } from "../../desktop/bridge.cjs";
import type { CrosslinkResult } from "../../src/core/crosslink/types";
import { SITE_TWO_RANKINGS_NOTE } from "../../src/ui/crosslink/siteActivityText";
import { siteActivityBody } from "../../src/ui/engine/crosslinkEngine";

describe("橋接白名單含 pKa 與位點活性端點", () => {
  it("/pka 與 /crosslink/site-activity 在白名單內", () => {
    expect(ALLOWED_PATHS).toContain("/pka");
    expect(ALLOWED_PATHS).toContain("/crosslink/site-activity");
  });
});

describe("位點活性請求本文", () => {
  const result = {
    components: [
      { id: "A", name: "雙酚", isPolymer: false, source: "Oc1ccccc1", groups: [{ groupId: "hydroxyl.phenolic", sites: [[0]] }], units: null, problem: null, molarMass: 94.1 },
      { id: "B", name: "聚合物", isPolymer: true, source: "[*:1]CC([*:2])c1ccc(O)cc1", groups: [], units: [{ smiles: "[*:1]CC([*:2])c1ccc(O)cc1", molFraction: 1, groups: [{ groupId: "hydroxyl.phenolic", sites: [[8]] }] }], problem: null },
    ],
  } as unknown as CrosslinkResult;

  it("只帶該成分的結構與官能基位點，不帶質量與其他成分", () => {
    expect(siteActivityBody(result, "A")).toEqual({
      components: [{ id: "A", name: "雙酚", isPolymer: false, source: "Oc1ccccc1", groups: [{ groupId: "hydroxyl.phenolic", sites: [[0]] }] }],
    });
  });

  it("聚合物帶各單元的結構與位點（不帶莫耳分率）", () => {
    const body = siteActivityBody(result, "B") as { components: { units: unknown[] }[] };
    expect(body.components[0].units).toEqual([{ smiles: "[*:1]CC([*:2])c1ccc(O)cc1", groups: [{ groupId: "hydroxyl.phenolic", sites: [[8]] }] }]);
  });

  it("沒有交聯結果或找不到成分時不送請求", () => {
    expect(siteActivityBody(null, "A")).toBeNull();
    expect(siteActivityBody(result, "Z")).toBeNull();
  });
});

describe("兩個排序分開、不合成單一分數", () => {
  it("說明文字明講不合成", () => {
    expect(SITE_TWO_RANKINGS_NOTE).toContain("兩個分開的排序");
    expect(SITE_TWO_RANKINGS_NOTE).toContain("不合成單一分數");
  });
});
