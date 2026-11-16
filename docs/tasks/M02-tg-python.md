# 任務 M02：Tg（Yg 基團貢獻）搬到 Python 引擎（PLAN 6A.4-02）

編號：M02
建立日期：2026-11-13
指派給：Claude Code

## 目標

D62／D63：計算最終搬到 Python 引擎，以現有 TypeScript 輸出為黃金標準逐字比對。M01（VW）已完成。本卡搬遷核心鏈第二個模組：Tg（Van Krevelen Yg 基團貢獻，含校正基團）。**TypeScript 的計算不得修改，仍是預設。**

使用者 2026-11-13 的決定（沿用 M01 報告第 8 節）：資料表格式有問題時 Python 直接報錯（D22），TS 靜默丟列的舊行為記為已知差異，不改 TS；算得出的值狀態標 `"predicted"`；資料表路徑等 D63 打包時再決定。

## 前置條件（先讀這些）

- `docs/reports/039a-結果.md` 第 1a、3 節（尤其 R2、R3、R5）；`docs/reports/M01-結果.md` 全文（含第 8 節與「給之後搬遷卡的陷阱」）；`docs/DECISIONS.md` 的 D18、D22、D62、D63
- `engine/` 現有共用層、`vw.py`、黃金比對框架、`scripts/golden/export-vw.ts`（作為寫法範本）
- 只讀 TypeScript 來源：`src/core/properties/tgGroupContribution.ts`、`src/data/ygGroups*`、`src/data/ygCalibratedGroups*` 與對應 CSV；對應測試：`tg`、`ygCalibrated`
- 不要搜尋整個專案，不要用 codegraph 反覆搜尋

## 要做的事

1. **Python 實作**：在 `engine/` 新增 Tg 模組，演算法與 `tgGroupContribution.ts` 完全等價：基團切分、校正基團、Tg＝ΣYg/ΣM、缺基團回報、警告與備註文字。資料表直接讀專案現有 CSV（單一來源，D18、D22），不得複製或改寫資料，不得憑記憶補數字。重複使用 M01 已建立的 SMARTS 配對做法（R3：明確設定與 TS 相同的 `get_substruct_matches` 預設參數，保持未排序的原始順序）。
2. **R5（本卡最大風險）**：TS 的 `tgGroupContribution.ts` 約 491–514 行「改寫 JSON 後重建分子再取 canonical SMILES」（`delete m.extensions`、芳香性重判）。Python 沒有 JSON 輸入對等路徑，要用 `RWMol` 改寫。你要先讀懂 TS 這一段到底改了什麼、為什麼，再在 Python 寫出等價做法，並在報告寫出：做法、依據、以及 canonical SMILES 與 TS 是否逐字一致。**不一致時停下來回報**，不要用正規化或字串後處理掩蓋。
3. **R2 逐項處理**：原子索引（缺基團原子位置輸出）與隱式氫數、重建分子後的原子順序，都要與 TS 一致；不一致時停下來回報。
4. **R3、R4、R1**：沿用 M01 的做法，各舉專屬案例；Yg 表與校正表的每一筆 SMARTS 在 Python 都能解析，正反例結果與 TS 一致；無法解析的 SMARTS 兩邊都判為無效。
5. **浮點陷阱（M01 的教訓）**：Python 內建 `sum()` 對浮點用補償加總，與 JS 的 `reduce` 不同，會造成逐字不一致。所有加總一律用明確迴圈，順序與 TS 相同。除法、乘法的運算順序也與 TS 逐步對照。
6. **黃金匯出**：新增 `scripts/golden/export-tg.ts`，只呼叫現有 TS 函式。輸入集合：yg_groups、yg_calibrated_groups 的正反例 SMILES；`tg`、`ygCalibrated` 測試的書中聚合物；`docs/verification/phase6-Tg-輸出.md` 的 12 個聚合物對照與 BT01–BT06；`scripts/verification/phase6-*.ts` 的分子清單；另加 R5 專屬案例（需要改寫重建的單元：含 `*` 連接點、雜環、稠環、有手性或雙鍵立體的單元）與 R1／R3 專屬案例。輸出 `tests/golden/tg.json`，格式沿用 M00／M01。
7. **Python 比對測試**：沿用規則（字串、整數、陣列逐字；浮點先比最短字串，不同才允許相對誤差 1e-12，且必須列入 `tolerance_cases`，不得靜默放寬）。對 R5 案例，把 canonical SMILES 與重建後的原子順序做逐字比對。
8. **引擎介面**：新增 `POST /tg`，輸入、輸出沿用 `value/unit/source/status` 格式與缺基團清單；SMILES 無效回 400。只在 127.0.0.1 內部連線，**不接到介面，不做切換**。
9. 報告 `docs/reports/M02-結果.md` 寫精簡：實作範圍、R5 做法與結論、R1／R2／R3／R4 結論、案例數與通過數、`tolerance_cases`、需要使用者決定的事。
10. 本機只跑本卡新增的檢查、引擎 pytest、型別檢查；全部 TypeScript 測試與建置交給 CI。commit、push，確認 CI 的 build、engine、golden-fresh 三個 job 都通過。

## 不可更動的檔案或規則

- 不修改 `src/` 的計算、資料表與既有測試；既有 CI job 不改（`golden-fresh` 自動涵蓋新匯出程式，若需調整只做最小必要變更並在報告說明）
- 不使用記憶中的數值與版本號；不更改已定案決定
- 引擎只在 127.0.0.1 內部連線，不對外；不得實作 Tg 以外的物性公式
- 測試時不要留下背景程式

## 完成標準（可檢查）

- [ ] Python Tg 與 TS 在黃金案例上全數相符（`tolerance_cases` 列出，若有）
- [ ] R5 有專屬案例，canonical SMILES 與原子順序逐字一致，報告有做法與依據
- [ ] R1、R2、R3、R4 各有結論
- [ ] 型別檢查、引擎 pytest 通過；CI 三個 job 通過；已 commit 與 push

## 需要先問使用者的情況

- R5 的 canonical SMILES 或重建後原子順序與 TS 無法一致
- 原子索引、氫數、芳香性或 SMARTS 配對順序與 TS 無法一致
- 需要修改 TypeScript 的計算檔才能匯出黃金資料
- 浮點需要超過 1e-12 的容差
- 任務與 `docs/DECISIONS.md` 衝突
