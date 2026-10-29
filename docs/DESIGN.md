# 介面設計規則（DESIGN）

介面風格直接沿用 CheMScutter（DECISIONS D34）。所有變數定義在 `src/ui/theme.css` 的 `:root`，數值取自 CheMScutter 的 `src/ui/analysis.css`、`src/ui/results/results.css`（原樣，不自行調整）。

## 規則

**新增畫面一律使用 `theme.css` 的變數；需要新顏色或尺寸時先加進 `theme.css` 與本檔。** `src/ui/` 內除 `theme.css` 外的 CSS 檔不得硬寫色碼。

## 檔案分工

- `src/ui/theme.css`：變數
- `src/ui/base.css`：全域 `body`、標題、`button`、`input`、`select`、`label`、`.card`、`.error`、`.number`
- `src/ui/components/components.css`：頁首、頁尾、結果顯示元件
- `src/ui/crosslink/crosslink.css`：交聯結果（判定區塊、配對表、反應原子標記圖）；反應原子的強調色一律取 `--color-accent`
- `src/ui/workbench/workbench.css`：配方工作台的兩欄版面、成分列、右欄可收合區塊、彈窗（任務 018，D45）

## 變數

### 字型
| 變數 | 數值 | 用途 |
|---|---|---|
| `--font-sans` | `system-ui, sans-serif` | 全站字型 |
| `--font-mono` | `ui-monospace, monospace` | 輸入框、數字 |
| `--line-height` | `1.6` | 行高 |
| `--font-size-small` | `0.85rem` | 備註、頁首建置資訊、頁尾 |
| `--font-size-h3` | `1rem` | 三級標題 |
| `--weight-label` | `650` | 標籤、`summary` |
| `--weight-strong` | `700` | 強調文字 |

### 顏色
| 變數 | 數值 | 用途 |
|---|---|---|
| `--color-text` | `#20343c` | 內文 |
| `--color-text-muted` | `#52636a` | 次要文字、備註 |
| `--color-bg` | `#f3f6f7` | 頁面背景 |
| `--color-surface` | `#ffffff` | 卡片、輸入框背景 |
| `--color-on-accent` | `#ffffff` | 主色按鈕上的文字 |
| `--color-heading` | `#15566a` | `h1` |
| `--color-accent` | `#155d70` | 按鈕、強調線、「直接計算」標籤 |
| `--color-tint` | `#edf5f6` | 淡色底（結果區塊、備註） |
| `--color-tint-subtle` | `#f4f8fa` | 更淡的底（保留給詳細資料區） |
| `--color-focus` | `#d57516` | 鍵盤焦點外框 |
| `--color-border` | `#d6e0e4` | 卡片邊框 |
| `--color-border-strong` | `#71868f` | 輸入框邊框、「參考趨勢」標籤 |
| `--color-border-tint` | `#c4d7dc` | 淡色區塊邊框 |
| `--color-border-row` | `#dce5e8` | 表格列分隔線 |
| `--color-warn-bg` | `#fff3d9` | 警示底色 |
| `--color-warn-border` | `#a66d13` | 警示邊框、「理論估算」標籤文字 |
| `--color-warn-soft-bg` | `#fff8eb` | 淡警示底（「理論估算」標籤、開發預覽） |
| `--color-warn-soft-border` | `#b26b16` | 淡警示邊框 |
| `--color-error` | `#9d2525` | 錯誤文字 |
| `--color-error-bg` | `#fff0ee` | 錯誤底色 |
| `--color-error-border` | `#bb3939` | 錯誤左側線 |

### 圓角
| 變數 | 數值 | 用途 |
|---|---|---|
| `--radius-card` | `12px` | 卡片 |
| `--radius-panel` | `8px` | 結果區塊 |
| `--radius-control` | `6px` | 輸入框、按鈕、標籤 |

### 間距與內距
| 變數 | 數值 | 用途 |
|---|---|---|
| `--space-gap-sm` | `8px` | 小間距 |
| `--space-gap` | `10px` | 一般間距 |
| `--space-gap-md` | `12px` | 中間距 |
| `--space-gap-lg` | `16px` | 大間距 |
| `--space-gap-xl` | `24px` | 區塊間距 |
| `--padding-card` | `24px` | 卡片內距 |
| `--padding-card-mobile` | `16px` | 卡片內距（手機） |
| `--padding-panel` | `16px` | 區塊內距 |
| `--padding-control` | `10px 12px` | 輸入框、按鈕內距 |
| `--padding-button-inline` | `24px` | 按鈕左右內距 |
| `--padding-cell` | `12px` | 表格儲存格 |
| `--padding-cell-mobile` | `10px 8px` | 表格儲存格（手機） |

### 頁面
| 變數 | 數值 | 用途 |
|---|---|---|
| `--page-max-width` | `1080px` | 內容最大寬度 |
| `--page-padding` | `32px 24px 64px` | 頁面內距 |
| `--page-padding-mobile` | `20px 12px 40px` | 頁面內距（手機） |
| `--header-logo-height` | `60px` | 頁首 Logo 高度（MoleForm 新增，非 CheMScutter 原值） |

### 配方工作台與彈窗（任務 018，D45；MoleForm 新增，非 CheMScutter 原值）
| 變數 | 數值 | 用途 |
|---|---|---|
| `--workbench-max-width` | `1840px` | 工作台分頁的內容最大寬度（其他分頁仍用 `--page-max-width`）；同事螢幕約 1900×1200 |
| `--workbench-columns` | `2fr 3fr` | 左欄（配方輸入）約 40%、右欄（即時結果）約 60% |
| `--workbench-gap` | `24px` | 兩欄間距 |
| `--thumb-width`／`--thumb-height` | `96px`／`48px` | 成分列的結構縮圖；程式內繪圖尺寸（`Workbench.tsx` 的 `THUMB_WIDTH`、`THUMB_HEIGHT`）需一致 |
| `--modal-width`／`--modal-width-wide` | `820px`／`1040px` | 彈窗寬度（加入成分／成分詳細） |
| `--color-backdrop` | `rgba(32, 52, 60, 0.55)` | 彈窗外的暗色區域 |
| `--shadow-modal` | `0 12px 40px rgba(32, 52, 60, 0.35)` | 彈窗與「⋯」選單的陰影 |
| `--z-modal` | `100` | 彈窗層級 |

## 響應式斷點

`@media (max-width: 600px)`（CheMScutter 原值）。CSS 變數不能用在媒體查詢條件中，所以此數值直接寫在 `base.css` 的 `@media` 裡；要改請同時改這裡與所有 `@media`。

## 配方工作台的版面（任務 018，D45）

- 分頁：配方工作台（預設）、分子工具、化合物庫。
- 寬度 **1280px 以上**：左欄輸入、右欄結果並排；右欄 `position: sticky`，自己捲動，左欄捲動時它不跟著跑。**小於 1280px**（`@media (max-width: 1279px)`，直接寫在 `workbench.css`）：改為輸入在上、結果在下，不固定。
- 右欄四個區塊（組成、交聯第 0 層、交聯第 1 層、理論配比與比例掃描）可展開／收合，預設全部展開，狀態只存在畫面中。
- 彈窗：Esc 或點暗色區域關閉；開啟時焦點移進彈窗，關閉後回到原本的按鈕。Ketcher 的 iframe 只在需要時載入（彈窗的 Ketcher 分頁、成分詳細的「用 Ketcher 編輯結構」、分子工具分頁顯示時），同一時間最多一個。焦點在 Ketcher 畫布內時，Esc 不會傳到彈窗外層（瀏覽器對 iframe 的限制），請用「✕」或點暗色區域關閉。

## 3D 構象的自訂值（任務 011）

下列數值與名稱是 **AI 工具實作時自訂、不來自文獻**，使用者已確認保留（2026-10-29）。要改請同時改程式與本節。

### 構象合併閾值

- 位置：`src/core/conformer/session.ts` 的 `MERGE_RMS_ANGSTROM`，目前 **0.1 Å**。
- 意義：MMFF94 最佳化後，兩個構象**重原子之間全部原子對距離**的均方根差在此以內，視為同一構象並合併（保留先產生者）。用距離矩陣比較，與旋轉、平移無關。
- 其他自訂值：預設構象數 5、每次增加 5、上限 30、固定種子 42、產生器嘗試次數上限 60（`session.ts`）。

### 3D SDF 欄位（`src/core/conformer/export.ts`）

全部構象各一筆，欄位如下；能量欄位只在有 MMFF94 能量時出現。

| 欄位 | 意義 |
|---|---|
| `Conformer` | 構象序號（從 1 起算）；有能量時依能量由低到高排序（1 為最低能量），未最佳化時為產生順序 |
| `Seed` | ConformerGenerator 的亂數種子（固定 42）；同結構同種子結果可重現 |
| `Optimized` | `MMFF94`：這個構象經 MMFF94 最佳化；`no`：未經力場最佳化（MMFF94 缺參數，K07） |
| `MMFF94_Energy_kcal_per_mol` | MMFF94 總能量，單位 kcal/mol（K08：以 MMFF94 Validation Suite 比對確認）。只適合比較**同一分子**的構象，不同分子之間不可比 |
| `Relative_Energy_kcal_per_mol` | 相對於本檔所有構象中最低能量者的差，單位 kcal/mol；最低者為 0 |

### 構象選單的說明文字

能量最低的構象標示「最低能量（建議使用）」，產生 3D 後預設顯示它；選單旁附說明：「相對能量相差約 1–2 kcal/mol 以內的構象，在室溫下會同時存在；本結果為 MMFF94 力場對單一分子在真空中的估算，未考慮溶劑與周圍分子。」（使用者指定的文字，不得改寫。）

## 交聯第 0 層的判定規則（任務 016）

依每個反應配對兩邊的「每分子平均反應官能度 f」做計數判定（f = 位點數 × 規則官能度；聚合物再乘聚合度 DP）：

| 條件 | 判定 |
|---|---|
| 兩邊都 f ≥ 2，且至少一邊 f > 2 | 具形成網路的結構條件 |
| 兩邊都 f = 2 | 具鏈延長的結構條件 |
| 有一邊 f < 2（例如 f = 1） | 具封端的結構條件；若另一邊是聚合物則為具接枝的結構條件 |
| 有一邊 f 未知（聚合物缺少分子量） | 無法判定 |

整個配方：任一配對具形成網路的結構條件，即判定「配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層」；否則依序為「具鏈延長的結構條件」、「具封端／接枝的結構條件」、無反應。第 0 層只看結構條件，不代表一定凝膠（使用者審核意見，2026-10-29）。這是依官能度的計數判定，不判斷反應會不會實際發生（D17）；結果畫面不顯示官能基數量與當量（D09），數量只列在 `docs/verification/phase4-輸出.md`。

## 聚合物 mol% 與分子量輸入（任務 019，D46、D47）

- 任務 013 報告第 3 節「含連接點 `*` 的成分使 mol% 整區不輸出」的規則，**聚合物有分子量時已由 D46 取代**：預設以整條鏈（Mn）計，結果區可切換「以鏈計／以重複單元計」，並在表格下附註「聚合物 mol% 以整條鏈（Mn）計」或「聚合物 mol% 以重複單元計」。切換只影響 mol% 顯示，不影響交聯計算。
- 含連接點但缺分子量（沒有 Mw、Mn、DP）的成分，仍依任務 014 的規則，該區不輸出 mol%，並說明原因。
- 區域單位選 mol% 時：聚合物以目前選擇的基準換算為質量（鏈：質量 = mol% × Mn；重複單元：質量 = mol% × M_unit）；此時切換基準會改變各成分的質量比。
- 分子量輸入：主要為 Mw＋PDI（PDI 留空顯示「使用預設 PDI = 2」）；可切換為 Mn＋PDI 或 DP＋PDI。舊資料（只有 Mn 或 DP）顯示「舊資料：PDI 使用預設值 2」。輸入欄旁顯示的換算值（Mw、Mn、DP_n、DP_w）屬使用者輸入的輔助，不在結果區顯示（D09）。
- 第 0 層判定規則表中「聚合物缺少分子量」現為「聚合物缺少分子量（Mw、Mn、DP 皆未填）」。
