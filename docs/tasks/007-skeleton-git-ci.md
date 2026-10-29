# 任務 007：專案骨架、git、CI 自動部署（Phase 1.1–1.3）

編號：007
建立日期：2026-10-29
指派給：Codex／Claude Code

## 目標

建立 MoleForm 的最小可執行專案：網站可以在本機開啟，型別檢查、測試、建置都通過；專案成為 git repo 並推送到 GitHub；推送後 GitHub Actions 自動檢查並部署到 `https://t22016aemc.github.io/moleform/`。網頁上暫時只顯示「MoleForm」標題，**沒有任何化學功能**。

## 前置條件（先讀這些）

- `AGENTS.md`
- `docs/DECISIONS.md`（特別是 D16、D20、D24、D27、D30、D32、D33）
- `docs/PLAN.md`（Phase 1）
- `docs/reports/004-結果.md`（第 1、2、3、10 節：要複製的檔案與要改的地方）
- `docs/reports/006-結果.md`

資訊：
- CheMScutter 路徑：`C:\Users\t22016\Desktop\程式\CheMScutter`（**只能讀取與複製，D27**）
- GitHub repo：`https://github.com/T22016AEMC/moleform.git`（使用者已建立，為空的 repo）
- 網站網址：`https://t22016aemc.github.io/moleform/`

## 要做的事

### A. 環境檢查（只讀）

1. 記錄 `node -v`、`npm -v`、`git --version` 的結果。
2. 執行 `git config --global user.name` 與 `git config --global user.email`，只記錄「有設定／沒設定」，**不要把值寫進報告**。沒設定就停下來問使用者，**不要自行設定**。

### B. 專案檔案

3. 在專案根目錄建立 `package.json`（**新寫，不要整份複製**）：
   - `name`: `moleform`，`private: true`，`type: module`；`version` 填 `0.0.0`（版本號由使用者另行處理，不要自行改）
   - scripts：`dev`、`build`（`tsc --noEmit && vite build`）、`preview`、`test`（`vitest run`）、`test:clean`、`typecheck`（`tsc --noEmit`），寫法參考 CheMScutter，但**不含** Ketcher 子專案與 golden 相關指令（D30；Ketcher 在 Phase 2）
   - 相依套件只放這些，**版本與 CheMScutter 的 `package.json` 相同**：
     - dependencies：`react`、`react-dom`
     - devDependencies：`typescript`、`vite`、`@vitejs/plugin-react`、`vitest`、`@types/react`、`@types/react-dom`
   - **不要**加入 `@rdkit/rdkit`、`openchemlib`、Ketcher、Excel 相關套件（之後的任務再加）
4. 執行 `npm install` 產生 `package-lock.json`（不要從 CheMScutter 複製 lock 檔）。
5. 從 CheMScutter **複製**下列檔案並修改：
   - `tsconfig.json`：`include` 改為 `src`、`tests`、`vite.config.ts`
   - `vite.config.ts`：`base` 改為 `/moleform/`；`test.include` 為 `tests/**/*.test.ts`；移除 `__BUILD_TIME__`、`__GIT_COMMIT__` 的 `define`（任務 008 再加）、coverage 設定與 legacy 排除項
   - `.gitattributes`：原樣
   - `.gitignore`：原樣，並確認或新增以下規則：`node_modules/`（任何層級，包含 `experiments/*/node_modules/`）、`dist/`、`coverage/`、`.env`、`.env.*`（但保留 `.env.example`）、`assets/style-reference.png`
6. 建立目錄與最小程式：
   - `index.html`：標題 `MoleForm`，`lang="zh-Hant"`
   - `src/main.tsx`：掛載 React
   - `src/ui/App.tsx`：只顯示文字「MoleForm」與「化學配方物性與交聯預測（建置中）」
   - `src/core/index.ts`：空的匯出（`export {};`），代表計算核心的位置
   - `src/data/.gitkeep`
7. **PLAN 1.2 的自動檢查**：新增 `tests/architecture.test.ts`，掃描 `src/core/` 底下所有 `.ts` 檔，若有引用 `react`、`react-dom` 或任何 `src/ui/` 的檔案就測試失敗。另外寫一個反例確認此檢查確實會失敗（例如對一段含 `import React from 'react'` 的字串執行同一個判斷函式），**不要**真的在 `src/core/` 放違規檔案。

### C. CI 與部署

8. 從 CheMScutter **複製** `.github/workflows/deploy.yml` 到同路徑，並修改：
   - 刪除 `npm ci --prefix packages/ketcher-frame` 步驟
   - 刪除 `npm run golden:diff` 步驟（D30）
   - 保留：checkout、setup-node（與 CheMScutter 相同版本）、`npm ci`、`npm run typecheck`、`npm run test:clean`、`npm run build`、上傳 `dist`、`deploy` 工作 `needs: build`
9. 本機依序執行 `npm run typecheck`、`npm test`、`npm run build`，全部通過才繼續。

### D. 文件小修

10. `docs/PLAN.md` 的「建置原則」第 1 點，把「這樣容易測試，日後也能整包搬到伺服器。」改為「這樣容易測試，也容易放進 Web Worker 執行。」

### E. git 與推送

11. 在專案根目錄執行 `git init`，預設分支 `main`。
12. 執行 `git status`，確認**沒有**這些東西被加入：`node_modules`、`dist`、`assets/style-reference.png`、任何 `.env`。有的話先修 `.gitignore`。
13. 提交全部檔案（含 `docs/`、`experiments/` 的腳本與輸出、`assets/logo.png`），提交訊息：`初始化 MoleForm 專案骨架（任務 007）`。
14. `git remote add origin https://github.com/T22016AEMC/moleform.git`，再 `git push -u origin main`。
    - 若跳出 GitHub 登入視窗或要求帳號密碼、權杖：**停下來請使用者自己登入**，不要要求使用者把密碼或權杖貼給你，也不要寫進任何檔案。
15. 推送後，GitHub Actions 會自動執行。若有 `gh` 指令且已登入，可用它查看執行結果；沒有就請使用者到 repo 的 Actions 頁面查看，並把結果寫進報告。
    - 若 `deploy` 失敗是因為 GitHub Pages 尚未啟用：**停下來**，請使用者到 repo 的 Settings → Pages → Build and deployment → Source 選「GitHub Actions」，啟用後重新執行該 workflow。

## 不可更動的檔案或規則

- **不得修改 CheMScutter 的任何檔案，也不得在其中執行任何指令**（D27），只能讀取與複製
- 不得讀取或修改 `moleform-handoff`
- 不得更動基團貢獻參數表、反應規則表與模型公式（本任務不涉及）
- 不得重新加入 `AGENTS.md` 列出的已取消項目
- 不得加入伺服器、資料庫或 Python 執行環境（D33）
- 不得修改 `experiments/` 內的檔案（只提交）
- 不得修改 git 的全域設定（`git config --global ...`）
- 不得把密鑰、密碼、權杖寫進任何檔案或報告
- 不得 force push

## 完成標準（可檢查）

- [ ] `npm run typecheck`、`npm test`、`npm run build` 在本機全部通過（報告貼上結果摘要）
- [ ] `tests/architecture.test.ts` 通過，且反例確實被判定為違規
- [ ] `npm run dev` 開啟後，瀏覽器顯示「MoleForm」（報告註明開啟的本機網址）
- [ ] `git log` 有一筆提交；`git remote -v` 指向 `https://github.com/T22016AEMC/moleform.git`
- [ ] `git ls-files` 中沒有 `node_modules`、`dist`、`assets/style-reference.png`、`.env`
- [ ] GitHub Actions 的 build 工作通過；若 Pages 已啟用，`https://t22016aemc.github.io/moleform/` 顯示「MoleForm」（無法確認就在報告中寫明由使用者確認）
- [ ] CheMScutter 沒有被更動（執行 `git -C <CheMScutter 路徑> status`，結果貼進報告；這是唯讀指令）

## 完成後請做

1. 更新 `docs/PLAN.md`：勾選 1.1、1.2、1.3（1.3 若部署尚未確認成功，先不要勾，並在報告說明）
2. 新增 `docs/reports/007-結果.md`，內容包含：
   - 環境檢查結果
   - 新增與複製的檔案（複製的要註明 CheMScutter 原路徑，D16）
   - 測試、型別檢查、建置結果
   - git 與 GitHub Actions 結果
   - 遇到的問題
   - 需要使用者決定或動手的事
3. 報告與 PLAN 的修改也要提交並推送（第二筆提交，訊息：`任務 007 報告`）
4. 若發現新的已知問題（例如 Windows 中文路徑造成的問題），寫進 `docs/KNOWN_ISSUES.md`

## 需要先問使用者的情況

- git 的 user.name 或 user.email 沒有設定
- 推送時需要登入 GitHub
- GitHub Pages 尚未啟用
- `npm install` 失敗，或 CheMScutter 的套件版本在 npm 上已無法安裝
- 需要加入本任務沒有列出的套件
