// 任務 030 C 節：用書本身量化「整體基團 vs 較小基團相加」的拆解誤差（拋棄式診斷腳本）。
// 數值全部來自 030-book-values.ts（書中頁面圖像讀取）。差值 = 拆解相加值 − 書中整體基團值；相對誤差 = 差值 ÷ 整體基團值。
// 輸出 docs/verification/030-診斷-C-拆解誤差-輸出.md。執行：node scripts/diagnosis/030-c-decomposition-errors.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VW, VM, YG, YG63, T47 } from './030-book-values.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(root, 'docs', 'verification', '030-診斷-C-拆解誤差-輸出.md');

type Part = [label: string, count: number, value: number];
interface Case {
  prop: string;
  type: string; // 拆解類型
  name: string; // 整體基團
  whole: number;
  page: string;
  parts: Part[];
  rule?: string; // 這個拆法的條件（例如共軛狀態的選擇）
  alt?: { label: string; parts: Part[] }; // 另一種合理拆法（例如 –O– 取另一個括號值）
}
const sum = (p: Part[]) => p.reduce((s, [, n, v]) => s + n * v, 0);
const expr = (p: Part[]) => p.map(([l, n, v]) => `${n > 1 ? `${n}×` : ''}${l} ${v}`).join(' + ');

const cases: Case[] = [];

// ---------- Yg（Table 6.3 組合基團 vs Table 6.1 基團；書頁 141–142 vs 133–134） ----------
// 共軛狀態：依 Table 6.1B 的 n／c／cc 規則（書頁 134 註；書頁 140）選值；alt 為「全部用 n（非共軛）值」。
const y = (type: string, name: string, whole: number, page: string, parts: Part[], allN: Part[], rule: string): void => {
  cases.push({ prop: 'Yg', type, name, whole, page, parts, rule, alt: { label: '全部用非共軛（n）值', parts: allN } });
};
const P = (l: string, n: number, v: number): Part => [l, n, v];
y('Y1 碳橋聯二伸苯', '–C6H4–CH2–C6H4–', YG63.diphenylmethane, '書頁 141', [P('對伸苯基 n', 2, YG.pPh_n), P('–CH2–', 1, YG.CH2)], [P('對伸苯基 n', 2, YG.pPh_n), P('–CH2–', 1, YG.CH2)], '亞甲基不共軛，環取 n');
y('Y1 碳橋聯二伸苯', '–C6H4–C(CH3)2–C6H4–（BPA 型）', YG63.BPA, '書頁 141', [P('對伸苯基 n', 2, YG.pPh_n), P('–C(CH3)2– 受阻', 1, YG.C_CH3_2_hind)], [P('對伸苯基 n', 2, YG.pPh_n), P('–C(CH3)2– 自由', 1, YG.C_CH3_2_free)], '兩側都是芳香環取「受阻」15（書頁 140）；alt 取「自由」8.5');
y('Y1 碳橋聯二伸苯', '–C6H4–C(CH3)(C6H5)–C6H4–', YG63.phenylEthylidene, '書頁 141', [P('對伸苯基 n', 2, YG.pPh_n), P('–C(CH3)(C6H5)–', 1, YG.C_CH3_C6H5)], [P('對伸苯基 n', 2, YG.pPh_n), P('–C(CH3)(C6H5)–', 1, YG.C_CH3_C6H5)], '同上');
y('Y1 碳橋聯二伸苯', '–C6H4–C(C6H5)2–C6H4–（Cardo 的開環類比）', YG63.diphenylmethylene, '書頁 141', [P('對伸苯基 n', 2, YG.pPh_n), P('–C(C6H5)2–', 1, YG.C_C6H5_2)], [P('對伸苯基 n', 2, YG.pPh_n), P('–C(C6H5)2–', 1, YG.C_C6H5_2)], '同上');
y('Y1 碳橋聯二伸苯', '–C6H4–（反式環己烷）–C6H4–', YG63.cyclohexylidene, '書頁 141', [P('對伸苯基 n', 2, YG.pPh_n), P('反式環己烷二基', 1, YG.cyclohexylene_trans)], [P('對伸苯基 n', 2, YG.pPh_n), P('順式環己烷二基（括號）', 1, YG.cyclohexylene_cis)], '取反式 27；alt 取順式（括號值）19');
y('Y1 碳橋聯二伸苯', '–C6H4–C(CH3)2–C6H4–C(CH3)2–C6H4–', YG63.bisIsopropylidene, '書頁 141', [P('對伸苯基 n', 3, YG.pPh_n), P('–C(CH3)2– 受阻', 2, YG.C_CH3_2_hind)], [P('對伸苯基 n', 3, YG.pPh_n), P('–C(CH3)2– 自由', 2, YG.C_CH3_2_free)], '取受阻 15；alt 取自由 8.5');
y('Y2 苯環＋鏈上小基團', '–CH2–C6H4–CH2–', YG63.xylylene, '書頁 141', [P('–CH2–', 2, YG.CH2), P('對伸苯基 n', 1, YG.pPh_n)], [P('–CH2–', 2, YG.CH2), P('對伸苯基 n', 1, YG.pPh_n)], '同上');
y('Y2 苯環＋鏈上小基團', '–O–C6H4–O–', YG63.OC6H4O, '書頁 141', [P('–O–', 2, YG.O), P('對伸苯基 n', 1, YG.pPh_n)], [P('–O–', 2, YG.O), P('對伸苯基 n', 1, YG.pPh_n)], '醚 O 不共軛，環取 n');
y('Y3 苯二甲醯酯／醯胺', '–OOC–C6H4(p)–COO–', YG63.terephthalate, '書頁 141', [P('對伸苯基 cc', 1, YG.pPh_cc), P('–COO– c', 2, YG.COO_c)], [P('對伸苯基 n', 1, YG.pPh_n), P('–COO– n', 2, YG.COO_n)], '環兩側都接 –COO–（cc）；每個 –COO– 一側接環（c）');
y('Y3 苯二甲醯酯／醯胺', '–OOC–C6H4(m)–COO–', YG63.isophthalate, '書頁 141', [P('間伸苯基 cc', 1, YG.mPh_cc), P('–COO– c', 2, YG.COO_c)], [P('間伸苯基 n', 1, YG.mPh_n), P('–COO– n', 2, YG.COO_n)], '同上');
y('Y3 苯二甲醯酯／醯胺', '–NHCO–C6H4(p)–CONH–', YG63.terephthalamide, '書頁 141', [P('對伸苯基 cc', 1, YG.pPh_cc), P('–CONH– c', 2, YG.CONH_c)], [P('對伸苯基 n', 1, YG.pPh_n), P('–CONH– n', 2, YG.CONH_n)], '同上');
y('Y3 苯二甲醯酯／醯胺', '–NHCO–C6H4(m)–CONH–', YG63.isophthalamide, '書頁 141', [P('間伸苯基 cc', 1, YG.mPh_cc), P('–CONH– c', 2, YG.CONH_c)], [P('間伸苯基 n', 1, YG.mPh_n), P('–CONH– n', 2, YG.CONH_n)], '同上');
y('Y4 二芳基直接或共軛連接', '–C6H4–C6H4–（聯伸苯）', YG63.biphenylene, '書頁 142', [P('對伸苯基 c', 2, YG.pPh_c)], [P('對伸苯基 n', 2, YG.pPh_n)], '兩環互為共軛，各一側共軛（c）');
y('Y4 二芳基直接或共軛連接', '–C6H4–C(=O)–C6H4–', YG63.benzophenone, '書頁 142', [P('對伸苯基 c', 2, YG.pPh_c), P('–C(=O)– cc', 1, YG.CO_cc)], [P('對伸苯基 n', 2, YG.pPh_n), P('–C(=O)– n', 1, YG.CO_n)], '羰基兩側接環（cc）、環各一側共軛（c）');
y('Y4 二芳基直接或共軛連接', '–C6H4–SO2–C6H4–', YG63.diphenylsulfone, '書頁 142', [P('對伸苯基 c', 2, YG.pPh_c), P('–SO2– cc', 1, YG.SO2_cc)], [P('對伸苯基 n', 2, YG.pPh_n), P('–SO2– n', 1, YG.SO2_n)], '同上');
y('Y5 醚／硫醚橋聯', '–C6H4–O–C6H4–', YG63.diphenylether, '書頁 142', [P('對伸苯基 n', 2, YG.pPh_n), P('–O–', 1, YG.O)], [P('對伸苯基 n', 2, YG.pPh_n), P('–O–', 1, YG.O)], '醚 O 不共軛');
y('Y5 醚／硫醚橋聯', '–C6H4–O–C6H4–O–C6H4–', YG63.triphenyldiether, '書頁 142', [P('對伸苯基 n', 3, YG.pPh_n), P('–O–', 2, YG.O)], [P('對伸苯基 n', 3, YG.pPh_n), P('–O–', 2, YG.O)], '同上');
y('Y5 醚／硫醚橋聯', '–C6H4–S–C6H4–', YG63.diphenylsulfide, '書頁 142', [P('對伸苯基 n', 2, YG.pPh_n), P('–S–', 1, YG.S)], [P('對伸苯基 n', 2, YG.pPh_n), P('–S–', 1, YG.S)], '硫醚不共軛');
y('Y6 剛性芳酯／芳醯胺（書中括號值）', '–O–C6H4(p)–C(=O)–（括號）', YG63.pOC6H4CO, '書頁 141', [P('對伸苯基 c', 1, YG.pPh_c), P('–O–', 1, YG.O), P('–C(=O)– c', 1, YG.CO_c)], [P('對伸苯基 n', 1, YG.pPh_n), P('–O–', 1, YG.O), P('–C(=O)– n', 1, YG.CO_n)], '環與羰基互為共軛（各 c）');
y('Y6 剛性芳酯／芳醯胺（書中括號值）', '–O–C6H4(m)–C(=O)–（括號）', YG63.mOC6H4CO, '書頁 142', [P('間伸苯基 c', 1, YG.mPh_c), P('–O–', 1, YG.O), P('–C(=O)– c', 1, YG.CO_c)], [P('間伸苯基 n', 1, YG.mPh_n), P('–O–', 1, YG.O), P('–C(=O)– n', 1, YG.CO_n)], '同上');
y('Y6 剛性芳酯／芳醯胺（書中括號值）', '–NH–C6H4(p)–C(=O)–（括號）', YG63.pNHC6H4CO, '書頁 142', [P('對伸苯基 cc', 1, YG.pPh_cc), P('–CONH– cc', 1, YG.CONH_cc)], [P('對伸苯基 n', 1, YG.pPh_n), P('–CONH– n', 1, YG.CONH_n)], '單元內一個醯胺，兩側接環（cc）');
y('Y6 剛性芳酯／芳醯胺（書中括號值）', '–NH–C6H4(p)–NH–CO–C6H4(p)–CO–', YG63.aramidP, '書頁 142', [P('對伸苯基 cc', 2, YG.pPh_cc), P('–CONH– cc', 2, YG.CONH_cc)], [P('對伸苯基 n', 2, YG.pPh_n), P('–CONH– n', 2, YG.CONH_n)], '兩環、兩個醯胺都在共軛鏈中（cc）');
y('Y6 剛性芳酯／芳醯胺（書中括號值）', '–NH–C6H4(m)–NH–CO–C6H4(m)–CO–', YG63.aramidM, '書頁 142', [P('間伸苯基 cc', 2, YG.mPh_cc), P('–CONH– cc', 2, YG.CONH_cc)], [P('間伸苯基 n', 2, YG.mPh_n), P('–CONH– n', 2, YG.CONH_n)], '同上');
// Table 6.1 內部：整個基團 vs 較小基團（書頁 133–134）
const y2 = (name: string, whole: number, parts: Part[], rule: string) => cases.push({ prop: 'Yg', type: 'Y7 小基團組合（Table 6.1 內部）', name, whole, page: '書頁 133–134', parts, rule, alt: { label: '（同左）', parts } });
y2('–O–C(=O)–O–（碳酸酯）', YG.carbonate, [P('–O–', 2, YG.O), P('–C(=O)– n', 1, YG.CO_n)], '2 個醚 O + 非共軛羰基');
y2('–O–C(=O)–NH–（胺基甲酸酯）', YG.urethane, [P('–O–', 1, YG.O), P('–C(=O)NH– n', 1, YG.CONH_n)], '醚 O + 非共軛醯胺');
y2('–NH–C(=O)–NH–（脲，含括號值 –NH–）', YG.urea, [P('–NH–（括號）', 2, YG.NH), P('–C(=O)– n', 1, YG.CO_n)], '2 個 –NH–（書中括號）+ 非共軛羰基');
y2('–C(=O)–O–C(=O)–（酸酐）', YG.anhydride, [P('–C(=O)– n', 2, YG.CO_n), P('–O–', 1, YG.O)], '2 個羰基 + 醚 O');

// ---------- VW（Table 4.2 整體基團 vs 同表原子基團；書頁 74–75） ----------
const v = (type: string, name: string, whole: number, parts: Part[], rule?: string, alt?: { label: string; parts: Part[] }) =>
  cases.push({ prop: 'VW', type, name, whole, page: '書頁 74–75', parts, rule, alt });
const vc = VW;
const swapO = (p: Part[]): Part[] => p.map(([l, n, val]) => (l.startsWith('–O–') ? [l.replace('5.5', '5.0'), n, vc.O_b] : [l, n, val]) as Part);
v('V1 CH／C＋取代基', '–CH(CH3)–', vc.CHCH3, [P('>CH–', 1, vc.CH), P('–CH3', 1, vc.CH3)]);
v('V1 CH／C＋取代基', '–CH(iso-C3H7)–', vc.CH_iC3H7, [P('>CH–', 1, vc.CH), P('–CH(CH3)2', 1, vc.CHCH3_2)]);
v('V1 CH／C＋取代基', '–CH(ter-C4H9)–', vc.CH_tC4H9, [P('>CH–', 1, vc.CH), P('–C(CH3)3', 1, vc.CCH3_3)]);
v('V1 CH／C＋取代基', '–CH(C6H5)–', vc.CH_C6H5, [P('>CH–', 1, vc.CH), P('C6H5–', 1, vc.phenyl)]);
v('V1 CH／C＋取代基', '–CH(C6H4–CH3)–', vc.CH_C6H4CH3, [P('>CH–', 1, vc.CH), P('–C6H4–', 1, vc.phenylene), P('–CH3', 1, vc.CH3)]);
v('V1 CH／C＋取代基', '–CH(OH)–', vc.CH_OH, [P('>CH–', 1, vc.CH), P('–OH', 1, vc.OH)]);
v('V1 CH／C＋取代基', '–CH(CN)–', vc.CH_CN, [P('>CH–', 1, vc.CH), P('–C≡N', 1, vc.CN)]);
v('V1 CH／C＋取代基', '–CHF–', vc.CHF, [P('>CH–', 1, vc.CH), P('–F', 1, vc.F)]);
v('V1 CH／C＋取代基', '–C(CH3)2–', vc.C_CH3_2, [P('>C<', 1, vc.C), P('–CH3', 2, vc.CH3)]);
v('V1 CH／C＋取代基', '–C(CH3)(C6H5)–', vc.C_CH3_C6H5, [P('>C<', 1, vc.C), P('–CH3', 1, vc.CH3), P('C6H5–', 1, vc.phenyl)]);
v('V1 CH／C＋取代基', '–CH(CH3)2', vc.CHCH3_2, [P('>CH–', 1, vc.CH), P('–CH3', 2, vc.CH3)]);
v('V1 CH／C＋取代基', '–C(CH3)3', vc.CCH3_3, [P('>C<', 1, vc.C), P('–CH3', 3, vc.CH3)]);
v('V1 CH／C＋取代基', '–C≡CH', vc.ethynyl, [P('–C≡C–', 1, vc.ethynylene), P('–H', 1, vc.H)]);
v('V2 鹵素取代', '–CHCl–', vc.CHCl, [P('>CH–', 1, vc.CH), P('–Cl al.', 1, vc.ClAl)]);
v('V2 鹵素取代', '–CF2–', vc.CF2, [P('>C<', 1, vc.C), P('–F', 2, vc.F)]);
v('V2 鹵素取代', '–CCl2–', vc.CCl2, [P('>C<', 1, vc.C), P('–Cl al.', 2, vc.ClAl)]);
v('V2 鹵素取代', '–CH2Cl', vc.CH2Cl, [P('–CH2–', 1, vc.CH2), P('–Cl al.', 1, vc.ClAl)]);
v('V2 鹵素取代', '–CHCl2', vc.CHCl2, [P('>CH–', 1, vc.CH), P('–Cl al.', 2, vc.ClAl)]);
v('V2 鹵素取代', '–CCl3', vc.CCl3, [P('>C<', 1, vc.C), P('–Cl al.', 3, vc.ClAl)]);
v('V2 鹵素取代', '–CF3', vc.CF3, [P('>C<', 1, vc.C), P('–F', 3, vc.F)]);
v('V3 單環芳香原子分解', '–C6H4–（伸苯基）', vc.phenylene, [P('CHar', 4, vc.CHar), P('Car(exo)', 2, vc.CarExo)]);
v('V3 單環芳香原子分解', 'C6H5–（苯基）', vc.phenyl, [P('CHar', 5, vc.CHar), P('Car(exo)', 1, vc.CarExo)]);
v('V3 單環芳香原子分解', '二甲基伸苯基（環上 2 CH3 + 2 連接點）', vc.dimethylphenylene, [P('CHar', 2, vc.CHar), P('Car(exo)', 4, vc.CarExo), P('–CH3', 2, vc.CH3)]);
v('V3 單環芳香原子分解', '二苯基伸苯基（環上 2 C6H5 + 2 連接點）', vc.diphenylphenylene, [P('CHar', 2, vc.CHar), P('Car(exo)', 4, vc.CarExo), P('C6H5–', 2, vc.phenyl)]);
v('V3 單環芳香原子分解', '吡啶基', vc.pyridyl, [P('CHar', 4, vc.CHar), P('Car(exo)', 1, vc.CarExo), P('Nar', 1, vc.NarPyrid)]);
v('V4 稠環', '萘基（1- 或 2-）', vc.naphthyl, [P('CHar', 7, vc.CHar), P('Car(endo)', 2, vc.CarEndo), P('Car(exo)', 1, vc.CarExo)]);
v('V4 稠環', '萘二基（雙價）', vc.naphthylene, [P('CHar', 6, vc.CHar), P('Car(endo)', 2, vc.CarEndo), P('Car(exo)', 2, vc.CarExo)]);
v('V4 稠環', '均苯四甲醯亞胺（雙價，含 –N<）', vc.pyromellitimide, [P('CHar', 2, vc.CHar), P('Car(exo)', 4, vc.CarExo), P('–N<', 2, vc.Nt), P('–C(=O)– ar.', 4, vc.COar)]);
v('V4 稠環', 'N-咔唑基（四個稠合碳取 endo）', vc.carbazolyl, [P('CHar', 8, vc.CHar), P('Car(endo)', 4, vc.CarEndo), P('–N<', 1, vc.Nt)], '稠合碳歸 endo', { label: '稠合碳歸 exo', parts: [P('CHar', 8, vc.CHar), P('Car(exo)', 4, vc.CarExo), P('–N<', 1, vc.Nt)] });
v('V5 環烷（環上 CH2 取鏈上值）', '環己烷二基', vc.cyclohexylene, [P('–CH2–', 4, vc.CH2), P('>CH–', 2, vc.CH)]);
v('V5 環烷（環上 CH2 取鏈上值）', 'C6H11–（環己基）', vc.cyclohexyl, [P('–CH2–', 5, vc.CH2), P('>CH–', 1, vc.CH)]);
v('V5 環烷（環上 CH2 取鏈上值）', 'C5H9–（環戊基）', vc.cyclopentyl, [P('–CH2–', 4, vc.CH2), P('>CH–', 1, vc.CH)]);
const oCase = (type: string, name: string, whole: number, parts: Part[], page = '書頁 74–75') => {
  cases.push({ prop: 'VW', type, name, whole, page, parts, rule: '–O– 取第一個括號值 5.5', alt: { label: '–O– 取第二個括號值 5.0', parts: parts.map(([l, n, val]) => (l.startsWith('–O–') ? ([l.replace('5.5', '5.0'), n, vc.O_b] as Part) : ([l, n, val] as Part))) } });
};
oCase('V6 酯／醯胺／碳酸酯組合', '–COO–', vc.COO, [P('–C(=O)– al.', 1, vc.COal), P('–O– 5.5', 1, vc.O_a)]);
oCase('V6 酯／醯胺／碳酸酯組合', '–OCOO–', vc.OCOO, [P('–C(=O)– al.', 1, vc.COal), P('–O– 5.5', 2, vc.O_a)]);
oCase('V6 酯／醯胺／碳酸酯組合', '–CONH–（括號）', vc.CONH, [P('–C(=O)– al.', 1, vc.COal), P('–NH–（括號）', 1, vc.NH)]);
oCase('V6 酯／醯胺／碳酸酯組合', '–OCONH–（括號）', vc.OCONH, [P('–O– 5.5', 1, vc.O_a), P('–C(=O)– al.', 1, vc.COal), P('–NH–（括號）', 1, vc.NH)]);
oCase('V6 酯／醯胺／碳酸酯組合', '–NHCONH–（括號）', vc.NHCONH, [P('–NH–（括號）', 2, vc.NH), P('–C(=O)– al.', 1, vc.COal)]);
oCase('V6 酯／醯胺／碳酸酯組合', '–CH(OCH3)–', vc.CH_OCH3, [P('>CH–', 1, vc.CH), P('–O– 5.5', 1, vc.O_a), P('–CH3', 1, vc.CH3)]);
oCase('V6 酯／醯胺／碳酸酯組合', '–CH(OCOCH3)–（M18）', vc.CH_OCOCH3, [P('>CH–', 1, vc.CH), P('–O– 5.5', 1, vc.O_a), P('–C(=O)– al.', 1, vc.COal), P('–CH3', 1, vc.CH3)]);
oCase('V6 酯／醯胺／碳酸酯組合', '–CH(COOCH3)–（M18）', vc.CH_COOCH3, [P('>CH–', 1, vc.CH), P('–C(=O)– al.', 1, vc.COal), P('–O– 5.5', 1, vc.O_a), P('–CH3', 1, vc.CH3)]);
oCase('V6 酯／醯胺／碳酸酯組合', '–C(CH3)(COOCH3)–（M18）', vc.C_CH3_COOCH3, [P('>C<', 1, vc.C), P('–CH3', 2, vc.CH3), P('–C(=O)– al.', 1, vc.COal), P('–O– 5.5', 1, vc.O_a)]);
v('V7 其他', '–S–S–', vc.SS, [P('–S–', 2, vc.S)]);
v('V7 其他', '–Si(CH3)2–', vc.SiCH3_2, [P('–Si<', 1, vc.Si), P('–CH3', 2, vc.CH3)]);
v('V7 其他', '–C≡C–（含括號值）', vc.ethynylene, [P('–C≡（括號）', 2, vc.ethynylC)]);

// ---------- 莫耳體積 Va／Vc（Table 4.10 整體基團 vs 較小基團；書頁 88） ----------
// 規則：CH3 取 –CH2– 的值、>CH– 取 –CH2– 的值、>C< 取 –CH2– 的值（Table 4.10 沒有 CH3、>CH–、>C< 單獨的值，這是診斷用的近似）
const m = (type: string, name: string, key: string, parts: (idx: 0 | 1) => Part[], rule: string, altParts?: (idx: 0 | 1) => Part[], altLabel?: string) => {
  for (const idx of [0, 1] as const) {
    cases.push({
      prop: idx === 0 ? 'Va' : 'Vc',
      type,
      name,
      whole: VM[key][idx],
      page: '書頁 88',
      parts: parts(idx),
      rule,
      alt: altParts ? { label: altLabel ?? '另一種取法', parts: altParts(idx) } : undefined,
    });
  }
};
const mp = (label: string, n: number, key: string) => (i: 0 | 1): Part => [label, n, VM[key][i]];
const L = (...ps: ((i: 0 | 1) => Part)[]) => (i: 0 | 1): Part[] => ps.map((f) => f(i));
m('M1 CH3／>CH–／>C< 當作 –CH2–', '–CH(CH3)–', 'CH_CH3', L(mp('–CH2–', 2, 'CH2')), '>CH– 與 CH3 各取 –CH2–');
m('M1 CH3／>CH–／>C< 當作 –CH2–', '–CH(i-C3H7)–', 'CH_iC3H7', L(mp('–CH2–', 4, 'CH2')), '4 個碳各取 –CH2–');
m('M1 CH3／>CH–／>C< 當作 –CH2–', '–CH(t-C4H9)–', 'CH_tC4H9', L(mp('–CH2–', 5, 'CH2')), '5 個碳各取 –CH2–');
m('M1 CH3／>CH–／>C< 當作 –CH2–', '–C(CH3)2–', 'C_CH3_2', L(mp('–CH2–', 3, 'CH2')), '3 個碳各取 –CH2–');
m('M1 CH3／>CH–／>C< 當作 –CH2–', '–C(CH3)(C6H5)–', 'C_CH3_C6H5', L(mp('–CH(C6H5)–', 1, 'CH_C6H5'), mp('–CH2–（CH3）', 1, 'CH2')), '–CH(C6H5)– + CH3 取 –CH2–');
m('M1 CH3／>CH–／>C< 當作 –CH2–', '–CH(p-C6H4CH3)–', 'CH_C6H4CH3', L(mp('–CH(C6H5)–', 1, 'CH_C6H5'), mp('–CH2–（CH3）', 1, 'CH2')), '–CH(C6H5)– + CH3 取 –CH2–（苯基換成甲苯基）');
m('M1 CH3／>CH–／>C< 當作 –CH2–', '–C(CH3)(COOCH3)–', 'C_CH3_COOCH3', L(mp('–CH(COOCH3)–', 1, 'CH_COOCH3'), mp('–CH2–（CH3）', 1, 'CH2')), '–CH(COOCH3)– + CH3 取 –CH2–');
m('M2 酯／醚／醯胺組合', '–COO–（general）', 'COO_general', L(mp('–CO– al', 1, 'COal'), mp('–O– al（括號）', 1, 'O_al')), '羰基 al + 醚 O al', L(mp('–CO– ar', 1, 'COar'), mp('–O– ar（括號）', 1, 'O_ar')), '羰基 ar + 醚 O ar');
m('M2 酯／醚／醯胺組合', '–OCOO–', 'OCOO', L(mp('–CO– al', 1, 'COal'), mp('–O– al（括號）', 2, 'O_al')), '羰基 al + 2 個醚 O al', L(mp('–CO– ar', 1, 'COar'), mp('–O– ar（括號）', 2, 'O_ar')), '羰基 ar + 2 個醚 O ar');
m('M2 酯／醚／醯胺組合', '–CONH–（括號）', 'CONH', L(mp('–CO– al', 1, 'COal'), mp('–NH–（括號）', 1, 'NH')), '羰基 al + –NH–', L(mp('–CO– ar', 1, 'COar'), mp('–NH–（括號）', 1, 'NH')), '羰基 ar + –NH–');
m('M2 酯／醚／醯胺組合', '–OCONH–（括號）', 'OCONH', L(mp('–O– al（括號）', 1, 'O_al'), mp('–CO– al', 1, 'COal'), mp('–NH–（括號）', 1, 'NH')), '醚 O al + 羰基 al + –NH–', L(mp('–O– ar（括號）', 1, 'O_ar'), mp('–CO– ar', 1, 'COar'), mp('–NH–（括號）', 1, 'NH')), '全部取 ar');
m('M2 酯／醚／醯胺組合', '–NHCONH–（括號）', 'NHCONH', L(mp('–NH–（括號）', 2, 'NH'), mp('–CO– al', 1, 'COal')), '2 個 –NH– + 羰基 al', L(mp('–NH–（括號）', 2, 'NH'), mp('–CO– ar', 1, 'COar')), '羰基取 ar');
m('M2 酯／醚／醯胺組合', '–S–S–', 'SS', L(mp('–S–', 2, 'S')), '2 個 –S–');
m('M2 酯／醚／醯胺組合', '–CH(OCH3)–', 'CH_OCH3', L(mp('–CH2–（CH）', 1, 'CH2'), mp('–O– al（括號）', 1, 'O_al'), mp('–CH2–（CH3）', 1, 'CH2')), 'CH 與 CH3 取 –CH2–，醚 O al', L(mp('–CH2–（CH）', 1, 'CH2'), mp('–O– ar（括號）', 1, 'O_ar'), mp('–CH2–（CH3）', 1, 'CH2')), '醚 O 取 ar');
m('M2 酯／醚／醯胺組合', '–CH(COOCH3)–', 'CH_COOCH3', L(mp('–CH2–（CH）', 1, 'CH2'), mp('–COO– general', 1, 'COO_general'), mp('–CH2–（CH3）', 1, 'CH2')), 'CH、CH3 取 –CH2–，酯取 general', L(mp('–CH2–（CH）', 1, 'CH2'), mp('–COO– acrylics', 1, 'COO_acrylics'), mp('–CH2–（CH3）', 1, 'CH2')), '酯取 acrylics');
m('M2 酯／醚／醯胺組合', '–CH(OCOCH3)–', 'CH_OCOCH3', L(mp('–CH2–（CH）', 1, 'CH2'), mp('–COO– general', 1, 'COO_general'), mp('–CH2–（CH3）', 1, 'CH2')), 'CH、CH3 取 –CH2–，酯取 general', L(mp('–CH2–（CH）', 1, 'CH2'), mp('–COO– acrylics', 1, 'COO_acrylics'), mp('–CH2–（CH3）', 1, 'CH2')), '酯取 acrylics');
m('M3 取代的環（甲基化伸苯基、環己基）', '二甲基伸苯基（環上 2 CH3）', 'dimethylPhenylene', L(mp('對伸苯基', 1, 'pPhenylene'), mp('–CH2–（CH3）', 2, 'CH2')), '對伸苯基 + 2 個 CH3 取 –CH2–', L(mp('間伸苯基', 1, 'mPhenylene'), mp('–CH2–（CH3）', 2, 'CH2')), '改用間伸苯基');
m('M3 取代的環（甲基化伸苯基、環己基）', '–CH(環己基)–（環己基＝單取代環）', 'CH_C6H11', L(mp('–CH2–（CH）', 1, 'CH2'), mp('環己基', 1, 'cyclohexyl')), 'CH 取 –CH2– + Table 4.10 環己基列');
m('M5 環 vs 鏈（環碳取 –CH2– 值）', '單取代環己基（C6H11，6 個碳）', 'cyclohexyl', L(mp('–CH2–', 6, 'CH2')), '6 個環碳各取鏈上 –CH2–');
m('M4 位置異構', '間伸苯基 vs 對伸苯基（同為 C6H4）', 'mPhenylene', L(mp('對伸苯基', 1, 'pPhenylene')), '同一組原子，只有連接位置不同');

// ---------- 統計 ----------
const rows = cases.map((c) => {
  const s = sum(c.parts);
  const sa = c.alt ? sum(c.alt.parts) : null;
  return { c, s, d: s - c.whole, rel: ((s - c.whole) / c.whole) * 100, sa, da: sa === null ? null : sa - c.whole };
});
const fx = (x: number | null, d = 2) => (x === null ? '—' : x.toFixed(d));
const sg = (x: number | null, d = 2) => (x === null ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(d)}`);
const stats = (xs: number[]) => {
  const n = xs.length;
  if (!n) return { n: 0, mean: NaN, mabs: NaN, max: NaN, min: NaN };
  return { n, mean: xs.reduce((a, b) => a + b, 0) / n, mabs: xs.reduce((a, b) => a + Math.abs(b), 0) / n, max: Math.max(...xs), min: Math.min(...xs) };
};

const lines: string[] = [];
const out = (t = '') => lines.push(t);
const cell = (t: string) => t.replace(/\|/g, '\\|');

out('# 任務 030 C：用書本身量化拆解誤差（輸出）');
out();
out('由 `scripts/diagnosis/030-c-decomposition-errors.ts` 產生。數值全部來自 `scripts/diagnosis/030-book-values.ts`（書中頁面圖像讀取，書頁附於各案例）。**差值 = 拆解相加值 − 書中整體基團值**；相對誤差 = 差值 ÷ 整體基團值。單位：Yg 為 K·kg/mol，VW、Va、Vc 為 cm³/mol。');
out('「備用」欄是另一種同樣合理的取法（Yg：全部用非共軛值；VW：–O– 取 5.0；Va／Vc：羰基與醚 O 取 ar 列等），用來看「選哪個值」本身造成的差。括號值（書中標為暫定）的案例標在名稱旁。');
out();

const propTitle: Record<string, string> = { Yg: 'Yg（Table 6.3 組合基團 vs Table 6.1 基團）', VW: 'VW（Table 4.2 整體基團 vs 同表原子基團）', Va: 'Va（Table 4.10，非晶態）', Vc: 'Vc（Table 4.10，結晶態）' };
const typeSummary: { prop: string; type: string; n: number; min: number; max: number; mean: number; mabs: number; relMin: number; relMax: number }[] = [];
for (const prop of ['Yg', 'VW', 'Va', 'Vc']) {
  const rs = rows.filter((r) => r.c.prop === prop);
  const unit = prop === 'Yg' ? 'K·kg/mol' : 'cm³/mol';
  out(`## ${propTitle[prop]}　共 ${rs.length} 個案例`);
  out();
  out(`| # | 拆解類型 | 整體基團（${'書中值'}） | 書頁 | 拆解（${unit}） | 相加值 | 差值 | 相對誤差 | 備用取法的相加值 | 備用的差值 | 條件 |`);
  out('|---|---|---|---|---|---|---|---|---|---|---|');
  rs.forEach((r, i) => {
    out(`| ${i + 1} | ${cell(r.c.type)} | ${cell(r.c.name)} = ${r.c.whole} | ${r.c.page} | ${cell(expr(r.c.parts))} | ${fx(r.s)} | ${sg(r.d)} | ${sg(r.rel, 1)}% | ${r.sa === null ? '—' : `${fx(r.sa)}（${cell(r.c.alt!.label)}）`} | ${sg(r.da)} | ${cell(r.c.rule ?? '')} |`);
  });
  out();
  const all = stats(rs.map((r) => r.d));
  const rel = stats(rs.map((r) => r.rel));
  out(`**總計（主要取法）**：n = ${all.n}；平均差 ${sg(all.mean)}；平均絕對差 ${fx(all.mabs)}；最大差 ${sg(all.max)}、最小差 ${sg(all.min)}；相對誤差平均 ${sg(rel.mean, 1)}%、平均絕對 ${fx(rel.mabs, 1)}%、範圍 ${sg(rel.min, 1)}% 至 ${sg(rel.max, 1)}%。`);
  const altAll = stats(rs.filter((r) => r.da !== null).map((r) => r.da as number));
  out(`**備用取法**：n = ${altAll.n}；平均差 ${sg(altAll.mean)}；平均絕對差 ${fx(altAll.mabs)}；範圍 ${sg(altAll.min)} 至 ${sg(altAll.max)}。`);
  out();
  out('依拆解類型：');
  out();
  out('| 拆解類型 | n | 平均差 | 平均絕對差 | 最小差 | 最大差 | 相對誤差範圍 |');
  out('|---|---|---|---|---|---|---|');
  const types = [...new Set(rs.map((r) => r.c.type))];
  for (const t of types) {
    const rt = rs.filter((r) => r.c.type === t);
    const s = stats(rt.map((r) => r.d));
    const sr = stats(rt.map((r) => r.rel));
    typeSummary.push({ prop, type: t, n: s.n, min: s.min, max: s.max, mean: s.mean, mabs: s.mabs, relMin: sr.min, relMax: sr.max });
    out(`| ${cell(t)} | ${s.n} | ${sg(s.mean)} | ${fx(s.mabs)} | ${sg(s.min)} | ${sg(s.max)} | ${sg(sr.min, 1)}% 至 ${sg(sr.max, 1)}% |`);
  }
  out();
}

// Table 4.7 的 Vr/Vw 比值（Va ≈ 1.60 × VW 的依據）：只用書中 Table 4.7 的欄位，不重算
out('## 補充：以 VW 代替 Va 的誤差（書中式 4.8a：Va(298) = 1.60 × VW）');
out();
out('書頁 83：Table 4.7 的 Vr／VW 平均 1.60 ± 0.05（書印）；各聚合物的 Vr／VW 範圍由頁面圖像讀取為 1.50（聚甲基丙烯酸 1-鄰氯苯乙酯）至 1.67（聚丙烯酸第三丁酯）。用平均值 1.60 預測單一聚合物的 Va，相對誤差範圍 = 1.60 ÷ 比值 − 1：');
out();
const ratioMin = 1.5;
const ratioMax = 1.67;
out(`- 比值 ${ratioMax}（最大）：預測 Va 偏低 ${((1.6 / ratioMax - 1) * 100).toFixed(1)}%`);
out(`- 比值 ${ratioMin}（最小）：預測 Va 偏高 +${((1.6 / ratioMin - 1) * 100).toFixed(1)}%`);
out(`- 書印標準差 0.05：±${((0.05 / 1.6) * 100).toFixed(1)}%（1σ）`);
out('結晶態同理：Vc／VW = 1.435 ± 0.045（書頁 83，式 4.8c），±3.1%（1σ）。');
out();

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
console.log(`已寫入 ${OUTPUT}`);
console.log(JSON.stringify(typeSummary.map((t) => ({ ...t, min: +t.min.toFixed(2), max: +t.max.toFixed(2), mean: +t.mean.toFixed(2), mabs: +t.mabs.toFixed(2), relMin: +t.relMin.toFixed(1), relMax: +t.relMax.toFixed(1) })), null, 0));
// T47 目前在 D 節使用；這裡引用避免未使用警告
void T47;
