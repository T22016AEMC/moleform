// 判斷結構能不能做 3D（任務 011 B-8）。只看 Molfile 文字，不載入 OpenChemLib，所以可放在首頁的程式碼中。

/** 重原子超過這個數目時，先請使用者確認再計算 */
export const LARGE_MOLECULE_HEAVY_ATOMS = 100;

export const MESSAGE_CONNECTION_POINT = '含連接點的重複單元不提供 3D（3D 只用於單體與小分子，D05）';
export const MESSAGE_NO_STRUCTURE = '尚未輸入有效的結構，無法產生 3D。';
export const MESSAGE_LARGE_MOLECULE = '分子較大，3D 計算可能需要較長時間。';

export type ConformerSupport =
  | { supported: true; heavyAtoms: number; needsConfirm: boolean }
  | { supported: false; reason: string };

/** 讀 V2000 Molfile 的原子區塊；回傳元素符號清單，無法讀取時回傳 null。 */
function atomSymbols(molblock: string): string[] | null {
  const lines = molblock.replace(/\r\n?/g, '\n').split('\n');
  const counts = lines[3] ?? '';
  if (!/V2000/.test(counts)) return null;
  const atomCount = parseInt(counts.slice(0, 3), 10);
  if (!Number.isFinite(atomCount) || atomCount <= 0) return null;
  const symbols: string[] = [];
  for (let i = 0; i < atomCount; i++) {
    const line = lines[4 + i];
    if (line === undefined) return null;
    symbols.push(line.slice(31, 34).trim());
  }
  return symbols;
}

/** 檢查驗證後的 Molfile（任務 010 的輸出：V2000）能不能做 3D。 */
export function checkConformerSupport(molblock: string | null | undefined): ConformerSupport {
  if (!molblock || molblock.trim() === '') return { supported: false, reason: MESSAGE_NO_STRUCTURE };
  const symbols = atomSymbols(molblock);
  if (!symbols) return { supported: false, reason: MESSAGE_NO_STRUCTURE };
  // 連接點：`*`（任務 010 把 RDKit 的虛原子 R 改寫成 *）
  if (symbols.some((s) => s === '*' || s === 'R' || s === 'R#')) {
    return { supported: false, reason: MESSAGE_CONNECTION_POINT };
  }
  const heavyAtoms = symbols.filter((s) => s !== 'H' && s !== 'D' && s !== 'T').length;
  if (heavyAtoms === 0) return { supported: false, reason: MESSAGE_NO_STRUCTURE };
  return { supported: true, heavyAtoms, needsConfirm: heavyAtoms > LARGE_MOLECULE_HEAVY_ATOMS };
}
