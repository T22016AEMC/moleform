// 書中計算值對照表（任務 026）：van Krevelen & te Nijenhuis, Properties of Polymers 4th ed. (2009)。測試與驗證輸出腳本共用。
/** 書中對照表：重複單元 SMILES 由書中聚合物名稱整理（Table 6.4 沒有畫結構）；Tg calc 為書中「計算值」欄 */
export const BOOK_CASES = [
  { name: '聚氯乙烯 PVC', smiles: '*CC(Cl)*', book: 354, where: 'Table 6.4，書頁 143' },
  { name: '聚偏二氯乙烯 PVDC', smiles: '*CC(Cl)(Cl)*', book: 254, where: 'Table 6.4，書頁 143' },
  { name: '聚偏二氟乙烯 PVDF', smiles: '*CC(F)(F)*', book: 206, where: 'Table 6.4，書頁 143' },
  { name: '聚甲基丙烯酸甲酯 PMMA', smiles: '*CC(C)(C(=O)OC)*', book: 378, where: 'Table 6.4，書頁 143' },
  { name: '聚丙烯酸甲酯 PMA', smiles: '*CC(C(=O)OC)*', book: 279, where: 'Table 6.4，書頁 143' },
  { name: '聚乙烯醇 PVA', smiles: '*CC(O)*', book: 357, where: 'Table 6.4，書頁 143' },
  { name: '聚乙烯基甲醚', smiles: '*CC(OC)*', book: 252, where: 'Table 6.4，書頁 143' },
  { name: '聚甲醛 POM', smiles: '*CO*', book: 223, where: 'Table 6.4，書頁 143' },
  { name: '聚環氧乙烷 PEO', smiles: '*CCO*', book: 213, where: 'Table 6.4，書頁 143' },
  { name: '尼龍 6,6（聚己二醯己二胺）', smiles: '*NC(=O)CCCCC(=O)NCCCCCC*', book: 323, where: 'Table 6.4，書頁 143' },
  { name: '聚（六亞甲基十二亞甲基二脲）', smiles: '*NC(=O)NCCCCCCNC(=O)NCCCCCCCCCCCC*', book: 319, where: 'Table 6.4，書頁 144' },
  { name: 'PEEK', smiles: '*Oc1ccc(Oc2ccc(C(=O)c3ccc(*)cc3)cc2)cc1', book: 421, where: 'Example 6.3，書頁 145（算式 121.4／288.3）' },
] as const;
