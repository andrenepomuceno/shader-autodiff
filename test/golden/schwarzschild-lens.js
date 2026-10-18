function f({ x, y, z, a, b, c, d, t }) {
  const t0 = x * x + y * y + z * z + b * b;
  const t1 = Math.sqrt(t0);
  const t2 = 1 + 0.5 * (a / t1);
  const t3 = t2 * t2;
  const t4 = t0 * t1;
  const t5 = a * (t2 * t3);
  return { value: t3 * t3, gradient: [-2 * (x * t5 / t4), -2 * (y * t5 / t4), -2 * (z * t5 / t4)] };
}
