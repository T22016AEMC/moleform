// 聚合物端基的分析與換算（任務 022，D50）。純 TypeScript（需傳入 RDKit）。
// 端基 SMILES 恰好一個 `*`（不需要原子映射編號）；端基質量 M_end 的算法與重複單元的 M_unit 相同（RDKit 平均分子量，`*` 質量為 0）。
// 端基只填鏈盡頭多出來的部分；已經畫在重複單元裡的原子不要重複填。分子量只用於計算，不顯示（D09）。
import type { RDKitModule } from '../rdkit/types';
import { END_GROUP_NOTE, type EndGroup, type PolymerSpec } from './types';

export interface EndInfo {
  smiles: string;
  /** 端基質量（g/mol），不含 `*` */
  mEnd: number;
}

export type EndGroupsAnalysis =
  | {
      ok: true;
      /** 端基 1、端基 2；沒填為 null */
      ends: [EndInfo | null, EndInfo | null];
      /** 已填端基的質量合計 M_ends */
      mEnds: number;
      filled: [boolean, boolean];
    }
  | { ok: false; message: string };

/** 分析一個端基；回傳端基質量，或指出是端基 1／2 的中文錯誤 */
export function analyzeEndGroup(RDKit: RDKitModule, end: EndGroup, which: 1 | 2): { ok: true; info: EndInfo } | { ok: false; message: string } {
  const label = `端基 ${which}`;
  const text = end.smiles.trim();
  if (text === '') return { ok: false, message: `${label}：尚未輸入 SMILES。` };
  let mol;
  try {
    mol = RDKit.get_mol(text);
  } catch {
    mol = null;
  }
  if (!mol || !mol.is_valid()) {
    mol?.delete();
    return { ok: false, message: `${label}：無法解析這個結構。` };
  }
  try {
    const molecule = (JSON.parse(mol.get_json()) as { molecules: { atoms: { z?: number }[]; bonds: { atoms: [number, number] }[] }[] }).molecules[0];
    const dummies = molecule.atoms.map((a, i) => (a.z === 0 ? i : -1)).filter((i) => i >= 0);
    if (dummies.length !== 1) {
      return { ok: false, message: `${label}：端基需要恰好一個連接點（*），目前有 ${dummies.length} 個。` };
    }
    const d = dummies[0];
    if (!molecule.bonds.some((b) => b.atoms.includes(d))) return { ok: false, message: `${label}：連接點（*）沒有連到任何原子。` };
    const amw = (JSON.parse(mol.get_descriptors()) as { amw?: number }).amw;
    if (typeof amw !== 'number' || !Number.isFinite(amw) || amw <= 0) return { ok: false, message: `${label}：無法計算端基的分子量。` };
    return { ok: true, info: { smiles: text, mEnd: amw } };
  } finally {
    mol.delete();
  }
}

/** 分析兩端的端基（沒填的略過）。M_ends = 已填端基的質量合計 */
export function analyzeEndGroups(RDKit: RDKitModule, spec: Pick<PolymerSpec, 'endGroups'> | undefined | null): EndGroupsAnalysis {
  const ends: [EndInfo | null, EndInfo | null] = [null, null];
  let mEnds = 0;
  for (const which of [1, 2] as const) {
    const end = spec?.endGroups?.[which === 1 ? 'end1' : 'end2'];
    if (!end) continue;
    const r = analyzeEndGroup(RDKit, end, which);
    if (!r.ok) return r;
    ends[which - 1] = r.info;
    mEnds += r.info.mEnd;
  }
  return { ok: true, ends, mEnds, filled: [ends[0] !== null, ends[1] !== null] };
}

/** 結果附註：兩端都填 → 無；都不填 → 「未計入端基」；只填一端 → 「端基 N 未填，未計入」 */
export function endGroupNote(filled: readonly [boolean, boolean]): string {
  if (filled[0] && filled[1]) return '';
  if (!filled[0] && !filled[1]) return END_GROUP_NOTE;
  return `端基 ${filled[0] ? 2 : 1} 未填，未計入`;
}
