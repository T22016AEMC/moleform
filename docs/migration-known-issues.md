# 搬遷期間的已知問題與待修清單（M01–M04）

建立：2026-11-16（任務 M03）。只列文件，**沒有改任何程式**。

## 這份清單是什麼

D62／D63 搬遷期間，Python 引擎以 TypeScript 輸出為黃金標準逐字比對，所以 TypeScript 計算裡「看起來是問題」的行為，Python 也照樣重現，黃金檔不動（使用者 2026-11-16 決定）。這些項目搬遷期間不修。

**處理計畫（全部適用）**：核心鏈（VW、Tg、Vm／密度、CTE）在 Python 全部通過黃金比對、TypeScript 退場之後，**只在 Python 修**，再重產黃金檔（那時黃金檔的來源改由使用者核定的規則決定，不再是 TypeScript 輸出）。修之前各項維持現狀；每項修完要附新的專屬案例與反向驗證。

欄位：**編號**；**現象**；**發生條件**；**影響**（誤報缺基團、算錯數字，或只是介面／呼叫方式的差異）；**來源報告**；**黃金案例**（可以在 `tests/golden/*.json` 用案例 id 找到）。

## A. Python 照 TypeScript 重現、之後要修

| 編號 | 現象 | 發生條件 | 影響 | 來源報告 | 黃金案例 |
|---|---|---|---|---|---|
| K01 | **原子映射編號消失**：`[*:1]`、`[*:2]` 在改寫重建後變成 `*`。 | Tg 只用書中基團配不到（缺基團），且分子含芳香環上的 –OH（校準增量 `CAL.OH.ar`），TS 的 `stripSubstituents` 把 –OH 換回氫、重建分子再取 canonical SMILES 時。含 `*` 的酚羥基單元幾乎都會走到。 | **不影響數值**（`*` 是否有編號不改變配對）。副作用：這條路徑算出的結果，基團與缺基團的原子索引是「改寫後 canonical SMILES」的索引，不是使用者輸入的索引。 | M02 §3（R5）特性 1 | `R5/rebuild/R5/star-*`（`tg.json`）；`R5/cte-phenol-PVPh-mapped`（`cte.json`） |
| K02 | **雙鍵順反標示消失**：改寫後的 canonical SMILES 一律不帶 `/`、`\`，cis／trans 資訊遺失。 | 同 K01，且單元含有標示順反的 –CH=CH–（Tg 表的 cis／trans 基團要看順反）。 | **誤報缺基團**：酚羥基單元若含 –CH=CH–，Tg 回報缺基團（M02）。M03 新增的呈現：**CTE 的式 4.27 回報「缺 Tg」**（見 K05）。不會算錯數字。 | M02 §3 特性 2 | `R5/rebuild/R5/dbl-*`（`tg.json`）；`R5/cte-phenol-trans-CH=CH`、`R5/cte-phenol-cis-CH=CH`、`R5/cte-phenol-trans-CH=CH-OH-last`（`cte.json`；與拿掉 –OH 的成對案例 `R5/cte-plain-trans-CH=CH`、`R5/cte-plain-cis-CH=CH` 對照：後者算得出） |
| K03 | **`stereoAtoms` 不重新編號**：改寫時只重編鍵的 `atoms`，雙鍵順反的 `stereoAtoms` 仍是舊索引。 | 同 K02，且被移除的 –OH 原子索引小於順反標示所指的原子（例如 –OH 寫在前面：`Oc1ccc(/C=C/CC…)cc1`）。 | 目前案例的結果：RDKit.js 重建失敗（回傳 null），退回缺基團結果（**誤報缺基團**）。理論上若舊索引碰巧仍是鄰居，會**靜默標錯順反**（可能選到錯的 cis／trans 基團而算錯數字），目前沒有案例碰到。 | M02 §3 特性 3 | `R5/rebuild/R5/dbl-trans-OH-first`（`tg.json`）；`R5/cte-phenol-OH-first-stereoAtoms-trans`、`R5/cte-phenol-OH-first-stereoAtoms-cis`（`cte.json`；對照：拿掉 –OH 的 `R5/cte-plain-OH-first-counterpart` 算得出） |
| K04 | **空字串拋例外**：`computeTg('')` 在 RDKit.js 對沒有原子的分子呼叫 `get_json()` 時拋出 WebAssembly 例外，`computeTg` 沒有接。 | 直接呼叫 `computeTg`（Python 的 `compute_tg`）且輸入是空字串。 | **介面差異，不是數值問題**：呼叫方要自己攔下；其他模組（VW、Vm、CTE）對空字串都回傳 `invalid`，只有 Tg 不同。Python 同樣拋出 `EmptyMoleculeError`；HTTP 介面先擋下空白輸入回 400。 | M02 §3 特性 4 | `invalid/empty`（`tg.json`，`{ threw: true }`） |
| K05 | **CTE 繼承 K01–K03**：式 4.27 用 `computeTg(smiles)`（含校準基團，預設選項），所以酚羥基單元走到 R5 改寫路徑。 | 含芳香環 –OH 的單元（VW 可算），且含標示順反的 –CH=CH–。 | **誤報缺 Tg**：CTE 的 `glassyFromTg.status = "missing"`（訊息「缺 Tg：Table 6.1 缺基團（含校準基團仍配不完），式 4.27 不計算」），其餘（E、α、β 的式 4.8b 版本）照算。不會算錯數字。 | M03 §3 | `R5/cte-phenol-trans-CH=CH`、`R5/cte-phenol-cis-CH=CH`、`R5/cte-phenol-trans-CH=CH-OH-last`、`R5/cte-phenol-OH-first-stereoAtoms-trans`、`R5/cte-phenol-OH-first-stereoAtoms-cis`（`cte.json`）；對照：`R5/cte-phenol-PVPh-mapped`（算得出）、`R5/cte-no-phenol-trans-CH=CH`（沒有酚羥基，算得出） |
| K06 | **映射編號 ≥ 100 被當成沒有編號**：`analyzeRepeatUnit` 從 `get_v2Kmolblock()` 的文字取第 14 個欄位讀原子映射編號；編號 ≥ 100 時 iii 與 mmm 欄位黏在一起（`0100`），讀到的是 0。 | 連接點寫成 `[*:100]` 以上（實務上不會有）。 | `[*:100]CC[*:100]` 會被接受並視為未編號（正確應為錯誤）；`[*:100]CC[*:2]` 仍是 BAD_NUMBERING。不影響分子量與分子式。 | M04 | `analyze/map/100-100`、`analyze/map/100-2`、`analyze/map/1000-1000`（`polymer-repeatUnit.json`） |
| K07 | **帶電的連接點讓 `analyzeRepeatUnit` 拋出例外**：`[*+]`、`[*+2]` 在 RDKit 寫 Molfile 時失敗（週期表查不到原子序），TS 沒有接，整個函式拋出 WebAssembly 例外。 | 重複單元有兩個連接點且至少一個帶電（`[*+]CC*`）。 | 呼叫方要自己攔下；其他錯誤都回傳 `{ ok: false }`。Python 拋出 `RdkitCallError`，HTTP 介面回 400。 | M04 | `analyze/charge/dummy-plus-throws`（`polymer-repeatUnit.json`，`{ threw: true }`） |

Vm／密度**不受** K01–K03 影響：TS 的 `judgeState` 以 `calibrated: false` 呼叫 Tg，不走 R5 改寫路徑；酚羥基單元在 Vm 表（Table 4.10）本來就沒有對應基團，Vm 本身會回報缺基團（`R5/cte-phenol-PVPh-mapped`，`vm.json` 的 `status` 為 `missing`）。

## B. TypeScript 與 Python 的行為差異（Python 不是照 TS 重現）

| 編號 | 現象 | 發生條件 | 影響 | 來源報告 | 處理計畫 |
|---|---|---|---|---|---|
| D01 | **資料表格式錯誤**：TS 讀 CSV 時**靜默丟掉**格式錯誤的列（`VW_GROUPS`、`YG_GROUPS`、`MOLAR_VOLUME_GROUPS`；M05 起另有 `FREE_VOLUME_GROUPS`／`_COEFFICIENTS`／`_CORRECTIONS`、`PACKING_K_ROWS`、`JOBACK_GROUPS`、`POLARIZATION_GROUPS`、`MOLAR_REFRACTION_GROUPS`、`TG_K_ROWS`，官能基表與反應規則表只在 `loadTables` 回報 issues、資料列照用），靠測試把關；Python 載入時**直接報錯**（`VwDataError`、`TgDataError`、`MolarVolumeDataError`、`TableDataError`，D22）。 | 只在 CSV 有格式錯誤時（目前所有資料表都沒有）。 | 若 CSV 壞了：TS 少一列基團而**誤報缺基團**或切分不同；Python 拒絕計算。資料正常時兩邊結果相同。 | M01 §8-2、M02 §9-2、M03 §6 | 不需要修 Python。TS 退場後此差異自然消失；資料表打包路徑等 D63 再定。 |
| D02 | **長鏈解析上限**：RDKit.js 解析 900 個以上原子的鏈會直接判為無效（700 個還可以），Python 的 RDKit 沒有這個限制。 | SMILES 的重原子數 ≳ 900（實務輸入碰不到）。 | 同一個輸入 TS 回 `invalid`、Python 算得出結果；黃金案例在 RDKit.js 側無法覆蓋，`maxMatches = 1000` 的上限同樣觸發不到。 | M01 §3（R3 限制）、M02 §4、M03 §4 | 不需要修；TS 退場後 Python 的行為就是正式行為，再決定是否設輸入大小上限（HTTP 介面目前以 10000 字元限制請求）。 |
| D03 | **結構輸入格式**：TS 的 `RDKit.get_mol` 也接受 Molfile 與 JSON 字串；Python 端只用 `Chem.MolFromSmiles`（M00 的決定），只接 SMILES。 | 把 Molfile 當重複單元或端基送進來時。 | 介面送進來的一律是 SMILES，沒有影響。 | M04 | 無（黃金案例都是 SMILES） |
| D04 | **呼叫端傳入的輸入**：TS 的 `computeFormulationTg`、`prepareLayer1`、`analyzeComponent` 內部呼叫 `formulation/compute` 與 `averageMolecularWeight`（039a：不搬）；Python 版改由呼叫端傳入已算好的質量百分比（`wtPct`）、Mn（`mn`）、Solid 區成分與單位、小分子的每分子質量（`molarMass`）。TS 對小分子優先用 `molfile` 分析；Python 只用 `canonicalSmiles`（同 D03）。 | 使用 `/tg/mixing`、`/crosslink/prepare`、`/crosslink/analyze` 時。 | 黃金檔的 `input` 就是 Python 收到的輸入（由匯出程式用現有 TS 函式先算好），同輸入下兩邊逐字相同。用 molfile 畫的小分子，Python 的原子索引是 SMILES 的索引。 | M05 | 配方換算搬到 Python（若之後決定）時自然消失；`molfile` 的處理等 D63 打包時再定。 |
| D05 | **`Math.exp`／`Math.log`／`**` 的最後一位**：V8 的實作與 Python（Windows 的 C 執行庫）在極少數輸入上差 1 個 ulp。只影響第 1 層的有效交聯點機率（`effectiveJunctionProbability` 的 `exp`／`log`）與其下游（交聯密度、Mc、比例掃描）。 | 凝膠後（`gelled`）的第 1 層結果。 | 相對誤差 ≤ 2.2e-15（小於 1e-12 容差），不影響任何顯示位數；黃金比對把這些點列入 `tolerance_cases`（32 個案例、166 個比對點）。 | M05 | 不需要修；Linux 上的 CI 結果以 `tolerance_cases` 的清單為準。 |

## C. 待使用者決定（不是錯誤，沒有照 TS 以外的做法）

| 編號 | 問題 | 目前狀態 | 來源報告 |
|---|---|---|---|
| P01 | **Vm 的狀態判斷與 CTE 用的 Tg 不一致**：`judgeState` 用不含校準基團的 Tg（TS 註解：「是否改用含校準基團的 Tg 待使用者決定（任務 033）」），CTE 的式 4.27 用含校準基團的 Tg。 | 兩邊照 TS 各做各的。目前沒有「Vm 可算、書中 Tg 缺基團、但加校準基團後 Tg 可算」的單元（校準基團是酚羥基與雙酚茀，Table 4.10 都沒有對應的 Vm 基團），所以兩邊實際上不會給出矛盾的結果。 | M03 §3 |
| P02 | **引擎回應的 `status`**：算得出的值標 `"predicted"`（使用者 2026-11-16 決定），若要標 `"literature"` 只需改各 `handle_*` 一行。 | 已依決定。列在這裡只為提醒日後有人想改。 | M01 §8-1、M02 §9-1、M03 |
| P03 | **資料表路徑**：Python 預設讀專案根目錄的 `src/data`（環境變數 `MOLEFORM_DATA_DIR` 可覆寫）。D63 內嵌打包時要決定資料表如何隨引擎發行，同時維持單一來源（D18、D22）。 | 待 D63。 | M01 §8-3、M02 §9-3、M03 |
