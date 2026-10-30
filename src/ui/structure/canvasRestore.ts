// 「分子工具」借用 Ketcher 後要還原什麼（任務 024 後續，K12）：與加入成分、成分詳細兩個彈窗相同，
// 還原畫布最近一次匯出的 Molfile，不論內容是否合法；還沒有匯出過時，退回最近一次驗證過的合法結構。
export function canvasRestoreInput(lastExported: string | undefined, current: { valid: boolean; molblock: string } | undefined): string | undefined {
  if (lastExported !== undefined) return lastExported;
  return current?.valid ? current.molblock : undefined;
}
