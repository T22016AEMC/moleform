// 自由體積算法_使用者表.xlsx 第 5–37 列的原始內容（工作表「自由體積算法」；由 xlsx 以 Node 讀出，數值為儲存格的快取值）。
// 任務 036a：回歸測試與輸出文件用；這些數字是使用者的，不得修改。arH（芳香族 H）欄使用者已刪除（2026-11-06），這裡只為對照 xlsx 的 W 保留，程式不使用。
// 儲存格位置：列號 = xlsx 列；欄 C→arC、D→arH、E–H→鏈 C／CH／CH2／CH3、I–K→環 C／CH／CH2、L→醚 O、M→環氧基 O、N→酮、O→醛、P→酯基、Q–S→一二三級醇 OH、T→酚 OH、U→脂肪族 F、V→芳香族 F；W = Vω（xlsx 快取值，含芳香族 H 欄）、X = Vf（xlsx 快取值）。
export interface XlsxRow {
  row: number;
  name: string | null;
  counts: { arC: number; arH: number; chC: number; chCH: number; chCH2: number; chCH3: number; rC: number; rCH: number; rCH2: number; ether: number; epoxy: number; ketone: number; aldehyde: number; ester: number; oh1: number; oh2: number; oh3: number; phenol: number; fAl: number; fAr: number };
  /** xlsx 的 W 欄（Vω，含芳香族 H） */
  w: number;
  /** xlsx 的 X 欄（Vf） */
  x: number;
}

export const XLSX_VALUES = { arC: 8.11, arH: 3.17, chC: 3.33, chCH: 6.78, chCH2: 10.23, chCH3: 13.67, rC: 3.8, rCH: 5.6, rCH2: 8.45, ether: 3.7, epoxy: 1.9, ketone: 10.8, aldehyde: 11.5, ester: 23, oh1: 10, oh2: 11, oh3: 12, phenol: 11.5, fAl: 18, fAr: 11 } as const;

export const XLSX_ROWS: readonly XlsxRow[] = [
  { row: 5, name: "雙苯芴", counts: { arC: 24, arH: 14, chC: 1, chCH: 0, chCH2: 0, chCH3: 0, rC: 0, rCH: 0, rCH2: 0, ether: 0, epoxy: 0, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 242.35, x: 89.6695 },
  { row: 6, name: "單萘單苯芴", counts: { arC: 28, arH: 16, chC: 1, chCH: 0, chCH2: 0, chCH3: 0, rC: 0, rCH: 0, rCH2: 0, ether: 0, epoxy: 0, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 281.13, x: 104.0181 },
  { row: 7, name: "萘基", counts: { arC: 10, arH: 7, chC: 0, chCH: 0, chCH2: 0, chCH3: 0, rC: 0, rCH: 0, rCH2: 0, ether: 0, epoxy: 0, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 103.29, x: 38.2173 },
  { row: 8, name: "聯降冰片烷基", counts: { arC: 0, arH: 0, chC: 0, chCH: 7, chCH2: 7, chCH3: 0, rC: 0, rCH: 0, rCH2: 0, ether: 0, epoxy: 0, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 119.07, x: 95.256 },
  { row: 9, name: "金剛烷", counts: { arC: 0, arH: 0, chC: 1, chCH: 3, chCH2: 6, chCH3: 0, rC: 0, rCH: 0, rCH2: 0, ether: 0, epoxy: 0, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 85.05, x: 68.04 },
  { row: 10, name: "SBI", counts: { arC: 12, arH: 4, chC: 4, chCH: 0, chCH2: 2, chCH3: 4, rC: 0, rCH: 0, rCH2: 0, ether: 0, epoxy: 0, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 198.46, x: 138.922 },
  { row: 11, name: "二苯醚", counts: { arC: 12, arH: 9, chC: 0, chCH: 0, chCH2: 0, chCH3: 0, rC: 0, rCH: 0, rCH2: 0, ether: 1, epoxy: 0, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 129.55, x: 47.9335 },
  { row: 12, name: "ANp", counts: { arC: 10, arH: 6, chC: 0, chCH: 0, chCH2: 0, chCH3: 0, rC: 0, rCH: 2, rCH2: 0, ether: 0, epoxy: 0, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 111.32, x: 41.1884 },
  { row: 13, name: "indane", counts: { arC: 6, arH: 4, chC: 0, chCH: 0, chCH2: 0, chCH3: 0, rC: 0, rCH: 2, rCH2: 1, ether: 0, epoxy: 0, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 80.99, x: 29.9663 },
  { row: 14, name: "PHS", counts: { arC: 6, arH: 4, chC: 0, chCH: 1, chCH2: 1, chCH3: 0, rC: 0, rCH: 0, rCH2: 0, ether: 0, epoxy: 0, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 1, fAl: 0, fAr: 0 }, w: 89.85, x: 33.2445 },
  { row: 15, name: "EHP03", counts: { arC: 0, arH: 0, chC: 1, chCH: 1, chCH2: 2, chCH3: 0, rC: 0, rCH: 1, rCH2: 1, ether: 0, epoxy: 1, ketone: 0, aldehyde: 0, ester: 1, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 69.52, x: 69.52 },
  { row: 16, name: "4770", counts: { arC: 20, arH: 12, chC: 0, chCH: 0, chCH2: 3, chCH3: 0, rC: 0, rCH: 2, rCH2: 2, ether: 2, epoxy: 2, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 270.23, x: 99.9851 },
  { row: 17, name: "EX192", counts: { arC: 0, arH: 0, chC: 0, chCH: 0, chCH2: 13, chCH3: 1, rC: 0, rCH: 1, rCH2: 1, ether: 1, epoxy: 1, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 166.31, x: 166.31 },
  { row: 18, name: "PIRM", counts: { arC: 18, arH: 11, chC: 2, chCH: 0, chCH2: 0, chCH3: 4, rC: 0, rCH: 0, rCH2: 0, ether: 0, epoxy: 0, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 3, fAl: 0, fAr: 0 }, w: 276.69, x: 102.3753 },
  { row: 19, name: "HP820", counts: { arC: 12, arH: 6, chC: 2, chCH: 0, chCH2: 4, chCH3: 6, rC: 0, rCH: 2, rCH2: 2, ether: 4, epoxy: 2, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 1, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 303.64, x: 112.3468 },
  { row: 20, name: "EXA-850-CRP", counts: { arC: 8, arH: 8, chC: 1, chCH: 0, chCH2: 2, chCH3: 2, rC: 0, rCH: 2, rCH2: 2, ether: 2, epoxy: 2, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 180.67, x: 66.8479 },
  { row: 21, name: "DE-102", counts: { arC: 0, arH: 0, chC: 0, chCH: 0, chCH2: 2, chCH3: 0, rC: 0, rCH: 12, rCH2: 0, ether: 0, epoxy: 2, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 91.46, x: 73.168 },
  { row: 22, name: "THB-6M", counts: { arC: 24, arH: 16, chC: 2, chCH: 0, chCH2: 3, chCH3: 3, rC: 0, rCH: 3, rCH2: 3, ether: 3, epoxy: 3, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 382.67, x: 141.5879 },
  { row: 23, name: "EX121", counts: { arC: 0, arH: 0, chC: 0, chCH: 1, chCH2: 6, chCH3: 2, rC: 0, rCH: 1, rCH2: 1, ether: 1, epoxy: 1, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 115.15, x: 115.15 },
  { row: 24, name: "EX145", counts: { arC: 6, arH: 6, chC: 0, chCH: 0, chCH2: 11, chCH3: 0, rC: 0, rCH: 1, rCH2: 1, ether: 6, epoxy: 1, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 218.36, x: 80.7932 },
  { row: 25, name: "EX252", counts: { arC: 0, arH: 0, chC: 1, chCH: 0, chCH2: 2, chCH3: 2, rC: 0, rCH: 6, rCH2: 10, ether: 2, epoxy: 2, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 180.43, x: 180.43 },
  { row: 26, name: "EX-920", counts: { arC: 0, arH: 0, chC: 0, chCH: 3, chCH2: 5, chCH3: 3, rC: 0, rCH: 2, rCH2: 2, ether: 4, epoxy: 2, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 159.2, x: 159.2 },
  { row: 27, name: "EX-931", counts: { arC: 0, arH: 0, chC: 0, chCH: 11, chCH2: 13, chCH3: 11, rC: 0, rCH: 2, rCH2: 2, ether: 12, epoxy: 2, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 434.24, x: 434.24 },
  { row: 28, name: "EX841", counts: { arC: 0, arH: 0, chC: 0, chCH: 0, chCH2: 28, chCH3: 0, rC: 0, rCH: 2, rCH2: 2, ether: 10, epoxy: 2, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 355.34, x: 355.34 },
  { row: 29, name: "EX861", counts: { arC: 0, arH: 0, chC: 0, chCH: 0, chCH2: 46, chCH3: 0, rC: 0, rCH: 2, rCH2: 2, ether: 23, epoxy: 2, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 587.58, x: 587.58 },
  { row: 30, name: null, counts: { arC: 0, arH: 0, chC: 1, chCH: 0, chCH2: 8, chCH3: 0, rC: 0, rCH: 4, rCH2: 4, ether: 4, epoxy: 4, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 163.77, x: 163.77 },
  { row: 31, name: "EX521", counts: { arC: 0, arH: 0, chC: 0, chCH: 6, chCH2: 15, chCH3: 0, rC: 0, rCH: 5, rCH2: 5, ether: 10, epoxy: 5, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 3, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 343.88, x: 343.88 },
  { row: 32, name: "EX920", counts: { arC: 0, arH: 0, chC: 0, chCH: 3, chCH2: 5, chCH3: 3, rC: 0, rCH: 2, rCH2: 2, ether: 4, epoxy: 2, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 159.2, x: 159.2 },
  { row: 33, name: "EX830", counts: { arC: 0, arH: 0, chC: 0, chCH: 0, chCH2: 20, chCH3: 0, rC: 0, rCH: 2, rCH2: 2, ether: 10, epoxy: 2, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 273.5, x: 273.5 },
  { row: 34, name: "EX512", counts: { arC: 0, arH: 0, chC: 0, chCH: 4, chCH2: 11, chCH3: 0, rC: 0, rCH: 4, rCH2: 4, ether: 7, epoxy: 4, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 2, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 251.35, x: 251.35 },
  { row: 35, name: null, counts: { arC: 0, arH: 8, chC: 1, chCH: 2, chCH2: 2, chCH3: 4, rC: 0, rCH: 0, rCH2: 0, ether: 2, epoxy: 0, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 2, oh3: 0, phenol: 0, fAl: 0, fAr: 0 }, w: 146.79, x: 54.3123 },
  { row: 36, name: null, counts: { arC: 0, arH: 8, chC: 1, chCH: 0, chCH2: 0, chCH3: 0, rC: 0, rCH: 0, rCH2: 0, ether: 0, epoxy: 0, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 2, fAl: 6, fAr: 0 }, w: 159.69, x: 59.0853 },
  { row: 37, name: null, counts: { arC: 12, arH: 6, chC: 1, chCH: 0, chCH2: 6, chCH3: 7, rC: 0, rCH: 0, rCH2: 0, ether: 6, epoxy: 0, ketone: 0, aldehyde: 0, ester: 0, oh1: 0, oh2: 0, oh3: 0, phenol: 3, fAl: 0, fAr: 0 }, w: 333.44, x: 123.3728 },
];
