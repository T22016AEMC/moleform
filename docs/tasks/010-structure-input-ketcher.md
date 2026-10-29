# 任務 010：結構輸入（Ketcher 繪圖、SMILES、結構驗證、MOL／SDF）（Phase 2.1–2.4）

編號：010
建立日期：2026-10-29
指派給：Codex／Claude Code

## 目標

網站上出現「結構輸入」卡片：使用者可以用 Ketcher 畫分子，或輸入 SMILES，兩邊同步；程式檢查結構是否合法並用中文說明問題；可以匯入 MOL／SDF 檔、匯出 MOL／SDF 檔。**本任務不計算任何物性，也不顯示分子量、官能基數量或當量（D09）。**

## 前置條件（先讀這些）

- `AGENTS.md`
- `docs/DECISIONS.md`（特別是 D09、D16、D27、D28、D29、D31、D34）
- `docs/PLAN.md`（Phase 2 的 2.1–2.4）
- `docs/KNOWN_ISSUES.md`（K05、K06）
- `docs/reports/004-結果.md`（第 5、8、10 節：Ketcher 整合與要改的地方）
- `docs/reports/008-結果.md`、`docs/reports/009-結果.md`

資訊：
- CheMScutter 路徑：`C:\Users\t22016\Desktop\程式\CheMScutter`（**只能讀取與複製，D27**）
- 網站 base：`/moleform/`；Ketcher 子專案 base：`/moleform/ketcher/`（D32）

## 要做的事

### A. 任務 009 的後續（使用者 2026-10-29 同意）

1. 任務 009 額外加入的檢查（官能度須為正整數、`reactive_atom_maps` 須為整數、同一 `method` 內同一 `group_id` 只能有一個 `group_name`、`value` 與 `unit` 必填）**全部保留**，並補寫進 `docs/DATA.md` 對應表格的規則說明。
2. `solvents.csv` 的 `smiles` 改為**必填**；`cas` 維持選填。更新檢查程式、`docs/DATA.md`，並在刻意寫錯的示範資料中加入「缺 SMILES」一例，確認會被抓到。

### B. Ketcher 子專案（2.1，D27、D28）

3. 從 CheMScutter **複製** `packages/ketcher-frame/` 整個子專案（不含 `node_modules`、`dist`），並修改：
   - `vite.config.mjs` 的 `base` 改為 `/moleform/ketcher/`，輸出到主專案 `dist/ketcher/`
   - `index.html` 標題改為 MoleForm 相關文字；保留原本的 CSP 設定
   - `src/main.tsx` 的輸入限制（`unsupportedDrawing`、`unsupportedCheck`）依 **D31** 改寫：**拒絕反應式（含反應箭頭）與查詢結構；允許連接點 `*`**。CheMScutter 的其他限制若與 D31 無關，保留並在報告列出
   - `package.json` 名稱改為 MoleForm 的子專案名稱；**套件版本不變**
   - 保留 `notices.mjs` 與 `public/` 內 Ketcher 的 LICENSE、NOTICE
4. 從 CheMScutter **複製** `src/shared/ketcherProtocol.ts`，頻道名稱改為 `moleform-ketcher-v1`，其餘驗證邏輯（來源 origin 與 window 檢查）保留。
5. 主專案 `package.json` 的 scripts 參照 CheMScutter 加入子專案：`build` 結束時建置 `packages/ketcher-frame`、`typecheck` 一併檢查子專案。
6. `.github/workflows/deploy.yml` 在 `npm ci` 之後加回 `npm ci --prefix packages/ketcher-frame`（golden 步驟仍不加，D30）。
7. 在子專案執行 `npm ci`（使用複製來的 `package-lock.json`，讓版本與 CheMScutter 一致）。

### C. 結構輸入畫面（2.1、2.2）

8. 新增 `src/ui/structure/StructureInput.tsx`（一張卡片，風格用 `theme.css` 變數，D34）：
   - 上方：SMILES 輸入框與「載入」按鈕
   - 中間：Ketcher iframe（參考 CheMScutter `src/ui/AnalysisPanel.tsx` 的 iframe 管理與請求／回應流程，只取這部分，移除 PubChem 與質譜流程）
   - 下方：目前結構的 canonical SMILES（由 RDKit 產生，可複製）、驗證訊息、匯入／匯出按鈕
9. **雙向同步**：
   - 輸入 SMILES 按「載入」→ 送進 Ketcher 顯示
   - 在 Ketcher 畫圖或修改 → 收到 `changed` 後向 Ketcher 要結構（Molfile），交給 Worker 中的 RDKit 解析，更新下方 canonical SMILES 與驗證訊息
   - 避免兩邊互相觸發造成無限更新
10. `App.tsx` 把這張卡片放在頁首下方。

### D. 結構驗證（2.3，D31）

11. 在 `src/worker/` 的化學 Worker 增加請求：輸入 Molfile 或 SMILES，回傳 `{ valid, canonicalSmiles, molblock, problems[] }`。
12. 驗證邏輯寫在 `src/core/structure/`（純 TypeScript，可在 Node 測試）：
    - SMILES 不合法、價數錯誤 → 不合法，附中文訊息
    - 含反應式或查詢結構特徵 → 拒絕，訊息說明「MoleForm 只接受分子結構」（D31）
    - 含連接點 `*` → **允許**，但加一條提示「含連接點 `*`，聚合物重複單元功能在 Phase 5 提供」
    - 空白結構 → 提示「尚未輸入結構」，不視為錯誤
13. 參考 CheMScutter `src/shared/inputErrors.ts` 的錯誤分類方式（可複製後改寫），訊息改成 MoleForm 的情境；`src/shared/structureChecks.ts` 依 D31 改寫後放進 `src/core/structure/`。
14. 測試 `tests/structure/`（只檢查程式行為，不判斷化學正確性，D17）：
    - 合法：`CCO`、苯 `c1ccccc1`、L-丙胺酸 `C[C@@H](C(=O)O)N`、反式 2-丁烯 `C/C=C/C`、BADGE `CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`
    - **手性與 E/Z 保留**：上面含手性與 E/Z 的分子，經「SMILES → Molfile → 再解析」後 canonical SMILES 不變
    - 不合法：`C1CC`（環未閉合）、`C(C)(C)(C)(C)C`（碳五價）、`xyz`
    - 拒絕：反應 SMILES `CCO>>CC=O`；查詢結構（例如 SMARTS 特徵 `[C,N]`）
    - 允許並提示：`*CC*`、`[*:1]CC[*:2]`

### E. MOL／SDF 匯入匯出（2.4）

15. **匯入**：按鈕選取 `.mol` 或 `.sdf` 檔，在瀏覽器內讀取（不上傳任何地方，D23）。SDF 有多筆時，列出筆數並讓使用者選一筆（顯示每筆的名稱欄或序號）；載入後同樣經過驗證並顯示在 Ketcher。
16. **匯出**：「下載 MOL」「下載 SDF」兩個按鈕，用 RDKit 由目前結構產生 Molfile（V2000，2D 座標）；SDF 為 Molfile 加 `$$$$`。下載邏輯參考 CheMScutter `src/ui/results/ExportButton.tsx` 的 Blob 下載部分（複製並抽成通用函式 `src/ui/download.ts`）。檔名預設 `moleform-structure.mol`／`.sdf`。
17. 測試：讀取多筆 SDF 的解析函式（放 `src/core/structure/`）能正確分筆；匯出的 Molfile 再讀回後 canonical SMILES 不變。

### F. 檢查、文件、提交、推送

18. 依序執行 `npm run typecheck`、`npm test`、`npm run build`，全部通過；`dist/ketcher/` 存在且含 `THIRD-PARTY-NOTICES.txt`。
19. **Windows 中文路徑**（K05）：本機在 `程式` 路徑下建置 Ketcher 子專案是否正常，結果寫進報告並更新 K05。
20. 本機 `npm run dev` 時確認 Ketcher iframe 能載入（若 dev 模式下子專案需另外啟動或有特殊做法，照 CheMScutter 的方式並寫進 `README` 或報告）。
21. 提交（訊息：`結構輸入：Ketcher、SMILES、驗證、MOL／SDF（任務 010）`），推送方式依 `AGENTS.md`。

## 不可更動的檔案或規則

- **不得修改 CheMScutter 的任何檔案，也不得在其中執行任何指令**（D27），只能讀取與複製
- 不得改變 Ketcher 相關套件的版本
- 不得顯示分子量、官能基種類、數量或當量（D09）
- 不得加入任何物性計算
- 不得把使用者的結構傳到任何外部服務（不加 PubChem 等查詢，D23）
- 不得在 `src/data/` 填入化學資料
- 除複製 Ketcher 子專案帶入的套件外，不安裝新套件；需要時先問使用者
- 不得修改 git 或認證設定；不得 force push

## 完成標準（可檢查）

- [ ] `npm run typecheck`、`npm test`、`npm run build` 全部通過
- [ ] `tests/structure/` 的合法、不合法、拒絕、允許並提示四類測試全部通過；手性與 E/Z 來回轉換後不變
- [ ] `solvents.csv` 缺 SMILES 的刻意錯誤會被抓到
- [ ] `dist/ketcher/` 存在且含 `THIRD-PARTY-NOTICES.txt`
- [ ] 推送成功
- [ ] 報告列出請使用者在瀏覽器確認的項目（見下方）

## 完成後請做

1. 更新 `docs/PLAN.md`：2.1–2.4 **先不要勾**，等使用者在瀏覽器確認後再勾
2. 新增 `docs/reports/010-結果.md`，內容包含：
   - 複製的檔案（註明 CheMScutter 原路徑）與新增的檔案
   - `main.tsx` 輸入限制改了什麼、保留了什麼
   - 測試、建置、推送結果；K05 中文路徑的結果
   - **請使用者在瀏覽器確認的清單**：畫苯環後 SMILES 是否出現；輸入 `C[C@@H](C(=O)O)N` 載入後畫面是否顯示手性；輸入 `CCO>>CC=O` 是否被拒絕並顯示中文訊息；輸入 `*CC*` 是否允許並顯示提示；匯出 MOL 再匯入是否得到同一結構；SDF 多筆時能否選擇
   - 遇到的問題
   - 需要使用者決定的事
3. 更新 `docs/KNOWN_ISSUES.md` 的 K05；若有新問題一併寫入
4. 報告與文件一併提交並推送

## 需要先問使用者的情況

- 推送失敗
- Ketcher 子專案在中文路徑下無法建置
- Ketcher 無法顯示或匯出連接點 `*`（記錄現象後問使用者，不要自行改成拒絕）
- 需要安裝新套件，或需要改變 Ketcher 套件版本
- 任務內容與 `docs/DECISIONS.md` 衝突
