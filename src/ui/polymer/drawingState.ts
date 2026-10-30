// 共聚物單元繪圖的狀態轉移（純函式，任務 021 後續）：Ketcher 裡的未套用內容不得悄悄丟失。
// useUnitDrawing 只是把這裡的 reducer 接上 React；分頁切換的確認流程也在這裡，方便測試。
import { decideDrawRequest, tabLeaveNeedsConfirm, type DrawTarget } from './model';

/** 待確認的動作：換到別的單元（DrawTarget）、放棄並離開（'close'）、或借用 Ketcher（borrow） */
export type DrawPending = DrawTarget | 'close' | { borrow: DrawTarget };

export interface DrawState {
  /** 正在畫的單元；null＝沒有在畫 */
  target: DrawTarget | null;
  /** 正在畫的單元在 Ketcher 裡有尚未套用的修改 */
  dirty: boolean;
  pending: DrawPending | null;
}

export const initialDrawState: DrawState = { target: null, dirty: false, pending: null };

export type DrawAction =
  | { type: 'request'; next: DrawTarget; mainUnverified: boolean }
  | { type: 'setDirty'; dirty: boolean }
  | { type: 'confirm' }
  | { type: 'cancelPending' }
  | { type: 'close' }
  | { type: 'requestCancel' };

const isBorrow = (p: DrawPending | null): p is { borrow: DrawTarget } => p !== null && typeof p === 'object' && 'borrow' in p;

export function drawReducer(state: DrawState, action: DrawAction): DrawState {
  switch (action.type) {
    case 'request': {
      const decision = decideDrawRequest(state, action.mainUnverified, action.next);
      if (decision === 'confirm-borrow') return { ...state, pending: { borrow: action.next } };
      if (decision === 'confirm-switch') return { ...state, pending: action.next };
      if (decision === 'open') return { target: action.next, dirty: false, pending: null };
      return state;
    }
    case 'setDirty':
      return state.dirty === action.dirty ? state : { ...state, dirty: action.dirty };
    case 'confirm': {
      const p = state.pending;
      if (p === null || p === 'close') return initialDrawState;
      return { target: isBorrow(p) ? p.borrow : p, dirty: false, pending: null };
    }
    case 'cancelPending':
      return state.pending === null ? state : { ...state, pending: null };
    case 'close':
      return initialDrawState;
    case 'requestCancel':
      return state.dirty ? { ...state, pending: 'close' } : initialDrawState;
  }
}

/** 分頁切換：離開分子工具時單元繪圖有未套用的修改 → 先等確認（停在原分頁、單元繪圖原封不動）；否則直接切換並收掉單元繪圖 */
export interface TabState {
  tab: string;
  /** 等待確認的目標分頁 */
  pendingTab: string | null;
}

export function requestTab(state: TabState, next: string, drawing: DrawState): { tab: TabState; drawing: DrawState } {
  if (tabLeaveNeedsConfirm(state.tab, next, drawing)) return { tab: { ...state, pendingTab: next }, drawing };
  // 沒有未套用的修改：直接切換；離開分子工具時收掉單元繪圖、釋放 Ketcher（不詢問）
  return { tab: { tab: next, pendingTab: null }, drawing: next !== 'tools' ? initialDrawState : drawing };
}

export function confirmTabLeave(state: TabState): { tab: TabState; drawing: DrawState } | null {
  return state.pendingTab === null ? null : { tab: { tab: state.pendingTab, pendingTab: null }, drawing: initialDrawState };
}

export function cancelTabLeave(state: TabState): TabState {
  return { ...state, pendingTab: null };
}
