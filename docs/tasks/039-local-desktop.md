# 任務 039：本機版（Windows 桌面程式）盤點與封裝原型

狀態：優先執行（PLAN 6A.0–6A.2，D62）

編號：039
建立日期：2026-11-13
指派給：Claude Code

## 目標

使用者 2026-11-13 決定 MoleForm 改為「本機版」：不再部署到 GitHub Pages 或 Cloudflare，在使用者的 Windows 電腦上離線執行，之後新的計算模組直接寫在 Python 引擎，微影模組也放進同一個程式。本卡做三件事：（1）盤點現有程式要離線執行有哪些障礙；（2）做一個不改動現有程式碼的桌面封裝原型（Electron）；（3）做一個只握手、不含任何公式的 Python 引擎原型（B-6），驗證「TypeScript 介面＋Python 重運算」的架構可行。

## 前置條件（先讀這些）

- `AGENTS.md`、`docs/DECISIONS.md`（特別是 D27–D33 的架構決定）、`docs/PLAN.md`
- `package.json`、Vite 設定、`.github/workflows/`、`public/`、`assets/`、`packages/`
- 這台目前沒有 Python：B-6 需要使用者先安裝 Python；未安裝時 B-6 標「待安裝」並略過，其餘照做。其他工作用 Node 或 PowerShell

## 要做的事

### A. 盤點（寫進 `docs/reports/039-結果.md`，只讀不改）

1. 目前的建置與部署流程：Vite 的 `base`、輸出目錄、CI 的 deploy 步驟。
2. 離線執行的障礙：`file://` 載入時 WASM（RDKit、openchemlib 等）、Web Worker、`fetch` 讀資料表是否會被瀏覽器擋；有沒有用到外部 CDN、字型、網路請求（列出每一處檔案與行號）。
3. 資料保存方式：用了 localStorage、IndexedDB 或其他，使用者資料存在哪裡、換版本時是否保留。
4. `dist` 裡最大的檔案與總大小。
5. 判斷「用自訂協定（例如 `app://`）載入 `dist`」是否足以解決 WASM 與 Worker 的問題；寫出依據，不要只憑印象。

### B. 桌面封裝原型（新增 `desktop/` 資料夾，不修改 `src/`）

1. 用 Electron 載入現有 `dist`：主程式檔、載入方式依 A-5 的判斷；關閉 Node 整合（`nodeIntegration: false`、`contextIsolation: true`），不開遠端內容，禁止導向外部網址。
2. 在 `package.json` 新增獨立指令（例如 `desktop:dev`、`desktop:build`），不得改動既有的 `build`、`test` 指令行為。
3. 打包成 Windows 可攜式 exe 或安裝檔（以不需要額外簽章工具的方式為準），在報告寫出產生的檔名與大小。
4. 離線驗證：關閉網路後啟動，能輸入結構、算出一個現有輸出範例（任選一個測試裡有的聚合物）；結果與網頁版逐字相同。報告貼出比對。
5. 使用者資料的位置（A-3 的結果）在桌面版是否保留、重開後是否還在。
6. Python 引擎原型（使用者 2026-11-13：重運算要用 Python 取得最強算法，介面與現有物性引擎維持 TypeScript）：新增 `engine/` 資料夾，內含最小的 Python 程式，由 Electron 主程式啟動、只監聽 127.0.0.1 的隨機埠並帶一次性權杖（不得對外網開放）；程式結束時一併關閉。原型只做握手：回傳 Python、NumPy、SciPy、RDKit 的版本（以 `pip` 或程式實際回報為準，不憑記憶），並用一個 JSON 請求／回應範例示範「值、單位、來源」格式（欄位 `value`、`unit`、`source`、`status`，status 取 `measured / literature / fitted / predicted / assumed / missing`）。評估並寫入報告：Python 環境打包方式（內嵌或另裝）、安裝檔大小增加多少、啟動時間、需要使用者另外安裝什麼。**不得實作任何微影或物性公式。**

### C. 決定紀錄

`docs/DECISIONS.md` 新增 D62：「MoleForm 改為本機版（Windows 桌面）：介面與現有物性引擎維持 TypeScript，以 Electron 封裝；重運算（微影、反算、擬合）使用 Python 引擎，由桌面程式在本機以 127.0.0.1 內部連線啟動；不再以 GitHub Pages／Cloudflare 部署為目標」，來源：使用者 2026-11-13 決定；`docs/PLAN.md` 加一行補註，原有的 deploy CI 步驟只標記「暫停」，不刪除。

## 不可更動的檔案或規則

- 不修改 `src/` 下任何程式與資料表、既有計算與測試；既有的 `npm test`、`npm run build` 結果必須不變
- 不使用記憶中的版本號：套件版本以 `npm view` 查到為準，寫進報告
- 測試時不要留下背景伺服器；B-6 的 Python 引擎只在驗證時由桌面程式短暫啟動，驗證完必須確認已關閉、埠已釋放；GitHub 目前被停權，只 commit 到本機，不 push，不確認 CI，報告註明「未 push」

## 完成標準（可檢查）

- [ ] 型別檢查、既有測試、既有建置通過，結果與修改前相同
- [ ] A 的盤點齊全（每個障礙有檔案與行號）
- [ ] 打包產出可執行檔；離線啟動並算出範例，結果與網頁版逐字相同
- [ ] Python 引擎原型能被桌面程式啟動並握手（已安裝 Python 時），只監聽 127.0.0.1，結束時關閉；未安裝則標「待安裝」
- [ ] D62 寫入，報告完整，已 commit

## 需要先問使用者的情況

- 離線載入無法讓 WASM 或 Worker 正常運作，需要改動 `src/`
- 發現程式依賴必須連網的功能
- 打包需要付費工具或程式碼簽章
- Python 引擎需要開放 127.0.0.1 以外的連線，或需要使用者提供尚未安裝的套件
- 任務與 `docs/DECISIONS.md` 衝突
