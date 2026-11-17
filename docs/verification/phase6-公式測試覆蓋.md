# Phase 6 公式測試覆蓋表（PLAN 6.8，任務 P6C）

日期：2026-11-17。目的：確認每個計算公式都有自動測試（檢查程式有沒有照公式算對；化學正確性由使用者負責，D17）。依任務 P6C，只盤點，不改任何計算、資料表、黃金檔與既有測試。

**測試位置說明**：「黃金」＝tests/golden 的 TypeScript 輸出，由 engine/tests/test_golden_*.py 逐案比對（案例數為該黃金檔的案例數）；「手算」＝測試裡寫明算式的手算值；「書算例」＝書的表格或範例逐筆對照，目前由 docs/verification 的對照文件記錄（驗證腳本重跑，不是 pytest）。「單元」數字為該檔的測試函式數，不是案例數。

## 一、各模組覆蓋

| 模組 | 公式／方法 | 端點 | 測試位置與案例數 | 缺口 |
|---|---|---|---|---|
| atomic_weights、mol_graph、csv_reader | 原子量、SMILES 解析與分子圖、CSV 讀取 | （內部） | 黃金 atomicWeights 125、molGraph 495、csv 162 | 無 |
| vw | van Krevelen 式 4.2 基團增量（Table 4.2）＋ Bondi 補充與修正 | /vw | 黃金 vw 793；單元 test_golden_vw 7；書算例（Table 4.6–4.8 的聚合物，見 phase6-VW-TPSA-LogP-輸出） | 無 |
| tg | 式 6.4–6.5：Tg = 1000·ΣYgi／M，含校準基團、共軛 n／c／cc、–C(CH3)2– 自由／受阻 | /tg | 黃金 tg 2320；單元 test_tg_unit 16、test_golden_tg 10；書算例（12 個聚合物，phase6-Tg-輸出） | 無 |
| vm | 式 4.8a／4.8b：Vm = ΣVi（Table 4.10）；密度；298 K 狀態 | /vm | 黃金 vm 1923；單元 test_vm_unit 23、test_golden_vm 12；書算例（11 個聚合物，phase6-Vm-密度-輸出） | 無 |
| cte | MTE 模型式 4.9、4.17、4.18、4.24、4.27 | /cte | 黃金 cte 363；單元 test_golden_cte 5；書算例（phase6-自由體積-CTE-輸出） | 無 |
| free_volume | 使用者定義的經驗法 Vf = Vω × 係數；Bondi Table XV、XVII | /free-volume | 黃金 freeVolume 365；單元 test_m05_phase6_docs 5 | 無（使用者定義的經驗法，沒有書的對照值，只能對 TypeScript 黃金） |
| relative_tg、packing_k | D61：Δf、FFV、Δα、Tg_B = Tg_A − Δf／Δα；k／Tg 表 | /relative-tg | 黃金 relativeTg 160（驗收範例 Δf = 0.061427、Tg_B = 172.16 °C 記錄於任務 038c 報告與 phase6-相對Tg-輸出，不是 pytest 斷言） | 無 |
| dielectric | 式 11.7、11.8（Table 11.1）；莫耳折射 Table 10.4；式 11.10、11.11 | /dielectric | 黃金 dielectric 360；書算例（Table 11.2 的 18 個聚合物，phase6-介電-極化率-輸出） | 無 |
| joback | Joback & Reid (1987) 式 (2)、(3)：Tb、Tf | /joback | 黃金 joback 360 | 無（小分子；論文沒有逐化合物算例，只有黃金） |
| tpsa_logp | Ertl TPSA、Wildman–Crippen LogP（RDKit） | /tpsa-logp | 黃金 tpsaLogp 360 | 無 |
| tg_mixing、tg_fit、tg_mn_data、novolac_units | Fox 混合 Tg、Flory Tg = Tg∞ − K／Mn 擬合與預測 | /tg/mixing、/tg/flory-fit | 黃金 tgMixing 237；手算 test_m05_unit（Fox、Flory） | 無 |
| mixing | 混合密度、混合介電常數、共聚比例掃描（標準混合法則，出處待使用者審，見 MODELS.md） | /mixture-density、/mixture-dielectric、/copolymer-scan | 手算與等價核對 test_mixing_unit 10（Python 新模組，沒有 TypeScript 黃金） | 無 |
| crosslink、layer1 | 反應官能基配對、網路判定；Miller–Macosko 第 0／1 層 | /crosslink/analyze、/prepare、/layer1、/layer1/scan | 黃金 crosslink 208、layer1 298；單元與手算 test_m05_unit（Miller–Macosko、判定與查詢） | 無 |
| repeat_unit、end_groups、copolymer、convert、distribution、polymer_types | 重複單元、端基、Random 共聚物、Mn／Mw／DP 換算、分佈 | /polymer/* | 黃金 repeatUnit 111、endGroups 70、copolymer 73、convert 72、distribution 40；單元 test_polymer_unit 7 | 無 |
| tm、y_tables | 式 6.20–6.21：Tm = 1000·ΣYmi／M；Table 6.10 位置值；式 6.22–6.24 長側鏈 | /tm | 單元 test_p6b_unit 的 Tm 4 項（PE 數值、不可結晶、缺基團、位置值對 Table 6.10 逐列加總 20 列）；書算例 54 個（Table 6.15）；**新增手算 3 案例（任務 P6C，test_p6c_unit，式 6.22、6.23、6.24）** | **缺口 1（已補）**：式 6.22–6.24 原本只在書算例文件中核對，沒有 pytest |
| td、y_tables | 式 21.4：Td,1/2 = 1000·ΣYd,1/2,i／M；Table 21.2；共軛 n／c／cc | /td | 單元 test_p6b_unit 的 Td 3 項（聚苯乙烯、尼龍與雙酚 A 聚合物的使用者決定值、缺基團）；書算例 34 個（Table 21.3）；**新增手算 1 案例（任務 P6C，共軛值 c）** | **缺口 2（已補）**：共軛 n／c／cc 的取值原本沒有 pytest |
| moisture、y_tables | Table 18.14（Barrie 1968）、式 18.15（結晶度修正） | /moisture | 單元 test_p6b_unit 2 項（尼龍 6,6：非晶 12.0、結晶度 0.7 為 3.6；RH 只允許五個值；未涵蓋基團）；書算例 Example 18.4 | 無 |
| modulus | 式 13.30–13.32 | /modulus | 單元 test_p6b_unit 1 項（只驗證回報缺什麼） | 公式未實作（缺 Table 14.4 等資料，使用者 2026-11-17 決定不收錄），沒有可測的算式，不算測試缺口；PLAN 6.5 彈性模數維持未勾選 |

## 二、結論

- 完全沒有自動測試的公式：**2 個，均已補手算測試**（上表缺口 1、2，共 4 個新案例）；未超過 5 個，不需要使用者決定。
- 弱點（不是缺口，列出供使用者參考）：(1) Tm、Td、吸濕的書算例（54＋34＋1 個）目前只在對照文件，由驗證腳本重跑，不是 pytest，所以書的資料表若被改動，pytest 不會自動發現；(2) 使用者定義的自由體積法與 Joback 沒有書的算例，只能對 TypeScript 黃金；(3) 黃金檔比對的是「搬遷後與 TypeScript 結果一致」，不是「與書一致」。
- 本表案例數為盤點當下（2026-11-17）的數字，之後新增案例時不會自動更新。
