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
import { computeCureViaEngine, cureBody, type CureData, type CureOutcome, type CureShrinkage, type CureTemperatureRanges } from '../engine/crosslinkEngine';
import { ResultBlock } from '../workbench/ResultBlock';
import {
  CURE_TEMP_HINT,
  CURE_TEMP_REQUIRED_TEXT,
  DEFAULT_CURE_TEMP_TEXT,
  SHRINKAGE_EXCLUDED_TEXT,
  SHRINKAGE_KIND_DIRECT,
  SHRINKAGE_SECTION_TITLE,
  SHRINKAGE_SIGN_TEXT,
  TEMP_NO_RANGE_TEXT,
  TEMP_SECTION_TITLE,
} from './cureText';
import { calc, parseNumber, round, useEngineCall } from './Layer1Cards';

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
        依目前配方，估算未交聯 Tg、完全固化時的 Tg∞（範圍）、不同轉化率下的 Tg、完全固化最低溫度與指定硬化溫度下的最大轉化率，並檢查 Tg∞ 是否高於成分的 Td,1/2；另列各反應的文獻溫度範圍與估算固化收縮。
        <span className="confidence-tag confidence-trend">{confidenceLabel('trend')}</span>
      </p>
      <div className="form-row-inline" id="field-cure-temp">
        <label htmlFor="cure-temp-input">硬化溫度</label>
        <div className="amount-input">
          <input id="cure-temp-input" type="text" inputMode="decimal" value={tempText} aria-invalid={!tempValid} onChange={(e) => setTempText(e.target.value)} />
          <span className="amount-unit">°C</span>
        </div>
        <small>{CURE_TEMP_HINT}</small>
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
        <>
          <p className="structure-notice" role="status">
            固化預測無法計算：{state.value.reason}
          </p>
          {/* 反應溫度範圍只是顯示規則表的文獻值（不是計算），第 1 層不支援的體系也列出；固化收縮需要第 1 層的鍵莫耳數，不硬算 */}
          {state.value.temperatureRanges !== null && <TemperatureSection data={state.value.temperatureRanges} />}
        </>
      ) : (
        <>
          <CureOutput data={state.value} />
          <TemperatureSection data={state.value.temperatureRanges} />
          <ShrinkageSection data={state.value.shrinkage} />
        </>
      )}
      <UnifiedNote />
    </ResultBlock>
  );
}

function TemperatureSection({ data }: { data: CureTemperatureRanges }) {
  return (
    <>
      <h3>{TEMP_SECTION_TITLE}</h3>
      <p className="crosslink-notes">{data.note}</p>
      {data.rows.length === 0 ? (
        <p className="structure-notice" role="status">配方中沒有命中的反應規則。</p>
      ) : (
        <div className="table-wrap">
          <table className="result-table crosslink-table">
            <thead>
              <tr>
                <th scope="col">反應規則</th>
                <th scope="col">文獻溫度範圍</th>
                <th scope="col">適用條件（notes 摘要）</th>
                <th scope="col">出處</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.ruleId}>
                  <th scope="row">
                    {r.label}
                    <br />
                    <small>{r.ruleId}</small>
                  </th>
                  <td>{r.text}</td>
                  <td>
                    {r.conditions !== '' ? r.conditions : r.status === 'photo' ? `光觸發（${r.catalyst}），溫度不是觸發條件` : `${TEMP_NO_RANGE_TEXT}（規則表欄位空白）`}
                    <details>
                      <summary>完整 notes</summary>
                      <small>{r.notes}</small>
                    </details>
                  </td>
                  <td>
                    <small>{r.source}</small>
                    <br />
                    <small>審核狀態：{r.reviewStatus}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ShrinkageSection({ data }: { data: CureShrinkage }) {
  const direct = data.reactions.filter((r) => r.kind === 'direct');
  const interpreted = data.reactions.filter((r) => r.kind === 'interpreted');
  return (
    <>
      <h3>
        {SHRINKAGE_SECTION_TITLE}
        <span className="confidence-tag confidence-trend">{confidenceLabel('trend')}</span>
      </h3>
      <ul className="crosslink-notes">
        {direct.map((r) => (
          <li key={r.ruleId}>
            {r.name}：{SHRINKAGE_KIND_DIRECT} ΔV = {round(r.deltaV ?? 0, 4)} cm³/mol。出處：{r.source}
          </li>
        ))}
        {interpreted.map((r) => (
          <li key={r.ruleId}>
            {r.name}：<strong>{r.interpretation}</strong> ΔV = {round(r.deltaV ?? 0, 4)} cm³/mol。{r.note}出處（{r.borrowedFrom}）：{r.source}
          </li>
        ))}
        {data.excluded.map((r) => (
          <li key={`x-${r.ruleId}`}>
            {r.name}：{SHRINKAGE_EXCLUDED_TEXT}（{r.reason}）
          </li>
        ))}
      </ul>
      {data.status === 'missing' ? (
        <MissingLine label="固化收縮" reason={data.reason} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="result-table crosslink-table">
              <thead>
                <tr>
                  <th scope="col">轉化率</th>
                  <th scope="col">{SHRINKAGE_SIGN_TEXT}</th>
                  <th scope="col">其中：直接文獻值</th>
                  <th scope="col">其中：詮釋（沿用環氧開環值）</th>
                </tr>
              </thead>
              <tbody>
                {data.table.map((r) => (
                  <tr key={r.conversion}>
                    <th scope="row">{round(r.conversion * 100, 4)}%</th>
                    <td>{round(r.totalPct, 4)} %</td>
                    <td>{r.directPct === 0 && direct.length === 0 ? '—' : `${round(r.directPct, 4)} %`}</td>
                    <td>{interpreted.length === 0 ? '—' : `${round(r.interpretedPct, 4)} %`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="crosslink-notes">混合密度 ρ = {round(data.density.gPerCm3, 4)} g/cm³（{data.density.model}）。</p>
          {(data.density.components ?? []).filter((c) => c.densitySource === 'user').map((c) => (
            <p className="crosslink-notes" key={c.name}>
              {c.name} 的密度 {c.density} g/cm³：{c.densitySourceLabel ?? '使用者輸入'}
              {c.userDensitySource ? `；來源：${c.userDensitySource}` : '；未填來源'}
            </p>
          ))}
        </>
      )}
      <p className="crosslink-notes">{data.model}。{data.note}</p>
    </>
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
            <p className="structure-notice" role="status">{CURE_TEMP_REQUIRED_TEXT}</p>
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
