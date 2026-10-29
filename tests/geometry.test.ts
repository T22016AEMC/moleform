// 程式邏輯測試（D17）：用手算可驗證的座標確認公式照預期計算。
import { describe, expect, it } from 'vitest';
import { angleDegrees, dihedralDegrees, distance, type Vec3 } from '../src/core/geometry';

const O: Vec3 = [0, 0, 0];
const X: Vec3 = [1, 0, 0];
const XY: Vec3 = [1, 1, 0];
const XYZ: Vec3 = [1, 1, 1];

describe('distance', () => {
  it('單位軸上的距離為 1', () => {
    expect(distance(O, X)).toBe(1);
  });
  it('面對角線 √2、體對角線 √3', () => {
    expect(distance(O, XY)).toBeCloseTo(Math.SQRT2, 12);
    expect(distance(O, XYZ)).toBeCloseTo(Math.sqrt(3), 12);
  });
  it('3-4-5 直角三角形', () => {
    expect(distance([0, 0, 0], [3, 4, 0])).toBe(5);
    expect(distance([1, 2, 3], [1, 2, 3])).toBe(0);
  });
});

describe('angleDegrees', () => {
  it('(1,0,0)–(0,0,0)–(0,1,0) 為 90°', () => {
    expect(angleDegrees(X, O, [0, 1, 0])).toBeCloseTo(90, 10);
  });
  it('(0,0,0)–(1,0,0)–(1,1,0) 以 (1,0,0) 為頂點為 90°', () => {
    expect(angleDegrees(O, X, XY)).toBeCloseTo(90, 10);
  });
  it('共線同向 0°、反向 180°', () => {
    expect(angleDegrees([1, 0, 0], O, [2, 0, 0])).toBeCloseTo(0, 6);
    expect(angleDegrees([1, 0, 0], O, [-2, 0, 0])).toBeCloseTo(180, 10);
  });
  it('等邊三角形的內角為 60°', () => {
    expect(angleDegrees(X, O, [0.5, Math.sqrt(3) / 2, 0])).toBeCloseTo(60, 10);
  });
  it('頂點重合時為 NaN', () => {
    expect(angleDegrees(O, O, X)).toBeNaN();
  });
});

describe('dihedralDegrees', () => {
  it('(0,0,0)(1,0,0)(1,1,0)(1,1,1) 為 +90°', () => {
    expect(dihedralDegrees(O, X, XY, XYZ)).toBeCloseTo(90, 10);
  });
  it('把最後一點改到相反的 z 方向，符號相反（-90°）', () => {
    expect(dihedralDegrees(O, X, XY, [1, 1, -1])).toBeCloseTo(-90, 10);
  });
  it('順式（同側）為 0°', () => {
    expect(dihedralDegrees(O, X, XY, [0, 1, 0])).toBeCloseTo(0, 10);
  });
  it('反式（異側）為 180°（落在 -180 到 180 之間）', () => {
    const value = dihedralDegrees(O, X, XY, [2, 1, 0]);
    expect(Math.abs(value)).toBeCloseTo(180, 10);
  });
  it('範圍：任意座標都在 [-180, 180]', () => {
    const value = dihedralDegrees([0.3, 1.2, -0.4], [1, 0.1, 0.2], [1.5, 1.4, 0.3], [2.6, 1.0, -1.1]);
    expect(value).toBeGreaterThanOrEqual(-180);
    expect(value).toBeLessThanOrEqual(180);
  });
  it('旋轉整個分子後不變', () => {
    // 繞 z 軸旋轉 90°：(x,y,z) → (-y,x,z)
    const rot = (p: Vec3): Vec3 => [-p[1], p[0], p[2]];
    expect(dihedralDegrees(rot(O), rot(X), rot(XY), rot(XYZ))).toBeCloseTo(90, 10);
  });
  it('三點共線時為 NaN', () => {
    expect(dihedralDegrees(O, X, [2, 0, 0], XYZ)).toBeNaN();
  });
});
