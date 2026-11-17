// 引擎回應 → 面板的列（任務 I01）。每列一定有 value／unit／source／status；算不出的項目為 missing 並附原因，不隱藏。
import type { EngineQuantity, EngineReply } from './engineClient';

export interface PropertyRow {
  key: string;
  label: string;
  quantity: EngineQuantity;
  /** missing 或需要補充說明時的原因／備註 */
  reason?: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const isQuantity = (v: unknown): v is EngineQuantity => isObj(v) && 'value' in v && 'status' in v && 'unit' in v && 'source' in v;

function absent(unit: string): EngineQuantity {
  return { value: null, unit, source: '—', status: 'missing' };
}

/** 缺基團清單 → 「缺基團：…」 */
export function describeMissing(missing: unknown): string | undefined {
  if (!Array.isArray(missing) || missing.length === 0) return undefined;
  const items = missing.map((m) => {
    if (!isObj(m)) return String(m);
    const where = typeof m.description === 'string' ? m.description : typeof m.element === 'string' ? m.element : '';
    const why = typeof m.reason === 'string' && m.reason !== '' ? `（${m.reason}）` : '';
    const idx = typeof m.index === 'number' ? `原子 ${m.index}：` : '';
    return `${idx}${where}${why}`;
  });
  return `缺基團：${items.join('；')}`;
}

/** 整個請求失敗（引擎錯誤、HTTP 400、橋接拒絕）時的原因 */
function failure(reply: EngineReply | undefined): string | undefined {
  if (!reply) return '尚未取得引擎回應';
  if (!reply.ok) return reply.error;
  if (reply.status !== 200 || reply.body.ok !== true) {
    const errors = reply.body.errors;
    return Array.isArray(errors) && errors.length ? errors.map(String).join('；') : `引擎回應 HTTP ${reply.status}`;
  }
  return undefined;
}

/** 缺值的原因：不適用／不支援 → 引擎訊息；否則缺基團清單；再不然引擎訊息 */
function bodyReason(body: Obj, missing?: unknown): string | undefined {
  const message = typeof body.message === 'string' ? body.message : undefined;
  if (body.notApplicable === true || body.unsupported === true) return message;
  return describeMissing(missing ?? body.missing) ?? message;
}

function rowFrom(key: string, label: string, q: unknown, unit: string, reply: EngineReply | undefined, reasonIfMissing: () => string | undefined): PropertyRow {
  const failed = failure(reply);
  if (failed !== undefined || !isQuantity(q)) return { key, label, quantity: absent(unit), reason: failed ?? '引擎沒有回傳此項' };
  if (q.status === 'missing' || q.value === null) return { key, label, quantity: q, reason: reasonIfMissing() ?? '引擎沒有說明原因' };
  return { key, label, quantity: q };
}

export type UnitReplies = Partial<Record<string, EngineReply>>;

function bodyOf(reply: EngineReply | undefined): Obj {
  return reply && reply.ok && isObj(reply.body) ? reply.body : {};
}

/** 單一對象（聚合物單元／小分子）的所有物性列 */
export function unitRows(replies: UnitReplies, polymer: boolean): PropertyRow[] {
  const rows: PropertyRow[] = [];
  const get = (path: string) => replies[path];
  const of = (path: string) => bodyOf(get(path));

  const vw = of('/vw');
  rows.push(rowFrom('vw', 'VW（van der Waals 體積）', vw.quantity, 'cm³/mol', get('/vw'), () => bodyReason(vw)));

  if (polymer) {
    const tg = of('/tg');
    rows.push(rowFrom('tg', 'Tg', tg.quantity, 'K', get('/tg'), () => bodyReason(tg)));
  } else {
    rows.push({
      key: 'tg',
      label: 'Tg',
      quantity: { value: null, unit: 'K', source: 'D56', status: 'missing' },
      reason: '不適用：小分子不計算 Tg，只給 Tm（Tb／Tf 見下）（D56）',
    });
  }

  rows.push(...p6bRows(replies, polymer));

  const vm = of('/vm');
  rows.push(rowFrom('vm', 'Vm（莫耳體積，298 K）', vm.quantity, 'cm³/mol', get('/vm'), () => bodyReason(vm)));
  // 算不出時引擎只回 quantity（缺值）；密度沿用同一個原因
  const density = vm.density ?? (isQuantity(vm.quantity) ? { ...vm.quantity, unit: 'g/cm³' } : undefined);
  rows.push(rowFrom('density', '密度（298 K）', density, 'g/cm³', get('/vm'), () => bodyReason(vm)));

  const cte = of('/cte');
  const cq = isObj(cte.quantities) ? cte.quantities : {};
  const cteReason = () => bodyReason(cte);
  rows.push(rowFrom('cte-rubbery', 'CTE α（橡膠態）', cq.rubberyAlpha, 'K⁻¹', get('/cte'), cteReason));
  rows.push(rowFrom('cte-glassy', 'CTE α（玻璃態，式 4.8b）', cq.glassyAlpha, 'K⁻¹', get('/cte'), cteReason));
  rows.push(
    rowFrom('cte-glassy-tg', 'CTE α（玻璃態，由 Tg，式 4.27）', cq.glassyFromTgAlpha, 'K⁻¹', get('/cte'), () => {
      const gt = isObj(cte.glassyFromTg) ? cte.glassyFromTg : {};
      return cteReason() ?? (typeof gt.message === 'string' ? gt.message : '缺 Tg，無法由 Tg 估算');
    }),
  );

  const fv = of('/free-volume');
  rows.push(rowFrom('fv', '自由體積 Vf（使用者定義經驗法）', fv.quantity, 'cm³/mol', get('/free-volume'), () => bodyReason(fv, fv.components)));

  const de = of('/dielectric');
  const dq = isObj(de.quantities) ? de.quantities : {};
  const dielectric = isObj(de.dielectric) ? de.dielectric : {};
  const refraction = isObj(de.refraction) ? de.refraction : {};
  const epsReason = () => bodyReason(de, dielectric.missing) ?? (typeof dielectric.message === 'string' ? dielectric.message : undefined);
  const alphaReason = () => bodyReason(de, refraction.missing) ?? (typeof refraction.message === 'string' ? refraction.message : undefined);
  rows.push(rowFrom('epsilon', '介電常數 ε', dq.epsilon, '', get('/dielectric'), epsReason));
  rows.push(rowFrom('alpha-prime', '極化率 α′（體積）', dq.alphaPrime, 'Å³', get('/dielectric'), alphaReason));
  rows.push(rowFrom('alpha', '極化率 α（SI）', dq.alpha, 'J⁻¹ C² m²', get('/dielectric'), alphaReason));

  const jb = of('/joback');
  const jq = isObj(jb.quantities) ? jb.quantities : {};
  const tfReason = () => (jb.tfUnavailable ? '表 III 沒有此分子基團的 Tfi，Tf 算不出' : undefined);
  rows.push(rowFrom('tb', 'Tb（沸點，Joback）', jq.tb, 'K', get('/joback'), () => bodyReason(jb)));
  rows.push(rowFrom('tf', 'Tf（熔點，Joback）', jq.tf, 'K', get('/joback'), () => bodyReason(jb) ?? tfReason()));

  const tl = of('/tpsa-logp');
  const tq = isObj(tl.quantities) ? tl.quantities : {};
  rows.push(rowFrom('tpsa', 'TPSA', tq.tpsa, 'Å²', get('/tpsa-logp'), () => bodyReason(tl)));
  const capped = tl.capped === true && typeof tl.note === 'string' ? tl.note : undefined;
  const logp = rowFrom('logp', 'LogP（Crippen）', tq.logP, '', get('/tpsa-logp'), () => bodyReason(tl));
  rows.push(capped && !logp.reason ? { ...logp, reason: capped } : logp);
  return rows;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** 有備註或警告時併入列的說明（不覆蓋原有的缺值原因） */
function withNotes(row: PropertyRow, notes: string[]): PropertyRow {
  const extra = notes.filter((n) => n !== '');
  if (extra.length === 0) return row;
  return { ...row, reason: [row.reason, ...extra].filter((x): x is string => typeof x === 'string' && x !== '').join('；') };
}

/** Tm、Td、吸濕性、體積／彈性模數（任務 P6B）。小分子顯示不適用與原因，不隱藏 */
function p6bRows(replies: UnitReplies, polymer: boolean): PropertyRow[] {
  if (!polymer) {
    const na = (key: string, label: string, unit: string, reason: string): PropertyRow => ({
      key,
      label,
      quantity: { value: null, unit, source: '—', status: 'missing' },
      reason,
    });
    return [
      na('tm', 'Tm（結晶熔點）', 'K', '不適用：小分子的熔點見 Tf（Joback，D56）'),
      na('td', 'Td,1/2（半分解溫度）', 'K', '不適用：只針對聚合物重複單元（Yd,1/2 基團貢獻）'),
      na('moisture', '吸濕量（25 °C）', 'g 水／100 g 聚合物', '不適用：只針對聚合物重複單元（Table 18.14 結構基團）'),
      na('modulus', '體積模數 K／彈性模數 E', 'N/m²', '不適用：只針對聚合物重複單元'),
    ];
  }
  const get = (path: string) => replies[path];
  const of = (path: string) => bodyOf(get(path));
  const rows: PropertyRow[] = [];

  const tm = of('/tm');
  rows.push(withNotes(rowFrom('tm', 'Tm（結晶熔點，Ym）', tm.quantity, 'K', get('/tm'), () => bodyReason(tm)), [...strings(tm.warnings), typeof tm.notes === 'string' ? tm.notes : '']));

  const td = of('/td');
  rows.push(withNotes(rowFrom('td', 'Td,1/2（半分解溫度，Yd,1/2）', td.quantity, 'K', get('/td'), () => bodyReason(td)), [...strings(td.warnings), typeof td.notes === 'string' ? td.notes : '']));

  const mo = of('/moisture');
  const rh = typeof mo.rh === 'number' ? mo.rh : undefined;
  const moReason = () => {
    const items = Array.isArray(mo.missingValues) ? mo.missingValues.filter(isObj).map((m) => String(m.reason ?? '')) : [];
    return items.length ? items.join('；') : bodyReason(mo);
  };
  rows.push(
    withNotes(rowFrom('moisture', `吸濕量（25 °C，RH ${rh ?? '—'}，非晶區）`, mo.quantity, 'g 水／100 g 聚合物', get('/moisture'), moReason), [
      ...strings(mo.warnings),
      typeof mo.notes === 'string' ? mo.notes : '',
    ]),
  );

  const mod = of('/modulus');
  rows.push(
    withNotes(rowFrom('modulus', '體積模數 K／彈性模數 E', mod.quantity, 'N/m²', get('/modulus'), () => (typeof mod.summary === 'string' ? mod.summary : undefined)), [
      typeof mod.notes === 'string' ? mod.notes : '',
    ]),
  );
  return rows;
}

export interface FormulationReplies {
  tgMixing?: EngineReply;
  density?: EngineReply;
  dielectric?: EngineReply;
  /** 質量分率不完整等原因造成沒有送出混合密度／混合介電請求 */
  mixReason?: string | null;
}

/** 配方（混合）的物性列：成分 Tg、混合 Tg、混合密度、混合介電 */
export function formulationRows(r: FormulationReplies): PropertyRow[] {
  const rows: PropertyRow[] = [];

  const tgFailed = failure(r.tgMixing);
  const tg = bodyOf(r.tgMixing);
  const comps = Array.isArray(tg.components) ? tg.components.filter(isObj) : [];
  const model = isObj(tg.quantity) && typeof tg.quantity.source === 'string' ? tg.quantity.source : '—';
  if (tgFailed === undefined) {
    for (const c of comps) {
      const name = typeof c.name === 'string' ? c.name : '成分';
      const value = typeof c.tgK === 'number' ? c.tgK : null;
      const flags = Array.isArray(c.flags) && c.flags.length ? `（${c.flags.join('、')}）` : '';
      rows.push({
        key: `tg-${String(c.id)}`,
        label: `成分 Tg：${name}`,
        quantity: { value, unit: 'K', source: value === null ? '—' : model, status: value === null ? 'missing' : 'predicted' },
        ...(value === null ? { reason: typeof c.missingReason === 'string' ? c.missingReason : '算不出' } : flags ? { reason: `可信度標記${flags}` } : {}),
      });
    }
  }
  const partial = isObj(tg.partial) ? tg.partial : null;
  const messages = Array.isArray(tg.messages) ? tg.messages.map(String).join('；') : undefined;
  rows.push(rowFrom('tg-mix', '混合 Tg（Fox）', tg.quantity, 'K', r.tgMixing, () => messages ?? '算不出'));
  if (partial && typeof partial.tgK === 'number' && isObj(tg.quantity)) {
    rows.push({
      key: 'tg-mix-partial',
      label: '混合 Tg（部分，非完整配方）',
      quantity: { value: partial.tgK, unit: 'K', source: String(tg.quantity.source ?? '—'), status: 'predicted' },
      reason: `去除缺 Tg 的成分後只混：${Array.isArray(partial.included) ? partial.included.join('、') : ''}`,
    });
  }

  // 沒有送出請求（質量分率不完整等）時，以原因當作失敗
  const densReply: EngineReply | undefined = r.mixReason ? { ok: false, error: r.mixReason } : r.density;
  const dielReply: EngineReply | undefined = r.mixReason ? { ok: false, error: r.mixReason } : r.dielectric;
  const dens = bodyOf(densReply);
  const densQ = isObj(dens.quantities) ? dens.quantities : {};
  rows.push(rowFrom('mix-density', '混合密度（體積加成）', densQ.density, 'g/cm³', densReply, () => mixingReason(dens)));

  const diel = bodyOf(dielReply);
  const dielQ = isObj(diel.quantities) ? diel.quantities : {};
  rows.push(rowFrom('mix-eps-lich', '混合介電 ε（Lichtenecker）', dielQ.lichtenecker, '', dielReply, () => mixingReason(diel)));
  rows.push(rowFrom('mix-eps-upper', '混合介電 ε（Wiener 上界）', dielQ.wienerUpper, '', dielReply, () => mixingReason(diel)));
  rows.push(rowFrom('mix-eps-lower', '混合介電 ε（Wiener 下界）', dielQ.wienerLower, '', dielReply, () => mixingReason(diel)));
  return rows;
}

function mixingReason(body: Obj): string | undefined {
  return typeof body.message === 'string' ? body.message : describeMissing(body.missing);
}
