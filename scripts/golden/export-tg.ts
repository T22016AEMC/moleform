// 黃金資料：src/core/properties/tgGroupContribution.ts 的 computeTg（任務 M02；風險 R1 芳香性、R2 原子索引與氫數、
// R3 SMARTS 配對順序、R4 SMARTS 解析、R5 改寫後重建分子）。
// 只呼叫現有的 TypeScript 函式（computeTg、buildYgFamilies、firstMatch、calibratedAsYgRow）；R3 的「原始配對順序」案例直接呼叫
// RDKit.js 的 get_substruct_matches（TS 計算本來就是這個呼叫），記錄 RDKit 未經任何排序的回傳。
// R5（stripSubstituents，tgGroupContribution.ts 約 491–514 行）的觀測方式：不改任何 TS 檔，只在匯出程式裡包一層 RDKit 物件
// （Object.create），攔截 TS 呼叫 `RDKit.get_mol(<改寫後的 JSON>)` 的輸入與輸出，記錄 TS 實際餵給 RDKit 的原子／鍵（含原子順序、
// 氫數、stereoAtoms）以及 get_smiles() 的 canonical SMILES；Python 端用 RWMol 重建後逐項比對。
// 案例種類（input.kind）：
//   compute    computeTg(RDKit, smiles, options) 的完整輸出（options 只有 partition、calibrated 兩個可序列化的選項）；
//              TS 拋出例外時（目前只有空分子：get_json 對沒有原子的分子拋出）輸出 { threw: true }，Python 端要求同樣拋出
//   r5         同一個 computeTg 呼叫，另記錄改寫後重建分子的內容：output = { result, rebuilds: [{ atoms, bonds, hasExtensions, built, canonicalSmiles }] }
//              （rebuilds 為空＝沒有走到改寫重建）
//   rawMatches 兩張資料表全部 SMARTS 對該分子的原始配對（RDKit.js 的順序，不排序）；只列有命中的 SMARTS（以 SMARTS 字串為鍵）
//   rawQuery   任意 SMILES × 任意 SMARTS 的原始配對（R3 的參數探針）
//   smarts     資料表每一列 SMARTS 的可解析性，以及該列正例／反例的原始配對與第一個命中（firstMatch）
//   families   buildYgFamilies 的家族清單（id、size、order、rows 的 id）；一份只用書中基團、一份加上校準的整體基團
// 分子來源（以 SMILES 去重，保留第一次出現）：
//   1. R1／R2／R3／R5 專屬案例與無效輸入
//   2. yg_groups.csv、yg_calibrated_groups.csv 每一列的正例與反例
//   3. tests/properties/bookCases.ts 的書中聚合物（12 個）、骨架範本 BT01–BT06 的單元
//   4. tests/properties/tg.test.ts、ygCalibrated.test.ts 內的 SMILES 字串
//   5. docs/verification 的 Tg 輸出文件，以及 scripts/verification 的 phase6-*.ts、031-*.ts 中形似 SMILES 的字串
// 執行：node scripts/golden/export-tg.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ROOT, withVite, writeGolden, type GoldenCase } from './common.ts';

const DEDICATED: [string, string, boolean?][] = [
  // ---- R1 芳香性：共軛狀態（n／c／cc）與 C(CH3)2／Si(CH3)2 是否受阻，都取決於相鄰原子的芳香旗標 ----
  ['R1/p-phenylene-n', '*CC(C)c1ccc(cc1)C(C)C*'],
  ['R1/p-phenylene-c', '*CCc1ccc(cc1)C(=O)CC*'],
  ['R1/p-phenylene-cc', '*C(=O)c1ccc(cc1)C(=O)*'],
  ['R1/kekule-p-phenylene-cc', '*C(=O)C1=CC=C(C=C1)C(=O)*'],
  ['R1/kekule-benzene', 'C1=CC=CC=C1'],
  ['R1/kekule-toluene', 'CC1=CC=CC=C1'],
  ['R1/unkekulizable-5ring', 'c1cccc1'],
  ['R1/cyclohexene-not-aromatic', 'C1=CCCCC1'],
  ['R1/CO-thiophene', '*C(=O)c1ccc(s1)C(=O)*'],
  ['R1/CO-furan', '*C(=O)c1ccc(o1)C(=O)*'],
  ['R1/CO-pyridine-3-yl', '*C(=O)c1cccnc1'],
  ['R1/CO-pyridine-4-yl', '*C(=O)c1ccncc1CC*'],
  ['R1/CO-pyrrole', '*C(=O)c1ccc[nH]1'],
  ['R1/CO-imidazole', '*C(=O)c1cnc[nH]1'],
  ['R1/CO-naphthalene-2', '*C(=O)c1ccc2ccccc2c1'],
  ['R1/CO-naphthalene-1', '*C(=O)c1cccc2ccccc12'],
  ['R1/CO-anthracene', '*C(=O)c1ccc2cc3ccccc3cc2c1'],
  ['R1/CO-carbazole-N', '*C(=O)n1c2ccccc2c2ccccc12'],
  ['R1/CO-fluorene', '*C(=O)c1ccc2c(c1)Cc1ccccc1-2'],
  ['R1/CO-indole', '*C(=O)c1c[nH]c2ccccc12'],
  ['R1/CO-quinoline', '*C(=O)c1ccc2ncccc2c1'],
  ['R1/CO-azulene', '*C(=O)c1ccc2cccc2cc1'],
  ['R1/CONH-pyridine', '*CCNC(=O)c1cccnc1CC*'],
  ['R1/CONH-phenylene-cc', '*c1cccc(c1)NC(=O)c1cccc(c1)*'],
  ['R1/CMe2-benzene-hindered', '*c1cccc(c1)C(C)(C)c1cccc(c1)*'],
  ['R1/CMe2-naphthalene-hindered', '*c1ccc2cc(ccc2c1)C(C)(C)c1ccc2cc(*)ccc2c1'],
  ['R1/CMe2-pyridine-hindered', '*c1cccnc1C(C)(C)c1cccnc1*'],
  ['R1/CMe2-one-aromatic-free', '*c1cccc(c1)C(C)(C)CC*'],
  ['R1/SiMe2-benzene-hindered', '*c1ccc(cc1)[Si](C)(C)c1ccc(*)cc1'],
  ['R1/SiMe2-thiophene-hindered', '*c1ccc(s1)[Si](C)(C)c1ccc(*)s1'],
  ['R1/SiMe2-free', '*CC[Si](C)(C)CC*'],
  ['R1/star-phenylene', '*c1ccc(*)cc1'],
  ['R1/star-phenylene-mapped', '[*:1]c1ccc([*:2])cc1'],
  ['R1/star-meta-phenylene', '*c1cccc(*)c1'],
  ['R1/star-furan', '[*:1]c1ccc([*:2])o1'],
  ['R1/star-thiophene', '*c1ccc(*)s1'],
  ['R1/star-pyridine', '*c1ccc(*)nc1'],
  ['R1/star-naphthalene-2,6', '[*:1]c1ccc2cc([*:2])ccc2c1'],
  ['R1/star-naphthalene-1,4', '*c1ccc(*)c2ccccc12'],
  ['R1/star-naphthalene-2,7', '*c1ccc2ccc(*)cc2c1'],
  ['R1/star-carbazole-N', '[*:1]n1c2ccccc2c2ccccc12'],
  ['R1/star-in-aromatic-ring', 'c1cc*cc1'],
  ['R1/star-only', '*'],
  ['R1/star-star', '**'],
  ['R1/star-one', '*CC'],
  ['R1/star-three', '*CC(*)C*'],
  ['R1/star-C-star', '*C*'],
  ['R1/biphenyl-unit', '*c1ccc(cc1)-c1ccc(*)cc1'],
  ['R1/fluorene-unit', '[*:1]c1ccc2c(c1)Cc1cc([*:2])ccc1-2'],
  ['R1/PEEK-from-ring', '*c1ccc(Oc2ccc(Oc3ccc(C(=O)*)cc3)cc2)cc1'],
  ['R1/PET', '[*:1]CCOC(=O)c1ccc(cc1)C(=O)O[*:2]'],
  ['R1/polystyrene', '[*:1]CC([*:2])c1ccccc1'],
  ['R1/poly-2-vinylpyridine', '[*:1]CC([*:2])c1ccccn1'],
  ['R1/poly-N-vinylcarbazole', '[*:1]CC([*:2])n1c2ccccc2c2ccccc12'],
  ['R1/poly-2-vinylnaphthalene', '[*:1]CC([*:2])c1ccc2ccccc2c1'],
  // ---- R2 原子索引與氫數：缺基團的原子位置與描述（含氫數、鄰居）、帶電、同位素、自由基、明確氫 ----
  ['R2/ammonium', 'C[NH3+]'],
  ['R2/carboxylate', 'CC(=O)[O-]'],
  ['R2/pyridinium', 'C[n+]1ccccc1'],
  ['R2/pyrrole-nH', 'c1cc[nH]c1'],
  ['R2/isotope-13C', '[13CH3]CC'],
  ['R2/deuterium', '[2H]CC'],
  ['R2/radical', '[CH2]CC'],
  ['R2/radical-polymer', '*[CH2]C*'],
  ['R2/methane', 'C'],
  ['R2/ethane', 'CC'],
  ['R2/explicit-H-atom', '[H]C([H])([H])C'],
  ['R2/aromatic-NH-in-chain', '*Cc1ccc2[nH]ccc2c1CC*'],
  ['R2/thiol-polymer', '*CC(S)*'],
  ['R2/silane', '*[SiH2]CC*'],
  ['R2/boron', '*B(O)C*'],
  ['R2/phosphorus', '*P(C)(=O)C*'],
  ['R2/fluoro-chloro-bromo', '*C(F)(Cl)C(Br)*'],
  ['R2/iodine-unknown-element', '*CC(I)*'],
  ['R2/selenium', '*C[Se]C*'],
  ['R2/multi-component', 'CC.CC'],
  ['R2/multi-component-polymer', '*CC*.*OC*'],
  // ---- R3 SMARTS 配對順序：組合基團與原子基團重疊，需要優先順序（大基團先、同大小依表序） ----
  ['R3/PMMA-unit', '[*:1]CC([*:2])(C)C(=O)OC'],
  ['R3/PEMA-unit', '[*:1]CC([*:2])(C)C(=O)OCC'],
  ['R3/PVAc-unit', '[*:1]CC([*:2])OC(C)=O'],
  ['R3/PMA-unit', '[*:1]CC([*:2])C(=O)OC'],
  ['R3/PGMEA', 'COCC(C)OC(C)=O'],
  ['R3/ester-vs-ether', 'CCOC(=O)CCOCC'],
  ['R3/anhydride-chain', '*CCC(=O)OC(=O)CC*'],
  ['R3/anhydride-cyclic', 'O=C1OC(=O)C2CCCCC12'],
  ['R3/anhydride-small', 'CC(=O)OC(C)=O'],
  ['R3/oxalate', 'COC(=O)C(=O)OC'],
  ['R3/carbonate-BPA-unit', '[*:1]OC(=O)Oc1ccc(cc1)C(C)(C)c1ccc(cc1)[*:2]'],
  ['R3/nylon66', '[*:1]NC(=O)CCCCC(=O)NCCCCCC[*:2]'],
  ['R3/urethane', '*OCCCCOC(=O)NCCCCCCNC(=O)*'],
  ['R3/urea', '*NC(=O)NCCCCCCNC(=O)NCCCCCCCCCCCC*'],
  ['R3/phthalate-ortho', '[*:1]CCOC(=O)c1ccccc1C(=O)O[*:2]'],
  ['R3/isophthalate', '[*:1]CCOC(=O)c1cccc(c1)C(=O)O[*:2]'],
  ['R3/terephthalamide-C7', '[*:1]CCCCCCCNC(=O)c1ccc(cc1)C(=O)N[*:2]'],
  ['R3/dimethylphenylene', '[*:1]c1cc(C)c([*:2])c(C)c1'],
  ['R3/naphthyl-2-vs-ring-CH', '[*:1]C([*:2])c1ccc2ccccc2c1'],
  ['R3/cyclohexyl-vs-CH2', '[*:1]CC([*:2])C1CCCCC1'],
  ['R3/isopropyl-vs-CH', '[*:1]CC([*:2])CC(C)C'],
  ['R3/quaternary-C-vs-dimethyl', '[*:1]CC(C)(C)C[*:2]'],
  ['R3/BPA', 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1'],
  ['R3/BADGE', 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1'],
  ['R3/BT05-unit', '[*:1]Oc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC(O)C[*:2]'],
  ['R3/ULTEM', '[*:1]N1C(=O)c2ccc(Oc3ccc(cc3)C(C)(C)c3ccc(Oc4ccc5C(=O)N([*:2])C(=O)c5c4)cc3)cc2C1=O'],
  ['R3/PMDA-ODA', '[*:1]N1C(=O)c2cc3C(=O)N(C(=O)c3cc2C1=O)c1ccc(Oc2ccc([*:2])cc2)cc1'],
  ['R3/BPDA-PDA', '[*:1]N1C(=O)c2ccc(cc2C1=O)-c1ccc2C(=O)N(C(=O)c2c1)c1ccc([*:2])cc1'],
  ['R3/PEEK-book', '*Oc1ccc(Oc2ccc(C(=O)c3ccc(*)cc3)cc2)cc1'],
  ['R3/combo-CH2-C6H4-CH2', '*c1ccc(Cc2ccc(*)cc2)cc1'],
  ['R3/combo-O', '*c1ccc(Oc2ccc(*)cc2)cc1'],
  ['R3/combo-S', '*c1ccc(Sc2ccc(*)cc2)cc1'],
  ['R3/combo-SO2', '*c1ccc(S(=O)(=O)c2ccc(*)cc2)cc1'],
  ['R3/combo-three-ring', '[*:1]c1ccc(cc1)Oc1ccc(cc1)Oc1ccc([*:2])cc1'],
  ['R3/PDMS-unit', '[*:1]O[Si](C)(C)O[*:2]'],
  ['R3/spirobiindane-SBI', 'OC(=CC=C1C2(C)C)C=C1C(C2)(CC1(C)C)C(=CC(O)=C2)C1=C2'],
  ['R3/fluorene-bisphenol', 'Oc1ccc(cc1)C1(c2ccc(O)cc2)c2ccccc2-c2ccccc12'],
  ['R3/trans-CH=CH', '[*:1]CC/C=C/CC[*:2]'],
  ['R3/cis-CH=CH', '[*:1]CC/C=C\\CC[*:2]'],
  ['R3/no-stereo-CH=CH', '[*:1]CCC=CCC[*:2]'],
  ['R3/side-chain-CH2', '*CC(CC)*'],
  ['R3/long-chain-120', 'C'.repeat(120)],
  ['R3/long-chain-500', 'C'.repeat(500)],
  // ---- R5：走到「改寫 JSON 後重建分子再取 canonical SMILES」的單元（含酚羥基的 –OH 增量，書中基團先配不到）；第三個欄位＝預期走到改寫 ----
  // 含 * 連接點（映射編號會在重建後消失）
  ['R5/star-PVPh-para', '[*:1]CC([*:2])c1ccc(O)cc1', true],
  ['R5/star-PVPh-meta', '[*:1]CC([*:2])c1cccc(O)c1', true],
  ['R5/star-PVPh-ortho', '[*:1]CC([*:2])c1ccccc1O', true],
  ['R5/star-unmapped', '*CC(*)c1ccc(O)cc1', true],
  ['R5/star-catechol', '[*:1]CC([*:2])c1ccc(O)c(O)c1', true],
  ['R5/star-resorcinol', '[*:1]CC([*:2])c1cc(O)cc(O)c1', true],
  ['R5/star-2,4-diOH', '[*:1]CC([*:2])c1ccc(O)cc1O', true],
  ['R5/star-2,6-diOH', '[*:1]CC([*:2])c1c(O)cccc1O', true],
  ['R5/star-one-dummy', '[*:1]CC(c1ccc(O)cc1)C', true],
  ['R5/star-xylylene', '[*:1]Cc1ccc(O)cc1C[*:2]', true],
  ['R5/star-with-PGMA-side', '[*:1]CC([*:2])(C(=O)OCC1CO1)c1ccc(O)cc1', true],
  ['R5/star-methylstyrene', '[*:1]CC([*:2])(C)c1ccc(O)cc1', true],
  ['R5/star-bisphenol-in-chain', '[*:1]Oc1ccc(cc1)C(C)(C)c1ccc(cc1)OCC(O)C[*:2]', true],
  ['R5/star-bisphenol-OH-pendant', '[*:1]CC([*:2])c1ccc(cc1)C(C)(C)c1ccc(O)cc1', true],
  // 雜環
  ['R5/hetero-pyridinol-3', '[*:1]CC([*:2])c1ccc(O)nc1', true],
  ['R5/hetero-2-hydroxypyridine', 'Oc1ccccn1', true],
  ['R5/hetero-pyridone-tautomer', 'O=c1cccc[nH]1', false],
  ['R5/hetero-4-hydroxypyrimidine', 'Oc1ncccn1', true],
  ['R5/hetero-3-hydroxypyrrole', 'Oc1cc[nH]c1', true],
  ['R5/hetero-3-hydroxythiophene', 'Oc1ccsc1', true],
  ['R5/hetero-3-hydroxyfuran', 'Oc1ccoc1', true],
  ['R5/hetero-hydroxyimidazole', 'Oc1cnc[nH]1', true],
  ['R5/hetero-5-hydroxyindole', 'Oc1ccc2[nH]ccc2c1', true],
  ['R5/hetero-5-hydroxybenzofuran', 'Oc1ccc2occc2c1', true],
  ['R5/hetero-5-hydroxybenzothiophene', 'Oc1ccc2sccc2c1', true],
  ['R5/hetero-8-hydroxyquinoline', 'Oc1cccc2cccnc12', true],
  ['R5/hetero-2-hydroxyquinoline', 'Oc1ccc2ccccc2n1', true],
  ['R5/hetero-carbazol-ol', 'Oc1ccc2c(c1)[nH]c1ccccc12', true],
  ['R5/hetero-star-thiophene-OH', '[*:1]Cc1cc(O)c([*:2])s1', true],
  ['R5/hetero-star-pyridinium-OH', '[*:1]CC([*:2])c1ccc(O)c[n+]1C', true],
  ['R5/hetero-star-N-vinylcarbazole-OH', '[*:1]CC([*:2])n1c2ccc(O)cc2c2ccccc12', true],
  // 稠環
  ['R5/fused-star-naphthol', '[*:1]CC([*:2])c1ccc2cc(O)ccc2c1', true],
  ['R5/fused-1-naphthol', 'Oc1cccc2ccccc12', true],
  ['R5/fused-2-naphthol', 'Oc1ccc2ccccc2c1', true],
  ['R5/fused-9-anthrol', 'Oc1c2ccccc2cc2ccccc12', true],
  ['R5/fused-2-phenanthrol', 'Oc1ccc2c(c1)ccc1ccccc12', true],
  ['R5/fused-azulenol', 'Oc1ccc2cccc2cc1', true],
  ['R5/fused-fluorenol', 'Oc1ccc2c(c1)Cc1ccccc1-2', true],
  ['R5/fused-biphenyl-diol', 'Oc1ccc(cc1)-c1ccc(O)cc1', true],
  ['R5/fused-BPA-diol', 'Oc1ccc(cc1)C(C)(C)c1ccc(O)cc1', true],
  ['R5/fused-adamantyl-phenol', 'C12CC3CC(CC(C3)C1)C2c1ccc(O)cc1', true],
  ['R5/fused-tetralin-ol', 'Oc1ccc2CCCCc2c1', true],
  ['R5/fused-indane-ol', 'Oc1ccc2CCCc2c1', true],
  // 雙酚茀（校準的整體基團＋酚羥基增量）
  ['R5/cardo-UNIT_A', '[*:1]c1ccc(C2(c3ccc([*:2])c(O)c3)c3ccccc3-c3ccccc32)cc1O', true],
  ['R5/cardo-fluorene-ether', '[*:1]Oc1ccc(cc1)C1(c2ccc(O)cc2)c2ccccc2-c2ccccc12', true],
  ['R5/cardo-fluorene-bisphenol', 'Oc1ccc(cc1)C1(c2ccc(O)cc2)c2ccccc2-c2ccccc12', true],
  // 手性（四面體；cw／ccw 在重建後要保留）
  ['R5/chiral-star-S', '[*:1]C[C@H](c1ccc(O)cc1)[*:2]', true],
  ['R5/chiral-star-R', '[*:1]C[C@@H](c1ccc(O)cc1)[*:2]', true],
  ['R5/chiral-OH-first', 'Oc1ccc(cc1)[C@H](C[*:1])[*:2]', true],
  ['R5/chiral-OH-first-R', 'Oc1ccc(cc1)[C@@H](C[*:1])[*:2]', true],
  ['R5/chiral-methyl', '[*:1]C[C@H](C)c1ccc(O)cc1', true],
  ['R5/chiral-tyrosine-L', 'N[C@@H](Cc1ccc(O)cc1)C(=O)O', true],
  ['R5/chiral-tyrosine-D', 'N[C@H](Cc1ccc(O)cc1)C(=O)O', true],
  ['R5/chiral-tyrosine-OH-first', 'Oc1ccc(C[C@H](N)C(=O)O)cc1', true],
  ['R5/chiral-phenylglycine', 'Oc1ccc(cc1)[C@@H](N)C(=O)O', true],
  ['R5/chiral-ring-trans', 'C[C@@H]1CCCC[C@@H]1c1ccc(O)cc1', true],
  ['R5/chiral-ring-cis', 'C[C@H]1CCCC[C@@H]1c1ccc(O)cc1', true],
  ['R5/chiral-two-centers', 'C[C@H](c1ccc(O)cc1)[C@@H](C)c1ccc(O)cc1', true],
  ['R5/chiral-halogens', 'F[C@](Cl)(Br)c1ccc(O)cc1', true],
  ['R5/chiral-alcohol-keeps-OH', 'O[C@@H](C)c1ccc(O)cc1', true],
  ['R5/chiral-alcohol-keeps-OH-2', 'C[C@H](O)c1ccc(O)cc1', true],
  ['R5/chiral-lactate-ester', '[*:1]O[C@@H](C)C(=O)Oc1ccc(O)cc1', true],
  ['R5/chiral-star-Cl', '[*:1]C[C@@H](Cl)c1ccc(O)cc1', true],
  // 雙鍵立體（TS 不重新編號 stereoAtoms：被移除的原子索引小於立體所指原子時重建失敗，其餘情形 canonical SMILES 不帶順反）
  ['R5/dbl-trans-OH-last', 'C/C=C/c1ccc(O)cc1', true],
  ['R5/dbl-cis-OH-last', 'C/C=C\\c1ccc(O)cc1', true],
  ['R5/dbl-trans-star', '[*:1]CC/C=C/c1ccc(O)cc1', true],
  ['R5/dbl-cis-star', '[*:1]CC/C=C\\c1ccc(O)cc1', true],
  ['R5/dbl-trans-OH-first', 'Oc1ccc(/C=C/CC[*:1])cc1', true],
  ['R5/dbl-cis-OH-first', 'Oc1ccc(/C=C\\CC[*:1])cc1', true],
  ['R5/dbl-stilbene-OH-first', 'Oc1ccc(cc1)/C=C/c1ccccc1', true],
  ['R5/dbl-stilbene-OH-last', 'c1ccccc1/C=C/c1ccc(O)cc1', true],
  ['R5/dbl-star-stilbene', '[*:1]c1ccc(/C=C/c2ccc(O)cc2)cc1[*:2]', true],
  ['R5/dbl-in-chain-with-phenol', '[*:1]C/C=C/CC(c1ccc(O)cc1)[*:2]', true],
  ['R5/dbl-in-chain-cis-with-phenol', '[*:1]C/C=C\\CC(c1ccc(O)cc1)[*:2]', true],
  ['R5/dbl-diene', 'C/C=C/C=C/c1ccc(O)cc1', true],
  ['R5/dbl-imine', 'C/C=N/c1ccc(O)cc1', true],
  ['R5/dbl-azo', 'c1ccccc1/N=N/c1ccc(O)cc1', true],
  ['R5/dbl-trisubstituted', 'C/C(C)=C/c1ccc(O)cc1', true],
  ['R5/dbl-no-stereo', 'CC=Cc1ccc(O)cc1', true],
  ['R5/dbl-ring-cyclohexene', 'C1=CCCCC1c1ccc(O)cc1', true],
  ['R5/dbl-ring-cis-cyclooctene', 'C1CC/C=C\\CCC1c1ccc(O)cc1', true],
  ['R5/dbl-and-chiral', 'C/C=C/[C@H](C)c1ccc(O)cc1', true],
  ['R5/dbl-and-chiral-OH-first', 'Oc1ccc(cc1)[C@H](C)/C=C/C', true],
  // 帶電、同位素、自由基、明確氫、其他取代基
  ['R5/charge-viologen-like', 'C[n+]1ccc(cc1)c1ccc(O)cc1', true],
  ['R5/charge-carboxylate', '[O-]C(=O)c1ccc(O)cc1', true],
  ['R5/charge-trimethylammonium', 'C[N+](C)(C)c1ccc(O)cc1', true],
  ['R5/charge-nitro', '[O-][N+](=O)c1ccc(O)cc1', true],
  ['R5/charge-N-oxide-other-component', '[O-][n+]1ccccc1.Oc1ccccc1', true],
  ['R5/charge-ammonium-other-component', 'C[NH3+].Oc1ccccc1', true],
  ['R5/isotope-13C', '[13CH3]c1ccc(O)cc1', true],
  ['R5/isotope-14C', 'Oc1ccc([14CH2]C)cc1', true],
  ['R5/isotope-deuterium', '[2H]c1ccc(O)cc1', true],
  ['R5/isotope-deuterium-ortho', 'c1cc([2H])c(O)cc1', true],
  ['R5/radical-benzyl', '[CH2]c1ccc(O)cc1', true],
  ['R5/explicit-OH-bracket', '[OH]c1ccccc1', true],
  ['R5/explicit-H-on-O', '[H]Oc1ccccc1', true],
  ['R5/explicit-H-on-O-methyl', 'O([H])c1ccc(C)cc1', true],
  ['R5/substituent-ester', 'CC(=O)Oc1ccc(O)cc1', true],
  ['R5/substituent-sulfonic', 'Oc1ccc(cc1)S(=O)(=O)O', true],
  ['R5/substituent-amide', 'Oc1ccc(cc1)C(=O)N', true],
  ['R5/substituent-cyclopropyl', 'C1CC1c1ccc(O)cc1', true],
  ['R5/substituent-triphenylphosphine-like', 'Oc1ccc(cc1)P(c1ccccc1)c1ccccc1', true],
  ['R5/substituent-silyl', '[Si](C)(C)(C)c1ccc(O)cc1', true],
  ['R5/substituent-boronic', 'Oc1ccc(cc1)B(O)O', true],
  ['R5/substituent-halogens', 'Oc1ccc(Cl)c(Br)c1', true],
  ['R5/substituent-fluoro', 'Oc1ccc(F)cc1', true],
  ['R5/substituent-nitrile', 'Oc1ccc(cc1)C#N', true],
  ['R5/substituent-alkyne', 'Oc1ccc(cc1)C#C', true],
  ['R5/substituent-nitrile-aldehyde', 'N#Cc1ccc(O)cc1C=O', true],
  ['R5/phenol', 'Oc1ccccc1', true],
  ['R5/phenol-Kekule', 'OC1=CC=CC=C1', true],
  ['R5/phenol-methyl', 'Cc1ccc(O)cc1', true],
  // 少見的原子與鍵：配位鍵、非碳的四面體手性中心、累積雙鍵、金屬離子、橋環
  ['R5/exotic-dative-bond', 'Oc1ccc(cc1)[NH2]->[Cu]', true],
  ['R5/exotic-sulfoxide-chiral', 'C[S@](=O)c1ccc(O)cc1', true],
  ['R5/exotic-phosphine-oxide-chiral', 'C[P@](=O)(c1ccccc1)c1ccc(O)cc1', true],
  ['R5/exotic-silane-chiral', 'C[Si@](F)(Cl)c1ccc(O)cc1', true],
  ['R5/exotic-bridgehead-chiral', 'C1[C@H]2CC[C@@H]1CC2c1ccc(O)cc1', true],
  ['R5/exotic-allene', 'C=C=Cc1ccc(O)cc1', true],
  ['R5/exotic-sodium-phenoxide', '[Na+].[O-]c1ccc(O)cc1', true],
  ['R5/exotic-tropolone', 'Oc1cccccc1=O', true],
  // 對照：沒有芳香羥基（或書中基團已能完整切分）→ 不走改寫重建
  ['R5/control-no-site-polymer', '[*:1]CC([*:2])c1ccccc1', false],
  ['R5/control-alcohol-only', '[*:1]CC(O)[*:2]', false],
  ['R5/control-aliphatic-OH-small', 'CCO', false],
  ['R5/control-chiral-no-site', '[*:1]C[C@H](C)c1ccccc1', false],
  // ---- 輸入與選項的邊界 ----
  ['invalid/empty', ''],
  ['invalid/whitespace', '   '],
  ['invalid/garbage', 'xyz'],
  ['invalid/unclosed-ring', 'C1CC'],
  ['invalid/unclosed-paren', 'C(C('],
  ['invalid/proton', '[H+]'],
  ['invalid/hydrogen-molecule', '[H][H]'],
  ['invalid/trailing-space', 'CCC '],
  ['invalid/leading-space', ' CCC'],
  ['invalid/valence', 'C(C)(C)(C)(C)C'],
];

// 無法解析的 SMARTS（R4）：兩邊都必須判為無法解析
const BAD_SMARTS: [string, string][] = [
  ['R4/invalid/open-bracket', '[C'],
  ['R4/invalid/open-paren', 'C(C'],
  ['R4/invalid/extra-close-bracket', '[CX4H2;D2;!R]]'],
  ['R4/invalid/unknown-element', '[Xx]'],
  ['R4/invalid/recursive-unclosed', '[$(C]'],
  ['R4/invalid/ring-unclosed', 'C1CC'],
  ['R4/invalid/garbage', 'not a smarts'],
];

// R3 參數探針：[id, SMILES, SMARTS]。get_substruct_matches 不帶 details 時的行為（RDKit.js 預設）必須與 Python 明確設定的參數一致。
const RAW_QUERIES: [string, string, string][] = [
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
  ['R3/params/symmetric-ester-2', 'CC(=O)OC(C)=O', '[CX3](=O)O'],
  ['R3/params/ring-flag', 'C1CCCCC1C', '[CX4;R]'],
  ['R3/params/ring-flag-neg', 'C1CCCCC1C', '[CX4;!R]'],
  ['R3/params/many-matches-500', 'C'.repeat(500), '[#6]'],
  ['R3/params/two-atom-500', 'C'.repeat(500), 'CC'],
  ['R3/params/no-match', 'CCO', 'N'],
  ['R3/params/explicit-H-query', 'CCO', '[CH2]'],
  ['R3/params/dummy-atom', '*CC*', '[#0]'],
  ['R3/params/dummy-in-chain', '[*:1]CC([*:2])c1ccccc1', 'C~C'],
  ['R3/params/first-match-vs-all', 'CCCC', 'CC'],
  ['R3/params/hydroxyl-aromatic', 'Oc1ccc(O)cc1', '[OX2H1;$(O-c)]'],
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

// ---- 觀測 R5：TS 餵給 RDKit.get_mol 的改寫後 JSON，與 get_smiles() 的結果 ----
interface Capture {
  json: { defaults: { atom: Record<string, unknown>; bond: Record<string, unknown> }; molecules: { atoms: Record<string, unknown>[]; bonds: Record<string, unknown>[]; extensions?: unknown }[] };
  built: boolean;
  smiles: string | null;
}

function normalizeCapture(c: Capture) {
  const m = c.json.molecules[0];
  const da = c.json.defaults.atom;
  const db = c.json.defaults.bond;
  return {
    atoms: m.atoms.map((a) => [a.z ?? da.z, a.impHs ?? da.impHs, a.chg ?? da.chg, a.nRad ?? da.nRad, a.isotope ?? da.isotope, a.stereo ?? da.stereo]),
    bonds: m.bonds.map((b) => ({ atoms: b.atoms, bo: b.bo ?? db.bo, stereo: b.stereo ?? db.stereo, stereoAtoms: b.stereoAtoms ?? null })),
    hasExtensions: m.extensions !== undefined,
    built: c.built,
    canonicalSmiles: c.smiles,
  };
}

await withVite(async (server) => {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { computeTg, buildYgFamilies } = await server.ssrLoadModule('/src/core/properties/tgGroupContribution.ts');
  const { YG_GROUPS, firstMatch } = await server.ssrLoadModule('/src/core/data/ygGroups.ts');
  const { YG_CALIBRATED_GROUPS, calibratedAsYgRow } = await server.ssrLoadModule('/src/core/data/ygCalibratedGroups.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const { BOOK_CASES } = await server.ssrLoadModule('/tests/properties/bookCases.ts');
  const RDKit = await getRDKit();

  // 包一層：只攔截「以 JSON 字串建分子」的呼叫並記錄；其他呼叫原樣轉給 RDKit，不改變任何 TS 行為
  // （不能直接改 RDKit 物件的 get_mol：Emscripten 的包裝函式會用方法名稱回頭查同一個物件）
  let captured: Capture[] = [];
  const traced = Object.create(RDKit);
  traced.get_mol = function (input: string, ...rest: unknown[]) {
    const isJson = typeof input === 'string' && input.startsWith('{');
    let res = null;
    let thrown: unknown = null;
    try {
      res = RDKit.get_mol(input, ...rest);
    } catch (e) {
      thrown = e;
    }
    if (isJson) {
      const built = !!res && res.is_valid();
      captured.push({ json: JSON.parse(input), built, smiles: built ? res.get_smiles() : null });
    }
    if (thrown) throw thrown;
    return res;
  };

  const rows: { id: string; smarts: string; table: string; positives: string[]; negatives: string[] }[] = [
    ...YG_GROUPS.map((r: { id: string; smarts: string; positives: string[]; negatives: string[] }) => ({ id: r.id, smarts: r.smarts, table: 'yg_groups', positives: r.positives, negatives: r.negatives })),
    ...YG_CALIBRATED_GROUPS.map((r: { id: string; smarts: string; positives: string[]; negatives: string[] }) => ({ id: r.id, smarts: r.smarts, table: 'yg_calibrated_groups', positives: r.positives, negatives: r.negatives })),
  ];
  const distinctSmarts: string[] = [...new Set(rows.map((r) => r.smarts))];

  const parses = (smiles: string): boolean => {
    let mol = null;
    try {
      mol = RDKit.get_mol(smiles);
      return !!mol && mol.is_valid();
    } catch {
      return false;
    } finally {
      mol?.delete();
    }
  };
  const queryOf = (smarts: string) => {
    let q = null;
    try {
      q = RDKit.get_qmol(smarts);
    } catch {
      q = null;
    }
    if (!q || !q.is_valid()) {
      q?.delete();
      return null;
    }
    return q;
  };
  const rawMatchesOf = (mol: any, q: any): number[][] => {
    const parsed = JSON.parse(mol.get_substruct_matches(q)) as { atoms: number[] }[] | Record<string, never>;
    return Array.isArray(parsed) ? parsed.map((m) => m.atoms) : [];
  };

  // ---- 分子清單（去重，保留第一次出現）；source 標記決定是否另做選項變體 ----
  const molecules: { id: string; smiles: string; variants: boolean; r5: boolean | null }[] = [];
  const seen = new Set<string>();
  const add = (id: string, smiles: string, requireParse: boolean, variants: boolean, r5: boolean | null = null) => {
    if (seen.has(smiles)) return;
    if (requireParse && !parses(smiles)) return;
    seen.add(smiles);
    molecules.push({ id, smiles, variants, r5 });
  };
  for (const [id, smiles, r5] of DEDICATED) add(id, smiles, false, !id.startsWith('R3/long-chain-500') && !id.startsWith('invalid/'), r5 ?? null);
  for (const r of YG_GROUPS) {
    r.positives.forEach((s: string, i: number) => add(`ygGroups/${r.id}/pos${i + 1}`, s, false, false));
    r.negatives.forEach((s: string, i: number) => add(`ygGroups/${r.id}/neg${i + 1}`, s, false, false));
  }
  for (const r of YG_CALIBRATED_GROUPS) {
    r.positives.forEach((s: string, i: number) => add(`ygCalibrated/${r.id}/pos${i + 1}`, s, false, false));
    r.negatives.forEach((s: string, i: number) => add(`ygCalibrated/${r.id}/neg${i + 1}`, s, false, false));
  }
  for (const c of BOOK_CASES) add(`book/${c.name}`, c.smiles, false, true);
  for (const t of BACKBONE_TEMPLATES) add(`BT/${t.id}`, t.unitSmiles, false, true);
  const sourceFiles: [string, RegExp, boolean, boolean][] = [
    ...['tests/properties/tg.test.ts', 'tests/properties/ygCalibrated.test.ts'].map((f) => [f, /'((?:[^'\\\n]|\\.)*)'/g, true, true] as [string, RegExp, boolean, boolean]),
    ...listDir('docs/verification', /^phase6-(Tg-輸出|Tg-混合-輸出|相對Tg-輸出)\.md$/).map((f) => [f, /`([^`\n]+)`/g, false, false] as [string, RegExp, boolean, boolean]),
    ...listDir('scripts/verification', /^(phase6-.*|031-.*)\.ts$/).map((f) => [f, /'((?:[^'\\\n]|\\.)*)'/g, true, false] as [string, RegExp, boolean, boolean]),
  ];
  for (const [file, pattern, unescape, variants] of sourceFiles) {
    const rel = relative(ROOT, resolve(ROOT, file)).replace(/\\/g, '/');
    let n = 0;
    for (const smiles of candidates(resolve(ROOT, file), pattern, unescape)) add(`${rel}#${++n}`, smiles, true, variants);
  }

  const cases: GoldenCase[] = [];
  const variantOptions: [string, { partition?: string; calibrated?: boolean }][] = [
    ['fewest', { partition: 'fewest' }],
    ['fromEnd', { partition: 'fromEnd' }],
    ['bookOnly', { calibrated: false }],
  ];

  /** 呼叫 computeTg；TS 拋出例外時記為 { threw: true }（不吞掉其他錯誤的類型：只接 RDKit.js 的 WebAssembly 例外） */
  const run = (rdkit: unknown, smiles: string, options: object = {}): unknown => {
    try {
      return computeTg(rdkit, smiles, options);
    } catch (e) {
      if (String(e) === '[object WebAssembly.Exception]') return { threw: true };
      throw e;
    }
  };

  // ---- compute 與 r5 ----
  let rebuildCount = 0;
  let r5Cases = 0;
  for (const { id, smiles, variants, r5 } of molecules) {
    captured = [];
    const result = run(traced, smiles);
    const rebuilds = captured.map(normalizeCapture);
    cases.push({ id, input: { kind: 'compute', smiles, options: {} }, output: result });
    if (r5 === true && rebuilds.length === 0) throw new Error(`R5 專屬案例沒有走到改寫重建：${id} ${smiles}`);
    if (r5 === false && rebuilds.length > 0) throw new Error(`R5 對照案例不該走到改寫重建：${id} ${smiles}`);
    if (rebuilds.length > 0 || r5 !== null) {
      cases.push({ id: `R5/rebuild/${id}`, input: { kind: 'r5', smiles }, output: { result, rebuilds } });
      r5Cases++;
      rebuildCount += rebuilds.length;
    }
    if (variants) {
      for (const [name, options] of variantOptions) {
        cases.push({ id: `${id}#${name}`, input: { kind: 'compute', smiles, options }, output: run(RDKit, smiles, options) });
      }
    }
  }

  // ---- rawMatches（R3）：每個可解析的分子 × 全部 SMARTS，RDKit.js 的原始順序 ----
  const queries = distinctSmarts.map((smarts) => ({ smarts, q: queryOf(smarts) }));
  let rawCount = 0;
  try {
    for (const { id, smiles } of molecules) {
      let mol = null;
      try {
        mol = RDKit.get_mol(smiles);
        if (!mol || !mol.is_valid()) continue;
        const out: Record<string, number[][]> = {};
        for (const r of queries) {
          if (!r.q) continue;
          const m = rawMatchesOf(mol, r.q);
          if (m.length > 0) out[r.smarts] = m;
        }
        cases.push({ id: `R3/raw/${id}`, input: { kind: 'rawMatches', smiles }, output: out });
        rawCount++;
      } finally {
        mol?.delete();
      }
    }
  } finally {
    for (const r of queries) r.q?.delete();
  }

  // ---- rawQuery（R3 參數探針） ----
  for (const [id, smiles, smarts] of RAW_QUERIES) {
    const mol = RDKit.get_mol(smiles);
    const q = queryOf(smarts);
    let out: number[][] = [];
    try {
      if (!mol || !mol.is_valid() || !q) throw new Error(`探針案例無法解析：${id}`);
      out = rawMatchesOf(mol, q);
    } finally {
      mol?.delete();
      q?.delete();
    }
    cases.push({ id, input: { kind: 'rawQuery', smiles, smarts }, output: out });
  }

  // ---- smarts（R4）：每一列 SMARTS 的可解析性、正反例的原始配對與第一個命中 ----
  const matchesOn = (smiles: string, q: unknown) => {
    let mol = null;
    try {
      mol = RDKit.get_mol(smiles);
      if (!mol || !mol.is_valid()) return { invalid: true };
      return { raw: rawMatchesOf(mol, q), first: firstMatch(mol, q) };
    } finally {
      mol?.delete();
    }
  };
  for (const r of rows) {
    const q = queryOf(r.smarts);
    const positives: Record<string, unknown> = {};
    const negatives: Record<string, unknown> = {};
    if (q) {
      for (const s of r.positives) positives[s] = matchesOn(s, q);
      for (const s of r.negatives) negatives[s] = matchesOn(s, q);
      q.delete();
    }
    cases.push({
      id: `R4/${r.id}`,
      input: { kind: 'smarts', rowId: r.id, table: r.table, smarts: r.smarts, positives: r.positives, negatives: r.negatives },
      output: { valid: q !== null, positives, negatives },
    });
  }
  for (const [id, smarts] of BAD_SMARTS) {
    const q = queryOf(smarts);
    q?.delete();
    cases.push({ id, input: { kind: 'smarts', rowId: null, table: null, smarts, positives: [], negatives: [] }, output: { valid: q !== null, positives: {}, negatives: {} } });
  }

  // ---- families：buildYgFamilies（切分順序：基團原子數由大到小，同大小依資料表順序） ----
  const describeFamilies = (list: { id: string; name: string; smarts: string; section: string; kind: string; size: number; order: number; rows: { id: string }[] }[]) =>
    list.map((f) => ({ id: f.id, name: f.name, smarts: f.smarts, section: f.section, kind: f.kind, size: f.size, order: f.order, rowIds: f.rows.map((r) => r.id) }));
  const wholeRows = YG_CALIBRATED_GROUPS.filter((r: { kind: string }) => r.kind === '整體基團').map(calibratedAsYgRow);
  cases.push({ id: 'families/book', input: { kind: 'families', withCalibratedWhole: false }, output: describeFamilies(buildYgFamilies(RDKit, YG_GROUPS)) });
  cases.push({ id: 'families/book+calibrated', input: { kind: 'families', withCalibratedWhole: true }, output: describeFamilies(buildYgFamilies(RDKit, [...YG_GROUPS, ...wholeRows])) });

  console.log(`分子 ${molecules.length} 個（專屬案例 ${DEDICATED.length}）；R5 案例 ${r5Cases} 個（改寫重建 ${rebuildCount} 次）；原始配對案例 ${rawCount} 個；SMARTS 案例 ${rows.length + BAD_SMARTS.length} 個`);
  writeGolden('tg', String(RDKit.version()), cases);
});
