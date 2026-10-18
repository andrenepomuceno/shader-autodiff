function f({ x, y, z, a, b, c, d, t }) {
  const t0 = Math.sqrt(x * x + y * y + z * z);
  const t1 = 2 * Math.sqrt(t0 * t0 + b * b);
  const t2 = a / t1;
  const t3 = 1 + t2;
  const t4 = t3 * t3;
  const t5 = 2 * t0;
  return { value: t4 * t4, gradient: [-(2 * (t4 * (2 * (t3 * (t2 * (2 * (2 * (t0 * (2 * x / t5)) / t1)) / t1))))), -(2 * (t4 * (2 * (t3 * (t2 * (2 * (2 * (t0 * (2 * y / t5)) / t1)) / t1))))), -(2 * (t4 * (2 * (t3 * (t2 * (2 * (2 * (t0 * (2 * z / t5)) / t1)) / t1)))))] };
}
