// VW 基團的正例與反例（任務 028，D22），以及書中 Table 4.7 的對照案例。正例：SMARTS 必須命中；反例：SMARTS 不得命中。
// 「table」欄是 Table 4.2 的基團寫法，逐列核對 vw_groups.csv 的名稱順序。
export interface VwGroupCase {
  id: string;
  table: string;
  positives: string[];
  negatives: string[];
}

export const VW_GROUP_CASES: readonly VwGroupCase[] = [
  { id: 'V01', table: '–CH2–', positives: ['CCC', '[*:1]CC[*:2]'], negatives: ['C1CCCCC1', 'CC'] },
  { id: 'V02', table: '–CH(C6H5)–', positives: ['[*:1]CC([*:2])c1ccccc1', 'CCC(C)c1ccccc1'], negatives: ['CCc1ccccc1', 'CC(C)c1ccccc1C', 'c1ccccc1'] },
  { id: 'V03', table: '–CH(OCOCH3)–', positives: ['[*:1]CC([*:2])OC(C)=O', 'CCC(C)OC(C)=O'], negatives: ['CCOC(C)=O', 'CC(C)OC(=O)CC'] },
  { id: 'V04', table: '–CH(COOCH3)–', positives: ['[*:1]CC([*:2])C(=O)OC', 'CCC(C)C(=O)OC'], negatives: ['CCC(=O)OC', 'CC(C)C(=O)OCC'] },
  { id: 'V05', table: '–CHCl–', positives: ['CCC(Cl)CC', '[*:1]CC(Cl)[*:2]'], negatives: ['CCCl', 'CC(C)(C)Cl'] },
  { id: 'V06', table: '–C(CH3)2–', positives: ['CC(C)(c1ccccc1)c1ccccc1', '[*:1]CC(C)(C)C[*:2]'], negatives: ['CC(C)(C)C', 'CC(C)C'] },
  { id: 'V07', table: '–C(CH3)(COOCH3)–', positives: ['[*:1]CC([*:2])(C)C(=O)OC', 'CCC(C)(CC)C(=O)OC'], negatives: ['CC(C)(C)C(=O)OC', 'CCC(CC)C(=O)OC'] },
  { id: 'V08', table: '–CH=CH–', positives: ['CC=CC', 'C/C=C/C'], negatives: ['C=CC', 'CC(C)=CC'] },
  { id: 'V09', table: '–C(=O)–（al.）', positives: ['CCC(C)=O', '[*:1]CC(=O)CC[*:2]'], negatives: ['CC(=O)OC', 'CC=O', 'CC(=O)c1ccccc1'] },
  { id: 'V10', table: '–O–（VW 留空）', positives: ['COC', 'CCOCC'], negatives: ['CCO', 'C1CO1'] },
  { id: 'V11', table: '–COO–', positives: ['CC(=O)OC', 'CCOC(=O)C', '[*:1]CC(=O)OC[*:2]'], negatives: ['CC(=O)O', 'COC(=O)OC', 'O=COC', 'CC(=O)NC', 'O=C1CCCO1'] },
  { id: 'V12', table: '–CONH–', positives: ['CC(=O)NC', '[*:1]C(=O)NCC[*:2]'], negatives: ['CC(N)=O', 'CC(=O)N(C)C', 'CNC(=O)NC', 'CNC(=O)OC'] },
  { id: 'V13', table: '–C6H4–（間位）', positives: ['Cc1cccc(C)c1'], negatives: ['Cc1ccc(C)cc1', 'Cc1ccccc1C', 'Cc1ccccc1'] },
  { id: 'V14', table: '–C6H4–（對位）', positives: ['Cc1ccc(C)cc1'], negatives: ['Cc1cccc(C)c1', 'Cc1ccccc1C', 'c1ccc2ccccc2c1'] },
  { id: 'V15', table: '–CH3', positives: ['CCC'], negatives: ['C', 'C1CCCCC1'] },
  { id: 'V16', table: '–CH(CH3)2', positives: ['CC(C)CC', '[*:1]CC(C)C'], negatives: ['CC(C)C', 'CC(C)(C)C'] },
  { id: 'V17', table: '–OH', positives: ['CCO', 'Oc1ccccc1'], negatives: ['COC', 'C1CO1'] },
  { id: 'V18', table: '–Cl（al.）', positives: ['CCCl'], negatives: ['Clc1ccccc1', 'CF'] },
  { id: 'V19', table: 'C6H5–', positives: ['Cc1ccccc1', 'Oc1ccccc1'], negatives: ['Cc1ccc(C)cc1', 'c1ccccc1', 'C1CCCCC1'] },
  { id: 'V20', table: 'C6H11–', positives: ['CC1CCCCC1', '[*:1]CC([*:2])C1CCCCC1'], negatives: ['C1CCCCC1', 'CC1CCCCC1C'] },
  { id: 'V21', table: '1-萘基 C10H7–', positives: ['Cc1cccc2ccccc12'], negatives: ['Cc1ccc2ccccc2c1', 'c1ccc2ccccc2c1'] },
  { id: 'V22', table: '2-萘基 C10H7–', positives: ['Cc1ccc2ccccc2c1', '[*:1]C([*:2])c1ccc2ccccc2c1'], negatives: ['Cc1cccc2ccccc12', 'Cc1ccc2cc(C)ccc2c1'] },
  { id: 'V23', table: 'CHar', positives: ['Cc1ccccc1C', 'c1ccc2ccccc2c1'], negatives: ['C1CCCCC1', 'CC'] },
  { id: 'V24', table: 'Car（exo）', positives: ['Cc1ccccc1C', 'Oc1ccccc1C'], negatives: ['c1ccccc1', 'c1ccc2ccccc2c1', 'c1ccc2CCCc2c1'] },
  { id: 'V25', table: '>CH–', positives: ['CC(C)C', '[*:1]C([*:2])c1ccc2ccccc2c1'], negatives: ['CCC', 'CC1CC1', 'CC(C)(C)C'] },
  { id: 'V26', table: '>C<', positives: ['[*:1]CC([*:2])(C)C(=O)OCC', 'CCC(CC)(CC)CC'], negatives: ['CC(C)C', 'CC1(C)CC1'] },
];

/** Table 4.2 的獨立抄錄（VW，cm³/mol），與 vw_groups.csv 分開，手算用；來源：書頁 74–75 圖像逐列讀取 */
export const TABLE42 = {
  CH2: 10.23,
  CH_C6H5: 52.6,
  CH_OCOCH3: 37.0,
  CH_COOCH3: 37.0,
  CHCl: 19.0,
  C_CH3_2: 30.7,
  C_CH3_COOCH3: 46.7,
  CHCH: 16.9,
  CO_al: 8.5,
  COO: 15.2,
  CONH: 13,
  C6H4: 43.3,
  CH3: 13.67,
  CH_CH3_2: 34.1,
  OH: 8.0,
  Cl_al: 11.6,
  C6H5: 45.85,
  C6H11: 56.8,
  C10H7: 71.45,
  CHar: 8.05,
  Car_exo: 5.55,
  CHtri: 6.8, // >CH–（三價）
  Ctet: 3.3, // >C<（四價）
} as const;

export interface BookVwCase {
  name: string;
  /** 結構單元 SMILES（由書中聚合物名稱整理；Table 4.7 沒有畫結構） */
  smiles: string;
  /** Table 4.7 的 VW（cm³/mol） */
  book: number;
  where: string;
  /** 手算用的基團與個數（Table 4.2） */
  parts: [keyof typeof TABLE42, number][];
  類型: string;
}

/** D-1：書中 Table 4.7（書頁 82–83）的 VW 對照，程式結果要與書中數值差 ≤ 0.1 */
export const BOOK_VW_CASES: readonly BookVwCase[] = [
  { name: '聚苯乙烯', smiles: '[*:1]CC([*:2])c1ccccc1', book: 62.9, where: 'Table 4.7，書頁 82', parts: [['CH2', 1], ['CH_C6H5', 1]], 類型: '芳香環' },
  { name: '聚氯乙烯', smiles: '[*:1]CC(Cl)[*:2]', book: 29.2, where: 'Table 4.7，書頁 82', parts: [['CH2', 1], ['CHCl', 1]], 類型: '脂肪鏈、鹵素' },
  { name: '聚（4-甲基戊烯）', smiles: '[*:1]CC([*:2])CC(C)C', book: 61.4, where: 'Table 4.7，書頁 82', parts: [['CH2', 2], ['CHtri', 1], ['CH_CH3_2', 1]], 類型: '脂肪鏈' },
  { name: '聚（乙烯基環己烷）', smiles: '[*:1]CC([*:2])C1CCCCC1', book: 73.8, where: 'Table 4.7，書頁 82', parts: [['CH2', 1], ['CHtri', 1], ['C6H11', 1]], 類型: '含環（脂環）' },
  { name: '聚對苯二甲酸乙二酯（PET）', smiles: '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]', book: 94.2, where: 'Table 4.7，書頁 83', parts: [['CH2', 2], ['COO', 2], ['C6H4', 1]], 類型: '酯基、對位苯環' },
  { name: '聚間苯二甲酸乙二酯', smiles: '[*:1]CCOC(=O)c1cccc(c1)C(=O)O[*:2]', book: 94.2, where: 'Table 4.7，書頁 83', parts: [['CH2', 2], ['COO', 2], ['C6H4', 1]], 類型: '酯基、間位苯環' },
  { name: '聚鄰苯二甲酸乙二酯', smiles: '[*:1]CCOC(=O)c1ccccc1C(=O)O[*:2]', book: 94.2, where: 'Table 4.7，書頁 83', parts: [['CH2', 2], ['COO', 2], ['C6H4', 1]], 類型: '酯基、鄰位苯環（逐原子相加）' },
  { name: '聚甲基丙烯酸乙酯（PEMA）', smiles: '[*:1]CC([*:2])(C)C(=O)OCC', book: 66.3, where: 'Table 4.7，書頁 82', parts: [['CH2', 2], ['Ctet', 1], ['CH3', 2], ['COO', 1]], 類型: '酯基（乙酯；Table 4.2 的組合基團只有甲酯，改由原子基團相加）' },
  { name: '聚（間苯二甲酸四亞甲酯）', smiles: '[*:1]CCCCOC(=O)c1cccc(c1)C(=O)O[*:2]', book: 114.6, where: 'Table 4.7，書頁 83', parts: [['CH2', 4], ['COO', 2], ['C6H4', 1]], 類型: '酯基、脂肪鏈' },
  { name: '尼龍 6', smiles: '[*:1]C(=O)NCCCCC[*:2]', book: 64.2, where: 'Table 4.7，書頁 83', parts: [['CH2', 5], ['CONH', 1]], 類型: '醯胺（括號值）' },
  { name: '尼龍 6,6', smiles: '[*:1]NC(=O)CCCCC(=O)NCCCCCC[*:2]', book: 128.3, where: 'Table 4.7，書頁 83', parts: [['CH2', 10], ['CONH', 2]], 類型: '醯胺（括號值）' },
  { name: '尼龍 6,10', smiles: '[*:1]NC(=O)CCCCCCCCC(=O)NCCCCCC[*:2]', book: 169.2, where: 'Table 4.7，書頁 83', parts: [['CH2', 14], ['CONH', 2]], 類型: '醯胺（括號值）' },
];

/** 書中 Table 4.7 與 Table 4.2 組合基團不一致的兩個聚合物（KNOWN_ISSUES M18）；程式照 Table 4.2 印的值加總，與書中 VW 差超過 0.1 */
export const BOOK_VW_DISCREPANCIES: readonly { name: string; smiles: string; book: number; where: string; parts: [keyof typeof TABLE42, number][] }[] = [
  { name: '聚甲基丙烯酸甲酯（PMMA）', smiles: '[*:1]CC([*:2])(C)C(=O)OC', book: 56.1, where: 'Table 4.7，書頁 82', parts: [['CH2', 1], ['C_CH3_COOCH3', 1]] },
  { name: '聚乙酸乙烯酯（PVAc）', smiles: '[*:1]CC([*:2])OC(C)=O', book: 45.9, where: 'Table 4.7，書頁 82', parts: [['CH2', 1], ['CH_OCOCH3', 1]] },
];
