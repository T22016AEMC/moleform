// 黃金資料：src/core/properties/cte.ts 的 computeCte、cteFromVw、glassAlphaFromTg（任務 M03）。
// CTE 由 VW（M01）與 Tg（M02）計算；本匯出只記錄 TS 的輸出，Python 端直接呼叫已完成的 vw.py、tg.py。
// 案例種類（input.kind）：
//   compute      computeCte(RDKit, smiles) 的完整輸出（ok／notApplicable／missing／invalid；式 4.27 的 Tg 缺基團與 Tg 低於 298 K 的備註）
//   cteFromVw    cteFromVw({ vw, mass }) 純計算：含 mass 為 null、VW 為 0 或負數（0/0 → NaN）、極大／極小的數字
//   glassAlpha   glassAlphaFromTg(vw, tgK)：含 V_g(298) 為 0 的 Tg（除以零）
// 分子來源見 scripts/golden/vm-cte-inputs.ts（與 export-vm.ts 共用）；另加 Table 4.12 的書中聚合物（取自 cte.test.ts 的 SMILES 字串，
// 由共用的掃描程式涵蓋）與 Tg 在 298 K（24.85 °C）附近的單元（式 4.27 的備註門檻 tgK < 298）。
// 執行：node scripts/golden/export-cte.ts
import { withVite, writeGolden, type GoldenCase } from './common.ts';
import { collectMolecules } from './vm-cte-inputs.ts';

await withVite(async (server) => {
  const { getRDKit } = await server.ssrLoadModule('/src/core/rdkit/loader.ts');
  const { computeCte, cteFromVw, glassAlphaFromTg } = await server.ssrLoadModule('/src/core/properties/cte.ts');
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
  const cases: GoldenCase[] = [];
  const stats = { ok: 0, notApplicable: 0, missing: 0, invalid: 0, threw: 0, tgOk: 0, tgMissing: 0, below298: 0, withDummy: 0, bondi: 0 };
  let near298 = 0;
  for (const { id, smiles } of molecules) {
    const result = run(() => computeCte(RDKit, smiles)) as any;
    cases.push({ id, input: { kind: 'compute', smiles }, output: result });
    if (result.threw) stats.threw++;
    else stats[result.status as 'ok' | 'notApplicable' | 'missing' | 'invalid']++;
    if (smiles.includes('*')) stats.withDummy++;
    if (result.status === 'ok') {
      if (result.vwBondiSupplement) stats.bondi++;
      if (result.glassyFromTg.status === 'ok') {
        stats.tgOk++;
        if (result.glassyFromTg.note !== null) stats.below298++;
        if (id.startsWith('boundary/') && Math.abs(result.glassyFromTg.tgK - 298) < 0.5) near298++;
      } else stats.tgMissing++;
    }
    if (id.startsWith('boundary/below-24.8491-298K') && (result.status !== 'ok' || result.glassyFromTg.note === null)) throw new Error(`${id} 應是 Tg 略低於 298 K（有備註）：${JSON.stringify(result.glassyFromTg)}`);
    if (id.startsWith('boundary/below-24.9205') && (result.status !== 'ok' || result.glassyFromTg.note !== null)) throw new Error(`${id} 應是 Tg 略高於 298 K（沒有備註）：${JSON.stringify(result.glassyFromTg)}`);
  }
  if (near298 < 2) throw new Error(`Tg 在 298 K 附近的案例不足（${near298}）`);

  // ---- 純計算 ----
  const pure: [string, number, number | null][] = [
    ['vw100-mass200', 100, 200],
    ['PET-example-4.2', 94.18, 192.2],
    ['vw20.46-null-mass', 20.46, null],
    ['vw1', 1, 1],
    ['vw0-NaN', 0, 100],
    ['vw0-mass0', 0, 0],
    ['vw-negative', -10, 50],
    ['vw-tiny', 1e-300, 1],
    ['vw-huge', 1e300, 1e10],
    ['mass-tiny', 62.83, 1e-320],
    ['vw0.1+0.2', 0.1 + 0.2, 0.3],
    ['vw-irrational-ish', 62.85000000000001, 104.15],
    ['vw136.21', 136.21, 288.2],
  ];
  for (const [id, vw, mass] of pure) cases.push({ id: `cteFromVw/${id}`, input: { kind: 'cteFromVw', vw, mass }, output: cteFromVw({ vw, mass }) });
  const glass: [string, number, number][] = [
    ['Tg300', 1, 300],
    ['Tg400', 1, 400],
    ['Tg500', 1, 500],
    ['PMMA-387', 56.1, 387],
    ['PS-373', 62.85, 373],
    ['Tg298', 62.83, 298],
    ['Tg297.9991', 62.83, 297.9991],
    ['Tg0K', 62.83, 0],
    ['Tg-negative', 62.83, -100],
    ['Vg-zero-Tg', 10, -1.43 / 0.55e-3],
    ['vw0', 0, 300],
    ['vw-negative', -5, 300],
    ['Tg-huge', 62.83, 1e12],
  ];
  for (const [id, vw, tgK] of glass) cases.push({ id: `glassAlpha/${id}`, input: { kind: 'glassAlpha', vw, tgK }, output: glassAlphaFromTg(vw, tgK) });

  console.log(
    `分子 ${molecules.length} 個；compute：ok ${stats.ok}、notApplicable ${stats.notApplicable}、missing ${stats.missing}、invalid ${stats.invalid}、拋出 ${stats.threw}；` +
      `式 4.27：Tg 可算 ${stats.tgOk}（其中 Tg < 298 K 有備註 ${stats.below298}）、Tg 缺 ${stats.tgMissing}；含 * ${stats.withDummy}；用 Bondi 補充 ${stats.bondi}；純計算 ${pure.length + glass.length} 個`,
  );
  writeGolden('cte', String(RDKit.version()), cases);
});
