# 任務 011：小分子 3D（OpenChemLib 構象與 MMFF94、3D 顯示、量測）（Phase 2.5–2.7）

編號：011
建立日期：2026-10-29
指派給：Codex／Claude Code

## 目標

在「結構輸入」下方新增「3D 結構」卡片：使用者按「產生 3D」後，程式在背景用 OpenChemLib JS 產生構象並做 MMFF94 最佳化，顯示可旋轉的 3D 模型，能切換顯示樣式、顯示原子編號、量測鍵長／鍵角／二面角、匯出 3D MOL／SDF。並提供使用者判斷 3D 是否可接受（D33）所需的耗時數字。**3D 只用於單體與小分子（D05）。**

## 前置條件（先讀這些）

- `AGENTS.md`（特別是 OpenChemLib `getBondLength`／`getBondAngle` 只看 2D 座標的注意事項）
- `docs/DECISIONS.md`（特別是 D05、D23、D33、D34）
- `docs/PLAN.md`（Phase 2 的 2.5、2.5a、2.5b、2.6、2.7）
- `docs/KNOWN_ISSUES.md`（K01、K07、K08）
- `docs/reports/005-結果.md`（OpenChemLib 的 API 名稱、`resources.json`、耗時、原子順序）
- `docs/reports/010-結果.md`
- `experiments/ocl-3d/run.mjs`（任務 005 的測試腳本，可參考寫法）

## 要做的事

### A. 套件

1. 安裝 `openchemlib`，版本與任務 005 相同（9.25.2）。
2. 3D 顯示函式庫：優先評估 `3dmol`（3Dmol.js）。**安裝前**從 npm 套件資訊與其 LICENSE 確認授權，並檢查它的執行期相依套件授權；**若有 GPL／AGPL／LGPL，停下來問使用者**。授權沒問題才安裝，並在報告記錄版本與授權。
3. 兩個套件的授權聲明要加進網站的第三方授權聲明（參考 Ketcher 的 `THIRD-PARTY-NOTICES.txt` 做法）。

### B. 3D 計算（2.5，放在獨立的 Web Worker）

4. 新增 `src/worker/conformer.worker.ts`（與 RDKit 的 Worker 分開，避免 3D 計算時卡住結構驗證），以及對應的 client 與 protocol 型別。
5. `resources.json`：用 Vite 的 `?url` 取得 `openchemlib` 套件內的 `resources.json` 網址，在 Worker 中以 `Resources.registerFromUrl()` 載入；**只在使用者第一次按「產生 3D」時才載入**，之後重複使用。
6. 計算核心寫在 `src/core/conformer/`（純 TypeScript，可在 Node 測試）：
   - 輸入：任務 010 驗證過的 Molfile（由 RDKit 產生）
   - 用 `ConformerGenerator(seed)` 產生構象，種子固定為 `42`（結果可重現），種子值顯示在畫面上
   - 每個構象用 `ForceFieldMMFF94` 最佳化（力場變體用 `MMFF94`，與 spec 一致），取得能量，依能量由低到高排序
   - **預設產生 5 個構象**；畫面提供「產生更多構象」，一次再加 5 個，上限 30
   - 最佳化後座標完全相同（或極接近）的構象要合併，並在報告說明判斷方式與閾值
   - **MMFF94 缺參數（拋錯）時**：改用未最佳化的初始構象，標示「未經力場最佳化（MMFF94 不支援此結構中的元素或原子型）」（K07），不得讓整個功能失敗
7. 原子順序：沿用任務 005 的結論（RDKit Molfile 的重原子順序不變、氫接在後面）。寫一個測試確認「重原子索引在 3D 結果中不變」，作為 Phase 4 在 3D 上標記反應原子的前提。
8. **不支援 3D 的情況**（顯示說明，不計算）：
   - 結構含連接點 `*`：「含連接點的重複單元不提供 3D（3D 只用於單體與小分子，D05）」
   - 結構無效或空白
   - 重原子超過 100 個時：不阻擋，但先提示「分子較大，3D 計算可能需要較長時間」，使用者確認後才計算
9. 計算中顯示進度（例如「正在產生構象 3／5」）與「取消」按鈕；取消時直接結束該 Worker，下次再重新建立。
10. 畫面顯示每次計算的**耗時**（產生構象、力場最佳化各多少秒），供 2.5a 使用者判斷。

### C. MMFF94 能量單位確認（2.5b，K08）

11. 依 MMFF94 官方驗證資料集（MMFF94 Validation Suite，`https://ccl.net/cca/data/MMFF94/`）確認 OpenChemLib 的能量單位：
    - **下載前先告訴使用者檔名、來源、大小，取得同意**
    - 下載的檔案放在 `experiments/mmff-validation/`，不要接入正式程式碼
    - 取 10 個左右的分子，用資料集提供的座標**不做最佳化**直接計算 OpenChemLib 能量，與資料集的參考能量比對；判斷單位（例如兩者比值接近 1 或接近 4.184）與一致程度
    - 結果寫進報告：每個分子的參考值、OpenChemLib 值、差異；若部分分子差異大，列出並說明可能原因（例如芳香性或原子型判定不同），**不要修改力場或參數**
12. 依結果：
    - 單位能確定 → 畫面顯示「相對能量（kcal/mol 或 kJ/mol）」，最低者為 0
    - 單位無法確定 → **不顯示能量數值**，只顯示構象排序；K08 維持未確認
    - 能量顯示要用任務 008 的 `ResultValue` 元件：模型名稱「MMFF94（OpenChemLib JS）」、可信度「直接計算」、附統一備註

### D. 3D 顯示（2.6）

13. 新增 `src/ui/structure/Viewer3D.tsx`，用 A-2 選定的函式庫：
    - 旋轉、縮放、平移
    - 樣式切換：Ball-and-Stick、Stick、Space-Filling
    - 原子編號開關：顯示 **1 起算**的編號，並在畫面註明「編號從 1 起算」；編號對應 RDKit 的原子索引加 1（Phase 4 標記反應原子時沿用）
    - 構象選單：列出構象序號與（若 C-12 允許）相對能量
    - 標示「理論構型：依 MMFF94 力場估算，非實測結構」
    - 可隱藏或顯示氫原子
14. 3D 卡片只在使用者按「產生 3D」後才載入 3D 函式庫（動態 import），不拖慢首頁。

### E. 3D 量測（2.7）

15. 量測幾何寫在 `src/core/geometry.ts`（純 TypeScript）：由 x、y、z 座標計算鍵長（Å）、鍵角（°）、二面角（°，範圍 -180 到 180）。**不得使用** OpenChemLib 的 `getBondLength`、`getBondAngle`（只看 2D 座標，見 AGENTS.md）。
16. 測試 `tests/geometry.test.ts`：用手算可驗證的座標（例如 (0,0,0)、(1,0,0)、(1,1,0)、(1,1,1) 的距離、90° 角、二面角）確認公式正確；這是程式邏輯測試（D17）。
17. 畫面：依序點選 2、3、4 個原子，分別顯示鍵長、鍵角、二面角，並列出所選原子的編號；可清除量測。

### F. 3D 匯出

18. 「下載 3D MOL」：目前顯示的構象（含 3D 座標與氫）。
19. 「下載 3D SDF」：全部構象，每筆附構象序號、種子；若 C-12 確定單位，另附能量欄位與單位。
20. 重用任務 010 的 `src/ui/download.ts`。

### G. 測試（Node，`tests/conformer/`）

21. 至少包含：乙醇、環氧丙烷、BADGE 能產生 3D 座標（z 不全為 0）；同種子兩次結果相同；BF₃ `FB(F)F` 走「未經力場最佳化」路徑而不拋錯；含 `*` 的結構被拒絕並回傳說明；重原子索引不變。

### H. 瀏覽器實測（2.5a）

22. 用無頭瀏覽器（若可行）在正式建置版上，對乙醇、BADGE 各計算一次，記錄耗時與網頁是否保持可操作，寫進報告。
23. 報告列出**請使用者在自己電腦上實測**的步驟：載入 BADGE（`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`）→ 產生 3D → 記下畫面顯示的耗時 → 計算時試著捲動頁面、修改 SMILES，看是否卡住 → 按「產生更多構象」再記一次耗時。

### I. 檢查、提交、推送

24. 依序執行 `npm run typecheck`、`npm test`、`npm run build`，全部通過。
25. 確認首頁載入時**沒有**下載 `resources.json` 與 3D 函式庫（只在按「產生 3D」後才下載），方法寫進報告。
26. 提交（訊息：`小分子 3D：OpenChemLib 構象、MMFF94、3D 顯示與量測（任務 011）`），推送方式依 `AGENTS.md`；卡住超過 1 分鐘就停止並請使用者手動推送。

## 不可更動的檔案或規則

- 不得為聚合物、重複單元或交聯網路產生 3D（D05）
- 不得修改力場參數、`resources.json` 內容或 OpenChemLib 的計算方式
- 不得使用 OpenChemLib 的 `getBondLength`、`getBondAngle` 做 3D 量測
- 能量單位未確認前，不得顯示能量數值
- 不得把使用者的結構傳到任何外部服務（D23）；驗證資料集的下載只用於 `experiments/`
- 除 `openchemlib` 與選定的 3D 顯示函式庫外，不安裝新套件
- 不得修改 CheMScutter 與 `moleform-handoff`
- 不得修改 git 或認證設定；不得 force push

## 完成標準（可檢查）

- [ ] `npm run typecheck`、`npm test`、`npm run build` 全部通過（含 `tests/geometry.test.ts`、`tests/conformer/`）
- [ ] 3D 顯示函式庫的版本與授權已記錄，且非 GPL 類
- [ ] 首頁載入時不下載 `resources.json` 與 3D 函式庫
- [ ] 能量單位的比對結果已寫進報告；K08 已依結果更新
- [ ] 推送成功（或已請使用者手動推送）
- [ ] 報告含使用者實測步驟（H-23）

## 完成後請做

1. `docs/PLAN.md` 的 2.5–2.7 **先不要勾**，等使用者實測與確認後再勾
2. 新增 `docs/reports/011-結果.md`，內容包含：
   - 新增的檔案與套件（版本、授權）
   - 構象合併的判斷方式與閾值
   - 能量單位比對結果
   - 測試、建置、推送結果；無頭瀏覽器實測的耗時
   - 請使用者實測與確認的清單（含 2.5a 的步驟，以及：切換三種樣式、原子編號、量測一個鍵長與鍵角、下載 3D MOL 後用其他軟體開啟是否為 3D）
   - 遇到的問題
   - 需要使用者決定的事
3. 更新 `docs/KNOWN_ISSUES.md` 的 K01、K07、K08
4. 報告與文件一併提交並推送

## 需要先問使用者的情況

- 3D 顯示函式庫或其相依套件有 GPL 類授權
- 下載 MMFF94 驗證資料集之前（告知檔名、來源、大小）
- 推送卡住或失敗
- 需要安裝本任務列出以外的套件
- 任務內容與 `docs/DECISIONS.md` 衝突
