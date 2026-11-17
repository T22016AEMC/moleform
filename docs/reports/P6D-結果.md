# 任務 P6D 結果：實測比對腳本擴充（混合配方 Tg、相對 Tg）

日期：2026-11-17　執行：Claude Code　只改比對腳本、模板、驗證清單說明與測試；計算、資料表、黃金檔、既有測試與 CI 都沒改。

## 做了什麼
- `engine/scripts/compare_measured.py` 三種模式，以「模式」欄區分（留白或沒有此欄 = `unit`，P6C 舊檔與輸出不變）：
  - `mixture`：每個成分一列、樣品名相同的列為同一配方；每列填成分名稱、SMILES、wt%（合計 100）、Mn、成分類別（選填）。呼叫 `/tg/mixing`，只送成分、wt%、Mn。
  - `relative`：每個成分一列，「角色」填 A／B；B 填「每 1 mol A 的莫耳數」；A 的 Tg 錨點填在 A 列（輸入，D61；留白由引擎 k／Tg 表帶出）；實測 Tg 是 B 的值。呼叫 `/relative-tg`。
  - 選「一個樣品多列」格式，因為兩個端點的輸入都是成分清單，這樣在 Excel 最好填、不需另開成分檔。
- 共通規則沿用 P6C：校準樣品不進驗證統計；各模式各自依材料家族統計；缺基團、缺 Mn、缺錨點、引擎 missing 的樣品列出原因、不算誤差；B 是 k／Tg 表內材料時引擎回表內值（非預測），不比對（D61）；實測值在預測完成後才相減，不進任何請求（D02）。
- `docs/verification/user-measured-template.csv`：三種模式各示範（unit 3 列、mixture 1 個配方 2 列、relative 1 組 2 列），備註皆標「示範，非實測」，數字為佔位值。`phase6-使用者驗證清單.md` 第 3 點改寫成三模式說明表。

## 測試
- 新增 3 個（`engine/tests/test_p6c_unit.py`）：mixture 呼叫且請求不含實測值、relative 的錨點是輸入且 B 實測值不進請求、校準不進統計與 missing 不算誤差。unit 沿用既有測試。
- 引擎 pytest 9087 通過（含新增 3 個）；模板以 `--include-demo` 跑過三種模式。TypeScript 測試與建置交給 CI。

## 需要你決定／注意
1. 模板示範的 relative 預測值落在 −199 °C（PMMA 改成乙酯、錨點佔位 100 °C），是引擎對佔位輸入的輸出，不代表合理；我沒有判斷或改動計算（D17）。
2. mixture 的小分子成分引擎不計 Tg（D56），只在訊息中標示；混合 Tg 只由聚合物成分算出。
3. CI 結果見 commit 後的回報。
