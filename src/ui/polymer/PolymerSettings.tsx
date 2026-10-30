// 「均聚物設定」卡片（任務 015，D42）：「分子工具」分頁的結構含連接點時出現，填 Mn 或 DP 擇一。
// 3D 在下方的「3D 結構」卡片顯示重複單元片段（連接處以甲基代替，D05、任務 024）。
import type { BackboneTemplateRow } from '../../core/data/backboneTemplates';
import { templateCardVisible, type PolymerEdit } from './model';
import { UnitDrawPanel } from './UnitDrawPanel';
import type { UnitDrawing } from './useUnitDrawing';
import { BackboneTemplatePicker, PolymerFields } from './PolymerFields';
import type { PolymerContext } from './usePolymerInput';

interface Props {
  context: PolymerContext;
  onChange: (edit: PolymerEdit) => void;
  /** 用 Ketcher 畫單元（任務 021） */
  draw: UnitDrawing;
  /** 從骨架範本填入（任務 023） */
  onApplyTemplate: (row: BackboneTemplateRow) => void;
}

export function PolymerSettings({ context, onChange, draw, onApplyTemplate }: Props) {
  // 結構尚未輸入或不含連接點：只提供「從骨架範本填入」，選了就填入單元並切換為聚合物設定（任務 024 後續）
  if (!context.hasMark) {
    if (!templateCardVisible(context.smiles)) return null; // 一般小分子：隱藏（任務 025）
    return (
      <section className="card polymer-settings" aria-labelledby="polymer-title">
        <h2 id="polymer-title">聚合物設定</h2>
        <BackboneTemplatePicker idPrefix="structure-polymer" edit={context.edit} firstSmiles={context.smiles} onApply={onApplyTemplate} />
      </section>
    );
  }
  const { analysis } = context;
  return (
    <section className="card polymer-settings" aria-labelledby="polymer-title">
      <h2 id="polymer-title">聚合物設定</h2>
      {analysis === null ? (
        <p role="status">正在檢查連接點…</p>
      ) : (
        <>
          {!analysis.ok && <p className="error" role="alert">{analysis.problem.message}</p>}
          <p>目前的結構是聚合物的重複單元（兩個連接點）；要做 Random 共聚物，按「＋新增單元」再貼其他單元。請填入 Mw 與 PDI（PDI 留空時使用預設值 2）；也可改填 Mn 或 DP，其他值會自動換算，供配方與交聯計算使用。</p>
          <PolymerFields idPrefix="structure-polymer" edit={context.edit} onChange={onChange} analysis={analysis} firstSmiles={context.smiles} onDrawUnit={draw.request} onApplyTemplate={onApplyTemplate} />
          <UnitDrawPanel draw={draw} edit={context.edit} onEditChange={onChange} />
        </>
      )}
    </section>
  );
}
