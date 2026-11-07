// 使用者定義的經驗自由體積法（任務 036a，D22、D57）的測試資料：
//  - 每個基團的正例（SMARTS 必須命中）與反例（不得命中）。
//  - xlsx 各列的結構（SMILES）：xlsx 裡的結構是 ChemDoodle 物件（圖），SMILES 由 Claude 看圖（或依名稱）撰寫，**待使用者審**；
//    有圖的列標「圖」，沒有圖只能依名稱與原子數推定的列標「推定」。
export interface FvGroupCase {
  id: string;
  name: string;
  positives: string[];
  negatives: string[];
}

export const FV_GROUP_CASES: readonly FvGroupCase[] = [
  { id: 'FV01', name: '芳香 C–H（有氫；任務 036d）', positives: ['c1ccccc1', 'Cc1ccccc1', 'c1ccc2ccccc2c1', 'Oc1ccccc1'], negatives: ['C1CCCCC1', 'CC', 'C=C', 'Cc1c(C)c(C)c(C)c(C)c1C'] },
  { id: 'FV02', name: '鏈脂肪族 C（四級碳；羰基碳不收，任務 036b）', positives: ['CC(C)(C)C', 'CC(C)(C)O'], negatives: ['CC1(C)CCC1', 'CCC', 'O=C1CCCC1', 'CC=O', 'CC(=O)C', 'CC(=O)OC', 'CC(=O)O', 'CC(=O)N'] },
  { id: 'FV03', name: '鏈脂肪族 CH（醛基碳不收，任務 036b）', positives: ['CC(C)C', 'CC(C)O'], negatives: ['CCC', 'CC1CCCCC1', 'CC(C)(C)C', 'CC=O', 'O=Cc1ccccc1'] },
  { id: 'FV04', name: '鏈脂肪族 CH2', positives: ['CCC', '[*:1]CC[*:2]'], negatives: ['C1CCCCC1', 'CC', 'CC(C)C'] },
  { id: 'FV05', name: '鏈脂肪族 CH3', positives: ['CC', 'CC(C)C'], negatives: ['C1CCCCC1', 'c1ccccc1', '[*:1]CC[*:2]'] },
  { id: 'FV06', name: '環脂肪族 C（四級碳；環上羰基碳不收，任務 036b）', positives: ['CC1(C)CCC1', 'CC1(C)CCCCC1'], negatives: ['C1CCCCC1', 'CC(C)(C)C', 'CC(=O)C', 'O=C1CCCC1', 'O=C1CCCO1'] },
  { id: 'FV07', name: '環脂肪族 CH', positives: ['CC1CCCCC1', 'CC1CO1'], negatives: ['CC(C)C', 'C1CCCCC1'] },
  { id: 'FV08', name: '環脂肪族 CH2', positives: ['C1CCCCC1', 'C1CO1'], negatives: ['CCC', 'CCCC', 'c1ccccc1'] },
  { id: 'FV09', name: '醚類 O', positives: ['COC', 'c1ccccc1Oc1ccccc1', 'C1CCOC1', '[*:1]CCOC[*:2]'], negatives: ['C1CO1', 'CC(=O)OC', 'COC(=O)OC', 'CCO'] },
  { id: 'FV10', name: '環氧基 O', positives: ['C1CO1', 'CC1CO1'], negatives: ['C1CCOC1', 'COC', 'C1COC1'] },
  { id: 'FV11', name: '酮類 C=O（整個羰基，含羰基碳）', positives: ['CC(C)=O', 'O=C1CCCCC1', 'CC(=O)c1ccccc1', '[*:1]CC(=O)C[*:2]'], negatives: ['CC(=O)OC', 'CC=O', 'CC(=O)O', 'CC(=O)N', 'CC(=O)Cl', 'COC(=O)OC', 'NC(=O)N', 'O=C1CCCO1'] },
  { id: 'FV12', name: '醛類 C=O（整個羰基，含醛基碳）', positives: ['CC=O', 'O=Cc1ccccc1'], negatives: ['CC(C)=O', 'C=O', 'COC=O', 'CC(=O)OC', 'CC(=O)N'] },
  { id: 'FV13', name: '酯基 –C(=O)–O–（整組，含羰基碳）', positives: ['CC(=O)OC', 'C=CC(=O)OC', '[*:1]CC([*:2])C(=O)OC', 'O=C1CCCO1', 'CC(=O)Oc1ccccc1'], negatives: ['CC(=O)O', 'COC(=O)OC', 'CC(=O)N', 'COC=O', 'CC(=O)C', 'CC(=O)Cl', 'NC(=O)OC', 'COC'] },
  { id: 'FV14', name: '一級醇 OH', positives: ['CCO', 'CO', '[*:1]CCO'], negatives: ['CC(C)O', 'CC(C)(C)O', 'Oc1ccccc1', 'CC(=O)O'] },
  { id: 'FV15', name: '二級醇 OH', positives: ['CC(C)O', 'OC1CCCCC1'], negatives: ['CCO', 'CC(C)(C)O', 'Oc1ccccc1'] },
  { id: 'FV16', name: '三級醇 OH', positives: ['CC(C)(C)O'], negatives: ['CC(C)O', 'CCO', 'Oc1ccccc1'] },
  { id: 'FV17', name: '酚 OH', positives: ['Oc1ccccc1', 'Cc1ccc(O)cc1'], negatives: ['CCO', 'CC(=O)O', 'COc1ccccc1'] },
  { id: 'FV18', name: '脂肪族 F', positives: ['CF', 'CC(F)(F)F'], negatives: ['Fc1ccccc1', 'FC=C'] },
  { id: 'FV19', name: '芳香族 F', positives: ['Fc1ccccc1', 'Cc1ccc(F)cc1'], negatives: ['CF', 'FC=C'] },
  { id: 'FV20', name: '取代芳香 C（無氫、非縮合；任務 036d）', positives: ['Cc1ccccc1', 'Oc1ccccc1', 'c1ccc(cc1)-c1ccccc1', 'C1Cc2ccccc2C1', 'C1c2ccccc2-c2ccccc12', 'c1ccc(cc1)Oc1ccccc1'], negatives: ['c1ccccc1', 'c1ccc2ccccc2c1', 'C1CCCCC1', 'CC'] },
  { id: 'FV21', name: '縮合芳香 C（兩個芳香環共用；任務 036d）', positives: ['c1ccc2ccccc2c1', 'c1ccc2cc3ccccc3cc2c1', 'c1cc2ccc3cccc4ccc(c1)c2c34'], negatives: ['c1ccccc1', 'Cc1ccccc1', 'c1ccc(cc1)-c1ccccc1', 'C1Cc2ccccc2C1', 'C1c2ccccc2-c2ccccc12', 'C1CCC2CCCCC2C1'] },
];

/**
 * 任務 036d：芳香 C 三類的個數 [C–H, 取代, 縮合]（SMILES → 個數），每類至少一個正例與反例（苯、甲苯、苯酚、萘、聯苯、茚滿、茀、二苯醚）。
 * 配對規則：兩個芳香環共用 → 縮合；否則有氫 → C–H；否則 → 取代。茚滿與茀的稠合碳歸取代（詮釋，待使用者審）。
 */
export const FV_AROMATIC_CASES: readonly (readonly [string, string, number, number, number])[] = [
  ['苯', 'c1ccccc1', 6, 0, 0],
  ['甲苯', 'Cc1ccccc1', 5, 1, 0],
  ['苯酚', 'Oc1ccccc1', 5, 1, 0],
  ['萘', 'c1ccc2ccccc2c1', 8, 0, 2],
  ['聯苯', 'c1ccc(cc1)-c1ccccc1', 10, 2, 0],
  ['茚滿', 'C1Cc2ccccc2C1', 4, 2, 0],
  ['茀', 'C1c2ccccc2-c2ccccc12', 8, 4, 0],
  ['二苯醚', 'c1ccc(cc1)Oc1ccccc1', 10, 2, 0],
  ['蒽', 'c1ccc2cc3ccccc3cc2c1', 10, 0, 4],
  ['芘', 'c1cc2ccc3cccc4ccc(c1)c2c34', 10, 0, 6],
];

/** 任務 036d：Table XVII 修正的次數案例 [名稱, SMILES, 修正項 id → 次數]；反例（不得套用）次數為空物件 */
export const FV_CORRECTION_CASES: readonly (readonly [string, string, Record<string, number>])[] = [
  ['茚滿（五員環 1 次）', 'C1Cc2ccccc2C1', { FX01: 1 }],
  ['四氫萘（六員環 1 次）', 'C1CCc2ccccc2C1', { FX02: 1 }],
  ['茀（五員環算 1 個環、減 1 次）', 'C1c2ccccc2-c2ccccc12', { FX03: 1 }],
  ['9,9-二甲基茀', 'CC1(C)c2ccccc2-c2ccccc12', { FX03: 1 }],
  ['SBI 骨架（兩個茚滿環各 1 次）', 'CC1(C)CC2(CC(C)(C)c3cc([*:2])ccc23)c2ccc([*:1])cc12', { FX01: 2 }],
  ['1,4-二氧六環', 'C1COCCO1', { FX04: 1 }],
  ['乙酸甲酯（酯基旁 2 個單鍵）', 'CC(=O)OC', { FX05: 1, FX06: 1 }],
  ['丙二酸二甲酯（兩個酯基）', 'COC(=O)CC(=O)OC', { FX05: 2, FX06: 2 }],
  ['γ-丁內酯（環上酯基）', 'O=C1CCCO1', { FX05: 1, FX06: 1 }],
  ['聚甲基丙烯酸甲酯單元（連接點算外側）', '[*:1]CC([*:2])(C)C(=O)OC', { FX05: 1, FX06: 1 }],
  ['苯甲酸乙酯', 'CCOC(=O)c1ccccc1', { FX05: 1, FX06: 1 }],
  // 反例：不得套用任何修正
  ['苯（芳香環本身不是亞甲基環）', 'c1ccccc1', {}],
  ['環己烷（環己基的 1.14 不套用）', 'C1CCCCC1', {}],
  ['萘烷（cis-稠合的 2.50 不實作）', 'C1CCC2CCCCC2C1', {}],
  ['萘（芳香稠環不是亞甲基環）', 'c1ccc2ccccc2c1', {}],
  ['1,3-二氧五環／1,3-二氧六環（只實作 1,4-二氧六環）', 'C1COCOC1', {}],
  ['環己酮（環上羰基不是亞甲基環）', 'O=C1CCCCC1', {}],
  ['丙酮（酮不算羧基）', 'CC(C)=O', {}],
  ['乙醚', 'CCOCC', {}],
];

export interface FvCoefficientCase {
  id: string;
  name: string;
  positives: string[];
  negatives: string[];
}

/** 以 SMARTS 辨識的係數類別（FC01 SBI、FC03 芳香環）的正反例 */
export const FV_COEFFICIENT_SMARTS_CASES: readonly FvCoefficientCase[] = [
  {
    id: 'FC01',
    name: '螺雙茚滿（SBI）螺環骨架',
    positives: ['CC1(C)CC2(CC(C)(C)c3ccccc23)c2ccccc12', 'C1CC2(c3ccccc13)CCc1ccccc12'],
    negatives: ['C1Cc2ccccc2C1', 'CC1(C)CC(C)(C)c2ccccc12', 'C1CCC2(C1)CCCC2', 'C1CC2(CCC1)c1ccccc1C2'],
  },
  { id: 'FC03', name: '含芳香環', positives: ['c1ccccc1', 'C1CC12c1ccccc1C2'], negatives: ['C1CCCCC1', 'CCCC', 'C1CO1'] },
];

/** 橋環或籠狀脂環（FC02，程式判斷）的正反例 */
export const FV_BRIDGED_CASES = {
  positives: [
    ['降冰片烷', 'C1CC2CCC1C2'],
    ['金剛烷', 'C1C2CC3CC1CC(C2)C3'],
    ['三環癸烷（氫化雙環戊二烯）', 'C1CC2C(C1)C1CCC2C1'],
    ['立方烷', 'C12C3C4C1C5C2C3C45'],
    ['1-金剛烷基（接連接點）', '[*:1]C12CC3CC(CC(C3)C1)C2'],
  ],
  negatives: [
    ['環己烷', 'C1CCCCC1'],
    ['萘烷（稠環）', 'C1CCC2CCCCC2C1'],
    ['螺[4.4]壬烷（螺環）', 'C1CCC2(C1)CCCC2'],
    ['茚滿（稠合芳香環）', 'C1Cc2ccccc2C1'],
    ['萘（芳香稠環不看）', 'c1ccc2ccccc2c1'],
    ['芘（芳香周位稠環不看）', 'c1cc2ccc3cccc4ccc(c1)c2c34'],
    ['環氧環', 'C1CO1'],
    ['鏈狀', 'CCCC'],
  ],
} as const;

export interface XlsxStructure {
  row: number;
  /** 結構來源：圖＝xlsx 內的圖（ChemDoodle 物件或圖片）；推定＝無圖，依名稱與原子數推定 */
  basis: '圖' | '推定';
  smiles: string | null;
  /** 沒有 SMILES 的原因，或結構的補充說明 */
  note: string;
}

const peg = (n: number): string => `C1OC1CO${'CCO'.repeat(n)}CC1CO1`;
const ppg = (n: number): string => `C1OC1CO${'C(C)CO'.repeat(n)}CC1CO1`;

/**
 * xlsx 各列的結構。EX 系列的聚乙二醇、聚丙二醇二縮水甘油醚的重複數 n 讀自圖。
 * 這些 SMILES 都是 Claude 撰寫、待使用者審；不是 xlsx 內可讀出的資料。
 */
export const XLSX_STRUCTURES: readonly XlsxStructure[] = [
  { row: 5, basis: '推定', smiles: '[*:1]c1ccc(cc1)C1(c2ccc([*:2])cc2)c2ccccc2-c2ccccc12', note: '9,9-雙(4-伸苯基)茀（兩端連接）；依名稱「雙苯芴」與芳香 C 24 推定' },
  { row: 6, basis: '推定', smiles: '[*:1]c1ccc(cc1)C1(c2ccc3cc([*:2])ccc3c2)c2ccccc2-c2ccccc12', note: '9-伸苯基-9-伸萘基茀；依名稱「單萘單苯芴」與芳香 C 28 推定，連接位置不影響基團數' },
  { row: 7, basis: '推定', smiles: '[*:1]c1cccc2ccccc12', note: '萘基（一個連接點）；依名稱與芳香 C 10 推定' },
  { row: 8, basis: '推定', smiles: '[*:1]C1CC2CC1CC2C1CC2CCC1C2', note: '聯降冰片烷基；結構位置依 CH 7、CH2 7 推定（2,2\'-聯降冰片烷，其中一環另有連接點），不確定' },
  { row: 9, basis: '推定', smiles: '[*:1]C12CC3CC(CC(C3)C1)C2', note: '1-金剛烷基；依名稱與鏈 C 1、CH 3、CH2 6 推定' },
  { row: 10, basis: '推定', smiles: 'CC1(C)CC2(CC(C)(C)c3cc([*:2])ccc23)c2ccc([*:1])cc12', note: '3,3,3\',3\'-四甲基-1,1\'-螺雙茚滿骨架（兩個連接點）；依名稱推定，連接位置不影響基團數' },
  { row: 11, basis: '推定', smiles: '[*:1]c1ccc(Oc2ccccc2)cc1', note: '4-苯氧基苯基（一個連接點）；依名稱「二苯醚」與芳香 C 12、醚 O 1、H 9 推定' },
  { row: 12, basis: '圖', smiles: '[*:1]C1c2cccc3cccc(c23)C1[*:2]', note: '聚苊烯單元（ANp）' },
  { row: 13, basis: '圖', smiles: '[*:1]C1Cc2ccccc2C1[*:2]', note: '聚茚單元（indane）' },
  { row: 14, basis: '圖', smiles: '[*:1]CC([*:2])c1ccc(O)cc1', note: '聚羥基苯乙烯單元（PHS）' },
  { row: 15, basis: '圖', smiles: '[*:1]CC([*:2])C(=O)OCC1CO1', note: '聚丙烯酸縮水甘油酯單元（EHP03）' },
  { row: 16, basis: '圖', smiles: 'C1OC1COc1ccc2ccccc2c1Cc1c(OCC2CO2)ccc2ccccc12', note: '雙(2-縮水甘油氧基-1-萘基)甲烷（4770）' },
  { row: 17, basis: '圖', smiles: 'CCCCCCCCCCCCCOCC1CO1', note: '烷基縮水甘油醚；圖標 R = C12H25、C13H27，xlsx 的 CH2 13 對應 C13H27，這裡用 C13' },
  { row: 18, basis: '圖', smiles: 'Oc1ccc(cc1)C(C)(C)c1cc(C(C)(C)c2ccccc2)c(O)cc1O', note: '4,6-雙(枯基)間苯二酚與 4-羥苯基的三酚（PIRM）；羥基與枯基位置依圖判讀' },
  { row: 19, basis: '圖', smiles: 'CC(C)(C)c1ccc(OCC2CO2)c(OCC(O)COc2ccc(C(C)(C)C)cc2OCC2CO2)c1', note: '含二級醇的雙（第三丁基-縮水甘油氧基苯氧基）丙醇（HP820）；第三丁基位置依圖判讀' },
  { row: 20, basis: '圖', smiles: 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1', note: '雙酚 A 二縮水甘油醚（EXA-850-CRP）' },
  { row: 21, basis: '圖', smiles: null, note: 'DE-102：圖是多環（降冰片烷骨架）的二環氧化物，圖太小讀不出環接位置，不寫 SMILES' },
  { row: 22, basis: '圖', smiles: 'CC(c1ccc(OCC2CO2)cc1)(c1ccc(OCC2CO2)cc1)c1ccc(cc1)C(C)(C)c1ccc(OCC2CO2)cc1', note: '三縮水甘油醚（THB-6M）' },
  { row: 23, basis: '圖', smiles: 'CCCCC(CC)COCC1CO1', note: '2-乙基己基縮水甘油醚（EX121）' },
  { row: 24, basis: '圖', smiles: 'c1ccccc1OCCOCCOCCOCCOCCOCC1CO1', note: '苯氧基-五乙二醇-縮水甘油醚（EX145，圖 n = 5）' },
  { row: 25, basis: '圖', smiles: 'CC(C)(C1CCC(OCC2CO2)CC1)C1CCC(OCC2CO2)CC1', note: '氫化雙酚 A 二縮水甘油醚（EX252）' },
  { row: 26, basis: '圖', smiles: ppg(3), note: '聚丙二醇二縮水甘油醚 n = 3（EX-920）' },
  { row: 27, basis: '圖', smiles: ppg(11), note: '聚丙二醇二縮水甘油醚 n = 11（EX-931）' },
  { row: 28, basis: '圖', smiles: peg(13), note: '聚乙二醇二縮水甘油醚 n = 13（EX841）' },
  { row: 29, basis: '圖', smiles: peg(22), note: '聚乙二醇二縮水甘油醚 n = 22（EX861）' },
  { row: 30, basis: '圖', smiles: 'C(COCC1CO1)(COCC1CO1)(COCC1CO1)COCC1CO1', note: '新戊四醇四縮水甘油醚（未命名列）' },
  { row: 31, basis: '圖', smiles: null, note: 'EX521：聚甘油聚縮水甘油醚（n = 3），圖的支鏈位置讀不確定，不寫 SMILES' },
  { row: 32, basis: '圖', smiles: ppg(3), note: '聚丙二醇二縮水甘油醚 n = 3（EX920；與第 26 列 EX-920 的數字完全相同，疑為重複列）' },
  { row: 33, basis: '圖', smiles: peg(9), note: '聚乙二醇二縮水甘油醚 n = 9（EX830）' },
  { row: 34, basis: '圖', smiles: null, note: 'EX512：聚甘油聚縮水甘油醚（n = 2），圖的支鏈位置讀不確定，不寫 SMILES' },
  { row: 35, basis: '推定', smiles: null, note: '未命名列，沒有圖，無法推定結構' },
  { row: 36, basis: '圖', smiles: 'Oc1cccc(c1)C(c1cccc(O)c1)(C(F)(F)F)C(F)(F)F', note: '雙酚 AF（3,3\'-二羥基六氟）（未命名列）；圖的羥基在間位' },
  { row: 37, basis: '圖', smiles: 'COCc1cc(cc(COC)c1O)C(C)(c1cc(COC)c(O)c(COC)c1)c1cc(COC)c(O)c(COC)c1', note: '1,1,1-三(4-羥基-3,5-雙(甲氧甲基)苯基)乙烷（未命名列）' },
];
