# 任務 005：測試 OpenChemLib JS 的 3D 能力

編號：005
建立日期：2026-10-29
指派給：Codex／Claude Code

## 目標

任務 001 確認官方 RDKit.js 沒有 3D 功能。本任務測試另一個可在瀏覽器執行的開源函式庫 **OpenChemLib JS**（npm 套件 `openchemlib`，其文件列有 `ConformerGenerator` 與 `ForceFieldMMFF94`）能否補上 MoleForm 單體與小分子的 3D 需求，並確認它和 RDKit.js 搭配時原子編號能否對應。結果用來讓使用者決定架構（DECISIONS P01）。**本任務只產出測試腳本與報告，不建立正式專案骨架。**

## 前置條件（先讀這些）

- `AGENTS.md`
- `docs/DECISIONS.md`（特別是 P01、D20、D21、D23、D24）
- `docs/KNOWN_ISSUES.md`（K01）
- `docs/reports/001-結果.md`
- `docs/tasks/001-inventory-3d-and-rdkit-test.md`（檢查項目沿用）

## 要做的事

1. 建立暫時測試資料夾 `experiments/ocl-3d/`，使用 **npm** 在該資料夾內安裝最新穩定版 `openchemlib`；為了第 4 點的對照，同資料夾也安裝 `@rdkit/rdkit` 2026.9.1。不要在專案根目錄建立 `package.json`。
2. 先讀 `openchemlib` 套件內的型別定義（`.d.ts`）與官方文件，確認實際 API 名稱，**不要憑記憶猜 API**。
3. 對下列分子執行測試並記錄結果：
   - 乙醇 `CCO`
   - 環氧丙烷 `CC1CO1`
   - 雙酚 A 二縮水甘油醚（BADGE）`CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1`（測試較大、可旋轉鍵較多的分子）
4. 逐項檢查（沿用任務 001 的 1–6 項，再加第 7、8 項）：
   1. 能否產生 3D 座標（z 不全為 0）
   2. 能否做 MMFF94（或 MMFF94s）最佳化；參數缺漏時有沒有退路（例如退到其他力場），沒有就寫「沒有退路」
   3. 能否產生多個構象並取得每個構象的能量（用來算相對能量）
   4. 能否輸出含 3D 座標的 MOL 與 SDF
   5. 能否取得鍵長、鍵角、二面角，或需要自行由座標計算
   6. 每項記錄：**支援／不支援／部分支援**、使用的 API 名稱；不支援就說明缺什麼
   7. **與 RDKit.js 的原子編號對應**：同一分子由 RDKit.js 輸出 molblock，交給 OpenChemLib 產生 3D 後，重原子的順序是否與 RDKit 相同？氫原子加在哪裡？若順序會變，說明怎麼取得對應關係。（Phase 4 要在 3D 上標記 RDKit 找到的反應原子，需要這個對應）
   8. **3D 顯示**：不要接入正式畫面；只記錄 OpenChemLib 本身是否有 3D 顯示元件。若沒有，列出可搭配的顯示函式庫候選與其授權（例如 3Dmol.js），**不要安裝**
5. 另外記錄：
   - `openchemlib` 版本與授權（從套件的 `package.json` 或 LICENSE 讀取），及其相依套件中有無 GPL 類授權
   - 套件大小（安裝後的主要檔案大小）
   - 初始化時間、每個分子產生 3D 與最佳化的耗時（大約值即可）
   - 同一分子重複執行，構象結果是否每次相同（是否可設定隨機種子）
6. 在 `experiments/ocl-3d/README.md` 寫明如何執行腳本（PowerShell 一行指令）。

## 不可更動的檔案或規則

- 不得更動基團貢獻參數表、反應規則表與模型公式
- 不得重新加入 `AGENTS.md` 列出的已取消項目（例如聚合物 3D）
- 測試腳本只放在 `experiments/ocl-3d/`，不要接入正式程式碼，不要建立 Vite／React 專案骨架
- 除 `openchemlib`、`@rdkit/rdkit` 外不安裝其他套件；若認為需要，先在報告中說明並問使用者
- 不得修改 `experiments/rdkit-3d/` 與 CheMScutter 的任何檔案
- 不得自行決定架構；報告只提出建議

## 完成標準（可檢查）

- [ ] 依 `experiments/ocl-3d/README.md` 的指令可以執行腳本，且不報錯（不支援的功能記錄為不支援，不讓腳本中斷）
- [ ] 若支援 3D，三個分子的 3D MOL 或 SDF 存在 `experiments/ocl-3d/output/`，且 z 座標不全為 0
- [ ] `docs/reports/005-結果.md` 中檢查項目 1–8 每項都有明確結果與 API 名稱
- [ ] 報告含第 5 點的版本、授權、大小、耗時、可重現性
- [ ] 報告最後有「對架構的建議」，至少比較這三個選項並寫優缺點，**由使用者決定**：
  - A：純前端，3D 降級（只做 2D）
  - D：純前端，RDKit.js 負責 2D／SMARTS／描述子，OpenChemLib JS 負責 3D
  - C：3D 另用 Python 服務（會牽動 D23、D24）

## 完成後請做

1. 在 `docs/PLAN.md` 的 Phase 0 最後新增一行 `- [x] 0.7 任務 005：測試 OpenChemLib JS 的 3D 能力`
2. 新增 `docs/reports/005-結果.md`，內容包含：
   - 改了哪些檔案
   - 測試結果（逐項）
   - 遇到的問題
   - 需要使用者決定的事
3. 把結論補進 `docs/KNOWN_ISSUES.md` 的 K01「狀態」欄（接在任務 001 的結論後面）

## 需要先問使用者的情況

- 安裝 `openchemlib` 失敗，或需要其他套件才能完成測試
- `openchemlib` 或其相依套件有 GPL 類授權
- 任務內容與 `docs/DECISIONS.md` 衝突
