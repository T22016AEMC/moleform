// 【黃金基準，不供介面使用】任務 I05（PLAN 6A.3 第二步）：介面已改呼叫 Python 引擎（engine/moleform_core/mol_graph.py）。
// 本檔只供黃金檔匯出（scripts/golden/export-*.ts）與測試，直到使用者決定凍結黃金檔；src/ui、src/worker 不得引用（tests/architecture.test.ts 檢查）。
// 把 RDKit 分子讀成簡單的圖（原子序、氫數、鄰居、芳香性），供基團切分使用。
import type { JSMol } from '../rdkit/types';

export interface MolGraph {
  /** 原子序；連接點（`*`）為 0 */
  z: number[];
  /** 隱含氫數 */
  hCount: number[];
  neighbors: number[][];
  aromatic: boolean[];
  /** 有順反標示的雙鍵：鍵兩端原子（小的在前，以 'i-j' 為鍵）→ cis／trans（相對於各端的重原子鄰居）；沒有標示的雙鍵不在表中 */
  doubleBondStereo: Map<string, 'cis' | 'trans'>;
}

interface JsonAtom {
  z?: number;
  impHs?: number;
}
interface JsonMol {
  atoms: JsonAtom[];
  bonds: { atoms: [number, number]; stereo?: string }[];
  extensions?: { name: string; aromaticAtoms?: number[] }[];
}

export function readGraph(mol: JSMol): MolGraph {
  const parsed = JSON.parse(mol.get_json()) as { molecules: JsonMol[] };
  const m = parsed.molecules[0];
  const n = m.atoms.length;
  const neighbors: number[][] = Array.from({ length: n }, () => []);
  for (const b of m.bonds) {
    neighbors[b.atoms[0]].push(b.atoms[1]);
    neighbors[b.atoms[1]].push(b.atoms[0]);
  }
  const doubleBondStereo = new Map<string, 'cis' | 'trans'>();
  for (const b of m.bonds) {
    if (b.stereo === 'cis' || b.stereo === 'trans') doubleBondStereo.set(`${Math.min(...b.atoms)}-${Math.max(...b.atoms)}`, b.stereo);
  }
  for (const list of neighbors) list.sort((a, b) => a - b);
  const aromatic = new Array<boolean>(n).fill(false);
  const rep = m.extensions?.find((e) => e.name === 'rdkitRepresentation');
  for (const i of rep?.aromaticAtoms ?? []) aromatic[i] = true;
  return {
    z: m.atoms.map((a) => a.z ?? 6),
    hCount: m.atoms.map((a) => a.impHs ?? 0),
    neighbors,
    aromatic,
    doubleBondStereo,
  };
}
