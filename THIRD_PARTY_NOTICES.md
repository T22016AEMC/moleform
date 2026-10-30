# 第三方授權聲明

本檔記錄專案資料表中轉錄自第三方軟體的內容及其授權。網站執行期相依套件（OpenChemLib、3Dmol.js、Ketcher 等）的聲明由建置腳本另外產生，見 `scripts/third-party-notices.mjs` 與 `packages/ketcher-frame/notices.mjs`。

## thermo 0.6.1（Joback 基團的 SMARTS）

- 用途：`src/data/joback_groups.csv` 的 41 條基團 SMARTS 取自 thermo 0.6.1 的 `thermo/group_contribution/joback.py`（`J_BIGGS_JOBACK_SMARTS`）。依該檔註解與 thermo 說明頁，SMARTS 原出自 RDKit 郵件列表 Jason Biggs 的貼文。其中 J26（醛）與 J33（>N–，非環）兩條依 Joback & Reid 1987 表 III 修正，修正處與原因寫在 `joback_groups.csv` 的備註欄與 `docs/reports/027-結果.md`。
- 數值（Tbi、Tfi）**不是**取自 thermo，而是由 Joback & Reid 1987 表 III 的頁面圖像讀取。
- 來源：https://github.com/CalebBell/thermo （標籤 0.6.1）
- 授權：MIT License

```
MIT License

Copyright (C) 2016, 2017, 2018, 2019, 2020, Caleb Bell <Caleb.Andrew.Bell@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
