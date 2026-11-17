/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// 以 Vite 的 import.meta.glob 讀入 src/core 的原始碼（不需要 Node 型別）
const coreSources = import.meta.glob<string>('../src/core/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** 找出 import / export-from / require / 動態 import 的來源字串。 */
function importSpecifiers(source: string): string[] {
  const re = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
  return [...source.matchAll(re)].map((m) => m[1]);
}

/** 回傳違規的引用（react、react-dom、或指向 ui/ 的路徑）。 */
export function findForbiddenImports(source: string): string[] {
  return importSpecifiers(source).filter(
    (s) =>
      s === 'react' ||
      s.startsWith('react/') ||
      s === 'react-dom' ||
      s.startsWith('react-dom/') ||
      /(^|\/)ui(\/|$)/.test(s),
  );
}

describe('架構：src/core 不得依賴 React 或 src/ui', () => {
  it('src/core 底下所有檔案都沒有違規引用', () => {
    const entries = Object.entries(coreSources);
    expect(entries.length).toBeGreaterThan(0);
    for (const [file, source] of entries) {
      expect(findForbiddenImports(source), file).toEqual([]);
    }
  });

  it('反例：引用 react 會被判定為違規', () => {
    expect(findForbiddenImports(`import React from 'react';`)).toEqual(['react']);
    expect(findForbiddenImports(`import { createRoot } from "react-dom/client";`)).toHaveLength(1);
  });

  it('反例：引用 src/ui 會被判定為違規', () => {
    expect(findForbiddenImports(`import { App } from '../ui/App';`)).toHaveLength(1);
  });

  it('正常引用不會誤判', () => {
    expect(findForbiddenImports(`import { x } from './helpers';`)).toEqual([]);
  });
});

// 任務 I05：介面（src/ui、src/worker）不得再引用已切到 Python 引擎的 TypeScript 計算。這些檔案只供黃金檔匯出與測試（黃金基準）。
// 允許的 B 類（即時輸入回饋、配方換算、文字標籤）與型別不在此列。
const uiSources = {
  ...import.meta.glob<string>("../src/ui/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob<string>("../src/worker/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }),
};

/** 每個 import（不含 import type）的來源與名稱 */
function valueImports(source: string): { from: string; names: string[] }[] {
  const re = /import\s+(?!type\b)(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  return [...source.matchAll(re)].map((m) => ({
    from: m[2],
    names: m[1].split(",").map((n) => n.trim().replace(/\s+as\s+.*$/, "")).filter((n) => n !== "" && !n.startsWith("type ")),
  }));
}

const BASELINE_MODULES = [/core\/properties\//, /core\/crosslink\/analyze$/, /core\/crosslink\/judge$/, /core\/crosslink\/layer1\/millerMacosko$/];
const BASELINE_NAMES: [RegExp, string[]][] = [
  [/core\/crosslink\/layer1\/layer1$/, ["computeLayer1", "buildSystem", "ratioText"]],
  [/core\/crosslink\/layer1\/stoich$/, ["scanRatio", "stoichiometricSetup", "setupAtRatio", "scaleSideB", "scanValue"]],
  [/core\/crosslink\/layer1\/prepare$/, ["prepareLayer1"]],
];

/** 回傳違規的引用說明 */
export function findBaselineImports(source: string): string[] {
  const bad: string[] = [];
  for (const { from, names } of valueImports(source)) {
    if (BASELINE_MODULES.some((re) => re.test(from))) bad.push(from);
    for (const [re, forbidden] of BASELINE_NAMES) if (re.test(from)) bad.push(...names.filter((n) => forbidden.includes(n)).map((n) => `${from}:${n}`));
  }
  return bad;
}

describe("架構：介面不得引用黃金基準的 TypeScript 計算（I05）", () => {
  it("src/ui 與 src/worker 底下所有檔案都沒有違規引用", () => {
    const entries = Object.entries(uiSources);
    expect(entries.length).toBeGreaterThan(0);
    for (const [file, source] of entries) expect(findBaselineImports(source), file).toEqual([]);
  });

  it("反例：引用物性計算、第 0 層分析與第 1 層計算會被判定為違規", () => {
    expect(findBaselineImports(`import { computeTg } from "../../core/properties/tgGroupContribution";`)).toHaveLength(1);
    expect(findBaselineImports(`import { analyzeCrosslink } from "../core/crosslink/analyze";`)).toHaveLength(1);
    expect(findBaselineImports(`import { computeLayer1, groupTotals } from "../../core/crosslink/layer1/layer1";`)).toEqual(["../../core/crosslink/layer1/layer1:computeLayer1"]);
    expect(findBaselineImports(`import { scanRatio } from "../../core/crosslink/layer1/stoich";`)).toHaveLength(1);
    expect(findBaselineImports(`import { prepareLayer1, describeAmounts } from "../../core/crosslink/layer1/prepare";`)).toEqual(["../../core/crosslink/layer1/prepare:prepareLayer1"]);
  });

  it("允許的引用不會誤判（B 類函式、型別）", () => {
    expect(findBaselineImports(`import { groupTotals } from "../../core/crosslink/layer1/layer1";`)).toEqual([]);
    expect(findBaselineImports(`import { checkScanSettings, defaultScanSettings, type ScanResult } from "../../core/crosslink/layer1/stoich";`)).toEqual([]);
    expect(findBaselineImports(`import { describeAmounts, type PrepareOutcome } from "../../core/crosslink/layer1/prepare";`)).toEqual([]);
    expect(findBaselineImports(`import type { CrosslinkResult } from "../../core/crosslink/types";`)).toEqual([]);
  });
});
