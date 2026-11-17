# 任務 I04：桌面版套用 MoleForm 圖示

編號：I04
建立日期：2026-11-17
指派給：Claude Code

## 目標

安裝版（I03）的 exe、桌面與開始選單捷徑、工作列與視窗目前顯示 Electron 預設圖示，打包設定沒有指定圖示。使用者提供的 MoleForm logo 已在專案內（`assets/logo.png`、`assets/icons/icon-512.png`，網頁版已使用）。本卡讓桌面版全面使用這個 logo。依 D64：一次做完、報告三行。

## 前置條件（先讀這些）

- `desktop/` 的打包設定（electron-builder 設定與主程式視窗建立處）、`assets/icons/`
- 不要搜尋整個專案

## 要做的事

1. 指定 Windows 圖示：以 `assets/icons/icon-512.png`（或 `assets/logo.png`，以畫面效果較清楚者為準；electron-builder 的 Windows 圖示需 PNG 至少 256×256，會自動轉 ICO，若自動轉換失敗再產生 `.ico`）。圖示要同時用在：安裝檔與解除安裝程式、安裝後的 exe（捷徑、工作列）、應用程式視窗。**不修改原 logo 檔，不新增套件**（除非自動轉換失敗且必須）。
2. 主程式建立視窗時也指定同一個圖示（開發模式 `desktop:dev` 也顯示）。
3. 確認安裝版的產品名稱、桌面與開始選單捷徑名稱、視窗標題都是 MoleForm（不是 Electron）；不是的改設定。
4. 重建安裝檔（`npm run desktop:build`），**只做一次簡單確認**：從建出的 exe 讀出圖示不是 Electron 預設（例如檢查檔案內容大小或以檔案總管預覽即可，不需要完整安裝與解除安裝流程；若環境無法確認外觀，在報告寫明由使用者安裝後目視確認）。不重跑 selftest。
5. 報告 `docs/reports/I04-結果.md` 三行以內。本機只跑 `npm run desktop:build` 與型別檢查；全部 TypeScript 測試交給 CI。大型安裝檔不得 commit。commit、push，用 PowerShell 查一次 CI。

## 不可更動的檔案或規則

- 不修改 `src/`、引擎、資料表、既有 CI job、原 logo 檔；不更動已定案決定

## 完成標準（可檢查）

- [ ] 安裝檔、exe、視窗都使用 MoleForm 圖示；名稱不是 Electron
- [ ] 已 commit 與 push，CI 通過

## 需要先問使用者的情況

- 兩個 logo 檔的長寬比或解析度無法產出合格的 256×256 以上圖示
