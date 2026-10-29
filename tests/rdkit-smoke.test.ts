import { describe, expect, it } from 'vitest';
import { getRDKit } from '../src/core/rdkit/loader';

// 只檢查程式能正確呼叫 RDKit，不判斷化學正確性（D17）。
describe('RDKit 載入器煙霧測試', () => {
  it('能初始化並取得版本', async () => {
    const RDKit = await getRDKit();
    expect(RDKit.version()).toBeTruthy();
  });

  it('有效 SMILES 可解析', async () => {
    const RDKit = await getRDKit();
    const mol = RDKit.get_mol('CCO');
    expect(mol).not.toBeNull();
    try {
      expect(mol!.is_valid()).toBe(true);
    } finally {
      mol!.delete();
    }
  });

  it('無效 SMILES 判定為無效', async () => {
    const RDKit = await getRDKit();
    const mol = RDKit.get_mol('not a smiles ((');
    try {
      expect(mol === null || !mol.is_valid()).toBe(true);
    } finally {
      mol?.delete();
    }
  });

  it('getRDKit 為單例', async () => {
    expect(await getRDKit()).toBe(await getRDKit());
  });
});