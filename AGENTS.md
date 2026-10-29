# AGENTS.md — MoleForm 工作守則

本檔案給所有 AI 寫程式工具（Codex、Claude Code 等）與接手者。**開工前先讀完本檔，再讀 `docs/` 內的文件。**

## 專案是什麼

MoleForm（化學配方物性與交聯預測引擎）是一個網頁程式：輸入化學結構與配方比例，用理論模型估算物性與交聯結果。它是**實驗前的參考工具**，不是實驗數據分析工具。

完整規劃見 `docs/spec.md`。已定案的決定與原因見 `docs/DECISIONS.md`。進度見 `docs/PLAN.md`。未解決的問題見 `docs/KNOWN_ISSUES.md`。

## 開工前必讀順序

1. `AGENTS.md`（本檔）
2. `docs/DECISIONS.md`
3. `docs/PLAN.md`
4. `docs/KNOWN_ISSUES.md`
5. `docs/spec.md`
6. 你被指派的任務單（`docs/tasks/NNN-*.md`）與前一份報告（`docs/reports/`）

## 鐵則（違反前必須先問使用者）

1. **不接受任何使用者實驗數據輸入**（DSC、TGA、黏度、實測 Tg 等一律不做輸入欄位）。
2. **每個輸出數值都要附：模型名稱，以及統一備註**：「本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。」
3. **不得憑記憶填寫基團貢獻參數、反應規則、溶劑物性。** 數值只能來自：(a) 使用者提供的書籍、論文或資料表；或 (b) 成熟開源套件的內建值（見 DECISIONS D18）。每一列資料必須標註出處：書名／論文、頁碼或表格編號；或套件名稱、版本與該套件引用的原始文獻。找不到出處就留空並回報，不要猜。
4. **沒有被明確指示，不得修改化學規則或公式**（參數表、反應規則表、模型公式與係數）。有疑問先問使用者。
5. **不得重新加入已取消的項目**（見下方清單與 `docs/DECISIONS.md`）。
6. **不得把 AI 自己的判斷當成已定案的決定。** 新決定寫進 `docs/DECISIONS.md` 前，需使用者確認。
7. **不要把密鑰、密碼、API Key 寫進任何檔案**；只放 `.env.example`。

## 已取消項目（不要做）

- BigSMILES；非 Random 的共聚排列（Alternating、Block、Graft、Gradient、Branched）
- DFT、TD-DFT、分子動力學（MD）及任何量子計算
- HOMO／LUMO、UV-Vis、折射率 n、消光係數 k、混合折射率
- 偶極矩（DECISIONS D15）
- 聚合物與共聚物的 3D、3D 交聯網路（3D 只做單體與小分子）
- 固化動力學（轉化率對時間）、Arrhenius 速率擬合
- 在結果頁顯示：分子量、官能基種類與數量、官能基當量（這些只在背景計算）

## 可信度分級

每個結果標示其中一級：

- **直接計算**：由結構或配方直接算出，結果確定
- **理論估算**：基團貢獻等經驗模型，有誤差，需標示模型名稱
- **參考趨勢**：只適合比較或排序，不是絕對值

## 開發方式

- 一次只做一份任務單。任務單範本在 `docs/tasks/TEMPLATE.md`。
- 每個公式都要有自動測試，目的是檢查**程式有沒有照公式算對**（例如用文獻示範計算或手算範例核對輸入與輸出）。計算準確性與化學驗證由使用者本人負責（DECISIONS D17）；取得不到範例時，在報告中說明該公式尚未有對照範例。
- 完成後：更新 `docs/PLAN.md` 的勾選項，並在 `docs/reports/` 新增報告（改了哪些檔案、測試結果、遇到的問題、需要使用者決定的事）。
- 提交前必須通過型別檢查、測試與建置。失敗就不要提交。
- 結構與化學處理使用 RDKit。避免加入 GPL 授權的相依套件（例如 Open Babel），以保留未來商業化彈性；新增任何相依套件前先確認授權。
- 撰寫 SMARTS 時依 DECISIONS D22 的流程。
- 使用 OpenChemLib JS 時注意：`getBondLength`、`getBondAngle` 依 2D 座標計算，3D 的鍵長、鍵角必須自行由 x、y、z 計算（見 `docs/reports/005-結果.md`）。

## 技術堆疊

架構已定為**純前端**（DECISIONS D33）：Vite + React + TypeScript + Vitest，套件管理器 **npm**（D20），部署為公開靜態網站（D24），資料只存使用者自己的電腦（D23）。

- 2D、SMILES／SMARTS、描述子：RDKit.js（`@rdkit/rdkit`，與 CheMScutter 同版本）
- 3D 構象與 MMFF94 最佳化：OpenChemLib JS（`openchemlib`），在 Web Worker 中執行；使用前須先載入 `resources.json`
- 2D 繪圖：Ketcher，iframe 獨立子專案（D28）

不得加入伺服器、資料庫或 Python 執行環境。成熟 Python 套件（例如 thermo／chemicals）的內建數值只能**轉錄成資料表**使用（D18，標出套件名稱、版本與原始文獻），不能在執行時呼叫。

## 與其他專案的關係

- SpecReader 與 CheMScutter（使用者自己的專案）：有幫助的程式碼可以**複製**進 MoleForm（DECISIONS D16、D27），並在報告中註明來源專案與檔案路徑。**不得修改這兩個專案，也不得在其中執行安裝、建置、測試或提交**；不要建立共用套件（DECISIONS P07 待決）。
- 其他第三方程式：只參考其原理與邏輯，自行實作，**不複製程式碼**（DECISIONS D16）。
- 不參考 YIHAN-HSU/TiN-Al2O3-SiO2-HMDS-P1-S5 專案（DECISIONS D19）。

## 分工

計算準確性與化學驗證由使用者本人測試。AI 寫程式工具負責程式能運行、邏輯正確，並回答使用者的疑問；除非使用者提出需求，不主動判斷化學數值是否正確（DECISIONS D17）。

## 回報風格

回報簡短、具體：做了什麼、結果、需要使用者決定的事。不要用長篇敘述包裝尚未驗證的結果。
