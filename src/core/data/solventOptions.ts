// 溶劑資料表（solvents.csv，D72）→ 「從溶劑資料表選取」的選項（任務 P8-1，PLAN 8.2）。
// 只做資料搬運：每個溶劑一個選項，密度取最接近 25 °C 的一列（與引擎 solvents.py 的 pick 規則相同）；不計算任何物性。
import type { SolventRow } from './types';

export const REFERENCE_TEMPERATURE_C = 25;

export interface SolventDensity {
  /** g/cm³ */
  value: number;
  /** 密度對應的溫度（°C）；資料表沒有標溫度時為 null */
  temperatureC: number | null;
  source: string;
}

export interface SolventOption {
  id: string;
  nameEn: string;
  nameZh: string;
  smiles: string;
  /** 資料表沒有密度（空欄）時為 null */
  density: SolventDensity | null;
}

/** 距離 25 °C 最近的一列；沒有溫度的列視為距離 0；距離相同取較低溫度（與引擎一致） */
export function pickNearest<T extends { temperature_c: number | null }>(rows: readonly T[], target = REFERENCE_TEMPERATURE_C): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const row of rows) {
    const distance = row.temperature_c === null ? 0 : Math.abs(row.temperature_c - target);
    if (best === null || distance < bestDistance || (distance === bestDistance && (row.temperature_c ?? 0) < (best.temperature_c ?? 0))) {
      best = row;
      bestDistance = distance;
    }
  }
  return best;
}

export function solventOptions(rows: readonly SolventRow[]): SolventOption[] {
  const byId = new Map<string, SolventRow[]>();
  for (const row of rows) {
    const list = byId.get(row.solvent_id);
    if (list) list.push(row);
    else byId.set(row.solvent_id, [row]);
  }
  const options: SolventOption[] = [];
  for (const [id, list] of byId) {
    const first = list[0];
    const density = pickNearest(list.filter((r) => r.property === 'density' && r.value !== null));
    options.push({
      id,
      nameEn: first.name_en,
      nameZh: first.name_zh,
      smiles: first.smiles,
      density: density && density.value !== null ? { value: density.value, temperatureC: density.temperature_c, source: density.source } : null,
    });
  }
  return options;
}

/** 帶入成分的「密度來源」文字：溫度與出處（使用者可在欄位內改） */
export function densitySourceText(option: SolventOption): string {
  if (!option.density) return '';
  const temperature = option.density.temperatureC === null ? '' : `${option.density.temperatureC} °C；`;
  return `溶劑資料表（${temperature}${option.density.source}）`;
}
