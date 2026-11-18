# 反應規則 C 批命中列表（任務 P7-1C，D65、D22 第 3 點）

用引擎第 0 層與專案的真實資料表（`src/data/functional_groups.csv`、`reaction_rules.csv`）對每個體系的代表性小配方列出：每條規則對哪些成分的哪些位置命中、官能度與當量、第 1 層是否支援。
本檔由 `scripts/verification/p7-1c-hit-list.py` 產生；分子只用規則表測試分子與 docs/verification 已有的分子，沒有新增。**「使用者判定」欄留空，請審化學正確性。**

- 位置：命中官能基的反應原子在該成分 SMILES 中的原子序（0 起算；聚合物重複單元不在本列表）。
- 官能度 f：位點數 × 規則的 functionality（每個基團形成的鍵數）；當量 = 分子量 ÷ f（g/eq），分子量由 RDKit 平均分子量計算，僅供驗證，不顯示於結果頁（D09）。
- 第 1 層：`支援` = 由現有 Miller–Macosko 公式計算；`不支援` = 回報原因、不給數值（鏈增長聚合不適用逐步聚合的凝膠點）。
- 所有新規則與官能基 `review_status` 皆為 `pending`。
- 配對判定「催化劑配對（不計當量）」：熱起始劑與光起始劑和光酸產生劑同一種表示法——起始劑是催化劑、不被計量消耗，不用官能度計數判定；起始劑的 f 沒有化學計量意義。
- 「成分官能基命中」列出成分命中的全部官能基（含 B 批以前的官能基），用來看含環氧的丙烯酸酯等同一分子命中兩種官能基；只做官能基命中，沒有跨體系規則。
- 不做反向驗證與邊界探針（D64）。

## 1 壓克力／甲基丙烯酸酯（光起始劑）：三羥甲基丙烷三丙烯酸酯（TMPTA）＋光起始劑 Irgacure 184

成分：TMPTA（`C=CC(=O)OCC(CC)(COC(=O)C=C)COC(=O)C=C`，Resin）；Irgacure 184（`O=C(c1ccccc1)C1(O)CCCCC1`，Catalyst/Initiator）

成分官能基命中：TMPTA：acrylate × 3；Irgacure 184：hydroxyl.alcohol × 1、initiator.photo × 1

第 0 層判定：催化劑觸發的反應（催化劑不計當量，不判定網路）

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| acrylate+initiator.photo | TMPTA：acrylate × 3，[[0, 1], [14, 13], [20, 19]]<br>Irgacure 184：initiator.photo × 1，[[1]] | TMPTA：f = 6，當量 49.39 g/eq<br>Irgacure 184：f = 1，當量 204.27 g/eq | 需要催化劑（光自由基起始劑（光起始劑，需照光））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 催化劑配對（不計當量） | 不支援：此體系的凝膠點與當量計算尚未支援：自由基鏈增長聚合（光起始劑觸發），不是逐步聚合；起始劑是催化劑，不被計量消耗，每個 C=C 的鏈長與分子量分布由起始、增長、終止的速率決定 | |

## 1 壓克力／甲基丙烯酸酯（熱起始劑）：丙烯酸丁酯＋AIBN

成分：丙烯酸丁酯（`C=CC(=O)OCCCC`，Small Molecule）；AIBN（`CC(C)(C#N)N=NC(C)(C)C#N`，Catalyst/Initiator）

成分官能基命中：丙烯酸丁酯：acrylate × 1；AIBN：initiator.thermal × 1

第 0 層判定：催化劑觸發的反應（催化劑不計當量，不判定網路）

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| acrylate+initiator.thermal | 丙烯酸丁酯：acrylate × 1，[[0, 1]]<br>AIBN：initiator.thermal × 1，[[5, 6]] | 丙烯酸丁酯：f = 2，當量 64.09 g/eq<br>AIBN：f = 1，當量 164.21 g/eq | 需要催化劑（熱自由基起始劑（偶氮或過氧化物））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 催化劑配對（不計當量） | 不支援：此體系的凝膠點與當量計算尚未支援：自由基鏈增長聚合（熱起始劑觸發），不是逐步聚合；起始劑是催化劑，不被計量消耗，每個 C=C 的鏈長與分子量分布由起始、增長、終止的速率決定 | |

## 1 壓克力／甲基丙烯酸酯（光起始劑）：甲基丙烯酸甲酯＋Irgacure 184

成分：MMA（`CC(=C)C(=O)OC`，Small Molecule）；Irgacure 184（`O=C(c1ccccc1)C1(O)CCCCC1`，Catalyst/Initiator）

成分官能基命中：MMA：methacrylate × 1；Irgacure 184：hydroxyl.alcohol × 1、initiator.photo × 1

第 0 層判定：催化劑觸發的反應（催化劑不計當量，不判定網路）

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| methacrylate+initiator.photo | MMA：methacrylate × 1，[[2, 1]]<br>Irgacure 184：initiator.photo × 1，[[1]] | MMA：f = 2，當量 50.06 g/eq<br>Irgacure 184：f = 1，當量 204.27 g/eq | 需要催化劑（光自由基起始劑（光起始劑，需照光））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 催化劑配對（不計當量） | 不支援：此體系的凝膠點與當量計算尚未支援：自由基鏈增長聚合（光起始劑觸發），不是逐步聚合；起始劑是催化劑，不被計量消耗，每個 C=C 的鏈長與分子量分布由起始、增長、終止的速率決定 | |

## 1 壓克力／甲基丙烯酸酯（熱起始劑）：甲基丙烯酸甲酯＋AIBN

成分：MMA（`CC(=C)C(=O)OC`，Small Molecule）；AIBN（`CC(C)(C#N)N=NC(C)(C)C#N`，Catalyst/Initiator）

成分官能基命中：MMA：methacrylate × 1；AIBN：initiator.thermal × 1

第 0 層判定：催化劑觸發的反應（催化劑不計當量，不判定網路）

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| methacrylate+initiator.thermal | MMA：methacrylate × 1，[[2, 1]]<br>AIBN：initiator.thermal × 1，[[5, 6]] | MMA：f = 2，當量 50.06 g/eq<br>AIBN：f = 1，當量 164.21 g/eq | 需要催化劑（熱自由基起始劑（偶氮或過氧化物））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 催化劑配對（不計當量） | 不支援：此體系的凝膠點與當量計算尚未支援：自由基鏈增長聚合（熱起始劑觸發），不是逐步聚合；起始劑是催化劑，不被計量消耗，每個 C=C 的鏈長與分子量分布由起始、增長、終止的速率決定 | |

## 1 丙烯醯胺：丙烯醯胺＋AIBN

成分：丙烯醯胺（`C=CC(=O)N`，Small Molecule）；AIBN（`CC(C)(C#N)N=NC(C)(C)C#N`，Catalyst/Initiator）

成分官能基命中：丙烯醯胺：amide.nh × 1、acrylamide × 1；AIBN：initiator.thermal × 1

第 0 層判定：催化劑觸發的反應（催化劑不計當量，不判定網路）

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| acrylamide+initiator.thermal | 丙烯醯胺：acrylamide × 1，[[0, 1]]<br>AIBN：initiator.thermal × 1，[[5, 6]] | 丙烯醯胺：f = 2，當量 35.54 g/eq<br>AIBN：f = 1，當量 164.21 g/eq | 需要催化劑（熱自由基起始劑（偶氮或過氧化物））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 催化劑配對（不計當量） | 不支援：此體系的凝膠點與當量計算尚未支援：自由基鏈增長聚合（熱起始劑觸發），不是逐步聚合；起始劑是催化劑，不被計量消耗，每個 C=C 的鏈長與分子量分布由起始、增長、終止的速率決定 | |

## 1 丙烯醯胺：N,N'-亞甲基雙丙烯醯胺＋Irgacure 184

成分：MBA（`C=CC(=O)NCNC(=O)C=C`，Resin）；Irgacure 184（`O=C(c1ccccc1)C1(O)CCCCC1`，Catalyst/Initiator）

成分官能基命中：MBA：amide.nh × 2、acrylamide × 2；Irgacure 184：hydroxyl.alcohol × 1、initiator.photo × 1

第 0 層判定：催化劑觸發的反應（催化劑不計當量，不判定網路）

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| acrylamide+initiator.photo | MBA：acrylamide × 2，[[0, 1], [10, 9]]<br>Irgacure 184：initiator.photo × 1，[[1]] | MBA：f = 4，當量 38.54 g/eq<br>Irgacure 184：f = 1，當量 204.27 g/eq | 需要催化劑（光自由基起始劑（光起始劑，需照光））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 催化劑配對（不計當量） | 不支援：此體系的凝膠點與當量計算尚未支援：自由基鏈增長聚合（光起始劑觸發），不是逐步聚合；起始劑是催化劑，不被計量消耗，每個 C=C 的鏈長與分子量分布由起始、增長、終止的速率決定 | |

## 1 苯乙烯類：苯乙烯＋二乙烯苯＋AIBN

成分：苯乙烯（`C=Cc1ccccc1`，Small Molecule）；二乙烯苯（`C=Cc1ccc(C=C)cc1`，Small Molecule）；AIBN（`CC(C)(C#N)N=NC(C)(C)C#N`，Catalyst/Initiator）

成分官能基命中：苯乙烯：alkene.terminal × 1、styrene × 1；二乙烯苯：alkene.terminal × 2、styrene × 2；AIBN：initiator.thermal × 1

第 0 層判定：催化劑觸發的反應（催化劑不計當量，不判定網路）

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| styrene+initiator.thermal | 苯乙烯：styrene × 1，[[0, 1]]<br>AIBN：initiator.thermal × 1，[[5, 6]] | 苯乙烯：f = 2，當量 52.08 g/eq<br>AIBN：f = 1，當量 164.21 g/eq | 需要催化劑（熱自由基起始劑（偶氮或過氧化物））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 催化劑配對（不計當量） | 不支援：此體系的凝膠點與當量計算尚未支援：自由基鏈增長聚合（熱起始劑觸發），不是逐步聚合；起始劑是催化劑，不被計量消耗，每個 C=C 的鏈長與分子量分布由起始、增長、終止的速率決定 | |
| styrene+initiator.thermal | 二乙烯苯：styrene × 2，[[0, 1], [7, 6]]<br>AIBN：initiator.thermal × 1，[[5, 6]] | 二乙烯苯：f = 4，當量 32.55 g/eq<br>AIBN：f = 1，當量 164.21 g/eq | 需要催化劑（熱自由基起始劑（偶氮或過氧化物））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 催化劑配對（不計當量） | 不支援：此體系的凝膠點與當量計算尚未支援：自由基鏈增長聚合（熱起始劑觸發），不是逐步聚合；起始劑是催化劑，不被計量消耗，每個 C=C 的鏈長與分子量分布由起始、增長、終止的速率決定 | |

## 1 反例：丙烯酸丁酯＋MMA（沒有起始劑）

成分：丙烯酸丁酯（`C=CC(=O)OCCCC`，Small Molecule）；MMA（`CC(=C)C(=O)OC`，Small Molecule）

成分官能基命中：丙烯酸丁酯：acrylate × 1；MMA：methacrylate × 1

**第 0 層：無反應配對**（符合預期的反例時請於判定欄確認）。

| 規則 | 命中成分與位置 | 官能度與當量 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|
| （無） | — | — | — | |

## 1 反例：α-甲基苯乙烯＋AIBN（α-甲基苯乙烯不是苯乙烯基）

成分：α-甲基苯乙烯（`CC(=C)c1ccccc1`，Small Molecule）；AIBN（`CC(C)(C#N)N=NC(C)(C)C#N`，Catalyst/Initiator）

成分官能基命中：α-甲基苯乙烯：（無）；AIBN：initiator.thermal × 1

**第 0 層：無反應配對**（符合預期的反例時請於判定欄確認）。

| 規則 | 命中成分與位置 | 官能度與當量 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|
| （無） | — | — | — | |

## 1 反例：烯丙基甲基醚＋AIBN（烯丙基醚無自由基鏈增長規則）

成分：烯丙基甲基醚（`C=CCOC`，Small Molecule）；AIBN（`CC(C)(C#N)N=NC(C)(C)C#N`，Catalyst/Initiator）

成分官能基命中：烯丙基甲基醚：alkene.terminal × 1、alkene.allyl × 1；AIBN：initiator.thermal × 1

**第 0 層：無反應配對**（符合預期的反例時請於判定欄確認）。

| 規則 | 命中成分與位置 | 官能度與當量 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|
| （無） | — | — | — | |

## 2 硫醇–烯（烯丙基）：PETMP（四官能硫醇）＋二烯丙基雙酚 A＋Irgacure 184

成分：PETMP（`O=C(CCS)OCC(COC(=O)CCS)(COC(=O)CCS)COC(=O)CCS`，Resin）；二烯丙基雙酚 A（`CC(C)(c1ccc(O)c(CC=C)c1)c1ccc(O)c(CC=C)c1`，Resin）；Irgacure 184（`O=C(c1ccccc1)C1(O)CCCCC1`，Catalyst/Initiator）

成分官能基命中：PETMP：thiol × 4；二烯丙基雙酚 A：hydroxyl.phenolic × 2、aromatic.ch.phenol.ortho_para × 2、alkene.terminal × 2、alkene.allyl × 2；Irgacure 184：hydroxyl.alcohol × 1、initiator.photo × 1

第 0 層判定：配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| thiol+alkene.allyl | PETMP：thiol × 4，[[4], [14], [21], [28]]<br>二烯丙基雙酚 A：alkene.allyl × 2，[[11, 10, 9], [21, 20, 19]] | PETMP：f = 4，當量 122.17 g/eq<br>二烯丙基雙酚 A：f = 2，當量 154.21 g/eq | 需要催化劑（自由基起始劑（光起始劑或熱起始劑））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 具形成網路的結構條件 | 支援 | |

## 2 硫醇–烯（乙烯基醚）：PETMP＋二乙二醇二乙烯基醚＋AIBN

成分：PETMP（`O=C(CCS)OCC(COC(=O)CCS)(COC(=O)CCS)COC(=O)CCS`，Resin）；二乙二醇二乙烯基醚（`C=COCCOCCOC=C`，Resin）；AIBN（`CC(C)(C#N)N=NC(C)(C)C#N`，Catalyst/Initiator）

成分官能基命中：PETMP：thiol × 4；二乙二醇二乙烯基醚：vinyl.ether × 2；AIBN：initiator.thermal × 1

第 0 層判定：配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| thiol+vinyl.ether | PETMP：thiol × 4，[[4], [14], [21], [28]]<br>二乙二醇二乙烯基醚：vinyl.ether × 2，[[0, 1], [10, 9]] | PETMP：f = 4，當量 122.17 g/eq<br>二乙二醇二乙烯基醚：f = 2，當量 79.10 g/eq | 需要催化劑（自由基起始劑（光起始劑或熱起始劑））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 具形成網路的結構條件 | 支援 | |

## 2 硫醇–烯（降冰片烯）：PETMP＋乙二醇雙（5-降冰片烯-2-羧酸酯）＋Irgacure 184

成分：PETMP（`O=C(CCS)OCC(COC(=O)CCS)(COC(=O)CCS)COC(=O)CCS`，Resin）；乙二醇雙降冰片烯羧酸酯（`O=C(OCCOC(=O)C1CC2CC1C=C2)C1CC2CC1C=C2`，Resin）；Irgacure 184（`O=C(c1ccccc1)C1(O)CCCCC1`，Catalyst/Initiator）

成分官能基命中：PETMP：thiol × 4；乙二醇雙降冰片烯羧酸酯：norbornene × 2；Irgacure 184：hydroxyl.alcohol × 1、initiator.photo × 1

第 0 層判定：配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| thiol+norbornene | PETMP：thiol × 4，[[4], [14], [21], [28]]<br>乙二醇雙降冰片烯羧酸酯：norbornene × 2，[[13, 14], [20, 21]] | PETMP：f = 4，當量 122.17 g/eq<br>乙二醇雙降冰片烯羧酸酯：f = 2，當量 151.19 g/eq | 需要催化劑（自由基起始劑（光起始劑或熱起始劑））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 具形成網路的結構條件 | 支援 | |

## 2 硫醇–烯（丙烯酸酯，與鏈增長併行）：PETMP＋TMPTA＋Irgacure 184

成分：PETMP（`O=C(CCS)OCC(COC(=O)CCS)(COC(=O)CCS)COC(=O)CCS`，Resin）；TMPTA（`C=CC(=O)OCC(CC)(COC(=O)C=C)COC(=O)C=C`，Resin）；Irgacure 184（`O=C(c1ccccc1)C1(O)CCCCC1`，Catalyst/Initiator）

成分官能基命中：PETMP：thiol × 4；TMPTA：acrylate × 3；Irgacure 184：hydroxyl.alcohol × 1、initiator.photo × 1

第 0 層判定：配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| acrylate+initiator.photo | TMPTA：acrylate × 3，[[0, 1], [14, 13], [20, 19]]<br>Irgacure 184：initiator.photo × 1，[[1]] | TMPTA：f = 6，當量 49.39 g/eq<br>Irgacure 184：f = 1，當量 204.27 g/eq | 需要催化劑（光自由基起始劑（光起始劑，需照光））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 催化劑配對（不計當量） | 不支援：此體系的凝膠點與當量計算尚未支援：自由基鏈增長聚合（光起始劑觸發），不是逐步聚合；起始劑是催化劑，不被計量消耗，每個 C=C 的鏈長與分子量分布由起始、增長、終止的速率決定 | |
| thiol+acrylate | PETMP：thiol × 4，[[4], [14], [21], [28]]<br>TMPTA：acrylate × 3，[[0, 1], [14, 13], [20, 19]] | PETMP：f = 4，當量 122.17 g/eq<br>TMPTA：f = 3，當量 98.77 g/eq | 需要催化劑（自由基起始劑（光起始劑或熱起始劑））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 具形成網路的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：丙烯酸酯 C=C 除了與硫醇加成還能自己鏈增長均聚，兩者比例隨條件而變、官能度不固定，不是單一步驟的等活性逐步加成 | |

## 2 硫醇–烯（反例）：二甲基硫醚（硫醚不是硫醇）＋二烯丙基雙酚 A

成分：二甲基硫醚（`CSC`，Small Molecule）；二烯丙基雙酚 A（`CC(C)(c1ccc(O)c(CC=C)c1)c1ccc(O)c(CC=C)c1`，Resin）

成分官能基命中：二甲基硫醚：（無）；二烯丙基雙酚 A：hydroxyl.phenolic × 2、aromatic.ch.phenol.ortho_para × 2、alkene.terminal × 2、alkene.allyl × 2

**第 0 層：無反應配對**（符合預期的反例時請於判定欄確認）。

| 規則 | 命中成分與位置 | 官能度與當量 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|
| （無） | — | — | — | |

## 2 硫醇–烯（反例）：PETMP＋二甲基硫醚（有硫醇但沒有烯，硫醚不反應）

成分：PETMP（`O=C(CCS)OCC(COC(=O)CCS)(COC(=O)CCS)COC(=O)CCS`，Resin）；二甲基硫醚（`CSC`，Small Molecule）

成分官能基命中：PETMP：thiol × 4；二甲基硫醚：（無）

**第 0 層：無反應配對**（符合預期的反例時請於判定欄確認）。

| 規則 | 命中成分與位置 | 官能度與當量 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|
| （無） | — | — | — | |

## 3 雜化：含環氧的甲基丙烯酸酯：甲基丙烯酸縮水甘油酯（GMA，同分子含環氧與甲基丙烯酸酯）＋AIBN

成分：GMA（`CC(=C)C(=O)OCC1CO1`，Small Molecule）；AIBN（`CC(C)(C#N)N=NC(C)(C)C#N`，Catalyst/Initiator）

成分官能基命中：GMA：ether.epoxide × 1、methacrylate × 1；AIBN：initiator.thermal × 1

第 0 層判定：催化劑觸發的反應（催化劑不計當量，不判定網路）

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| methacrylate+initiator.thermal | GMA：methacrylate × 1，[[2, 1]]<br>AIBN：initiator.thermal × 1，[[5, 6]] | GMA：f = 2，當量 71.08 g/eq<br>AIBN：f = 1，當量 164.21 g/eq | 需要催化劑（熱自由基起始劑（偶氮或過氧化物））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 催化劑配對（不計當量） | 不支援：此體系的凝膠點與當量計算尚未支援：自由基鏈增長聚合（熱起始劑觸發），不是逐步聚合；起始劑是催化劑，不被計量消耗，每個 C=C 的鏈長與分子量分布由起始、增長、終止的速率決定 | |

## 3 雜化：含環氧的丙烯酸酯：丙烯酸縮水甘油酯＋Irgacure 184

成分：丙烯酸縮水甘油酯（`C=CC(=O)OCC1CO1`，Small Molecule）；Irgacure 184（`O=C(c1ccccc1)C1(O)CCCCC1`，Catalyst/Initiator）

成分官能基命中：丙烯酸縮水甘油酯：ether.epoxide × 1、acrylate × 1；Irgacure 184：hydroxyl.alcohol × 1、initiator.photo × 1

第 0 層判定：催化劑觸發的反應（催化劑不計當量，不判定網路）

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| acrylate+initiator.photo | 丙烯酸縮水甘油酯：acrylate × 1，[[0, 1]]<br>Irgacure 184：initiator.photo × 1，[[1]] | 丙烯酸縮水甘油酯：f = 2，當量 64.06 g/eq<br>Irgacure 184：f = 1，當量 204.27 g/eq | 需要催化劑（光自由基起始劑（光起始劑，需照光））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 催化劑配對（不計當量） | 不支援：此體系的凝膠點與當量計算尚未支援：自由基鏈增長聚合（光起始劑觸發），不是逐步聚合；起始劑是催化劑，不被計量消耗，每個 C=C 的鏈長與分子量分布由起始、增長、終止的速率決定 | |

## 3 雜化：環氧丙烯酸酯（環氧開環後）：環氧丙烯酸酯（含羥基與丙烯酸酯）＋AIBN

成分：環氧丙烯酸酯（`C=CC(=O)OCC(O)COc1ccccc1`，Resin）；AIBN（`CC(C)(C#N)N=NC(C)(C)C#N`，Catalyst/Initiator）

成分官能基命中：環氧丙烯酸酯：hydroxyl.alcohol × 1、acrylate × 1；AIBN：initiator.thermal × 1

第 0 層判定：催化劑觸發的反應（催化劑不計當量，不判定網路）

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| acrylate+initiator.thermal | 環氧丙烯酸酯：acrylate × 1，[[0, 1]]<br>AIBN：initiator.thermal × 1，[[5, 6]] | 環氧丙烯酸酯：f = 2，當量 111.12 g/eq<br>AIBN：f = 1，當量 164.21 g/eq | 需要催化劑（熱自由基起始劑（偶氮或過氧化物））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 催化劑配對（不計當量） | 不支援：此體系的凝膠點與當量計算尚未支援：自由基鏈增長聚合（熱起始劑觸發），不是逐步聚合；起始劑是催化劑，不被計量消耗，每個 C=C 的鏈長與分子量分布由起始、增長、終止的速率決定 | |

## 3 雜化：只做官能基命中：GMA＋雙酚 A（環氧＋酚照 A 批規則配對；甲基丙烯酸酯沒有起始劑，不配對，沒有跨體系規則）

成分：GMA（`CC(=C)C(=O)OCC1CO1`，Small Molecule）；雙酚 A（`CC(C)(c1ccc(O)cc1)c1ccc(O)cc1`，Small Molecule）

成分官能基命中：GMA：ether.epoxide × 1、methacrylate × 1；雙酚 A：hydroxyl.phenolic × 2、aromatic.ch.phenol.ortho_para × 4

第 0 層判定：具封端／接枝的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| epoxy+phenol | GMA：ether.epoxide × 1，[[9, 8, 7]]<br>雙酚 A：hydroxyl.phenolic × 2，[[7], [14]] | GMA：f = 1，當量 142.15 g/eq<br>雙酚 A：f = 2，當量 114.15 g/eq | 不需催化劑 | 尚無文獻資料 | 具封端的結構條件 | 支援 | |

