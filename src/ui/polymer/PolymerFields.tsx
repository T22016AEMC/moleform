// 均聚物的 Mn／DP 輸入欄（任務 015）：擇一輸入，換算出的另一個值顯示在旁邊當作輸入輔助。
// Mn 與 DP 是使用者的輸入，可以顯示；重複單元分子量 M_unit 不顯示，結果區也不顯示分子量（D09）。
import { resolvePolymer, type PolymerBasis } from '../../core/polymer/convert';
import { END_GROUP_NOTE, type RepeatUnitAnalysis } from '../../core/polymer/types';
import { specFromEdit, type PolymerEdit } from './model';

interface Props {
  /** 用來產生欄位編號，同一頁面內不可重複 */
  idPrefix: string;
  edit: PolymerEdit;
  onChange: (edit: PolymerEdit) => void;
  /** 重複單元的分析結果；null 表示還在計算 */
  analysis: RepeatUnitAnalysis | null;
}

const BASIS_LABEL: Record<PolymerBasis, string> = { mn: 'Mn（g/mol）', dp: 'DP（重複單元數）' };

function helper(edit: PolymerEdit, analysis: RepeatUnitAnalysis | null): string {
  const spec = specFromEdit(edit);
  if (edit.text.trim() === '') return '請輸入 Mn 或 DP 其中一個';
  if (!spec) return '請輸入大於 0 的數字';
  if (!analysis) return '計算中…';
  if (!analysis.ok) return '';
  const resolved = resolvePolymer(spec, analysis.mUnit);
  if (!resolved.ok) return resolved.error;
  const other = edit.basis === 'mn' ? `DP ≈ ${resolved.dp.toFixed(1)}` : `Mn ≈ ${Math.round(resolved.mn).toLocaleString('en-US')} g/mol`;
  return `${other}（${END_GROUP_NOTE}）`;
}

export function PolymerFields({ idPrefix, edit, onChange, analysis }: Props) {
  const name = `${idPrefix}-basis`;
  return (
    <div className="polymer-fields">
      <div className="polymer-basis" role="radiogroup" aria-label="輸入方式">
        {(['mn', 'dp'] as const).map((basis) => (
          <label key={basis} className="check">
            <input type="radio" name={name} checked={edit.basis === basis} onChange={() => onChange({ ...edit, basis })} />
            {BASIS_LABEL[basis]}
          </label>
        ))}
      </div>
      <div className="amount-input">
        <input
          id={`${idPrefix}-value`}
          type="text"
          inputMode="decimal"
          aria-label={BASIS_LABEL[edit.basis]}
          value={edit.text}
          onChange={(e) => onChange({ ...edit, text: e.target.value })}
        />
        <span className="amount-unit">{edit.basis === 'mn' ? 'g/mol' : '個'}</span>
      </div>
      <small className="polymer-helper" role="status">{helper(edit, analysis)}</small>
    </div>
  );
}
