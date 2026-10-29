// 「分子工具」分頁的均聚物設定狀態（任務 015）：目前結構含連接點時，分析重複單元並保存 Mn／DP 輸入。
import { useEffect, useMemo, useState } from 'react';
import type { PolymerSpec, RepeatUnitAnalysis } from '../../core/polymer/types';
import type { StructureValidation } from '../../core/structure/validate';
import { analyzeRepeatUnitInWorker } from '../../worker/client';
import { emptyPolymerEdit, specFromEdit, type PolymerEdit } from './model';

export interface PolymerContext {
  /** 目前結構含連接點 `*`（有效結構才算） */
  hasMark: boolean;
  /** null：尚在分析，或沒有連接點 */
  analysis: RepeatUnitAnalysis | null;
  edit: PolymerEdit;
  /** 使用者填的 Mn 或 DP；沒填或無效為 null */
  spec: PolymerSpec | null;
}

export function usePolymerInput(structure: StructureValidation | null) {
  const [edit, setEdit] = useState<PolymerEdit>(emptyPolymerEdit);
  const [analyzed, setAnalyzed] = useState<{ smiles: string; analysis: RepeatUnitAnalysis | null } | null>(null);

  const smiles = structure?.valid ? structure.canonicalSmiles : '';
  const hasMark = smiles.includes('*');

  useEffect(() => {
    if (!hasMark) return;
    let cancelled = false;
    void analyzeRepeatUnitInWorker(smiles).then((analysis) => {
      if (!cancelled) setAnalyzed({ smiles, analysis });
    });
    return () => {
      cancelled = true;
    };
  }, [smiles, hasMark]);

  const analysis = hasMark && analyzed?.smiles === smiles ? analyzed.analysis : null;
  const context = useMemo<PolymerContext>(
    () => ({ hasMark, analysis, edit, spec: hasMark ? specFromEdit(edit) : null }),
    [hasMark, analysis, edit],
  );
  return { context, edit, setEdit };
}
