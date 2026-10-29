// 均聚物的分子量輸入欄（任務 015、019，D47）：主要輸入 Mw＋PDI，也可切換為 Mn＋PDI 或 DP＋PDI。
// Mw、Mn、DP、PDI 是使用者的輸入，換算出的其他值顯示在旁邊當作輸入輔助（D09 不適用於使用者輸入）；
// 重複單元分子量 M_unit 不顯示，結果區也不顯示分子量（D09）。
import { DEFAULT_PDI, END_GROUP_NOTE, type RepeatUnitAnalysis } from '../../core/polymer/types';
import { MESSAGE_PDI_DEFAULT, MESSAGE_PDI_RANGE, resolvePolymer, type PolymerBasis } from '../../core/polymer/convert';
import { specFromEdit, type PolymerEdit } from './model';

interface Props {
  /** 用來產生欄位編號，同一頁面內不可重複 */
  idPrefix: string;
  edit: PolymerEdit;
  onChange: (edit: PolymerEdit) => void;
  /** 重複單元的分析結果；null 表示還在計算 */
  analysis: RepeatUnitAnalysis | null;
}

const BASIS_LABEL: Record<PolymerBasis, string> = { mw: 'Mw（g/mol）', mn: 'Mn（g/mol）', dp: 'DP（數量平均，重複單元數）' };
const BASIS_SHORT: Record<PolymerBasis, string> = { mw: 'Mw', mn: 'Mn', dp: 'DP' };
const int = (v: number) => Math.round(v).toLocaleString('en-US');

function pdiHelper(edit: PolymerEdit): string {
  const text = edit.pdiText.trim();
  if (text === '') return MESSAGE_PDI_DEFAULT;
  const value = Number(text);
  if (!Number.isFinite(value)) return '請輸入數字';
  return value < 1 ? MESSAGE_PDI_RANGE : '';
}

function helper(edit: PolymerEdit, analysis: RepeatUnitAnalysis | null): string {
  if (edit.text.trim() === '') return `請輸入 ${BASIS_SHORT[edit.basis]}`;
  const spec = specFromEdit(edit);
  if (!spec) return Number.isFinite(Number(edit.text.trim())) && Number(edit.text.trim()) > 0 ? '' : '請輸入大於 0 的數字';
  if (!analysis) return '計算中…';
  if (!analysis.ok) return '';
  const resolved = resolvePolymer(spec, analysis.mUnit);
  if (!resolved.ok) return resolved.error === MESSAGE_PDI_RANGE ? '' : resolved.error;
  const parts: string[] = [];
  if (edit.basis !== 'mw') parts.push(`Mw ≈ ${int(resolved.mw)} g/mol`);
  if (edit.basis !== 'mn') parts.push(`Mn ≈ ${int(resolved.mn)} g/mol`);
  parts.push(`DP_n ≈ ${resolved.dp.toFixed(1)}`, `DP_w ≈ ${resolved.dpW.toFixed(1)}`);
  return `${parts.join('、')}（${END_GROUP_NOTE}）`;
}

export function PolymerFields({ idPrefix, edit, onChange, analysis }: Props) {
  const name = `${idPrefix}-basis`;
  const pdiMessage = pdiHelper(edit);
  return (
    <div className="polymer-fields">
      <div className="polymer-basis" role="radiogroup" aria-label="輸入方式">
        {(['mw', 'mn', 'dp'] as const).map((basis) => (
          <label key={basis} className="check">
            <input type="radio" name={name} checked={edit.basis === basis} onChange={() => onChange({ ...edit, basis })} />
            {BASIS_LABEL[basis]}
          </label>
        ))}
      </div>
      <div className="polymer-inputs">
        <div className="amount-input">
          <input
            id={`${idPrefix}-value`}
            type="text"
            inputMode="decimal"
            aria-label={BASIS_LABEL[edit.basis]}
            value={edit.text}
            onChange={(e) => onChange({ ...edit, text: e.target.value })}
          />
          <span className="amount-unit">{edit.basis === 'dp' ? '個' : 'g/mol'}</span>
        </div>
        <div className="amount-input">
          <label htmlFor={`${idPrefix}-pdi`}>PDI</label>
          <input
            id={`${idPrefix}-pdi`}
            type="text"
            inputMode="decimal"
            aria-label="PDI（選填，預設 2）"
            placeholder={`選填，預設 ${DEFAULT_PDI}`}
            value={edit.pdiText}
            onChange={(e) => onChange({ ...edit, pdiText: e.target.value })}
          />
        </div>
      </div>
      <small className="polymer-helper" role="status">{helper(edit, analysis)}</small>
      <small className="polymer-helper" role="status">{pdiMessage}</small>
    </div>
  );
}
