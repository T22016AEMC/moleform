// 成分詳細彈窗的「位點活性」表（任務 P7-5，PLAN 7.3、7.3a；D38、D66）。
// 計算由 Python 引擎完成（`/crosslink/site-activity`，經桌面橋接，沿用 I05 的做法）；這裡只送請求、顯示結果，不計算任何化學量。
// 兩個排序分開顯示、不合成單一分數：電子效應（pKa，附 σ 明細）與空間位阻（3D 相對可及表面積，幾何描述量、非文獻公式）。缺值顯示原因，不填數字。
import { useMemo } from 'react';
import { UnifiedNote } from '../components/UnifiedNote';
import { computeSiteActivityViaEngine, siteActivityBody, type SiteActivityData, type SiteRank, type SiteRow } from '../engine/crosslinkEngine';
import { useEngineCall } from './Layer1Cards';
import { useLatestCrosslinkResult } from './latestCrosslink';
import {
  SITE_DETAIL_SUMMARY,
  SITE_ELECTRONIC_NOTE,
  SITE_NEEDS_RESULT_TEXT,
  SITE_NO_PKA_TEXT,
  SITE_NO_SITES_TEXT,
  SITE_NOT_RANKED_TEXT,
  SITE_POLYMER_NOTE,
  SITE_SECTION_TITLE,
  SITE_STERIC_NOTE,
  SITE_TWO_RANKINGS_NOTE,
} from './siteActivityText';

const fixed = (v: number, digits: number) => v.toFixed(digits);

function RankCell({ r }: { r: SiteRank }) {
  if (r.rank === null) return <span title={r.reason ?? undefined}>{SITE_NOT_RANKED_TEXT}</span>;
  return <span title={r.direction}>{r.rank} / {r.of}</span>;
}

function PkaCell({ row }: { row: SiteRow }) {
  const p = row.pka;
  if (!p.applicable) return <span className="crosslink-notes">{SITE_NO_PKA_TEXT}</span>;
  if (p.quantity.status !== 'predicted' || p.quantity.value === null) {
    return <span className="crosslink-warn">缺值：{p.reason}</span>;
  }
  return (
    <details>
      <summary>
        {fixed(p.quantity.value, 2)}（{SITE_DETAIL_SUMMARY}）
      </summary>
      <p className="crosslink-notes">{p.equation?.text}</p>
      <p className="crosslink-notes">
        {p.equation?.reference}；{p.equation?.table}
      </p>
      <ul className="crosslink-notes">
        {p.sigmaDetails.map((d, i) => (
          <li key={i}>
            {d.name}
            {d.position ? `（${d.position}）` : ''}：{d.column.startsWith('sigma_star') ? 'σ*' : 'σ'} = {fixed(d.value, 2)}
            {d.approx ? '（書標為近似值）' : ''}；{d.source}
          </li>
        ))}
        {p.sigmaDetails.length === 0 && <li>沒有取代基（Σ = 0）</li>}
      </ul>
      <p className="crosslink-notes">Σ = {p.sigmaSum === null || p.sigmaSum === undefined ? '—' : fixed(p.sigmaSum, 2)}</p>
    </details>
  );
}

function SiteTable({ rows, multiUnit }: { rows: SiteRow[]; multiUnit: boolean }) {
  return (
    <table className="result-table crosslink-table site-activity-table">
      <thead>
        <tr>
          <th>位點</th>
          <th>基團類別</th>
          <th>pKa 估算</th>
          <th>電子效應排名</th>
          <th>相對可及表面積</th>
          <th>位阻排名</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>
              {r.groupName}
              <br />
              <small className="crosslink-notes">
                原子 {r.atoms.map((a) => a + 1).join('、')}
                {multiUnit && r.unitIndex !== null ? `（單元 ${r.unitIndex + 1}）` : ''}
              </small>
            </td>
            <td>{r.pka.className ?? '—'}</td>
            <td>
              <PkaCell row={r} />
            </td>
            <td>
              <RankCell r={r.electronic} />
            </td>
            <td>{r.sasa.status === 'predicted' && r.sasa.relative !== null ? fixed(r.sasa.relative, 2) : <span className="crosslink-warn">缺值：{r.sasa.reason}</span>}</td>
            <td>
              <RankCell r={r.steric} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SiteActivityCard({ componentId }: { componentId: string }) {
  const latest = useLatestCrosslinkResult();
  const body = useMemo(() => siteActivityBody(latest, componentId), [latest, componentId]);
  const key = useMemo(() => (body === null ? null : JSON.stringify(body)), [body]);
  const state = useEngineCall<SiteActivityData>(key, () => computeSiteActivityViaEngine(body as Record<string, unknown>));
  const component = state?.kind === 'done' ? state.value.components[0] : null;
  return (
    <div className="modal-section site-activity">
      <h3>{SITE_SECTION_TITLE}</h3>
      {body === null && <p role="status">{SITE_NEEDS_RESULT_TEXT}</p>}
      {body !== null && state === null && <p role="status">正在準備…</p>}
      {state?.kind === 'working' && <p role="status">計算中…</p>}
      {state?.kind === 'error' && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}
      {state?.kind === 'done' && component && (
        <>
          {component.status === 'missing' && <p className="crosslink-warn">缺值：{component.reason}</p>}
          {component.status === 'ok' && component.sites.length === 0 && <p role="status">{component.reason ?? SITE_NO_SITES_TEXT}</p>}
          {component.sites.length > 0 && <SiteTable rows={component.sites} multiUnit={new Set(component.sites.map((s) => s.unitIndex)).size > 1} />}
          <p className="crosslink-notes">{SITE_TWO_RANKINGS_NOTE}</p>
          <p className="crosslink-notes">{SITE_ELECTRONIC_NOTE}</p>
          <p className="crosslink-notes">{SITE_STERIC_NOTE}</p>
          {component.isPolymer && <p className="crosslink-notes">{SITE_POLYMER_NOTE}</p>}
          <p className="crosslink-notes">
            {state.value.model}：{state.value.electronicTrend}；{state.value.stericTrend}
          </p>
          <UnifiedNote />
        </>
      )}
    </div>
  );
}
