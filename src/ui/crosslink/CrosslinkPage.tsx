// 配方工作台右欄的交聯第 0 層（任務 016，D11；任務 018 改為右欄區塊）：讀取左欄目前的配方，顯示反應配對與判定。
// 依 D09，畫面不顯示各成分的官能基數量、當量與分子量；判定只依結構與反應規則表的計數（D17）。
import { useEffect, useMemo, useState } from 'react';
import {
  MESSAGE_PENDING_REVIEW,
  PAIR_KIND_LABEL,
  VERDICT_LABEL,
  type CrosslinkComponent,
  type CrosslinkResult,
} from '../../core/crosslink/types';
import { DEFAULT_MARK_COLOR } from '../../core/crosslink/draw';
import type { Formulation } from '../../core/formulation/types';
import { confidenceLabel } from '../../core/result';
import { analyzeCrosslinkInWorker } from '../../worker/client';
import { UnifiedNote } from '../components/UnifiedNote';
import { ResultBlock } from '../workbench/ResultBlock';
import { Layer1Section } from './Layer1Cards';
import './crosslink.css';

const RECALC_DELAY_MS = 300;

/** 配方的成分（Solid 與 Liquid），只取交聯分析需要的欄位 */
function componentsOf(f: Formulation | null): CrosslinkComponent[] {
  if (!f) return [];
  return [...f.solid.components, ...f.liquid.components]
    .filter((c) => c.canonicalSmiles.trim() !== '')
    .map((c) => ({
      id: c.id,
      name: c.name.trim() || c.canonicalSmiles,
      canonicalSmiles: c.canonicalSmiles,
      ...(c.molfile ? { molfile: c.molfile } : {}),
      category: c.category,
      ...(c.polymer ? { polymer: c.polymer } : {}),
    }));
}

/** theme.css 的強調色（反應原子標記用） */
function accentColor(): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || DEFAULT_MARK_COLOR;
  } catch {
    return DEFAULT_MARK_COLOR;
  }
}

type State =
  | { kind: 'empty' }
  | { kind: 'working' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; result: CrosslinkResult; svgs: Record<string, string> };

export function CrosslinkPage({ formulation }: { formulation: Formulation | null }) {
  // 只在結構、分類或聚合物設定改變時重算（用量改變不影響第 0 層）
  const components = useMemo(() => componentsOf(formulation), [formulation]);
  const key = useMemo(() => JSON.stringify(components), [components]);
  const [state, setState] = useState<State>({ kind: 'empty' });

  useEffect(() => {
    if (components.length === 0) {
      setState({ kind: 'empty' });
      return;
    }
    let cancelled = false;
    setState((s) => (s.kind === 'done' ? s : { kind: 'working' }));
    const timer = setTimeout(() => {
      void analyzeCrosslinkInWorker(components, accentColor()).then((outcome) => {
        if (cancelled) return;
        setState(outcome.ok ? { kind: 'done', result: outcome.result, svgs: outcome.svgs } : { kind: 'error', message: outcome.error });
      });
    }, RECALC_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // components 由 key 決定內容；key 不變時不重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="crosslink-page">
      <ResultBlock id="layer0" title="交聯第 0 層">
        <p>
          依左欄目前的成分，找出會反應的配對，並依每分子的平均官能度判定結構條件：具形成網路、鏈延長，或封端／接枝的結構條件。
          這是依結構與反應規則表的計數判定，不判斷反應會不會實際發生。
        </p>
        {state.kind === 'empty' && <p className="structure-placeholder">配方裡還沒有成分。請先在左欄加入成分。</p>}
        {state.kind === 'working' && <p role="status">分析中…</p>}
        {state.kind === 'error' && (
          <div className="error" role="alert">
            <p>無法完成交聯分析：{state.message}</p>
          </div>
        )}
        {state.kind === 'done' && <Result result={state.result} svgs={state.svgs} />}
      </ResultBlock>
      {state.kind === 'done' && <Layer1Section result={state.result} formulation={formulation} />}
    </div>
  );
}

function Result({ result, svgs }: { result: CrosslinkResult; svgs: Record<string, string> }) {
  const pending = result.pendingReview.rules.length > 0 || result.pendingReview.groups.length > 0;
  const shown = result.components.filter((c) => svgs[c.id]);
  return (
    <>
      {pending && (
        <p className="structure-notice crosslink-pending" role="status">
          {MESSAGE_PENDING_REVIEW}
        </p>
      )}
      {result.warnings.length > 0 && (
        <ul className="form-issues" aria-label="警告">
          {result.warnings.map((w) => (
            <li key={w} className="form-warning" role="status">
              {w}
            </li>
          ))}
        </ul>
      )}

      <div className="crosslink-verdict">
        <h3>配方判定</h3>
        <p className="crosslink-verdict-text">{VERDICT_LABEL[result.verdict]}</p>
        <p>
          <span className={`confidence-tag confidence-${result.confidence}`}>{confidenceLabel(result.confidence)}</span>
        </p>
        <p className="result-model">模型：{result.modelName}</p>
      </div>

      <h3>反應配對</h3>
      {result.pairs.length === 0 ? (
        <p className="structure-placeholder">配方中沒有可配對的反應官能基。</p>
      ) : (
        <div className="table-wrap">
          <table className="result-table crosslink-table">
            <thead>
              <tr>
                <th scope="col">參與成分</th>
                <th scope="col">反應類型</th>
                <th scope="col">判定</th>
                <th scope="col">催化劑</th>
                <th scope="col">溫度</th>
              </tr>
            </thead>
            <tbody>
              {result.pairs.map((p) => (
                <tr key={`${p.ruleId}-${p.a.componentId}-${p.b?.componentId ?? ''}`}>
                  <th scope="row">
                    {p.b && !p.self ? `${p.a.name} × ${p.b.name}` : `${p.a.name}（自反應）`}
                  </th>
                  <td>{p.reactionLabel}</td>
                  <td>{PAIR_KIND_LABEL[p.kind]}</td>
                  <td className={p.catalyst.status === 'missing' ? 'crosslink-warn' : undefined}>{p.catalyst.message}</td>
                  <td>{p.temperature}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>不參與反應的成分</h3>
      {result.nonParticipants.length === 0 ? (
        <p>（無）</p>
      ) : (
        <ul>
          {result.nonParticipants.map((n) => (
            <li key={n.id}>{n.name}</li>
          ))}
        </ul>
      )}

      {shown.length > 0 && (
        <>
          <h3>反應原子標記</h3>
          <p>
            以強調色標出參與反應的原子；編號從 1 起算，與「分子工具」分頁 3D 畫面的原子編號一致。聚合物顯示重複單元。
          </p>
          <div className="crosslink-structures">
            {shown.flatMap((c) => {
              const count = c.units && c.units.length > 1 ? c.units.length : 1;
              return Array.from({ length: count }, (_, k) => {
                const svg = svgs[k === 0 ? c.id : `${c.id}#${k}`];
                if (!svg) return null;
                // 共聚物：每種單元各一張，標出單元序號與比例（使用者輸入的組成）
                const unitNote = count > 1 ? `單元 ${k + 1}／${count}（${Number((c.units![k].molFraction * 100).toFixed(2))} mol%）` : '（重複單元）';
                return (
                  <figure key={`${c.id}-${k}`} className="crosslink-figure">
                    <div className="crosslink-svg" role="img" aria-label={`${c.name} 的反應原子標記圖${count > 1 ? `（單元 ${k + 1}）` : ''}`} dangerouslySetInnerHTML={{ __html: svg }} />
                    <figcaption>
                      {c.name}
                      {c.isPolymer ? unitNote : ''}
                    </figcaption>
                  </figure>
                );
              });
            })}
          </div>
        </>
      )}

      <UnifiedNote />
    </>
  );
}
