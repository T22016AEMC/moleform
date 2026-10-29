// 反應原子標記（任務 016，4.4）：用 RDKit 畫 2D 結構圖（SVG），反應原子以強調色標出並加上編號。
// 編號從 1 起算（= RDKit 原子索引 + 1），與「分子工具」分頁 3D 畫面的原子編號一致。
import { ELEMENTS } from '../polymer/repeatUnit';
import type { CommonChemJson, RDKitModule } from '../rdkit/types';
import { findGroupSites, parseStructure } from './groups';
import type { FunctionalGroupRow, ReactionRuleRow } from '../data/types';

export const DEFAULT_MARK_COLOR = '#155d70'; // theme.css 的 --color-accent
const MARK_ALPHA = 0.35;

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const value = m ? m[1] : DEFAULT_MARK_COLOR.slice(1);
  return [0, 2, 4].map((k) => parseInt(value.slice(k, k + 2), 16) / 255).concat(alpha) as [number, number, number, number];
}

export interface DrawOptions {
  /** 強調色（#rrggbb），來自 theme.css */
  color?: string;
  width?: number;
  height?: number;
}

/** 畫出結構並標記指定的原子（0 起算）；回傳 SVG 文字，結構無法解析時回傳 null */
export function drawMarkedStructure(RDKit: RDKitModule, source: string, marked: readonly number[], options: DrawOptions = {}): string | null {
  const mol = parseStructure(RDKit, source);
  if (!mol) return null;
  try {
    const json = JSON.parse(mol.get_json()) as CommonChemJson;
    const { atoms, bonds } = json.molecules[0];
    const set = new Set(marked);
    const atomLabels: Record<string, string> = {};
    for (const index of marked) {
      const z = atoms[index]?.z ?? 6;
      atomLabels[String(index)] = `${ELEMENTS[z] ?? '*'}${index + 1}`;
    }
    const markedBonds = bonds.map((b, i) => (set.has(b.atoms[0]) && set.has(b.atoms[1]) ? i : -1)).filter((i) => i >= 0);
    const colour = hexToRgba(options.color ?? DEFAULT_MARK_COLOR, MARK_ALPHA);
    return mol.get_svg_with_highlights(
      JSON.stringify({
        width: options.width ?? 360,
        height: options.height ?? 260,
        atoms: [...marked],
        bonds: markedBonds,
        highlightColour: colour,
        atomLabels,
        noFreetype: true,
      }),
    );
  } finally {
    mol.delete();
  }
}

/**
 * 結構上所有「已登錄在反應規則裡的官能基」的反應原子（0 起算，排序去重）。
 * 用於「分子工具」分頁的 3D 標記：與配方無關，只看這個結構本身有沒有可反應的官能基。
 */
export function reactiveAtomsOf(
  RDKit: RDKitModule,
  source: string,
  groups: readonly FunctionalGroupRow[],
  rules: readonly ReactionRuleRow[],
  /** 聚合物的重複單元要排除連接點（任務 018 的成分詳細彈窗）；預設 false，3D 的用法不變 */
  excludeAttachments = false,
): number[] {
  const inRules = new Set(rules.flatMap((r) => [r.group_a, r.group_b]).filter((id) => id !== ''));
  const mol = parseStructure(RDKit, source);
  if (!mol) return [];
  try {
    const found = findGroupSites(
      RDKit,
      mol,
      groups.filter((g) => inRules.has(g.id)),
      excludeAttachments, // 3D 只用於小分子（D05），預設不需排除連接點
    );
    return [...new Set(found.flatMap((g) => g.sites.flat()))].sort((a, b) => a - b);
  } finally {
    mol.delete();
  }
}
