import { confidenceLabel, type CalcResult } from '../../core/result';
import './components.css';

export function ResultValue({ result }: { result: CalcResult }) {
  const { value, unit, modelName, confidence, sources, notApplicable } = result;
  const notAvailable = notApplicable !== undefined || value === null;
  return (
    <div className="result-value">
      <div className="result-head">
        {notAvailable ? (
          <span className="result-na">不適用</span>
        ) : (
          <>
            <span className="result-number">{value}</span>
            <span className="result-unit">{unit}</span>
          </>
        )}
        <span className={`confidence-tag confidence-${confidence}`}>{confidenceLabel(confidence)}</span>
      </div>
      {notApplicable !== undefined && <p className="result-model">原因：{notApplicable}</p>}
      <p className="result-model">模型：{modelName}</p>
      {sources.length > 0 && (
        <details>
          <summary>出處（{sources.length}）</summary>
          <ul>
            {sources.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}