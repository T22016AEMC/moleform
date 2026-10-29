# 任務 006：寫入 D27–D33，並依架構決定（純前端）同步所有文件

編號：006
建立日期：2026-10-29
指派給：Codex／Claude Code

## 目標

把使用者已確認的 D27–D33 寫進 `docs/DECISIONS.md`，結案 P01（架構：純前端），並讓 `AGENTS.md`、`docs/PLAN.md`、`docs/KNOWN_ISSUES.md`、`docs/spec.md` 與它一致。做完後，所有文件都不再把架構寫成「待決」，也不再提 Python 後端與 PostgreSQL。**本任務只改文件，不寫任何程式。**

D27–D32 是使用者在與下指令的人的對話中確認的（2026-10-29），D33 由使用者確認。本任務單就是確認紀錄，可以直接寫入，不需要再問。

## 前置條件（先讀這些）

- `AGENTS.md`
- `docs/DECISIONS.md`
- `docs/PLAN.md`
- `docs/KNOWN_ISSUES.md`
- `docs/spec.md`
- `docs/reports/004-結果.md`、`docs/reports/005-結果.md`

## 要做的事

下列文字已由使用者確認。**照抄，不要改寫措辭，也不要自行增加其他決定。**

### 1. `docs/DECISIONS.md`

1. 「最後更新」維持或改為 2026-10-29。
2. 在「一、已定案（使用者決定）」表格最後（D26 之後）新增以下七列：

| 編號 | 決定 | 備註 |
|---|---|---|
| D27 | 從 CheMScutter **只複製、不修改**；CheMScutter 資料夾內不得寫入、安裝、建置、測試或提交 | 補充 D16；複製的檔案要在報告中註明原路徑 |
| D28 | Ketcher 沿用 CheMScutter 的 **iframe 獨立子專案**做法（`packages/ketcher-frame/`） | 見 KNOWN_ISSUES K05 |
| D29 | 接受 `lightningcss`（MPL-2.0，僅建置期）與 `eve-raphael`（授權欄位空白，Ketcher 間接相依） | 見 KNOWN_ISSUES K06；對外商用前重新檢查 |
| D30 | CheMScutter 的 golden 標準答案比對 **Phase 1 不搬**；Phase 4 有計算結果後再加入，用來發現「修改造成結果改變」 | |
| D31 | 結構輸入**拒絕反應式與查詢結構**，但**保留聚合物連接點 `*`**（`[*:1]`、`[*:2]`） | CheMScutter 的 `structureChecks.ts` 搬入時須改寫，不得原樣照搬 |
| D32 | GitHub repo 名稱：**`moleform`** | 用於 Vite 與 Ketcher 子專案的 `base` 路徑（`/moleform/`、`/moleform/ketcher/`） |
| D33 | 架構採**純前端**（P01 結案）。RDKit.js 負責 2D、SMARTS、描述子；**OpenChemLib JS**（`openchemlib`）負責 3D 構象與 MMFF94 最佳化，在 Web Worker 中執行。若 Phase 2 在瀏覽器實測時效能或顯示無法接受，3D 降級為不顯示，其他功能不受影響 | 依任務 001、005；是否「無法接受」由使用者依 Phase 2 實測數字判斷 |

3. 在「三、待決」表格：**刪除 P01 整列**。

### 2. `AGENTS.md`

1. **「技術堆疊」**整段替換為：

   > 架構已定為**純前端**（DECISIONS D33）：Vite + React + TypeScript + Vitest，套件管理器 **npm**（D20），部署為公開靜態網站（D24），資料只存使用者自己的電腦（D23）。
   >
   > - 2D、SMILES／SMARTS、描述子：RDKit.js（`@rdkit/rdkit`，與 CheMScutter 同版本）
   > - 3D 構象與 MMFF94 最佳化：OpenChemLib JS（`openchemlib`），在 Web Worker 中執行；使用前須先載入 `resources.json`
   > - 2D 繪圖：Ketcher，iframe 獨立子專案（D28）
   >
   > 不得加入伺服器、資料庫或 Python 執行環境。成熟 Python 套件（例如 thermo／chemicals）的內建數值只能**轉錄成資料表**使用（D18，標出套件名稱、版本與原始文獻），不能在執行時呼叫。

2. **「與其他專案的關係」**第一點（SpecReader 與 chemscutter 那一點）整條替換為：

   > - SpecReader 與 CheMScutter（使用者自己的專案）：有幫助的程式碼可以**複製**進 MoleForm（DECISIONS D16、D27），並在報告中註明來源專案與檔案路徑。**不得修改這兩個專案，也不得在其中執行安裝、建置、測試或提交**；不要建立共用套件（DECISIONS P07 待決）。

3. 在「開發方式」最後新增一條：

   > - 使用 OpenChemLib JS 時注意：`getBondLength`、`getBondAngle` 依 2D 座標計算，3D 的鍵長、鍵角必須自行由 x、y、z 計算（見 `docs/reports/005-結果.md`）。

### 3. `docs/PLAN.md`

1. Phase 0：
   - `0.4` 那一行改為：`- [x] 0.4 架構：純前端（DECISIONS D33；依任務 001、005 結果）`
   - 最後新增一行：`- [x] 0.8 任務 006：寫入 D27–D33，同步文件`
2. Phase 1：
   - 「開工前需要使用者決定：P01（架構）」改為：`開工前需要使用者準備：在 GitHub 建立空的 \`moleform\` repo（DECISIONS D32）`
   - `1.1` 改為：`- [ ] 1.1 專案骨架：從 CheMScutter 複製 Vite、React、TypeScript、Vitest、npm 的設定（DECISIONS D16、D20、D27），初始化 git 並連上 GitHub \`moleform\` repo`
   - `1.3` 改為：`- [ ] 1.3 CI：從 CheMScutter 複製 \`deploy.yml\`，型別檢查、測試、建置全部通過才部署到 GitHub Pages（DECISIONS D24、D32）；不含 golden 步驟（D30）`
   - 在 `1.5` 之後新增：`- [ ] 1.5a 頁首與版本顯示：\`assets/logo.png\`、版本號與建置時間（複製 CheMScutter 的 \`build-info.mjs\`）；介面風格依 \`assets/style-reference.png\`，顏色、圓角、間距集中定義在 \`src/ui/theme.css\`，規則寫進 \`docs/DESIGN.md\``
3. Phase 2：
   - 「開工前需要使用者決定：無（3D 做法依 Phase 0 的 P01）」改為：`開工前需要使用者決定：無（3D 做法依 DECISIONS D33）`
   - `2.1` 改為：`- [ ] 2.1 Ketcher 2D 繪圖：從 CheMScutter 複製 iframe 子專案 \`packages/ketcher-frame/\`（DECISIONS D27、D28），頻道名稱與 \`base\` 改為 MoleForm`
   - `2.3` 改為：`- [ ] 2.3 結構驗證：原子價數、鍵結、SMILES 合法性；芳香環、手性中心、E/Z；拒絕反應式與查詢結構，保留連接點 \`*\`（DECISIONS D31）`
   - `2.5` 改為：`- [ ] 2.5 小分子 3D 產生：OpenChemLib JS 的 ConformerGenerator 構象、MMFF94 最佳化，在 Web Worker 中執行，預設只算少量構象，可再要求更多；MMFF 缺參數時顯示初始構象並標示「未經力場最佳化」（DECISIONS D33）`
   - 在 `2.5` 之後新增：`- [ ] 2.5a 瀏覽器實測：在使用者電腦的瀏覽器中，記錄 BADGE 等較大分子的 3D 產生與最佳化耗時、網頁是否保持可操作；數字交使用者判斷是否可接受，不可接受則依 D33 降級`
   - 在 `2.5a` 之後新增：`- [ ] 2.5b MMFF94 能量單位確認：用 MMFF94 官方驗證資料集（MMFF94 Validation Suite）中的分子比對 OpenChemLib 的能量；確認單位前不顯示相對能量`
   - `2.6` 改為：`- [ ] 2.6 3D 顯示：選定 3D 顯示函式庫（先查證授權，不得為 GPL 類）；旋轉、縮放、平移；Ball-and-Stick、Stick、Space-Filling；原子編號；標示為理論構型`
   - `2.7` 改為：`- [ ] 2.7 3D 量測：鍵長、鍵角由 3D 座標自行計算，二面角可用 OpenChemLib \`calculateTorsion\`（注意其回傳弧度）`

### 4. `docs/KNOWN_ISSUES.md`

1. 「最後更新」改為 2026-10-29。
2. K01：「狀態」欄在最後的「P01 仍待使用者決定」改為 `使用者已決定採純前端，3D 用 OpenChemLib JS（DECISIONS D33）`；「處理方式」欄整格改為 `Phase 2 的 2.5a 在瀏覽器實測；不可接受則依 D33 降級為不顯示 3D`。
3. K05：「狀態」改為 `已決（D28）：沿用 iframe 子專案`；「處理方式」改為 `Phase 2 的 2.1 複製時處理；Windows 中文路徑下的建置在 Phase 1、2 實際建置時確認`。
4. K06：「狀態」改為 `已決（D29）：接受`；「處理方式」改為 `發布時沿用 CheMScutter 的 THIRD-PARTY-NOTICES 產生方式；對外商用前重新檢查`。
5. 在「技術風險」表格最後新增兩列：

| 編號 | 問題 | 狀態 | 處理方式 |
|---|---|---|---|
| K07 | **OpenChemLib 的 MMFF94 沒有退路力場**：含硼（例如 BF₃–胺錯合物催化劑）、SF₆ 型硫等缺參數時會直接拋錯 | 已知（任務 005） | 改顯示初始構象並標示「未經力場最佳化」（PLAN 2.5） |
| K08 | **OpenChemLib 的 MMFF94 能量單位在型別定義中未註明** | 未確認 | PLAN 2.5b 以 MMFF94 官方驗證資料集比對；確認前不顯示相對能量 |

### 5. `docs/spec.md`

1. 「## 平台架構與技術選型」一節：從該標題下一行開始，到「需自行實作：…保留未來商業化的彈性。」這一段（含）為止，**整段替換**為：

```
架構為**純前端**的桌面網頁（DECISIONS D33）：所有計算在使用者的瀏覽器中執行，部署為公開靜態網站，資料只存使用者自己的電腦（D23、D24）。

| 元件 | 用途 | 授權 |
| --- | --- | --- |
| Ketcher（iframe 獨立子專案） | 2D 結構繪圖 | Apache 2.0 |
| RDKit.js（`@rdkit/rdkit`） | SMILES 解析與驗證、SMARTS 官能基辨識、描述子、2D 座標 | BSD-3-Clause |
| OpenChemLib JS（`openchemlib`） | 3D 構象產生、MMFF94 最佳化與能量（Web Worker 執行） | BSD-3-Clause |
| 3D 顯示函式庫 | 3D 顯示與反應原子標記 | Phase 2 選定並查證授權 |
| write-excel-file | Excel 匯出 | MIT |

成熟 Python 套件（例如 thermo／chemicals）的內建數值（溶劑物性、Joback 參數等）只能轉錄成資料表使用，並標出套件名稱、版本與原始文獻（D18），不在執行時呼叫 Python。

需自行實作：Van Krevelen／Bicerano 基團貢獻法、HSP 基團貢獻法、反應規則表、Miller–Macosko 網路計算。避免 GPL 元件（如 Open Babel），保留未來商業化的彈性。
```

2. 「### 3D 模型」一節中，`- ETKDG 構象生成，MMFF94／UFF 最佳化，多構象與相對能量` 改為：
   `- OpenChemLib JS 構象生成與 MMFF94 最佳化，多構象與相對能量（能量單位確認前不顯示相對能量）；MMFF 缺參數時顯示未最佳化的初始構象並標示`
3. 其他內容不動。

## 不可更動的檔案或規則

- 不得更動基團貢獻參數表、反應規則表與模型公式（本任務不涉及）
- 不得重新加入 `AGENTS.md` 列出的已取消項目
- **只能改** `AGENTS.md`、`docs/DECISIONS.md`、`docs/PLAN.md`、`docs/KNOWN_ISSUES.md`、`docs/spec.md` 五個檔案，再加上新增報告 `docs/reports/006-結果.md`
- 不得改動 D01–D26 與 P05、P06、P07 的內容
- 不得改寫本任務單提供的文字，也不得自行新增其他決定
- 不得建立程式碼、`package.json` 或任何專案骨架；不得修改 `experiments/` 與 CheMScutter

## 完成標準（可檢查）

- [ ] 本任務只改文件，型別檢查、測試、建置：不適用（報告中註明）
- [ ] `docs/DECISIONS.md` 含 D27–D33；「三、待決」不含 P01
- [ ] `grep -n "FastAPI\|PostgreSQL\|openpyxl\|ETKDG" docs/spec.md` 沒有任何結果
- [ ] `grep -n "尚未定案" AGENTS.md` 沒有任何結果
- [ ] `docs/PLAN.md` 的 0.4 已勾選，且含 0.8、1.5a、2.5a、2.5b
- [ ] `docs/KNOWN_ISSUES.md` 含 K07、K08
- [ ] 若專案是 git repo：`git status` 只顯示上述五個檔案與 `docs/reports/006-結果.md` 有變動（目前不是 git repo 則註明）

## 完成後請做

1. 新增 `docs/reports/006-結果.md`，內容包含：
   - 改了哪些檔案（每個檔案改了哪幾處）
   - 完成標準逐項結果
   - 遇到的問題（例如找不到要替換的原文）
   - 需要使用者決定的事
2. 發現文件之間還有其他不一致時，寫在報告裡，**不要自行修改**

## 需要先問使用者的情況

- 找不到本任務指定要替換的原文
- 發現新決定與既有內容互相矛盾，而本任務沒有交代如何處理
- 需要改動本任務列出以外的檔案
