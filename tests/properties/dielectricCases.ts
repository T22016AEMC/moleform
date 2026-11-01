// 介電常數與莫耳折射基團的正例與反例（任務 032，D22），以及書中 Table 11.1、Table 10.4、Table 11.2、Example 11.1 的獨立抄錄（手算用）。
// 正例：SMARTS 必須命中（命中原子數 = 原子數）；反例：SMARTS 不得命中。
export interface GroupCase {
  id: string;
  table: string;
  positives: string[];
  negatives: string[];
}

export const POLARIZATION_GROUP_CASES: readonly GroupCase[] = [
  { id: 'P01', table: '–CH3', positives: ['CC', '[*:1]CC([*:2])C'], negatives: ['C', 'C1CCCCC1', 'C=C'] },
  { id: 'P02', table: '–CH2–', positives: ['CCC', '[*:1]CC[*:2]'], negatives: ['C1CCCCC1', 'CC'] },
  { id: 'P03', table: '>CH–', positives: ['CC(C)C', '[*:1]CC([*:2])C#N'], negatives: ['CCC', 'CC(C)(C)C', 'CC1CCCCC1'] },
  { id: 'P04', table: '>C<', positives: ['CC(C)(C)C', '[*:1]CC([*:2])(C)C(=O)OC'], negatives: ['CC(C)C', 'CC1(C)CCCCC1'] },
  { id: 'P05', table: '苯基（單取代）', positives: ['Cc1ccccc1', '[*:1]CC([*:2])c1ccccc1'], negatives: ['c1ccccc1', 'Cc1ccc(C)cc1', 'Cc1ccc2ccccc2c1'] },
  { id: 'P06', table: '對伸苯基', positives: ['Cc1ccc(C)cc1', '[*:1]c1ccc([*:2])cc1'], negatives: ['Cc1ccccc1', 'Cc1cccc(C)c1', 'Cc1ccccc1C', 'c1ccc2ccccc2c1'] },
  { id: 'P07', table: '–O–', positives: ['COC', 'c1ccccc1Oc1ccccc1'], negatives: ['C1CO1', 'CC(=O)OC', 'CO'] },
  { id: 'P08', table: '>C=O', positives: ['CC(=O)C', 'CC(=O)c1ccccc1'], negatives: ['CC(=O)OC', 'CC(=O)N', 'CC=O'] },
  { id: 'P09', table: '–COO–', positives: ['CC(=O)OC', '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]'], negatives: ['COC(=O)OC', 'CC(=O)OC(C)=O', 'C1CCOC1=O', 'CC(=O)O'] },
  { id: 'P10', table: '–CONH–', positives: ['CC(=O)NC', '[*:1]C(=O)NCC[*:2]'], negatives: ['CC(=O)N(C)C', 'CNC(=O)NC', 'CC(=O)NC(C)=O'] },
  { id: 'P11', table: '–O–COO–', positives: ['COC(=O)OC', '[*:1]OC(=O)Oc1ccccc1'], negatives: ['CC(=O)OC', 'OC(=O)OC'] },
  { id: 'P12', table: '–F', positives: ['CF', 'FC(F)(F)C'], negatives: ['CCl', 'CC'] },
  { id: 'P13', table: '–Cl', positives: ['CCl', 'Clc1ccccc1'], negatives: ['CF', 'CC'] },
  { id: 'P14', table: '–C≡N', positives: ['CC#N', '[*:1]CC([*:2])C#N'], negatives: ['CN', 'CC=N'] },
  { id: 'P15', table: '–CF2–', positives: ['CC(F)(F)C', '[*:1]C(F)(F)C(F)(F)[*:2]'], negatives: ['CC(F)C', 'CC(Cl)(Cl)C', 'C1CC(F)(F)C1'] },
  { id: 'P16', table: '–CCl2–', positives: ['CC(Cl)(Cl)C'], negatives: ['CC(Cl)C', 'CC(F)(F)C'] },
  { id: 'P17', table: '–CHCl–', positives: ['CC(Cl)C', '[*:1]CC(Cl)[*:2]'], negatives: ['CCCl', 'CC(C)(C)Cl', 'CC(Cl)(Cl)C'] },
  { id: 'P18', table: '–S–', positives: ['CSC', 'c1ccccc1Sc1ccccc1'], negatives: ['CS', 'CSSC', 'C1CCSC1'] },
  { id: 'P19', table: '–OH（醇）', positives: ['CCO', 'CC(C)O'], negatives: ['Oc1ccccc1', 'CC(=O)O', 'COC'] },
  { id: 'P20', table: '–OH（酚）', positives: ['Oc1ccccc1', '[*:1]CC([*:2])c1ccc(O)cc1'], negatives: ['CCO', 'CC(=O)O'] },
];

export const MOLAR_REFRACTION_GROUP_CASES: readonly GroupCase[] = [
  { id: 'R01', table: '–CH3（一般）', positives: ['CCC'], negatives: ['Cc1ccccc1', 'C1CCCCC1'] },
  { id: 'R02', table: '–CH3（接在苯環上）', positives: ['Cc1ccccc1'], negatives: ['CCC'] },
  { id: 'R03', table: '–CH2–（一般）', positives: ['CCC', '[*:1]CC[*:2]'], negatives: ['c1ccccc1Cc1ccccc1', 'C1CCCCC1', 'CC'] },
  { id: 'R04', table: '–CH2–（接在苯環上）', positives: ['c1ccccc1Cc1ccccc1', '[*:1]Cc1ccc(cc1)[*:2]'], negatives: ['CCC', 'C1CCCCC1'] },
  { id: 'R05', table: '>CH–（一般）', positives: ['CC(C)C'], negatives: ['CC(C)c1ccccc1', 'CC1CCCCC1'] },
  { id: 'R06', table: '>CH–（接在苯環上）', positives: ['CC(C)c1ccccc1'], negatives: ['CC(C)C'] },
  { id: 'R07', table: '>C<（一般）', positives: ['CC(C)(C)C'], negatives: ['CC(C)(C)c1ccccc1', 'CC1(C)CCCCC1'] },
  { id: 'R08', table: '>C<（接在苯環上）', positives: ['CC(C)(c1ccccc1)c1ccccc1'], negatives: ['CC(C)(C)C'] },
  { id: 'R09', table: '環己基', positives: ['CC1CCCCC1'], negatives: ['C1CCCCC1', 'CC1CCCCC1C'] },
  { id: 'R10', table: '苯基', positives: ['Cc1ccccc1'], negatives: ['c1ccccc1', 'Cc1ccc(C)cc1'] },
  { id: 'R11', table: '鄰伸苯基', positives: ['Cc1ccccc1C'], negatives: ['Cc1cccc(C)c1', 'Cc1ccc(C)cc1', 'c1ccc2ccccc2c1'] },
  { id: 'R12', table: '間伸苯基', positives: ['Cc1cccc(C)c1'], negatives: ['Cc1ccccc1C', 'Cc1ccc(C)cc1'] },
  { id: 'R13', table: '對伸苯基', positives: ['Cc1ccc(C)cc1'], negatives: ['Cc1cccc(C)c1', 'Cc1ccccc1C'] },
  { id: 'R14', table: '–O–（甲基醚）', positives: ['COC', 'CCOC'], negatives: ['COc1ccccc1', 'CCOCC', 'C1CO1'] },
  { id: 'R15', table: '–O–（高級醚）', positives: ['CCOCC'], negatives: ['COC', 'COc1ccccc1', 'c1ccccc1Oc1ccccc1'] },
  { id: 'R16', table: '–O–（接在苯環上）', positives: ['CCOc1ccccc1', 'c1ccccc1Oc1ccccc1'], negatives: ['COc1ccccc1', 'CCOCC'] },
  { id: 'R17', table: '–OH（一級醇）', positives: ['CCCO'], negatives: ['CC(C)O', 'CO'] },
  { id: 'R18', table: '–OH（二級醇）', positives: ['CC(C)O', 'CC(O)CC'], negatives: ['CCCO', 'CC(C)(C)O'] },
  { id: 'R19', table: '–OH（三級醇）', positives: ['CC(C)(C)O'], negatives: ['CC(C)O'] },
  { id: 'R20', table: '–OH（酚）', positives: ['Oc1ccccc1'], negatives: ['CCO'] },
  { id: 'R21', table: '>C=O（甲基酮）', positives: ['CC(=O)CC'], negatives: ['CC(=O)c1ccccc1', 'CCC(=O)CC'] },
  { id: 'R22', table: '>C=O（高級酮）', positives: ['CCC(=O)CC'], negatives: ['CC(=O)CC', 'CCC(=O)c1ccccc1'] },
  { id: 'R23', table: '>C=O（接在苯環上）', positives: ['CCC(=O)c1ccccc1', 'O=C(c1ccccc1)c1ccccc1'], negatives: ['CC(=O)c1ccccc1', 'CC(=O)CC'] },
  { id: 'R24', table: '–COOH', positives: ['CC(=O)O'], negatives: ['CC(=O)OC', 'CC(=O)N'] },
  { id: 'R25', table: '–COO–（甲酯）', positives: ['CCC(=O)OC', '[*:1]CC([*:2])(C)C(=O)OC'], negatives: ['CC(=O)OC', 'CCC(=O)OCC', 'COC(=O)c1ccccc1'] },
  { id: 'R26', table: '–COO–（乙酯）', positives: ['CCC(=O)OCC'], negatives: ['CCC(=O)OC', 'CC(=O)OCC'] },
  { id: 'R27', table: '–COO–（高級酯）', positives: ['CCC(=O)OCCC'], negatives: ['CCC(=O)OC', 'CC(=O)OCCC'] },
  { id: 'R28', table: '–COO–（接在苯環上）', positives: ['CCCOC(=O)c1ccccc1', '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]'], negatives: ['COC(=O)c1ccccc1', 'CCC(=O)OCCC'] },
  { id: 'R29', table: '–COO–（乙酸酯）', positives: ['CC(=O)OCCC', '[*:1]CC([*:2])OC(C)=O'], negatives: ['CC(=O)OC', 'CC(=O)OCC', 'CCC(=O)OCCC'] },
  { id: 'R30', table: '–OCOO–（甲基碳酸酯）', positives: ['COC(=O)OC', 'COC(=O)OCC'], negatives: ['CCOC(=O)OCC', 'COC(=O)C'] },
  { id: 'R31', table: '–OCOO–（高級碳酸酯）', positives: ['CCOC(=O)OCC', 'c1ccccc1OC(=O)Oc1ccccc1'], negatives: ['COC(=O)OC'] },
  { id: 'R32', table: '–NH2（一般）', positives: ['CCN'], negatives: ['Nc1ccccc1', 'CNC'] },
  { id: 'R33', table: '–NH2（接在苯環上）', positives: ['Nc1ccccc1'], negatives: ['CCN'] },
  { id: 'R34', table: '>NH（一般）', positives: ['CNC', 'CCNCC'], negatives: ['CNc1ccccc1', 'CC(=O)NC', 'CN(C)C'] },
  { id: 'R35', table: '>NH（接在苯環上）', positives: ['CNc1ccccc1', 'c1ccccc1Nc1ccccc1'], negatives: ['CNC', 'CC(=O)Nc1ccccc1'] },
  { id: 'R36', table: '>N–（一般）', positives: ['CN(C)C'], negatives: ['CN(C)c1ccccc1', 'CC(=O)N(C)C', 'CNC'] },
  { id: 'R37', table: '>N–（接在苯環上）', positives: ['CN(C)c1ccccc1'], negatives: ['CN(C)C', 'CC(=O)N(C)c1ccccc1'] },
  { id: 'R38', table: '–CONH–（一般）', positives: ['CC(=O)NC', '[*:1]C(=O)NCC[*:2]'], negatives: ['CC(=O)Nc1ccccc1', 'c1ccccc1C(=O)NC', 'CC(=O)N(C)C'] },
  { id: 'R39', table: '–CONH–（接在苯環上）', positives: ['CC(=O)Nc1ccccc1', 'c1ccccc1C(=O)NC'], negatives: ['CC(=O)NC', 'CC(=O)N(C)c1ccccc1'] },
  { id: 'R40', table: '–C≡N', positives: ['CC#N'], negatives: ['CN', 'CC=N'] },
  { id: 'R41', table: '–S–（甲基硫醚）', positives: ['CSC', 'CSCC'], negatives: ['CCSCC', 'CS'] },
  { id: 'R42', table: '–S–（高級硫醚）', positives: ['CCSCC', 'c1ccccc1Sc1ccccc1'], negatives: ['CSC', 'CS'] },
  { id: 'R43', table: '–F', positives: ['CF'], negatives: ['CCl'] },
  { id: 'R44', table: '–Cl（一級）', positives: ['CCCl'], negatives: ['CC(C)Cl', 'Clc1ccccc1'] },
  { id: 'R45', table: '–Cl（二級）', positives: ['CC(C)Cl'], negatives: ['CCCl', 'CC(C)(C)Cl'] },
  { id: 'R46', table: '–Cl（三級）', positives: ['CC(C)(C)Cl'], negatives: ['CC(C)Cl'] },
  { id: 'R47', table: '–Cl（接在苯環上）', positives: ['Clc1ccccc1'], negatives: ['CCCl'] },
];

/** Table 11.1（書頁 321，PDF 第 348 頁）的獨立抄錄：P_LL（cm³/mol）、P_V（g/mol）；書中括號與 ~ 的值照數值，與 CSV 分開，手算用 */
export const TABLE111 = {
  CH3: { pLL: 5.64, pV: 17.66 },
  CH2: { pLL: 4.65, pV: 20.64 },
  CH: { pLL: 3.62, pV: 23.5 },
  C: { pLL: 2.58, pV: 26.4 },
  phenyl: { pLL: 25.5, pV: 123.5 },
  phenylene: { pLL: 25.0, pV: 128.6 },
  O: { pLL: 5.2, pV: 30 },
  CO: { pLL: 10, pV: 65 },
  COO: { pLL: 15, pV: 95 },
  CONH: { pLL: 30, pV: 125 },
  OCOO: { pLL: 22, pV: 125 },
  F: { pLL: 1.8, pV: 20 },
  Cl: { pLL: 9.5, pV: 60 },
  CN: { pLL: 11, pV: 50 },
  CF2: { pLL: 6.25, pV: 70 },
  CCl2: { pLL: 17.7, pV: 145 },
  CHCl: { pLL: 13.7, pV: 90 },
  S: { pLL: 8, pV: 60 },
  OHalc: { pLL: 6, pV: 30 },
  OHphenol: { pLL: 20, pV: 100 },
} as const;

/** Table 10.4 R_LL 欄（書頁 293–294，PDF 第 320–321 頁）的獨立抄錄（cm³/mol），與 CSV 分開，手算用 */
export const TABLE104 = {
  CH3: 5.644,
  CH3ring: 5.47,
  CH2: 4.649,
  CH2ring: 4.5,
  CH: 3.616,
  CHring: 3.52,
  C: 2.58,
  Cring: 2.29,
  phenyl: 25.51,
  pPhenylene: 25.03,
  etherHigher: 1.641,
  phenol: 2.27,
  esterMethyl: 6.237,
  esterEthyl: 6.375,
  esterRing: 6.71,
  esterAcetate: 6.306,
  carbonateHigher: 7.74,
  CONH: 7.23,
  CN: 5.528,
  F: 0.898,
  ClSecondary: 6.023,
} as const;

/** Table 4.10（任務 029）Va（cm³/mol）的獨立抄錄（書頁 88），只用於手算 V；與 molarVolumeCases 的 TABLE410 相同來源，再加 –CH(OCOCH3)– */
export const VA = {
  CH2: 16.37,
  CH_CH3: 32.72,
  CH_C6H5: 84.16,
  CHCl: 30,
  C_CH3_COOCH3: 74.7,
  CH_OCOCH3: 52.4,
  COO: 23,
  OCOO: 31,
  CONH: 21,
  C_CH3_2: 49,
  C6H4_para: 65.5,
} as const;
export const VC = {
  CH2: 14.68,
  CH_CH3: 29.35,
  CH_C6H5: 75.48,
  CHCl: 27.3,
  C_CH3_COOCH3: 67,
  CH_OCOCH3: 47,
  COO: 21.5,
  OCOO: 27,
  CONH: 18.7,
  C_CH3_2: 44,
  C6H4_para: 59,
} as const;

type P = keyof typeof TABLE111;
type V = keyof typeof VA;
type R = keyof typeof TABLE104;

export interface BookDielectricCase {
  name: string;
  smiles: string;
  /** Table 11.1 的基團 × 個數（手算 ΣP） */
  p: [P, number][];
  /** Table 4.10 的基團 × 個數（手算 Va、Vc）；沒有（Table 4.10 缺基團）時為 null */
  v: [V, number][] | null;
  /** Table 11.2（書頁 322，PDF 第 349 頁）「ε Calc. from Eq. (11.7)」 */
  book117: number;
  /** Table 11.2「ε Calc. from Eq. (11.8)」 */
  book118: number;
  /** 以 Va 算的 (11.7) 與書中計算值在書中印刷捨入範圍內（差 ≤ 0.04） */
  va117Close: boolean;
}

export const BOOK_DIELECTRIC_CASES: readonly BookDielectricCase[] = [
  { name: '聚乙烯（Table 11.2，外推至非晶）', smiles: '[*:1]CC[*:2]', p: [['CH2', 2]], v: [['CH2', 2]], book117: 2.2, book118: 2.2, va117Close: true },
  { name: '聚丙烯（非晶部分）', smiles: '[*:1]CC([*:2])C', p: [['CH3', 1], ['CH2', 1], ['CH', 1]], v: [['CH_CH3', 1], ['CH2', 1]], book117: 2.15, book118: 2.15, va117Close: true },
  { name: '聚苯乙烯', smiles: '[*:1]CC([*:2])c1ccccc1', p: [['CH2', 1], ['CH', 1], ['phenyl', 1]], v: [['CH2', 1], ['CH_C6H5', 1]], book117: 2.55, book118: 2.6, va117Close: true },
  { name: '聚氯乙烯', smiles: '[*:1]CC(Cl)[*:2]', p: [['CH2', 1], ['CHCl', 1]], v: [['CH2', 1], ['CHCl', 1]], book117: 3.05, book118: 3.15, va117Close: false },
  { name: '聚甲基丙烯酸甲酯', smiles: '[*:1]CC([*:2])(C)C(=O)OC', p: [['CH3', 2], ['CH2', 1], ['C', 1], ['COO', 1]], v: [['CH2', 1], ['C_CH3_COOCH3', 1]], book117: 2.94, book118: 3.15, va117Close: false },
  { name: '聚乙酸乙烯酯', smiles: '[*:1]CC([*:2])OC(C)=O', p: [['CH3', 1], ['CH2', 1], ['CH', 1], ['COO', 1]], v: [['CH2', 1], ['CH_OCOCH3', 1]], book117: 3.02, book118: 3.3, va117Close: false },
  { name: '聚對苯二甲酸乙二酯（非晶）', smiles: '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]', p: [['CH2', 2], ['phenylene', 1], ['COO', 2]], v: [['CH2', 2], ['COO', 2], ['C6H4_para', 1]], book117: 3.4, book118: 3.5, va117Close: true },
  { name: '聚雙酚碳酸酯（Example 11.1）', smiles: '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]', p: [['phenylene', 2], ['C', 1], ['CH3', 2], ['OCOO', 1]], v: [['C6H4_para', 2], ['C_CH3_2', 1], ['OCOO', 1]], book117: 3.0, book118: 3.05, va117Close: false },
  { name: '聚（己二醯己二胺）（尼龍 6,6）', smiles: '[*:1]NC(=O)CCCCC(=O)NCCCCCC[*:2]', p: [['CH2', 10], ['CONH', 2]], v: [['CH2', 10], ['CONH', 2]], book117: 4.14, book118: 4.1, va117Close: false },
];

/** 只有 P_V 版本可算的 Table 11.2 聚合物（Table 4.10 缺這些結構的基團，沒有莫耳體積）；book118 同上 */
export const BOOK_DIELECTRIC_PV_ONLY: readonly { name: string; smiles: string; p: [P, number][]; book118: number }[] = [
  { name: '聚（四氟乙烯）', smiles: '[*:1]C(F)(F)C(F)(F)[*:2]', p: [['CF2', 2]], book118: 1.96 },
  { name: '聚丙烯腈', smiles: '[*:1]CC([*:2])C#N', p: [['CH2', 1], ['CH', 1], ['CN', 1]], book118: 3.15 },
  { name: '聚（亞甲基氧）', smiles: '[*:1]CO[*:2]', p: [['CH2', 1], ['O', 1]], book118: 2.85 },
  { name: '聚甲基丙烯酸乙酯', smiles: '[*:1]CC([*:2])(C)C(=O)OCC', p: [['CH3', 2], ['CH2', 2], ['C', 1], ['COO', 1]], book118: 3.0 },
];

export interface BookRefractionCase {
  name: string;
  smiles: string;
  /** Table 10.4 的基團 × 個數（手算 ΣR_LL） */
  r: [R, number][];
  /** 書中印的 ΣR（Example 11.1，書頁 324）；其他沒有 */
  bookSum?: number;
}

export const BOOK_REFRACTION_CASES: readonly BookRefractionCase[] = [
  { name: '聚乙烯', smiles: '[*:1]CC[*:2]', r: [['CH2', 2]] },
  { name: '聚丙烯', smiles: '[*:1]CC([*:2])C', r: [['CH3', 1], ['CH2', 1], ['CH', 1]] },
  { name: '聚苯乙烯', smiles: '[*:1]CC([*:2])c1ccccc1', r: [['CH2', 1], ['CHring', 1], ['phenyl', 1]] },
  { name: '聚氯乙烯', smiles: '[*:1]CC(Cl)[*:2]', r: [['CH2', 1], ['CH', 1], ['ClSecondary', 1]] },
  { name: '聚甲基丙烯酸甲酯', smiles: '[*:1]CC([*:2])(C)C(=O)OC', r: [['CH3', 2], ['CH2', 1], ['C', 1], ['esterMethyl', 1]] },
  { name: '聚甲基丙烯酸乙酯', smiles: '[*:1]CC([*:2])(C)C(=O)OCC', r: [['CH3', 2], ['CH2', 2], ['C', 1], ['esterEthyl', 1]] },
  { name: '聚乙酸乙烯酯', smiles: '[*:1]CC([*:2])OC(C)=O', r: [['CH3', 1], ['CH2', 1], ['CH', 1], ['esterAcetate', 1]] },
  { name: '聚對苯二甲酸乙二酯', smiles: '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]', r: [['CH2', 2], ['pPhenylene', 1], ['esterRing', 2]] },
  { name: '聚雙酚碳酸酯（Example 11.1）', smiles: '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]', r: [['pPhenylene', 2], ['Cring', 1], ['CH3', 2], ['carbonateHigher', 1]], bookSum: 71.38 },
  { name: '尼龍 6,6', smiles: '[*:1]NC(=O)CCCCC(=O)NCCCCCC[*:2]', r: [['CH2', 10], ['CONH', 2]] },
  { name: '聚（四氟乙烯）', smiles: '[*:1]C(F)(F)C(F)(F)[*:2]', r: [['C', 2], ['F', 4]] },
  { name: '聚丙烯腈', smiles: '[*:1]CC([*:2])C#N', r: [['CH2', 1], ['CH', 1], ['CN', 1]] },
  { name: '聚羥基苯乙烯', smiles: '[*:1]CC([*:2])c1ccc(O)cc1', r: [['CH2', 1], ['CHring', 1], ['pPhenylene', 1], ['phenol', 1]] },
  { name: '聚（亞甲基氧）', smiles: '[*:1]CO[*:2]', r: [['CH2', 1], ['etherHigher', 1]] },
];
