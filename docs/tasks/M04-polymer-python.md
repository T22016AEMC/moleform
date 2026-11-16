# 任務 M04：聚合物基礎搬到 Python 引擎（PLAN 6A.4-03）

編號：M04
建立日期：2026-11-16
指派給：Claude Code

## 目標

D62／D63：計算最終搬到 Python 引擎，以現有 TypeScript 輸出為黃金標準逐字比對。M01～M03（VW、Tg、Vm／密度、CTE）已完成。本卡搬遷聚合物基礎，供之後的自由體積、相對 Tg、成分 Tg、交聯第 1 層使用：`polymer/repeatUnit`、`polymer/endGroups`、`polymer/copolymer`、`polymer/convert`、`polymer/distribution`。**TypeScript 的計算不得修改，仍是預設；這些在介面上維持 TS，Python 版只供引擎內部物性使用（039a 第 6 節）。**

使用者 2026-11-16 的決定：（1）TS 既有特性搬遷期間不修，Python 照 TS 重現；（2）Vm 與 CTE 的 Tg 不一致（P01）照 TS 不動，列待決；（3）CTE 回傳六個值、小分子回 200 加 `missing` 照 M03 的做法；（4）資料表格式錯誤 Python 直接報錯，記為已知差異。

## 前置條件（先讀這些）

- `docs/reports/039a-結果.md` 第 1c、3（R2、R7）、6 節；`docs/reports/M01～M03-結果.md`；`docs/migration-known-issues.md`；`docs/DECISIONS.md` 的 D18、D22、D62、D63
- `engine/` 現有共用層與黃金比對框架、`scripts/golden/` 現有匯出程式（寫法範本）
- 只讀 TypeScript 來源：`src/core/polymer/repeatUnit.ts`、`endGroups.ts`、`copolymer.ts`、`convert.ts`、`distribution.ts`（`unitFragment.ts`、`types.ts` 只在需要型別時讀）；對應測試：`repeatUnit`、`endGroups`、`copolymer`、`mwPdi` 等、`layer1` 中使用 distribution 的部分
- 不要搜尋整個專案，不要用 codegraph 反覆搜尋

## 要做的事

1. **Python 實作**：在 `engine/` 新增五個模組，演算法與 TS 完全等價：連接點檢查、單元分子量與分子式、端基分析與換算、random 共聚平均單元、Mw／Mn／DP／PDI 換算、兩成分等重量分布近似。所有警告與備註文字與 TS 逐字相同。資料取自專案現有資料表，不得憑記憶補數字。
2. **R2、R7 逐項處理**，各在報告寫出做法與依據：
   - R2 原子索引與隱式氫數：連接點（`*`）位置、鄰居原子順序與 TS 一致；
   - R7 分子量：TS 用 RDKit 描述子 `amw`，Python 用對應的 `Descriptors.MolWt` 或等價函式，先查兩邊實際取用的原子量表是否一致，再用黃金案例確認逐字相同；若原子量表不同導致浮點不同，**停下來回報**，不要自行換成專案的原子量表；
   - 分子式字串（元素排序、氫的位置）與 TS 逐字相同。
   原子順序、分子式、分子量與 TS 不一致時停下來回報。
3. **浮點**：加總用明確迴圈（不用 Python 內建 `sum()`）；除法、乘法、冪次、對數的運算順序與 TS 逐步對照；整數與浮點的區分（JS 只有 number）要特別小心，例如 DP 取整、`Math.round` 與 Python `round`（銀行家捨入）不同，必須用明確寫出的等價做法並加專屬案例。`pow`／`log` 末位若與 TS 不同，記錄案例，不得靜默放寬。
4. **黃金匯出**：新增 `scripts/golden/export-polymer.ts`（可分檔，沿用現有命名），只呼叫現有 TS 函式。輸入集合：`repeatUnit`、`endGroups`、`copolymer`、`mwPdi`、`layer1` 測試中的輸入；`docs/verification/` 與 `scripts/verification/phase6-*.ts` 中出現的聚合物單元；另加專屬案例：連接點在環上或在支鏈上、`*` 只有一個或超過兩個（錯誤路徑）、含 `[*:1]` 映射編號、雜環與稠環單元、共聚比例邊界（0、1、極小）、PDI＝1 與極大、Mw 小於端基質量、`Math.round` 的 .5 邊界。輸出 `tests/golden/polymer-*.json`，格式沿用 M00～M03，錯誤路徑的輸出（例外訊息或 invalid）也要匯出。
5. **Python 比對測試**：沿用規則（字串、整數、陣列逐字；浮點先比最短字串，不同才允許相對誤差 1e-12，且必須列入 `tolerance_cases`）。做反向驗證：人為破壞（例如改捨入方式、改連接點判斷、改端基質量）後黃金比對必須失敗，結果列入報告。
6. **引擎介面**：新增 `POST /polymer/repeat-unit`、`/polymer/end-groups`、`/polymer/copolymer`、`/polymer/convert`、`/polymer/distribution`，沿用 `value/unit/source/status` 格式；輸入無效回 400。只在 127.0.0.1，**不接到介面，不做切換**。
7. 若發現新的「Python 照 TS 重現、之後要修」項目，列入 `docs/migration-known-issues.md`（編號接續）。
8. 報告 `docs/reports/M04-結果.md` 寫精簡：實作範圍、R2／R7 結論、案例數與通過數、`tolerance_cases`、反向驗證表、需要使用者決定的事。
9. 本機只跑本卡新增的檢查、引擎 pytest、型別檢查；全部 TypeScript 測試與建置交給 CI。commit、push，確認 CI 的 build、engine、golden-fresh 三個 job 都通過。

## 不可更動的檔案或規則

- 不修改 `src/` 的計算、資料表與既有測試；既有 CI job 不改（`golden-fresh` 自動涵蓋新匯出程式，若需調整只做最小必要變更並在報告說明）
- 不使用記憶中的數值與版本號；不更改已定案決定
- 引擎只在 127.0.0.1 內部連線，不對外；不得實作這五個模組以外的公式
- 不搬 `formulation/compute`、`unitFragment`、結構驗證（留 TS）
- 測試時不要留下背景程式

## 完成標準（可檢查）

- [ ] 五個模組在黃金案例上全數相符（`tolerance_cases` 列出，若有），錯誤路徑也一致
- [ ] R2、R7 有專屬案例與結論；捨入邊界有專屬案例；反向驗證會失敗
- [ ] 型別檢查、引擎 pytest 通過；CI 三個 job 通過；已 commit 與 push

## 需要先問使用者的情況

- 分子量（原子量表）、原子順序、分子式或連接點判斷與 TS 無法一致
- 需要修改 TypeScript 的計算檔才能匯出黃金資料
- 浮點需要超過 1e-12 的容差
- 任務與 `docs/DECISIONS.md` 衝突
