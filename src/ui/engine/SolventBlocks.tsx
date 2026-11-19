// 右欄的「Liquid 體積比（vol%）」與「溶解性」卡片（任務 P8-1，PLAN 8.2、8.3）：呼叫桌面版的 Python 引擎。
// 沿用 ResultBlock 與既有表格樣式；純網頁沒有引擎：顯示「需要桌面版與引擎」。數值由引擎計算，這裡只顯示。
import { useEffect, useMemo, useState } from 'react';
import type { Formulation, FormulationOutcome } from '../../core/formulation/types';
import { UnifiedNote } from '../components/UnifiedNote';
import { ResultBlock } from '../workbench/ResultBlock';
import { bundledSolventOptions } from '../workbench/solvents';
import { getBridge, type EngineQuantity, type EngineReply, type EngineStatus } from './engineClient';
import { POLYMER_HSP_MISSING_NOTE } from './propertyRows';
import { liquidVolumeRequest, solubilityPolymers, solubilityRequest, type SolventChoice } from './solventRequests';

export function fmt(v: number, digits = 4): string {
  return String(Number(v.toPrecision(digits)));
}

export function useEngineStatus(): { bridge: ReturnType<typeof getBridge>; status: EngineStatus | null } {
  const bridge = getBridge();
  const [status, setStatus] = useState<EngineStatus | null>(null);
  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    void bridge.status().then((s) => !cancelled && setStatus(s));
    return () => {
      cancelled = true;
    };
  }, [bridge]);
  return { bridge, status };
}

/** 引擎無法使用時的說明；可以使用（ready）回傳 null */
export function unavailable(bridge: ReturnType<typeof getBridge>, status: EngineStatus | null) {
  if (!bridge) return <p role="status">需要桌面版與引擎</p>;
  if (status === null || status.state === 'starting') return <p role="status">引擎啟動中…</p>;
  if (status.state !== 'ready') return <p className="form-error" role="alert">引擎無法使用：{status.error ?? '未啟動'}。其餘功能不受影響。</p>;
  return null;
}

export function replyBody(reply: EngineReply | null): { body: Record<string, unknown> | null; error: string | null } {
  if (reply === null) return { body: null, error: null };
  if (!reply.ok) return { body: null, error: reply.error };
  if (reply.status !== 200 || reply.body.ok !== true) {
    const errors = reply.body.errors;
    return { body: null, error: Array.isArray(errors) ? errors.map(String).join('；') : '引擎回報錯誤' };
  }
  return { body: reply.body, error: null };
}

/** 依請求（JSON 字串為鍵）呼叫一次引擎；請求內容改變才重算 */
export function useEngineReply(request: { path: string; body: Record<string, unknown> } | null, ready: boolean): { reply: EngineReply | null; busy: boolean } {
  const key = JSON.stringify(request);
  const bridge = getBridge();
  const [state, setState] = useState<{ key: string; reply: EngineReply | null }>({ key: '', reply: null });
  useEffect(() => {
    if (!ready || !bridge || request === null) return;
    let cancelled = false;
    void bridge.call(request.path, request.body).then((reply) => {
      if (!cancelled) setState({ key, reply });
    });
    return () => {
      cancelled = true;
    };
    // key 代表 request 的內容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);
  return { reply: state.key === key ? state.reply : null, busy: request !== null && ready && state.key !== key };
}

// ---------- Liquid 體積比 ----------

interface LiquidRowReply {
  name: string;
  amount: number;
  density: { value: number; unit: string; source: string; temperatureC: number | null; basis: string } | null;
  densityReason: string | null;
  volPct: EngineQuantity & { reason: string | null };
}

interface Props {
  /** 已延遲重算的配方（與換算結果同一份） */
  formulation: Formulation;
  outcome: FormulationOutcome | null;
}

export function LiquidVolumeBlock({ formulation, outcome }: Props) {
  const { bridge, status } = useEngineStatus();
  const planned = useMemo(() => liquidVolumeRequest(formulation, outcome), [formulation, outcome]);
  const ready = status?.state === 'ready';
  const { reply, busy } = useEngineReply(planned.request, ready);
  const { body, error } = replyBody(reply);
  const rows = (body?.components as LiquidRowReply[] | undefined) ?? [];

  let content;
  const off = unavailable(bridge, status);
  if (off) content = off;
  else if (planned.request === null) content = <p role="status">{planned.reason}</p>;
  else if (error) content = <p className="form-error" role="alert">{error}</p>;
  else if (busy || body === null) content = <p role="status">引擎計算中…</p>;
  else {
    content = (
      <>
        <p className="result-meta">
          模型：Liquid 體積百分率（質量 ÷ 密度的體積加成）　<span className="confidence-tag confidence-direct">直接計算</span>
        </p>
        <div className="table-wrap">
          <table className="result-table">
            <thead>
              <tr>
                <th scope="col">成分</th>
                <th scope="col">密度（g/cm³）</th>
                <th scope="col">密度來源</th>
                <th scope="col">vol%</th>
                <th scope="col">status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.name}-${i}`}>
                  <th scope="row">{r.name}</th>
                  <td className={`number${r.density ? '' : ' cell-na'}`}>{r.density ? fmt(r.density.value) : '—'}</td>
                  <td>
                    <small>{r.density ? `${r.density.basis === 'user' ? '使用者輸入' : '溶劑資料表'}${r.density.temperatureC === null ? '' : `（${r.density.temperatureC} °C）`}；${r.density.source}` : r.densityReason}</small>
                  </td>
                  <td className={`number${r.volPct.value === null ? ' cell-na' : ''}`}>{r.volPct.value === null ? '—' : fmt(r.volPct.value)}</td>
                  <td>
                    {r.volPct.status}
                    {r.volPct.reason && <small> — {r.volPct.reason}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <small>密度取成分上填的值（含從溶劑資料表帶入的），沒有時依結構對應溶劑資料表（最接近 25 °C 的一列，標出溫度）；缺密度的成分會讓 vol% 回報 missing。理想體積加成，無過量體積。</small>
      </>
    );
  }
  return (
    <ResultBlock id="liquid-volume" title="Liquid 體積比（vol%）">
      {content}
      <UnifiedNote />
    </ResultBlock>
  );
}

// ---------- 溶解性 ----------

interface HspSet {
  deltaD: number | null;
  deltaP: number | null;
  deltaH: number | null;
  delta: number | null;
}

type Quantity = EngineQuantity;

interface SolubilityReply {
  polymer: { status: string; quantities: Record<'deltaD' | 'deltaP' | 'deltaH' | 'delta', Quantity>; reasons: Record<string, string>; warnings?: string[]; groups: { name: string }[]; missing: { description: string }[]; volume: { value: number; basis: string } | null };
  solvent: { status: string; components: { label: string; volumeFraction?: number; density?: { value: number; source: string; temperatureC: number | null; basis: string } }[]; hsp?: { deltaD: number; deltaP: number; deltaH: number; delta: number }; molarVolume?: number; reason?: string };
  ra: Quantity;
  r0: Quantity;
  red: Quantity;
  chi: Quantity;
  bookCenter: { ra: Quantity; red: Quantity };
  bookDistance: Quantity;
  tableMatch: { name: string; deltaD: number; deltaP: number; deltaH: number } | null;
  judgement: { overall: string; parts: { basis: string; text: string }[]; note: string };
  reasons: Record<string, string>;
  notes: string[];
  temperatureK: number;
}

const cell = (v: number | null) => (v === null ? '—' : fmt(v, 3));

function polymerSet(q: SolubilityReply['polymer']['quantities']): HspSet {
  return { deltaD: q.deltaD.value, deltaP: q.deltaP.value, deltaH: q.deltaH.value, delta: q.delta.value };
}

export function SolubilityBlock({ formulation, outcome }: Props) {
  const { bridge, status } = useEngineStatus();
  const polymers = useMemo(() => solubilityPolymers(formulation), [formulation]);
  const choices = useMemo(() => bundledSolventOptions(), []);
  const [polymerId, setPolymerId] = useState<string | null>(null);
  const [choice, setChoice] = useState<SolventChoice>({ kind: 'liquid' });
  const activePolymer = polymers.find((c) => c.id === polymerId) ?? polymers[0] ?? null;
  const planned = useMemo(() => solubilityRequest(formulation, outcome, activePolymer?.id ?? null, choice), [formulation, outcome, activePolymer, choice]);
  const ready = status?.state === 'ready';
  const { reply, busy } = useEngineReply(planned.request, ready);
  const { body, error } = replyBody(reply);
  const r = body as unknown as SolubilityReply | null;

  let content;
  const off = unavailable(bridge, status);
  if (off) content = off;
  else {
    content = (
      <>
        <div className="form-row-inline">
          <label htmlFor="sol-polymer">聚合物成分</label>
          <select id="sol-polymer" value={activePolymer?.id ?? ''} disabled={polymers.length === 0} onChange={(e) => setPolymerId(e.target.value)}>
            {polymers.length === 0 && <option value="">（Solid 區沒有聚合物）</option>}
            {polymers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || '（未命名）'}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row-inline">
          <label htmlFor="sol-solvent">（混合）溶劑</label>
          <select
            id="sol-solvent"
            value={choice.kind === 'liquid' ? '__liquid__' : choice.id}
            onChange={(e) => setChoice(e.target.value === '__liquid__' ? { kind: 'liquid' } : { kind: 'solvent', id: e.target.value })}
          >
            <option value="__liquid__">配方的 Liquid 成分（混合溶劑，依質量比例與密度換算體積分率）</option>
            {choices.map((o) => (
              <option key={o.id} value={o.id}>
                單一溶劑：{o.nameZh || o.nameEn}
              </option>
            ))}
          </select>
        </div>
        {activePolymer && (activePolymer.polymer?.units?.length ?? 0) > 1 && <small>共聚物：以第一種單元計算（共聚物的混合 HSP 本版不處理）。</small>}
        {planned.request === null ? (
          <p role="status">{planned.reason}</p>
        ) : error ? (
          <p className="form-error" role="alert">{error}</p>
        ) : busy || r === null ? (
          <p role="status">引擎計算中…</p>
        ) : (
          <SolubilityResult r={r} />
        )}
      </>
    );
  }
  return (
    <ResultBlock id="solubility" title="溶解性（HSP、Ra、RED、χ）">
      {content}
      <UnifiedNote />
    </ResultBlock>
  );
}

function QuantityRow({ label, q, reason }: { label: string; q: Quantity; reason?: string }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className={`number${q.value === null ? ' cell-na' : ''}`}>{q.value === null ? '—' : fmt(q.value)}</td>
      <td>{q.unit}</td>
      <td><small>{q.source}</small></td>
      <td>
        {q.status}
        {q.value === null && reason && <small> — {reason}</small>}
      </td>
    </tr>
  );
}

function SolubilityResult({ r }: { r: SolubilityReply }) {
  const poly = polymerSet(r.polymer.quantities);
  const sol: HspSet | null = r.solvent.hsp ?? null;
  const polyReasons = Array.from(new Set(Object.values(r.polymer.reasons)));
  return (
    <>
      <p className="result-meta">
        模型：HSP 基團貢獻（Hoftyzer–Van Krevelen）、Hansen Ra／RED、Flory–Huggins χ　<span className="confidence-tag confidence-trend">參考趨勢</span>
      </p>
      <div className="table-wrap">
        <table className="result-table">
          <thead>
            <tr>
              <th scope="col">HSP（MPa^0.5）</th>
              <th scope="col">δD</th>
              <th scope="col">δP</th>
              <th scope="col">δH</th>
              <th scope="col">總 δ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">聚合物（基團貢獻）</th>
              <td className="number">{cell(poly.deltaD)}</td>
              <td className="number">{cell(poly.deltaP)}</td>
              <td className="number">{cell(poly.deltaH)}</td>
              <td className="number">{cell(poly.delta)}</td>
            </tr>
            <tr>
              <th scope="row">{r.solvent.components.length > 1 ? '混合溶劑（體積分率加權）' : '溶劑（Hansen 2007，25 °C）'}</th>
              <td className="number">{cell(sol?.deltaD ?? null)}</td>
              <td className="number">{cell(sol?.deltaP ?? null)}</td>
              <td className="number">{cell(sol?.deltaH ?? null)}</td>
              <td className="number">{cell(sol?.delta ?? null)}</td>
            </tr>
            {r.tableMatch && (
              <tr>
                <th scope="row">對照：書 Table 7.8 的 {r.tableMatch.name}</th>
                <td className="number">{cell(r.tableMatch.deltaD)}</td>
                <td className="number">{cell(r.tableMatch.deltaP)}</td>
                <td className="number">{cell(r.tableMatch.deltaH)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {polyReasons.length > 0 && <small className="form-warning">聚合物 HSP 缺值：{polyReasons.join('；')}</small>}
      {r.polymer.missing.length > 0 && <small className="form-warning"> 缺基團：{r.polymer.missing.map((m) => m.description).join('；')}</small>}
      {r.polymer.missing.length > 0 && <small className="form-warning"> {POLYMER_HSP_MISSING_NOTE}</small>}
      {r.solvent.status !== 'ok' && <p className="form-error" role="alert">混合溶劑算不出：{r.solvent.reason}</p>}
      {r.solvent.components.length > 1 && r.solvent.status === 'ok' && (
        <small>
          體積分率：{r.solvent.components.map((c) => `${c.label} ${c.volumeFraction === undefined ? '—' : fmt(c.volumeFraction * 100, 3)}%`).join('、')}
        </small>
      )}
      <div className="table-wrap">
        <table className="result-table">
          <thead>
            <tr>
              <th scope="col">項目</th>
              <th scope="col">value</th>
              <th scope="col">unit</th>
              <th scope="col">source</th>
              <th scope="col">status</th>
            </tr>
          </thead>
          <tbody>
            <QuantityRow label="Ra（Hansen 距離）" q={r.ra} reason={r.reasons.ra} />
            <QuantityRow label="R0（書 Table 7.8）" q={r.r0} reason={r.reasons.r0} />
            <QuantityRow label="RED = Ra / R0" q={r.red} reason={r.reasons.red} />
            <QuantityRow label={`Flory–Huggins χ（${fmt(r.temperatureK, 5)} K）`} q={r.chi} reason={r.reasons.chi} />
            {r.tableMatch && <QuantityRow label="對照：Ra（聚合物取書 Table 7.8 的 δ）" q={r.bookCenter.ra} />}
            {r.tableMatch && <QuantityRow label="對照：RED（同上）" q={r.bookCenter.red} />}
          </tbody>
        </table>
      </div>
      <div className="structure-notice" role="status">
        <p>
          <strong>判斷：{r.judgement.overall}</strong>
        </p>
        <ul>
          {r.judgement.parts.map((p) => (
            <li key={p.basis}>{p.text}</li>
          ))}
        </ul>
        <p>{r.judgement.note}</p>
      </div>
      {(r.polymer.warnings ?? []).map((w) => (
        <small key={w} className="form-warning"> {w}</small>
      ))}
    </>
  );
}
