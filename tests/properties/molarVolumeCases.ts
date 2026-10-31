// 聚合物莫耳體積基團的正例與反例（任務 029，D22），以及書中 Table 4.10 的對照案例。正例：SMARTS 必須命中；反例：SMARTS 不得命中。
export interface MolarVolumeGroupCase {
  id: string;
  table: string;
  positives: string[];
  negatives: string[];
}

export const MOLAR_VOLUME_GROUP_CASES: readonly MolarVolumeGroupCase[] = [
  { id: 'M01', table: '–CH2–', positives: ['CCC', '[*:1]CC[*:2]'], negatives: ['C1CCCCC1', 'CC'] },
  { id: 'M02', table: '–CH(CH3)–', positives: ['[*:1]CC([*:2])C', 'CCC(C)CC'], negatives: ['CC(C)C', 'CC', 'CC(O)CC'] },
  { id: 'M03', table: '–CH(C6H11)–', positives: ['[*:1]CC([*:2])C1CCCCC1'], negatives: ['C1CCCCC1', 'CC1CCCCC1'] },
  { id: 'M04', table: '–CH(C6H5)–', positives: ['[*:1]CC([*:2])c1ccccc1', 'CCC(C)c1ccccc1'], negatives: ['CCc1ccccc1', 'CC(C)c1ccccc1C', 'c1ccccc1'] },
  { id: 'M05', table: '–CH(OH)–', positives: ['[*:1]CC([*:2])O', 'CCC(O)CC'], negatives: ['CCO', 'CC(C)(O)C', 'CC(O)CC'] },
  { id: 'M06', table: '–CHCl–', positives: ['[*:1]CC(Cl)[*:2]', 'CCC(Cl)CC'], negatives: ['CCCl', 'CC(C)(C)Cl'] },
  { id: 'M07', table: '–C(CH3)2–', positives: ['[*:1]CC(C)(C)C[*:2]', 'CC(C)(c1ccccc1)c1ccccc1'], negatives: ['CC(C)(C)C', 'CC(C)C'] },
  { id: 'M08', table: '–C(CH3)(COOCH3)–', positives: ['[*:1]CC([*:2])(C)C(=O)OC', 'CCC(C)(CC)C(=O)OC'], negatives: ['CC(C)(C)C(=O)OC', '[*:1]CC([*:2])(C)C(=O)OCC'] },
  { id: 'M09', table: '–O–（al.）', positives: ['COC', 'CCOCC'], negatives: ['COc1ccccc1', 'C1CO1', 'CCO'] },
  { id: 'M10', table: '–O–（ar.）', positives: ['c1ccccc1Oc1ccccc1'], negatives: ['COc1ccccc1', 'COC'] },
  { id: 'M11', table: '–COO–（general）', positives: ['COC(=O)c1ccccc1', '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]'], negatives: ['CC(=O)OC', 'COC(=O)OC', 'CC(=O)O', 'CC(=O)NC'] },
  { id: 'M12', table: '–OCOO–', positives: ['COC(=O)OC', '[*:1]OC(=O)Oc1ccccc1'], negatives: ['CC(=O)OC', 'CC(=O)O'] },
  { id: 'M13', table: '–CONH–', positives: ['CC(=O)NC', '[*:1]C(=O)NCC[*:2]'], negatives: ['CC(N)=O', 'CC(=O)N(C)C', 'CNC(=O)NC'] },
  { id: 'M14', table: '–C6H4–（間位）', positives: ['Cc1cccc(C)c1'], negatives: ['Cc1ccc(C)cc1', 'Cc1ccccc1C'] },
  { id: 'M15', table: '–C6H4–（對位）', positives: ['Cc1ccc(C)cc1'], negatives: ['Cc1cccc(C)c1', 'Cc1ccccc1C'] },
  { id: 'M16', table: '萘環（2,6-二取代）', positives: ['Cc1ccc2cc(C)ccc2c1', '[*:1]c1ccc2cc([*:2])ccc2c1'], negatives: ['Cc1ccc2ccc(C)cc2c1', 'Cc1ccc(C)c2ccccc12', 'c1ccc2ccccc2c1'] },
  { id: 'M17', table: '均苯四甲醯亞胺', positives: ['CN1C(=O)c2cc3C(=O)N(C)C(=O)c3cc2C1=O', '[*:1]N1C(=O)c2cc3C(=O)N([*:2])C(=O)c3cc2C1=O'], negatives: ['CN1C(=O)c2ccccc2C1=O', 'O=C1OC(=O)c2cc3C(=O)OC(=O)c3cc12', 'c1ccccc1'] },
  { id: 'M18', table: '二甲基苯環（2,6-二甲基-1,4-伸苯基）', positives: ['Cc1cc(C)c(C)c(C)c1', '[*:1]c1cc(C)c([*:2])c(C)c1'], negatives: ['Cc1ccc(C)cc1', 'Cc1cc(C)cc(C)c1', 'Cc1ccccc1C'] },
  { id: 'M19', table: '二苯基取代苯環（2,6-二苯基-1,4-伸苯基）', positives: ['Cc1cc(-c2ccccc2)c(C)c(-c2ccccc2)c1', '[*:1]c1cc(-c2ccccc2)c([*:2])c(-c2ccccc2)c1'], negatives: ['Cc1ccc(C)cc1', 'c1ccc(cc1)-c1ccccc1', 'Cc1cc(-c2ccccc2)cc(C)c1'] },
  { id: 'M20', table: '環己基（單取代）', positives: ['CC1CCCCC1', 'COC(=O)C1CCCCC1'], negatives: ['C1CCCCC1', 'CC1CCCCC1C', 'c1ccccc1'] },
  { id: 'M21', table: '–C(CH3)(C6H5)–', positives: ['CCC(C)(CC)c1ccccc1', '[*:1]CC([*:2])(C)c1ccccc1'], negatives: ['CC(C)(C)c1ccccc1', 'CC(C)c1ccccc1', 'CCC(CC)(CC)c1ccccc1'] },
  { id: 'M22', table: '–CH(OCH3)–', positives: ['[*:1]CC([*:2])OC', 'CCC(C)OC'], negatives: ['CC(C)O', 'CC(C)OCC', 'COC'] },
  { id: 'M23', table: '–CH(OCOCH3)–', positives: ['[*:1]CC([*:2])OC(C)=O', 'CCC(C)OC(C)=O'], negatives: ['CCOC(C)=O', 'CC(C)OC(=O)CC'] },
  { id: 'M24', table: '–CH(COOCH3)–', positives: ['[*:1]CC([*:2])C(=O)OC', 'CCC(C)C(=O)OC'], negatives: ['CCC(=O)OC', 'CC(C)C(=O)OCC'] },
  { id: 'M25', table: '–S–', positives: ['CSC', 'c1ccccc1Sc1ccccc1'], negatives: ['CS', 'CS(C)(=O)=O', 'CSSC', 'C1CCSC1'] },
  { id: 'M26', table: '–SO2–', positives: ['CS(C)(=O)=O', 'Cc1ccc(cc1)S(=O)(=O)c1ccccc1'], negatives: ['CS(C)=O', 'CS(=O)(=O)O', 'CS(=O)(=O)N'] },
  { id: 'M27', table: '–Si(CH3)2–', positives: ['C[Si](C)(CC)CC', '[*:1]O[Si](C)(C)O[*:2]'], negatives: ['C[Si](C)(C)C', 'C[Si](CC)(CC)CC', 'CC'] },
];

/** Table 4.10（書頁 88，PDF 第 115 頁）的獨立抄錄（Va／Vc，cm³/mol），與 CSV 分開，手算用；書中圖像逐列讀取 */
export const TABLE410 = {
  CH2: { va: 16.37, vc: 14.68 },
  CH_CH3: { va: 32.72, vc: 29.35 },
  CH_C6H11: { va: 101.76, vc: 91.27 },
  CH_C6H5: { va: 84.16, vc: 75.48 },
  CHCl: { va: 30, vc: 27.3 },
  C_CH3_COOCH3: { va: 74.7, vc: 67 },
  C_CH3_2: { va: 49.0, vc: 44.0 },
  COO_general: { va: 23, vc: 21.5 },
  OCOO: { va: 31, vc: 27 },
  CONH: { va: 21, vc: 18.7 },
  C6H4_meta: { va: 69, vc: 62 },
  C6H4_para: { va: 65.5, vc: 59 },
} as const;

export interface BookMolarVolumeCase {
  name: string;
  /** 結構單元 SMILES（連接點在單元兩端；–COO–、–CONH–、–OCOO– 整個放在單元內） */
  smiles: string;
  parts: [keyof typeof TABLE410, number][];
  類型: string;
}

/** D-2：用 Table 4.10 手算（Tables 4.6–4.8 沒有「計算值」欄，只有由實測密度反推的 V），程式要等於手算值 */
export const BOOK_MOLAR_VOLUME_CASES: readonly BookMolarVolumeCase[] = [
  { name: '聚乙烯', smiles: '[*:1]CC[*:2]', parts: [['CH2', 2]], 類型: '脂肪鏈' },
  { name: '聚丙烯', smiles: '[*:1]CC([*:2])C', parts: [['CH2', 1], ['CH_CH3', 1]], 類型: '脂肪鏈（側甲基）' },
  { name: '聚苯乙烯', smiles: '[*:1]CC([*:2])c1ccccc1', parts: [['CH2', 1], ['CH_C6H5', 1]], 類型: '芳香環' },
  { name: '聚氯乙烯', smiles: '[*:1]CC(Cl)[*:2]', parts: [['CH2', 1], ['CHCl', 1]], 類型: '鹵素' },
  { name: '聚（乙烯基環己烷）', smiles: '[*:1]CC([*:2])C1CCCCC1', parts: [['CH2', 1], ['CH_C6H11', 1]], 類型: '含環（脂環）' },
  { name: '聚甲基丙烯酸甲酯（PMMA）', smiles: '[*:1]CC([*:2])(C)C(=O)OC', parts: [['CH2', 1], ['C_CH3_COOCH3', 1]], 類型: '酯基（甲酯，組合基團）' },
  { name: '聚對苯二甲酸乙二酯（PET）', smiles: '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]', parts: [['CH2', 2], ['COO_general', 2], ['C6H4_para', 1]], 類型: '酯基、對位苯環' },
  { name: '聚間苯二甲酸乙二酯', smiles: '[*:1]CCOC(=O)c1cccc(c1)C(=O)O[*:2]', parts: [['CH2', 2], ['COO_general', 2], ['C6H4_meta', 1]], 類型: '酯基、間位苯環' },
  { name: '尼龍 6', smiles: '[*:1]C(=O)NCCCCC[*:2]', parts: [['CH2', 5], ['CONH', 1]], 類型: '醯胺（括號值）' },
  { name: '尼龍 6,6', smiles: '[*:1]NC(=O)CCCCC(=O)NCCCCCC[*:2]', parts: [['CH2', 10], ['CONH', 2]], 類型: '醯胺（括號值）' },
  { name: '雙酚 A 聚碳酸酯', smiles: '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]', parts: [['OCOO', 1], ['C6H4_para', 2], ['C_CH3_2', 1]], 類型: '碳酸酯、對位苯環' },
];
