// 本機化合物庫的行為測試（任務 012）：只檢查程式行為，不判斷化學正確性（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import {
  exportLibraryJson,
  exportLibrarySdf,
  importLibraryJson,
  importLibrarySdf,
  type Canonicalize,
  type ValidateMolfile,
} from '../../src/core/library/exchange';
import {
  addCompound,
  dateStamp,
  editNotes,
  findDuplicates,
  removeCompound,
  renameCompound,
  searchCompounds,
  sortCompounds,
  validateName,
} from '../../src/core/library/library';
import { summaryText, type Compound, type Library } from '../../src/core/library/types';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { parseSdf } from '../../src/core/structure/sdf';
import { validateStructure } from '../../src/core/structure/validate';
import { createIndexedDbStorage, createMemoryStorage } from '../../src/ui/library/storage';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

const canonicalize: Canonicalize = async (smiles) => {
  const r = validateStructure(RDKit, smiles);
  return r.valid ? r.canonicalSmiles : null;
};
const validateMolfile: ValidateMolfile = async (molfile) => {
  const r = validateStructure(RDKit, molfile);
  if (r.valid) return { ok: true, canonicalSmiles: r.canonicalSmiles, molfile: r.molblock };
  return { ok: false, reason: r.problems.find((p) => p.level === 'error')?.message ?? '結構無效或是空的' };
};

const T1 = new Date('2026-10-01T00:00:00.000Z');
const T2 = new Date('2026-10-02T00:00:00.000Z');
const T3 = new Date('2026-10-03T00:00:00.000Z');

/** 以 RDKit 的結果建立一筆（與畫面「儲存目前結構」相同的來源） */
function make(library: Library, name: string, smiles: string, id: string, now = T1, notes = ''): Library {
  const v = validateStructure(RDKit, smiles);
  const added = addCompound(library, { name, canonicalSmiles: v.canonicalSmiles, molfile: v.molblock, notes }, now, id);
  if (!added.ok) throw new Error(added.error);
  return added.value.library;
}

describe('新增、改名、備註、刪除', () => {
  it('新增後欄位齊全；只有規定的欄位（D09：沒有分子量等）', () => {
    const lib = make([], '  乙醇  ', 'OCC', 'a', T1, '溶劑');
    expect(lib).toHaveLength(1);
    expect(lib[0]).toEqual({
      id: 'a',
      name: '乙醇',
      canonicalSmiles: 'CCO',
      molfile: expect.stringContaining('M  END'),
      notes: '溶劑',
      createdAt: T1.toISOString(),
      updatedAt: T1.toISOString(),
    });
    expect(Object.keys(lib[0]).sort()).toEqual(['canonicalSmiles', 'createdAt', 'id', 'molfile', 'name', 'notes', 'updatedAt']);
  });

  it('名稱必填、最多 100 字；備註最多 1000 字；沒有結構不能存', () => {
    expect(addCompound([], { name: '  ', canonicalSmiles: 'CCO' }).ok).toBe(false);
    expect(addCompound([], { name: 'x'.repeat(101), canonicalSmiles: 'CCO' }).ok).toBe(false);
    expect(addCompound([], { name: 'x'.repeat(100), canonicalSmiles: 'CCO' }).ok).toBe(true);
    expect(addCompound([], { name: 'a', canonicalSmiles: 'CCO', notes: 'n'.repeat(1001) }).ok).toBe(false);
    expect(addCompound([], { name: 'a', canonicalSmiles: 'CCO', notes: 'n'.repeat(1000) }).ok).toBe(true);
    expect(addCompound([], { name: 'a', canonicalSmiles: '' }).ok).toBe(false);
    expect(validateName('').ok).toBe(false);
  });

  it('改名與改備註更新 updatedAt，不改 createdAt，也不修改傳入的清單', () => {
    const lib = make([], '乙醇', 'CCO', 'a');
    const renamed = renameCompound(lib, 'a', '酒精', T2);
    expect(renamed.ok && renamed.value[0]).toMatchObject({ name: '酒精', updatedAt: T2.toISOString(), createdAt: T1.toISOString() });
    expect(lib[0].name).toBe('乙醇');
    const noted = editNotes(renamed.ok ? renamed.value : [], 'a', '備註一', T3);
    expect(noted.ok && noted.value[0]).toMatchObject({ name: '酒精', notes: '備註一', updatedAt: T3.toISOString() });
    expect(renameCompound(lib, 'a', '').ok).toBe(false);
    expect(renameCompound(lib, 'zzz', 'x').ok).toBe(false);
    expect(editNotes(lib, 'a', 'n'.repeat(1001)).ok).toBe(false);
  });

  it('刪除只移除指定的一筆', () => {
    let lib = make([], '乙醇', 'CCO', 'a');
    lib = make(lib, '丙醇', 'CCCO', 'b');
    const after = removeCompound(lib, 'a');
    expect(after.map((c) => c.id)).toEqual(['b']);
    expect(lib).toHaveLength(2);
    expect(removeCompound(after, 'nope')).toEqual(after);
  });
});

describe('搜尋、排序、重複偵測', () => {
  let lib: Library;
  beforeAll(() => {
    lib = make([], 'Ethanol', 'CCO', 'a', T1);
    lib = make(lib, '雙酚 A', 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1', 'b', T3);
    lib = make(lib, 'Propanol', 'CCCO', 'c', T2);
  });

  it('名稱搜尋不分大小寫、部分符合', () => {
    expect(searchCompounds(lib, 'ETHAN').map((c) => c.id)).toEqual(['a']);
    expect(searchCompounds(lib, '雙酚').map((c) => c.id)).toEqual(['b']);
  });

  it('SMILES 搜尋部分符合；空白搜尋回傳全部；找不到回傳空', () => {
    expect(searchCompounds(lib, 'CCCO').map((c) => c.id)).toEqual(['c']);
    expect(searchCompounds(lib, 'c1ccc').map((c) => c.id)).toEqual(['b']);
    expect(searchCompounds(lib, '  ')).toHaveLength(3);
    expect(searchCompounds(lib, 'xyz')).toEqual([]);
  });

  it('排序：更新時間新到舊；名稱', () => {
    expect(sortCompounds(lib, 'updated').map((c) => c.id)).toEqual(['b', 'c', 'a']);
    // 中英文名稱的先後依瀏覽器語系，這裡只檢查英文名稱之間的順序
    const byName = sortCompounds(lib, 'name').map((c) => c.name);
    expect(byName).toHaveLength(3);
    expect(byName.indexOf('Ethanol')).toBeLessThan(byName.indexOf('Propanol'));
  });

  it('依 canonical SMILES 找重複：不同寫法的同一結構會被找到', () => {
    const same = validateStructure(RDKit, 'OCC').canonicalSmiles;
    expect(findDuplicates(lib, same).map((c) => c.name)).toEqual(['Ethanol']);
    expect(findDuplicates(lib, 'CCCCO')).toEqual([]);
  });
});

describe('JSON 匯出與匯入', () => {
  it('匯出含 schemaVersion；再匯入到空庫後內容完全相同', async () => {
    let lib = make([], '乙醇', 'CCO', 'a', T1, '第一行\n\n第三行');
    lib = make(lib, 'L-丙胺酸', 'C[C@@H](C(=O)O)N', 'b', T2);
    lib = addCompoundOrThrow(lib); // 沒有 Molfile 的一筆
    const text = exportLibraryJson(lib, T3);
    expect(JSON.parse(text).schemaVersion).toBe(1);
    const outcome = await importLibraryJson([], text, canonicalize);
    expect(outcome.ok).toBe(true);
    expect(outcome.library).toEqual(lib);
    expect(outcome.summary).toMatchObject({ added: 3, updated: 0, skipped: 0 });
    expect(summaryText(outcome.summary)).toBe('新增 3 筆、更新 0 筆、略過 0 筆');
  });

  it('合併規則：id 相同且內容相同 → 略過', async () => {
    const lib = make([], '乙醇', 'CCO', 'a');
    const outcome = await importLibraryJson(lib, exportLibraryJson(lib), canonicalize);
    expect(outcome.summary).toMatchObject({ added: 0, updated: 0, skipped: 1, reasons: ['內容相同'] });
    expect(outcome.library).toEqual(lib);
  });

  it('合併規則：id 相同但內容不同 → 匯入的 updatedAt 較新則更新', async () => {
    const local = make([], '乙醇', 'CCO', 'a', T1);
    const incoming = renameCompound(local, 'a', '新名稱', T2);
    const outcome = await importLibraryJson(local, exportLibraryJson(incoming.ok ? incoming.value : []), canonicalize);
    expect(outcome.summary).toMatchObject({ added: 0, updated: 1, skipped: 0 });
    expect(outcome.library[0].name).toBe('新名稱');
  });

  it('合併規則：id 相同但內容不同 → 現有的較新則保留現有並略過', async () => {
    const base = make([], '乙醇', 'CCO', 'a', T1);
    const older = base;
    const newer = renameCompound(base, 'a', '本機較新', T3);
    const outcome = await importLibraryJson(newer.ok ? newer.value : [], exportLibraryJson(renameOld(older)), canonicalize);
    expect(outcome.summary).toMatchObject({ added: 0, updated: 0, skipped: 1 });
    expect(outcome.library[0].name).toBe('本機較新');
  });

  it('合併規則：id 不存在 → 新增，原有的不動', async () => {
    const local = make([], '乙醇', 'CCO', 'a');
    const other = make([], '丙醇', 'CCCO', 'b');
    const outcome = await importLibraryJson(local, exportLibraryJson(other), canonicalize);
    expect(outcome.summary).toMatchObject({ added: 1, updated: 0, skipped: 0 });
    expect(outcome.library.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('無效 SMILES 與欄位錯誤的列被略過並記錄原因，其餘照常匯入', async () => {
    const good = make([], '乙醇', 'CCO', 'a')[0];
    const file = {
      schemaVersion: 1,
      compounds: [
        good,
        { ...good, id: 'bad1', canonicalSmiles: 'C1CC' },
        { ...good, id: 'bad2', canonicalSmiles: 'not a smiles (' },
        { ...good, id: 'bad3', name: '' },
        { ...good, id: 'bad4', updatedAt: 'yesterday' },
        { ...good, id: undefined },
        'garbage',
      ],
    };
    const outcome = await importLibraryJson([], JSON.stringify(file), canonicalize);
    expect(outcome.ok).toBe(true);
    expect(outcome.library.map((c) => c.id)).toEqual(['a']);
    expect(outcome.summary.added).toBe(1);
    expect(outcome.summary.skipped).toBe(6);
    expect(outcome.summary.reasons).toEqual(
      expect.arrayContaining(['SMILES 無法解析 ×2', expect.stringContaining('名稱'), '時間格式錯誤', '缺少 id', '不是化合物資料']),
    );
    expect(summaryText(outcome.summary)).toMatch(/^新增 1 筆、更新 0 筆、略過 6 筆（.+）$/);
  });

  it('不認得的 schemaVersion 被拒絕，清單不變', async () => {
    const lib = make([], '乙醇', 'CCO', 'a');
    for (const version of [2, 0, '1', undefined]) {
      const outcome = await importLibraryJson(lib, JSON.stringify({ schemaVersion: version, compounds: [] }), canonicalize);
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toContain('schemaVersion');
      expect(outcome.library).toBe(lib);
    }
  });

  it('不是 JSON 或格式不對的檔案被拒絕而不拋錯', async () => {
    for (const text of ['not json', '[]', 'null', '{"schemaVersion":1}']) {
      const outcome = await importLibraryJson([], text, canonicalize);
      expect(outcome.ok).toBe(false);
      expect(outcome.library).toEqual([]);
    }
  });
});

describe('SDF 匯出與匯入', () => {
  const entries = (lib: Library) => lib.map((compound) => ({ compound, molfile: compound.molfile }));

  it('匯出：標題列是名稱，另附 MoleForm_Name、MoleForm_Notes；備註中的空行被合併', () => {
    const lib = make([], '乙醇', 'CCO', 'a', T1, '第一行\n\n第三行');
    const records = parseSdf(exportLibrarySdf(entries(lib)));
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe('乙醇');
    expect(records[0].properties.MoleForm_Name).toBe('乙醇');
    expect(records[0].properties.MoleForm_Notes).toBe('第一行\n第三行');
  });

  it('匯出再匯入：名稱與 canonical SMILES 不變，備註保留', async () => {
    let lib = make([], '乙醇', 'CCO', 'a', T1, '溶劑');
    lib = make(lib, 'L-丙胺酸', 'C[C@@H](C(=O)O)N', 'b');
    lib = make(lib, '反式 2-丁烯', 'C/C=C/C', 'c');
    const outcome = await importLibrarySdf([], exportLibrarySdf(entries(lib)), validateMolfile, T2);
    expect(outcome.ok).toBe(true);
    expect(outcome.summary).toMatchObject({ added: 3, skipped: 0 });
    expect(outcome.library.map((c) => [c.name, c.canonicalSmiles])).toEqual(lib.map((c) => [c.name, c.canonicalSmiles]));
    expect(outcome.library[0].notes).toBe('溶劑');
    expect(new Set(outcome.library.map((c) => c.id)).size).toBe(3);
  });

  it('沒有名稱時用標題列或「匯入 N」；無效結構被略過並記錄原因', async () => {
    const mol = (smiles: string, title: string) => {
      const lines = validateStructure(RDKit, smiles).molblock.split('\n');
      lines[0] = title;
      return `${lines.join('\n').replace(/\n*$/, '\n')}$$$$\n`;
    };
    const text = mol('CCO', '') + mol('CCCO', '丙醇') + 'garbage\nM  END\n$$$$\n' + mol('CCCCO', '');
    const outcome = await importLibrarySdf([], text, validateMolfile, T1);
    expect(outcome.ok).toBe(true);
    expect(outcome.library.map((c) => c.name)).toEqual(['匯入 1', '丙醇', '匯入 4']);
    expect(outcome.summary).toMatchObject({ added: 3, skipped: 1 });
    expect(outcome.summary.reasons).toHaveLength(1);
  });

  it('空檔案被拒絕', async () => {
    const lib = make([], '乙醇', 'CCO', 'a');
    expect((await importLibrarySdf(lib, '', validateMolfile)).ok).toBe(false);
  });

  it('重複偵測：名稱與結構都相同 → 略過（列出名稱）', async () => {
    const lib = make([], '乙醇', 'CCO', 'a');
    const outcome = await importLibrarySdf(lib, exportLibrarySdf(entries(lib)), validateMolfile);
    expect(outcome.library).toHaveLength(1);
    expect(outcome.summary).toMatchObject({ added: 0, skipped: 1, reasons: ['名稱與結構都相同：乙醇'] });
    expect(outcome.summary.sameStructureNames ?? []).toEqual([]);
    expect(summaryText(outcome.summary)).toBe('新增 0 筆、更新 0 筆、略過 1 筆（名稱與結構都相同：乙醇）');
  });

  it('重複偵測：結構相同但名稱不同 → 仍新增，摘要列出名稱', async () => {
    const lib = make([], '乙醇', 'CCO', 'a');
    const other = make([], '酒精', 'OCC', 'z');
    const outcome = await importLibrarySdf(lib, exportLibrarySdf(entries(other)), validateMolfile);
    expect(outcome.library.map((c) => c.name)).toEqual(['乙醇', '酒精']);
    expect(outcome.summary).toMatchObject({ added: 1, skipped: 0, sameStructureNames: ['酒精'] });
    expect(summaryText(outcome.summary)).toBe('新增 1 筆、更新 0 筆、略過 0 筆；結構重複但名稱不同 1 筆（酒精）');
  });

  it('重複偵測也涵蓋同一個檔案內先後出現的重複', async () => {
    const a = make([], '乙醇', 'CCO', 'a');
    const b = make([], '酒精', 'OCC', 'b');
    const text = exportLibrarySdf(entries(a)) + exportLibrarySdf(entries(a)) + exportLibrarySdf(entries(b));
    const outcome = await importLibrarySdf([], text, validateMolfile);
    expect(outcome.library.map((c) => c.name)).toEqual(['乙醇', '酒精']);
    expect(outcome.summary).toMatchObject({ added: 2, skipped: 1, sameStructureNames: ['酒精'] });
  });
});

describe('儲存層', () => {
  const compound: Compound = {
    id: 'a', name: '乙醇', canonicalSmiles: 'CCO', molfile: '', notes: '', createdAt: T1.toISOString(), updatedAt: T1.toISOString(),
  };

  it('記憶體版本：存取與上次匯出時間', async () => {
    const storage = createMemoryStorage();
    expect(await storage.loadAll()).toEqual({ ok: true, value: [] });
    expect((await storage.saveAll([compound])).ok).toBe(true);
    expect(await storage.loadAll()).toEqual({ ok: true, value: [compound] });
    expect(await storage.getLastExport()).toEqual({ ok: true, value: null });
    await storage.setLastExport(T2.toISOString());
    expect(await storage.getLastExport()).toEqual({ ok: true, value: T2.toISOString() });
  });

  it('IndexedDB 不存在（Node 環境）時，所有操作回傳失敗而不拋錯', async () => {
    const storage = createIndexedDbStorage();
    for (const result of [
      await storage.loadAll(),
      await storage.saveAll([compound]),
      await storage.getLastExport(),
      await storage.setLastExport('x'),
    ]) {
      expect(result.ok).toBe(false);
    }
  });

  it('IndexedDB 開啟時拋錯或回報錯誤（例如封鎖網站資料）也不會拋出', async () => {
    const throwing = { open: () => { throw new Error('SecurityError'); } } as unknown as IDBFactory;
    const erroring = {
      open: () => {
        const request: { error: Error; onerror?: () => void } = { error: new Error('被封鎖') };
        queueMicrotask(() => request.onerror?.());
        return request;
      },
    } as unknown as IDBFactory;
    for (const factory of [throwing, erroring]) {
      const storage = createIndexedDbStorage(factory);
      expect((await storage.loadAll()).ok).toBe(false);
      expect((await storage.saveAll([compound])).ok).toBe(false);
    }
  });

  it('模擬失敗的記憶體版本回傳失敗而不拋錯', async () => {
    const storage = createMemoryStorage({ failing: true });
    expect((await storage.loadAll()).ok).toBe(false);
    expect((await storage.saveAll([compound])).ok).toBe(false);
  });
});

describe('小工具', () => {
  it('dateStamp 為本機日期 YYYYMMDD', () => {
    expect(dateStamp(new Date(2026, 0, 5))).toBe('20260105');
    expect(dateStamp(new Date(2026, 11, 31))).toBe('20261231');
  });
});

// ---- 測試用輔助 ----

function addCompoundOrThrow(lib: Library): Library {
  const added = addCompound(lib, { name: '無圖面', canonicalSmiles: 'CCCO' }, T3, 'c');
  if (!added.ok) throw new Error(added.error);
  return added.value.library;
}

function renameOld(lib: Library): Library {
  const renamed = renameCompound(lib, 'a', '較舊的版本', T2);
  if (!renamed.ok) throw new Error(renamed.error);
  return renamed.value;
}
