# MoleForm × Lithography Simulator：Windows 本機整合開發與科學驗證規劃

> 版本：v1.0 ｜整理日期：2026-11-13  
> 文件用途：供個人研發、Codex 開發、Claude Code 審查及後續版本管理使用。  
> 定位：**開發規格與驗證計畫**，不是已完成的程式、經實測認證的預測模型或商用 PROLITH 的原始技術規格。

## 0. 決策摘要

- **最終產品：**一套可離線運作的 Windows 桌面程式，整合 MoleForm 的分子／配方物性與自主研發的微影模擬功能。
- **架構：**同一個桌面 GUI、專案管理及材料資料庫；內部保留**獨立的配方物性引擎**與**獨立的微影物理引擎**，透過有版本、單位及資料來源的介面交換參數。
- **保護現有成果：**不因整合而重寫既有 MoleForm 運算；先建立回歸基準，再加入本機容器與新模組。
- **微影完整計算鏈：**Mask / Illumination → Aerial Image → Film-stack / Standing Waves → Exposure Chemistry → PEB → Development → CD / Profile / FEM →（選配）Etching / Yield。
- **驗證策略：**數學解析解 → 數值收斂 → 原始文獻與 Workbook 案例 → 整合／回歸測試 → 獨立實驗預測驗證。
- **不能混淆：**能執行、符合數學解析解、重現論文趨勢、成功擬合量測值，以及能預測新配方／新製程，都是**不同層級**的證據。
- **時程：**在密集投入、AI 協助編碼、優先採用簡化模型的情境下，基礎版約 2–4 週，核心版約 1–2 個月，全功能*初版*約 2–4 個月；嚴格數值／文獻／實驗校正可能需 6–12 個月以上。這只是規劃範圍，不是工期承諾。整合後還需計入資料介面、GUI 封裝及回歸工作。

## 1. 參考文件與證據定位

### 1.1 使用者提供的原始文件

1. **KLA-Tencor, *PROLITH Workbook*, v7.2 (2002), 125 頁。**
   - 用途：功能要求、使用情境、模擬掃描與輸出示例、參考趨勢、個別數值案例。
   - 11 章：NILS；DOF；CD Swing；BARC；Film Stack；PEB/Standing Waves；CAR 的 Exposure vs Thermal Dose；Coma；Yield Analyzer；Speed/Accuracy；Etching。
2. **Chris A. Mack, *Inside PROLITH: A Comprehensive Guide to Optical Lithography Simulation*, v5.0 (1997), 179 頁 PDF。**
   - 用途：光學繞射、Standing Waves、Contact/Proximity、曝光動力學、Dill ABC、Bake、Development、CD Metrology、LPM、微影分析的物理推導與建模方法。
   - 特別有用：Ch.2–3（光學與膜內光場）、Ch.5（曝光動力學與 ABC 量測）、Ch.6（Bake）、Ch.7（Mack 顯影）、Ch.8（CD 量測）、Ch.9（LPM）。

**限制：**兩份文件是不同版本、不同定位，不能假設任一文件提供了新版 PROLITH 的所有內部演算法；Workbook 某些練習依賴未提供的預設材料檔，不能在缺參數時宣稱重現原始絕對 CD。下文標示為「建議／延伸」的模型及架構，是依公開科學方法提出的工程設計，不等同文件逐字規定。

### 1.2 待建完整來源追溯

每一個被採用的方程式／模型必須在程式中記錄：來源文件、章節／頁碼／方程式編號、DOI 或正式出版資訊、假設、單位、適用條件、實作版本，以及有無使用作者原有程式碼。使用開源元件前，另獨立核對**當前版本**的授權與相依套件授權。

## 2. 整合架構與流程

```text
┌──────────────────────────────────────────────────┐
│ Windows Desktop UI / Project Manager             │
│ MoleForm | Materials | Lithography | Validation  │
└──────────────────────┬───────────────────────────┘
                       │
          Shared typed data contracts + units
                       │
     ┌─────────────────┴──────────────────┐
     │                                    │
┌────▼────────────────┐     ┌────────────▼────────────────────┐
│ MoleForm Engine      │     │ Lithography Engine              │
│ Structure / pKa / Tg │     │ Mask / Optics / Film Stack      │
│ Formulation / Props  │     │ Exposure / PEB / Develop / Etch │
└────────┬─────────────┘     └────────────┬────────────────────┘
         │                                │
         └─────────────┬──────────────────┘
                       ▼
        Material DB / Provenance / DOI
        Calibration / Validation / Results
```

### 2.1 建議 Windows 技術堆疊

| 領域 | 建議技術 | 說明 |
|---|---|---|
| Windows 主程式 | PySide6 / Qt | 原生視窗、檔案、工作排程；若 MoleForm 既有前端為網頁，可評估 Qt WebEngine 嵌入。**要先檢查實際現有架構**。 |
| 物理數值 | NumPy、SciPy | FFT、常微分／偏微分方程、擬合、最佳化 |
| CPU 加速 | Numba | 針對瓶頸熱點加速 |
| GPU（選配） | PyTorch | 大型批次與部分陣列演算；不應成為基本功能必要條件 |
| 薄膜 | `tmm` 或自主 TMM | 以解析 Fresnel 與能量守恆交叉驗證 |
| 化學結構 | RDKit | 沿用 MoleForm 已有的分子處理能力，若已有 |
| 光罩 | gdstk、Shapely | 圖形處理、GDSII |
| 繪圖 | pyqtgraph、Matplotlib | 即時圖表、等高線、Bossung |
| 立體視覺化 | PyVista / VTK | 3D profile |
| 資料保存 | SQLite + HDF5/h5py | 材料與文獻索引／大型場資料 |
| 資料模式與單位 | Pydantic、Pint | 結構檢查與單位轉換 |
| 測試與封裝 | pytest、Windows 封裝工具 | 回歸及獨立 EXE/安裝檔 |

**技術風險：**PySide6、Qt WebEngine、GPL 元件、封裝套件可能涉及不同散布與連結義務，需在實際部署方式確定後檢查授權。

### 2.2 材料交換設計

MoleForm 可輸出材料識別、結構、組成、pKa、Tg、可估算的物性；微影引擎使用這些資訊，並額外需要 n/k、Dill ABC、PAG 有效產酸參數、酸擴散、淬熄反應、去保護、顯影速率等。

- **禁止自動填補無依據參數：**pKa、Tg 或自由體積不能直接視為已知酸擴散係數、去保護速率或產酸效率。
- 參數來源明確區分：`measured / literature / fitted / predicted / assumed / missing`。
- 每筆參數記錄：值、單位、波長／溫度／濃度／組成／測量方法、資料來源、模型版本、不確定度。
- 欠缺必要參數時，須阻擋定量模擬或標示僅為探索情境；不可無提示地給予定量可信度。
- 化學結構與配方資料需要允許「只有部分資訊」的情況，以免使用者不能匯入外部商用材料。

## 3. 核心微影模組與公式

> 下列式子是**模型規劃起點**。正式實作前需逐式核對原始來源、符號慣例及限制條件。

### M01 光罩與照明（Workbook Ch.1、8）

- **模型：**1D Line/Space、2D Contact/Array、Binary、Phase Shift、GDSII；Conventional／Annular／Dipole／Quadrupole／自訂 Source。
- **透射函數：**\(m(x,y)=a(x,y)e^{i\phi(x,y)}\)。
- **輸入：**CD、Pitch、Duty Cycle、Bias、Amplitude/Phase、Source Shape、Partial Coherence、Wavelength、旋轉角度。
- **輸出：**光罩傳輸影像、繞射頻譜、繞射級次。
- **驗證：**週期性方波 Fourier 係數、孤立狹縫 sinc 頻譜、對稱性、取樣／aliasing。

### M02 Aerial Image（Workbook Ch.1；Inside PROLITH Ch.2）

- **理論：**Abbe 光源積分、Hopkins TCC、選配 SOCS；高 NA 需另用向量模型。
- **部分同調光學近似：**

\[
I(x,y)=\int S(\mathbf s)\left|\mathcal F^{-1}\left\{\widetilde m(\mathbf f)P(\mathbf f;\mathbf s)\right\}\right|^2d\mathbf s.
\]

- **輸入：**Wavelength、NA、Source Distribution、Focus、Pupil/Polarization、Mask。
- **輸出：**Aerial Image、Contrast、PSF、NILS、Through-Focus Images。
- **驗證：**Fraunhofer/FFT 解析例、Airy pattern、截止頻率、強度正規化、Abbe–Hopkins 一致性。

### M03 NILS、DOF、FEM（Workbook Ch.1–2）

\[
NILS=w\left|\frac{1}{I}\frac{dI}{dx}\right|_{\mathrm{edge}}.
\]

- 以 CD、Sidewall Angle、Resist Loss 規格構成 Focus–Exposure Process Window；依曝光誤差容忍度求 DOF/EL。
- Workbook 的 \(EL\approx NILS/2\) 僅適用於特定理想／高對比近似，不能作為真實光阻唯一 EL 模型。
- **輸入：**Focus/Dose 掃描、CD Target/Tolerance、輪廓規格。
- **輸出：**NILS–Focus、Bossung、FEM、DOF、EL、最佳 Focus/Dose。
- **驗證：**Workbook Ch.1 第 10–13 頁的 365 nm、NA 0.5、σ 0.5、500 nm Line、1000 nm Pitch；Ch.2 FEM、矩形／橢圓窗口。

### M04 多層膜、BARC、Standing Waves（Workbook Ch.3–5；Inside PROLITH Ch.3）

- **方法：**Fresnel + Transfer Matrix Method (TMM)，法向與斜入射、TE/TM、複數折射率。
- **單層膜：**

\[
r=\frac{r_{01}+r_{12}e^{2i\delta}}{1+r_{01}r_{12}e^{2i\delta}},\quad
\delta=\frac{2\pi\widetilde n_1d}{\lambda},\quad R=|r|^2.
\]

- **近似膜厚週期：**\(\Delta d\simeq\lambda/(2n)\)（法向入射、折射率近似固定時）。
- **輸入：**波長、入射角、偏振、膜層順序、各層 n/k/厚度、吸收與色散。
- **輸出：**R/T/A、吸收深度、駐波、Swing Curve、BARC 厚度最佳化。
- **驗證：**Fresnel 解析解、無吸收層與有吸收層能量守恆、Workbook Ch.3–5 趨勢。
- **警告：**影像光學與薄膜光學的複數相位、\(n+i\kappa\) 或 \(n-i\kappa\) 慣例需一致並配對時間因子；不能混用。

### M05 傳統正型光阻的 Dill ABC（Inside PROLITH Ch.5；Workbook Ch.6）

\[
\alpha(z,t)=A M(z,t)+B,\qquad
\frac{\partial M}{\partial t}=-C I(z,t) M(z,t).
\]

- **適用：**經適當校正的傳統 PAC／DNQ 型光阻；不是全部 CAR 的通用模型。
- **輸入：**A、B、C、PAC 初始濃度、膜厚、曝光強度／劑量、光場。
- **輸出：**PAC 潛像、吸收／bleaching、穿透率–Dose 曲線。
- **驗證：**均勻光照解析衰減、濃度界限、透射率實驗。Inside PROLITH Ch.5 §D 提供 ABC 量測與參數萃取策略；若 A=0，單純透光率量測無法識別 C。

### M06 CAR：PAG／PEB／酸擴散／淬熄／去保護（Workbook Ch.7；Inside PROLITH Ch.5–6）

一種可選的**有效反應–擴散模型**：

\[
\frac{\partial P}{\partial t}=-k_pIP,\quad
\left.\frac{\partial H}{\partial t}\right|_{\rm gen}=\eta k_pIP
\]

\[
\frac{\partial H}{\partial t}=\nabla\!\cdot(D_H\nabla H)-k_qHQ-k_{\rm loss}H,
\quad \frac{\partial Q}{\partial t}=-k_qHQ,
\quad \frac{\partial B}{\partial t}=-k_dH^mB.
\]

\[
k(T)=k_0e^{-E_a/(RT)},\quad L_{\rm RMS,1D}=\sqrt{2Dt}.
\]

- **說明：**上式是示範性可擴充模型，實際 PAG、光阻、反應機制及邊界條件應依文獻或量測調整，不能宣稱就是商用 PROLITH 全部內部公式。
- **輸入：**PAG/Quencher、產酸率、Diffusivity、反應速率、活化能、溫度時間曲線、表面／底材酸損失。
- **輸出：**酸濃度、PEB 後去保護率、反應／擴散效應。
- **驗證：**零反應解析解、Gaussian 擴散、非負性、質量收支、時間步長收斂、曝光劑量與熱劑量互補趨勢。Workbook 的 \(N_{\rm deblocked}\approx CEK_{\rm amp}t\) 為簡化近似。

### M07 顯影與 CD / Resist Profile（Inside PROLITH Ch.7–9）

- **模型：**Threshold（快速）、Mack / Enhanced Mack（參數化）、實測 Development Rate Table、界面推進（Eikonal／Level Set）。
- **示意：**\(R_{dev}=f(M)\) 或 CAR 的 \(R_{dev}=f(X_{deprot})\)；\(\partial_t\phi+v_n|\nabla\phi|=0\)。
- **輸入：**溶解速率曲線、Rate Min/Max、Threshold、Development Time、Developer、溫度、Surface Inhibition。
- **輸出：**2D/3D Profile、Top/Middle/Bottom CD、SWA、Resist Loss、Undercut/Scumming。
- **驗證：**平面等速顯影與圓形等向界面解析解、SEM 剖面、深度網格收斂、不同 CD 定義的一致性。

### M08 像差、偏振、高 NA（Workbook Ch.8；Inside PROLITH Ch.2）

\[
W(\rho,\theta)=\sum_j a_jZ_j(\rho,\theta),\qquad
P=P_0\exp\!\left(i2\pi W/\lambda\right).
\]

- **注意：**Zernike 的索引、正規化與係數單位依來源而異，須明確記錄。
- **輸入：**Zernike 係數、NA、Polarization、Pattern Orientation。
- **輸出：**PSF、CD Bias、Image Placement Error、方向性敏感度。
- **驗證：**無像差對照、Coma 正負方向性、圖形旋轉、Workbook Ch.8。

### M09 Yield / Monte Carlo（Workbook Ch.9）

\[
\hat Y=\frac1N\sum_i\mathbf 1(CD_{min}\le CD_i\le CD_{max}).
\]

- **輸入：**Dose/Focus/膜厚／PEB 的分布、平均、標準差、相互相關與 CD 規格。
- **輸出：**CD Histogram、Yield、Cpk、Sensitivity、Robust Optimization。
- **驗證：**線性高斯解析解、固定亂數種子重現、與 Workbook 特定 BARC/良率案例比較。
- **注意：**這是參數導致的 CD 合格率，不是包含所有污染或製程失效的真實總良率。

### M10 數值精度與效能（Workbook Ch.10）

\[\Delta x=L_x/(N_x-1).\]

- **控制：**光源點數、Diffraction Order、FFT 取樣、薄膜深度網格、時間步長、求解器誤差、公差、CPU/GPU。
- **模式：**Fast／Standard／Accurate（各數值細項仍可獨立控制）。
- **驗證：**網格與步長收斂、記憶體及執行時間、CPU/GPU 一致性。網格收斂不等於實際預測準確度。

### M11 Etching（Workbook Ch.11）

\[\partial_t\phi+v_n|\nabla\phi|=0.\]

- **輸入：**各材料垂直／橫向 Etch Rate、Selectivity、Angle Dependence、Faceting、Mask Erosion、Etch Time。
- **輸出：**Etch Profile、Depth、Etch CD、Mask Loss。
- **驗證：**等向與純垂直蝕刻幾何例、選擇比測試、截面 SEM；完整電漿反應不能僅靠此幾何模型推論。

### M12–M20 預留進階功能

EUV 13.5 nm 與 High-NA EUV、RCWA/FDTD、Photon Shot Noise、PAG 統計、LER/LWR、OPC/ILT、模型參數反算、不確定度分析、配方比較、DOE／多目標最佳化。

**優先額外加入：**材料參數反算／實驗校正與不確定度，而不是先投入最高階 3D EUV 模擬。

## 4. MoleForm 模組驗證

| 子模組 | 參考基準 | 證據／注意事項 |
|---|---|---|
| 分子辨識 | RDKit、獨立人工化學結構審查 | SMILES、立體化學、質子化態、互變異構 |
| 化學式／分子量 | 化學計量與獨立解析結果 | 同位素、鹽、混合物 |
| pKa | 原始實測資料、已知化合物 | 溶劑、溫度、離子強度、解離位點 |
| Hammett / Taft | 原始常數表與例題 | 母體家族、適用範圍、符號、σ 的定義 |
| Tg | DSC、論文、分子量／共聚物獨立資料集 | 不得混淆 Tg、軟化點、分解／交聯轉變 |
| 混合 Tg | 實際混合物 Tg 與分離驗證集 | Gordon–Taylor / Fox 等模型各自限制 |
| 配方物性 | 同成分不同濃度的實驗系列 | 資料切分避免相似配方洩漏 |
| PAG 相關物性 | 產酸量、動力學、酸性及環境測試 | pKa 不能取代產酸量子效率／擴散係數 |

預測模型必須有**不參與擬合的測試集**並報告：

\[
MAE=\frac1N\sum_i|y_i^{pred}-y_i^{exp}|,\qquad
RMSE=\sqrt{\frac1N\sum_i(y_i^{pred}-y_i^{exp})^2}.
\]

應按化學家族、結構距離、溫度、分子量或配方類型分群檢查，不可只報整體 MAE。

## 5. 本機科學驗證中心（Scientific Validation Center）

### 5.1 五層驗證

1. **Mathematical Verification：**公式、單位、解析解與守恆關係。
2. **Numerical Verification：**空間網格、時間步長、積分點及收斂性；不同演算法交叉比對。
3. **Literature / Workbook Benchmark：**重現指定條件、圖形及可取得的數值；缺少材料檔時只確認能支持的趨勢。
4. **Integration / Regression：**資料轉換、材料 ID、功能隔離、版本升級後結果不變。
5. **Experimental Validation：**實驗獨立測試、材料參數校正、SEM／DSC／透光率／顯影速率實測。

### 5.2 優先測試表

| ID | 檢查內容 | 參考 |
|---|---|---|
| WB-01 | 365 nm、NA=0.5、σ=0.5、500 nm Line、Pitch=1000 nm；NILS vs Focus 0–2 μm | Workbook Ch.1 |
| WB-02 | 250／350／450 nm 的 NILS–Focus | Workbook Ch.1 |
| WB-03 | NA 0.4／0.5／0.6 的 NILS–Focus | Workbook Ch.1 |
| WB-04 | Bossung／FEM、CD／SWA／Resist Loss 規格 | Workbook Ch.2 |
| WB-05 | Resist Thickness／Reflectivity／CD Swing | Workbook Ch.3 |
| WB-06 | BARC 最佳膜厚 | Workbook Ch.4 |
| WB-07 | Film-stack 反射率 | Workbook Ch.5 |
| WB-08 | PAC 擴散、PEB 時間、Standing Waves | Workbook Ch.6 |
| WB-09 | Exposure vs PEB Temperature/Time | Workbook Ch.7 |
| WB-10 | Coma 對圖形位移與 CD | Workbook Ch.8 |
| WB-11 | BARC 厚度導致的 CD 分布與良率 | Workbook Ch.9 |
| WB-12 | 網格與精度／速度 | Workbook Ch.10 |
| WB-13 | 蝕刻幾何及時間演化 | Workbook Ch.11 |
| ANA-01 | Fresnel 反射 | 解析解 |
| ANA-02 | 平面波／狹縫 Fraunhofer、Airy 圖樣 | 解析解 |
| ANA-03 | PAC 均勻光照一級衰減 | 解析解 |
| ANA-04 | Gaussian Diffusion：\(\sigma_t^2=\sigma_0^2+2Dt\) | 解析解 |
| ANA-05 | 平面與圓形顯影界面 | 解析解 |
| INT-01 | MoleForm 材料匯入 → Lithography 的參數單位、來源與版本 | 整合測試 |
| INT-02 | 原 MoleForm 結果不因微影模組加入而改變 | 回歸測試 |

**Workbook 良率參考案例（僅針對原書對應條件）：**BARC=45 nm：Yield 83%、CD σ 13.3 nm、Cpk 0.32；140 nm：100%、6.1 nm、0.94；125 nm：100%、5.6 nm、1.02。不能在欠缺原書預設材料參數時宣稱重現。

### 5.3 初步工程驗收門檻（提案，非官方規格）

- Fresnel 解析例相對誤差：≤ 10⁻⁶（避開理論值接近零時應改用絕對誤差）。
- 被動材料 TMM 能量平衡：\(|R+T+A-1|\le10^{-6}\)，依數值條件調整。
- Gaussian Diffusion 相對 L2 誤差：≤ 1%。
- NILS 網格再細化後變化：≤ 1%；CD 網格再細化後變化：≤ 1 nm 或明定相對公差。
- 反應物非負、必要質量收支守恆（必須把生成／消耗／邊界通量一起列入）。
- Monte Carlo 固定種子可重現；不同種子需檢查統計信賴區間。
- 實驗預測精度：**不能預先給通用精度保證**；依材料與資料規模先訂定測試規格。

### 5.4 結果狀態、不能被誤解的「通過」

- `Analytical verified`：對應解析例通過。
- `Numerically converged`：對應網格／時間收斂通過。
- `Literature benchmarked`：已經與指定文獻／Workbook 案例比較。
- `Calibrated`：有使用實驗資料擬合參數。
- `Predictively validated`：有未參與擬合的外部／保留資料測試。
- `Exploratory / Insufficient data`：缺少支持定量結論的參數或證據。

**不得**因單一欄位通過就把整個模組標示「已完成科學驗證」。

### 5.5 每項測試必須輸出

`test_id`、軟體/模型版本、引用文獻與頁碼／DOI、輸入／單位／條件、參考值、計算值、絕對與相對誤差、網格設定、收斂趨勢、參數來源、資料集劃分、PASS/FAIL/INCOMPLETE、可重現的環境資訊與報告。

## 6. Codex / Claude Code / 使用者分工

```text
原始文獻與需求 → 規格及驗證案例
             ↓
Codex：開發程式 + pytest + 文件
             ↓
Claude Code：獨立審核化學/物理公式、單位、適用範圍與盲點
             ↓
獨立解析解／交叉求解器／Workbook 比對
             ↓
使用者：檢查科學判斷、材料來源、實驗可比性
             ↓
CI 或本機驗證通過 → 模組合併／版本封存
```

- 讓不同 AI 審查，不代表雙重 AI 同意就是正確；**真實基準須獨立**於待驗證程式與 AI 結論。
- 每次更改物理公式都必須附更新紀錄、參考文獻與新的回歸測試。
- 本機驗證中心自動列出「未驗證」「失敗」「缺參數」，不以曲線好看取代數值證據。
- 敏感研發配方在本機保存與處理，雲端同步必須另有明確授權。

## 7. 優先里程碑與交付標準

| 版本 | 內容 | 必須通過 |
|---|---|---|
| 0.1 | Windows 容器、共用 Schema、MoleForm 現有結果回歸；Mask／Aerial／NILS | INT-01/02、WB-01～03 |
| 0.2 | TMM、Film Stack、BARC、Standing Waves | ANA-01、WB-05～07 |
| 0.3 | Dill ABC、LPM、傳統 PAC、CAR 反應–擴散初版 | ANA-03/04、WB-08～09 |
| 0.4 | Mack 顯影、2D Profile、CD、FEM、Bossung | ANA-05、WB-04、輪廓收斂 |
| 0.5 | Zernike、Yield、Etch | WB-10～13 |
| 1.0 | 完整 GUI／材料 DB／參數反算／報告／自動驗證／Windows 封裝 | 所有核心驗證、端到端回歸及清楚的未驗證清單 |
| 2.x | EUV、厚光罩電磁、隨機、LER/LWR、OPC/ILT、進階 3D | 各自建立新 benchmark，不沿用簡化模型的驗收 |

**開發優先順序應由依賴關係決定，不直接照教科書章節順序；**《Inside PROLITH》提到的 LPM 與材料參數萃取可以提前，讓還沒有完整顯影引擎時仍可進行有明確限制的快速探索分析。

## 8. 自行驗證需要／不需要的設備

| 項目 | 沒有實驗儀器能否驗證 |
|---|---|
| 公式、解析解、守恆、單位、數值收斂 | 可以 |
| Aerial Image / NILS / TMM / PDE 求解器正確性 | 可以 |
| Workbook 有完整參數的案例 | 可以比對 |
| Workbook 缺材料參數的案例 | 只能比較可支持的特徵／趨勢 |
| pKa / Tg 文獻外部測試 | 有公開且獨立的測試資料就可做 |
| 真實 PAG 產酸／擴散、顯影速度、精準 CD | 需要可靠實驗／文獻量測資料 |
| 新配方的外部預測能力 | 必須有未參與模型擬合的新資料 |

可取得實驗資料時，優先搜集：Ellipsometry n/k、膜厚、UV-Vis 透光率對曝光量、Dill ABC 實測、PEB 時間／溫度對 CD、Development Rate Monitor、Top-down 與 Cross-section SEM、DSC Tg。

## 9. 初步專案檔案架構

```text
integrated-materials-lithography/
├─ desktop/                 # PySide6 / Qt UI、MoleForm 既有前端嵌入
├─ moleform/                # 原有物性功能；盡可能不改動計算核心
├─ lithocore/
│  ├─ mask/ optics/ films/ exposure/ peb/
│  ├─ develop/ etch/ metrology/ analysis/
├─ schemas/                 # Material、Recipe、Simulation 契約與單位
├─ database/                # SQLite、遷移、來源與 DOI
├─ simulations/             # HDF5 等大資料
├─ validation/
│  ├─ analytical/ numerical/ literature/
│  ├─ workbook/ experimental/ integration/
├─ tests/                   # pytest；包含原 MoleForm 回歸
├─ references/              # 文獻索引（不任意散布受版權保護的 PDF）
├─ docs/                    # 假設、公式、使用者說明、變更日誌
└─ pyproject.toml
```

## 10. 重要文獻與開源專案備忘

### 文獻

| 內容 | 來源 |
|---|---|
| Optical Imaging | H. H. Hopkins, *On the Diffraction Theory of Optical Images* (1953), DOI: `10.1098/rspa.1953.0071` |
| Dill Optical Lithography | F. H. Dill (1975), DOI: `10.1109/T-ED.1975.18158` |
| Dill Positive Photoresist Characterization | Dill et al. (1975), DOI: `10.1109/T-ED.1975.18159` |
| 酸擴散／CAR | C. A. Mack, *Lithographic Effects of Acid Diffusion in Chemically Amplified Resists* (1995), DOI: `10.1021/bk-1995-0614.ch004` |
| TMM 實作說明 | S. J. Byrnes, *Multilayer Optical Calculations*, arXiv:1603.02720；DOI: `10.48550/arXiv.1603.02720` |
| 模型／方法詳細章節 | 使用者提供之 *Inside PROLITH*, Ch.2–9 |
| Workbook 操作參考 | 使用者提供之 *PROLITH Workbook* v7.2, Ch.1–11 |

**待補查：**Mack (1987/1992) 顯影模型原文、Workbook Ch.11 蝕刻原始技術資料、各論文完整 DOI 與對應式子位置。對尚未查證者不得虛構 DOI 或模型精度。

### 開源專案／套件（作為調研候選，不表示已完成全面程式碼／授權審核）

- https://github.com/sbyrnes321/tmm — Transfer Matrix Method。
- https://github.com/VLSIDA/lithosim — 光學與部分同調成像參考。
- https://github.com/Flowbudget/euvsimulator — EUV／CAR／顯影概念研究參考。
- https://viennatools.github.io/ViennaPS/ — Level Set 與蝕刻程序參考。
- https://github.com/OpenOPC/OpenILT — 反向微影／光罩最佳化參考。
- RDKit、NumPy、SciPy、Numba、PySide6、gdstk、pyqtgraph、PyVista、HDF5、pytest。

**開源授權提醒：**使用前確認各套件版本授權（尤其 GPL、Qt、與其他相依套件），以及是否涉及散布或修改義務。

## 11. 最重要的風險清單

1. **材料參數不足：**沒有實測或可靠文獻值，不能宣稱新配方的定量 CD 預測可靠。
2. **光學相位與單位錯誤：**n±ik、波長單位、NA／Focus 定義、Zernike 正規化不一致。
3. **數值假穩定：**能畫出平滑圖形不代表 PDE 收斂或物理守恆。
4. **驗證資料洩漏：**Tg／pKa 訓練集與測試集結構高度重複，造成虛高準確度。
5. **公式過度外推：**傳統 PAC/DNQ 模型不可無條件套用 CAR，LPM 不可替代完整顯影。
6. **版本間差異：**Workbook v7.2 與 Inside PROLITH v5.0 不能當成完全相同內部設定。
7. **整合回歸：**新的材料 schema 或版本變更，不可讓原 MoleForm 結果默默改變。
8. **授權與保密：**尊重原始書籍／商業軟體版權，不直接複製專有原始碼或資料庫；公司敏感配方優先在本機處理。

## 12. 後續執行清單

- [ ] 針對目前 MoleForm 專案完成程式碼、前後端、Python/Node、資料保存方式盤點。
- [ ] 為現有 MoleForm 建立固定輸入／預期輸出的回歸測試集。
- [ ] 設計共用 Material、Recipe、Simulation Schema，欄位含單位、來源、信心水準與版本。
- [ ] 先完成 Windows 容器 Prototype，不先重寫物性引擎。
- [ ] 逐式建立 Inside PROLITH 模型–原始頁碼–實作函數–pytest 對照表。
- [ ] 建立 Workbook WB-01～13 Benchmark 的輸入資料與缺參數標示。
- [ ] 實作 M01–M04 與解析解／網格收斂測試。
- [ ] 後續擴充 Dill ABC、CAR、PEB、Mack Development、Etch、Yield。
- [ ] 於每個新模組合併前執行 MoleForm + Lithography 全部回歸測試。
- [ ] 驗證中心輸出 `PASS / FAIL / INCOMPLETE` 與可追溯科學報告。
- [ ] 取得獨立實驗資料時進行模型校正及**未參與擬合**的預測驗證。

---

**結論：**實作上是一套 Windows 本機應用程式，科學上則是兩套可以互通但分別驗證的計算引擎。最終目標不是僅重現 PROLITH 外觀或 Workbook 圖形，而是建立**來源可追溯、模型有邊界、參數可校正、結果可重現**的完整材料—微影研發平台。
