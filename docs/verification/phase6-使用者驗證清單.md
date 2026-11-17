# Phase 6 使用者驗證清單（PLAN 6.9，任務 P6C）

日期：2026-11-17。程式輸出由本機 Python 引擎一次算出，未經化學判斷；對錯由使用者判定（D17）。本文件不附文獻參考值。

## 使用說明

1. **先看第一部分**：各資料表「待使用者審」的列數，以及所有「詮釋、補充、校準、使用者定義」的列（判斷而非書值，最需要審）。審完在對應 CSV 的稽核狀態欄自行更新（本任務不改資料表）。
2. **第二部分**：20 個代表分子，各一張小表。看數值是否合理，最後一欄「使用者判定」填 對／錯／備註。本文件可直接複製後填寫。
3. **第三部分**：自己的 DSC 實測值填進 user-measured-template.csv（複製成自己的檔案，先刪掉備註標「示範，非實測」的示範列）。用「模式」欄選三種比對之一；**用途填「校準」或「驗證」**（校準的樣品不併入驗證誤差）；材料家族為選填，用於分組統計（三種模式各自統計）。填完在專案根目錄執行：

        engine/.venv/Scripts/python.exe engine/scripts/compare_measured.py 你的檔案.csv

   | 模式 | 一個樣品 | 要填的欄 |
   |---|---|---|
   | `unit`（留白也算 unit） | 一列 | 樣品名、結構（單一重複單元 SMILES，含 `*`）、實測 Tg |
   | `mixture`（混合配方固化前 Tg） | 每個成分一列，**樣品名相同的列視為同一配方** | 每列：成分名稱、結構（SMILES）、質量百分比（wt%，同一配方合計 100）、Mn（聚合物成分需要；小分子留白）、成分類別（選填，預設 Resin；催化劑填 `Catalyst/Initiator`，不混入）。實測 Tg、用途、測量條件、備註、材料家族只填在**第一列** |
   | `relative`（相對 Tg，D61） | 每個成分一列，樣品名相同的列視為同一組 | 角色填 `A`（基準材料）或 `B`（目標材料）；每列：成分名稱、結構（SMILES）；B 每列填「莫耳數（每 1 mol A）」，A 留白視為 1。**A 的 Tg 錨點（°C）填在 A 列**，這是輸入（D61）；留白則由引擎的 k／Tg 表帶出，表裡沒有就列為「缺錨點」。**實測 Tg 填 B 的值**，只用來比對 |

   - 算不出預測值的樣品（缺基團、缺 Mn、缺錨點、引擎回報 missing）會列出原因，不算誤差、不進統計。
   - 實測值只作驗證目標，不進任何計算（D02）；模板的示範列（備註標「示範，非實測」，數字是佔位值）預設不進統計，加 `--include-demo` 才納入。

統一備註：本數值為依理論模型估算之參考值，非實測值。實際結果受原料純度、製程條件與反應動力學影響，請以實驗結果為準。

## 一、待審資料列

### 1.1 統計（src/data 共 25 張表；有稽核欄的資料表待審 557 列、全部資料列 617 列）

| 資料表 | 總列數 | 稽核狀態含「待使用者審」 | 其他狀態或說明 |
|---|---|---|---|
| backbone_templates.csv | 6 | — | 無稽核狀態欄（出處欄記錄來源與使用者同意／審核） |
| end_groups.csv | 27 | — | 無稽核狀態欄（出處欄記錄來源與使用者同意／審核） |
| free_volume_coefficients.csv | 5 | 5 |  |
| free_volume_corrections.csv | 6 | 6 |  |
| free_volume_groups.csv | 21 | 21 |  |
| functional_groups.csv | 2 | 0 | approved：2 |
| group_contributions.csv | 0 | — | 空表 |
| joback_groups.csv | 41 | 41 |  |
| molar_refraction_groups.csv | 47 | 47 |  |
| molar_volume_polymer_groups.csv | 27 | 27 |  |
| packing_coefficient_k.csv | 50 | 50 |  |
| polarization_groups.csv | 20 | 20 |  |
| reaction_rules.csv | 1 | 0 | approved：1 |
| solvents.csv | 0 | — | 空表 |
| tg_flory_k.csv | 4 | 3 | 待使用者補資料：1 |
| tg_mn_points.csv | 23 | — | 無稽核狀態欄（出處欄記錄來源與使用者同意／審核） |
| vw_groups.csv | 43 | 43 |  |
| vw_groups_bondi.csv | 18 | 18 |  |
| water_groups.csv | 13 | 13 |  |
| yd_groups.csv | 62 | 62 |  |
| yg_calibrated_groups.csv | 2 | 2 |  |
| yg_groups.csv | 71 | 71 |  |
| ym_ch2_sequence.csv | 25 | 25 |  |
| ym_groups.csv | 98 | 98 |  |
| ym_side_chain.csv | 5 | 5 |  |
| **合計** | **617** | **557** | |

各列內容請看對應的 CSV；下表只列判斷性的列。

### 1.2 判斷性資料列（標「詮釋」「補充」「校準」「使用者定義」，共 57 列，全部列出）

數值欄為該表的主要數值（係數、修正量、Vω、VW、Yd、Yg、Ym）。詮釋依據取備註或稽核狀態的原文，過長者截斷，全文見 CSV。標記欄是命中的關鍵字（「反推值」為 vw_groups.csv 一列的稽核狀態標示，一併列出）。

| 表名 | 列識別 | 基團或項目 | 數值 | 出處 | 標記 | 詮釋依據 |
|---|---|---|---|---|---|---|
| free_volume_coefficients.csv | FC01 | 螺雙茚滿（SBI）螺環骨架 | 0.7 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 G2（經驗係數：螺雙茚滿 0.7）、X10（W10*0.7） | 使用者定義 | 待使用者審 |
| free_volume_coefficients.csv | FC02 | 金剛烷與橋環或籠狀脂環 | 0.8 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 G2（金剛烷 0.8）、X8、X9、X21（W*0.8） | 使用者定義 | 待使用者審 |
| free_volume_coefficients.csv | FC03 | 含芳香環 | 0.37 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 G2（芳香環 0.37）、X5、X6 等（W*0.37） | 使用者定義 | 待使用者審 |
| free_volume_coefficients.csv | FC04 | 脂肪族（含聚合物，無環） | 1 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 G2（脂肪族（包含聚合物）1） | 使用者定義 | 待使用者審 |
| free_volume_coefficients.csv | FC05 | 環烷（有環但非橋環、無芳香環） | 1 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 G2（環烷 1）、X15、X17 等（W*1） | 使用者定義 | 待使用者審 |
| free_volume_corrections.csv | FX03 | 修正：茀的五員環（算 1 個環，減一次） | 1.66 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XVII（p.450，看圖確認）：Decrement per methylene ring condensed to benzene… | 詮釋 | 詮釋（使用者 2026-11-06 指定，待使用者審）：茀的五員環同時稠合兩個苯環，仍算 1 個環、減一次（報告列出「若算 2 次」的差）。五員環的組成：一個飽和碳（C9，CX4）、兩個苯環各兩個芳香碳，兩個苯環之間為單鍵。SMARTS 自行撰寫（D22）。 |
| free_volume_corrections.csv | FX04 | 修正：1,4-二氧六環（每個環減一次） | 1.70 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XVII（p.450，看圖確認）：Decrement per dioxane ring 1.70；任務 036d（D60） | 詮釋 | 詮釋（待使用者審）：Bondi 只寫 dioxane ring，沒有指明異構物；本列只對 1,4-二氧六環（兩個 O 在對位、環碳都是飽和碳）減一次，1,2-、1,3-二氧環不套用。SMARTS 自行撰寫（D22）。 |
| free_volume_corrections.csv | FX05 | 修正：酯基（羧酸酯）羰基碳側的單鍵（每個酯基減一次） | 0.22 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XVII（p.450，看圖確認）：Decrement per single bond adjacent to carboxyl or… | 詮釋 | 詮釋（待使用者審，與 D59 羧酸、碳酸酯的計數方式一致）：酯基的「旁邊的單鍵」＝羰基碳接外側碳（或連接點）的 C–C 單鍵一個，加上酯基單鍵 O 接外側碳（或連接點）的 O–C 單鍵一個（FX06），每個酯基共 2 個、減 2×0.22。羧酸與醯胺在本方法是… |
| free_volume_groups.csv | FV01 | 芳香 C–H（有氫的芳香碳） | 8.11 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 C4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV02 | 鏈脂肪族 C（四級碳；非環） | 3.33 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 E4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV03 | 鏈脂肪族 CH（非環） | 6.78 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 F4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV04 | 鏈脂肪族 CH2（非環） | 10.23 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 G4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV05 | 鏈脂肪族 CH3 | 13.67 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 H4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV06 | 環脂肪族 C（四級碳；在環上） | 3.8 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 I4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV07 | 環脂肪族 CH（在環上） | 5.6 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 J4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV08 | 環脂肪族 CH2（在環上） | 8.45 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 K4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV09 | 醚類 O | 3.7 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 L4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV10 | 環氧基 O（三員環） | 1.9 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 M4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV11 | 酮類 C=O（整個羰基，含羰基碳） | 10.8 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 N4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV12 | 醛類 C=O（整個羰基，含醛基碳） | 11.5 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 O4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV13 | 酯基 –C(=O)–O–（整組，含羰基碳與單鍵 O） | 15.2 | van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), Table 4.2（–COO–，取自 vw_groups.csv V11），書頁 7… | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV14 | 一級醇 OH（接 CH2 或 CH3 的碳） | 10 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 Q4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV15 | 二級醇 OH（接 CH 的碳） | 11 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 R4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV16 | 三級醇 OH（接四級碳） | 12 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 S4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV17 | 酚 OH（接芳香碳） | 11.5 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 T4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV18 | 脂肪族 F（接飽和碳） | 18 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 U4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV19 | 芳香族 F（接芳香碳） | 11 | 使用者定義（依論文整理，論文清單待補）；使用者表 xlsx 儲存格 V4 | 使用者定義 | 待使用者審 |
| free_volume_groups.csv | FV20 | 取代芳香 C（無氫，非縮合；連接環外任何原子或飽和環） | 5.54 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XV（p.449，看圖確認）：>C–（alkyl）5.54；任務 036d（D60）使用者 2026-11-06 要求與論文一致 | 詮釋 | Bondi 的標籤只寫 alkyl，沒有文字定義；本列把所有無氫、非縮合的芳香碳都歸此類，包含接雜原子（–OH、–O–、–F、–Cl、羰基）與稠合在飽和環或五員環上的芳香碳（茚滿、茀）。這個範圍是詮釋（使用者 2026-11-06 選擇「照任務卡」），待使用者… |
| free_volume_groups.csv | FV21 | 縮合芳香 C（同屬兩個芳香環，萘型） | 4.74 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XV（p.449，看圖確認）：>C–（condensation）4.74；任務 036d（D60）使用者 2026-11-06 要求… | 詮釋 | 縮合芳香碳＝三個鍵都接芳香原子（以芳香鍵 : 相連）的碳，即兩個芳香環共用的碳（萘、蒽、芘）。茀的兩個苯環之間是單鍵，不是芳香鍵，所以茀的稠合碳（屬一個苯環與一個五員環）歸 FV20 取代（詮釋，待使用者審）。SMARTS 自行撰寫（D22）。使用者 xlsx… |
| vw_groups.csv | V10 | –O– | 3.7 | van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), 4.2.3 節，Table 4.2（二價基團），書頁 74（PDF 第 101 頁）… | 反推值 | 反推值（Table 4.7／4.8，8／10 筆重現）；書印 (5.5)(5.0) 保留在備註；待使用者審 |
| vw_groups_bondi.csv | BG01 | 茀核心（9,9-二取代茀的 C9＋4 個稠合芳香碳） | 25.49 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XV（p.449）：>C<（aliph.）3.33、>C–（arom. alkyl）5.54；SMARTS 自行撰寫（D22） | 詮釋、補充 | Bondi 沒有茀的基團或化合物值。詮釋（使用者 2026-11-06 指定）：C9 取 3.33；4 個稠合芳香碳（各屬一個苯環與一個五員環）取「取代芳香碳 5.54」而非縮合 4.74（縮合碳在 Table XV 是萘型稠環）。VW = 3.33 + 4×… |
| vw_groups_bondi.csv | BG02 | 碳酸酯基的 >C=O（–O–C(=O)–O– 的羰基碳與羰基氧） | 11.70 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XVI（p.450）：>C=O 11.70（腳註 d：羧酸酯與醯胺另有 Table XVII 修正）；SMARTS 自行撰寫（D22… | 詮釋、補充 | Bondi 沒有碳酸酯基團。詮釋（使用者 2026-11-06 指定）：碳酸酯 = >C=O 11.70 ＋ 兩個醚 O（BG10–BG13，依所接的碳）；修正量見 BC05。書的 –COO–（V11）不含碳酸酯。標「含 Bondi 補充基團（非書值）」。 |
| vw_groups_bondi.csv | BG03 | 羧酸的 >C=O（羰基碳與羰基氧；–OH 由書的 V17 配對） | 11.70 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XVI（p.450）：>C=O 11.70（腳註 d）；SMARTS 自行撰寫（D22） | 詮釋、補充 | Bondi 沒有羧酸基團。詮釋（使用者 2026-11-06 指定）：羧酸 = >C=O 11.70 ＋ –OH；–OH 先由書的 V17 配走（書 8.0，Bondi 8.04），所以本列只含羰基。氫鍵修正（腳註 c，每個氫鍵減 1.05）不做。修正量見 B… |
| vw_groups_bondi.csv | BG06 | 稠合芳香碳（苯與一個全碳飽和環稠合：茚滿、四氫萘型） | 5.54 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XV（p.449）：>C–（arom. alkyl）5.54；Table XVII（p.450）註 b：茚滿、四氫萘；SMARTS … | 詮釋、補充 | 詮釋（使用者 2026-11-06 指定）：稠合碳接 sp3 碳，取「烷基取代芳香碳 5.54」，不取縮合 4.74。限制：苯環只與一個全碳飽和環（5 或 6 員）稠合，稠合碳不屬於其他環，苯環其餘四個碳不在其他環上；其餘稠合結構維持缺基團。Bondi 論文沒… |
| vw_groups_bondi.csv | BG07 | 苯稠合飽和碳環上的 –CH2– | 10.23 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XV（p.449）：>CH2 10.23；SMARTS 自行撰寫（D22） | 詮釋 | 待使用者審（詮釋） |
| vw_groups_bondi.csv | BG08 | 苯稠合飽和碳環上的 >CH– | 6.78 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XV（p.449）：>CH–（三個鍵）6.78；SMARTS 自行撰寫（D22） | 詮釋 | 待使用者審（詮釋） |
| vw_groups_bondi.csv | BG09 | 苯稠合飽和碳環上的 >C<（含螺中心） | 3.33 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XV（p.449）：>C<（aliph.）3.33；SMARTS 自行撰寫（D22） | 詮釋 | 待使用者審（詮釋） |
| vw_groups_bondi.csv | BG10 | 碳酸酯的 –O–（接芳香碳，ph.e.） | 3.2 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XVI（p.450）：–O–（ph.e.，（poly）phenyl ethers）3.2；SMARTS 自行撰寫（D22） | 詮釋 | 詮釋（使用者 2026-11-06 指定）：碳酸酯的醚 O 依所接的碳分類：芳香碳 3.2、烷基碳 3.7。 |
| vw_groups_bondi.csv | BG11 | 碳酸酯的 –O–（接烷基碳，a.e.） | 3.7 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XVI（p.450）：–O–（a.e.，（poly）alkane ethers）3.7；SMARTS 自行撰寫（D22） | 詮釋 | 待使用者審（詮釋） |
| vw_groups_bondi.csv | BG12 | 碳酸酯的 –O–（接連接點 *，另一端的連接點接芳香原子，ph.e.） | 3.2 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XVI（p.450）：–O–（ph.e.）3.2；SMARTS 自行撰寫（D22） | 詮釋 | 重複單元的連接點 * 實際接到下一單元，接的是什麼原子由單元另一端的連接點決定（頭尾相接）：單元恰有兩個連接點，且另一個連接點接的是芳香原子時，本列配對；連接點數不是兩個、或另一端不是碳，不配對。這個頭尾相接的判斷是本任務的詮釋（待使用者審）；判斷寫在 van… |
| vw_groups_bondi.csv | BG13 | 碳酸酯的 –O–（接連接點 *，另一端的連接點接非芳香碳，a.e.） | 3.7 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XVI（p.450）：–O–（a.e.）3.7；SMARTS 自行撰寫（D22） | 詮釋 | 待使用者審（詮釋） |
| vw_groups_bondi.csv | BC01 | 修正：苯稠合的亞甲基五員環（茚滿型，每個環減一次） | -1.66 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XVII（p.450）：Decrement per methylene ring condensed to benzene 1.66… | 補充 | 修正量 −1.66，每個環一次（SBI 兩個環共 2 次）。只在環上的原子都由 Bondi 補充基團配對時套用。 |
| vw_groups_bondi.csv | BC03 | 修正：茀的五員環（算 1 個環、減一次） | -1.66 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XVII（p.450）：Decrement per methylene ring condensed to benzene 1.66… | 詮釋 | 詮釋（使用者 2026-11-06 指定）：茀的五員環沒有 CH2，與兩個苯環稠合；算 1 個環、減 1 次（若算 2 次，VW 再少 1.66，見任務 037 報告）。 |
| vw_groups_bondi.csv | BC04 | 修正：羧酸羰基旁的單鍵（每個鍵減一次） | -0.22 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XVII（p.450）：Decrement per single bond adjacent to carboxyl or amid… | 詮釋、補充 | 修正量 −0.22。計數方式（詮釋，使用者 2026-11-06 指定）：從羧基（C(=O)OH）連出去的非氫單鍵，羧酸只有羰基碳接的那一個 C–C 鍵，每個羧酸 1 次。只在羰基碳由 Bondi 補充基團（BG03）配對時套用；書的 –COO– 酯基不套用。 |
| vw_groups_bondi.csv | BC05 | 修正：碳酸酯基旁的單鍵（每個鍵減一次） | -0.22 | Bondi, J. Phys. Chem. 68, 441 (1964), Table XVII（p.450）：Decrement per single bond adjacent to carboxyl or amid… | 詮釋、補充 | 修正量 −0.22。計數方式（詮釋，使用者 2026-11-06 指定）：從碳酸酯基（O–C(=O)–O）連出去的非氫單鍵，兩側的 O–C（或 O–*）各 1 次，每個碳酸酯 2 次。只在羰基碳由 Bondi 補充基團（BG02）配對時套用。 |
| yd_groups.csv | A.C(CH3)2.free | –C(CH3)2– 第一個值（free） | 25.5 | van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), Table 21.2，書頁 768（PDF 第 795 頁）；SMARTS 與 Yg… | 詮釋 | 書中大括號三個值 25.5／30／35，沒有標示各對應什麼條件；依 21.2.2 文字（共軛與龐大基團效應有兩或三個值）與 Table 6.8 的 free／s／ss 排列，由小到大對應 free／s／ss（詮釋，待使用者審）；引擎只用 free，受阻情況回報… |
| yd_groups.csv | A.C(CH3)2.ss | –C(CH3)2– 第三個值（ss） | 35 | van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), Table 21.2，書頁 768（PDF 第 795 頁）；SMARTS 與 Yg… | 詮釋 | 詮釋（依書算例推得）：Table 21.3 的 Poly(dian terephthalate)：Yd calc 262 = 119 + 2 × 54 + 35；Poly(dian carbonate)：173 = 30 + 2 × 54 + 35（雙酚 A … |
| yd_groups.csv | A.C(CH3)(C6H5) | –C(CH3)(C6H5)– | 56 | van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), Table 21.2，書頁 768（PDF 第 795 頁）；SMARTS 與 Yg… | 詮釋 | 書中印為「–C(CH3C6H5)–」，依此詮釋為 –C(CH3)(C6H5)–（待使用者審） |
| yd_groups.csv | B.mC6H4.n | 間伸苯基 第一個值（n） | 44 | van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), Table 21.2，書頁 768（PDF 第 795 頁）；SMARTS 與 Yg… | 詮釋 | 書中大括號三個值 44／52／65；21.2.2 文字：共軛不存在、一側、兩側有兩或三個值，依由小到大對應 n／c／cc（詮釋，待使用者審） |
| yd_groups.csv | B.pC6H4.n | 對伸苯基 第一個值（n） | 54 | van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), Table 21.2，書頁 768（PDF 第 795 頁）；SMARTS 與 Yg… | 詮釋 | 書中大括號三個值 54／62／75，對應方式同間伸苯基（詮釋，待使用者審） |
| yd_groups.csv | B.dimethylpC6H2 | 2,6-二甲基-1,4-伸苯基 | 82 | van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), Table 21.2，書頁 768（PDF 第 795 頁）；SMARTS 自行撰寫… | 詮釋 | 書中結構圖：伸苯基環上兩個 CH3；位置依 Table 21.3 的 poly(2,6-dimethyl p-phenylene oxide) 詮釋為 2,6-（待使用者審） |
| yd_groups.csv | B.C=O.n | –C(=O)– 第一個值（n） | 14 | van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), Table 21.2 （續），書頁 769（PDF 第 796 頁）；SMARTS … | 詮釋 | 書中大括號三個值 14／20／26，對應方式同伸苯基（詮釋，待使用者審） |
| yd_groups.csv | B.CONH.eg | –C(=O)NH–（詮釋：Table 21.3 算例用的 32.5） | 32.5 | van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), Table 21.2 （續），書頁 769（PDF 第 796 頁）；SMARTS … | 詮釋 | 詮釋（依書算例推得）：Table 21.3 的 Poly(hexamethylene adipamide)：Yd calc 160 = 10 × 9.5 + 2 × 32.5；Poly(epsilon-caproamide)：80 = 5 × 9.5 + 32… |
| yd_groups.csv | B.oxadiazole | 1,3,4-oxadiazole | 50 | van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), Table 21.2 （續），書頁 769（PDF 第 796 頁）；SMARTS … | 詮釋 | 區段標「B 雙鍵系統」是為了讓相鄰伸苯基判為共軛（Table 21.3 的 poly(m-phenylene 2,5-oxadiazole) 以 cc 值計），此為詮釋（待使用者審） |
| yg_calibrated_groups.csv | CAL.OH.ar | 酚羥基（芳香環上 H 換成 –OH） | 16.43 | Kratochvíl 等, Eur. Polym. J. 45 (2009) 1851–1856, 式 (1)（PDF 第 2 頁，期刊頁 1852）：Tg = 186.7 − 8.43/Mn × 10^4 (°C)，R… | 校準 | 校準值（非書中值），待使用者審 |
| yg_calibrated_groups.csv | CAL.fluorene.diaryl | 9,9-雙(4-伸苯基)茀骨架（兩個芳香連接點，C25H16） | 157.47 | Hayashi 等, Polym. J. 41 (2009) 609–615：F-PE 3d（9,9-雙(4-羥苯基)茀與 1,6-己二醇二對甲苯磺酸酯的聚醚），Mn 60,000、Mw 160,000（GPC，聚苯乙烯… | 校準 | 校準值（非書中值），待使用者審 |
| ym_groups.csv | A.C(CH3)(C6H5) | –C(CH3)(C6H5)– | 54 | van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009), Table 6.8 A 非共軛基團，書頁 154（PDF 第 181 頁）；SMAR… | 詮釋 | 書中印為「–H(CH3)(C6H5)–」（印刷遺漏 C），Mi 104.1 與 –C(CH3)(C6H5)– 相符，依此詮釋（待使用者審） |

## 二、代表分子結果對照表

分子取自現有 phase6 驗證文件（phase6-Vm-密度-輸出 的結構總表，共 22 個）；為符合上限 20 個，不列 BT02（鄰甲酚 Novolac）與 BT04（甲酚醛環氧），兩者與 BT01、BT03 僅差一個甲基。未新增分子。

固定條件：吸濕用 RH 50%；Tm 未提供「可結晶」，引擎照算並警告；Tg 單位 K，括號為 °C；CTE 單位 1/K；狀態欄「缺基團／缺值」＝引擎回報缺基團、不計算；「不適用」＝引擎回報該方法不適用此類結構（數值欄不列）。Tm、Td、吸濕用聚合物重複單元的方法，小分子雖算得出數值，僅供參考。缺基團欄括號內為缺的基團名稱與原子編號，完整列表見各 phase6 輸出文件。

出處欄的 van Krevelen 2009 ＝ van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009)，後接章節或表號；各列頁碼見輸出文件與資料表。

### 2.1 BADGE（小分子）

結構：CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1；來源：環氧樹脂；Phase 2、3

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | — | cm³/mol | 缺基團／缺值 | van Krevelen 2009 4.2.3 節 | 缺 6 處（CH@9；CH2@10；O@11…） | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 6 處（CH@9；CH2@10；O@11…） | |
| Vm／密度 | — | cm³/mol | 不適用 | van Krevelen 2009 4.3.7 節 | 小分子液體法未實作 | |
| CTE | — | K⁻¹ | 不適用 | van Krevelen 2009 4.4 節 MTE 模型 | 小分子不適用（D56） | |
| 自由體積 Vf（使用者經驗法） | 65.7 | cm³/mol | 理論估算 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） |  | |
| 介電常數 ε／極化率 α′ | — |  | 不適用 | van Krevelen 2009 11.2.3 節 | 小分子不適用 | |
| Tb | 852.4 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| Tf | 540.2 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| TPSA | 43.5 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 |  | |
| LogP | 3.568 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 |  | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 6 處（CH@9；CH2@10；O@11…） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 6 處（CH@9；CH2@10；O@11…） | |
| 吸濕（RH 50%） | 0.2337 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 方法為聚合物單元，小分子僅供參考；非晶；括號值；未涵蓋 1 處 | |

### 2.2 雙酚 A（小分子）

結構：CC(C)(c1ccc(O)cc1)c1ccc(O)cc1；來源：固化劑（酚）；Phase 2、3

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | 133.3 | cm³/mol | 理論估算 | van Krevelen 2009 4.2.3 節 |  | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 2 處（OH@7；OH@14） | |
| Vm／密度 | — | cm³/mol | 不適用 | van Krevelen 2009 4.3.7 節 | 小分子液體法未實作 | |
| CTE | — | K⁻¹ | 不適用 | van Krevelen 2009 4.4 節 MTE 模型 | 小分子不適用（D56） | |
| 自由體積 Vf（使用者經驗法） | 52.1 | cm³/mol | 理論估算 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） |  | |
| 介電常數 ε／極化率 α′ | — |  | 不適用 | van Krevelen 2009 11.2.3 節 | 小分子不適用 | |
| Tb | 754.2 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| Tf | 537.5 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| TPSA | 40.5 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 |  | |
| LogP | 3.424 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 |  | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 2 處（OH@7；OH@14） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 2 處（OH@7；OH@14） | |
| 吸濕（RH 50%） | 7.917 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 方法為聚合物單元，小分子僅供參考；非晶；括號值；未涵蓋 1 處 | |

### 2.3 三苯基膦（小分子）

結構：c1ccc(P(c2ccccc2)c2ccccc2)cc1；來源：催化劑；Phase 3

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | 148.0 | cm³/mol | 理論估算 | van Krevelen 2009 4.2.3 節 |  | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 19 處（CH（芳香）@0；CH（芳香）@1；CH（芳香）@2…） | |
| Vm／密度 | — | cm³/mol | 不適用 | van Krevelen 2009 4.3.7 節 | 小分子液體法未實作 | |
| CTE | — | K⁻¹ | 不適用 | van Krevelen 2009 4.4 節 MTE 模型 | 小分子不適用（D56） | |
| 自由體積 Vf（使用者經驗法） | — | cm³/mol | 缺基團／缺值 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） | 缺基團：使用者表沒有對應的基團，不計算、不猜值 | |
| 介電常數 ε／極化率 α′ | — |  | 不適用 | van Krevelen 2009 11.2.3 節 | 小分子不適用 | |
| Tb | — | K | 缺基團／缺值 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 | 缺 1 處（P@4） | |
| Tf | — | K | 缺基團／缺值 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 | 缺 1 處（P@4） | |
| TPSA | 0 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 |  | |
| LogP | 3.445 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 |  | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 19 處（CH（芳香）@0；CH（芳香）@1；CH（芳香）@2…） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 19 處（CH（芳香）@0；CH（芳香）@1；CH（芳香）@2…） | |
| 吸濕（RH 50%） | 0.04118 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 方法為聚合物單元，小分子僅供參考；非晶；；未涵蓋 1 處 | |

### 2.4 甲基乙基酮（MEK）（小分子）

結構：CCC(C)=O；來源：溶劑；Phase 3

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | 46.1 | cm³/mol | 理論估算 | van Krevelen 2009 4.2.3 節 |  | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 2 處（CH3@0；CH3@3） | |
| Vm／密度 | — | cm³/mol | 不適用 | van Krevelen 2009 4.3.7 節 | 小分子液體法未實作 | |
| CTE | — | K⁻¹ | 不適用 | van Krevelen 2009 4.4 節 MTE 模型 | 小分子不適用（D56） | |
| 自由體積 Vf（使用者經驗法） | 48.4 | cm³/mol | 理論估算 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） |  | |
| 介電常數 ε／極化率 α′ | — |  | 不適用 | van Krevelen 2009 11.2.3 節 | 小分子不適用 | |
| Tb | 345.0 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| Tf | 184.8 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| TPSA | 17.1 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 |  | |
| LogP | 0.9854 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 |  | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 4 處（CH3@0；C@2；CH3@3…） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 2 處（CH3@0；CH3@3） | |
| 吸濕（RH 50%） | 1.375 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 方法為聚合物單元，小分子僅供參考；非晶；括號值 | |

### 2.5 丙二醇甲醚醋酸酯（PGMEA）（小分子）

結構：COCC(C)OC(C)=O；來源：溶劑；Phase 3、4（成分 L）

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | 78.3 | cm³/mol | 理論估算 | van Krevelen 2009 4.2.3 節 |  | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 4 處（CH3@0；CH@3；CH3@4…） | |
| Vm／密度 | — | cm³/mol | 不適用 | van Krevelen 2009 4.3.7 節 | 小分子液體法未實作 | |
| CTE | — | K⁻¹ | 不適用 | van Krevelen 2009 4.4 節 MTE 模型 | 小分子不適用（D56） | |
| 自由體積 Vf（使用者經驗法） | 76.5 | cm³/mol | 理論估算 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） |  | |
| 介電常數 ε／極化率 α′ | — |  | 不適用 | van Krevelen 2009 11.2.3 節 | 小分子不適用 | |
| Tb | 417.1 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| Tf | 206.9 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| TPSA | 35.5 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 |  | |
| LogP | 0.5844 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 |  | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 2 處（CH3@0；CH3@4） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 2 處（CH3@0；CH3@4） | |
| 吸濕（RH 50%） | 0.8189 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 方法為聚合物單元，小分子僅供參考；非晶；括號值 | |

### 2.6 SBI 雙酚（螺雙茚滿二醇）（小分子）

結構：OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2；來源：單體；Phase 4（成分 S）

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | 179.4 | cm³/mol | 理論估算 | van Krevelen 2009 4.2.3 節 |  | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 23 處（OH@0；C（芳香）@1；CH（芳香）@2…） | |
| Vm／密度 | — | cm³/mol | 不適用 | van Krevelen 2009 4.3.7 節 | 小分子液體法未實作 | |
| CTE | — | K⁻¹ | 不適用 | van Krevelen 2009 4.4 節 MTE 模型 | 小分子不適用（D56） | |
| 自由體積 Vf（使用者經驗法） | 129.2 | cm³/mol | 理論估算 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） |  | |
| 介電常數 ε／極化率 α′ | — |  | 不適用 | van Krevelen 2009 11.2.3 節 | 小分子不適用 | |
| Tb | 909.9 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| Tf | 734.6 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| TPSA | 40.5 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 |  | |
| LogP | 4.747 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 |  | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 23 處（OH@0；C（芳香）@1；CH（芳香）@2…） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 23 處（OH@0；C（芳香）@1；CH（芳香）@2…） | |
| 吸濕（RH 50%） | 5.86 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 方法為聚合物單元，小分子僅供參考；非晶；括號值；未涵蓋 3 處 | |

### 2.7 環氧氯丙烷（小分子）

結構：ClCC1CO1；來源：單體（任務 027 指定）；任務 027（現有測試資料沒有）

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | — | cm³/mol | 缺基團／缺值 | van Krevelen 2009 4.2.3 節 | 缺 3 處（CH@2；CH2@3；O@4） | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 4 處（Cl@0；CH@2；CH2@3…） | |
| Vm／密度 | — | cm³/mol | 不適用 | van Krevelen 2009 4.3.7 節 | 小分子液體法未實作 | |
| CTE | — | K⁻¹ | 不適用 | van Krevelen 2009 4.4 節 MTE 模型 | 小分子不適用（D56） | |
| 自由體積 Vf（使用者經驗法） | — | cm³/mol | 缺基團／缺值 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） | 缺基團：使用者表沒有對應的基團，不計算、不猜值 | |
| 介電常數 ε／極化率 α′ | — |  | 不適用 | van Krevelen 2009 11.2.3 節 | 小分子不適用 | |
| Tb | 339.4 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| Tf | 198.0 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| TPSA | 12.5 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 |  | |
| LogP | 0.624 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 |  | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 4 處（Cl@0；CH@2；CH2@3…） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 4 處（Cl@0；CH@2；CH2@3…） | |
| 吸濕（RH 50%） | 0.3127 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 方法為聚合物單元，小分子僅供參考；非晶；括號值 | |

### 2.8 乙醇（小分子）

結構：CCO；來源：一般小分子；Phase 2

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | 31.9 | cm³/mol | 理論估算 | van Krevelen 2009 4.2.3 節 |  | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 2 處（CH3@0；OH@2） | |
| Vm／密度 | — | cm³/mol | 不適用 | van Krevelen 2009 4.3.7 節 | 小分子液體法未實作 | |
| CTE | — | K⁻¹ | 不適用 | van Krevelen 2009 4.4 節 MTE 模型 | 小分子不適用（D56） | |
| 自由體積 Vf（使用者經驗法） | 33.9 | cm³/mol | 理論估算 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） |  | |
| 介電常數 ε／極化率 α′ | — |  | 不適用 | van Krevelen 2009 11.2.3 節 | 小分子不適用 | |
| Tb | 337.5 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| Tf | 173.1 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| TPSA | 20.2 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 |  | |
| LogP | -0.0014 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 |  | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 2 處（CH3@0；OH@2） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 2 處（CH3@0；OH@2） | |
| 吸濕（RH 50%） | 19.5 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 方法為聚合物單元，小分子僅供參考；非晶；括號值 | |

### 2.9 環氧丙烷（小分子）

結構：CC1CO1；來源：單體；Phase 2

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | — | cm³/mol | 缺基團／缺值 | van Krevelen 2009 4.2.3 節 | 缺 3 處（CH@1；CH2@2；O@3） | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 4 處（CH3@0；CH@1；CH2@2…） | |
| Vm／密度 | — | cm³/mol | 不適用 | van Krevelen 2009 4.3.7 節 | 小分子液體法未實作 | |
| CTE | — | K⁻¹ | 不適用 | van Krevelen 2009 4.4 節 MTE 模型 | 小分子不適用（D56） | |
| 自由體積 Vf（使用者經驗法） | 29.6 | cm³/mol | 理論估算 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） |  | |
| 介電常數 ε／極化率 α′ | — |  | 不適用 | van Krevelen 2009 11.2.3 節 | 小分子不適用 | |
| Tb | 301.9 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| Tf | 168.1 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| TPSA | 12.5 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 |  | |
| LogP | 0.4051 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 |  | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 4 處（CH3@0；CH@1；CH2@2…） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 4 處（CH3@0；CH@1；CH2@2…） | |
| 吸濕（RH 50%） | 0.3122 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 方法為聚合物單元，小分子僅供參考；非晶；括號值 | |

### 2.10 苯酚（小分子）

結構：Oc1ccccc1；來源：單體；Phase 2

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | 53.9 | cm³/mol | 理論估算 | van Krevelen 2009 4.2.3 節 |  | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 7 處（OH@0；C（芳香）@1；CH（芳香）@2…） | |
| Vm／密度 | — | cm³/mol | 不適用 | van Krevelen 2009 4.3.7 節 | 小分子液體法未實作 | |
| CTE | — | K⁻¹ | 不適用 | van Krevelen 2009 4.4 節 MTE 模型 | 小分子不適用（D56） | |
| 自由體積 Vf（使用者經驗法） | 21.3 | cm³/mol | 理論估算 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） |  | |
| 介電常數 ε／極化率 α′ | — |  | 不適用 | van Krevelen 2009 11.2.3 節 | 小分子不適用 | |
| Tb | 439.2 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| Tf | 283.0 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| TPSA | 20.2 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 |  | |
| LogP | 1.392 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 |  | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 7 處（OH@0；C（芳香）@1；CH（芳香）@2…） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 7 處（OH@0；C（芳香）@1；CH（芳香）@2…） | |
| 吸濕（RH 50%） | 9.601 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 方法為聚合物單元，小分子僅供參考；非晶； | |

### 2.11 L-丙胺酸（小分子）

結構：C[C@@H](C(=O)O)N；來源：一般小分子；Phase 2

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | 50.5 | cm³/mol | 理論估算 | van Krevelen 2009 4.2.3 節 |  | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 6 處（CH3@0；CH@1；C@2…） | |
| Vm／密度 | — | cm³/mol | 不適用 | van Krevelen 2009 4.3.7 節 | 小分子液體法未實作 | |
| CTE | — | K⁻¹ | 不適用 | van Krevelen 2009 4.4 節 MTE 模型 | 小分子不適用（D56） | |
| 自由體積 Vf（使用者經驗法） | — | cm³/mol | 缺基團／缺值 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） | 缺基團：使用者表沒有對應的基團，不計算、不猜值 | |
| 介電常數 ε／極化率 α′ | — |  | 不適用 | van Krevelen 2009 11.2.3 節 | 小分子不適用 | |
| Tb | 485.8 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| Tf | 352.4 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| TPSA | 63.3 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 |  | |
| LogP | -0.5818 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 |  | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 6 處（CH3@0；CH@1；C@2…） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 6 處（CH3@0；CH@1；C@2…） | |
| 吸濕（RH 50%） | 16.2 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 方法為聚合物單元，小分子僅供參考；非晶；括號值 | |

### 2.12 反式 2-丁烯（小分子）

結構：C/C=C/C；來源：一般小分子；Phase 2

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | 44.2 | cm³/mol | 理論估算 | van Krevelen 2009 4.2.3 節 |  | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 2 處（CH3@0；CH3@3） | |
| Vm／密度 | — | cm³/mol | 不適用 | van Krevelen 2009 4.3.7 節 | 小分子液體法未實作 | |
| CTE | — | K⁻¹ | 不適用 | van Krevelen 2009 4.4 節 MTE 模型 | 小分子不適用（D56） | |
| 自由體積 Vf（使用者經驗法） | — | cm³/mol | 缺基團／缺值 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） | 缺基團：使用者表沒有對應的基團，不計算、不猜值 | |
| 介電常數 ε／極化率 α′ | — |  | 不適用 | van Krevelen 2009 11.2.3 節 | 小分子不適用 | |
| Tb | 295.3 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| Tf | 129.8 | K | 理論估算 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 |  | |
| TPSA | 0 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 |  | |
| LogP | 1.582 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 |  | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 2 處（CH3@0；CH3@3） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 2 處（CH3@0；CH3@3） | |
| 吸濕（RH 50%） | 0.001604 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 方法為聚合物單元，小分子僅供參考；非晶；括號值；未涵蓋 2 處 | |

### 2.13 三氟化硼（BF₃）（小分子）

結構：FB(F)F；來源：催化劑；Phase 2

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | — | cm³/mol | 缺基團／缺值 | van Krevelen 2009 4.2.3 節 | 缺 4 處（F@0；B@1；F@2…） | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 4 處（F@0；B@1；F@2…） | |
| Vm／密度 | — | cm³/mol | 不適用 | van Krevelen 2009 4.3.7 節 | 小分子液體法未實作 | |
| CTE | — | K⁻¹ | 不適用 | van Krevelen 2009 4.4 節 MTE 模型 | 小分子不適用（D56） | |
| 自由體積 Vf（使用者經驗法） | — | cm³/mol | 缺基團／缺值 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） | 缺基團：使用者表沒有對應的基團，不計算、不猜值 | |
| 介電常數 ε／極化率 α′ | — |  | 不適用 | van Krevelen 2009 11.2.3 節 | 小分子不適用 | |
| Tb | — | K | 缺基團／缺值 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 | 缺 1 處（B@1） | |
| Tf | — | K | 缺基團／缺值 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 | 缺 1 處（B@1） | |
| TPSA | 0 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 |  | |
| LogP | 0.8798 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 |  | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 4 處（F@0；B@1；F@2…） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 4 處（F@0；B@1；F@2…） | |
| 吸濕（RH 50%） | 0 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 方法為聚合物單元，小分子僅供參考；非晶；；未涵蓋 4 處 | |

### 2.14 P 單元 A（雙酚茀）（聚合物重複單元）

結構：[\*:1]c1ccc(C2(c3ccc([\*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O；來源：Phase 4（成分 P）

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | 185.8 | cm³/mol | 理論估算 | van Krevelen 2009 4.2.3 節 |  | |
| Tg | 546.3 | K（273.1 °C） | 理論估算 | van Krevelen 2009 式 6.4–6.5 | 含校準基團 | |
| Vm／密度 | — | cm³/mol | 缺基團／缺值 | van Krevelen 2009 4.3.7 節 | 缺 27 處（C（芳香）@1；CH（芳香）@2；CH（芳香）@3…） | |
| CTE α 橡膠態 | 0.000625 | K⁻¹ | 理論估算 | van Krevelen 2009 4.4 節 MTE 模型 |  | |
| CTE α 玻璃態（式 4.18） | 0.0002812 | K⁻¹ | 理論估算 | van Krevelen 2009 4.4 節 MTE 模型 |  | |
| CTE α 玻璃態（由 Tg，式 4.27） | 0.00026 | K⁻¹ | 理論估算 | van Krevelen 2009 4.4 節 MTE 模型 |  | |
| 自由體積 Vf（使用者經驗法） | 71.8 | cm³/mol | 理論估算 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） |  | |
| 介電常數 ε（式 11.8） | — |  | 缺基團／缺值 | van Krevelen 2009 11.2.3 節 | 缺基團（見 /dielectric） | |
| 分子極化率 α′ | — | Å³ | 缺基團／缺值 | van Krevelen 2009 10.2 節 Table 10.4（R_LL，λ = 589 nm，書頁 293–294）；α 由式 (11.10)、(11.11)（書頁 32… | 缺基團（見 /dielectric） | |
| Tb／Tf | — | K | 不適用 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 | 聚合物單元不適用 | |
| TPSA | 40.5 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 | 以甲基封端估算 | |
| LogP | 6.078 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 | 以甲基封端估算 | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 27 處（C（芳香）@1；CH（芳香）@2；CH（芳香）@3…） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 27 處（C（芳香）@1；CH（芳香）@2；CH（芳香）@3…） | |
| 吸濕（RH 50%） | 5.208 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 非晶；；未涵蓋 1 處 | |

### 2.15 P 單元 B（萘基次甲基）（聚合物重複單元）

結構：[\*:1]C([\*:2])c1ccc2ccccc2c1；來源：Phase 4（成分 P）

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | 78.2 | cm³/mol | 理論估算 | van Krevelen 2009 4.2.3 節 |  | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 11 處（CH@1；C（芳香）@3；CH（芳香）@4…） | |
| Vm／密度 | — | cm³/mol | 缺基團／缺值 | van Krevelen 2009 4.3.7 節 | 缺 11 處（CH@1；C（芳香）@3；CH（芳香）@4…） | |
| CTE α 橡膠態 | 0.000625 | K⁻¹ | 理論估算 | van Krevelen 2009 4.4 節 MTE 模型 |  | |
| CTE α 玻璃態（式 4.18） | 0.0002812 | K⁻¹ | 理論估算 | van Krevelen 2009 4.4 節 MTE 模型 |  | |
| CTE α 玻璃態（由 Tg，式 4.27） | — | K⁻¹ | 缺基團／缺值 | van Krevelen 2009 4.4 節 MTE 模型 |  | |
| 自由體積 Vf（使用者經驗法） | 29.1 | cm³/mol | 理論估算 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） |  | |
| 介電常數 ε（式 11.8） | — |  | 缺基團／缺值 | van Krevelen 2009 11.2.3 節 | 缺基團（見 /dielectric） | |
| 分子極化率 α′ | — | Å³ | 缺基團／缺值 | van Krevelen 2009 10.2 節 Table 10.4（R_LL，λ = 589 nm，書頁 293–294）；α 由式 (11.10)、(11.11)（書頁 32… | 缺基團（見 /dielectric） | |
| Tb／Tf | — | K | 不適用 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 | 聚合物單元不適用 | |
| TPSA | 0 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 | 以甲基封端估算 | |
| LogP | 3.963 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 | 以甲基封端估算 | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 11 處（CH@1；C（芳香）@3；CH（芳香）@4…） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 11 處（CH@1；C（芳香）@3；CH（芳香）@4…） | |
| 吸濕（RH 50%） | 0.026 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 非晶；括號值；未涵蓋 4 處 | |

### 2.16 E PGMA 型環氧單元（聚合物重複單元）

結構：[\*:1]CC([\*:2])(C)C(=O)OCC1CO1；來源：Phase 4（成分 E）

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | — | cm³/mol | 缺基團／缺值 | van Krevelen 2009 4.2.3 節 | 缺 3 處（CH@9；CH2@10；O@11） | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 6 處（C@2；CH3@4；CH2@8…） | |
| Vm／密度 | — | cm³/mol | 缺基團／缺值 | van Krevelen 2009 4.3.7 節 | 缺 8 處（C@2；CH3@4；C@5…） | |
| CTE | — | K⁻¹ | 缺基團／缺值 | van Krevelen 2009 4.4 節 MTE 模型 | 缺 3 處（CH@9；CH2@10；O@11） | |
| 自由體積 Vf（使用者經驗法） | 68.2 | cm³/mol | 理論估算 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） |  | |
| 介電常數 ε（式 11.8） | — |  | 缺基團／缺值 | van Krevelen 2009 11.2.3 節 | 缺基團（見 /dielectric） | |
| 分子極化率 α′ | — | Å³ | 缺基團／缺值 | van Krevelen 2009 10.2 節 Table 10.4（R_LL，λ = 589 nm，書頁 293–294）；α 由式 (11.10)、(11.11)（書頁 32… | 缺基團（見 /dielectric） | |
| Tb／Tf | — | K | 不適用 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 | 聚合物單元不適用 | |
| TPSA | 38.8 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 | 以甲基封端估算 | |
| LogP | 1.365 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 | 以甲基封端估算 | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 6 處（C@2；CH3@4；CH2@8…） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 8 處（C@2；CH3@4；C@5…） | |
| 吸濕（RH 50%） | 0.7613 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 非晶；括號值；未涵蓋 1 處 | |

### 2.17 BT01 苯酚 Novolac（PN）（骨架範本單元）

結構：[\*:1]Cc1cc([\*:2])ccc1O；來源：骨架範本（任務 023）

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | 59.0 | cm³/mol | 理論估算 | van Krevelen 2009 4.2.3 節 |  | |
| Tg | 415.9 | K（142.8 °C） | 理論估算 | van Krevelen 2009 式 6.4–6.5 | 含校準基團 | |
| Vm／密度 | — | cm³/mol | 缺基團／缺值 | van Krevelen 2009 4.3.7 節 | 缺 7 處（C（芳香）@2；CH（芳香）@3；C（芳香）@4…） | |
| CTE α 橡膠態 | 0.000625 | K⁻¹ | 理論估算 | van Krevelen 2009 4.4 節 MTE 模型 |  | |
| CTE α 玻璃態（式 4.18） | 0.0002812 | K⁻¹ | 理論估算 | van Krevelen 2009 4.4 節 MTE 模型 |  | |
| CTE α 玻璃態（由 Tg，式 4.27） | 0.0002713 | K⁻¹ | 理論估算 | van Krevelen 2009 4.4 節 MTE 模型 |  | |
| 自由體積 Vf（使用者經驗法） | 23.2 | cm³/mol | 理論估算 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） |  | |
| 介電常數 ε（式 11.8） | — |  | 缺基團／缺值 | van Krevelen 2009 11.2.3 節 | 缺基團（見 /dielectric） | |
| 分子極化率 α′ | — | Å³ | 缺基團／缺值 | van Krevelen 2009 10.2 節 Table 10.4（R_LL，λ = 589 nm，書頁 293–294）；α 由式 (11.10)、(11.11)（書頁 32… | 缺基團（見 /dielectric） | |
| Tb／Tf | — | K | 不適用 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 | 聚合物單元不適用 | |
| TPSA | 20.2 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 | 以甲基封端估算 | |
| LogP | 2.263 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 | 以甲基封端估算 | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 7 處（C（芳香）@2；CH（芳香）@3；C（芳香）@4…） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 7 處（C（芳香）@2；CH（芳香）@3；C（芳香）@4…） | |
| 吸濕（RH 50%） | 8.515 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 非晶；括號值 | |

### 2.18 BT03 酚醛環氧（EPN）（骨架範本單元）

結構：[\*:1]Cc1cc([\*:2])ccc1OCC2CO2；來源：骨架範本（任務 023）

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | — | cm³/mol | 缺基團／缺值 | van Krevelen 2009 4.2.3 節 | 缺 3 處（CH@11；CH2@12；O@13） | |
| Tg | — | K | 缺基團／缺值 | van Krevelen 2009 式 6.4–6.5 | 缺 10 處（C（芳香）@2；CH（芳香）@3；C（芳香）@4…） | |
| Vm／密度 | — | cm³/mol | 缺基團／缺值 | van Krevelen 2009 4.3.7 節 | 缺 10 處（C（芳香）@2；CH（芳香）@3；C（芳香）@4…） | |
| CTE | — | K⁻¹ | 缺基團／缺值 | van Krevelen 2009 4.4 節 MTE 模型 | 缺 3 處（CH@11；CH2@12；O@13） | |
| 自由體積 Vf（使用者經驗法） | 30.0 | cm³/mol | 理論估算 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） |  | |
| 介電常數 ε（式 11.8） | — |  | 缺基團／缺值 | van Krevelen 2009 11.2.3 節 | 缺基團（見 /dielectric） | |
| 分子極化率 α′ | — | Å³ | 缺基團／缺值 | van Krevelen 2009 10.2 節 Table 10.4（R_LL，λ = 589 nm，書頁 293–294）；α 由式 (11.10)、(11.11)（書頁 32… | 缺基團（見 /dielectric） | |
| Tb／Tf | — | K | 不適用 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 | 聚合物單元不適用 | |
| TPSA | 21.8 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 | 以甲基封端估算 | |
| LogP | 2.335 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 | 以甲基封端估算 | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 10 處（C（芳香）@2；CH（芳香）@3；C（芳香）@4…） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 9 處（C（芳香）@2；CH（芳香）@3；C（芳香）@4…） | |
| 吸濕（RH 50%） | 0.2453 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 非晶；括號值 | |

### 2.19 BT05 雙酚 A 環氧（BADGE 型）（骨架範本單元）

結構：[\*:1]Oc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC(O)C[\*:2]；來源：骨架範本（任務 023）

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | 160.0 | cm³/mol | 理論估算 | van Krevelen 2009 4.2.3 節 |  | |
| Tg | 398.9 | K（125.7 °C） | 理論估算 | van Krevelen 2009 式 6.4–6.5 |  | |
| Vm／密度 | — | cm³/mol | 缺基團／缺值 | van Krevelen 2009 4.3.7 節 | 缺 2 處（O@1；O@17） | |
| CTE α 橡膠態 | 0.000625 | K⁻¹ | 理論估算 | van Krevelen 2009 4.4 節 MTE 模型 |  | |
| CTE α 玻璃態（式 4.18） | 0.0002812 | K⁻¹ | 理論估算 | van Krevelen 2009 4.4 節 MTE 模型 |  | |
| CTE α 玻璃態（由 Tg，式 4.27） | 0.0002728 | K⁻¹ | 理論估算 | van Krevelen 2009 4.4 節 MTE 模型 |  | |
| 自由體積 Vf（使用者經驗法） | 60.4 | cm³/mol | 理論估算 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） |  | |
| 介電常數 ε（式 11.8） | 2.775 |  | 理論估算 | van Krevelen 2009 11.2.3 節 |  | |
| 分子極化率 α′ | 32.7 | Å³ | 理論估算 | van Krevelen 2009 10.2 節 Table 10.4（R_LL，λ = 589 nm，書頁 293–294）；α 由式 (11.10)、(11.11)（書頁 32… |  | |
| Tb／Tf | — | K | 不適用 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 | 聚合物單元不適用 | |
| TPSA | 38.7 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 | 以甲基封端估算 | |
| LogP | 4.171 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 | 以甲基封端估算 | |
| Tm | 605.0 | K | 理論估算 | van Krevelen 2009 6.3 節式 6.20–6.21 | Tm 只在聚合物可結晶時有意義（未指定 crystallizable） | |
| Td,1/2 | 675.2 | K | 理論估算 | van Krevelen 2009 21.2.2 節式 21.4 | 半分解溫度，非 Td5 | |
| 吸濕（RH 50%） | 3.318 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 非晶；括號值；未涵蓋 1 處 | |

### 2.20 BT06 雙酚茀環氧（Cardo）（骨架範本單元）

結構：[\*:1]Oc1ccc(cc1)C1(c2ccccc2-c2ccccc21)c1ccc(cc1)OCC(O)C[\*:2]；來源：骨架範本（任務 023）

| 物性 | 數值 | 單位 | 狀態 | 出處 | 缺基團／警告 | 使用者判定（對／錯／備註） |
|---|---|---|---|---|---|---|
| VW | 217.5 | cm³/mol | 理論估算 | van Krevelen 2009 4.2.3 節 |  | |
| Tg | 452.4 | K（179.3 °C） | 理論估算 | van Krevelen 2009 式 6.4–6.5 | 含校準基團 | |
| Vm／密度 | — | cm³/mol | 缺基團／缺值 | van Krevelen 2009 4.3.7 節 | 缺 15 處（O@1；C@8；C（芳香）@9…） | |
| CTE α 橡膠態 | 0.000625 | K⁻¹ | 理論估算 | van Krevelen 2009 4.4 節 MTE 模型 |  | |
| CTE α 玻璃態（式 4.18） | 0.0002812 | K⁻¹ | 理論估算 | van Krevelen 2009 4.4 節 MTE 模型 |  | |
| CTE α 玻璃態（由 Tg，式 4.27） | 0.000268 | K⁻¹ | 理論估算 | van Krevelen 2009 4.4 節 MTE 模型 |  | |
| 自由體積 Vf（使用者經驗法） | 82.1 | cm³/mol | 理論估算 | 使用者定義的經驗自由體積法（依論文整理，論文清單待補；未經獨立驗證） |  | |
| 介電常數 ε（式 11.8） | — |  | 缺基團／缺值 | van Krevelen 2009 11.2.3 節 | 缺基團（見 /dielectric） | |
| 分子極化率 α′ | — | Å³ | 缺基團／缺值 | van Krevelen 2009 10.2 節 Table 10.4（R_LL，λ = 589 nm，書頁 293–294）；α 由式 (11.10)、(11.11)（書頁 32… | 缺基團（見 /dielectric） | |
| Tb／Tf | — | K | 不適用 | Joback & Reid (1987) 基團加成法，Chem. Eng. Commun. 57, 233–243 | 聚合物單元不適用 | |
| TPSA | 38.7 | Å² | 理論估算 | Ertl, Rohde & Selzer (2000) 拓撲極性表面積（RDKit tpsa，只計 N、O 片段），J. Med. Chem. 43, 3714–3717 | 以甲基封端估算 | |
| LogP | 6.208 |  | 理論估算 | Wildman & Crippen (1999) 原子貢獻法（RDKit CrippenClogP），J. Chem. Inf. Comput. Sci. 39, 868–873 | 以甲基封端估算 | |
| Tm | — | K | 缺基團／缺值 | van Krevelen 2009 6.3 節式 6.20–6.21 | 缺 13 處（C@8；C（芳香）@9；CH（芳香）@10…） | |
| Td,1/2 | — | K | 缺基團／缺值 | van Krevelen 2009 21.2.2 節式 21.4 | 缺 13 處（C@8；C（芳香）@9；CH（芳香）@10…） | |
| 吸濕（RH 50%） | 2.338 | g 水／100 g 聚合物 | 理論估算 | van Krevelen 2009 18.3.4 節 Table 18.14（引 Barrie 1968） | 非晶；括號值；未涵蓋 1 處 | |

## 三、實測比對

模板：user-measured-template.csv（同資料夾，3 列示範，標「示範，非實測」，數字是佔位值，不是實驗結果）。腳本：engine/scripts/compare_measured.py。

- 欄位：配方或樣品名、結構（SMILES 或名稱）、實測 Tg（°C）、測量條件、用途（校準／驗證）、備註，另有選填的材料家族（分組統計用，沒填歸「未分類」）。
- 結構請填單一聚合物重複單元的 SMILES（含 * 連接點）；填名稱或多成分配方，腳本只會列出「無法計算」，不進統計。
- 輸出：每筆的預測 Tg、誤差（預測減實測，°C）；依材料家族的筆數、平均誤差、平均絕對誤差、最大絕對誤差。用途為「校準」的列另列、不併入驗證誤差。
- D02：腳本呼叫引擎時只傳結構；實測值在預測完成後才用來算誤差，不傳進任何計算函式、不寫進任何資料表。
- 加 --include-demo 可把示範列也納入統計，用來看輸出格式。
