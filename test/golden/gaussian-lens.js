function f({ x, y, z, a, b, c, d, t }) {
  const t0 = Math.sqrt(x * x + y * y + z * z);
  const t1 = b * b;
  const t2 = Math.exp(-(t0 * t0 / t1));
  const t3 = 2 * t0;
  return { value: 1 + a * t2, gradient: [-(a * (t2 * (2 * (t0 * (2 * x / t3)) / t1))), -(a * (t2 * (2 * (t0 * (2 * y / t3)) / t1))), -(a * (t2 * (2 * (t0 * (2 * z / t3)) / t1)))] };
}
