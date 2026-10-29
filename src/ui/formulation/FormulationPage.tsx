// 「配方」分頁（任務 014，Phase 3.1–3.5）：Solid／Liquid 兩區輸入、即時換算結果、錯誤與警告。
// 分子量由 RDKit Worker 計算後交給 computeFormulation，只用於計算，不顯示在畫面上（D09）。
// 資料只在使用者的瀏覽器內處理（D23）。刪除用畫面內確認，不使用瀏覽器對話框。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeFormulation } from '../../core/formulation/compute';
import type { AreaName, AreaResult, Formulation, FormulationIssue, FormulationOutcome } from '../../core/formulation/types';
import { LIQUID_CATEGORIES, SOLID_CATEGORIES } from '../../core/formulation/types';
import { confidenceLabel, type CalcResult } from '../../core/result';
import type { Compound } from '../../core/library/types';
import type { StructureValidation } from '../../core/structure/validate';
import { averageWeightOf, validateInput } from '../../worker/client';
import { UnifiedNote } from '../components/UnifiedNote';
import { createIndexedDbStorage } from '../library/storage';
import { FormulationLibrary } from './FormulationLibrary';
import {
  emptyState,
  fromFormulation,
  LIQUID_UNIT_OPTIONS,
  newRow,
  SOLID_UNIT_OPTIONS,
  toFormulation,
  UNIT_SUFFIX,
  type EditorState,
  type Row,
} from './model';
import type { FormulationStorage } from './storage';
import './formulation.css';

const RECALC_DELAY_MS = 300;
const SMILES_PREVIEW_CHARS = 36;

const truncate = (text: string) => ([...text].length > SMILES_PREVIEW_CHARS ? `${[...text].slice(0, SMILES_PREVIEW_CHARS).join('')}…` : text);

/** 數字顯示：一般取 2 位小數，很小的非零值取 3 位有效數字 */
function fmt(value: number): string {
  if (value !== 0 && Math.abs(value) < 0.01) return value.toPrecision(3);
  return value.toFixed(2);
}

function Cell({ result, digits }: { result: CalcResult | null | undefined; digits?: (v: number) => string }) {
  if (!result || result.value === null) {
    return <td className="number cell-na" title={result?.notApplicable ?? ''}>—</td>;
  }
  return <td className="number">{(digits ?? fmt)(result.value)}</td>;
}

function scrollToIssue(issue: FormulationIssue) {
  let id = `field-area-${issue.area}`;
  if (issue.componentId) id = `field-comp-${issue.componentId}`;
  else if (issue.area === 'formulation') id = issue.code.startsWith('TARGET') ? 'field-target' : 'field-results';
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const focusable = element.matches('input,select,button') ? element : element.querySelector<HTMLElement>('input,select,button');
  focusable?.focus({ preventScroll: true });
}

type SeverityIssue = FormulationIssue & { severity: 'error' | 'warning' };

function IssueList({ issues }: { issues: SeverityIssue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="form-issues">
      {issues.map((issue, i) => (
        <li key={`${issue.code}-${issue.componentId ?? ''}-${i}`} className={issue.severity === 'error' ? 'form-error' : 'form-warning'} role={issue.severity === 'error' ? 'alert' : 'status'}>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

// ---------- 區域卡片 ----------

interface AreaCardProps {
  area: 'solid' | 'liquid';
  state: EditorState;
  setState: (update: (s: EditorState) => EditorState) => void;
  issues: SeverityIssue[];
  structure: StructureValidation | null;
}

function AreaCard({ area, state, setState, issues, structure }: AreaCardProps) {
  const isSolid = area === 'solid';
  const rows = isSolid ? state.solidRows : state.liquidRows;
  const unit = isSolid ? state.solidUnit : state.liquidUnit;
  const totalText = isSolid ? state.solidTotalText : state.liquidTotalText;
  const categories: readonly string[] = isSolid ? SOLID_CATEGORIES : LIQUID_CATEGORIES;
  const title = isSolid ? 'Solid（非揮發性）' : 'Liquid';

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [smiles, setSmiles] = useState('');
  const [addMessage, setAddMessage] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [compounds, setCompounds] = useState<Compound[] | null>(null);
  const [pickedId, setPickedId] = useState('');
  const [busy, setBusy] = useState(false);

  const setRows = (update: (rows: Row[]) => Row[]) =>
    setState((s) => (isSolid ? { ...s, solidRows: update(s.solidRows) } : { ...s, liquidRows: update(s.liquidRows) }));
  const patchRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const move = (index: number, delta: number) =>
    setRows((rs) => {
      const target = index + delta;
      if (target < 0 || target >= rs.length) return rs;
      const next = [...rs];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  async function openPicker() {
    setPickerOpen((open) => !open);
    if (compounds === null) {
      // 只讀取「我的化合物」的清單，不修改它
      const loaded = await createIndexedDbStorage().loadAll();
      setCompounds(loaded.ok ? loaded.value : []);
      if (!loaded.ok) setAddMessage('無法讀取「我的化合物」（瀏覽器儲存不可用）');
    }
  }

  function addFromCompound() {
    const compound = compounds?.find((c) => c.id === pickedId);
    if (!compound) return;
    setRows((rs) => [...rs, newRow(area, { name: compound.name, canonicalSmiles: compound.canonicalSmiles, molfile: compound.molfile, compoundId: compound.id })]);
    setAddMessage(`已加入「${compound.name}」`);
  }

  function addFromStructure() {
    if (!structure?.valid) return;
    setRows((rs) => [...rs, newRow(area, { name: '目前結構', canonicalSmiles: structure.canonicalSmiles, molfile: structure.molblock })]);
    setAddMessage('已加入「結構」分頁的目前結構');
  }

  async function addFromSmiles() {
    if (!smiles.trim()) return;
    setBusy(true);
    try {
      const outcome = await validateInput(smiles);
      if (outcome.ok && outcome.result.valid) {
        setRows((rs) => [...rs, newRow(area, { name: outcome.result.canonicalSmiles, canonicalSmiles: outcome.result.canonicalSmiles, molfile: outcome.result.molblock })]);
        setSmiles('');
        setAddMessage('已加入 SMILES 的結構');
      } else {
        setAddMessage(outcome.ok ? (outcome.result.problems.find((p) => p.level === 'error')?.message ?? '這不是可用的結構，無法加入') : '結構驗證未完成，請稍後再試');
      }
    } finally {
      setBusy(false);
    }
  }

  const areaIssues = issues.filter((i) => i.area === area && !i.componentId);
  const unitOptions = isSolid ? SOLID_UNIT_OPTIONS : LIQUID_UNIT_OPTIONS;

  return (
    <section className="card formulation-area" id={`field-area-${area}`} tabIndex={-1} aria-labelledby={`${area}-title`}>
      <h2 id={`${area}-title`}>{title}</h2>
      <div className="form-row-inline">
        <label htmlFor={`${area}-unit`}>區域單位</label>
        <select
          id={`${area}-unit`}
          value={unit}
          onChange={(e) => setState((s) => (isSolid ? { ...s, solidUnit: e.target.value as EditorState['solidUnit'] } : { ...s, liquidUnit: e.target.value as EditorState['liquidUnit'] }))}
        >
          {unitOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <small>整區使用同一種單位（D36）</small>
      </div>
      <IssueList issues={areaIssues} />

      {rows.length === 0 ? (
        <p className="structure-placeholder">還沒有成分。請用下方的方式加入。</p>
      ) : (
        <ul className="component-list" aria-label={`${title}成分`}>
          {rows.map((row, index) => {
            const rowIssues = issues.filter((i) => i.componentId === row.id);
            const invalid = rowIssues.some((i) => i.severity === 'error');
            return (
              <li key={row.id} id={`field-comp-${row.id}`} className={`component-item${invalid ? ' has-error' : ''}`}>
                <div className="component-fields">
                  <div className="field">
                    <label htmlFor={`name-${row.id}`}>名稱</label>
                    <input id={`name-${row.id}`} type="text" value={row.name} onChange={(e) => patchRow(row.id, { name: e.target.value })} />
                  </div>
                  <div className="field">
                    <span className="field-label">結構</span>
                    <code className="library-smiles" title={row.canonicalSmiles}>{truncate(row.canonicalSmiles)}</code>
                  </div>
                  <div className="field">
                    <label htmlFor={`cat-${row.id}`}>分類</label>
                    <select id={`cat-${row.id}`} value={row.category} onChange={(e) => patchRow(row.id, { category: e.target.value })}>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`amount-${row.id}`}>用量</label>
                    <div className="amount-input">
                      <input
                        id={`amount-${row.id}`}
                        type="text"
                        inputMode="decimal"
                        value={row.amountText}
                        aria-invalid={invalid}
                        onChange={(e) => patchRow(row.id, { amountText: e.target.value })}
                      />
                      <span className="amount-unit">{UNIT_SUFFIX[unit] ?? unit}</span>
                    </div>
                  </div>
                </div>
                {isSolid && (
                  <div className="component-checks">
                    <label className="check">
                      <input type="checkbox" checked={!!row.isResin} onChange={(e) => patchRow(row.id, { isResin: e.target.checked })} />
                      樹脂（phr 的基準）
                    </label>
                    <label className="check">
                      <input type="checkbox" checked={!!row.volatileFlag} onChange={(e) => patchRow(row.id, { volatileFlag: e.target.checked })} />
                      會揮發／分解
                    </label>
                  </div>
                )}
                <div className="library-row-actions">
                  <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`${row.name} 上移`}>上移</button>
                  <button type="button" disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label={`${row.name} 下移`}>下移</button>
                  {confirmId === row.id ? (
                    <>
                      <button type="button" className="library-danger" onClick={() => { setRows((rs) => rs.filter((r) => r.id !== row.id)); setConfirmId(null); }}>確定刪除？</button>
                      <button type="button" onClick={() => setConfirmId(null)}>取消</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmId(row.id)}>刪除</button>
                  )}
                </div>
                <IssueList issues={rowIssues} />
              </li>
            );
          })}
        </ul>
      )}

      <div className="component-add">
        <h3>加入成分</h3>
        <div className="library-row-actions">
          <button type="button" onClick={() => void openPicker()}>從「我的化合物」選</button>
          <button type="button" disabled={!structure?.valid} onClick={addFromStructure} title={structure?.valid ? '' : '「結構」分頁目前沒有有效的結構'}>
            使用「結構」分頁的目前結構
          </button>
        </div>
        {pickerOpen && (
          <div className="form-row-inline">
            {compounds === null ? (
              <small>讀取中…</small>
            ) : compounds.length === 0 ? (
              <small>「我的化合物」還沒有資料。</small>
            ) : (
              <>
                <label htmlFor={`${area}-picker`}>化合物</label>
                <select id={`${area}-picker`} value={pickedId} onChange={(e) => setPickedId(e.target.value)}>
                  <option value="">請選擇…</option>
                  {compounds.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button type="button" disabled={!pickedId} onClick={addFromCompound}>加入</button>
              </>
            )}
          </div>
        )}
        <div className="form-row-inline">
          <label htmlFor={`${area}-smiles`}>直接輸入 SMILES</label>
          <input id={`${area}-smiles`} type="text" value={smiles} spellCheck={false} autoComplete="off" placeholder="例如 CCO" onChange={(e) => setSmiles(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addFromSmiles(); }} />
          <button type="button" disabled={busy || !smiles.trim()} onClick={() => void addFromSmiles()}>加入</button>
        </div>
        {addMessage && <small role="status">{addMessage}</small>}
      </div>

      <div className="form-row-inline">
        <label htmlFor={`${area}-total`}>該區總重（選填）</label>
        <div className="amount-input">
          <input
            id={`${area}-total`}
            type="text"
            inputMode="decimal"
            value={totalText}
            onChange={(e) => setState((s) => (isSolid ? { ...s, solidTotalText: e.target.value } : { ...s, liquidTotalText: e.target.value }))}
          />
          <span className="amount-unit">g</span>
        </div>
      </div>
    </section>
  );
}

// ---------- 結果 ----------

function AreaTable({ title, result }: { title: string; result: AreaResult }) {
  const hasMass = result.components.some((c) => c.massG !== null);
  const hasPhr = result.components.some((c) => c.phr !== null);
  if (result.components.length === 0) return null;
  return (
    <div className="table-wrap">
      <h3>{title}</h3>
      <table className="result-table">
        <thead>
          <tr>
            <th scope="col">成分</th>
            {hasMass && <th scope="col">質量（g）</th>}
            <th scope="col">wt%</th>
            <th scope="col">mol%</th>
            {hasPhr && <th scope="col">phr</th>}
          </tr>
        </thead>
        <tbody>
          {result.components.map((c) => (
            <tr key={c.id}>
              <th scope="row">{c.name}</th>
              {hasMass && <Cell result={c.massG} digits={(v) => v.toFixed(3)} />}
              <Cell result={c.wtPct} />
              <Cell result={c.molPct} />
              {hasPhr && <Cell result={c.phr} />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Overall({ outcome }: { outcome: FormulationOutcome }) {
  const o = outcome.results.overall;
  const rows: [string, CalcResult][] = [
    ['Solid 質量', o.solidMass],
    ['Liquid 質量', o.liquidMass],
    ['總重', o.totalMass],
    ['Solid Content（全部）', o.solidContent],
    ['Solid Content（扣除標記成分）', o.solidContentExcludingVolatile],
  ];
  return (
    <div className="table-wrap">
      <h3>整體</h3>
      <table className="result-table">
        <tbody>
          {rows.map(([label, r]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <Cell result={r} digits={r.unit === '%' ? fmt : (v) => v.toFixed(3)} />
              <td>{r.value === null ? '' : r.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {o.target && (
        <>
          <h3>目標 Solid Content 反推</h3>
          <table className="result-table">
            <tbody>
              <tr>
                <th scope="row">所需 Liquid 總量</th>
                <Cell result={o.target.liquidTotal} digits={(v) => v.toFixed(3)} />
                <td>{o.target.liquidTotal.unit}</td>
              </tr>
              {o.target.liquidComponents.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.name}</th>
                  <Cell result={c.mass} digits={(v) => v.toFixed(3)} />
                  <td>{c.mass.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ---------- 頁面 ----------

interface Props {
  /** 「結構」分頁目前的結構 */
  structure: StructureValidation | null;
  /** 測試或預覽時可換成其他儲存實作 */
  storage?: FormulationStorage;
}

export function FormulationPage({ structure, storage }: Props) {
  const [state, setStateRaw] = useState<EditorState>(emptyState);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [debounced, setDebounced] = useState<Formulation>(() => toFormulation(emptyState()));
  const [weights, setWeights] = useState<Record<string, number | null>>({});

  const setState = useCallback((update: (s: EditorState) => EditorState) => setStateRaw(update), []);
  const formulation = useMemo(() => toFormulation(state), [state]);

  // 輸入改變後延遲約 0.3 秒再重算
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(formulation), RECALC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [formulation]);

  // 分子量：由 Worker 的 RDKit 計算並快取（以 SMILES 為鍵）；含 * 的結構換算核心不使用分子量
  const needed = useMemo(() => {
    const smiles = new Set<string>();
    for (const c of [...debounced.solid.components, ...debounced.liquid.components]) {
      if (!c.canonicalSmiles.includes('*')) smiles.add(c.canonicalSmiles);
    }
    return [...smiles];
  }, [debounced]);

  useEffect(() => {
    const missing = needed.filter((s) => !(s in weights));
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(missing.map(async (s) => [s, await averageWeightOf(s)] as const)).then((entries) => {
      if (!cancelled) setWeights((w) => ({ ...w, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
  }, [needed, weights]);

  const ready = needed.every((s) => s in weights);
  const outcome = useMemo<FormulationOutcome | null>(() => {
    if (!ready) return null;
    const byId: Record<string, number | undefined> = {};
    for (const c of [...debounced.solid.components, ...debounced.liquid.components]) {
      byId[c.id] = weights[c.canonicalSmiles] ?? undefined;
    }
    return computeFormulation(debounced, byId);
  }, [debounced, weights, ready]);

  const issues = useMemo<SeverityIssue[]>(
    () => [
      ...(outcome?.errors ?? []).map((i) => ({ ...i, severity: 'error' as const })),
      ...(outcome?.warnings ?? []).map((i) => ({ ...i, severity: 'warning' as const })),
    ],
    [outcome],
  );
  const targetIssues = issues.filter((i) => i.area === 'formulation' && i.code.startsWith('TARGET'));
  const otherFormulationIssues = issues.filter((i) => i.area === 'formulation' && !i.code.startsWith('TARGET'));

  const loadFormulation = useCallback((f: Formulation, id: string | null) => {
    setStateRaw(fromFormulation(f));
    setCurrentId(id);
  }, []);

  const solid = outcome?.results.solid;
  const liquid = outcome?.results.liquid;

  return (
    <div className="formulation-page">
      <section className="card" aria-labelledby="formulation-title">
        <h2 id="formulation-title">配方</h2>
        <p>建立 Solid／Liquid 兩區配方，選單位、填用量，即時換算 wt%、mol%、phr、總重與 Solid Content。</p>
        <div className="form-row-inline">
          <label htmlFor="formulation-name">配方名稱</label>
          <input id="formulation-name" type="text" maxLength={100} value={state.name} autoComplete="off" onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))} />
          <button type="button" onClick={() => loadFormulation(toFormulation(emptyState()), null)}>新配方</button>
        </div>
        {currentId && <small>目前編輯的是已儲存的配方（按「儲存」會覆蓋它，「另存」會新增一筆）。</small>}
      </section>

      <AreaCard area="solid" state={state} setState={setState} issues={issues} structure={structure} />
      <AreaCard area="liquid" state={state} setState={setState} issues={issues} structure={structure} />

      <section className="card" aria-labelledby="target-title">
        <h2 id="target-title">目標 Solid Content（選填）</h2>
        <div className="form-row-inline" id="field-target">
          <label htmlFor="target-input">目標值</label>
          <div className="amount-input">
            <input id="target-input" type="text" inputMode="decimal" value={state.targetText} onChange={(e) => setState((s) => ({ ...s, targetText: e.target.value }))} />
            <span className="amount-unit">%</span>
          </div>
          <small>填了之後，會由 Solid 質量反推所需的 Liquid 總量，並依 Liquid 區的組成分配。</small>
        </div>
        <IssueList issues={targetIssues} />
      </section>

      <section className="card" id="field-results" tabIndex={-1} aria-labelledby="results-title">
        <h2 id="results-title">換算結果</h2>
        <p className="result-meta">
          模型：配方換算　<span className="confidence-tag confidence-direct">{confidenceLabel('direct')}</span>
        </p>
        {outcome === null ? (
          <p role="status">計算中…</p>
        ) : (
          <>
            {issues.length > 0 && (
              <div className="issue-summary">
                <h3>錯誤與警告（{issues.length}）</h3>
                <ul>
                  {issues.map((issue, i) => (
                    <li key={`${issue.code}-${issue.componentId ?? ''}-${i}`}>
                      <button type="button" className={`issue-link ${issue.severity === 'error' ? 'form-error' : 'form-warning'}`} onClick={() => scrollToIssue(issue)}>
                        {issue.severity === 'error' ? '錯誤' : '警告'}：{issue.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {solid && <AreaTable title="Solid" result={solid} />}
            {liquid && <AreaTable title="Liquid" result={liquid} />}
            <Overall outcome={outcome} />
            <IssueList issues={otherFormulationIssues} />
          </>
        )}
        <UnifiedNote />
      </section>

      <FormulationLibrary formulation={formulation} currentId={currentId} onLoad={loadFormulation} onSaved={setCurrentId} storage={storage} />
    </div>
  );
}
