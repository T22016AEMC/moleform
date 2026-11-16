# 任務 P6A：混合密度、混合介電常數、共聚比例掃描（PLAN 6.7 剩餘，直接寫在 Python）

編號：P6A
建立日期：2026-11-16
指派給：Claude Code

## 目標

6.7 剩餘三項：混合密度、混合介電常數、共聚比例影響。依 D62（6A.2 後新計算模組直接寫在 Python），**只寫 Python，不寫 TypeScript，不接介面**。依 D64：一次做完、驗證一次、報告一頁。

## 前置條件（先讀這些）

- `docs/reports/M05-結果.md`、`docs/migration-known-issues.md`（只看 D04 的輸入契約）、`docs/DECISIONS.md` 的 D22、D56、D64
- `engine/moleform_core/` 現有模組的函式簽名：`vm.py`（密度）、`dielectric.py`、`tg_mixing.py`、`copolymer.py`、`free_volume.py`；`docs/MODELS.md`（只看格式）
- 不要搜尋整個專案

## 要做的事

1. **混合密度** `POST /mixture-density`：輸入成分清單，每個成分有質量分率與密度（呼叫端傳入，或以 SMILES 呼叫現有 `vm.py` 取得）。公式：理想體積加成（無過量體積）`1/ρ_mix = Σ(w_i/ρ_i)`，加總用明確迴圈。成分缺密度（含小分子液體，Fedors 尚未收錄）→ 該成分列入 `missing`，不猜值；任一成分缺則整體 status 為 `missing` 並說明。狀態 `predicted`，備註「理想混合，未含過量體積」。
2. **混合介電常數** `POST /mixture-dielectric`：輸入成分清單，每個成分有體積分率（或質量分率加密度換算）與介電常數（呼叫端傳入，或以 SMILES 呼叫現有 `dielectric.py`）。輸出三個值：Wiener 並聯上界、Wiener 串聯下界、Lichtenecker 對數混合 `ln ε = Σ φ_i ln ε_i` 作為估計值。缺任一成分的 ε 則回報缺項。狀態 `predicted`，備註「參考趨勢，非精確值」。
3. **共聚比例掃描** `POST /copolymer-scan`：輸入兩個單元（SMILES 含 `*`）與莫耳分率網格（預設 0 到 1 每 0.1，包含兩端），對每個比例呼叫**現有**的 Python 模組取得 Tg（沿用現有的共聚物 Tg 做法，由你依現有 `tg_mixing.py` 與 `copolymer.py` 判斷；不得新發明 Tg 公式）、密度、介電常數、自由體積，輸出表格；某項算不出（缺基團）就在該欄標 `missing`，其餘照出。
4. **公式來源（D22）**：上述公式為標準混合法則，本卡不憑記憶補文獻；在 `docs/MODELS.md` 新增三個條目，格式照現有，公式、適用條件、限制寫清楚，出處欄標「待使用者審」。
5. **測試**：這三項是新公式、沒有 TS 版可比。只寫最少的單元測試：（a）兩成分混合密度與手算值相符；（b）單一成分混合等於該成分；（c）Wiener 上界 ≥ Lichtenecker ≥ Wiener 下界；（d）缺值回報 `missing`；（e）掃描端點（0 與 1）與單獨呼叫現有模組的結果相同。不做反向驗證、不加邊界探針。
6. 報告 `docs/reports/P6A-結果.md`，限一頁。把 `docs/PLAN.md` 6.7 的「混合密度、混合介電常數、共聚比例影響」補註完成並依實際勾選 6.7（Fox／Gordon–Taylor Tg、相對 Tg 已於先前完成）。
7. 本機只跑本卡新增的單元測試與引擎 pytest、型別檢查；全部 TypeScript 測試與建置交給 CI。commit、push，只查一次 CI。

## 不可更動的檔案或規則

- 不修改 `src/`、既有 Python 模組的行為與黃金檔；不接介面，不做切換
- 不新增文獻數值，不使用記憶中的數值；不更改已定案決定
- 引擎只在 127.0.0.1 內部連線；測試後不要留下背景程式

## 完成標準（可檢查）

- [ ] 三個端點可用，單元測試通過，缺值一律回報 `missing`
- [ ] `docs/MODELS.md` 有三個條目；PLAN 6.7 已補註
- [ ] 型別檢查、引擎 pytest 通過；CI 通過；已 commit 與 push

## 需要先問使用者的情況

- 現有模組沒有可用於共聚物 Tg 的做法，需要新的 Tg 公式才能做掃描
- 任務與 `docs/DECISIONS.md` 衝突
