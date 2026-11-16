# 任務 M05：其餘計算模組一次搬到 Python 引擎（PLAN 6A.4-06 至 6A.4-13）

編號：M05
建立日期：2026-11-16
指派給：Claude Code

## 目標

D62／D63：計算搬到 Python 引擎，以現有 TypeScript 輸出為標準。M00～M04 已完成（共用層、VW、Tg、Vm／密度、CTE、聚合物基礎）。本卡一次搬完其餘所有計算模組，最後只驗證一次。**TypeScript 的計算不得修改，仍是預設，不接到介面，不做切換。**

## 建置規則（使用者 2026-11-16 定）

- 彼此相關的功能一次建完，不為驗證而拆卡。
- 不必要的驗證不做：不做反向驗證、不做邊界探針、不加額外專屬案例、不寫風險逐項說明。
- 只在全部完成後驗證一次。
- 報告限一頁。push 後只查一次 CI，不重複輪詢。
- 搬遷期間 TS 既有特性照 TS 重現，不修；Python 直接報錯、TS 靜默丟列的資料表差異沿用已知差異；資料表路徑等 D63 打包時再定；狀態值標 `"predicted"`。

## 前置條件（先讀這些）

- `docs/migration-known-issues.md`、`docs/reports/M04-結果.md`、`docs/DECISIONS.md` 的 D18、D22、D62、D63
- `engine/` 現有程式（`vw.py`、`tg.py`、`vm.py`、`cte.py`、聚合物基礎模組、黃金比對框架）與 `scripts/golden/` 現有匯出程式（作為寫法範本）
- 只讀下列 TS 來源與對應測試，不要搜尋整個專案，不要用 codegraph 反覆搜尋
- 浮點規則（M01 教訓）：加總一律用明確迴圈，不用 Python 內建 `sum()`；運算順序與 TS 對照；JS 的 `Math.round` 與 Python `round` 不同，需用等價寫法

## 要做的事

依下列順序實作，**每組完成後各 commit 一次**（本機即可，最後一併 push），避免額度中斷時重做：

**組 1：物性鏈**

1. `properties/freeVolume.ts` 與 `data/freeVolumeTables`（自由體積）
2. `properties/relativeTg.ts`、`properties/packingCoefficientK`（`src/data/packing_coefficient_k.csv`）、`properties/tgMixing.ts` 中的 `foxMix`（相對 Tg；只需 `foxMix`，不必等整個 tgMixing）
3. `properties/jobackTbTf.ts` 與 joback 資料表
4. `properties/tgMixing.ts` 其餘部分、`tgMnData`、`tgFit.ts`、`novolacUnits.ts`（成分 Tg，Fox–Flory 與回歸）。依 039a 建議，不搬 `formulation/compute`、`formulation/molecularWeight`：Python 版由呼叫端傳入已算好的質量分率與分子量
5. `properties/dielectricRefraction.ts` 與 molar_refraction、polarization 兩張資料表
6. `properties/tpsaLogp.ts`（TPSA、Crippen LogP；RDKit 描述子，注意 `includeSandP` 預設值與 TS 一致）

**組 2：交聯**

7. `crosslink/groups.ts`、`analyze.ts`、`judge.ts`（第 0 層；`draw.ts` 留 TS）
8. `crosslink/layer1/` 的 `layer1`、`millerMacosko`、`stoich`、`prepare`（第 1 層；distribution 已在 M04）

**引擎介面與文件**

9. 每個模組在引擎新增對應的 `POST` 路徑，沿用 `value/unit/source/status` 格式；輸入無效回 400；只在 127.0.0.1。
10. 新發現的 TS 既有特性（Python 照重現、之後要修）接續編號寫進 `docs/migration-known-issues.md`。

**驗證（全部完成後只做一次）**

11. 新增 `scripts/golden/export-remaining.ts`（可沿用現有命名分檔），只呼叫現有 TS 函式，輸入只取：現有測試的輸入、`docs/verification/phase6-*.md` 與 `scripts/verification/phase6-*.ts` 的分子與算例。輸出 `tests/golden/*.json`，格式沿用 M00～M04。
12. Python 比對一次跑完（字串、整數、陣列逐字；浮點先比最短字串，不同才允許相對誤差 1e-12 並列入 `tolerance_cases`）。同時與 `docs/verification/phase6-*.md` 中的 TS 數字對照。
13. 與 TS 不一致時：判斷是 Python 寫錯就修；若是 RDKit 行為差異而無法對齊，**停下來回報**，不要用排序或字串後處理掩蓋。

## 收尾

14. 報告 `docs/reports/M05-結果.md`，限一頁：每組完成狀況、案例數與通過數、`tolerance_cases`、與 TS 不一致處、需要使用者決定的事。
15. 本機只跑本卡新增的檢查、引擎 pytest、型別檢查；全部 TypeScript 測試與建置交給 CI。push，查一次 CI（build、engine、golden-fresh）結果，不重複輪詢。

## 不可更動的檔案或規則

- 不修改 `src/` 的計算、資料表與既有測試；既有 CI job 不改（`golden-fresh` 會涵蓋新匯出程式，需調整時只做最小必要變更並在報告說明）
- 不使用記憶中的數值與版本號；不更改已定案決定
- 引擎只在 127.0.0.1 內部連線，不對外
- 不搬：`formulation/compute`、`molecularWeight`、`structure/*`、`conformer/*`、`library/*`、`crosslink/draw`（留 TS）
- 測試時不要留下背景程式

## 完成標準（可檢查）

- [ ] 組 1、組 2 全部模組已搬，各組各有一個 commit
- [ ] 一次驗證完成：黃金比對通過，`tolerance_cases` 列出（若有），並與 Phase 6 驗證文件的數字一致
- [ ] 型別檢查、引擎 pytest 通過；CI 三個 job 通過；已 push

## 需要先問使用者的情況

- 分子量（原子量表）、原子順序、芳香性或 SMARTS 配對順序等 RDKit 行為與 TS 無法一致
- 需要修改 TypeScript 的計算檔才能匯出黃金資料
- 浮點需要超過 1e-12 的容差
- 任務與 `docs/DECISIONS.md` 衝突
