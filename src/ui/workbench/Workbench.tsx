// 配方工作台（任務 018，D45；取代原本的配方、交聯兩個分頁）：左欄輸入配方，右欄即時顯示所有結果。
// 配方輸入與換算沿用任務 014：分子量由 RDKit Worker 計算後交給 computeFormulation，只用於計算，不顯示在畫面上（D09）。
// 資料只在使用者的瀏覽器內處理（D23）。刪除用畫面內確認，不使用瀏覽器對話框。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeFormulation } from '../../core/formulation/compute';
import type { AreaResult, Formulation, FormulationIssue, FormulationOutcome } from '../../core/formulation/types';
import { LIQUID_CATEGORIES, SOLID_CATEGORIES } from '../../core/formulation/types';
import { confidenceLabel, type CalcResult } from '../../core/result';
import { resolvePolymer } from '../../core/polymer/convert';
import type { RepeatUnitAnalysis } from '../../core/polymer/types';
import { analyzeRepeatUnitInWorker, averageWeightOf } from '../../worker/client';
import { CrosslinkPage } from '../crosslink/CrosslinkPage';
import { UnifiedNote } from '../components/UnifiedNote';
import { FormulationLibrary } from '../formulation/FormulationLibrary';
import {
  emptyState,
  fromFormulation,
  LIQUID_UNIT_OPTIONS,
  pendingAmountIds,
  visibleIssues,
  SOLID_UNIT_OPTIONS,
  toFormulation,
  UNIT_SUFFIX,
  type EditorState,
  type Row,
} from '../formulation/model';
import type { FormulationStorage } from '../formulation/storage';
import '../formulation/formulation.css';
import { polymerLabel, specFromEdit } from '../polymer/model';
import { AddComponentDialog } from './AddComponentDialog';
import { ComponentDetailDialog } from './ComponentDetailDialog';
import { drawSource, isPolymerSmiles } from './model';
import { BlockStateContext, ResultBlock, useBlockStateStore } from './ResultBlock';
import { StructureImage } from './StructureImage';
import './workbench.css';

const RECALC_DELAY_MS = 300;
const THUMB_WIDTH = 96;
const THUMB_HEIGHT = 48;

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

/** 聚合物成分在列上的簡短說明（Mn、DP 是使用者的輸入，可以顯示；細節在成分詳細彈窗） */
function polymerSummary(row: Row): string {
  const spec = row.polymerEdit ? specFromEdit(row.polymerEdit) : null;
  if (!spec) return '尚未設定 Mw／PDI';
  return polymerLabel(spec);
}

// ---------- 區域（Solid／Liquid） ----------

interface AreaCardProps {
  area: 'solid' | 'liquid';
  state: EditorState;
  setState: (update: (s: EditorState) => EditorState) => void;
  issues: SeverityIssue[];
  /** 重複單元分析結果（以 SMILES 為鍵）；有問題的聚合物在列上直接提示 */
  units: Record<string, RepeatUnitAnalysis | null>;
  onAdd: () => void;
  onOpenDetail: (rowId: string) => void;
}

function AreaCard({ area, state, setState, issues, units, onAdd, onOpenDetail }: AreaCardProps) {
  const isSolid = area === 'solid';
  const rows = isSolid ? state.solidRows : state.liquidRows;
  const unit = isSolid ? state.solidUnit : state.liquidUnit;
  const totalText = isSolid ? state.solidTotalText : state.liquidTotalText;
  const categories: readonly string[] = isSolid ? SOLID_CATEGORIES : LIQUID_CATEGORIES;
  const title = isSolid ? 'Solid（非揮發性）' : 'Liquid';

  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // 「⋯」選單：點選單外或按 Esc 收起
  useEffect(() => {
    if (menuId === null) return;
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || !listRef.current?.querySelector('.row-menu-wrap.is-open')?.contains(event.target)) {
        setMenuId(null);
        setConfirmId(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setMenuId(null);
        setConfirmId(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [menuId]);

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

  const areaIssues = issues.filter((i) => i.area === area && !i.componentId);
  const unitOptions = isSolid ? SOLID_UNIT_OPTIONS : LIQUID_UNIT_OPTIONS;

  return (
    <section className="card formulation-area" id={`field-area-${area}`} tabIndex={-1} aria-labelledby={`${area}-title`}>
      <div className="area-head">
        <h2 id={`${area}-title`}>{title}</h2>
        <div className="area-unit">
          <label htmlFor={`${area}-unit`}>單位</label>
          <select
            id={`${area}-unit`}
            value={unit}
            onChange={(e) => setState((s) => (isSolid ? { ...s, solidUnit: e.target.value as EditorState['solidUnit'] } : { ...s, liquidUnit: e.target.value as EditorState['liquidUnit'] }))}
          >
            {unitOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <small>整區使用同一種單位（D36）</small>
      <IssueList issues={areaIssues} />

      {rows.length === 0 ? (
        <p className="structure-placeholder">還沒有成分。請按下方的「＋加入成分」。</p>
      ) : (
        <ul className="component-list" aria-label={`${title}成分`} ref={listRef}>
          {rows.map((row, index) => {
            const rowIssues = issues.filter((i) => i.componentId === row.id);
            const invalid = rowIssues.some((i) => i.severity === 'error');
            const polymer = isPolymerSmiles(row.canonicalSmiles);
            const unitProblem = polymer && units[row.canonicalSmiles]?.ok === false ? (units[row.canonicalSmiles] as Extract<RepeatUnitAnalysis, { ok: false }>).problem.message : '';
            const menuOpen = menuId === row.id;
            return (
              <li key={row.id} id={`field-comp-${row.id}`} className={`component-item comp-row${invalid ? ' has-error' : ''}`}>
                <button type="button" className="thumb-button" aria-label={`${row.name || '成分'}：開啟成分詳細`} onClick={() => onOpenDetail(row.id)}>
                  <StructureImage label={`${row.name || '成分'} 的結構`} source={drawSource(row)} width={THUMB_WIDTH} height={THUMB_HEIGHT} polymer={polymer} />
                </button>
                <div className="comp-main">
                  <div className="comp-title">
                    <button type="button" className="name-link" onClick={() => onOpenDetail(row.id)} title="開啟成分詳細">
                      {row.name.trim() === '' ? '（未命名）' : row.name}
                    </button>
                    {polymer && <span className="polymer-tag">聚合物</span>}
                    {polymer && <small className="comp-polymer-summary">{polymerSummary(row)}</small>}
                  </div>
                  <div className="comp-fields">
                    <select aria-label={`${row.name} 分類`} value={row.category} onChange={(e) => patchRow(row.id, { category: e.target.value })}>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <div className="amount-input">
                      <input
                        id={`amount-${row.id}`}
                        type="text"
                        inputMode="decimal"
                        aria-label={`${row.name} 用量`}
                        value={row.amountText}
                        placeholder="請輸入用量"
                        aria-invalid={invalid}
                        onChange={(e) => patchRow(row.id, { amountText: e.target.value, amountTouched: true })}
                        onBlur={() => !row.amountTouched && patchRow(row.id, { amountTouched: true })}
                      />
                      <span className="amount-unit">{UNIT_SUFFIX[unit] ?? unit}</span>
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
                  {unitProblem && <p className="form-error" role="alert">{unitProblem}</p>}
                </div>
                <div className={`row-menu-wrap${menuOpen ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="row-menu-button"
                    aria-label={`${row.name || '成分'} 更多操作`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => {
                      setMenuId(menuOpen ? null : row.id);
                      setConfirmId(null);
                    }}
                  >
                    ⋯
                  </button>
                  {menuOpen && (
                    <div className="row-menu" role="menu">
                      <button type="button" role="menuitem" disabled={index === 0} onClick={() => { move(index, -1); setMenuId(null); }}>上移</button>
                      <button type="button" role="menuitem" disabled={index === rows.length - 1} onClick={() => { move(index, 1); setMenuId(null); }}>下移</button>
                      {confirmId === row.id ? (
                        <>
                          <button type="button" role="menuitem" className="library-danger" onClick={() => { setRows((rs) => rs.filter((r) => r.id !== row.id)); setMenuId(null); setConfirmId(null); }}>確定刪除？</button>
                          <button type="button" role="menuitem" onClick={() => setConfirmId(null)}>取消</button>
                        </>
                      ) : (
                        <button type="button" role="menuitem" onClick={() => setConfirmId(row.id)}>刪除</button>
                      )}
                    </div>
                  )}
                </div>
                <div className="comp-issues">
                  <IssueList issues={rowIssues} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="area-foot">
        <button type="button" className="add-component" onClick={onAdd}>＋加入成分</button>
        <div className="area-total">
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
      {result.polymerMolNote && <small>{result.polymerMolNote}</small>}
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

// ---------- 工作台 ----------

type Dialog = { kind: 'add'; area: 'solid' | 'liquid' } | { kind: 'detail'; rowId: string };

interface Props {
  /** 測試或預覽時可換成其他儲存實作 */
  storage?: FormulationStorage;
}

export function Workbench({ storage }: Props) {
  const [state, setStateRaw] = useState<EditorState>(emptyState);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [debounced, setDebounced] = useState<Formulation>(() => toFormulation(emptyState()));
  const [weights, setWeights] = useState<Record<string, number | null>>({});
  const [units, setUnits] = useState<Record<string, RepeatUnitAnalysis | null>>({});
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const blocks = useBlockStateStore();

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

  // 聚合物（含 *）：由 Worker 分析重複單元，取得 M_unit 以換算 Mn／DP；不顯示 M_unit（D09）
  const polymerSmiles = useMemo(() => {
    const smiles = new Set<string>();
    for (const row of [...state.solidRows, ...state.liquidRows]) {
      if (row.canonicalSmiles.includes('*')) smiles.add(row.canonicalSmiles);
    }
    return [...smiles];
  }, [state.solidRows, state.liquidRows]);

  useEffect(() => {
    const missing = polymerSmiles.filter((s) => !(s in units));
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(missing.map(async (s) => [s, await analyzeRepeatUnitInWorker(s)] as const)).then((entries) => {
      if (!cancelled) setUnits((u) => ({ ...u, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
  }, [polymerSmiles, units]);

  const ready = needed.every((s) => s in weights);
  const outcome = useMemo<FormulationOutcome | null>(() => {
    if (!ready) return null;
    const byId: Record<string, number | undefined> = {};
    const unitWeights: Record<string, number | undefined> = {};
    for (const c of [...debounced.solid.components, ...debounced.liquid.components]) {
      if (c.canonicalSmiles.includes('*')) {
        // 聚合物：整條鏈基準用 Mn、重複單元基準用 M_unit（D46）；只用於計算，不顯示（D09）
        const unit = units[c.canonicalSmiles];
        const resolved = c.polymer && unit?.ok ? resolvePolymer(c.polymer, unit.mUnit) : null;
        byId[c.id] = resolved?.ok ? resolved.mn : undefined;
        unitWeights[c.id] = resolved?.ok && unit?.ok ? unit.mUnit : undefined;
      } else {
        byId[c.id] = weights[c.canonicalSmiles] ?? undefined;
      }
    }
    return computeFormulation(debounced, byId, { unitWeights });
  }, [debounced, weights, ready, units]);

  // 新加入、尚未填用量的成分先不顯示數值錯誤（輸入過或離開欄位後才顯示）
  const pending = useMemo(() => pendingAmountIds([...state.solidRows, ...state.liquidRows]), [state.solidRows, state.liquidRows]);
  const issues = useMemo<SeverityIssue[]>(
    () =>
      visibleIssues(
        [
          ...(outcome?.errors ?? []).map((i) => ({ ...i, severity: 'error' as const })),
          ...(outcome?.warnings ?? []).map((i) => ({ ...i, severity: 'warning' as const })),
        ],
        pending,
      ),
    [outcome, pending],
  );
  const targetIssues = issues.filter((i) => i.area === 'formulation' && i.code.startsWith('TARGET'));
  const otherFormulationIssues = issues.filter((i) => i.area === 'formulation' && !i.code.startsWith('TARGET'));

  const loadFormulation = useCallback((f: Formulation, id: string | null) => {
    setStateRaw(fromFormulation(f));
    setCurrentId(id);
    setDialog(null);
  }, []);

  /** 成分詳細彈窗用：以函式更新指定的成分（Solid 或 Liquid） */
  const updateRow = useCallback(
    (rowId: string, update: (row: Row) => Row) =>
      setStateRaw((s) => ({
        ...s,
        solidRows: s.solidRows.map((r) => (r.id === rowId ? update(r) : r)),
        liquidRows: s.liquidRows.map((r) => (r.id === rowId ? update(r) : r)),
      })),
    [],
  );

  const solid = outcome?.results.solid;
  const liquid = outcome?.results.liquid;
  const hasPolymerRow = [...state.solidRows, ...state.liquidRows].some((r) => isPolymerSmiles(r.canonicalSmiles));

  const detailRow = dialog?.kind === 'detail' ? [...state.solidRows, ...state.liquidRows].find((r) => r.id === dialog.rowId) : undefined;
  const detailArea = detailRow && state.solidRows.some((r) => r.id === detailRow.id) ? 'solid' : 'liquid';
  const componentCount = state.solidRows.length + state.liquidRows.length;

  return (
    <BlockStateContext.Provider value={blocks}>
      <div className="workbench">
        <div className="workbench-left">
          <section className="card" aria-labelledby="formulation-title">
            <h2 id="formulation-title">配方</h2>
            <div className="form-row-inline">
              <label htmlFor="formulation-name">配方名稱</label>
              <input id="formulation-name" type="text" maxLength={100} value={state.name} autoComplete="off" onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))} />
              <button type="button" onClick={() => loadFormulation(toFormulation(emptyState()), null)}>新配方</button>
            </div>
            {currentId && <small>目前編輯的是已儲存的配方（按「儲存」會覆蓋它，「另存」會新增一筆）。</small>}
            <details className="workbench-library">
              <summary>我的配方（儲存、另存、載入、匯出入）</summary>
              <FormulationLibrary formulation={formulation} currentId={currentId} onLoad={loadFormulation} onSaved={setCurrentId} storage={storage} />
            </details>
          </section>

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

          <AreaCard area="solid" state={state} setState={setState} issues={issues} units={units} onAdd={() => setDialog({ kind: 'add', area: 'solid' })} onOpenDetail={(rowId) => setDialog({ kind: 'detail', rowId })} />
          <AreaCard area="liquid" state={state} setState={setState} issues={issues} units={units} onAdd={() => setDialog({ kind: 'add', area: 'liquid' })} onOpenDetail={(rowId) => setDialog({ kind: 'detail', rowId })} />
        </div>

        <div className="workbench-right" aria-label="即時結果">
          <ResultBlock id="composition" title="組成">
            <div id="field-results" tabIndex={-1}>
              <p className="result-meta">
                模型：配方換算　<span className="confidence-tag confidence-direct">{confidenceLabel('direct')}</span>
              </p>
              {pending.size > 0 ? (
                <p role="status">尚未填完用量</p>
              ) : outcome === null ? (
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
                  {hasPolymerRow && (
                    <div className="form-row-inline" role="radiogroup" aria-label="聚合物 mol% 基準">
                      <span>聚合物 mol% 基準</span>
                      {(['chain', 'unit'] as const).map((basis) => (
                        <label key={basis} className="check">
                          <input
                            type="radio"
                            name="polymer-mol-basis"
                            checked={state.polymerMolBasis === basis}
                            onChange={() => setState((s) => ({ ...s, polymerMolBasis: basis }))}
                          />
                          {basis === 'chain' ? '以鏈計' : '以重複單元計'}
                        </label>
                      ))}
                    </div>
                  )}
                  {solid && <AreaTable title="Solid" result={solid} />}
                  {liquid && <AreaTable title="Liquid" result={liquid} />}
                  <Overall outcome={outcome} />
                  <IssueList issues={otherFormulationIssues} />
                </>
              )}
              <UnifiedNote />
            </div>
          </ResultBlock>
          <CrosslinkPage formulation={formulation} />
        </div>
      </div>

      {dialog?.kind === 'add' && (
        <AddComponentDialog
          area={dialog.area}
          existingCount={componentCount}
          onAdd={(row) =>
            setState((s) => (dialog.area === 'solid' ? { ...s, solidRows: [...s.solidRows, row] } : { ...s, liquidRows: [...s.liquidRows, row] }))
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'detail' && detailRow && (
        <ComponentDetailDialog row={detailRow} area={detailArea} onChange={(update) => updateRow(detailRow.id, update)} onClose={() => setDialog(null)} />
      )}
    </BlockStateContext.Provider>
  );
}
