# 任務 I02：內嵌 Python 引擎打包（D63），讓 exe 能獨立算出物性

編號：I02
建立日期：2026-11-16
指派給：Claude Code

## 目標

D63：本機版的 Python 引擎以內嵌方式打包（內嵌 Python 與套件，使用者不用另外安裝），固定版本。I01 完成後，開發環境能算物性，但可攜式 exe 只帶 `moleform_engine.py`，沒有 `moleform_core`、資料表與 Python，所以 exe 算不出物性。本卡讓 exe 在**沒有安裝 Python、沒有網路**的電腦上也能算。依 D64：一次做完、驗證一次、報告一頁。

使用者 2026-11-16 的決定：先不做半套打包，直接做完整內嵌；配方混合維持只混 Solid 區。

## 前置條件（先讀這些）

- `docs/reports/039-結果.md`（B-6 對 Python 打包方式的評估）、`docs/reports/I01-結果.md`、`docs/migration-known-issues.md`（資料表路徑的說明）、`docs/DECISIONS.md` 的 D18、D62、D63、D64
- `desktop/`（Electron 主程式、打包設定、引擎啟動的路徑邏輯）、`engine/`（`requirements.txt`、`requirements-dev.txt`、伺服器入口、資料表讀取的路徑設定）
- 不要搜尋整個專案

## 要做的事

1. **內嵌 Python**：取得與開發環境相同版本的 Windows 內嵌式 Python（embeddable package，到 python.org 官方下載，版本取自 `engine/.venv` 實際版本，不憑記憶；找不到相同版本就**停下來回報**，不要換別的版本）。把 `requirements.txt` 固定的套件（numpy、scipy、rdkit 與其他引擎相依）安裝到內嵌環境的 site-packages（用現有 `engine/.venv` 的 pip，以 `--target` 安裝；必要時調整內嵌環境的 `._pth` 檔讓它找得到 site-packages）。**不把 venv 整包複製**。
2. **requirements 加 hash**：先前決定「hash 等 D63 打包時再做」。本卡把 `requirements.txt` 改為帶 `--hash` 的固定版本，並用 `pip install --require-hashes` 驗證安裝；hash 取自實際下載的檔案，不憑記憶。
3. **引擎程式與資料表隨附**：把 `engine/moleform_core`、`moleform_engine.py` 與引擎讀取的資料表 CSV 放進打包資源。資料表以**打包時從 `src/data` 複製**為準（單一來源，不得手改複本，D18、D22），並讓引擎的資料表路徑在打包版指向資源內的複本，開發環境維持讀 `src/data`。
4. **路徑邏輯**：Electron 主程式在打包版使用資源內的內嵌 Python 啟動引擎，開發環境維持 `engine/.venv`。仍然只監聽 127.0.0.1、隨機埠、一次性權杖，結束時關閉並釋放埠。引擎啟動失敗時介面照 I01 的做法顯示明確訊息。
5. **建置流程**：把「組裝內嵌環境」做成可重跑的腳本，並接進 `npm run desktop:build`（不得改動既有 `build`、`test` 指令的行為）。腳本要冪等：重跑結果一致。
6. **授權聲明**：打包內容附上第三方授權聲明檔（Python、numpy、scipy、rdkit 與其他隨附套件），內容取自各套件隨附的授權檔，不憑記憶。
7. **一次性實測（全部做完後只做一次）**：
   - 在**沒有安裝 Python 的環境**（例如暫時用 PATH 不含 Python 的新 PowerShell；若無法確認，至少確認程式沒有使用系統 Python）且**關閉網路**的情況下啟動打包版 exe；
   - 對一個聚合物單元算出 Tg 與 Vm，與開發環境結果逐字相同；對一個配方算出混合 Tg 與混合密度；
   - 關閉程式後確認引擎行程與埠已釋放；
   - 記錄：exe 大小與 I01 前相比增加多少、冷啟動到引擎可用的時間。
8. 報告 `docs/reports/I02-結果.md`，限一頁：做了什麼、實測結果與大小／啟動時間、授權聲明位置、需要使用者決定的事。更新 `docs/PLAN.md`（6A 補註）與 `docs/DECISIONS.md` 的 D63（補註「已於任務 I02 完成」，原文不改）。
9. 本機只跑本卡新增的檢查、型別檢查、`npm run desktop:build` 與上述實測；全部 TypeScript 測試與建置交給 CI。commit、push，只查一次 CI。若新增檔案影響 `golden-fresh`（它會掃 `tests/**/*.test.ts` 的單引號字串當 SMILES），新增測試的字串一律用雙引號。

## 不可更動的檔案或規則

- 不修改 `src/core/` 的計算與資料表、引擎計算與端點行為、既有測試與 CI job；不把大型二進位檔（內嵌 Python、套件）commit 進 git，打包產物放在已被忽略的輸出資料夾，必要時補 `.gitignore`
- 引擎只在 127.0.0.1 內部連線，不對外；測試後不要留下背景程式
- 不使用記憶中的版本號與 hash；不更改已定案決定

## 完成標準（可檢查）

- [ ] 打包版 exe 在沒有系統 Python、沒有網路的情況下算出 Tg、Vm、混合 Tg、混合密度，結果與開發環境逐字相同
- [ ] `requirements.txt` 帶 hash，`--require-hashes` 安裝通過
- [ ] 授權聲明已附；exe 大小與啟動時間已記錄；關閉後引擎行程與埠已釋放
- [ ] 型別檢查通過；CI 通過；已 commit 與 push

## 需要先問使用者的情況

- 找不到與開發環境相同版本的內嵌式 Python
- numpy、scipy 或 rdkit 無法在內嵌環境運作，需要換版本或換打包方式
- exe 大小增加到超出一般可攜式程式的合理範圍，需要使用者決定取捨
- 任務與 `docs/DECISIONS.md` 衝突
