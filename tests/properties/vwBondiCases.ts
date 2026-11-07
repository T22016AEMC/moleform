// Bondi (1964) 補充基團的正例與反例（任務 037，D22）。正例：SMARTS 必須命中；反例：SMARTS 不得命中。
// 數值（TABLE_BONDI）是 Bondi, J. Phys. Chem. 68, 441 (1964) Table XV（p.449）、Table XVI、Table XVII（p.450）的獨立抄錄（看圖讀取），
// 測試用它手算，不從 CSV 取值。
export const TABLE_BONDI = {
  /** Table XV：>C<（aliph.）、>CH–、>CH2 */
  Cq: 3.33,
  CH: 6.78,
  CH2: 10.23,
  /** Table XV：>C–（arom. alkyl）、>C–H arom. */
  CarAlkyl: 5.54,
  /** Table XVI */
  CO: 11.7,
  OAlkylEther: 3.7,
  OPhenylEther: 3.2,
  OH: 8.04,
  NH2: 10.54,
  P: 10.44,
  /** Table XVII（修正量，減） */
  ringBenzo: 1.66,
  adjacentBond: 0.22,
} as const;

export interface VwBondiCase {
  id: string;
  positives: string[];
  negatives: string[];
}

export const VW_BONDI_CASES: readonly VwBondiCase[] = [
  {
    id: 'BG01',
    positives: ['CC1(C)c2ccccc2-c2ccccc12', 'Oc1ccc(cc1)C1(c2ccc(O)cc2)c2ccccc2-c2ccccc12'],
    negatives: ['c1ccc2c(c1)Cc1ccccc12', 'c1ccc2c(c1)C(C)(C)CC2', 'c1ccc(cc1)-c1ccccc1', 'CC1(C)c2cccc3ccc(cc23)-c2ccccc12'],
  },
  {
    id: 'BG02',
    positives: ['COC(=O)OC', '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]', 'c1ccccc1OC(=O)Oc1ccccc1'],
    negatives: ['CC(=O)OC', 'CC(=O)O', 'CNC(=O)OC', 'O=C1OCCO1'],
  },
  {
    id: 'BG03',
    positives: ['CC(=O)O', 'C[C@@H](C(=O)O)N', 'OC(=O)c1ccccc1'],
    negatives: ['CC(=O)OC', 'COC(=O)OC', 'OC(=O)N', 'C(=O)O'],
  },
  {
    id: 'BG04',
    positives: ['CCN', 'Nc1ccccc1', 'C[C@@H](C(=O)O)N'],
    negatives: ['CNC', 'NC(=O)C', 'NC(N)=O', 'NCO', 'C[NH3+]'],
  },
  {
    id: 'BG05',
    positives: ['c1ccc(P(c2ccccc2)c2ccccc2)cc1', 'CP(C)C'],
    negatives: ['O=P(c1ccccc1)(c1ccccc1)c1ccccc1', 'COP(OC)OC', 'CPC', 'P(C)(C)Cl'],
  },
  {
    id: 'BG06',
    positives: ['c1ccc2CCCc2c1', 'c1ccc2CCCCc2c1', 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2'],
    negatives: ['c1ccc2ccccc2c1', 'c1ccc2c(c1)Cc1ccccc12', 'c1ccc2OCCc2c1', 'c1ccc2c(c1)CCc1ccccc12', 'c1cc2cccc3CCc(c1)c23'],
  },
  {
    id: 'BG07',
    positives: ['c1ccc2CCCc2c1', 'c1ccc2CCCCc2c1', 'CC1(C)CCc2ccccc12'],
    negatives: ['C1CCCCC1', 'CCc1ccccc1', 'c1ccc2OCCc2c1', 'c1ccc2c(c1)Cc1ccccc12'],
  },
  {
    id: 'BG08',
    positives: ['CC1CCc2ccccc12', 'CC1CCCc2ccccc12'],
    negatives: ['CC(C)c1ccccc1', 'CC1CCCCC1', 'c1ccc2CCCc2c1'],
  },
  {
    id: 'BG09',
    positives: ['CC1(C)CCc2ccccc12', 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2', 'CC1(C)CCCc2ccccc12'],
    negatives: ['CC(C)(C)c1ccccc1', 'CC1(C)CCCCC1', 'c1ccc2CCCc2c1'],
  },
  {
    id: 'BG10',
    positives: ['O=C(Oc1ccccc1)OC', '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]'],
    negatives: ['COC(=O)OC', 'CC(=O)Oc1ccccc1', 'COc1ccccc1'],
  },
  {
    id: 'BG11',
    positives: ['COC(=O)OC', 'O=C(Oc1ccccc1)OC'],
    negatives: ['c1ccccc1OC(=O)Oc1ccccc1', 'CC(=O)OC', 'CCOC'],
  },
  {
    id: 'BG12',
    positives: ['[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]'],
    negatives: ['COC(=O)OC', 'c1ccccc1OC(=O)Oc1ccccc1', 'CC(=O)OC'],
  },
  {
    id: 'BG13',
    positives: ['[*:1]OC(=O)OCC[*:2]', '[*:1]OC(=O)OCCc1ccc([*:2])cc1'],
    negatives: ['COC(=O)OC', 'c1ccccc1OC(=O)Oc1ccccc1', 'COC(=O)Oc1ccccc1'],
  },
  {
    id: 'BC01',
    positives: ['c1ccc2CCCc2c1', 'CC1(C)CCc2ccccc12'],
    negatives: ['c1ccc2CCCCc2c1', 'c1ccc2c(c1)Cc1ccccc12', 'C1CCCC1'],
  },
  {
    id: 'BC02',
    positives: ['c1ccc2CCCCc2c1'],
    negatives: ['c1ccc2CCCc2c1', 'C1CCCCC1', 'c1ccc2ccccc2c1'],
  },
  {
    id: 'BC03',
    positives: ['CC1(C)c2ccccc2-c2ccccc12'],
    negatives: ['c1ccc2c(c1)Cc1ccccc12', 'c1ccc2CCCc2c1', 'c1ccc(cc1)-c1ccccc1'],
  },
  {
    id: 'BC04',
    positives: ['CC(=O)O', 'OC(=O)c1ccccc1'],
    negatives: ['CC(=O)OC', 'COC(=O)OC', 'OC(=O)N'],
  },
  {
    id: 'BC05',
    positives: ['COC(=O)OC', '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]'],
    negatives: ['CC(=O)OC', 'CC(=O)O', 'CNC(=O)OC'],
  },
];
