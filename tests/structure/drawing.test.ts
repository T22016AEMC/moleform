// Ketcher 繪圖內容（KET JSON）輸入限制的行為測試（任務 010、D31）。
// 測試資料的形狀取自在瀏覽器實際操作 Ketcher 3.18.0 得到的 KET（座標已省略）。
import { describe, expect, it } from 'vitest';
import { unsupportedDrawing } from '../../src/core/structure/drawingChecks';
import { rejectionMessages } from '../../src/core/structure/inputErrors';

const ket = (mol0: object, nodes: object[] = [{ $ref: 'mol0' }], extra: object = {}) =>
  JSON.stringify({ root: { nodes }, mol0, ...extra });
const atom = (label: string, more: object = {}) => ({ label, location: [0, 0, 0], ...more });

describe('unsupportedDrawing：允許', () => {
  it('一般分子', () => {
    expect(unsupportedDrawing(ket({ type: 'molecule', atoms: [atom('C'), atom('C'), atom('O')], bonds: [{ type: 1, atoms: [0, 1] }, { type: 1, atoms: [1, 2] }] }))).toBeUndefined();
  });

  it('連接點 *（Ketcher 的 star atom），含原子映射編號', () => {
    const mol = { atoms: [atom('*'), atom('C'), atom('C'), atom('*', { mapping: 2 })], bonds: [{ type: 1, atoms: [0, 1] }, { type: 1, atoms: [1, 2] }, { type: 1, atoms: [2, 3] }] };
    expect(unsupportedDrawing(ket(mol))).toBeUndefined();
  });

  it('立體標記與雙鍵不被誤判為查詢', () => {
    const mol = { atoms: [atom('C'), atom('C', { stereoLabel: 'abs' }), atom('C')], bonds: [{ type: 1, atoms: [1, 0], stereo: 1 }, { type: 2, atoms: [1, 2] }] };
    expect(unsupportedDrawing(ket(mol))).toBeUndefined();
  });
});

describe('unsupportedDrawing：拒絕', () => {
  it('反應箭頭', () => {
    const nodes = [{ $ref: 'mol0' }, { $ref: 'mol1' }, { type: 'arrow', data: { mode: 'open-angle', pos: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] } }];
    expect(unsupportedDrawing(ket({ atoms: [atom('C')] }, nodes))).toBe(rejectionMessages.reaction);
  });

  it('反應用的加號', () => {
    expect(unsupportedDrawing(ket({ atoms: [atom('C')] }, [{ $ref: 'mol0' }, { type: 'plus', location: [0, 0, 0] }]))).toBe(rejectionMessages.reaction);
  });

  it('原子清單（[C,N]）', () => {
    expect(unsupportedDrawing(ket({ atoms: [{ type: 'atom-list', elements: ['C', 'N'], location: [0, 0, 0] }] }))).toBe(rejectionMessages.query);
  });

  it('查詢原子 A、Q 與查詢屬性', () => {
    expect(unsupportedDrawing(ket({ atoms: [atom('A')] }))).toBe(rejectionMessages.query);
    expect(unsupportedDrawing(ket({ atoms: [atom('Q')] }))).toBe(rejectionMessages.query);
    expect(unsupportedDrawing(ket({ atoms: [atom('C', { queryProperties: { aromaticity: 'aliphatic' } })] }))).toBe(rejectionMessages.query);
  });

  it('查詢鍵（任意鍵 ~、單或雙、單或芳香）', () => {
    const base = { atoms: [atom('C'), atom('C')] };
    expect(unsupportedDrawing(ket({ ...base, bonds: [{ atoms: [0, 1], customQuery: '~' }] }))).toBe(rejectionMessages.query);
    expect(unsupportedDrawing(ket({ ...base, bonds: [{ type: 5, atoms: [0, 1] }] }))).toBe(rejectionMessages.query);
    expect(unsupportedDrawing(ket({ ...base, bonds: [{ type: 8, atoms: [0, 1] }] }))).toBe(rejectionMessages.query);
  });

  it('R 基團標籤', () => {
    const mol = { atoms: [atom('C'), { type: 'rg-label', location: [0, 0, 0], $refs: ['rg-1'] }], bonds: [{ type: 1, atoms: [0, 1] }] };
    expect(unsupportedDrawing(ket(mol, [{ $ref: 'mol0' }, { $ref: 'rg1' }]))).toBe(rejectionMessages.rgroup);
  });

  it('聚合物重複單元（SRU）', () => {
    const mol = { atoms: [atom('C'), atom('C')], sgroups: [{ type: 'SRU', atoms: [0, 1] }] };
    expect(unsupportedDrawing(ket(mol))).toBe(rejectionMessages.polymer);
  });

  it('不是 JSON 時回傳格式錯誤訊息', () => {
    expect(unsupportedDrawing('not json')).toContain('繪圖資料格式不正確');
  });
});
