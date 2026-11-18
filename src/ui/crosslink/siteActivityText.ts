// 成分詳細彈窗「位點活性」表的固定文字（任務 P7-5，PLAN 7.3、7.3a；D38、D66）。獨立成檔，讓測試不必載入 React 元件。
// 這裡只放文字；所有數值與排序由 Python 引擎（`/crosslink/site-activity`）算出，介面不計算任何化學量。

export const SITE_SECTION_TITLE = '位點活性';

/** 兩個排序分開顯示，不合成單一分數 */
export const SITE_TWO_RANKINGS_NOTE = '電子效應與空間位阻是兩個分開的排序，不合成單一分數；各自只在同一成分、同一官能基類別的位點之間比較（參考趨勢）。';

export const SITE_ELECTRONIC_NOTE =
  '電子效應：依 pKa 估算值（Hammett／Taft，Perrin 1981；水溶液 25 °C，只用於比較相對強弱）。親核位點 pKa 愈高排名愈前；酸性位點（羧酸）pKa 愈低排名愈前。同類位點有缺值時不排序。';

export const SITE_STERIC_NOTE =
  '空間位阻：3D 構型的反應原子相對可及表面積（0 ＝ 完全被遮蔽、1 ＝ 完全暴露），排名 1 ＝ 最暴露。這是幾何描述量，不是文獻公式；參數固定、可重現（MMFF94、固定種子與構型數）。';

export const SITE_POLYMER_NOTE = '聚合物以重複單元片段計算（連接點換成甲基，端基不計）。';

export const SITE_NEEDS_RESULT_TEXT = '交聯分析完成後顯示（需要桌面版與引擎）。';
export const SITE_NO_SITES_TEXT = '第 0 層沒有命中這個成分的反應位點。';
export const SITE_NOT_RANKED_TEXT = '不排序';
export const SITE_NO_PKA_TEXT = '無 pKa 類別';

/** 位點的 pKa 估算旁的「式子與 σ 明細」收合標題 */
export const SITE_DETAIL_SUMMARY = '式子與 σ 明細';
