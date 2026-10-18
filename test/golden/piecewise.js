function f({ x, y, z, a, b, c, d, t }) {
  const t0 = Math.min(x, y);
  const t1 = Math.max(y, z);
  const t2 = Math.sign(y);
  return { value: Math.floor(z) + (t0 * t1 + (Math.abs(x) + (x + z * t2))) - 2 * Math.floor(0.5 * x), gradient: [Math.sign(x) + (1 + t1 * (x < y ? 1 : 0)), t1 * (x < y ? 0 : 1) + t0 * (y < z ? 0 : 1), t2 + t0 * (y < z ? 1 : 0)] };
}
