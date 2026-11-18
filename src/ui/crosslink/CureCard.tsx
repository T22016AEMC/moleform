// 配方工作台右欄的「固化預測」卡片（任務 P7-3，PLAN 7.4、7.5、7.7；D11 第 2 層）。
// 計算由 Python 引擎完成（`/crosslink/cure`，經桌面橋接，沿用 I05 的做法）；這裡只送請求、顯示結果，不計算任何化學量。
// 第 1 層不支援的體系：顯示同一個「尚未支援」原因；缺值（Tg,0、式 6.14 的 x_crl 等）顯示原因，不填數字。
import { useMemo, useState } from 'react';
import type { CrosslinkResult } from '../../core/crosslink/types';
import { computeFormulation } from '../../core/formulation/compute';
import type { Formulation } from '../../core/formulation/types';
import { confidenceLabel } from '../../core/result';
import { ResultValue } from '../components/ResultValue';
import { UnifiedNote } from '../components/UnifiedNote';
import { computeCureViaEngine, cureBody, type CureData, type CureOutcome } from '../engine/crosslinkEngine';
import { ResultBlock } from '../workbench/ResultBlock';
import { calc, parseNumber, round, useEngineCall } from './Layer1Cards';

/** 硬化溫度的預設值（°C）；介面上可修改，清空則不計算最大轉化率 */
const DEFAULT_CURE_TEMP_TEXT = '150';

const tgText = (p: { tgK: number; tgC: number }) => `${round(p.tgC, 4)} °C（${round(p.tgK, 4)} K）`;
const rangeText = (a: { tgK: number; tgC: number }, b: { tgK: number; tgC: number }) => `${tgText(a)} 至 ${tgText(b)}`;

function MissingLine({ label, reason }: { label: string; reason: string }) {
  return (
    <p className="structure-notice" role="status">
      {label}：缺值（{reason}）
    </p>
  );
}

interface Props {
  result: CrosslinkResult;
  formulation: Formulation | null;
}

export function CureSection({ result, formulation }: Props) {
  const [tempText, setTempText] = useState(DEFAULT_CURE_TEMP_TEXT);
  const temp = parseNumber(tempText);
  const tempBlank = tempText.trim() === '';
  const tempValid = tempBlank || (Number.isFinite(temp) && temp > -273.15 && temp <= 2000);

  const body = useMemo(() => {
    if (!formulation || !tempValid) return null;
    const mw: Record<string, number | undefined> = {};
    const unitWeights: Record<string, number | undefined> = {};
    for (const c of result.components) {
      mw[c.id] = c.molarMass ?? undefined;
      if (c.distribution) unitWeights[c.id] = c.distribution.mUnit;
    }
    return cureBody(result, formulation, computeFormulation(formulation, mw, { unitWeights }), mw, tempBlank ? null : temp);
  }, [result, formulation, tempValid, tempBlank, temp]);
  const key = useMemo(() => (body === null ? null : JSON.stringify(body)), [body]);
  const state = useEngineCall<CureOutcome>(key, () => computeCureViaEngine(body as Record<string, unknown>));

  return (
    <ResultBlock id="cure" title="固化預測">
      <p>
        依目前配方，估算未交聯 Tg、完全固化時的 Tg∞（範圍）、不同轉化率下的 Tg、完全固化最低溫度與指定硬化溫度下的最大轉化率，並檢查 Tg∞ 是否高於成分的 Td,1/2。
        <span className="confidence-tag confidence-trend">{confidenceLabel('trend')}</span>
      </p>
      <div className="form-row-inline" id="field-cure-temp">
        <label htmlFor="cure-temp-input">硬化溫度</label>
        <div className="amount-input">
          <input id="cure-temp-input" type="text" inputMode="decimal" value={tempText} aria-invalid={!tempValid} onChange={(e) => setTempText(e.target.value)} />
          <span className="amount-unit">°C</span>
        </div>
        <small>預設 150 °C，可修改；清空則不計算最大轉化率。</small>
      </div>
      {!tempValid && (
        <div className="error" role="alert">
          <p>硬化溫度必須是高於 −273.15 °C 的數字。</p>
        </div>
      )}
      {formulation === null ? (
        <p className="structure-placeholder">配方裡還沒有成分。</p>
      ) : state === null || state.kind === 'working' ? (
        <p role="status">引擎計算中…</p>
      ) : state.kind === 'error' ? (
        <p className="structure-notice" role="status">
          固化預測無法計算：{state.message}
        </p>
      ) : !state.value.supported ? (
        <p className="structure-notice" role="status">
          固化預測無法計算：{state.value.reason}
        </p>
      ) : (
        <CureOutput data={state.value} />
      )}
      <UnifiedNote />
    </ResultBlock>
  );
}

function CureOutput({ data }: { data: CureData }) {
  const { tg0, mCrl, tgInf, postCure, td, notes } = data;
  return (
    <>
      <h3>未交聯 Tg,0</h3>
      {tg0.status === 'predicted' ? (
        <>
          <ResultValue result={calc(tg0.tgC, '°C', '未交聯 Tg 估計：Fox 混合（既有的配方混合 Tg，不新增模型）', 'trend')} />
          <p className="crosslink-notes">{round(tg0.tgK, 4)} K。{tg0.messages.join('；')}</p>
        </>
      ) : (
        <MissingLine label="未交聯 Tg,0" reason={tg0.reason} />
      )}

      <h3>Tg∞（完全固化）</h3>
      {tgInf.status === 'predicted' ? (
        <>
          <div className="crosslink-grid">
            <div>
              <h4>下限</h4>
              <ResultValue result={calc(tgInf.low.tgC, '°C', `式 (6.13)，${tgInf.low.source}`, 'trend')} />
              <p className="crosslink-notes">{round(tgInf.low.tgK, 4)} K</p>
            </div>
            <div>
              <h4>上限</h4>
              <ResultValue result={calc(tgInf.high.tgC, '°C', `式 (6.13)，${tgInf.high.source}`, 'trend')} />
              <p className="crosslink-notes">{round(tgInf.high.tgK, 4)} K</p>
            </div>
          </div>
          <p className="crosslink-notes">
            ΔTg = Tg∞ − Tg,0 = {round(tgInf.deltaLowK, 3)} 至 {round(tgInf.deltaHighK, 3)} K。{notes.tgInf}
          </p>
          {mCrl.status === 'predicted' && (
            <p className="crosslink-notes">
              M_crl（網目分子量 Mc，限量官能基 100% 反應）= {round(mCrl.value, 4)} g/mol。{notes.mCrl}
            </p>
          )}
          <p className="crosslink-notes">{notes.kUnit}</p>
        </>
      ) : (
        <MissingLine label="Tg∞" reason={tgInf.reason} />
      )}
      <h4>式 (6.14) 對照值（DiBenedetto）</h4>
      <MissingLine label="式 (6.14)" reason={data.eq614.reason} />

      <h3>固化後 Tg、完全固化最低溫度、最大轉化率</h3>
      {postCure.status === 'predicted' ? (
        <>
          <div className="table-wrap">
            <table className="result-table crosslink-table">
              <thead>
                <tr>
                  <th scope="col">轉化率</th>
                  <th scope="col">固化後 Tg（Tg∞ 下限至上限）</th>
                </tr>
              </thead>
              <tbody>
                {postCure.table.map((r) => (
                  <tr key={r.conversion}>
                    <th scope="row">{round(r.conversion * 100, 4)}%</th>
                    <td>{rangeText(r.low, r.high)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="crosslink-notes">
            {data.models.postCure}。{notes.lambda}（λ = {round(postCure.lambda.low, 3)}／{round(postCure.lambda.high, 3)}）
          </p>
          <h4>完全固化最低溫度</h4>
          <ResultValue
            result={{
              value: round(postCure.minFullCureTemp.low.tgC, 4),
              unit: `°C 至 ${round(postCure.minFullCureTemp.high.tgC, 4)} °C`,
              modelName: `T ≥ Tg∞（Tg∞ 下限至上限）；${notes.fullCure}`,
              confidence: 'trend',
              sources: [],
            }}
          />
          <h4>指定硬化溫度下的最大轉化率</h4>
          {postCure.maxConversion === null ? (
            <p className="crosslink-notes">未填硬化溫度。</p>
          ) : (
            <>
              <ResultValue
                result={{
                  value: round(postCure.maxConversion.high * 100, 4),
                  unit: `% 至 ${round(postCure.maxConversion.low * 100, 4)} %（${round(postCure.maxConversion.cureTempC, 4)} °C；Tg∞ 上限至下限）`,
                  modelName: notes.maxConversion,
                  confidence: 'trend',
                  sources: [],
                }}
              />
            </>
          )}
        </>
      ) : (
        <MissingLine label="固化後 Tg、完全固化最低溫度、最大轉化率" reason={postCure.reason} />
      )}

      <h3>Tg∞ 與 Td,1/2</h3>
      {td.warning.status === 'triggered' && (
        <div className="error" role="alert">
          <p>
            ⚠ {td.warning.text}（Tg∞ 上限高於「{td.lowest?.name}」的 Td,1/2 {td.lowest ? `${round(td.lowest.tdC, 4)} °C` : ''}）。
          </p>
        </div>
      )}
      {td.warning.status === 'clear' && <p className="crosslink-notes">{td.warning.text}。</p>}
      {td.warning.status === 'cannot-judge' && <p className="structure-notice" role="status">{td.warning.text}</p>}
      <ul className="crosslink-notes">
        {td.components.map((c) => (
          <li key={c.name}>
            {c.name}：{c.status === 'ok' && c.tdC !== null && c.tdK !== null ? `Td,1/2 ${round(c.tdC, 4)} °C（${round(c.tdK, 4)} K）` : `未比較（${c.reason}）`}
          </li>
        ))}
        {td.excluded.map((c) => (
          <li key={`x-${c.name}`}>
            {c.name}：{c.reason}
          </li>
        ))}
      </ul>
      <p className="crosslink-notes">{td.model}。{notes.td}</p>
    </>
  );
}
