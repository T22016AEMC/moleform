# 資料表說明（DATA）

MoleForm 的化學資料放在 `src/data/` 的四個 CSV。**目前只有標題列，沒有任何化學資料**（任務 009）；資料由使用者提供的書籍、論文或成熟套件的內建值轉錄（AGENTS.md 鐵則 3、DECISIONS D18），不得憑記憶填寫。

| 檔案 | 用途 | 每一列是 |
|---|---|---|
| `functional_groups.csv` | 官能基 SMARTS | 一個官能基 |
| `reaction_rules.csv` | 反應規則（D35） | 一條反應規則 |
| `group_contributions.csv` | 基團貢獻參數 | 一個基團的一個參數值（長表） |
| `solvents.csv` | 溶劑物性 | 一個溶劑的一個物性值（長表） |

## 檔案格式

- CSV，編碼 **UTF-8 含 BOM**（Excel 才能正確顯示中文）。
- 清單型欄位內有多個值時用 **`|`** 分隔，例如 `CCO|CCCO`。值本身不可含 `|`。
- 欄位內有逗號或換行時，整個欄位要用雙引號包起來（Excel 存檔時會自動處理）。
- 標題列必須與下面的欄位**完全一致（名稱與順序）**，否則檢查失敗。
- 數字欄位只放數字（可為小數、負數、科學記號）；沒有值就留空。
- 錯誤訊息中的「第 N 列」：標題列是第 1 列，第一筆資料是第 2 列。

## 共用欄位（四個表的最後六欄）

| 欄位 | 說明 | 規則 |
|---|---|---|
| `source_type` | 出處類型 | 只能是 `book`、`paper`、`package`、`self` |
| `source` | 書名、論文、或套件名稱 | 必填 |
| `source_detail` | 頁碼、表格編號；`package` 時為套件版本 | 必填 |
| `source_original` | `package` 時，套件引用的原始文獻 | `source_type=package` 時必填 |
| `review_status` | 使用者審核狀態 | 只能是 `pending`、`approved`（D17） |
| `notes` | 備註 | `source_type=self` 時必填，說明為何自行撰寫（D22） |

## functional_groups.csv

| 欄位 | 說明 |
|---|---|
| `id` | 階層式名稱，例如 `amine.primary.aliphatic`；唯一 |
| `name_zh` | 中文名稱 |
| `smarts` | SMARTS；必須能被 RDKit 解析 |
| `reactive_atom_maps` | SMARTS 中代表反應原子的原子映射編號，`\|` 分隔；可空；有值時每一項都必須是整數 |
| `should_match` | 應命中的測試分子 SMILES，`\|` 分隔；至少 1 個 |
| `should_not_match` | 不應命中的測試分子 SMILES，`\|` 分隔；至少 1 個 |

## reaction_rules.csv

| 欄位 | 說明 |
|---|---|
| `id` | 唯一，例如 `epoxy+phenol` |
| `reaction_type` | 反應類型（加成、縮合、開環…），自由文字 |
| `group_a` | 官能基 id，須存在於 `functional_groups.csv` |
| `group_b` | 另一個官能基 id；自反應時留空 |
| `reaction_smarts` | 反應 SMARTS；必須能被 RDKit 解析為反應 |
| `catalyst_required` | 所需催化劑描述；不需要時填 `none` |
| `temp_min_c`、`temp_max_c` | 文獻典型溫度範圍（°C）；可空，空時兩者都要空；`temp_min_c ≤ temp_max_c` |
| `functionality_a`、`functionality_b` | 官能度（正整數）；`group_b` 空時 `functionality_b` 也要空 |
| `byproduct` | 副產物 SMILES（縮合型）；無則空 |
| `bond_volume_change` | 單位鍵體積變化；可空 |
| `bond_volume_change_unit` | 上欄的單位；上欄有值時必填 |
| `should_react` | 應反應的測試分子組合，格式 `SMILES_A+SMILES_B`，`\|` 分隔；至少 1 個 |
| `should_not_react` | 不應反應的組合，同上；至少 1 個 |

組合中的 `+` 以方括號外的為分隔（`[NH4+]` 的 `+` 是電荷，不是分隔）。

## group_contributions.csv（長表）

| 欄位 | 說明 |
|---|---|
| `method` | 方法名稱，例如 `van_krevelen`、`bicerano`、`hoftyzer_van_krevelen`、`joback` |
| `group_id` | 基團代號 |
| `group_name` | 基團名稱（照出處寫法）；同一 `method` 內同一個 `group_id` 只能有一個名稱 |
| `property` | 參數名稱，例如 `Vw`、`Yg`（照出處符號） |
| `value` | 數值（必填） |
| `unit` | 單位（必填） |

`(method, group_id, property)` 必須唯一。

## solvents.csv（長表）

| 欄位 | 說明 |
|---|---|
| `solvent_id` | 唯一代號 |
| `name_en`、`name_zh` | 名稱 |
| `cas` | CAS 號（選填） |
| `smiles` | SMILES（**必填**） |
| `property` | 物性名稱，例如 `density`、`viscosity`、`surface_tension`、`hsp_d` |
| `value` | 數值（必填） |
| `unit` | 單位（必填） |
| `temperature_c` | 數值對應的溫度（°C）；與溫度無關時留空 |

`(solvent_id, property, temperature_c)` 必須唯一；同一 `solvent_id` 的 `name_en`、`name_zh`、`cas`、`smiles` 每一列都要一致。

## 各表必填欄位與額外規則（任務 009、010，使用者 2026-10-29 同意）

除各表說明中的規則外，檢查程式還會檢查：

- `functional_groups.csv`：`id`、`name_zh`、`smarts` 必填；`reactive_atom_maps` 每一項須為整數。
- `reaction_rules.csv`：`id`、`reaction_type`、`group_a`、`reaction_smarts`、`catalyst_required` 必填；`functionality_a`、`functionality_b` 有值時須為正整數；`temp_min_c`、`temp_max_c` 須同時填寫或同時留空。
- `group_contributions.csv`：`method`、`group_id`、`group_name`、`property`、`value`、`unit` 必填；同一 `method` 內同一 `group_id` 只能有一個 `group_name`。
- `solvents.csv`：`solvent_id`、`name_en`、`smiles`、`property`、`value`、`unit` 必填；**`smiles` 為必填（任務 010 起）**；`cas`、`name_zh`、`temperature_c` 選填。
## 用 Excel 開啟與存檔

1. 開啟：Excel → 資料 → 從文字／CSV → 檔案原點選 **UTF-8**；或直接雙擊（含 BOM 的檔案通常能直接正確顯示）。
2. 存檔：**另存新檔 → 檔案類型選「CSV UTF-8（逗號分隔）」**。不要選一般的「CSV（逗號分隔）」，那會用 Big5／ANSI 編碼，中文會變亂碼。
3. 不要增刪欄位、不要改標題列；CAS 號（如 `64-17-5`）與 `1e-3` 這類內容，Excel 可能自動轉成日期或科學記號，存檔前請確認。

## 新增一列資料的流程

1. 從使用者提供的書籍、論文或資料表（或套件內建值）取得資料，填入一列；**出處欄位必填**，找不到出處就留空並回報，不要猜。
2. SMARTS 類資料同時填測試分子（`should_match`／`should_not_match`，反應規則為 `should_react`／`should_not_react`）。
3. 執行 `npm test`。缺出處、缺測試分子、SMARTS 寫錯、鍵重複、跨表參照不存在等都會使測試失敗，訊息會指出檔案、第幾列、哪個欄位。
4. 測試通過後，由使用者審核化學正確性（D17），審核完成才把該列 `review_status` 從 `pending` 改成 `approved`。

這些測試只確認「格式符合規則、程式照規則運作」，**不判斷化學正確性**。

## 測試用示範資料

`tests/fixtures/data/valid/` 是格式正確的示範資料，`tests/fixtures/data/invalid/` 是刻意寫錯的資料，用來證明檢查有效。兩者都標明「測試用示範資料，非化學資料」，不在 `src/data/`，也不會出現在網站上。

## 程式位置

- 讀取程式與檢查：`src/core/data/`（`csv.ts`、`readers.ts`、`validate.ts`、`chemcheck.ts`、`load.ts`）
- 測試：`tests/data/`
