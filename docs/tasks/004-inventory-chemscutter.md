# 任務 004：盤點 CheMScutter 可直接搬進 MoleForm 的內容（唯讀）

編號：004
建立日期：2026-10-29
指派給：Codex／Claude Code

## 目標

列出使用者自己的專案 CheMScutter 中，哪些東西可以直接搬進 MoleForm（DECISIONS D16），讓下指令的人據此改寫 Phase 1、2 的任務。**本任務只讀取 CheMScutter 並產出報告，不改動 CheMScutter，也不把任何檔案搬進 MoleForm。**

## 前置條件（先讀這些）

- `AGENTS.md`
- `docs/DECISIONS.md`（特別是 D16、D20、D23、D24）
- `docs/PLAN.md`（Phase 1、Phase 2）
- `docs/reports/003-結果.md`（任務 003 必須先完成；若尚未完成，停止並回報）
- `assets/style-reference.png`（使用者指定的介面風格參考，來自使用者的另一個程式 FilMaster）
- `assets/logo.png`（MoleForm Logo）

CheMScutter 路徑：`C:\Users\t22016\Desktop\程式\CheMScutter`

## 要做的事

在 CheMScutter 中**只讀取**，逐項記錄（每項都寫出檔案路徑）：

1. **專案骨架**：`package.json` 的 scripts 與相依套件（名稱、版本）、Vite／TypeScript／Vitest 設定檔、目錄結構（列到第二層即可）
2. **品質檢查**：型別檢查、測試、lint 的指令；是否有 CI 設定（例如 `.github/workflows/`），內容做了什麼
3. **部署方式**：網站怎麼建置與公開（例如 GitHub Pages、其他靜態主機），相關設定檔與指令
4. **版本控制**：是否為 git 專案（有無 `.git`）；是否設定遠端 repo（只記錄有或沒有，以及主機名稱，例如 github.com；**不要記錄任何帳號、權杖或密碼**）
5. **Ketcher 整合**：使用的套件與版本、元件檔案、初始化方式、與 RDKit.js 的互動方式、遇過的特殊設定（例如 WASM 檔案的放置位置）
6. **RDKit.js 使用方式**：套件與版本、載入與初始化的檔案、用到哪些功能（SMILES 解析、2D、碎片切分等）
7. **介面風格**：
   - 顏色、字型、圓角、陰影、間距是否集中定義（例如 CSS 變數、Tailwind 設定、主題檔），列出檔案與主要值
   - 共用元件清單：卡片、按鈕、輸入框（含單位顯示）、分頁切換、下拉選單、圖表等
   - 與 `assets/style-reference.png` 比較：哪些已經一致、哪些不同
8. **可重用的功能**：例如檔案匯入匯出、本機儲存（瀏覽器儲存、檔案下載）、版本號顯示、說明頁等
9. **授權**：根目錄是否有 LICENSE；上述每個相依套件的授權（從 `node_modules` 內的套件 `package.json` 讀取；若尚未安裝，標為「未確認」，**不要為此執行安裝**）；標出任何 GPL 類授權
10. **建議搬移清單**：分成三類，每項寫原檔路徑與在 MoleForm 的建議位置
    - 可原樣搬：與化學內容無關的設定與共用元件
    - 搬了要改：含 CheMScutter 專屬邏輯或文字的部分，並說明要改什麼
    - 不建議搬：與 MoleForm 無關，或違反 `AGENTS.md`（例如已取消項目）

## 不可更動的檔案或規則

- **不得修改、新增、刪除、提交或推送 CheMScutter 的任何檔案**，也不要在 CheMScutter 裡執行 `npm install`、建置或測試
- 不得把 CheMScutter 的檔案搬進 MoleForm（搬移在之後的任務做）
- 不得在報告中寫入任何密鑰、權杖、帳號密碼或 `.env` 的內容
- 不得更動 MoleForm 的程式碼、參數表、反應規則表與模型公式
- 不得重新加入 `AGENTS.md` 列出的已取消項目

## 完成標準（可檢查）

- [ ] 本任務只讀取與寫報告，不需執行 MoleForm 的型別檢查、測試與建置；報告中註明「不適用」
- [ ] `docs/reports/004-結果.md` 中第 1–10 項每項都有內容（找不到就寫「未找到」，並說明找過哪些位置）
- [ ] 第 10 項的三類清單每項都有原檔路徑與建議位置
- [ ] 報告中沒有任何密鑰、權杖、帳號密碼
- [ ] CheMScutter 沒有任何檔案被更動（若它是 git 專案，執行 `git status` 確認並把結果貼進報告）

## 完成後請做

1. 在 `docs/PLAN.md` 的 Phase 0 最後新增一行 `- [x] 0.6 任務 004：盤點 CheMScutter 可搬內容`
2. 新增 `docs/reports/004-結果.md`，內容包含：
   - 第 1–10 項盤點結果
   - 遇到的問題
   - 需要使用者決定的事
3. 若發現新的風險（例如授權問題、Windows 中文路徑造成的問題），寫進 `docs/KNOWN_ISSUES.md` 的「技術風險」表格，編號接續現有編號

## 需要先問使用者的情況

- 讀不到 CheMScutter 資料夾（權限或沙盒限制）
- CheMScutter 內有 GPL 類授權的相依套件，或其他使用限制說明
- 任務 003 尚未完成
