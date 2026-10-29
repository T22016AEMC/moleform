// 元件預覽：只在開發模式由 App 動態載入，示範資料不得進入正式建置。
import type { CalcResult } from '../../core/result';
import { ResultValue } from './ResultValue';
import { UnifiedNote } from './UnifiedNote';

const demo: CalcResult[] = [
  { value: 123.4, unit: 'DEMO-UNIT', modelName: 'DEMO-MODEL-A', confidence: 'direct', sources: [] },
  { value: 56.7, unit: 'DEMO-UNIT', modelName: 'DEMO-MODEL-B', confidence: 'estimate', sources: ['DEMO-SOURCE-1', 'DEMO-SOURCE-2'] },
  { value: 8.9, unit: 'DEMO-UNIT', modelName: 'DEMO-MODEL-C', confidence: 'trend', sources: ['DEMO-SOURCE-3'] },
  { value: null, unit: 'DEMO-UNIT', modelName: 'DEMO-MODEL-D', confidence: 'estimate', sources: [], notApplicable: 'DEMO-REASON' },
];

export default function DevPreview() {
  return (
    <section className="card dev-preview">
      <h2>元件預覽（開發用，非計算結果）</h2>
      {demo.map((r) => (
        <ResultValue key={r.modelName} result={r} />
      ))}
      <UnifiedNote />
    </section>
  );
}