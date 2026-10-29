// Molfile／SDF 的文字層級檢查：反應式、查詢結構、R 基團、聚合物記號（DECISIONS D31）。
// 只讀文字、不需要 RDKit，所以可在 Ketcher 子專案與 Node 測試中使用。
// 連接點 * 是允許的：V2000／V3000 中的 `*` 原子，以及 RDKit 輸出虛原子用的 `R`（沒有 R 基團標示時）都不算違規。

export interface MolfileFeatures {
  reaction: boolean;
  query: boolean;
  rgroup: boolean;
  polymer: boolean;
}

const QUERY_ATOM_SYMBOLS = new Set(['A', 'Q', 'X', 'M', 'AH', 'QH', 'XH', 'MH', 'L']);
const POLYMER_SGROUPS = /\b(SRU|MUL|MON|COP|CRO|MOD|MER|GRA)\b/;
// 5 = 單或雙、6 = 單或芳香、7 = 雙或芳香、8 = 任意
const QUERY_BOND_TYPES = new Set([5, 6, 7, 8]);

/** 判斷文字是否為反應檔（RXN／V3000 反應區塊）。 */
export function isReactionMolfile(text: string): boolean {
  return /^\$RXN/m.test(text) || /^M {2}V30 BEGIN (REACTION|RXN)\b/m.test(text);
}

function v3000Lines(lines: string[]): string[] {
  const joined: string[] = [];
  let carry = '';
  for (const raw of lines) {
    if (!raw.startsWith('M  V30 ')) {
      carry = '';
      continue;
    }
    const body = raw.slice(7).replace(/\s+$/, '');
    if (body.endsWith('-')) {
      carry += body.slice(0, -1);
      continue;
    }
    joined.push(carry + body);
    carry = '';
  }
  return joined;
}

function analyzeV3000(lines: string[], f: MolfileFeatures) {
  let section = '';
  for (const line of v3000Lines(lines)) {
    const begin = /^BEGIN (\w+)/.exec(line);
    if (begin) {
      section = begin[1];
      continue;
    }
    if (line.startsWith('END ')) {
      section = '';
      continue;
    }
    if (section === 'ATOM') {
      const tokens = line.split(/\s+/);
      const type = tokens[1] ?? '';
      if (type === 'NOT' || type.startsWith('[') || QUERY_ATOM_SYMBOLS.has(type)) f.query = true;
      if (type === 'R#' || /\bRGROUPS=/.test(line)) f.rgroup = true;
      if (/\b(SUBST|RBCNT|UNSAT)=/.test(line)) f.query = true;
    } else if (section === 'BOND') {
      const tokens = line.split(/\s+/);
      if (QUERY_BOND_TYPES.has(Number(tokens[1])) || /\bTOPO=/.test(line)) f.query = true;
    } else if (section === 'SGROUP') {
      if (/^\d+ (SRU|MUL|MON|COP|CRO|MOD|MER|GRA)\b/.test(line)) f.polymer = true;
    }
  }
}

function analyzeV2000(lines: string[], f: MolfileFeatures) {
  const counts = lines[3] ?? '';
  const atomCount = parseInt(counts.slice(0, 3), 10);
  const bondCount = parseInt(counts.slice(3, 6), 10);
  if (!Number.isFinite(atomCount) || !Number.isFinite(bondCount)) return;
  for (let i = 0; i < atomCount; i++) {
    const symbol = (lines[4 + i] ?? '').slice(31, 34).trim();
    if (QUERY_ATOM_SYMBOLS.has(symbol)) f.query = true;
    if (symbol === 'R#') f.rgroup = true;
  }
  for (let j = 0; j < bondCount; j++) {
    const type = parseInt((lines[4 + atomCount + j] ?? '').slice(6, 9), 10);
    if (QUERY_BOND_TYPES.has(type)) f.query = true;
  }
  for (const line of lines.slice(4 + atomCount + bondCount)) {
    if (/^M {2}(ALS|SUB|RBC|UNS)\b/.test(line)) f.query = true;
    if (/^M {2}RGP\b/.test(line)) f.rgroup = true;
    if (/^M {2}STY\b/.test(line) && POLYMER_SGROUPS.test(line)) f.polymer = true;
  }
}

/** 分析單一 Molfile（V2000 或 V3000）；回傳各項特徵是否存在。 */
export function molfileFeatures(molfile: string): MolfileFeatures {
  const features: MolfileFeatures = { reaction: isReactionMolfile(molfile), query: false, rgroup: false, polymer: false };
  const lines = molfile.replace(/\r\n?/g, '\n').split('\n');
  if (/V3000/.test(lines[3] ?? '')) analyzeV3000(lines, features);
  else analyzeV2000(lines, features);
  return features;
}
