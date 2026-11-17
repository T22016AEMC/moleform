# 反應規則 A 批命中列表（任務 P7-1A，D65、D22 第 3 點）

用引擎第 0 層與專案的真實資料表（`src/data/functional_groups.csv`、`reaction_rules.csv`）對每個體系的代表性小配方列出：每條規則對哪些成分的哪些位置命中、官能度與當量、第 1 層是否支援。
本檔由 `scripts/verification/p7-1a-hit-list.py` 產生；分子只用規則表測試分子與 docs/verification 已有的分子，沒有新增。**「使用者判定」欄留空，請審化學正確性。**

- 位置：命中官能基的反應原子在該成分 SMILES 中的原子序（0 起算；聚合物重複單元不在本列表）。
- 官能度 f：位點數 × 規則的 functionality（每個基團形成的鍵數）；當量 = 分子量 ÷ f（g/eq），分子量由 RDKit 平均分子量計算，僅供驗證，不顯示於結果頁（D09）。
- 第 1 層：`支援` = 由現有 Miller–Macosko 公式計算；`不支援` = 回報原因、不給數值。
- 所有新規則與官能基 `review_status` 皆為 `pending`。

## 1 環氧＋酚（已有 D25；酚醛各類型）：BADGE＋酚醛清漆三聚體

成分：BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）；酚醛清漆三聚體（`Oc1ccc(Cc2ccc(O)c(Cc3ccccc3O)c2)cc1`，Resin）

第 0 層判定：配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| epoxy+phenol | BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]]<br>酚醛清漆三聚體：hydroxyl.phenolic × 3，[[0], [10], [19]] | BADGE：f = 2，當量 170.21 g/eq<br>酚醛清漆三聚體：f = 3，當量 102.12 g/eq | 不需催化劑 | 尚無文獻資料 | 具形成網路的結構條件 | 支援 | |

## 1 環氧＋酚：BADGE＋鄰甲酚

成分：BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）；鄰甲酚（`Cc1ccccc1O`，Small Molecule）

第 0 層判定：具封端／接枝的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| epoxy+phenol | BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]]<br>鄰甲酚：hydroxyl.phenolic × 1，[[7]] | BADGE：f = 2，當量 170.21 g/eq<br>鄰甲酚：f = 1，當量 108.14 g/eq | 不需催化劑 | 尚無文獻資料 | 具封端的結構條件 | 支援 | |

## 1 環氧＋酚：BADGE＋雙酚 A

成分：BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）；雙酚 A（`CC(C)(c1ccc(O)cc1)c1ccc(O)cc1`，Small Molecule）

第 0 層判定：具鏈延長的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| epoxy+phenol | BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]]<br>雙酚 A：hydroxyl.phenolic × 2，[[7], [14]] | BADGE：f = 2，當量 170.21 g/eq<br>雙酚 A：f = 2，當量 114.15 g/eq | 不需催化劑 | 尚無文獻資料 | 具鏈延長的結構條件 | 支援 | |

## 1 環氧＋酚：BADGE＋聯苯芳烷基酚（小分子片段）

成分：BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）；聯苯芳烷基酚（`Oc1ccc(Cc2ccc(cc2)-c2ccc(Cc3ccccc3O)cc2)cc1`，Resin）

第 0 層判定：具鏈延長的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| epoxy+phenol | BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]]<br>聯苯芳烷基酚：hydroxyl.phenolic × 2，[[0], [23]] | BADGE：f = 2，當量 170.21 g/eq<br>聯苯芳烷基酚：f = 2，當量 183.23 g/eq | 不需催化劑 | 尚無文獻資料 | 具鏈延長的結構條件 | 支援 | |

## 1 環氧＋酚：BADGE＋雙環戊二烯改質酚（示意結構）

成分：BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）；DCPD 改質酚（`Oc1ccc(cc1)C1CC2C3CC=CC3C2C1`，Resin）

第 0 層判定：具封端／接枝的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| epoxy+phenol | BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]]<br>DCPD 改質酚：hydroxyl.phenolic × 1，[[0]] | BADGE：f = 2，當量 170.21 g/eq<br>DCPD 改質酚：f = 1，當量 226.32 g/eq | 不需催化劑 | 尚無文獻資料 | 具封端的結構條件 | 支援 | |

## 2 環氧＋胺：BADGE＋乙二胺（一級脂肪胺）

成分：BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）；乙二胺（`NCCN`，Small Molecule）

第 0 層判定：配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| epoxy+amine.primary.aliphatic | BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]]<br>乙二胺：amine.primary.aliphatic × 2，[[0], [3]] | BADGE：f = 2，當量 170.21 g/eq<br>乙二胺：f = 4，當量 15.02 g/eq | 不需催化劑 | 尚無文獻資料 | 具形成網路的結構條件 | 支援 | |

## 2 環氧＋胺：BADGE＋4,4'-二胺基二苯甲烷（一級芳香胺）

成分：BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）；MDA（`Nc1ccc(Cc2ccc(N)cc2)cc1`，Small Molecule）

第 0 層判定：配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| epoxy+amine.primary.aromatic | BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]]<br>MDA：amine.primary.aromatic × 2，[[0], [10]] | BADGE：f = 2，當量 170.21 g/eq<br>MDA：f = 4，當量 49.57 g/eq | 不需催化劑 | 尚無文獻資料 | 具形成網路的結構條件 | 支援 | |

## 2 環氧＋胺：BADGE＋哌啶（二級脂肪胺）

成分：BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）；哌啶（`C1CCNCC1`，Small Molecule）

第 0 層判定：具封端／接枝的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| epoxy+amine.secondary.aliphatic | BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]]<br>哌啶：amine.secondary.aliphatic × 1，[[3]] | BADGE：f = 2，當量 170.21 g/eq<br>哌啶：f = 1，當量 85.15 g/eq | 不需催化劑 | 尚無文獻資料 | 具封端的結構條件 | 支援 | |

## 2 環氧＋胺：BADGE＋N-甲基苯胺（二級芳香胺）

成分：BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）；N-甲基苯胺（`CNc1ccccc1`，Small Molecule）

第 0 層判定：具封端／接枝的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| epoxy+amine.secondary.aromatic | BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]]<br>N-甲基苯胺：amine.secondary.aromatic × 1，[[1]] | BADGE：f = 2，當量 170.21 g/eq<br>N-甲基苯胺：f = 1，當量 107.16 g/eq | 不需催化劑 | 尚無文獻資料 | 具封端的結構條件 | 支援 | |

## 2 環氧＋胺：BADGE＋二乙三胺（一級＋二級脂肪胺，兩條規則）

成分：BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）；二乙三胺（`NCCNCCN`，Small Molecule）

第 0 層判定：配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| epoxy+amine.primary.aliphatic | BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]]<br>二乙三胺：amine.primary.aliphatic × 2，[[0], [6]] | BADGE：f = 2，當量 170.21 g/eq<br>二乙三胺：f = 4，當量 25.79 g/eq | 不需催化劑 | 尚無文獻資料 | 具形成網路的結構條件 | 不支援（整份配方）：目前只支援單一反應規則的第 1 層計算 | |
| epoxy+amine.secondary.aliphatic | BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]]<br>二乙三胺：amine.secondary.aliphatic × 1，[[3]] | BADGE：f = 2，當量 170.21 g/eq<br>二乙三胺：f = 1，當量 103.17 g/eq | 不需催化劑 | 尚無文獻資料 | 具封端的結構條件 | 不支援（整份配方）：目前只支援單一反應規則的第 1 層計算 | |

## 3 環氧＋酸酐：BADGE＋MHHPA

成分：BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）；MHHPA（`CC1CCC2C(C1)C(=O)OC2=O`，Small Molecule）

第 0 層判定：配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| epoxy+anhydride | BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]]<br>MHHPA：anhydride × 1，[[7, 9, 10]] | BADGE：f = 4，當量 85.10 g/eq<br>MHHPA：f = 2，當量 84.10 g/eq | 需要催化劑（三級胺或咪唑），但配方沒有 Catalyst/Initiator 類成分 | 尚無文獻資料 | 具形成網路的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：多步反應（酸酐＋羥基成單酯酸、酸再開環環氧），需要起始羥基或催化劑，不是單一步驟的等活性逐步加成 | |

警告：規則「epoxy+anhydride」需要催化劑（三級胺或咪唑），但配方沒有 Catalyst/Initiator 類成分（D26）

## 4 環氧＋氰酸酯：BADGE＋雙酚 A 二氰酸酯

成分：BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）；BADCy（`CC(C)(c1ccc(OC#N)cc1)c1ccc(OC#N)cc1`，Resin）

第 0 層判定：具鏈延長的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| epoxy+cyanate | BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]]<br>BADCy：cyanate.ester × 2，[[7, 8, 9], [16, 17, 18]] | BADGE：f = 2，當量 170.21 g/eq<br>BADCy：f = 2，當量 139.16 g/eq | 需要催化劑（金屬離子（Cu(II) acac）加共催化劑壬基酚），但配方沒有 Catalyst/Initiator 類成分 | 尚無文獻資料 | 具鏈延長的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：氰酸酯與環氧共反應有三嗪環、異氰脲酸酯、噁唑烷酮多條路徑，不是單一步驟的兩官能基配對 | |
| cyanate.trimerization | BADCy：cyanate.ester × 2，[[7, 8, 9], [16, 17, 18]] | BADCy：f = 2，當量 139.16 g/eq | 需要催化劑（金屬離子（Cu(II) acac）加共催化劑壬基酚），但配方沒有 Catalyst/Initiator 類成分 | 尚無文獻資料 | 具鏈延長的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：三個氰酸酯基合成一個三嗪環（自反應的三聚），不是兩類官能基的配對 | |

警告：規則「epoxy+cyanate」需要催化劑（金屬離子（Cu(II) acac）加共催化劑壬基酚），但配方沒有 Catalyst/Initiator 類成分（D26）；規則「cyanate.trimerization」需要催化劑（金屬離子（Cu(II) acac）加共催化劑壬基酚），但配方沒有 Catalyst/Initiator 類成分（D26）

## 4 氰酸酯三聚：雙酚 A 二氰酸酯單獨

成分：BADCy（`CC(C)(c1ccc(OC#N)cc1)c1ccc(OC#N)cc1`，Resin）

第 0 層判定：具鏈延長的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| cyanate.trimerization | BADCy：cyanate.ester × 2，[[7, 8, 9], [16, 17, 18]] | BADCy：f = 2，當量 139.16 g/eq | 需要催化劑（金屬離子（Cu(II) acac）加共催化劑壬基酚），但配方沒有 Catalyst/Initiator 類成分 | 尚無文獻資料 | 具鏈延長的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：三個氰酸酯基合成一個三嗪環（自反應的三聚），不是兩類官能基的配對 | |

警告：規則「cyanate.trimerization」需要催化劑（金屬離子（Cu(II) acac）加共催化劑壬基酚），但配方沒有 Catalyst/Initiator 類成分（D26）

## 5 酚醛清漆＋HMTA：酚醛清漆三聚體＋HMTA

成分：酚醛清漆三聚體（`Oc1ccc(Cc2ccc(O)c(Cc3ccccc3O)c2)cc1`，Resin）；HMTA（`C1N2CN3CN1CN(C2)C3`，Small Molecule）

第 0 層判定：配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| novolac+hmta | 酚醛清漆三聚體：aromatic.ch.phenol.ortho_para × 5，[[2], [8], [15], [17], [22]]<br>HMTA：hmta × 1，[[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]] | 酚醛清漆三聚體：f = 5，當量 61.27 g/eq<br>HMTA：f = 6，當量 23.36 g/eq | 不需催化劑 | 尚無文獻資料 | 具形成網路的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：HMTA 須先分解、一個分子提供多個等效亞甲基（等效位點數未定），並放出氨 | |

## 5 酚醛清漆＋HMTA：2,4,6-三甲基酚（無空位，反例）＋HMTA

成分：2,4,6-三甲基酚（`Cc1cc(C)c(O)c(C)c1`，Small Molecule）；HMTA（`C1N2CN3CN1CN(C2)C3`，Small Molecule）

**第 0 層：無反應配對**（符合預期的反例時請於判定欄確認）。

| 規則 | 命中成分與位置 | 官能度與當量 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|
| （無） | — | — | — | |

## 6 可溶酚醛：2-羥甲基酚（含羥甲基與空位）

成分：2-羥甲基酚（`OCc1ccccc1O`，Resin）

第 0 層判定：具封端／接枝的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| resol.methylol+phenol_ring | 2-羥甲基酚：hydroxymethyl.phenolic × 1，[[1, 0]]<br>2-羥甲基酚：aromatic.ch.phenol.ortho_para × 2，[[4], [6]] | 2-羥甲基酚：f = 1，當量 124.14 g/eq<br>2-羥甲基酚：f = 2，當量 62.07 g/eq | 不需催化劑 | 60–100 °C | 具封端的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：可溶酚醛的羥甲基與酚環空位在同一分子內，且羥甲基會自縮合（醚橋或放出甲醛） | |
| resol.methylol-ether | 2-羥甲基酚：hydroxymethyl.phenolic × 1，[[1, 0]] | 2-羥甲基酚：f = 1，當量 124.14 g/eq | 不需催化劑 | 尚無文獻資料 | 具封端的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：可溶酚醛的羥甲基自縮合（自反應） | |
| resol.methylol-methylene | 2-羥甲基酚：hydroxymethyl.phenolic × 1，[[1, 0]] | 2-羥甲基酚：f = 1，當量 124.14 g/eq | 需要催化劑（鹼（NaOH）），但配方沒有 Catalyst/Initiator 類成分 | 尚無文獻資料 | 具封端的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：可溶酚醛的羥甲基自縮合（自反應，放出甲醛） | |

警告：規則「resol.methylol-methylene」需要催化劑（鹼（NaOH）），但配方沒有 Catalyst/Initiator 類成分（D26）

## 6 可溶酚醛：2,4,6-三羥甲基酚＋苯酚

成分：2,4,6-三羥甲基酚（`Oc1c(CO)cc(CO)cc1CO`，Resin）；苯酚（`Oc1ccccc1`，Small Molecule）

第 0 層判定：配方具形成網路的結構條件；是否凝膠與交聯程度見第 1 層

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| resol.methylol+phenol_ring | 2,4,6-三羥甲基酚：hydroxymethyl.phenolic × 3，[[3, 4], [7, 8], [11, 12]]<br>苯酚：aromatic.ch.phenol.ortho_para × 3，[[2], [4], [6]] | 2,4,6-三羥甲基酚：f = 3，當量 61.40 g/eq<br>苯酚：f = 3，當量 31.37 g/eq | 不需催化劑 | 60–100 °C | 具形成網路的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：可溶酚醛的羥甲基與酚環空位在同一分子內，且羥甲基會自縮合（醚橋或放出甲醛） | |
| resol.methylol-ether | 2,4,6-三羥甲基酚：hydroxymethyl.phenolic × 3，[[3, 4], [7, 8], [11, 12]] | 2,4,6-三羥甲基酚：f = 3，當量 61.40 g/eq | 不需催化劑 | 尚無文獻資料 | 具形成網路的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：可溶酚醛的羥甲基自縮合（自反應） | |
| resol.methylol-methylene | 2,4,6-三羥甲基酚：hydroxymethyl.phenolic × 3，[[3, 4], [7, 8], [11, 12]] | 2,4,6-三羥甲基酚：f = 3，當量 61.40 g/eq | 需要催化劑（鹼（NaOH）），但配方沒有 Catalyst/Initiator 類成分 | 尚無文獻資料 | 具形成網路的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：可溶酚醛的羥甲基自縮合（自反應，放出甲醛） | |

警告：規則「resol.methylol-methylene」需要催化劑（鹼（NaOH）），但配方沒有 Catalyst/Initiator 類成分（D26）

## 7 陽離子光酸：BADGE＋三苯基鋶 PAG

成分：BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）；三苯基鋶 SbF6（`c1ccc([S+](c2ccccc2)c2ccccc2)cc1.F[Sb-](F)(F)(F)(F)F`，Catalyst/Initiator）

第 0 層判定：具封端／接枝的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| epoxy+pag.cationic | BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]]<br>三苯基鋶 SbF6：pag.onium × 1，[[4]] | BADGE：f = 4，當量 85.10 g/eq<br>三苯基鋶 SbF6：f = 1，當量 499.13 g/eq | 需要催化劑（光酸（需光酸產生劑與照光））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 具封端的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：陽離子鏈增長聚合（光酸觸發），不是逐步聚合；光酸產生劑是催化劑，不被消耗 | |

## 7 陽離子光酸：氧雜環丁烷（3-乙基-3-羥甲基）＋PAG

成分：EHO 氧雜環丁烷（`CCC1(CO)COC1`，Resin）；三苯基鋶 SbF6（`c1ccc([S+](c2ccccc2)c2ccccc2)cc1.F[Sb-](F)(F)(F)(F)F`，Catalyst/Initiator）

第 0 層判定：具封端／接枝的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| oxetane+pag.cationic | EHO 氧雜環丁烷：ether.oxetane × 1，[[6, 5, 2, 7]]<br>三苯基鋶 SbF6：pag.onium × 1，[[4]] | EHO 氧雜環丁烷：f = 2，當量 58.08 g/eq<br>三苯基鋶 SbF6：f = 1，當量 499.13 g/eq | 需要催化劑（光酸（需光酸產生劑與照光））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 具封端的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：陽離子鏈增長聚合（光酸觸發），不是逐步聚合；光酸產生劑是催化劑，不被消耗 | |

## 7 陽離子光酸：BADGE＋氧雜環丁烷＋PAG（共聚）

成分：BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）；EHO 氧雜環丁烷（`CCC1(CO)COC1`，Resin）；三苯基鋶 SbF6（`c1ccc([S+](c2ccccc2)c2ccccc2)cc1.F[Sb-](F)(F)(F)(F)F`，Catalyst/Initiator）

第 0 層判定：具封端／接枝的結構條件

| 規則 | 命中成分與位置（原子序） | 官能度 f 與當量 | 催化劑 | 溫度 | 配對判定 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|---|---|---|
| epoxy+pag.cationic | BADGE：ether.epoxide × 2，[[11, 10, 9], [22, 21, 20]]<br>三苯基鋶 SbF6：pag.onium × 1，[[4]] | BADGE：f = 4，當量 85.10 g/eq<br>三苯基鋶 SbF6：f = 1，當量 499.13 g/eq | 需要催化劑（光酸（需光酸產生劑與照光））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 具封端的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：陽離子鏈增長聚合（光酸觸發），不是逐步聚合；光酸產生劑是催化劑，不被消耗 | |
| oxetane+pag.cationic | EHO 氧雜環丁烷：ether.oxetane × 1，[[6, 5, 2, 7]]<br>三苯基鋶 SbF6：pag.onium × 1，[[4]] | EHO 氧雜環丁烷：f = 2，當量 58.08 g/eq<br>三苯基鋶 SbF6：f = 1，當量 499.13 g/eq | 需要催化劑（光酸（需光酸產生劑與照光））；配方含 Catalyst/Initiator 類成分 | 尚無文獻資料 | 具封端的結構條件 | 不支援：此體系的凝膠點與當量計算尚未支援：陽離子鏈增長聚合（光酸觸發），不是逐步聚合；光酸產生劑是催化劑，不被消耗 | |

## 7 陽離子光酸（反例）：BADGE＋非鎓鹽（四甲基銨）

成分：BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`，Resin）；四甲基銨（`C[N+](C)(C)C`，Catalyst/Initiator）

**第 0 層：無反應配對**（符合預期的反例時請於判定欄確認）。

| 規則 | 命中成分與位置 | 官能度與當量 | 第 1 層 | 使用者判定 |
|---|---|---|---|---|
| （無） | — | — | — | |

