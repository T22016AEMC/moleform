# Phase 6（任務 P6B、P6E）：Tm、Td、吸濕性、彈性模數——書中算例對照

產生方式：engine/.venv/Scripts/python.exe scripts/verification/phase6-tm-td-moisture-modulus.py。內容只有程式算出的數字與書中印的數字並列，不調整任何數值去湊；
判斷由使用者進行（D17）。書：van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009)。
相符標準（依書自己表中顯示的精度）：Tm 差 ≤ 1 K（書印整數）；Yd,1/2 差 ≤ 0.25 K·kg/mol（書印到 0.5）；Td,1/2 差 ≤ 5 K（書的 calc 欄多以 5 K 為單位）。
重複單元的 SMILES 由本卡依聚合物名稱寫出（書中 Table 6.15、21.3 只有名稱），切法使組合基團落在單元內；SMILES 不用反引號，避免被黃金檔腳本掃描。

## 1. Tm：Table 6.15（書頁 165–166）calculated 欄

| 聚合物 | 重複單元 SMILES | 書 Tm exp (K) | 書 Tm calc (K) | 本卡 Tm (K) | 差（本卡 − 書 calc） | 判定 |
|---|---|---|---|---|---|---|
| Polyethylene | \*CC\* | 410 (268/414) | 407 | 407.1 | +0.1 | 相符 |
| Polyethylidene | \*C(\*)C | 463 | 464 | 464.3 | +0.3 | 相符 |
| Polypropylene | \*CC(\*)C | 385/481 | 445 | 445.2 | +0.2 | 相符 |
| Polyisobutylene | \*CC(C)(C)\* | 275/317 | 318 | 317.3 | -0.7 | 相符 |
| Polystyrene | \*CC(\*)c1ccccc1 | 498/523 | 516 | 515.9 | -0.1 | 相符 |
| Polybutene | \*CC(\*)CC | 379/415 | 361 | 361.1 | +0.1 | 相符 |
| Polyoctene | \*CC(\*)CCCCCC | 235 | 235 | 234.8 | -0.2 | 相符 |
| Polyoctadecene | \*CC(\*)CCCCCCCCCCCCCCCC | 314/383 | 330 | 330.6 | +0.6 | 相符 |
| Poly(vinyl methyl ether) | \*CC(\*)OC | 417/423 | 420 | 420.0 | -0.0 | 相符 |
| Poly(vinyl ethyl ether) | \*CC(\*)OCC | 359 | 354 | 354.2 | +0.2 | 相符 |
| Poly(vinyl heptadecyl ether) | \*CC(\*)OCCCCCCCCCCCCCCCCC | 333 | 329 | 329.0 | -0.0 | 相符 |
| Poly(propyl acrylate) | \*CC(\*)C(=O)OCCC | 388/435 | 360 | 381.1 | +21.1 | 不符 |
| Poly(butyl acrylate) | \*CC(\*)C(=O)OCCCC | 320 | 309 | 321.8 | +12.8 | 不符 |
| Poly(docosyl acrylate) | \*CC(\*)C(=O)OCCCCCCCCCCCCCCCCCCCCCC | 329/345 | 336 | 336.5 | +0.5 | 相符 |
| Poly(vinyl dodecanoate) | \*CC(\*)OC(=O)CCCCCCCCCCC | 274/302 | 288 | 288.4 | +0.4 | 相符 |
| Poly(methyl methacrylate) | \*CC(C)(\*)C(=O)OC | 433/473 | 433 | 471.5 | +38.5 | 不符 |
| Poly(docosyl methacrylate) | \*CC(C)(\*)C(=O)OCCCCCCCCCCCCCCCCCCCCCC | 328/334 | 341 | 332.9 | -8.1 | 不符 |
| Poly(vinyl fluoride) | \*CC(\*)F | 503 | 502 | 502.2 | +0.2 | 相符 |
| Poly(vinylidene fluoride) | \*CC(F)(F)\* | 410/511 | 488 | 487.5 | -0.5 | 相符 |
| Poly(tetrafluoroethylene) | \*C(F)(F)C(F)(F)\* | 292/672 | 510 | 510.0 | +0.0 | 相符 |
| Poly(vinyl chloride) | \*CC(\*)Cl | 485/583 | 531 | 531.2 | +0.2 | 相符 |
| Poly(vinylidene chloride) | \*CC(Cl)(Cl)\* | 463/483 | 461 | 461.3 | +0.3 | 相符 |
| Poly(trifluoro-chloroethylene) | \*C(F)(F)C(F)(Cl)\* | 483/533 | 494 | 493.6 | -0.4 | 相符 |
| Poly(ethylene oxide) | \*CCO\* | 335/349 | 352 | 352.3 | +0.3 | 相符 |
| Poly(trimethylene oxide) | \*CCCO\* | 308 | 319 | 319.0 | -0.0 | 相符 |
| Poly(tetramethylene oxide) | \*CCCCO\* | 308/333 | 299 | 298.6 | -0.4 | 相符 |
| Poly(ethylene sulphide) | \*CCS\* | 418/483 | 407 | 407.7 | +0.7 | 相符 |
| Poly(decamethylene sulphide) | \*CCCCCCCCCCS\* | 351/365 | 363 | 363.2 | +0.2 | 相符 |
| Poly(decamethylene disulphide) | \*CCCCCCCCCCSS\* | 318/332 | 343 | 342.8 | -0.2 | 相符 |
| Poly(ethylene adipate) | \*CCOC(=O)CCCCC(=O)O\* | 320/338 | 348 | 348.8 | +0.8 | 相符 |
| Poly(decamethylene adipate) | \*CCCCCCCCCCOC(=O)CCCCC(=O)O\* | 343/355 | 345 | 345.1 | +0.1 | 相符 |
| Poly(decamethylene sebacate) | \*CCCCCCCCCCOC(=O)CCCCCCCCC(=O)O\* | 344/358 | 349 | 348.8 | -0.2 | 相符 |
| Poly(ethylene terephthalate) | \*CCOC(=O)c1ccc(cc1)C(=O)O\* | 538/557 | 563 | 557.0 | -6.0 | 不符 |
| Poly(decamethylene terephthalate) | \*CCCCCCCCCCOC(=O)c1ccc(cc1)C(=O)O\* | 396/411 | 480 | 476.8 | -3.2 | 不符 |
| Poly(paraphenylene dimethylene adipate) | \*Cc1ccc(cc1)COC(=O)CCCCC(=O)O\* | 343/354 | 395 | 423.2 | +28.2 | 不符 |
| Poly(tetramethylene anhydride) | \*C(=O)OC(=O)CCCC\* | 350/371 | 335 | 335.9 | +0.9 | 相符 |
| Poly(hexadecamethylene anhydride) | \*C(=O)OC(=O)CCCCCCCCCCCCCCCC\* | 368 | 369 | 368.9 | -0.1 | 相符 |
| Poly(tetramethylene carbonate) | \*OC(=O)OCCCC\* | 332 | 327 | 327.6 | +0.6 | 相符 |
| Poly(decamethylene carbonate) | \*OC(=O)OCCCCCCCCCC\* | 328/378 | 350 | 350.0 | +0.0 | 相符 |
| Poly(hexamethylene adipamide) | \*C(=O)NCCCCCCNC(=O)CCCC\* | 523/545 | 518 | 509.7 | -8.3 | 不符 |
| Poly(decamethylene sebacamide) | \*C(=O)NCCCCCCCCCCNC(=O)CCCCCCCC\* | 467/489 | 469 | 469.2 | +0.2 | 相符 |
| Poly(6-aminocaproic acid) | \*C(=O)NCCCCC\* | 487/506 | 510 | 509.7 | -0.3 | 相符 |
| Poly(11-aminoundecanoic acid) | \*C(=O)NCCCCCCCCCC\* | 455/493 | 464 | 464.5 | +0.5 | 相符 |
| Poly(nonamethylene azelamide) | \*C(=O)NCCCCCCCCCNC(=O)CCCCCCC\* | 438/462 | 436 | 474.8 | +38.8 | 不符 |
| Poly(ethylene terephthalamide) | \*CCNC(=O)c1ccc(cc1)C(=O)N\* | 728 | 752 | 741.7 | -10.3 | 不符 |
| Poly(hexamethylene terephthalamide) | \*CCCCCCNC(=O)c1ccc(cc1)C(=O)N\* | 623/644 | 634 | 634.7 | +0.7 | 相符 |
| Poly(octadecamethylene terephthalamide) | \*CCCCCCCCCCCCCCCCCCNC(=O)c1ccc(cc1)C(=O)N\* | 528 | 542 | 542.4 | +0.4 | 相符 |
| Poly(paraphenylene dimethylene adipamide) | \*NC(=O)CCCCC(=O)NCc1ccc(cc1)C\* | 606/613 | 598 | 589.2 | -8.8 | 不符 |
| Poly(hexamethylene-4,4'-oxydibutyramide) | \*NC(=O)CCCOCCCC(=O)NCCCCCC\* | 460 | 513 | 484.1 | -28.9 | 不符 |
| Poly(tetramethylene hexamethylene diurethane) | \*OC(=O)NCCCCCCNC(=O)OCCCC\* | 446/462 | 435 | 434.9 | -0.1 | 相符 |
| Poly(decamethylene hexadecamethylene diurethane) | \*OC(=O)NCCCCCCCCCCNC(=O)OCCCCCCCCCCCCCCCC\* | 401 | 417 | 417.4 | +0.4 | 相符 |
| Poly(paraphenylene dimethylene tetramethylene diurethane) | \*OC(=O)NCc1ccc(cc1)CNC(=O)OCCCC\* | 500 | 486 | 510.6 | +24.6 | 不符 |
| Poly(hexamethylene octamethylene diurea) | \*NC(=O)NCCCCCCNC(=O)NCCCCCCCC\* | 498/526 | 531 | 531.4 | +0.4 | 相符 |
| Poly(paraphenylene dimethylene hexamethylene diurea) | \*NC(=O)NCc1ccc(cc1)CNC(=O)NCCCCCC\* | 579 | 579 | 605.7 | +26.7 | 不符 |

結果：54 個聚合物中，相符 40 個、不符 14 個、無法計算 0 個。

不符者的差（本卡 − 書 calc，K）：Poly(decamethylene terephthalate) -3；Poly(ethylene terephthalate) -6；Poly(docosyl methacrylate) -8；Poly(hexamethylene adipamide) -8；Poly(paraphenylene dimethylene adipamide) -9；Poly(ethylene terephthalamide) -10；Poly(butyl acrylate) +13；Poly(propyl acrylate) +21；Poly(paraphenylene dimethylene tetramethylene diurethane) +25；Poly(paraphenylene dimethylene hexamethylene diurea) +27；Poly(paraphenylene dimethylene adipate) +28；Poly(hexamethylene-4,4'-oxydibutyramide) -29；Poly(methyl methacrylate) +39；Poly(nonamethylene azelamide) +39

不符與無法計算的觀察（只是把書自己的表並列，**沒有採用任何一項去調整數值**）：

- Poly(propyl acrylate)、Poly(butyl acrylate)：Table 6.9 聚丙烯酸酯的 Ymo 印 48（Fig. 6.6 在 N = 0 約 48）。若 Ymo 取 44（Table 6.9 聚乙烯酯的值，也約等於 Table 6.8 的 5.7 + 38 = 43.7），式 6.23 得 360 與 309，與書 Table 6.15 的 calc 相同。書的 Table 6.9 與 Table 6.15 在這裡彼此不一致。
- Poly(methyl methacrylate)：Table 6.9 的 Ymo = 47.3（= Table 6.8 的 5.7 + 41.5）得 471.5；書 calc 433。Poly(docosyl methacrylate)：式 6.24 以 Ym5 = 40.0 得 332.9，書 calc 341。
- Poly(ethylene terephthalate)、Poly(decamethylene terephthalate)：本卡不套用 Table 6.12 的奇偶效應。若各加 +1.5（–CO–O– 的奇偶效應一次）約得 564.8 與 481.7，仍與書 calc 563、480 有 1–2 K 差。
- Poly(hexamethylene adipamide)：Table 6.11 的 (4,6) 為 25.2，加 2 × 45 得 115.2，Tm = 509.7；書 calc 518 需要 Ym = 117.2。Poly(nonamethylene azelamide)：Table 6.11 的 (9,7) 為 57.2，加 2 × 45 得 147.2，Tm = 474.8；書 calc 436 需要 Ym = 135.4。兩者書自己的 Table 6.11 加總都得不到書的 calc。
- 含對伸苯基二亞甲基（–CH2–C6H4–CH2–，Table 6.14 的 47）的聚醯胺、聚胺基甲酸酯、聚脲：Poly(paraphenylene dimethylene adipate) +28、adipamide −9、diurethane +25、diurea +27，正負號不同，沒有單一修正能解釋。Poly(ethylene terephthalamide) −10；Poly(hexamethylene-4,4'-oxydibutyramide) −29（含醚 –O– 13.5 與兩段 CH2 序列）。
- 先前（第一版輸出）有 4 個脂肪族聚酯無法計算，原因是我的 SMILES 切法讓酯基跨在重複單元的邊界（B.COO 配不到、退而配到 –C(=O)–）；改成酯基落在單元內的寫法後可計算，3 個相符，Poly(paraphenylene dimethylene adipate) 不符（+28）。這是驗證輸入的修正，不是規則或數值的改動。

## 2. Td,1/2：Table 21.3（書頁 770）calculated 欄

| 聚合物 | 重複單元 SMILES | 書 Td exp (K) | 書 M | 書 Yd calc | 書 Td calc (K) | 本卡 Yd | 本卡 Td (K) | 差 Yd | 差 Td (K) | 判定 |
|---|---|---|---|---|---|---|---|---|---|---|
| Poly(methylene) | \*C\* | 687 | 14 | 9.5 | 680 | 9.5 | 677.3 | +0.00 | -2.7 | 相符 |
| Poly(ethylene) (branched) | \*CC\* | 677 | 28 | 19 | 680 | 19.0 | 677.3 | +0.00 | -2.7 | 相符 |
| Poly(propylene) | \*CC(\*)C | 660 | 42 | 28 | 665 | 28.0 | 665.4 | +0.00 | +0.4 | 相符 |
| Poly(isobutylene) | \*CC(C)(C)\* | 621 | 56 | 35 | 625 | 35.0 | 623.8 | +0.00 | -1.2 | 相符 |
| Poly(styrene) | \*CC(\*)c1ccccc1 | 637 | 104 | 66 | 630 | 66.0 | 633.7 | +0.00 | +3.7 | 相符 |
| Poly(m-methyl styrene) | \*CC(\*)c1cccc(C)c1 | 631 | 118 | 75.5 | 640 | — | — | — | — | 無法計算：缺基團：CH，鄰居：C1、*、C4；CH3，鄰居：C8 |
| Poly(alpha-methyl styrene) | \*CC(\*)(C)c1ccccc1 | 559 | 118 | 65.5 | 555 | 65.5 | 554.2 | +0.00 | -0.8 | 相符 |
| Poly(vinyl fluoride) | \*CC(\*)F | 663 | 46 | 27.5 | 600 | 27.5 | 597.3 | +0.00 | -2.7 | 相符 |
| Poly(vinyl chloride) | \*CC(\*)Cl | 543 | 62.5 | 33 | 530 | 33.0 | 528.0 | +0.00 | -2.0 | 相符 |
| Poly(trifluoro ethylene) | \*C(F)C(F)(F)\* | 682 | 82 | 56.5 | 690 | 56.5 | 688.8 | +0.00 | -1.2 | 相符 |
| Poly(chloro-trifluoro ethylene) | \*C(F)(Cl)C(F)(F)\* | 653 | 116.5 | 77.5 | 600 | 77.5 | 665.4 | +0.00 | +65.4 | 不符 |
| Poly(tetrafluoro ethylene) | \*C(F)(F)C(F)(F)\* | 782 | 100 | 77 | 770 | 77.0 | 769.9 | +0.00 | -0.1 | 相符 |
| Poly(vinyl cyclohexane) | \*CC(\*)C1CCCCC1 | 642 | 110 | 69.5 | 630 | 69.5 | 630.7 | +0.00 | +0.7 | 相符 |
| Poly(vinyl alcohol) | \*CC(\*)O | 547 | 44 | 23.5 | 535 | 23.5 | 533.4 | +0.00 | -1.6 | 相符 |
| Poly(vinyl acetate) | \*CC(\*)OC(C)=O | 542 | 86 | 47 | 545 | 47.0 | 545.9 | +0.00 | +0.9 | 相符 |
| Poly(acrylonitrile) | \*CC(\*)C#N | 723 | 53 | 37.5 | 708 | 37.5 | 706.7 | +0.00 | -1.3 | 相符 |
| Poly(methyl acrylate) | \*CC(\*)C(=O)OC | 601 | 86 | 52 | 605 | 52.0 | 604.0 | +0.00 | -1.0 | 相符 |
| Poly(methyl methacrylate) | \*CC(C)(\*)C(=O)OC | 610 | 100 | 60.5 | 605 | 60.5 | 604.3 | +0.00 | -0.7 | 相符 |
| Poly(butadiene) | \*CC=CC\* | 680 | 54 | 37 | 688 | 37.0 | 684.0 | +0.00 | -4.0 | 相符 |
| Poly(isoprene) | \*CC(C)=CC\* | 596 | 68 | 41 | 605 | 40.5 | 594.5 | -0.50 | -10.5 | 不符 |
| Poly(p-phenylene) | \*c1ccc(\*)cc1 | 925 | 76 | 75 | 985 | 54.0 | 709.6 | -21.00 | -275.4 | 不符 |
| Poly(benzyl) | \*Cc1ccc(\*)cc1 | 703 | 90 | 63.5 | 705 | 63.5 | 704.6 | +0.00 | -0.4 | 相符 |
| Poly(p-xylylene) | \*CCc1ccc(\*)cc1 | 715 | 104 | 72 | 695 | 73.0 | 700.9 | +1.00 | +5.9 | 不符 |
| Poly(ethylene oxide) | \*CCO\* | 618 | 44 | 27 | 615 | 27.0 | 612.9 | +0.00 | -2.1 | 相符 |
| Poly(propylene oxide) | \*CC(C)O\* | 586 | 58 | 33.5 | 578 | — | — | — | — | 無法計算：缺基團：CH，鄰居：C1、C3、O4；CH3，鄰居：C2 |
| Poly(2,6-dimethyl p-phenylene oxide) | \*Oc1c(C)cc(\*)cc1C | 753 | 120 | 90 | 750 | 90.0 | 749.1 | +0.00 | -0.9 | 相符 |
| Poly(ethylene terephthalate) | \*CCOC(=O)c1ccc(cc1)C(=O)O\* | 723 | 192 | 138 | 720 | 138.0 | 718.1 | +0.00 | -1.9 | 相符 |
| Poly(dian terephthalate) | \*c1ccc(cc1)C(C)(C)c1ccc(cc1)OC(=O)c1ccc(cc1)C(=O)O\* | 750 | 358 | 262 | 735 | 262.0 | 731.0 | +0.00 | -4.0 | 相符 |
| Poly(dian carbonate) | \*c1ccc(cc1)C(C)(C)c1ccc(cc1)OC(=O)O\* | 750 | 254 | 173 | 683 | 173.0 | 680.3 | +0.00 | -2.7 | 相符 |
| Poly(hexamethylene adipamide) | \*C(=O)NCCCCCCNC(=O)CCCC\* | 693 | 226 | 160 | 635 | 160.0 | 707.0 | +0.00 | +72.0 | 不符 |
| Poly(epsilon-caproamide) (Nylon 6) | \*C(=O)NCCCCC\* | 703 | 113 | 80 | 635 | 80.0 | 707.0 | +0.00 | +72.0 | 不符 |
| Poly(p-phenylene terephthalamide) | \*NC(=O)c1ccc(cc1)C(=O)Nc1ccc(cc1)\* | 800 | 238 | 189 | 798 | 189.0 | 793.3 | +0.00 | -4.7 | 相符 |
| Poly(pyromellitide) (Kapton) | \*N1C(=O)c2cc3C(=O)N(C(=O)c3cc2C1=O)c1ccc(Oc2ccc(\*)cc2)cc1 | 840 | 382 | 316 | 830 | 316.0 | 826.5 | +0.00 | -3.5 | 相符 |
| Poly(m-phenylene 2,5-oxadiazole) | \*c1cccc(c1)-c1nnc(o1)\* | 800 | 144 | 115 | 720 | 115.0 | 797.9 | +0.00 | +77.9 | 不符 |

結果：34 個聚合物中，相符 25 個（Yd 與 Td 兩欄都在精度內）、不符 7 個、無法計算 2 個（Cellulose 書中沒有 calc 值，未列入）。
分開看：算得出的 32 個中，Yd calc 欄相符 29 個、Td calc 欄相符 25 個；Yd 相符而 Td 欄不符的是書的 Td calc 欄與它自己的 Yd ÷ M 不一致（見下）。

不符與無法計算的觀察（同樣只是並列，沒有採用任何一項去調整）：

- Poly(chloro-trifluoro ethylene)、Poly(m-phenylene 2,5-oxadiazole)、兩個尼龍：本卡的 Yd 與書 Yd calc 完全相同（77.5、115），只是書的 Td calc 欄與它自己的 Yd ÷ M 不一致（77.5 ÷ 116.5 = 665 K，書印 600；115 ÷ 144 = 799 K，書印 720）。尼龍兩列（Yd 160、80 相符）的書 Td calc 635 與 160 ÷ 226、80 ÷ 113（= 707 K）不一致。
- Poly(isoprene)：–CH=C(CH3)– 21.5 + 2 × 9.5 = 40.5，書 calc 41。Poly(p-xylylene)：2 × 9.5 + 54 = 73，書 calc 72。
- Poly(p-phenylene)：本卡沿用 Yg 的共軛規則（只有雙鍵系統基團算共軛的鄰居），相鄰的伸苯基不算，所以取 n 值 54；書 calc 75 是 cc 值。這是規則的限制，不是謄錄錯誤。
- 無法計算的 2 個：
  - Poly(m-methyl styrene)：Table 21.2 沒有甲苯基 –CH(C6H4CH3)–；書 calc 75.5 = 66 + 9.5，看起來把 CH3 當作 9.5，書中沒有這樣的基團。
  - Poly(propylene oxide)：Yg 的 –CH(CH3)– 切分排除接氧的 CH，所以缺基團；就算算，Table 21.2 加總為 9.5 + 18.5 + 8 = 36，書 calc 33.5。
- 使用者 2026-11-17 決定的指定（只選值，不改書的數字，標「詮釋（依書算例推得）、待使用者審」）：
  - –C(CH3)2– 夾在兩個芳香環之間用 Table 21.2 的第三個值 35。依據：Poly(dian terephthalate) 262 = 119 + 2 × 54 + 35、Poly(dian carbonate) 173 = 30 + 2 × 54 + 35。結果兩者 Yd 完全相符。
  - –C(=O)NH– 用 32.5。依據：Poly(hexamethylene adipamide) 160 = 10 × 9.5 + 2 × 32.5、Poly(epsilon-caproamide) 80 = 5 × 9.5 + 32.5。32.5 不是 Table 21.2 –C(=O)NH– 的 30 或 37（是 –O–C(=O)–NH– 的值）；30、37 兩列保留、不使用。結果兩者 Yd 完全相符。
  - 書的算例沒有明確用到的 –C(=O)–O– 20／25 與受阻 –C(CH3)2– 的 s 值，Tm 的 –C(CH3)2– 受阻（s 22、ss 39）與 –C(=O)– al／ar，維持回報缺基團。

## 3. 吸濕性：Example 18.4（書頁 691）尼龍 6,6，RH 0.7，結晶度 70%

| 項目 | 書 | 本卡 | 判定 |
|---|---|---|---|
| 每結構單元莫耳含水量（mol） | 1.5（2 個 CONH × 0.75；CH2 忽略） | 1.50033（含 10 個 CH2 × 3.3e-5） | 相符（差 +0.00033） |
| 結構單元分子量 | 226.3 | 226.32 | 相符 |
| 非晶 g 水／100 g | 12 | 11.93 | 相符 |
| 結晶度 70%（式 18.15） | 3.6 | 3.58 | 相符 |

本卡的基團清單：–C(=O)–NH–（醯胺） × 2（0.75）；–CH3、–CH2–、–CH<（脂肪族碳，連接氫） × 10（3.3e-05）；未涵蓋原子 0 個。
書中的實驗值 4 g／100 g 只作對照，不參與計算。

## 4. 彈性模數（任務 P6E）：K、G、ν、E

方法：式 13.30（K = ρ·(U_R/V)⁶）、式 14.12（G = ρ·(U_H/V)⁶）、Table 13.2（ν、E）、式 13.32（方法三）。V 一律用書中給的密度或 V（輸入密度路徑，V = M/ρ），
不使用 Vm 模組的估算值，這樣才能與書的算例同基準比較。相符標準：K、G 差 ≤ 0.05 GPa（書印 1～3 位）；U_R、U_H 差 ≤ 5（書印到 5）。不調整任何數值去湊。
方法二（式 13.31，需要 Fig. 5.4 的 C_p/C_v，是圖）本卡不做。方法三只對 Table 7.1（Hoftyzer and Van Krevelen 欄）與 Table 5.7 同時有值、基團定義可對應的基團啟用。

### 4.1 Example 13.1：聚乙烯（ρ 0.95、結晶度 70%）

| 項目 | 書 | 本卡 | 差 | 判定 |
|---|---|---|---|---|
| U_R | 1760.0 | 1760 | +0 | 相符 |
| V（cm³/mol） | 29.5 | 29.53 | +0.03 | 相符 |
| 方法一 K（GPa） | 4.3 | 4.258 | -0.042 | 相符 |
| E_coh（J/mol） | 8380.0 | 8380 | +0 | 相符 |
| ΔH_m（kJ/mol） | 8.0 | 8.0 | +0.0 | 相符 |
| 方法三 K（GPa） | 3.8 | 3.806 | +0.006 | 相符 |

兩個方法的平均 = 4.03 GPa（書：三個方法的平均 4.1，其中方法二本卡不做，所以不比較）。

### 4.2 Example 13.2：雙酚 A 聚碳酸酯（M 254、V 212、ρ 1.2）

| 項目 | 書 | 本卡 | 差 | 判定 |
|---|---|---|---|---|
| U_R | 12575.0 | 12575 | +0 | 相符 |
| U_H | 9900.0 | 9900 | +0 | 相符 |
| K（GPa） | 5.23 | 5.223 | -0.007 | 相符 |
| G（GPa） | 1.24 | 1.244 | +0.004 | 相符 |
| ν | 0.39 | 0.390 | -0.000 | 相符 |
| E（GPa） | 3.52 | 3.457 | -0.063 | 不符 |

E 不符的說明（書自己的算術）：用書印的 K = 5.23、G = 1.24 代入書的式 E = 3G/(1 + G/(3K)) 得 3.45 GPa；用書印的 ν = 0.39 代入 E = 2G(1 + ν) 得 3.45 GPa；
兩個式都得 3.45 左右，與書印的 3.52 不一致。本卡的 E 由本卡的 K、G 用同一個式算出，沒有調整。（U_R、U_H、K、G、ν 都與書相符。）

### 4.3 Table 13.6：方法一欄 (U_R/V)⁶·ρ（ρ 用書中表列的值）

書的 ρ 只印到 0.01，而 K ∝ ρ⁷（M 固定時 V = M/ρ），所以 ρ 取整本身就造成 ±(7 × 0.005 ÷ ρ) 的 K 誤差（約 ±3～4%）：差在這個範圍內判為相符，超過才判不符。
最後一欄用書 Table 14.5 自己印的 calculated U_R 與 V 代入式 13.30（ρ 取 Table 13.6 的值），檢查 Table 13.6 與 Table 14.5 在書中是否一致，與本卡的謄錄無關。

| 聚合物 | ρ | 書 Exp. | 書 方法一 | 本卡 U_R | 本卡 K（GPa） | 差 | ρ 取整誤差 | 判定／原因 | 書 Table 14.5 的 U_R、V 代入式 13.30 的 K |
|---|---|---|---|---|---|---|---|---|---|
| Polyethylene (am) (extrapol.) | 0.85 | (1.9) | 1.95 | 1760 | 1.95 | +0.00 | ±0.08 | 相符 | — |
| Polyethylene (ld) | 0.92 | 3.4 | 3.55 | 1760 | 3.40 | -0.15 | ±0.14 | 不符：原因不明，不調整 | — |
| Polyethylene (md) | 0.95 | 4.5 | 4.3 | 1760 | 4.26 | -0.04 | ±0.16 | 相符 | — |
| Polyethylene (HD) | 0.97 | 5.0 | 5.05 | 1760 | 4.93 | -0.12 | ±0.18 | 相符 | 4.46（U_R 1760、V 29.4） |
| Polyethylene (cr) (extrapol.) | 1.0 | (6.0) | 6.3 | 1760 | 6.10 | -0.20 | ±0.22 | 相符 | — |
| Polypropylene | 0.91 | 3.5 | 3.85 | 2755 | 4.07 | +0.22 | ±0.15 | 不符：書內不一致（13.6 與 14.5 矛盾），不調整 | 4.15（U_R 2755、V 46.1） |
| Polybutene-1 | 0.91 | 3.8 | 3.8 | 3620 | 3.73 | -0.07 | ±0.15 | 相符 | — |
| Polystyrene | 1.05 | 5.0 | 5.15 | 5780 | 4.11 | -1.04 | ±0.17 | 不符：書內不一致（13.6 與 14.5 矛盾），不調整 | 4.16（U_R 5780、V 99.0） |
| Poly(vinyl chloride) | 1.42 | 5.5 | 5.25 | 2605 | 6.11 | +0.86 | ±0.13 | 不符：原因不明，不調整 | 5.42（U_R 2605、V 44.9） |
| Poly(vinylidene fluoride) | 1.77 | 5.4 | 4.2 | 1980 | 4.76 | +0.56 | ±0.08 | 不符：原因不明，不調整 | — |
| Poly(chlorotrifluoroethylene) | 2.15 | 5.2 | 4.55 | 2935 | 5.44 | +0.89 | ±0.07 | 不符：原因不明，不調整 | — |
| Poly(tetrafluoroethylene) | 2.35 | 2.5 | 3.6 | 2200 | 4.48 | +0.88 | ±0.05 | 不符：原因不明，不調整 | 2.85（U_R 2200、V 45.9） |
| Poly(vinyl butyral) | 1.11 | 4.2 | 3.1 | — | — | — | — | 無法算：書中只有名稱，沒有結構 | — |
| Poly(methyl methacrylate) | 1.19 | 5.1 | 5.25 | 5100 | 5.90 | +0.65 | ±0.15 | 不符：書內不一致（13.6 與 14.5 矛盾），不調整 | 5.75（U_R 5100、V 84.5） |
| Poly(isobutyl methacrylate) | 1.04 | 2.9 | 3.2 | 7685 | 3.28 | +0.08 | ±0.11 | 相符 | — |
| Polyisoprene (natural rubber) | 0.91 | 2.0 | 1.9 | 4160 | 2.68 | +0.78 | ±0.07 | 不符：原因不明，不調整 | — |
| Poly(chlorobutadiene) | 1.24 | 2.3 | 2.3 | 4025 | 3.98 | +1.68 | ±0.06 | 不符：原因不明，不調整 | — |
| Poly(methylene oxide) | 1.43 | 6.9 | 7.4 | 1280 | 7.34 | -0.06 | ±0.18 | 相符 | 7.13（U_R 1280、V 21.1） |
| Poly(ethylene oxide) | 1.21 | 5.7 | 6.9 | 2160 | 5.28 | -1.62 | ±0.20 | 不符：書內不一致（13.6 與 14.5 矛盾），不調整 | 5.20（U_R 2160、V 36.5） |
| Poly(2,6-dimethyl-p-phenylene oxide) | 1.07 | 4.1 | 4.0 | 6500 | 4.03 | +0.03 | ±0.13 | 相符 | 4.29（U_R 6500、V 111.1） |
| Poly(ethylene terephthalate) | 1.4 | >4 | 7.4 | 8360 | 7.15 | -0.25 | ±0.19 | 不符：原因不明，不調整 | — |
| Nylon 6 | 1.14 | 5.1 | 6.05 | 6150 | 6.45 | +0.40 | ±0.19 | 不符：書內不一致（13.6 與 14.5 矛盾），不調整 | 6.63（U_R 6150、V 98.8） |
| Nylon 66 | 1.14 | 8.1 | 6.05 | 12300 | 6.45 | +0.40 | ±0.19 | 不符：書內不一致（13.6 與 14.5 矛盾），不調整 | 6.79（U_R 12300、V 196.8） |
| Polyimide | 1.44 | 6.0 | 6.05 | — | — | — | — | 無法算：書中只有名稱，沒有結構 | — |
| Poly(bisphenol carbonate) | 1.2 | 5.0 | 5.3 | 12575 | 5.24 | -0.06 | ±0.15 | 相符 | 4.98（U_R 12575、V 213.7） |
| Polysulphone | 1.24 | 5.3 | 6.2 | 21250 | 5.53 | -0.67 | ±0.17 | 不符：書內不一致（13.6 與 14.5 矛盾），不調整 | 5.52（U_R 21250、V 356.9） |
| Phenolformaldehyde resin | 1.22 | 7.4 | 5.4 | — | — | — | — | 無法算：書中只有名稱，沒有結構 | — |
| Epoxy resin | 1.18 | 6.4 | 6.8 | — | — | — | — | 無法算：書中只有名稱，沒有結構 | — |

使用者 2026-11-17 決定：接受 Table 13.6 的不符——7 列（PP、PS、PMMA、PEO、PA-6、PA-66、PSF）是書的 Table 13.6 與 14.5 互相矛盾（書內不一致），其餘 8 列原因不明；一律照實列出，不調整。
Table 13.6 共 28 列：能算 24 列，其中相符 9、不符 15；不能算 4 列。
Table 14.5 的 PVDF 列印 V = 360（與 ρ 1.77 推得的約 36 差 10 倍，應為印刷錯誤），所以 PVDF 不放進最後一欄。
Table 13.6 的方法三欄（E_subl/V）需要各聚合物的結晶度 x_c，書中沒有列出，所以只用 Example 13.1（x_c = 0.70）對照；方法二欄（C_v/E）本卡不做。

### 4.4 Table 14.5：U_R、U_H 的 calculated 欄（只比較基團加成值，與 V 無關）

| 聚合物 | 書 U_R | 本卡 U_R | 判定 | 書 U_H | 本卡 U_H | 判定 | 原因／備註 |
|---|---|---|---|---|---|---|---|
| PE(HD) | 1760 | 1760 | 相符（+0） | 1350 | 1350 | 相符（+0） | |
| PP | 2755 | 2755 | 相符（+0） | 2325 | 2325 | 相符（+0） | |
| PMP | 5680 | 5480 | 不符（-200） | 4725 | 4350 | 不符（-375） | |
| PS | 5780 | 5780 | 相符（+0） | 4725 | 4725 | 相符（+0） | |
| PVC | 2605 | 2605 | 相符（+0） | 2125 | 2125 | 相符（+0） | |
| PVDF | 1980 | 1980 | 相符（+0） | 1575 | 1575 | 相符（+0） | |
| PTFE | 2200 | 2200 | 相符（+0） | 1800 | 1800 | 相符（+0） | |
| PMMA | 5100 | 5100 | 相符（+0） | 4325 | 4325 | 相符（+0） | |
| POM | 1280 | 1280 | 相符（+0） | 975 | 975 | 相符（+0） | |
| PEO | 2160 | 2160 | 相符（+0） | 1650 | 1650 | 相符（+0） | |
| PA-6 | 6150 | 6150 | 相符（+0） | 4750 | 4775 | 不符（+25） | |
| PA-66 | 12300 | 12300 | 相符（+0） | 9500 | 9550 | 不符（+50） | |
| PPO | 6500 | 6500 | 相符（+0） | 5100 | 5100 | 相符（+0） | |
| PC | 12575 | 12575 | 相符（+0） | 9900 | 9900 | 相符（+0） | |
| PSF | 21250 | 21250 | 相符（+0） | 16600 | 16900 | 不符（+300） | |
| PESF | 9850 | 9850 | 相符（+0） | 7600 | 7900 | 不符（+300） | |
| ABS | 11750 | — | — | 9470 | — | — | 無法算：書中只有名稱，沒有結構 |
| PVB | 5140 | — | — | 4275 | — | — | 無法算：書中只有名稱，沒有結構 |
| PF | 5570 | — | — | 4375 | — | — | 無法算：書中只有名稱，沒有結構 |
| EP-DM | 41600 | — | — | 33300 | — | — | 無法算：書中只有名稱，沒有結構 |
| EP-RP | 26400 | — | — | 20935 | — | — | 無法算：書中只有名稱，沒有結構 |

Table 14.5 共 21 列（每列 U_R、U_H 兩個值）：能算的值中相符 26、不符 6；5 列無法算（書中沒有結構）。

Example 13.1、13.2 的項目合計：相符 11、不符 1。

