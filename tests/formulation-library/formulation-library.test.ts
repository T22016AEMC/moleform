// 「我的配方」的行為測試（任務 014）：儲存、合併、匯出匯入來回不變（記憶體版儲存層）。只檢查程式行為（D17）。
import { describe, expect, it } from 'vitest';
import {
  exportFormulationsJson,
  importFormulationsJson,
  removeFormulation,
  renameFormulation,
  saveFormulation,
  saveFormulationAs,
  searchFormulations,
  type FormulationLibrary,
  type SavedFormulation,
} from '../../src/core/formulation/library';
import type { Formulation } from '../../src/core/formulation/types';
import { summaryText } from '../../src/core/library/types';
import { createFormulationIndexedDbStorage, createFormulationMemoryStorage } from '../../src/ui/formulation/storage';
import { emptyState, fromFormulation, pendingAmountIds, toFormulation, visibleIssues } from '../../src/ui/formulation/model';

const T1 = new Date('2026-10-01T00:00:00.000Z');
const T2 = new Date('2026-10-02T00:00:00.000Z');
const T3 = new Date('2026-10-03T00:00:00.000Z');

function sample(name: string, amount = 100): Formulation {
  return {
    schemaVersion: 1,
    name,
    solid: {
      unit: 'phr',
      components: [
        { id: 'a', name: 'BADGE', canonicalSmiles: 'C1OC1', category: 'Resin', amount, isResin: true, molfile: '\n  M\n\nM  END\n', compoundId: 'lib-1' },
        { id: 'b', name: '三苯基膦', canonicalSmiles: 'P', category: 'Catalyst/Initiator', amount: 1, isResin: false, volatileFlag: true },
      ],
    },
    liquid: { unit: 'g', components: [{ id: 's', name: 'MEK', canonicalSmiles: 'CCC(C)=O', category: 'Solvent', amount: 40 }] },
    solidTotalG: 100,
    targetSolidContentPct: 60,
  };
}

function save(lib: FormulationLibrary, f: Formulation, now = T1, id?: string): { lib: FormulationLibrary; saved: SavedFormulation } {
  const r = saveFormulation(lib, f, id, now);
  if (!r.ok) throw new Error(r.error);
  return { lib: r.value.library, saved: r.value.saved };
}

describe('儲存、另存、改名、刪除、搜尋', () => {
  it('儲存新增一筆；帶 id 再儲存是覆蓋，保留建立時間、更新 updatedAt', () => {
    const first = save([], sample('配方一'), T1);
    expect(first.lib).toHaveLength(1);
    expect(first.saved).toMatchObject({ name: '配方一', createdAt: T1.toISOString(), updatedAt: T1.toISOString() });
    const second = save(first.lib, sample('配方一（改）', 80), T2, first.saved.id);
    expect(second.lib).toHaveLength(1);
    expect(second.saved).toMatchObject({ id: first.saved.id, name: '配方一（改）', createdAt: T1.toISOString(), updatedAt: T2.toISOString() });
    expect(second.saved.formulation.solid.components[0].amount).toBe(80);
  });

  it('另存一律新增一筆，原本的不變', () => {
    const first = save([], sample('配方一'), T1);
    const copy = saveFormulationAs(first.lib, sample('配方一副本'), T2);
    expect(copy.ok && copy.value.library).toHaveLength(2);
    expect(copy.ok && copy.value.saved.id).not.toBe(first.saved.id);
    expect(first.lib[0].name).toBe('配方一');
  });

  it('名稱必填、最多 100 字', () => {
    expect(saveFormulation([], sample('  ')).ok).toBe(false);
    expect(saveFormulation([], sample('x'.repeat(101))).ok).toBe(false);
    expect(saveFormulation([], sample('x'.repeat(100))).ok).toBe(true);
  });

  it('改名同步更新配方內的名稱；刪除與搜尋', () => {
    let lib = save([], sample('Epoxy A'), T1).lib;
    lib = save(lib, sample('酚醛 B'), T2).lib;
    const id = lib[0].id;
    const renamed = renameFormulation(lib, id, 'Epoxy Z', T3);
    expect(renamed.ok && renamed.value[0]).toMatchObject({ name: 'Epoxy Z', updatedAt: T3.toISOString() });
    expect(renamed.ok && renamed.value[0].formulation.name).toBe('Epoxy Z');
    expect(renameFormulation(lib, id, '').ok).toBe(false);
    expect(renameFormulation(lib, 'nope', 'x').ok).toBe(false);
    expect(searchFormulations(lib, 'epoxy')).toHaveLength(1);
    expect(searchFormulations(lib, '')).toHaveLength(2);
    expect(removeFormulation(lib, id).map((f) => f.name)).toEqual(['酚醛 B']);
  });
});

describe('JSON 匯出與匯入', () => {
  it('匯出含 schemaVersion；匯入到空庫後內容完全相同（含 Molfile、compoundId、揮發標記、總重、目標）', () => {
    let lib = save([], sample('配方一'), T1).lib;
    lib = save(lib, sample('配方二', 90), T2).lib;
    const text = exportFormulationsJson(lib, undefined, T3);
    expect(JSON.parse(text).schemaVersion).toBe(1);
    const outcome = importFormulationsJson([], text);
    expect(outcome.ok).toBe(true);
    expect(outcome.library).toEqual(lib);
    expect(summaryText(outcome.summary)).toBe('新增 2 筆、更新 0 筆、略過 0 筆');
  });

  it('匯出單一配方只含那一筆', () => {
    const lib = save(save([], sample('一'), T1).lib, sample('二'), T2).lib;
    const file = JSON.parse(exportFormulationsJson(lib, [lib[1].id]));
    expect(file.formulations).toHaveLength(1);
    expect(file.formulations[0].name).toBe('二');
  });

  it('尚未輸入的數值（NaN）來回後仍是 NaN', () => {
    const f = sample('空白');
    f.solid.components[0].amount = Number.NaN;
    const lib = save([], f).lib;
    const back = importFormulationsJson([], exportFormulationsJson(lib));
    expect(Number.isNaN(back.library[0].formulation.solid.components[0].amount)).toBe(true);
  });

  it('合併規則：內容相同 → 略過', () => {
    const lib = save([], sample('一'), T1).lib;
    const outcome = importFormulationsJson(lib, exportFormulationsJson(lib));
    expect(outcome.summary).toMatchObject({ added: 0, updated: 0, skipped: 1, reasons: ['內容相同'] });
  });

  it('合併規則：內容不同，匯入的較新 → 更新；現有的較新 → 略過', () => {
    const base = save([], sample('一'), T1);
    const newer = save(base.lib, sample('一（新）', 70), T2, base.saved.id).lib;
    const toNewer = importFormulationsJson(base.lib, exportFormulationsJson(newer));
    expect(toNewer.summary).toMatchObject({ added: 0, updated: 1, skipped: 0 });
    expect(toNewer.library[0].name).toBe('一（新）');
    const toOlder = importFormulationsJson(newer, exportFormulationsJson(base.lib));
    expect(toOlder.summary).toMatchObject({ added: 0, updated: 0, skipped: 1 });
    expect(toOlder.library[0].name).toBe('一（新）');
  });

  it('合併規則：id 不存在 → 新增，原有的不動', () => {
    const local = save([], sample('本機'), T1).lib;
    const other = save([], sample('別人的'), T2).lib;
    const outcome = importFormulationsJson(local, exportFormulationsJson(other));
    expect(outcome.summary).toMatchObject({ added: 1, updated: 0, skipped: 0 });
    expect(outcome.library.map((f) => f.name)).toEqual(['本機', '別人的']);
  });

  it('壞的列被略過並記錄原因，其餘照常匯入', () => {
    const good = save([], sample('好的'), T1).lib[0];
    const file = {
      schemaVersion: 1,
      formulations: [
        good,
        { ...good, id: 'x1', name: '' },
        { ...good, id: 'x2', updatedAt: 'yesterday' },
        { ...good, id: 'x3', formulation: { schemaVersion: 2 } },
        { ...good, id: undefined },
        'garbage',
      ],
    };
    const outcome = importFormulationsJson([], JSON.stringify(file));
    expect(outcome.ok).toBe(true);
    expect(outcome.library.map((f) => f.name)).toEqual(['好的']);
    expect(outcome.summary).toMatchObject({ added: 1, skipped: 5 });
    expect(outcome.summary.reasons.length).toBe(5);
  });

  it('不認得的 schemaVersion、非 JSON、格式不對 → 拒絕，清單不變', () => {
    const lib = save([], sample('一')).lib;
    for (const text of [JSON.stringify({ schemaVersion: 2, formulations: [] }), JSON.stringify({ formulations: [] }), 'not json', '[]', '{"schemaVersion":1}']) {
      const outcome = importFormulationsJson(lib, text);
      expect(outcome.ok).toBe(false);
      expect(outcome.library).toBe(lib);
    }
  });
});

describe('儲存層（記憶體版與失敗情況）', () => {
  it('存取與上次備份時間；存入的是複本', async () => {
    const storage = createFormulationMemoryStorage();
    const lib = save([], sample('一')).lib;
    expect((await storage.saveAll(lib)).ok).toBe(true);
    const loaded = await storage.loadAll();
    expect(loaded).toEqual({ ok: true, value: lib });
    expect(await storage.getLastExport()).toEqual({ ok: true, value: null });
    await storage.setLastExport(T2.toISOString());
    expect(await storage.getLastExport()).toEqual({ ok: true, value: T2.toISOString() });
  });

  it('失敗時不拋錯：模擬失敗、IndexedDB 不存在、開啟時拋錯', async () => {
    const lib = save([], sample('一')).lib;
    const throwing = { open: () => { throw new Error('SecurityError'); } } as unknown as IDBFactory;
    for (const storage of [createFormulationMemoryStorage({ failing: true }), createFormulationIndexedDbStorage(), createFormulationIndexedDbStorage(throwing)]) {
      expect((await storage.loadAll()).ok).toBe(false);
      expect((await storage.saveAll(lib)).ok).toBe(false);
      expect((await storage.getLastExport()).ok).toBe(false);
      expect((await storage.setLastExport('x')).ok).toBe(false);
    }
  });
});

describe('畫面的編輯狀態與配方互轉', () => {
  it('配方 → 編輯狀態 → 配方，內容不變', () => {
    const f = sample('一');
    // 舊配方有目標固含量但沒有 liquidFromTarget：畫面進入自動計算模式，存檔時寫入旗標
    expect(toFormulation(fromFormulation(f))).toEqual({ ...f, liquidFromTarget: true });
    const { targetSolidContentPct: _t, ...noTarget } = f;
    expect(toFormulation(fromFormulation(noTarget))).toEqual(noTarget);
  });

  it('空白或無法解析的文字變成 NaN／沒有填；選填欄位空白時不出現', () => {
    const state = emptyState();
    state.solidRows = [{ id: 'a', name: 'A', canonicalSmiles: 'C', category: 'Resin', amountText: ' ' }];
    state.liquidTotalText = 'abc';
    const f = toFormulation(state);
    expect(Number.isNaN(f.solid.components[0].amount)).toBe(true);
    expect(f.solidTotalG).toBeUndefined();
    expect(Number.isNaN(f.liquidTotalG as number)).toBe(true);
  });
});

describe('尚未填用量的成分（使用者 2026-10-29 決定）', () => {
  const row = (id: string, amountText: string, amountTouched?: boolean) => ({
    id, name: id, canonicalSmiles: 'CCO', category: 'Small Molecule', amountText, ...(amountTouched === undefined ? {} : { amountTouched }),
  });

  it('空白且沒輸入過、沒離開過欄位的成分算「尚未填用量」；輸入過、離開過或有值就不算', () => {
    const pending = pendingAmountIds([row('a', ''), row('b', '  '), row('c', '', true), row('d', '5'), row('e', '', false)]);
    expect([...pending].sort()).toEqual(['a', 'b', 'e']);
  });

  it('只濾掉尚未填用量成分的「數值無效」錯誤，其他錯誤與其他成分照常顯示', () => {
    const issues = [
      { code: 'INVALID_AMOUNT', componentId: 'a' },
      { code: 'INVALID_AMOUNT', componentId: 'c' },
      { code: 'SUM_NOT_100' },
      { code: 'MISSING_MW', componentId: 'a' },
    ];
    const shown = visibleIssues(issues, new Set(['a']));
    expect(shown).toEqual([{ code: 'INVALID_AMOUNT', componentId: 'c' }, { code: 'SUM_NOT_100' }, { code: 'MISSING_MW', componentId: 'a' }]);
  });

  it('畫面專用的 amountTouched 不會進入配方；離開欄位（touched）後空白就算無效數值', () => {
    const state = emptyState();
    state.solidRows = [row('a', '', true)];
    const f = toFormulation(state);
    expect(JSON.stringify(f)).not.toContain('amountTouched');
    expect(Number.isNaN(f.solid.components[0].amount)).toBe(true);
  });
});
