// 測試用 Molfile 產生器：手工組出 V2000／V3000 文字，用來測試查詢、R 基團等特徵的辨識。
// 座標只是排版用的假值，不代表任何真實結構。

export interface MolSpec {
  atoms: string[];
  /** [原子序號 1 起算, 原子序號, 鍵型] */
  bonds: [number, number, number][];
  /** 加在 M  END 之前的屬性行（V2000） */
  extra?: string[];
}

const pad = (s: string | number, n: number) => String(s).padStart(n, ' ');

export function v2000({ atoms, bonds, extra = [] }: MolSpec): string {
  const lines = ['', '  test', '', `${pad(atoms.length, 3)}${pad(bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000`];
  atoms.forEach((symbol, i) => {
    const x = (i * 1.25).toFixed(4);
    lines.push(`${pad(x, 10)}${pad('0.0000', 10)}${pad('0.0000', 10)} ${symbol.padEnd(3, ' ')} 0  0  0  0  0  0  0  0  0  0  0  0`);
  });
  for (const [a, b, type] of bonds) lines.push(`${pad(a, 3)}${pad(b, 3)}${pad(type, 3)}  0`);
  lines.push(...extra, 'M  END', '');
  return lines.join('\n');
}

export function v3000({ atoms, bonds }: MolSpec): string {
  const lines = ['', '  test', '', '  0  0  0     0  0            999 V3000', 'M  V30 BEGIN CTAB', `M  V30 COUNTS ${atoms.length} ${bonds.length} 0 0 0`];
  if (atoms.length) {
    lines.push('M  V30 BEGIN ATOM');
    atoms.forEach((symbol, i) => lines.push(`M  V30 ${i + 1} ${symbol} ${(i * 1.25).toFixed(4)} 0 0 0`));
    lines.push('M  V30 END ATOM');
  }
  if (bonds.length) {
    lines.push('M  V30 BEGIN BOND');
    bonds.forEach(([a, b, type], i) => lines.push(`M  V30 ${i + 1} ${type} ${a} ${b}`));
    lines.push('M  V30 END BOND');
  }
  lines.push('M  V30 END CTAB', 'M  END', '');
  return lines.join('\n');
}
