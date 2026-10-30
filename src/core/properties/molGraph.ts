// 把 RDKit 分子讀成簡單的圖（原子序、氫數、鄰居、芳香性），供基團切分使用。
import type { JSMol } from '../rdkit/types';

export interface MolGraph {
  /** 原子序；連接點（`*`）為 0 */
  z: number[];
  /** 隱含氫數 */
  hCount: number[];
  neighbors: number[][];
  aromatic: boolean[];
}

interface JsonAtom {
  z?: number;
  impHs?: number;
}
interface JsonMol {
  atoms: JsonAtom[];
  bonds: { atoms: [number, number] }[];
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
  for (const list of neighbors) list.sort((a, b) => a - b);
  const aromatic = new Array<boolean>(n).fill(false);
  const rep = m.extensions?.find((e) => e.name === 'rdkitRepresentation');
  for (const i of rep?.aromaticAtoms ?? []) aromatic[i] = true;
  return {
    z: m.atoms.map((a) => a.z ?? 6),
    hCount: m.atoms.map((a) => a.impHs ?? 0),
    neighbors,
    aromatic,
  };
}
