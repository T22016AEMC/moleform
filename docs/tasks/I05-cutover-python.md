# 任務 I05：介面切換到 Python 引擎，退役 TypeScript 計算（補 PLAN 6A.3 的第二步）

編號：I05
建立日期：2026-11-17
指派給：Claude Code

## 目標

PLAN 6A.3 的規則是：Python 版與 TypeScript 輸出逐位相同後，**停用 TypeScript 版**，過渡期用開關切換、預設 TypeScript。搬遷卡 M00–M05 完成了「Python 版逐位相同」，但沒有任何一張卡完成「切換與停用」：目前物性面板（I01）已接引擎，**交聯頁與其他計算仍走 TypeScript**，造成規則、不支援清單、golden 檔要兩邊各改一份。本卡補完第二步。依 D64：一次做完、驗證一次、報告一頁。

## 前置條件（先讀這些）

- `docs/PLAN.md` 的 6A.3、6A.4 與補註；`docs/DECISIONS.md` 的 D62、D64；`docs/reports/039a-結果.md`（搬遷盤點：哪些模組、對應的 TypeScript 與 Python 檔案）、`docs/reports/I01-結果.md`（介面接引擎的做法與橋接白名單）、`docs/reports/M05-結果.md`、`docs/reports/P7-1A-結果.md`
- `docs/migration-known-issues.md`（K01–K07、D01–D05、P01–P03：TypeScript 與 Python 已知差異與怪行為）
- 不要搜尋整個專案

## 要做的事

1. **盤點（先做，結果寫進報告）**：用一張表列出目前介面仍呼叫的每個 TypeScript 計算模組，欄位：模組、介面哪裡用到、Python 對應端點、是否已逐位驗證（黃金檔）、**分類**：
   - A 類：Python 已有對應且已驗證 → 本卡切換；
   - B 類：「即時輸入回饋」的小計算（打字時立即更新，若改走引擎會有延遲或需要引擎在線）→ 保留 TypeScript，並說明理由（6A 補註允許）；
   - C 類：Python 沒有對應或未驗證 → 不切換，列出缺什麼。
2. **切換**：A 類模組讓介面改呼叫引擎（沿用 I01 的橋接與白名單，不重做設計）；引擎不可用時的畫面行為沿用 I01（顯示原因，不靜默退回 TypeScript）。交聯第 0、1 層（交聯頁、配方計算中呼叫它們處）是本卡必須切換的重點。
3. **退役**：A 類切換完成後，刪除已無介面呼叫的 TypeScript 計算程式碼；但**黃金檔匯出腳本（`scripts/golden/export-*.ts`）仍需用 TypeScript 版當基準時，該部分保留並標註為「黃金基準，不供介面使用」**，直到使用者決定凍結黃金檔（不要自行刪除或改動黃金檔）。同步移除只為雙份維護而存在的程式（例如 TypeScript 側的不支援清單守衛，若切換後已無介面路徑會走到）。
4. **已知差異**：`docs/migration-known-issues.md` 的 TypeScript 與 Python 差異（K06、K07 等），在 TypeScript 退役後，**只列出「現在可以只在 Python 修正」的項目與影響範圍，不在本卡修正**（修正會改輸出，需另卡與使用者決定）。
5. **驗證（一次）**：型別檢查；引擎 pytest；介面層既有測試（改呼叫引擎的部分若需引擎在線，用既有的測試引擎方式，不新增新機制）；人工等價檢查一次：用 `docs/verification/` 現有的代表配方（至少含環氧＋酚醛 4A、4B）在切換前後各取一次交聯頁輸出，逐項比對（舊 TypeScript 輸出可用 git 上一版建置或黃金檔取得），**只允許文字格式差異，數值必須相同**；有數值差異就停下來回報，不要調整。不做反向驗證與邊界探針。
6. 桌面版確認：`npm run desktop:build` 建置成功，離線（引擎內嵌）下交聯頁可用，沿用 I02 的 `--selftest=sample` 一次即可；不重做安裝與解除安裝測試。
7. 文件：`docs/PLAN.md` 6A.3 補註「第二步完成於 I05」並寫明保留 TypeScript 的 B 類模組清單；`docs/MODELS.md`、`docs/DESIGN.md` 若有「計算在 TypeScript」的敘述則更新。報告 `docs/reports/I05-結果.md`，限一頁：盤點表、切換與退役了哪些、保留的 B 類與理由、C 類缺什麼、現在可只在 Python 修正的已知差異、需要使用者決定的事。
8. 本機只跑本卡需要的檢查、型別檢查、引擎 pytest、`npm run desktop:build`；全部 TypeScript 測試與建置交給 CI。新增測試字串一律用雙引號；**若動到 `src/data/` 或黃金檔相關檔案，先檢查並重產所有受影響的 golden 檔再 push**。commit、push，用 PowerShell 查一次 CI。

## 不可更動的檔案或規則

- 不修改 Python 計算公式、資料表內容、黃金檔內容（只允許退役已無人使用的 TypeScript 計算程式碼）、既有 CI job；不新增套件
- 不改變任何計算結果；引擎只在 127.0.0.1；不使用記憶中的數值

## 完成標準（可檢查）

- [ ] 盤點表完成；A 類全部切換到引擎，交聯頁走 Python
- [ ] 已無介面路徑使用的 TypeScript 計算已刪除，黃金基準相關保留並標註
- [ ] 代表配方切換前後數值相同；`--selftest=sample` 通過；CI 通過；已 commit 與 push

## 需要先問使用者的情況

- 切換前後有數值差異
- 某個 A 類模組切換後延遲明顯影響操作（需決定改列 B 類）
- 任務與 `docs/DECISIONS.md` 或 PLAN 6A.3 的規則衝突
