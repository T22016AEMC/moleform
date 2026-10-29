// 3D 構象產生與 MMFF94 最佳化（Phase 2.5）。純 TypeScript，Worker 與 Node 測試共用。
// 呼叫端要先註冊 OpenChemLib 的 resources.json（Worker：Resources.registerFromUrl；Node：registerFromNodejs）。
import { ConformerGenerator, ForceFieldMMFF94, Molecule } from 'openchemlib';
import { NOT_OPTIMIZED_NOTE, type ConformerBatch, type ConformerRecord } from './types';

/** 固定種子，結果可重現（任務 011 B-6） */
export const DEFAULT_SEED = 42;
export const DEFAULT_CONFORMER_COUNT = 5;
export const MORE_CONFORMER_STEP = 5;
export const MAX_CONFORMERS = 30;
/**
 * 構象合併閾值（Å）：重原子之間「全部原子對距離」的均方根差在此以內視為同一構象。
 * 用距離矩陣比較，與旋轉、平移無關，不需要先疊合。
 */
export const MERGE_RMS_ANGSTROM = 0.1;
/** 產生器嘗試次數上限（含被合併掉的），避免在重複構象很多時一直跑 */
const MAX_ATTEMPTS = MAX_CONFORMERS * 2;

export class ConformerError extends Error {}

interface Kept {
  molfile: string;
  heavyDistances: number[];
  energy: number | null;
  converged: boolean;
}

const now = () => performance.now();

function heavyIndices(mol: Molecule): number[] {
  const indices: number[] = [];
  for (let i = 0; i < mol.getAllAtoms(); i++) if (mol.getAtomicNo(i) !== 1) indices.push(i);
  return indices;
}

/** 重原子兩兩距離（上三角） */
function distanceVector(mol: Molecule, heavy: number[]): number[] {
  const out: number[] = [];
  for (let a = 0; a < heavy.length; a++) {
    for (let b = a + 1; b < heavy.length; b++) {
      out.push(
        Math.hypot(
          mol.getAtomX(heavy[a]) - mol.getAtomX(heavy[b]),
          mol.getAtomY(heavy[a]) - mol.getAtomY(heavy[b]),
          mol.getAtomZ(heavy[a]) - mol.getAtomZ(heavy[b]),
        ),
      );
    }
  }
  return out;
}

function rmsDifference(a: number[], b: number[]): number {
  if (a.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum / a.length);
}

/** 一個分子的構象工作階段：同一個產生器連續呼叫 generate()，可逐步增加構象（種子固定，結果可重現）。 */
export class ConformerSession {
  readonly seed: number;
  readonly heavyAtoms: number;
  readonly inputAtoms: number;
  private readonly generator: ConformerGenerator;
  private readonly kept: Kept[] = [];
  private optimizeBlocked: string | null = null;
  private exhausted = false;
  private attempts = 0;

  constructor(molblock: string, seed = DEFAULT_SEED) {
    this.seed = seed;
    let mol: Molecule;
    try {
      mol = Molecule.fromMolfile(molblock);
    } catch (e) {
      throw new ConformerError(`無法讀取結構：${e instanceof Error ? e.message : String(e)}`);
    }
    this.inputAtoms = mol.getAllAtoms();
    this.heavyAtoms = heavyIndices(mol).length;
    this.generator = new ConformerGenerator(seed);
    if (!this.generator.initializeConformers(mol)) {
      throw new ConformerError('無法產生 3D 構象（結構有問題，或此結構不在 OpenChemLib 支援的範圍）。');
    }
  }

  /**
   * 產生構象直到累計達 target 個（上限 MAX_CONFORMERS）或產生器已無新構象。
   * onProgress(done, total)：已累計的構象數與目標數。
   */
  generate(target: number, onProgress?: (done: number, total: number) => void): ConformerBatch {
    const goal = Math.min(Math.max(1, Math.floor(target)), MAX_CONFORMERS);
    const before = this.kept.length;
    let merged = 0;
    let generationMs = 0;
    let optimizationMs = 0;

    while (this.kept.length < goal && !this.exhausted && this.attempts < MAX_ATTEMPTS) {
      const t0 = now();
      const conformer = this.generator.getNextConformerAsMolecule();
      generationMs += now() - t0;
      if (!conformer) {
        this.exhausted = true;
        break;
      }
      this.attempts++;

      let energy: number | null = null;
      let converged = true;
      if (this.optimizeBlocked === null) {
        const t1 = now();
        try {
          const field = new ForceFieldMMFF94(conformer, 'MMFF94');
          converged = field.minimise() === 0;
          energy = field.getTotalEnergy();
        } catch (e) {
          // 缺參數（例如硼、部分價態的硫）：這個分子改用未最佳化的初始構象（K07）
          this.optimizeBlocked = e instanceof Error ? e.message : String(e);
          energy = null;
          converged = true;
        }
        optimizationMs += now() - t1;
      }

      // 最佳化失敗時，先前已保留的（最佳化過的）構象不會出現，因為失敗發生在第一個構象
      const heavyDistances = distanceVector(conformer, heavyIndices(conformer));
      const duplicate = this.kept.some((k) => rmsDifference(k.heavyDistances, heavyDistances) <= MERGE_RMS_ANGSTROM);
      if (duplicate) {
        merged++;
        continue;
      }
      this.kept.push({ molfile: conformer.toMolfile(), heavyDistances, energy, converged });
      onProgress?.(this.kept.length, goal);
    }

    return {
      seed: this.seed,
      conformers: this.records(),
      added: this.kept.length - before,
      merged,
      exhausted: this.exhausted || (this.attempts >= MAX_ATTEMPTS && this.kept.length < goal),
      optimized: this.optimizeBlocked === null,
      optimizationNote: this.optimizeBlocked === null ? null : NOT_OPTIMIZED_NOTE,
      timing: { generationMs, optimizationMs },
      heavyAtoms: this.heavyAtoms,
      inputAtoms: this.inputAtoms,
    };
  }

  private records(): ConformerRecord[] {
    const optimized = this.optimizeBlocked === null;
    const ordered = optimized
      ? [...this.kept].sort((a, b) => (a.energy as number) - (b.energy as number))
      : [...this.kept];
    const lowest = optimized && ordered.length ? (ordered[0].energy as number) : 0;
    return ordered.map((k, i) => ({
      rank: i + 1,
      molfile: k.molfile,
      energy: k.energy,
      relativeEnergy: optimized ? (k.energy as number) - lowest : null,
      optimized,
      converged: k.converged,
    }));
  }
}
