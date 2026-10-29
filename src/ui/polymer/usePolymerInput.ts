// 「分子工具」分頁的均聚物設定狀態（任務 015）：目前結構含連接點時，分析重複單元並保存 Mn／DP 輸入。
import { useEffect, useMemo, useState } from 'react';
import type { PolymerSpec, RepeatUnitAnalysis } from '../../core/polymer/types';
import type { StructureValidation } from '../../core/structure/validate';
import { analyzeRepeatUnitInWorker } from '../../worker/client';
import { analysisKey, emptyPolymerEdit, specFromEdit, type PolymerEdit } from './model';

export interface PolymerContext {
  /** 目前結構含連接點 `*`（有效結構才算） */
  hasMark: boolean;
  /** null：尚在分析，或沒有連接點 */
  analysis: RepeatUnitAnalysis | null;
  edit: PolymerEdit;
  /** 使用者填的 Mn 或 DP；沒填或無效為 null */
  spec: PolymerSpec | null;
  /** 目前結構的 canonical SMILES（共聚物的第一種單元） */
  smiles: string;
}

export function usePolymerInput(structure: StructureValidation | null) {
  const [edit, setEdit] = useState<PolymerEdit>(emptyPolymerEdit);
  const [analyzed, setAnalyzed] = useState<{ key: string; analysis: RepeatUnitAnalysis | null } | null>(null);

  const smiles = structure?.valid ? structure.canonicalSmiles : '';
  const hasMark = smiles.includes('*');
  const spec = useMemo(() => (hasMark ? specFromEdit(edit, smiles) : null), [hasMark, edit, smiles]);
  // 共聚物的單元或比例改變時重新分析（均聚物只看 SMILES）
  const key = analysisKey(smiles, spec);

  useEffect(() => {
    if (!hasMark) return;
    let cancelled = false;
    void analyzeRepeatUnitInWorker(smiles, spec).then((analysis) => {
      if (!cancelled) setAnalyzed({ key, analysis });
    });
    return () => {
      cancelled = true;
    };
    // spec 的內容由 key 決定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hasMark]);

  const analysis = hasMark && analyzed?.key === key ? analyzed.analysis : null;
  const context = useMemo<PolymerContext>(() => ({ hasMark, analysis, edit, spec, smiles }), [hasMark, analysis, edit, spec, smiles]);
  return { context, edit, setEdit };
}
