// 結構驗證（Phase 2.3、DECISIONS D31）：輸入 SMILES 或 Molfile，回傳 canonical SMILES、Molfile 與中文問題清單。
// 只檢查「能不能當作分子結構使用」，不計算任何物性，也不判斷化學正確性（D17）。
import type { RDKitModule, JSMol } from '../rdkit/types';
import { connectionPointNotice, inputMessages, rejectionMessages, type InputCategory } from './inputErrors';
import { isReactionMolfile, molfileFeatures } from './molfileChecks';

export type ProblemLevel = 'error' | 'info';
export type ProblemCode = InputCategory | 'REACTION' | 'QUERY' | 'RGROUP' | 'POLYMER' | 'CONNECTION_POINT' | 'MULTIPLE_FRAGMENTS';

export interface StructureProblem {
  level: ProblemLevel;
  code: ProblemCode;
  message: string;
}

export interface StructureValidation {
  /** 可以當作分子結構使用 */
  valid: boolean;
  /** 沒有輸入結構（提示而非錯誤） */
  empty: boolean;
  canonicalSmiles: string;
  /** V2000、2D 座標的 Molfile；不合法時為空字串 */
  molblock: string;
  problems: StructureProblem[];
}

export type StructureFormat = 'smiles' | 'molfile';

/** 含換行且有 Molfile 特徵（M  END、V2000／V3000 計數行）者視為 Molfile，其餘視為 SMILES。 */
export function detectFormat(input: string): StructureFormat {
  const text = input.replace(/\r\n?/g, '\n');
  if (!text.includes('\n')) return 'smiles';
  if (/^M {2}END\b/m.test(text) || /V[23]000\s*$/m.test(text.split('\n')[3] ?? '')) return 'molfile';
  return 'smiles';
}

function result(partial: Partial<StructureValidation> & { problems: StructureProblem[] }): StructureValidation {
  return { valid: false, empty: false, canonicalSmiles: '', molblock: '', ...partial };
}

const error = (code: ProblemCode, message: string): StructureProblem => ({ level: 'error', code, message });

/**
 * RDKit 把連接點（虛原子）寫成 `R`；Ketcher 讀到 `R` 會變成 R 基團樣的標籤，匯出時再變成 `R#`。
 * 改寫成標準的 `*`（Ketcher 與 RDKit 都能原樣來回），原子映射編號與其他欄位不變。只處理 V2000。
 */
export function dummyAtomsAsStar(molblock: string): string {
  const lines = molblock.split('\n');
  const counts = lines[3] ?? '';
  if (!/V2000/.test(counts)) return molblock;
  const atomCount = parseInt(counts.slice(0, 3), 10);
  for (let i = 0; i < atomCount; i++) {
    const line = lines[4 + i];
    if (line !== undefined && line.slice(31, 34).trim() === 'R') {
      lines[4 + i] = line.slice(0, 31) + '*  ' + line.slice(34);
    }
  }
  return lines.join('\n');
}

function v2000Molblock(mol: JSMol): string {
  try {
    return mol.get_v2Kmolblock();
  } catch {
    return mol.get_molblock(); // 超過 V2000 上限（999 個原子）等情況
  }
}

function parseRaw(RDKit: RDKitModule, input: string, sanitize: boolean): JSMol | null {
  try {
    return sanitize ? RDKit.get_mol(input) : RDKit.get_mol(input, JSON.stringify({ sanitize: false }));
  } catch {
    return null;
  }
}

function parsesAsQuery(RDKit: RDKitModule, input: string): boolean {
  try {
    const q = RDKit.get_qmol(input);
    if (!q) return false;
    q.delete();
    return true;
  } catch {
    return false;
  }
}

function rejectionsFor(input: string, format: StructureFormat): StructureProblem[] {
  const out: StructureProblem[] = [];
  if (isReactionMolfile(input)) {
    out.push(error('REACTION', rejectionMessages.reaction));
    return out;
  }
  if (format === 'smiles') {
    // SMILES 中的 `>` 只會出現在反應式；`~`（任意鍵）是 SMARTS 的查詢鍵。
    if (input.includes('>')) out.push(error('REACTION', rejectionMessages.reaction));
    else if (input.includes('~')) out.push(error('QUERY', rejectionMessages.query));
    return out;
  }
  const f = molfileFeatures(input);
  if (f.query) out.push(error('QUERY', rejectionMessages.query));
  if (f.rgroup) out.push(error('RGROUP', rejectionMessages.rgroup));
  if (f.polymer) out.push(error('POLYMER', rejectionMessages.polymer));
  return out;
}

/** 驗證一個結構輸入（SMILES 或 Molfile）。呼叫端不需要處理 RDKit 物件的釋放。 */
export function validateStructure(RDKit: RDKitModule, rawInput: string): StructureValidation {
  // Molfile 的第一行（名稱欄）可以是空白，不能把開頭的空行刪掉；SMILES 才去除前後空白。
  const format = detectFormat(rawInput);
  const input = format === 'molfile' ? rawInput : rawInput.trim();
  if (input.trim() === '') {
    return result({
      empty: true,
      problems: [{ level: 'info', code: 'EMPTY_INPUT', message: inputMessages.EMPTY_INPUT }],
    });
  }

  const rejected = rejectionsFor(input, format);
  if (rejected.length) return result({ problems: rejected });

  const mol = parseRaw(RDKit, input, true);
  if (!mol) {
    // 能在不做價數檢查時解析 → 語法正確但價數、芳香性等有誤
    const loose = parseRaw(RDKit, input, false);
    if (loose) {
      loose.delete();
      return result({ problems: [error('SANITIZATION_FAILED', inputMessages.SANITIZATION_FAILED)] });
    }
    // SMILES 語法不通，但能當 SMARTS 讀 → 查詢結構
    if (format === 'smiles' && parsesAsQuery(RDKit, input)) {
      return result({ problems: [error('QUERY', rejectionMessages.query)] });
    }
    return result({ problems: [error('UNPARSABLE', inputMessages.UNPARSABLE)] });
  }

  try {
    const canonicalSmiles = mol.get_smiles();
    if (canonicalSmiles === '') {
      return result({
        empty: true,
        problems: [{ level: 'info', code: 'EMPTY_INPUT', message: inputMessages.EMPTY_INPUT }],
      });
    }
    // 沒有座標（SMILES）或 3D 座標時，產生 2D 座標；Molfile 已有的 2D 座標維持不動。
    // RDKit.js 的 has_coords()：0 = 沒有座標、2 = 2D、3 = 3D。
    if (mol.has_coords() !== 2) mol.set_new_coords();
    // 一律要 V2000：get_molblock() 在分子帶有增強立體資訊（Ketcher 的 abs 標記）時會自動改寫成 V3000。
    const molblock = dummyAtomsAsStar(v2000Molblock(mol));
    const problems: StructureProblem[] = [];
    if (canonicalSmiles.includes('*')) {
      problems.push({ level: 'info', code: 'CONNECTION_POINT', message: connectionPointNotice });
    }
    const fragments = canonicalSmiles.split('.').length; // SMILES 的 . 只會出現在片段之間
    if (fragments > 1) {
      problems.push({ level: 'info', code: 'MULTIPLE_FRAGMENTS', message: `含 ${fragments} 個分離片段` });
    }
    return result({ valid: true, canonicalSmiles, molblock, problems });
  } finally {
    mol.delete();
  }
}
