# 任務 P8-2：黏度、表面張力、界面與潤濕（PLAN 8.4、8.5、8.6、8.7）

編號：P8-2
建立日期：2026-11-19
指派給：Claude Code

## 目標

Phase 8 第二張。依 D64：相關功能一次建完、驗證一次、報告一頁。直接寫在 Python（D62）。全部式子與常數只用書上有的；書沒有的不補，輸出 `missing` 並寫明原因。

- 8.4 溶劑與混合溶劑黏度（溫度依賴）
- 8.5 聚合物溶液黏度（極限黏度數、Mark–Houwink、濃溶液）
- 8.6 表面張力（Parachor；溫度依賴）
- 8.7 界面張力與潤濕（Young、Owens–Wendt、鋪展係數）

## 前置條件（先讀這些）

- `docs/DECISIONS.md` 的 D02、D18、D22、D49、D62、D64、D72；`docs/DATA.md`；`docs/MODELS.md`
- `docs/reports/P8-1-結果.md`；`src/data/solvents.csv`（黏度、表面張力、密度欄位已有，部分空白）；引擎 `vm.py`、`hsp` 相關模組（沿用 `value/unit/source/status` 輸出格式）
- 書 `docs/references/vanKrevelen-teNijenhuis-2009-Properties-of-Polymers-4ed.pdf`：
  - 第 8 章：§8.2.3 與 Table 8.1（Parachor，式 8.4、8.5）；Table 8.2–8.5（聚合物表面張力與溫度、分子量依賴）；§8.2.4（Young 式 8.6、鋪展係數、Zisman）；式 8.20–8.23 與 Table 8.6（液體力分量）、Table 8.7、Table 8.8（聚合物表面能分量）；Example 8.4
  - 第 9 章：§9.3（式 9.32–9.42 Mark–Houwink、Θ 條件、Table 9.3 的 J 基團、Table 9.4）
  - 第 15 章式 15.32、第 16 章 §16.3（式 16.15a Andrade、式 16.21 濃溶液）
- 不要搜尋整個專案

## 要做的事

**一、先讀原文確認（只做一次，結果寫進報告）**

1. 書中**有沒有**溶劑混合物黏度的混合規則：用關鍵字（mixture、blend、mixing rule 加 viscosity）搜第 8、9、15、16 章與索引。注意：§8.2.2 的 Grunberg–Nissan 式 8.3 是表面張力的內聚功，不是混合黏度式，不可挪用。找不到就**不實作混合黏度**，`/viscosity` 對混合溶劑回 `missing`，原因寫「書中無溶劑混合黏度式；待使用者指定出處」。找到就依原文實作並標式號。
2. 書中表面張力的混合規則：同樣先查，找不到則混合溶劑表面張力回 `missing`。
3. Table 8.1 三欄（Sugden、Mumford–Phillips、Quayle）的單位為 (mN/m)^(1/4)·(cm³/mol)；各基團的環與雙鍵修正以原文為準。

**二、8.4 溶劑黏度與溫度依賴**

4. 純溶劑黏度取自 `solvents.csv`（含溫度與來源，空白維持 `missing`）。溫度依賴用書式 16.15a（Andrade：η＝B·exp(Eη/RT)）：要使用者給兩個溫度的黏度，或 B 與 Eη；書只給「多數溶劑 Eη 在 7–14 kJ/mol」這個範圍，**不當預設值**，只能作為範圍檢查的提示（超出範圍給 `assumed` 警示）。只有一個溫度的資料時不外推，回 `missing`。
5. 端點 `POST /viscosity`，輸出 `value/unit/source/status`。

**三、8.5 聚合物溶液黏度（Python）**

6. **Θ 條件極限黏度數**：依式 9.42（J＝K_Θ·M^½ − 4.2Z）與 Table 9.3 基團貢獻 J，為聚合物重複單元算 K_Θ，再由 [η]_Θ＝K_Θ·M^½（式 9.34）給定分子量下的 [η]。Z（每結構單元主鏈原子數）沿用既有主鏈判定；Table 9.3 沒有的基團回報缺基團，括號內的值（書標為不確定）輸出狀態標 `predicted` 並在 `note` 註明「書中以括號標示，可信度較低」。
7. **Mark–Houwink**（式 9.32、9.33）：K 與 a 一律由使用者輸入，附來源與溫度、溶劑；**不內建任何 K、a**（書的 §9.3 沒有給 K、a 表的部分不補）。使用者未輸入時回 `missing`。a 的範圍提示依書原文（Θ 條件 a＝½、剛棒 a＝2）。
8. **含 B 項**（式 9.38、9.39）：使用者給 B 時才算。
9. **濃溶液**（式 16.21：η_sp＝K·c^5.4·M^3.4）：形式是經驗結果，K 由使用者輸入；沒有 K 時只輸出「指數關係」說明，不給黏度值。
10. 凡書給的是特定系統的實驗圖（例如 PVC–環己酮）的，不當通用公式。

**四、8.6 表面張力（Parachor）**

11. 純液體與聚合物重複單元：Parachor P_S 由 Table 8.1 的基團加總（分別提供 Sugden、Mumford–Phillips、Quayle 三組結果，**預設列三組的範圍，不挑一組當「正確」**），γ＝(P_S/V)^4（式 8.5）。V 用既有模組：聚合物用 `vm.py`、溶劑用 `solvents.csv` 的密度與分子量。環與雙鍵修正依 Table 8.1，缺基團回報缺基團。
12. 溫度依賴：書說 P_S 近似不隨溫度變，所以不同溫度用該溫度的 V（需有該溫度密度，否則 `missing`）重算 γ；另外把書 Table 8.3 的 dγ/dT 數據列為「文獻對照」，不拿來外推別的聚合物。
13. 端點 `POST /surface-tension`。

**五、8.7 界面張力與潤濕（Python）**

14. **資料表新增 `src/data/surface_energy.csv`**：欄位含物質名稱、SMILES 或聚合物名稱、種類（liquid／polymer）、γ、γd、γp、單位、溫度、來源（書的表號與頁）、`review_status` 為 `pending`。資料只抄書：液體取 Table 8.6（14 種）、聚合物取 Table 8.7 與 Table 8.8；括號內數值（書標為估計）保留並在 `note` 標「書中括號值」；`gc`（臨界表面張力）另列一欄。看不清的值回報而不猜。
15. **Owens–Wendt**（式 8.22）：由兩物質的 γd、γp 算界面張力 γ12；**接觸角**（式 8.23）：用已知 γd、γp 的固體與液體，算 cosθ 與 θ（cosθ 超出 [−1, 1] 時，>1 輸出為完全潤濕、<−1 回 `missing` 並說明）。**Young 式**（式 8.6）與鋪展係數 S＝γLV＋γSL−γSV 一併輸出，鋪展係數＜0 時依書原文的意義標示「不鋪展／完全潤濕」的判斷方向（先讀原文，不自行反向）。
16. Zisman 的 γcr 只作為資料顯示（Table 8.7 的 gc 欄），不另做擬合。
17. 若溶劑不在 Table 8.6 內（沒有 γd、γp）：**不補**，該溶劑的 Owens–Wendt 輸出 `missing`；但其表面張力（來自 `solvents.csv` 的 γ 與 Parachor 計算）仍可顯示並用於 Young 式的 γLV。
18. 端點 `POST /interfacial`、`POST /wetting`。

**六、介面**

19. 在配方結果區新增兩張卡：「黏度」（溶劑與混合溶劑溫度依賴、聚合物溶液 [η]）與「表面與潤濕」（表面張力 Parachor 範圍、選一個聚合物與一種液體顯示 γ12、θ、S）。缺值一律顯示「資料不足」與原因，不給空白數字。可用既有卡片元件，不改版面。
20. 卡片上寫明「參考趨勢，非定量保證；書公式預估誤差見 MODELS.md」；不用中英對照術語混寫，英文式名放括號即可。

**七、文件與驗證**

21. `docs/MODELS.md` 新增條目（式、式號、單位、適用、限制、出處「待使用者審」）；`docs/DECISIONS.md` 只在有新決定（例如混合黏度書中無式）時新增，先 `git diff` 確認，**只用描述式編輯，不整份覆寫**；`docs/PLAN.md` 8.4–8.7 補註並依實際勾選（做不到的子項不要勾，寫原因）。
22. **驗證（全部完成後只做一次，用書算例）**：Table 8.2 的聚合物表面張力 calculated 對 experimental 欄（能算幾列算幾列，列出差異，不調參）；Example 8.4（Owens 的算例）；Table 9.4 的 K_Θ calculated 對 literature（能算幾列算幾列）。與書不符處照實記錄，不改公式也不調係數。
23. 最少的單元測試：端點可用、缺基團回報、Mark–Houwink 缺 K 時 `missing`、單一溫度黏度不外推、Parachor 手算一例（附算式）、Owens–Wendt 手算一例（附算式）。不做反向驗證與邊界探針。
24. 報告 `docs/reports/P8-2-結果.md`，限一頁：步驟一的查證結果（混合黏度與混合表面張力有沒有書上的式）、`surface_energy.csv` 筆數與空欄、書算例對照結論、哪些子項因書沒有而回 `missing`。
25. 本機只跑本卡新增測試、引擎 pytest、型別檢查；全部 TypeScript 測試與建置交給 CI。新增測試字串一律用雙引號。新增或修改 `src/data/` 後先重產黃金檔（只允許新增、舊值不變）。**盡量一次 push 完成，不要分多次小推送；push 後 CI 三個 job（build、engine、golden-fresh）逐一確認。**

## 不可更動的檔案或規則

- 不修改既有計算模組、既有資料表內容、黃金檔內容（除新增項目）、既有測試、既有 CI job；不新增套件
- 不使用記憶中的數值或公式；每個資料列要有書的表號；`review_status` 一律 `pending`；實測值不進計算（D02）；引擎只在 127.0.0.1
- 不內建 Mark–Houwink 的 K、a；不自訂混合規則；不挑 Parachor 三組中的一組當唯一答案

## 完成標準（可檢查）

- [ ] 步驟一查證結果已寫入報告；混合黏度、混合表面張力依查證結果實作或回 `missing`
- [ ] `/viscosity`、`/surface-tension`、`/interfacial`、`/wetting` 可用，缺值行為正確；兩張卡片可顯示
- [ ] `surface_energy.csv` 每列有表號出處且 pending
- [ ] 書算例對照完成；MODELS.md、PLAN.md 已更新；測試通過；CI 三個 job 逐一確認；已 commit 與 push

## 需要先問使用者的情況

- 書的 Table 8.1、8.6–8.8、9.3 的數值無法可靠讀出
- 書算例對照有無法解釋的不符
- 步驟一發現書有混合規則但原文含糊
- 任務與 `docs/DECISIONS.md` 衝突
