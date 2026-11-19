# PLAN — 階段計畫與進度

最後更新：2026-11-16

勾選規則：完成一項就改成 `[x]`，並在 `docs/reports/` 留報告。標 **（待決）** 的項目在使用者回答前不要開工。每個 Phase 開頭的「開工前需要使用者決定」全部有答案後，該 Phase 才能開工。

時程：不再預估，以每張任務卡完成為進度單位，見各 Phase 勾選。（2026-11-16：舊的「全部約 3–5 個月」估算已不適用。）

## 建置原則

1. **計算核心與畫面分開**：所有計算寫在 `src/core/`，是不依賴 React 的純 TypeScript 函式；畫面在 `src/ui/`；資料表在 `src/data/`。這樣容易測試，也容易放進 Web Worker 執行。
2. **資料表格式先定、資料後填**：官能基 SMARTS、反應規則、基團參數、溶劑物性四種資料表，在 Phase 1 一次定好欄位（含出處、套件版本、測試分子），之後各階段只填資料。
3. **先打通一條完整的路**：Phase 4 先用酚醛樹脂＋環氧樹脂（DECISIONS D25）從畫結構一路做到凝膠點，讓使用者及早用真實配方驗證，確定可行再橫向擴充。
4. **每個 Phase 結束附「使用者驗證清單」**：幾個測試分子或配方與程式輸出表，由使用者檢查化學正確性（DECISIONS D17）。
5. **資料只存使用者自己的電腦**（瀏覽器儲存，加上匯出與匯入檔案），沒有伺服器與資料庫。
6. **建置規則（D64）**：彼此相關的功能一次建完；不必要的驗證不做；驗證集中在一組功能完成後做一次；報告限一頁。

---

## Phase 0：開工前確認

目的：取得決定架構所需的事實，並讓文件與決定一致。

- [x] 0.1 任務 002：依使用者新決定更新專案文件（D15–D22）
- [x] 0.2 任務 003：改寫建置計畫，寫入 D23–D26
- [x] 0.3 任務 001：測試 RDKit.js 的 3D 能力（結果：官方 `@rdkit/rdkit` 2026.9.1 不支援 3D，見 `docs/reports/001-結果.md`）
- [x] 0.4 架構：純前端（DECISIONS D33；依任務 001、005 結果）
- [x] 0.5 Phase 4 第一個打通的反應體系：酚醛樹脂＋環氧樹脂（DECISIONS D25）
- [x] 0.6 任務 004：盤點 CheMScutter 可搬內容
- [x] 0.7 任務 005：測試 OpenChemLib JS 的 3D 能力
- [x] 0.8 任務 006：寫入 D27–D33，同步文件

## Phase 1：專案骨架與計算核心基礎

目的：建好可以持續開發、測試、部署的空殼，以及所有計算與顯示共用的底層。完成後網站可以打開，但還沒有化學功能。

開工前需要使用者準備：在 GitHub 建立空的 `moleform` repo（DECISIONS D32）

- [x] 1.1 專案骨架：從 CheMScutter 複製 Vite、React、TypeScript、Vitest、npm 的設定（DECISIONS D16、D20、D27），初始化 git 並連上 GitHub `moleform` repo
- [x] 1.2 目錄分層：`src/core/`、`src/data/`、`src/ui/`；加自動檢查，確保 `src/core/` 不引用 React
- [x] 1.3 CI：從 CheMScutter 複製 `deploy.yml`，型別檢查、測試、建置全部通過才部署到 GitHub Pages（DECISIONS D24、D32）；不含 golden 步驟（D30）
- [x] 1.4 RDKit.js 共用包裝：只初始化一次、統一錯誤處理、載入中的畫面
- [x] 1.5 結果顯示共用元件：數值、單位、模型名稱、可信度（直接計算／理論估算／參考趨勢）、統一備註、出處
- [x] 1.5a 頁首與版本顯示：`assets/logo.png`、版本號與建置時間（複製 CheMScutter 的 `build-info.mjs`）；介面風格直接沿用 CheMScutter（DECISIONS D34），顏色、圓角、間距集中定義在 `src/ui/theme.css`，規則寫進 `docs/DESIGN.md`
- [x] 1.6 四種資料表的**欄位定義**與讀取程式：官能基 SMARTS、反應規則、基團貢獻參數、溶劑物性。每列必須有出處欄；從套件取得的數值另有套件名稱與版本欄；SMARTS 類資料另有「應命中」與「不應命中」測試分子欄（DECISIONS D22）。只定欄位，不填化學資料
- [x] 1.7 資料表格式檢查：自動測試確認每列都有出處，缺出處就報錯
- [ ] 1.8 使用者驗證清單：網站能打開、部署流程正常

## Phase 2：結構輸入與小分子 3D

目的：使用者能畫出或輸入分子、檢查結構、看到小分子 3D，並把化合物存在自己的電腦。

開工前需要使用者決定：無（3D 做法依 DECISIONS D33）

- [x] 2.1 Ketcher 2D 繪圖：從 CheMScutter 複製 iframe 子專案 `packages/ketcher-frame/`（DECISIONS D27、D28），頻道名稱與 `base` 改為 MoleForm
- [x] 2.2 SMILES 輸入，與 2D 繪圖雙向轉換
- [x] 2.3 結構驗證：原子價數、鍵結、SMILES 合法性；芳香環、手性中心、E/Z；拒絕反應式與查詢結構，保留連接點 `*`（DECISIONS D31）
- [x] 2.4 MOL／SDF 匯入與匯出
- [x] 2.5 小分子 3D 產生：OpenChemLib JS 的 ConformerGenerator 構象、MMFF94 最佳化，在 Web Worker 中執行，預設只算少量構象，可再要求更多；MMFF 缺參數時顯示初始構象並標示「未經力場最佳化」（DECISIONS D33）
- [x] 2.5a 瀏覽器實測：在使用者電腦的瀏覽器中，記錄 BADGE 等較大分子的 3D 產生與最佳化耗時、網頁是否保持可操作；數字交使用者判斷是否可接受，不可接受則依 D33 降級
- [x] 2.5b MMFF94 能量單位確認：用 MMFF94 官方驗證資料集（MMFF94 Validation Suite）中的分子比對 OpenChemLib 的能量；確認單位前不顯示相對能量
- [x] 2.6 3D 顯示：選定 3D 顯示函式庫（先查證授權，不得為 GPL 類）；旋轉、縮放、平移；Ball-and-Stick、Stick、Space-Filling；原子編號；標示為理論構型
- [x] 2.7 3D 量測：鍵長、鍵角由 3D 座標自行計算，二面角可用 OpenChemLib `calculateTorsion`（注意其回傳弧度）
- [x] 2.8 本機化合物庫：存在瀏覽器，可匯出、匯入檔案（DECISIONS D23）
- [x] 2.9 使用者驗證清單：幾個已知分子的結構、3D 與量測值
- [ ] 2.10（選用）UFF 力場：讓 MMFF94 不支援的結構（例如含硼）也能最佳化；參數取自 RDKit 內建 UFF 參數表或原始論文（Rappé 等，1992），需標出處（D18）；需先評估精度

## Phase 3：配方輸入與換算（小分子）

目的：使用者能輸入 Solid／Liquid 配方並得到正確的比例換算。本階段只處理小分子；聚合物在 Phase 5 接上。

開工前需要使用者決定：無

- [x] 3.1 Solid／Liquid 兩區輸入介面，成分數量不限，每項可繪圖或輸入 SMILES，成分分類依 spec（Solid 區含 Catalyst/Initiator，DECISIONS D26）
- [x] 3.2 背景計算分子量與官能基需要的基礎量（不在結果頁顯示，DECISIONS D09）
- [x] 3.3 換算核心：g、重量份、wt%、mol%、phr；總重、Solid Content
- [x] 3.4 單位一致性檢查與錯誤提示
- [x] 3.5 Solid 成分可標記「在指定條件下揮發或分解」
- [x] 3.6 配方存檔與讀檔（本機，DECISIONS D23）
- [x] 3.7 使用者驗證清單：幾組手算過的配方換算
- 註：Liquid 區的 vol% 需要溶劑密度，延到 Phase 8 建好溶劑資料表後再做

## Phase 4：打通第一條路（酚醛樹脂＋環氧樹脂，交聯第 0、1 層）

目的：用酚醛樹脂＋環氧樹脂（DECISIONS D25）把「畫結構 → 辨識官能基 → 反應配對 → 化學計量 → 凝膠點、交聯密度」完整做通，讓使用者及早用真實配方檢查化學。

開工前需要使用者決定：無（S01 已決為 D41；測試體系見 docs/verification/phase4-測試體系.md）

註：本階段提前加入最基本的均聚物輸入（D42）；共聚物、Mw、PDI、端基仍在 Phase 5

- [x] 4.0 均聚物輸入：重複單元＋Mn／DP、化合物庫與配方支援聚合物（D42，任務 015）
- [x] 4.1 該體系所需官能基的 SMARTS，依 D22 流程：找已發表寫法、配正反例測試、交使用者審核
- [x] 4.2 反應規則表填入該體系的規則（依 S06 欄位；文獻數值來自使用者提供的書或成熟套件，找不到就留空並回報）
- [x] 4.3 交聯第 0 層：反應位點與原子編號、反應類型、自反應、配方內配對、鏈延長／接枝／網路判定；依規則表判斷所需催化劑，並檢查配方中是否有 Catalyst/Initiator 成分（D26）
- [x] 4.4 在 2D／3D 上標記反應原子
- [x] 4.5 交聯第 1 層：化學計量比、過量官能基、理論最大成鍵數、凝膠點（Miller–Macosko）、交聯密度、Mc、溶膠分率、殘留官能基（依指定轉化率）
- [x] 4.5a 理論配比：化學計量配比，以及依使用者選擇的目標物性做當量比掃描（D40）
- [x] 4.6 交聯結果頁
- [x] 4.7 使用者驗證清單：使用者用真實配方檢查第 0、1 層結果

## 介面改善（Phase 4 之後）

- [x] UI.1 配方工作台：左右兩欄、加入與檢視成分彈窗（D45，任務 018）

### 待所有功能完成後討論（D45）

- 重點摘要卡、專有名詞「?」說明、點掃描曲線套用配比、自動保存目前工作
- 配方比較、一次貼入多個 SMILES、範例配方、一鍵輸出報告、成分名稱必填

## Phase 5：聚合物與共聚物

目的：讓聚合物能以重複單元輸入，並接上配方換算與交聯第 0、1 層。

U02 已由 D46 決定（任務 019）。

- [x] 5.1 重複單元輸入：2D 或 SMILES，以 `[*:1]`、`[*:2]` 標記連接位置（均聚物的基本輸入已於 4.0 完成；Random 共聚物，任務 020）
- [x] 5.2 均聚物與 Random 共聚物，比例 mol%／wt%（DECISIONS D04）（Random 共聚物，任務 020）
- [x] 5.3 Mn、Mw、PDI、DP 與端基（任務 019、022 完成）
- [x] 5.4 特殊骨架（酚醛、Epoxy、Cardo、SBI）自訂重複單元與連接位置（骨架範本（D51，任務 023））
- [x] 5.5 聚合物接上配方換算（聚合物 mol%（D46）已完成，共聚物已完成，任務 020）
- [x] 5.6 聚合物官能基辨識接上交聯第 0、1 層；酚醛樹脂改用重複單元輸入，並與 Phase 4 的完整結構結果比對程式邏輯
- [ ] 5.7 使用者驗證清單（任務 025 已產生 `docs/verification/phase5-使用者檢查.md` 與 `phase5-輸出.md`，待使用者確認）
- [x] 5.8 聚合物重複單元片段 3D（以甲基封端，D05 修改，任務 024）

## Phase 6A：本機版與 Python 計算引擎（提前，D62）

目的：使用者 2026-11-13 決定計算最終搬到 Python。為避免「新計算先寫在 TypeScript 再整批搬遷」的重工，本機版（Windows 桌面）與 Python 引擎提前，放在 Phase 6 剩餘的新計算模組之前。介面與桌面外殼維持 TypeScript（Electron），計算最終在 Python。

開工前需要使用者決定：使用者需先在 Windows 電腦安裝 Python（版本與安裝方式於 6A.0 盤點時確認）

- [x] 6A.0 盤點現有架構與離線障礙（任務 039 的 A；見 `docs/reports/039-結果.md`）
- [x] 6A.1 Windows 桌面外殼（補註：I03 起預設打包為 NSIS 每使用者安裝版，可攜式為 dist:portable）：Electron 封裝現有網頁（任務 039 的 B-1 到 B-5；原型 `desktop/`，app:// 載入 dist，可攜式 exe）（補註：deploy 已暫停（任務 039b））
- [x] 6A.2 Python 計算引擎原型：只監聽 127.0.0.1；資料格式含值、單位、來源、狀態（`measured / literature / fitted / predicted / assumed / missing`）（任務 039 的 B-6；原型 `engine/`，只握手、不含公式；Python 打包方式待使用者決定）
- [x] 6A.3（完成：任務 039a，報告 `docs/reports/039a-結果.md`）搬遷盤點：列出每個現有計算模組、依賴與對應測試，訂搬遷順序（新模組要用到的核心鏈優先：VW、Va、莫耳體積與密度、Tg、CTE）。規則：以 TypeScript 輸出為黃金標準，Python 版逐字相同才停用 TypeScript 版；過渡期用開關切換，預設用 TypeScript（補註：**第二步完成於 I05**〔2026-11-17，報告 `docs/reports/I05-結果.md`〕：交聯第 0、1 層與理論配比、比例掃描已由介面改呼叫 Python 引擎，不再有開關，引擎不可用時顯示原因、不退回 TypeScript；TypeScript 計算模組改為「黃金基準，不供介面使用」。**保留 TypeScript 的 B 類**〔即時輸入回饋，6A 補註允許〕：配方換算 `formulation/compute`、平均分子量 `molecularWeight`（Worker `weight`）、聚合物輸入 `polymer/convert`、`repeatUnit`、`endGroups`、`copolymer`、`unitFragment`、掃描範圍預設與檢查、用量換回使用者單位；繪圖與反應原子標記 `crosslink/draw`、`groups`（C 類：引擎沒有單一結構反應原子端點）；結構驗證 `structure/*`、3D `conformer/*`、化合物庫 `library/*` 依 039a 本來就留 TypeScript）
- [x] 6A.4 計算模組搬遷（2026-11-16 依 D64 改為：相關模組合併成卡，驗證集中一次；原「每模組一張卡、逐一黃金比對」不再適用於後續卡）（補註：計算搬遷完成，切換與退役由 I05 完成）
  - [x] M00 共用層（atomicWeights、molGraph、CSV 讀取）、RDKit 版本對齊 2026.9.1、黃金比對框架；M00a CI 新增 Python 引擎測試與黃金檔過期檢查（報告 `docs/reports/M00-結果.md`、`M00a-結果.md`）
  - [x] M01 VW（793 案例逐字相符）、M02 Tg（2320 案例）、M03 Vm／密度與 CTE（2286 案例）：均已逐字比對通過；TS 既有特性見 `docs/migration-known-issues.md`
  - [x] M04 聚合物基礎（repeatUnit、endGroups、copolymer、convert、distribution）（報告 `docs/reports/M04-結果.md`）
  - [x] M05 其餘計算模組一次搬完（自由體積、相對 Tg、Joback、成分 Tg、介電、TPSA／LogP、交聯第 0、1 層），全部完成後驗證一次（報告 `docs/reports/M05-結果.md`）
- 補註（任務 I01，2026-11-16）：介面接引擎完成。桌面版啟動／關閉引擎（`engine/.venv`）、preload 受限橋接（路徑白名單、權杖不暴露）、工作台右欄最小「物性（Python 引擎）」面板（單一單元／小分子與配方混合，value／unit／source／status，缺值顯示 missing 與原因）；TypeScript 物性計算維持黃金標準、介面不呼叫。內嵌 Python 打包（D63）、共聚掃描、相對 Tg、交聯新入口、介面美化（D45）尚未做；見 `docs/reports/I01-結果.md`
- 補註（任務 I02，2026-11-16）：內嵌 Python 打包完成（D63）。官方 Windows 內嵌式 Python 3.12.7（與 `engine/.venv` 同版，sha256 固定於 `scripts/embed-python.lock.json`）＋ `pip --target` 安裝帶 hash 的 `engine/requirements.txt`（`--require-hashes`）；`moleform_core`、`moleform_engine.py` 與 15 張資料表（打包時從 `src/data` 複製）隨附；`npm run desktop:build` 先跑 `scripts/assemble-engine.mjs`（可重跑、結果一致）；授權聲明 `THIRD-PARTY-LICENSES-ENGINE.txt` 在資源 `engine/` 內。實測見 `docs/reports/I02-結果.md`
- 補註：介面與桌面外殼維持 TypeScript，計算最終在 Python。**6A.2 完成後，新的計算模組一律直接寫在 Python，不先寫 TypeScript**。任務 038 已定稿且依賴 TypeScript 函式，仍以 TypeScript 完成，之後隨 6A.4 搬遷。即時輸入回饋類的小計算可留在 TypeScript，由 6A.3 逐項決定

## Phase 6：單一化合物、聚合物與混合配方物性

目的：用基團貢獻法等模型算出物性。Phase 7 的 Tg∞ 需要這裡的 Tg。

開工前需要使用者決定：基團參數的資料來源（使用者提供的書，或成熟套件，D18）、~~S08（是否用 Joback）~~ 已定 D52

註（2026-11-13，D62；2026-11-16 依 D64 重排）：剩餘工作一律直接寫在 Python 引擎，合併為三張卡，暫列、待使用者逐張確認開工：
- P6-A：6.7 剩餘（混合密度、混合介電常數、共聚比例影響）（已完成，任務 P6A）
- P6-B：6.4 的 Tm、Td（預留任務 040）與 6.5（彈性模數、吸濕性；Tm 對不可結晶聚合物標「不適用」）。開工前需要使用者決定各方法的資料來源（書或文獻）（已做，任務 P6B：Tm、Td、吸濕性完成；彈性模數缺書中的增量表未做；書算例對照有不符，待使用者決定，見 `docs/reports/P6B-結果.md`）
- P6-C：6.8 每個公式的自動測試（沿用黃金比對）與 6.9 使用者驗證清單文件
順序：Phase 6A（M04、M05）→ P6-A → P6-B → P6-C

- [x] 6.1 Van Krevelen 基團切分的 SMARTS，依 D22 流程（任務 026：Yg 部分；31 列，稽核狀態「待使用者審」；Table 6.1 缺的基團見 `docs/reports/026-結果.md`；補收書中現成基團（任務 031）：+25 列共 56 列；第二批補收 Table 6.3 其餘 15 個組合基團共 71 列，見 `docs/reports/031-結果.md`）
- [x] 6.2 基團貢獻參數表填入資料（每列有出處）（任務 026：`src/data/yg_groups.csv`，只含本專案需要的基團；其他物性的基團表仍待後續任務；補收書中現成基團（任務 031）：Yg 71 列（含第二批）、VW 43 列（任務 037a 補收芳香 Cl、芳香 >C=O）、Va／Vc 27 列）
- [x] 6.3 直接計算類：Bondi 分子體積、TPSA、Crippen LogP（RDKit）（VW、TPSA、Crippen LogP（任務 028）：`src/data/vw_groups.csv` 26 列「待使用者審」、`src/core/properties/vanDerWaalsVolume.ts`、`tpsaLogp.ts`、輸出 `docs/verification/phase6-VW-TPSA-LogP-輸出.md`；聚合物單元的 TPSA、LogP 以甲基封端計算並標示；Table 4.2 沒有的基團（含 –O–，書中兩個括號值沒有標示條件）回報缺基團，見 `docs/reports/028-結果.md`、KNOWN_ISSUES M18–M20）
- [ ] 6.4 Van Krevelen 類：莫耳體積／密度、自由體積分率、極化率、Tg、Tm、Td、CTE、介電常數（Tg 部分完成（任務 026）：`src/core/properties/tgGroupContribution.ts`、輸出 `docs/verification/phase6-Tg-輸出.md`；聚合物莫耳體積與密度完成（任務 029）：`src/data/molar_volume_polymer_groups.csv` 15 列「待使用者審」、`src/core/properties/molarVolumeDensity.ts`、輸出 `docs/verification/phase6-Vm-密度-輸出.md`，小分子液體待 Fedors 1974（與 8.3 合併）；**缺基團診斷完成（任務 030），結果見 `docs/reports/030-結果.md`，待使用者決定**；補收書中現成基團（任務 031）：Yg、VW、Va／Vc 補收，結果見 `docs/reports/031-結果.md`（不勾選 6.4）；；介電常數與折射率（極化率）完成（任務 032）：`src/data/polarization_groups.csv` 20 列、`src/data/molar_refraction_groups.csv` 47 列（皆「待使用者審」）、`src/core/properties/dielectricRefraction.ts`（ε 用式 11.7 搭配 Va 與式 11.8；ΣR 與 α；不做折射率 n，D07），輸出 `docs/verification/phase6-介電-極化率-輸出.md`，結果見 `docs/reports/032-結果.md`，6.4 不勾選；其餘未做）；Tg 校準基團（D54，任務 033）：酚羥基與 9,9-雙(4-伸苯基)茀骨架已收錄為校準值（非書中值，待使用者審），SBI 骨架檢驗未通過不收錄；`src/data/yg_calibrated_groups.csv`、報告 `docs/reports/033-結果.md`）
- [x] 6.5 參考趨勢類：彈性模數、吸濕性；Tm 對不可結晶聚合物標為「不適用」（任務 P6E 補完彈性模數：方法一與可對應基團的方法三、G、ν、E；方法二不做；Table 13.6 方法一欄 15 列不符已由使用者接受，見補註）
- [x] 6.6 小分子沸點、熔點（Joback，已定 D52）（Joback Tb、Tf（D52，任務 027）：`src/data/joback_groups.csv` 41 列「待使用者審」、`src/core/properties/jobackTbTf.ts`、輸出 `docs/verification/phase6-TbTf-輸出.md`；聚合物單元不適用）
- [x] 6.7 混合配方：混合密度、Fox／Gordon–Taylor Tg、混合介電常數、共聚比例影響
  - 補註（任務 P6A，2026-11-16）：混合密度、混合介電常數、共聚比例影響已直接寫在 Python 引擎（D62，無 TS 版、不接介面）：`engine/moleform_core/mixing.py`、`POST /mixture-density`、`/mixture-dielectric`、`/copolymer-scan`，公式與出處（待使用者審）見 `docs/MODELS.md`，結果見 `docs/reports/P6A-結果.md`；Fox 混合式、相對 Tg 先前已完成（Gordon–Taylor 因 k 需實驗值不做）。依此 6.7 勾選；以下各條補註為歷史紀錄
  - 補註：成分 Tg 與混合未固化 Tg（任務 034）已做：Fox–Flory（K 只收酚醛一般型，低可信度，待使用者審；DGEBA 類缺 K）、小分子不計 Tg 只給 Tm、不參與混合（D56）、Fox 混合式（Gordon–Taylor 因 k 需實驗值不做）；`src/core/properties/tgMixing.ts`、輸出 `docs/verification/phase6-Tg-混合-輸出.md`。混合密度、混合介電常數、共聚比例影響未做，6.7 不勾選
  - 補註（任務 036）：6.4 的 CTE 完成：`src/core/properties/cte.ts`（van Krevelen 4.4 節 MTE 模型，E_l = 1.00×10⁻³·VW、E_g = 0.45×10⁻³·VW，α、β；只依 VW 與 Tg）、輸出 `docs/verification/phase6-自由體積-CTE-輸出.md`；自由體積分率：書中沒有由結構計算的方法，不做（使用者 2026-11-06 決定，見 `docs/reports/036-結果.md`）。6.4 不勾選
  - 補註（任務 036a）：6.4 的自由體積（使用者定義經驗係數法，D57，任務 036a）完成：Vf = Vω × 經驗係數（`src/data/free_volume_groups.csv` 19 列、`src/data/free_volume_coefficients.csv` 5 列，皆「待使用者審」；`src/core/properties/freeVolume.ts`），共聚物按莫耳分率加權，輸出 `docs/verification/phase6-自由體積-經驗係數-輸出.md`，結果見 `docs/reports/036a-結果.md`。這是使用者定義的經驗法，不是書中的自由體積分率，不用於 CTE。6.4 不勾選
  - 補註（任務 036b）：經驗自由體積法的酮、醛、酯基改為含羰基碳的整個官能基（數值 10.8、11.5、23 不變；酯基 23 於任務 036c 改為書的 15.2，見 D58），羰基碳不另計；結果見 `docs/reports/036b-結果.md`。6.4 不勾選
  - 補註（任務 P6B）：6.4 的 Tm、Td 完成（Python 引擎 `POST /tm`、`/td`；`src/data/ym_groups.csv`、`yd_groups.csv`、`ym_side_chain.csv`、`ym_ch2_sequence.csv`，皆「待使用者審」；方法見 `docs/MODELS.md`），面板（I01）顯示；書算例對照（Table 6.15：54 個中相符 40、不符 14；Table 21.3：34 個中相符 25、不符 7、無法計算 2，其中 4 個不符只是書的 Td calc 欄與自己的 Yd÷M 不一致）見 `docs/verification/phase6-Tm-Td-吸濕-彈性模數-輸出.md`，使用者 2026-11-17 已決定書中未說明條件基團的選值方式與 Td 詮釋；其餘不符為書自己的表矛盾或規則限制，6.4 不勾選
  - 補註（任務 P6B）：6.5 的吸濕性完成（`POST /moisture`，Table 18.14，`src/data/water_groups.csv`；書 Example 18.4 相符）；彈性模數未做：書 13.2.6 節的三個體積模數方法需要 Rao 函數（Table 14.4）、莫耳熱容、內聚能與熔化熱，本專案沒有也未收錄，`POST /modulus` 只回報缺什麼（使用者 2026-11-17 決定 Table 14.4、莫耳熱容、內聚能、熔化熱先不收錄）；彈性模數未做，6.5 不勾選
  - 補註（任務 P6E）：6.5 的彈性模數補完（`POST /modulus`；`src/data/rao_hartmann_groups.csv` 42 列（Table 14.4：U_R、U_H，環狀基團已目視對照）、`ecoh_groups.csv`、`hm_groups.csv` 各 6 列（Table 7.1 Hoftyzer and Van Krevelen 欄、Table 5.7，只收基團定義可對應的列），皆「待使用者審」）：方法一 K、G（U_H 書中暫定）、ν、E（Table 13.2）、方法三（可對應基團）與平均；方法二（需 Fig. 5.4）不做。書算例：Example 13.1 全部相符、Example 13.2 的 U_R、U_H、K、G、ν 相符，E 與書自己的算術不一致（書印 3.52，書的式與書印 K、G 得 3.45）；Table 14.5 的 U_R、U_H 能算的 32 個值中 26 個相符；Table 13.6 方法一欄能算 24 列中 9 列相符、15 列不符（7 列書內不一致、8 列原因不明）已由使用者接受，不調整
  - 補註（任務 036d）：經驗自由體積的芳香 C 依 Bondi Table XV 分 C–H 8.11、取代 5.54、縮合 4.74，並依 Table XVII 套用修正（D60）：`src/data/free_volume_groups.csv` 21 列、`src/data/free_volume_corrections.csv` 6 列；不勾選。
  - 補註（任務 037）：VW 缺基團以 Bondi (1964) 補充（D59）：`src/data/vw_groups_bondi.csv`（13 個基團 BG、5 個 Table XVII 修正 BC）、`src/core/data/vwGroupsBondi.ts`；書的基團先配對，補充結果標「含 Bondi 補充基團（非書值）」；環氧、五員雜環（醯亞胺、PBO、內酯）、籠狀環維持缺基團；結果見 `docs/reports/037-結果.md`，6.4 仍不勾選
  - 補註：Tg–Mn 文獻資料與 K 擬合（任務 035）已做：Lin-Gibson 2001 的鄰、對甲酚酚醛各自擬合 Tg∞ 與 K（異構物互檢誤差 ≤ 8 K，兩類收錄，低可信度，待使用者審）；BPA 環氧鏈只做參考擬合與 EPON 順序檢查，未收錄 K；ECN、PGMA 只登錄與觀察，不擬合；Szeluga 2008、Sadeghinia 2012 只記為驗證候選；`src/core/properties/tgFit.ts`、`novolacUnits.ts`，輸出 `docs/verification/phase6-Tg-混合-輸出.md` 第 7–9 節。6.7 仍不勾選
  - 補註（任務 038，D61）：簡易 Tg 相對估算（任務 038，D61）：Tg_B = Tg_A − Δf／Δα，Δf =（Vf_B − Vf_A）／V_A（使用者 2026-11-13 指定的範例算法），Bondi 型 FFV = 1 − 1.3 × VvdW／Vm；`src/data/packing_coefficient_k.csv`（使用者的 k／Tg 表 50 列，「待使用者審」）、`src/core/data/packingCoefficientK.ts`、`src/core/properties/relativeTg.ts`（只有核心函式，沒有畫面），輸出 `docs/verification/phase6-相對Tg-輸出.md`，結果見 `docs/reports/038-結果.md`。6.7 不勾選
- [x] 6.8 每個公式的自動測試（檢查程式是否照公式算對）
  - 補註（任務 P6C）：覆蓋表見 `docs/verification/phase6-公式測試覆蓋.md`（逐模組列公式、端點、測試位置與案例數）；完全沒有 pytest 的公式 2 個（Tm 長側鏈式 6.22–6.24、Td 共軛值 c），已補 4 個手算案例（`engine/tests/test_p6c_unit.py`）；`/modulus` 公式未實作，不算缺口；Tm、Td、吸濕的書算例仍只在對照文件，不是 pytest（列為弱點）。報告 `docs/reports/P6C-結果.md`。
- [x] 6.9 使用者驗證清單
  - 補註（任務 P6C）：清單與模板完成（`docs/verification/phase6-使用者驗證清單.md`：待審資料列統計與 57 列判斷性資料列、20 個代表分子對照表、實測比對說明；`docs/verification/user-measured-template.csv`；`engine/scripts/compare_measured.py`，校準列不併入驗證誤差）；**使用者實際審完屬後續**，審完後才算 D17 的化學驗證完成。
  - 補註（僅供驗證，不作為程式輸入，D02）：使用者有配方**固化前** Tg 實測值，用於比對 6.7 混合配方 Tg（Fox／Gordon–Taylor）。比對腳本 `compare_measured.py` 目前只比對 /tg（單一重複單元 SMILES）；混合配方 Tg 的比對未做

## Phase 7：交聯第 2 層與擴充反應體系

目的：完成交聯模組的第 2 層，並把反應體系擴充到第一版的範圍。

開工前需要使用者決定：（P05 已由 D65 定案）、S02（現 D68）、S03（現 D69）、S04（現 D70）、S05（現 D71）；pKa 資料來源（D39，先執行 7.0 的來源調查）

- [x] 7.0 pKa 資料來源調查：搜尋可用的母體 pKa 與 Hammett／Taft σ 值來源（論文、開放資料集），列出授權、涵蓋範圍，交使用者選擇（D39）
  - 補註（任務 P7-6 後續，2026-11-18）：調查完成，來源組合已由 D66 定案
- [x] 7.1 依 D65 加入反應體系的 SMARTS 與規則（D22 流程），分 A 環氧與酚醛體系、B 縮合與加成體系、C 自由基體系三批，每批一次建完；陽離子光酸催化環氧／氧雜環丁烷在 A 批，去保護與 DNQ 歸 Phase 10
  - 補註（任務 P7-1A，2026-11-17）：**A 批完成**——環氧與酚醛體系共 11 個官能基、13 條反應規則加入 `src/data/`（皆 `pending`，待使用者審），命中列表見 `docs/verification/phase7-反應規則A-命中列表.md`，報告見 `docs/reports/P7-1A-結果.md`。**勾選條件**：B 批、C 批也完成，並經使用者審核（pending → approved）後才勾 7.1。
  - 補註（任務 P7-1B，2026-11-17）：**B 批完成**——縮合與加成體系（異氰酸酯、三聚氰胺類、矽烷水解縮合、矽氫加成、馬來醯亞胺、苯并㗁嗪、聚醯亞胺與 PBO 前驅物環化）共 15 個官能基、25 條反應規則加入 `src/data/`（皆 `pending`，待使用者審；數值欄全部留空並在 notes 說明），命中列表見 `docs/verification/phase7-反應規則B-命中列表.md`，報告見 `docs/reports/P7-1B-結果.md`；同卡修正 A 批兩項介面問題（催化劑配對不再顯示「具封端」；分子工具的反應原子標記只標配到對的官能基，且引擎編號與顯示結構編號一致）。**勾選條件**：C 批也完成，並經使用者審核後才勾 7.1。
  - 補註（任務 P7-1C，2026-11-18）：**C 批完成，A、B、C 三批全部完成，7.1 依任務卡 P7-1C 勾選**（各官能基與規則仍全為 `pending`，審核仍待使用者）——自由基體系（壓克力／甲基丙烯酸酯／丙烯醯胺／苯乙烯的鏈增長聚合，熱起始劑或光起始劑以「催化劑配對（不計當量）」表示；硫醇–烯）共 9 個官能基、12 條反應規則加入 `src/data/`（數值欄全部留空並在 notes 說明；鏈增長 8 條與硫醇＋丙烯酸酯第 1 層回報「尚未支援」，硫醇＋烯丙基／乙烯基醚／降冰片烯 3 條照現有公式算），命中列表見 `docs/verification/phase7-反應規則C-命中列表.md`，報告見 `docs/reports/P7-1C-結果.md`。**待補規則（本機文獻無明確反應式，另卡找文獻補）：馬來醯亞胺自聚、ene 後續共聚、苯并㗁嗪＋環氧、封端異氰酸酯解封端。**（任務 P7-2，2026-11-18：四條已加入，皆 `pending`、反應 SMARTS 自行撰寫，見 `docs/reports/P7-2-結果.md`。）
- [x] 7.2 反應起始溫度參考範圍（規則表文獻值，S03）
  - 補註（任務 P7-4，2026-11-18）：已接進「固化預測」卡片的「反應溫度範圍」區：對第 0 層命中的每條規則顯示規則表的文獻值、適用條件、出處；欄位為空顯示「無文獻範圍」，光觸發顯示「光觸發」，不補值。**資料多為空，僅顯示有文獻值的反應**（55 條規則中 4 條有範圍、6 條光觸發）。依任務卡勾選，數值與出處仍 `pending`，待使用者審。見 `docs/reports/P7-4-結果.md`。
  - 補註（任務 P7-2，2026-11-18）：**資料已補，未審**（7.2 的程式部分由 P7-4 完成）——依 D67 由公開文獻補入 `reaction_rules.csv` 的 `temp_min_c`／`temp_max_c`：苯并㗁嗪開環（2 條，160–220 °C，Lochab 2021）與新增的肟封端異氰酸酯解封端（85–260 °C，Rolph 2016）；其餘規則找不到明確寫成典型範圍的文獻，維持空白並在 notes 說明；皆 `pending`，數值總表見 `docs/verification/phase7-反應規則D-命中列表.md`，報告見 `docs/reports/P7-2-結果.md`。
- [x] 7.3 反應位點相對活性排序（電子效應 + 3D 空間位阻，標為參考趨勢）
  - 補註（任務 P7-5，2026-11-18）：成分詳細彈窗新增「位點活性」表（`POST /crosslink/site-activity`）：**兩個分開的排序、不合成單一分數**——電子效應（依 7.3a 的 pKa；親核位點 pKa 愈高排名愈前，羧酸 pKa 愈低排名愈前；同類有 missing 不排序）與空間位阻（3D 構型反應原子的相對可及表面積，幾何描述量、非文獻公式，參數固定可重現）。聚合物沿用任務 024 的重複單元片段。出處與參數見 `docs/MODELS.md`，待使用者審。
- [x] 7.3a pKa 估算（Hammett／Taft，參考趨勢，水溶液值，D38）：酚、胺、羧酸等可解離基團；與 7.3 共用電子效應計算
  - 補註（任務 P7-5，2026-11-18）：`POST /pka`，資料來源 Perrin 1981（D66）：`hammett_sigma.csv`、`pka_equations.csv`（全 `pending`）。涵蓋酚、硫酚、苯胺共軛酸、苯甲酸、脂肪羧酸、脂肪胺、醇、咪唑（僅 2 位取代與 1-甲基-4-取代兩型）、脂肪硫醇（式取自正文 §6.3.3，不在 A.2／A.3）；Perrin 沒有的環系與取代基回報 `missing`。對書算例的驗證見 `docs/verification/phase7-pKa-輸出.md`，缺類別與待決事項見 `docs/reports/P7-5-結果.md`。
- [x] 7.4 Tg∞（基團貢獻 + 交聯密度修正）
  - 補註（任務 P7-3，2026-11-18）：以 van Krevelen 式 (6.13) 兩個書中 K 值各算一次，輸出**範圍**（不選單一值）；Tg,0 取既有 Fox 混合；式 (6.14) 因引擎沒有「網路主鏈原子數」取不到 x_crl，回報缺項。依本卡完成標準勾選，數值與出處待使用者審。見 `docs/reports/P7-3-結果.md`。追加：硬化溫度欄位沒有預設值（空白顯示「請輸入硬化溫度」）；共聚物成分的 Tg,0 改用各單元 Tg∞ 的 Fox 混合（與共聚比例掃描同一做法）；PGMA 的環氧丙基酯相關基團書的 Table 6.1 沒有，維持缺值、未新增資料。
- [x] 7.5 固化後 Tg（DiBenedetto，λ 依 S02）、完全固化最低溫度、指定溫度下最大轉化率
  - 補註（任務 P7-3，2026-11-18）：方程式取自本機 Pascault & Williams 1990 式 (4)、λ = Tg0/Tg∞ 取自同文式 (11)（已看原圖）；Tg∞ 用 K 範圍的下限與上限各算一次（結果為範圍）。完全固化最低溫度 T ≥ Tg∞ 為推論。
- [x] 7.6 固化收縮（S05）
  - 補註（任務 P7-4，2026-11-18）：收縮率 = Σ（單位鍵體積變化 × 形成的鍵莫耳數）÷ 配方總體積，併入「固化預測」卡片的「固化收縮」區；只對第 1 層支援的體系計算；缺值反應列出不補，成分缺密度整項 `missing`。環氧＋酚與環氧＋胺（4 條）沒有直接值，**沿用環氧開環值並標「詮釋：沿用環氧開環值（外推）」**，與直接文獻值分列。**資料多為空，僅顯示有文獻值的反應**（8 條有 `bond_volume_change`；第 1 層支援且有直接值的只有硫醇–烯 3 條）。依任務卡勾選，數值、出處與詮釋仍待使用者審。見 `docs/reports/P7-4-結果.md`。
  - 補註（任務 P7-2，2026-11-18）：**資料已補，未審**（7.6 的程式部分由 P7-4 完成）——依 D67 由公開文獻補入 `bond_volume_change`：（甲基）丙烯酸酯鏈增長 4 條（22.6、23 cm3/mol）、硫醇–烯 3 條（12.6）、陽離子環氧開環 1 條（11，只有環氧乙烷的值）；環氧＋胺、環氧＋酸酐、異氰酸酯、矽烷、苯并㗁嗪等找不到「每莫耳官能基」的值，維持空白；皆 `pending`，總表見 `docs/verification/phase7-反應規則D-命中列表.md`，報告見 `docs/reports/P7-2-結果.md`。
- [x] 7.7 Tg∞ > Td 警示（S04）
  - 補註（任務 P7-3，2026-11-18）：Tg∞ 上限高於 Solid 區成分中最低的 Td,1/2 時警示；小分子、共聚物與缺基團的成分不比較並列出（4A、4B 目前全部缺 Td，只能顯示「無法判斷」）。
- [x] 7.8 使用者驗證清單
  - 補註（僅供驗證，不作為程式輸入，D02）：使用者有配方 DSC 交聯峰溫度實測值，用於比對 7.2；固化前 Tg 亦可作為 7.5 DiBenedetto 的 Tg₀ 比對
  - 補註（任務 P7-6，2026-11-18）：**清單文件完成，依任務卡勾選；使用者實際審完屬後續**——`docs/verification/phase7-使用者驗證清單.md`（待審資料列總表：四張 Phase 7 資料表 158 列、155 列 `pending`；A、B、C、D 批命中列表與固化預測、pKa 輸出的索引；第 1 層不支援體系清單；已知限制 23 項；實測比對：固化前 Tg 用 `compare_measured.py` 的 `mixture` 模式，交聯峰溫度只列 4 條有文獻範圍的規則供手動對照，不新增比對模式）。報告見 `docs/reports/P7-6-結果.md`。
- Phase 7 摘要（任務 P7-6，2026-11-18）：7.1–7.8 皆已完成並勾選（7.0 已勾（調查完成，來源組合由 D66 定案））；四張 Phase 7 資料表 155 列 `pending`，反應規則、官能基、σ、pKa 式、溫度範圍與 ΔV 數值、固化預測與 pKa 輸出**全部待使用者審**（清單：`docs/verification/phase7-使用者驗證清單.md`）。

## Phase 8：溶液、相容性與界面

目的：完成溶劑相關物性與相容性判斷。

開工前需要使用者決定：P06（內建溶劑清單）——已定案為 D72（2026-11-18）

- [x] 8.1 溶劑資料表填入資料（優先取自成熟套件並標出處，D18）（任務 P8-1，D72：`src/data/solvents.csv` 23 個溶劑、197 列，皆 `pending`；HSP 取 Hansen 2007 Table A.1，密度、黏度、表面張力、沸點取 PubChem 經 HSDB 轉引的文獻值並標出處與溫度，分子量與摩爾體積為計算值；**有空欄**：黏度 5 個、表面張力 6 個缺值，密度多為 20 °C 值，原因逐溶劑寫在各溶劑 molecular_weight 列的備註與 `docs/reports/P8-1-結果.md`，不因空欄不勾）
- [x] 8.2 Liquid 區 vol% 換算（使用溶劑資料表的密度）（任務 P8-1：`POST /liquid-volume`，右欄「Liquid 體積比（vol%）」卡片，加入成分彈窗新增「從溶劑資料表選取」；缺密度回報 missing；**Liquid 區的輸入單位 vol% 仍不支援**，既有行為不改）
- [x] 8.3 HSP 基團貢獻、混合溶劑 HSP、Ra、RED、Flory–Huggins χ、溶解性判斷（參考趨勢）（任務 P8-1：`POST /hsp`、`POST /solubility`，`src/data/hsp_groups.csv`〔Table 7.10〕、`hsp_polymers.csv`〔Table 7.8〕，右欄「溶解性」卡片；書算例對照見 `docs/verification/phase8-溶劑與溶解性-輸出.md`：Example 7.3 相符，Example 7.5 的 δh 與 Table 7.6 的聚(乙烯硫醚)有無法由書內資料解釋的差，待使用者決定；未套用對稱因子與 Ring）
- [ ] 8.4 混合溶劑黏度（Grunberg–Nissan）、聚合物溶液黏度（任務 P8-2，**部分完成，不勾**）：已做——聚合物溶液黏度（`POST /viscosity`，右欄「黏度」卡片）：Θ 條件 KΘ 與 [η]Θ（式 9.42 反解、式 9.34、Table 9.3 的 29 列基團 J；Table 9.4 的 25 個聚合物 ΣJi 與 Z 全部與書一致）、Mark–Houwink（式 9.32、9.33，K 與 a 由使用者輸入並附來源，不內建）、含 B 項（式 9.38）、濃溶液（式 16.21，K 由使用者輸入）；溶劑黏度取溶劑資料表，溫度依賴用 Andrade 式（式 16.15a，兩個溫度的黏度或 B 與 Eη 由使用者輸入，單一溫度不外推）。**未做——混合溶劑黏度**：查證第 8、9、15、16 章與索引，書中沒有溶劑混合黏度的混合規則（8.2.2 節的 Grunberg–Nissan 式 8.3 是表面張力的內聚功 Wcoh，不是混合黏度式），回 `missing`「書中無溶劑混合黏度式；待使用者指定出處」（本機另有 Grunberg & Nissan 1949 論文，若要採用請使用者指定）。見 D73
- [ ] 8.5 表面張力（Parachor）、混合溶液表面張力（任務 P8-2，**部分完成，不勾**）：已做——Parachor 表面張力（`POST /surface-tension`，Table 8.1 三組 Sugden、Mumford–Phillips、Quayle 並列列範圍，γ = (Ps/V)^4；聚合物用非晶莫耳體積、溶劑用溶劑資料表該溫度的密度；Table 8.3 的 Guggenheim 與 Table 8.7 的 −dγ/dT 列為文獻對照）；書 Table 8.2 對照：Ps 與書一致（Example 8.1 的 220.8），γ 與書的差異主要來自 V（Vm 模組的非晶莫耳體積與書用的 V 不同），算得出 16／35 列。**未做——混合溶液表面張力**：書中沒有混合規則，回 `missing`。見 D73
- [x] 8.6 界面張力與潤濕性（Owens–Wendt、Young）（任務 P8-2：`src/data/surface_energy.csv`〔Table 8.6 的 14 種液體、Table 8.7 的 27 個聚合物、Table 8.8 的 14 列，皆 `pending`〕；`POST /interfacial`（式 8.22）、`POST /wetting`（式 8.23 的 cosθ 與 θ、Young 式 8.6、鋪展係數 S = γLV + γSL − γSV，書：S 為負時完全潤濕）；右欄「表面與潤濕」卡片；Example 8.4 重現；溶劑不在 Table 8.6 時 Owens–Wendt 回 `missing`，不補）
- [ ] 8.7 溫度與濃度依存性（任務 P8-2，**部分完成，不勾**）：已做——溶劑黏度與表面張力的溫度依賴（Andrade 式；Parachor 以該溫度的密度重算）、聚合物表面張力的 Guggenheim 文獻對照、濃溶液冪律式（K 由使用者輸入）；未做——聚合物表面張力的溫度外推（需該溫度的密度，引擎沒有）、分子量依賴（式 8.15、8.16 的 ke、ks 只列在 `src/data/surface_tension_temperature.csv`，未接計算）
- [ ] 8.8 使用者驗證清單

## Phase 9：匯出與收尾

目的：結果可以帶走，每個模型都有說明。

開工前需要使用者決定：無

- [ ] 9.1 匯出 CSV、Excel、MOL、SDF、圖片（新增套件前確認授權）
- [ ] 9.2 每個模型的說明頁：公式、適用條件、參考文獻
- [ ] 9.3 整體檢查：所有結果都有模型名稱、可信度、統一備註
- [ ] 9.4 使用說明文件

## Phase 10：微影模組（暫列，Phase 6A 完成且使用者決定開工後才開）

目的：在同一個本機程式內加入微影模擬與科學驗證。內容出處：`docs/plans/lithography-integration-plan-v1.0.md`（使用者的整合規劃文件 v1.0，2026-11-13），各項標註章節。計算寫在 Python（D62）。

開工前需要使用者決定：Phase 6A 完成；是否開工；各模組所需材料參數的來源（見下方補註）

- [ ] 10.1 M04：薄膜 TMM、BARC、駐波（Python；以 Fresnel 解析解與現成 TMM 套件交叉驗證）（整合規劃文件第 3 節 M04；第 5.2 節 ANA-01）
- [ ] 10.2 M01–M03：光罩、空中影像、NILS、FEM（整合規劃文件第 3 節 M01–M03）
- [ ] 10.3 M05–M07：Dill ABC、CAR 反應擴散、顯影（整合規劃文件第 3 節 M05–M07）。**需要有實驗參數才有定量意義**；沒有就只做趨勢
- [ ] 10.4 科學驗證中心：測試輸出 `PASS / FAIL / INCOMPLETE`；結果狀態分 Analytical verified、Numerically converged、Literature benchmarked、Calibrated、Predictively validated、Exploratory（整合規劃文件第 5 節，狀態見 5.4，每項測試輸出欄位見 5.5）
- 補註：MoleForm 的 pKa、Tg、自由體積不能直接當作酸擴散係數、去保護速率或產酸效率（整合規劃文件第 2.2 節）。時程只是規劃估計，不是工期承諾（整合規劃文件第 0 節）
