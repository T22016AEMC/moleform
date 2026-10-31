// 任務 030：van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009) 的數值，由頁面圖像讀取（PDF 轉 200 dpi 圖逐頁看圖）。
// 只供診斷腳本使用，不是專案資料表（沒有進 src/data）。每個常數註明書頁（PDF 頁 = 書頁 + 27）。
// 括號值（書中標為暫定）在註解標「括號」。沒有使用記憶中的數值。

/** Table 4.2（書頁 74–75）：VW，cm³/mol */
export const VW = {
  CH2: 10.23,
  CH3: 13.67,
  CH: 6.8, // >CH–（三價）
  C: 3.3, // >C<（四價）
  CHar: 8.05,
  CarExo: 5.55,
  CarEndo: 4.75, // C*ar (endo)
  NarPyrid: 5.2,
  Nt: 4.3, // –N<（三價）
  H: 3.44,
  OH: 8.0,
  F: 5.7,
  ClAl: 11.6,
  CN: 14.7, // –C≡N
  CHCH3_2: 34.1, // –CH(CH3)2
  CCH3_3: 44.35, // –C(CH3)3
  phenyl: 45.85, // C6H5–
  cyclohexyl: 56.8, // C6H11–（環己基）
  cyclopentyl: 46.5, // C5H9–
  pyridyl: 43.0,
  naphthyl: 71.45, // 1- 或 2-萘基
  carbazolyl: 88.7, // N-咔唑基
  phenylene: 43.3, // –C6H4–（間位、對位同值）
  cyclohexylene: 53.3,
  dimethylphenylene: 65.6, // 環上兩個連接點 + 兩個 CH3
  diphenylphenylene: 130,
  naphthylene: 69.9,
  pyromellitimide: 94.5,
  COal: 8.5, // –C(=O)– al.
  COar: 11.7, // –C(=O)– ar.
  O_a: 5.5, // –O–：括號，書中印兩個值，沒有標示條件（M19）
  O_b: 5.0, // 括號
  NH: 4, // 括號
  S: 10.8,
  SS: 22.7,
  Si: 16.6, // –Si<（四價）
  SiCH3_2: 42.2, // –Si(CH3)2–
  ethynylene: 16.1, // –C≡C–
  ethynylC: 8, // –C≡（括號）
  ethynyl: 19.5, // –C≡CH
  // 組合基團（二價，書頁 74）
  CHCH3: 20.45,
  CH_iC3H7: 40.9,
  CH_tC4H9: 51.1,
  CH_C6H5: 52.6,
  CH_C6H4CH3: 63.8,
  CH_OH: 14.8,
  CH_OCH3: 25.5,
  CH_OCOCH3: 37.0,
  CH_COOCH3: 37.0,
  CH_CN: 21.5,
  CHF: 12.5,
  CHCl: 19.0,
  C_CH3_2: 30.7,
  C_CH3_C6H5: 62.8,
  C_CH3_COOCH3: 46.7,
  CF2: 14.8,
  CCl2: 27.8,
  COO: 15.2,
  OCOO: 18.9,
  CONH: 13, // 括號
  OCONH: 18, // 括號
  NHCONH: 18, // 括號
  CH2Cl: 21.85,
  CHCl2: 31.3,
  CCl3: 38.2,
  CF3: 21.3,
} as const;

/** Table 4.10（書頁 88）：Va（非晶，玻璃態與橡膠態共用）與 Vc（結晶），cm³/mol */
export const VM: Record<string, [number, number]> = {
  CH2: [16.37, 14.68],
  CH_CH3: [32.72, 29.35],
  CH_iC3H7: [65.44, 58.69],
  CH_tC4H9: [81.79, 73.36],
  CH_C6H11: [101.76, 91.27],
  CH_C6H5: [84.16, 75.48],
  CH_C6H4CH3: [102.1, 91.55],
  CH_OCH3: [40.8, 36.6],
  CH_OCOCH3: [52.4, 47],
  CH_COOCH3: [56.85, 51],
  C_CH3_2: [49.0, 44.0],
  C_CH3_C6H5: [100.5, 90],
  C_CH3_COOCH3: [74.7, 67],
  S: [17.3, 15.5],
  SS: [36, 32.5],
  COal: [13.5, 12.25], // 括號外
  COar: [18.5, 16.8],
  COO_general: [23, 21.5],
  COO_acrylics: [20.5, 18.4],
  OCOO: [31, 27],
  CONH: [21, 18.7], // 括號
  OCONH: [29, 26], // 括號
  NHCONH: [29, 26], // 括號
  O_al: [8.5, 7.9], // 括號
  O_ar: [8.0, 7.1], // 括號
  NH: [6.4, 5.7], // 括號
  cyclohexyl: [86, 77], // 括號（Vc）；單取代環己基
  mPhenylene: [69, 62],
  pPhenylene: [65.5, 59],
  dimethylPhenylene: [104, 94],
};

/** Table 6.1、6.3（書頁 133–136、141–142）：Ygi，K·kg/mol。括號值在註解標明 */
export const YG = {
  CH2: 2.7, // 主鏈一般
  C_CH3_2_free: 8.5,
  C_CH3_2_hind: 15, // st. hindered：兩側都是芳香環（書頁 140）
  C_C6H5_2: 65,
  C_CH3_C6H5: 51,
  cyclohexylene_trans: 27,
  cyclohexylene_cis: 19, // 括號
  O: 4,
  NH: 7, // 括號
  S: 8,
  anhydride: 22, // –CO–O–CO–（n）
  carbonate: 20,
  urethane: 20,
  urea: 20,
  CO_n: 11.5,
  CO_c: 15.5,
  CO_cc: 19,
  COO_n: 12.5,
  COO_c: 13.5,
  COO_cc: 15,
  CONH_n: 15,
  CONH_c: 21.5,
  CONH_cc: 30,
  SO2_n: 32.5,
  SO2_c: 36,
  SO2_cc: 40,
  pPh_n: 29.5,
  pPh_c: 35,
  pPh_cc: 41,
  mPh_n: 25,
  mPh_c: 29,
  mPh_cc: 34,
} as const;

/** Table 6.3（書頁 141–142）組合基團的 Ygi */
export const YG63 = {
  diphenylmethane: 65,
  BPA: 87,
  phenylEthylidene: 121,
  diphenylmethylene: 168,
  cyclohexylidene: 102, // 4,4'-二伸苯基環己烷
  bisIsopropylidene: 137,
  xylylene: 35, // –CH2–C6H4–CH2–
  OC6H4O: 37.4,
  terephthalate: 62,
  isophthalate: 56.5,
  terephthalamide: 83,
  isophthalamide: 70,
  pOC6H4CO: 58, // 括號
  mOC6H4CO: 52, // 括號
  pNHC6H4CO: 70, // 括號
  aramidP: 148,
  aramidM: 112,
  biphenylene: 70,
  benzophenone: 84,
  diphenylether: 67,
  triphenyldiether: 104,
  diphenylsulfide: 72,
  diphenylsulfone: 111,
} as const;

/** Table 4.7（書頁 82–83）：Vr/Vw 與 VW（cm³/mol），聚合物名稱依書 */
export const T47: { name: string; vw: number; page: number }[] = [
  { name: 'Poly(4-methylpentene)', vw: 61.4, page: 82 },
  { name: 'Polystyrene', vw: 62.9, page: 82 },
  { name: 'Poly(vinyl chloride)', vw: 29.2, page: 82 },
  { name: 'Poly(vinylcyclohexane)', vw: 73.8, page: 82 },
  { name: 'Poly(vinyl acetate)', vw: 45.9, page: 82 },
  { name: 'Poly(methyl methacrylate)', vw: 56.1, page: 82 },
  { name: 'Poly(ethyl methacrylate)', vw: 66.3, page: 82 },
  { name: 'Poly(phenyl methacrylate)', vw: 88.3, page: 82 },
  { name: 'Poly(benzyl methacrylate)', vw: 98.5, page: 82 },
  { name: 'Poly(dimethyl phenylene oxide)', vw: 69.3, page: 83 },
  { name: 'Poly(diphenyl phenylene oxide)', vw: 133.7, page: 83 },
  { name: 'Poly(ethylene terephthalate)', vw: 94.2, page: 83 },
  { name: 'Nylon 6', vw: 64.2, page: 83 },
  { name: 'Nylon 6,6', vw: 128.3, page: 83 },
  { name: 'Poly(4,4-isopropylenediphenylene carbonate)', vw: 136.2, page: 83 },
  { name: 'Poly(4,4-methylenediphenylene carbonate)', vw: 115.8, page: 83 },
  { name: 'Poly(thiodiphenylene carbonate)', vw: 116.3, page: 83 },
];
