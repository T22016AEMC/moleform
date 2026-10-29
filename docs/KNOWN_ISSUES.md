# KNOWN_ISSUES — 已知問題與待驗證事項

最後更新：2026-10-29

## 技術風險（尚未驗證）

| 編號 | 問題 | 狀態 | 處理方式 |
|---|---|---|---|
| K01 | **RDKit.js（WASM）能否完成 3D 需求**：ETKDG 產生 3D 座標、MMFF94／UFF 最佳化、輸出 MOL／SDF | 已驗證（任務 001）：官方 `@rdkit/rdkit` 2026.9.1（RDKit_minimal）**不支援 3D**：無 ETKDG、無 MMFF94／UFF、無多構象與能量；只有 2D 座標與 MOL 輸出，鍵長、鍵角、二面角需自行由座標計算。詳見 `docs/reports/001-結果.md`。任務 005：`openchemlib` 9.25.2（BSD-3-Clause）在 Node 測試中**支援 3D**（ConformerGenerator 構象、ForceFieldMMFF94 最佳化與能量、3D MOL／SDF），且 RDKit molblock 交給它後原子順序不變；缺點見 `docs/reports/005-結果.md`（無退路力場、較大分子耗時數秒、瀏覽器端效能與 3D 顯示函式庫未測）。使用者已決定採純前端，3D 用 OpenChemLib JS（DECISIONS D33） | Phase 2 的 2.5a 在瀏覽器實測；不可接受則依 D33 降級為不顯示 3D |
| K02 | **純前端會讓基團貢獻參數與反應規則表跟著網頁送到瀏覽器**，任何人可看到 | 已決（D21）：不需保密 | 無需處理 |
| K03 | **借用 YIHAN-HSU/TiN-Al2O3-SiO2-HMDS-P1-S5 的 3D 功能**：(a) 擁有者帳號與使用者不同，公開 repo 檔案清單中未見 LICENSE；(b) 它的 3D 可能與吸附模型、底材、SQLite、登入驗證耦合；(c) 它是 Node + Python 的混合架構，採用會連帶決定架構 | 已結案（D19）：不參考該專案 | 無需處理 |
| K04 | 套件管理器不一致：SpecReader 用 pnpm，chemscutter 用 npm | 已結案（D20）：使用 npm | 無需處理 |
| K05 | **CheMScutter 的 Ketcher 是獨立子專案**（`packages/ketcher-frame/`，React 18.3.1、獨立 package-lock，用 iframe 嵌入主程式的 React 19）。搬進 MoleForm 會連帶兩份相依與兩次 `npm ci`，且 Ketcher 在 Windows 中文路徑下的行為未測試 | 已決（D28）：沿用 iframe 子專案。**中文路徑已驗證（任務 010）**：在 `C:\Users\t22016\Desktop\程式\MoleForm\MoleForm_V0` 下，子專案 `npm ci`、`tsc`、`vite build`、`notices.mjs` 全部成功，`dist/ketcher/` 與 `THIRD-PARTY-NOTICES.txt` 正常產生，Ketcher 在瀏覽器（Edge）載入與運作正常 | 已結案；若日後換路徑或換機器（例如 CI 的 Linux 環境）再確認一次 |
| K06 | **CheMScutter 的 `lightningcss`（MPL-2.0，弱 copyleft）**由 vite 帶入，僅建置期使用、不隨網頁發布；Ketcher 相依樹中另有一個授權欄位為空的 `eve-raphael`（0.5.0）與 `asap`（1.0.0，以舊式 `licenses` 欄位標示 MIT） | 已決（D29）：接受 | 發布時沿用 CheMScutter 的 THIRD-PARTY-NOTICES 產生方式；對外商用前重新檢查 |
| K07 | **OpenChemLib 的 MMFF94 沒有退路力場**：含硼（例如 BF₃–胺錯合物催化劑）、SF₆ 型硫等缺參數時會直接拋錯 | 已知（任務 005） | 改顯示初始構象並標示「未經力場最佳化」（PLAN 2.5） |
| K08 | **OpenChemLib 的 MMFF94 能量單位在型別定義中未註明** | 未確認 | PLAN 2.5b 以 MMFF94 官方驗證資料集比對；確認前不顯示相對能量 |
| K09 | **Ketcher 自己匯入 SMILES 時，會把連接點 `[*:1]` 轉成 R 基團標籤（R1、R2）**，匯出成 Molfile 為 `R#` 加 `RGROUPS`，不是 `*`；另外 Indigo 的 `check` 會把 `*` 原子也報成「查詢特徵」。純 `*` 原子（star atom）可正常顯示、匯出與來回（任務 010 在 Ketcher 3.18.0 實測） | 已處理（任務 010）：SMILES 含 `*` 時改送 RDKit 產生的 Molfile（連接點寫成 `*`，原子映射編號保留）給 Ketcher；不使用 Indigo 的 `query` 檢查，改由 KET／Molfile 文字自行判斷查詢結構；Ketcher 中使用者自己畫的 R 基團標籤（R1…）仍被拒絕（沿用 CheMScutter 的限制） | 使用者在瀏覽器確認 `[*:1]CC[*:2]` 的顯示；Phase 5 設計重複單元輸入時再檢討 |

## 模型精度限制（要在介面上誠實標示）

| 編號 | 限制 | 影響 |
|---|---|---|
| M01 | 基團貢獻法（Van Krevelen 等）參數主要來自聚合物，**小分子的 Tg、Tm 誤差較大** | 未反應配方（小分子混合物）的 Tg0 是第 2 層最弱的一環 |
| M02 | 高度交聯網路的 Tg∞ 估算誤差較大，絕對值可能偏差數十度 | 第 2 層 Tg∞、完全固化最低溫度、最大轉化率 |
| M03 | 固化後 Tg 與最大轉化率同時繼承 Tg0、Tg∞、λ 三者的誤差 | DiBenedetto 反推結果；且未考慮玻璃化後仍緩慢進行的反應 |
| M04 | 固化收縮只含化學收縮，不含冷卻熱收縮；凝膠點前的收縮可被流動補償 | 第 2 層固化收縮 |
| M05 | 反應起始溫度為規則表文獻範圍，非計算值 | 實際受催化劑與升溫條件影響 |
| M06 | Miller–Macosko 假設無分子內環化 | 與「考慮分子內反應與競爭反應」的原始需求有落差；進階版才可能用動力學蒙地卡羅圖網路模擬 |
| M07 | 彈性模數、吸濕性屬參考趨勢，Tm 只適用可結晶聚合物 | 結果標示為參考趨勢或「不適用」 |
| M08 | 溶液黏度與表面張力在沒有實驗參數下只能給趨勢 | 溶液與界面物性 |

## 資料與內容缺口

| 編號 | 缺口 | 誰處理 |
|---|---|---|
| D01 | 基團貢獻參數表（Van Krevelen、Bicerano、HSP 方法）需從原書轉錄並標註出處 | 使用者提供，或取自成熟開源套件並標出處（D18）；AI 不得憑記憶補 |
| D02 | 反應規則表：每條 SMARTS 需用已知分子測試，並由熟悉該化學系統的人審核 | 依 D22 流程撰寫與自動測試；化學正確性由使用者審核（D17） |
| D03 | 溶劑物性資料來源與清單 | 使用者決定（DECISIONS P06） |
| D04 | 公式核對範例（例如書中示範計算），用來寫「程式是否照公式算對」的自動測試 | 使用者提供 |

## 規格尚未明確的項目

| 編號 | 項目 |
|---|---|
| U02 | 「聚合物 mol% 以重複單元為基準或以鏈為基準」的預設值尚未決定（規格要求可選） |
| U03 | 多成分配方的相容性判斷（RED 閾值等）只屬參考趨勢，不要宣稱為溶解度預測 |

- **建置時出現 
ode:fs／
ode:crypto externalized 警告（任務 008）**：Vite 建置 @rdkit/rdkit 時印出 Module "node:fs" has been externalized for browser compatibility。RDKit 的 JS 檔含 Node 專用分支，瀏覽器不會執行到，建置仍成功。CheMScutter 使用同一個套件，預期有同樣訊息。待在瀏覽器確認 RDKit 實際載入成功後可視為無害。
