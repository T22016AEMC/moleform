// 共聚物單元用 Ketcher 畫的狀態（任務 021）：每個彈窗或頁面最多一個 Ketcher（D28），
// 畫某個單元時借用該處的 Ketcher；切換到別的單元或離開時，有尚未套用的修改要先確認。
import { useCallback, useState } from 'react';
import { sameDrawTarget, type DrawTarget } from './model';

export interface UnitDrawing {
  /** 正在畫的單元；null＝沒有在畫 */
  target: DrawTarget | null;
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  /** 要求畫某個單元；有未套用的修改且換了單元時，先進入確認 */
  request: (target: DrawTarget) => void;
  /** 待確認的動作：換到別的單元，或放棄並離開（'close'） */
  pending: DrawTarget | 'close' | null;
  confirmPending: () => void;
  cancelPending: () => void;
  /** 套用完成或放棄後離開 */
  close: () => void;
  /** 使用者按「取消」：有修改要先確認 */
  requestCancel: () => void;
}

export function useUnitDrawing(): UnitDrawing {
  const [target, setTarget] = useState<DrawTarget | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<DrawTarget | 'close' | null>(null);

  const request = useCallback(
    (next: DrawTarget) => {
      if (target && dirty && !sameDrawTarget(target, next)) {
        setPending(next);
        return;
      }
      setTarget(next);
      setDirty(false);
    },
    [target, dirty],
  );
  const close = useCallback(() => {
    setTarget(null);
    setDirty(false);
    setPending(null);
  }, []);
  const confirmPending = useCallback(() => {
    if (pending === 'close' || pending === null) {
      close();
      return;
    }
    setTarget(pending);
    setDirty(false);
    setPending(null);
  }, [pending, close]);
  const cancelPending = useCallback(() => setPending(null), []);
  const requestCancel = useCallback(() => {
    if (dirty) setPending('close');
    else close();
  }, [dirty, close]);
  return { target, dirty, setDirty, request, pending, confirmPending, cancelPending, close, requestCancel };
}
