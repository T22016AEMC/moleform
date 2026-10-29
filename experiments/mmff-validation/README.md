# experiments/mmff-validation

任務 011（C-11、K08）：用 MMFF94 官方驗證資料集確認 OpenChemLib MMFF94 能量的單位。這個資料夾的內容**不接入正式程式碼**。

## 提交了什麼、沒提交什麼

- 提交：`compare.mjs`（比對腳本）、`README.md`（本檔）、`results.md`／`results.json`（比對結果）。
- **不提交**：`data/` 內的資料集原始檔（`.mol2`、`.energies`、`.titles`、`README`、`.log`）。資料集的重新散布授權尚未確認，repo 又是公開的，所以 `data/` 已列入 `.gitignore`。

## 資料來源

- 網址：`https://ccl.net/cca/data/MMFF94/`（MMFF94 Validation Suite，T. A. Halgren, Merck，1998 年 11 月修訂版；README 說明 698 個結構來自 CSD，另加 63 個小分子與離子，共 761 個）
- 下載日期：2026-10-29（經使用者同意）
- 下載的檔案（放在 `data/`）：

| 檔名 | 大小（bytes） | 用途 |
|---|---|---|
| `MMFF94_hypervalent.mol2` | 1,653,121 | 資料集提供的座標（高價表示法） |
| `MMFF94.energies` | 31,499 | 參考總能量，單位 kcal/mol（OPTIMOL 與 BatchMin 5.5） |
| `MMFF94.titles` | 53,537 | 分子名稱 |
| `README` | 17,319 | 資料集說明 |
| `MMFF94_bmin.log` | 1,181,426 | 能量分項（備查，本次比對未用到） |

未下載 `MMFF94_dative.mol2`、`MMFF94_opti.log`、`MMFF94.tar.gz`。

## 重新下載

在專案根目錄（PowerShell）：

```powershell
New-Item -ItemType Directory -Force experiments\mmff-validation\data | Out-Null
foreach ($f in 'MMFF94_hypervalent.mol2','MMFF94.energies','MMFF94.titles','README','MMFF94_bmin.log') {
  Invoke-WebRequest -Uri "https://ccl.net/cca/data/MMFF94/$f" -OutFile "experiments\mmff-validation\data\$f" -UseBasicParsing
}
```

## 執行

```powershell
node experiments/mmff-validation/compare.mjs
```

腳本用根專案的 `openchemlib`（9.25.2）。做法：讀 mol2 座標，**不做最佳化**，直接以 `ForceFieldMMFF94(mol, 'MMFF94').getTotalEnergy()` 取得能量，與 `MMFF94.energies` 的 OPTIMOL 欄位比對。只挑「中性、只含 C／H／N／O／F／Cl、鍵級為 1／2／3、每個原子的總鍵級等於標準價數」的分子（排除離子、芳香鍵型別與其他元素的表示法差異，避免把表示法差異誤判成單位問題）。結果寫到 `results.md` 與 `results.json`。
