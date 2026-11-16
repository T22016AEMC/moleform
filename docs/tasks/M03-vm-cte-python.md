# 任務 M03：Vm／密度與 CTE 搬到 Python 引擎（PLAN 6A.4-04、6A.4-05）

編號：M03
建立日期：2026-11-16
指派給：Claude Code

## 目標

D62／D63：計算最終搬到 Python 引擎，以現有 TypeScript 輸出為黃金標準逐字比對。M01（VW）、M02（Tg）已完成。本卡搬遷核心鏈接下來兩個模組：莫耳體積與密度（Va／Vc，狀態依 Tg 判斷玻璃態／橡膠態）與 CTE。兩者都只依賴 VW 與 Tg，合併一張卡。**TypeScript 的計算不得修改，仍是預設。**

使用者 2026-11-16 的決定：（1）算得出的值狀態標 `"predicted"`；（2）TS 既有特性（映射編號 `[*:1]` 變 `*`、順反標示消失、`stereoAtoms` 不重編號、空字串拋例外）搬遷期間不修，Python 照 TS 重現，黃金標準不動；（3）資料表格式錯誤時 Python 直接報錯、TS 靜默丟列，記為已知差異，資料表打包路徑等 D63 再定。

## 前置條件（先讀這些）

- `docs/reports/039a-結果.md` 第 1a、3 節；`docs/reports/M01-結果.md`、`docs/reports/M02-結果.md` 全文；`docs/DECISIONS.md` 的 D18、D22、D57、D58、D62、D63
- `engine/` 現有共用層、`vw.py`、`tg.py`、黃金比對框架、`scripts/golden/export-vw.ts`、`export-tg.ts`（寫法範本）
- 只讀 TypeScript 來源：`src/core/properties/molarVolumeDensity.ts`、`src/core/properties/cte.ts`、`src/data/` 中的 molar_volume_polymer_groups 與對應 CSV；對應測試：`molarVolumeDensity`、`molarVolumeGroups`、`cte`
- 不要搜尋整個專案，不要用 codegraph 反覆搜尋

## 要做的事

1. **Python 實作**：在 `engine/` 新增 Vm／密度與 CTE 兩個模組，演算法與 TS 完全等價：Va／Vc 基團切分與書中表、玻璃態／橡膠態判斷（呼叫已完成的 Python Tg）、密度換算、缺基團回報、警告與備註文字；CTE 由 VW 與 Tg 計算。資料表直接讀專案現有 CSV（單一來源，D18、D22），不得複製或改寫，不得憑記憶補數字。呼叫 `vw.py`、`tg.py` 時直接用它們的 Python 函式，不經 HTTP。
2. **風險**：R3（SMARTS 配對）、R4（SMARTS 解析）、R2（原子索引與氫數）、R1（芳香性）沿用 M01／M02 做法，各舉專屬案例並寫結論；原子索引、配對順序與 TS 不一致時**停下來回報**。
3. **浮點**：所有加總用明確迴圈（不用 Python 內建 `sum()`）；除法、乘法、冪次、對數的運算順序與 TS 逐步對照。`pow`／`log` 末位若與 TS 不同，記錄案例，不得靜默放寬。
4. **黃金匯出**：新增 `scripts/golden/export-vm.ts`、`export-cte.ts`，只呼叫現有 TS 函式。輸入集合：molar_volume_polymer_groups 的正反例 SMILES；`molarVolumeDensity`、`molarVolumeGroups`、`cte` 測試的聚合物；`docs/verification/phase6-Vm-密度-輸出.md`（11 個書中聚合物、BT）與 `phase6-自由體積-CTE-輸出.md`；`scripts/verification/phase6-*.ts` 的分子清單。另加專屬案例：Tg 恰在玻璃態／橡膠態判斷邊界附近的單元、含 `*` 的單元、雜環與稠環、缺基團情況。輸出 `tests/golden/vm.json`、`tests/golden/cte.json`，格式沿用 M00～M02。
5. **Python 比對測試**：沿用規則（字串、整數、陣列逐字；浮點先比最短字串，不同才允許相對誤差 1e-12，且必須列入 `tolerance_cases`）。做反向驗證：人為破壞（例如改玻璃態判斷門檻、改配對順序）後黃金比對必須失敗，結果列入報告。
6. **引擎介面**：新增 `POST /vm`、`POST /cte`，沿用 `value/unit/source/status` 格式；SMILES 無效回 400；空字串由 HTTP 介面先擋下回 400（與 `/tg` 相同）。只在 127.0.0.1，**不接到介面，不做切換**。
7. **已知差異與待修清單**（只寫文件）：新增 `docs/migration-known-issues.md`，列出 M01、M02、M03 中「Python 照 TS 重現、之後要修」的項目，每項一列：編號、現象、發生條件、影響（誤報缺基團或算錯數字）、來源報告、處理計畫（核心鏈在 Python 通過、TS 退場後，只在 Python 修，再重產黃金檔）。M02 報告的映射編號、順反標示、`stereoAtoms`、空字串拋例外、資料表丟列差異必須列入；M03 若發現新的，同樣列入。
8. 報告 `docs/reports/M03-結果.md` 寫精簡：實作範圍、各風險結論、案例數與通過數、`tolerance_cases`、反向驗證表、需要使用者決定的事。
9. 本機只跑本卡新增的檢查、引擎 pytest、型別檢查；全部 TypeScript 測試與建置交給 CI。commit、push，確認 CI 的 build、engine、golden-fresh 三個 job 都通過。

## 不可更動的檔案或規則

- 不修改 `src/` 的計算、資料表與既有測試；既有 CI job 不改（`golden-fresh` 自動涵蓋新匯出程式，若需調整只做最小必要變更並在報告說明）
- 不使用記憶中的數值與版本號；不更改已定案決定
- 引擎只在 127.0.0.1 內部連線，不對外；不得實作 Vm／密度與 CTE 以外的物性公式
- 測試時不要留下背景程式

## 完成標準（可檢查）

- [ ] Python Vm／密度與 CTE 在黃金案例上全數相符（`tolerance_cases` 列出，若有）
- [ ] 玻璃態／橡膠態邊界有專屬案例；反向驗證會失敗
- [ ] `docs/migration-known-issues.md` 完成
- [ ] 型別檢查、引擎 pytest 通過；CI 三個 job 通過；已 commit 與 push

## 需要先問使用者的情況

- 原子順序、氫數、芳香性或 SMARTS 配對順序與 TS 無法一致
- 需要修改 TypeScript 的計算檔才能匯出黃金資料
- 浮點需要超過 1e-12 的容差
- 任務與 `docs/DECISIONS.md` 衝突
