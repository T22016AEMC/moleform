# docs/verification — 使用者驗證清單

每個 Phase 結束時，這個資料夾放一份**程式輸出**給使用者檢查化學結果是否合理。內容只有程式算出的數字，不附文獻參考值，也不判斷「正常／異常」；判斷由使用者依文獻或經驗進行（DECISIONS D17）。

## 檔案

| 檔案 | 內容 |
|---|---|
| `phase2-輸出.md` | Phase 2：8 個分子（乙醇、環氧丙烷、苯酚、雙酚 A、BADGE、L-丙胺酸、反式 2-丁烯、BF₃）的 canonical SMILES、驗證結果、構象數、是否經力場最佳化、各鍵型的鍵長範圍、環氧環鍵角 |
| `phase3-輸出.md` | Phase 3：5 個示範配方（BADGE／雙酚 A／三苯基膦／溶劑）的輸入、各成分的平均分子量（僅此處列出，供手算 mol%；網站不顯示，D09）、全部換算結果、錯誤與警告 |
| `phase4-輸出.md` | Phase 4：本次使用的官能基與反應規則（SMARTS、出處、審核狀態）、測試成分的官能基種類與數量（聚合物另列每分子平均）與反應原子編號、配方 4A／4B 的配對與網路判定（第 0 層；官能基數量只列在此，網站不顯示，D09） |
| `phase5-輸出.md` | Phase 5：測試成分 P、E、S 與骨架範本 BT01～BT06 的單元質量、端基質量、反應官能基數、官能基當量（每重複單元與每鏈兩種基準）、n = 0 分子與 Mn 500／3000 下的每鏈官能基數與低分子量近似，以及四項手算核對（官能基當量只列在此，網站不顯示，D09） |
| `phase6-Tg-輸出.md` | Phase 6（任務 026）：測試成分與骨架範本單元的 van Krevelen 基團切分、ΣYgi、ΣMi、Tg（缺基團者列出原子位置），以及 12 個聚合物與書中計算值的對照（分子量只列在此，D09）。重新產生：`npm run verify:phase6-tg` |
| `phase6-TbTf-輸出.md` | Phase 6（任務 027）：論文的適用限制與誤差、小分子（單體、固化劑、溶劑、SBI、環氧氯丙烷等）的 Joback 基團切分、Tb、Tf（K 與 °C），缺基團者列出原子位置；聚合物重複單元列為不適用。重新產生：`npm run verify:phase6-tbtf` |
| `phase6-VW-TPSA-LogP-輸出.md` | Phase 6（任務 028）：小分子、聚合物重複單元、環氧單元與骨架範本 BT01–BT06 單元的 van der Waals 體積 VW（Table 4.2 基團增量）、TPSA（Ertl 2000）、Crippen LogP（Wildman–Crippen 1999）；VW 缺基團者列出原子位置與原因，聚合物單元的 TPSA、LogP 以甲基封端計算並標示「以甲基封端的單元估算；LogP 僅供相對比較」。重新產生：`npm run verify:phase6-vw-tpsa-logp` |
| `phase6-Vm-密度-輸出.md` | Phase 6（任務 029）：聚合物重複單元、環氧單元與骨架範本 BT01–BT06 單元的莫耳體積與密度（Table 4.10 的 Va 與 Vc；玻璃態／橡膠態／結晶，298 K 狀態依 Tg 判斷，Tg 算不出來標「狀態未定」），缺基團者列出原子位置與原因，括號值標示；小分子標「液體法未實作」（待 Fedors 1974）；另列 11 個書中聚合物。重新產生：`npm run verify:phase6-vm` |
| `phase5-使用者檢查.md` | Phase 5.7：任務 020～024 後續累積的瀏覽器確認清單（表格，結果與備註欄由使用者填寫，不會被腳本覆蓋） |
| `phase4-使用者檢查.md` | 使用者對 Phase 4 輸出的檢查結果（手寫記錄） |
| `phase3-使用者檢查.md` | 使用者對 Phase 3 輸出的檢查結果（手寫記錄） |
| `phase2-使用者檢查.md` | 使用者對上述輸出的檢查結果（手寫記錄，不會被腳本覆蓋） |

## 重新產生

在專案根目錄執行：

```powershell
npm run verify:phase2
```

Phase 3 用 `npm run verify:phase3`（腳本 `scripts/verification/phase3.ts`，Node 直接執行 TypeScript）；Phase 4 用 `npm run verify:phase4`（腳本 `scripts/verification/phase4.ts`，第 1 層加入後會寫進同一份輸出）。

Phase 5 用 `npm run verify:phase5`（腳本 `scripts/verification/phase5.ts`）；只列計算值與手算核對，第 1 層結果不重複列出（見 `phase4-輸出.md`）。

Phase 2 的腳本是 `scripts/verification/phase2.mjs`。它用 Node 載入與網站相同的程式碼（`src/core/`），3D 計算的種子固定為 42、要求 5 個構象，所以重複執行結果相同。程式、OpenChemLib 或 RDKit 版本改變後請重新產生並一併提交。

## 任務 030 診斷輸出（不是 Phase 驗證）

任務 030（缺基團近似拆解與幾何 VW 可行性）的診斷腳本放在 `scripts/diagnosis/`（拋棄式，不進 `src`、不進建置，沒有 npm script），用 `node scripts/diagnosis/<檔名>.ts` 執行：`030-a0-semi-check.ts`、`030-a-missing-groups.ts`、`030-c-decomposition-errors.ts`、`030-d-geometric-vw.ts`（約 2 分鐘）。輸出在本資料夾：`030-診斷-A0-半導體SMILES檢查.md`、`030-診斷-A-缺基團-輸出.md`、`030-診斷-C-拆解誤差-輸出.md`、`030-診斷-D-幾何VW-輸出.md`。報告見 `docs/reports/030-結果.md`。

## 任務 031 補收驗證輸出

`docs/verification/031-補收驗證-輸出.md`：補收書中現成整體基團前後的差異表（使用者材料與 D53 半導體材料）、書中聚合物對照、PMDA–ODA 與 BPDA–PDA。用 `npm run verify:031` 產生（腳本 `scripts/verification/031-補收驗證.ts`；「補收前」讀 git 3536540 的資料表）。

## 新增下一個 Phase 的清單

仿照 `scripts/verification/phase2.mjs` 新增腳本與 npm script，輸出放在本資料夾，並維持「只放程式輸出」的規則。
