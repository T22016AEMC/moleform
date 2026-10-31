// 任務 030：診斷用的結構清單（A 節與 D 節共用）。拋棄式診斷資料，不進 src、不進建置。
// USER_*：使用者材料，與 scripts/verification/phase6-Vm-密度.ts 同一份清單（化合物庫、配方測試資料）加骨架範本 BT01–BT06（從 src 讀）。
// SEMI：半導體常用材料（D53）。SMILES 由 Claude 依結構名稱撰寫，**待使用者審**；分子式與質量由 RDKit 計算（見 030-a0-semi-check.ts），不是記憶中的數值。
// 聚合物材料（硬化劑、聚醯亞胺、光阻聚合物）以「重複單元」表示，連接點用 [*:1]、[*:2]；環氧樹脂、硬化劑小分子以代表性結構表示。

export const USER_SMALL = [
  { name: 'BADGE', smiles: 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1', from: 'Phase 2、3（環氧樹脂）' },
  { name: '雙酚 A', smiles: 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1', from: 'Phase 2、3（固化劑）' },
  { name: '三苯基膦', smiles: 'c1ccc(P(c2ccccc2)c2ccccc2)cc1', from: 'Phase 3（催化劑）' },
  { name: '甲基乙基酮（MEK）', smiles: 'CCC(C)=O', from: 'Phase 3（溶劑）' },
  { name: '丙二醇甲醚醋酸酯（PGMEA）', smiles: 'COCC(C)OC(C)=O', from: 'Phase 3、4（成分 L）' },
  { name: 'SBI 雙酚（螺雙茚滿二醇）', smiles: 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2', from: 'Phase 4（成分 S）' },
  { name: '環氧氯丙烷', smiles: 'ClCC1CO1', from: '任務 027' },
  { name: '乙醇', smiles: 'CCO', from: 'Phase 2' },
  { name: '環氧丙烷', smiles: 'CC1CO1', from: 'Phase 2' },
  { name: '苯酚', smiles: 'Oc1ccccc1', from: 'Phase 2' },
  { name: 'L-丙胺酸', smiles: 'C[C@@H](C(=O)O)N', from: 'Phase 2' },
  { name: '反式 2-丁烯', smiles: 'C/C=C/C', from: 'Phase 2' },
  { name: '三氟化硼（BF₃）', smiles: 'FB(F)F', from: 'Phase 2（催化劑）' },
];

export const USER_UNITS = [
  { name: 'P 單元 A（雙酚茀）', smiles: '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O', from: 'Phase 4（成分 P）' },
  { name: 'P 單元 B（萘基次甲基）', smiles: '[*:1]C([*:2])c1ccc2ccccc2c1', from: 'Phase 4（成分 P）' },
  { name: 'E PGMA 型環氧單元', smiles: '[*:1]CC([*:2])(C)C(=O)OCC1CO1', from: 'Phase 4（成分 E）' },
];

export interface SemiItem {
  name: string;
  smiles: string;
  kind: '小分子' | '聚合物單元';
  cls: string;
}

export const SEMI: SemiItem[] = [
  // 封裝環氧（BADGE、ECN、EPN 與使用者材料共用，分別是 BADGE 與 BT03／BT04，不重複列）
  { name: '雙酚 F 型環氧（BFDGE）', smiles: 'C1OC1COc1ccc(Cc2ccc(OCC3CO3)cc2)cc1', kind: '小分子', cls: '封裝環氧' },
  { name: '聯苯型環氧（四甲基聯苯二酚二縮水甘油醚）', smiles: 'C1OC1COc1c(C)cc(cc1C)-c1cc(C)c(OCC2CO2)c(C)c1', kind: '小分子', cls: '封裝環氧' },
  { name: 'DCPD 型環氧（代表結構：三環癸烷雙芳基縮水甘油醚）', smiles: 'C1(c2ccc(OCC3CO3)cc2)CC2C(C1)C1CC(c3ccc(OCC4CO4)cc3)C2C1', kind: '小分子', cls: '封裝環氧' },
  { name: '萘型環氧（雙縮水甘油氧基萘）', smiles: 'C1OC1COc1cccc2cc(OCC3CO3)ccc12', kind: '小分子', cls: '封裝環氧' },
  // 硬化劑
  { name: '苯酚酚醛（雙酚 F 二聚體模型，鄰對位）', smiles: 'Oc1ccc(Cc2ccccc2O)cc1', kind: '小分子', cls: '硬化劑' },
  { name: '酚芳烷基型（Xylok 類）單元', smiles: '[*:1]Cc1ccc(cc1)Cc1ccc(O)c([*:2])c1', kind: '聚合物單元', cls: '硬化劑' },
  { name: '聯苯芳烷基酚醛單元', smiles: '[*:1]Cc1ccc(cc1)-c1ccc(cc1)Cc1ccc(O)c([*:2])c1', kind: '聚合物單元', cls: '硬化劑' },
  { name: 'DCPD 酚（代表結構：三環癸烷雙酚）', smiles: 'Oc1ccc(cc1)C1CC2C(C1)C1CC(c3ccc(O)cc3)C2C1', kind: '小分子', cls: '硬化劑' },
  { name: '甲基六氫鄰苯二甲酸酐（MHHPA）', smiles: 'CC1CCC2C(C1)C(=O)OC2=O', kind: '小分子', cls: '硬化劑（酸酐）' },
  { name: '甲基四氫鄰苯二甲酸酐（MTHPA）', smiles: 'CC1=CCC2C(C1)C(=O)OC2=O', kind: '小分子', cls: '硬化劑（酸酐）' },
  { name: '4,4\'-二胺基二苯碸（DDS）', smiles: 'Nc1ccc(cc1)S(=O)(=O)c1ccc(N)cc1', kind: '小分子', cls: '硬化劑（胺）' },
  { name: '雙氰胺（DICY）', smiles: 'N#CNC(N)=N', kind: '小分子', cls: '硬化劑（胺）' },
  // 硬化促進劑（三苯基膦與使用者材料共用）
  { name: '2-甲基咪唑', smiles: 'Cc1ncc[nH]1', kind: '小分子', cls: '硬化促進劑' },
  { name: '2-乙基-4-甲基咪唑', smiles: 'CCc1nc(C)c[nH]1', kind: '小分子', cls: '硬化促進劑' },
  { name: '2-苯基咪唑', smiles: 'c1ccc(cc1)-c1ncc[nH]1', kind: '小分子', cls: '硬化促進劑' },
  // 高耐熱絕緣聚合物
  { name: '聚醯亞胺 PMDA–ODA 單元', smiles: '[*:1]N1C(=O)c2cc3C(=O)N(C(=O)c3cc2C1=O)c1ccc(Oc2ccc([*:2])cc2)cc1', kind: '聚合物單元', cls: '聚醯亞胺' },
  { name: '聚醯亞胺 BPDA–PDA 單元', smiles: '[*:1]N1C(=O)c2ccc(cc2C1=O)-c1ccc2C(=O)N(C(=O)c2c1)c1ccc([*:2])cc1', kind: '聚合物單元', cls: '聚醯亞胺' },
  { name: '聚苯并噁唑（PBO）單元', smiles: '[*:1]c1ccc(cc1)-c1nc2cc3nc([*:2])oc3cc2o1', kind: '聚合物單元', cls: '聚苯并噁唑' },
  { name: '苯并環丁烯（BCB）', smiles: 'c1ccc2CCc2c1', kind: '小分子', cls: '苯并環丁烯' },
  { name: 'DVS-BCB（二乙烯基四甲基二矽氧烷雙苯并環丁烯）', smiles: 'C[Si](C)(C=Cc1ccc2CCc2c1)O[Si](C)(C)C=Cc1ccc2CCc2c1', kind: '小分子', cls: '苯并環丁烯' },
  // 光阻基底聚合物
  { name: '聚羥基苯乙烯（PHS）單元', smiles: '[*:1]CC([*:2])c1ccc(O)cc1', kind: '聚合物單元', cls: '光阻基底' },
  { name: '聚甲基丙烯酸甲酯（PMMA）單元', smiles: '[*:1]CC([*:2])(C)C(=O)OC', kind: '聚合物單元', cls: '光阻基底（（甲基）丙烯酸酯）' },
  { name: '甲基丙烯酸第三丁酯（tBMA）單元', smiles: '[*:1]CC([*:2])(C)C(=O)OC(C)(C)C', kind: '聚合物單元', cls: '光阻基底（（甲基）丙烯酸酯）' },
  { name: '甲基丙烯酸 2-甲基-2-金剛烷酯（MAdMA）單元', smiles: '[*:1]CC([*:2])(C)C(=O)OC1(C)C2CC3CC(C2)CC1C3', kind: '聚合物單元', cls: '光阻基底（（甲基）丙烯酸酯）' },
  { name: '甲基丙烯酸 γ-丁內酯酯（GBLMA）單元', smiles: '[*:1]CC([*:2])(C)C(=O)OC1CCOC1=O', kind: '聚合物單元', cls: '光阻基底（（甲基）丙烯酸酯）' },
];
