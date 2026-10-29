# docs/verification — 使用者驗證清單

每個 Phase 結束時，這個資料夾放一份**程式輸出**給使用者檢查化學結果是否合理。內容只有程式算出的數字，不附文獻參考值，也不判斷「正常／異常」；判斷由使用者依文獻或經驗進行（DECISIONS D17）。

## 檔案

| 檔案 | 內容 |
|---|---|
| `phase2-輸出.md` | Phase 2：8 個分子（乙醇、環氧丙烷、苯酚、雙酚 A、BADGE、L-丙胺酸、反式 2-丁烯、BF₃）的 canonical SMILES、驗證結果、構象數、是否經力場最佳化、各鍵型的鍵長範圍、環氧環鍵角 |

## 重新產生

在專案根目錄執行：

```powershell
npm run verify:phase2
```

腳本是 `scripts/verification/phase2.mjs`。它用 Node 載入與網站相同的程式碼（`src/core/`），3D 計算的種子固定為 42、要求 5 個構象，所以重複執行結果相同。程式、OpenChemLib 或 RDKit 版本改變後請重新產生並一併提交。

## 新增下一個 Phase 的清單

仿照 `scripts/verification/phase2.mjs` 新增腳本與 npm script，輸出放在本資料夾，並維持「只放程式輸出」的規則。
