# 任務 008：RDKit 載入、結果顯示元件、頁首與介面風格（Phase 1.4、1.5、1.5a）

編號：008
建立日期：2026-10-29
指派給：Codex／Claude Code

## 目標

網站打開後：頁首顯示 MoleForm Logo 與建置資訊；整體風格與 CheMScutter 一致；頁面底部顯示 RDKit 的載入狀態（載入中／已就緒與版本／失敗）。另外完成「結果顯示元件」，之後每個計算結果都用它顯示模型名稱、可信度、統一備註與出處。**本任務仍不做任何化學計算。**

## 前置條件（先讀這些）

- `AGENTS.md`
- `docs/DECISIONS.md`（特別是 D03、D16、D27、D33、D34）
- `docs/PLAN.md`（Phase 1 的 1.4、1.5、1.5a）
- `docs/reports/004-結果.md`（第 1、6、7、8、10 節）
- `docs/reports/007-結果.md`

資訊：
- CheMScutter 路徑：`C:\Users\t22016\Desktop\程式\CheMScutter`（**只能讀取與複製，D27**）
- 下指令的人已準備好圖檔，放在 `assets/icons/`：
  - `logo-header.png`（720×199，頁首用的橫式 Logo）
  - `favicon-32.png`、`apple-touch-icon.png`（180×180）、`icon-512.png`（瀏覽器分頁與書籤圖示）

## 要做的事

### A. 介面風格（1.5a，D34）

1. 讀 CheMScutter 的 `src/ui/analysis.css`、`src/ui/results/results.css`，把其中的顏色、字型、圓角、間距、內距、頁面最大寬度、響應式斷點整理成 CSS 變數，寫進新檔 `src/ui/theme.css`（`:root` 內定義），**數值照 CheMScutter 原樣**，不要自行調整。
2. 新增 `src/ui/base.css`：全域的 `body`、標題、`button`、`input`、`select`、卡片樣式，寫法參考 CheMScutter，但一律使用 `theme.css` 的變數，不再硬寫數值。
3. 新增 `docs/DESIGN.md`：列出每個變數的名稱、數值、用途；並寫明規則「新增畫面一律使用 `theme.css` 的變數；需要新顏色或尺寸時先加進 `theme.css` 與本檔」。

### B. 頁首、圖示與建置資訊（1.5a）

4. 把 `assets/icons/` 的四個圖檔複製到 `public/`（`public/` 內的檔案會原樣隨網站發布）。
5. `index.html`：加入 favicon（`favicon-32.png`）、`apple-touch-icon.png`；路徑要能在 `base: '/moleform/'` 下正確載入（用 Vite 的 `%BASE_URL%` 或相對路徑）。
6. 從 CheMScutter **複製** `scripts/build-info.mjs`、`scripts/build-info.d.mts`、`src/globals.d.ts`，並在 `vite.config.ts` 加回 `define`：`__BUILD_TIME__`、`__GIT_COMMIT__`（D16、D27，報告註明原路徑）。
7. 頁首（`src/ui/Header.tsx`）：左側顯示 `logo-header.png`（高度約 56–64px，`alt="MoleForm 化學配方物性與交聯預測"`），下方或右側小字顯示「建置 {建置時間} · {git 短雜湊}」。版面參考 CheMScutter `src/App.tsx` 的頁首。**不要顯示版本號**（版本號由使用者另行處理）。
8. `src/ui/App.tsx` 改為：頁首＋一張卡片，內文「MoleForm 建置中。」＋頁尾（見 C）。

### C. RDKit 載入（1.4）

9. 安裝 `@rdkit/rdkit`，版本與 CheMScutter 相同（2026.9.1）。
10. 從 CheMScutter **複製** `src/engine/rdkit/loader.ts`、`types.ts` 到 `src/core/rdkit/`（`src/core/` 不可引用 React，D33 與 `tests/architecture.test.ts`）。
11. RDKit 在 **Web Worker** 中載入：參考 CheMScutter `src/worker/client.ts`、`protocol.ts`、`analysis.worker.ts` 的寫法（複製通用部分，移除質譜分析邏輯），建立：
    - `src/worker/protocol.ts`：請求／回應型別；本任務只需一種請求 `status`，回應 `{ ready: true, version }` 或 `{ ready: false, error }`
    - `src/worker/chem.worker.ts`：用 `@rdkit/rdkit/RDKit_minimal.wasm?url` 與 `locateFile` 載入 RDKit（只初始化一次）
    - `src/worker/client.ts`：主執行緒呼叫用的包裝
12. 頁尾（`src/ui/Footer.tsx`）顯示 RDKit 狀態：「化學引擎載入中…」→「RDKit {版本} 已就緒」；失敗時顯示「化學引擎載入失敗」與錯誤訊息，**網頁其他部分仍可使用**。
13. 從 CheMScutter **複製** `tests/rdkit-smoke.test.ts`，改為測試 `src/core/rdkit/loader.ts`：能初始化、`version()` 有值、`get_mol('CCO')` 有效、無效 SMILES 判定為無效（只檢查程式能正確呼叫 RDKit，不判斷化學正確性，D17）。

### D. 結果顯示元件（1.5，D03）

14. `src/core/result.ts`（純 TypeScript）：定義所有計算結果共用的型別，至少包含：
    - `value`（數值或 `null`）、`unit`、`modelName`（模型名稱）
    - `confidence`：`'direct' | 'estimate' | 'trend'`，對應「直接計算／理論估算／參考趨勢」
    - `sources`（出處清單，可為空）、`notApplicable`（不適用時的原因，可選）
    - 匯出常數 `UNIFIED_NOTE`，內容照抄 `AGENTS.md` 鐵則 2 的統一備註全文
    - 匯出函式 `confidenceLabel(confidence)` 回傳中文標籤
15. `src/ui/components/ResultValue.tsx`：用上述型別顯示一筆結果：數值與單位（數字用等寬字型）、模型名稱、可信度標籤（三級用不同但不刺眼的樣式，顏色取自 `theme.css`）、出處（可展開）、`notApplicable` 時顯示「不適用」與原因。
16. `src/ui/components/UnifiedNote.tsx`：顯示 `UNIFIED_NOTE`。
17. 元件預覽：**只在開發模式**（`import.meta.env.DEV`）於頁面下方顯示「元件預覽（開發用，非計算結果）」區塊，用三筆示範資料展示三種可信度與一筆「不適用」。正式網站（`npm run build` 的結果）**不得出現**這些示範資料。
18. 測試：`tests/result.test.ts` 測 `confidenceLabel` 三種輸入、`UNIFIED_NOTE` 與 `AGENTS.md` 鐵則 2 的文字完全相同（測試中直接讀 `AGENTS.md` 比對，或在報告說明為何改用其他方式）。

### E. 文件

19. `AGENTS.md` 的「開發方式」最後新增一條，照抄：

    > - 推送方式：提交後由 AI 工具自行 `git push`，執行時不設 `GIT_TERMINAL_PROMPT`，並只對該指令清除 `GCM_INTERACTIVE`（PowerShell：`$env:GCM_INTERACTIVE=$null; git push`），使用 Windows 認證管理員中已存的憑證。推送失敗就回報錯誤並停止，不得修改 git 或認證設定，也不得要求使用者提供密碼或權杖。

### F. 檢查、提交、推送

20. 依序執行 `npm run typecheck`、`npm test`、`npm run build`，全部通過。
21. 確認 `dist/` 中不含元件預覽的示範文字（例如在 `dist` 內搜尋示範資料使用的字串），結果寫進報告。
22. 提交（訊息：`RDKit 載入、結果顯示元件、頁首與風格（任務 008）`），依 E 的推送方式推送。
23. 推送後確認 GitHub Actions 通過（有 `gh` 就用它查；沒有就在報告註明請使用者確認），再確認 `https://t22016aemc.github.io/moleform/` 的頁首、圖示、頁尾 RDKit 狀態。

## 不可更動的檔案或規則

- **不得修改 CheMScutter 的任何檔案，也不得在其中執行任何指令**（D27），只能讀取與複製
- 不得讀取或修改 `moleform-handoff`；不得使用 `assets/style-reference.png`（D34）
- 不得更動基團貢獻參數表、反應規則表與模型公式（本任務不涉及）
- 不得加入任何化學計算或物性結果（示範資料只能出現在開發模式）
- 除 `@rdkit/rdkit` 外不安裝其他套件；需要時先問使用者
- 不得顯示版本號、分子量、官能基數量或當量（D09）
- 不得修改 git 或認證設定；不得 force push

## 完成標準（可檢查）

- [ ] `npm run typecheck`、`npm test`、`npm run build` 全部通過（含 `tests/architecture.test.ts`、`tests/rdkit-smoke.test.ts`、`tests/result.test.ts`）
- [ ] `src/ui/theme.css` 存在，`src/ui/` 其他 CSS 檔沒有硬寫的顏色值（報告貼上搜尋 `#` 色碼的結果）
- [ ] `docs/DESIGN.md` 存在，列出所有變數
- [ ] `dist/` 不含元件預覽的示範資料
- [ ] 推送成功，GitHub Actions 通過
- [ ] 正式網站顯示：Logo 頁首、建置時間與 git 雜湊、分頁圖示、頁尾「RDKit 2026.9.1 已就緒」（或等價文字）
- [ ] CheMScutter 沒有被更動（唯讀 `git -C <路徑> status`，結果貼進報告）

## 完成後請做

1. 更新 `docs/PLAN.md`：勾選 1.4、1.5、1.5a
2. 新增 `docs/reports/008-結果.md`，內容包含：
   - 新增與複製的檔案（複製的要註明 CheMScutter 原路徑）
   - 測試、型別檢查、建置、推送、Actions 結果
   - 本機開發模式的畫面與正式網站畫面各一段文字描述（看到了什麼）
   - 遇到的問題
   - 需要使用者決定的事
3. 報告與 PLAN 一併提交並推送
4. 若發現新的已知問題，寫進 `docs/KNOWN_ISSUES.md`

## 需要先問使用者的情況

- 推送失敗
- CheMScutter 的寫法與本任務要求衝突（例如它的 RDKit 載入不在 Worker 中而難以搬移）
- 需要安裝 `@rdkit/rdkit` 以外的套件
- 任務內容與 `docs/DECISIONS.md` 衝突
