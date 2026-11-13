# 任務 M00：RDKit 版本對齊、黃金比對框架、共用層搬遷（PLAN 6A.4-00）

編號：M00
建立日期：2026-11-13
指派給：Claude Code

## 目標

D62／D63：計算最終搬到 Python 引擎，以現有 TypeScript 輸出為黃金標準，逐字比對。本卡是搬遷的第一步：（1）把 RDKit 版本對齊並固定；（2）建立黃金匯出與比對框架；（3）搬遷共用層（原子量、分子圖、CSV 讀取）。**TypeScript 的計算不得修改，仍是預設。**

使用者 2026-11-13 的決定：Python 降到與 RDKit.js 相同的 2026.9.1（不升 npm）；浮點預設逐字相同，做不到時可記錄案例並允許相對誤差 1e-12。

## 前置條件（先讀這些）

- `docs/reports/039a-結果.md` 第 2、3、4、5 節；`docs/DECISIONS.md` 的 D62、D63、D18
- `engine/`（任務 039 的原型）、`package.json`、`src/core/` 中對應共用層的檔案（atomicWeights、molGraph、CSV 讀取；只讀）及其測試
- 不要搜尋整個專案，不要用 codegraph 反覆搜尋

## 要做的事

1. **版本對齊（先做，失敗就停）**：在 `engine/.venv` 嘗試安裝 `rdkit==2026.9.1`。這個版本裝不到（找不到或 3.12 沒有 wheel）→ **停下來回報，不要改 npm、不要用其他版本**。裝得到 → 重新安裝，握手回報的版本必須是 2026.9.1。
2. **固定版本**：`package.json` 的 `@rdkit/rdkit` 改為精確版本 `2026.9.1`（去掉 `^`；先用 `npm ls` 確認目前實際安裝的就是這個版本，不得因此升降級或改動其他套件）；`engine/requirements.txt` 以 `==` 固定 numpy、scipy、rdkit 與其他引擎相依套件（版本取自目前 `engine/.venv` 實際安裝，用 pip 查，不憑記憶）。握手回報版本，與黃金檔記錄的版本不符時，比對程式拒絕執行。
3. **黃金匯出框架**：新增 `scripts/golden/export-<module>.ts`（用現有的 TypeScript 執行方式，例如 vite-node 或 vitest，依專案現況選擇）與共用輸出格式，輸出到 `tests/golden/<module>.json`：`{ module, commit, rdkitjs, cases: [{ id, input, output }], tolerance }`；`output` 為函式回傳原樣，鍵排序後序列化。不要修改任何現有的 TypeScript 計算檔，匯出程式只呼叫它們。
4. **Python 比對框架**：`engine/tests/` 下新增比對共用程式與 pytest。規則：字串、整數、陣列（原子索引、基團 id、缺基團清單）逐字相同；浮點先比較最短 round-trip 字串表示；若不同，才允許相對誤差 1e-12，並把該案例記入 `tolerance_cases` 清單輸出到報告（不得靜默放寬）。
5. **共用層搬遷**（只做這三塊）：
   - 原子量：資料取自專案現有資料表，不得憑記憶補數字。
   - 分子圖：以 RDKit Python 實作與 TypeScript 的 molGraph 等價的結果；對 039a 的風險 R1（芳香性）與 R2（隱式氫與原子順序）逐項寫出你的做法與依據（例如用 `atom.GetIsAromatic()`、`GetTotalNumHs()`，原子順序是否與 JSON 輸出一致），用現有測試與 `docs/verification/` 的分子清單當比對輸入，**原子順序與氫數不一致時停下來回報**，不要用排序之類的方式掩蓋。
   - CSV 讀取：與 TypeScript 的欄位檢查規則等價（缺欄位報錯，D22）。
6. **黃金測試**：共用層三塊各自匯出黃金檔並通過 Python 比對；風險 R1、R2 各至少一個專屬案例（雜環、稠環、含 `*` 的重複單元）。
7. 建議（只寫進報告，不要自行修改 CI）：CI 是否新增 Python 引擎測試 job，以及需要的設定。
8. 報告 `docs/reports/M00-結果.md` 寫精簡：版本對齊結果、框架說明、R1／R2 的做法與結論、`tolerance_cases`、需要使用者決定的事。
9. 本機只跑本卡新增的檢查與引擎的 pytest，以及型別檢查；全部 TypeScript 測試與建置交給 CI。commit、push，確認 CI 的 build 通過。

## 不可更動的檔案或規則

- 不修改 `src/` 的計算、資料表與既有測試（`package.json` 只改 RDKit 版本那一行）；TypeScript 仍是預設，本卡不做任何切換
- 不使用記憶中的數值與版本號；不更改已定案決定
- 引擎只在 127.0.0.1 內部連線，不對外；不得實作共用層以外的物性公式
- 測試時不要留下背景程式

## 完成標準（可檢查）

- [ ] 握手回報 RDKit 2026.9.1；`package.json` 與 `requirements.txt` 版本固定
- [ ] 黃金匯出與 Python 比對框架可用；版本不符時拒絕比對
- [ ] 共用層三塊通過黃金比對；R1、R2 有專屬案例與結論；`tolerance_cases` 列在報告中
- [ ] 型別檢查、引擎 pytest 通過；CI 的 build 通過；已 commit 與 push

## 需要先問使用者的情況

- 裝不到 Python 的 `rdkit==2026.9.1`
- 分子圖的原子順序或氫數與 TypeScript 無法一致
- 需要修改 TypeScript 的計算檔才能匯出黃金資料
- 任務與 `docs/DECISIONS.md` 衝突
