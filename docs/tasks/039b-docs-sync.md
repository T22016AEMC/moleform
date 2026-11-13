# 任務 039b：依 D62 同步 deploy.yml、AGENTS.md 與決定紀錄（任務 039 的後續）

編號：039b
建立日期：2026-11-13
指派給：Claude Code

## 目標

任務 039 完成後有三件事使用者已決定（2026-11-13）：（1）Python 引擎用內嵌方式打包；（2）deploy 暫停；（3）AGENTS.md 的技術堆疊依 D62 改寫。本卡只改文件與 CI 設定，不改程式。

## 前置條件（先讀這些）

- `docs/reports/039-結果.md`（尤其第「需要你決定」段）、`docs/DECISIONS.md` 的 D62
- `AGENTS.md`、`.github/workflows/`（只讀 deploy 相關的檔案）、`docs/PLAN.md` 的 Phase 6A

## 要做的事

1. **deploy 暫停**：在 `.github/workflows/` 的 deploy 設定中，停用部署到 GitHub Pages 的步驟（以最小改動，例如整個 deploy job 加上不會執行的條件，並在檔案內加註解「暫停：D62，本機版不以部署為目標」）；**build、型別檢查、全部測試的 job 不得更動**。不要刪除 deploy 的內容。
2. **AGENTS.md**：找出與 D62 衝突的段落（例如「純前端、不得加入伺服器或 Python 執行環境」），依 D62 改寫為：介面與桌面外殼為 TypeScript（Electron），計算引擎最終在 Python（只在本機以 127.0.0.1 內部連線，不對外、不連外網）；其餘規則（資料來源、D22、D02 等）一字不改。改寫前後各貼在報告裡對照。
3. **決定紀錄**：`docs/DECISIONS.md` 新增 D63：「本機版的 Python 引擎以內嵌方式打包（內嵌 Python 與套件，使用者不用另外安裝），以固定版本，確保與 TypeScript 輸出可逐字比對」，來源：使用者 2026-11-13 決定（任務 039 報告）。D62 補註一行：「引擎只以 127.0.0.1 內部連線，不對外（任務 039 原型）」，原文不改。更新檔頭日期。
4. `docs/PLAN.md`：6A.1 補註「deploy 已暫停（任務 039b）」；不改勾選狀態。
5. 報告 `docs/reports/039b-結果.md` 寫精簡：改了哪些檔案、AGENTS.md 前後對照。commit 並 push，確認 CI 的 build 與測試通過（此卡不應影響它們）；deploy 不會再執行是預期結果。

## 不可更動的檔案或規則

- 不修改 `src/`、`desktop/`、`engine/`、任何測試與資料表；不更動 CI 的 build、型別檢查、測試 job
- 不更改已定案決定（D01–D62 的原文）；AGENTS.md 只改與 D62 衝突的技術堆疊段落
- 為節省額度：不在本機跑全部測試，交給 CI

## 完成標準（可檢查）

- [ ] deploy 步驟不再執行，build 與測試 job 照常通過
- [ ] AGENTS.md 與 D62 一致，其餘一字不改（用 diff 確認）
- [ ] D63 寫入、D62 補註、PLAN 補註完成
- [ ] 報告完成，已 commit 與 push

## 需要先問使用者的情況

- AGENTS.md 有其他段落與 D62 衝突，且無法只靠技術堆疊段落解決
- 暫停 deploy 需要改動 build 或測試 job
- 任務與 `docs/DECISIONS.md` 衝突
