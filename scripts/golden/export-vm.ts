// 黃金資料：src/core/properties/molarVolumeDensity.ts 的 computeMolarVolumeDensity／judgeState 等（任務 M03；風險 R1 芳香性、
// R2 原子索引與氫數、R3 SMARTS 配對順序、R4 SMARTS 解析；另加玻璃態／橡膠態判斷的邊界案例）。
// 只呼叫現有的 TypeScript 函式（computeMolarVolumeDensity、judgeState、orderMolarVolumeGroups、countMolarVolumeGroups、vwMatches）；
// R3 的「原始配對順序」案例直接呼叫 RDKit.js 的 get_substruct_matches（TS 計算本來就是這個呼叫），記錄 RDKit 未經任何排序的回傳。
// 案例種類（input.kind）：
//   compute    computeMolarVolumeDensity(RDKit, smiles, options) 的完整輸出；options 只有 dropIds（資料表去掉哪幾列，測缺基團與切分順序）
//   state      judgeState(RDKit, smiles)：298 K 玻璃態／橡膠態判斷（Tg 與 25 °C 的比較、依據文字）；TS 拋出例外時輸出 { threw: true }
//   count      countMolarVolumeGroups(groups)：可計算的結果依基團合併
//   rawMatches 資料表全部 SMARTS 與缺基團補充說明（MISSING_HINTS）的 SMARTS 對該分子的原始配對（RDKit.js 的順序，不排序）；只列有命中的 SMARTS
//   rawQuery   任意 SMILES × 任意 SMARTS 的原始配對（R3 的參數探針）
//   smarts     資料表每一列 SMARTS 的可解析性，以及正例／反例的原始配對與 vwMatches（已排序）的結果；另有無法解析的 SMARTS（R4）
//   order      orderMolarVolumeGroups：切分順序
//   hints      缺基團補充說明（MISSING_HINTS）的 SMARTS（從 TS 原始碼讀出）可否解析
// 分子來源見 scripts/golden/vm-cte-inputs.ts（與 export-cte.ts 共用）。
// 執行：node scripts/golden/export-vm.ts
import { withVite, writeGolden, type GoldenCase } from './common.ts';
import { BAD_SMARTS, RAW_QUERIES, collectMolecules, readMissingHintSmarts } from './vm-cte-inputs.ts';

await withVite(async (server) => {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { computeMolarVolumeDensity, judgeState, orderMolarVolumeGroups, countMolarVolumeGroups, STATE_BOUNDARY_C } = await server.ssrLoadModule('/src/core/properties/molarVolumeDensity.ts');
  const { vwMatches } = await server.ssrLoadModule('/src/core/properties/vanDerWaalsVolume.ts');
  const { MOLAR_VOLUME_GROUPS } = await server.ssrLoadModule('/src/core/data/molarVolumeGroups.ts');
  const { BACKBONE_TEMPLATES } = await server.ssrLoadModule('/src/core/data/backboneTemplates.ts');
  const { MOLAR_VOLUME_GROUP_CASES, BOOK_MOLAR_VOLUME_CASES } = await server.ssrLoadModule('/tests/properties/molarVolumeCases.ts');
  const RDKit = await getRDKit();

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

  /** TS 拋出例外時記為 { threw: true }（只接 RDKit.js 的 WebAssembly 例外，其他錯誤照樣拋出） */
  const run = <T>(fn: () => T): T | { threw: true } => {
    try {
      return fn();
    } catch (e) {
      if (String(e) === '[object WebAssembly.Exception]') return { threw: true };
      throw e;
    }
  };

  const molecules = collectMolecules({ parses, MOLAR_VOLUME_GROUPS, MOLAR_VOLUME_GROUP_CASES, BOOK_MOLAR_VOLUME_CASES, BACKBONE_TEMPLATES });
  const hintSmarts = readMissingHintSmarts();
  if (hintSmarts.length !== 2) throw new Error(`MISSING_HINTS 應有 2 個 SMARTS，實際讀到 ${hintSmarts.length} 個`);
  const tableSmarts: string[] = MOLAR_VOLUME_GROUPS.map((r: { smarts: string }) => r.smarts);
  const distinctSmarts: string[] = [...new Set([...tableSmarts, ...hintSmarts])];

  const cases: GoldenCase[] = [];
  const stats = { ok: 0, missing: 0, unsupported: 0, invalid: 0, threw: 0, glassy: 0, rubbery: 0, undetermined: 0, withDummy: 0, tentative: 0 };

  // ---- compute／state／count ----
  const variantDrops: [string, string[]][] = [
    ['dropM01', ['M01']],
    ['dropM15', ['M15']],
    ['dropM11', ['M11']],
    ['dropM02M04', ['M02', 'M04']],
  ];
  const computeWith = (smiles: string, dropIds: string[]) => {
    const rows = dropIds.length === 0 ? undefined : MOLAR_VOLUME_GROUPS.filter((r: { id: string }) => !dropIds.includes(r.id));
    return run(() => computeMolarVolumeDensity(RDKit, smiles, rows === undefined ? {} : { rows }));
  };
  let boundaryChecked = 0;
  for (const { id, smiles, variants } of molecules) {
    const result = computeWith(smiles, []) as any;
    cases.push({ id, input: { kind: 'compute', smiles, options: {} }, output: result });
    if (result.threw) stats.threw++;
    else stats[result.status as 'ok' | 'missing' | 'unsupported' | 'invalid']++;
    if (smiles.includes('*')) stats.withDummy++;
    if (result.status === 'ok') {
      cases.push({ id: `count/${id}`, input: { kind: 'count', smiles }, output: countMolarVolumeGroups(result.groups) });
      stats[result.state.state as 'glassy' | 'rubbery' | 'undetermined']++;
      if (result.usesTentative) stats.tentative++;
    }
    if (id.startsWith('boundary/Tg-missing-Vm-ok')) {
      if (result.status !== 'ok' || result.state.state !== 'undetermined' || result.state.tgC !== null) throw new Error(`${id} 應為「Vm 可算、Tg 缺基團 → 狀態未定」：${JSON.stringify(result.state ?? result)}`);
      boundaryChecked++;
    }
    if (id.startsWith('boundary/above-') || id.startsWith('boundary/below-')) {
      const want = id.startsWith('boundary/above-') ? 'glassy' : 'rubbery';
      if (result.status !== 'ok' || result.state.state !== want) throw new Error(`${id} 應為 ${want}：${JSON.stringify(result.state ?? result)}`);
      boundaryChecked++;
    }
    // 狀態判斷單獨記錄（judgeState 的輸出已含在 compute 的 state 欄位，這裡另測它對所有可解析輸入的行為，含 Tg 缺基團與 Tg 無法計算）
    if (parses(smiles) && smiles.trim() !== '') cases.push({ id: `state/${id}`, input: { kind: 'state', smiles }, output: run(() => judgeState(RDKit, smiles)) });
    if (variants) {
      for (const [name, dropIds] of variantDrops) {
        cases.push({ id: `${id}#${name}`, input: { kind: 'compute', smiles, options: { dropIds } }, output: computeWith(smiles, dropIds) });
      }
    }
  }
  if (boundaryChecked < 20) throw new Error(`邊界案例數不足（${boundaryChecked}）`);

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

  // ---- smarts（R4）：每一列 SMARTS 的可解析性、正反例的原始配對與 vwMatches 結果 ----
  const matchesOn = (smiles: string, q: unknown) => {
    let mol = null;
    try {
      mol = RDKit.get_mol(smiles);
      if (!mol || !mol.is_valid()) return { invalid: true };
      return { raw: rawMatchesOf(mol, q), sorted: vwMatches(mol, q) };
    } finally {
      mol?.delete();
    }
  };
  for (const r of MOLAR_VOLUME_GROUP_CASES as { id: string; positives: string[]; negatives: string[] }[]) {
    const row = (MOLAR_VOLUME_GROUPS as { id: string; smarts: string }[]).find((x) => x.id === r.id);
    if (!row) throw new Error(`資料表沒有 ${r.id}`);
    const q = queryOf(row.smarts);
    const positives: Record<string, unknown> = {};
    const negatives: Record<string, unknown> = {};
    if (q) {
      for (const s of r.positives) positives[s] = matchesOn(s, q);
      for (const s of r.negatives) negatives[s] = matchesOn(s, q);
      q.delete();
    }
    cases.push({
      id: `R4/${r.id}`,
      input: { kind: 'smarts', rowId: r.id, smarts: row.smarts, positives: r.positives, negatives: r.negatives },
      output: { valid: q !== null, positives, negatives },
    });
  }
  hintSmarts.forEach((smarts, i) => {
    const q = queryOf(smarts);
    q?.delete();
    cases.push({ id: `R4/hint${i + 1}`, input: { kind: 'smarts', rowId: null, smarts, positives: [], negatives: [] }, output: { valid: q !== null, positives: {}, negatives: {} } });
  });
  for (const [id, smarts] of BAD_SMARTS) {
    const q = queryOf(smarts);
    q?.delete();
    cases.push({ id, input: { kind: 'smarts', rowId: null, smarts, positives: [], negatives: [] }, output: { valid: q !== null, positives: {}, negatives: {} } });
  }

  // ---- order：orderMolarVolumeGroups（原子數由大到小，同大小依資料表順序） ----
  const describeOrder = (list: { id: string; atomCount: number; order: number }[]) => list.map((f) => ({ id: f.id, atomCount: f.atomCount, order: f.order }));
  cases.push({ id: 'order/full', input: { kind: 'order', dropIds: [] }, output: describeOrder(orderMolarVolumeGroups(MOLAR_VOLUME_GROUPS)) });
  for (const [name, dropIds] of variantDrops) {
    cases.push({ id: `order/${name}`, input: { kind: 'order', dropIds }, output: describeOrder(orderMolarVolumeGroups(MOLAR_VOLUME_GROUPS.filter((r: { id: string }) => !dropIds.includes(r.id)))) });
  }

  console.log(
    `分子 ${molecules.length} 個；compute：ok ${stats.ok}、missing ${stats.missing}、unsupported ${stats.unsupported}、invalid ${stats.invalid}、拋出 ${stats.threw}；` +
      `狀態：玻璃態 ${stats.glassy}、橡膠態 ${stats.rubbery}、未定 ${stats.undetermined}（界線 ${STATE_BOUNDARY_C} °C）；含 * ${stats.withDummy}；含括號值 ${stats.tentative}；原始配對案例 ${rawCount} 個`,
  );
  writeGolden('vm', String(RDKit.version()), cases);
});
