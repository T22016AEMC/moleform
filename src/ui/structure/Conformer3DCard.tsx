// 「3D 結構」卡片（Phase 2.5–2.7）：按「產生 3D」後才啟動 Worker 與 3D 顯示函式庫。
// 3D 只用於單體與小分子（D05）；結構只在使用者自己的瀏覽器內處理（D23）。
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { CalcResult } from '../../core/result';
import {
  checkConformerSupport,
  MESSAGE_LARGE_MOLECULE,
} from '../../core/conformer/support';
import { conformersToSdf } from '../../core/conformer/export';
import type { ConformerBatch } from '../../core/conformer/types';
import { generateConformers, type GenerateHandle } from '../../worker/conformerClient';
import { downloadText } from '../download';
import { ResultValue } from '../components/ResultValue';
import { UnifiedNote } from '../components/UnifiedNote';
import './structure.css';

// 3Dmol 只在這裡被動態 import（Viewer3D 內的靜態 import 會跟著這個 chunk 載入）
const Viewer3D = lazy(() => import('./Viewer3D'));

const CONFORMER_HINT =
  '相對能量相差約 1–2 kcal/mol 以內的構象，在室溫下會同時存在；本結果為 MMFF94 力場對單一分子在真空中的估算，未考慮溶劑與周圍分子。';
const SEED = 42;
const FIRST_COUNT = 5;
const STEP = 5;
const MAX_CONFORMERS = 30;

export interface StructureForCard {
  valid: boolean;
  molblock: string;
  canonicalSmiles: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'confirm' }
  | { kind: 'running'; stage: 'loading' | 'generating'; done: number; total: number; more: boolean }
  | { kind: 'done' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

interface Run {
  batch: ConformerBatch;
  /** 累計時間（毫秒） */
  generationMs: number;
  optimizationMs: number;
  resourcesMs: number;
  /** 最近一次呼叫的時間，供「這次」顯示 */
  last: { generationMs: number; optimizationMs: number; wallMs: number; resourcesMs: number };
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(ms < 100 ? 3 : 2)} 秒`;

export function Conformer3DCard({ structure }: { structure: StructureForCard | null }) {
  const molblock = structure?.valid ? structure.molblock : '';
  const support = useMemo(() => checkConformerSupport(molblock), [molblock]);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [run, setRun] = useState<Run | null>(null);
  const [selected, setSelected] = useState(0);
  const handle = useRef<GenerateHandle | null>(null);
  // 結構身分用 canonical SMILES 判斷：Ketcher 重新排版 2D 座標時 Molfile 會變，但不是不同的分子
  const identity = structure?.valid ? structure.canonicalSmiles : '';
  const identityRef = useRef(identity);
  identityRef.current = identity;
  // 實際送去計算的 Molfile（「產生更多構象」沿用第一次的，結果才接得上）
  const usedMolblock = useRef('');

  // 結構改變：捨棄舊結果（正在計算的也取消）
  useEffect(() => {
    handle.current?.cancel();
    handle.current = null;
    setPhase({ kind: 'idle' });
    setRun(null);
    setSelected(0);
  }, [identity]);

  useEffect(() => () => handle.current?.cancel(), []);

  function start(target: number, more: boolean) {
    const startedFor = identity;
    if (!more) usedMolblock.current = molblock;
    setPhase({ kind: 'running', stage: 'generating', done: 0, total: target, more });
    const h = generateConformers(usedMolblock.current, SEED, target, (p) => {
      if (identityRef.current !== startedFor) return;
      setPhase({ kind: 'running', stage: p.stage, done: p.done, total: p.total, more });
    });
    handle.current = h;
    void h.promise.then((outcome) => {
      if (handle.current !== h) return;
      handle.current = null;
      if (!outcome.ok) {
        setPhase(outcome.cancelled ? { kind: 'cancelled' } : { kind: 'error', message: outcome.error });
        return;
      }
      const { batch } = outcome;
      setRun((prev) => ({
        batch,
        generationMs: (more && prev ? prev.generationMs : 0) + batch.timing.generationMs,
        optimizationMs: (more && prev ? prev.optimizationMs : 0) + batch.timing.optimizationMs,
        resourcesMs: (prev?.resourcesMs ?? 0) + outcome.resourcesMs,
        last: { ...batch.timing, wallMs: outcome.wallMs, resourcesMs: outcome.resourcesMs },
      }));
      setSelected(0);
      setPhase({ kind: 'done' });
    });
  }

  function onGenerate() {
    if (!support.supported) return;
    if (support.needsConfirm && phase.kind !== 'confirm') {
      setPhase({ kind: 'confirm' });
      return;
    }
    start(FIRST_COUNT, false);
  }

  function onCancel() {
    handle.current?.cancel();
  }

  const batch = run?.batch;
  const current = batch?.conformers[selected] ?? batch?.conformers[0];
  const running = phase.kind === 'running';
  const canMore = !!batch && batch.conformers.length < MAX_CONFORMERS && !batch.exhausted && !running;

  const energyResult: CalcResult | null =
    current && current.relativeEnergy !== null
      ? {
          value: Number(current.relativeEnergy.toFixed(2)),
          unit: 'kcal/mol',
          modelName: 'MMFF94（OpenChemLib JS）',
          confidence: 'direct',
          sources: [
            'Halgren, T. A. J. Comput. Chem. 1996, 17, 490（MMFF94）',
            'OpenChemLib JS 9.25.2（BSD-3-Clause）',
            '能量單位以 MMFF94 Validation Suite（ccl.net）比對確認為 kcal/mol，見 docs/reports/011-結果.md',
          ],
        }
      : null;

  return (
    <section className="card conformer-card" aria-labelledby="conformer-title">
      <h2 id="conformer-title">3D 結構</h2>
      <p>
        由上方的結構產生 3D 構象並以 MMFF94 力場最佳化（OpenChemLib JS，在背景執行）。3D 只用於單體與小分子。
        計算只在您的瀏覽器內進行，不會上傳。
      </p>

      {!support.supported ? (
        <p className="structure-notice" role="status">{support.reason}</p>
      ) : (
        <>
          {phase.kind === 'confirm' ? (
            <div className="structure-notice" role="alertdialog" aria-label="大分子確認">
              <p>
                {MESSAGE_LARGE_MOLECULE}（重原子 {support.heavyAtoms} 個，超過 100 個）是否仍要計算？
              </p>
              <div className="structure-actions">
                <button type="button" onClick={() => start(FIRST_COUNT, false)}>仍要計算</button>
                <button type="button" onClick={() => setPhase({ kind: 'idle' })}>不要計算</button>
              </div>
            </div>
          ) : (
            <div className="structure-actions">
              <button type="button" disabled={running} onClick={onGenerate}>
                {run ? '重新產生 3D' : '產生 3D'}
              </button>
              {running && <button type="button" onClick={onCancel}>取消</button>}
            </div>
          )}
        </>
      )}

      {running && (
        <p role="status" className="conformer-progress">
          {phase.stage === 'loading'
            ? '正在載入 3D 計算資料…'
            : `正在產生構象 ${Math.min(phase.done + 1, phase.total)}／${phase.total}`}
        </p>
      )}
      {phase.kind === 'cancelled' && <p role="status">已取消。再按「產生 3D」會重新開始計算。</p>}
      {phase.kind === 'error' && (
        <div className="error" role="alert">
          <p>無法產生 3D：{phase.message}</p>
        </div>
      )}

      {batch && current && (
        <div className="conformer-result">
          {batch.optimizationNote && (
            <p className="structure-notice" role="status">{batch.optimizationNote}</p>
          )}
          <p className="conformer-theory">理論構型：依 MMFF94 力場估算，非實測結構。</p>

          <div className="conformer-select">
            <label htmlFor="conformer-pick">構象</label>
            <select id="conformer-pick" value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
              {batch.conformers.map((c, i) => (
                <option key={c.rank} value={i}>
                  構象 {c.rank}
                  {c.relativeEnergy !== null && c.rank === 1 ? '　最低能量（建議使用）' : ''}
                  {c.relativeEnergy !== null ? `（相對能量 ${c.relativeEnergy.toFixed(2)} kcal/mol）` : ''}
                </option>
              ))}
            </select>
            <button type="button" disabled={!canMore} onClick={() => start(batch.conformers.length + STEP, true)}>
              產生更多構象（+{STEP}）
            </button>
          </div>
          {batch.optimized && <small className="conformer-hint">{CONFORMER_HINT}</small>}
          {batch.exhausted && <small>已無法產生更多不同的構象。</small>}
          {!batch.exhausted && batch.conformers.length >= MAX_CONFORMERS && <small>已達上限 {MAX_CONFORMERS} 個構象。</small>}

          <Suspense fallback={<p role="status">正在載入 3D 顯示…</p>}>
            <Viewer3D molfile={current.molfile} optimized={batch.optimized} />
          </Suspense>

          {energyResult && (
            <div className="conformer-energy">
              <h3>相對能量（構象 {current.rank}）</h3>
              <ResultValue result={energyResult} />
              <UnifiedNote />
              <small>能量只用來比較同一分子的構象，最低者為 0。{!current.converged && '此構象的最佳化未完全收斂。'}</small>
            </div>
          )}

          <div className="conformer-timing">
            <h3>本次計算</h3>
            <ul>
              <li>種子：{batch.seed}（固定，結果可重現）</li>
              <li>
                構象：{batch.conformers.length} 個（本次新增 {batch.added}，合併重複 {batch.merged}）；重原子 {batch.heavyAtoms} 個
              </li>
              <li>產生構象：{seconds(run.last.generationMs)}</li>
              <li>{batch.optimized ? `力場最佳化：${seconds(run.last.optimizationMs)}` : '力場最佳化：未執行（MMFF94 缺參數）'}</li>
              {run.last.resourcesMs > 0 && <li>載入 3D 計算資料（resources.json，只有第一次）：{seconds(run.last.resourcesMs)}</li>}
              <li>整體等待（含傳輸）：{seconds(run.last.wallMs)}</li>
            </ul>
          </div>

          <div className="structure-actions">
            <button
              type="button"
              onClick={() => downloadText(current.molfile, `moleform-3d-conformer${current.rank}.mol`, 'chemical/x-mdl-molfile')}
            >
              下載 3D MOL
            </button>
            <button
              type="button"
              onClick={() => downloadText(conformersToSdf(batch.conformers, batch.seed), 'moleform-3d.sdf', 'chemical/x-mdl-sdfile')}
            >
              下載 3D SDF（全部構象）
            </button>
          </div>
          <small>3D MOL 為目前顯示的構象（含氫）；3D SDF 含全部構象{batch.optimized ? '，每筆附構象序號、種子與能量（kcal/mol）' : '，每筆附構象序號與種子'}。</small>
        </div>
      )}
    </section>
  );
}
