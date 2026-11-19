// 最小「物性」面板（任務 I01）：呼叫桌面版的 Python 引擎，顯示單一聚合物單元／小分子，或配方（混合）的物性。
// 沿用工作台右欄的 ResultBlock 與既有表格樣式；TypeScript 版物性計算不在此呼叫。純網頁沒有引擎：顯示「需要桌面版與引擎」。
import { useEffect, useMemo, useState } from 'react';
import type { Formulation, FormulationOutcome } from '../../core/formulation/types';
import { UnifiedNote } from '../components/UnifiedNote';
import { ResultBlock } from '../workbench/ResultBlock';
import { getBridge, type EngineReply, type EngineStatus } from './engineClient';
import { DEFAULT_RH, MOISTURE_RH, componentDensityRequest, formulationRequests, isCopolymer, isPolymerSmiles, thermalRequests, unitRequests, type EngineRequest } from './propertyRequests';
import { DENSITY_ORDER_NOTE, formulationRows, unitRows, type PropertyRow } from './propertyRows';

const FORMULATION = '__formulation__';

function fmtValue(v: number): string {
  return String(Number(v.toPrecision(6)));
}

async function run(requests: EngineRequest[]): Promise<Record<string, EngineReply>> {
  const bridge = getBridge();
  if (!bridge) return {};
  const entries = await Promise.all(requests.map(async (r) => [r.path, await bridge.call(r.path, r.body)] as const));
  return Object.fromEntries(entries);
}

function PropertyTable({ rows }: { rows: PropertyRow[] }) {
  return (
    <div className="table-wrap">
      <table className="result-table">
        <thead>
          <tr>
            <th scope="col">物性</th>
            <th scope="col">value</th>
            <th scope="col">unit</th>
            <th scope="col">source</th>
            <th scope="col">status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              <td className={`number${r.quantity.value === null ? ' cell-na' : ''}`}>{r.quantity.value === null ? '—' : fmtValue(r.quantity.value)}</td>
              <td>{r.quantity.unit}</td>
              <td><small>{r.quantity.source}</small></td>
              <td>
                {r.quantity.status}
                {r.reason && <small> — {r.reason}</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  /** 已延遲重算的配方（與換算結果同一份） */
  formulation: Formulation;
  outcome: FormulationOutcome | null;
  /** 成分 id → 每分子質量（小分子）或 Mn（聚合物）；由 formulation/compute 的呼叫端換算 */
  mnById: Readonly<Record<string, number | undefined>>;
}

export function EnginePropertiesBlock({ formulation, outcome, mnById }: Props) {
  const bridge = getBridge();
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [target, setTarget] = useState<string>(FORMULATION);
  const [rows, setRows] = useState<PropertyRow[] | null>(null);
  const [rh, setRh] = useState<number>(DEFAULT_RH);

  const components = useMemo(() => [...formulation.solid.components, ...formulation.liquid.components], [formulation]);
  const selected = components.find((c) => c.id === target) ?? null;

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    void bridge.status().then((s) => !cancelled && setStatus(s));
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  // 請求內容（含換算後的質量分率、Mn）改變才重算
  const plan = useMemo(() => {
    if (selected) {
      // 任務 P8-3：另送單一成分的 /mixture-density，顯示與配方混合密度同一順序的密度採用值
      const requests = [...unitRequests(selected), ...thermalRequests(selected, rh), componentDensityRequest(selected)];
      return { kind: 'unit' as const, requests, polymer: isPolymerSmiles(selected.canonicalSmiles) };
    }
    return { kind: 'formulation' as const, req: formulationRequests(formulation, outcome, mnById) };
  }, [selected, formulation, outcome, mnById, rh]);
  const planKey = JSON.stringify(plan);

  const ready = status?.state === 'ready';
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setRows(null);
    void (async () => {
      let result: PropertyRow[];
      if (plan.kind === 'unit') {
        result = unitRows(await run(plan.requests), plan.polymer);
      } else {
        const { tgMixing, density, dielectric, mixReason } = plan.req;
        const replies = await run([tgMixing, density, dielectric].filter((r): r is EngineRequest => r !== null));
        result = formulationRows({
          tgMixing: replies['/tg/mixing'] ?? { ok: false, error: mixReason ?? '沒有成分' },
          ...(replies['/mixture-density'] ? { density: replies['/mixture-density'] } : {}),
          ...(replies['/mixture-dielectric'] ? { dielectric: replies['/mixture-dielectric'] } : {}),
          mixReason,
        });
      }
      if (!cancelled) setRows(result);
    })();
    return () => {
      cancelled = true;
    };
    // planKey 代表 plan 的內容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, planKey]);

  let body;
  if (!bridge) body = <p role="status">需要桌面版與引擎</p>;
  else if (status === null || status.state === 'starting') body = <p role="status">引擎啟動中…</p>;
  else if (status.state !== 'ready') {
    body = <p className="form-error" role="alert">引擎無法使用：{status.error ?? '未啟動'}。其餘功能不受影響。</p>;
  } else {
    body = (
      <>
        <div className="form-row-inline">
          <label htmlFor="engine-target">對象</label>
          <select id="engine-target" value={selected ? selected.id : FORMULATION} onChange={(e) => setTarget(e.target.value)}>
            <option value={FORMULATION}>配方（混合）</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || '（未命名）'}
              </option>
            ))}
          </select>
        </div>
        {selected && isPolymerSmiles(selected.canonicalSmiles) && (
          <div className="form-row-inline">
            <label htmlFor="engine-rh">吸濕性的相對濕度</label>
            <select id="engine-rh" value={rh} onChange={(e) => setRh(Number(e.target.value))}>
              {MOISTURE_RH.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        )}
        {selected && isCopolymer(selected) && <small>共聚物：自由體積與「密度（採用值）」按莫耳分率加權各單元；其餘單一對象物性以第一種單元計算。</small>}
        {!selected && <small>配方混合只混 Solid 區成分（Catalyst/Initiator 與揮發／分解成分不混入）。{DENSITY_ORDER_NOTE}。</small>}
        {rows === null ? <p role="status">引擎計算中…</p> : <PropertyTable rows={rows} />}
      </>
    );
  }

  return (
    <ResultBlock id="engine-properties" title="物性（Python 引擎）">
      {body}
      <UnifiedNote />
    </ResultBlock>
  );
}
