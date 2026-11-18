// 「固化預測」卡片的硬化溫度欄位文字（任務 P7-3 追加）：硬化溫度沒有預設值，欄位空白時最大轉化率顯示提示，其餘項目照常顯示。
// 獨立成檔，讓測試不必載入 React 元件。

/** 硬化溫度欄位的初始文字：空白（沒有預設值） */
export const DEFAULT_CURE_TEMP_TEXT = '';

/** 欄位空白時，最大轉化率位置顯示的提示 */
export const CURE_TEMP_REQUIRED_TEXT = '請輸入硬化溫度';

/** 反應溫度範圍區（P7-4，7.2）：只顯示規則表的文獻值，不計算 */
export const TEMP_SECTION_TITLE = '反應溫度範圍';
export const TEMP_NO_RANGE_TEXT = '無文獻範圍';

/** 固化收縮區（P7-4，7.6） */
export const SHRINKAGE_SECTION_TITLE = '固化收縮';
export const SHRINKAGE_SIGN_TEXT = '收縮率（正值＝體積減少）';
export const SHRINKAGE_KIND_DIRECT = '直接文獻值';
export const SHRINKAGE_EXCLUDED_TEXT = '不計入（規則表沒有單位鍵體積變化，不補值）';

/** 欄位旁的說明 */
export const CURE_TEMP_HINT = '沒有預設值；輸入硬化溫度後才會計算最大轉化率，其餘項目不受影響。';
