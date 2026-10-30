// Joback 41 個基團的正例與反例（任務 027，D22）。正例：SMARTS 必須命中；反例：SMARTS 不得命中。
// 「基團」欄是表 III 的名稱，逐列核對 joback_groups.csv 的名稱順序。
export interface JobackGroupCase {
  id: string;
  /** 表 III 的基團名稱（核對順序用） */
  table3: string;
  positives: string[];
  negatives: string[];
}

export const JOBACK_GROUP_CASES: readonly JobackGroupCase[] = [
  { id: 'J01', table3: '—CH3', positives: ['CCC', 'COC'], negatives: ['C1CCCCC1'] },
  { id: 'J02', table3: '—CH2— (non-ring)', positives: ['CCC'], negatives: ['C1CCCCC1', 'CC'] },
  { id: 'J03', table3: '>CH— (non-ring)', positives: ['CC(C)C'], negatives: ['CC1CC1', 'CCC'] },
  { id: 'J04', table3: '>C< (non-ring)', positives: ['CC(C)(C)C'], negatives: ['CC1(C)CC1', 'CC(C)C'] },
  { id: 'J05', table3: '=CH2', positives: ['C=CC'], negatives: ['CC=CC', 'CCC'] },
  { id: 'J06', table3: '=CH— (non-ring)', positives: ['CC=CC'], negatives: ['CC=O', 'C=C'] },
  { id: 'J07', table3: '=C< (non-ring)', positives: ['CC(C)=C'], negatives: ['CC(C)=O', 'CC=CC'] },
  { id: 'J08', table3: '=C=', positives: ['C=C=C'], negatives: ['C=CC'] },
  { id: 'J09', table3: '≡CH', positives: ['C#C', 'CC#C'], negatives: ['CC#CC', 'CC#N'] },
  { id: 'J10', table3: '≡C—', positives: ['CC#CC', 'CC#C'], negatives: ['C#C', 'CC#N'] },
  { id: 'J11', table3: '—CH2— (ring)', positives: ['C1CCCCC1'], negatives: ['CCCCCC'] },
  { id: 'J12', table3: '>CH— (ring)', positives: ['CC1CCCCC1'], negatives: ['CC(C)C'] },
  { id: 'J13', table3: '>C< (ring)', positives: ['CC1(C)CCCCC1'], negatives: ['CC(C)(C)C'] },
  { id: 'J14', table3: '=CH— (ring)', positives: ['c1ccccc1', 'C1=CCCCC1'], negatives: ['CC=CC', 'C1CCCCC1'] },
  { id: 'J15', table3: '=C< (ring)', positives: ['Cc1ccccc1', 'CC1=CCCCC1'], negatives: ['CC(C)=C', 'C1CCCCC1'] },
  { id: 'J16', table3: '—F', positives: ['CF'], negatives: ['CCl'] },
  { id: 'J17', table3: '—Cl', positives: ['CCl'], negatives: ['CF'] },
  { id: 'J18', table3: '—Br', positives: ['CBr'], negatives: ['CCl'] },
  { id: 'J19', table3: '—I', positives: ['CI'], negatives: ['CBr'] },
  { id: 'J20', table3: '—OH (alcohol)', positives: ['CCO'], negatives: ['Oc1ccccc1', 'CC(=O)O'] },
  { id: 'J21', table3: '—OH (phenol)', positives: ['Oc1ccccc1'], negatives: ['CCO'] },
  { id: 'J22', table3: '—O— (nonring)', positives: ['COC'], negatives: ['C1CCOC1', 'CC(=O)OC', 'CCO'] },
  { id: 'J23', table3: '—O— (ring)', positives: ['C1CCOC1', 'c1ccoc1'], negatives: ['COC', 'O=C1CCCO1'] },
  { id: 'J24', table3: '>C=O (nonring)', positives: ['CC(C)=O', 'CC(=O)N'], negatives: ['O=C1CCCCC1', 'CC(=O)OC', 'CC=O'] },
  { id: 'J25', table3: '>C=O (ring)', positives: ['O=C1CCCCC1'], negatives: ['CC(C)=O', 'O=C1CCCO1'] },
  { id: 'J26', table3: 'O=CH— (aldehyde)', positives: ['CC=O', 'O=Cc1ccccc1'], negatives: ['CC(C)=O', 'O=COC'] },
  { id: 'J27', table3: '—COOH (acid)', positives: ['CC(=O)O', 'OC(=O)c1ccccc1'], negatives: ['CC(=O)OC', 'CCO'] },
  { id: 'J28', table3: '—COO— (ester)', positives: ['CC(=O)OC', 'O=C1CCCO1'], negatives: ['CC(=O)O', 'COC(=O)OC', 'O=COC'] },
  { id: 'J29', table3: '=O (other than above)', positives: ['CS(C)=O'], negatives: ['CC(C)=O', 'C[N+](=O)[O-]'] },
  { id: 'J30', table3: '—NH2', positives: ['CCN'], negatives: ['CNC'] },
  { id: 'J31', table3: '>NH (nonring)', positives: ['CNC'], negatives: ['C1CCNC1', 'CCN'] },
  { id: 'J32', table3: '>NH (ring)', positives: ['C1CCNC1', 'c1cc[nH]c1'], negatives: ['CNC'] },
  { id: 'J33', table3: '>N— (nonring)', positives: ['CN(C)C'], negatives: ['CN1CCCC1', 'C[N+](=O)[O-]'] },
  { id: 'J34', table3: '—N= (nonring)', positives: ['CN=NC', 'CN=CC'], negatives: ['c1ccncc1', 'CC#N'] },
  { id: 'J35', table3: '—N= (ring)', positives: ['c1ccncc1'], negatives: ['CN=NC'] },
  { id: 'J36', table3: '=NH', positives: ['CC(C)=N'], negatives: ['CN=NC'] },
  { id: 'J37', table3: '—CN', positives: ['CC#N'], negatives: ['CC#C'] },
  { id: 'J38', table3: '—NO2', positives: ['C[N+](=O)[O-]', '[O-][N+](=O)c1ccccc1'], negatives: ['CN(C)C', 'CO[N+](=O)[O-]'] },
  { id: 'J39', table3: '—SH', positives: ['CS'], negatives: ['CSC'] },
  { id: 'J40', table3: '—S— (nonring)', positives: ['CSC'], negatives: ['C1CCSC1', 'CS'] },
  { id: 'J41', table3: '—S— (ring)', positives: ['C1CCSC1', 'c1ccsc1'], negatives: ['CSC'] },
];

/** 表 III 的基團名稱順序（逐列核對 joback_groups.csv 的「基團名稱」；Non-ring 10、Ring 5、Halogen 4、Oxygen 10、Nitrogen 9、Sulfur 3） */
export const TABLE3_NAMES: readonly string[] = JOBACK_GROUP_CASES.map((c) => c.table3);

/** 表 III（書頁 235–236）Tb、Tf 兩欄的獨立抄錄，只用於手算對照（與 joback_groups.csv 各自輸入，不從 CSV 取值） */
export const TABLE3: Readonly<Record<string, { tb: number; tf: number | null }>> = {
  CH3: { tb: 23.58, tf: -5.1 },
  CH2: { tb: 22.88, tf: 11.27 },
  CH: { tb: 21.74, tf: 12.64 },
  ringCH2: { tb: 27.15, tf: 7.75 },
  ringCH: { tb: 26.73, tf: 8.13 },
  ringC: { tb: 31.01, tf: 37.02 },
  Cl: { tb: 38.13, tf: 13.55 },
  OHalc: { tb: 92.88, tf: 44.45 },
  OHphenol: { tb: 76.34, tf: 82.83 },
  CO: { tb: 76.75, tf: 61.2 },
  COOH: { tb: 169.09, tf: 155.5 },
  COO: { tb: 81.1, tf: 53.6 },
  ringN: { tb: 57.55, tf: 68.4 },
  CN: { tb: 125.66, tf: 59.89 },
  NO2: { tb: 152.54, tf: 127.24 },
  N2: { tb: 74.6, tf: null },
};
