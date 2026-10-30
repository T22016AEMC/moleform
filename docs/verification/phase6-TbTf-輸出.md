# Phase 6 Tb、Tf 輸出（Joback 基團加成）

**Joback 法為基團加成估算，僅用於小分子；數值為估算，非實測。**

以下為程式輸出，未經化學判斷（D17）。

- 結構處理：RDKit 2026.09.1；基團表 `src/data/joback_groups.csv`（41 列，稽核狀態皆為「待使用者審」）
- 模型：Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243：式 (2) Tb = 198.2 + ΣTbi、式 (3) Tf = 122.5 + ΣTfi。可信度：理論估算（基團貢獻法）。
- 本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。
- 切分規則：基團依「基團原子數由大到小」配對，同大小依表 III 順序；每個重原子恰好屬於一個基團；配不到的原子回報「缺基團」，不用相近基團代用。表 III 的 –N=（非環）沒有 Tf 貢獻值，含此基團的分子只算 Tb。
- 含連接點（`*`）的聚合物重複單元不適用（見第 2 節）。
- 重新產生：`npm run verify:phase6-tbtf`。

## 論文的適用限制與誤差（Joback & Reid 1987，照原文整理）

- **p.233（摘要）**：論文不宣稱高準確度，只說與當時常用的方法相當或更準
  - 原文：High accuracy is not claimed, but the proposed methods are often as accurate as or more accurate than techniques in common use today.
- **p.233**：假設基團之間沒有交互作用，只是一階近似；論文用 41 個基團處理多種有機化合物
  - 原文：Note we have assumed no interaction between groups [...] Clearly this is only a first-order approximation, but it is our experience that there rarely exist sufficient data to obtain reliable contributions between so-called "next-nearest neighbors."
- **p.238**：Tb、Tf 的數據來自 Reid et al.（1987）與 Stull et al.（1969）
  - 原文：Values for Tb, Tf, ΔHvb, and ΔHf were obtained from Reid et al. and Stull et al.
- **p.240（表 VI）**：回歸測試的整體統計（論文沒有按化合物類別分開列誤差，只說更細的分項見 Joback 1984 論文）：Tb 用 438 個化合物，平均絕對誤差 12.9 K、標準差 17.9 K、平均百分比誤差 3.6%；Tf 用 388 個化合物，平均絕對誤差 22.6 K、標準差 24.7 K、平均百分比誤差 11.2%
  - 原文：（表格）Tb: 438 compounds, average absolute error 12.9 K, standard deviation 17.9 K, average per cent error 3.6; Tf: 388 compounds, 22.6 K, 24.7 K, 11.2
- **p.240**：沸點不準確，凍結（熔）點尤其不準確，只能當作非常粗略的估計；Tf 強烈依賴分子的構型，方法分不出順反異構物（例：順式與反式 1,2-二甲基環戊烷的 Tf 相差約 64 K，回歸只得到中間值）
  - 原文：Estimations of the normal boiling point and, in particular, the normal freezing point are not accurate and should be considered as only very approximate. There is a strong dependence of the actual conformation of the molecule on Tf as shown, for example, in the large difference found for Tf between, say, cis- and trans-isomers. To illustrate, the difference in Tf between cis- and trans-1,2-dimethylcyclopentane is about 64 K. Since our procedure does not differentiate between cis- and trans-isomers, the regression yields some medium value.
- **p.239（表 V）**：論文的對二氯苯例題：Tb 估算 443.4 K、實驗 447.3 K；Tf 估算 256 K、實驗 326 K
  - 原文：（表格）p-dichlorobenzene: Tb 443.4 K (experimental 447.3 K); Tf 256 K (experimental 326 K)

## 1. 小分子

| 名稱 | 用途 | 出處 | SMILES | 切出的基團（Tbi／Tfi，K） | Tb（K） | Tb（°C） | Tf（K） | Tf（°C） | 缺基團 |
|---|---|---|---|---|---|---|---|---|---|
| BADGE | 環氧樹脂 | Phase 2、3 | `CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1` | 非環 –CH3 ×2（Tb 23.58／Tf -5.1）；非環 –CH2– ×2（Tb 22.88／Tf 11.27）；非環 >C< ×1（Tb 18.25／Tf 46.43）；環 –CH2– ×2（Tb 27.15／Tf 7.75）；環 >CH– ×2（Tb 21.78／Tf 19.88）；環 =CH–（含芳香 CH） ×8（Tb 26.73／Tf 8.13）；環 =C<（含芳香取代碳） ×4（Tb 31.01／Tf 37.02）；–O–（非環） ×2（Tb 22.42／Tf 22.23）；–O–（環） ×2（Tb 31.22／Tf 23.05） | 852.39 | 579.24 | 540.21 | 267.06 | — |
| 雙酚 A | 固化劑（酚） | Phase 2、3 | `CC(C)(c1ccc(O)cc1)c1ccc(O)cc1` | 非環 –CH3 ×2（Tb 23.58／Tf -5.1）；非環 >C< ×1（Tb 18.25／Tf 46.43）；環 =CH–（含芳香 CH） ×8（Tb 26.73／Tf 8.13）；環 =C<（含芳香取代碳） ×4（Tb 31.01／Tf 37.02）；–OH（酚） ×2（Tb 76.34／Tf 82.83） | 754.17 | 481.02 | 537.51 | 264.36 | — |
| 三苯基膦 | 催化劑 | Phase 3 | `c1ccc(P(c2ccccc2)c2ccccc2)cc1` | 環 =CH–（含芳香 CH） ×15（Tb 26.73／Tf 8.13）；環 =C<（含芳香取代碳） ×3（Tb 31.01／Tf 37.02） | — | — | — | — | **缺基團**：原子 4：P，鄰居：C3、C5、C11 |
| 甲基乙基酮（MEK） | 溶劑 | Phase 3 | `CCC(C)=O` | 非環 –CH3 ×2（Tb 23.58／Tf -5.1）；非環 –CH2– ×1（Tb 22.88／Tf 11.27）；>C=O（非環） ×1（Tb 76.75／Tf 61.2） | 344.99 | 71.84 | 184.77 | -88.38 | — |
| 丙二醇甲醚醋酸酯（PGMEA） | 溶劑 | Phase 3、4（成分 L） | `COCC(C)OC(C)=O` | 非環 –CH3 ×3（Tb 23.58／Tf -5.1）；非環 –CH2– ×1（Tb 22.88／Tf 11.27）；非環 >CH– ×1（Tb 21.74／Tf 12.64）；–O–（非環） ×1（Tb 22.42／Tf 22.23）；–COO–（酯） ×1（Tb 81.1／Tf 53.6） | 417.08 | 143.93 | 206.94 | -66.21 | — |
| SBI 雙酚（螺雙茚滿二醇） | 單體 | Phase 4（成分 S） | `OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2` | 非環 –CH3 ×4（Tb 23.58／Tf -5.1）；環 –CH2– ×2（Tb 27.15／Tf 7.75）；環 >C< ×3（Tb 21.32／Tf 60.15）；環 =CH–（含芳香 CH） ×6（Tb 26.73／Tf 8.13）；環 =C<（含芳香取代碳） ×6（Tb 31.01／Tf 37.02）；–OH（酚） ×2（Tb 76.34／Tf 82.83） | 909.90 | 636.75 | 734.61 | 461.46 | — |
| 環氧氯丙烷 | 單體（任務 027 指定） | 任務 027（現有測試資料沒有） | `ClCC1CO1` | 非環 –CH2– ×1（Tb 22.88／Tf 11.27）；環 –CH2– ×1（Tb 27.15／Tf 7.75）；環 >CH– ×1（Tb 21.78／Tf 19.88）；–Cl ×1（Tb 38.13／Tf 13.55）；–O–（環） ×1（Tb 31.22／Tf 23.05） | 339.36 | 66.21 | 198.00 | -75.15 | — |
| 乙醇 | 一般小分子 | Phase 2 | `CCO` | 非環 –CH3 ×1（Tb 23.58／Tf -5.1）；非環 –CH2– ×1（Tb 22.88／Tf 11.27）；–OH（醇） ×1（Tb 92.88／Tf 44.45） | 337.54 | 64.39 | 173.12 | -100.03 | — |
| 環氧丙烷 | 單體 | Phase 2 | `CC1CO1` | 非環 –CH3 ×1（Tb 23.58／Tf -5.1）；環 –CH2– ×1（Tb 27.15／Tf 7.75）；環 >CH– ×1（Tb 21.78／Tf 19.88）；–O–（環） ×1（Tb 31.22／Tf 23.05） | 301.93 | 28.78 | 168.08 | -105.07 | — |
| 苯酚 | 單體 | Phase 2 | `Oc1ccccc1` | 環 =CH–（含芳香 CH） ×5（Tb 26.73／Tf 8.13）；環 =C<（含芳香取代碳） ×1（Tb 31.01／Tf 37.02）；–OH（酚） ×1（Tb 76.34／Tf 82.83） | 439.20 | 166.05 | 283.00 | 9.85 | — |
| L-丙胺酸 | 一般小分子 | Phase 2 | `C[C@@H](C(=O)O)N` | 非環 –CH3 ×1（Tb 23.58／Tf -5.1）；非環 >CH– ×1（Tb 21.74／Tf 12.64）；–COOH（酸） ×1（Tb 169.09／Tf 155.5）；–NH2 ×1（Tb 73.23／Tf 66.89） | 485.84 | 212.69 | 352.43 | 79.28 | — |
| 反式 2-丁烯 | 一般小分子（Joback 分不出順反異構） | Phase 2 | `C/C=C/C` | 非環 –CH3 ×2（Tb 23.58／Tf -5.1）；非環 =CH– ×2（Tb 24.96／Tf 8.73） | 295.28 | 22.13 | 129.76 | -143.39 | — |
| 三氟化硼（BF₃） | 催化劑 | Phase 2 | `FB(F)F` | –F ×3（Tb -0.03／Tf -15.78） | — | — | — | — | **缺基團**：原子 1：B，鄰居：F0、F2、F3 |

缺基團的分子（2 個）不計算：三苯基膦、三氟化硼（BF₃）。

## 2. 聚合物重複單元（不適用）

Joback 法只用於小分子；含連接點（`*`）的結構直接回傳「不適用（聚合物單元）」，不計算。

| 名稱 | 出處 | SMILES | 結果 |
|---|---|---|---|
| P 單元 A（雙酚茀） | Phase 4（成分 P） | `[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O` | 不適用（聚合物單元）：Joback 法只用於小分子，含連接點（*）的結構不計算 |
| P 單元 B（萘基次甲基） | Phase 4（成分 P） | `[*:1]C([*:2])c1ccc2ccccc2c1` | 不適用（聚合物單元）：Joback 法只用於小分子，含連接點（*）的結構不計算 |
| E PGMA 型環氧單元 | Phase 4（成分 E） | `[*:1]CC([*:2])(C)C(=O)OCC1CO1` | 不適用（聚合物單元）：Joback 法只用於小分子，含連接點（*）的結構不計算 |

