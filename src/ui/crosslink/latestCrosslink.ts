// 最近一次交聯第 0 層結果（P7-1B 修正 2）：交聯頁（配方工作台右欄，各分頁都保持掛載）每次由引擎算出結果就放在這裡，
// 「分子工具」與成分詳細彈窗的反應原子標記讀它，只標目前配方中確實配到對的官能基。這裡不計算，也不自行判斷哪些官能基會反應。
import { useMemo, useSyncExternalStore } from 'react';
import { pairedGroupIds } from '../../core/crosslink/pairedGroups';
import type { CrosslinkResult } from '../../core/crosslink/types';

let latest: CrosslinkResult | null = null;
const listeners = new Set<() => void>();

/** 交聯頁取得新結果（配方清空或分析失敗時傳 null：沒有配對，就沒有要標的官能基） */
export function setLatestCrosslinkResult(result: CrosslinkResult | null): void {
  if (result === latest) return;
  latest = result;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 目前配方中配到對的官能基 id（componentId：只取該成分用到的）；結果沒變時回傳同一個陣列 */
export function usePairedGroups(componentId?: string): readonly string[] {
  const result = useSyncExternalStore(subscribe, () => latest);
  return useMemo(() => pairedGroupIds(result, componentId), [result, componentId]);
}
