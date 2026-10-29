// 3D 匯出（任務 011 F）：全部構象的 SDF。單一構象的 MOL 直接用 ConformerRecord.molfile。
import type { ConformerRecord } from './types';

export const ENERGY_UNIT = 'kcal/mol';

/** 全部構象組成一份 SDF，每筆附構象序號與種子；能量欄位只在有 MMFF94 能量時附上（單位 kcal/mol）。 */
export function conformersToSdf(conformers: ConformerRecord[], seed: number): string {
  return conformers
    .map((c) => {
      const props: [string, string][] = [
        ['Conformer', String(c.rank)],
        ['Seed', String(seed)],
        ['Optimized', c.optimized ? 'MMFF94' : 'no'],
      ];
      if (c.energy !== null && c.relativeEnergy !== null) {
        props.push(['MMFF94_Energy_kcal_per_mol', c.energy.toFixed(4)]);
        props.push(['Relative_Energy_kcal_per_mol', c.relativeEnergy.toFixed(4)]);
      }
      const body = c.molfile.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
      return `${body}\n${props.map(([k, v]) => `>  <${k}>\n${v}\n`).join('\n')}\n$$$$\n`;
    })
    .join('');
}
