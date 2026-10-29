# 任務 009：四種資料表的欄位定義、讀取程式與格式檢查（Phase 1.6、1.7）

編號：009
建立日期：2026-10-29
指派給：Codex／Claude Code

## 目標

建立官能基 SMARTS、反應規則、基團貢獻參數、溶劑物性四種資料表的**欄位與空白檔案**，以及讀取程式與自動格式檢查。做完後，之後任何人往表裡加一列資料，只要缺出處、缺測試分子或 SMARTS 寫錯，測試就會失敗。**本任務不填任何化學資料**（表內只有標題列）；測試用的示範資料只放在 `tests/fixtures/`。

## 前置條件（先讀這些）

- `AGENTS.md`（鐵則 3：每列必須有出處）
- `docs/DECISIONS.md`（特別是 D17、D18、D22、D26；本任務寫入 D35）
- `docs/PLAN.md`（1.6、1.7）
- `docs/reports/008-結果.md`（任務 008 必須先完成；若尚未完成，停止並回報）

## 要做的事

### A. 寫入決定

1. `docs/DECISIONS.md`：
   - 在「一、已定案」表格最後（D34 之後）新增一列，照抄：

| D35 | 反應規則表每條規則記錄：反應類型、SMARTS、所需催化劑、文獻典型溫度範圍、官能度、副產物（縮合型）、單位鍵體積變化、出處 | 使用者 2026-10-29 確認，原 S06 |

   - 在「二、建議（待確認）」表格**刪除 S06 整列**。

### B. 檔案格式（所有表共用）

2. 四個表都存成 **CSV**，放在 `src/data/`，編碼 **UTF-8 含 BOM**（讓使用者能直接用 Excel 開啟審核中文）。清單型欄位內的多個值用 `|` 分隔。
3. 每個表都包含下列**共用欄位**（放在最後幾欄）：

| 欄位 | 說明 | 規則 |
|---|---|---|
| `source_type` | 出處類型 | 只能是 `book`、`paper`、`package`、`self` |
| `source` | 書名、論文、或套件名稱 | 必填 |
| `source_detail` | 頁碼、表格編號；`package` 時為套件版本 | 必填 |
| `source_original` | `package` 時，套件引用的原始文獻 | `source_type=package` 時必填 |
| `review_status` | 使用者審核狀態 | 只能是 `pending`、`approved`（D17：化學正確性由使用者審核） |
| `notes` | 備註 | `source_type=self` 時必填，說明為何自行撰寫（D22） |

### C. 四個表的欄位（只建標題列，不填資料）

4. `src/data/functional_groups.csv`（官能基 SMARTS）：

| 欄位 | 說明 |
|---|---|
| `id` | 階層式名稱，例如 `amine.primary.aliphatic`；唯一 |
| `name_zh` | 中文名稱 |
| `smarts` | SMARTS |
| `reactive_atom_maps` | SMARTS 中代表反應原子的原子映射編號，`\|` 分隔；可空 |
| `should_match` | 應命中的測試分子 SMILES，`\|` 分隔；至少 1 個（D22） |
| `should_not_match` | 不應命中的測試分子 SMILES，`\|` 分隔；至少 1 個（D22） |
| 共用欄位 | |

5. `src/data/reaction_rules.csv`（反應規則，欄位依 D35）：

| 欄位 | 說明 |
|---|---|
| `id` | 唯一，例如 `epoxy+phenol` |
| `reaction_type` | 反應類型（例如加成、縮合、開環），自由文字 |
| `group_a` | 參與反應的官能基 id（須存在於 `functional_groups.csv`） |
| `group_b` | 另一個官能基 id；自反應時留空 |
| `reaction_smarts` | 反應 SMARTS |
| `catalyst_required` | 所需催化劑描述；不需要時填 `none` |
| `temp_min_c`、`temp_max_c` | 文獻典型溫度範圍（°C）；可空，空時兩者都要空 |
| `functionality_a`、`functionality_b` | 官能度（每個官能基可形成的鍵數）；`group_b` 空時 `functionality_b` 也空 |
| `byproduct` | 副產物 SMILES（縮合型）；無則空 |
| `bond_volume_change` | 單位鍵體積變化；可空 |
| `bond_volume_change_unit` | 上欄的單位；上欄有值時必填 |
| `should_react` | 應反應的測試分子組合，格式 `SMILES_A+SMILES_B`，`\|` 分隔；至少 1 個 |
| `should_not_react` | 不應反應的組合，同上格式；至少 1 個 |
| 共用欄位 | |

6. `src/data/group_contributions.csv`（基團貢獻參數，長表格式：一列一個參數值）：

| 欄位 | 說明 |
|---|---|
| `method` | 方法名稱，例如 `van_krevelen`、`bicerano`、`hoftyzer_van_krevelen`、`joback` |
| `group_id` | 基團代號（同一 method 內唯一對應一個基團） |
| `group_name` | 基團名稱（照出處寫法） |
| `property` | 參數名稱，例如 `Vw`、`Yg`（照出處符號） |
| `value` | 數值 |
| `unit` | 單位 |
| 共用欄位 | |

   `(method, group_id, property)` 組合必須唯一。

7. `src/data/solvents.csv`（溶劑物性，長表格式）：

| 欄位 | 說明 |
|---|---|
| `solvent_id` | 唯一代號 |
| `name_en`、`name_zh` | 名稱 |
| `cas` | CAS 號 |
| `smiles` | SMILES |
| `property` | 物性名稱，例如 `density`、`viscosity`、`surface_tension`、`hsp_d` |
| `value` | 數值 |
| `unit` | 單位 |
| `temperature_c` | 數值對應的溫度（°C）；與溫度無關時空白 |
| 共用欄位 | |

   `(solvent_id, property, temperature_c)` 組合必須唯一；同一 `solvent_id` 的名稱、CAS、SMILES 在每一列都要一致。

### D. 讀取程式（`src/core/data/`，純 TypeScript）

8. 自己寫一個小型 CSV 解析器（處理 BOM、雙引號、欄位內逗號與換行），**不安裝套件**；放在 `src/core/data/csv.ts`。
9. 每個表一個讀取函式，回傳有型別的資料列；`|` 分隔欄位轉成陣列，數字欄位轉成數字。讀到格式錯誤時回傳清楚的錯誤（哪個檔、第幾列、哪個欄位、什麼問題），不要靜默略過。
10. CSV 以 Vite 的 `?raw` 匯入，讓資料隨網站建置打包（D21 已決定不需保密）。

### E. 格式檢查（1.7，`tests/data/`）

11. 對 `src/data/` 的四個實際檔案執行檢查（目前只有標題列，應通過）：
    - 標題列與本任務定義的欄位**完全一致**（順序也一致）
    - 共用欄位規則（B 節表格的「規則」欄）
    - 唯一性規則（各表的 id 或組合鍵）
    - 數字欄位能轉成數字；`temp_min_c ≤ temp_max_c`
    - `reaction_rules.group_a`、`group_b` 存在於 `functional_groups.csv`
12. **SMARTS 檢查（用 RDKit，D22 第 2 步）**：
    - `functional_groups.smarts` 能被 RDKit 解析；`should_match` 每個分子都命中、`should_not_match` 每個都不命中
    - `reaction_rules.reaction_smarts` 能被 RDKit 解析為反應；`should_react`、`should_not_react` 的檢查方式：若 RDKit.js（minimal）有執行反應的 API 就用它，沒有就只檢查兩個分子分別含 `group_a`、`group_b` 的官能基，並在報告說明採用了哪一種
    - 這些檢查只確認「程式照規則運作」，不判斷化學正確性（D17）
13. **用示範資料證明檢查有效**：在 `tests/fixtures/data/` 放兩組小 CSV：
    - 一組「格式正確」的示範資料（每個表 1–2 列，`source_type` 用 `self`，`notes` 寫「測試用示範資料，非化學資料」）→ 檢查應通過
    - 一組「刻意寫錯」的資料，至少涵蓋：缺出處、`package` 缺 `source_original`、SMARTS 無法解析、`should_match` 沒命中、`group_a` 不存在、重複 id、`temp_min_c > temp_max_c` → 每一種都要被檢查抓到
    - 示範資料**不得**放進 `src/data/`，也不得出現在網站上

### F. 文件

14. 新增 `docs/DATA.md`：說明四個表的用途、每個欄位的意義與規則（可直接整理本任務 B、C 節）、`|` 分隔規則、如何用 Excel 開啟與存檔（存成「CSV UTF-8」）、新增一列資料的流程（填資料 → 跑測試 → 使用者審核後把 `review_status` 改成 `approved`）。

### G. 檢查、提交、推送

15. 依序執行 `npm run typecheck`、`npm test`、`npm run build`，全部通過。
16. 提交（訊息：`資料表欄位定義與格式檢查（任務 009）`），推送方式依 `AGENTS.md`。確認 GitHub Actions 通過。

## 不可更動的檔案或規則

- **不得在 `src/data/` 填入任何化學資料**（只有標題列）
- 示範資料只能放在 `tests/fixtures/`，且必須標明「測試用示範資料，非化學資料」
- 不得更動模型公式
- 不得修改 CheMScutter 與 `moleform-handoff`
- 不安裝新套件；需要時先問使用者
- 不得修改 git 或認證設定；不得 force push

## 完成標準（可檢查）

- [ ] `npm run typecheck`、`npm test`、`npm run build` 全部通過
- [ ] `src/data/` 內四個 CSV 只有標題列，且有 BOM
- [ ] 刻意寫錯的示範資料中，每一種錯誤都被抓到（報告列出每種錯誤與對應的錯誤訊息）
- [ ] `docs/DECISIONS.md` 含 D35，「建議」表格不含 S06
- [ ] `docs/DATA.md` 存在
- [ ] 推送成功，GitHub Actions 通過

## 完成後請做

1. 更新 `docs/PLAN.md`：勾選 1.6、1.7
2. 新增 `docs/reports/009-結果.md`，內容包含：
   - 新增的檔案
   - 測試結果（含每種刻意錯誤被抓到的訊息）
   - 反應 SMARTS 的測試採用哪一種方式（見 E-12）
   - 遇到的問題
   - 需要使用者決定的事
3. 報告與 PLAN 一併提交並推送

## 需要先問使用者的情況

- 任務 008 尚未完成
- 欄位定義與 D35 或其他決定衝突
- 發現某個欄位在實作上無法照定義檢查
- 需要安裝新套件
