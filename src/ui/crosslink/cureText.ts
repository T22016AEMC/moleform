// 「固化預測」卡片的硬化溫度欄位文字（任務 P7-3 追加）：硬化溫度沒有預設值，欄位空白時最大轉化率顯示提示，其餘項目照常顯示。
// 獨立成檔，讓測試不必載入 React 元件。

/** 硬化溫度欄位的初始文字：空白（沒有預設值） */
export const DEFAULT_CURE_TEMP_TEXT = '';

/** 欄位空白時，最大轉化率位置顯示的提示 */
export const CURE_TEMP_REQUIRED_TEXT = '請輸入硬化溫度';

/** 欄位旁的說明 */
export const CURE_TEMP_HINT = '沒有預設值；輸入硬化溫度後才會計算最大轉化率，其餘項目不受影響。';
