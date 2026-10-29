# 任務 016：環氧基、酚羥基與反應規則（D22）、交聯第 0 層、反應原子標記（Phase 4.1–4.4）

編號：016
建立日期：2026-10-29
指派給：Codex／Claude Code

## 目標

程式能從結構找出環氧基與酚羥基，依反應規則判斷配方中誰和誰會反應、形成網路還是只有鏈延長或封端，並在 2D／3D 結構上標出反應原子。這是交聯第 0 層（D11）。官能基與反應規則依 D22 流程建立：官能基 SMARTS 取自已發表來源，反應 SMARTS 自行撰寫並交使用者審核。**本任務不計算當量比、凝膠點與交聯密度**（任務 017）。

## 前置條件（先讀這些）

- `AGENTS.md`
- `docs/DECISIONS.md`（特別是 D05、D09、D11、D17、D22、D26、D35、D42、D43）
- `docs/DATA.md`
- `docs/PLAN.md`（Phase 4）
- `docs/verification/phase4-測試體系.md`
- `docs/reports/015-結果.md`

## 要做的事

### A. 任務 015 的收尾（使用者 2026-10-29 確認）

1. 使用者已在瀏覽器確認任務 015 報告第 6 節的清單。`docs/PLAN.md` 勾選 4.0。
2. 使用者確認 E 為**甲基丙烯酸縮水甘油酯（GMA）均聚物**，重複單元 `[*:1]CC([*:2])(C)C(=O)OCC1CO1` 正確。更新 `docs/verification/phase4-測試體系.md`：備註中「請使用者確認」那一句改為「已由使用者確認為 GMA 均聚物（2026-10-29）」。
3. 任務 015 報告第 8 節第 1–3 點，使用者都同意（`schemaVersion` 維持 1；含 `*` 的結構一律當聚合物、須填 Mn／DP；連接點提示改指向「均聚物設定」）。在報告第 8 節補一行記錄。

### B. 官能基 SMARTS（`src/data/functional_groups.csv`，D22 第 1、2 步）

4. 新增兩列，SMARTS 原文**必須從來源讀取後照抄**，不得憑記憶：

| id | 來源 | 取得方式 |
|---|---|---|
| `hydroxyl.phenolic` | Daylight Chemical Information Systems，〈SMARTS Examples〉線上文件，Functional Groups by Element → hydroxyl → Phenol（`https://daylight.com/dayhtml_tutorials/languages/smarts/smarts_examples.html`） | 讀取該網頁 |
| `ether.epoxide` | RDKit 內建片段定義 `fr_epoxide`（`Data/FragmentDescriptors.csv`），版本對應本專案使用的 RDKit 2026.09.1 | 從 RDKit 官方 GitHub 對應版本標籤讀取該檔 |

   - 出處欄：Daylight 那列 `source_type = paper`，`source` 寫文件名與發布者，`source_detail` 寫網址與章節；RDKit 那列 `source_type = package`，`source = RDKit`，`source_detail` 寫版本與檔案路徑、欄位名，`source_original` 寫「RDKit 內建定義，未引用文獻」
   - 若讀不到來源，**停下來問使用者**，不要自己寫
5. 計數用的原子映射：為了計數與標記，可以在原文 SMARTS 上**只加原子映射編號**（例如 `[O:1]`），不得改變任何原子或鍵的條件；`notes` 欄註明「僅加入原子映射編號，匹配條件與原文相同」，並寫出原文。
   - `hydroxyl.phenolic`：映射酚羥基的 O；**計數以不同的 O 原子為準**（原文會因兩個鄰位碳而對同一個 OH 匹配兩次，必須去重）
   - `ether.epoxide`：映射環上三個原子；計數以「不同的三原子集合」為準
   - 把這兩個欄位寫進 `reactive_atom_maps`
6. 測試分子（`should_match`／`should_not_match`，D22 第 2 步）由你選擇，至少包含：
   - `hydroxyl.phenolic` 應命中：苯酚、雙酚 A、`docs/verification/phase4-測試體系.md` 的 S；不應命中：乙醇、苯甲酸、苯甲醚、PGMEA
   - `ether.epoxide` 應命中：環氧丙烷、BADGE、縮水甘油基甲基丙烯酸酯；不應命中：氧雜環丁烷 `C1COC1`、四氫呋喃、乙二醇、PGMEA、氮丙啶 `C1CN1`
7. 兩列的 `review_status = pending`（等使用者審核，D17）。

### C. 反應規則（`src/data/reaction_rules.csv`，D35）

8. 新增一列 `epoxy+phenol`：
   - `reaction_type`：開環加成
   - `group_a = ether.epoxide`、`group_b = hydroxyl.phenolic`
   - `reaction_smarts`：**自行撰寫**，以上面兩個官能基的匹配條件為基礎，表示「酚羥基的 O 與環氧環上一個碳成鍵、環打開成羥基」。只需正確表達成鍵與開環；開環發生在哪一個碳不區分（`notes` 註明「開環位置未區分，僅用於配對、計量與標記」）
   - `catalyst_required = none`
   - `temp_min_c`、`temp_max_c`：空白
   - `functionality_a = 1`、`functionality_b = 1`（每個環氧基與每個酚羥基各形成 1 個鍵）
   - `byproduct`、`bond_volume_change`、`bond_volume_change_unit`：空白
   - `should_react`、`should_not_react`：由你選擇（至少：環氧丙烷＋苯酚、BADGE＋雙酚 A 應反應；環氧丙烷＋乙醇、PGMEA＋苯酚不應反應）
   - 出處：`source_type = self`，`notes` 寫「反應 SMARTS 為自行撰寫（D22）；催化劑欄依使用者提供：純加熱、不需催化劑（2026-10-29）；未包含環氧自聚、二級羥基醚化等副反應」
   - `review_status = pending`
9. `npm test` 的資料表檢查必須全部通過（D22 第 2 步）。

### D. 交聯第 0 層（`src/core/crosslink/`，純 TypeScript）

10. **官能基辨識**：對配方中每個成分（小分子，或聚合物的重複單元）執行官能基 SMARTS；聚合物排除涉及連接點 `*` 的匹配。結果：每個成分每種官能基的數量（小分子為每分子；聚合物為每重複單元，另以 DP 換算為每分子平均數量）。
11. **配對**：對每條反應規則，找出配方中所有可能的配對（成分 A 的 `group_a` 與成分 B 的 `group_b`，含 A＝B 的自反應），列出參與的成分與反應類型。不含任何反應官能基的成分（例如溶劑）列為「不參與反應」。
12. **網路判定**（每個配對，依每分子平均官能基數 f）：
    - 兩邊都是 f ≥ 2，且至少一邊 f > 2 → 網路
    - 兩邊都是 f = 2 → 鏈延長（線性）
    - 有一邊 f = 1 → 封端；若另一邊是聚合物 → 接枝
    - 整個配方的判定：任一配對為網路即為「可形成網路」
    - 在 `docs/DESIGN.md` 或報告寫明判定規則；這是依官能度的計數判定，不判斷反應會不會實際發生（D17）
13. **催化劑**：規則 `catalyst_required = none` → 顯示「不需催化劑」；需要催化劑但配方沒有 Catalyst/Initiator 類成分 → 警告（D26）。
14. **溫度**：規則沒有溫度資料 → 顯示「尚無文獻資料」。
15. 審核狀態：使用到 `review_status = pending` 的規則或官能基時，結果上標示「使用中的反應規則尚未經使用者審核」。

### E. 畫面

16. 新增「交聯」分頁（與「結構」「配方」並列，樣式同 D34）。讀取「配方」分頁目前的配方。
17. 第 0 層結果：
    - 配方判定（可形成網路／鏈延長／封端或接枝／無反應）
    - 每個反應配對：參與成分、反應類型（例如「環氧–酚羥基 開環加成」）、網路判定、催化劑、溫度
    - 不參與反應的成分
    - 可信度「直接計算」（依結構與規則的計數判定），模型名稱「反應規則表（交聯第 0 層）」，附統一備註
    - **依 D09，不顯示各成分的官能基數量與當量**
18. **反應原子標記（4.4）**：
    - 2D：每個參與反應的成分，用 RDKit 產生標記反應原子的結構圖（SVG），反應原子用 `theme.css` 中的強調色；聚合物顯示重複單元圖
    - 3D：小分子可在「結構」分頁的 3D 卡片切換「標記反應原子」；聚合物不提供 3D（D05）
    - 原子編號 1 起算，與 3D 畫面一致

### F. 測試（`tests/crosslink/`）

19. 官能基計數：苯酚 1、雙酚 A 2、S 2、BADGE 2、PGMEA 0；P 重複單元酚羥基 2、E 重複單元環氧基 1（排除 `*`）；酚羥基不重複計數。
20. 網路判定的各種情況（用手造的 f 值）：2＋2 鏈延長、2＋3 網路、1＋2 封端、1＋聚合物 接枝。
21. 測試體系：配方 4A（P＋E＋PGMEA）、4B（P＋E＋S＋PGMEA）的配對與判定；PGMEA 為不參與反應。
22. 以上只檢查程式依規則運作（D17）。

### G. Phase 4 驗證清單（第 0 層部分）

23. 寫腳本 `scripts/verification/phase4.ts`（`npm run verify:phase4`），輸出 `docs/verification/phase4-輸出.md`：
    - 本次使用的官能基與反應規則（含 SMARTS、出處、審核狀態）
    - 每個測試成分：官能基種類與數量（每分子或每重複單元，聚合物另列每分子平均數）、反應原子編號
    - 配方 4A、4B：配對、網路判定、不參與反應的成分
    - 開頭照抄：「以下為程式輸出，未經化學判斷。請使用者檢查官能基辨識、反應規則與判定是否合理（D17）。官能基數量只列在本文件供核對，網站上不顯示（D09）。」
    - 任務 017 會在同一份文件加入第 1 層，腳本請設計成可擴充
24. 新增 `docs/verification/phase4-使用者檢查.md`（標題與「待使用者填寫」）。

### H. 檢查、提交、推送

25. 依序執行 `npm run typecheck`、`npm test`、`npm run build`，全部通過。
26. 提交（訊息：`官能基與反應規則、交聯第 0 層、反應原子標記（任務 016）`），推送方式依 `AGENTS.md`。測試時啟動的背景伺服器，結束前自己關閉。

## 不可更動的檔案或規則

- 官能基 SMARTS 不得憑記憶寫；只能照抄來源並加原子映射編號
- 反應規則只加 `epoxy+phenol` 一列；不加副反應
- 網站上不得顯示官能基數量、當量、分子量（D09）
- 不計算當量比、凝膠點、交聯密度（任務 017）
- 不提供聚合物 3D（D05）
- 不安裝新套件
- 不得修改 CheMScutter 與 `moleform-handoff`；不得修改 git 或認證設定；不得 force push

## 完成標準（可檢查）

- [ ] `npm run typecheck`、`npm test`、`npm run build` 全部通過（含資料表的 SMARTS 正反例檢查）
- [ ] 官能基兩列的 SMARTS 與來源原文一致（報告貼出原文與加了映射的版本）
- [ ] `docs/verification/phase4-輸出.md` 含第 0 層內容
- [ ] 推送成功

## 完成後請做

1. `docs/PLAN.md` 的 4.1–4.4 **先不要勾**，等使用者審核規則並在瀏覽器確認
2. 新增 `docs/reports/016-結果.md`：
   - 新增與修改的檔案
   - 兩個官能基 SMARTS 的來源原文、讀取方式、加映射後的版本
   - 自行撰寫的反應 SMARTS 與說明
   - 測試與建置結果
   - **請使用者審核的項目**：兩個官能基 SMARTS 與測試分子、反應 SMARTS、`docs/verification/phase4-輸出.md` 的官能基數量與判定
   - **請使用者在瀏覽器確認的清單**：在配方頁建立 4A、4B 後到「交聯」分頁看判定；2D 標記的反應原子；小分子（例如 S）的 3D 標記；PGMEA 為不參與反應；「規則尚未審核」標示
   - 遇到的問題、需要使用者決定的事
3. 報告一併提交並推送

## 需要先問使用者的情況

- 讀不到 Daylight 文件或 RDKit 的 `FragmentDescriptors.csv`
- 原文 SMARTS 無法在 RDKit.js 中解析，或無法通過正反例（不要自行改寫條件）
- 推送卡住或失敗
- 任務內容與 `docs/DECISIONS.md` 衝突
