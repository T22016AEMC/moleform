# 任務 M01：VW 搬到 Python 引擎（PLAN 6A.4-01）

編號：M01
建立日期：2026-11-13
指派給：Claude Code

## 目標

D62／D63：計算最終搬到 Python 引擎，以現有 TypeScript 輸出為黃金標準逐字比對。本卡搬遷核心鏈第一個計算模組：范德華體積（VW）。**TypeScript 的計算不得修改，仍是預設。**

## 前置條件（先讀這些）

- `docs/reports/039a-結果.md` 第 1a、3、4 節；`docs/reports/M00-結果.md`、`docs/reports/M00a-結果.md`；`docs/DECISIONS.md` 的 D18、D22、D62、D63
- `engine/` 現有共用層與黃金比對框架（M00 完成）、`scripts/golden/` 現有匯出程式
- 只讀 TypeScript 來源：`src/core/properties/vanDerWaalsVolume.ts`、`src/data/vwGroups*`、`src/data/vwGroupsBondi*`，以及 `src/data/` 中對應的 CSV；對應測試：`vanDerWaalsVolume`、`vwGroups`、`vwBondi`
- 不要搜尋整個專案，不要用 codegraph 反覆搜尋

## 要做的事

1. **Python 實作**：在 `engine/` 新增 VW 模組，演算法與 `vanDerWaalsVolume.ts` 完全等價：基團切分（含書中表與 Bondi 補充表的優先順序、芳香碳切分、環減量、`DUMMY_END_RULES` 的端基處理）、缺基團回報、警告與備註文字。資料表直接讀取專案現有 CSV（單一來源，不得複製或改寫資料，D18、D22）。不得憑記憶補任何數值。
2. **風險 R1、R3、R4 逐項處理**，各在報告寫出做法與依據：
   - R1 芳香性：用 `atom.GetIsAromatic()` 與 TS 的 `aromaticAtoms` 對照；
   - R3 SMARTS 配對：先查 TS 端實際使用的 `get_substruct_matches` 預設行為，在 Python 端明確設定對應參數，並確認配對順序與命中原子集合一致；切分結果取決於配對順序時，必須保持與 TS 相同的順序；
   - R4 SMARTS 解析：資料表每一筆 SMARTS 在 Python 都能解析，正反例結果與 TS 一致。
   原子索引、氫數、基團順序與 TS 不一致時**停下來回報**，不要用排序掩蓋。
3. **黃金匯出**：新增 `scripts/golden/export-vw.ts`，只呼叫現有 TS 函式。輸入集合：vw_groups、vw_groups_bondi 的正反例 SMILES；`docs/verification/phase6-VW-TPSA-LogP-輸出.md` 與 `scripts/verification/phase6-*.ts` 中的分子清單（小分子、聚合物單元、環氧單元、BT01–BT06）；030／031 診斷輸出的分子；另加 R1、R3 專屬案例（雜環、稠環、含 `*` 的重複單元、需要優先順序判斷的基團）。輸出 `tests/golden/vw.json`，格式沿用 M00。
4. **Python 比對測試**：沿用 M00 的比對規則（字串、整數、陣列逐字；浮點先比最短字串，不同才允許相對誤差 1e-12，且必須列入 `tolerance_cases`，不得靜默放寬）。
5. **引擎介面**：引擎新增 VW 的請求／回應（輸入 SMILES 或單元、輸出沿用 `value/unit/source/status` 格式與缺基團清單），只在本機 127.0.0.1 內部連線。**不接到介面，不做切換**。
6. 報告 `docs/reports/M01-結果.md` 寫精簡：實作範圍、R1／R3／R4 做法與結論、案例數與通過數、`tolerance_cases`、需要使用者決定的事。
7. 本機只跑本卡新增的檢查、引擎 pytest、型別檢查；全部 TypeScript 測試與建置交給 CI。commit、push，確認 CI 的 build、`engine`、`golden-fresh` 三個 job 都通過。

## 不可更動的檔案或規則

- 不修改 `src/` 的計算、資料表與既有測試；既有 CI job 不改（`golden-fresh` 會自動涵蓋新黃金檔，若需把 `export-vw.ts` 納入其比對，只做最小必要的調整並在報告說明）
- 不使用記憶中的數值與版本號；不更改已定案決定
- 引擎只在 127.0.0.1 內部連線，不對外；不得實作 VW 以外的物性公式
- 測試時不要留下背景程式

## 完成標準（可檢查）

- [ ] Python VW 與 TS 在黃金案例上全數相符（`tolerance_cases` 列出，若有）
- [ ] R1、R3、R4 各有專屬案例與結論
- [ ] 型別檢查、引擎 pytest 通過；CI 三個 job 通過；已 commit 與 push

## 需要先問使用者的情況

- 原子順序、氫數、芳香性或 SMARTS 配對順序與 TS 無法一致
- 需要修改 TypeScript 的計算檔才能匯出黃金資料
- 浮點需要超過 1e-12 的容差
- 任務與 `docs/DECISIONS.md` 衝突
