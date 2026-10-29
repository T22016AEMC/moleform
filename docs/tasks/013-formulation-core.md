# 任務 013：配方換算核心（Phase 3.2–3.5 的計算部分）與 D36–D39

編號：013
建立日期：2026-10-29
指派給：Codex／Claude Code

## 目標

完成配方的資料模型與換算核心：輸入 Solid／Liquid 兩區的成分與用量，算出各成分的質量、wt%、mol%、phr，以及總重、Solid Content，並把所有輸入錯誤用中文清楚指出。**本任務只做 `src/core/` 的純計算與測試，不做畫面**（畫面在任務 014）。同時把使用者 2026-10-29 確認的 D36–D39 寫進文件。

## 前置條件（先讀這些）

- `AGENTS.md`
- `docs/DECISIONS.md`（特別是 D09、D17、D26）
- `docs/PLAN.md`（Phase 3）
- `docs/spec.md`（「Solid／Liquid 配方輸入」一節）
- `docs/KNOWN_ISSUES.md`（U02）
- `docs/reports/012-結果.md`

## 要做的事

### A. 寫入決定（照抄）

1. `docs/DECISIONS.md`「一、已定案」表格最後（D35 之後）新增：

| D36 | 配方每一區（Solid、Liquid）**使用同一種輸入單位** | 使用者 2026-10-29 決定 |
| D37 | phr 的「樹脂」由**使用者勾選**哪些 Solid 成分計入（不依分類自動判定） | 使用者 2026-10-29 決定 |
| D38 | 新增 **pKa 估算**：Hammett／Taft 線性自由能法，可信度「參考趨勢」，標示為水溶液值、只用於比較相對強弱；放在 Phase 7，與 7.3 反應位點活性排序一起做 | 使用者 2026-10-29 決定 |
| D39 | pKa 所需的母體 pKa 與取代基常數（σ），使用者未提供書籍時，**可由 AI 搜尋公開文獻或開放資料集取得**；每列須標出處（論文或資料集名稱、版本、表號），`review_status` 先設 `pending`，由使用者審核。**僅適用於 pKa**，其他資料仍依鐵則 3 | 使用者 2026-10-29 決定 |

2. `docs/PLAN.md` Phase 7：
   - 「開工前需要使用者決定」後面補上：`；pKa 資料來源（D39，先執行 7.0 的來源調查）`
   - 在 `7.1` 之前新增：`- [ ] 7.0 pKa 資料來源調查：搜尋可用的母體 pKa 與 Hammett／Taft σ 值來源（論文、開放資料集），列出授權、涵蓋範圍，交使用者選擇（D39）`
   - 在 `7.3` 之後新增：`- [ ] 7.3a pKa 估算（Hammett／Taft，參考趨勢，水溶液值，D38）：酚、胺、羧酸等可解離基團；與 7.3 共用電子效應計算`
3. `docs/spec.md`「單一化合物／聚合物」表格最後新增一列：`| pKa（水溶液，僅供比較相對強弱） | Hammett／Taft 線性自由能法 | 小分子、單體的可解離基團 | 參考趨勢 |`
4. `docs/spec.md`「Solid／Liquid 配方輸入」一節最後新增一段，照抄本任務 B 節的「換算規則」表與 Solid Content 規則（標題「換算規則（D36、D37）」）。

### B. 換算規則（使用者 2026-10-29 確認）

| 區域單位 | 可用區域 | 規則 |
|---|---|---|
| `g` | Solid、Liquid | 直接為質量 |
| `parts`（重量份） | Solid、Liquid | 相對質量；有「該區總重（g）」時換算成 g |
| `wt` （wt%） | Solid、Liquid | 該區合計須為 100（容差 ±0.01），否則錯誤 |
| `mol`（mol%） | Solid、Liquid | 該區合計須為 100（容差 ±0.01）；以分子量換算為質量比 |
| `phr` | 僅 Solid | 使用者勾選的樹脂成分（D37）合計須為 100（容差 ±0.01）；未勾選任何樹脂則錯誤 |
| `vol`（vol%） | 僅 Liquid | **本階段不支援**：回傳「vol% 需要溶劑密度，將於 Phase 8 提供」 |

Solid Content（Solid 質量 ÷ 總質量）：
- 兩區都是 `g` → 直接計算
- 兩區都是 `parts` → 視為同一基準，直接計算
- 其他組合 → 需要使用者填「Solid 總重（g）」與「Liquid 總重（g）」中缺少的部分；缺少時回傳「無法計算 Solid Content，請補填 Solid 總重／Liquid 總重」
- **目標 Solid Content**（選填，0 < 值 < 100）：在 Solid 質量已知時，反推所需 Liquid 總質量，並依 Liquid 區的組成分配到各成分；Liquid 區沒有成分時只給總量
- **揮發／分解標記**（Solid 成分，選填）：同時輸出「Solid Content（全部）」與「Solid Content（扣除標記成分）」；後者把標記成分視為不計入 Solid（從分子扣除，分母不變）

輸出（每區）：各成分的 wt%、mol%；有絕對質量時另有 g；Solid 區有勾選樹脂時另有 phr。整體：Solid 質量、Liquid 質量、總重、Solid Content（兩種）、目標 Solid Content 的反推結果。

### C. 資料模型（`src/core/formulation/`，純 TypeScript）

5. 型別（名稱可調整，結構照此）：
   - `Formulation`：`schemaVersion: 1`、`name`、`solid: Area`、`liquid: Area`、`solidTotalG?`、`liquidTotalG?`、`targetSolidContentPct?`
   - `Area`：`unit`、`components: Component[]`
   - `Component`：`id`、`name`、`canonicalSmiles`、`category`、`amount`、`isResin`（僅 Solid）、`volatileFlag`（僅 Solid）、`compoundId?`（若來自化合物庫）
   - 分類：Solid 為 `Resin`、`Crosslinker`、`Catalyst/Initiator`、`Small Molecule`、`Surfactant`、`Additive`、`Other`（D26）；Liquid 為 `Solvent`、`Co-solvent`、`Other Liquid`
6. 分子量：核心函式**接收**每個成分的分子量（由呼叫端以 RDKit 計算平均分子量後傳入），核心本身不呼叫 RDKit，方便測試。分子量**只用於計算，不出現在任何輸出結構中給畫面顯示**（D09）。
7. 含連接點 `*` 的成分（聚合物重複單元）：`mol` 單位下回傳「聚合物的 mol% 基準將於 Phase 5 決定（U02）」；`g`、`parts`、`wt` 可正常計算質量相關結果，但該成分不輸出 mol%。
8. 多片段成分（例如鹽類、錯合物）：分子量以整個結構計算，視為一個成分，不拆開。

### D. 換算函式與錯誤

9. `computeFormulation(formulation, molecularWeights)` 回傳 `{ results, errors[], warnings[] }`：
   - 有錯誤時仍盡量回傳能算的部分（例如 Liquid 區錯誤不影響 Solid 區的 wt%）
   - 每個錯誤含：區域、成分（若有）、錯誤代碼、中文訊息
10. 至少涵蓋以下錯誤：數值為負或非數字；某區沒有成分但有其他設定；wt%／mol%／phr 合計不等於 100（訊息附實際合計值）；phr 未勾選樹脂；`phr` 用於 Liquid；`vol` 用於 Solid；mol% 缺分子量；目標 Solid Content 超出範圍；計算 Solid Content 所需的總重缺漏。
11. 所有結果數值用任務 008 的結果型別（`src/core/result.ts`），模型名稱「配方換算」，可信度「直接計算」。

### E. 測試（`tests/formulation/`，只檢查程式行為，D17）

12. 用**手算可驗證**的範例，分子量直接給定（例如 A=100、B=50、C=200 g/mol，不使用真實化合物），每個範例在測試檔中以註解寫出手算過程：
    - Solid `parts`：A 100、B 50 → wt% 66.67／33.33；mol% 依分子量換算
    - Solid `wt`：合計 100 正常；合計 99.5 報錯並附合計值
    - Solid `mol`：換算成 wt% 正確
    - Solid `phr`：勾選 A 為樹脂（100）、B 30、C 5 → 各成分 wt% 正確；勾選兩個樹脂合計 100 正常；未勾選報錯
    - 兩區都 `g`：Solid Content 正確；含揮發標記時兩種 Solid Content 都正確
    - Solid `wt` + Liquid `g`：缺 Solid 總重時報錯；補上後正確
    - 目標 Solid Content 30%：反推 Liquid 總質量與各溶劑分配正確
    - 含 `*` 的成分用 `mol`：回傳 U02 訊息
    - Liquid `vol`：回傳 Phase 8 訊息
    - 浮點誤差：合計 99.999 視為 100（容差內）
13. 提供一個把配方序列化成 JSON、再讀回的函式（含 `schemaVersion`），並測試來回不變（任務 014 的存檔會用到）。

### F. 檢查、提交、推送

14. 依序執行 `npm run typecheck`、`npm test`、`npm run build`，全部通過；`tests/architecture.test.ts` 仍通過（`src/core/` 不引用 React）。
15. 提交（訊息：`配方換算核心與 D36–D39（任務 013）`），推送方式依 `AGENTS.md`。

## 不可更動的檔案或規則

- 不做畫面（任務 014）
- 分子量不得出現在任何給畫面顯示的輸出中（D09）
- 不得在 `src/data/` 填入化學資料
- 不得實作 vol%（Phase 8）與聚合物 mol%（Phase 5）
- 不安裝新套件
- 不得修改 CheMScutter 與 `moleform-handoff`
- 不得修改 git 或認證設定；不得 force push

## 完成標準（可檢查）

- [ ] `npm run typecheck`、`npm test`、`npm run build` 全部通過
- [ ] `tests/formulation/` 涵蓋 E-12 全部情境，每個範例有手算註解
- [ ] `docs/DECISIONS.md` 含 D36–D39；PLAN 含 7.0、7.3a；spec 含 pKa 列與換算規則
- [ ] 推送成功

## 完成後請做

1. `docs/PLAN.md`：Phase 3 的項目**先不要勾**（畫面完成並經使用者確認後，在任務 014 一起勾）
2. 新增 `docs/reports/013-結果.md`：新增的檔案、測試結果（列出每個手算範例與程式輸出）、遇到的問題、需要使用者決定的事
3. 報告一併提交並推送

## 需要先問使用者的情況

- 換算規則有本任務沒有涵蓋的情況，且無法從 B 節推得
- 推送卡住或失敗
- 任務內容與 `docs/DECISIONS.md` 衝突
