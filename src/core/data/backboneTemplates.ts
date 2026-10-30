// 骨架範本資料表 src/data/backbone_templates.csv（任務 023，D51）。
// 欄位：id、名稱、單元 SMILES、端基 1 SMILES、端基 1 對應端基 id、端基 2 SMILES、端基 2 對應端基 id、每條鏈的反應官能基（說明）、出處。
// 格式檢查：標題列、必填（含出處）、id 唯一、單元恰好 [*:1] 與 [*:2]、端基恰好一個 `*`、對應端基 id 須存在且 SMILES 相同（RDKit 另檢查可解析）。
// 只確認格式，不判斷化學（D17）。
import backboneCsv from '../../data/backbone_templates.csv?raw';
import type { RDKitModule } from '../rdkit/types';
import { CsvError, parseCsv } from './csv';
import { END_GROUP_PRESETS } from './endGroups';
import type { DataIssue, TableResult } from './types';

export const BACKBONE_TEMPLATES_FILE = 'backbone_templates.csv';
export const BACKBONE_TEMPLATES_COLUMNS = [
  'id',
  '名稱',
  '單元 SMILES',
  '端基 1 SMILES',
  '端基 1 對應端基 id',
  '端基 2 SMILES',
  '端基 2 對應端基 id',
  '每條鏈的反應官能基（說明）',
  '出處',
] as const;

export interface BackboneTemplateRow {
  id: string;
  name: string;
  unitSmiles: string;
  end1Smiles: string;
  /** 對應 end_groups.csv 的 id；空字串＝以自訂 SMILES 填入 */
  end1PresetId: string;
  end2Smiles: string;
  end2PresetId: string;
  groupsNote: string;
  source: string;
}

/** 讀取骨架範本表；格式錯誤回報在 issues */
export function readBackboneTemplates(text: string): TableResult<BackboneTemplateRow> {
  const issues: DataIssue[] = [];
  const fail = (row: number | null, column: string | null, message: string) => issues.push({ file: BACKBONE_TEMPLATES_FILE, row, column, message });
  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (e) {
    fail(null, null, `CSV 格式錯誤：${e instanceof CsvError ? e.message : String(e)}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const header = records[0];
  const columns = BACKBONE_TEMPLATES_COLUMNS;
  if (!header) {
    fail(1, null, `檔案是空的，缺少標題列（應為：${columns.join(',')}）`);
    return { rows: [], rowNumbers: [], issues };
  }
  if (header.length !== columns.length || header.some((h, i) => h !== columns[i])) {
    fail(1, null, `標題列與定義不一致。應為：${columns.join(',')}；實際為：${header.join(',')}`);
    return { rows: [], rowNumbers: [], issues };
  }
  const rows: BackboneTemplateRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    if (rec.length !== columns.length) {
      fail(r + 1, null, `欄位數應為 ${columns.length}，實際為 ${rec.length}`);
      continue;
    }
    const [id, name, unitSmiles, end1Smiles, end1PresetId, end2Smiles, end2PresetId, groupsNote, source] = rec.map((s) => s.trim());
    rows.push({ id, name, unitSmiles, end1Smiles, end1PresetId, end2Smiles, end2PresetId, groupsNote, source });
    rowNumbers.push(r + 1);
  }
  return { rows, rowNumbers, issues };
}

/** 不需 RDKit 的格式檢查 */
export function validateBackboneTemplates(table: TableResult<BackboneTemplateRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (row: number, column: string, message: string) => issues.push({ file: BACKBONE_TEMPLATES_FILE, row, column, message });
  const seen = new Map<string, number>();
  const count = (s: string, sub: string) => s.split(sub).length - 1;
  table.rows.forEach((r, i) => {
    const no = table.rowNumbers[i];
    if (r.id === '') add(no, 'id', '必填欄位是空的');
    else if (seen.has(r.id)) add(no, 'id', `重複：「${r.id}」已出現在第 ${seen.get(r.id)} 列`);
    else seen.set(r.id, no);
    if (r.name === '') add(no, '名稱', '必填欄位是空的');
    if (r.source === '') add(no, '出處', '必填欄位是空的（缺出處）');
    if (r.groupsNote === '') add(no, '每條鏈的反應官能基（說明）', '必填欄位是空的');
    if (r.unitSmiles === '') add(no, '單元 SMILES', '必填欄位是空的');
    else {
      const stars = count(r.unitSmiles, '*');
      if (stars !== 2 || count(r.unitSmiles, '[*:1]') !== 1 || count(r.unitSmiles, '[*:2]') !== 1) {
        add(no, '單元 SMILES', `單元需要恰好 [*:1] 與 [*:2] 各一個，目前 * 有 ${stars} 個`);
      }
    }
    for (const [which, smiles, presetId] of [[1, r.end1Smiles, r.end1PresetId], [2, r.end2Smiles, r.end2PresetId]] as const) {
      const col = `端基 ${which} SMILES`;
      if (smiles === '') add(no, col, '必填欄位是空的');
      else {
        const stars = count(smiles, '*');
        if (stars !== 1) add(no, col, `端基的 SMILES 需要恰好一個 *，目前有 ${stars} 個`);
      }
      if (presetId !== '') {
        const preset = END_GROUP_PRESETS.find((p) => p.id === presetId);
        if (!preset) add(no, `端基 ${which} 對應端基 id`, `找不到端基 id「${presetId}」`);
        else if (preset.smiles !== smiles) add(no, `端基 ${which} 對應端基 id`, `與 ${presetId} 的 SMILES（${preset.smiles}）不同`);
      }
    }
  });
  return issues;
}

/** RDKit 檢查：三個 SMILES 皆可解析，連接點數量正確 */
export function checkBackboneTemplateSmiles(RDKit: RDKitModule, table: TableResult<BackboneTemplateRow>): DataIssue[] {
  const issues: DataIssue[] = [];
  const dummies = (smiles: string): number | null => {
    let mol;
    try {
      mol = RDKit.get_mol(smiles);
    } catch {
      mol = null;
    }
    if (!mol || !mol.is_valid()) {
      mol?.delete();
      return null;
    }
    try {
      const atoms = (JSON.parse(mol.get_json()) as { molecules: { atoms: { z?: number }[] }[] }).molecules[0].atoms;
      return atoms.filter((a) => a.z === 0).length;
    } finally {
      mol.delete();
    }
  };
  table.rows.forEach((r, i) => {
    const no = table.rowNumbers[i];
    for (const [column, smiles, expected] of [
      ['單元 SMILES', r.unitSmiles, 2],
      ['端基 1 SMILES', r.end1Smiles, 1],
      ['端基 2 SMILES', r.end2Smiles, 1],
    ] as const) {
      if (smiles === '') continue;
      const n = dummies(smiles);
      if (n === null) issues.push({ file: BACKBONE_TEMPLATES_FILE, row: no, column, message: 'RDKit 無法解析這個 SMILES' });
      else if (n !== expected) issues.push({ file: BACKBONE_TEMPLATES_FILE, row: no, column, message: `RDKit 讀到 ${n} 個連接點，應為 ${expected} 個` });
    }
  });
  return issues;
}

/** 隨網站打包的骨架範本表（依資料表順序） */
export const bundledBackboneTemplatesText: string = backboneCsv;
export const BACKBONE_TEMPLATES: readonly BackboneTemplateRow[] = readBackboneTemplates(backboneCsv).rows;
