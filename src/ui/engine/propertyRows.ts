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

// ---------- 任務 P8-3：缺值時「使用者可以怎麼補」 ----------

/** 成分密度的來源（引擎 component_density 的 source）→ 面板顯示 */
export const DENSITY_SOURCE_TEXT: Record<string, string> = {
  given: '呼叫端提供的密度',
  userK: '堆積係數 k（使用者輸入；Vm = VvdW／k，D61）',
  tableK: '堆積係數 k（k 表名稱命中；Vm = VvdW／k，D61）',
  predicted: '書 Va（莫耳體積基團表，298 K）',
  user: '使用者輸入的密度（文獻或供應商資料，非預測）',
  class: '類別預設，非材料值（D57 類別係數換算 k）',
};
export const DENSITY_ORDER_NOTE = '成分密度取得順序：堆積係數 k（使用者輸入 ＞ k 表名稱命中）＞ 書 Va ＞ 使用者密度 ＞ D57 類別預設（只在書 Va 算不出時）';
export const DENSITY_REMEDY = '可以：填寫成分密度（文獻或供應商資料）、把成分名稱改成 k 表的材料名稱、或輸入堆積係數 k';
export const TG_REMEDY = '可以：在成分的「參考聚合物 A」填 A 的 SMILES、A 的 Tg（錨點）與 A 的堆積係數 k，並輸入本成分的堆積係數 k（名稱與 k 表相同時可由 k 表帶出）';
export const DIELECTRIC_MISSING_NOTE = '混合介電只用書的極化基團表（式 11.8）：缺基團時維持缺值，不從 k 表推估；目前沒有可由使用者補的欄位（共聚物的介電也不計算）';
export const POLYMER_HSP_MISSING_NOTE = '聚合物 HSP 維持缺值：書 Table 7.10（HSP 基團貢獻）缺這些基團（例如稠環基團），不從其他表推估；目前沒有可由使用者補的欄位';

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
  rows.push(rowFrom('density', '密度（書 Va，298 K）', density, 'g/cm³', get('/vm'), () => bodyReason(vm)));
  // 任務 P8-3：與配方混合密度同一順序的「採用值」（有送 /mixture-density 單一成分請求時才有）
  if (get('/mixture-density')) rows.push(usedDensityRow(get('/mixture-density')));

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
      na('modulus', '體積模數 K／剪切模數 G／泊松比 ν／楊氏模數 E', 'GPa', '不適用：只針對聚合物重複單元'),
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

  rows.push(...modulusRows(get('/modulus')));
  return rows;
}

const reasonOf = (q: unknown): string | undefined => (isObj(q) && typeof q.reason === 'string' && q.reason !== '' ? q.reason : undefined);

/** 彈性模數（任務 P6E）：K（各方法的平均或單一方法）、G、ν、E，加上各方法的 K 值。缺值顯示 missing 與原因 */
function modulusRows(reply: EngineReply | undefined): PropertyRow[] {
  const mod = bodyOf(reply);
  const moduli = isObj(mod.moduli) ? mod.moduli : {};
  const warnings = strings(mod.warnings);
  const notes = typeof mod.notes === 'string' ? mod.notes : '';
  const rows: PropertyRow[] = [];
  const bulk = isObj(moduli.bulk) ? moduli.bulk : {};
  const basis = typeof bulk.basis === 'string' ? bulk.basis : '';
  rows.push(withNotes(rowFrom('modulus', '體積模數 K', moduli.bulk, 'GPa', reply, () => reasonOf(moduli.bulk) ?? bodyReason(mod)), [basis, ...warnings, notes]));
  rows.push(rowFrom('modulus-g', '剪切模數 G（Hartmann，U_H 書中暫定）', moduli.shear, 'GPa', reply, () => reasonOf(moduli.shear) ?? bodyReason(mod)));
  rows.push(rowFrom('modulus-nu', '泊松比 ν（Table 13.2）', moduli.poisson, '', reply, () => reasonOf(moduli.poisson) ?? bodyReason(mod)));
  rows.push(rowFrom('modulus-e', '楊氏模數 E（Table 13.2）', moduli.young, 'GPa', reply, () => reasonOf(moduli.young) ?? bodyReason(mod)));
  const methods = Array.isArray(mod.methods) ? mod.methods.filter(isObj) : [];
  for (const m of methods) {
    const id = typeof m.id === 'string' ? m.id : 'method';
    const value = typeof m.value === 'number' ? m.value : null;
    const q: EngineQuantity = {
      value,
      unit: 'GPa',
      source: typeof m.equation === 'string' ? m.equation : '—',
      status: value === null ? 'missing' : 'predicted',
    };
    const why = [typeof m.reason === 'string' ? m.reason : undefined, describeMissing(m.missing)].filter((x): x is string => typeof x === 'string' && x !== '').join('；');
    rows.push(rowFrom(`modulus-${id}`, `K：${typeof m.name === 'string' ? m.name : id}`, q, 'GPa', reply, () => (why === '' ? undefined : why)));
  }
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
        quantity: { value, unit: 'K', source: value === null ? '—' : typeof c.tgModel === 'string' ? c.tgModel : model, status: value === null ? 'missing' : 'predicted' },
        ...(value === null ? { reason: componentTgMissingReason(c) } : componentTgNote(c, flags)),
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
  if (failure(densReply) === undefined) rows.push(...componentDensityRows(dens));
  rows.push(rowFrom('mix-density', '混合密度（體積加成）', densQ.density, 'g/cm³', densReply, () => withRemedy(mixingReason(dens), dens)));

  const diel = bodyOf(dielReply);
  const dielQ = isObj(diel.quantities) ? diel.quantities : {};
  const dielReason = () => [mixingReason(diel), DIELECTRIC_MISSING_NOTE].filter((x): x is string => typeof x === 'string' && x !== '').join('；');
  rows.push(rowFrom('mix-eps-lich', '混合介電 ε（Lichtenecker）', dielQ.lichtenecker, '', dielReply, dielReason));
  rows.push(rowFrom('mix-eps-upper', '混合介電 ε（Wiener 上界）', dielQ.wienerUpper, '', dielReply, dielReason));
  rows.push(rowFrom('mix-eps-lower', '混合介電 ε（Wiener 下界）', dielQ.wienerLower, '', dielReply, dielReason));
  return rows;
}

/** 單一對象的成分密度採用值（k ＞ 書 Va ＞ 使用者密度 ＞ 類別預設） */
function usedDensityRow(reply: EngineReply | undefined): PropertyRow {
  const label = '密度（採用值，依取得順序）';
  const failed = failure(reply);
  if (failed !== undefined) return { key: 'density-used', label, quantity: absent('g/cm³'), reason: failed };
  const row = componentDensityRows(bodyOf(reply), 'density-used-')[0];
  if (!row) return { key: 'density-used', label, quantity: absent('g/cm³'), reason: '引擎沒有回傳此項' };
  return { ...row, key: 'density-used', label, reason: [row.reason, DENSITY_ORDER_NOTE].filter((x): x is string => typeof x === 'string' && x !== '').join('；') };
}

/** 成分 Tg 缺值：書的基團加成原因（含 Bondi FFV 相對 Tg 缺什麼）＋可以怎麼補（只在基團缺失、走過備援判斷時） */
function componentTgMissingReason(c: Obj): string {
  const why = typeof c.missingReason === 'string' ? c.missingReason : '算不出';
  return isObj(c.fallback) ? `${why}。${TG_REMEDY}` : why;
}

/** 成分 Tg 有值時的說明：Bondi FFV 相對 Tg 的備援標出方法與書的缺基團原因 */
function componentTgNote(c: Obj, flags: string): { reason?: string } {
  if (c.tgMethod === 'bondiRelativeTg' && isObj(c.relativeTg)) {
    const rt = c.relativeTg;
    const parts = [
      `書的基團加成算不出（${typeof rt.bookReason === 'string' ? rt.bookReason : '缺基團'}），改用 Bondi FFV 相對 Tg（D61，參考趨勢；未做分子量修正）`,
      typeof rt.deltaF === 'number' ? `Δf = ${Number(rt.deltaF.toPrecision(4))}` : '',
      ...strings(rt.warnings),
    ];
    return { reason: parts.filter((x) => x !== '').join('；') };
  }
  return flags ? { reason: `可信度標記${flags}` } : {};
}

/** 混合密度缺值時附上「可以怎麼補」（引擎的 remedy；沒有就用通用說明） */
function withRemedy(why: string | undefined, body: Obj): string | undefined {
  if (why === undefined) return undefined;
  const missing = Array.isArray(body.missing) ? body.missing.filter(isObj) : [];
  const remedies = Array.from(new Set(missing.map((m) => (typeof m.remedy === 'string' ? m.remedy : '')).filter((x) => x !== '')));
  return [why, ...(remedies.length ? remedies : missing.length ? [DENSITY_REMEDY] : [])].join('；');
}

/** 每個成分的密度與實際用的來源（k 表／使用者 k／書 Va／使用者密度／類別預設） */
export function componentDensityRows(body: Obj, keyPrefix = 'density-'): PropertyRow[] {
  const comps = Array.isArray(body.components) ? body.components.filter(isObj) : [];
  const missing = Array.isArray(body.missing) ? body.missing.filter(isObj) : [];
  return comps.map((c, i) => {
    const name = typeof c.name === 'string' ? c.name : `成分 ${i + 1}`;
    const value = typeof c.density === 'number' ? c.density : null;
    const src = typeof c.densitySource === 'string' ? c.densitySource : null;
    const sourceText = src === null ? '—' : DENSITY_SOURCE_TEXT[src] ?? src;
    const label = `成分密度：${name}`;
    if (value === null) {
      const m = missing.find((x) => x.index === i);
      const why = m && typeof m.reason === 'string' ? m.reason : '算不出';
      const remedy = m && typeof m.remedy === 'string' ? m.remedy : DENSITY_REMEDY;
      return { key: `${keyPrefix}${i}`, label, quantity: { value: null, unit: 'g/cm³', source: '—', status: 'missing' }, reason: `${why}；${remedy}` };
    }
    const units = Array.isArray(c.units) ? c.units.filter(isObj) : [];
    const notes = [
      typeof c.detail === 'string' ? c.detail : '',
      typeof c.userDensitySource === 'string' ? `來源：${c.userDensitySource}` : '',
      units.length > 1 ? `共聚物：${units.map((u) => `單元 ${String(u.index)}（x = ${typeof u.molFraction === 'number' ? Number(u.molFraction.toPrecision(4)) : '—'}，${typeof u.source === 'string' ? DENSITY_SOURCE_TEXT[u.source] ?? u.source : '—'}）`).join('、')}，按莫耳分率加權 Σx·M ÷ Σx·Vm` : '',
      ...strings(c.densityNotes),
    ].filter((x) => x !== '');
    return {
      key: `${keyPrefix}${i}`,
      label,
      quantity: { value, unit: 'g/cm³', source: sourceText, status: 'predicted' },
      ...(notes.length ? { reason: notes.join('；') } : {}),
    };
  });
}

function mixingReason(body: Obj): string | undefined {
  return typeof body.message === 'string' ? body.message : describeMissing(body.missing);
}
