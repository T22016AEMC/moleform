// 右欄的「黏度」與「表面與潤濕」卡片（任務 P8-2，PLAN 8.4–8.7）：呼叫桌面版的 Python 引擎。
// 沿用 ResultBlock 與既有表格樣式；純網頁沒有引擎：顯示「需要桌面版與引擎」。數值由引擎計算，這裡只顯示；缺值一律顯示「資料不足」與原因，不給空白數字。
import { useMemo, useState, type ReactNode } from 'react';
import type { Formulation } from '../../core/formulation/types';
import { UnifiedNote } from '../components/UnifiedNote';
import { ResultBlock } from '../workbench/ResultBlock';
import type { EngineQuantity } from './engineClient';
import { fmt, replyBody, unavailable, useEngineReply, useEngineStatus } from './SolventBlocks';
import {
  emptyAndrade,
  emptyPolymerFields,
  liquidComponents,
  polymerMolarMass,
  surfacePolymers,
  surfaceReason,
  surfaceTensionRequest,
  viscosityRequest,
  wettingRequest,
  type AndradeFields,
  type PolymerViscosityFields,
} from './viscositySurfaceRequests';

const TREND = '參考趨勢，非定量保證；書公式預估誤差見 MODELS.md';

interface Props {
  /** 已延遲重算的配方（與換算結果同一份） */
  formulation: Formulation;
  /** 成分 id → 每分子質量（小分子）或 Mn（聚合物） */
  mnById?: Record<string, number | undefined>;
}

type Quantity = EngineQuantity & { reason?: string; note?: string; temperatureC?: number | null };

/** 一列「值、單位、來源、狀態」；沒有值顯示「資料不足」與原因 */
function QuantityRow({ label, q }: { label: string; q: Quantity | null | undefined }) {
  if (!q) return null;
  const missing = q.value === null;
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className={`number${missing ? ' cell-na' : ''}`}>{missing ? '資料不足' : fmt(q.value as number)}</td>
      <td>{q.unit}</td>
      <td><small>{q.source}</small></td>
      <td>
        {q.status}
        {missing && q.reason && <small> — {q.reason}</small>}
        {!missing && q.note && <small> — {q.note}</small>}
      </td>
    </tr>
  );
}

function QuantityTable({ children }: { children: ReactNode }) {
  return (
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
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// ---------- 黏度 ----------

interface SolventReply {
  name: string;
  tableValue: Quantity;
  atTemperature: Quantity;
  andrade: { energyKjMol: Quantity; B: Quantity } | null;
  warnings: string[];
}

interface ThetaReply {
  status: string;
  quantities: { kTheta: Quantity; etaTheta: Quantity };
  reasons: Record<string, string>;
  missing: { description: string }[];
  notes?: string[];
  sumJ?: number;
  z?: number;
}

interface PolymerViscosityReply {
  theta: ThetaReply;
  markHouwink: { quantity: Quantity; warnings: string[] };
  stockmayerFixman: { quantity: Quantity };
  concentrated: { quantity: Quantity; relation: string; warnings: string[] };
}

interface ViscosityReply {
  solvents?: SolventReply[];
  mixture?: { reason: string; note: string };
  polymer?: PolymerViscosityReply;
}

export function ViscosityBlock({ formulation, mnById = {} }: Props) {
  const { bridge, status } = useEngineStatus();
  const polymers = useMemo(() => surfacePolymers(formulation), [formulation]);
  const liquids = useMemo(() => liquidComponents(formulation), [formulation]);
  const [temperatureText, setTemperatureText] = useState('');
  const [andrade, setAndrade] = useState<Record<string, AndradeFields>>({});
  const [polymerId, setPolymerId] = useState<string | null>(null);
  const [fields, setFields] = useState<PolymerViscosityFields>(emptyPolymerFields);
  const activePolymer = polymers.find((c) => c.id === polymerId) ?? polymers[0] ?? null;
  const planned = useMemo(
    () => viscosityRequest(formulation, { temperatureText, andrade, polymerId: activePolymer?.id ?? null, mnById, polymer: fields }),
    [formulation, temperatureText, andrade, activePolymer, mnById, fields],
  );
  const ready = status?.state === 'ready';
  const { reply, busy } = useEngineReply(planned.request, ready);
  const { body, error } = replyBody(reply);
  const r = body as unknown as ViscosityReply | null;
  const setAndradeField = (id: string, patch: Partial<AndradeFields>) => setAndrade((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyAndrade), ...patch } }));
  const setField = (patch: Partial<PolymerViscosityFields>) => setFields((prev) => ({ ...prev, ...patch }));
  const mass = activePolymer ? polymerMolarMass(activePolymer, mnById) : null;

  let content;
  const off = unavailable(bridge, status);
  if (off) content = off;
  else {
    content = (
      <>
        <p className="result-meta">
          模型：Andrade 式（溶劑黏度的溫度依賴）、Θ 條件極限黏度數（基團貢獻）、Mark–Houwink 式　<span className="confidence-tag confidence-trend">參考趨勢</span>
        </p>
        <div className="form-row-inline">
          <label htmlFor="visc-temp">指定溫度（°C）</label>
          <input id="visc-temp" type="text" inputMode="decimal" value={temperatureText} placeholder="例如 25" onChange={(e) => setTemperatureText(e.target.value)} />
        </div>
        {liquids.length > 0 && (
          <details>
            <summary>溶劑的 Andrade 參數（可選；式 16.15a）</summary>
            <small>書只給「多數溶劑 Eη 在 7–14 kJ/mol」這個範圍，不當預設值；請由使用者輸入「兩個溫度的黏度」或「B 與 Eη」。只有一個溫度的資料時不外推。</small>
            {liquids.map((c) => {
              const f = andrade[c.id] ?? emptyAndrade;
              return (
                <div key={c.id} className="form-row-inline">
                  <strong>{c.name || '（未命名）'}</strong>
                  <select aria-label={`${c.name} 的 Andrade 參數輸入方式`} value={f.mode} onChange={(e) => setAndradeField(c.id, { mode: e.target.value as AndradeFields['mode'] })}>
                    <option value="none">不輸入</option>
                    <option value="be">B（mPa·s）與 Eη（kJ/mol）</option>
                    <option value="points">兩個溫度的黏度</option>
                  </select>
                  {f.mode === 'be' && (
                    <>
                      <input aria-label="B（mPa·s）" type="text" inputMode="decimal" placeholder="B（mPa·s）" value={f.b} onChange={(e) => setAndradeField(c.id, { b: e.target.value })} />
                      <input aria-label="Eη（kJ/mol）" type="text" inputMode="decimal" placeholder="Eη（kJ/mol）" value={f.e} onChange={(e) => setAndradeField(c.id, { e: e.target.value })} />
                    </>
                  )}
                  {f.mode === 'points' && (
                    <>
                      <input aria-label="溫度 1（°C）" type="text" inputMode="decimal" placeholder="溫度 1（°C）" value={f.t1} onChange={(e) => setAndradeField(c.id, { t1: e.target.value })} />
                      <input aria-label="黏度 1（mPa·s）" type="text" inputMode="decimal" placeholder="黏度 1（mPa·s）" value={f.v1} onChange={(e) => setAndradeField(c.id, { v1: e.target.value })} />
                      <input aria-label="溫度 2（°C）" type="text" inputMode="decimal" placeholder="溫度 2（°C）" value={f.t2} onChange={(e) => setAndradeField(c.id, { t2: e.target.value })} />
                      <input aria-label="黏度 2（mPa·s）" type="text" inputMode="decimal" placeholder="黏度 2（mPa·s）" value={f.v2} onChange={(e) => setAndradeField(c.id, { v2: e.target.value })} />
                    </>
                  )}
                </div>
              );
            })}
          </details>
        )}
        <div className="form-row-inline">
          <label htmlFor="visc-polymer">聚合物成分（溶液黏度）</label>
          <select id="visc-polymer" value={activePolymer?.id ?? ''} disabled={polymers.length === 0} onChange={(e) => setPolymerId(e.target.value)}>
            {polymers.length === 0 && <option value="">（Solid 區沒有聚合物）</option>}
            {polymers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || '（未命名）'}
              </option>
            ))}
          </select>
        </div>
        {activePolymer && (
          <small>
            {mass ? `分子量 M = ${fmt(mass.value, 6)} g/mol（取成分的 ${mass.basis}；式 9.33 的 M 是黏度平均分子量 Mv，介於 Mn 與 Mw 之間）` : '沒有分子量：[η] 只給 KΘ'}
            {(activePolymer.polymer?.units?.length ?? 0) > 1 ? '；共聚物以第一種單元計算' : ''}
          </small>
        )}
        {activePolymer && (
          <details>
            <summary>使用者輸入（Mark–Houwink 的 K 與 a、含 B 項、濃溶液）</summary>
            <small>本引擎不內建任何 K、a：請由使用者輸入並附來源、溫度與溶劑（K、a 依溶劑與溫度而定）。沒有輸入時顯示「資料不足」。</small>
            <div className="form-row-inline">
              <input aria-label="K（cm³/g，M 以 g/mol 計）" type="text" inputMode="decimal" placeholder="K" value={fields.mhK} onChange={(e) => setField({ mhK: e.target.value })} />
              <input aria-label="a" type="text" inputMode="decimal" placeholder="a" value={fields.mhA} onChange={(e) => setField({ mhA: e.target.value })} />
              <input aria-label="K、a 的來源" type="text" placeholder="來源（必填）" value={fields.mhSource} onChange={(e) => setField({ mhSource: e.target.value })} />
              <input aria-label="K、a 的溶劑" type="text" placeholder="溶劑" value={fields.mhSolvent} onChange={(e) => setField({ mhSolvent: e.target.value })} />
              <input aria-label="K、a 的溫度（°C）" type="text" inputMode="decimal" placeholder="溫度（°C）" value={fields.mhTemperature} onChange={(e) => setField({ mhTemperature: e.target.value })} />
            </div>
            <div className="form-row-inline">
              <input aria-label="Stockmayer–Fixman 的 B（式 9.38）" type="text" inputMode="decimal" placeholder="B（式 9.38）" value={fields.b} onChange={(e) => setField({ b: e.target.value })} />
              <input aria-label="濃溶液的 K（式 16.21）" type="text" inputMode="decimal" placeholder="濃溶液 K（式 16.21）" value={fields.concK} onChange={(e) => setField({ concK: e.target.value })} />
              <input aria-label="濃溶液的濃度 c" type="text" inputMode="decimal" placeholder="濃度 c" value={fields.concC} onChange={(e) => setField({ concC: e.target.value })} />
            </div>
          </details>
        )}
        {planned.request === null ? (
          <p role="status">{planned.reason}</p>
        ) : error ? (
          <p className="form-error" role="alert">{error}</p>
        ) : busy || r === null ? (
          <p role="status">引擎計算中…</p>
        ) : (
          <ViscosityResult r={r} />
        )}
      </>
    );
  }
  return (
    <ResultBlock id="viscosity" title="黏度">
      {content}
      <small>{TREND}</small>
      <UnifiedNote />
    </ResultBlock>
  );
}

function ViscosityResult({ r }: { r: ViscosityReply }) {
  return (
    <>
      {r.solvents && r.solvents.length > 0 && (
        <QuantityTable>
          {r.solvents.flatMap((s, i) => [
            <QuantityRow key={`t${i}`} label={`${s.name}：資料表黏度`} q={s.tableValue} />,
            <QuantityRow key={`a${i}`} label={`${s.name}：指定溫度的黏度`} q={s.atTemperature} />,
          ])}
        </QuantityTable>
      )}
      {r.solvents?.flatMap((s) => s.warnings).map((w) => (
        <small key={w} className="form-warning"> {w}</small>
      ))}
      {r.mixture && (
        <p className="form-warning" role="status">
          混合溶劑黏度：資料不足 — {r.mixture.reason}（{r.mixture.note}）
        </p>
      )}
      {r.polymer && <PolymerViscosity p={r.polymer} />}
    </>
  );
}

function PolymerViscosity({ p }: { p: PolymerViscosityReply }) {
  const theta = p.theta;
  const warnings = [...(p.markHouwink.warnings ?? []), ...(p.concentrated.warnings ?? []), ...(theta.notes ?? [])];
  return (
    <>
      <QuantityTable>
        <QuantityRow label="KΘ（Θ 條件，式 9.42 與 Table 9.3）" q={theta.quantities.kTheta} />
        <QuantityRow label="[η]Θ（式 9.34）" q={theta.quantities.etaTheta} />
        <QuantityRow label="[η]（Mark–Houwink，式 9.32）" q={p.markHouwink.quantity} />
        <QuantityRow label="[η]（含 B 項，式 9.38）" q={p.stockmayerFixman.quantity} />
        <QuantityRow label="η（濃溶液，式 16.21）" q={p.concentrated.quantity} />
      </QuantityTable>
      {theta.missing.length > 0 && <small className="form-warning">KΘ 缺基團：{theta.missing.map((m) => m.description).join('；')}</small>}
      {Array.from(new Set(Object.values(theta.reasons))).map((w) => (
        <small key={w} className="form-warning"> {w}</small>
      ))}
      {warnings.map((w) => (
        <small key={w} className="form-warning"> {w}</small>
      ))}
      <small>濃溶液：{p.concentrated.relation}</small>
    </>
  );
}

// ---------- 表面與潤濕 ----------

interface ParachorSet {
  key: string;
  label: string;
  parachor: Quantity;
  gamma: Quantity;
}

interface SurfaceReply {
  status: string;
  quantities: { gammaMin: Quantity; gammaMax: Quantity };
  sets: ParachorSet[];
  missing: { description: string; reason: string }[];
  reasons: Record<string, string>;
  warnings?: string[];
  notes?: string[];
  volume: { value: number; basis: string } | null;
  literature?: {
    table83?: { name?: string; guggenheim?: Quantity; reason?: string | null; status?: string };
    table87?: { name?: string; gammaS?: Quantity; negDgammaDt?: Quantity; status?: string; reason?: string };
    solventTable?: { gamma?: Quantity; temperatureC?: number; status?: string; reason?: string };
  };
}

interface WettingReply {
  status: string;
  quantities: Record<'gamma12' | 'cosTheta' | 'theta' | 'adhesionTension' | 'spreadingCoefficient' | 'gammaSV' | 'gammaLV', Quantity>;
  verdict: string | null;
  reasons: string[];
  notes: string[];
  solid: { label: string };
  liquid: { label: string };
}

interface MaterialListReply {
  liquids: { id: string; name: string; smiles: string; table: string; hasComponents: boolean }[];
}

const PLAIN = 'component:';

export function SurfaceWettingBlock({ formulation }: Props) {
  const { bridge, status } = useEngineStatus();
  const polymers = useMemo(() => surfacePolymers(formulation), [formulation]);
  const liquids = useMemo(() => liquidComponents(formulation), [formulation]);
  const [polymerId, setPolymerId] = useState<string | null>(null);
  const [liquidKey, setLiquidKey] = useState<string>('');
  const [temperatureText, setTemperatureText] = useState('');
  const ready = status?.state === 'ready';
  const list = useEngineReply(ready ? { path: '/wetting', body: { list: true } } : null, ready);
  const tableLiquids = (replyBody(list.reply).body as unknown as MaterialListReply | null)?.liquids ?? [];
  const activePolymer = polymers.find((c) => c.id === polymerId) ?? polymers[0] ?? null;
  const defaultKey = liquids.length > 0 ? `${PLAIN}${liquids[0].id}` : tableLiquids.length > 0 ? tableLiquids[0].id : '';
  const key = liquidKey !== '' ? liquidKey : defaultKey;
  const liquidComp = key.startsWith(PLAIN) ? liquids.find((c) => `${PLAIN}${c.id}` === key) ?? null : null;
  const tableRow = !key.startsWith(PLAIN) ? tableLiquids.find((l) => l.id === key) ?? null : null;
  const liquidSmiles = liquidComp?.canonicalSmiles ?? tableRow?.smiles ?? '';

  const polymerSurface = useMemo(() => (activePolymer ? surfaceTensionRequest(activePolymer.canonicalSmiles, temperatureText) : null), [activePolymer, temperatureText]);
  const liquidSurface = useMemo(() => surfaceTensionRequest(liquidSmiles, temperatureText), [liquidSmiles, temperatureText]);
  const wetting = useMemo(() => wettingRequest(activePolymer, liquidComp, tableRow ? { materialId: tableRow.id } : null), [activePolymer, liquidComp, tableRow]);
  const polymerReply = useEngineReply(polymerSurface, ready);
  const liquidReply = useEngineReply(liquidSurface, ready);
  const wettingReply = useEngineReply(wetting.request, ready);
  const polymerBody = replyBody(polymerReply.reply);
  const liquidBody = replyBody(liquidReply.reply);
  const wettingBody = replyBody(wettingReply.reply);

  let content;
  const off = unavailable(bridge, status);
  if (off) content = off;
  else {
    content = (
      <>
        <p className="result-meta">
          模型：Parachor 基團加成（表面張力）、Owens–Wendt（界面張力與接觸角）、Young 式（鋪展係數）　<span className="confidence-tag confidence-trend">參考趨勢</span>
        </p>
        <div className="form-row-inline">
          <label htmlFor="surf-polymer">聚合物成分</label>
          <select id="surf-polymer" value={activePolymer?.id ?? ''} disabled={polymers.length === 0} onChange={(e) => setPolymerId(e.target.value)}>
            {polymers.length === 0 && <option value="">（Solid 區沒有聚合物）</option>}
            {polymers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || '（未命名）'}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row-inline">
          <label htmlFor="surf-liquid">液體</label>
          <select id="surf-liquid" value={key} onChange={(e) => setLiquidKey(e.target.value)}>
            {liquids.map((c) => (
              <option key={c.id} value={`${PLAIN}${c.id}`}>
                配方的 Liquid 成分：{c.name || '（未命名）'}
              </option>
            ))}
            {tableLiquids.map((l) => (
              <option key={l.id} value={l.id}>
                書 Table 8.6：{l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row-inline">
          <label htmlFor="surf-temp">指定溫度（°C，表面張力）</label>
          <input id="surf-temp" type="text" inputMode="decimal" value={temperatureText} placeholder="預設 25；聚合物只有 25 °C 的莫耳體積" onChange={(e) => setTemperatureText(e.target.value)} />
        </div>
        <h4>表面張力（Parachor，Table 8.1 三組並列）</h4>
        <SurfaceTable label={activePolymer ? `聚合物：${activePolymer.name || '（未命名）'}` : '聚合物'} reply={polymerSurface === null ? null : (polymerBody.body as unknown as SurfaceReply | null)} error={polymerBody.error} busy={polymerSurface !== null && polymerReply.busy} fallback={surfaceReason(polymers.length > 0)} />
        <SurfaceTable label={`液體：${liquidComp?.name || tableRow?.name || '—'}`} reply={liquidSurface === null ? null : (liquidBody.body as unknown as SurfaceReply | null)} error={liquidBody.error} busy={liquidSurface !== null && liquidReply.busy} fallback={liquidSmiles === '' ? '這個液體沒有結構（書只寫名稱），不算 Parachor' : '請選一種液體'} />
        <h4>潤濕（Owens–Wendt）</h4>
        {wetting.request === null ? (
          <p role="status">資料不足：{wetting.reason}</p>
        ) : wettingBody.error ? (
          <p className="form-error" role="alert">{wettingBody.error}</p>
        ) : wettingReply.busy || wettingBody.body === null ? (
          <p role="status">引擎計算中…</p>
        ) : (
          <WettingResult r={wettingBody.body as unknown as WettingReply} />
        )}
      </>
    );
  }
  return (
    <ResultBlock id="surface-wetting" title="表面與潤濕">
      {content}
      <small>{TREND}</small>
      <UnifiedNote />
    </ResultBlock>
  );
}

function SurfaceTable({ label, reply, error, busy, fallback }: { label: string; reply: SurfaceReply | null; error: string | null; busy: boolean; fallback: string }) {
  if (error) return <p className="form-error" role="alert">{label}：{error}</p>;
  if (reply === null) return <p role="status">{label}：{busy ? '引擎計算中…' : `資料不足 — ${fallback}`}</p>;
  const reasons = Array.from(new Set(Object.values(reply.reasons)));
  const lit = reply.literature;
  return (
    <>
      <QuantityTable>
        <QuantityRow label={`${label}：γ 最小（三組）`} q={reply.quantities.gammaMin} />
        <QuantityRow label={`${label}：γ 最大（三組）`} q={reply.quantities.gammaMax} />
        {reply.sets.map((s) => (
          <QuantityRow key={s.key} label={`　${s.label}：γ（Ps ${s.parachor.value === null ? '—' : fmt(s.parachor.value)}）`} q={s.gamma} />
        ))}
        {lit?.table83?.guggenheim && <QuantityRow label="　文獻對照：Guggenheim（書 Table 8.3）" q={lit.table83.guggenheim} />}
        {lit?.table87?.gammaS && <QuantityRow label="　文獻對照：γs（書 Table 8.7）" q={lit.table87.gammaS} />}
        {lit?.table87?.negDgammaDt && <QuantityRow label="　文獻對照：−dγs/dT（書 Table 8.7）" q={lit.table87.negDgammaDt} />}
        {lit?.solventTable?.gamma && <QuantityRow label="　文獻對照：溶劑資料表的 γ" q={lit.solventTable.gamma} />}
      </QuantityTable>
      {reply.missing.length > 0 && <small className="form-warning">缺基團：{reply.missing.map((m) => `${m.description}（${m.reason}）`).join('；')}</small>}
      {reasons.map((w) => (
        <small key={w} className="form-warning"> {w}</small>
      ))}
      {(reply.notes ?? []).map((w) => (
        <small key={w} className="form-warning"> {w}</small>
      ))}
    </>
  );
}

function WettingResult({ r }: { r: WettingReply }) {
  const q = r.quantities;
  return (
    <>
      <QuantityTable>
        <QuantityRow label="γSV（固體表面張力，書 Table 8.7）" q={q.gammaSV} />
        <QuantityRow label="γLV（液體表面張力）" q={q.gammaLV} />
        <QuantityRow label="γ12（界面張力，式 8.22）" q={q.gamma12} />
        <QuantityRow label="cosθ（式 8.23）" q={q.cosTheta} />
        <QuantityRow label="θ（接觸角）" q={q.theta} />
        <QuantityRow label="黏附張力 γLV·cosθ ≈ γS − γSL（式 8.6）" q={q.adhesionTension} />
        <QuantityRow label="鋪展係數 S = γLV + γSL − γSV" q={q.spreadingCoefficient} />
      </QuantityTable>
      {r.verdict && (
        <div className="structure-notice" role="status">
          <p>
            <strong>判斷：{r.verdict}</strong>
          </p>
          <p>書的定義：S 為負時完全潤濕（液體鋪展）；S 為正時不完全潤濕。</p>
        </div>
      )}
      {r.reasons.map((w) => (
        <small key={w} className="form-warning"> 資料不足：{w}</small>
      ))}
      {r.notes.map((w) => (
        <small key={w} className="form-warning"> {w}</small>
      ))}
    </>
  );
}
