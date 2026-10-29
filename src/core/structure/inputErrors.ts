// 結構輸入的錯誤分類與中文訊息。
// 分類方式參考 CheMScutter src/shared/inputErrors.ts，訊息改為 MoleForm 的情境（任務 010、DECISIONS D31）。

export const inputCategories = ['EMPTY_INPUT', 'UNPARSABLE', 'SANITIZATION_FAILED', 'UNSUPPORTED_CONTENT', 'OTHER'] as const;
export type InputCategory = (typeof inputCategories)[number];

export const inputMessages: Record<InputCategory, string> = {
  EMPTY_INPUT: '尚未輸入結構。',
  UNPARSABLE: '無法解析：請檢查 SMILES／Molfile 的格式與內容。',
  SANITIZATION_FAILED: '價數或芳香性有誤：RDKit 無法完成結構檢查，請檢查原子的價數、電荷與芳香環。',
  UNSUPPORTED_CONTENT: 'MoleForm 只接受分子結構：不接受反應式（含反應箭頭）、查詢結構或聚合物重複單元記號。',
  OTHER: '其他錯誤：結構處理未完成，請查看技術細節後再試。',
};

/** 不支援內容的細項訊息（都屬於 UNSUPPORTED_CONTENT；DECISIONS D31） */
export const rejectionMessages = {
  reaction: 'MoleForm 只接受分子結構，不接受反應式（含反應箭頭）。請只輸入單一分子或分子的組合。',
  query: 'MoleForm 只接受分子結構，不接受查詢結構（例如 SMARTS、任意原子 A／Q、原子清單、查詢鍵）。請改用明確的原子與鍵。',
  rgroup: 'MoleForm 只接受分子結構，不接受 R 基團標示（R1、R2…）。聚合物連接點請使用 *（例如 *CC*）。',
  polymer: 'MoleForm 只接受分子結構，不接受 Molfile 的聚合物／重複單元記號（SRU 等）。聚合物重複單元請使用連接點 *（Phase 5 提供）。',
} as const;

export const connectionPointNotice = '含連接點 *，聚合物重複單元功能在 Phase 5 提供';

export class InputValidationError extends Error {
  constructor(
    public readonly category: InputCategory,
    public readonly details: string,
    message?: string,
  ) {
    super(message ?? inputMessages[category]);
  }
}

export function isInputCategory(value: unknown): value is InputCategory {
  return inputCategories.some((category) => category === value);
}
