// 「均聚物設定」卡片（任務 015，D42）：「分子工具」分頁的結構含連接點時出現，填 Mn 或 DP 擇一。
// 不提供 3D（D05）；共聚物、Mw、PDI、端基在 Phase 5。
import type { PolymerEdit } from './model';
import { PolymerFields } from './PolymerFields';
import type { PolymerContext } from './usePolymerInput';

interface Props {
  context: PolymerContext;
  onChange: (edit: PolymerEdit) => void;
}

export function PolymerSettings({ context, onChange }: Props) {
  if (!context.hasMark) return null;
  const { analysis } = context;
  return (
    <section className="card polymer-settings" aria-labelledby="polymer-title">
      <h2 id="polymer-title">均聚物設定</h2>
      {analysis === null ? (
        <p role="status">正在檢查連接點…</p>
      ) : !analysis.ok ? (
        <p className="error" role="alert">{analysis.problem.message}</p>
      ) : (
        <>
          <p>目前的結構是均聚物的重複單元（兩個連接點）。請填入 Mn 或 DP 其中一個，另一個會自動換算，供配方與之後的交聯計算使用。</p>
          <PolymerFields idPrefix="structure-polymer" edit={context.edit} onChange={onChange} analysis={analysis} />
          <small>換算未計入端基。聚合物不提供 3D 結構。共聚物、Mw、PDI 與端基將於 Phase 5 提供。</small>
        </>
      )}
    </section>
  );
}
