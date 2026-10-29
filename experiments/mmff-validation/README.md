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

腳本用根專案的 `openchemlib`（9.25.2）。做法：讀 mol2 座標，**不做最佳化**，直接以 `ForceFieldMMFF94(mol, 'MMFF94').getTotalEnergy()` 取得能量，與 `MMFF94.energies` 的 OPTIMOL 欄位比對。納入「只含 H／C／N／O／F／Cl／Br／I／S／P／Si、鍵型別為 1／2／3／am（醯胺，當單鍵）」的分子。mol2 沒有形式電荷欄位（也沒有下載 `MMFF94.fc_hypervalent`），所以形式電荷由每個原子的總鍵級推得（例如 N 四價 +1、單鍵的末端 O −1、鹵離子 −1；對照表在 `compare.mjs`），再用「形式電荷總和 = mol2 部分電荷總和的四捨五入」核對，推不出或對不上者排除。結果分三群（A 中性 C/H/N/O/F/Cl、B 中性含 S/P/Si/Br/I、C 離子或兩性離子）寫到 `results.md` 與 `results.json`。含金屬的 10 個分子與 7 個形式電荷無法推定的分子被排除（名單見 `results.md` 第二行）。
