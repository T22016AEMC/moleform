// 任務 P7-1B 修正：反應原子標記只標配到對的官能基；引擎的原子編號換成顯示結構（分子工具 3D）的編號；催化劑配對的標籤。
// 只檢查顯示邏輯，不改規則與計算。引擎（Python）端的「催化劑配對」判定另有 engine/tests/test_p7_1b_rules.py。
// 注意：本檔的字串一律用雙引號（黃金檔 molGraph 只收單引號字串，新增測試字串用雙引號才不會讓既有案例編號位移）。
import { beforeAll, describe, expect, it } from "vitest";
import { atomCorrespondence, mapAtomsBetween } from "../../src/core/crosslink/atomMap";
import { reactiveAtomsOf } from "../../src/core/crosslink/draw";
import { pairedGroupIds } from "../../src/core/crosslink/pairedGroups";
import { PAIR_KIND_LABEL, VERDICT_LABEL, type CrosslinkResult } from "../../src/core/crosslink/types";
import { bundledTexts, loadTables } from "../../src/core/data/load";
import { getRDKit } from "../../src/core/rdkit/loader";
import type { CommonChemJson, RDKitModule } from "../../src/core/rdkit/types";
import { isChemRequest } from "../../src/worker/protocol";

let RDKit: RDKitModule;
const { tables } = loadTables(bundledTexts);
const groups = tables.functionalGroups.rows;
const rules = tables.reactionRules.rows;

beforeAll(async () => {
  RDKit = await getRDKit();
});

const BPA = "CC(C)(c1ccc(O)cc1)c1ccc(O)cc1";

function molblockOf(smiles: string): string {
  const mol = RDKit.get_mol(smiles);
  if (!mol) throw new Error(`SMILES 無法解析：${smiles}`);
  try {
    return mol.get_molblock();
  } finally {
    mol.delete();
  }
}

/** 結構（SMILES 或 Molfile）第 i 個原子的原子序 */
function atomicNumbers(source: string): number[] {
  const mol = RDKit.get_mol(source);
  if (!mol) throw new Error(`結構無法解析：${source}`);
  try {
    return (JSON.parse(mol.get_json()) as CommonChemJson).molecules[0].atoms.map((a) => a.z ?? 6);
  } finally {
    mol.delete();
  }
}

const end = (componentId: string, groupId: string) => ({ componentId, name: componentId, groupId, isPolymer: false, f: 2, perUnit: null, perChain: null });
const pair = (a: ReturnType<typeof end>, b: ReturnType<typeof end> | null) => ({ ruleId: "x", a, b });

describe("修正 2a：只標目前配方中配到對的官能基", () => {
  it("pairedGroupIds：取自引擎的反應配對，可只取某個成分", () => {
    const result = {
      pairs: [pair(end("epoxy", "ether.epoxide"), end("bpa", "hydroxyl.phenolic")), pair(end("bpa", "hydroxymethyl.phenolic"), null)],
    } as unknown as Pick<CrosslinkResult, "pairs">;
    expect(pairedGroupIds(result)).toEqual(["ether.epoxide", "hydroxyl.phenolic", "hydroxymethyl.phenolic"]);
    expect(pairedGroupIds(result, "epoxy")).toEqual(["ether.epoxide"]);
    expect(pairedGroupIds(result, "bpa")).toEqual(["hydroxyl.phenolic", "hydroxymethyl.phenolic"]);
    expect(pairedGroupIds(null)).toEqual([]);
    expect(pairedGroupIds({ pairs: [] })).toEqual([]);
  });

  it("雙酚 A 在環氧配方中：只標酚羥基的 O，不標鄰／對位空位的 C–H", () => {
    const all = reactiveAtomsOf(RDKit, BPA, groups, rules); // 舊行為：所有已登錄的官能基
    const paired = reactiveAtomsOf(RDKit, BPA, groups, rules, false, new Set(["hydroxyl.phenolic"]));
    expect(paired).toEqual([7, 14]);
    expect(all.length).toBeGreaterThan(paired.length); // 舊行為多標了酚環空位
    for (const a of paired) expect(atomicNumbers(BPA)[a]).toBe(8);
  });

  it("沒有配到對的官能基：什麼都不標", () => {
    expect(reactiveAtomsOf(RDKit, BPA, groups, rules, false, new Set())).toEqual([]);
    expect(reactiveAtomsOf(RDKit, BPA, groups, rules, false, new Set(["ether.epoxide"]))).toEqual([]);
  });

  it("沒給 onlyGroups 時行為不變（標所有已登錄的官能基）", () => {
    expect(reactiveAtomsOf(RDKit, BPA, groups, rules, false, null)).toEqual(reactiveAtomsOf(RDKit, BPA, groups, rules));
  });
});

describe("修正 2b：引擎的原子編號與顯示結構的編號一致", () => {
  it("小分子、編號沒有差異（同一份 SMILES）：編號不變", () => {
    expect(atomCorrespondence(RDKit, "CCO", "CCO")).toEqual([0, 1, 2]);
    expect(mapAtomsBetween(RDKit, "CCO", "CCO", [2])).toEqual([2]);
    const mol = molblockOf("CCO"); // Molfile 的原子順序與 SMILES 相同
    expect(mapAtomsBetween(RDKit, "CCO", mol, [2])).toEqual([2]);
  });

  it("編號有差異：Molfile 的原子順序與 canonical SMILES 不同時，換成 Molfile 的編號", () => {
    // 引擎用 canonical SMILES「Cc1ccccc1O」，酚羥基的 O 是第 7 個原子；使用者畫的 Molfile 是「Oc1ccccc1C」，O 是第 0 個原子
    const engineSource = "Cc1ccccc1O";
    const display = molblockOf("Oc1ccccc1C");
    expect(atomicNumbers(engineSource)[7]).toBe(8);
    expect(atomicNumbers(display)[0]).toBe(8);
    const mapped = mapAtomsBetween(RDKit, engineSource, display, [7]);
    expect(mapped).toEqual([0]);
    // 不換的話，第 7 個原子在顯示結構上是環碳，會標到錯的原子
    expect(atomicNumbers(display)[7]).not.toBe(8);
  });

  it("標記的原子換編號後，元素與反應官能基仍一致（多個位點）", () => {
    const engineSource = BPA; // 引擎端：酚羥基 O 是第 7、14 個原子
    const display = molblockOf("Oc1ccc(cc1)C(C)(C)c1ccc(O)cc1"); // 另一種原子順序的同一個分子
    const mapped = mapAtomsBetween(RDKit, engineSource, display, [7, 14]);
    expect(mapped).not.toBeNull();
    const zs = atomicNumbers(display);
    expect(mapped!.map((i) => zs[i])).toEqual([8, 8]);
    // 與直接在顯示結構上找官能基的結果相同（工具 3D 走這條路）
    expect(mapped).toEqual(reactiveAtomsOf(RDKit, display, groups, rules, false, new Set(["hydroxyl.phenolic"])));
  });

  it("不是同一個分子時回傳 null（呼叫端改畫 SMILES 結構）", () => {
    expect(atomCorrespondence(RDKit, "CCO", "CCC")).toBeNull();
    expect(mapAtomsBetween(RDKit, "CCO", "CCCO", [2])).toBeNull();
    expect(mapAtomsBetween(RDKit, "not a smiles", "CCO", [0])).toBeNull();
  });
});

describe("Worker 請求格式與標籤", () => {
  it("groupIds 必須是字串陣列（或不給）", () => {
    expect(isChemRequest({ type: "reactiveAtoms", id: 1, source: "CCO", groupIds: ["hydroxyl.phenolic"] })).toBe(true);
    expect(isChemRequest({ type: "reactiveAtoms", id: 1, source: "CCO" })).toBe(true);
    expect(isChemRequest({ type: "reactiveAtoms", id: 1, source: "CCO", groupIds: [1] })).toBe(false);
    expect(isChemRequest({ type: "unitFragment", id: 1, smiles: "[*:1]CC[*:2]", groupIds: "x" })).toBe(false);
    expect(isChemRequest({ type: "draw", id: 1, source: "CCO", width: 1, height: 1, color: "#000000", mark: true, polymer: false, groupIds: [] })).toBe(true);
  });

  it("催化劑配對的標籤不是「具封端」（修正 1）", () => {
    expect(PAIR_KIND_LABEL.catalyst).toBe("催化劑配對（不計當量）");
    expect(PAIR_KIND_LABEL.catalyst).not.toContain("封端");
    expect(VERDICT_LABEL.catalyst).not.toContain("封端");
  });
});
