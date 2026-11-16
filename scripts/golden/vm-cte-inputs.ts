// 黃金資料的輸入集合：export-vm.ts（Vm／密度）與 export-cte.ts（CTE）共用（任務 M03）。
// 這個檔名不是 export-*.ts，所以 CI 的 `for f in scripts/golden/export-*.ts` 不會把它當匯出程式執行；它只提供輸入（SMILES、SMARTS），不計算任何物性。
// 分子來源（以 SMILES 去重，保留第一次出現）：
//   1. 專屬案例（DEDICATED）：R1 芳香性、R2 原子索引與氫數、R3 SMARTS 配對、玻璃態／橡膠態邊界（Tg 在 25 °C 附近）、含 * 的單元、
//      雜環與稠環、缺基團情況、無效輸入
//   2. molar_volume_polymer_groups.csv 每一列的正例與反例（tests/properties/molarVolumeCases.ts）、書中聚合物（BOOK_MOLAR_VOLUME_CASES）、骨架範本 BT01–BT06 的單元
//   3. tests/properties/molarVolumeDensity.test.ts、molarVolumeGroups.test.ts、cte.test.ts 內的 SMILES 字串
//   4. docs/verification/phase6-Vm-密度-輸出.md、phase6-自由體積-CTE-輸出.md 內的 SMILES
//   5. scripts/verification/phase6-*.ts 的分子清單（形似 SMILES 的字串）
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ROOT } from './common.ts';

export const DEDICATED: [string, string][] = [
  // ---- 玻璃態／橡膠態邊界：Tg（任務 026 基團加成，不含校準基團）恰在 25 °C 附近的單元（由 Python 引擎掃描找出最接近 25 °C 的組合，
  //      再由 TS 重新計算確認；黃金檔記錄的是 TS 的輸出，不是掃描值）。tgC 略高於 25 → 玻璃態、略低於 25 → 橡膠態。 ----
  // tgC 的註解是 Python 掃描時的值（°C），僅供閱讀；與 298 K（24.85 °C）的 CTE 備註門檻也很近的單元另標 298K。
  ['boundary/below-24.9955', '*C[Si](C)(C)C(OC)OC(=O)c1ccc(cc1)C(=O)O*'], // 24.9955，橡膠態（最接近 25 °C 的下側）
  ['boundary/above-25.0350', '*C(=O)NC(C)(C(=O)OC)[Si](C)(C)C(OC)*'], // 25.0350，玻璃態（最接近 25 °C 的上側）
  ['boundary/above-25.0469-simple', '*C(O)C(C)(C)*'], // 25.0469，玻璃態
  ['boundary/above-25.1041', '*C(C)C(C)(C)c1cccc(c1)OC(=O)O*'], // 25.1041
  ['boundary/above-25.2051', '*CC(C)(C)c1ccc(cc1)C(OC)*'], // 25.2051
  ['boundary/above-25.2666', '*C(C)C(C)c1cccc(c1)S*'], // 25.2666
  ['boundary/above-25.3575', '*C(O)C(O)c1cccc(c1)[Si](C)(C)*'], // 25.3575
  ['boundary/above-25.4758', '*C(C)C(=O)NC(C)(C)c1cccc(c1)*'], // 25.4758
  ['boundary/above-25.5859-sulfone', '*C[Si](C)(C)CS(=O)(=O)*'], // 25.5859
  ['boundary/above-25.9602', '*CC(C)C(C)c1cccc(c1)*'], // 25.9602
  ['boundary/below-24.9205', '*C(O)SC(OC)C(OC)*'], // 24.9205，298K：高於 24.85 °C
  ['boundary/below-24.8491-298K', '*C(Cl)C(C)(C)[Si](C)(C)C(C)(C(=O)OC)*'], // 24.8491，298K：Tg 略低於 298 K（CTE 備註門檻）
  ['boundary/below-24.8016', '*C(c1ccccc1)c1cccc(c1)[Si](C)(C)C(OC)*'], // 24.8016
  ['boundary/below-24.7360', '*C(C)C(C)(C)NC(=O)C(=O)N*'], // 24.7360
  ['boundary/below-24.6142', '*CC(Cl)c1ccc(cc1)[Si](C)(C)*'], // 24.6142
  ['boundary/below-24.5423', '*C(C)C(C)COC(=O)O*'], // 24.5423
  ['boundary/below-24.3876', '*Cc1ccc(cc1)CC(C)(C)*'], // 24.3876
  ['boundary/below-24.0933', '*C[Si](C)(C)COC(=O)c1ccc(cc1)C(=O)O*'], // 24.0933
  ['boundary/below-23.7036', '*CCC(C)(C)c1ccc(cc1)*'], // 23.7036
  ['boundary/below-22.5817', '*C(=O)NC(OC)C(OC)*'], // 22.5817
  ['boundary/far-glassy-polystyrene', '[*:1]CC([*:2])c1ccccc1'], // 99.6，玻璃態
  ['boundary/far-rubbery-polyethylene', '[*:1]CC[*:2]'], // -80.3，橡膠態
  ['boundary/far-glassy-PET', '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]'],
  ['boundary/far-rubbery-polybutylene', '[*:1]CCCC[*:2]'],
  ['boundary/Tg-missing-Vm-ok-PVAc', '[*:1]CC([*:2])OC(C)=O'], // Vm 的基團都配得到、Tg 缺基團 → 狀態未定（匯出程式會檢查）
  ['boundary/Tg-missing-Vm-ok-PVCH', '[*:1]CC([*:2])C1CCCCC1'],
  // ---- R1 芳香性：Va／Vc 的對位／間位伸苯基、萘 2,6 位、芳香側基都取決於芳香旗標；雜環與稠環在書的基團表裡多半沒有對應（缺基團） ----
  ['R1/p-phenylene-ester', '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]'],
  ['R1/m-phenylene-ester', '[*:1]CCOC(=O)c1cccc(c1)C(=O)O[*:2]'],
  ['R1/o-phenylene-ester', '[*:1]CCOC(=O)c1ccccc1C(=O)O[*:2]'],
  ['R1/kekule-p-phenylene-ester', '[*:1]CCOC(=O)C1=CC=C(C=C1)C(=O)O[*:2]'],
  ['R1/kekule-polystyrene', '[*:1]CC([*:2])C1=CC=CC=C1'],
  ['R1/kekule-benzene', 'C1=CC=CC=C1'],
  ['R1/unkekulizable-5ring', 'c1cccc1'],
  ['R1/cyclohexene-not-aromatic', '[*:1]CC1=CCCCC1[*:2]'],
  ['R1/star-phenylene', '*c1ccc(*)cc1'],
  ['R1/star-phenylene-mapped', '[*:1]c1ccc([*:2])cc1'],
  ['R1/star-meta-phenylene', '*c1cccc(*)c1'],
  ['R1/star-ortho-phenylene', '*c1ccccc1*'],
  ['R1/star-in-aromatic-ring', 'c1cc*cc1'],
  ['R1/star-only', '*'],
  ['R1/star-star', '**'],
  ['R1/star-one', '*CC'],
  ['R1/star-three', '*CC(*)C*'],
  ['R1/star-C-star', '*C*'],
  ['R1/hetero-furan', '[*:1]c1ccc([*:2])o1'],
  ['R1/hetero-thiophene', '*c1ccc(*)s1'],
  ['R1/hetero-pyridine-2,5', '*c1ccc(*)nc1'],
  ['R1/hetero-pyridine-3-yl', '[*:1]CC([*:2])c1cccnc1'],
  ['R1/hetero-2-vinylpyridine', '[*:1]CC([*:2])c1ccccn1'],
  ['R1/hetero-pyrrole', '[*:1]CC([*:2])c1ccc[nH]1'],
  ['R1/hetero-imidazole', '[*:1]CC([*:2])c1cnc[nH]1'],
  ['R1/hetero-pyrimidine', '*c1ncc(*)cn1'],
  ['R1/hetero-pyridinium', '[*:1]CC([*:2])c1cccc[n+]1C'],
  ['R1/hetero-N-vinylcarbazole', '[*:1]CC([*:2])n1c2ccccc2c2ccccc12'],
  ['R1/hetero-benzimidazole', '*c1ccc2[nH]c(nc2c1)-c1ccc(*)cc1'],
  ['R1/fused-naphthalene-2,6', '[*:1]c1ccc2cc([*:2])ccc2c1'],
  ['R1/fused-naphthalene-1,4', '*c1ccc(*)c2ccccc12'],
  ['R1/fused-naphthalene-2,7', '*c1ccc2ccc(*)cc2c1'],
  ['R1/fused-naphthalene-1,5', '*c1cccc2c(*)cccc12'],
  ['R1/fused-PEN', '[*:1]CCOC(=O)c1ccc2cc(ccc2c1)C(=O)O[*:2]'],
  ['R1/fused-2-vinylnaphthalene', '[*:1]CC([*:2])c1ccc2ccccc2c1'],
  ['R1/fused-1-vinylnaphthalene', '[*:1]CC([*:2])c1cccc2ccccc12'],
  ['R1/fused-anthracene', '*c1c2ccccc2c(*)c2ccccc12'],
  ['R1/fused-fluorene', '[*:1]c1ccc2c(c1)Cc1cc([*:2])ccc1-2'],
  ['R1/fused-9,9-dimethylfluorene', '[*:1]c1ccc2c(c1)C(C)(C)c1cc([*:2])ccc1-2'],
  ['R1/fused-indane', '*c1ccc2CCCc2c1'],
  ['R1/fused-tetralin', '*c1ccc2CCCCc2c1'],
  ['R1/fused-azulene', '*c1ccc2cccc2cc1'],
  ['R1/fused-quinoline', '*c1ccc2ncccc2c1'],
  ['R1/fused-indole', '*c1c[nH]c2ccccc12'],
  ['R1/fused-pyromellitimide', '[*:1]N1C(=O)c2cc3C(=O)N([*:2])C(=O)c3cc2C1=O'],
  ['R1/fused-PMDA-ODA', '[*:1]N1C(=O)c2cc3C(=O)N(C(=O)c3cc2C1=O)c1ccc(Oc2ccc([*:2])cc2)cc1'],
  ['R1/fused-BPDA-PDA', '[*:1]N1C(=O)c2ccc(cc2C1=O)-c1ccc2C(=O)N(C(=O)c2c1)c1ccc([*:2])cc1'],
  ['R1/biphenyl-unit', '*c1ccc(cc1)-c1ccc(*)cc1'],
  ['R1/dimethylphenylene', '[*:1]c1cc(C)c([*:2])c(C)c1'],
  ['R1/diphenylphenylene', '[*:1]c1cc(-c2ccccc2)c([*:2])c(-c2ccccc2)c1'],
  ['R1/PEEK-book', '*Oc1ccc(Oc2ccc(C(=O)c3ccc(*)cc3)cc2)cc1'],
  ['R1/polystyrene', '[*:1]CC([*:2])c1ccccc1'],
  ['R1/poly-alpha-methylstyrene', '[*:1]CC([*:2])(C)c1ccccc1'],
  // ---- R2 原子索引與氫數：缺基團的原子位置與描述（含氫數、鄰居）、帶電、同位素、自由基、明確氫、其他元素 ----
  ['R2/ammonium', '*C[NH3+]'],
  ['R2/carboxylate', '*CC(=O)[O-]'],
  ['R2/isotope-13C', '*[13CH2]C*'],
  ['R2/deuterium', '[2H]C(C*)C*'],
  ['R2/radical-polymer', '*[CH2]C*'],
  ['R2/explicit-H-atom', '[H]C([H])(C*)C*'],
  ['R2/explicit-H-on-chain-end', '*C([H])([H])C*'],
  ['R2/thiol-polymer', '*CC(S)*'],
  ['R2/silane', '*[SiH2]CC*'],
  ['R2/PDMS-unit', '[*:1]O[Si](C)(C)O[*:2]'],
  ['R2/boron', '*B(O)C*'],
  ['R2/phosphorus', '*P(C)(=O)C*'],
  ['R2/fluoro-chloro-bromo', '*C(F)(Cl)C(Br)*'],
  ['R2/PTFE', '*C(F)(F)C(F)(F)*'],
  ['R2/iodine-unknown-element', '*CC(I)*'],
  ['R2/selenium', '*C[Se]C*'],
  ['R2/nitrile', '[*:1]CC([*:2])C#N'],
  ['R2/nitro', '*CC(*)[N+](=O)[O-]'],
  ['R2/methane', 'C'],
  ['R2/multi-component', 'CC.CC'],
  ['R2/multi-component-polymer', '*CC*.*OC*'],
  // ---- R3 SMARTS 配對順序：組合基團與原子基團重疊，需要優先順序（大基團先、同大小依表序） ----
  ['R3/PMMA-unit', '[*:1]CC([*:2])(C)C(=O)OC'],
  ['R3/PEMA-unit', '[*:1]CC([*:2])(C)C(=O)OCC'],
  ['R3/PVAc-unit', '[*:1]CC([*:2])OC(C)=O'],
  ['R3/PMA-unit', '[*:1]CC([*:2])C(=O)OC'],
  ['R3/PEA-unit', '[*:1]CC([*:2])C(=O)OCC'],
  ['R3/PVOH', '[*:1]CC([*:2])O'],
  ['R3/PVC', '[*:1]CC(Cl)[*:2]'],
  ['R3/PP', '[*:1]CC([*:2])C'],
  ['R3/PIB', '[*:1]CC(C)(C)[*:2]'],
  ['R3/PVCH', '[*:1]CC([*:2])C1CCCCC1'],
  ['R3/PVCH-substituted', '[*:1]CC([*:2])C1CCCCC1C'],
  ['R3/poly-vinyl-methyl-ether', '[*:1]CC([*:2])OC'],
  ['R3/PEO', '[*:1]CCO[*:2]'],
  ['R3/PEO-inner', '*CCOCCOCC*'],
  ['R3/PPO-aromatic-ether', '[*:1]Oc1c(C)cc(cc1C)[*:2]'],
  ['R3/diaryl-ether', '*c1ccc(Oc2ccc(*)cc2)cc1'],
  ['R3/aryl-alkyl-ether', '*c1ccc(OCC*)cc1'],
  ['R3/ester-aliphatic-in-chain', '*CCC(=O)OCC*'],
  ['R3/ester-aromatic-carbonyl', '*c1ccc(cc1)C(=O)OCC*'],
  ['R3/ester-reverse-aryl-ester', '*CCOC(=O)c1ccc(cc1)*'],
  ['R3/anhydride-chain', '*CCC(=O)OC(=O)CC*'],
  ['R3/oxalate', '*OC(=O)C(=O)OC*'],
  ['R3/carbonate-BPA-unit', '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]'],
  ['R3/carbonate-aliphatic', '*CCOC(=O)OCC*'],
  ['R3/nylon6', '[*:1]C(=O)NCCCCC[*:2]'],
  ['R3/nylon66', '[*:1]NC(=O)CCCCC(=O)NCCCCCC[*:2]'],
  ['R3/urethane', '*OCCCCOC(=O)NCCCCCCNC(=O)*'],
  ['R3/urea', '*NC(=O)NCCCCCCNC(=O)N*'],
  ['R3/tertiary-amide', '*CCN(C)C(=O)CC*'],
  ['R3/aramid-PPTA', '[*:1]NC(=O)c1ccc(cc1)C(=O)Nc1ccc([*:2])cc1'],
  ['R3/PET', '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]'],
  ['R3/PBT', '[*:1]CCCCOC(=O)c1ccc(cc1)C(=O)O[*:2]'],
  ['R3/PEN-from-ring', '*CCOC(=O)c1ccc2cc(ccc2c1)C(=O)O*'],
  ['R3/sulfide', '*c1ccc(Sc2ccc(*)cc2)cc1'],
  ['R3/PPS-chain', '*c1ccc(S*)cc1'],
  ['R3/aliphatic-sulfide', '*CCSCC*'],
  ['R3/disulfide', '*CCSSCC*'],
  ['R3/sulfone', '*c1ccc(S(=O)(=O)c2ccc(*)cc2)cc1'],
  ['R3/aliphatic-sulfone', '*CCS(=O)(=O)CC*'],
  ['R3/PDMS-chain', '*[Si](C)(C)O[Si](C)(C)O*'],
  ['R3/silicon-trimethyl', '*C[Si](C)(C)C'],
  ['R3/t-butyl-vs-dimethyl', '[*:1]CC(C)(C)C[*:2]'],
  ['R3/quaternary-C-methylstyrene', '[*:1]CC([*:2])(C)c1ccccc1'],
  ['R3/quaternary-C-t-butylbenzene', '*CC(*)(C)C'],
  ['R3/isopropyl-vs-CH', '[*:1]CC([*:2])CC(C)C'],
  ['R3/CH-CH3-vs-isopropyl-center', '*CC(C)(C)*'],
  ['R3/CH-OCH3', '[*:1]CC([*:2])OC'],
  ['R3/CH-OCOCH3', '[*:1]CC([*:2])OC(C)=O'],
  ['R3/CH-COOCH3', '[*:1]CC([*:2])C(=O)OC'],
  ['R3/CH-OH-methyl', '*CC(C)(O)C*'],
  ['R3/BPA', 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1'],
  ['R3/BADGE', 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1'],
  ['R3/BT05-unit', '[*:1]Oc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC(O)C[*:2]'],
  ['R3/ULTEM', '[*:1]N1C(=O)c2ccc(Oc3ccc(cc3)C(C)(C)c3ccc(Oc4ccc5C(=O)N([*:2])C(=O)c5c4)cc3)cc2C1=O'],
  ['R3/PGMEA', 'COCC(C)OC(C)=O'],
  ['R3/long-chain-120', 'C'.repeat(120)],
  ['R3/long-chain-star-120', `*${'C'.repeat(120)}*`],
  ['R3/long-chain-star-500', `*${'C'.repeat(500)}*`],
  // ---- 繼承 M02 的 Tg 特性（R5）：CTE 的式 4.27 用含校準基團的 Tg，酚羥基單元會走「改寫後重建分子」；
  //      TS 在改寫時丟掉雙鍵順反與映射編號、stereoAtoms 不重編號，使含 –CH=CH– 的酚羥基單元回報缺 Tg（Python 照 TS 重現，之後要修） ----
  ['R5/cte-phenol-PVPh-mapped', '[*:1]CC([*:2])c1ccc(O)cc1'],
  ['R5/cte-phenol-PVPh-unmapped', '*CC(*)c1ccc(O)cc1'],
  // 與「拿掉 –OH 的同一個單元」成對：後者 Tg 算得出（順反基團配得到），前者因 R5 丟掉順反而缺 Tg
  ['R5/cte-phenol-trans-CH=CH', '[*:1]C/C=C/CC(c1ccc(O)cc1)[*:2]'],
  ['R5/cte-plain-trans-CH=CH', '[*:1]C/C=C/CC(c1ccccc1)[*:2]'],
  ['R5/cte-plain-cis-CH=CH', '[*:1]C/C=C\\CC(c1ccccc1)[*:2]'],
  // –OH 寫在前面：被移除原子的索引小於順反標示所指原子 → stereoAtoms 過期、重建失敗（K03）；拿掉 –OH 的同一個單元算得出
  ['R5/cte-phenol-OH-first-stereoAtoms-trans', 'Oc1ccc(cc1)C([*:1])C/C=C/CC[*:2]'],
  ['R5/cte-phenol-OH-first-stereoAtoms-cis', 'Oc1ccc(cc1)C([*:1])C/C=C\\CC[*:2]'],
  ['R5/cte-plain-OH-first-counterpart', 'c1ccc(cc1)C([*:1])C/C=C/CC[*:2]'],
  // 順反遺失但重建成功（K02）
  ['R5/cte-phenol-trans-CH=CH-OH-last', '[*:1]C/C=C/CC([*:2])c1ccc(O)cc1'],
  ['R5/cte-phenol-cis-CH=CH', '[*:1]C/C=C\\CC(c1ccc(O)cc1)[*:2]'],
  ['R5/cte-phenol-catechol', '[*:1]CC([*:2])c1ccc(O)c(O)c1'],
  ['R5/cte-phenol-chiral', '[*:1]C[C@H](c1ccc(O)cc1)[*:2]'],
  ['R5/cte-no-phenol-trans-CH=CH', '[*:1]CC/C=C/CC[*:2]'],
  // ---- 缺基團與無法歸類 ----
  ['missing/oxirane-side', '[*:1]CC([*:2])C1CO1'],
  ['missing/epoxide-ring', '*C1CO1'],
  ['missing/PGMA-unit', '[*:1]CC([*:2])(C)C(=O)OCC1CO1'],
  ['missing/ketone', '*CC(=O)CC*'],
  ['missing/aldehyde', '*CC(C=O)C*'],
  ['missing/acrylonitrile', '[*:1]CC([*:2])C#N'],
  ['missing/amine', '*CCN(C)CC*'],
  ['missing/vinyl-double-bond', '[*:1]CC=CC[*:2]'],
  ['missing/trans-double-bond', '[*:1]CC/C=C/CC[*:2]'],
  ['missing/cis-double-bond', '[*:1]CC/C=C\\CC[*:2]'],
  ['missing/alkyne', '*CC#CC*'],
  ['missing/halogen-F', '*CC(F)C*'],
  ['missing/cyclopentane', '*C1CCCC1C*'],
  ['missing/ring-CH2', '*C1CCCCC1*'],
  ['missing/phenol-OH', '[*:1]CC([*:2])c1ccc(O)cc1'],
  ['missing/phenyl-ester-reverse', '*CCC(=O)Oc1ccc(*)cc1'],
  ['missing/small-molecule-ethanol', 'CCO'],
  ['missing/small-molecule-benzene', 'c1ccccc1'],
  ['missing/small-molecule-PGMEA', 'COCC(C)OC(C)=O'],
  ['missing/small-molecule-BADGE', 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1'],
  ['missing/cardo-UNIT_A', '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O'],
  ['missing/PE-with-one-star', '*CC'],
  // ---- 輸入的邊界 ----
  ['invalid/empty', ''],
  ['invalid/whitespace', '   '],
  ['invalid/garbage', 'xyz'],
  ['invalid/unclosed-ring', '*C1CC*'],
  ['invalid/unclosed-paren', '*C(C('],
  ['invalid/proton', '[H+]'],
  ['invalid/hydrogen-molecule', '[H][H]'],
  ['invalid/trailing-space', '[*:1]CC[*:2] '],
  ['invalid/leading-space', ' [*:1]CC[*:2]'],
  ['invalid/valence', '*C(C)(C)(C)(C)C*'],
  ['invalid/two-stars-only-hydrogen', '[*:1][H]'],
];

// 無法解析的 SMARTS（R4）：兩邊都必須判為無法解析
export const BAD_SMARTS: [string, string][] = [
  ['R4/invalid/open-bracket', '[C'],
  ['R4/invalid/open-paren', 'C(C'],
  ['R4/invalid/extra-close-bracket', '[CX4H2;D2;!R]]'],
  ['R4/invalid/unknown-element', '[Xx]'],
  ['R4/invalid/recursive-unclosed', '[$(C]'],
  ['R4/invalid/ring-unclosed', 'C1CC'],
  ['R4/invalid/garbage', 'not a smarts'],
];

// R3 參數探針：[id, SMILES, SMARTS]。get_substruct_matches 不帶 details 時的行為（RDKit.js 預設）必須與 Python 明確設定的參數一致。
export const RAW_QUERIES: [string, string, string][] = [
  ['R3/params/uniquify-benzene', 'c1ccccc1', 'c1ccccc1'],
  ['R3/params/uniquify-biphenyl', 'c1ccc(cc1)-c1ccccc1', 'c1ccccc1'],
  ['R3/params/uniquify-naphthalene-ring', 'c1ccc2ccccc2c1', 'c1ccccc1'],
  ['R3/params/chirality-ignored', 'N[C@@](C)(F)Cl', 'N[C@](C)(F)Cl'],
  ['R3/params/chirality-same', 'N[C@](C)(F)Cl', 'N[C@](C)(F)Cl'],
  ['R3/params/aromatic-vs-conjugated', 'C=CC=C', 'C:C'],
  ['R3/params/aromatic-bond-in-ring', 'c1ccccc1', 'c:c'],
  ['R3/params/recursive', 'CC(=O)O', '[$(C=O)]'],
  ['R3/params/recursive-nested', 'COC(=O)c1ccccc1', '[c;$(c-[$(C=O)])]'],
  ['R3/params/query-atom-order', 'CC(=O)O', 'O=CO'],
  ['R3/params/query-atom-order-2', 'CC(=O)OC', 'C(=O)O'],
  ['R3/params/symmetric-ester', 'COC(=O)C(=O)OC', 'C(=O)O'],
  ['R3/params/ring-flag', 'C1CCCCC1C', '[CX4;R]'],
  ['R3/params/ring-flag-neg', 'C1CCCCC1C', '[CX4;!R]'],
  ['R3/params/many-matches-500', 'C'.repeat(500), '[#6]'],
  ['R3/params/two-atom-500', 'C'.repeat(500), 'CC'],
  ['R3/params/no-match', 'CCO', 'N'],
  ['R3/params/explicit-H-query', 'CCO', '[CH2]'],
  ['R3/params/dummy-atom', '*CC*', '[#0]'],
  ['R3/params/dummy-in-chain', '[*:1]CC([*:2])c1ccccc1', 'C~C'],
  ['R3/params/first-match-vs-all', 'CCCC', 'CC'],
  ['R3/params/ether-with-dummy', '*CCOCC*', '[OX2H0;D2;!R](-[#6,#0])-[#6,#0]'],
  ['R3/params/ester-with-dummy', '*CCC(=O)OCC*', '[CX3H0;D3](=[OX1])-[OX2H0;D2]-[#6,#0]'],
];

const SMILES_LIKE = /^[A-Za-z0-9@+\-[\]()=#$:/\\%.*~]+$/;
const HAS_ATOM = /[BCNOPSFIbcnops*[]/;
const NOT_SMILES = /\.(csv|ts|md|json|mjs|png)$|^(src|docs|tests|scripts)\//;

function candidates(file: string, pattern: RegExp, unescape: boolean): string[] {
  const text = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of text.matchAll(pattern)) {
    let s = m[1];
    if (unescape) s = s.replace(/\\(.)/g, '$1');
    if (s.length > 0 && s.length <= 400 && SMILES_LIKE.test(s) && HAS_ATOM.test(s) && !NOT_SMILES.test(s)) out.push(s);
  }
  return out;
}

const listDir = (dir: string, pattern: RegExp): string[] =>
  readdirSync(resolve(ROOT, dir))
    .filter((n) => pattern.test(n))
    .sort()
    .map((n) => join(dir, n));

export interface InputMolecule {
  id: string;
  smiles: string;
  /** 是否另做選項變體（Vm 的 rows 變體）：只有書中聚合物與專屬案例需要 */
  variants: boolean;
}

export interface InputSources {
  parses: (smiles: string) => boolean;
  MOLAR_VOLUME_GROUPS: { id: string }[];
  MOLAR_VOLUME_GROUP_CASES: { id: string; positives: string[]; negatives: string[] }[];
  BOOK_MOLAR_VOLUME_CASES: { name: string; smiles: string }[];
  BACKBONE_TEMPLATES: { id: string; unitSmiles: string }[];
}

/** 收集分子清單（去重，保留第一次出現；來源檔案中形似 SMILES 的字串必須能被 RDKit.js 解析才收）。 */
export function collectMolecules(src: InputSources): InputMolecule[] {
  const molecules: InputMolecule[] = [];
  const seen = new Set<string>();
  const add = (id: string, smiles: string, requireParse: boolean, variants: boolean) => {
    if (seen.has(smiles)) return;
    if (requireParse && !src.parses(smiles)) return;
    seen.add(smiles);
    molecules.push({ id, smiles, variants });
  };
  for (const [id, smiles] of DEDICATED) add(id, smiles, false, !id.startsWith('R3/long-chain') && !id.startsWith('invalid/'));
  for (const r of src.MOLAR_VOLUME_GROUP_CASES) {
    r.positives.forEach((s, i) => add(`molarVolumeGroups/${r.id}/pos${i + 1}`, s, false, false));
    r.negatives.forEach((s, i) => add(`molarVolumeGroups/${r.id}/neg${i + 1}`, s, false, false));
  }
  for (const c of src.BOOK_MOLAR_VOLUME_CASES) add(`book/${c.name}`, c.smiles, false, true);
  for (const t of src.BACKBONE_TEMPLATES) add(`BT/${t.id}`, t.unitSmiles, false, true);
  const sourceFiles: [string, RegExp, boolean, boolean][] = [
    ...['molarVolumeDensity.test.ts', 'molarVolumeGroups.test.ts', 'cte.test.ts'].map(
      (f) => [join('tests/properties', f), /'((?:[^'\\\n]|\\.)*)'/g, true, true] as [string, RegExp, boolean, boolean],
    ),
    ...listDir('docs/verification', /^phase6-(Vm-密度-輸出|自由體積-CTE-輸出)\.md$/).map((f) => [f, /`([^`\n]+)`/g, false, false] as [string, RegExp, boolean, boolean]),
    ...listDir('scripts/verification', /^phase6-.*\.ts$/).map((f) => [f, /'((?:[^'\\\n]|\\.)*)'/g, true, false] as [string, RegExp, boolean, boolean]),
  ];
  for (const [file, pattern, unescape, variants] of sourceFiles) {
    const rel = relative(ROOT, resolve(ROOT, file)).replace(/\\/g, '/');
    let n = 0;
    for (const smiles of candidates(resolve(ROOT, file), pattern, unescape)) add(`${rel}#${++n}`, smiles, true, variants);
  }
  return molecules;
}

/** molarVolumeDensity.ts 的 MISSING_HINTS（沒有匯出）：直接從原始碼讀出 SMARTS，黃金檔記錄的就是 TS 實際使用的字串 */
export function readMissingHintSmarts(): string[] {
  const text = readFileSync(resolve(ROOT, 'src/core/properties/molarVolumeDensity.ts'), 'utf8');
  const block = text.slice(text.indexOf('const MISSING_HINTS'), text.indexOf('function describeAtom'));
  return [...block.matchAll(/smarts: '((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
}
