function f({ x, y, z, a, b, c, d, t }) {
  const t0 = Math.sqrt(x * x + y * y + z * z);
  const t1 = b * t0 - c * t;
  const t2 = 1 + t0;
  const t3 = a * Math.sin(t1) / t2;
  const t4 = 2 * t0;
  const t5 = x / t4;
  const t6 = Math.cos(t1);
  const t7 = y / t4;
  const t8 = z / t4;
  return { value: 1 + t3, gradient: [(2 * (a * (b * t5 * t6)) - 2 * (t3 * t5)) / t2, (2 * (a * (t6 * (b * t7))) - 2 * (t3 * t7)) / t2, (2 * (a * (t6 * (b * t8))) - 2 * (t3 * t8)) / t2] };
}
