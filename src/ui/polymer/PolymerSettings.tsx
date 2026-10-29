// 「均聚物設定」卡片（任務 015，D42）：「分子工具」分頁的結構含連接點時出現，填 Mn 或 DP 擇一。
// 不提供 3D（D05）；共聚物、端基在 Phase 5。
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
      <h2 id="polymer-title">聚合物設定</h2>
      {analysis === null ? (
        <p role="status">正在檢查連接點…</p>
      ) : (
        <>
          {!analysis.ok && <p className="error" role="alert">{analysis.problem.message}</p>}
          <p>目前的結構是聚合物的重複單元（兩個連接點）；要做 Random 共聚物，按「＋新增單元」再貼其他單元。請填入 Mw 與 PDI（PDI 留空時使用預設值 2）；也可改填 Mn 或 DP，其他值會自動換算，供配方與交聯計算使用。</p>
          <PolymerFields idPrefix="structure-polymer" edit={context.edit} onChange={onChange} analysis={analysis} firstSmiles={context.smiles} />
          <small>聚合物不提供 3D 結構。</small>
        </>
      )}
    </section>
  );
}
