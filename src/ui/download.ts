// 在瀏覽器內下載檔案。邏輯取自 CheMScutter src/ui/results/ExportButton.tsx 的 Blob 下載部分（任務 010）。
// 內容只在使用者自己的瀏覽器內產生，不上傳任何地方（D23）。

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // 讓瀏覽器完成接收下載，再釋放暫存網址。
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}
