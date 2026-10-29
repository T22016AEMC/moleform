// 3D 量測幾何（Phase 2.7）：由 x、y、z 座標計算鍵長、鍵角、二面角。純 TypeScript。
// 不使用 OpenChemLib 的 getBondLength／getBondAngle：它們只看 2D 座標（AGENTS.md、報告 005）。

export type Vec3 = readonly [number, number, number];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const RAD_TO_DEG = 180 / Math.PI;

/** 兩點距離（座標單位為 Å 時即鍵長或原子間距離）。 */
export function distance(a: Vec3, b: Vec3): number {
  return norm(sub(a, b));
}

/** 以 b 為頂點，a–b–c 的夾角（度，0 到 180）。a 或 c 與 b 重合時回傳 NaN。 */
export function angleDegrees(a: Vec3, b: Vec3, c: Vec3): number {
  const u = sub(a, b);
  const v = sub(c, b);
  const denominator = norm(u) * norm(v);
  if (denominator === 0) return NaN;
  // 夾住餘弦值，避免浮點誤差讓 acos 回傳 NaN
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v) / denominator))) * RAD_TO_DEG;
}

/**
 * a–b–c–d 的二面角（度，-180 到 180）。沿 b→c 方向看，a 到 d 順時針為正（IUPAC）。
 * 任一鍵長為 0 或 a、b、c（或 b、c、d）共線時，角度沒有定義，回傳 NaN。
 */
export function dihedralDegrees(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  const b1 = sub(b, a);
  const b2 = sub(c, b);
  const b3 = sub(d, c);
  const n1 = cross(b1, b2);
  const n2 = cross(b2, b3);
  if (norm(n1) === 0 || norm(n2) === 0) return NaN;
  return Math.atan2(norm(b2) * dot(b1, n2), dot(n1, n2)) * RAD_TO_DEG;
}
