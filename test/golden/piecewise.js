function f({ x, y, z, a, b, c, d, t }) {
  const t0 = Math.min(x, y);
  const t1 = Math.max(y, z);
  const t2 = Math.sign(y);
  return { value: Math.abs(x) + t0 * t1 + Math.floor(z) + (x - 2 * Math.floor(x / 2)) + z * t2, gradient: [1 + (Math.sign(x) + t1 * (x < y ? 1 : 0)), t1 * (x < y ? 0 : 1) + t0 * (y < z ? 0 : 1), t2 + t0 * (y < z ? 1 : 0)] };
}
