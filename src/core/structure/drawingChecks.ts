// Ketcher 繪圖內容（KET JSON）與 Indigo 檢查結果的輸入限制。
// 改寫自 CheMScutter src/shared/structureChecks.ts，依 DECISIONS D31 調整：
//   拒絕：反應式（箭頭、加號）、查詢結構（查詢原子／鍵、原子清單）、R 基團、聚合物重複單元（SRU 等）
//   允許：連接點 *
import { rejectionMessages } from './inputErrors';

const POLYMER_SGROUP_TYPES = ['SRU', 'MUL', 'MON', 'COP', 'CRO', 'MOD', 'MER', 'GRA'];
const QUERY_LABELS = new Set(['A', 'Q', 'X', 'M', 'AH', 'QH', 'XH', 'MH']);
// KET 鍵型：5 = 單或雙、6 = 單或芳香、7 = 雙或芳香、8 = 任意
const QUERY_BOND_TYPES = new Set([5, 6, 7, 8]);

/** 回傳不支援內容的中文訊息；沒有問題時回傳 undefined。只辨識，不改寫輸入。 */
export function unsupportedDrawing(ket: string): string | undefined {
  let found: string | undefined;
  const visit = (value: unknown): void => {
    if (found || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    const type = typeof node.type === 'string' ? node.type : '';
    if (type === 'arrow' || type === 'plus' || type === 'multi-tailed-arrow') {
      found = rejectionMessages.reaction;
    } else if (type === 'atom-list' || node.atomList !== undefined) {
      found = rejectionMessages.query;
    } else if (type === 'rg-label' || (typeof node.$ref === 'string' && node.$ref.startsWith('rg'))) {
      found = rejectionMessages.rgroup;
    } else if (POLYMER_SGROUP_TYPES.includes(type.toUpperCase())) {
      found = rejectionMessages.polymer;
    } else if (typeof node.label === 'string' && QUERY_LABELS.has(node.label)) {
      found = rejectionMessages.query;
    } else if (node.queryProperties !== undefined || node.customQuery !== undefined || node.topology !== undefined) {
      found = rejectionMessages.query;
    } else if (typeof node.type === 'number' && QUERY_BOND_TYPES.has(node.type) && Array.isArray(node.atoms)) {
      found = rejectionMessages.query;
    }
    if (!found) Object.values(node).forEach(visit);
  };
  try {
    visit(JSON.parse(ket));
  } catch {
    return '繪圖資料格式不正確，請重新取得結構。';
  }
  return found;
}
