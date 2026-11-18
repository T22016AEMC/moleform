# 反應規則 D 批命中列表與本卡填入數值總表（任務 P7-2，D67、D22 第 3 點）

用引擎第 0 層與專案的真實資料表（`src/data/functional_groups.csv`、`reaction_rules.csv`）對四條新規則（馬來醯亞胺自聚、ene 後續共聚、苯并㗁嗪＋環氧、肟封端異氰酸酯解封端）的代表性小配方列出：每條規則對哪些成分的哪些位置命中、官能度與當量、第 1 層是否支援。
本檔由 `scripts/verification/p7-2-hit-list.py` 產生；分子只用規則表測試分子與 docs/verification 已有的分子，沒有新增。**「使用者判定」欄留空，請審化學正確性。**

- 位置：命中官能基的反應原子在該成分 SMILES 中的原子序（0 起算；聚合物重複單元不在本列表）。
- 官能度 f：位點數 × 規則的 functionality（每個基團形成的鍵數）；當量 = 分子量 ÷ f（g/eq），分子量由 RDKit 平均分子量計算，僅供驗證，不顯示於結果頁（D09）。
- 第 1 層：`支援` = 由現有 Miller–Macosko 公式計算；`不支援` = 回報原因、不給數值。四條新規則第 1 層一律不支援（原因見表）。
- 所有新規則與官能基 `review_status` 皆為 `pending`；四條規則的反應 SMARTS 全是自行撰寫（D22），maleimide+propenyl.copolymerization 與 benzoxazine+epoxy 是形式表示，請特別審。
- 馬來醯亞胺自聚用「熱自由基起始劑觸發」表示（與 C 批鏈增長同一種催化劑配對表示法）；BMI 沒有起始劑時無此配對，所以 P7-1B 既有的 BMI＋二胺等配方輸出不變。
- 不做反向驗證與邊界探針（D64）。

## 1 馬來醯亞胺自聚（熱起始劑觸發）：N-苯基馬來醯亞胺＋AIBN

成分：N-苯基馬來醯亞胺（`O=C1C=CC(=O)N1c1ccccc1`，Small Molecule）；AIBN（`CC(C)(C#N)N=NC(C)(C)C#N`，Catalyst/Initiator）

成分官能基命中：N-苯基馬來醯亞胺：maleimide × 1；AIBN：initiator.thermal × 1

第 0 層判定：催化劑觸發的反應（催化劑不計當量，不判定網路）

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| maleimide.homopolymerization | N-苯基馬來醯亞胺：maleimide × 1，[[3, 2]]<br>AIBN：initiator.thermal × 1，[[5, 6]] | N-苯基馬來醯亞胺：f = 2，當量 86.59 g/eq<br>AIBN：f = 1，當量 164.21 g/eq | 需要催化劑（熱自由基起始劑（偶氮或過氧化物））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 催化劑配對（不計當量） | 不支援：此體系的凝膠點與當量計算尚未支援：馬來醯亞胺自聚為自由基鏈增長聚合（自反應），不是逐步聚合；每個 C=C 的鏈長與分子量分布由起始、增長、終止的速率決定 | |

## 1 馬來醯亞胺自聚（熱起始劑觸發）：雙馬來醯亞胺（BMI）＋AIBN

成分：BMI（`O=C1C=CC(=O)N1c1ccc(Cc2ccc(N3C(=O)C=CC3=O)cc2)cc1`，Resin）；AIBN（`CC(C)(C#N)N=NC(C)(C)C#N`，Catalyst/Initiator）

成分官能基命中：BMI：maleimide × 2；AIBN：initiator.thermal × 1

第 0 層判定：催化劑觸發的反應（催化劑不計當量，不判定網路）

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| maleimide.homopolymerization | BMI：maleimide × 2，[[3, 2], [19, 20]]<br>AIBN：initiator.thermal × 1，[[5, 6]] | BMI：f = 4，當量 89.59 g/eq<br>AIBN：f = 1，當量 164.21 g/eq | 需要催化劑（熱自由基起始劑（偶氮或過氧化物））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 催化劑配對（不計當量） | 不支援：此體系的凝膠點與當量計算尚未支援：馬來醯亞胺自聚為自由基鏈增長聚合（自反應），不是逐步聚合；每個 C=C 的鏈長與分子量分布由起始、增長、終止的速率決定 | |

## 1 反例：雙馬來醯亞胺（BMI），沒有起始劑（自聚規則由起始劑觸發，不配對）

成分：BMI（`O=C1C=CC(=O)N1c1ccc(Cc2ccc(N3C(=O)C=CC3=O)cc2)cc1`，Resin）

成分官能基命中：BMI：maleimide × 2

**第 0 層：無反應配對**（符合預期的反例時請於判定欄確認）。

| 規則 | 命中成分與位置 | 官能度與當量 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|
| （無） | — | — | — | |

## 1 反例：N-甲基琥珀醯亞胺（飽和）＋AIBN

成分：N-甲基琥珀醯亞胺（`O=C1CCC(=O)N1C`，Small Molecule）；AIBN（`CC(C)(C#N)N=NC(C)(C)C#N`，Catalyst/Initiator）

成分官能基命中：N-甲基琥珀醯亞胺：（無）；AIBN：initiator.thermal × 1

**第 0 層：無反應配對**（符合預期的反例時請於判定欄確認）。

| 規則 | 命中成分與位置 | 官能度與當量 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|
| （無） | — | — | — | |

## 2 ene 後續共聚（馬來醯亞胺＋ene 加成物的內烯）：N-苯基馬來醯亞胺＋ene 加成物（烯丙基酚與馬來醯亞胺 ene 後的內烯）

成分：N-苯基馬來醯亞胺（`O=C1C=CC(=O)N1c1ccccc1`，Small Molecule）；ene 加成物（`CN1C(=O)CC(C=Cc2ccccc2O)C1=O`，Small Molecule）

成分官能基命中：N-苯基馬來醯亞胺：maleimide × 1；ene 加成物：hydroxyl.phenolic × 1、aromatic.ch.phenol.ortho_para × 2、alkene.propenyl.aryl × 1

第 0 層判定：具鏈延長的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| maleimide+propenyl.copolymerization | N-苯基馬來醯亞胺：maleimide × 1，[[3, 2]]<br>ene 加成物：alkene.propenyl.aryl × 1，[[7, 6]] | N-苯基馬來醯亞胺：f = 2，當量 86.59 g/eq<br>ene 加成物：f = 2，當量 115.63 g/eq | 不需催化劑 | 尚無文獻資料 | 具鏈延長的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：ene 加成物的內烯與馬來醯亞胺的共聚是 ene、Diels–Alder 或自由基交替共聚並行的多步反應，官能度隨反應改變，不是單一步驟的等活性逐步加成 | |

## 2 ene 後續共聚（馬來醯亞胺＋丙烯基酚）：BMI＋二丙烯基雙酚 A

成分：BMI（`O=C1C=CC(=O)N1c1ccc(Cc2ccc(N3C(=O)C=CC3=O)cc2)cc1`，Resin）；二丙烯基雙酚 A（`CC(C)(c1ccc(O)c(C=CC)c1)c1ccc(O)c(C=CC)c1`，Resin）

成分官能基命中：BMI：maleimide × 2；二丙烯基雙酚 A：hydroxyl.phenolic × 2、aromatic.ch.phenol.ortho_para × 2、alkene.propenyl.aryl × 2

第 0 層判定：配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| maleimide+propenyl.copolymerization | BMI：maleimide × 2，[[3, 2], [19, 20]]<br>二丙烯基雙酚 A：alkene.propenyl.aryl × 2，[[9, 10], [19, 20]] | BMI：f = 4，當量 89.59 g/eq<br>二丙烯基雙酚 A：f = 4，當量 77.11 g/eq | 不需催化劑 | 尚無文獻資料 | 具形成網路的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：ene 加成物的內烯與馬來醯亞胺的共聚是 ene、Diels–Alder 或自由基交替共聚並行的多步反應，官能度隨反應改變，不是單一步驟的等活性逐步加成 | |

## 2 對照（P7-1B 既有 ene 規則）：BMI＋二烯丙基雙酚 A（烯丙基，不是丙烯基內烯，只命中 maleimide+allyl.ene）

成分：BMI（`O=C1C=CC(=O)N1c1ccc(Cc2ccc(N3C(=O)C=CC3=O)cc2)cc1`，Resin）；二烯丙基雙酚 A（`CC(C)(c1ccc(O)c(CC=C)c1)c1ccc(O)c(CC=C)c1`，Resin）

成分官能基命中：BMI：maleimide × 2；二烯丙基雙酚 A：hydroxyl.phenolic × 2、aromatic.ch.phenol.ortho_para × 2、alkene.terminal × 2、alkene.allyl × 2

第 0 層判定：具鏈延長的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| maleimide+allyl.ene | BMI：maleimide × 2，[[3, 2], [19, 20]]<br>二烯丙基雙酚 A：alkene.allyl × 2，[[11, 10, 9], [21, 20, 19]] | BMI：f = 2，當量 179.18 g/eq<br>二烯丙基雙酚 A：f = 2，當量 154.21 g/eq | 不需催化劑 | 尚無文獻資料 | 具鏈延長的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：ene 加成物仍可與馬來醯亞胺繼續共聚（多步反應），不是單一步驟的等活性逐步加成 | |

## 2 反例：N-苯基馬來醯亞胺＋苯乙烯（端烯，不是芳基丙烯基型內烯）

成分：N-苯基馬來醯亞胺（`O=C1C=CC(=O)N1c1ccccc1`，Small Molecule）；苯乙烯（`C=Cc1ccccc1`，Small Molecule）

成分官能基命中：N-苯基馬來醯亞胺：maleimide × 1；苯乙烯：alkene.terminal × 1、styrene × 1

**第 0 層：無反應配對**（符合預期的反例時請於判定欄確認）。

| 規則 | 命中成分與位置 | 官能度與當量 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|
| （無） | — | — | — | |

## 3 苯并㗁嗪＋環氧：雙酚 A 型苯并㗁嗪＋雙酚 A 二縮水甘油醚（BADGE）

成分：苯并㗁嗪 BA-a（`CC(C)(c1ccc2OCN(c3ccccc3)Cc2c1)c1ccc2OCN(c3ccccc3)Cc2c1`，Resin）；BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）

成分官能基命中：苯并㗁嗪 BA-a：benzoxazine × 2；BADGE：ether.epoxide × 2

第 0 層判定：具鏈延長的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| benzoxazine.ring_opening | 苯并㗁嗪 BA-a：benzoxazine × 2，[[7, 8], [23, 24]] | 苯并㗁嗪 BA-a：f = 2，當量 231.30 g/eq | 不需催化劑 | 160–220 °C | 具鏈延長的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：苯并㗁嗪自開環聚合（自反應，開環後再產生反應位點），不是兩類官能基的配對 | |
| benzoxazine+epoxy | 苯并㗁嗪 BA-a：benzoxazine × 2，[[7, 8], [23, 24]]<br>BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]] | 苯并㗁嗪 BA-a：f = 2，當量 231.30 g/eq<br>BADGE：f = 2，當量 170.21 g/eq | 不需催化劑 | 尚無文獻資料 | 具鏈延長的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：苯并㗁嗪與環氧共反應時，開環產生的酚羥基與環氧反應、環氧自聚、苯并㗁嗪自開環並行，官能度隨反應改變，不是固定官能度的兩官能基配對 | |

## 3 反例：雙酚 A 型苯并㗁嗪＋乙醇（沒有環氧）

成分：苯并㗁嗪 BA-a（`CC(C)(c1ccc2OCN(c3ccccc3)Cc2c1)c1ccc2OCN(c3ccccc3)Cc2c1`，Resin）；乙醇（`CCO`，Small Molecule）

成分官能基命中：苯并㗁嗪 BA-a：benzoxazine × 2；乙醇：hydroxyl.alcohol × 1

第 0 層判定：具鏈延長的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| benzoxazine.ring_opening | 苯并㗁嗪 BA-a：benzoxazine × 2，[[7, 8], [23, 24]] | 苯并㗁嗪 BA-a：f = 2，當量 231.30 g/eq | 不需催化劑 | 160–220 °C | 具鏈延長的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：苯并㗁嗪自開環聚合（自反應，開環後再產生反應位點），不是兩類官能基的配對 | |

## 4 肟封端異氰酸酯解封端：丁酮肟封端的丁基異氰酸酯（單一成分）

成分：MEKO 封端丁基異氰酸酯（`CCCCNC(=O)ON=C(C)CC`，Small Molecule）

成分官能基命中：MEKO 封端丁基異氰酸酯：isocyanate.blocked.oxime × 1

第 0 層判定：具封端／接枝的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| isocyanate.deblocking.oxime | MEKO 封端丁基異氰酸酯：isocyanate.blocked.oxime × 1，[[4, 5, 7]] | MEKO 封端丁基異氰酸酯：f = 1，當量 186.25 g/eq | 不需催化劑 | 85–260 °C | 具封端的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：肟封端異氰酸酯解封端是熱解離（單分子、自反應），釋出的異氰酸酯再與羥基或胺反應，本身不是兩類官能基的交聯 | |

## 4 肟封端異氰酸酯解封端：HDI 的雙（丙酮肟）封端物（單一成分，兩個封端基）

成分：HDI 雙肟封端物（`CC(C)=NOC(=O)NCCCCCCNC(=O)ON=C(C)C`，Resin）

成分官能基命中：HDI 雙肟封端物：isocyanate.blocked.oxime × 2

第 0 層判定：具鏈延長的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| isocyanate.deblocking.oxime | HDI 雙肟封端物：isocyanate.blocked.oxime × 2，[[7, 5, 4], [14, 15, 17]] | HDI 雙肟封端物：f = 2，當量 157.19 g/eq | 不需催化劑 | 85–260 °C | 具鏈延長的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：肟封端異氰酸酯解封端是熱解離（單分子、自反應），釋出的異氰酸酯再與羥基或胺反應，本身不是兩類官能基的交聯 | |

## 4 反例：酚封端異氰酸酯（本卡不收酚封端）

成分：酚封端異氰酸酯（`CNC(=O)Oc1ccccc1`，Small Molecule）

成分官能基命中：酚封端異氰酸酯：（無）

**第 0 層：無反應配對**（符合預期的反例時請於判定欄確認）。

| 規則 | 命中成分與位置 | 官能度與當量 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|
| （無） | — | — | — | |

## 4 反例：己內醯胺封端異氰酸酯（本卡不收己內醯胺封端）

成分：己內醯胺封端異氰酸酯（`CNC(=O)N1CCCCCC1=O`，Small Molecule）

成分官能基命中：己內醯胺封端異氰酸酯：（無）

**第 0 層：無反應配對**（符合預期的反例時請於判定欄確認）。

| 規則 | 命中成分與位置 | 官能度與當量 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|
| （無） | — | — | — | |

## 4 解封端後的反應（既有規則，不屬本卡）：遊離異氰酸酯＋丁醇（對照：解封端放出的異氰酸酯再走 isocyanate+alcohol）

成分：丁基異氰酸酯（`CCCCN=C=O`，Small Molecule）；丁醇（`CCCCO`，Small Molecule）

成分官能基命中：丁基異氰酸酯：isocyanate × 1；丁醇：hydroxyl.alcohol × 1

第 0 層判定：具封端／接枝的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| isocyanate+alcohol | 丁基異氰酸酯：isocyanate × 1，[[4, 5, 6]]<br>丁醇：hydroxyl.alcohol × 1，[[4]] | 丁基異氰酸酯：f = 1，當量 99.13 g/eq<br>丁醇：f = 1，當量 74.12 g/eq | 不需催化劑 | 尚無文獻資料 | 具封端的結構條件 | 支援 | |

## 本卡填入數值的總表（D67）

數值由資料表讀出；`review_status` 皆為 `pending`。單位鍵體積變化的數值是文獻原文的「收縮量」（正值＝體積減少），沒有任何換算；溫度不是計算結果，不進任何公式（S03）。**「使用者判定」欄留空，請逐條審。**
沒有找到可引用數值的規則欄位（總表以外的所有溫度與單位鍵體積變化欄）維持空白，原因見各規則 notes 與報告；光觸發的規則溫度欄維持空白（notes 寫「光觸發」）。

| 規則 id | 欄位 | 數值 | 單位 | 出處 | 適用條件 | 使用者判定 |
|---|---|---|---|---|---|---|
| acrylate+initiator.thermal | bond_volume_change | 22.6 | cm3/mol（每莫耳反應 C=C 的收縮量，正值＝體積減少） | Stansbury & Ge, RadTech Report (May/June 2003) p.57（https://sites.lafayette.edu/lss/files/2013/04/Stansbury_RadtechReport2003.pdf） | 丙烯酸甲酯聚合的 molar shrinkage 22.6；密度法；其他丙烯酸酯為同類外推。另見 Ye 等, Macromolecules 2011 Table 2（DOI 10.1021/ma2018809；PMC3252887）（（甲基）丙烯酸酯均聚 22.6 mL/mol） | |
| acrylate+initiator.photo | bond_volume_change | 22.6 | cm3/mol（每莫耳反應 C=C 的收縮量，正值＝體積減少） | Stansbury & Ge, RadTech Report (May/June 2003) p.57（https://sites.lafayette.edu/lss/files/2013/04/Stansbury_RadtechReport2003.pdf） | 同上（與熱／光起始無關的鏈增長 C=C 收縮量） | |
| methacrylate+initiator.thermal | bond_volume_change | 23 | cm3/mol（每莫耳反應 C=C 的收縮量，正值＝體積減少） | Stansbury & Ge, RadTech Report (May/June 2003) p.57（https://sites.lafayette.edu/lss/files/2013/04/Stansbury_RadtechReport2003.pdf） | 「大多數甲基丙烯酸酯約 23 ± 1.8 cm3/mol C=C」（引 Patel 等 1987 單酯系列）；其他來源 22.5、23.0、22.6，量值略異，見規則 notes | |
| methacrylate+initiator.photo | bond_volume_change | 23 | cm3/mol（每莫耳反應 C=C 的收縮量，正值＝體積減少） | Stansbury & Ge, RadTech Report (May/June 2003) p.57（https://sites.lafayette.edu/lss/files/2013/04/Stansbury_RadtechReport2003.pdf） | 同上 | |
| thiol+alkene.allyl | bond_volume_change | 12.6 | cm3/mol（每莫耳反應 C=C 的收縮量，正值＝體積減少） | Ye 等, Macromolecules 2011 Table 2（DOI 10.1021/ma2018809；PMC3252887） | 硫醇–烯逐步加成的通用 shrinkage factor 12.6（文獻自稱 estimated，引 Lu 等 2005 Dent. Mater. 21:1129）；不是烯丙基個別量測值 | |
| thiol+vinyl.ether | bond_volume_change | 12.6 | cm3/mol（每莫耳反應 C=C 的收縮量，正值＝體積減少） | Ye 等, Macromolecules 2011 Table 2（DOI 10.1021/ma2018809；PMC3252887） | 同上；不是乙烯基醚個別量測值 | |
| thiol+norbornene | bond_volume_change | 12.6 | cm3/mol（每莫耳反應 C=C 的收縮量，正值＝體積減少） | Ye 等, Macromolecules 2011 Table 2（DOI 10.1021/ma2018809；PMC3252887） | 同上；不是降冰片烯個別量測值 | |
| epoxy+pag.cationic | bond_volume_change | 11 | cm3/mol（每莫耳環氧基開環的收縮量，正值＝體積減少） | Stansbury & Ge, RadTech Report (May/June 2003) p.57（https://sites.lafayette.edu/lss/files/2013/04/Stansbury_RadtechReport2003.pdf） | 文獻只給環氧乙烷 ≈ 11；環氧樹脂（縮水甘油醚、環脂族環氧）為同類外推 | |
| benzoxazine.ring_opening | temp_min_c／temp_max_c | 160–220 | °C | Lochab 等, Polymers 13 (2021) 1260 §3（DOI 10.3390/polym13081260；PMC8069336） | 苯并㗁嗪單體熱開環聚合（不加催化劑）的一般範圍 160–220，隨結構、環數、純度而變；不是後硬化溫度。同篇另有 140–240（無催化劑，引 ref 121）、加胺 120–150 | |
| benzoxazine+phenol_ring | temp_min_c／temp_max_c | 160–220 | °C | Lochab 等, Polymers 13 (2021) 1260 §3（DOI 10.3390/polym13081260；PMC8069336） | 同上，是同一個開環在含酚體系中的表示，沿用同一範圍（同體系外推） | |
| isocyanate.deblocking.oxime | temp_min_c／temp_max_c | 85–260 | °C | Rolph 等, Polym. Chem. 7 (2016) 7351 Table 2（DOI 10.1039/C6PY01776B；https://wrap.warwick.ac.uk/id/eprint/87384/1/WRAP_C6PY01776B.pdf） | 肟封端（MEKO 等）解封端溫度，文獻彙整各研究所報範圍，量測法不同（DSC、TGA、FTIR 等），文獻稱僅供近似指引；範圍很寬。同表：酚 60–180、己內醯胺 70–170、吡唑 85–200 | |

既有且不覆蓋：`resol.methylol+phenol_ring` 的 60–100 °C 是可溶酚醛的製備（縮合階段）條件（P7-1A，Pilato 2010 Table 4.2），沒有找到完整硬化溫度的明確範圍，未更動。

