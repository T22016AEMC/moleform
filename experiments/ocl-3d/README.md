# experiments/ocl-3d

任務 005 的暫時測試資料夾：測試 `openchemlib`（OpenChemLib JS）的 3D 能力，並與 `@rdkit/rdkit` 2026.9.1 對照原子編號。不是正式專案骨架，不要接入正式程式碼。

## 執行

在這個資料夾內（PowerShell）：

```
npm install; npm run test3d
```

只想重跑腳本時：`npm run test3d`（等同 `node run.mjs`）。

結果寫到 `output/`：`results.json`、每個分子的 3D MOL／SDF（`*_3D_etkdg-like.*` 為初始構象、`*_3D_mmff94.*` 為 MMFF94 最佳化後、`*_conformers_mmff94.sdf` 為多構象與能量）。詳細解讀見 `docs/reports/005-結果.md`。
