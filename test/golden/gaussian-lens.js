function f({ x, y, z, a, b, c, d, t }) {
  const t0 = Math.sqrt(x * x + y * y + z * z);
  const t1 = b * b;
  const t2 = Math.exp(-(t0 * t0 / t1));
  const t3 = 2 * t0;
  return { value: 1 + a * t2, gradient: [-4 * (a * (t2 * (t0 * (x / t3) / t1))), -4 * (a * (t2 * (t0 * (y / t3) / t1))), -4 * (a * (t2 * (t0 * (z / t3) / t1)))] };
}
