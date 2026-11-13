# 任務 038b：更新 PLAN——新增 Phase 6A（本機版與 Python 引擎，提前）與 Phase 10（微影）

編號：038b
建立日期：2026-11-13

指派給：Claude Code

## 目標

使用者 2026-11-13 決定：計算最終搬到 Python，為避免「新計算先寫在 TypeScript 再整批搬遷」的重工，**本機版（Windows 桌面）與 Python 引擎提前，放在 Phase 6 剩餘的新計算模組之前**；之後的新計算模組直接寫在 Python。微影模組排在 Phase 6A 之後。本卡只更新文件（`docs/PLAN.md`、`docs/DECISIONS.md`），不寫程式。

## 前置條件（先讀這些）

- `docs/PLAN.md`、`docs/DECISIONS.md`（D01–D61 的格式與編號）、`AGENTS.md`
- `docs/plans/lithography-integration-plan-v1.0.md`（使用者的整合規劃文件，v1.0，2026-11-13；只讀）
- `docs/tasks/038-relative-tg-ffv.md`、`docs/tasks/039-local-desktop.md`

## 要做的事

1. `docs/PLAN.md`：更新檔頭「最後更新」日期；時程參考那句加註「不含 Phase 6A 與 Phase 10」。
2. 在 Phase 6 之前新增 **Phase 6A：本機版與 Python 計算引擎（提前，D62）**，格式比照其他 Phase（目的、開工前需要使用者決定：使用者需先安裝 Python；項目全部 `[ ]`）：
   - 6A.0 盤點現有架構與離線障礙（任務 039 的 A）
   - 6A.1 Windows 桌面外殼：Electron 封裝現有網頁（任務 039 的 B-1 到 B-5）
   - 6A.2 Python 計算引擎原型：只監聽 127.0.0.1，資料格式含值、單位、來源、狀態（`measured / literature / fitted / predicted / assumed / missing`）（任務 039 的 B-6）
   - 6A.3 搬遷盤點：列出每個現有計算模組、依賴與對應測試，訂搬遷順序（新模組要用到的核心鏈優先：VW、Va、莫耳體積與密度、Tg、CTE）；規則：以 TypeScript 輸出為黃金標準，Python 版逐字相同才停用 TypeScript 版；過渡期用開關切換，預設用 TypeScript
   - 6A.4 計算模組逐一搬遷（每模組一張卡，通過黃金比對才算完成）
   - 補註：介面與桌面外殼維持 TypeScript，計算最終在 Python；**6A.2 完成後，新的計算模組一律直接寫在 Python，不先寫 TypeScript**；任務 038 已定稿且依賴 TypeScript 函式，仍以 TypeScript 完成，之後隨 6A.4 搬遷；即時輸入回饋類的小計算可留在 TypeScript，由 6A.3 逐項決定
3. Phase 6 補註「剩餘工作建議順序」（只是順序，不是勾選項目）：任務 038 → Phase 6A → 6.7 剩餘（混合密度、混合介電常數、共聚比例影響）→ 6.4 的 Tm、Td（預留任務 040）→ 6.5 → 6.8 → 6.9。已有的勾選狀態與補註一字不改。
4. Phase 9 之後新增 **Phase 10：微影模組（暫列，Phase 6A 完成且使用者決定開工後才開）**，全部 `[ ]`：
   - 10.1 M04：薄膜 TMM、BARC、駐波（Python；以 Fresnel 解析解與現成 TMM 套件交叉驗證）
   - 10.2 M01–M03：光罩、空中影像、NILS、FEM
   - 10.3 M05–M07：Dill ABC、CAR 反應擴散、顯影（**需要有實驗參數才有定量意義**；沒有就只做趨勢）
   - 10.4 科學驗證中心：測試輸出 `PASS / FAIL / INCOMPLETE`，結果狀態分 Analytical verified、Numerically converged、Literature benchmarked、Calibrated、Predictively validated、Exploratory
   - 補註：MoleForm 的 pKa、Tg、自由體積不能直接當作酸擴散係數、去保護速率或產酸效率（整合規劃文件第 2.2 節）；時程只是規劃估計，不是工期承諾；內容出處為整合規劃文件，註明章節
5. `docs/DECISIONS.md` 新增 D62：「本機版（Windows 桌面）與 Python 計算引擎提前為 Phase 6A，放在 Phase 6 剩餘的新計算模組之前；介面與桌面外殼維持 TypeScript（Electron），計算最終搬到 Python，以現有測試輸出為黃金標準逐模組搬遷；6A.2 完成後新計算模組直接寫在 Python；微影為 Phase 10；不再以 GitHub Pages 或 Cloudflare 部署為目標」，來源：使用者 2026-11-13 決定（避免先寫 TypeScript 再搬遷的重工）。更新檔頭日期。
6. `docs/tasks/039-local-desktop.md` 檔頭的狀態行改為：`狀態：優先執行（PLAN 6A.0–6A.2，D62）`；其餘不動。
7. 新增 `docs/reports/038b-結果.md`：改了哪些檔案、新增的 Phase 6A 與 Phase 10 項目清單，commit。GitHub 目前被停權：只 commit 到本機，不 push，不確認 CI，報告註明「未 push」。

## 不可更動的檔案或規則

- 不修改任何程式、資料表、測試；不更動 PLAN 中已有項目的勾選狀態與已有補註文字
- 不使用記憶中的數值與 DOI
- 不更改已定案決定（D01–D61）；與決定衝突時停下來回報

## 完成標準（可檢查）

- [ ] PLAN 新增 Phase 6A（6A.0–6A.4）與 Phase 10（10.1–10.4），全部未勾選；Phase 6 補註已加，其餘一字未改（用 diff 確認）
- [ ] D62 寫入；039 狀態行已更新
- [ ] 報告完成，已 commit（本機）

## 需要先問使用者的情況

- 任務與 `docs/DECISIONS.md` 衝突
- 整合規劃文件的內容與現有決定衝突
