// Ketcher 未套用內容不得悄悄丟失（任務 021 後續）：離開分子工具分頁、借用 Ketcher 前的確認規則。
// 沒有未套用的修改時不得多出任何確認。狀態轉移是純函式（drawingState.ts），這裡直接測試。
import { describe, expect, it } from 'vitest';
import {
  cancelTabLeave,
  confirmTabLeave,
  drawReducer,
  initialDrawState,
  requestTab,
  type DrawAction,
  type DrawState,
  type TabState,
} from '../../src/ui/polymer/drawingState';
import { decideDrawRequest, tabLeaveNeedsConfirm } from '../../src/ui/polymer/model';

const run = (actions: DrawAction[], from: DrawState = initialDrawState) => actions.reduce(drawReducer, from);
const edit0 = { kind: 'edit', index: 0 } as const;
const edit1 = { kind: 'edit', index: 1 } as const;
const fresh = { kind: 'new' } as const;

describe('離開「分子工具」分頁', () => {
  const tools: TabState = { tab: 'tools', pendingTab: null };

  it('單元繪圖有未套用的修改 → 要確認；取消後仍在原分頁、修改還在', () => {
    const drawing = run([{ type: 'request', next: edit0, mainUnverified: false }, { type: 'setDirty', dirty: true }]);
    expect(drawing).toEqual({ target: edit0, dirty: true, pending: null });
    expect(tabLeaveNeedsConfirm('tools', 'workbench', drawing)).toBe(true);
    expect(tabLeaveNeedsConfirm('tools', 'library', drawing)).toBe(true);
    const asked = requestTab(tools, 'workbench', drawing);
    expect(asked.tab).toEqual({ tab: 'tools', pendingTab: 'workbench' }); // 先等確認，還沒離開
    expect(asked.drawing).toBe(drawing); // 單元繪圖原封不動
    // 按取消：留在分子工具，單元繪圖與修改都還在
    const cancelled = cancelTabLeave(asked.tab);
    expect(cancelled).toEqual({ tab: 'tools', pendingTab: null });
    expect(drawing.target).toEqual(edit0);
    expect(drawing.dirty).toBe(true);
    // 按「放棄並離開」：切到目標分頁並收掉單元繪圖
    const left = confirmTabLeave(asked.tab);
    expect(left).toEqual({ tab: { tab: 'workbench', pendingTab: null }, drawing: initialDrawState });
  });

  it('沒有未套用的修改 → 不出現確認，直接離開並收掉單元繪圖', () => {
    const open = run([{ type: 'request', next: edit0, mainUnverified: false }]); // 開了但沒有修改
    expect(tabLeaveNeedsConfirm('tools', 'workbench', open)).toBe(false);
    const left = requestTab(tools, 'workbench', open);
    expect(left.tab).toEqual({ tab: 'workbench', pendingTab: null });
    expect(left.drawing).toEqual(initialDrawState);
    // 根本沒有在畫單元：也不問
    expect(requestTab(tools, 'library', initialDrawState).tab).toEqual({ tab: 'library', pendingTab: null });
    // 套用後（已關閉）有過修改也不問
    const applied = run([{ type: 'request', next: edit0, mainUnverified: false }, { type: 'setDirty', dirty: true }, { type: 'close' }]);
    expect(tabLeaveNeedsConfirm('tools', 'workbench', applied)).toBe(false);
  });

  it('不是從分子工具離開、或切到分子工具，不問', () => {
    const dirty = run([{ type: 'request', next: edit0, mainUnverified: false }, { type: 'setDirty', dirty: true }]);
    expect(tabLeaveNeedsConfirm('workbench', 'library', dirty)).toBe(false);
    expect(tabLeaveNeedsConfirm('library', 'tools', dirty)).toBe(false);
    expect(tabLeaveNeedsConfirm('tools', 'tools', dirty)).toBe(false);
  });
});

describe('借用 Ketcher 畫單元之前', () => {
  it('原畫布有尚未驗證的筆畫 → 先確認；確認後才開始畫，取消則什麼都不變', () => {
    const asked = run([{ type: 'request', next: fresh, mainUnverified: true }]);
    expect(asked).toEqual({ target: null, dirty: false, pending: { borrow: fresh } }); // 還沒借用
    expect(decideDrawRequest(initialDrawState, true, fresh)).toBe('confirm-borrow');
    expect(drawReducer(asked, { type: 'cancelPending' })).toEqual(initialDrawState); // 取消：不借用
    expect(drawReducer(asked, { type: 'confirm' })).toEqual({ target: fresh, dirty: false, pending: null });
  });

  it('沒有未驗證的筆畫 → 直接借用，不詢問', () => {
    expect(decideDrawRequest(initialDrawState, false, edit0)).toBe('open');
    expect(run([{ type: 'request', next: edit0, mainUnverified: false }])).toEqual({ target: edit0, dirty: false, pending: null });
  });

  it('已在畫單元時，原畫布的狀態不再影響（已經借用了）', () => {
    const drawing = run([{ type: 'request', next: edit0, mainUnverified: false }]);
    expect(decideDrawRequest(drawing, true, edit1)).toBe('open'); // 沒有修改：直接換單元
  });
});

describe('單元之間切換與取消（任務 021 原有的確認，行為不變）', () => {
  it('有未套用的修改：換畫別的單元要確認；同一個單元不動；沒有修改直接換', () => {
    const dirty = run([{ type: 'request', next: edit0, mainUnverified: false }, { type: 'setDirty', dirty: true }]);
    expect(decideDrawRequest(dirty, false, edit1)).toBe('confirm-switch');
    expect(decideDrawRequest(dirty, false, edit0)).toBe('keep');
    const switched = run([{ type: 'request', next: edit1, mainUnverified: false }], dirty);
    expect(switched.pending).toEqual(edit1);
    expect(drawReducer(switched, { type: 'confirm' })).toEqual({ target: edit1, dirty: false, pending: null });
    expect(drawReducer(switched, { type: 'cancelPending' })).toEqual(dirty);
    const clean = run([{ type: 'request', next: edit0, mainUnverified: false }]);
    expect(decideDrawRequest(clean, false, edit1)).toBe('open');
  });

  it('取消：有修改要先確認，沒有修改直接關閉', () => {
    const clean = run([{ type: 'request', next: edit0, mainUnverified: false }]);
    expect(drawReducer(clean, { type: 'requestCancel' })).toEqual(initialDrawState);
    const dirty = drawReducer(clean, { type: 'setDirty', dirty: true });
    const asked = drawReducer(dirty, { type: 'requestCancel' });
    expect(asked.pending).toBe('close');
    expect(drawReducer(asked, { type: 'confirm' })).toEqual(initialDrawState);
    expect(drawReducer(asked, { type: 'cancelPending' })).toEqual(dirty);
  });
});
