# 任務 P6A 結果：混合密度、混合介電常數、共聚比例掃描（PLAN 6.7 剩餘）

日期：2026-11-16　執行：Claude Code　只寫 Python，沒有改 `src/`、既有 Python 模組與黃金檔；不接介面。

## 做了什麼

- `engine/moleform_core/mixing.py`（新）＋ `engine/moleform_engine.py` 三個 `POST`（僅 127.0.0.1）：
  - `/mixture-density`：`1/ρ_mix = Σ(w_i/ρ_i)`；密度可傳入或由 SMILES 呼叫 `vm.py`。
  - `/mixture-dielectric`：Wiener 上界、下界與 Lichtenecker `ln ε = Σφ ln ε`；ε 可傳入或由 SMILES 呼叫 `dielectric.py`；也接受質量分率＋密度換算。
  - `/copolymer-scan`：單元 A 莫耳分率網格（預設 0–1 每 0.1），每列輸出 Tg、密度、ε、自由體積。
- 缺值（沒有密度或 ε、小分子液體、表缺基團）一律 `status = missing` 並列出缺項與原因，不猜；掃描某欄缺基團只該欄標 missing，其餘照出。加總用明確迴圈。
- `docs/MODELS.md` 新增三個條目（出處「待使用者審」）；`docs/PLAN.md` 6.7 補註並勾選。
- 測試 `engine/tests/test_mixing_unit.py`（10 個）：手算密度、單一成分、上下界順序、缺值、掃描端點與現有模組逐位相同。未做反向驗證與邊界探針。

## 你已決定的事（開工時詢問）

現有模組沒有共聚物 Tg／密度／ε 的做法。你選了：Tg 用 `fox_mix` 混兩個單元均聚物 Tg（w ∝ x·M）；密度與 ε 用莫耳分率加權基團和（密度 = Σx·M ÷ Σx·Vm；ε = (Σx·P_V ÷ Σx·M)²）；自由體積沿用現有加權。這三項是組合用法，非書中公式，已在 MODELS.md 標註待審。

## 需要你決定／注意

1. 掃描的 ε 只算主要值（式 11.8），沒有次要值（式 11.7）。
2. 掃描端點（x = 0、1）只用單一單元，結果與單獨呼叫現有模組逐位相同；Fox 只在兩單元都有 Tg 時才算。
3. 混合密度與混合 ε 的分率合計容差為 1e-6，超過回 400。

## 驗證

本機：引擎 pytest 9061 passed（原 9051＋新增 10）；`npm run typecheck` 通過。TypeScript 測試與建置交給 CI（結果見下方）。

## CI

（push 後補記）
