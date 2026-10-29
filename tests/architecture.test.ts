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