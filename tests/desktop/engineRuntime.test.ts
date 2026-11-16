// 內嵌引擎打包設定檢查（任務 I02）。字串一律用雙引號（golden-fresh 會掃單引號字串當 SMILES）。
import { describe, expect, it } from "vitest";
import requirements from "../../engine/requirements.txt?raw";
import lockText from "../../scripts/embed-python.lock.json?raw";
import desktopPkg from "../../desktop/package.json";

describe("embedded engine runtime (I02)", () => {
  it("requirements.txt pins every package with sha256 hashes", () => {
    const lines = requirements.split(/\r?\n/);
    const pkgs = lines.filter((l: string) => /^[A-Za-z]/.test(l));
    expect(pkgs.length).toBeGreaterThanOrEqual(4);
    for (const l of pkgs) {
      expect(l).toMatch(/^[A-Za-z0-9_.-]+==[0-9.]+/);
      expect(l.endsWith("\\")).toBe(true);
    }
    const hashes = requirements.match(/--hash=sha256:[0-9a-f]{64}/g) ?? [];
    expect(hashes.length).toBeGreaterThanOrEqual(pkgs.length);
  });

  it("embeddable Python lock is pinned by version and sha256", () => {
    const lock = JSON.parse(lockText);
    expect(lock.version).toMatch(/^3\.\d+\.\d+$/);
    expect(lock.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(lock.url).toContain(`python-${lock.version}-embed-amd64.zip`);
  });

  it("desktop build assembles the runtime before packaging and ships it", () => {
    expect(desktopPkg.scripts.dist).toContain("assemble-engine");
    expect(JSON.stringify(desktopPkg.build.extraResources)).toContain("engine-runtime");
  });
});
