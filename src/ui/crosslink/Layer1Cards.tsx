// 「交聯」分頁的第 1 層與理論配比卡片（任務 017，D11、D40、D41、D44）。
// 依 D09，不顯示各成分的官能基數量、當量與分子量；網路計算結果（成鍵數、交聯密度、Mc 等）照常顯示（D44）。
import { useMemo, useState } from 'react';
import {
  LAYER1_DIRECT_MODEL_NAME,
  LAYER1_MODEL_NAME,
  MESSAGE_NEVER_GELS,
  MESSAGE_NOT_GELLED,
  NOTE_M06,
  NOTE_MASS_BASIS,
  NOTE_MC_DEFINITION,
  NOTE_MN_ONLY,
  NOTE_NON_INTEGER,
  computeLayer1,
} from '../../core/crosslink/layer1/layer1';
import { describeAmounts, prepareLayer1, type PrepareOutcome } from '../../core/crosslink/layer1/prepare';
import {
  DEFAULT_SCAN,
  SCAN_DISCLAIMER,
  SCAN_MODEL_NAME,
  SCAN_OPTIONS,
  checkScanSettings,
  scanRatio,
  stoichiometricSetup,
  type ScanResult,
} from '../../core/crosslink/layer1/stoich';
import type { CrosslinkResult } from '../../core/crosslink/types';
import { computeFormulation } from '../../core/formulation/compute';
import type { Formulation } from '../../core/formulation/types';
import { confidenceLabel, type CalcResult, type Confidence } from '../../core/result';
import { ResultValue } from '../components/ResultValue';
import { UnifiedNote } from '../components/UnifiedNote';

const UNIT_LABEL: Record<string, string> = { g: 'g', parts: '重量份', wt: 'wt%', mol: 'mol%', phr: 'phr' };

const round = (v: number, digits = 4) => Number(v.toPrecision(digits));

function calc(value: number | null, unit: string, modelName: string, confidence: Confidence, notApplicable?: string): CalcResult {
  return { value: value === null ? null : round(value), unit, modelName, confidence, sources: [], ...(notApplicable ? { notApplicable } : {}) };
}

/** 讀取畫面上「配方」分頁的配方，整理第 1 層的輸入 */
function usePrepared(result: CrosslinkResult, formulation: Formulation | null): PrepareOutcome | null {
  return useMemo(() => {
    if (!formulation) return null;
    const mw: Record<string, number | undefined> = {};
    for (const c of result.components) mw[c.id] = c.molarMass ?? undefined;
    return prepareLayer1(result, formulation, computeFormulation(formulation, mw));
  }, [result, formulation]);
}

function parseNumber(text: string): number {
  const t = text.trim();
  return t === '' ? Number.NaN : Number(t);
}

interface Props {
  result: CrosslinkResult;
  formulation: Formulation | null;
}

/** 第 1 層與理論配比共用同一份轉化率輸入，所以由這個元件一併提供兩張卡片 */
export function Layer1Section({ result, formulation }: Props) {
  const prep = usePrepared(result, formulation);
  const [convText, setConvText] = useState('100');
  const conv = parseNumber(convText);
  const convValid = Number.isFinite(conv) && conv >= 0 && conv <= 100;

  return (
    <>
      <section className="card" aria-labelledby="layer1-title">
        <h2 id="layer1-title">交聯（第 1 層）</h2>
        <p>
          依目前配方的用量，算出反應官能基比、過量官能基、理論最大成鍵數，以及指定轉化率下的凝膠點、溶膠分率、交聯密度、網目分子量 Mc 與殘留官能基。
        </p>
        {prep === null ? (
          <p className="structure-placeholder">配方裡還沒有成分。</p>
        ) : !prep.ok ? (
          <p className="structure-notice" role="status">
            第 1 層無法計算：{prep.reason}
          </p>
        ) : (
          <>
            <div className="form-row-inline" id="field-conversion">
              <label htmlFor="conversion-input">限量官能基轉化率</label>
              <div className="amount-input">
                <input
                  id="conversion-input"
                  type="text"
                  inputMode="decimal"
                  value={convText}
                  aria-invalid={!convValid}
                  onChange={(e) => setConvText(e.target.value)}
                />
                <span className="amount-unit">%</span>
              </div>
              <small>0–100%，預設 100%。兩類官能基的轉化率依化學計量關係換算。</small>
            </div>
            {!convValid && (
              <div className="error" role="alert">
                <p>轉化率必須是 0–100 的數字。</p>
              </div>
            )}
            {convValid && <Layer1Output prep={prep} conv={conv / 100} />}
          </>
        )}
      </section>

      {prep !== null && prep.ok && convValid && <TheoryCard prep={prep} conv={conv / 100} />}
    </>
  );
}

function Layer1Output({ prep, conv }: { prep: Extract<PrepareOutcome, { ok: true }>; conv: number }) {
  const r = computeLayer1(prep.setup, conv);
  if (!r) return <p className="structure-notice">兩類官能基必須都有，才能計算。</p>;
  const { setup } = prep;
  const name = (side: 'A' | 'B' | null) => (side === 'A' ? setup.nameA : side === 'B' ? setup.nameB : '');
  const direct = LAYER1_DIRECT_MODEL_NAME;
  const mm = LAYER1_MODEL_NAME;
  const notes = [r.usedMixtureApprox ? NOTE_NON_INTEGER : null, r.hasPolymer ? NOTE_MN_ONLY : null, NOTE_MASS_BASIS].filter((n): n is string => n !== null);

  return (
    <>
      <h3>直接計算</h3>
      <div className="result-value">
        <div className="result-head">
          <span className="result-number">{r.ratioText}</span>
          <span className={`confidence-tag confidence-direct`}>{confidenceLabel('direct')}</span>
        </div>
        <p className="result-model">模型：{direct}</p>
        <p className="result-model">
          限量官能基：{r.limiting === 'equal' ? '兩者等量' : name(r.limiting)}
          {r.excess ? `；過量官能基：${name(r.excess)}` : ''}
        </p>
      </div>
      <div className="crosslink-grid">
        <div>
          <h4>過量百分比</h4>
          <ResultValue result={calc(r.excess ? r.excessPct : 0, '%', direct, 'direct')} />
        </div>
        <div>
          <h4>理論最大成鍵數（限量官能基完全反應）</h4>
          <ResultValue result={calc(r.maxBondsMolPer100g, 'mol／100 g 固體', direct, 'direct')} />
        </div>
        <div>
          <h4>殘留{setup.nameA}</h4>
          <ResultValue result={calc(r.residualAPct, '%（相對初始量）', direct, 'direct')} />
        </div>
        <div>
          <h4>殘留{setup.nameB}</h4>
          <ResultValue result={calc(r.residualBPct, '%（相對初始量）', direct, 'direct')} />
        </div>
      </div>

      <h3>Miller–Macosko（指定轉化率 {round(conv * 100, 4)}%）</h3>
      <div className="crosslink-grid">
        <div>
          <h4>凝膠點（限量官能基轉化率）</h4>
          <ResultValue
            result={calc(r.gelConversion === null ? null : r.gelConversion * 100, '%', mm, 'estimate', r.gelConversion === null ? MESSAGE_NEVER_GELS : undefined)}
          />
        </div>
        <div>
          <h4>溶膠分率</h4>
          <ResultValue result={calc(r.solFraction * 100, '%', mm, 'estimate')} />
        </div>
        <div>
          <h4>交聯密度（有效交聯點）</h4>
          <ResultValue result={calc(r.junctionsMolPerKg, 'mol/kg 固體', mm, 'estimate', r.gelled ? undefined : MESSAGE_NOT_GELLED)} />
        </div>
        <div>
          <h4>網目分子量 Mc</h4>
          <ResultValue result={calc(r.mcGPerMol, 'g/mol', mm, 'estimate', r.gelled ? undefined : MESSAGE_NOT_GELLED)} />
        </div>
      </div>
      <ul className="crosslink-notes">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
        <li>{NOTE_MC_DEFINITION}</li>
      </ul>
      <p className="crosslink-m06" role="note">
        {NOTE_M06}
      </p>
      <UnifiedNote />
    </>
  );
}

// ---------- 理論配比與比例掃描 ----------

function TheoryCard({ prep, conv }: { prep: Extract<PrepareOutcome, { ok: true }>; conv: number }) {
  const [optionIndex, setOptionIndex] = useState(0);
  const [minText, setMinText] = useState(String(DEFAULT_SCAN.min));
  const [maxText, setMaxText] = useState(String(DEFAULT_SCAN.max));
  const [pointsText, setPointsText] = useState(String(DEFAULT_SCAN.points));
  const option = SCAN_OPTIONS[optionIndex];
  const settings = { min: parseNumber(minText), max: parseNumber(maxText), points: parseNumber(pointsText) };
  const settingsError = checkScanSettings(settings);

  const stoich = useMemo(() => {
    const st = stoichiometricSetup(prep.setup);
    return st ? describeAmounts(prep, st) : null;
  }, [prep]);
  const scan = useMemo<ScanResult | null>(
    () => (settingsError === null ? scanRatio(prep.setup, conv, option, settings) : null),
    // settings 由三個輸入文字決定
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prep.setup, conv, option, settingsError, minText, maxText, pointsText],
  );
  const best = scan && scan.bestSetup ? describeAmounts(prep, scan.bestSetup) : null;
  const atBoundary = scan?.bestIndex != null && (scan.bestIndex === 0 || scan.bestIndex === scan.points.length - 1);

  return (
    <section className="card" aria-labelledby="theory-title">
      <h2 id="theory-title">理論配比</h2>

      <h3>化學計量配比</h3>
      <p>
        保持「{prep.setup.nameA}」一側的用量不變，按比例調整「{prep.setup.nameB}」一側所有成分（成分之間的相對比例不變），使兩類官能基等量。
        <span className="confidence-tag confidence-direct">{confidenceLabel('direct')}</span>
      </p>
      {stoich ? <AmountTable data={stoich} current={prep} /> : <p className="structure-placeholder">無法計算化學計量配比。</p>}

      <h3>比例掃描</h3>
      <p>
        在當量比（{prep.setup.nameB}／{prep.setup.nameA}）範圍內掃描，畫出所選物性的變化並標出模型下的最佳點。轉化率使用上方的「限量官能基轉化率」。
        <span className="confidence-tag confidence-trend">{confidenceLabel('trend')}</span>
      </p>
      <div className="form-row-inline">
        <label htmlFor="scan-property">目標物性與方向</label>
        <select id="scan-property" value={optionIndex} onChange={(e) => setOptionIndex(Number(e.target.value))}>
          {SCAN_OPTIONS.map((o, i) => (
            <option key={o.label} value={i}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row-inline">
        <label htmlFor="scan-min">當量比範圍</label>
        <input id="scan-min" type="text" inputMode="decimal" value={minText} aria-label="當量比下限" onChange={(e) => setMinText(e.target.value)} />
        <span>至</span>
        <input id="scan-max" type="text" inputMode="decimal" value={maxText} aria-label="當量比上限" onChange={(e) => setMaxText(e.target.value)} />
        <label htmlFor="scan-points">點數</label>
        <input id="scan-points" type="text" inputMode="numeric" value={pointsText} onChange={(e) => setPointsText(e.target.value)} />
      </div>
      {settingsError && (
        <div className="error" role="alert">
          <p>{settingsError}</p>
        </div>
      )}
      {scan && (
        <>
          <ScanChart scan={scan} option={option} nameA={prep.setup.nameA} nameB={prep.setup.nameB} />
          {scan.bestIndex === null ? (
            <p className="structure-notice">掃描範圍內此物性都不適用（例如都未凝膠），沒有最佳點。</p>
          ) : (
            <div className="result-value">
              <div className="result-head">
                <span className="result-number">當量比 {round(scan.points[scan.bestIndex].ratio, 4)}</span>
                <span className="result-unit">
                  {option.label}：{round(scan.points[scan.bestIndex].value as number)} {option.unit}
                </span>
                <span className="confidence-tag confidence-trend">{confidenceLabel('trend')}</span>
              </div>
              <p className="result-model">模型：{SCAN_MODEL_NAME}（{LAYER1_MODEL_NAME}）</p>
              <p className="result-model">目前配方的當量比：{round(scan.currentRatio, 4)}</p>
              {atBoundary && <p className="crosslink-m06">最佳點位於掃描範圍的邊界，範圍外可能更佳；請調整範圍。</p>}
              {best && (
                <>
                  <p>最佳點對應的各成分用量：</p>
                  <AmountTable data={best} current={prep} />
                </>
              )}
            </div>
          )}
        </>
      )}
      <p className="crosslink-m06" role="note">
        {SCAN_DISCLAIMER}。
      </p>
      <UnifiedNote />
    </section>
  );
}

function AmountTable({ data, current }: { data: ReturnType<typeof describeAmounts>; current: Extract<PrepareOutcome, { ok: true }> }) {
  const unit = UNIT_LABEL[data.unit] ?? data.unit;
  const showParts = data.unit === 'wt' || data.unit === 'mol' || data.unit === 'phr';
  const fmt = (v: number | null) => (v === null ? '—' : String(round(v, 4)));
  return (
    <div className="table-wrap">
      <table className="result-table crosslink-table">
        <thead>
          <tr>
            <th scope="col">成分</th>
            <th scope="col">目前用量（{unit}）</th>
            <th scope="col">調整後用量（{unit}）</th>
            {showParts && <th scope="col">調整後（重量份）</th>}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const old = current.items.find((i) => i.id === row.id);
            return (
              <tr key={row.id}>
                <th scope="row">{row.name}</th>
                <td>{fmt(old ? old.amountOld : null)}</td>
                <td>{fmt(row.amount)}</td>
                {showParts && <td>{fmt(row.parts)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {showParts && <small>重量份：以目前固體總量為 100 份計。</small>}
    </div>
  );
}

// ---------- SVG 曲線（不使用圖表套件） ----------

const W = 640;
const H = 300;
const M = { left: 64, right: 16, top: 16, bottom: 44 };

function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  return Array.from({ length: count }, (_, i) => lo + ((hi - lo) * i) / (count - 1));
}

function ScanChart({ scan, option, nameA, nameB }: { scan: ScanResult; option: (typeof SCAN_OPTIONS)[number]; nameA: string; nameB: string }) {
  const xs = scan.points.map((p) => p.ratio);
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];
  const vals = scan.points.map((p) => p.value).filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  let yMin = Math.min(...vals);
  let yMax = Math.max(...vals);
  if (yMax - yMin < 1e-12) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.08;
  yMin -= pad;
  yMax += pad;
  const sx = (x: number) => M.left + ((x - xMin) / (xMax - xMin)) * (W - M.left - M.right);
  const sy = (y: number) => H - M.bottom - ((y - yMin) / (yMax - yMin)) * (H - M.top - M.bottom);

  // 值為 null 的點（不適用）把曲線切成幾段
  const segments: string[] = [];
  let cur: string[] = [];
  for (const p of scan.points) {
    if (p.value === null) {
      if (cur.length) segments.push(cur.join(' '));
      cur = [];
    } else cur.push(`${sx(p.ratio).toFixed(1)},${sy(p.value).toFixed(1)}`);
  }
  if (cur.length) segments.push(cur.join(' '));

  const best = scan.bestIndex === null ? null : scan.points[scan.bestIndex];
  const currentInRange = scan.currentRatio >= xMin && scan.currentRatio <= xMax;
  const fmtY = (v: number) => String(Number(v.toPrecision(3)));

  return (
    <figure className="crosslink-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${option.label}隨當量比變化的曲線`} preserveAspectRatio="xMidYMid meet">
        <title>{option.label}隨當量比變化的曲線</title>
        <rect x={M.left} y={M.top} width={W - M.left - M.right} height={H - M.top - M.bottom} className="chart-plot" />
        {niceTicks(yMin, yMax).map((v) => (
          <g key={`y${v}`}>
            <line x1={M.left} x2={W - M.right} y1={sy(v)} y2={sy(v)} className="chart-grid" />
            <text x={M.left - 6} y={sy(v) + 4} textAnchor="end" className="chart-text">
              {fmtY(v)}
            </text>
          </g>
        ))}
        {niceTicks(xMin, xMax).map((v) => (
          <text key={`x${v}`} x={sx(v)} y={H - M.bottom + 16} textAnchor="middle" className="chart-text">
            {String(Number(v.toFixed(3)))}
          </text>
        ))}
        <text x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle" className="chart-text">
          當量比（{nameB}／{nameA}）
        </text>
        <text transform={`translate(14 ${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" className="chart-text">
          {option.label.replace(/（.*）/, '')}（{option.unit}）
        </text>
        {currentInRange && (
          <g>
            <line x1={sx(scan.currentRatio)} x2={sx(scan.currentRatio)} y1={M.top} y2={H - M.bottom} className="chart-current" />
            <text x={sx(scan.currentRatio) + 4} y={M.top + 12} className="chart-text">
              目前
            </text>
          </g>
        )}
        {segments.map((pts) => (
          <polyline key={pts} points={pts} className="chart-line" fill="none" />
        ))}
        {best && best.value !== null && (
          <g>
            <circle cx={sx(best.ratio)} cy={sy(best.value)} r={5} className="chart-best" />
            <text x={sx(best.ratio)} y={sy(best.value) - 10} textAnchor="middle" className="chart-text">
              最佳
            </text>
          </g>
        )}
      </svg>
      <figcaption>
        實線為所選物性；虛線為目前配方的當量比{currentInRange ? '' : `（${String(Number(scan.currentRatio.toFixed(3)))}，在掃描範圍外）`}；圓點為模型最佳點。
      </figcaption>
    </figure>
  );
}
