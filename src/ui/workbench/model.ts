// 配方工作台彈窗的資料轉換（任務 018）：SMILES／化合物庫／Ketcher → 配方成分。
// 只做資料搬運，不計算任何化學量；Node 即可測試。
import type { NewCompoundInput } from '../../core/library/library';
import type { Compound } from '../../core/library/types';
import type { PolymerSpec } from '../../core/polymer/types';
import type { StructureValidation } from '../../core/structure/validate';
import { newRow, type Row } from '../formulation/model';
import { editFromSpec, emptyPolymerEdit, specFromEdit, type PolymerEdit } from '../polymer/model';

/** 通過驗證、可以變成成分的結構 */
export interface Candidate {
  canonicalSmiles: string;
  molfile: string;
  /** 從化合物庫選時帶入的名稱 */
  name?: string;
  compoundId?: string;
  /** 從化合物庫選聚合物時帶入的 Mn 或 DP */
  polymer?: PolymerSpec;
}

/** 「加入成分」彈窗的表單 */
export interface AddForm {
  name: string;
  category: string;
  polymerEdit: PolymerEdit;
  saveToLibrary: boolean;
}

export const isPolymerSmiles = (smiles: string) => smiles.includes('*');

/** 預設名稱「成分 N」：N 是目前配方的成分數加 1 */
export const defaultComponentName = (existingCount: number) => `成分 ${existingCount + 1}`;

/** 驗證通過（有 canonical SMILES）才成為候選結構 */
export function candidateFromValidation(validation: StructureValidation | null): Candidate | null {
  if (!validation?.valid || validation.canonicalSmiles === '') return null;
  return { canonicalSmiles: validation.canonicalSmiles, molfile: validation.molblock };
}

export function candidateFromCompound(compound: Compound): Candidate {
  return {
    canonicalSmiles: compound.canonicalSmiles,
    molfile: compound.molfile,
    name: compound.name,
    compoundId: compound.id,
    ...(compound.polymer ? { polymer: compound.polymer } : {}),
  };
}

/** 選定結構後表單的初始值（名稱以化合物庫的為主，其餘用預設「成分 N」） */
export function initialForm(candidate: Candidate | null, existingCount: number, defaultCategory: string): AddForm {
  return {
    name: candidate?.name ?? defaultComponentName(existingCount),
    category: defaultCategory,
    polymerEdit: candidate && isPolymerSmiles(candidate.canonicalSmiles) ? editFromSpec(candidate.polymer) : emptyPolymerEdit(),
    saveToLibrary: false,
  };
}

/** 彈窗按「加入」：候選結構＋表單 → 配方成分（名稱空白時用預設名稱） */
export function rowFromCandidate(area: 'solid' | 'liquid', candidate: Candidate, form: AddForm, existingCount: number): Row {
  const name = form.name.trim() === '' ? defaultComponentName(existingCount) : form.name.trim();
  const polymer = isPolymerSmiles(candidate.canonicalSmiles);
  const row = newRow(area, {
    name,
    canonicalSmiles: candidate.canonicalSmiles,
    molfile: candidate.molfile,
    ...(candidate.compoundId ? { compoundId: candidate.compoundId } : {}),
  });
  return { ...row, category: form.category, ...(polymer ? { polymerEdit: form.polymerEdit } : {}) };
}

/** 勾選「同時存進化合物庫」時，要新增的化合物 */
export function libraryInputFromRow(row: Pick<Row, 'name' | 'canonicalSmiles' | 'molfile' | 'polymerEdit'>): NewCompoundInput {
  const polymer = isPolymerSmiles(row.canonicalSmiles) && row.polymerEdit ? specFromEdit(row.polymerEdit) : null;
  return {
    name: row.name,
    canonicalSmiles: row.canonicalSmiles,
    molfile: row.molfile ?? '',
    ...(polymer ? { polymer } : {}),
  };
}

/**
 * 成分詳細彈窗用 Ketcher 修改結構後套用回成分：換成新的結構，保留名稱、分類、用量與勾選。
 * 結構變了，原本的化合物庫連結失效；聚合物的 Mn／DP 輸入保留（新結構仍是聚合物時）。
 */
export function applyStructureToRow(row: Row, candidate: Candidate): Row {
  const { compoundId: _link, polymerEdit, ...rest } = row;
  const next: Row = { ...rest, canonicalSmiles: candidate.canonicalSmiles, molfile: candidate.molfile };
  if (isPolymerSmiles(candidate.canonicalSmiles)) next.polymerEdit = polymerEdit ?? emptyPolymerEdit();
  return next;
}

/** 在畫面上顯示縮圖用的結構來源：小分子優先用 Molfile（原子編號與 3D 一致），聚合物用 SMILES（與交聯分析相同） */
export function drawSource(row: Pick<Row, 'canonicalSmiles' | 'molfile'>): string {
  return !isPolymerSmiles(row.canonicalSmiles) && row.molfile && row.molfile.trim() !== '' ? row.molfile : row.canonicalSmiles;
}
