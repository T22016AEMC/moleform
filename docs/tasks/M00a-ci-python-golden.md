# 任務 M00a：CI 新增 Python 引擎測試與黃金檔過期檢查（任務 M00 的後續）

編號：M00a
建立日期：2026-11-13
指派給：Claude Code

## 目標

任務 M00 完成後，使用者決定（2026-11-13）：（1）CI 新增 Python 引擎測試 job；（2）`npm run engine:test` 改用 pytest，讓黃金比對被執行；（3）新增「黃金檔過期檢查」；（4）requirements 加 hash 等 D63 內嵌打包時再做；`scripts/golden/` 不納入型別檢查。範圍只有 CI 設定與一行 package.json 指令。

## 前置條件（先讀這些）

- `docs/reports/M00-結果.md`（尤其第 7 節）、`.github/workflows/` 現有的 CI 設定、`package.json` 的 scripts、`engine/requirements.txt`、`engine/requirements-dev.txt`
- 不要搜尋整個專案

## 要做的事

1. **CI 新增 Python job**：在 ubuntu 上用 Python 3.12，執行 `pip install -r engine/requirements-dev.txt`，再執行 `engine/` 的 pytest（含黃金比對）。與既有的 `build` job 分開，**不得更動既有 build、型別檢查、測試 job**；deploy 維持暫停。
2. **黃金檔過期檢查**：新增一個 CI 步驟（可放在新 job 或獨立 job）：重新執行 `scripts/golden/export-*.ts` 把黃金檔輸出到暫存位置或原位置，若與已 commit 的 `tests/golden/*.json` 有差異就讓 CI 失敗，並在錯誤訊息說明「TS 計算或資料表改了，請重產黃金檔」。注意：黃金檔含 commit 編號或時間戳欄位時，比對要排除這些欄位，只比對實質內容；先在本機驗證「沒改動時不會誤報」。
3. **npm 指令**：`package.json` 的 `engine:test` 改為執行 pytest（使用 `engine/.venv` 的 Python，與現有 engine 指令的寫法一致）。這是本卡唯一允許修改的 package.json 內容；其他 scripts 與相依套件不動。
4. 本機驗證：`npm run engine:test` 全數通過（M00 回報 817 項）；黃金過期檢查在無改動時通過，並**故意改動一個資料表欄位後檢查會失敗**（驗證完立即還原，用 git 確認沒有殘留改動）。
5. 報告 `docs/reports/M00a-結果.md` 寫精簡：改了哪些檔案、兩項檢查的驗證結果、CI 執行時間。commit、push，確認 CI 的新 job 與 build 都通過。

## 不可更動的檔案或規則

- 不修改 `src/`、`engine/` 的程式與測試、`tests/golden/` 的內容、資料表；不更動既有 CI job；`package.json` 只改 `engine:test`
- 不使用記憶中的版本號；不更改已定案決定
- 為節省額度：不在本機跑全部 TypeScript 測試與建置，交給 CI

## 完成標準（可檢查）

- [ ] CI 新 Python job 通過，既有 build job 不變且通過
- [ ] 黃金過期檢查：無改動通過、故意改動時失敗（兩種都有證據），且已還原
- [ ] `npm run engine:test` 跑 pytest 並通過
- [ ] 報告完成，已 commit 與 push

## 需要先問使用者的情況

- 黃金檔含無法排除的不穩定欄位，導致過期檢查無法穩定
- 新增 Python job 需要改動既有 job 的設定
- 任務與 `docs/DECISIONS.md` 衝突
