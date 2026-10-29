# 介面設計規則（DESIGN）

介面風格直接沿用 CheMScutter（DECISIONS D34）。所有變數定義在 `src/ui/theme.css` 的 `:root`，數值取自 CheMScutter 的 `src/ui/analysis.css`、`src/ui/results/results.css`（原樣，不自行調整）。

## 規則

**新增畫面一律使用 `theme.css` 的變數；需要新顏色或尺寸時先加進 `theme.css` 與本檔。** `src/ui/` 內除 `theme.css` 外的 CSS 檔不得硬寫色碼。

## 檔案分工

- `src/ui/theme.css`：變數
- `src/ui/base.css`：全域 `body`、標題、`button`、`input`、`select`、`label`、`.card`、`.error`、`.number`
- `src/ui/components/components.css`：頁首、頁尾、結果顯示元件

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

## 響應式斷點

`@media (max-width: 600px)`（CheMScutter 原值）。CSS 變數不能用在媒體查詢條件中，所以此數值直接寫在 `base.css` 的 `@media` 裡；要改請同時改這裡與所有 `@media`。

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
