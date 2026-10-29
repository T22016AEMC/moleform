# experiments/rdkit-3d

任務 001 的暫時測試資料夾：測試官方 `@rdkit/rdkit`（2026.9.1，RDKit_minimal）的 3D 能力。不是正式專案骨架，不要接入正式程式碼。

## 執行

在這個資料夾內（PowerShell）：

```
npm install; npm run test3d
```

（只想重跑腳本時：`npm run test3d`，等同 `node run.js`。）

結果寫到 `output/`：`results.json` 與兩個分子的 MOL／SDF（目前只有 2D 座標，見 `docs/reports/001-結果.md`）。
