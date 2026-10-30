// 重複單元的 3D 片段（任務 024，D05）：把連接點 `*` 直接改成碳原子（去除原子映射編號）再補氫，當成小分子產生構象。
// 原子的順序與編號不變：原來的 `*` 原子變成甲基碳，留在原位置，所以 3D 的原子編號與 2D 單元圖一致。
// 端基不接在片段上，也不做聚合物鏈或寡聚物的 3D。純 TypeScript（需傳入 RDKit）。
import type { CommonChemJson, RDKitModule } from '../rdkit/types';
import { validateStructure } from '../structure/validate';
import { ELEMENTS, hillFormula } from './repeatUnit';

/** 連接點的 SMILES 寫法：`[*]`、`[*:n]` 或 `*` */
const ATTACHMENT_TOKEN = /\[\*(?::\d+)?\]|\*/g;

export interface UnitFragment {
  /** 封端後的 SMILES（與輸入的原子順序相同） */
  smiles: string;
  /** 封端後的 canonical SMILES（比較結構用） */
  canonicalSmiles: string;
  /** 封端後的分子式（Hill 順序，含氫） */
  formula: string;
  /** V2000 Molfile（2D 座標，原子順序與輸入的單元相同），交給 3D 構象產生器 */
  molblock: string;
  /** 原本是連接點、現在是封端甲基碳的原子（0 起算，與原子編號減 1 相同） */
  cappedAtoms: number[];
}

export type UnitFragmentOutcome = { ok: true; fragment: UnitFragment } | { ok: false; message: string };

const fail = (message: string): UnitFragmentOutcome => ({ ok: false, message });

/** 輸入一個含連接點的重複單元 SMILES，輸出以甲基封端的片段 */
export function capRepeatUnit(RDKit: RDKitModule, unitSmiles: string): UnitFragmentOutcome {
  const text = unitSmiles.trim();
  if (!ATTACHMENT_TOKEN.test(text)) return fail('這個結構沒有連接點（*），不是重複單元。');
  ATTACHMENT_TOKEN.lastIndex = 0;

  // 原本的連接點在原子順序中的位置（RDKit 讀 SMILES 時原子順序與文字中的出現順序相同）
  let original;
  try {
    original = RDKit.get_mol(text);
  } catch {
    original = null;
  }
  if (!original || !original.is_valid()) {
    original?.delete();
    return fail('無法解析這個重複單元。');
  }
  let cappedAtoms: number[];
  let originalZ: number[];
  try {
    const atoms = (JSON.parse(original.get_json()) as CommonChemJson).molecules[0].atoms;
    originalZ = atoms.map((a) => a.z ?? 6);
    cappedAtoms = originalZ.map((z, i) => (z === 0 ? i : -1)).filter((i) => i >= 0);
  } finally {
    original.delete();
  }

  // 每個連接點原子直接換成碳：文字位置不動，所以原子順序不變
  const capped = text.replace(ATTACHMENT_TOKEN, 'C');
  const v = validateStructure(RDKit, capped);
  if (!v.valid) return fail('連接點改成甲基後無法解析，無法產生單元片段的 3D。');

  const mol = RDKit.get_mol(capped);
  if (!mol) return fail('連接點改成甲基後無法解析，無法產生單元片段的 3D。');
  try {
    mol.add_hs_in_place();
    const counts = new Map<string, number>();
    const atoms = (JSON.parse(mol.get_json()) as CommonChemJson).molecules[0].atoms;
    for (const atom of atoms) {
      const symbol = ELEMENTS[atom.z ?? 6] ?? `#${atom.z}`;
      counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    }
    // 原子順序檢查：非連接點原子的元素不變，連接點原子都成為碳
    const sameOrder = originalZ.every((z, i) => (atoms[i]?.z ?? 6) === (z === 0 ? 6 : z));
    if (!sameOrder) return fail('封端後的原子順序與原結構不一致，無法產生單元片段的 3D。');
    return { ok: true, fragment: { smiles: capped, canonicalSmiles: v.canonicalSmiles, formula: hillFormula(counts), molblock: v.molblock, cappedAtoms } };
  } finally {
    mol.delete();
  }
}
