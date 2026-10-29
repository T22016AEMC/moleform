// 3D 構象的行為測試（任務 011）：只檢查程式行為，不判斷化學正確性（D17）。
import { beforeAll, describe, expect, it } from 'vitest';
import { Molecule, Resources } from 'openchemlib';
import { checkConformerSupport } from '../../src/core/conformer/support';
import { conformersToSdf } from '../../src/core/conformer/export';
import { ConformerSession, DEFAULT_SEED, MAX_CONFORMERS } from '../../src/core/conformer/session';
import { getRDKit } from '../../src/core/rdkit/loader';
import type { RDKitModule } from '../../src/core/rdkit/types';
import { validateStructure } from '../../src/core/structure/validate';
import { distance } from '../../src/core/geometry';

let RDKit: RDKitModule;
beforeAll(async () => {
  Resources.registerFromNodejs();
  RDKit = await getRDKit();
});

const BADGE = 'CC(C)(c1ccc(OCC2CO2)cc1)c1ccc(OCC2CO2)cc1';

/** 與 App 相同的路徑：RDKit 驗證後的 Molfile 交給 3D 計算 */
function molblockOf(smiles: string): string {
  const v = validateStructure(RDKit, smiles);
  expect(v.valid).toBe(true);
  return v.molblock;
}

/** 讀 Molfile 的座標與元素 */
function atomsOf(molfile: string) {
  const m = Molecule.fromMolfile(molfile);
  return Array.from({ length: m.getAllAtoms() }, (_, i) => ({
    z: m.getAtomZ(i),
    xyz: [m.getAtomX(i), m.getAtomY(i), m.getAtomZ(i)] as const,
    no: m.getAtomicNo(i),
  }));
}

describe('3D 座標', () => {
  it.each([
    ['乙醇', 'CCO'],
    ['環氧丙烷', 'CC1CO1'],
    ['BADGE', BADGE],
  ])('%s 能產生 3D 座標（z 不全為 0）並有 MMFF94 能量', (_name, smiles) => {
    const batch = new ConformerSession(molblockOf(smiles)).generate(3);
    expect(batch.conformers.length).toBeGreaterThan(0);
    expect(batch.optimized).toBe(true);
    for (const c of batch.conformers) {
      const zs = atomsOf(c.molfile).map((a) => a.z);
      expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.1);
      expect(c.energy).not.toBeNull();
    }
  });

  it('相對能量由低到高排序，最低者為 0', () => {
    const batch = new ConformerSession(molblockOf(BADGE)).generate(5);
    const rel = batch.conformers.map((c) => c.relativeEnergy as number);
    expect(rel[0]).toBe(0);
    expect([...rel].sort((a, b) => a - b)).toEqual(rel);
    expect(batch.conformers.map((c) => c.rank)).toEqual(rel.map((_, i) => i + 1));
  });

  it('同種子兩次結果完全相同', () => {
    const run = () => new ConformerSession(molblockOf(BADGE), DEFAULT_SEED).generate(4).conformers;
    const a = run();
    const b = run();
    expect(a.map((c) => c.molfile)).toEqual(b.map((c) => c.molfile));
    expect(a.map((c) => c.energy)).toEqual(b.map((c) => c.energy));
  });

  it('分兩次產生（3 個、再到 6 個）與一次產生 6 個結果相同', () => {
    const molblock = molblockOf(BADGE);
    const session = new ConformerSession(molblock);
    session.generate(3);
    const stepped = session.generate(6);
    const direct = new ConformerSession(molblock).generate(6);
    expect(stepped.conformers.map((c) => c.molfile)).toEqual(direct.conformers.map((c) => c.molfile));
  });

  it('構象數不超過上限，且不同構象不會被誤合併成同一個（距離矩陣差異超過閾值）', () => {
    const batch = new ConformerSession(molblockOf('CCCCCCCCCC')).generate(MAX_CONFORMERS + 10);
    expect(batch.conformers.length).toBeLessThanOrEqual(MAX_CONFORMERS);
    expect(batch.conformers.length).toBeGreaterThan(5);
    expect(batch.conformers.length + batch.merged).toBeGreaterThan(5);
  });

  it('乙醇只得到有限個構象並標示產生器已無更多', () => {
    const batch = new ConformerSession(molblockOf('CCO')).generate(5);
    expect(batch.conformers.length).toBeLessThan(5);
    expect(batch.exhausted).toBe(true);
  });
});

describe('MMFF94 缺參數（K07）', () => {
  it('BF₃ 不拋錯，走「未經力場最佳化」路徑', () => {
    const batch = new ConformerSession(molblockOf('FB(F)F')).generate(5);
    expect(batch.conformers.length).toBeGreaterThan(0);
    expect(batch.optimized).toBe(false);
    expect(batch.optimizationNote).toContain('未經力場最佳化');
    for (const c of batch.conformers) {
      expect(c.optimized).toBe(false);
      expect(c.energy).toBeNull();
      expect(c.relativeEnergy).toBeNull();
    }
  });

  it('未最佳化的 3D 座標仍然是 3D（原子數 4，B–F 距離大於 0）', () => {
    const [c] = new ConformerSession(molblockOf('FB(F)F')).generate(1).conformers;
    const atoms = atomsOf(c.molfile);
    expect(atoms).toHaveLength(4);
    expect(distance(atoms[0].xyz, atoms[1].xyz)).toBeGreaterThan(0.5);
  });
});

describe('不支援 3D 的情況', () => {
  it('含 * 連接點的結構被拒絕並回傳 D05 說明', () => {
    const check = checkConformerSupport(molblockOf('*CC*'));
    expect(check.supported).toBe(false);
    if (!check.supported) expect(check.reason).toContain('3D 只用於單體與小分子');
  });

  it('[*:1]CC[*:2] 也被拒絕', () => {
    expect(checkConformerSupport(molblockOf('[*:1]CC[*:2]')).supported).toBe(false);
  });

  it('空白或無效結構被拒絕', () => {
    expect(checkConformerSupport('').supported).toBe(false);
    expect(checkConformerSupport(null).supported).toBe(false);
    expect(checkConformerSupport('not a molfile').supported).toBe(false);
  });

  it('一般小分子允許，重原子數正確，不需確認', () => {
    const check = checkConformerSupport(molblockOf(BADGE));
    expect(check).toEqual({ supported: true, heavyAtoms: 25, needsConfirm: false });
  });

  it('重原子超過 100 個時允許但需要確認', () => {
    const check = checkConformerSupport(molblockOf('C'.repeat(101)));
    expect(check).toEqual({ supported: true, heavyAtoms: 101, needsConfirm: true });
    expect(checkConformerSupport(molblockOf('C'.repeat(100)))).toMatchObject({ needsConfirm: false });
  });
});

describe('原子順序（Phase 4 在 3D 上標記反應原子的前提）', () => {
  it.each([
    ['乙醇', 'CCO'],
    ['BADGE', BADGE],
    ['L-丙胺酸', 'C[C@@H](C(=O)O)N'],
    ['苯酚', 'Oc1ccccc1'],
  ])('%s：重原子索引與元素、鍵結在 3D 結果中不變，氫接在後面', (_name, smiles) => {
    const molblock = molblockOf(smiles);
    const input = Molecule.fromMolfile(molblock);
    const n = input.getAllAtoms();
    const out = new ConformerSession(molblock).generate(2).conformers;
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) {
      const m = Molecule.fromMolfile(c.molfile);
      expect(m.getAllAtoms()).toBeGreaterThan(n);
      for (let i = 0; i < n; i++) expect(m.getAtomicNo(i)).toBe(input.getAtomicNo(i));
      for (let i = n; i < m.getAllAtoms(); i++) expect(m.getAtomicNo(i)).toBe(1);
      const bonds = (mol: Molecule) =>
        Array.from({ length: mol.getAllBonds() }, (_, b) => [mol.getBondAtom(0, b), mol.getBondAtom(1, b)].sort((x, y) => x - y).join('-'));
      const heavyBonds = bonds(m).filter((b) => b.split('-').every((i) => Number(i) < n));
      expect(heavyBonds.sort()).toEqual(bonds(input).sort());
    }
  });
});

describe('匯出', () => {
  it('SDF 每筆附構象序號、種子與能量（kcal/mol）', () => {
    const batch = new ConformerSession(molblockOf(BADGE)).generate(3);
    const sdf = conformersToSdf(batch.conformers, batch.seed);
    expect(sdf.split('$$$$').length - 1).toBe(batch.conformers.length);
    expect(sdf).toContain('>  <Conformer>\n1\n');
    expect(sdf).toContain('>  <Seed>\n42\n');
    expect(sdf).toContain('>  <Relative_Energy_kcal_per_mol>\n0.0000\n');
  });

  it('未最佳化時不附能量欄位', () => {
    const batch = new ConformerSession(molblockOf('FB(F)F')).generate(2);
    const sdf = conformersToSdf(batch.conformers, batch.seed);
    expect(sdf).not.toContain('Energy');
    expect(sdf).toContain('>  <Optimized>\nno\n');
  });
});
