// 均聚物的分子量輸入欄（任務 015、019，D47）：主要輸入 Mw＋PDI，也可切換為 Mn＋PDI 或 DP＋PDI。
// Mw、Mn、DP、PDI 是使用者的輸入，換算出的其他值顯示在旁邊當作輸入輔助（D09 不適用於使用者輸入）；
// 重複單元分子量 M_unit 不顯示，結果區也不顯示分子量（D09）。
import { END_GROUP_PRESETS } from '../../core/data/endGroups';
import { DEFAULT_PDI, type RepeatUnitAnalysis } from '../../core/polymer/types';
import { MESSAGE_PDI_DEFAULT, MESSAGE_PDI_RANGE, resolvePolymer, type PolymerBasis } from '../../core/polymer/convert';
import { FRACTION_TOLERANCE } from '../../core/polymer/copolymer';
import { StructureImage } from '../workbench/StructureImage';
import { endFromEdit, specFromEdit, type EndEdit, type PolymerEdit, type UnitEdit } from './model';

interface Props {
  /** 用來產生欄位編號，同一頁面內不可重複 */
  idPrefix: string;
  edit: PolymerEdit;
  onChange: (edit: PolymerEdit) => void;
  /** 重複單元的分析結果；null 表示還在計算 */
  analysis: RepeatUnitAnalysis | null;
  /** 成分本身的結構（共聚物的第一種單元）；省略時不顯示共聚物的單元清單 */
  firstSmiles?: string;
  /** 刪除第一種單元時，把成分的結構換成下一種單元（成分詳細彈窗提供；其他地方的第一種單元是目前輸入的結構，不能刪） */
  onReplaceFirst?: (smiles: string, edit: PolymerEdit) => void;
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

function helper(edit: PolymerEdit, analysis: RepeatUnitAnalysis | null, firstSmiles: string | undefined): string {
  if (edit.text.trim() === '') return `請輸入 ${BASIS_SHORT[edit.basis]}`;
  const spec = specFromEdit(edit, firstSmiles);
  if (!spec) return Number.isFinite(Number(edit.text.trim())) && Number(edit.text.trim()) > 0 ? '' : '請輸入大於 0 的數字';
  if (!analysis) return '計算中…';
  if (!analysis.ok) return '';
  const resolved = resolvePolymer(spec, analysis.mUnit, { mEnds: analysis.mEnds ?? 0, filled: analysis.endsFilled ?? [false, false] });
  if (!resolved.ok) return resolved.error === MESSAGE_PDI_RANGE ? '' : resolved.error;
  const parts: string[] = [];
  if (edit.basis !== 'mw') parts.push(`Mw ≈ ${int(resolved.mw)} g/mol`);
  if (edit.basis !== 'mn') parts.push(`Mn ≈ ${int(resolved.mn)} g/mol`);
  parts.push(`DP_n ≈ ${resolved.dp.toFixed(1)}`, `DP_w ≈ ${resolved.dpW.toFixed(1)}`);
  return resolved.note === '' ? parts.join('、') : `${parts.join('、')}（${resolved.note}）`;
}

/** 一端端基的選擇（任務 022，D50）：不填／端基清單 27 項／自訂 SMILES，選好的端基顯示縮圖 */
function EndGroupField({ idPrefix, which, value, onChange }: { idPrefix: string; which: 1 | 2; value: EndEdit | undefined; onChange: (next: EndEdit) => void }) {
  const current = value ?? { choice: '', custom: '' };
  const end = endFromEdit(current);
  return (
    <div className="polymer-end-field">
      <label htmlFor={`${idPrefix}-end${which}`}>端基 {which}</label>
      <select id={`${idPrefix}-end${which}`} value={current.choice} onChange={(e) => onChange({ ...current, choice: e.target.value })}>
        <option value="">不填（未計入端基）</option>
        {END_GROUP_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}　{p.smiles}
          </option>
        ))}
        <option value="custom">自訂 SMILES</option>
      </select>
      {current.choice === 'custom' && (
        <input
          type="text"
          aria-label={`端基 ${which} 的 SMILES（含一個 *）`}
          placeholder="例如 [*]CCO（恰好一個 *）"
          value={current.custom}
          onChange={(e) => onChange({ ...current, custom: e.target.value })}
        />
      )}
      {end && <StructureImage label={`端基 ${which} 的結構`} source={end.smiles} width={96} height={64} polymer />}
    </div>
  );
}

/** 共聚物的單元清單（任務 020）：第一種單元是成分本身的結構；其他單元貼 SMILES（含兩個 *）。比例合計須為 100 */
function UnitList({ idPrefix, edit, onChange, firstSmiles, onReplaceFirst }: { idPrefix: string; edit: PolymerEdit; onChange: (edit: PolymerEdit) => void; firstSmiles: string; onReplaceFirst?: (smiles: string, edit: PolymerEdit) => void }) {
  const extras = edit.extraUnits ?? [];
  const basis = edit.fractionBasis ?? 'mol';
  const label = basis === 'mol' ? 'mol%' : 'wt%';
  const fractions = [edit.firstFractionText ?? '', ...extras.map((u) => u.fractionText)];
  const numbers = fractions.map((t) => (t.trim() === '' ? Number.NaN : Number(t)));
  const sum = numbers.reduce((t, v) => t + (Number.isFinite(v) ? v : 0), 0);
  const complete = numbers.every((v) => Number.isFinite(v) && v > 0);
  const sumBad = complete && Math.abs(sum - 100) > FRACTION_TOLERANCE + 1e-9;
  const setExtra = (index: number, patch: Partial<UnitEdit>) =>
    onChange({ ...edit, extraUnits: extras.map((u, i) => (i === index ? { ...u, ...patch } : u)) });
  return (
    <div className="polymer-units" role="group" aria-label="共聚物的重複單元">
      <div className="polymer-basis" role="radiogroup" aria-label="比例基準">
        {(['mol', 'wt'] as const).map((b) => (
          <label key={b} className="check">
            <input type="radio" name={`${idPrefix}-fraction-basis`} checked={basis === b} onChange={() => onChange({ ...edit, fractionBasis: b })} />
            {b === 'mol' ? 'mol%' : 'wt%'}
          </label>
        ))}
      </div>
      <div className="polymer-unit-row">
        <StructureImage label="單元 1 的結構" source={firstSmiles} width={96} height={64} polymer />
        <input
          type="text"
          readOnly
          aria-label="單元 1 的 SMILES"
          title="第一種單元是這個成分的結構；要修改結構請用「修改結構」或上方的結構輸入"
          value={firstSmiles}
        />
        <div className="amount-input">
          <input
            type="text"
            inputMode="decimal"
            aria-label={`單元 1 的比例（${label}）`}
            value={edit.firstFractionText ?? ''}
            onChange={(e) => onChange({ ...edit, firstFractionText: e.target.value })}
          />
          <span className="amount-unit">{label}</span>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={!onReplaceFirst}
          title={onReplaceFirst ? undefined : '第一種單元是目前輸入的結構，無法在這裡刪除'}
          onClick={() => {
            const [next, ...rest] = extras;
            const nextEdit: PolymerEdit = rest.length === 0 ? { ...edit, extraUnits: [], firstFractionText: '' } : { ...edit, firstFractionText: next.fractionText, extraUnits: rest };
            onReplaceFirst?.(next.smiles.trim(), nextEdit);
          }}
        >
          刪除
        </button>
      </div>
      {extras.map((u, i) => (
        <div className="polymer-unit-row" key={i}>
          {u.smiles.trim() !== '' ? <StructureImage label={`單元 ${i + 2} 的結構`} source={u.smiles.trim()} width={96} height={64} polymer /> : <span className="polymer-unit-blank" />}
          <input
            type="text"
            aria-label={`單元 ${i + 2} 的 SMILES（含兩個 *）`}
            placeholder="貼上 SMILES（含兩個 *，如 [*:1]CC[*:2]）"
            value={u.smiles}
            onChange={(e) => setExtra(i, { smiles: e.target.value })}
          />
          <div className="amount-input">
            <input type="text" inputMode="decimal" aria-label={`單元 ${i + 2} 的比例（${label}）`} value={u.fractionText} onChange={(e) => setExtra(i, { fractionText: e.target.value })} />
            <span className="amount-unit">{label}</span>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              const rest = extras.filter((_, k) => k !== i);
              onChange(rest.length === 0 ? { ...edit, extraUnits: [], firstFractionText: '' } : { ...edit, extraUnits: rest });
            }}
          >
            刪除
          </button>
        </div>
      ))}
      {sumBad && (
        <p className="form-error" role="alert">
          各單元的 {label} 合計為 {Number(sum.toFixed(6))}，應為 100（容差 ±0.01）
        </p>
      )}
    </div>
  );
}

export function PolymerFields({ idPrefix, edit, onChange, analysis, firstSmiles, onReplaceFirst }: Props) {
  const name = `${idPrefix}-basis`;
  const pdiMessage = pdiHelper(edit);
  const extras = edit.extraUnits ?? [];
  return (
    <div className="polymer-fields">
      {firstSmiles !== undefined && extras.length > 0 && <UnitList idPrefix={idPrefix} edit={edit} onChange={onChange} firstSmiles={firstSmiles} onReplaceFirst={onReplaceFirst} />}
      {firstSmiles !== undefined && (
        <button type="button" className="secondary polymer-add-unit" onClick={() => onChange({ ...edit, extraUnits: [...extras, { smiles: '', fractionText: '' }] })}>
          ＋新增單元（共聚物）
        </button>
      )}
      <div className="polymer-ends" role="group" aria-label="端基">
        <EndGroupField idPrefix={idPrefix} which={1} value={edit.end1} onChange={(end1) => onChange({ ...edit, end1 })} />
        <EndGroupField idPrefix={idPrefix} which={2} value={edit.end2} onChange={(end2) => onChange({ ...edit, end2 })} />
        <small>端基只填鏈盡頭多出來的部分；已經畫在重複單元裡的原子不要重複填。</small>
      </div>
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
      <small className="polymer-helper" role="status">{helper(edit, analysis, firstSmiles)}</small>
      <small className="polymer-helper" role="status">{pdiMessage}</small>
    </div>
  );
}
