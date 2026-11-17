# 任務 P6B 結果：Tm、Td、吸濕性、彈性模數（PLAN 6.4、6.5）

日期：2026-11-17　執行：Claude Code　既有計算模組、黃金檔內容、CI 設定都沒改（只有 `tests/golden/csv.json` 依 `export-csv.ts` 重產，新增 5 個 `parseCsv/data:` 案例，其餘不變）。

## 做到哪裡
| 項目 | 結果 |
|---|---|
| 資料表（待使用者審，每列有書名、表號、頁碼） | `ym_groups.csv` 98 列（Table 6.8、6.14）、`yd_groups.csv` 62 列（Table 21.2）、`water_groups.csv` 13 列（Table 18.14）、`ym_side_chain.csv`（Table 6.9）、`ym_ch2_sequence.csv`（位置值與 Table 6.10）。逐頁看圖謄錄，括號值照標、多值用條件欄區分；與 Yg 重疊的基團沿用 Yg 的 SMARTS |
| `/tm` | 式 6.20–6.21；主鏈 CH2 依位置值；Table 6.9 五個系列依式 6.22–6.24；`crystallizable=false` 回「不適用」，省略則警告；缺基團回報 |
| `/td` | 式 21.4，K 與 °C，備註寫明是 Td,1/2 不是 Td5 |
| `/moisture` | Table 18.14、式 18.15；RH 只允許五個值（其他 400）；未涵蓋基團與括號值列出並警告 |
| `/modulus` | **不輸出數值**，只回報缺什麼（見下） |
| 面板、文件 | I01 面板新增四列與 RH 選單、橋接白名單加四個端點；MODELS、DATA、PLAN、verification README 已更新 |
| 檢查 | 引擎 pytest 9080 通過、`npm run typecheck` 通過、新增 TS 測試與橋接測試通過；其餘 TS 測試與建置交 CI |

## 你的決定（2026-11-17）已實作
- Td：夾在兩芳香環間的 –C(CH3)2– 用第三個值 35（依 Poly(dian terephthalate) 262、Poly(dian carbonate) 173）；–C(=O)NH– 用 32.5（依 Poly(hexamethylene adipamide) 160、Poly(epsilon-caproamide) 80；書的 30、37 保留不用）。皆標「詮釋（依書算例推得）、待使用者審」，書的數字沒改。–C(=O)–O– 20／25、受阻 s 值，以及 Tm 的受阻 –C(CH3)2–（s 22、ss 39）、–C(=O)– al／ar，書的算例沒用到，維持回報缺基團。Table 21.2 的 n／c／cc 對應與 –CHF– 的 18 維持待審。
- 模數：Table 14.4、莫耳熱容、內聚能、熔化熱不收錄；`/modulus` 只回報缺什麼；PLAN 6.5 彈性模數未勾選並註明原因。

## 書算例對照（`docs/verification/phase6-Tm-Td-吸濕-彈性模數-輸出.md`，重跑結果）
- **Tm（Table 6.15）**：54 個中相符 40、不符 14（差 −29～+39 K）。重跑時發現先前 4 個「無法計算」是我的 SMILES 切法讓酯基跨在單元邊界，改寫後可算（3 個相符，1 個 +28 K）。不符多數對得上書自己表的矛盾（丙烯酸酯 Ymo 印 48，改 44 才得書 calc；尼龍 6,6 的書 calc 超出 Table 6.11 加總；含對伸苯基二亞甲基者正負號不一）。
- **Td（Table 21.3）**：34 個中相符 25、不符 7、無法計算 2（甲基苯乙烯、環氧丙烷）。Yd calc 欄算得出的 32 個中 29 個相符（含兩個尼龍與兩個雙酚 A 聚合物）；不符的 7 個中 4 個（PCTFE、噁二唑、兩個尼龍）Yd 相符，只是書的 Td calc 欄與自己的 Yd÷M 不一致；其餘是聚異戊二烯（差 0.5）、聚對二甲苯（差 1）、聚對伸苯（相鄰伸苯基不算共軛的規則限制）。
- **吸濕（Example 18.4）**：相符（非晶 11.93 vs 12；結晶度 70% 為 3.58 vs 3.6）。
- **模數（Table 13.6）**：能算的列數 0。

## 彈性模數缺什麼
式 13.30 缺 Rao 函數（Table 14.4）；式 13.31 缺莫耳熱容（Chapter 5）與 Cp/Cv（Fig. 5.4）；式 13.32 缺內聚能（Chapter 7）與熔化熱（Chapter 5）；E 還缺 G 的 Hartmann 函數。本專案沒有，未找外部資料。

## 仍需使用者決定
1. 其餘不符（Tm 14 個、Td 3 個）是否接受為書自己的矛盾或規則限制。
2. 要不要之後收錄 Table 14.4 等，做 K／E。

## CI
（待補）
