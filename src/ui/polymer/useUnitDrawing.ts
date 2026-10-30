// 共聚物單元用 Ketcher 畫的狀態（任務 021）：每個彈窗或頁面最多一個 Ketcher（D28），
// 畫某個單元時借用該處的 Ketcher；Ketcher 裡的未套用內容不得悄悄丟失（任務 021 後續）：
//   借用前，原本的結構畫布有尚未驗證的筆畫 → 先確認；換畫別的單元、取消時，有未套用的修改 → 先確認。
// 狀態轉移的規則在 drawingState.ts（純函式，有測試）。
import { useCallback, useReducer } from 'react';
import { drawReducer, initialDrawState, type DrawPending } from './drawingState';
import type { DrawTarget } from './model';

export type { DrawPending } from './drawingState';

export interface UnitDrawing {
  /** 正在畫的單元；null＝沒有在畫 */
  target: DrawTarget | null;
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  /** 要求畫某個單元；需要時先進入確認 */
  request: (target: DrawTarget) => void;
  pending: DrawPending | null;
  confirmPending: () => void;
  cancelPending: () => void;
  /** 套用完成或放棄後離開 */
  close: () => void;
  /** 使用者按「取消」：有修改要先確認 */
  requestCancel: () => void;
}

/** mainUnverified：原本的結構畫布上有尚未驗證的筆畫（由該處的 Ketcher 回報） */
export function useUnitDrawing(mainUnverified = false): UnitDrawing {
  const [state, dispatch] = useReducer(drawReducer, initialDrawState);
  const request = useCallback((next: DrawTarget) => dispatch({ type: 'request', next, mainUnverified }), [mainUnverified]);
  const setDirty = useCallback((dirty: boolean) => dispatch({ type: 'setDirty', dirty }), []);
  const confirmPending = useCallback(() => dispatch({ type: 'confirm' }), []);
  const cancelPending = useCallback(() => dispatch({ type: 'cancelPending' }), []);
  const close = useCallback(() => dispatch({ type: 'close' }), []);
  const requestCancel = useCallback(() => dispatch({ type: 'requestCancel' }), []);
  return { target: state.target, dirty: state.dirty, setDirty, request, pending: state.pending, confirmPending, cancelPending, close, requestCancel };
}
