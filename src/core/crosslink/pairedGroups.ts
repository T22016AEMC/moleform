// 目前配方中「確實配到對」的官能基（P7-1B 修正 2）：取自引擎第 0 層結果的反應配對，不自行判斷哪些官能基會反應。
// 「分子工具」與成分詳細彈窗的反應原子標記只標這些官能基；結構上有登錄的官能基但配方裡沒有配對的（例如雙酚 A 在環氧配方中的酚環空位）不標。
import type { CrosslinkResult } from './types';

/**
 * 反應配對中出現的官能基 id（排序去重）。給 componentId 時只取該成分在配對中用到的官能基；
 * 沒給時取整個配方（分子工具的結構不一定是配方成分，只要配方裡有它的官能基與配對對象就算）。
 */
export function pairedGroupIds(result: Pick<CrosslinkResult, 'pairs'> | null | undefined, componentId?: string): string[] {
  const ids = new Set<string>();
  for (const p of result?.pairs ?? []) {
    for (const end of [p.a, p.b]) {
      if (!end) continue;
      if (componentId === undefined || end.componentId === componentId) ids.add(end.groupId);
    }
  }
  return [...ids].sort();
}
